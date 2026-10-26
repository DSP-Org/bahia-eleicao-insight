import { describe, expect, it } from "vitest";
import { criarEvolucaoTurnos } from "@/lib/indicadores";
import { RELATORIOS, partesEscopo, recorteNome } from "@/lib/relatorios/definicoes";
import { montarBase, type BlocoTabela } from "@/lib/relatorios/base";
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
  const rel = RELATORIOS.find((r) => r.id === "turnos-territorio")!;
  const tabelas = (st: Record<string, string>) =>
    rel
      .gerar(base, st as never)
      .filter((b) => b.tipo === "tabela") as unknown as BlocoTabela[];

  it("sem recortes mostra todos os territórios e nenhuma comparação", () => {
    const [ts] = tabelas({ reg: "ti" });
    expect(ts.linhas.length).toBe(27);
    expect(tabelas({ reg: "ti", escopos: "" }).length).toBe(1);
  });

  it("com dois territórios filtra a tabela e cria a comparação", () => {
    const escopos = "ti:Velho Chico|ti:Itaparica";
    const partes = partesEscopo(escopos);
    expect(partes.length).toBe(2);
    const ts = tabelas({ reg: "ti", escopos });
    const principal = ts[0]!;
    expect(principal.linhas.map((l) => String(l[0])).sort()).toEqual(["Itaparica", "Velho Chico"]);
    const comp = ts.find((t) => t.titulo.includes("Comparação entre os recortes"))!;
    expect(comp.linhas.length).toBe(2);
    expect(comp.linhas.map((l) => recorteNome(partes[comp.linhas.indexOf(l)], base))).toEqual(
      comp.linhas.map((l) => String(l[0])),
    );
    // 16 municípios no Velho Chico + 6 no Itaparica
    expect(comp.linhas.reduce((s, l) => s + Number(l[1]), 0)).toBe(22);
  });
});
