import { formatDate, formatDateTime } from '@/lib/format';
import type { ReportColumn } from './catalog';

export type Row = Record<string, unknown>;

export interface ExportSheet {
    title: string;
    /** Lines describing the filters, e.g. "Store: All stores". */
    context: string[];
    columns: ReportColumn[];
    rows: Row[];
    totals: Record<string, number> | null;
}

const isNumeric = (column: ReportColumn) => ['money', 'qty', 'int', 'percent'].includes(column.kind ?? 'text');

/** Plain value for a file: numbers stay numbers, dates become readable text. */
function plain(column: ReportColumn, value: unknown): string | number | null {
    if (value === null || value === undefined || value === '') return null;
    if (isNumeric(column)) return Number(value);
    if (column.kind === 'date') return formatDate(String(value));
    if (column.kind === 'datetime') return formatDateTime(String(value));
    return String(value);
}

const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const fileName = (sheet: ExportSheet, extension: string) => `${slug(sheet.title)}-${new Date().toISOString().slice(0, 10)}.${extension}`;

export function exportCsv(sheet: ExportSheet) {
    const escape = (value: string | number | null) => {
        if (value === null) return '';
        const text = String(value);
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const lines = [
        [sheet.title],
        ...sheet.context.map((line) => [line]),
        [],
        sheet.columns.map((column) => column.label),
        ...sheet.rows.map((row) => sheet.columns.map((column) => plain(column, row[column.key]))),
    ];

    if (sheet.totals) {
        lines.push(sheet.columns.map((column, index) => (index === 0 ? 'Total' : column.key in sheet.totals! ? sheet.totals![column.key] : null)));
    }

    // The BOM makes Excel read the file as UTF-8, so the currency symbol and Bangla names survive.
    const blob = new Blob(['﻿' + lines.map((line) => line.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName(sheet, 'csv');
    link.click();
    URL.revokeObjectURL(link.href);
}

const formats: Partial<Record<NonNullable<ReportColumn['kind']>, string>> = {
    money: '#,##0.00',
    qty: '#,##0.###',
    int: '#,##0',
    percent: '0.0"%"',
};

/** A real .xlsx with typed numbers, a bold header and totals. The writer is loaded only when used. */
export async function exportExcel(sheet: ExportSheet) {
    const { default: writeExcelFile } = await import('write-excel-file/browser');

    const data: unknown[][] = [
        [{ value: sheet.title, fontWeight: 'bold' as const, fontSize: 14 }],
        ...sheet.context.map((line) => [{ value: line, color: '#666666' }]),
        [],
        sheet.columns.map((column) => ({
            value: column.label,
            fontWeight: 'bold' as const,
            backgroundColor: '#E3EC78',
            align: isNumeric(column) ? ('right' as const) : ('left' as const),
        })),
        ...sheet.rows.map((row) =>
            sheet.columns.map((column) => {
                const value = plain(column, row[column.key]);
                if (value === null) return null;
                return typeof value === 'number' ? { value, type: Number, format: formats[column.kind ?? 'text'] } : { value, type: String };
            }),
        ),
    ];

    if (sheet.totals) {
        data.push(
            sheet.columns.map((column, index) => {
                if (index === 0) return { value: 'Total', fontWeight: 'bold' as const };
                if (!(column.key in sheet.totals!)) return null;
                return { value: sheet.totals![column.key], type: Number, format: formats[column.kind ?? 'text'], fontWeight: 'bold' as const };
            }),
        );
    }

    const widths = sheet.columns.map((column) => {
        const longest = sheet.rows.slice(0, 200).reduce((max, row) => Math.max(max, String(plain(column, row[column.key]) ?? '').length), column.label.length);
        return { width: Math.min(48, Math.max(10, longest + 3)) };
    });

    await writeExcelFile(data as never, { columns: widths, sheet: sheet.title.slice(0, 31) }).toFile(fileName(sheet, 'xlsx'));
}
