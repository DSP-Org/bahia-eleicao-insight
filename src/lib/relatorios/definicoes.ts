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
  mun?: string;
  muns?: string; // códigos TSE separados por vírgula; vazio = Bahia toda
  agr?: string;
  cargob?: string;
  min?: string;
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
  | "mun"
  | "muns"
  | "agr"
  | "cargob"
  | "min";

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
        titulo: `Ranking do cargo · ${nomeRecorte}`,
        arquivo: arquivo("dossie2-ranking", c.nome, nomeRecorte),
        ordem: [0, false],
        pagina: 15,
        linhas: rk
          .filter((x) => x.v > 0)
          .map((x, k) => [k + 1, vCand(x.ref.c), x.ref.c.partido, x.v, razao(x.v, validos), x.v - v]),
        colunas: [
          col("Pos.", "pos"),
          col("Candidato", "cand"),
          col("Partido", "texto"),
          col("Votos", "int", { barra: true }),
          col("% válidos", "pct"),
          col(`Diferença p/ ${c.nome}`, "dif"),
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
