import ExcelJS from 'exceljs';

export interface XColumn { header: string; key: string; width: number; kind?: 'text' | 'date' | 'datetime' | 'hours' | 'int' }
export interface XSheet { name: string; columns: XColumn[]; rows: Record<string, unknown>[] }

// XLSX real (exceljs): cabeçalho estilizado, autofiltro, primeira linha congelada, larguras ajustadas,
// datas como datas do Excel e horas como números (nada de CSV renomeado).
export async function buildXlsx(creator: string, sheets: XSheet[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = creator; workbook.created = new Date();
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
    worksheet.columns = sheet.columns.map((column) => ({ header: column.header, key: column.key, width: column.width }));
    for (const row of sheet.rows) {
      worksheet.addRow(Object.fromEntries(sheet.columns.map((column) => {
        const value = row[column.key];
        if (value === undefined || value === null || value === '') return [column.key, null];
        if ((column.kind === 'date' || column.kind === 'datetime') && !(value instanceof Date)) return [column.key, new Date(String(value))];
        return [column.key, value];
      })));
    }
    sheet.columns.forEach((column, index) => {
      const target = worksheet.getColumn(index + 1);
      if (column.kind === 'date') target.numFmt = 'dd/mm/yyyy';
      else if (column.kind === 'datetime') target.numFmt = 'dd/mm/yyyy hh:mm';
      else if (column.kind === 'hours') target.numFmt = '0.00';
      else if (column.kind === 'int') target.numFmt = '0';
      target.alignment = { vertical: 'top', wrapText: column.kind === undefined || column.kind === 'text' };
    });
    const header = worksheet.getRow(1);
    header.height = 22;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF102B4A' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    if (sheet.columns.length) worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
