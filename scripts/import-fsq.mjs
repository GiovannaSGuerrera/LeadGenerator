import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { districtAt } from './sp-districts.mjs';

const input = process.argv[2];
const replace = process.argv.includes('--replace');
if (!input || !fs.existsSync(input)) {
  console.error('Uso: npm run import:fsq -- caminho/para/sp-places.jsonl');
  process.exit(1);
}
const target = path.resolve(process.env.DATABASE_PATH || './data/radar.sqlite');
fs.mkdirSync(path.dirname(target), { recursive: true });
const db = new DatabaseSync(target);
db.exec('PRAGMA foreign_keys = ON');
db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
for (const name of fs.readdirSync(path.resolve('db/migrations')).filter((n) => /^\d+_.*\.sql$/.test(n)).sort()) {
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get(name)) continue;
  db.exec('BEGIN');
  try { db.exec(fs.readFileSync(path.resolve('db/migrations', name), 'utf8')); db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(name, new Date().toISOString()); db.exec('COMMIT'); }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
const insert = db.prepare(`INSERT INTO fsq_places (fsq_place_id,name,category,address,neighborhood,locality,region,country,latitude,longitude,phone,date_refreshed,imported_at)
  VALUES (@id,@name,@category,@address,@neighborhood,@locality,@region,@country,@latitude,@longitude,@phone,@refreshed,@imported)
  ON CONFLICT(fsq_place_id) DO UPDATE SET name=excluded.name,category=excluded.category,address=excluded.address,neighborhood=excluded.neighborhood,locality=excluded.locality,region=excluded.region,country=excluded.country,latitude=excluded.latitude,longitude=excluded.longitude,phone=excluded.phone,date_refreshed=excluded.date_refreshed,imported_at=excluded.imported_at`);
const state = { seen: 0, accepted: 0, rejected: 0 };
if (replace) db.exec('CREATE TEMP TABLE current_import_ids (fsq_place_id TEXT PRIMARY KEY)');
const markCurrent = replace ? db.prepare('INSERT OR IGNORE INTO current_import_ids VALUES (?)') : null;
const batch = [];
const flush = () => { for (const row of batch) { insert.run(row); markCurrent?.run(row.id); } batch.length = 0; };
const imported = new Date().toISOString();
db.exec('BEGIN');
for await (const line of readline.createInterface({ input: fs.createReadStream(input, { encoding: 'utf8' }), crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  state.seen++;
  let item;
  try { item = JSON.parse(line); } catch { state.rejected++; continue; }
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  const locality = typeof item.locality === 'string' ? item.locality.trim() : '';
  const website = typeof item.website === 'string' ? item.website.trim() : '';
  const phone = typeof item.tel === 'string' ? item.tel.trim() : '';
  const phoneDigits = phone.replace(/\D/g, '');
  const flags = Array.isArray(item.unresolved_flags) ? item.unresolved_flags : [];
  if (!item.fsq_place_id || !name || String(item.country).toUpperCase() !== 'BR' || website || phoneDigits.length < 8 || phoneDigits.length > 15 || item.date_closed || flags.some((f) => ['closed','duplicate','delete','privatevenue','doesnt_exist'].includes(f))) { state.rejected++; continue; }
  const categories = Array.isArray(item.fsq_category_labels) ? item.fsq_category_labels : [];
  const latitude = item.latitude == null ? null : Number(item.latitude);
  const longitude = item.longitude == null ? null : Number(item.longitude);
  const neighborhood = latitude !== null && longitude !== null ? districtAt(latitude, longitude) : null;
  if (!neighborhood) { state.rejected++; continue; }
  batch.push({ id: String(item.fsq_place_id), name, category: String(categories[0] || 'Não informada'), address: typeof item.address === 'string' ? item.address : null, neighborhood, locality: 'São Paulo', region: typeof item.region === 'string' ? item.region : null, country: 'BR', latitude, longitude, phone, refreshed: item.date_refreshed ? String(item.date_refreshed) : null, imported });
  state.accepted++;
  if (batch.length >= 500) flush();
}
flush();
if (replace && state.accepted === 0) { db.exec('ROLLBACK'); console.error('A exportação não contém locais com telefone válido e coordenadas confirmadas no município de São Paulo. A base anterior foi preservada.'); db.close(); process.exit(1); }
if (replace) db.exec('DELETE FROM fsq_places WHERE fsq_place_id NOT IN (SELECT fsq_place_id FROM current_import_ids)');
db.prepare('INSERT INTO fsq_imports (imported_at,source_file,seen_count,accepted_count,rejected_count) VALUES (?,?,?,?,?)').run(imported, path.basename(input), state.seen, state.accepted, state.rejected);
db.exec('COMMIT');
console.log(`Importação concluída: ${state.accepted} aceitos, ${state.rejected} ignorados de ${state.seen} registros.`);
db.close();
