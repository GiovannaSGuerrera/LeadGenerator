import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const statusPath = path.join(dataDir, 'public-requests-status.json');
const now = new Date();
const dateFinal = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
const headers = { Accept: 'application/json', 'User-Agent': 'RadarDeClientes/1.0 (local public procurement search)' };

function classify(object) {
  const text = String(object || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const action = /\b(desenvolv\w*|criacao|criar|construcao|construir|elaboracao|elaborar|implementacao|implementar|fabricacao|desenvolvimento)\b/;
  const site = /\b(site|website|sitio (?:eletronico|institucional)|pagina web|portal (?:web|institucional|eletronico|de internet))\b/;
  const software = /\b(sistema (?:web|informatizado|de informacao|sob medida)|software|aplicativo|aplicacao web|plataforma digital)\b/;
  if (!action.test(text)) return null;
  if (/\b(aquisicao|compra|fornecimento) de (?:licencas?|softwares?|equipamentos)/.test(text) && !/desenvolvimento de/.test(text)) return null;
  const match = text.match(action);
  const around = text.slice(Math.max(0, match.index - 100), match.index + 220);
  if (site.test(around)) return 'site';
  if (software.test(around)) return 'software';
  return null;
}

async function getPage(modality, page) {
  const url = new URL('https://pncp.gov.br/api/consulta/v1/contratacoes/proposta');
  url.search = new URLSearchParams({ dataFinal: dateFinal, codigoModalidadeContratacao: String(modality), codigoMunicipioIbge: '3550308', pagina: String(page), tamanhoPagina: '50' }).toString();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`PNCP HTTP ${response.status} (modalidade ${modality}, página ${page})`);
      return await response.json();
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
    }
  }
}

async function fetchModality(modality) {
  const first = await getPage(modality, 1);
  const all = [...(first.data || [])];
  const pages = Math.min(Number(first.totalPaginas || 1), 200);
  for (let page = 2; page <= pages; page++) {
    await new Promise((resolve) => setTimeout(resolve, 1300));
    const result = await getPage(modality, page);
    all.push(...(result.data || []));
  }
  if (Number(first.totalPaginas || 1) > 200) throw new Error('PNCP retornou mais de 200 páginas; consulta incompleta.');
  return all;
}

function saveStatus(state, message, count = 0) {
  fs.writeFileSync(statusPath, JSON.stringify({ state, message, count, checkedAt: new Date().toISOString(), source: 'PNCP', scope: 'Município de São Paulo; pregão eletrônico e dispensa; próximos 7 dias' }, null, 2));
}

let db;
try {
  const records = (await Promise.all([fetchModality(6), fetchModality(8)])).flat();
  const selected = new Map();
  for (const record of records) {
    const type = classify(record.objetoCompra);
    const deadline = new Date(record.dataEncerramentoProposta);
    if (!type || record.situacaoCompraId !== 1 || !Number.isFinite(deadline.getTime()) || deadline <= new Date()) continue;
    const cnpj = record.orgaoEntidade?.cnpj;
    if (!/^\d{14}$/.test(String(cnpj)) || !Number.isInteger(record.anoCompra) || !Number.isInteger(record.sequencialCompra)) continue;
    const title = String(record.objetoCompra).trim();
    const url = `https://pncp.gov.br/app/editais/${cnpj}/${record.anoCompra}/${record.sequencialCompra}`;
    selected.set(String(record.numeroControlePNCP), {
      id: String(record.numeroControlePNCP), title: title.slice(0, 180), description: title,
      type, organization: String(record.orgaoEntidade?.razaoSocial || 'Órgão não informado'),
      city: String(record.unidadeOrgao?.municipioNome || ''), state: String(record.unidadeOrgao?.ufSigla || ''),
      budget: Number(record.valorTotalEstimado) > 0 ? Number(record.valorTotalEstimado) : null,
      published: String(record.dataPublicacaoPncp), deadline: deadline.toISOString(), url
    });
  }
  db = new DatabaseSync(path.resolve(process.env.DATABASE_PATH || path.join(dataDir, 'radar.sqlite')));
  db.exec('PRAGMA journal_mode = WAL');
  const migration = fs.readFileSync(path.join(root, 'db/migrations/006_public_requests.sql'), 'utf8');
  db.exec(migration);
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM pncp_requests');
    const insert = db.prepare('INSERT INTO pncp_requests (id,title,description,request_type,organization,city,state,budget,published_at,deadline_at,source_url,source_name,imported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const imported = new Date().toISOString();
    for (const row of selected.values()) insert.run(row.id, row.title, row.description, row.type, row.organization, row.city, row.state, row.budget, row.published, row.deadline, row.url, 'PNCP', imported);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  saveStatus('ok', `Consulta concluída: ${selected.size} pedidos relevantes com propostas abertas.`, selected.size);
  console.log(`PNCP: ${records.length} editais examinados; ${selected.size} pedidos de site ou software com proposta aberta.`);
} catch (error) {
  saveStatus('error', String(error.message || error));
  console.error(`Falha na atualização PNCP: ${error.message || error}`);
  process.exitCode = 1;
} finally { db?.close(); }
