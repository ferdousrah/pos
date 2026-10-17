import { ArrowDown, ArrowUp, ChevronsUpDown, Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BackLink } from '@/components/shared';
import { Button } from '@/components/ui/Button';
import { DateRange, useRange } from '@/components/ui/DateRange';
import { SearchInput, Select } from '@/components/ui/Field';
import { Card, Page, PageHeader } from '@/components/ui/Layout';
import { Menu, MenuItem } from '@/components/ui/Menu';
import { PageLoader } from '@/components/ui/Spinner';
import { Empty } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, money, qty } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useCurrentStore, useSession } from '@/lib/session';
import type { Account } from '@/lib/types';
import { findReport, type ReportColumn, type ReportDefinition } from './catalog';
import { exportCsv, exportExcel, type Row } from './export';

const PAGE = 50;
const numeric = (column: ReportColumn) => ['money', 'qty', 'int', 'percent'].includes(column.kind ?? 'text');

interface Response {
    from: string;
    to: string;
    generated_at: string;
    rows: Row[];
    meta?: { opening?: number; closing?: number; account?: string | null; account_id?: number };
}

function display(column: ReportColumn, value: unknown) {
    if (value === null || value === undefined || value === '') return <span className="text-ink-3">—</span>;

    switch (column.kind) {
        case 'money':
            return money(Number(value));
        case 'qty':
            return qty(Number(value));
        case 'int':
            return Number(value).toLocaleString();
        case 'percent': {
            const number = Number(value);
            return <span className={cn(column.signed && (number >= 0 ? 'text-good' : 'text-bad'))}>{`${column.signed && number > 0 ? '+' : ''}${number.toFixed(1)}%`}</span>;
        }
        case 'date':
            return formatDate(String(value));
        case 'datetime':
            return formatDateTime(String(value));
        default:
            return String(value);
    }
}

export default function ReportView() {
    const { key } = useParams();
    const definition = findReport(key);

    if (!definition) {
        return (
            <Page>
                <Empty title="This report does not exist" action={<Link to="/reports/library" className="underline">See all reports</Link>} />
            </Page>
        );
    }

    return <Report key={definition.key} definition={definition} />;
}

