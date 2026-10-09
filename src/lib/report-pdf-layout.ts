import type { BlocoTabela } from "@/lib/relatorios/blocos";
import { textoCelula } from "@/lib/relatorios/blocos";

export type OrientacaoPDF = "retrato" | "paisagem";
const UTIL_RETRATO = 595.28 - 72;
const UTIL_PAISAGEM = 841.89 - 72;
const NUMERICO = new Set(["int", "pct", "pos", "dif", "corr"]);

// Títulos podem ocupar várias linhas; são os valores que precisam caber sem
// fragmentar números. Colunas de texto recebem espaço para palavras e nomes.
export function layoutTabelaPDF(
  tabela: BlocoTabela,
  medir: (texto: string, negrito?: boolean) => number,
): { orientacao: OrientacaoPDF; larguras: number[] } {
  if (tabela.apresentacao?.tipo === "bancadas")
    return { orientacao: "retrato", larguras: [] };
  const limites = tabela.colunas.map((coluna, i) => {
    const valores = tabela.linhas.map((linha) => textoCelula(linha[i] ?? null, coluna));
    const numero = NUMERICO.has(coluna.tipo);
    const palavra = valores.reduce((max, v) => v.split(/\s+/).reduce((n, p) => Math.max(n, medir(p)), max), 0);
    const valor = valores.reduce((max, v) => Math.max(max, medir(v)), 0);
    const titulo = Math.max(0, ...coluna.titulo.split(/\s+/).map((p) => medir(p, true)));
    const minimo = numero
      ? Math.max(32, valor + 10, titulo + 10)
      : Math.max(48, Math.min(palavra + 10, 86));
    const ideal = numero ? minimo : Math.max(minimo, Math.min(valor + 10, 160));
    return { minimo, ideal };
  });
  const soma = limites.reduce((n, c) => n + c.minimo, 0);
  const orientacao = soma <= UTIL_RETRATO ? "retrato" : "paisagem";
  const util = orientacao === "retrato" ? UTIL_RETRATO : UTIL_PAISAGEM;
  const extra = Math.max(0, util - soma);
  const demanda = limites.reduce((n, c) => n + c.ideal - c.minimo, 0);
  const larguras = limites.map((c) =>
    soma > util
      ? (c.minimo * util) / soma
      : c.minimo + (demanda ? extra * (c.ideal - c.minimo) / demanda : extra / limites.length),
  );
  return { orientacao, larguras };
}