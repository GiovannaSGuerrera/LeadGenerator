import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { businessEligibilitySql, prioritySql } from "./lead-qualification";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE overture_places (id TEXT PRIMARY KEY, name TEXT, category TEXT, phone TEXT, address TEXT);
    INSERT INTO overture_places VALUES
    ('local', 'Bar da Vila', 'bar', '+5511999999999', 'Rua A, 1'),
    ('site', 'Studio Com Site', 'beauty_salon', '+5511999999998', 'Rua B, 2'),
    ('gov', 'UBS Jardim', 'medical_service_organization', '+5511999999997', 'Rua C, 3'),
    ('chain', 'Smart Fit Centro', 'gym', '+5511999999996', 'Rua D, 4'),
    ('foreign', 'Loja Interior', 'clothing_store', '+5516999999999', 'Rua E, 5'),
    ('mall', 'Galeria', 'shopping_mall', '+5511999999995', 'Rua F, 6'),
    ('notary', 'Cartório do Bairro', 'notary_public', '+5511999999994', 'Rua G, 7');`);
  db.exec(fs.readFileSync(path.resolve("db/migrations/009_lead_workflow.sql"), "utf8"));
  db.exec(`INSERT INTO lead_workflow(source,source_id,place_status,website_review,contact_status,notes,updated_at)
    VALUES ('overture','local','confirmed','no_site','to_contact','ligar amanhã','2026-11-12'),
           ('overture','site','confirmed','has_site','new','','2026-11-12');`);
  return db;
}

describe("business qualification", () => {
  it("shows local independent businesses without a manually found site", () => {
    const db = fixture();
    const { clause, values } = businessEligibilitySql("overture", false);
    const rows = db.prepare(`SELECT p.id, ${prioritySql} AS priority FROM overture_places p LEFT JOIN lead_workflow w ON w.source = 'overture' AND w.source_id = p.id WHERE ${clause}`).all(...values) as Array<{ id: string; priority: number }>;
    expect(rows.map((row) => row.id)).toEqual(["local"]);
    expect(rows[0].priority).toBe(100);
    db.close();
  });

  it("keeps review decisions through a source record update and exposes excluded records on request", () => {
    const db = fixture();
    db.exec("UPDATE overture_places SET name = 'Bar da Vila Novo' WHERE id = 'local'");
    const saved = db.prepare("SELECT notes, website_review FROM lead_workflow WHERE source_id = 'local'").get() as { notes: string; website_review: string };
    expect(saved).toEqual({ notes: "ligar amanhã", website_review: "no_site" });
    const { clause, values } = businessEligibilitySql("overture", true);
    const count = db.prepare(`SELECT COUNT(*) AS n FROM overture_places p LEFT JOIN lead_workflow w ON w.source = 'overture' AND w.source_id = p.id WHERE ${clause}`).get(...values) as { n: number };
    expect(count.n).toBe(7);
    db.close();
  });
});
