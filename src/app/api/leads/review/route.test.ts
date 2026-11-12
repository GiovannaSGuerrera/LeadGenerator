import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabase, getDatabase } from "../../../../lib/db";
import { PATCH } from "./route";

const dir = mkdtempSync(path.join(tmpdir(), "radar-review-"));
const previousPath = process.env.DATABASE_PATH;

function request(body: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/leads/review", {
    method: "PATCH", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body)
  });
}

const valid = {
  source: "overture", sourceId: "test-place", placeStatus: "confirmed", websiteReview: "no_site",
  contactStatus: "to_contact", lastContactAt: "", nextActionAt: "2026-11-13", notes: "Ligar amanhã"
};

describe("lead review API", () => {
  beforeAll(() => {
    closeDatabase();
    process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
    const db = getDatabase();
    db.prepare(`INSERT INTO overture_places (id,name,category,neighborhood,locality,country,latitude,longitude,phone,confidence,release,imported_at)
      VALUES ('test-place','Padaria Teste','bakery','Tatuapé','São Paulo','BR',-23.54,-46.57,'+5511999999999',0.9,'2026-10-21.0','2026-11-12')`).run();
  });
  afterAll(() => {
    closeDatabase();
    if (previousPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousPath;
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects a cross-origin update and invalid status", async () => {
    expect((await PATCH(request(valid, "https://other.example"))).status).toBe(403);
    expect((await PATCH(request({ ...valid, websiteReview: "verified_by_magic" }))).status).toBe(400);
    expect((getDatabase().prepare("SELECT COUNT(*) AS total FROM lead_workflow").get() as { total: number }).total).toBe(0);
  });

  it("saves review separately from imported rows", async () => {
    expect((await PATCH(request(valid))).status).toBe(200);
    const db = getDatabase();
    db.prepare("UPDATE overture_places SET name = 'Padaria Teste Atualizada' WHERE id = 'test-place'").run();
    const workflow = db.prepare("SELECT place_status, website_review, next_action_at, notes FROM lead_workflow WHERE source_id = 'test-place'").get() as Record<string, string>;
    expect(workflow).toMatchObject({ place_status: "confirmed", website_review: "no_site", next_action_at: "2026-11-13", notes: "Ligar amanhã" });
  });
});
