import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

type Report = {
  title: string; cargo: string; filter: string; headers: string[];
  rows: (string | number)[][];
  summary: { label: string; value: string }[];
  ranking: { name: string; value: string; share: number }[];
};

export async function downloadReportPDF(report: Report) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const load = async (path: string) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error("Não foi possível carregar as fontes do PDF.");
    return response.arrayBuffer();
  };
  const [regularBytes, boldBytes] = await Promise.all([
    load("/fonts/report-regular.ttf"), load("/fonts/report-bold.ttf"),
  ]);
  const font = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  const css = getComputedStyle(document.documentElement);
  const color = (token: string) => {
    const raw = css.getPropertyValue(token).trim().replace("#", "");
    const hex = raw.length === 3 ? [...raw].map((c) => c + c).join("") : raw;
    return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
  };
  const ink = color("--report-ink"), muted = color("--report-muted"), accent = color("--report-accent");
  const light = color("--report-surface"), line = color("--report-line"), paper = color("--report-paper");
  const W = 841.89, H = 595.28, margin = 36, usable = W - margin * 2;
  const generated = new Date().toLocaleString("pt-BR");
  const text = (page: PDFPage, value: string, x: number, y: number, size = 9, strong = false, tint = ink) => {
    page.drawText(value, { x, y, size, font: strong ? bold : font, color: tint });
  };
  const wrap = (value: string, maxWidth: number, size: number, face: PDFFont = font) => {
    const lines: string[] = [];
    let current = "";
    for (const word of value.replace(/[\r\n]+/g, " ").split(/\s+/)) {
      const proposed = current ? `${current} ${word}` : word;
      if (face.widthOfTextAtSize(proposed, size) <= maxWidth) { current = proposed; continue; }
      if (current) { lines.push(current); current = ""; }
      if (face.widthOfTextAtSize(word, size) <= maxWidth) { current = word; continue; }
      for (const char of word) {
        if (face.widthOfTextAtSize(current + char, size) > maxWidth && current) { lines.push(current); current = ""; }
        current += char;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  };
  const newPage = () => {
    const p = doc.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: paper });
    text(p, "Data5 Analytics", margin, H - 39, 18, true);
    text(p, "ELEIÇÕES 2026 - BA", W - 208, H - 35, 9, true, muted);
    p.drawLine({ start: { x: margin, y: H - 52 }, end: { x: W - margin, y: H - 52 }, color: accent, thickness: 2 });
    return p;
  };
  const cover = newPage();
  text(cover, "RELATÓRIO DE RESULTADOS", margin, H - 87, 9, true, accent);
  text(cover, report.title, margin, H - 125, 27, true);
  text(cover, `${report.cargo} · Bahia · 1º turno · 04/10/2026`, margin, H - 151, 12, false, muted);
  const context = `${report.rows.length.toLocaleString("pt-BR")} registros${report.filter ? ` · Filtro: ${report.filter}` : " · Todos os registros"}`;
  let cy = H - 179;
  for (const l of wrap(context, usable, 9)) { text(cover, l, margin, cy, 9, false, muted); cy -= 13; }
  const sy = cy - 58;
  report.summary.forEach((item, i) => {
    const x = margin + i * (usable / report.summary.length);
    cover.drawLine({ start: { x, y: sy - 9 }, end: { x, y: sy + 32 }, color: accent, thickness: 2 });
    text(cover, item.label, x + 10, sy + 20, 9, false, muted);
    text(cover, item.value, x + 10, sy - 1, 18, true);
  });
  let y = sy - 53;
  text(cover, "Maiores votações no estado", margin, y, 13, true);
  y -= 26;
  report.ranking.slice(0, 3).forEach((candidate, index) => {
    text(cover, `${String(index + 1).padStart(2, "0")}  ${candidate.name}`, margin, y, 10, true);
    text(cover, candidate.value, W - margin - bold.widthOfTextAtSize(candidate.value, 10), y, 10, true);
    cover.drawRectangle({ x: margin, y: y - 16, width: usable, height: 5, color: light });
    cover.drawRectangle({ x: margin, y: y - 16, width: usable * Math.max(0, Math.min(1, candidate.share)), height: 5, color: accent });
    y -= 42;
  });
  text(cover, "Escopo e fontes", margin, 94, 10, true);
  text(cover, "Análise pós-eleição. Dados do TSE; municípios e regiões do IBGE. Ranking: total estadual.", margin, 77, 9, false, muted);
  if (report.title.includes("Concentração")) text(cover, "HHI: soma dos quadrados das participações municipais × 10.000. Maior índice = maior concentração.", margin, 62, 8, false, muted);

  const weights = report.headers.map((h, i) => {
    if (i === 0) return 1.9;
    if (h === "Municípios") return 1.25;
    if (/Região|Vencedor|reduto|^1º|^2º|^3º/.test(h)) return 1.65;
    if (/^% /.test(h)) return 1.2;
    return 1;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((n) => usable * n / sum);
  const headerLines = report.headers.map((h, i) => wrap(h, widths[i] - 12, 8, bold));
  const headerHeight = Math.max(...headerLines.map((l) => l.length)) * 11 + 16;
  let page = newPage();
  let tableY = 0;
  const drawHeader = () => {
    text(page, `${report.title} · ${report.cargo}`, margin, H - 77, 12, true);
    tableY = H - 93;
    page.drawRectangle({ x: margin, y: tableY - headerHeight, width: usable, height: headerHeight, color: ink });
    let x = margin;
    headerLines.forEach((lines, i) => {
      lines.forEach((l, j) => text(page, l, x + 6, tableY - 15 - j * 11, 8, true, paper));
      x += widths[i];
    });
    tableY -= headerHeight;
  };
  drawHeader();
  report.rows.forEach((row, rowIndex) => {
    const values = report.headers.map((_, i) => typeof row[i] === "number" ? row[i].toLocaleString("pt-BR") : String(row[i] ?? "—"));
    const cellLines = values.map((v, i) => wrap(v, widths[i] - 12, 8));
    const height = Math.max(...cellLines.map((l) => l.length)) * 11 + 13;
    if (tableY - height < 56) { page = newPage(); drawHeader(); }
    if (rowIndex % 2 === 0) page.drawRectangle({ x: margin, y: tableY - height, width: usable, height, color: light });
    let x = margin;
    cellLines.forEach((lines, i) => {
      const numeric = typeof row[i] === "number" || /^[\d.,%]+$/.test(values[i]);
      lines.forEach((l, j) => text(page, l, numeric ? x + widths[i] - 6 - font.widthOfTextAtSize(l, 8) : x + 6, tableY - 14 - j * 11, 8));
      x += widths[i];
    });
    tableY -= height;
    page.drawLine({ start: { x: margin, y: tableY }, end: { x: W - margin, y: tableY }, color: line, thickness: 0.3 });
  });
  if (!report.rows.length) text(page, "Nenhum registro para o filtro selecionado.", margin + 6, tableY - 24, 10, false, muted);
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: margin, y: 42 }, end: { x: W - margin, y: 42 }, color: line, thickness: 0.5 });
    text(p, `Data5 Analytics · TSE / IBGE · Emitido em ${generated}`, margin, 26, 7, false, muted);
    text(p, `${i + 1} / ${pages.length}`, W - margin - 30, 26, 8, true, muted);
  });
  doc.setTitle(`Data5 Analytics — ${report.title} — ${report.cargo}`);
  doc.setAuthor("Data5 Analytics");
  doc.setSubject("Resultados das Eleições 2026 na Bahia — análise pós-eleição");
  const bytes = await doc.save();
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `data-analytics-${report.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}