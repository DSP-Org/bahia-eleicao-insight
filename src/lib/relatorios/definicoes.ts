// Catálogo de relatórios. Cada um declara seus filtros e gera uma lista de blocos a partir da Base.
import type { Candidato } from "@/lib/eleicoes";
import { downloadCSV, slugify } from "@/lib/eleicoes";
import {
  E,
  NOME_CURTO,
  PROPORCIONAIS,
  REGIOES,
  SLUGS,
  ehRegiao,
  ehSlug,
  munsDoRecorte,
  nomesRegioes,
  posicaoNoMunicipio,
  rankPorMunicipio,
  rankingRecorte,
  razao,
  recorteNome,
  recorteSet,
  statsRecorte,
  textoSituacao,
  tipoSituacao,
  type Base,
  type ChaveRegiao,
  type DadosCargo,
  type RefCand,
  type Slug,
} from "./base";
import type { Bloco, BlocoTabela, Celula, Coluna, ValorCand, ValorMun, ValorSit } from "./blocos";
import { fmtPct } from "./blocos";

export type Estado = {
  r?: string;
  cargo?: string;
  escopo?: string;
  agrupar?: string;
  reg?: string;
  partido?: string;
  pn?: string;
  sit?: string;
  cand?: string;
  cand2?: string;
  mun?: string;
  muns?: string; // códigos TSE separados por vírgula; vazio = Bahia toda
  agr?: string;
  cargob?: string;
  min?: string;
  cands?: string; // ids separados por vírgula
  med?: string; // votos | pct
  loc?: string; // código TSE de município com dados por urna
  agl?: string; // com, local ou secao
};
export type Controle =
  | "cargo"
  | "cargoprop"
  | "escopo"
  | "agrupar"
  | "reg"
  | "partido"
  | "pn"
  | "sit"
  | "cand"
  | "cand2"
  | "mun"
  | "muns"
  | "agr"
  | "cargob"
  | "min"
  | "cands"
  | "med"
  | "loc"
  | "agl";

export type Relatorio = {
  id: string;
  grupo: string;
  titulo: string;
  desc: string;
  controles: Controle[];
  padrao: Estado;
  gerar: (B: Base, st: Estado) => Bloco[];
};

// ------------------------------------------------------------------ apoio

const nf = (n: number) => n.toLocaleString("pt-BR");
const col = (titulo: string, tipo: Coluna["tipo"], extra: Partial<Coluna> = {}): Coluna => ({
  titulo,
  tipo,
  ...extra,
});
const arquivo = (...partes: (string | undefined)[]) =>
  slugify(partes.filter(Boolean).join("-"))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const slugDe = (st: Estado, padrao: Slug = "deputado-estadual"): Slug =>
  ehSlug(st.cargo) ? st.cargo : padrao;
const cargoProp = (st: Estado): Slug =>
  st.cargo === "deputado-federal" ? "deputado-federal" : "deputado-estadual";

function vCand(c: Candidato, slug?: Slug): ValorCand {
  return {
    nome: c.nome,
    sub: `${c.n} · ${c.partido}${slug ? ` · ${NOME_CURTO[slug]}` : ""}`,
    id: c.id,
  };
}
const vSit = (c: Candidato): ValorSit => ({
  texto: textoSituacao(c),
  tipo: tipoSituacao(c),
  proj: !!c.proj,
});
const vMun = (B: Base, mi: number): ValorMun => ({
  nome: B.muns[mi]?.nome ?? "",
  tse: B.muns[mi]?.tse ?? "",
});
const rotuloCand = (c: Candidato) => `${c.nome} (${c.partido})`;

export function candidatoPadrao(B: Base): string {
  return B.cargos["deputado-estadual"].cargo.candidatos[0]?.id ?? "";
}
export function municipioPadrao(B: Base): string {
  return B.muns.find((m) => m.nome === "SALVADOR")?.tse ?? B.muns[0]?.tse ?? "";
}

export function avisosCargo(B: Base, d: DadosCargo): Bloco[] {
  const out: Bloco[] = [];
  const parc = d.cargo.parciais ?? [];
  if (parc.length) {
    out.push({
      tipo: "aviso",
      texto: `Os arquivos municipais do TSE para ${d.cargo.nome} estão com apuração parcial em ${parc.map((p) => `${p.municipio} (${fmtPct(p.pst, 1)})`).join(", ")}. O total da Bahia é o oficial; os números por município nessas cidades estão incompletos.`,
    });
  }
  if (d.proporcional && d.cargo.totalizacaoFinal === false) {
    const v = B.meta.validacao?.projecaoFederal;
    out.push({
      tipo: "aviso",
      texto: `A situação dos candidatos a ${d.cargo.nome} é uma projeção: o TSE já distribuiu as vagas por partido e federação, mas ainda não publicou a lista de eleitos. A ordem segue os votos de cada candidato (empate: o mais idoso).${v ? ` O método foi conferido no Dep. Federal, que já é oficial: ${v.coincidentes} de ${v.oficiais} eleitos coincidem.` : ""}`,
    });
  }
  return out;
}

type Grupo = { nome: string; mi: number | null; n: number; s: number[] };

// Agrupa os municípios do recorte por região (ou mantém um por linha) somando as estatísticas do cargo.
function agrupar(B: Base, set: Set<number> | null, chave: string, d: DadosCargo): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const mi of munsDoRecorte(B, set)) {
    const m = B.muns[mi];
    if (!m) continue;
    const nome = ehRegiao(chave) ? (m[chave] ?? "") : m.tse;
    let g = grupos.get(nome);
    if (!g)
      grupos.set(
        nome,
        (g = {
          nome: ehRegiao(chave) ? nome : m.nome,
          mi: ehRegiao(chave) ? null : mi,
          n: 0,
          s: [0, 0, 0, 0, 0, 0, 0, 0],
        }),
      );
    g.n++;
    d.stats[mi]?.forEach((x, k) => {
      g.s[k] = (g.s[k] ?? 0) + x;
    });
  }
  return [...grupos.values()];
}

