import { describe, expect, it } from "vitest";
import { criarEvolucaoTurnos } from "@/lib/indicadores";
import meta from "../../public/data/meta.json";
import municipios from "../../public/data/municipios.json";
import p1 from "../../public/data/mun-presidente.json";
import p2 from "../../public/data/mun-presidente-2t.json";
import type { Cargo, MunData } from "@/lib/eleicoes";

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
