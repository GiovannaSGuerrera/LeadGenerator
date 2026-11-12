import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { districtAt } from './sp-districts.mjs';

const input = process.argv[2];
const release = process.argv[3];
if (!input || !fs.existsSync(input) || !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(release || '')) {
  console.error('Uso: node scripts/import-overture.mjs caminho/places.jsonl YYYY-MM-DD.0');
  process.exit(1);
}

const excludedCategory = /(?:^|_)(?:historic_site|place_of_worship|religious_organization|school|university|college|kindergarten|public_park|national_park|cemetery|monument|police|fire_station|government|city_hall|bus_stop|train_station|subway_station|neighborhood)(?:_|$)/;
const excludedName = /\b(?:condom[ií]nio|edif[ií]cio|residencial|conjunto habitacional)\b/i;
const knownWebsiteIds = new Set(JSON.parse(fs.readFileSync(path.resolve('config/known-website-ids.json'), 'utf8')).map((entry) => entry.id));
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

const insert = db.prepare(`INSERT INTO overture_places (id,name,category,address,neighborhood,locality,region,country,latitude,longitude,phone,confidence,release,imported_at)
VALUES (@id,@name,@category,@address,@neighborhood,@locality,@region,@country,@latitude,@longitude,@phone,@confidence,@release,@imported_at)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,address=excluded.address,neighborhood=excluded.neighborhood,locality=excluded.locality,region=excluded.region,country=excluded.country,latitude=excluded.latitude,longitude=excluded.longitude,phone=excluded.phone,confidence=excluded.confidence,release=excluded.release,imported_at=excluded.imported_at`);
const importedAt = new Date().toISOString();
const stats = { seen: 0, accepted: 0, rejected: 0 };
db.exec('CREATE TEMP TABLE current_overture_ids (id TEXT PRIMARY KEY)');
const markCurrent = db.prepare('INSERT OR IGNORE INTO current_overture_ids VALUES (?)');
db.exec('BEGIN');
try {
  for await (const line of readline.createInterface({ input: fs.createReadStream(input, { encoding: 'utf8' }), crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    stats.seen++;
    let item;
    try { item = JSON.parse(line); } catch { stats.rejected++; continue; }
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const category = typeof item.category === 'string' ? item.category.trim() : '';
    const phone = typeof item.phone === 'string' ? item.phone.trim() : '';
    const digits = phone.replace(/\D/g, '');
    const latitude = Number(item.latitude);
    const longitude = Number(item.longitude);
    const confidence = Number(item.confidence);
    const neighborhood = districtAt(latitude, longitude);
    if (!id || !name || !category || knownWebsiteIds.has(id) || item.brand_name || Number(item.phone_has_site) === 1 || Number(item.name_has_site) === 1 || Number(item.prefix_has_site) === 1 || excludedCategory.test(category) || excludedName.test(name) || digits.length < 8 || digits.length > 15 || String(item.country).toUpperCase() !== 'BR' || item.website || (item.operating_status && item.operating_status !== 'open') || confidence < 0.8 || !neighborhood) { stats.rejected++; continue; }
    insert.run({ id, name, category, address: typeof item.address === 'string' ? item.address : null, neighborhood, locality: 'São Paulo', region: typeof item.region === 'string' ? item.region : null, country: 'BR', latitude, longitude, phone, confidence, release, imported_at: importedAt });
    markCurrent.run(id);
    stats.accepted++;
  }
  if (stats.accepted === 0) throw new Error('A exportação não contém empresas válidas com telefone; a base anterior foi mantida.');
  db.exec('DELETE FROM overture_places WHERE id NOT IN (SELECT id FROM current_overture_ids)');
  db.exec('COMMIT');
  console.log(`Overture ${release}: ${stats.accepted} aceitos, ${stats.rejected} ignorados de ${stats.seen} registros.`);
} catch (error) {
  db.exec('ROLLBACK');
  db.close();
  throw error;
}
db.close();