function Report({ definition }: { definition: ReportDefinition }) {
    const ranged = definition.ranged !== false;
    const store = useCurrentStore();
    const settings = useSession((s) => s.profile!.settings);
    const [range, setRange] = useRange(definition.defaultRange ?? '30d');
    const [choice, setChoice] = useState(() => (definition.option && 'choices' in definition.option ? definition.option.choices[0].value : ''));
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<{ key: string; descending: boolean } | null>(null);
    const [page, setPage] = useState(1);
    const [printing, setPrinting] = useState(false);

    const wantsAccounts = !!definition.option && 'accounts' in definition.option;
    const { data: accounts } = useApi<Account[]>('accounts', undefined, { enabled: wantsAccounts });

    const { data, isFetching } = useApi<Response>(`reports/library/${definition.key}`, {
        ...(ranged ? { from: range.from, to: range.to } : {}),
        ...(definition.option && choice ? { [definition.option.param]: choice } : {}),
    });

    // The account book opens on the first account the server picked.
    useEffect(() => {
        if (wantsAccounts && !choice && data?.meta?.account_id) setChoice(String(data.meta.account_id));
    }, [wantsAccounts, choice, data]);

    useEffect(() => setPage(1), [search, sort, data]);

    const rows = useMemo(() => {
        const term = search.trim().toLowerCase();
        let result = data?.rows ?? [];

        if (term) {
            result = result.filter((row) => definition.columns.some((column) => !numeric(column) && String(row[column.key] ?? '').toLowerCase().includes(term)));
        }

        if (sort) {
            const column = definition.columns.find((c) => c.key === sort.key)!;
            result = [...result].sort((a, b) => {
                const [x, y] = [a[sort.key], b[sort.key]];
                // Empty values always sink to the bottom, whichever way the column is sorted.
                if (x === null || x === undefined) return 1;
                if (y === null || y === undefined) return -1;
                const order = numeric(column) ? Number(x) - Number(y) : String(x).localeCompare(String(y), undefined, { numeric: true });
                return sort.descending ? -order : order;
            });
        }

        return result;
    }, [data, search, sort, definition]);

    const totals = useMemo(() => {
        const columns = definition.columns.filter((column) => column.sum);
        if (columns.length === 0 || rows.length === 0) return null;
        return Object.fromEntries(columns.map((column) => [column.key, rows.reduce((sum, row) => sum + (Number(row[column.key]) || 0), 0)]));
    }, [rows, definition]);

    const context = [
        `Business: ${settings.business_name}`,
        `Store: ${store?.name ?? 'All stores'}`,
        ranged && data ? `Period: ${formatDate(data.from)} – ${formatDate(data.to)}` : 'As of today',
        ...(definition.option && 'choices' in definition.option ? [`${definition.option.label}: ${definition.option.choices.find((c) => c.value === choice)?.label}`] : []),
        ...(data?.meta?.account ? [`Account: ${data.meta.account}`] : []),
        ...(search.trim() ? [`Search: “${search.trim()}”`] : []),
        `Currency: ${settings.currency_symbol}`,
        `Generated: ${data ? formatDateTime(data.generated_at) : ''}`,
    ].filter(Boolean) as string[];

    const sheet = { title: definition.title, context, columns: definition.columns, rows, totals };

    const print = () => {
        // Print every row, not just the page on screen.
        flushSync(() => setPrinting(true));

        // Reports are wide, so they go on landscape paper. The rule lives only for this print job.
        const style = document.createElement('style');
        style.textContent = '@page { size: A4 landscape; margin: 9mm; }';
        document.head.appendChild(style);
        window.print();
        style.remove();

        setPrinting(false);
    };

    const visible = printing ? rows : rows.slice((page - 1) * PAGE, page * PAGE);
    const pages = Math.ceil(rows.length / PAGE);

    const toggleSort = (column: ReportColumn) =>
        setSort((current) => {
            if (current?.key !== column.key) return { key: column.key, descending: numeric(column) };
            return current.descending === numeric(column) ? { key: column.key, descending: !current.descending } : null;
        });

    return (
        <Page>
            <PageHeader
                back={<BackLink to="/reports/library">All reports</BackLink>}
                title={definition.title}
                description={definition.description}
                actions={
                    <>
                        <Menu
                            trigger={
                                <Button icon={<Download />} disabled={rows.length === 0}>
                                    Export
                                </Button>
                            }
                        >
                            <MenuItem icon={<FileSpreadsheet />} onSelect={() => exportExcel(sheet).catch(() => toast.error('The Excel file could not be created.'))}>
                                Excel (.xlsx)
                            </MenuItem>
                            <MenuItem icon={<FileText />} onSelect={() => exportCsv(sheet)}>
                                CSV
                            </MenuItem>
                            <MenuItem icon={<Printer />} onSelect={print}>
                                PDF or print
                            </MenuItem>
                        </Menu>
                    </>
                }
            />

            <Card className={cn('printable printable-flow', printing && 'overflow-visible')}>
                <div className="no-print flex flex-wrap items-center gap-2 border-b border-line px-6 py-4">
                    <SearchInput value={search} onChange={setSearch} placeholder="Filter rows" />
                    {definition.option && (
                        <Select aria-label={definition.option.label} value={choice} onChange={(e) => setChoice(e.target.value)} className="w-52">
                            {'choices' in definition.option
                                ? definition.option.choices.map((option) => (
                                      <option key={option.value} value={option.value}>
                                          {definition.option!.label}: {option.label}
                                      </option>
                                  ))
                                : accounts?.map((account) => (
                                      <option key={account.id} value={account.id}>
                                          {account.name}
                                          {account.store ? ` (${account.store.code})` : ''}
                                      </option>
                                  ))}
                        </Select>
                    )}
                    {ranged && (
                        <div className="sm:ml-auto">
                            <DateRange value={range} onChange={setRange} />
                        </div>
                    )}
                </div>

                {/* Printed and shown: exactly which filters produced these numbers. */}
                <div className="px-6 pt-4 pb-3">
                    <h2 className="hidden text-[17px] font-semibold print:block">{definition.title}</h2>
                    <p className="text-xs leading-relaxed text-ink-3">{context.slice(1).join('  ·  ')}</p>
                    {data?.meta?.opening !== undefined && (
                        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-[13px]">
                            <span>
                                Opening balance <span className="num ml-1.5 font-medium">{money(data.meta.opening)}</span>
                            </span>
                            <span>
                                Closing balance <span className="num ml-1.5 font-medium">{money(data.meta.closing)}</span>
                            </span>
                        </div>
                    )}
                </div>

                {!data ? (
                    <PageLoader />
                ) : rows.length === 0 ? (
                    <Empty title="Nothing to show" hint={search ? 'No row matches your filter.' : ranged ? 'There is no activity in this period. Try a wider date range.' : 'There is nothing to report right now.'} />
                ) : (
                    <div className={cn('overflow-x-auto transition-opacity', isFetching && 'opacity-60')}>
                        <table className="w-full border-collapse text-[13px]">
                            <thead>
                                <tr className="border-y border-line bg-sunken/50">
                                    {definition.columns.map((column) => {
                                        const active = sort?.key === column.key;
                                        const Icon = !active ? ChevronsUpDown : sort.descending ? ArrowDown : ArrowUp;

                                        return (
                                            <th key={column.key} className={cn('h-11 px-3 text-xs font-medium whitespace-nowrap first:pl-6 last:pr-6', numeric(column) ? 'text-right' : 'text-left')}>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSort(column)}
                                                    className={cn('inline-flex items-center gap-1 rounded transition-colors hover:text-ink', active ? 'text-ink' : 'text-ink-3', numeric(column) && 'flex-row-reverse')}
                                                >
                                                    {column.label}
                                                    <Icon className={cn('no-print size-3', !active && 'opacity-40')} />
                                                </button>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((row, index) => {
                                    const href = definition.link?.(row);

                                    return (
                                        <tr key={index} className="row-hover border-b border-line">
                                            {definition.columns.map((column, position) => (
                                                <td
                                                    key={column.key}
                                                    className={cn(
                                                        'h-11 px-3 py-2 first:pl-6 last:pr-6',
                                                        numeric(column) ? 'num text-right whitespace-nowrap' : column.kind === 'mono' ? 'font-mono text-[12.5px] whitespace-nowrap' : 'max-w-[320px]',
                                                        position === 0 && 'font-medium',
                                                        (column.kind === 'date' || column.kind === 'datetime') && 'num whitespace-nowrap text-ink-2',
                                                    )}
                                                >
                                                    {href && position === 0 ? (
                                                        <Link to={href} className="underline decoration-accent-strong decoration-2 underline-offset-4 hover:decoration-ink">
                                                            {display(column, row[column.key])}
                                                        </Link>
                                                    ) : (
                                                        display(column, row[column.key])
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                            {totals && (
                                <tfoot>
                                    <tr className="border-t-2 border-line-strong bg-sunken/50 font-semibold">
                                        {definition.columns.map((column, position) => (
                                            <td key={column.key} className={cn('h-12 px-3 first:pl-6 last:pr-6', numeric(column) && 'num text-right whitespace-nowrap')}>
                                                {position === 0 ? `Total · ${rows.length.toLocaleString()} ${rows.length === 1 ? 'row' : 'rows'}` : column.key in totals ? display(column, totals[column.key]) : null}
                                            </td>
                                        ))}
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                )}

                {definition.note && rows.length > 0 && <p className="border-t border-line px-6 py-3 text-xs leading-relaxed text-ink-3">{definition.note}</p>}

                {!printing && pages > 1 && (
                    <div className="no-print flex items-center justify-between gap-3 border-t border-line px-6 py-3 text-[13px] text-ink-2">
                        <span className="num">
                            {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, rows.length)} <span className="text-ink-3">of</span> {rows.length.toLocaleString()}
                        </span>
                        <div className="flex gap-1.5">
                            <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                                Previous
                            </Button>
                            <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                                Next
                            </Button>
                        </div>
                    </div>
                )}
            </Card>
        </Page>
    );
}
