import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Paginated } from '@/lib/types';
import { Button } from './Button';
import { Skeleton } from './Spinner';

export interface Column<T> {
    key: string;
    header: ReactNode;
    cell: (row: T, index: number) => ReactNode;
    align?: 'left' | 'right' | 'center';
    className?: string;
    /** Hide on narrow screens. */
    hide?: 'sm' | 'md' | 'lg';
}

interface DataTableProps<T> {
    columns: Column<T>[];
    rows: T[] | undefined;
    rowKey?: (row: T, index: number) => string | number;
    loading?: boolean;
    empty?: ReactNode;
    onRowClick?: (row: T) => void;
    footer?: ReactNode;
    dense?: boolean;
}

const hidden = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };
const aligns = { left: 'text-left', right: 'text-right', center: 'text-center' };

export function DataTable<T>({ columns, rows, rowKey, loading, empty, onRowClick, footer, dense }: DataTableProps<T>) {
    const cellClass = (column: Column<T>) => cn(aligns[column.align ?? 'left'], column.hide && hidden[column.hide], column.className);

    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
                <thead>
                    <tr className="border-b border-line">
                        {columns.map((column) => (
                            <th key={column.key} className={cn('h-11 px-4 text-xs font-medium whitespace-nowrap text-ink-3 first:pl-6 last:pr-6', cellClass(column))}>
                                {column.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {!rows && loading
                        ? Array.from({ length: 8 }, (_, i) => (
                              <tr key={i} className="border-b border-line last:border-0">
                                  {columns.map((column) => (
                                      <td key={column.key} className={cn('px-4 first:pl-6 last:pr-6', dense ? 'h-11' : 'h-14', column.hide && hidden[column.hide])}>
                                          <Skeleton className={cn('h-3.5', column.align === 'right' ? 'ml-auto w-16' : 'w-24')} />
                                      </td>
                                  ))}
                              </tr>
                          ))
                        : rows?.map((row, index) => (
                              <tr
                                  key={rowKey ? rowKey(row, index) : ((row as { id?: number }).id ?? index)}
                                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                                  className={cn('row-hover border-b border-line last:border-0', onRowClick && 'cursor-pointer')}
                              >
                                  {columns.map((column) => (
                                      <td key={column.key} className={cn('px-4 first:pl-6 last:pr-6', dense ? 'h-11 py-1.5' : 'h-14 py-2', cellClass(column))}>
                                          {column.cell(row, index)}
                                      </td>
                                  ))}
                              </tr>
                          ))}
                </tbody>
                {footer && rows && rows.length > 0 && <tfoot>{footer}</tfoot>}
            </table>

            {rows && rows.length === 0 && (empty ?? <Empty title="Nothing here yet" />)}
        </div>
    );
}

export function Empty({ title, hint, action, icon }: { title: string; hint?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
    return (
        <div className="flex flex-col items-center px-6 py-14 text-center">
            {icon && <div className="mb-3 grid size-10 place-items-center rounded-full bg-sunken text-ink-3 [&_svg]:size-5">{icon}</div>}
            <p className="text-sm font-medium text-ink">{title}</p>
            {hint && <p className="mt-1 max-w-sm text-[13px] text-ink-3">{hint}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

export function Pager({ meta, onPage }: { meta: Paginated<unknown> | undefined; onPage: (page: number) => void }) {
    if (!meta || meta.total === 0) return null;

    return (
        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-3 text-[13px] text-ink-2">
            <span className="num">
                {meta.from}–{meta.to} <span className="text-ink-3">of</span> {meta.total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1.5">
                <Button size="sm" disabled={meta.current_page <= 1} onClick={() => onPage(meta.current_page - 1)} icon={<ChevronLeft />}>
                    Previous
                </Button>
                <Button size="sm" disabled={meta.current_page >= meta.last_page} onClick={() => onPage(meta.current_page + 1)}>
                    Next
                    <ChevronRight />
                </Button>
            </div>
        </div>
    );
}

/** Two-line cell: a primary value with a quieter line underneath. */
export function Stack({ primary, secondary, mono }: { primary: ReactNode; secondary?: ReactNode; mono?: boolean }) {
    return (
        <div className="min-w-0">
            <div className={cn('truncate font-medium text-ink', mono && 'font-mono text-[12.5px]')}>{primary}</div>
            {secondary && <div className="truncate text-xs text-ink-3">{secondary}</div>}
        </div>
    );
}
