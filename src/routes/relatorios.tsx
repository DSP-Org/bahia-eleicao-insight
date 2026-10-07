import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { FileDown, Link2, LoaderCircle } from "lucide-react";
import { useMeta, useMunicipios, nf, type MunData } from "@/lib/eleicoes";
import { PageHead, Loading, Select, Btn } from "@/components/ui-bits";
import { Blocos } from "@/components/relatorios/Blocos";
import { BuscaItem } from "@/components/relatorios/BuscaItem";
import {
  NOME_CURTO,
  PROPORCIONAIS,
  REGIOES,
  SLUGS,
  montarBase,
  nomesRegioes,
  recorteNome,
  ehSlug,
  type Base,
  type Slug,
} from "@/lib/relatorios/base";
import {
  RELATORIOS,
  baixarDados,
  candidatoPadrao,
  municipioPadrao,
  opcoesPartido,
  slugDe,
  tabelasDe,
  type Controle,
  type Estado,
} from "@/lib/relatorios/definicoes";

const CHAVES = [
  "r",
  "cargo",
  "escopo",
  "agrupar",
  "reg",
  "partido",
  "pn",
  "sit",
  "cand",
  "cand2",
  "mun",
  "muns",
  "agr",
  "cargob",
  "min",
  "cands",
  "med",
] as const;

