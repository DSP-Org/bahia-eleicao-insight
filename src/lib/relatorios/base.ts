// Estruturas de apoio dos relatórios: votos por candidato e município, recortes geográficos e rankings.
import type { Candidato, Cargo, Meta, MunData, Municipio, SitTipo } from "@/lib/eleicoes";
import { slugify } from "@/lib/eleicoes";

export const SLUGS = [
  "presidente",
  "governador",
  "senador",
  "deputado-federal",
  "deputado-estadual",
] as const;
export type Slug = (typeof SLUGS)[number];
export const PROPORCIONAIS: readonly Slug[] = ["deputado-federal", "deputado-estadual"];
export const NOME_CURTO: Record<Slug, string> = {
  presidente: "Presidente",
  governador: "Governador",
  senador: "Senador",
  "deputado-federal": "Dep. Federal",
  "deputado-estadual": "Dep. Estadual",
};
export const ehSlug = (s: string | undefined): s is Slug =>
  !!s && (SLUGS as readonly string[]).includes(s);

// Regionalizações disponíveis em municipios.json.
export const REGIOES = {
  ti: "Território de Identidade",
  ri: "Região intermediária (IBGE)",
  rim: "Região imediata (IBGE)",
} as const;
export type ChaveRegiao = keyof typeof REGIOES;
export const ehRegiao = (s: string | undefined): s is ChaveRegiao =>
  s === "ti" || s === "ri" || s === "rim";

// Posições do vetor de estatísticas de um município (ou recorte) num cargo.
export const E = { el: 0, co: 1, ab: 2, vv: 3, vb: 4, vn: 5, tv: 6, leg: 7 } as const;

export type DadosCargo = {
  slug: Slug;
  cargo: Cargo;
  proporcional: boolean;
  stats: number[][]; // por índice de município
  votos: number[][]; // por índice de candidato: [municipio, votos, municipio, votos, ...]
  legenda: Map<string, number[]>; // número do partido → [municipio, votos, ...]
  rank?: Map<number, [number, number][]>; // municipio → [[votos, candidato]] em ordem decrescente
};

export type RefCand = { c: Candidato; i: number; slug: Slug };

// Votos seção a seção (public/data/secoes.json, gerado por scripts/gerar-secoes.py) só para alguns municípios.
export type SecoesCargo = { bv: number[]; c: Record<string, number[]>; l: Record<string, number[]> };
export type SecoesMun = {
  nome: string;
  locais: { n: string; z: number; nome: string; end: string }[];
  secoes: [number, number, number][]; // zona, seção, índice do local
  cargos: Partial<Record<Slug, SecoesCargo>>;
};
export type SecoesData = { geradoEm: string; fonte: string; muns: Record<string, SecoesMun> };

export type Base = {
  meta: Meta;
  muns: Municipio[];
  porTse: Map<string, number>;
  cargos: Record<Slug, DadosCargo>;
  candPorId: Map<string, RefCand>;
  buscaMun: string[]; // nome sem acento, por índice
  secoes?: SecoesData;
};

export function montarBase(meta: Meta, muns: Municipio[], dados: Record<Slug, MunData>): Base {
  const porTse = new Map(muns.map((m, i) => [m.tse, i]));
  const cargos = {} as Record<Slug, DadosCargo>;
  const candPorId = new Map<string, RefCand>();
  for (const slug of SLUGS) {
    const cargo = meta.cargos.find((c) => c.slug === slug);
    if (!cargo) throw new Error(`Cargo ${slug} ausente em meta.json`);
    const md = dados[slug];
    const votos: number[][] = cargo.candidatos.map(() => []);
    const legenda = new Map<string, number[]>();
    const stats = muns.map((m, mi) => {
      const r = md[m.tse];
      if (!r) return [0, 0, 0, 0, 0, 0, 0, 0];
      for (const [k, v] of Object.entries(r.v)) votos[Number(k)]?.push(mi, v);
      let leg = 0;
      for (const [p, v] of Object.entries(r.l ?? {})) {
        leg += v;
        let lst = legenda.get(p);
        if (!lst) legenda.set(p, (lst = []));
        lst.push(mi, v);
      }
      return [r.el, r.co, r.ab, r.vv, r.vb, r.vn, r.tv ?? r.co, leg];
    });
    cargos[slug] = {
      slug,
      cargo,
      proporcional: PROPORCIONAIS.includes(slug),
      stats,
      votos,
      legenda,
    };
    cargo.candidatos.forEach((c, i) => candPorId.set(c.id, { c, i, slug }));
  }
  return { meta, muns, porTse, cargos, candPorId, buscaMun: muns.map((m) => slugify(m.nome)) };
}

// Estatísticas do recorte; na Bahia inteira usa o total oficial do arquivo estadual do TSE.
export function statsRecorte(d: DadosCargo, set: Set<number> | null): number[] {
  if (!set) {
    const r = d.cargo.resumo;
    return [
      r.eleitores,
      r.comp,
      r.abst,
      r.validos,
      r.brancos,
      r.nulos,
      r.total,
      d.cargo.partidos.reduce((s, p) => s + p.legenda, 0),
    ];
  }
  const out = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const mi of set)
    d.stats[mi]?.forEach((x, k) => {
      out[k] = (out[k] ?? 0) + x;
    });
  return out;
}