function colunaUnidade(B: Base, chave: string): Coluna[] {
  return ehRegiao(chave)
    ? [col(REGIOES[chave].split(" (")[0] ?? "Região", "texto"), col("Municípios", "int")]
    : [col("Município", "mun"), col("Território", "texto")];
}
function celulasUnidade(B: Base, g: Grupo): Celula[] {
  return g.mi == null ? [g.nome, g.n] : [vMun(B, g.mi), B.muns[g.mi]?.ti ?? ""];
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i] as number;
    my += ys[i] as number;
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - mx;
    const dy = (ys[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

function mapaVotos(flat: number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (let i = 0; i < flat.length; i += 2) m.set(flat[i] as number, flat[i + 1] as number);
  return m;
}

// ------------------------------------------------------------------ relatórios

export const RELATORIOS: Relatorio[] = [];
const add = (r: Relatorio) => {
  RELATORIOS.push(r);
};

// ---------- Visão geral

add({
  id: "resumo",
  grupo: "Visão geral",
  titulo: "Resumo da eleição",
  desc: "Participação, votos válidos, brancos, nulos e quem lidera cada cargo no recorte escolhido.",
  controles: ["escopo"],
  padrao: { escopo: "ba" },
  gerar(B, st) {
    const set = recorteSet(st.escopo, B);
    const g = statsRecorte(B.cargos.governador, set);
    const lider = (l?: { ref: { c: Candidato }; p: number }) =>
      l ? `${rotuloCand(l.ref.c)} ${fmtPct(l.p, 1)}` : "–";
    const linhas: Celula[][] = SLUGS.map((slug) => {
      const d = B.cargos[slug];
      const s = statsRecorte(d, set);
      const tv = s[E.tv] ?? 0;
      const { linhas: rk } = rankingRecorte(B, d, set);
      return [
        d.cargo.nome,
        s[E.vv] ?? 0,
        razao(s[E.vv] ?? 0, tv),
        razao(s[E.vb] ?? 0, tv),
        razao(s[E.vn] ?? 0, tv),
        d.proporcional ? razao(s[E.leg] ?? 0, s[E.vv] ?? 0) : null,
        d.cargo.vagas,
        lider(rk[0]),
        lider(rk[1]),
      ];
    });
    return [
      {
        tipo: "numeros",
        itens: [
          { rotulo: "Municípios", valor: nf(munsDoRecorte(B, set).length) },
          { rotulo: "Eleitorado", valor: nf(g[E.el] ?? 0) },
          {
            rotulo: "Comparecimento",
            valor: fmtPct(razao(g[E.co] ?? 0, g[E.el] ?? 0), 1),
            sub: `${nf(g[E.co] ?? 0)} eleitores`,
          },
          {
            rotulo: "Abstenção",
            valor: fmtPct(razao(g[E.ab] ?? 0, g[E.el] ?? 0), 1),
            sub: `${nf(g[E.ab] ?? 0)} eleitores`,
          },
        ],
      },
      {
        tipo: "tabela",
        titulo: "Por cargo",
        arquivo: arquivo("resumo", recorteNome(st.escopo, B)),
        linhas,
        colunas: [
          col("Cargo", "texto"),
          col("Votos válidos", "int"),
          col("% válidos", "pct", { casas: 1 }),
          col("% brancos", "pct", { casas: 1 }),
          col("% nulos", "pct", { casas: 1 }),
          col("Legenda (% válidos)", "pct", { casas: 1 }),
          col("Vagas", "int"),
          col("1º no recorte", "texto"),
          col("2º no recorte", "texto"),
        ],
      },
      {
        tipo: "nota",
        texto:
          "Válidos, brancos e nulos são calculados sobre o total de votos do cargo (no Senador, cada eleitor votou duas vezes). Legenda é o voto dado só ao partido.",
      },
    ];
  },
});

add({
  id: "abst",
  grupo: "Visão geral",
  titulo: "Comparecimento e abstenção",
  desc: "Quanto do eleitorado foi votar, com brancos e nulos do cargo escolhido, por município ou agrupado por região.",
  controles: ["cargo", "escopo", "agrupar"],
  padrao: { cargo: "governador", escopo: "ba", agrupar: "mun" },
  gerar(B, st) {
    const d = B.cargos[slugDe(st, "governador")];
    const set = recorteSet(st.escopo, B);
    const s = statsRecorte(d, set);
    const chave = st.agrupar ?? "mun";
    const linhas = agrupar(B, set, chave, d).map((g): Celula[] => [
      ...celulasUnidade(B, g),
      g.s[E.el] ?? 0,
      g.s[E.co] ?? 0,
      razao(g.s[E.co] ?? 0, g.s[E.el] ?? 0),
      razao(g.s[E.ab] ?? 0, g.s[E.el] ?? 0),
      razao(g.s[E.vb] ?? 0, g.s[E.tv] ?? 0),
      razao(g.s[E.vn] ?? 0, g.s[E.tv] ?? 0),
    ]);
    return [
      {
        tipo: "numeros",
        itens: [
          { rotulo: "Eleitorado", valor: nf(s[E.el] ?? 0) },
          {
            rotulo: "Comparecimento",
            valor: fmtPct(razao(s[E.co] ?? 0, s[E.el] ?? 0), 1),
            sub: nf(s[E.co] ?? 0),
          },
          {
            rotulo: "Abstenção",
            valor: fmtPct(razao(s[E.ab] ?? 0, s[E.el] ?? 0), 1),
            sub: nf(s[E.ab] ?? 0),
          },
        ],
      },
      {
        tipo: "tabela",
        titulo: ehRegiao(chave) ? `Por ${REGIOES[chave]}` : "Por município",
        arquivo: arquivo("comparecimento", recorteNome(st.escopo, B), chave),
        busca: true,
        ordem: [5, true],
        linhas,
        colunas: [
          ...colunaUnidade(B, chave),
          col("Eleitores", "int"),
          col("Comparecimento", "int"),
          col("% comparec.", "pct", { casas: 1 }),
          col("% abstenção", "pct", { casas: 1, barra: true }),
          col(`% brancos (${NOME_CURTO[d.slug]})`, "pct", { casas: 1 }),
          col(`% nulos (${NOME_CURTO[d.slug]})`, "pct", { casas: 1 }),
        ],
      },
    ];
  },
});

add({
  id: "brancos",
  grupo: "Visão geral",
  titulo: "Brancos, nulos e legenda",
  desc: "Votos brancos e nulos sobre o total de votos e, nos cargos proporcionais, o voto só no partido (legenda).",
  controles: ["cargo", "escopo", "agrupar"],
  padrao: { cargo: "deputado-estadual", escopo: "ba", agrupar: "mun" },
  gerar(B, st) {
    const d = B.cargos[slugDe(st)];
    const set = recorteSet(st.escopo, B);
    const s = statsRecorte(d, set);
    const tv = s[E.tv] ?? 0;
    const chave = st.agrupar ?? "mun";
    const linhas = agrupar(B, set, chave, d).map((g): Celula[] => {
      const t = g.s[E.tv] ?? 0;
      return [
        ...celulasUnidade(B, g),
        t,
        razao(g.s[E.vv] ?? 0, t),
        g.s[E.vb] ?? 0,
        razao(g.s[E.vb] ?? 0, t),
        g.s[E.vn] ?? 0,
        razao(g.s[E.vn] ?? 0, t),
        razao((g.s[E.vb] ?? 0) + (g.s[E.vn] ?? 0), t),
        ...(d.proporcional ? [g.s[E.leg] ?? 0, razao(g.s[E.leg] ?? 0, g.s[E.vv] ?? 0)] : []),
      ];
    });
    return [
      {
        tipo: "numeros",
        itens: [
          {
            rotulo: "Votos válidos",
            valor: nf(s[E.vv] ?? 0),
            sub: fmtPct(razao(s[E.vv] ?? 0, tv), 1),
          },
          { rotulo: "Brancos", valor: nf(s[E.vb] ?? 0), sub: fmtPct(razao(s[E.vb] ?? 0, tv), 1) },
          { rotulo: "Nulos", valor: nf(s[E.vn] ?? 0), sub: fmtPct(razao(s[E.vn] ?? 0, tv), 1) },
          ...(d.proporcional
            ? [
                {
                  rotulo: "Legenda",
                  valor: nf(s[E.leg] ?? 0),
                  sub: `${fmtPct(razao(s[E.leg] ?? 0, s[E.vv] ?? 0), 1)} dos válidos`,
                },
              ]
            : []),
        ],
      },
      {
        tipo: "tabela",
        titulo: `${d.cargo.nome}: ${ehRegiao(chave) ? `por ${REGIOES[chave]}` : "por município"}`,
        arquivo: arquivo("brancos-nulos", d.slug, recorteNome(st.escopo, B)),
        busca: true,
        ordem: [8, true],
        linhas,
        colunas: [
          ...colunaUnidade(B, chave),
          col("Total de votos", "int"),
          col("% válidos", "pct", { casas: 1 }),
          col("Brancos", "int"),
          col("% brancos", "pct", { casas: 1 }),
          col("Nulos", "int"),
          col("% nulos", "pct", { casas: 1 }),
          col("Brancos + nulos", "pct", { casas: 1, barra: true }),
          ...(d.proporcional
            ? [col("Legenda", "int"), col("Legenda (% válidos)", "pct", { casas: 1 })]
            : []),
        ],
      },
    ];
  },
});

// ---------- Candidatos

add({
  id: "ranking",
  grupo: "Candidatos",
  titulo: "Ranking de candidatos",
  desc: "Votação de cada candidato no recorte escolhido: Bahia, território, região ou um município.",
  controles: ["cargo", "escopo", "partido", "sit"],
  padrao: { cargo: "deputado-estadual", escopo: "ba" },
  gerar(B, st) {
    const d = B.cargos[slugDe(st)];
    const set = recorteSet(st.escopo, B);
    const { linhas: todas, validos } = rankingRecorte(B, d, set);
    const lst = todas.filter(
      (l) =>
        (l.v > 0 || !set) &&
        (!st.partido || l.ref.c.partido === st.partido) &&
        (!st.sit || tipoSituacao(l.ref.c) === st.sit),
    );
    const soma = lst.reduce((a, l) => a + l.v, 0);
    return [
      ...avisosCargo(B, d),
      {
        tipo: "numeros",
        itens: [
          { rotulo: "Candidatos listados", valor: nf(lst.length) },
          {
            rotulo: "Votos somados",
            valor: nf(soma),
            sub: `${fmtPct(razao(soma, validos), 1)} dos válidos do recorte`,
          },
          { rotulo: "Votos válidos no recorte", valor: nf(validos) },
        ],
      },
      {
        tipo: "tabela",
        titulo: `${d.cargo.nome} · ${recorteNome(st.escopo, B)}`,
        arquivo: arquivo("ranking", d.slug, recorteNome(st.escopo, B), st.partido),
        busca: true,
        ordem: [0, false],
        linhas: lst.map((l) => [
          l.pos,
          vCand(l.ref.c),
          l.ref.c.partido,
          l.v,
          l.p,
          l.nc,
          l.red >= 0 ? `${B.muns[l.red]?.nome} (${nf(l.redV)})` : "–",
          vSit(l.ref.c),
        ]),
        colunas: [
          col("Pos.", "pos"),
          col("Candidato", "cand"),
          col("Partido", "texto"),
          col("Votos", "int", { barra: true }),
          col("% válidos", "pct"),
          col("Cidades c/ voto", "int"),
          col("Reduto no recorte", "texto"),
          col(set ? "Situação (estado)" : "Situação", "sit"),
        ],
      },
    ];
  },
});

add({
  id: "dossie",
  grupo: "Candidatos",
  titulo: "Dossiê do candidato",
  desc: "Tudo sobre um candidato: posição, concentração, desempenho por território e cidade a cidade.",
  controles: ["cand"],
  padrao: {},
  gerar(B, st) {
    const ref = B.candPorId.get(st.cand ?? "") ?? B.candPorId.get(candidatoPadrao(B));
    if (!ref) return [{ tipo: "aviso", texto: "Escolha um candidato." }];
    const { c, i, slug } = ref;
    const d = B.cargos[slug];
    const flat = d.votos[i] ?? [];
    const total = c.votos;
    type Cid = { mi: number; v: number; p: number; r: number | null; pt: number; acc: number };
    const cidades: Cid[] = [];
    for (let k = 0; k < flat.length; k += 2) {
      const mi = flat[k] as number;
      const v = flat[k + 1] as number;
      cidades.push({
        mi,
        v,
        p: razao(v, d.stats[mi]?.[E.vv] ?? 0),
        r: posicaoNoMunicipio(d, i, mi),
        pt: razao(v, total),
        acc: 0,
      });
    }
    cidades.sort((a, b) => b.v - a.v);
    let acc = 0;
    let n50 = 0;
    let n80 = 0;
    cidades.forEach((x, k) => {
      acc += x.v;
      x.acc = razao(acc, total);
      if (!n50 && x.acc >= 50) n50 = k + 1;
      if (!n80 && x.acc >= 80) n80 = k + 1;
    });
    const primeiro = cidades.filter((x) => x.r === 1).length;
    const top3 = cidades.filter((x) => (x.r ?? 99) <= 3).length;
    const posEstado = i + 1; // candidatos já vêm em ordem de votos

    // posição em cada território
    const porTi = new Map<string, Map<number, number>>();
    d.votos.forEach((f, ci) => {
      for (let k = 0; k < f.length; k += 2) {
        const ti = B.muns[f[k] as number]?.ti ?? "";
        let m = porTi.get(ti);
        if (!m) porTi.set(ti, (m = new Map()));
        m.set(ci, (m.get(ci) ?? 0) + (f[k + 1] as number));
      }
    });
    const territorios: Celula[][] = nomesRegioes("ti", B.muns).map((ti) => {
      const m = porTi.get(ti) ?? new Map<number, number>();
      const v = m.get(i) ?? 0;
      const validos = B.muns.reduce(
        (s, mu, mi) => (mu.ti === ti ? s + (d.stats[mi]?.[E.vv] ?? 0) : s),
        0,
      );
      let r = 1;
      for (const x of m.values()) if (x > v) r++;
      return [
        ti,
        cidades.filter((x) => B.muns[x.mi]?.ti === ti).length,
        v,
        razao(v, total),
        razao(v, validos),
        v ? r : null,
      ];
    });

    const blocos: Bloco[] = [
      {
        tipo: "destaque",
        kicker: `${d.cargo.nome} · ${c.partido} · nº ${c.n}`,
        titulo: c.nome,
        sub: `${c.nomeCompleto} · ${c.agr}`,
        sit: vSit(c),
        candidato: c.id,
      },
      ...avisosCargo(B, d),
      {
        tipo: "numeros",
        itens: [
          { rotulo: "Votos", valor: nf(total), sub: `${fmtPct(c.pct)} dos válidos da BA` },
          {
            rotulo: "Posição no estado",
            valor: `${posEstado}º`,
            sub: `de ${nf(d.cargo.candidatos.length)} em ${NOME_CURTO[slug]}`,
          },
          ...(d.proporcional && c.ordem
            ? [
                {
                  rotulo:
                    tipoSituacao(c) === "eleito" ? "Ordem entre os eleitos" : "Ordem de suplência",
                  valor: `${c.ordem}º`,
                  sub: c.agrCom,
                },
              ]
            : []),
          ...(d.proporcional && c.faltou != null
            ? [
                {
                  rotulo: "Faltaram",
                  valor: nf(c.faltou),
                  sub: "votos para o último eleito da agremiação",
                },
              ]
            : []),
          ...(d.proporcional && c.margem != null
            ? [{ rotulo: "Margem", valor: nf(c.margem), sub: "votos à frente do 1º suplente" }]
            : []),
          {
            rotulo: "Cidades com voto",
            valor: `${nf(cidades.length)} / ${B.muns.length}`,
            sub: fmtPct(razao(cidades.length, B.muns.length), 1),
          },
          { rotulo: "1º lugar em", valor: `${nf(primeiro)} cidades`, sub: `top 3 em ${nf(top3)}` },
          {
            rotulo: "Concentração",
            valor: `${nf(n50)} cidades`,
            sub: `somam 50% dos votos (80%: ${nf(n80)})`,
          },
          ...(cidades[0]
            ? [
                {
                  rotulo: "Principal reduto",
                  valor: B.muns[cidades[0].mi]?.nome ?? "",
                  sub: `${nf(cidades[0].v)} votos · ${fmtPct(cidades[0].pt, 1)} do total`,
                },
              ]
            : []),
        ],
      },
    ];

    if (d.proporcional && c.agrId) {
      const agr = d.cargo.candidatos.filter((x) => x.agrId === c.agrId);
      const k = agr.findIndex((x) => x.id === c.id);
      const janela = agr.slice(Math.max(0, k - 4), k + 5);
      blocos.push({
        tipo: "tabela",
        titulo: `Vizinhos na agremiação: ${c.agr}`,
        arquivo: arquivo("vizinhos", c.nome),
        ordem: [0, false],
        linhas: janela.map((x) => [
          agr.indexOf(x) + 1,
          vCand(x),
          x.partido,
          x.votos,
          x.votos - c.votos,
          vSit(x),
        ]),
        colunas: [
          col("Pos.", "pos"),
          col("Candidato", "cand"),
          col("Partido", "texto"),
          col("Votos", "int"),
          col(`Diferença p/ ${c.nome}`, "dif"),
          col("Situação", "sit"),
        ],
      });
    }
    blocos.push(
      {
        tipo: "tabela",
        titulo: "Por Território de Identidade",
        arquivo: arquivo("territorios", c.nome, c.n),
        ordem: [2, true],
        linhas: territorios,
        colunas: [
          col("Território", "texto"),
          col("Cidades c/ voto", "int"),
          col("Votos", "int", { barra: true }),
          col("% do total do candidato", "pct", { casas: 1 }),
          col("% válidos no território", "pct"),
          col("Posição no território", "pos"),
        ],
      },
      {
        tipo: "tabela",
        titulo: "Cidade a cidade",
        arquivo: arquivo("cidades", c.nome, c.n),
        busca: true,
        ordem: [2, true],
        linhas: cidades.map((x) => [
          vMun(B, x.mi),
          B.muns[x.mi]?.ti ?? "",
          x.v,
          x.p,
          x.r,
          x.pt,
          x.acc,
        ]),
        colunas: [
          col("Município", "mun"),
          col("Território", "texto"),
          col("Votos", "int", { barra: true }),
          col("% válidos na cidade", "pct"),
          col("Posição na cidade", "pos"),
          col("% do total", "pct"),
          col("% acumulado", "pct", { casas: 1 }),
        ],
      },
    );
    return blocos;
  },
});

add({
  id: "dossie2",
  grupo: "Candidatos",
  titulo: "Dossiê 2 — candidato por município",
  desc: "Desempenho de um candidato só nas cidades escolhidas (uma ou várias) ou na Bahia toda.",
  controles: ["cand", "muns"],
  padrao: {},
  gerar(B, st) {
    const ref = B.candPorId.get(st.cand ?? "") ?? B.candPorId.get(candidatoPadrao(B));
    if (!ref) return [{ tipo: "aviso", texto: "Escolha um candidato." }];
    const { c, i, slug } = ref;
    const d = B.cargos[slug];
    const set = st.muns ? recorteSet(`muns:${st.muns}`, B) : null;
    const lista = munsDoRecorte(B, set && set.size ? set : null);
    const setUsado = set && set.size ? set : null;
    const nomeRecorte = setUsado
      ? lista.length <= 3
        ? lista.map((mi) => B.muns[mi]?.nome).join(", ")
        : `${lista.length} municípios`
      : "Bahia";
    const s = statsRecorte(d, setUsado);
    const { linhas: rk0, validos } = rankingRecorte(B, d, setUsado);
    const rk = [...rk0].sort((a, b) => b.v - a.v);
    const pos = rk.findIndex((x) => x.ref.i === i) + 1;
    const meu = rk[pos - 1];
    const v = meu?.v ?? 0;
    const flat = d.votos[i] ?? [];
    const porMun = new Map<number, number>();
    for (let k = 0; k < flat.length; k += 2) porMun.set(flat[k] as number, flat[k + 1] as number);
    const cidades = lista.map((mi) => {
      const vm = porMun.get(mi) ?? 0;
      const st2 = d.stats[mi] ?? [];
      const top = rankPorMunicipio(d).get(mi)?.[0];
      const lider = top ? d.cargo.candidatos[top[1]] : undefined;
      return { mi, vm, vv: st2[E.vv] ?? 0, el: st2[E.el] ?? 0, r: vm ? posicaoNoMunicipio(d, i, mi) : null, lider, liderV: top?.[0] ?? 0 };
    });
    const primeiro = cidades.filter((x) => x.r === 1).length;
    const comVoto = cidades.filter((x) => x.vm > 0).length;
    const tv = s[E.tv] ?? 0;
    const blocos: Bloco[] = [
      {
        tipo: "destaque",
        kicker: `${d.cargo.nome} · ${c.partido} · nº ${c.n} · ${nomeRecorte}`,
        titulo: c.nome,
        sub: `${c.nomeCompleto} · ${c.agr}`,
        sit: vSit(c),
        candidato: c.id,
      },
      ...avisosCargo(B, d),
      {
        tipo: "numeros",
        itens: [
          { rotulo: "Votos no recorte", valor: nf(v), sub: `${fmtPct(razao(v, validos), 1)} dos válidos` },
          { rotulo: "Posição no recorte", valor: pos ? `${pos}º` : "–", sub: `de ${nf(rk.filter((x) => x.v > 0).length)} com voto` },
          { rotulo: "Peso no total dele", valor: fmtPct(razao(v, c.votos), 1), sub: `de ${nf(c.votos)} votos na BA` },
          { rotulo: "Municípios", valor: nf(lista.length), sub: `com voto em ${nf(comVoto)}` },
          { rotulo: "1º lugar em", valor: `${nf(primeiro)} cidades`, sub: `de ${nf(lista.length)}` },
          { rotulo: "Eleitorado", valor: nf(s[E.el] ?? 0), sub: `comparecimento ${fmtPct(razao(s[E.co] ?? 0, s[E.el] ?? 0), 1)}` },
          { rotulo: "Brancos e nulos", valor: fmtPct(razao((s[E.vb] ?? 0) + (s[E.vn] ?? 0), tv), 1), sub: `${nf((s[E.vb] ?? 0) + (s[E.vn] ?? 0))} votos` },
          ...(rk[0] && rk[0].ref.i !== i
            ? [{ rotulo: "Distância do 1º", valor: nf(rk[0].v - v), sub: rotuloCand(rk[0].ref.c) }]
            : rk[1]
              ? [{ rotulo: "Vantagem sobre o 2º", valor: nf(v - rk[1].v), sub: rotuloCand(rk[1].ref.c) }]
              : []),
        ],
      },
      {
        tipo: "tabela",
        titulo: "Cidade a cidade",
        arquivo: arquivo("dossie2-cidades", c.nome, nomeRecorte),
        busca: lista.length > 10,
        ordem: [2, true],
        linhas: cidades.map((x) => [
          vMun(B, x.mi),
          B.muns[x.mi]?.ti ?? "",
          x.vm,
          razao(x.vm, x.vv),
          x.r,
          razao(x.vm, v),
          x.lider ? rotuloCand(x.lider) : "–",
          x.r === 1 ? 0 : x.vm - x.liderV,
        ]),
        colunas: [
          col("Município", "mun"),
          col("Território", "texto"),
          col("Votos", "int", { barra: true }),
          col("% válidos na cidade", "pct"),
          col("Posição na cidade", "pos"),
          col("% do recorte", "pct"),
          col("Mais votado", "texto"),
          col("Diferença p/ o 1º", "dif"),
        ],
      },
    ];
    return blocos;
  },
});

add({
  id: "conc",
  grupo: "Candidatos",
  titulo: "Concentração de votos",
  desc: "Mostra quem depende de poucos municípios (reduto) e quem tem voto espalhado pelo estado.",
  controles: ["cargo", "partido", "min"],
  padrao: { cargo: "deputado-estadual", min: "0" },
  gerar(B, st) {
    const d = B.cargos[slugDe(st)];
    const min = Number(st.min ?? 0) || 0;
    const perfis = { "Muito concentrado": 0, Regional: 0, Distribuído: 0, Espalhado: 0 };
    const linhas: Celula[][] = [];
    d.cargo.candidatos.forEach((c, i) => {
      if (c.votos < min || (st.partido && c.partido !== st.partido)) return;
      const flat = d.votos[i] ?? [];
      const vals: [number, number][] = [];
      for (let k = 0; k < flat.length; k += 2)
        vals.push([flat[k + 1] as number, flat[k] as number]);
      vals.sort((a, b) => b[0] - a[0]);
      const V = vals.reduce((s, x) => s + x[0], 0) || 1;
      let acc = 0;
      let n50 = 0;
      let n80 = 0;
      let hhi = 0;
      vals.forEach(([v], k) => {
        acc += v;
        hhi += (v / V) ** 2;
        if (!n50 && acc >= 0.5 * V) n50 = k + 1;
        if (!n80 && acc >= 0.8 * V) n80 = k + 1;
      });
      const perfil =
        n50 <= 2
          ? "Muito concentrado"
          : n50 <= 10
            ? "Regional"
            : n50 <= 30
              ? "Distribuído"
              : "Espalhado";
      perfis[perfil]++;
      const top5 = vals.slice(0, 5).reduce((s, x) => s + x[0], 0);
      linhas.push([
        vCand(c),
        c.partido,
        c.votos,
        vals.length,
        n50,
        n80,
        vals[0] ? (B.muns[vals[0][1]]?.nome ?? "") : "–",
        razao(vals[0]?.[0] ?? 0, V),
        razao(top5, V),
        Math.round(hhi * 10000),
        hhi ? Math.round(1 / hhi) : 0,
        perfil,
        vSit(c),
      ]);
    });
    return [
      {
        tipo: "numeros",
        itens: [
          {
            rotulo: "Muito concentrado",
            valor: nf(perfis["Muito concentrado"]),
            sub: "metade dos votos em até 2 municípios",
          },
          { rotulo: "Regional", valor: nf(perfis.Regional), sub: "metade em 3 a 10 municípios" },
          {
            rotulo: "Distribuído",
            valor: nf(perfis["Distribuído"]),
            sub: "metade em 11 a 30 municípios",
          },
          {
            rotulo: "Espalhado",
            valor: nf(perfis.Espalhado),
            sub: "metade em mais de 30 municípios",
          },
        ],
      },
      {
        tipo: "tabela",
        titulo: `${d.cargo.nome}${min ? ` · candidatos com ${nf(min)}+ votos` : ""}`,
        arquivo: arquivo("concentracao", d.slug, st.partido),
        busca: true,
        ordem: [2, true],
        linhas,
        colunas: [
          col("Candidato", "cand"),
          col("Partido", "texto"),
          col("Votos", "int"),
          col("Municípios c/ voto", "int"),
          col("Municípios p/ 50%", "int", {
            dica: "Quantos municípios (dos mais fortes) somam metade dos votos",
          }),
          col("Municípios p/ 80%", "int"),
          col("Maior reduto", "texto"),
          col("% no reduto", "pct", { casas: 1 }),
          col("% nos 5 maiores", "pct", { casas: 1 }),
          col("Índice HHI", "int", {
            dica: "Soma dos quadrados das participações municipais × 10.000",
          }),
          col("Nº efetivo de municípios", "int", {
            dica: "Quantos municípios com votação igual dariam a mesma concentração",
          }),
          col("Perfil", "texto"),
          col("Situação", "sit"),
        ],
      },
      {
        tipo: "nota",
        texto:
          "HHI alto (perto de 10.000) = votos concentrados em poucos municípios; baixo = votação espalhada. Nº efetivo de municípios: quantos municípios com votação igual produziriam a mesma concentração.",
      },
    ];
  },
});

add({
  id: "dobradas",
  grupo: "Candidatos",
  titulo: "Dobradas prováveis",
  desc: "Candidatos de outro cargo que crescem e caem nos mesmos municípios que o candidato escolhido.",
  controles: ["cand", "cargob", "escopo"],
  padrao: { escopo: "ba" },
  gerar(B, st) {
    const ref = B.candPorId.get(st.cand ?? "") ?? B.candPorId.get(candidatoPadrao(B));
    if (!ref) return [{ tipo: "aviso", texto: "Escolha um candidato." }];
    const a = ref.c;
    const dA = B.cargos[ref.slug];
    const slugB: Slug = ehSlug(st.cargob)
      ? st.cargob
      : ref.slug === "deputado-estadual"
        ? "deputado-federal"
        : "deputado-estadual";
    const dB = B.cargos[slugB];
    const set = recorteSet(st.escopo, B);
    const muns = munsDoRecorte(B, set).filter(
      (mi) => (dA.stats[mi]?.[E.vv] ?? 0) > 0 && (dB.stats[mi]?.[E.vv] ?? 0) > 0,
    );
    const mapaA = mapaVotos(dA.votos[ref.i] ?? []);
    const xs = muns.map((mi) => razao(mapaA.get(mi) ?? 0, dA.stats[mi]?.[E.vv] ?? 0));
    const totalA = muns.reduce((s, mi) => s + (mapaA.get(mi) ?? 0), 0);
    // reduto de A: municípios mais fortes que somam 80% dos votos no recorte
    const reduto = new Set<number>();
    let acc = 0;
    for (const [v, mi] of muns
      .map((mi) => [mapaA.get(mi) ?? 0, mi] as const)
      .sort((p, q) => q[0] - p[0])) {
      if (acc >= 0.8 * totalA || !v) break;
      reduto.add(mi);
      acc += v;
    }
    const linhas: Celula[][] = [];
    dB.cargo.candidatos.forEach((c, ci) => {
      if (c.id === a.id) return;
      const m = mapaVotos(dB.votos[ci] ?? []);
      let v = 0;
      let noReduto = 0;
      let comuns = 0;
      const ys = muns.map((mi, k) => {
        const val = m.get(mi) ?? 0;
        v += val;
        if (reduto.has(mi)) noReduto += val;
        const y = razao(val, dB.stats[mi]?.[E.vv] ?? 0);
        if (y >= 2 && (xs[k] ?? 0) >= 2) comuns++;
        return y;
      });
      if (v < 500) return;
      linhas.push([
        vCand(c),
        c.partido,
        v,
        pearson(xs, ys),
        razao(noReduto, v),
        comuns,
        (c.agrId && c.agrId === a.agrId) || c.partido === a.partido ? "sim" : "",
        vSit(c),
      ]);
    });
    return [
      {
        tipo: "aviso",
        texto: `Correlação perto de +1: os dois sobem e descem juntos nos mesmos municípios. Isso sugere dobrada ou base eleitoral comum, mas não prova acordo. Calculado sobre o percentual de votos válidos em ${nf(muns.length)} municípios (${recorteNome(st.escopo, B)}); só entram candidatos com 500+ votos no recorte.`,
      },
      {
        tipo: "numeros",
        itens: [
          {
            rotulo: "Candidato base",
            valor: a.nome,
            sub: `${a.partido} · ${NOME_CURTO[ref.slug]} · ${nf(totalA)} votos no recorte`,
          },
          {
            rotulo: "Reduto do candidato base",
            valor: `${nf(reduto.size)} municípios`,
            sub: "somam 80% dos votos no recorte",
          },
          { rotulo: "Comparado com", valor: dB.cargo.nome, sub: `${nf(linhas.length)} candidatos` },
        ],
      },
      {
        tipo: "tabela",
        titulo: `Quem acompanha ${a.nome} em ${dB.cargo.nome}`,
        arquivo: arquivo("dobradas", a.nome, slugB),
        busca: true,
        ordem: [3, true],
        pagina: 40,
        linhas,
        colunas: [
          col("Candidato", "cand"),
          col("Partido", "texto"),
          col("Votos no recorte", "int"),
          col("Correlação", "corr", { barra: true }),
          col(`% dos votos no reduto de ${a.nome}`, "pct", { casas: 1 }),
          col("Municípios com 2%+ para ambos", "int"),
          col("Mesmo partido/federação", "texto"),
          col("Situação", "sit"),
        ],
      },
    ];
  },
});

// ---------- COMPARATIVO

add({
  id: "multi",
  grupo: "COMPARATIVO",
  titulo: "Painel de vários candidatos",
  desc: "Coloca vários candidatos lado a lado, mesmo de cargos diferentes, nas cidades escolhidas — uma coluna por candidato, em votos ou percentual.",
  controles: ["cands", "med", "muns"],
  padrao: { med: "votos" },
  gerar(B, st) {
    const ids = (st.cands ?? "").split(",").filter((id) => B.candPorId.has(id));
    if (!ids.length) {
      ids.push(...B.cargos.governador.cargo.candidatos.slice(0, 3).map((c) => c.id));
    }
    const cs = ids.map((id) => B.candPorId.get(id)!).filter(Boolean);
    if (!cs.length) return [{ tipo: "aviso", texto: "Adicione ao menos um candidato." }];
    const emPct = st.med === "pct";
    const set = st.muns ? recorteSet(`muns:${st.muns}`, B) : null;
    const muns = munsDoRecorte(B, set);
    const nomeRec = !st.muns ? "Bahia" : muns.length <= 3 ? muns.map((mi) => B.muns[mi]?.nome).join(", ") : `${muns.length} municípios`;
    const mapas = cs.map((x) => mapaVotos(B.cargos[x.slug].votos[x.i] ?? []));
    const rot = (x: (typeof cs)[number]) => (new Set(cs.map((y) => y.slug)).size > 1 ? `${x.c.nome} (${NOME_CURTO[x.slug]})` : x.c.nome);
    const linhas: Celula[][] = muns.map((mi) => [
      vMun(B, mi),
      ...cs.map((x, k) => {
        const v = mapas[k].get(mi) ?? 0;
        return emPct ? razao(v, B.cargos[x.slug].stats[mi]?.[E.vv] ?? 0) : v;
      }),
    ]);
    const totais = cs.map((x, k) => {
      const v = muns.reduce((s, mi) => s + (mapas[k].get(mi) ?? 0), 0);
      return { v, p: razao(v, statsRecorte(B.cargos[x.slug], set)[E.vv] ?? 0) };
    });
    return [
      {
        tipo: "numeros",
        itens: cs.map((x, k) => ({
          rotulo: rot(x),
          valor: emPct ? fmtPct(totais[k].p, 2) : nf(totais[k].v),
          sub: emPct ? `${nf(totais[k].v)} votos · ${nomeRec}` : `${fmtPct(totais[k].p, 2)} dos válidos · ${nomeRec}`,
        })),
      },
      {
        tipo: "tabela",
        titulo: `${emPct ? "% dos válidos" : "Votos"} · ${nomeRec}`,
        arquivo: arquivo("varios-candidatos", emPct ? "percentual" : "votos", nomeRec),
        busca: muns.length > 12,
        ordem: [1, true],
        pagina: 40,
        linhas,
        colunas: [
          col("Município", "mun"),
          ...cs.map((x) => (emPct ? col(rot(x), "pct", { casas: 2 }) : col(rot(x), "int"))),
        ],
      },
      {
        tipo: "nota",
        texto: emPct
          ? "Percentual de cada candidato sobre os votos válidos do próprio cargo na cidade — comparável entre cargos diferentes."
          : "Votos absolutos de cada candidato. Entre cargos diferentes, use o percentual para comparar o desempenho relativo.",
      },
    ];
  },
});


add({
  id: "duelo",
  grupo: "COMPARATIVO",
  titulo: "Duelo territorial de candidatos",
  desc: "Compara dois candidatos, inclusive de cargos diferentes, cidade a cidade e pelo percentual dentro de cada cargo.",
  controles: ["cand", "cand2", "escopo"],
  padrao: { escopo: "ba" },
  gerar(B, st) {
    const a = B.candPorId.get(st.cand ?? "") ?? B.candPorId.get(candidatoPadrao(B));
    const b = B.candPorId.get(st.cand2 ?? "");
    if (!a || !b || a.c.id === b.c.id)
      return [{ tipo: "aviso", texto: "Escolha dois candidatos diferentes para comparar." }];
    const set = recorteSet(st.escopo, B);
    const muns = munsDoRecorte(B, set);
    const mapaA = mapaVotos(B.cargos[a.slug].votos[a.i] ?? []);
    const mapaB = mapaVotos(B.cargos[b.slug].votos[b.i] ?? []);
    let vA = 0;
    let vB = 0;
    let venceA = 0;
    let venceB = 0;
    let empates = 0;
    const linhas: Celula[][] = muns.map((mi) => {
      const va = mapaA.get(mi) ?? 0;
      const vb = mapaB.get(mi) ?? 0;
      const pa = razao(va, B.cargos[a.slug].stats[mi]?.[E.vv] ?? 0);
      const pb = razao(vb, B.cargos[b.slug].stats[mi]?.[E.vv] ?? 0);
      vA += va;
      vB += vb;
      if (pa > pb) venceA++;
      else if (pb > pa) venceB++;
      else empates++;
      return [
        vMun(B, mi),
        B.muns[mi]?.ti ?? "",
        va,
        pa,
        vb,
        pb,
        pa - pb,
        pa === pb ? "Empate" : pa > pb ? a.c.nome : b.c.nome,
      ];
    });
    const sA = statsRecorte(B.cargos[a.slug], set);
    const sB = statsRecorte(B.cargos[b.slug], set);
    const pA = razao(vA, sA[E.vv] ?? 0);
    const pB = razao(vB, sB[E.vv] ?? 0);
    return [
      {
        tipo: "numeros",
        itens: [
          { rotulo: a.c.nome, valor: nf(vA), sub: `${fmtPct(pA, 2)} · ${NOME_CURTO[a.slug]}` },
          { rotulo: b.c.nome, valor: nf(vB), sub: `${fmtPct(pB, 2)} · ${NOME_CURTO[b.slug]}` },
          { rotulo: `${a.c.nome} supera`, valor: `${nf(venceA)} cidades`, sub: "pelo percentual no cargo" },
          { rotulo: `${b.c.nome} supera`, valor: `${nf(venceB)} cidades`, sub: empates ? `${nf(empates)} empates` : "sem empates" },
        ],
      },
      {
        tipo: "tabela",
        titulo: `${a.c.nome} × ${b.c.nome} · ${recorteNome(st.escopo, B)}`,
        arquivo: arquivo("duelo", a.c.nome, b.c.nome, recorteNome(st.escopo, B)),
        busca: true,
        ordem: [6, true],
        pagina: 40,
        linhas,
        colunas: [
          col("Município", "mun"),
          col("Território", "texto"),
          col(`Votos · ${a.c.nome}`, "int"),
          col(`% · ${a.c.nome}`, "pct", { casas: 2 }),
          col(`Votos · ${b.c.nome}`, "int"),
          col(`% · ${b.c.nome}`, "pct", { casas: 2 }),
          col("Diferença percentual", "pct", { casas: 2, barra: true }),
          col("Maior força relativa", "texto"),
        ],
      },
      {
        tipo: "nota",
        texto:
          a.slug === b.slug
            ? "A diferença compara a participação dos dois candidatos nos votos válidos do mesmo cargo em cada município."
            : "Como os cargos têm quantidades diferentes de votos válidos, a liderança territorial usa o percentual dentro de cada cargo; os votos absolutos aparecem separados.",
      },
    ];
  },
});

add({
  id: "cargos-lado-a-lado",
  grupo: "COMPARATIVO",
  titulo: "Cargos lado a lado",
  desc: "Compara participação, votos válidos, brancos e nulos de dois cargos em cada município.",
  controles: ["cargo", "cargob", "escopo"],
  padrao: { cargo: "governador", cargob: "presidente", escopo: "ba" },
  gerar(B, st) {
    const slugA = slugDe(st, "governador");
    const slugB = ehSlug(st.cargob) ? st.cargob : "presidente";
    if (slugA === slugB)
      return [{ tipo: "aviso", texto: "Escolha dois cargos diferentes para comparar." }];
    const a = B.cargos[slugA];
    const b = B.cargos[slugB];
    const set = recorteSet(st.escopo, B);
    const sA = statsRecorte(a, set);
    const sB = statsRecorte(b, set);
    const linhas = munsDoRecorte(B, set).map((mi): Celula[] => {
      const sa = a.stats[mi] ?? [];
      const sb = b.stats[mi] ?? [];
      const qa = razao(sa[E.vv] ?? 0, sa[E.tv] ?? 0);
      const qb = razao(sb[E.vv] ?? 0, sb[E.tv] ?? 0);
      return [
        vMun(B, mi),
        B.muns[mi]?.ti ?? "",
        sa[E.vv] ?? 0,
        qa,
        razao(sa[E.vb] ?? 0, sa[E.tv] ?? 0),
        razao(sa[E.vn] ?? 0, sa[E.tv] ?? 0),
        sb[E.vv] ?? 0,
        qb,
        razao(sb[E.vb] ?? 0, sb[E.tv] ?? 0),
        razao(sb[E.vn] ?? 0, sb[E.tv] ?? 0),
        qa - qb,
      ];
    });
    return [
      {
        tipo: "numeros",
        itens: [
          { rotulo: `Válidos · ${NOME_CURTO[slugA]}`, valor: nf(sA[E.vv] ?? 0), sub: fmtPct(razao(sA[E.vv] ?? 0, sA[E.tv] ?? 0), 1) },
          { rotulo: `Válidos · ${NOME_CURTO[slugB]}`, valor: nf(sB[E.vv] ?? 0), sub: fmtPct(razao(sB[E.vv] ?? 0, sB[E.tv] ?? 0), 1) },
          { rotulo: `Brancos + nulos · ${NOME_CURTO[slugA]}`, valor: fmtPct(razao((sA[E.vb] ?? 0) + (sA[E.vn] ?? 0), sA[E.tv] ?? 0), 1) },
          { rotulo: `Brancos + nulos · ${NOME_CURTO[slugB]}`, valor: fmtPct(razao((sB[E.vb] ?? 0) + (sB[E.vn] ?? 0), sB[E.tv] ?? 0), 1) },
        ],
      },
      {
        tipo: "tabela",
        titulo: `${a.cargo.nome} × ${b.cargo.nome} · ${recorteNome(st.escopo, B)}`,
        arquivo: arquivo("cargos", slugA, slugB, recorteNome(st.escopo, B)),
        busca: true,
        ordem: [10, true],
        pagina: 35,
        linhas,
        colunas: [
          col("Município", "mun"), col("Território", "texto"),
          col(`Válidos · ${NOME_CURTO[slugA]}`, "int"), col(`% válidos · ${NOME_CURTO[slugA]}`, "pct", { casas: 1 }),
          col(`% brancos · ${NOME_CURTO[slugA]}`, "pct", { casas: 1 }), col(`% nulos · ${NOME_CURTO[slugA]}`, "pct", { casas: 1 }),
          col(`Válidos · ${NOME_CURTO[slugB]}`, "int"), col(`% válidos · ${NOME_CURTO[slugB]}`, "pct", { casas: 1 }),
          col(`% brancos · ${NOME_CURTO[slugB]}`, "pct", { casas: 1 }), col(`% nulos · ${NOME_CURTO[slugB]}`, "pct", { casas: 1 }),
          col("Diferença em válidos", "pct", { casas: 1, barra: true }),
        ],
      },
      { tipo: "nota", texto: "No cargo de Senador, cada eleitor pôde votar duas vezes; por isso, compare percentuais e não apenas totais absolutos." },
    ];
  },
});

add({
  id: "partido-casas",
  grupo: "COMPARATIVO",
  titulo: "Partido: Estadual × Federal",
  desc: "Mostra onde um partido rende mais para Deputado Estadual ou Federal e revela desequilíbrios territoriais.",
  controles: ["pn", "escopo"],
  padrao: { cargo: "deputado-estadual", escopo: "ba" },
  gerar(B, st) {
    const estadual = B.cargos["deputado-estadual"];
    const federal = B.cargos["deputado-federal"];
    const opcoes = opcoesPartido(B, "deputado-estadual");
    const alvo = opcoes.find((p) => p.n === st.pn) ?? opcoes[0];
    if (!alvo) return [{ tipo: "aviso", texto: "Sem partidos para comparar." }];
    const votosPartido = (d: DadosCargo) => {
      const out = new Map<number, number>();
      d.cargo.candidatos.forEach((c, ci) => {
        if (c.partido !== alvo.sg) return;
        const f = d.votos[ci] ?? [];
        for (let k = 0; k < f.length; k += 2)
          out.set(f[k] as number, (out.get(f[k] as number) ?? 0) + (f[k + 1] as number));
      });
      const leg = d.legenda.get(alvo.n) ?? [];
      for (let k = 0; k < leg.length; k += 2)
        out.set(leg[k] as number, (out.get(leg[k] as number) ?? 0) + (leg[k + 1] as number));
      return out;
    };
    const ve = votosPartido(estadual);
    const vf = votosPartido(federal);
    const set = recorteSet(st.escopo, B);
    let totalE = 0;
    let totalF = 0;
    let melhorE = 0;
    let melhorF = 0;
    const linhas = munsDoRecorte(B, set).map((mi): Celula[] => {
      const e = ve.get(mi) ?? 0;
      const f = vf.get(mi) ?? 0;
      const pe = razao(e, estadual.stats[mi]?.[E.vv] ?? 0);
      const pfed = razao(f, federal.stats[mi]?.[E.vv] ?? 0);
      totalE += e;
      totalF += f;
      if (pe > pfed) melhorE++;
      else if (pfed > pe) melhorF++;
      return [vMun(B, mi), B.muns[mi]?.ti ?? "", e, pe, f, pfed, pe - pfed, pe === pfed ? "Equilíbrio" : pe > pfed ? "Estadual" : "Federal"];
    });
    const validosE = statsRecorte(estadual, set)[E.vv] ?? 0;
    const validosF = statsRecorte(federal, set)[E.vv] ?? 0;
    return [
      {
        tipo: "numeros",
        itens: [
          { rotulo: `${alvo.sg} · Estadual`, valor: nf(totalE), sub: fmtPct(razao(totalE, validosE), 2) },
          { rotulo: `${alvo.sg} · Federal`, valor: nf(totalF), sub: fmtPct(razao(totalF, validosF), 2) },
          { rotulo: "Mais forte no Estadual", valor: `${nf(melhorE)} cidades`, sub: "pela participação nos válidos" },
          { rotulo: "Mais forte no Federal", valor: `${nf(melhorF)} cidades`, sub: "pela participação nos válidos" },
        ],
      },
      {
        tipo: "tabela",
        titulo: `${alvo.sg} · Estadual × Federal · ${recorteNome(st.escopo, B)}`,
        arquivo: arquivo("partido-estadual-federal", alvo.sg, recorteNome(st.escopo, B)),
        busca: true,
        ordem: [6, true],
        pagina: 40,
        linhas,
        colunas: [
          col("Município", "mun"), col("Território", "texto"),
          col("Votos · Estadual", "int"), col("% · Estadual", "pct", { casas: 2 }),
          col("Votos · Federal", "int"), col("% · Federal", "pct", { casas: 2 }),
          col("Diferença percentual", "pct", { casas: 2, barra: true }), col("Força maior", "texto"),
        ],
      },
      { tipo: "nota", texto: "A comparação soma votos nominais dos candidatos e votos de legenda do partido em cada cargo." },
    ];
  },
});

// ---------- Partidos e vagas

add({
  id: "bancadas",
  grupo: "Partidos e vagas",
  titulo: "Bancadas por partido e federação",
  desc: "Vagas conquistadas, votos nominais e de legenda e quem foi eleito em cada agremiação.",
  controles: ["cargoprop"],
  padrao: { cargo: "deputado-estadual" },
  gerar(B, st) {
    const d = B.cargos[cargoProp(st)];
    const ags = d.cargo.agremiacoes ?? [];
    const eleitos = d.cargo.candidatos.filter((c) => tipoSituacao(c) === "eleito");
    const legenda = ags.reduce((s, a) => s + a.legenda, 0);
    const total = ags.reduce((s, a) => s + a.total, 0);
    const linhasAg: Celula[][] = ags.map((a) => {
      const el = eleitos.filter((c) => c.agrId === a.id);
      const porPartido = Object.entries(
        el.reduce<Record<string, number>>((acc, c) => {
          acc[c.partido] = (acc[c.partido] ?? 0) + 1;
          return acc;
        }, {}),
      )
        .map(([p, n]) => `${p} ${n}`)
        .join(" · ");
      return [
        a.nome,
        a.tipo,
        a.vagas,
        a.qp,
        a.nominal,
        a.legenda,
        a.total,
        a.pct,
        porPartido,
        el.map((c) => c.nome).join(", "),
      ];
    });
    const linhasPart: Celula[][] = d.cargo.partidos.map((p) => [
      p.sg,
      p.agr,
      p.votosTot,
      p.legenda,
      p.votosTot + p.legenda,
      razao(p.votosTot + p.legenda, d.cargo.resumo.validos),
      eleitos.filter((c) => c.partido === p.sg).length,
    ]);
    return [
      ...avisosCargo(B, d),
      {
        tipo: "numeros",
        itens: [
          { rotulo: "Vagas", valor: nf(d.cargo.vagas) },
          { rotulo: "Quociente eleitoral", valor: nf(d.cargo.qe), sub: "votos por vaga" },
          {
            rotulo: "Agremiações com vaga",
            valor: nf(ags.filter((a) => a.vagas > 0).length),
            sub: `de ${ags.length} que disputaram`,
          },
          {
            rotulo: "Votos de legenda",
            valor: nf(legenda),
            sub: `${fmtPct(razao(legenda, total), 1)} dos votos das agremiações`,
          },
        ],
      },
      {
        tipo: "tabela",
        titulo: `${d.cargo.nome}: agremiações`,
        arquivo: arquivo("bancadas", d.slug),
        apresentacao: { tipo: "bancadas", projecao: eleitos.some((c) => c.proj), totalVagas: d.cargo.vagas },
        ordem: [2, true],
        linhas: linhasAg,
        colunas: [
          col("Agremiação", "texto"),
          col("Tipo", "texto"),
          col("Vagas", "int", { barra: true }),
          col("Quocientes inteiros", "int", {
            dica: "Quantas vezes a agremiação atingiu o quociente eleitoral",
          }),
          col("Votos nominais", "int"),
          col("Legenda", "int"),
          col("Total", "int"),
          col("% válidos", "pct"),
          col("Eleitos por partido", "texto"),
          col("Eleitos", "texto"),
        ],
      },
      {
        tipo: "tabela",
        titulo: "Votos por partido",
        arquivo: arquivo("partidos", d.slug),
        busca: true,
        ordem: [4, true],
        linhas: linhasPart,
        colunas: [
          col("Partido", "texto"),
          col("Agremiação", "texto"),
          col("Nominais", "int"),
          col("Legenda", "int"),
          col("Total", "int"),
          col("% válidos", "pct"),
          col("Eleitos", "int"),
        ],
      },
    ];
  },
});

add({
  id: "faltou",
  grupo: "Partidos e vagas",
  titulo: "Eleitos, suplentes e quanto faltou",
  desc: "Ordem dentro de cada partido ou federação, quantos votos faltaram para entrar e a margem de quem entrou.",
  controles: ["cargoprop", "agr"],
  padrao: { cargo: "deputado-estadual" },
  gerar(B, st) {
    const d = B.cargos[cargoProp(st)];
    const ags = d.cargo.agremiacoes ?? [];
    const lista = st.agr ? ags.filter((a) => a.id === st.agr) : ags.filter((a) => a.vagas > 0);
    const blocos: Bloco[] = [...avisosCargo(B, d)];
    for (const a of lista) {
      const cands = d.cargo.candidatos.filter((c) => c.agrId === a.id);
      blocos.push({
        tipo: "tabela",
        titulo: `${a.nome} · ${a.vagas} vaga${a.vagas === 1 ? "" : "s"} · ${nf(a.total)} votos`,
        arquivo: arquivo("faltou", d.slug, a.sigla || a.nome),
        ordem: [0, false],
        pagina: Math.max(25, a.vagas + 10),
        linhas: cands.map((c, k) => [
          k + 1,
          vCand(c),
          c.partido,
          c.votos,
          vSit(c),
          c.faltou ?? null,
          c.margem ?? null,
        ]),
        colunas: [
          col("Pos.", "pos"),
          col("Candidato", "cand"),
          col("Partido", "texto"),
          col("Votos", "int", { barra: true }),
          col("Situação", "sit"),
          col("Faltou para entrar", "int"),
          col("Margem sobre o 1º suplente", "int"),
        ],
      });
    }
    if (!st.agr) {
      blocos.push({
        tipo: "tabela",
        titulo: "Agremiações que não conquistaram vaga",
        arquivo: arquivo("sem-vaga", d.slug),
        ordem: [1, true],
        linhas: ags
          .filter((a) => !a.vagas)
          .map((a) => [
            a.nome,
            a.total,
            razao(a.total, d.cargo.qe),
            Math.max(0, d.cargo.qe - a.total),
          ]),
        colunas: [
          col("Agremiação", "texto"),
          col("Votos", "int"),
          col("% do quociente eleitoral", "pct", { casas: 1 }),
          col("Faltou para 1 quociente", "int"),
        ],
      });
    }
    return blocos;
  },
});

add({
  id: "partido",
  grupo: "Partidos e vagas",
  titulo: "Força do partido por município",
  desc: "Votos do partido (candidatos + legenda) em cada município e a posição dele entre os partidos.",
  controles: ["cargo", "escopo", "pn"],
  padrao: { cargo: "deputado-estadual", escopo: "ba" },
  gerar(B, st) {
    const d = B.cargos[slugDe(st)];
    const set = recorteSet(st.escopo, B);
    const partidos = opcoesPartido(B, d.slug);
    const alvo = partidos.find((p) => p.n === st.pn) ?? partidos[0];
    if (!alvo) return [{ tipo: "aviso", texto: "Sem partidos para este cargo." }];
    const sgPorNum = new Map(d.cargo.partidos.map((p) => [p.n, p.sg]));
    const tot = new Map<number, Map<string, number>>();
    const somar = (mi: number, sg: string, v: number) => {
      let m = tot.get(mi);
      if (!m) tot.set(mi, (m = new Map()));
      m.set(sg, (m.get(sg) ?? 0) + v);
    };
    const nominal = new Map<number, number>();
    const melhor = new Map<number, [Candidato, number]>();
    d.cargo.candidatos.forEach((c, ci) => {
      const f = d.votos[ci] ?? [];
      for (let k = 0; k < f.length; k += 2) {
        const mi = f[k] as number;
        const v = f[k + 1] as number;
        somar(mi, c.partido, v);
        if (c.partido === alvo.sg) {
          nominal.set(mi, (nominal.get(mi) ?? 0) + v);
          const b = melhor.get(mi);
          if (!b || b[1] < v) melhor.set(mi, [c, v]);
        }
      }
    });
    const leg = new Map<number, number>();
    for (const [pn, f] of d.legenda) {
      const sg = sgPorNum.get(pn) ?? pn;
      for (let k = 0; k < f.length; k += 2) {
        somar(f[k] as number, sg, f[k + 1] as number);
        if (sg === alvo.sg) leg.set(f[k] as number, f[k + 1] as number);
      }
    }
    const muns = munsDoRecorte(B, set);
    let mais = 0;
    let presenca = 0;
    let soma = 0;
    const linhas: Celula[][] = muns.map((mi) => {
      const m = tot.get(mi) ?? new Map<string, number>();
      const total = m.get(alvo.sg) ?? 0;
      let pos = 1;
      for (const v of m.values()) if (v > total) pos++;
      if (total) {
        presenca++;
        if (pos === 1) mais++;
      }
      soma += total;
      const b = melhor.get(mi);
      return [
        vMun(B, mi),
        B.muns[mi]?.ti ?? "",
        nominal.get(mi) ?? 0,
        leg.get(mi) ?? 0,
        total,
        razao(total, d.stats[mi]?.[E.vv] ?? 0),
        total ? pos : null,
        b ? `${b[0].nome} (${nf(b[1])})` : "–",
      ];
    });
    const validos = statsRecorte(d, set)[E.vv] ?? 0;
    return [
      {
        tipo: "numeros",
        itens: [
          {
            rotulo: `Votos do ${alvo.sg}`,
            valor: nf(soma),
            sub: `${fmtPct(razao(soma, validos), 1)} dos válidos do recorte`,
          },
          {
            rotulo: "Partido mais votado em",
            valor: `${nf(mais)} municípios`,
            sub: `de ${nf(muns.length)}`,
          },
          { rotulo: "Presença", valor: `${nf(presenca)} municípios`, sub: "com pelo menos 1 voto" },
        ],
      },
      {
        tipo: "tabela",
        titulo: `${alvo.sg} · ${d.cargo.nome} · ${recorteNome(st.escopo, B)}`,
        arquivo: arquivo("partido", alvo.sg, d.slug, recorteNome(st.escopo, B)),
        busca: true,
        ordem: [4, true],
        linhas,
        colunas: [
          col("Município", "mun"),
          col("Território", "texto"),
          col("Nominais", "int"),
          col("Legenda", "int"),
          col("Total", "int", { barra: true }),
          col("% válidos", "pct"),
          col("Posição entre partidos", "pos"),
          col("Candidato mais votado", "texto"),
        ],
      },
    ];
  },
});

// ------------------------------------------------------------------ urnas e locais de votação

add({
  id: "urnas",
  grupo: "Locais de votação",
  titulo: "Urnas e locais de votação",
  desc: "Votos de um candidato colégio a colégio e urna a urna, nos municípios com dados por seção.",
  controles: ["loc", "cand"],
  padrao: {},
  gerar(B, st) {
    const S = B.secoes;
    if (!S) return [{ tipo: "aviso", texto: "Carregando dados das urnas…" }];
    const tse = S.muns[st.loc ?? ""] ? (st.loc as string) : Object.keys(S.muns)[0];
    const M = tse ? S.muns[tse] : undefined;
    if (!M || !tse) return [{ tipo: "aviso", texto: "Nenhum município com dados por urna." }];
    let ref = B.candPorId.get(st.cand ?? "");
    if (!ref || !M.cargos[ref.slug]) {
      const g = B.cargos.governador.cargo.candidatos[0];
      ref = g ? B.candPorId.get(g.id) : undefined;
    }
    if (!ref) return [{ tipo: "aviso", texto: "Escolha um candidato." }];
    const { c, slug } = ref;
    const d = B.cargos[slug];
    const sc = M.cargos[slug];
    if (!sc) return [{ tipo: "aviso", texto: `O TSE não publicou votos por seção de ${d.cargo.nome}.` }];
    const avisoTroca =
      st.cand && st.cand !== c.id
        ? [{ tipo: "aviso" as const, texto: "O TSE não publicou votos por seção desse cargo; mostrando o candidato a Governador mais votado." }]
        : [];
    const nS = M.secoes.length;
    // votos[num][seção]
    const porSec = new Map<string, number[]>();
    const vv = new Array<number>(nS).fill(0);
    const somar = (rec: Record<string, number[]>, guardar: boolean) => {
      for (const [num, flat] of Object.entries(rec)) {
        const arr = new Array<number>(nS).fill(0);
        for (let k = 0; k < flat.length; k += 2) {
          arr[flat[k] as number] = flat[k + 1] as number;
          vv[flat[k] as number] += flat[k + 1] as number;
        }
        if (guardar) porSec.set(num, arr);
      }
    };
    somar(sc.c, true);
    somar(sc.l, false);
    const nomeNum = new Map(d.cargo.candidatos.map((x) => [x.n, x]));
    const meus = porSec.get(c.n) ?? new Array<number>(nS).fill(0);
    // ranking dentro de um conjunto de seções
    const lider = (idx: number[]) => {
      const tot: [string, number][] = [...porSec].map(([n, a]) => [n, idx.reduce((s, i) => s + (a[i] ?? 0), 0)]);
      tot.sort((a, b) => b[1] - a[1]);
      const meu = idx.reduce((s, i) => s + (meus[i] ?? 0), 0);
      const pos = meu ? tot.filter((t) => t[1] > meu).length + 1 : null;
      const top = tot[0];
      const cTop = top ? nomeNum.get(top[0]) : undefined;
      return { meu, pos, topV: top?.[1] ?? 0, topNome: cTop ? rotuloCand(cTop) : "–" };
    };
    const todas = M.secoes.map((_, i) => i);
    const geral = lider(todas);
    const validos = vv.reduce((a, b) => a + b, 0);
    const bn = (i: number) => (sc.bv[2 * i] ?? 0) + (sc.bv[2 * i + 1] ?? 0);
    const locais = M.locais.map((l, li) => {
      const idx = todas.filter((i) => M.secoes[i]?.[2] === li);
      const r = lider(idx);
      return { l, idx, ...r, vv: idx.reduce((s, i) => s + (vv[i] ?? 0), 0), bn: idx.reduce((s, i) => s + bn(i), 0) };
    });
    const secs = todas.map((i) => {
      const [z, s, li] = M.secoes[i] as [number, number, number];
      return { z, s, l: M.locais[li], ...lider([i]), vv: vv[i] ?? 0, bn: bn(i) };
    });
    const comVoto = locais.filter((x) => x.idx.length);
    const melhor = [...comVoto].sort((a, b) => b.meu - a.meu)[0];
    const melhorPct = [...comVoto].filter((x) => x.vv >= 50).sort((a, b) => razao(b.meu, b.vv) - razao(a.meu, a.vv))[0];
    const nomeMun = B.muns[B.porTse.get(tse) ?? -1]?.nome ?? M.nome;
    const curto = (s: string) => (s.length > 38 ? `${s.slice(0, 36)}…` : s);
    return [
      {
        tipo: "destaque",
        kicker: `${d.cargo.nome} · ${c.partido} · nº ${c.n} · ${nomeMun}`,
        titulo: c.nome,
        sub: `${c.nomeCompleto} · ${c.agr}`,
        sit: vSit(c),
        candidato: c.id,
      },
      ...avisoTroca,
      {
        tipo: "numeros",
        itens: [
          { rotulo: "Votos no município", valor: nf(geral.meu), sub: `${fmtPct(razao(geral.meu, validos), 1)} dos válidos` },
          { rotulo: "Posição no município", valor: geral.pos ? `${geral.pos}º` : "–", sub: `1º: ${geral.topNome}` },
          { rotulo: "Locais de votação", valor: nf(locais.length), sub: `1º lugar em ${nf(locais.filter((x) => x.pos === 1).length)}` },
          { rotulo: "Urnas (seções)", valor: nf(nS), sub: `1º lugar em ${nf(secs.filter((x) => x.pos === 1).length)}` },
          { rotulo: "Urnas sem voto dele", valor: nf(secs.filter((x) => !x.meu).length), sub: `de ${nf(nS)}` },
          ...(melhor ? [{ rotulo: "Local com mais votos", valor: nf(melhor.meu), sub: curto(melhor.l.nome) }] : []),
          ...(melhorPct ? [{ rotulo: "Maior percentual", valor: fmtPct(razao(melhorPct.meu, melhorPct.vv), 1), sub: curto(melhorPct.l.nome) }] : []),
        ],
      },
      {
        tipo: "nota",
        texto: `Fonte: ${S.fonte}. Válidos = votos nominais${d.proporcional ? " + legenda" : ""} das urnas${slug === "senador" ? " (cada eleitor vota em dois senadores)" : ""}.`,
      },
      {
        tipo: "tabela",
        titulo: "Por local de votação",
        arquivo: arquivo("locais", c.nome, nomeMun),
        busca: locais.length > 10,
        ordem: [3, true],
        linhas: locais.map((x) => [
          x.l.nome,
          x.l.end,
          x.idx.length,
          x.meu,
          razao(x.meu, x.vv),
          x.vv,
          x.pos,
          x.topNome,
          x.pos === 1 ? 0 : x.meu - x.topV,
        ]),
        colunas: [
          col("Local de votação", "texto"),
          col("Endereço", "texto"),
          col("Urnas", "int"),
          col("Votos", "int", { barra: true }),
          col("% válidos", "pct"),
          col("Válidos", "int"),
          col("Posição", "pos"),
          col("Mais votado", "texto"),
          col("Diferença p/ o 1º", "dif"),
        ],
      },
      {
        tipo: "tabela",
        titulo: "Urna a urna",
        arquivo: arquivo("urnas", c.nome, nomeMun),
        busca: true,
        ordem: [3, true],
        linhas: secs.map((x) => [
          `${x.z} / ${x.s}`,
          x.l?.nome ?? "",
          x.vv,
          x.meu,
          razao(x.meu, x.vv),
          x.bn,
          x.pos,
          x.topNome,
        ]),
        colunas: [
          col("Zona / seção", "texto"),
          col("Local de votação", "texto"),
          col("Válidos", "int"),
          col("Votos", "int", { barra: true }),
          col("% válidos", "pct"),
          col("Brancos e nulos", "int"),
          col("Posição", "pos"),
          col("Mais votado", "texto"),
        ],
      },
    ];
  },
});

// Comunidade de um local a partir do endereço do TSE: povoado/distrito/aldeia/assentamento/ilha no meio rural;
// no meio urbano o TSE quase nunca informa o bairro, então vira "Sede (zona urbana)" ou o bairro quando vier.
const PREFIXO_COM = /^(POVOADO|DISTRITO|ALDEIA|ASSENTAMENTO|ILHA|FAZENDA|VILA|COMUNIDADE|BAIRRO|LOTEAMENTO)\b/;
export function comunidadeDe(end: string): { nome: string; zona: "Urbana" | "Rural" } {
  const partes = end.split(" - ").map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const rural = /ZONA RURAL/.test(end);
  const cand = partes.filter((p) => !/^ZONA (RURAL|URBANA)$/.test(p));
  const achado = cand.find((p) => PREFIXO_COM.test(p) && !/^LOTEAMENTO/.test(p));
  if (achado) {
    const nome = achado.split(",")[0]!.replace(/^POVOADO (DE |DO |DA )?/, "").trim();
    return { nome: /^(DISTRITO|ALDEIA|ILHA|ASSENTAMENTO)/.test(achado) ? achado.split(",")[0]! : nome, zona: rural || !/ZONA URBANA/.test(end) ? "Rural" : "Urbana" };
  }
  if (rural) return { nome: (cand[0] ?? "Zona rural").split(",")[0]!, zona: "Rural" };
  const bairro = cand.length >= 2 ? cand[cand.length - 1] : undefined;
  return { nome: bairro && !/\d|S\/N|SN$/.test(bairro) ? `Sede · ${bairro}` : "Sede (zona urbana)", zona: "Urbana" };
}

type Unidade = { nome: string; sub: string; idx: number[] };
function prepUrnas(B: Base, loc: string | undefined, slug: Slug) {
  const S = B.secoes;
  if (!S) return { erro: "Carregando dados das urnas…" } as const;
  const tse = S.muns[loc ?? ""] ? (loc as string) : Object.keys(S.muns)[0];
  const M = tse ? S.muns[tse] : undefined;
  if (!M || !tse) return { erro: "Nenhum município com dados por urna." } as const;
  const sc = M.cargos[slug];
  if (!sc) return { erro: `O TSE não publicou votos por seção de ${B.cargos[slug].cargo.nome}. Escolha outro cargo.` } as const;
  const nS = M.secoes.length;
  const porSec = new Map<string, number[]>();
  const vv = new Array<number>(nS).fill(0);
  for (const [rec, guardar] of [[sc.c, true], [sc.l, false]] as const)
    for (const [num, flat] of Object.entries(rec)) {
      const arr = new Array<number>(nS).fill(0);
      for (let k = 0; k < flat.length; k += 2) {
        arr[flat[k] as number] = flat[k + 1] as number;
        vv[flat[k] as number] += flat[k + 1] as number;
      }
      if (guardar) porSec.set(num, arr);
    }
  const bn = M.secoes.map((_, i) => (sc.bv[2 * i] ?? 0) + (sc.bv[2 * i + 1] ?? 0));
  const todas = M.secoes.map((_, i) => i);
  const unidades = (agl: string | undefined): Unidade[] => {
    if (agl === "secao")
      return todas.map((i) => {
        const [z, s, li] = M.secoes[i] as [number, number, number];
        return { nome: `${z} / ${s}`, sub: M.locais[li]?.nome ?? "", idx: [i] };
      });
    if (agl === "local")
      return M.locais.map((l, li) => ({
        nome: l.nome,
        sub: comunidadeDe(l.end).nome,
        idx: todas.filter((i) => M.secoes[i]?.[2] === li),
      }));
    const g = new Map<string, Unidade>();
    M.locais.forEach((l, li) => {
      const c = comunidadeDe(l.end);
      let u = g.get(c.nome);
      if (!u) g.set(c.nome, (u = { nome: c.nome, sub: c.zona, idx: [] }));
      for (const i of todas) if (M.secoes[i]?.[2] === li) u.idx.push(i);
    });
    return [...g.values()];
  };
  const soma = (a: number[] | undefined, idx: number[]) => idx.reduce((s, i) => s + (a?.[i] ?? 0), 0);
  const ranking = (idx: number[]) =>
    [...porSec].map(([n, a]) => [n, soma(a, idx)] as [string, number]).sort((a, b) => b[1] - a[1]);
  const nomeMun = B.muns[B.porTse.get(tse) ?? -1]?.nome ?? M.nome;
  return { S, M, tse, nomeMun, porSec, vv, bn, todas, unidades, soma, ranking } as const;
}
const AGL_NOME: Record<string, string> = { com: "Bairro / comunidade", local: "Local de votação", secao: "Urna (zona / seção)" };

add({
  id: "urnas-comunidade",
  grupo: "Locais de votação",
  titulo: "Candidato por bairro / comunidade",
  desc: "Junta os locais de votação por povoado, distrito ou sede e mostra a força do candidato em cada comunidade e na zona urbana × rural.",
  controles: ["loc", "cand"],
  padrao: {},
  gerar(B, st) {
    let ref = B.candPorId.get(st.cand ?? "");
    if (!ref || !B.secoes?.muns[st.loc ?? Object.keys(B.secoes?.muns ?? {})[0] ?? ""]?.cargos[ref.slug]) {
      const g = B.cargos.governador.cargo.candidatos[0];
      ref = g ? B.candPorId.get(g.id) : undefined;
    }
    if (!ref) return [{ tipo: "aviso", texto: "Escolha um candidato." }];
    const P = prepUrnas(B, st.loc, ref.slug);
    if ("erro" in P) return [{ tipo: "aviso", texto: P.erro as string }];
    const { c, slug } = ref;
    const d = B.cargos[slug];
    const meus = P.porSec.get(c.n);
    const nomeNum = new Map(d.cargo.candidatos.map((x) => [x.n, x]));
    const linhaDe = (u: Unidade) => {
      const rk = P.ranking(u.idx);
      const meu = P.soma(meus, u.idx);
      const vv = P.soma(P.vv, u.idx);
      const pos = meu ? rk.filter((t) => t[1] > meu).length + 1 : null;
      const top = rk[0];
      const ct = top ? nomeNum.get(top[0]) : undefined;
      return { u, meu, vv, pos, topV: top?.[1] ?? 0, top: ct ? rotuloCand(ct) : "–" };
    };
    const coms = P.unidades("com").map(linhaDe);
    const zonas = (["Urbana", "Rural"] as const).map((z) =>
      linhaDe({ nome: z, sub: "", idx: P.unidades("com").filter((u) => u.sub === z).flatMap((u) => u.idx) }),
    );
    const total = P.soma(meus, P.todas);
    const validos = P.soma(P.vv, P.todas);
    const forte = [...coms].filter((x) => x.vv >= 50).sort((a, b) => razao(b.meu, b.vv) - razao(a.meu, a.vv))[0];
    return [
      {
        tipo: "destaque",
        kicker: `${d.cargo.nome} · ${c.partido} · nº ${c.n} · ${P.nomeMun}`,
        titulo: c.nome,
        sub: `${c.nomeCompleto} · ${c.agr}`,
        sit: vSit(c),
        candidato: c.id,
      },
      ...(st.cand && st.cand !== c.id
        ? [{ tipo: "aviso" as const, texto: "Sem votos por seção para esse cargo; mostrando o candidato a Governador mais votado." }]
        : []),
      {
        tipo: "numeros",
        itens: [
          { rotulo: "Votos no município", valor: nf(total), sub: `${fmtPct(razao(total, validos), 1)} dos válidos` },
          { rotulo: "Comunidades", valor: nf(coms.length), sub: `1º lugar em ${nf(coms.filter((x) => x.pos === 1).length)}` },
          ...zonas.filter((z) => z.vv).map((z) => ({
            rotulo: `Zona ${z.u.nome.toLowerCase()}`,
            valor: nf(z.meu),
            sub: `${fmtPct(razao(z.meu, z.vv), 1)} dos válidos · ${fmtPct(razao(z.meu, total), 0)} dos votos dele`,
          })),
          ...(forte ? [{ rotulo: "Comunidade mais forte", valor: fmtPct(razao(forte.meu, forte.vv), 1), sub: forte.u.nome }] : []),
        ],
      },
      {
        tipo: "nota",
        texto: "Comunidade identificada pelo endereço do local de votação no TSE. Na sede, o TSE raramente informa o bairro, então os colégios urbanos ficam juntos em \"Sede\".",
      },
      {
        tipo: "tabela",
        titulo: "Por bairro / comunidade",
        arquivo: arquivo("comunidades", c.nome, P.nomeMun),
        busca: coms.length > 10,
        ordem: [3, true],
        linhas: coms.map((x) => [x.u.nome, x.u.sub, x.u.idx.length, x.meu, razao(x.meu, x.vv), x.vv, x.pos, x.top, x.pos === 1 ? 0 : x.meu - x.topV]),
        colunas: [
          col("Comunidade", "texto"),
          col("Zona", "texto"),
          col("Urnas", "int"),
          col("Votos", "int", { barra: true }),
          col("% válidos", "pct"),
          col("Válidos", "int"),
          col("Posição", "pos"),
          col("Mais votado", "texto"),
          col("Diferença p/ o 1º", "dif"),
        ],
      },
    ];
  },
});

add({
  id: "urnas-disputa",
  grupo: "Locais de votação",
  titulo: "Quem venceu em cada local",
  desc: "Para um cargo, o vencedor, o 2º colocado e a margem em cada comunidade, local de votação ou urna.",
  controles: ["loc", "cargo", "agl"],
  padrao: { cargo: "governador" },
  gerar(B, st) {
    const slug = ehSlug(st.cargo) ? st.cargo : "governador";
    const P = prepUrnas(B, st.loc, slug);
    if ("erro" in P) return [{ tipo: "aviso", texto: P.erro as string }];
    const d = B.cargos[slug];
    const nomeNum = new Map(d.cargo.candidatos.map((x) => [x.n, x]));
    const nm = (n?: string) => {
      const x = n ? nomeNum.get(n) : undefined;
      return x ? rotuloCand(x) : "–";
    };
    const agl = st.agl ?? "com";
    const us = P.unidades(agl).filter((u) => u.idx.length);
    const linhas = us.map((u) => {
      const rk = P.ranking(u.idx);
      const vv = P.soma(P.vv, u.idx);
      const [a, b] = [rk[0], rk[1]];
      return { u, vv, a, b, bn: P.soma(P.bn, u.idx) };
    });
    const venc = new Map<string, number>();
    for (const l of linhas) if (l.a && l.a[1]) venc.set(l.a[0], (venc.get(l.a[0]) ?? 0) + 1);
    const apertada = [...linhas].filter((l) => l.a && l.b && l.vv >= 50).sort((x, y) => razao(x.a![1] - x.b![1], x.vv) - razao(y.a![1] - y.b![1], y.vv))[0];
    const geral = P.ranking(P.todas);
    return [
      ...avisosCargo(B, d),
      {
        tipo: "numeros",
        itens: [
          { rotulo: `Vencedor em ${P.nomeMun}`, valor: nf(geral[0]?.[1] ?? 0), sub: nm(geral[0]?.[0]) },
          { rotulo: AGL_NOME[agl] ?? "Unidades", valor: nf(linhas.length), sub: `${nf(venc.size)} candidatos venceram em alguma` },
          ...[...venc].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, q]) => ({ rotulo: "Venceu em", valor: nf(q), sub: nm(n) })),
          ...(apertada ? [{ rotulo: "Disputa mais apertada", valor: nf(apertada.a![1] - apertada.b![1]), sub: apertada.u.nome }] : []),
        ],
      },
      {
        tipo: "tabela",
        titulo: `Vencedor por ${(AGL_NOME[agl] ?? "").toLowerCase()} · ${d.cargo.nome}`,
        arquivo: arquivo("vencedores", d.cargo.nome, agl, P.nomeMun),
        busca: linhas.length > 10,
        ordem: [2, true],
        linhas: linhas.map((l) => [
          l.u.nome,
          l.u.sub,
          l.vv,
          nm(l.a?.[0]),
          razao(l.a?.[1] ?? 0, l.vv),
          nm(l.b?.[0]),
          razao(l.b?.[1] ?? 0, l.vv),
          (l.a?.[1] ?? 0) - (l.b?.[1] ?? 0),
          l.bn,
        ]),
        colunas: [
          col(AGL_NOME[agl] ?? "Unidade", "texto"),
          col(agl === "com" ? "Zona" : agl === "local" ? "Comunidade" : "Local", "texto"),
          col("Válidos", "int"),
          col("1º colocado", "texto"),
          col("% do 1º", "pct", { casas: 1 }),
          col("2º colocado", "texto"),
          col("% do 2º", "pct", { casas: 1 }),
          col("Margem (votos)", "int", { barra: true }),
          col("Brancos e nulos", "int"),
        ],
      },
    ];
  },
});

