import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const statusPath = path.join(dataDir, 'freelancer-requests-status.json');
const keywords = ['website', 'website design', 'web development', 'web design', 'web app', 'mobile app', 'landing page', 'wordpress', 'shopify', 'woocommerce', 'ecommerce', 'software development', 'app development', 'react', 'PHP', 'criação de site', 'desenvolvimento de sistema', 'site institucional', 'desenvolvimento web', 'sistema', 'criar site', 'loja virtual', 'aplicativo', 'sistema web'];

function decode(value) {
  return value.replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[entity]).trim();
}
function field(item, name) {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decode(match[1]) : '';
}
function classify(title, description) {
  const heading = title.toLowerCase();
  const body = description.slice(0, 350).toLowerCase();
  if (/\b(seo|copywriter|content writing|translation|translat|marketing|ads|sales|lead generation|outreach|presenter|video|blog writing|data entry|typing|consultant|software engineer)\b/.test(heading)) return null;
  const action = /\b(build|develop|design|create|new|redesign|revamp|overhaul|setup|implement|custom|creation|development|designing|building|criacao|criar|desenvolv\w*|fazer|constru\w*)\b/;
  const wantsBuild = action.test(heading) || /\b(i need|i want|looking for|preciso|busco|quero)\b/.test(body) && action.test(body);
  if (!wantsBuild) return null;
  if (/\b(website|web site|landing page|wordpress|shopify|woocommerce|ecommerce|e-commerce|site|portal|web design|web store|online store)\b/.test(heading)) return 'site';
  if (/\b(software|app|application|aplicativo|sistema|saas|web platform|web app|platform)\b/.test(heading)) return 'software';
  if (/\b(website|landing page|wordpress|shopify|woocommerce|ecommerce|site|portal)\b/.test(body) && /\b(build|develop|design|create|redesign|criar|fazer|desenvolv\w*)\b/.test(body)) return 'site';
  if (/\b(software|app|aplicativo|sistema|web platform|web app)\b/.test(body) && /\b(build|develop|create|criar|desenvolv\w*)\b/.test(body)) return 'software';
  return null;
}
function cleanDescription(value) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function localeTag(title, description, budgetText) {
  const text = `${title} ${description}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const portugueseSignals = (text.match(/\b(preciso|procuro|busco|quero|contratar|desenvolvimento|criacao|orcamento|para|com|site|sistema|aplicativo|empresa|loja|pagina)\b/g) || []).filter((word) => word !== 'site' && word !== 'para' && word !== 'com').length;
  const brazilSignal = /\bBRL\b|R\$/i.test(budgetText || '') || /\b(brasil|brasileir[ao]s?|sao paulo|rio de janeiro)\b/.test(text);
  return portugueseSignals >= 2 && brazilSignal ? 'pt-BR' : 'unknown';
}
async function feed(keyword) {
  const url = `https://www.freelancer.com/rss.xml?keyword=${encodeURIComponent(keyword)}`;
  const response = await fetch(url, { headers: { Accept: 'application/rss+xml, application/xml', 'User-Agent': 'RadarDeClientes/1.0 RSS reader' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Freelancer RSS HTTP ${response.status} (${keyword})`);
  const xml = await response.text();
  if (!xml.includes('<rss')) throw new Error(`Resposta RSS inválida (${keyword})`);
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
}

let db;
try {
  const items = new Map();
  for (const keyword of keywords) {
    for (const item of await feed(keyword)) {
      const title = field(item, 'title');
      const description = cleanDescription(field(item, 'description'));
      const body = description.replace(/\s*\(Budget:[\s\S]*$/, '').trim();
      const type = classify(title, body);
      const url = field(item, 'link');
      const guid = field(item, 'guid');
      const published = new Date(field(item, 'pubDate'));
      if (!type || !/^https:\/\/www\.freelancer\.com\/projects\//.test(url) || !/^Freelancer_project_\d+$/.test(guid) || !Number.isFinite(published.getTime())) continue;
      const budgetMatch = description.match(/\(Budget:\s*([^,)]{2,90})/i);
      const budgetText = budgetMatch?.[1] ?? null;
      items.set(guid, { id: guid, title, description: body, type, budgetText, locale: localeTag(title, body, budgetText), published: published.toISOString(), url });
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  db = new DatabaseSync(path.resolve(process.env.DATABASE_PATH || path.join(dataDir, 'radar.sqlite')));
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(fs.readFileSync(path.join(root, 'db/migrations/007_freelancer_requests.sql'), 'utf8'));
  const columns = db.prepare('PRAGMA table_info(freelancer_requests)').all();
  if (!columns.some((column) => column.name === 'locale_tag')) db.exec(fs.readFileSync(path.join(root, 'db/migrations/008_freelancer_locale.sql'), 'utf8'));
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  db.prepare('INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)').run('008_freelancer_locale.sql', new Date().toISOString());
  db.exec('BEGIN');
  try {
    const upsert = db.prepare('INSERT INTO freelancer_requests (id,title,description,request_type,budget_text,published_at,source_url,imported_at,locale_tag) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, request_type=excluded.request_type, budget_text=excluded.budget_text, imported_at=excluded.imported_at, locale_tag=excluded.locale_tag');
    const imported = new Date().toISOString();
    for (const row of items.values()) upsert.run(row.id, row.title, row.description, row.type, row.budgetText, row.published, row.url, imported, row.locale);
    const drop = db.prepare('DELETE FROM freelancer_requests WHERE id = ?');
    const tag = db.prepare('UPDATE freelancer_requests SET locale_tag = ? WHERE id = ?');
    for (const row of db.prepare('SELECT id, title, description, budget_text FROM freelancer_requests').all()) {
      if (!classify(row.title, row.description)) drop.run(row.id);
      else tag.run(localeTag(row.title, row.description, row.budget_text), row.id);
    }
    db.prepare('DELETE FROM freelancer_requests WHERE published_at < ?').run(new Date(Date.now() - 7 * 86400000).toISOString());
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  fs.writeFileSync(statusPath, JSON.stringify({ state: 'ok', count: items.size, checkedAt: new Date().toISOString(), message: `${items.size} projetos encontrados nos feeds.` }, null, 2));
  console.log(`Freelancer.com: ${items.size} projetos de site ou software importados do RSS oficial.`);
} catch (error) {
  fs.writeFileSync(statusPath, JSON.stringify({ state: 'error', message: String(error.message || error), checkedAt: new Date().toISOString() }, null, 2));
  console.error(`Falha no RSS Freelancer.com: ${error.message || error}`);
  process.exitCode = 1;
} finally { db?.close(); }
