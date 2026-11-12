import { Lead, SearchFilters } from "./types";
import { mockLeads } from "./mock-data";

export interface SourceAdapter { readonly sourceId: string; search(filters: SearchFilters): Promise<Lead[]>; }

export class MockSourceAdapter implements SourceAdapter {
  readonly sourceId = "development-mock";
  async search(filters: SearchFilters) {
    return mockLeads.filter((lead) => lead.mode === filters.mode && (!filters.category || lead.category === filters.category) && (!filters.neighborhood || lead.neighborhood === filters.neighborhood) && (!filters.query || lead.name.toLowerCase().includes(filters.query.toLowerCase())));
  }
}

/** Intentionally unavailable until an operational/legal review approves endpoint, quota and cache configuration. */
export class OverpassSourceAdapter implements SourceAdapter {
  readonly sourceId = "openstreetmap-overpass";
  async search(filters: SearchFilters): Promise<Lead[]> {
    if (filters.mode !== "business_without_website") return [];
    const endpoint = process.env.OVERPASS_ENDPOINT ?? "https://overpass.private.coffee/api/interpreter";
    // Bounding box aproximado da capital; mantém a consulta pequena e previsível.
    const neighborhoodFilter = filters.neighborhood ? `["addr:suburb"="${filters.neighborhood.replace(/"/g, "\\\"")}"]` : "";
    const query = `[out:json][timeout:20];(nwr["name"]["shop"]${neighborhoodFilter}(-23.80,-46.85,-23.35,-46.35);nwr["name"]["amenity"]${neighborhoodFilter}(-23.80,-46.85,-23.35,-46.35);nwr["name"]["office"]${neighborhoodFilter}(-23.80,-46.85,-23.35,-46.35););out center tags 100;`;
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": process.env.APP_USER_AGENT ?? "RadarDeClientes/0.1 (+local)" }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Overpass respondeu HTTP ${response.status}`);
    const payload = await response.json() as { elements?: Array<{ id: number; type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }> };
    const collectedAt = new Date().toISOString();
    return (payload.elements ?? []).map((element) => {
      const tags = element.tags ?? {};
      const center = element.center;
      const name = tags.name;
      const website = tags.website || tags["contact:website"];
      if (!name || website || (filters.query && !name.toLowerCase().includes(filters.query.toLowerCase())) || (filters.category && (tags.shop ?? tags.amenity ?? tags.office) !== filters.category)) return null;
      const neighborhood = tags["addr:suburb"] || tags["addr:neighbourhood"] || "Não informado";
      if (filters.neighborhood && neighborhood !== filters.neighborhood) return null;
      return { id: `osm-${element.type}-${element.id}`, mode: "business_without_website", name, category: tags.shop || tags.amenity || tags.office || "Comércio local", neighborhood, city: "São Paulo", address: [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(", ") || undefined, websiteStatus: "absent_in_source", source: "OpenStreetMap / Overpass", sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`, collectedAt, confidence: "medium", reviewStatus: "new", isMock: false, evidence: [{ sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`, collectedAt, criterion: "website não cadastrado nos campos website/contact:website da fonte" }], criteria: ["São Paulo", "nome público na fonte", "website ausente nos campos consultados"], note: "Ausência de website na fonte consultada não prova que o negócio não tenha website nem que precise de um." } satisfies Lead;
    }).filter((lead) => lead !== null) as unknown as Lead[];
  }
}