add({
  id: "urnas-multi",
  grupo: "Locais de votação",
  titulo: "Vários candidatos por local",
  desc: "Coloca vários candidatos lado a lado (inclusive de cargos diferentes) por comunidade, local de votação ou urna.",
  controles: ["loc", "cands", "agl", "med"],
  padrao: {},
  gerar(B, st) {
    let ids = (st.cands ?? "").split(",").filter((id) => {
      const r = B.candPorId.get(id);
      return !!r;
    });
    if (!ids.length) ids = B.cargos.governador.cargo.candidatos.slice(0, 3).map((x) => x.id);
    const refs = ids.map((id) => B.candPorId.get(id)!).filter(Boolean);
    const base = prepUrnas(B, st.loc, "governador");
    if ("erro" in base) return [{ tipo: "aviso", texto: base.erro as string }];
    const preps = new Map<Slug, ReturnType<typeof prepUrnas>>();
    for (const r of refs) if (!preps.has(r.slug)) preps.set(r.slug, prepUrnas(B, st.loc, r.slug));
    const agl = st.agl ?? "com";
    const us = base.unidades(agl).filter((u) => u.idx.length);
    const pct = st.med === "pct";
    const votosDe = (r: RefCand, idx: number[]) => {
      const P = preps.get(r.slug);
      return !P || "erro" in P ? 0 : P.soma(P.porSec.get(r.c.n), idx);
    };
    const valor = (r: RefCand, idx: number[]) => {
      const P = preps.get(r.slug);
      if (!P || "erro" in P) return 0;
      const v = votosDe(r, idx);
      return pct ? razao(v, P.soma(P.vv, idx)) : v;
    };
    const ignorados = refs.filter((r) => { const P = preps.get(r.slug); return !P || "erro" in P; }).length;
    return [
      ...(ignorados ? [{ tipo: "aviso" as const, texto: "Alguns candidatos ficam de fora: o TSE não publicou votos por seção do cargo deles." }] : []),
      {
        tipo: "numeros",
        itens: refs.map((r) => ({
          rotulo: `${r.c.nome} · ${NOME_CURTO[r.slug]}`,
          valor: pct ? fmtPct(valor(r, base.todas), 1) : nf(valor(r, base.todas)),
          sub: `${pct ? `${nf(votosDe(r, base.todas))} votos` : "votos"} em ${base.nomeMun}`,
        })),
      },
      {
        tipo: "nota",
        texto: pct
          ? "Percentual sobre os válidos do cargo de cada candidato naquela unidade."
          : "Quantidade de votos de cada candidato naquela unidade.",
      },
      {
        tipo: "tabela",
        titulo: `${AGL_NOME[agl] ?? ""} · ${base.nomeMun}`,
        arquivo: arquivo("varios-candidatos", agl, base.nomeMun),
        busca: us.length > 10,
        ordem: [2, true],
        linhas: us.map((u) => [u.nome, u.sub, ...refs.map((r) => valor(r, u.idx))]),
        colunas: [
          col(AGL_NOME[agl] ?? "Unidade", "texto"),
          col(agl === "com" ? "Zona" : agl === "local" ? "Comunidade" : "Local", "texto"),
          ...refs.map((r) => col(`${r.c.nome} (${NOME_CURTO[r.slug]})`, pct ? "pct" : "int", pct ? { casas: 1 } : {})),
        ],
      },
    ];
  },
});

