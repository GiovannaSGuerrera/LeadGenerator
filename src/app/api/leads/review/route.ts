import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "../../../../lib/db";

export const runtime = "nodejs";

const date = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const inputSchema = z.object({
  source: z.enum(["overture", "fsq"]),
  sourceId: z.string().min(1).max(128),
  placeStatus: z.enum(["unchecked", "confirmed", "not_found"]),
  websiteReview: z.enum(["unchecked", "no_site", "has_site"]),
  contactStatus: z.enum(["new", "to_contact", "contacted", "replied", "proposal", "won", "lost"]),
  lastContactAt: date,
  nextActionAt: date,
  notes: z.string().max(1000)
}).strict();

export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Dados de revisão inválidos" }, { status: 400 });
  const data = parsed.data;
  const db = getDatabase();
  const table = data.source === "overture" ? "overture_places" : "fsq_places";
  const key = data.source === "overture" ? "id" : "fsq_place_id";
  if (!db.prepare(`SELECT 1 FROM ${table} WHERE ${key} = ?`).get(data.sourceId)) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  db.prepare(`INSERT INTO lead_workflow (source, source_id, place_status, website_review, contact_status, last_contact_at, next_action_at, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, source_id) DO UPDATE SET
      place_status=excluded.place_status, website_review=excluded.website_review, contact_status=excluded.contact_status,
      last_contact_at=excluded.last_contact_at, next_action_at=excluded.next_action_at,
      notes=excluded.notes, updated_at=excluded.updated_at`).run(
    data.source, data.sourceId, data.placeStatus, data.websiteReview, data.contactStatus,
    data.lastContactAt || null, data.nextActionAt || null, data.notes.trim(), new Date().toISOString()
  );
  return NextResponse.json({ workflow: data }, { headers: { "Cache-Control": "no-store" } });
}
