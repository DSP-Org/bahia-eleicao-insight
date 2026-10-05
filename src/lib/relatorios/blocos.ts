// Um relatório é uma lista de blocos. A mesma lista é desenhada na tela, exportada em CSV e em PDF.
import type { SitTipo } from "@/lib/eleicoes";

export type TipoColuna = "texto" | "int" | "pct" | "pos" | "dif" | "corr" | "cand" | "mun" | "sit";
export type Coluna = {
  titulo: string;
  tipo: TipoColuna;
  casas?: number;
  barra?: boolean;
  dica?: string;
};

export type ValorCand = { nome: string; sub: string; id: string };
export type ValorMun = { nome: string; tse: string };
export type ValorSit = { texto: string; tipo: SitTipo; proj: boolean };
export type Celula = string | number | null | ValorCand | ValorMun | ValorSit;

export type BlocoTabela = {
  tipo: "tabela";
  titulo: string;
  colunas: Coluna[];
  linhas: Celula[][];
  ordem?: [number, boolean]; // coluna e se é decrescente
  arquivo: string;
  pagina?: number;
  busca?: boolean;
  legenda?: { cor: string; texto: string }[];
};

export type Bloco =
  | { tipo: "numeros"; itens: { rotulo: string; valor: string; sub?: string }[] }
  | { tipo: "aviso"; texto: string }
  | { tipo: "nota"; texto: string }
  | {
      tipo: "destaque";
      kicker: string;
      titulo: string;
      sub: string;
      sit?: ValorSit;
      candidato?: string;
    }
  | { tipo: "downloads"; itens: { id: string; titulo: string; desc: string }[] }
  | BlocoTabela;

const nf = (n: number) => n.toLocaleString("pt-BR");

export function fmtPct(n: number, casas = 2): string {
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

const ehObj = (c: Celula): c is ValorCand | ValorMun | ValorSit =>
  typeof c === "object" && c !== null;

// Texto puro da célula (busca, CSV e PDF).
export function textoCelula(c: Celula, col: Coluna): string {
  if (c == null || c === "") return col.tipo === "texto" ? "" : "–";
  if (ehObj(c)) {
    if ("id" in c) return `${c.nome} (${c.sub})`;
    if ("tse" in c) return c.nome;
    return c.texto;
  }
  if (typeof c === "string") return c;
  switch (col.tipo) {
    case "pct":
      return fmtPct(c, col.casas ?? 2);
    case "pos":
      return `${c}º`;
    case "dif":
      return c > 0 ? `+${nf(c)}` : nf(c);
    case "corr":
      return `${c > 0 ? "+" : ""}${c.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    default:
      return nf(c);
  }
}

const ORDEM_SIT: Record<SitTipo, number> = {
  eleito: 0,
  segundo_turno: 1,
  suplente: 2,
  aguardando: 3,
  nao_eleito: 4,
};

export function valorOrdenacao(c: Celula): number | string | null {
  if (c == null || c === "") return null;
  if (ehObj(c)) {
    if ("tipo" in c) return ORDEM_SIT[c.tipo] * 1e6 + (Number.parseInt(c.texto, 10) || 0);
    return c.nome;
  }
  return c;
}

// Ordena as linhas por uma coluna; vazios sempre no fim.
export function ordenarLinhas(linhas: Celula[][], coluna: number, desc: boolean): Celula[][] {
  return [...linhas].sort((a, b) => {
    const va = valorOrdenacao(a[coluna] ?? null);
    const vb = valorOrdenacao(b[coluna] ?? null);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const d =
      typeof va === "string" || typeof vb === "string"
        ? String(va).localeCompare(String(vb), "pt-BR")
        : va - vb;
    return desc ? -d : d;
  });
}

export const linhasIniciais = (t: BlocoTabela) =>
  t.ordem ? ordenarLinhas(t.linhas, t.ordem[0], t.ordem[1]) : t.linhas;

// Valor numérico usado no CSV (números crus, sem separador de milhar).
export function valorCSV(c: Celula, col: Coluna): string | number {
  if (typeof c === "number")
    return col.tipo === "pct" || col.tipo === "corr" ? Number(c.toFixed(col.casas ?? 3)) : c;
  return textoCelula(c, col);
}
