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
