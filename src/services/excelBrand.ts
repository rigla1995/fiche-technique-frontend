// Charte Excel LabFlow côté navigateur — pendant du backend
// src/services/excelBrandService.js (les deux doivent rester alignés).
// Utilisé par les exports générés dans le navigateur (dashboard, ventes acheteurs).
import type ExcelJS from 'exceljs';

export const BRAND = {
  deep: 'FF1E1B4B',
  deepSub: 'FFC7CCE8',
  indigo: 'FF4338CA',
  indigoSoft: 'FFEEF2FF',
  indigoInk: 'FF312E81',
  grad: ['0EA5E9', '6366F1', 'A855F7'],
  ink: 'FF1E293B',
  muted: 'FF64748B',
  faint: 'FF94A3B8',
  hair: 'FFE2E8F0',
  panel: 'FFF8FAFC',
  amber: 'FFFDF3D7',
  amberInk: 'FF92400E',
};

export const FMT_DT = '#,##0.000 "DT"';

const thin = { style: 'thin' as const, color: { argb: BRAND.hair } };
export const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

const lerpHex = (a: string, b: string, t: number) => {
  const c = (i: number) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t)
    .toString(16).padStart(2, '0');
  return (c(0) + c(2) + c(4)).toUpperCase();
};
const gradColorAt = (t: number) => {
  const [s, m, v] = BRAND.grad;
  return 'FF' + (t <= 0.52 ? lerpHex(s, m, t / 0.52) : lerpHex(m, v, (t - 0.52) / 0.48));
};

export const fill = (argb: string): ExcelJS.FillPattern => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

// Bandeau de marque (logo + titre + filet dégradé + méta) ; renvoie la ligne
// (1-based) où poser les en-têtes de colonnes.
export async function brandHeader(
  wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet,
  { titre, sousTitre = '', meta = '', colCount }: { titre: string; sousTitre?: string; meta?: string; colCount: number },
): Promise<number> {
  ws.mergeCells(1, 1, 1, colCount);
  const t = ws.getCell(1, 1);
  t.value = titre;
  t.fill = fill(BRAND.deep);
  t.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  t.alignment = { horizontal: 'left', vertical: 'middle', indent: 20 };
  ws.getRow(1).height = 44;

  ws.mergeCells(2, 1, 2, colCount);
  const s = ws.getCell(2, 1);
  s.value = sousTitre;
  s.fill = fill(BRAND.deep);
  s.font = { name: 'Calibri', size: 10, color: { argb: BRAND.deepSub } };
  s.alignment = { horizontal: 'left', vertical: 'top', indent: 20 };
  ws.getRow(2).height = 20;

  // Logo blanc (best-effort : si l'asset est injoignable, le bandeau reste valable)
  try {
    const buf = await (await fetch('/logo-email.png')).arrayBuffer();
    const imgId = wb.addImage({ buffer: buf, extension: 'png' });
    ws.addImage(imgId, { tl: { col: 0.15, row: 0.45 }, ext: { width: 128, height: 32 }, editAs: 'absolute' });
  } catch { /* sans logo */ }

  const rule = ws.getRow(3);
  rule.height = 4.5;
  for (let c = 1; c <= colCount; c++) {
    ws.getCell(3, c).fill = fill(gradColorAt(colCount > 1 ? (c - 1) / (colCount - 1) : 0));
  }

  ws.mergeCells(4, 1, 4, colCount);
  const m = ws.getCell(4, 1);
  m.value = meta;
  m.font = { name: 'Calibri', size: 9, italic: true, color: { argb: BRAND.muted } };
  m.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(4).height = 16;
  ws.getRow(5).height = 6;
  return 6;
}

export function headerRow(ws: ExcelJS.Worksheet, rowIdx: number, labels: string[], { widths }: { widths?: number[] } = {}) {
  const row = ws.getRow(rowIdx);
  labels.forEach((label, i) => {
    const cell = row.getCell(i + 1);
    cell.value = label;
    cell.fill = fill(BRAND.indigo);
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = BORDER;
    if (widths && widths[i]) ws.getColumn(i + 1).width = widths[i];
  });
  row.height = 22;
  return row;
}

export function dataRowStyle(row: ExcelJS.Row, { index = 0, selected = false, colCount }: { index?: number; selected?: boolean; colCount: number }) {
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.border = BORDER;
    if (selected) {
      cell.fill = fill(BRAND.amber);
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND.amberInk } };
    } else {
      if (index % 2 === 1) cell.fill = fill(BRAND.panel);
      cell.font = { name: 'Calibri', size: 10, color: { argb: BRAND.ink } };
    }
  }
}

export function totalRowStyle(row: ExcelJS.Row, { colCount }: { colCount: number }) {
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = fill(BRAND.indigoSoft);
    cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: BRAND.indigoInk } };
    cell.border = { ...BORDER, top: { style: 'medium' as const, color: { argb: BRAND.indigo } } };
  }
  row.height = 20;
}

export function brandFooter(ws: ExcelJS.Worksheet, colCount: number) {
  const r = ws.rowCount + 2;
  ws.mergeCells(r, 1, r, colCount);
  const cell = ws.getCell(r, 1);
  cell.value = 'Généré par LabFlow · labflow-tn.com';
  cell.font = { name: 'Calibri', size: 8.5, italic: true, color: { argb: BRAND.faint } };
  cell.alignment = { horizontal: 'right' };
}

export function finalize(ws: ExcelJS.Worksheet, { headerRowIdx, colCount, lastDataRow, autoFilter = true }: { headerRowIdx: number; colCount: number; lastDataRow: number; autoFilter?: boolean }) {
  ws.views = [{ state: 'frozen', ySplit: headerRowIdx }];
  if (autoFilter && lastDataRow > headerRowIdx) {
    ws.autoFilter = { from: { row: headerRowIdx, column: 1 }, to: { row: lastDataRow, column: colCount } };
  }
}
