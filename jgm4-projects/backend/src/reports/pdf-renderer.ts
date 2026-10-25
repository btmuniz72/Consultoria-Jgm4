import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Cell, ReportDoc, Section, fmtDateTime } from './report-doc';

// PDF gerado no backend (pdfkit): paginação real, cabeçalho em todas as páginas, rodapé "Página X de Y" e tabelas com
// repetição do cabeçalho na quebra de página. Fonte padrão (WinAnsi): caracteres fora dela são substituídos.
const NAVY = '#102b4a'; const GRAY = '#5a6d83'; const LINE = '#d6dde4';
const logoPath = [resolve(__dirname, '../../assets/logo-jgm4.png'), resolve(process.cwd(), 'assets/logo-jgm4.png'), resolve(process.cwd(), 'backend/assets/logo-jgm4.png')].find((path) => existsSync(path));
const TONES = { technical: { fill: '#eef3f9', stroke: '#355d87' }, client: { fill: '#f3f7ef', stroke: '#4d7a3a' }, warning: { fill: '#fdf3e3', stroke: '#c58b2c' }, info: { fill: '#f4f6f8', stroke: '#8795a6' } };

const clean = (value: Cell | undefined) => String(value ?? '—').replace(/[\r\t]+/g, ' ')
  .replace(/[^ -~ -ÿ–—•‘’“”…]/g, (char) => ({ '→': '->', '≥': '>=', '≤': '<=', '✓': 'Sim', '✔': 'Sim' } as Record<string, string>)[char] ?? '?');

