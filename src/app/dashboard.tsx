"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Lead, Mode } from "../lib/types";
import LeadReviewPanel from "./lead-review-panel";

type District = { name: string; total: number };

const numberFormat = new Intl.NumberFormat("pt-BR");
const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo"
});

export default function Dashboard() {
  const [mode, setMode] = useState<Mode>("business_without_website");
  const [query, setQuery] = useState("");
  const [neighborhood, setNeighborhood] = useState("Todos");
  const [category, setCategory] = useState("");
  const [market, setMarket] = useState("br_or_eur");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [districts, setDistricts] = useState<District[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [results, setResults] = useState<Lead[]>([]);
  const [sourceMode, setSourceMode] = useState("empty");
  const [total, setTotal] = useState(0);
  const [warning, setWarning] = useState("");
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [queue, setQueue] = useState("all");
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const leads = useMemo(() => results.filter((lead) => lead.mode === mode), [results, mode]);
  const districtsWithData = districts.filter((district) => district.total > 0).length;
  const updatedText = lastUpdatedAt ? dateFormat.format(new Date(lastUpdatedAt)) : "Aguardando atualização";
  const pageSize = mode === "public_requests" ? 50 : 200;
  const resultStart = total ? (page - 1) * pageSize + 1 : 0;
  const resultEnd = Math.min(page * pageSize, total);
  const isBusinessMode = mode === "business_without_website";
  const hasRealData = sourceMode === "foursquare" || sourceMode === "overture" || sourceMode === "public";

  async function search(nextNeighborhood = neighborhood, nextMode = mode, nextQuery = query, nextPage = 1, nextCategory = category, nextMarket = market, nextIncludeExcluded = includeExcluded, nextQueue = queue) {
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        mode: nextMode,
        query: nextQuery,
        neighborhood: nextNeighborhood === "Todos" ? "" : nextNeighborhood,
        category: nextCategory,
        market: nextMarket,
        includeExcluded: nextIncludeExcluded ? "1" : "0",
        queue: nextQueue,
        page: String(nextPage)
      });
      const response = await fetch(`/api/leads?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Falha na consulta");
      const data = await response.json();
      if (currentRequest !== requestId.current) return;
      setResults(data.leads ?? []);
      setSourceMode(data.sourceMode ?? "empty");
      setTotal(data.total ?? data.leads?.length ?? 0);
      setDistricts(data.districts ?? []);
      setLastUpdatedAt(data.lastUpdatedAt ?? null);
      setWarning(data.warning ?? "");
      setPage(nextPage);
      setHasNext(Boolean(data.hasNext));
    } catch {
      if (currentRequest === requestId.current) {
        setResults([]);
        setTotal(0);
        setSourceMode("error");
        setWarning("Não foi possível consultar o banco local. Tente recarregar a lista.");
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  function changeMode(nextMode: Mode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setQuery("");
    setNeighborhood("Todos");
    setCategory("");
    setMarket("br_or_eur");
    setIncludeExcluded(false);
    setQueue("all");
    search("Todos", nextMode, "", 1, "", "br_or_eur");
  }

  function clearFilters() {
    setQuery("");
    setNeighborhood("Todos");
    setCategory("");
    setMarket("br_or_eur");
    setIncludeExcluded(false);
    setQueue("all");
    search("Todos", mode, "", 1, "", "br_or_eur", false, "all");
  }

  useEffect(() => { search("Todos", "business_without_website"); }, []);
  useEffect(() => {
    const refresh = () => search(neighborhood, mode, query, page, category, market, includeExcluded, queue);
    const refreshOnVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(refresh, 15 * 60 * 1000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshOnVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [neighborhood, mode, query, page, category, market, includeExcluded, queue]);

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-symbol" aria-hidden="true"><span /></span>
          <div><strong>Radar</strong><small>de Clientes</small></div>
        </div>

        <div className="sidebar-section-label">ÁREA DE TRABALHO</div>
        <nav className="sidebar-nav" aria-label="Modalidades de pesquisa">
          <button type="button" className={`nav-item ${isBusinessMode ? "active" : ""}`} onClick={() => changeMode("business_without_website")}>
            <span className="nav-glyph" aria-hidden="true">◎</span>
            <span>Site não informado</span>
          </button>
          <button type="button" className={`nav-item ${!isBusinessMode ? "active" : ""}`} onClick={() => changeMode("public_requests")}>
            <span className="nav-glyph" aria-hidden="true">▤</span>
            <span>Pedidos públicos</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-location"><span className="sidebar-location-icon" aria-hidden="true">⌖</span><div><strong>São Paulo, SP</strong><small>96 distritos no mapa</small></div></div>
          <div className="sidebar-divider" />
          <p>Pesquisa local com dados de mapas abertos e fonte identificada.</p>
          <span className="sidebar-local"><i /> Base armazenada neste computador</span>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Área de trabalho <span>/</span> <strong>{isBusinessMode ? "Site não informado" : "Pedidos públicos"}</strong></div>
          <div className="top-actions">
            <span className="local-pill"><i /> Base local</span>
            <button type="button" className="reload-button" disabled={loading} onClick={() => search(neighborhood, mode, query, page, category)}>
              <span aria-hidden="true">↻</span> Recarregar lista
            </button>
          </div>
        </header>

        <main className="content">
          <section className="hero-panel">
            <div className="hero-copy">
              <span className="hero-eyebrow"><i /> RADAR DE CLIENTES · SÃO PAULO</span>
              <h1>{isBusinessMode ? <>Encontre empresas<br /><em>para sua próxima conversa.</em></> : <>Pedidos públicos<br /><em>para sites e sistemas.</em></>}</h1>
              <p>{isBusinessMode ? "Explore empresas com telefone informado e website não informado na fonte. Filtre por distrito, confira o mapa e escolha quem vale pesquisar melhor." : "Veja projetos publicados por clientes na Freelancer.com e editais de SP no PNCP. Abra a publicação para conferir requisitos e disponibilidade."}</p>
            </div>
            <div className="radar-art" aria-hidden="true"><div className="radar-ring ring-one" /><div className="radar-ring ring-two" /><div className="radar-ring ring-three" /><div className="radar-sweep" /><div className="radar-center" /><span className="radar-point point-one" /><span className="radar-point point-two" /><span className="radar-point point-three" /></div>
          </section>

          {isBusinessMode && <section className="stats-grid" aria-label="Resumo da pesquisa">
            <div className="stat-card"><span className="stat-label">RESULTADOS NA BUSCA</span><strong>{numberFormat.format(total)}</strong><span className="stat-detail">empresas com telefone informado</span><span className="stat-icon" aria-hidden="true">↗</span></div>
            <div className="stat-card"><span className="stat-label">DISTRITOS COM CADASTROS</span><strong>{districtsWithData}<small> / 96</small></strong><span className="stat-detail">cobertura no município</span><span className="stat-icon" aria-hidden="true">⌖</span></div>
            <div className="stat-card"><span className="stat-label">ÚLTIMA IMPORTAÇÃO</span><strong className="stat-date">{updatedText}</strong><span className="stat-detail">{sourceMode === "overture" ? "fonte mensal, verificada diariamente" : "a lista recarrega a cada 15 min"}</span><span className="stat-icon" aria-hidden="true">↻</span></div>
          </section>}

          <section className="workspace" aria-labelledby="workspace-title">
            <div className="workspace-heading">
              <div><span className="section-kicker">PESQUISA</span><h2 id="workspace-title">{isBusinessMode ? "Encontre empresas" : "Projetos e editais de site e software"}</h2><p>{isBusinessMode ? "Escolha uma região e refine a lista para começar sua pesquisa." : "Pedidos públicos de clientes na Freelancer.com e editais no PNCP."}</p></div>
              <span className={`source-badge ${hasRealData ? "real" : "waiting"}`}><i /> {hasRealData ? `Dados reais · ${sourceMode === "public" ? "fontes identificadas" : sourceMode === "overture" ? "Overture" : "Foursquare"}` : "Aguardando dados"}</span>
            </div>

            {isBusinessMode && <form className="filter-panel" onSubmit={(event) => { event.preventDefault(); search(); }}>
              <div className="filter-title"><strong>Filtrar resultados</strong><span>Busque por nome, endereço ou categoria</span></div>
              <div className="filters">
                <label className="field field-search"><span>Nome ou bairro no endereço</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: padaria, Vila Madalena..." /></label>
                <label className="field"><span>Distrito</span><select value={neighborhood} onChange={(event) => { const value = event.target.value; setNeighborhood(value); search(value, mode, query, 1, category); }}><option value="Todos">Todos os distritos</option>{districts.map((district) => <option key={district.name} value={district.name}>{district.name} ({numberFormat.format(district.total)})</option>)}</select></label>
                <label className="field"><span>Categoria na fonte</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Ex.: Restaurant" /></label>
                <button type="submit" className="search-button" disabled={loading}>{loading ? "Buscando..." : "Pesquisar"}<span aria-hidden="true">→</span></button>
              </div>
              <button type="button" className="clear-button" onClick={clearFilters}>Limpar filtros</button>
              <label className="field queue-field"><span>Minha fila</span><select value={queue} onChange={(event) => { setQueue(event.target.value); search(neighborhood, mode, query, 1, category, market, includeExcluded, event.target.value); }}><option value="all">Todas as oportunidades</option><option value="to_contact">Para contatar</option><option value="due">Ação para hoje ou atrasada</option><option value="in_progress">Em andamento</option></select></label>
              <label className="include-excluded"><input type="checkbox" checked={includeExcluded} onChange={(event) => { setIncludeExcluded(event.target.checked); search(neighborhood, mode, query, 1, category, market, event.target.checked); }} /> Incluir resultados descartados, redes e telefones fora de SP</label>
            </form>}

            {!isBusinessMode && <form className="filter-panel" onSubmit={(event) => { event.preventDefault(); search("Todos", mode, query, 1, category); }}>
              <div className="filter-title"><strong>Filtrar pedidos</strong><span>Busque pelo objeto, órgão ou município</span></div>
              <div className="filters public-filters">
                <label className="field"><span>Palavra-chave</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: portal, aplicativo, prefeitura..." /></label>
                <label className="field"><span>Tipo de projeto</span><select value={category} onChange={(event) => { setCategory(event.target.value); search("Todos", mode, query, 1, event.target.value); }}><option value="">Sites e sistemas</option><option value="site">Sites e portais</option><option value="software">Software e sistemas</option></select></label>
                <label className="field"><span>Idioma ou moeda</span><select value={market} onChange={(event) => { setMarket(event.target.value); search("Todos", mode, query, 1, category, event.target.value); }}><option value="br_or_eur">Brasil ou EUR</option><option value="br">Português + Brasil/BRL</option><option value="eur">Orçamento em EUR</option><option value="all">Todas as moedas</option></select></label>
                <button type="submit" className="search-button" disabled={loading}>{loading ? "Buscando..." : "Pesquisar"}<span aria-hidden="true">→</span></button>
              </div>
              <button type="button" className="clear-button" onClick={clearFilters}>Limpar filtros</button>
            </form>}

            {warning && <div className={`status-alert ${hasRealData ? "has-data" : ""}`} role="status"><span className="status-icon" aria-hidden="true">!</span><div><strong>{hasRealData ? "A lista está disponível. A atualização precisa de atenção." : "Atenção à fonte de dados"}</strong><p>{warning}</p></div></div>}

            <div className="results-heading">
              <div><span className="section-kicker">{isBusinessMode ? "LISTA DE EMPRESAS" : "PEDIDOS PUBLICADOS"}</span><h3>{isBusinessMode ? "Resultados encontrados" : "Pedidos encontrados"}</h3><p>{isBusinessMode ? `Empresas com telefone e website não informado na ${sourceMode === "overture" ? "Overture Maps" : "Foursquare"}. A ausência de site fora da fonte precisa ser confirmada antes do contato.` : market === "br" ? "Projetos em português com sinal explícito de Brasil ou orçamento em BRL, além de editais brasileiros. Confira a publicação original." : market === "eur" ? "Projetos cujo orçamento publicado está em EUR. Confirme as condições e a disponibilidade na publicação original." : market === "br_or_eur" ? "Pedidos brasileiros identificáveis e projetos com orçamento publicado em EUR. Confira idioma, condições e disponibilidade na publicação original." : "Confira a publicação original para ver se ainda aceita propostas. Valores mantêm a moeda e faixa informadas pela fonte."}</p></div>
              <span className="result-range">{numberFormat.format(resultStart)}–{numberFormat.format(resultEnd)} de {numberFormat.format(total)}</span>
            </div>

            <div className="result-list">
              {leads.length === 0 && <div className="empty-state"><span aria-hidden="true">◎</span><strong>{loading ? "Consultando a base..." : isBusinessMode ? "Nenhuma empresa neste recorte" : "Nenhum pedido neste recorte agora"}</strong><p>{loading ? "Aguarde um momento." : isBusinessMode ? "Ajuste os filtros ou inclua os resultados descartados para revisar a base." : market === "br" ? "O feed não trouxe projetos com português e sinal de Brasil/BRL nesta atualização. Tente novamente depois." : "Tente outro filtro ou confira depois da próxima atualização."}</p></div>}
              {leads.map((lead, index) => {
                const categoryName = (lead.category.split(" > ").at(-1) || lead.category).replaceAll("_", " ");
                return <article className="result-card" key={lead.id}>
                  <div className="result-number">{String((page - 1) * pageSize + index + 1).padStart(2, "0")}</div>
                  <div className="result-body">
                    <div className="result-title-row"><h4>{lead.name}</h4><span className="website-chip">{isBusinessMode ? lead.workflow?.websiteReview === "no_site" ? "Site não encontrado por você" : lead.workflow?.websiteReview === "has_site" ? "Site encontrado" : "Website não informado na fonte" : lead.source === "PNCP" ? "Prazo aberto" : "Projeto publicado"}</span>{isBusinessMode && lead.workflow?.placeStatus === "confirmed" && lead.workflow.websiteReview === "no_site" && <span className="priority-chip">Prioridade alta · ficha e site conferidos</span>}</div>
                    <div className="result-category">{categoryName}</div>
                    <div className="result-meta"><span><b aria-hidden="true">⌖</b> {isBusinessMode || lead.source === "PNCP" ? `${lead.city}, ${lead.neighborhood}` : "Freelancer.com · online"}</span>{lead.address && <span><b aria-hidden="true">↳</b> {lead.address}</span>}</div>
                    {!isBusinessMode && <><p className="request-description">{lead.description}</p><div className="request-facts">{lead.source === "PNCP" && <span>Órgão: {lead.organization}</span>}{lead.budgetText && <span>Orçamento: {lead.budgetText}</span>}{lead.budget && <span>Estimativa: {lead.budget.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>}{lead.deadlineAt && <span>Encerra: {dateFormat.format(new Date(lead.deadlineAt))}</span>}</div></>}
                    {lead.phone && <div className="result-phone"><span aria-hidden="true">☎</span> <a href={`tel:${lead.phone.replace(/\D/g, "")}`}>{lead.phone}</a><small>Telefone informado na fonte</small></div>}
                    {isBusinessMode && <LeadReviewPanel lead={lead} onSaved={() => search(neighborhood, mode, query, page, category, market, includeExcluded)} />}
                  </div>
                  <div className="result-actions">
                    {lead.mapUrl && <a href={lead.mapUrl} target="_blank" rel="noopener noreferrer" className="map-link">Ver empresa no Google Maps <span aria-hidden="true">↗</span></a>}
                    {isBusinessMode && <a href={`https://www.google.com/search?q=${encodeURIComponent(`${lead.name} ${lead.address ?? ""} ${lead.city} ${lead.phone ?? ""} site oficial`)}`} target="_blank" rel="noopener noreferrer" className="source-link">Verificar site <span aria-hidden="true">↗</span></a>}
                    <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" className={isBusinessMode ? "source-link" : "map-link"}>{isBusinessMode ? lead.source === "Overture Maps" ? "Explorar Overture" : "Ficha na Foursquare" : lead.source === "PNCP" ? "Abrir edital no PNCP" : "Abrir projeto"} <span aria-hidden="true">↗</span></a>
                    {isBusinessMode && lead.sourceRecordId && <small title={lead.sourceRecordId}>ID Overture: {lead.sourceRecordId.slice(0, 8)}…</small>}
                    <small>{isBusinessMode ? "Importado" : "Publicado"} em {new Date(lead.publishedAt ?? lead.collectedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</small>
                  </div>
                </article>;
              })}
            </div>

            {total > 0 && <div className="pagination"><span>Página {numberFormat.format(page)}</span><div><button type="button" disabled={loading || page <= 1} onClick={() => search(neighborhood, mode, query, page - 1, category)}>← Anterior</button><button type="button" disabled={loading || !hasNext} onClick={() => search(neighborhood, mode, query, page + 1, category)}>Próxima →</button></div></div>}
          </section>

          <footer className="footer"><span>Radar de Clientes · pesquisa local</span><span>{!isBusinessMode ? <>Projetos: <a href="https://www.freelancer.com/rss.xml" target="_blank" rel="noopener noreferrer">Freelancer.com</a> · Editais: <a href="https://pncp.gov.br/app/editais" target="_blank" rel="noopener noreferrer">PNCP</a></> : sourceMode === "overture" ? <>Dados: <a href="https://docs.overturemaps.org/attribution/" target="_blank" rel="noopener noreferrer">Overture Maps Foundation e fontes</a></> : "© Foursquare Labs, Inc. · Apache 2.0"}{isBusinessMode && " | Distritos: Prefeitura de São Paulo · CC BY-SA 4.0"}</span></footer>
        </main>
      </div>
    </div>
  );
}
