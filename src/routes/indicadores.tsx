import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowUpRight, Search, Users, Vote, Trophy, MapPin, UserRound, LayoutGrid, type LucideIcon } from "lucide-react";
import { CARGOS, slugify, type Meta, type Municipio, type MunData } from "@/lib/eleicoes";
import { criarIndicadores, recortarCargo, type GrupoIndicador, type TipoRecorte } from "@/lib/indicadores";
import { PageHead, Select } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { BuscaItem } from "@/components/relatorios/BuscaItem";

const fetchSnapshot = createIsomorphicFn()
  .server(async (path: string) => {
    const { getRequestUrl } = await import("@tanstack/react-start/server");
    const response = await fetch(new URL(path, getRequestUrl()));
    if (!response.ok) throw new Error("Não foi possível carregar os indicadores.");
    return response.json();
  })
  .client(async (path: string) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error("Não foi possível carregar os indicadores.");
    return response.json();
  });

const options = <T,>(key: string[], path: string) => ({
  queryKey: key,
  queryFn: (): Promise<T> => fetchSnapshot(path),
  staleTime: Infinity,
});
const metaOptions = options<Meta>(["meta"], "/data/meta.json");
const municipiosOptions = options<Municipio[]>(["municipios"], "/data/municipios.json");
const dadosOptions = options<Record<string, MunData>>(["indicadores", "dados"], "/data/mun-governador.json");
// All office snapshots are loaded together so changing offices never shows partial municipal metrics.
dadosOptions.queryFn = async () => Object.fromEntries(await Promise.all(CARGOS.map(async ({ slug }) => {
  return [slug, await fetchSnapshot(`/data/mun-${slug}.json`) as MunData];
})));