export function opcoesPartido(B: Base, slug: Slug): { n: string; sg: string; total: number }[] {
  return B.cargos[slug].cargo.partidos
    .map((p) => ({ n: p.n, sg: p.sg, total: p.votosTot + p.legenda }))
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total);
}

// ---------- Municípios e regiões

add({
  id: "mun",
  grupo: "Municípios e regiões",
  titulo: "Por município",
  desc: "Vencedor de cada município e o desempenho dos dois mais votados do estado.",
  controles: ["cargo", "escopo"],
  padrao: { cargo: "governador", escopo: "ba" },
  gerar(B, st) {
    const d = B.cargos[slugDe(st, "governador")];
    const set = recorteSet(st.escopo, B);
    const rank = rankPorMunicipio(d);
    const [t1, t2] = d.cargo.candidatos;
    const v1 = mapaVotos(d.votos[0] ?? []);
    const v2 = mapaVotos(d.votos[1] ?? []);
    const linhas: Celula[][] = munsDoRecorte(B, set).map((mi) => {
      const m = B.muns[mi];
      const s = d.stats[mi] ?? [];
      const vv = s[E.vv] ?? 0;
      const [vw, wi] = rank.get(mi)?.[0] ?? [0, -1];
      const w = d.cargo.candidatos[wi];
      return [
        vMun(B, mi),
        m?.ti ?? "",
        m?.ri ?? "",
        s[E.el] ?? 0,
        razao(s[E.co] ?? 0, s[E.el] ?? 0),
        w ? rotuloCand(w) : "–",
        razao(vw, vv),
        t1 ? razao(v1.get(mi) ?? 0, vv) : null,
        t2 ? razao(v2.get(mi) ?? 0, vv) : null,
      ];
    });
    return [
      ...avisosCargo(B, d),
      {
        tipo: "tabela",
        titulo: `${d.cargo.nome} · ${recorteNome(st.escopo, B)}`,
        arquivo: arquivo("municipios", d.slug, recorteNome(st.escopo, B)),
        busca: true,
        linhas,
        colunas: [
          col("Município", "mun"),
          col("Território", "texto"),
          col("Região", "texto"),
          col("Eleitores", "int"),
          col("Comparec.", "pct"),
          col("Vencedor", "texto"),
          col("% venc.", "pct"),
          col(`% ${t1?.nome ?? "1º"}`, "pct"),
          col(`% ${t2?.nome ?? "2º"}`, "pct"),
        ],
      },
    ];
  },
});

