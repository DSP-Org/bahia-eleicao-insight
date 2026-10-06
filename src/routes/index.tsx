import { createFileRoute, Link } from "@tanstack/react-router";
import { useMeta, useMunicipios, nf } from "@/lib/eleicoes";
import { Loading } from "@/components/ui-bits";
import logoUrl from "../assets/logo-barras.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Data5 Analytics — Eleições 2026 - BA | Resultados, mapas e relatórios" },
      { name: "description", content: "Plataforma de análise dos resultados das Eleições 2026 na Bahia: mapas por município, comparativo de candidatos, indicadores, relatórios em PDF e controle de planejamento de votos." },
      { property: "og:title", content: "Data5 Analytics — Eleições 2026 - BA" },
      { property: "og:description", content: "Resultados das Eleições 2026 na Bahia com mapas, comparativos, indicadores e relatórios em PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Vendas,
});

const PRODUTOS = [
  {
    to: "/painel" as const,
    emoji: "📊",
    titulo: "Painel de resultados",
    texto: "O resultado final do 1º turno de todos os cargos, pronto para consultar em segundos — presidente, governador, senador e deputados.",
  },
  {
    to: "/mapa" as const,
    emoji: "🗺️",
    titulo: "Mapa da Bahia, cidade por cidade",
    texto: "Quem venceu em cada um dos 417 municípios. Toque em qualquer cidade e veja os votos, os percentuais e o total de válidos.",
  },
  {
    to: "/candidato/50002536314" as const,
    emoji: "🎯",
    titulo: "Raio-x de cada candidato",
    texto: "A força de um candidato no mapa, os melhores e piores municípios e onde os votos estão concentrados.",
  },
  {
    to: "/comparar" as const,
    emoji: "⚖️",
    titulo: "Comparativo de candidatos",
    texto: "Até 4 candidatos lado a lado — no mesmo cargo ou em cargos diferentes — com mapa territorial e ranking de vantagens.",
  },
  {
    to: "/relatorios" as const,
    emoji: "📄",
    titulo: "Relatórios em PDF e CSV",
    texto: "Tabelas por município, por região, comparecimento e concentração de votos, com identidade visual profissional para apresentar.",
  },
  {
    to: "/indicadores" as const,
    emoji: "🧮",
    titulo: "Indicadores que respondem",
    texto: "Dezenas de cartões com eleitorado, comparecimento, disputas apertadas e força por região — recalculados para qualquer recorte.",
  },
  {
    to: "/meta-x-urna" as const,
    emoji: "🧭",
    titulo: "Meta x Urna (planejamento)",
    texto: "Envie a planilha de metas de votos e veja, cidade por cidade, onde o planejamento foi superado, onde faltou e onde vieram votos sem meta.",
  },
  {
    to: "/painel" as const,
    emoji: "📱",
    titulo: "Instala como app no celular",
    texto: "O sistema instala na tela inicial do celular e abre em tela cheia, feito para consulta rápida em qualquer lugar.",
  },
];

function Vendas() {
  const { data: meta } = useMeta();
  const { data: muns } = useMunicipios();

  const eleitores = meta?.cargos[1]?.resumo.eleitores;
  const candidatos = meta ? meta.cargos.reduce((s, c) => s + c.candidatos.length, 0) : undefined;

  return (
    <div className="-mx-4 -my-6 md:-mx-6 md:-my-8">
      {/* Hero */}
      <section className="border-b border-border bg-card px-4 py-10 md:px-6 md:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Data5 Analytics apresenta</p>
              <h1 className="font-display mt-3 break-words text-4xl font-black leading-tight sm:text-5xl md:text-6xl">
                Eleições 2026 - BA
              </h1>
              <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
                Tudo o que aconteceu no 1º turno na Bahia, analisado e organizado: resultado final de todos os
                cargos nos <b className="text-foreground">417 municípios</b>, mapas, comparativos, indicadores e
                relatórios prontos para apresentar.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/painel" className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
                  Abrir o painel de resultados →
                </Link>
                <Link to="/mapa" className="inline-flex items-center gap-2 rounded-md border border-foreground px-5 py-3 text-sm font-medium hover:bg-foreground hover:text-background">
                  Ver o mapa da Bahia
                </Link>
              </div>
              <p className="mt-4 font-mono text-xs text-muted-foreground">
                Fonte oficial: TSE · Resultado final do 1º turno · 04/10/2026
              </p>
            </div>
            <div className="mx-auto w-full max-w-sm">
              <img src={logoUrl} alt="Data5 Analytics" className="w-full rounded-md border border-border bg-background p-4" width={1280} height={640} loading="eager" />
            </div>
          </div>

          {/* Números reais */}
          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Municípios cobertos", value: muns ? nf(muns.length) : "417" },
              { label: "Eleitores na Bahia", value: eleitores ? nf(eleitores) : "—" },
              { label: "Cargos analisados", value: meta ? String(meta.cargos.length) : "5" },
              { label: "Candidatos no ar", value: candidatos ? nf(candidatos) : "—" },
            ].map((s) => (
              <div key={s.label} className="border-l-2 border-primary bg-background px-4 py-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
                <div className="font-mono text-xl font-semibold md:text-2xl">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Produtos */}
      <section className="px-4 py-10 md:px-6 md:py-14">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display break-words text-2xl font-black sm:text-3xl">Um sistema, sete ferramentas de análise</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Cada aba foi feita para responder uma pergunta diferente sobre a eleição. Tudo funciona no celular,
            com busca ao digitar e exportação em CSV e PDF.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PRODUTOS.map((p, i) => (
              <Link key={p.titulo} to={p.to}
                className={`group flex min-w-0 flex-col rounded-md border border-border bg-card p-5 transition hover:border-primary ${i === PRODUTOS.length - 1 ? "sm:col-span-2 lg:col-span-1" : ""}`}>
                <span className="text-2xl" aria-hidden>{p.emoji}</span>
                <h3 className="font-display mt-3 break-words text-lg font-bold group-hover:text-primary">{p.titulo}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.texto}</p>
                <span className="mt-3 font-mono text-xs uppercase tracking-wider text-primary">Abrir →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Para quem */}
      <section className="border-y border-border bg-card px-4 py-10 md:px-6 md:py-14">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3">
          {[
            {
              t: "Para mandatos e partidos",
              d: "Entenda onde o candidato foi forte, onde perdeu espaço e como cada município se comportou — com recortes por região, território e cidade.",
            },
            {
              t: "Para imprensa e consultoria",
              d: "Números oficiais do TSE prontos para virar matéria, gráfico ou apresentação, com relatórios em PDF com a sua marca.",
            },
            {
              t: "Para planejar a próxima",
              d: "Meta x Urna compara o que foi planejado com o que aconteceu na urna, cidade por cidade, e mostra onde avançar.",
            },
          ].map((c) => (
            <div key={c.t} className="min-w-0">
              <h3 className="font-display break-words text-lg font-bold">{c.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="px-4 py-12 text-center md:py-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-display break-words text-2xl font-black sm:text-3xl">Pronto para explorar o resultado?</h2>
          <p className="mt-2 text-muted-foreground">
            Acesso livre e imediato — sem cadastro. Instale no celular para ter sempre à mão.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/painel" className="inline-flex rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
              Entrar no sistema →
            </Link>
            <Link to="/indicadores" className="inline-flex rounded-md border border-foreground px-6 py-3 text-sm font-medium hover:bg-foreground hover:text-background">
              Ver indicadores
            </Link>
          </div>
        </div>
      </section>
      {!meta && <Loading />}
    </div>
  );
}