export function renderPdf(report: ReportDoc): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 92, bottom: 58, left: 40, right: 40 }, bufferPages: true, compress: process.env.PDF_COMPRESS !== 'false',
    info: { Title: clean(report.title), Author: 'JGM4 Consultoria Logística', Subject: clean(report.project.name) } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolveBuffer, reject) => { doc.on('end', () => resolveBuffer(Buffer.concat(chunks))); doc.on('error', reject); });
  const left = doc.page.margins.left; const width = doc.page.width - left - doc.page.margins.right;
  const top = doc.page.margins.top;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom;

  const drawHeader = () => {
    if (logoPath) doc.image(logoPath, left, 26, { width: 38, height: 38 });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text(clean(`${report.project.company} — ${report.project.name}`), left + 48, 30, { width: width - 48, lineBreak: false });
    doc.fillColor(GRAY).font('Helvetica').fontSize(8).text(clean(`${report.title} · Emitido em ${fmtDateTime(report.emittedAt)} por ${report.emittedBy}`), left + 48, 46, { width: width - 48, lineBreak: false });
    doc.moveTo(left, 72).lineTo(left + width, 72).strokeColor(LINE).lineWidth(0.8).stroke();
    doc.x = left; doc.y = top;
  };
  drawHeader();
  doc.on('pageAdded', drawHeader);
  const ensure = (height: number) => { if (doc.y + height > bottomLimit()) doc.addPage(); };

  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(17).text(clean(report.title), left, doc.y, { width });
  if (report.subtitle) doc.moveDown(0.2).fillColor(GRAY).font('Helvetica').fontSize(9).text(clean(report.subtitle), { width });
  doc.moveDown(0.8);

  const heading = (text: string) => {
    ensure(46);
    doc.moveDown(0.4).fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(clean(text), left, doc.y, { width });
    doc.moveTo(left, doc.y + 2).lineTo(left + width, doc.y + 2).strokeColor(LINE).lineWidth(0.6).stroke(); doc.y += 8;
  };
  const kv = (rows: [string, string][]) => {
    for (const [key, value] of rows) {
      const labelWidth = 140; const valueHeight = doc.font('Helvetica').fontSize(9).heightOfString(clean(value), { width: width - labelWidth });
      ensure(valueHeight + 6); const y = doc.y;
      doc.fillColor(GRAY).font('Helvetica').fontSize(8.5).text(clean(key), left, y, { width: labelWidth - 8 });
      doc.fillColor('#172b45').font('Helvetica').fontSize(9).text(clean(value), left + labelWidth, y, { width: width - labelWidth });
      doc.y = y + Math.max(valueHeight, 11) + 4;
    }
  };
  const paragraph = (text: string) => { doc.fillColor('#172b45').font('Helvetica').fontSize(9).text(clean(text), left, doc.y, { width, lineGap: 2 }); doc.moveDown(0.4); };
  const bullets = (items: string[], empty?: string) => {
    if (!items.length) { doc.fillColor(GRAY).font('Helvetica-Oblique').fontSize(9).text(clean(empty ?? 'Nenhum item.'), left, doc.y, { width }); doc.moveDown(0.4); return; }
    for (const item of items) { const h = doc.font('Helvetica').fontSize(9).heightOfString(clean(item), { width: width - 14 }); ensure(h + 4); const y = doc.y;
      doc.fillColor(NAVY).text('•', left + 2, y); doc.fillColor('#172b45').text(clean(item), left + 14, y, { width: width - 14, lineGap: 1 }); doc.y = y + h + 3; }
    doc.moveDown(0.2);
  };
  const table = (columns: { key: string; label: string; weight?: number; align?: 'left' | 'right' | 'center' }[], rows: Record<string, Cell>[], empty?: string) => {
    if (!rows.length) { doc.fillColor(GRAY).font('Helvetica-Oblique').fontSize(9).text(clean(empty ?? 'Nenhum registro.'), left, doc.y, { width }); doc.moveDown(0.4); return; }
    const total = columns.reduce((sum, column) => sum + (column.weight ?? 1), 0);
    const widths = columns.map((column) => ((column.weight ?? 1) / total) * width);
    const drawHead = () => {
      doc.font('Helvetica-Bold').fontSize(7.5);
      const h = Math.max(...columns.map((column, index) => doc.heightOfString(clean(column.label), { width: widths[index] - 8 }))) + 8; const y = doc.y;
      doc.rect(left, y, width, h).fill('#eef1f5'); let x = left;
      columns.forEach((column, index) => { doc.fillColor(NAVY).text(clean(column.label), x + 4, y + 4, { width: widths[index] - 8, align: column.align ?? 'left' }); x += widths[index]; });
      doc.y = y + h;
    };
    ensure(40); drawHead();
    for (const row of rows) {
      doc.font('Helvetica').fontSize(8);
      const h = Math.max(...columns.map((column, index) => doc.heightOfString(clean(row[column.key]), { width: widths[index] - 8 }))) + 8;
      if (doc.y + h > bottomLimit()) { doc.addPage(); drawHead(); }
      const y = doc.y; let x = left;
      columns.forEach((column, index) => { doc.fillColor('#172b45').font('Helvetica').fontSize(8).text(clean(row[column.key]), x + 4, y + 4, { width: widths[index] - 8, align: column.align ?? 'left' }); x += widths[index]; });
      doc.moveTo(left, y + h).lineTo(left + width, y + h).strokeColor('#e8ecf0').lineWidth(0.5).stroke(); doc.y = y + h;
    }
    doc.moveDown(0.5);
  };
  const progress = (items: { label: string; percent: number; detail?: string }[]) => {
    for (const item of items) {
      ensure(30); const y = doc.y;
      doc.fillColor('#172b45').font('Helvetica-Bold').fontSize(9).text(clean(item.label), left, y, { width: width * 0.45, lineBreak: false });
      const barX = left + width * 0.46; const barW = width * 0.22;
      doc.roundedRect(barX, y + 2, barW, 7, 3).fill('#e6ebf0'); doc.roundedRect(barX, y + 2, Math.max(2, (barW * Math.min(item.percent, 100)) / 100), 7, 3).fill('#355d87');
      doc.fillColor('#172b45').font('Helvetica').fontSize(8.5).text(`${item.percent}%`, barX + barW + 6, y, { width: 30, lineBreak: false });
      doc.fillColor(GRAY).font('Helvetica').fontSize(8).text(clean(item.detail ?? ''), left + width * 0.76, y, { width: width * 0.24, lineBreak: false });
      doc.y = y + 18;
    }
  };
  const callout = (variant: keyof typeof TONES, title: string, lines: string[]) => {
    const tone = TONES[variant]; doc.font('Helvetica').fontSize(9);
    const body = lines.map(clean).join('\n'); const h = 20 + doc.heightOfString(body, { width: width - 24, lineGap: 2 }) + 10;
    ensure(Math.min(h, 200)); const y = doc.y;
    doc.rect(left, y, width, h).fillAndStroke(tone.fill, tone.stroke);
    doc.rect(left, y, 4, h).fill(tone.stroke);
    doc.fillColor(tone.stroke).font('Helvetica-Bold').fontSize(10).text(clean(title), left + 14, y + 7, { width: width - 24 });
    doc.fillColor('#172b45').font('Helvetica').fontSize(9).text(body, left + 14, y + 22, { width: width - 24, lineGap: 2 });
    doc.y = y + h + 8;
  };

  for (const section of report.sections as Section[]) {
    if (section.type === 'callout') { callout(section.variant, section.title, section.lines); continue; }
    if ('title' in section && section.title) heading(section.title);
    if (section.type === 'kv') kv(section.rows);
    else if (section.type === 'paragraph') paragraph(section.text);
    else if (section.type === 'bullets') bullets(section.items, section.empty);
    else if (section.type === 'table') table(section.columns, section.rows, section.empty);
    else if (section.type === 'progress') progress(section.items);
  }

  // Rodapé com numeração total (após conhecer o número de páginas).
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index++) {
    doc.switchToPage(range.start + index);
    const previousBottom = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    const y = doc.page.height - 34;
    doc.moveTo(left, y - 6).lineTo(left + width, y - 6).strokeColor(LINE).lineWidth(0.6).stroke();
    doc.fillColor(GRAY).font('Helvetica').fontSize(7.5).text(clean(`JGM4 Consultoria Logística · ${report.project.name}`), left, y, { width: width * 0.55, lineBreak: false });
    doc.text(clean(`Página ${index + 1} de ${range.count} · Emitido em ${fmtDateTime(report.emittedAt)}`), left + width * 0.45, y, { width: width * 0.55, align: 'right', lineBreak: false });
    doc.page.margins.bottom = previousBottom;
  }
  doc.end();
  return done;
}