export function somaRecorte(flat: number[], set: Set<number> | null): number {
  let v = 0;
  for (let i = 0; i < flat.length; i += 2)
    if (!set || set.has(flat[i] as number)) v += flat[i + 1] as number;
  return v;
}

export const razao = (a: number, b: number) => (b ? (a / b) * 100 : 0);

export type LinhaRanking = {
  ref: RefCand;
  v: number;
  p: number;
  nc: number;
  red: number;
  redV: number;
  pos: number;
};

// Votos de todos os candidatos de um cargo no recorte, em ordem decrescente.
export function rankingRecorte(
  B: Base,
  d: DadosCargo,
  set: Set<number> | null,
): { linhas: LinhaRanking[]; validos: number } {
  const validos = statsRecorte(d, set)[E.vv] ?? 0;
  const linhas = d.cargo.candidatos.map((c, i) => {
    const flat = d.votos[i] ?? [];
    let v = 0;
    let nc = 0;
    let red = -1;
    let redV = 0;
    for (let k = 0; k < flat.length; k += 2) {
      const mi = flat[k] as number;
      const x = flat[k + 1] as number;
      if (set && !set.has(mi)) continue;
      v += x;
      nc++;
      if (x > redV) {
        redV = x;
        red = mi;
      }
    }
    if (!set) v = c.votos; // total oficial
    return {
      ref: { c, i, slug: d.slug },
      v,
      p: set ? razao(v, validos) : c.pct,
      nc,
      red,
      redV,
      pos: 0,
    };
  });
  linhas.sort((a, b) => b.v - a.v || a.ref.c.nome.localeCompare(b.ref.c.nome));
  linhas.forEach((l, k) => {
    l.pos = k + 1;
  });
  return { linhas, validos };
}

// Ranking dos candidatos dentro de cada município (calculado uma vez por cargo).
export function rankPorMunicipio(d: DadosCargo): Map<number, [number, number][]> {
  if (d.rank) return d.rank;
  const rank = new Map<number, [number, number][]>();
  d.votos.forEach((flat, ci) => {
    for (let k = 0; k < flat.length; k += 2) {
      const mi = flat[k] as number;
      let lst = rank.get(mi);
      if (!lst) rank.set(mi, (lst = []));
      lst.push([flat[k + 1] as number, ci]);
    }
  });
  for (const lst of rank.values()) lst.sort((a, b) => b[0] - a[0]);
  d.rank = rank;
  return rank;
}

export function posicaoNoMunicipio(d: DadosCargo, ci: number, mi: number): number | null {
  const lst = rankPorMunicipio(d).get(mi);
  const k = lst ? lst.findIndex((x) => x[1] === ci) : -1;
  return k >= 0 ? k + 1 : null;
}

// ------------------------------------------------------------------ recortes
// escopo: "ba" | "ti:<nome>" | "ri:<nome>" | "rim:<nome>" | "mun:<tse>" | "muns:<tse>,<tse>"

export function recorteSet(escopo: string | undefined, B: Base): Set<number> | null {
  if (!escopo || escopo === "ba") return null;
  const i = escopo.indexOf(":");
  const tipo = escopo.slice(0, i);
  const valor = escopo.slice(i + 1);
  if (tipo === "mun" || tipo === "muns") {
    return new Set(
      valor
        .split(",")
        .map((t) => B.porTse.get(t))
        .filter((x): x is number => x != null),
    );
  }
  if (ehRegiao(tipo)) return new Set(B.muns.flatMap((m, mi) => (m[tipo] === valor ? [mi] : [])));
  return null;
}

export function recorteNome(escopo: string | undefined, B: Base): string {
  if (!escopo || escopo === "ba") return "Bahia inteira";
  const i = escopo.indexOf(":");
  const tipo = escopo.slice(0, i);
  const valor = escopo.slice(i + 1);
  if (tipo === "mun" || tipo === "muns") {
    const nomes = valor
      .split(",")
      .map((t) => B.muns[B.porTse.get(t) ?? -1]?.nome)
      .filter(Boolean);
    return nomes.length <= 3 ? nomes.join(", ") : `${nomes.length} municípios`;
  }
  return ehRegiao(tipo) ? `${valor} (${REGIOES[tipo].split(" (")[0]})` : "Bahia inteira";
}

export function nomesRegioes(chave: ChaveRegiao, muns: Municipio[]): string[] {
  return [...new Set(muns.map((m) => m[chave]).filter((x): x is string => !!x))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

export function munsDoRecorte(B: Base, set: Set<number> | null): number[] {
  return set ? [...set].sort((a, b) => a - b) : B.muns.map((_, i) => i);
}

// ------------------------------------------------------------------ situação

export function tipoSituacao(c: Candidato): SitTipo {
  return c.sitTipo ?? (c.eleito ? "eleito" : c.situacao ? "nao_eleito" : "aguardando");
}
export function textoSituacao(c: Candidato): string {
  return c.sit || c.situacao || "—";
}
