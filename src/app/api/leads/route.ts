import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../../../lib/db";
import { Lead, LeadWorkflow } from "../../../lib/types";
import { businessEligibilitySql, emptyWorkflow, prioritySql } from "../../../lib/lead-qualification";
import districtNames from "../../../../geo/sp-district-names.json";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

const businessCategoryPrefixes = [
  "Business and Professional Services", "Dining and Drinking", "Retail", "Health and Medicine",
  "Travel and Transportation > Lodging", "Travel and Transportation > Fuel Station", "Travel and Transportation > Travel Agency", "Travel and Transportation > Parking",
  "Sports and Recreation > Gym and Studio", "Sports and Recreation > Martial Arts Dojo", "Sports and Recreation > Gymnastics > Gymnastics Center", "Sports and Recreation > Sports Club",
  "Arts and Entertainment > Art Gallery", "Arts and Entertainment > Night Club", "Arts and Entertainment > Comedy Club", "Arts and Entertainment > Arcade", "Arts and Entertainment > Movie Theater", "Arts and Entertainment > Performing Arts Venue"
];
const businessClause = `(${businessCategoryPrefixes.map(() => "p.category LIKE ?").join(" OR ")})`;
const businessValues = businessCategoryPrefixes.map((prefix) => `${prefix}%`);