add({
  id: "cidade",
  grupo: "Municípios e regiões",
  titulo: "Boletim da cidade",
  desc: "Resultado de todos os cargos em um município, com participação, brancos e nulos.",
  controles: ["mun"],
  padrao: {},
  gerar(B, st) {
    const mi = B.porTse.get(st.mun ?? "") ?? B.porTse.get(municipioPadrao(B)) ?? 0;
    const m = B.muns[mi];
    if (!m) return [{ tipo: "aviso", texto: "Escolha um município." }];
    const g = B.cargos.governador.stats[mi] ?? [];
    const blocos: Bloco[] = [
      {
        tipo: "destaque",
        kicker: m.ti ?? "",
        titulo: m.nome,
        sub: `Região intermediária ${m.ri} · região imediata ${m.rim} · código IBGE ${m.ibge}`,
      },
      {
        tipo: "numeros",
        itens: [
          { rotulo: "Eleitorado", valor: nf(g[E.el] ?? 0) },
          {
            rotulo: "Comparecimento",
            valor: fmtPct(razao(g[E.co] ?? 0, g[E.el] ?? 0), 1),
            sub: nf(g[E.co] ?? 0),
          },
          {
            rotulo: "Abstenção",
            valor: fmtPct(razao(g[E.ab] ?? 0, g[E.el] ?? 0), 1),
            sub: nf(g[E.ab] ?? 0),
          },
        ],
      },
    ];
    for (const slug of SLUGS) {
      const d = B.cargos[slug];
      const s = d.stats[mi] ?? [];
      const tv = s[E.tv] ?? 0;
      const lst = (rankPorMunicipio(d).get(mi) ?? []).map(([v, ci], k) => ({
        c: d.cargo.candidatos[ci] as Candidato,
        v,
        k,
      }));
      const parcial = d.cargo.parciais?.find((p) => p.tse === m.tse);
      if (parcial)
        blocos.push({
          tipo: "aviso",
          texto: `${d.cargo.nome}: o arquivo do TSE para esta cidade está com ${fmtPct(parcial.pst, 1)} das seções apuradas.`,
        });
      blocos.push(
        {
          tipo: "nota",
          texto: `${d.cargo.nome} — válidos ${nf(s[E.vv] ?? 0)} · brancos ${fmtPct(razao(s[E.vb] ?? 0, tv), 1)} · nulos ${fmtPct(razao(s[E.vn] ?? 0, tv), 1)}${d.proporcional ? ` · legenda ${fmtPct(razao(s[E.leg] ?? 0, s[E.vv] ?? 0), 1)}` : ""}`,
        },
        {
          tipo: "tabela",
          titulo: d.cargo.nome,
          arquivo: arquivo("boletim", m.nome, slug),
          ordem: [0, false],
          pagina: d.proporcional ? 15 : 50,
          busca: d.proporcional,
          linhas: lst.map(({ c, v, k }) => [
            k + 1,
            vCand(c),
            c.partido,
            v,
            razao(v, s[E.vv] ?? 0),
            c.pct,
            vSit(c),
          ]),
          colunas: [
            col("Pos.", "pos"),
            col("Candidato", "cand"),
            col("Partido", "texto"),
            col("Votos", "int", { barra: true }),
            col("% válidos", "pct"),
            col("% na Bahia", "pct"),
            col("Situação (estado)", "sit"),
          ],
        },
      );
    }
    return blocos;
  },
});

