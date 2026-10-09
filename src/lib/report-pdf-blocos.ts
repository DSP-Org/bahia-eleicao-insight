// PDF dos relatórios da página /relatorios, no mesmo padrão visual de report-pdf.ts
// (A4 adaptativo, logo, fontes DejaVu, cores --report-*), montado a partir dos blocos do relatório.
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import reportLogo from "@/assets/logo-relatorio.png.asset.json";
import logoLocal from "@/assets/logo-barras.png";
import type { Bloco, BlocoTabela, Coluna } from "@/lib/relatorios/blocos";
import { linhasIniciais, textoCelula } from "@/lib/relatorios/blocos";
import { layoutTabelaPDF } from "@/lib/report-pdf-layout";

type Entrada = { titulo: string; grupo: string; filtros: string; blocos: Bloco[] };
type Orientacao = "retrato" | "paisagem";

const NUMERICO = new Set<Coluna["tipo"]>(["int", "pct", "pos", "dif", "corr"]);
const A4: Record<Orientacao, readonly [number, number]> = {
  retrato: [595.28, 841.89],
  paisagem: [841.89, 595.28],
};

export async function baixarRelatorioPDF(r: Entrada) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const carregar = async (p: string) => {
    const resp = await fetch(p);
    if (!resp.ok) throw new Error("Não foi possível carregar os recursos do PDF.");
    return resp.arrayBuffer();
  };
  const tentar = (p: string) => carregar(p).catch(() => null);
  const [regular, negrito, logoBytes] = await Promise.all([
    carregar("/fonts/report-regular.ttf"),
    carregar("/fonts/report-bold.ttf"),
    // O logo do relatório fica na hospedagem do Lovable (/__l5e/...); fora dela usa o logo do cabeçalho do site.
    tentar(reportLogo.url).then((b) => b ?? tentar(logoLocal)),
  ]);
  const logo = logoBytes ? await doc.embedPng(logoBytes).catch(() => null) : null;
  const logoTam = logo ? logo.scaleToFit(120, 39) : { width: 0, height: 0 };
  const font = await doc.embedFont(regular, { subset: true });
  const bold = await doc.embedFont(negrito, { subset: true });
  const layouts = new Map(
    r.blocos.filter((b): b is BlocoTabela => b.tipo === "tabela").map((t) => [
      t,
      layoutTabelaPDF(t, (texto, forte) => (forte ? bold : font).widthOfTextAtSize(texto, 7.5)),
    ]),
  );
  const css = getComputedStyle(document.documentElement);
  const cor = (token: string) => {
    const raw = css.getPropertyValue(token).trim().replace("#", "");
    const hex = raw.length === 3 ? [...raw].map((c) => c + c).join("") : raw;
    return rgb(
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
    );
  };
  const ink = cor("--report-ink"),
    muted = cor("--report-muted"),
    accent = cor("--report-accent");
  const light = cor("--report-surface"),
    line = cor("--report-line"),
    paper = cor("--report-paper");
  // A abertura acompanha a primeira tabela, sem uma capa retrato isolada.
  let orientacao: Orientacao = layouts.values().next().value?.orientacao ?? "retrato";
  let [W, H] = A4[orientacao];
  const M = 36,
    RODAPE = 56;
  let U = W - M * 2;
  const emitido = new Date().toLocaleString("pt-BR");

  const escrever = (
    p: PDFPage,
    v: string,
    x: number,
    y: number,
    size = 9,
    forte = false,
    tinta: RGB = ink,
  ) => {
    p.drawText(v, { x, y, size, font: forte ? bold : font, color: tinta });
  };
  const quebrar = (valor: string, largura: number, size: number, face: PDFFont = font) => {
    const linhas: string[] = [];
    let atual = "";
    for (const palavra of valor.replace(/[\r\n]+/g, " ").split(/\s+/)) {
      const prop = atual ? `${atual} ${palavra}` : palavra;
      if (face.widthOfTextAtSize(prop, size) <= largura) {
        atual = prop;
        continue;
      }
      if (atual) {
        linhas.push(atual);
        atual = "";
      }
      if (face.widthOfTextAtSize(palavra, size) <= largura) {
        atual = palavra;
        continue;
      }
      for (const ch of palavra) {
        if (face.widthOfTextAtSize(atual + ch, size) > largura && atual) {
          linhas.push(atual);
          atual = "";
        }
        atual += ch;
      }
    }
    if (atual) linhas.push(atual);
    return linhas.length ? linhas : [""];
  };

  let page: PDFPage = doc.addPage([W, H]);
  let y = 0;
  const novaPagina = (proxima: Orientacao = orientacao) => {
    orientacao = proxima;
    [W, H] = A4[orientacao];
    U = W - M * 2;
    page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: paper });
    if (logo)
      page.drawImage(logo, { x: M, y: H - 46, width: logoTam.width, height: logoTam.height });
    else escrever(page, "Data5 Analytics", M, H - 39, 18, true);
    escrever(page, "ELEIÇÕES 2026 - BA", W - 208, H - 35, 9, true, muted);
    page.drawLine({
      start: { x: M, y: H - 52 },
      end: { x: W - M, y: H - 52 },
      color: accent,
      thickness: 2,
    });
    y = H - 72;
  };
  const garantir = (altura: number) => {
    if (y - altura < RODAPE) novaPagina();
  };

  doc.removePage(0);
  novaPagina();
  escrever(page, `RELATÓRIO · ${r.grupo.toUpperCase()}`, M, y - 6, 9, true, accent);
  y -= 38;
  for (const l of quebrar(r.titulo, U, 24, bold)) {
    escrever(page, l, M, y, 24, true);
    y -= 28;
  }
  for (const l of quebrar(`${r.filtros} · Bahia · 1º turno · 04/10/2026`, U, 11)) {
    escrever(page, l, M, y, 11, false, muted);
    y -= 15;
  }
  y -= 14;

  for (const b of r.blocos) {
    if (b.tipo === "destaque") {
      garantir(70);
      escrever(page, b.kicker.toUpperCase(), M, y, 9, true, accent);
      y -= 24;
      escrever(page, b.titulo, M, y, 20, true);
      y -= 16;
      for (const l of quebrar(b.sub, U, 9)) {
        escrever(page, l, M, y, 9, false, muted);
        y -= 12;
      }
      if (b.sit) {
        escrever(page, `Situação: ${b.sit.texto}`, M, y - 2, 10, true, accent);
        y -= 16;
      }
      y -= 10;
    } else if (b.tipo === "numeros") {
      const porLinha = Math.min(4, b.itens.length) || 1;
      const larg = U / porLinha;
      for (let i = 0; i < b.itens.length; i += porLinha) {
        garantir(58);
        b.itens.slice(i, i + porLinha).forEach((it, k) => {
          const x = M + k * larg;
          page.drawLine({
            start: { x, y: y - 44 },
            end: { x, y: y + 4 },
            color: accent,
            thickness: 2,
          });
          escrever(page, quebrar(it.rotulo, larg - 18, 8)[0] ?? "", x + 9, y - 6, 8, false, muted);
          escrever(page, quebrar(it.valor, larg - 18, 15, bold)[0] ?? "", x + 9, y - 25, 15, true);
          if (it.sub)
            escrever(
              page,
              quebrar(it.sub, larg - 18, 7.5)[0] ?? "",
              x + 9,
              y - 39,
              7.5,
              false,
              muted,
            );
        });
        y -= 62;
      }
    } else if (b.tipo === "aviso" || b.tipo === "nota") {
      const size = b.tipo === "aviso" ? 8.5 : 8;
      const linhas = quebrar(b.texto, U - 20, size);
      const alt = linhas.length * (size + 3) + 10;
      garantir(alt + 6);
      if (b.tipo === "aviso") {
        page.drawRectangle({ x: M, y: y - alt, width: U, height: alt, color: light });
        page.drawRectangle({ x: M, y: y - alt, width: 3, height: alt, color: accent });
      }
      linhas.forEach((l, k) =>
        escrever(
          page,
          l,
          M + 10,
          y - 12 - k * (size + 3),
          size,
          false,
          b.tipo === "aviso" ? ink : muted,
        ),
      );
      y -= alt + 10;
    } else if (b.tipo === "tabela") {
      const proxima = layouts.get(b)?.orientacao ?? "retrato";
      if (proxima !== orientacao) novaPagina(proxima);
      desenharTabela(b);
    }
  }

  function desenharTabela(t: BlocoTabela) {
    if (t.apresentacao) {
      desenharBancadas(t);
      return;
    }
    const larg = layouts.get(t)?.larguras ?? t.colunas.map(() => U / t.colunas.length);
    const cab = t.colunas.map((c, i) => quebrar(c.titulo, (larg[i] ?? 0) - 10, 7.5, bold));
    const altCab = Math.max(...cab.map((l) => l.length)) * 10 + 12;
    const cabecalho = (continuacao: boolean) => {
      const titulo = quebrar(`${t.titulo}${continuacao ? " (continuação)" : ""}`, U, 11, bold);
      titulo.forEach((l, i) => escrever(page, l, M, y - 4 - i * 14, 11, true));
      y -= titulo.length * 14 + 2;
      page.drawRectangle({ x: M, y: y - altCab, width: U, height: altCab, color: ink });
      let x = M;
      cab.forEach((ls, i) => {
        const w = larg[i] ?? 0;
        const c = t.colunas[i];
        const num = c ? NUMERICO.has(c.tipo) : false;
        ls.forEach((l, j) =>
          escrever(
            page,
            l,
            num ? x + w - 5 - bold.widthOfTextAtSize(l, 7.5) : x + 5,
            y - 13 - j * 10,
            7.5,
            true,
            paper,
          ),
        );
        x += w;
      });
      y -= altCab;
    };
    garantir(16 + altCab + 40);
    cabecalho(false);
    const linhas = linhasIniciais(t);
    linhas.forEach((row, ri) => {
      const valores = t.colunas.map((c, i) => textoCelula(row[i] ?? null, c));
      const celulas = valores.map((v, i) => quebrar(v, (larg[i] ?? 0) - 10, 7.5));
      const alt = Math.max(...celulas.map((l) => l.length)) * 10 + 9;
      if (y - alt < RODAPE) {
        novaPagina();
        cabecalho(true);
      }
      if (ri % 2 === 0)
        page.drawRectangle({ x: M, y: y - alt, width: U, height: alt, color: light });
      let x = M;
      celulas.forEach((ls, i) => {
        const c = t.colunas[i];
        const w = larg[i] ?? 0;
        const num = c ? NUMERICO.has(c.tipo) : false;
        ls.forEach((l, j) =>
          escrever(
            page,
            l,
            num ? x + w - 5 - font.widthOfTextAtSize(l, 7.5) : x + 5,
            y - 11 - j * 10,
            7.5,
          ),
        );
        x += w;
      });
      y -= alt;
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, color: line, thickness: 0.3 });
    });
    if (!linhas.length) {
      escrever(page, "Nenhum registro para os filtros escolhidos.", M + 6, y - 16, 9, false, muted);
      y -= 24;
    }
    y -= 18;
  }

  function desenharBancadas(t: BlocoTabela) {
    const rotulo = t.apresentacao?.projecao ? "Eleitos projetados" : "Eleitos";
    let primeira = true;
    for (const row of linhasIniciais(t)) {
      const texto = (i: number) => {
        const col = t.colunas[i];
        return col ? textoCelula(row[i] ?? null, col) : "";
      };
      const titulo = quebrar(texto(0), U - 110, 11, bold);
      const nomes = texto(9).split(",").map((n) => n.trim()).filter(Boolean);
      const nominata = quebrar(nomes.join("  ·  "), U - 24, 9);
      const partidos = quebrar(`${rotulo} por partido: ${texto(8)}`, U - 24, 8);
      const altura = 84 + titulo.length * 14 + (nomes.length ? 22 + partidos.length * 11 + nominata.length * 13 : 20);
      const mudou = y - altura - (primeira ? 24 : 0) < RODAPE;
      garantir(altura + (primeira ? 24 : 0));
      if (primeira || mudou) {
        escrever(page, `${t.titulo}${primeira ? "" : " (continuação)"}`, M, y - 4, 11, true);
        y -= 24;
        primeira = false;
      }
      const topo = y;
      escrever(page, texto(1).toUpperCase(), M + 12, y - 12, 7.5, true, accent);
      titulo.forEach((l, i) => escrever(page, l, M + 12, y - 29 - i * 14, 11, true));
      escrever(page, `${texto(2)} vagas`, W - M - 90, y - 28, 13, true, accent);
      y -= 38 + titulo.length * 14;
      const metricas = [6, 7, 3, 4, 5];
      metricas.forEach((i, k) => {
        const x = M + 12 + k * (U - 24) / 5;
        escrever(page, t.colunas[i]?.titulo ?? "", x, y, 7.5, false, muted);
        escrever(page, texto(i), x, y - 16, 11, true);
      });
      y -= 32;
      page.drawLine({ start: { x: M + 12, y }, end: { x: W - M - 12, y }, color: line, thickness: 0.5 });
      if (nomes.length) {
        y -= 15;
        partidos.forEach((l) => { escrever(page, l, M + 12, y, 8, true, accent); y -= 11; });
        y -= 5;
        nominata.forEach((l) => { escrever(page, l, M + 12, y, 9); y -= 13; });
      } else {
        y -= 16;
        escrever(page, "Sem vagas conquistadas.", M + 12, y, 8, false, muted);
      }
      y -= 12;
      page.drawRectangle({ x: M, y, width: U, height: topo - y, borderColor: line, borderWidth: 0.5 });
      y -= 14;
    }
    y -= 4;
  }

  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    const larguraPagina = p.getWidth();
    p.drawLine({ start: { x: M, y: 42 }, end: { x: larguraPagina - M, y: 42 }, color: line, thickness: 0.5 });
    escrever(p, `Data5 Analytics · TSE / IBGE · Emitido em ${emitido}`, M, 26, 7, false, muted);
    escrever(p, `${i + 1} / ${paginas.length}`, larguraPagina - M - 30, 26, 8, true, muted);
  });
  doc.setTitle(`Data5 Analytics — ${r.titulo}`);
  doc.setAuthor("Data5 Analytics");
  doc.setSubject("Resultados das Eleições 2026 na Bahia — análise pós-eleição");
  const bytes = await doc.save();
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `data5-relatorio-${r.titulo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