export const Route = createFileRoute("/relatorios")({
  // O estado fica na URL: qualquer relatório com seus filtros pode ser compartilhado por link.
  validateSearch: (s: Record<string, unknown>): Estado => {
    const out: Estado = {};
    for (const k of CHAVES) {
      const v = s[k];
      if (typeof v === "string" && v) out[k] = v;
      else if (typeof v === "number") out[k] = String(v);
    }
    return out;
  },
  head: () => ({
    meta: [
      { title: "Relatórios — Data5 Analytics | Eleições 2026 - BA" },
      {
        name: "description",
        content:
          "Data5 Analytics: 20 relatórios das Eleições 2026 na Bahia por município, território, região, partido e candidato, em PDF e CSV.",
      },
      { property: "og:title", content: "Relatórios — Data5 Analytics | Eleições 2026 - BA" },
      {
        property: "og:description",
        content:
          "Relatórios completos com filtro por território, região ou município e download em PDF e CSV.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Relatorios,
});

function useBase(): Base | null {
  const { data: meta } = useMeta();
  const { data: muns } = useMunicipios();
  // Mesma chave de cache de useMunData: os arquivos já baixados por outras páginas são reaproveitados.
  const qs = useQueries({
    queries: SLUGS.map((slug) => ({
      queryKey: ["mun", slug],
      queryFn: () =>
        fetch(`/data/mun-${slug}.json`).then((r) => {
          if (!r.ok) throw new Error("Falha ao carregar dados");
          return r.json() as Promise<MunData>;
        }),
      staleTime: Infinity,
      gcTime: Infinity,
    })),
  });
  const versao = qs.map((q) => q.dataUpdatedAt).join();
  return useMemo(() => {
    if (!meta || !muns || qs.some((q) => !q.data)) return null;
    return montarBase(
      meta,
      muns,
      Object.fromEntries(SLUGS.map((s, i) => [s, qs[i]?.data])) as Record<Slug, MunData>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, muns, versao]);
}

function Relatorios() {
  const st = Route.useSearch();
  const navigate = useNavigate({ from: "/relatorios" });
  const B = useBase();
  const [gerando, setGerando] = useState(false);
  const [erroPdf, setErroPdf] = useState("");
  const [copiado, setCopiado] = useState(false);

  const rel =
    RELATORIOS.find((r) => r.id === st.r) ?? (RELATORIOS[0] as (typeof RELATORIOS)[number]);
  const ef = useMemo((): Estado => {
    const e: Estado = { ...rel.padrao, ...st };
    if (rel.controles.includes("cargoprop") && !PROPORCIONAIS.includes(e.cargo as Slug))
      e.cargo = "deputado-estadual";
    if (B && rel.controles.includes("cand") && !B.candPorId.has(e.cand ?? ""))
      e.cand = candidatoPadrao(B);
    if (B && rel.controles.includes("cand2") && !B.candPorId.has(e.cand2 ?? "")) {
      const primeiro = B.candPorId.get(e.cand ?? "");
      const segundo = primeiro
        ? B.cargos[primeiro.slug].cargo.candidatos.find((c) => c.id !== primeiro.c.id)
        : undefined;
      if (segundo) e.cand2 = segundo.id;
    }
    if (B && rel.controles.includes("mun") && !B.porTse.has(e.mun ?? ""))
      e.mun = municipioPadrao(B);
    return e;
  }, [rel, st, B]);
  const blocos = useMemo(() => (B ? rel.gerar(B, ef) : []), [B, rel, ef]);

  // Troca um filtro mantendo os outros; ao trocar o cargo, limpa os filtros que dependem dele.
  const definir = (k: (typeof CHAVES)[number], v: string) => {
    navigate({
      search: (prev: Estado) => {
        const n: Estado = { ...prev };
        if (v) n[k] = v;
        else delete n[k];
        if (k === "cargo") {
          delete n.partido;
          delete n.pn;
          delete n.sit;
          delete n.agr;
        }
        if (k === "cand") delete n.cargob;
        return n;
      },
      replace: true,
    });
  };
  const trocar = (id: string) => {
    // ao mudar de relatório, mantém cargo, recorte, candidato e município
    const n: Estado = { r: id };
    for (const k of ["cargo", "escopo", "cand", "cand2", "mun", "muns"] as const) {
      const v = st[k];
      if (v) n[k] = v;
    }
    navigate({ search: n });
  };

  if (!B) return <Loading />;

  const filtros =
    [
      (rel.controles.includes("cargo") || rel.controles.includes("cargoprop")) && ehSlug(ef.cargo)
        ? B.cargos[ef.cargo].cargo.nome
        : "",
      rel.controles.includes("escopo") ? recorteNome(ef.escopo, B) : "",
      rel.controles.includes("cand") ? (B.candPorId.get(ef.cand ?? "")?.c.nome ?? "") : "",
      rel.controles.includes("cand2") ? (B.candPorId.get(ef.cand2 ?? "")?.c.nome ?? "") : "",
      rel.controles.includes("mun") ? (B.muns[B.porTse.get(ef.mun ?? "") ?? -1]?.nome ?? "") : "",
      rel.controles.includes("muns")
        ? (() => {
            const n = (ef.muns ?? "").split(",").map((t) => B.muns[B.porTse.get(t) ?? -1]?.nome).filter(Boolean);
            return !n.length ? "Bahia" : n.length <= 3 ? n.join(", ") : `${n.length} municípios`;
          })()
        : "",
    ]
      .filter(Boolean)
      .join(" · ") || "Bahia";
  const temTabela = tabelasDe(blocos).length > 0;
  const grupos = [...new Set(RELATORIOS.map((r) => r.grupo))];

  const baixarPDF = async () => {
    if (gerando) return;
    setGerando(true);
    setErroPdf("");
    try {
      const { baixarRelatorioPDF } = await import("@/lib/report-pdf-blocos");
      await baixarRelatorioPDF({ titulo: rel.titulo, grupo: rel.grupo, filtros, blocos });
    } catch (e) {
      console.error("Falha ao gerar relatório PDF", e);
      setErroPdf("Não foi possível gerar o PDF. Tente novamente.");
    } finally {
      setGerando(false);
    }
  };
  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sem permissão: ignora */
    }
  };

  return (
    <div>
      <PageHead kicker={`Data5 Analytics · Relatórios · ${rel.grupo}`} title={rel.titulo}>
        {rel.desc}
      </PageHead>
      <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside>
          <label
            className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground lg:hidden"
            htmlFor="rel-select"
          >
            Relatório
          </label>
          <select
            id="rel-select"
            value={rel.id}
            onChange={(e) => trocar(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm lg:hidden"
          >
            {grupos.map((g) => (
              <optgroup key={g} label={g}>
                {RELATORIOS.filter((r) => r.grupo === g).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.titulo}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <nav className="hidden space-y-4 lg:block" aria-label="Relatórios">
            {grupos.map((g) => (
              <div key={g}>
                <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                  {g}
                </p>
                {RELATORIOS.filter((r) => r.grupo === g).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => trocar(r.id)}
                    className={`block w-full rounded-md px-2 py-1.5 text-left text-sm ${r.id === rel.id ? "bg-foreground text-background" : "hover:bg-accent"}`}
                  >
                    {r.titulo}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            {rel.controles.map((c) => (
              <Controle key={c} c={c} B={B} st={ef} definir={definir} />
            ))}
            <div className="ml-auto flex flex-wrap gap-2">
              <Btn onClick={copiarLink}>
                <Link2 size={16} />
                {copiado ? "Link copiado" : "Copiar link"}
              </Btn>
              {temTabela && (
                <Btn onClick={baixarPDF} disabled={gerando}>
                  {gerando ? (
                    <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" />
                  ) : (
                    <FileDown size={16} />
                  )}
                  {gerando ? "Gerando PDF…" : "Baixar PDF"}
                </Btn>
              )}
            </div>
          </div>
          <p className="font-mono text-xs uppercase tracking-wider text-primary">{filtros}</p>
          {erroPdf && (
            <p role="alert" className="text-sm text-destructive">
              {erroPdf}
            </p>
          )}
          <Blocos
            blocos={blocos}
            chave={`${rel.id}|${JSON.stringify(ef)}`}
            onBaixar={(id) => baixarDados(B, id)}
          />
        </div>
      </div>
    </div>
  );
}

function Campo({
  rotulo,
  children,
  largo = false,
}: {
  rotulo: string;
  children: ReactNode;
  largo?: boolean;
}) {
  return (
    <label className={`flex min-w-0 max-w-full flex-col gap-1 ${largo ? "w-full md:w-80" : "w-full sm:w-auto"}`}>
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{rotulo}</span>
      {children}
    </label>
  );
}

function Controle({
  c,
  B,
  st,
  definir,
}: {
  c: Controle;
  B: Base;
  st: Estado;
  definir: (k: (typeof CHAVES)[number], v: string) => void;
}) {
  const slug = slugDe(st);
  switch (c) {
    case "cargo":
    case "cargoprop":
      return (
        <Campo rotulo="Cargo">
          <Select value={st.cargo ?? ""} onChange={(v) => definir("cargo", v)}>
            {(c === "cargo" ? SLUGS : PROPORCIONAIS).map((s) => (
              <option key={s} value={s}>
                {B.cargos[s].cargo.nome}
              </option>
            ))}
          </Select>
        </Campo>
      );
    case "cargob": {
      const ref = B.candPorId.get(st.cand ?? "");
      const padrao =
        st.cargob ?? (ref?.slug === "deputado-estadual" ? "deputado-federal" : "deputado-estadual");
      return (
        <Campo rotulo="Comparar com o cargo">
          <Select value={padrao} onChange={(v) => definir("cargob", v)}>
            {SLUGS.map((s) => (
              <option key={s} value={s}>
                {B.cargos[s].cargo.nome}
              </option>
            ))}
          </Select>
        </Campo>
      );
    }
    case "escopo": {
      const escopoAtual = st.escopo ?? "ba";
      const itens = [
        { v: "ba", nome: "Bahia inteira", grupo: "" },
        ...(Object.keys(REGIOES) as (keyof typeof REGIOES)[]).flatMap((k) =>
          nomesRegioes(k, B.muns).map((n) => ({ v: `${k}:${n}`, nome: n, grupo: REGIOES[k] })),
        ),
        ...B.muns.map((m) => ({ v: `mun:${m.tse}`, nome: m.nome, grupo: "Município" })),
      ];
      const rotuloAtual = itens.find((i) => i.v === escopoAtual)?.nome ?? "Bahia inteira";
      return (
        <Campo rotulo={`Recorte: ${rotuloAtual}`} largo>
          <BuscaItem
            itens={itens}
            rotulo="Buscar recorte"
            placeholder="Região ou município (ex.: Salvador, Feira de Santana)"
            busca={(i) => slugBusca(`${i.nome} ${i.grupo}`)}
            onEscolher={(i) => definir("escopo", i.v)}
            render={(i) => (
              <>
                <b>{i.nome}</b>{" "}
                {i.grupo && <span className="text-muted-foreground">· {i.grupo}</span>}
              </>
            )}
          />
          {escopoAtual !== "ba" && (
            <button
              onClick={() => definir("escopo", "ba")}
              className="mt-1 text-xs text-primary underline"
            >
              Voltar para Bahia inteira
            </button>
          )}
        </Campo>
      );
    }
    case "agrupar":
      return (
        <Campo rotulo="Agrupar por">
          <Select value={st.agrupar ?? "mun"} onChange={(v) => definir("agrupar", v)}>
            <option value="mun">Município</option>
            {(Object.keys(REGIOES) as (keyof typeof REGIOES)[]).map((k) => (
              <option key={k} value={k}>
                {REGIOES[k]}
              </option>
            ))}
          </Select>
        </Campo>
      );
    case "reg":
      return (
        <Campo rotulo="Regionalização">
          <Select value={st.reg ?? "ri"} onChange={(v) => definir("reg", v)}>
            {(Object.keys(REGIOES) as (keyof typeof REGIOES)[]).map((k) => (
              <option key={k} value={k}>
                {REGIOES[k]}
              </option>
            ))}
          </Select>
        </Campo>
      );
    case "partido": {
      const ps = [...new Set(B.cargos[slug].cargo.candidatos.map((x) => x.partido))].sort();
      return (
        <Campo rotulo="Partido">
          <Select value={st.partido ?? ""} onChange={(v) => definir("partido", v)}>
            <option value="">Todos</option>
            {ps.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Campo>
      );
    }
    case "pn": {
      const ps = opcoesPartido(B, slug);
      return (
        <Campo rotulo="Partido">
          <Select value={st.pn ?? ps[0]?.n ?? ""} onChange={(v) => definir("pn", v)}>
            {ps.map((p) => (
              <option key={p.n} value={p.n}>
                {p.sg} ({p.n})
              </option>
            ))}
          </Select>
        </Campo>
      );
    }
    case "sit": {
      const nomes: Record<string, string> = {
        eleito: "Eleitos",
        suplente: "Suplentes",
        nao_eleito: "Não eleitos",
        segundo_turno: "2º turno",
        aguardando: "Aguardando TSE",
      };
      const tipos = [
        ...new Set(
          B.cargos[slug].cargo.candidatos.map(
            (x) => x.sitTipo ?? (x.eleito ? "eleito" : "nao_eleito"),
          ),
        ),
      ];
      return (
        <Campo rotulo="Situação">
          <Select value={st.sit ?? ""} onChange={(v) => definir("sit", v)}>
            <option value="">Todas</option>
            {tipos.map((t) => (
              <option key={t} value={t}>
                {nomes[t] ?? t}
              </option>
            ))}
          </Select>
        </Campo>
      );
    }
    case "agr": {
      const ags =
        B.cargos[slug === "deputado-federal" ? "deputado-federal" : "deputado-estadual"].cargo
          .agremiacoes ?? [];
      return (
        <Campo rotulo="Partido / federação">
          <Select value={st.agr ?? ""} onChange={(v) => definir("agr", v)} className="max-w-72">
            <option value="">Todas com vaga</option>
            {ags.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome} ({a.vagas} vaga{a.vagas === 1 ? "" : "s"})
              </option>
            ))}
          </Select>
        </Campo>
      );
    }
    case "min":
      return (
        <Campo rotulo="Mínimo de votos">
          <Select value={st.min ?? "0"} onChange={(v) => definir("min", v)}>
            {["0", "1000", "5000", "10000", "30000", "100000"].map((v) => (
              <option key={v} value={v}>
                {v === "0" ? "Todos" : `${nf(Number(v))}+`}
              </option>
            ))}
          </Select>
        </Campo>
      );
    case "cand": {
      const atual = B.candPorId.get(st.cand ?? "");
      const lista = SLUGS.flatMap((s) =>
        B.cargos[s].cargo.candidatos.map((x) => ({
          c: x,
          s,
          busca: `${x.nome} ${x.nomeCompleto} ${x.n} ${x.partido}`,
        })),
      );
      return (
        <Campo
          rotulo={`Candidato${atual ? `: ${atual.c.nome} (${NOME_CURTO[atual.slug]})` : ""}`}
          largo
        >
          <BuscaItem
            itens={lista}
            rotulo="Buscar candidato"
            placeholder="Nome ou número (ex.: tito, jeronimo, 13789)"
            busca={(x) => slugBusca(x.busca)}
            onEscolher={(x) => definir("cand", x.c.id)}
            render={(x) => (
              <>
                <b>{x.c.nome}</b>{" "}
                <span className="text-muted-foreground">
                  · {NOME_CURTO[x.s]} · {x.c.partido} {x.c.n} · {nf(x.c.votos)} votos
                </span>
              </>
            )}
          />
        </Campo>
      );
    }
    case "cand2": {
      const atual = B.candPorId.get(st.cand2 ?? "");
      const lista = SLUGS.flatMap((s) =>
        B.cargos[s].cargo.candidatos
          .filter((x) => x.id !== st.cand)
          .map((x) => ({
            c: x,
            s,
            busca: `${x.nome} ${x.nomeCompleto} ${x.n} ${x.partido}`,
          })),
      );
      return (
        <Campo
          rotulo={`Comparar com${atual ? `: ${atual.c.nome} (${NOME_CURTO[atual.slug]})` : ""}`}
          largo
        >
          <BuscaItem
            itens={lista}
            rotulo="Buscar segundo candidato"
            placeholder="Nome ou número do segundo candidato"
            busca={(x) => slugBusca(x.busca)}
            onEscolher={(x) => definir("cand2", x.c.id)}
            render={(x) => (
              <>
                <b>{x.c.nome}</b>{" "}
                <span className="text-muted-foreground">
                  · {NOME_CURTO[x.s]} · {x.c.partido} {x.c.n} · {nf(x.c.votos)} votos
                </span>
              </>
            )}
          />
        </Campo>
      );
    }
    case "mun": {
      const atual = B.muns[B.porTse.get(st.mun ?? "") ?? -1];
      return (
        <Campo rotulo={`Município${atual ? `: ${atual.nome}` : ""}`} largo>
          <BuscaItem
            itens={B.muns.map((m, i) => ({ m, i }))}
            rotulo="Buscar município"
            placeholder="Digite o nome da cidade"
            busca={(x) => B.buscaMun[x.i] ?? ""}
            onEscolher={(x) => definir("mun", x.m.tse)}
            render={(x) => (
              <>
                <b>{x.m.nome}</b> <span className="text-muted-foreground">· {x.m.ti}</span>
              </>
            )}
          />
        </Campo>
      );
    }
    case "muns": {
      const escolhidos = (st.muns ?? "").split(",").filter((t) => B.porTse.has(t));
      const salvar = (l: string[]) => definir("muns", l.join(","));
      return (
        <Campo rotulo={escolhidos.length ? `Municípios (${escolhidos.length})` : "Municípios: Bahia toda"} largo>
          <BuscaItem
            itens={B.muns.map((m, i) => ({ m, i })).filter((x) => !escolhidos.includes(x.m.tse))}
            rotulo="Adicionar município"
            placeholder="Digite uma cidade para adicionar"
            busca={(x) => B.buscaMun[x.i] ?? ""}
            onEscolher={(x) => salvar([...escolhidos, x.m.tse])}
            render={(x) => (
              <>
                <b>{x.m.nome}</b> <span className="text-muted-foreground">· {x.m.ti}</span>
              </>
            )}
          />
          {escolhidos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {escolhidos.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => salvar(escolhidos.filter((x) => x !== t))}
                  className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold hover:bg-card"
                  aria-label={`Remover ${B.muns[B.porTse.get(t) ?? -1]?.nome}`}
                >
                  {B.muns[B.porTse.get(t) ?? -1]?.nome} ×
                </button>
              ))}
              <button type="button" onClick={() => salvar([])} className="px-2 py-1 text-xs text-primary underline">
                Bahia toda
              </button>
            </div>
          )}
        </Campo>
      );
    }
    case "med":
      return (
        <Campo rotulo="Mostrar nas colunas">
          <Select value={st.med ?? "votos"} onChange={(v) => definir("med", v)}>
            <option value="votos">Quantidade de votos</option>
            <option value="pct">Percentual dos válidos</option>
          </Select>
        </Campo>
      );
    case "cands": {
      const escolhidos = (st.cands ?? "").split(",").filter((id) => B.candPorId.has(id));
      const salvar = (l: string[]) => definir("cands", l.join(","));
      const lista = SLUGS.flatMap((s) =>
        B.cargos[s].cargo.candidatos
          .filter((x) => !escolhidos.includes(x.id))
          .map((x) => ({ c: x, s, busca: `${x.nome} ${x.nomeCompleto} ${x.n} ${x.partido} ${NOME_CURTO[s]}` })),
      );
      return (
        <Campo rotulo={escolhidos.length ? `Candidatos (${escolhidos.length})` : "Candidatos: adicione vários"} largo>
          <BuscaItem
            itens={lista}
            rotulo="Adicionar candidato"
            placeholder="Nome, número ou partido (qualquer cargo)"
            busca={(x) => slugBusca(x.busca)}
            onEscolher={(x) => salvar([...escolhidos, x.c.id])}
            render={(x) => (
              <>
                <b>{x.c.nome}</b>{" "}
                <span className="text-muted-foreground">
                  · {NOME_CURTO[x.s]} · {x.c.partido} {x.c.n} · {nf(x.c.votos)} votos
                </span>
              </>
            )}
          />
          {escolhidos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {escolhidos.map((id) => {
                const x = B.candPorId.get(id)!;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => salvar(escolhidos.filter((y) => y !== id))}
                    className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold hover:bg-card"
                    aria-label={`Remover ${x.c.nome}`}
                  >
                    {x.c.nome} · {NOME_CURTO[x.slug]} ×
                  </button>
                );
              })}
              <button type="button" onClick={() => salvar([])} className="px-2 py-1 text-xs text-primary underline">
                Limpar
              </button>
            </div>
          )}
        </Campo>
      );
    }
    default:
      return null;
  }
}

// Cache do texto de busca sem acento (a lista de candidatos é recriada a cada render).
const cacheBusca = new Map<string, string>();
function slugBusca(s: string): string {
  let v = cacheBusca.get(s);
  if (v == null) {
    v = s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
    cacheBusca.set(s, v);
  }
  return v;
}