add({
  id: "vencedores",
  grupo: "Municípios e regiões",
  titulo: "Vencedor por município",
  desc: "Quem foi o mais votado em cada município, com o 2º colocado e a margem.",
  controles: ["cargo", "escopo"],
  padrao: { cargo: "governador", escopo: "ba" },
  gerar(B, st) {
    const d = B.cargos[slugDe(st, "governador")];
    const set = recorteSet(st.escopo, B);
    const rank = rankPorMunicipio(d);
    const resumo = new Map<number, { n: number; el: number }>();
    const linhas: Celula[][] = munsDoRecorte(B, set).map((mi) => {
      const s = d.stats[mi] ?? [];
      const vv = s[E.vv] ?? 0;
      const [v1, c1] = rank.get(mi)?.[0] ?? [0, -1];
      const [v2, c2] = rank.get(mi)?.[1] ?? [0, -1];
      const a = d.cargo.candidatos[c1];
      const b = d.cargo.candidatos[c2];
      if (a) {
        const x = resumo.get(c1) ?? { n: 0, el: 0 };
        x.n++;
        x.el += s[E.el] ?? 0;
        resumo.set(c1, x);
      }
      return [
        vMun(B, mi),
        B.muns[mi]?.ti ?? "",
        s[E.el] ?? 0,
        a ? rotuloCand(a) : "–",
        v1,
        razao(v1, vv),
        b ? rotuloCand(b) : "–",
        v2,
        razao(v2, vv),
        razao(v1 - v2, vv),
        v1 - v2,
      ];
    });
    const total = linhas.length;
    return [
      ...avisosCargo(B, d),
      {
        tipo: "tabela",
        titulo: `Quem venceu mais municípios · ${d.cargo.nome} · ${recorteNome(st.escopo, B)}`,
        arquivo: arquivo("municipios-vencidos", d.slug, recorteNome(st.escopo, B)),
        ordem: [2, true],
        pagina: 20,
        linhas: [...resumo].map(([ci, x]) => {
          const c = d.cargo.candidatos[ci] as Candidato;
          return [vCand(c), c.partido, x.n, razao(x.n, total), x.el, vSit(c)];
        }),
        colunas: [
          col("Candidato", "cand"),
          col("Partido", "texto"),
          col("Municípios vencidos", "int", { barra: true }),
          col("% dos municípios", "pct", { casas: 1 }),
          col("Eleitorado desses municípios", "int"),
          col("Situação", "sit"),
        ],
      },
      {
        tipo: "tabela",
        titulo: "Município a município",
        arquivo: arquivo("vencedores", d.slug, recorteNome(st.escopo, B)),
        busca: true,
        ordem: [2, true],
        linhas,
        colunas: [
          col("Município", "mun"),
          col("Território", "texto"),
          col("Eleitorado", "int"),
          col("1º colocado", "texto"),
          col("Votos do 1º", "int"),
          col("% do 1º", "pct", { casas: 1 }),
          col("2º colocado", "texto"),
          col("Votos do 2º", "int"),
          col("% do 2º", "pct", { casas: 1 }),
          col("Margem (p.p.)", "pct", { casas: 1 }),
          col("Margem (votos)", "int"),
        ],
      },
    ];
  },
});

