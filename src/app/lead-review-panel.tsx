"use client";

import { useState } from "react";
import { Lead, LeadWorkflow } from "../lib/types";
import { emptyWorkflow } from "../lib/lead-qualification";

const contactLabels: Record<LeadWorkflow["contactStatus"], string> = {
  new: "Novo", to_contact: "Para contatar", contacted: "Contato feito", replied: "Respondeu",
  proposal: "Proposta enviada", won: "Cliente fechado", lost: "Sem interesse"
};

export default function LeadReviewPanel({ lead, onSaved }: { lead: Lead; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LeadWorkflow>(lead.workflow ?? emptyWorkflow);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const workflow = lead.workflow ?? emptyWorkflow;

  function update<K extends keyof LeadWorkflow>(key: K, value: LeadWorkflow[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/leads/review", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: lead.id.startsWith("overture-") ? "overture" : "fsq", sourceId: lead.sourceRecordId, ...draft })
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Não foi possível salvar.");
      await onSaved();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally { setSaving(false); }
  }

  return <div className="lead-workflow">
    <div className="workflow-summary">
      <span>{workflow.placeStatus === "confirmed" ? "Ficha confirmada" : workflow.placeStatus === "not_found" ? "Empresa não encontrada" : "Ficha a conferir"}</span>
      <span>{workflow.websiteReview === "no_site" ? "Site não encontrado por você" : workflow.websiteReview === "has_site" ? "Site encontrado" : "Site a conferir"}</span>
      <span>{contactLabels[workflow.contactStatus]}</span>
      {workflow.nextActionAt && <span>Próxima ação: {workflow.nextActionAt.split("-").reverse().join("/")}</span>}
    </div>
    <button type="button" className="review-toggle" aria-expanded={open} onClick={() => { setDraft(lead.workflow ?? emptyWorkflow); setError(""); setOpen(!open); }}>{open ? "Fechar revisão" : "Revisar e acompanhar"}</button>
    {open && <form className="review-form" onSubmit={save}>
      <p>Confira a ficha no Maps e procure o site antes de marcar a empresa. Essas escolhas são suas; a fonte não confirma ausência de site.</p>
      <div className="review-fields">
        <label>Ficha da empresa<select value={draft.placeStatus} onChange={(e) => update("placeStatus", e.target.value as LeadWorkflow["placeStatus"])}><option value="unchecked">Não conferida</option><option value="confirmed">Confirmei no Maps</option><option value="not_found">Não encontrei a empresa</option></select></label>
        <label>Site<select value={draft.websiteReview} onChange={(e) => update("websiteReview", e.target.value as LeadWorkflow["websiteReview"])}><option value="unchecked">Não conferido</option><option value="no_site">Não encontrei site</option><option value="has_site">Encontrei site</option></select></label>
        <label>Contato<select value={draft.contactStatus} onChange={(e) => update("contactStatus", e.target.value as LeadWorkflow["contactStatus"])}>{Object.entries(contactLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Último contato<input type="date" value={draft.lastContactAt} onChange={(e) => update("lastContactAt", e.target.value)} /></label>
        <label>Próxima ação<input type="date" value={draft.nextActionAt} onChange={(e) => update("nextActionAt", e.target.value)} /></label>
        <label className="review-notes">Anotações<textarea value={draft.notes} maxLength={1000} rows={3} placeholder="Ex.: quem atendeu, horário melhor para ligar, próxima conversa" onChange={(e) => update("notes", e.target.value)} /></label>
      </div>
      {error && <p className="review-error" role="alert">{error}</p>}
      <button className="review-save" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar revisão"}</button>
    </form>}
  </div>;
}