function readStatus(name: string) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve("data", name), "utf8").replace(/^\uFEFF/, "")) as { state?: string; message?: string; checkedAt?: string; release?: string };
  } catch { return undefined; }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("mode");
  if (mode === "public_requests") {
    const db = getDatabase();
    const query = (params.get("query") ?? "").trim().slice(0, 100);
    const type = (params.get("category") ?? "").trim();
    const market = (params.get("market") ?? "all").trim();
    const page = Math.max(1, Math.min(1000, Number.parseInt(params.get("page") ?? "1", 10) || 1));
    const clauses = ["1 = 1"];
    const values: Array<string | number> = [];
    if (query) { clauses.push("(description LIKE ? OR organization LIKE ? OR city LIKE ?)"); values.push(...Array(3).fill(`%${query}%`)); }
    if (type === "site" || type === "software") { clauses.push("request_type = ?"); values.push(type); }
    if (market === "br") clauses.push("locale_tag = 'pt-BR'");
    if (market === "eur") clauses.push("budget_text LIKE '%EUR%'");
    if (market === "br_or_eur") clauses.push("(locale_tag = 'pt-BR' OR budget_text LIKE '%EUR%')");
    const where = clauses.join(" AND ");
    const combined = `FROM (
      SELECT id, title, description, request_type, organization, city, state, budget, NULL AS budget_text, published_at, deadline_at, source_url, source_name, imported_at, 'pt-BR' AS locale_tag FROM pncp_requests WHERE strftime('%s', deadline_at) > strftime('%s', 'now')
      UNION ALL
      SELECT id, title, description, request_type, 'Cliente na plataforma' AS organization, 'Online' AS city, '' AS state, NULL AS budget, budget_text, published_at, NULL AS deadline_at, source_url, 'Freelancer.com' AS source_name, imported_at, locale_tag FROM freelancer_requests WHERE strftime('%s', published_at) > strftime('%s', 'now', '-7 days')
    ) WHERE ${where}`;
    const total = (db.prepare(`SELECT COUNT(*) AS total ${combined}`).get(...values) as { total: number }).total;
    const rows = db.prepare(`SELECT * ${combined} ORDER BY published_at DESC LIMIT 50 OFFSET ?`).all(...values, (page - 1) * 50) as Array<Record<string, string | number | null>>;
    const status = readStatus("freelancer-requests-status.json");
    const pncpStatus = readStatus("public-requests-status.json");
    const leads: Lead[] = rows.map((row) => ({
      id: `${row.source_name === "PNCP" ? "pncp" : "freelancer"}-${row.id}`, mode: "public_requests", name: String(row.title), category: row.request_type === "site" ? "Site / portal" : "Software / sistema",
      neighborhood: String(row.state), city: String(row.city), websiteStatus: "unknown", source: String(row.source_name), sourceUrl: String(row.source_url), sourceRecordId: String(row.id),
      collectedAt: String(row.imported_at), publishedAt: String(row.published_at), deadlineAt: row.deadline_at ? String(row.deadline_at) : undefined, budget: typeof row.budget === "number" ? row.budget : undefined,
      budgetText: row.budget_text ? String(row.budget_text) : undefined,
      description: String(row.description), organization: String(row.organization), confidence: "medium", reviewStatus: "new", isMock: false,
      evidence: [{ sourceUrl: String(row.source_url), collectedAt: String(row.imported_at), excerpt: String(row.description), criterion: row.source_name === "PNCP" ? "Edital publicado no PNCP com proposta aberta" : "Projeto publicado no RSS oficial da Freelancer.com" }],
      criteria: row.source_name === "PNCP" ? ["objeto menciona criação/desenvolvimento de site ou software", "prazo ainda aberto"] : ["pedido publicado no RSS da plataforma", "termos de site ou software"],
      note: row.source_name === "PNCP" ? "Confira o edital e os requisitos de participação antes de enviar uma proposta." : "Confira na plataforma se o projeto ainda aceita propostas e as regras de participação."
    }));
    const lastUpdatedAt = status?.checkedAt ?? null;
    const stale = lastUpdatedAt && Date.now() - new Date(lastUpdatedAt).getTime() > 36 * 60 * 60 * 1000;
    const warning = status?.state === "error" ? `O RSS não atualizou: ${status.message}` : stale ? "A atualização do RSS está atrasada; confira a tarefa no Agendador do Windows." : !lastUpdatedAt ? "A primeira consulta ao RSS ainda não foi concluída." : pncpStatus?.state === "error" ? "Os editais do PNCP não atualizaram por limite de requisições; os projetos do RSS continuam disponíveis." : undefined;
    return NextResponse.json({ leads, sourceMode: total ? "public" : "empty", total, page, hasNext: page * 50 < total, lastUpdatedAt, warning }, { headers: { "Cache-Control": "no-store" } });
  }
  if (mode !== "business_without_website") return NextResponse.json({ error: "Modalidade inválida" }, { status: 400 });
  const query = (params.get("query") ?? "").trim().slice(0, 100);
  const neighborhood = (params.get("neighborhood") ?? "").trim().slice(0, 80);
  const category = (params.get("category") ?? "").trim().slice(0, 80);
  const includeExcluded = params.get("includeExcluded") === "1";
  const queue = params.get("queue") ?? "all";
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.get("page") ?? "1", 10) || 1));
  const db = getDatabase();
  const overtureCount = (db.prepare("SELECT COUNT(*) AS total FROM overture_places").get() as { total: number }).total;
  const useOverture = overtureCount > 0;
  const source = useOverture ? "overture" : "fsq";
  const table = useOverture ? "overture_places" : "fsq_places";
  const from = `${table} p LEFT JOIN lead_workflow w ON w.source = '${source}' AND w.source_id = ${useOverture ? "p.id" : "p.fsq_place_id"}`;
  const eligibility = businessEligibilitySql(source, includeExcluded);
  const baseClause = [useOverture ? "1 = 1" : businessClause, eligibility.clause].join(" AND ");
  const baseValues = [...(useOverture ? [] : businessValues), ...eligibility.values];
  const status = readStatus(useOverture ? "overture-refresh-status.json" : "refresh-status.json");
  const refreshError = status?.state === "error" ? status.message ?? "A atualização falhou." : "";
  const count = (db.prepare(`SELECT COUNT(*) AS total FROM ${from} WHERE ${baseClause}`).get(...baseValues) as { total: number }).total;
  const districtCounts = new Map((db.prepare(`SELECT p.neighborhood AS neighborhood, COUNT(*) AS total FROM ${from} WHERE ${baseClause} GROUP BY p.neighborhood`).all(...baseValues) as Array<{ neighborhood: string; total: number }>).map((row) => [row.neighborhood, row.total]));
  const districts = districtNames.map((name) => ({ name, total: districtCounts.get(name) ?? 0 }));
  if (!count) {
    const overtureStatus = readStatus("overture-refresh-status.json");
    const rawCount = (db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number }).total;
    const warning = rawCount ? "Os filtros de qualificação ocultaram todos os resultados. Marque ‘Incluir resultados descartados’ para revisar a base completa." : overtureStatus?.state === "error"
      ? `A fonte aberta Overture ainda não foi carregada: ${overtureStatus.message}`
      : "Aguardando a primeira importação de empresas com telefone da Overture Maps.";
    return NextResponse.json({ leads: [], sourceMode: rawCount ? (useOverture ? "overture" : "foursquare") : "empty", total: 0, districts, warning }, { headers: { "Cache-Control": "no-store" } });
  }
  const clauses = [baseClause];
  const values: string[] = [...baseValues];
  if (query) { clauses.push("(p.name LIKE ? OR p.address LIKE ?)"); values.push(`%${query}%`, `%${query}%`); }
  if (neighborhood) { clauses.push("p.neighborhood = ?"); values.push(neighborhood); }
  if (category) { clauses.push("p.category LIKE ?"); values.push(`%${category}%`); }
  if (queue === "to_contact") clauses.push("w.contact_status = 'to_contact'");
  if (queue === "in_progress") clauses.push("w.contact_status IN ('contacted', 'replied', 'proposal')");
  if (queue === "due") clauses.push("w.next_action_at IS NOT NULL AND w.next_action_at <= date('now', 'localtime')");
  const where = clauses.join(" AND ");
  const total = (db.prepare(`SELECT COUNT(*) AS total FROM ${from} WHERE ${where}`).get(...values) as { total: number }).total;
  const sourceOrder = useOverture ? "p.confidence DESC" : "COALESCE(p.date_refreshed, '') DESC";
  const rows = db.prepare(`SELECT p.*, w.place_status, w.website_review, w.contact_status, w.last_contact_at, w.next_action_at, w.notes, ${prioritySql} AS priority FROM ${from} WHERE ${where} ORDER BY priority DESC, ${sourceOrder}, p.name LIMIT 200 OFFSET ?`).all(...values, (page - 1) * 200) as Array<Record<string, string | number | null>>;
  const lastUpdatedAt = (db.prepare(`SELECT MAX(imported_at) AS value FROM ${table}`).get() as { value: string | null }).value;
  const leads: Lead[] = rows.map((row) => {
    const sourceUrl = useOverture ? "https://explore.overturemaps.org/" : `https://foursquare.com/placemakers/review-place/${encodeURIComponent(String(row.fsq_place_id))}`;
    const placeQuery = [String(row.name), row.address ? String(row.address) : String(row.neighborhood), "São Paulo, SP"].join(", ");
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeQuery)}`;
    const workflow: LeadWorkflow = { placeStatus: (row.place_status ?? emptyWorkflow.placeStatus) as LeadWorkflow["placeStatus"], websiteReview: (row.website_review ?? emptyWorkflow.websiteReview) as LeadWorkflow["websiteReview"], contactStatus: (row.contact_status ?? emptyWorkflow.contactStatus) as LeadWorkflow["contactStatus"], lastContactAt: String(row.last_contact_at ?? ""), nextActionAt: String(row.next_action_at ?? ""), notes: String(row.notes ?? "") };
    const shared = { workflow, priority: Number(row.priority) };
    if (useOverture) return { id: `overture-${row.id}`, mode: "business_without_website", name: String(row.name), category: String(row.category), neighborhood: String(row.neighborhood), city: String(row.locality), address: row.address ? String(row.address) : undefined, phone: String(row.phone), mapUrl, websiteStatus: "absent_in_source", source: "Overture Maps", sourceUrl, sourceRecordId: String(row.id), collectedAt: String(row.imported_at), confidence: Number(row.confidence) >= 0.9 ? "high" : "medium", reviewStatus: row.review_status as Lead["reviewStatus"], isMock: false, evidence: [{ sourceUrl, collectedAt: String(row.imported_at), criterion: `Overture ${row.release}: phones preenchido, websites vazio, ID ${row.id}` }], criteria: ["coordenadas no distrito oficial de São Paulo", "country BR", "website não informado", "telefone informado", "pontuação Overture >= 0,8"], note: "O telefone e a ausência de website vêm da Overture. Confira o número, a empresa e a existência de site antes de entrar em contato.", ...shared };
    return { id: `fsq-${row.fsq_place_id}`, mode: "business_without_website", name: String(row.name), category: String(row.category), neighborhood: String(row.neighborhood), city: String(row.locality), address: row.address ? String(row.address) : undefined, phone: String(row.phone), mapUrl, websiteStatus: "absent_in_source", source: "Foursquare OS Places", sourceUrl, sourceRecordId: String(row.fsq_place_id), collectedAt: String(row.imported_at), confidence: "low", reviewStatus: row.review_status as Lead["reviewStatus"], isMock: false, evidence: [{ sourceUrl, collectedAt: String(row.imported_at), criterion: "Campos website vazio e tel preenchido na exportação FSQ OS Places" }], criteria: ["coordenadas no distrito oficial de São Paulo", "country BR", "campo website vazio", "telefone informado na fonte", "sem sinal de fechamento ou flag crítica"], note: "O website não foi informado e o telefone consta na fonte. Confira manualmente se o negócio existe, se o número está atualizado e se já possui site.", ...shared };
  });
  const checkedAt = status?.checkedAt ?? lastUpdatedAt;
  const stale = checkedAt && Date.now() - new Date(checkedAt).getTime() > 36 * 60 * 60 * 1000;
  return NextResponse.json({ leads, sourceMode: useOverture ? "overture" : "foursquare", total, page, hasNext: page * 200 < total, districts, lastUpdatedAt, warning: refreshError || (stale ? "A verificação diária está atrasada. Confira a tarefa no Agendador do Windows." : undefined) }, { headers: { "Cache-Control": "no-store" } });
}