add({
  id: "reg",
  grupo: "Municípios e regiões",
  titulo: "Por região",
  desc: "Participação e os mais votados em cada Território de Identidade ou região do IBGE.",
  controles: ["reg", "cargo"],
  padrao: { reg: "ri", cargo: "governador" },
  gerar(B, st) {
    const d = B.cargos[slugDe(st, "governador")];
    const chave: ChaveRegiao = ehRegiao(st.reg) ? st.reg : "ri";
    const somaReg = new Map<string, Map<number, number>>();
    d.votos.forEach((f, ci) => {
      for (let k = 0; k < f.length; k += 2) {
        const r = B.muns[f[k] as number]?.[chave] ?? "";
        let m = somaReg.get(r);
        if (!m) somaReg.set(r, (m = new Map()));
        m.set(ci, (m.get(ci) ?? 0) + (f[k + 1] as number));
      }
    });
    const grupos = agrupar(B, null, chave, d);
    const linhas: Celula[][] = grupos.map((g) => {
      const top = [...(somaReg.get(g.nome) ?? new Map<number, number>())]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      const cel = (k: number): Celula[] => {
        const t = top[k];
        const c = t ? d.cargo.candidatos[t[0]] : undefined;
        return t && c ? [rotuloCand(c), razao(t[1], g.s[E.vv] ?? 0)] : ["–", null];
      };
      return [
        g.nome,
        g.n,
        g.s[E.el] ?? 0,
        razao(g.s[E.co] ?? 0, g.s[E.el] ?? 0),
        ...cel(0),
        ...cel(1),
        ...cel(2),
      ];
    });
    const blocos: Bloco[] = [
      ...avisosCargo(B, d),
      {
        tipo: "tabela",
        titulo: `${d.cargo.nome} por ${REGIOES[chave]}`,
        arquivo: arquivo("regioes", chave, d.slug),
        ordem: [2, true],
        linhas,
        colunas: [
          col("Região", "texto"),
          col("Municípios", "int"),
          col("Eleitores", "int"),
          col("Comparec.", "pct", { casas: 1 }),
          col("1º", "texto"),
          col("%", "pct", { casas: 1 }),
          col("2º", "texto"),
          col("%", "pct", { casas: 1 }),
          col("3º", "texto"),
          col("%", "pct", { casas: 1 }),
        ],
      },
    ];
    if (!d.proporcional) {
      const principais = d.cargo.candidatos.slice(0, 4);
      blocos.push({
        tipo: "tabela",
        titulo: "Percentual dos válidos em cada região",
        arquivo: arquivo("matriz", chave, d.slug),
        ordem: [1, true],
        linhas: grupos.map((g) => [
          g.nome,
          ...principais.map((_, ci) => razao(somaReg.get(g.nome)?.get(ci) ?? 0, g.s[E.vv] ?? 0)),
        ]),
        colunas: [
          col("Região", "texto"),
          ...principais.map((c) => col(c.nome, "pct", { casas: 1, barra: true })),
        ],
      });
    }
    return blocos;
  },
});

