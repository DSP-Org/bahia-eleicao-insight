import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { CARGOS, useMeta, useMunData, useMunicipios, useIbgeIndex, nf, pf, pct, downloadCSV, slugify, type Municipio } from "@/lib/eleicoes";
import { salvarPlanejamento, excluirPlanejamento } from "@/lib/planejamento.functions";
import { BuscaItem } from "@/components/relatorios/BuscaItem";
import { MapaBA } from "@/components/MapaBA";
import { PageHead, Card, Loading, Select, Btn, Stat } from "@/components/ui-bits";
import type { Bloco, Coluna } from "@/lib/relatorios/blocos";

export const Route = createFileRoute("/meta-x-urna")({
  head: () => ({
    meta: [
      { title: "Meta x Urna — Data5 Analytics | Eleições 2026 - BA" },
      { name: "description", content: "Compare o planejamento de votos com o resultado oficial das Eleições 2026 na Bahia, município por município." },
      { property: "og:title", content: "Meta x Urna — Data5 Analytics | Eleições 2026 - BA" },
      { property: "og:description", content: "Onde superamos a meta, onde ficamos abaixo e onde tivemos votos sem planejamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MetaXUrna,
});

type Plano = { id: string; nome: string; cargo: string; candidato_id: string; candidato_nome: string; metas: Record<string, number>; criado_em: string };
type Status = "superou" | "abaixo" | "sem_meta" | "zerado" | "nada";

const STATUS: Record<Status, { nome: string; cor: string }> = {
  superou: { nome: "Superou a meta", cor: "#2e8b57" },
  abaixo: { nome: "Abaixo da meta", cor: "#c8102e" },
  zerado: { nome: "Meta sem nenhum voto", cor: "#7a0010" },
  sem_meta: { nome: "Votos sem planejamento", cor: "#e8a33d" },
  nada: { nome: "Sem meta e sem votos", cor: "#e4ded1" },
};

const usePlanos = () =>
  useQuery({
    queryKey: ["planejamentos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("planejamentos").select("*").order("criado_em", { ascending: false });
      if (error) throw error;
      return data as unknown as Plano[];
    },
  });

function MetaXUrna() {
  const { data: planos, isLoading } = usePlanos();
  const [planoId, setPlanoId] = useState("");
  const [novo, setNovo] = useState(false);
  const plano = planos?.find((p) => p.id === planoId) ?? planos?.[0];

  if (isLoading) return <Loading />;
  return (
    <div>
      <PageHead kicker="Relatório · planejamento x resultado" title="Meta x Urna">
        Compare a meta de votos de cada município com o que o candidato recebeu de fato: onde avançamos, onde perdemos e onde vieram votos sem planejamento.
      </PageHead>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {!!planos?.length && (
          <Select value={plano?.id ?? ""} onChange={(v) => { setPlanoId(v); setNovo(false); }}>
            {planos.map((p) => <option key={p.id} value={p.id}>{p.nome} — {p.candidato_nome}</option>)}
          </Select>
        )}
        <Btn onClick={() => setNovo((v) => !v)}>{novo ? "Fechar envio" : "Enviar planilha de planejamento"}</Btn>
      </div>
      {(novo || !planos?.length) && <Envio onSalvo={(id) => { setPlanoId(id); setNovo(false); }} />}
      {plano && !novo && <Analise plano={plano} />}
    </div>
  );
}

function lerNumero(v: unknown) {
  if (typeof v === "number") return Math.round(v);
  const s = String(v ?? "").replace(/\./g, "").replace(/,/g, ".").replace(/[^\d.]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

async function lerPlanilha(file: File, muns: Municipio[]) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  let wb;
  if (/\.csv$/i.test(file.name)) {
    let txt = new TextDecoder("utf-8").decode(buf);
    if (txt.includes("\uFFFD")) txt = new TextDecoder("windows-1252").decode(buf);
    wb = XLSX.read(txt.replace(/^\uFEFF/, ""), { type: "string" });
  } else wb = XLSX.read(buf, { type: "array" });
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const cab = (linhas[0] ?? []).map((c) => slugify(String(c)));
  const iCod = cab.findIndex((c) => /cod|ibge|tse/.test(c));
  const iMun = cab.findIndex((c) => /munic|cidade|nome/.test(c));
  const iMeta = cab.findIndex((c) => /meta|voto|planej/.test(c));
  if (iMeta < 0 || (iMun < 0 && iCod < 0)) throw new Error("A planilha precisa das colunas \"Município\" e \"Meta\".");
  const porNome: Record<string, Municipio> = {}, porCod: Record<string, Municipio> = {};
  muns.forEach((m) => { porNome[slugify(m.nome).replace(/[^a-z0-9]/g, "")] = m; porCod[m.ibge] = m; porCod[m.tse] = m; porCod[m.ibge.slice(0, 6)] = m; });
  const metas: Record<string, number> = {}; const naoAchados: string[] = [];
  for (const l of linhas.slice(1)) {
    const cod = iCod >= 0 ? String(l[iCod]).replace(/\D/g, "") : "";
    const nome = iMun >= 0 ? String(l[iMun]).trim() : "";
    if (!cod && !nome) continue;
    const m = porCod[cod] ?? porCod[cod.replace(/^0+/, "")] ?? porNome[slugify(nome).replace(/[^a-z0-9]/g, "")];
    if (!m) { naoAchados.push(nome || cod); continue; }
    metas[m.tse] = (metas[m.tse] ?? 0) + lerNumero(l[iMeta]);
  }
  return { metas, naoAchados };
}

function Envio({ onSalvo }: { onSalvo: (id: string) => void }) {
  const { data: meta } = useMeta();
  const { data: muns } = useMunicipios();
  const qc = useQueryClient();
  const salvar = useServerFn(salvarPlanejamento);
  const [slug, setSlug] = useState("governador");
  const [candId, setCandId] = useState("");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [lido, setLido] = useState<{ metas: Record<string, number>; naoAchados: string[]; arquivo: string } | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const cargo = meta?.cargos.find((c) => c.slug === slug);
  const cand = cargo?.candidatos.find((c) => c.id === candId);
  if (!meta || !muns || !cargo) return <Loading />;

  const total = lido ? Object.values(lido.metas).reduce((a, b) => a + b, 0) : 0;
  const pronto = !!(cand && lido && Object.keys(lido.metas).length && nome.trim() && senha);

  const enviar = async () => {
    if (!cand || !lido) return;
    setEnviando(true); setErro("");
    try {
      const r = await salvar({ data: { senha, nome: nome.trim(), cargo: slug, candidato_id: cand.id, candidato_nome: `${cand.nome} (${cand.partido})`, metas: lido.metas } });
      await qc.invalidateQueries({ queryKey: ["planejamentos"] });
      onSalvo(r.id);
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao salvar."); }
    finally { setEnviando(false); }
  };

  return (
    <Card title="Novo planejamento">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm">Nome do planejamento
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Meta Governador — versão agosto" className="rounded-md border border-input bg-background px-3 py-2" maxLength={120} />
        </label>
        <label className="grid gap-1 text-sm">Cargo
          <Select value={slug} onChange={(v) => { setSlug(v); setCandId(""); }}>
            {CARGOS.map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
          </Select>
        </label>
        <div className="grid gap-1 text-sm">Candidato
          {cand ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
              <span>{cand.nome} · {cand.partido} {cand.n}</span>
              <button aria-label="Trocar candidato" onClick={() => setCandId("")} className="px-1 text-muted-foreground hover:text-foreground">×</button>
            </div>
          ) : (
            <BuscaItem rotulo="Buscar candidato" placeholder="Digite nome, partido ou número…" itens={cargo.candidatos}
              busca={(c) => slugify(`${c.nome} ${c.nomeCompleto} ${c.partido} ${c.n}`)}
              render={(c) => <span>{c.nome} <span className="text-muted-foreground">· {c.partido} {c.n} · {nf(c.votos)} votos</span></span>}
              onEscolher={(c) => setCandId(c.id)} />
          )}
        </div>
        <label className="grid gap-1 text-sm">Planilha (Excel ou CSV)
          <input type="file" accept=".xlsx,.xls,.csv" className="w-full min-w-0 text-sm" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return; setErro("");
            try { setLido({ ...(await lerPlanilha(f, muns)), arquivo: f.name }); } catch (er) { setLido(null); setErro(er instanceof Error ? er.message : "Não consegui ler a planilha."); }
          }} />
        </label>
        <label className="grid gap-1 text-sm">Senha de envio
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2" autoComplete="off" />
        </label>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        A planilha deve ter uma coluna <b>Município</b> (ou <b>Código IBGE/TSE</b>) e uma coluna <b>Meta</b> com o número de votos planejado.{" "}
        <button className="underline" onClick={() => downloadCSV("modelo-planejamento.csv", [["Código IBGE", "Município", "Meta"], ...muns.map((m) => [m.ibge, m.nome, ""])])}>Baixar modelo com os 417 municípios</button>
      </p>
      {lido && (
        <p className="mt-3 text-sm">
          <b>{lido.arquivo}</b>: {nf(Object.keys(lido.metas).length)} municípios com meta, total de {nf(total)} votos planejados.
          {!!lido.naoAchados.length && <span className="text-destructive"> Não reconheci {lido.naoAchados.length}: {lido.naoAchados.slice(0, 8).join(", ")}{lido.naoAchados.length > 8 ? "…" : ""}</span>}
        </p>
      )}
      {erro && <p className="mt-3 text-sm text-destructive">{erro}</p>}
      <div className="mt-4"><Btn onClick={enviar} disabled={!pronto || enviando}>{enviando ? "Salvando…" : "Salvar planejamento"}</Btn></div>
    </Card>
  );
}

function Analise({ plano }: { plano: Plano }) {
  const { data: meta } = useMeta();
  const { data: md } = useMunData(plano.cargo);
  const { data: muns } = useMunicipios();
  const { byIbge } = useIbgeIndex(muns);
  const qc = useQueryClient();
  const excluir = useServerFn(excluirPlanejamento);
  const [filtro, setFiltro] = useState<Status | "">("");
  const [gerando, setGerando] = useState(false);
  const [erroPdf, setErroPdf] = useState("");
  const [sel, setSel] = useState<string>();
  const cargo = meta?.cargos.find((c) => c.slug === plano.cargo);
  const idx = cargo?.candidatos.findIndex((c) => c.id === plano.candidato_id) ?? -1;

  const rows = useMemo(() => {
    if (!md || !muns || idx < 0) return [];
    return muns.map((m) => {
      const r = md[m.tse]; const votos = r?.v[idx] ?? 0; const metaV = plano.metas[m.tse] ?? 0;
      const st: Status = metaV > 0 ? (votos >= metaV ? "superou" : votos === 0 ? "zerado" : "abaixo") : votos > 0 ? "sem_meta" : "nada";
      return { m, votos, meta: metaV, dif: votos - metaV, ating: metaV ? pct(votos, metaV) : 0, st, vv: r?.vv ?? 0 };
    });
  }, [md, muns, idx, plano]);

  if (!meta || !cargo || !md || !muns) return <Loading />;
  if (idx < 0) return <p>Candidato do planejamento não encontrado nos resultados.</p>;

  const tMeta = rows.reduce((a, r) => a + r.meta, 0), tVotos = rows.filter((r) => r.meta > 0).reduce((a, r) => a + r.votos, 0);
  const extra = rows.filter((r) => r.st === "sem_meta").reduce((a, r) => a + r.votos, 0);
  const cont = (s: Status) => rows.filter((r) => r.st === s).length;
  const lista = rows.filter((r) => (filtro ? r.st === filtro : r.st !== "nada")).sort((a, b) => a.dif - b.dif);
  const byTse = Object.fromEntries(rows.map((r) => [r.m.ibge, r]));
  const detalhe = sel ? byTse[sel] : undefined;

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Meta total" value={nf(tMeta)} sub={`${cont("superou") + cont("abaixo") + cont("zerado")} municípios com meta`} />
        <Stat label="Votos onde havia meta" value={nf(tVotos)} sub={`${pf(pct(tVotos, tMeta), 1)} da meta`} />
        <Stat label="Saldo" value={`${tVotos - tMeta >= 0 ? "+" : ""}${nf(tVotos - tMeta)}`} sub={tVotos >= tMeta ? "acima do planejado" : "abaixo do planejado"} />
        <Stat label="Votos sem planejamento" value={nf(extra)} sub={`${cont("sem_meta")} municípios`} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["superou", "abaixo", "zerado", "sem_meta"] as Status[]).map((s) => (
          <button key={s} onClick={() => setFiltro(filtro === s ? "" : s)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${filtro === s ? "border-foreground bg-foreground text-background" : "border-border hover:bg-accent"}`}>
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: STATUS[s].cor }} />{STATUS[s].nome} · {cont(s)}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Card title={`${plano.candidato_nome} — ${cargo.nome}`}>
          <MapaBA height={520} selected={sel} onSelect={setSel}
            fill={(ib) => { const r = byTse[ib]; return r && (!filtro || r.st === filtro) ? STATUS[r.st].cor : STATUS.nada.cor; }}
            tooltip={(ib) => { const r = byTse[ib]; return r ? `<b>${r.m.nome}</b><br>${STATUS[r.st].nome}<br>Meta ${nf(r.meta)} · Votos ${nf(r.votos)}` : byIbge[ib]?.nome ?? ""; }} />
        </Card>
        <Card title="Município">
          {detalhe ? (
            <div className="grid gap-2 text-sm">
              <p className="font-serif text-2xl">{detalhe.m.nome}</p>
              <p style={{ color: STATUS[detalhe.st].cor }} className="font-medium">{STATUS[detalhe.st].nome}</p>
              <p>Meta: <b>{nf(detalhe.meta)}</b> · Votos: <b>{nf(detalhe.votos)}</b></p>
              <p>Diferença: <b>{detalhe.dif >= 0 ? "+" : ""}{nf(detalhe.dif)}</b>{detalhe.meta ? ` · ${pf(detalhe.ating, 1)} da meta` : ""}</p>
              <p className="text-muted-foreground">{pf(pct(detalhe.votos, detalhe.vv), 1)} dos votos válidos · região {detalhe.m.ri}</p>
            </div>
          ) : <p className="text-sm text-muted-foreground">Clique numa cidade do mapa para ver meta e resultado.</p>}
        </Card>
      </div>

      <Card title={filtro ? STATUS[filtro].nome : "Todos os municípios com meta ou votos"} action={
        <div className="flex flex-wrap gap-2">
        <Btn disabled={gerando} onClick={async () => {
          setGerando(true); setErroPdf("");
          try {
            const { baixarRelatorioPDF } = await import("@/lib/report-pdf-blocos");
            const grupos = (filtro ? [filtro] : (["superou", "abaixo", "zerado", "sem_meta"] as Status[]).filter((s) => cont(s) > 0));
            const colunas: Coluna[] = [
              { titulo: "Município", tipo: "mun" }, { titulo: "Região", tipo: "texto" }, { titulo: "Meta", tipo: "int" },
              { titulo: "Votos", tipo: "int" }, { titulo: "Diferença", tipo: "dif" }, { titulo: "% da meta", tipo: "pct", casas: 1 },
            ];
            const blocos: Bloco[] = [
              { tipo: "destaque", kicker: `${cargo.nome} · planejamento "${plano.nome}"`, titulo: plano.candidato_nome, sub: `Planejamento enviado em ${new Date(plano.criado_em).toLocaleString("pt-BR")}` },
              { tipo: "numeros", itens: [
                { rotulo: "Meta total", valor: nf(tMeta), sub: `${cont("superou") + cont("abaixo") + cont("zerado")} municípios com meta` },
                { rotulo: "Votos onde havia meta", valor: nf(tVotos), sub: `${pf(pct(tVotos, tMeta), 1)} da meta` },
                { rotulo: "Saldo", valor: `${tVotos - tMeta >= 0 ? "+" : ""}${nf(tVotos - tMeta)}`, sub: tVotos >= tMeta ? "acima do planejado" : "abaixo do planejado" },
                { rotulo: "Votos sem planejamento", valor: nf(extra), sub: `${cont("sem_meta")} municípios` },
              ] },
              { tipo: "numeros", itens: (["superou", "abaixo", "zerado", "sem_meta"] as Status[]).map((s) => ({ rotulo: STATUS[s].nome, valor: `${cont(s)} municípios` })) },
              ...grupos.map((s): Bloco => ({
                tipo: "tabela", titulo: `${STATUS[s].nome} (${cont(s)})`, colunas, arquivo: "",
                linhas: rows.filter((r) => r.st === s).sort((a, b) => (s === "superou" || s === "sem_meta" ? b.dif - a.dif : a.dif - b.dif))
                  .map((r) => [{ nome: r.m.nome, tse: r.m.tse }, r.m.ri, r.meta, r.votos, r.dif, r.meta ? r.ating : null]),
              })),
            ];
            await baixarRelatorioPDF({ titulo: `Meta x Urna — ${plano.nome}`, grupo: "Planejamento x resultado", filtros: `${plano.candidato_nome} · ${cargo.nome}${filtro ? ` · ${STATUS[filtro].nome}` : ""}`, blocos });
          } catch (e) { setErroPdf(e instanceof Error ? e.message : "Falha ao gerar o PDF."); }
          finally { setGerando(false); }
        }}>{gerando ? "Gerando PDF…" : "Baixar PDF"}</Btn>
        <Btn onClick={() => downloadCSV(`meta-x-urna-${slugify(plano.nome).replace(/\W+/g, "-")}.csv`, [
          ["Município", "Região", "Meta", "Votos", "Diferença", "% da meta", "Situação"],
          ...lista.map((r) => [r.m.nome, r.m.ri, r.meta, r.votos, r.dif, r.meta ? r.ating.toFixed(1).replace(".", ",") : "", STATUS[r.st].nome]),
        ])}>Baixar CSV</Btn>
        {erroPdf && <span className="text-sm text-destructive">{erroPdf}</span>}
        </div>}>
        <div className="max-h-[560px] overflow-auto">
          <table className="mobile-records w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-muted-foreground"><tr>
              <th className="py-2">Município</th><th className="text-right">Meta</th><th className="text-right">Votos</th><th className="text-right">Diferença</th><th className="text-right">% meta</th><th className="pl-3">Situação</th>
            </tr></thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.m.tse} className="cursor-pointer border-t border-border hover:bg-accent" onClick={() => setSel(r.m.ibge)}>
                  <td data-label="Município" className="record-title py-1.5">{r.m.nome}</td>
                  <td data-label="Meta" className="text-right font-mono">{nf(r.meta)}</td>
                  <td data-label="Votos" className="text-right font-mono">{nf(r.votos)}</td>
                  <td data-label="Diferença" className="text-right font-mono" style={{ color: r.dif >= 0 ? STATUS.superou.cor : STATUS.abaixo.cor }}>{r.dif >= 0 ? "+" : ""}{nf(r.dif)}</td>
                  <td data-label="% da meta" className="text-right font-mono">{r.meta ? pf(r.ating, 1) : "—"}</td>
                  <td data-label="Situação" className="record-title pl-3"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STATUS[r.st].cor }} /> {STATUS[r.st].nome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Planejamento enviado em {new Date(plano.criado_em).toLocaleString("pt-BR")}.{" "}
        <button className="underline" onClick={async () => {
          const s = window.prompt("Senha de envio para excluir este planejamento:"); if (!s) return;
          try { await excluir({ data: { senha: s, id: plano.id } }); await qc.invalidateQueries({ queryKey: ["planejamentos"] }); }
          catch (e) { window.alert(e instanceof Error ? e.message : "Falha ao excluir."); }
        }}>Excluir planejamento</button>
      </p>
    </div>
  );
}
