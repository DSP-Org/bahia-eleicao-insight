// PDF dos relatórios da página /relatorios, no mesmo padrão visual de report-pdf.ts
// (A4 paisagem, logo, fontes DejaVu, cores --report-*), montado a partir dos blocos do relatório.
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import reportLogo from "@/assets/logo-relatorio.png.asset.json";
import logoLocal from "@/assets/logo-barras.png";
import type { Bloco, BlocoTabela, Coluna } from "@/lib/relatorios/blocos";
import { linhasIniciais, textoCelula } from "@/lib/relatorios/blocos";

type Entrada = { titulo: string; grupo: string; filtros: string; blocos: Bloco[] };

const PESO: Record<Coluna["tipo"], number> = {
  cand: 2.2,
  mun: 1.6,
  texto: 1.6,
  sit: 1.5,
  int: 1,
  pct: 0.95,
  pos: 0.65,
  dif: 1,
  corr: 0.9,
};
const NUMERICO = new Set<Coluna["tipo"]>(["int", "pct", "pos", "dif", "corr"]);

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
  const W = 841.89,
    H = 595.28,
    M = 36,
    U = W - M * 2,
    RODAPE = 56;
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

  let page!: PDFPage; // criada por novaPagina() logo abaixo
  let y = 0;
  const novaPagina = () => {
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
      desenharTabela(b);
    }
  }

  function desenharTabela(t: BlocoTabela) {
    const pesos = t.colunas.map((c, i) => (i === 0 && c.tipo === "texto" ? 1.9 : PESO[c.tipo]));
    const soma = pesos.reduce((a, b) => a + b, 0);
    const larg = pesos.map((p) => (U * p) / soma);
    const cab = t.colunas.map((c, i) => quebrar(c.titulo, (larg[i] ?? 0) - 10, 7.5, bold));
    const altCab = Math.max(...cab.map((l) => l.length)) * 10 + 12;
    const cabecalho = (continuacao: boolean) => {
      escrever(page, `${t.titulo}${continuacao ? " (continuação)" : ""}`, M, y - 4, 11, true);
      y -= 16;
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

  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 42 }, end: { x: W - M, y: 42 }, color: line, thickness: 0.5 });
    escrever(p, `Data5 Analytics · TSE / IBGE · Emitido em ${emitido}`, M, 26, 7, false, muted);
    escrever(p, `${i + 1} / ${paginas.length}`, W - M - 30, 26, 8, true, muted);
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
