import { describe, expect, it } from "vitest";
import { layoutTabelaPDF } from "@/lib/report-pdf-layout";
import type { BlocoTabela } from "@/lib/relatorios/blocos";

const medir = (s: string) => s.length * 4;
const tabela = (quantidade: number): BlocoTabela => ({
  tipo: "tabela",
  titulo: "Comparação",
  colunas: [
    { titulo: "Bairro / comunidade", tipo: "texto" },
    ...Array.from({ length: quantidade }, () => ({ titulo: "Candidato (Governador)", tipo: "int" as const })),
  ],
  linhas: [["Sede (zona urbana)", ...Array(quantidade).fill(10019)]],
});

describe("layout dos PDFs", () => {
  it("mantém comparações compactas em retrato sem fragmentar palavras dos cabeçalhos", () => {
    const layout = layoutTabelaPDF(tabela(3), medir);
    expect(layout.orientacao).toBe("retrato");
    expect(layout.larguras[1]).toBeGreaterThanOrEqual(medir("(Governador)") + 10);
    expect(layout.larguras.reduce((a, b) => a + b, 0)).toBeCloseTo(523.28);
  });
  it("usa paisagem quando muitas colunas não cabem confortavelmente", () => {
    expect(layoutTabelaPDF(tabela(10), medir).orientacao).toBe("paisagem");
  });
});