export const Route = createFileRoute("/indicadores")({
  head: () => ({ meta: [
    { title: "Indicadores — Data5 Analytics | Eleições 2026 - BA" },
    { name: "description", content: "Indicadores dos resultados eleitorais da Bahia: participação, votos, candidatos, partidos e desempenho municipal em cartões de leitura rápida." },
    { property: "og:title", content: "Indicadores — Data5 Analytics | Eleições 2026 - BA" },
    { property: "og:description", content: "Retrato das Eleições 2026 - BA em indicadores de eleitorado, votação e força territorial." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.ensureQueryData(metaOptions), context.queryClient.ensureQueryData(municipiosOptions), context.queryClient.ensureQueryData(dadosOptions)]);
  },
  component: Indicadores,
});

const grupos: { id: "todos" | GrupoIndicador; label: string; icon: LucideIcon }[] = [
  { id: "todos", label: "Todos", icon: LayoutGrid },
  { id: "participacao", label: "Participação", icon: Users },
  { id: "votos", label: "Votos", icon: Vote },
  { id: "disputa", label: "Disputa", icon: Trophy },
  { id: "territorio", label: "Municípios", icon: MapPin },
  { id: "candidato", label: "Candidato", icon: UserRound },
];
const cores: Record<GrupoIndicador, string> = {
  participacao: "text-chart-2 border-t-chart-2",
  votos: "text-primary border-t-primary",
  disputa: "text-chart-4 border-t-chart-4",
  territorio: "text-chart-3 border-t-chart-3",
  candidato: "text-foreground border-t-foreground",
};

function Indicadores() {
  const { data: meta } = useSuspenseQuery(metaOptions);
  const { data: municipios } = useSuspenseQuery(municipiosOptions);
  const { data: dados } = useSuspenseQuery(dadosOptions);
  const [slug, setSlug] = useState("governador");
  const [candidatoId, setCandidatoId] = useState("");
  const [grupo, setGrupo] = useState<"todos" | GrupoIndicador>("todos");
  const [busca, setBusca] = useState("");
  const [recorte, setRecorte] = useState("ba");
  const recortes = useMemo(() => [
    { v: "ba", nome: "Bahia inteira", grupo: "" },
    ...[...new Set(municipios.map((m) => m.ri).filter(Boolean) as string[])].sort().map((n) => ({ v: `ri:${n}`, nome: n, grupo: "Região intermediária" })),
    ...[...new Set(municipios.map((m) => m.rim).filter(Boolean) as string[])].sort().map((n) => ({ v: `rim:${n}`, nome: n, grupo: "Região imediata" })),
    ...[...new Set(municipios.map((m) => m.ti).filter(Boolean) as string[])].sort().map((n) => ({ v: `ti:${n}`, nome: n, grupo: "Território de identidade" })),
    ...municipios.map((m) => ({ v: `mun:${m.tse}`, nome: m.nome, grupo: "Município" })),
  ], [municipios]);
  const recorteAtual = recortes.find((r) => r.v === recorte) ?? recortes[0];
  const munsRecorte = useMemo(() => {
    if (recorte === "ba") return municipios;
    const [tipo, ...resto] = recorte.split(":"); const valor = resto.join(":");
    return municipios.filter((m) => tipo === "mun" ? m.tse === valor : (m as Record<string, unknown>)[tipo] === valor);
  }, [recorte, municipios]);
  const cargoBase = meta.cargos.find((c) => c.slug === slug) ?? meta.cargos[0];
  const cargo = useMemo(() => cargoBase && recorte !== "ba" ? recortarCargo(cargoBase, munsRecorte, dados[cargoBase.slug] ?? {}) : cargoBase, [cargoBase, recorte, munsRecorte, dados]);
  // Default raio-x candidate is the most voted inside the current cut, not the first listed.
  const candidato = cargo?.candidatos.find((c) => c.id === candidatoId) ?? (cargo ? [...cargo.candidatos].sort((a, b) => b.votos - a.votos)[0] : undefined);
  const tipoRecorte = (recorte === "ba" ? "ba" : recorte.split(":")[0]) as TipoRecorte;
  const secoes = useMemo(() => cargo ? criarIndicadores(cargo, munsRecorte, dados[cargo.slug] ?? {}, candidato?.id ?? "", tipoRecorte) : [], [cargo, munsRecorte, dados, candidato, tipoRecorte]);
  const totalCards = secoes.reduce((t, s) => t + s.cards.length, 0);
  // Text search only helps when there are many cards to scan.
  const mostraBusca = totalCards > 12;
  const termo = mostraBusca ? slugify(busca.trim()) : "";
  const filtradas = secoes.map((s) => ({ ...s, cards: s.cards.filter((c) => slugify(`${c.label} ${c.value} ${c.detail}`).includes(termo)) })).filter((s) => s.cards.length);
  const contagem = (id: "todos" | GrupoIndicador) => filtradas.filter((s) => id === "todos" || s.id === id).reduce((t, s) => t + s.cards.length, 0);
  // Only categories that actually contain cards are offered; a filter that changes nothing is hidden.
  const gruposUteis = grupos.filter((g) => contagem(g.id) > 0);
  const grupoAtivo = gruposUteis.some((g) => g.id === grupo) ? grupo : "todos";
  const visiveis = filtradas.filter((s) => grupoAtivo === "todos" || grupoAtivo === s.id);
  const quantidade = visiveis.reduce((total, secao) => total + secao.cards.length, 0);
  // The candidate picker only affects the raio-x, so it appears only on the Candidato tab (Todos shows the leader).
  const mostraCandidato = grupoAtivo === "candidato" && visiveis.some((s) => s.id === "candidato");
  if (!cargo) return <p>Nenhum resultado disponível.</p>;

  return (
    <div>
      <PageHead kicker="Bahia · Resultado do 1º turno" title="Indicadores">
        <span>Participação, votos e força territorial · Eleições 2026 - BA</span>
      </PageHead>

      <div className={`mb-5 grid gap-4 border-b border-border pb-5 sm:grid-cols-2 ${mostraCandidato ? "lg:grid-cols-[180px_repeat(3,minmax(0,1fr))]" : "lg:grid-cols-[180px_repeat(2,minmax(0,1fr))]"}`}>
        <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-muted-foreground">Cargo
          <Select value={slug} onChange={(value) => { setSlug(value); setCandidatoId(""); }} className="min-h-11 w-full">
            {CARGOS.map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
          </Select>
        </label>
        <div className="grid min-w-0 gap-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Recorte</p>
          <BuscaItem itens={recortes} busca={(i) => slugify(`${i.nome} ${i.grupo}`)} render={(i) => <span><b>{i.nome}</b>{i.grupo && <span className="text-muted-foreground"> · {i.grupo}</span>}</span>} onEscolher={(i) => setRecorte(i.v)} placeholder="Região, território ou município…" rotulo="Buscar recorte dos indicadores" selecionado={recorteAtual} chip={(i) => <span>{i.nome}{i.grupo && <span className="text-muted-foreground"> · {i.grupo}</span>}</span>} {...(recorte !== "ba" ? { onLimpar: () => setRecorte("ba") } : {})} rotuloLimpar="Voltar para Bahia inteira" />
        </div>
        {mostraCandidato && <div className="grid min-w-0 gap-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Candidato do raio-x</p>
          <BuscaItem key={slug} itens={cargo.candidatos} busca={(c) => slugify(`${c.nome} ${c.partido} ${c.n}`)} render={(c) => <span>{c.nome} · {c.partido}{recorte !== "ba" && <span className="text-muted-foreground"> · {c.votos.toLocaleString("pt-BR")} votos</span>}</span>} onEscolher={(c) => setCandidatoId(c.id)} placeholder="Nome, partido ou número…" rotulo="Buscar candidato dos indicadores" selecionado={candidato ?? null} />
        </div>}
        <label className={`grid min-w-0 gap-1.5 ${mostraCandidato ? "" : "sm:col-span-2 lg:col-span-1"}`}>
          <span className="text-xs font-semibold text-muted-foreground">Buscar indicador</span>
          <div className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-input bg-background px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Abstenção, nulos, liderança…" aria-label="Buscar indicador" className="min-w-0 w-full bg-transparent py-2 text-sm outline-none" />
            {busca && <button type="button" onClick={() => setBusca("")} className="shrink-0 text-xs text-muted-foreground underline" aria-label="Limpar busca">Limpar</button>}
          </div>
        </label>
      </div>

      {gruposUteis.length > 2 && <div className="mb-6 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Categorias de indicadores">
        {gruposUteis.map(({ id, label, icon: Icon }) => <Button key={id} variant={grupoAtivo === id ? "default" : "outline"} aria-pressed={grupoAtivo === id} onClick={() => setGrupo(id)} className="h-11 min-w-0 gap-1.5 px-2 text-xs sm:px-3 sm:text-sm"><Icon aria-hidden="true" />{label}<span className="font-mono text-[0.7em] opacity-70">{contagem(id)}</span></Button>)}
      </div>}

      <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0"><p className="font-display text-xl font-bold">{cargo.nome}</p><p className="text-xs text-muted-foreground">{recorteAtual.nome}{recorte !== "ba" && ` · ${munsRecorte.length} município${munsRecorte.length > 1 ? "s" : ""}`} · 04 de outubro de 2026</p></div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{quantidade} indicadores</span>
      </div>
      {cargo.slug === "senador" && <p className="mb-6 border-l-2 border-chart-2 pl-3 text-sm text-muted-foreground">Senado: cada eleitor pôde votar em dois candidatos. Percentuais de votação usam o total de votos válidos, não o número de pessoas.</p>}

      <div className="space-y-8">
        {visiveis.map((secao, index) => {
          const Icon = grupos.find((g) => g.id === secao.id)?.icon ?? LayoutGrid;
          return <section key={secao.id} aria-labelledby={`secao-${secao.id}`}>
            <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 border-b border-border pb-3">
              <div className="min-w-0"><h2 id={`secao-${secao.id}`} className="flex items-center gap-2 font-display text-lg font-bold"><Icon className={`size-4 shrink-0 ${cores[secao.id]}`} aria-hidden="true" />{secao.title}</h2>{secao.id === "candidato" && candidato && <p className="mt-1 break-words text-sm text-muted-foreground">{candidato.nome} · {candidato.partido}</p>}</div>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
            </div>
            <div className="grid grid-cols-2 items-stretch gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-4">
              {secao.cards.map((card) => <article key={card.label} className={`@container flex min-h-36 min-w-0 flex-col rounded-md border border-border border-t-2 bg-card p-3 sm:p-4 ${cores[secao.id]}`}>
                <h3 className="min-h-9 text-xs font-medium leading-snug text-muted-foreground">{card.label}</h3>
                <p className={card.textual ? "mt-2 break-words font-sans text-base font-semibold leading-tight text-foreground" : "mt-2 whitespace-nowrap font-mono text-[min(1.5rem,15cqw)] font-semibold leading-tight text-foreground"}>{card.value}</p>
                <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">{card.detail}</p>
              </article>)}
            </div>
          </section>;
        })}
      </div>
      {!quantidade && <p className="py-12 text-center text-muted-foreground">Nenhum indicador encontrado.</p>}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
        <p>Fonte: TSE / IBGE · Números recalculados para o recorte e o cargo selecionados.</p>
        <Button asChild variant="link" size="sm"><Link to="/cargo/$cargo" params={{ cargo: cargo.slug }}>Resultado completo<ArrowUpRight /></Link></Button>
      </div>
    </div>
  );
}