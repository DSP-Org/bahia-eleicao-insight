import { describe, expect, it } from "vitest";
import { criarEvolucaoTurnos } from "@/lib/indicadores";
import { RELATORIOS, partesEscopo } from "@/lib/relatorios/definicoes";
import { montarBase, recorteNome } from "@/lib/relatorios/base";
import type { BlocoTabela } from "@/lib/relatorios/blocos";
import meta from "../../public/data/meta.json";
import municipios from "../../public/data/municipios.json";
import p1 from "../../public/data/mun-presidente.json";
import p2 from "../../public/data/mun-presidente-2t.json";
import gov from "../../public/data/mun-governador.json";
import sen from "../../public/data/mun-senador.json";
import dfed from "../../public/data/mun-deputado-federal.json";
import dest from "../../public/data/mun-deputado-estadual.json";
import type { Cargo, Meta, MunData, Municipio } from "@/lib/eleicoes";

const base = montarBase(
  meta as unknown as Meta,
  municipios as unknown as Municipio[],
  {
    presidente: p1 as MunData,
    "presidente-2t": p2 as MunData,
    governador: gov as MunData,
    senador: sen as MunData,
    "deputado-federal": dfed as MunData,
    "deputado-estadual": dest as MunData,
  },
);

describe("Evolução entre turnos (Presidente)", () => {
  const c = (s: string) => meta.cargos.find((x) => x.slug === s) as unknown as Cargo;
  const cards = criarEvolucaoTurnos(c("presidente"), c("presidente-2t"), municipios, p1 as MunData, p2 as MunData).cards;
  const v = (l: string) => cards.find((x) => x.label === l)?.value;
  it("soma os municípios até o total oficial do 2º turno", () => {
    expect(v("LULA no 2º turno")).toBe("6.485.258");
    expect(v("FLAVIO BOLSONARO no 2º turno")).toBe("2.608.761");
  });
  it("calcula o ganho de votos de Lula entre os turnos", () => {
    expect(v("Ganho de votos · LULA")).toBe("+821.454");
  });
  it("nenhum município mudou de vencedor", () => {
    expect(v("Municípios que mudaram de vencedor")).toBe("0");
  });
});

describe("Evolução por território (relatório)", () => {
  const rel = RELATORIOS.find((r) => r.id === "turnos-territorio");
  const tabelas = (st: Record<string, string>) => {
    if (!rel) throw new Error("Relatório ausente");
    return rel.gerar(base, st).filter((b) => b.tipo === "tabela") as BlocoTabela[];
  };
  const escopos = "ti:Velho Chico|ti:Itaparica";

  it("sem recortes mantém os 27 territórios em todas as leituras", () => {
    for (const t of tabelas({ reg: "ti" })) expect(t.linhas).toHaveLength(27);
  });

  it("mantém os dois territórios escolhidos sem repetir a mesma comparação", () => {
    const ts = tabelas({ reg: "ti", escopos });
    expect(ts).toHaveLength(6);
    for (const t of ts) expect(t.linhas.map((r) => r[0]).sort()).toEqual(["Itaparica", "Velho Chico"]);
    expect(partesEscopo(escopos)).toHaveLength(2);
  });

  it.each(["13", "22"])("preserva votos e percentuais ao selecionar só o finalista %s", (fin) => {
    const completas = tabelas({ reg: "ti", escopos });
    const filtradas = tabelas({ reg: "ti", escopos, fin });
    expect(filtradas).toHaveLength(4);
    const inicio = fin === "13" ? 0 : 2;
    expect(filtradas[0]?.linhas).toEqual(completas[inicio]?.linhas);
    expect(filtradas[1]?.linhas).toEqual(completas[inicio + 1]?.linhas);
    // Faltas e comparecimento não dependem do candidato escolhido.
    expect(filtradas.slice(-2).map((t) => t.linhas)).toEqual(completas.slice(-2).map((t) => t.linhas));
  });

  it("separa faltas de votos, usando o eleitorado de cada turno como denominador", () => {
    const ts = tabelas({ reg: "ti", fin: "13" });
    const faltas = ts.at(-1);
    if (!faltas) throw new Error("Faltas ausentes");
    for (const r of faltas.linhas) {
      const mis = municipios.flatMap((m, i) => m.ti === r[0] ? [i] : []);
      const soma = (dados: MunData, indice: number) => mis.reduce((n, i) => {
        const municipio = municipios[i];
        const valores = municipio ? dados[municipio.tse] : null;
        return n + (indice === 2 ? valores?.ab ?? 0 : valores?.el ?? 0);
      }, 0);
      const a1 = soma(p1 as MunData, 2), a2 = soma(p2 as MunData, 2);
      expect(r[1]).toBe(a1);
      expect(r[2]).toBe(a2);
      expect(r[3]).toBe(a2 - a1);
      expect(r[4]).toBeCloseTo(100 * a1 / soma(p1 as MunData, 0));
      expect(r[5]).toBeCloseTo(100 * a2 / soma(p2 as MunData, 0));
    }
  });

  it("preserva comparação específica quando os recortes não são os próprios grupos", () => {
    const ts = tabelas({ reg: "ti", escopos: "ti:Velho Chico|mun:38490", fin: "13" });
    expect(ts).toHaveLength(6);
    const partes = partesEscopo("ti:Velho Chico|mun:38490");
    expect(ts[2]?.linhas.map((r) => r[0])).toEqual(partes.map((pt) => recorteNome(pt, base)));
  });
});