// ---------- Dados

add({
  id: "downloads",
  grupo: "Dados abertos",
  titulo: "Baixar dados (CSV)",
  desc: "Planilhas completas para Excel, Power BI ou Google Sheets.",
  controles: [],
  padrao: {},
  gerar() {
    return [
      {
        tipo: "downloads",
        itens: [
          {
            id: "cands",
            titulo: "Candidatos de todos os cargos",
            desc: "nome, partido, votos, situação, ordem de suplência, quanto faltou",
          },
          {
            id: "muns",
            titulo: "Municípios × cargo",
            desc: "eleitorado, comparecimento, abstenção, válidos, brancos, nulos e legenda, com território e regiões",
          },
          ...SLUGS.map((s) => ({
            id: `votos:${s}`,
            titulo: `Votos por candidato e município: ${NOME_CURTO[s]}`,
            desc: "uma linha por candidato em cada município, com % dos válidos e posição",
          })),
          ...PROPORCIONAIS.map((s) => ({
            id: `leg:${s}`,
            titulo: `Votos de legenda por partido e município: ${NOME_CURTO[s]}`,
            desc: "voto dado só ao número do partido",
          })),
        ],
      },
    ];
  },
});

export function baixarDados(B: Base, id: string) {
  if (id === "cands") {
    downloadCSV("candidatos-ba-2026.csv", [
      [
        "Cargo",
        "Número",
        "Nome de urna",
        "Nome completo",
        "Partido",
        "Agremiação",
        "Votos",
        "% válidos",
        "Situação",
        "Projeção",
        "Ordem",
        "Faltou",
        "Margem",
      ],
      ...SLUGS.flatMap((s) =>
        B.cargos[s].cargo.candidatos.map((c) => [
          B.cargos[s].cargo.nome,
          c.n,
          c.nome,
          c.nomeCompleto,
          c.partido,
          c.agr,
          c.votos,
          c.pct.toFixed(3),
          textoSituacao(c),
          c.proj ? "sim" : "não",
          c.ordem ?? "",
          c.faltou ?? "",
          c.margem ?? "",
        ]),
      ),
    ]);
  } else if (id === "muns") {
    downloadCSV("municipios-ba-2026.csv", [
      [
        "Código IBGE",
        "Código TSE",
        "Município",
        "Território",
        "Região intermediária",
        "Região imediata",
        "Cargo",
        "Eleitorado",
        "Comparecimento",
        "Abstenção",
        "Válidos",
        "Brancos",
        "Nulos",
        "Total de votos",
        "Legenda",
      ],
      ...B.muns.flatMap((m, mi) =>
        SLUGS.map((s) => [
          m.ibge,
          m.tse,
          m.nome,
          m.ti ?? "",
          m.ri,
          m.rim,
          B.cargos[s].cargo.nome,
          ...(B.cargos[s].stats[mi] ?? []),
        ]),
      ),
    ]);
  } else if (id.startsWith("votos:")) {
    const slug = id.slice(6);
    if (!ehSlug(slug)) return;
    const d = B.cargos[slug];
    const linhas: (string | number)[][] = [
      [
        "Cargo",
        "Número",
        "Nome de urna",
        "Partido",
        "Código IBGE",
        "Município",
        "Território",
        "Votos",
        "% válidos no município",
        "Posição no município",
      ],
    ];
    d.cargo.candidatos.forEach((c, ci) => {
      const f = d.votos[ci] ?? [];
      for (let k = 0; k < f.length; k += 2) {
        const mi = f[k] as number;
        const m = B.muns[mi];
        linhas.push([
          d.cargo.nome,
          c.n,
          c.nome,
          c.partido,
          m?.ibge ?? "",
          m?.nome ?? "",
          m?.ti ?? "",
          f[k + 1] as number,
          razao(f[k + 1] as number, d.stats[mi]?.[E.vv] ?? 0).toFixed(3),
          posicaoNoMunicipio(d, ci, mi) ?? "",
        ]);
      }
    });
    downloadCSV(`votos-${slug}-municipio-ba-2026.csv`, linhas);
  } else if (id.startsWith("leg:")) {
    const slug = id.slice(4);
    if (!ehSlug(slug)) return;
    const d = B.cargos[slug];
    const sg = new Map(d.cargo.partidos.map((p) => [p.n, p.sg]));
    const linhas: (string | number)[][] = [
      [
        "Cargo",
        "Número do partido",
        "Partido",
        "Código IBGE",
        "Município",
        "Território",
        "Votos de legenda",
      ],
    ];
    for (const [pn, f] of d.legenda) {
      for (let k = 0; k < f.length; k += 2) {
        const m = B.muns[f[k] as number];
        linhas.push([
          d.cargo.nome,
          pn,
          sg.get(pn) ?? "",
          m?.ibge ?? "",
          m?.nome ?? "",
          m?.ti ?? "",
          f[k + 1] as number,
        ]);
      }
    }
    downloadCSV(`legenda-${slug}-municipio-ba-2026.csv`, linhas);
  }
}

export const tabelasDe = (blocos: Bloco[]): BlocoTabela[] =>
  blocos.filter((b): b is BlocoTabela => b.tipo === "tabela");
