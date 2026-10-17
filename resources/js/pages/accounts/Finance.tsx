import { Pencil, Plus, Settings2, Trash2, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BarList } from '@/components/charts';
import { AccountSelect, StoreNotice, useHasStore } from '@/components/shared';
import { Button } from '@/components/ui/Button';
import { DateRange, useRange } from '@/components/ui/DateRange';
import { Input, SearchInput, Select } from '@/components/ui/Field';
import { Card, CardHeader, Page, PageHeader, Stat, StatRow, Toolbar } from '@/components/ui/Layout';
import { MenuItem, RowMenu } from '@/components/ui/Menu';
import { Confirm, FormFooter, Modal } from '@/components/ui/Modal';
import { DataTable, Empty, Pager, Stack, type Column } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { formatDate, money, moneyRound, today } from '@/lib/format';
import { useAction, useApi, useDebounced, useDisclosure, useForm, usePaged } from '@/lib/hooks';
import { useCan, useSession } from '@/lib/session';
import type { Named, StoreRef, WithSummary } from '@/lib/types';

type Kind = 'expenses' | 'income';

interface Entry {
    id: number;
    reference_no: string;
    amount: number;
    entry_date: string;
    payee: string | null;
    note: string | null;
    finance_category_id: number;
    account_id: number;
    category: Named;
    account: Named;
    store: StoreRef;
    user: Named | null;
}

interface Category extends Named {
    is_active: boolean;
    entries_count: number;
}

interface Summary {
    total: number;
    by_category: { id: number; name: string; amount: number }[];
}

const blank = { finance_category_id: '', account_id: '', amount: '', entry_date: today(), payee: '', note: '' };

function EntryForm({ type, entry, categories, onClose }: { type: Kind; entry: Entry | true | null; categories?: Category[]; onClose: () => void }) {
    const editing = typeof entry === 'object' ? entry : null;
    const expense = type === 'expenses';
    const form = useForm(blank);

    useEffect(() => {
        if (!entry) return;
        form.reset(
            editing
                ? {
                      finance_category_id: String(editing.finance_category_id),
                      account_id: String(editing.account_id),
                      amount: String(editing.amount),
                      entry_date: editing.entry_date,
                      payee: editing.payee ?? '',
                      note: editing.note ?? '',
                  }
                : { ...blank, entry_date: today() },
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entry]);

    const save = useAction(() => (editing ? api.put(`finance/${type}/${editing.id}`, form.values) : api.post(`finance/${type}`, form.values)), {
        success: editing ? 'Changes saved' : expense ? 'Expense recorded' : 'Income recorded',
        onInvalid: form.invalid,
        onSuccess: onClose,
    });

    return (
        <Modal
            open={entry !== null}
            onClose={onClose}
            title={editing ? `Edit ${expense ? 'expense' : 'income'}` : expense ? 'Record an expense' : 'Record income'}
            description={editing?.reference_no}
            onSubmit={() => save.mutate()}
            footer={<FormFooter onCancel={onClose} loading={save.isPending} />}
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Amount" required type="number" min="0" step="0.01" {...form.bind('amount')} />
                <Input label="Date" required type="date" max={today()} {...form.bind('entry_date')} />
                <Select label="Category" required {...form.bind('finance_category_id')}>
                    <option value="">Choose a category</option>
                    {categories
                        ?.filter((c) => c.is_active || c.id === editing?.finance_category_id)
                        .map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                </Select>
                <AccountSelect label={expense ? 'Paid from' : 'Received in'} required {...form.bind('account_id')} />
                <Input wrapperClassName="sm:col-span-2" label={expense ? 'Paid to' : 'Received from'} optional {...form.bind('payee')} />
                <Input wrapperClassName="sm:col-span-2" label="Note" optional {...form.bind('note')} />
            </div>
        </Modal>
    );
}

function CategoryManager({ type, categories, open, onClose }: { type: Kind; categories?: Category[]; open: boolean; onClose: () => void }) {
    const [name, setName] = useState('');
    const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);

    const add = useAction(() => api.post(`finance/${type}/categories`, { name }), { onSuccess: () => setName('') });
    const rename = useAction((c: { id: number; name: string }) => api.put(`finance/${type}/categories/${c.id}`, { name: c.name }), { onSuccess: () => setRenaming(null) });
    const remove = useAction((id: number) => api.delete(`finance/${type}/categories/${id}`));

    return (
        <Modal open={open} onClose={onClose} title={`${type === 'expenses' ? 'Expense' : 'Income'} categories`} icon={<Settings2 />} size="sm" flush>
            <form
                className="flex gap-2 border-b border-line p-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (name.trim()) add.mutate();
                }}
            >
                <Input wrapperClassName="flex-1" placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} />
                <Button type="submit" variant="primary" loading={add.isPending} disabled={!name.trim()}>
                    Add
                </Button>
            </form>
            <ul className="divide-y divide-line">
                {categories?.map((category) => (
                    <li key={category.id} className="flex h-11 items-center gap-2 pr-2 pl-5 text-[13px]">
                        {renaming?.id === category.id ? (
                            <form
                                className="flex flex-1 gap-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    rename.mutate(renaming);
                                }}
                            >
                                <Input wrapperClassName="flex-1" className="h-8" autoFocus value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
                                <Button type="submit" size="sm" variant="primary" loading={rename.isPending}>
                                    Save
                                </Button>
                            </form>
                        ) : (
                            <>
                                <span className="flex-1 truncate font-medium">{category.name}</span>
                                <span className="num text-xs text-ink-3">{category.entries_count} entries</span>
                                <Button variant="ghost" size="icon" aria-label="Rename" onClick={() => setRenaming({ id: category.id, name: category.name })}>
                                    <Pencil />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Delete"
                                    disabled={category.entries_count > 0}
                                    title={category.entries_count > 0 ? 'In use — cannot be deleted' : undefined}
                                    onClick={() => remove.mutate(category.id)}
                                >
                                    <Trash2 />
                                </Button>
                            </>
                        )}
                    </li>
                ))}
            </ul>
        </Modal>
    );
}

export default function Finance({ type }: { type: Kind }) {
    const can = useCan();
    const manage = can('finance.manage');
    const hasStore = useHasStore();
    const allStores = useSession((s) => s.storeId === null);
    const expense = type === 'expenses';
    const [range, setRange] = useRange('month');
    const [search, setSearch] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const term = useDebounced(search);
    const editor = useDisclosure<Entry | true>();
    const removal = useDisclosure<Entry>();
    const categoryManager = useDisclosure();

    const { data: categories } = useApi<Category[]>(`finance/${type}/categories`);
    const { data, isLoading, setPage } = usePaged<Entry, WithSummary<Entry, Summary>>(`finance/${type}`, { search: term, category_id: categoryId, from: range.from, to: range.to });

    const remove = useAction((id: number) => api.delete(`finance/${type}/${id}`), { success: 'Entry deleted and balance restored', onSuccess: removal.close });

    const columns: Column<Entry>[] = [
        { key: 'date', header: 'Date', cell: (e) => <Stack primary={<span className="num font-normal">{formatDate(e.entry_date)}</span>} secondary={<span className="font-mono">{e.reference_no}</span>} /> },
        { key: 'category', header: 'Category', cell: (e) => <Stack primary={e.category.name} secondary={e.payee ?? e.note} /> },
        { key: 'account', header: expense ? 'Paid from' : 'Received in', hide: 'md', cell: (e) => <span className="text-ink-2">{e.account.name}</span> },
        ...(allStores ? [{ key: 'store', header: 'Store', hide: 'lg', cell: (e: Entry) => <span className="text-ink-2">{e.store.name}</span> } satisfies Column<Entry>] : []),
        { key: 'amount', header: 'Amount', align: 'right', cell: (e) => <span className="num font-medium">{money(e.amount)}</span> },
        ...(manage
            ? [
                  {
                      key: 'actions',
                      header: '',
                      align: 'right',
                      className: 'w-12',
                      cell: (e: Entry) => (
                          <RowMenu>
                              <MenuItem icon={<Pencil />} onSelect={() => editor.open(e)}>
                                  Edit
                              </MenuItem>
                              <MenuItem icon={<Trash2 />} tone="danger" onSelect={() => removal.open(e)}>
                                  Delete
                              </MenuItem>
                          </RowMenu>
                      ),
                  } satisfies Column<Entry>,
              ]
            : []),
    ];

    return (
        <Page>
            <PageHeader
                title={expense ? 'Expenses' : 'Other income'}
                description={expense ? 'Running costs such as rent, bills and transport. Salaries are paid from Employees.' : 'Money earned outside of sales at the register.'}
                actions={
                    manage && (
                        <>
                            <Button icon={<Settings2 />} onClick={() => categoryManager.open(true)}>
                                Categories
                            </Button>
                            <Button variant="primary" icon={<Plus />} disabled={!hasStore} onClick={() => editor.open(true)}>
                                {expense ? 'Record expense' : 'Record income'}
                            </Button>
                        </>
                    )
                }
            />
            {manage && <StoreNotice action={expense ? 'record an expense' : 'record income'} />}

            <StatRow>
                <Stat label={expense ? 'Total spent' : 'Total received'} value={moneyRound(data?.summary.total)} />
                <Stat label="Entries" value={(data?.total ?? 0).toLocaleString()} />
                <Stat label="Average entry" value={moneyRound(data?.total ? data.summary.total / data.total : 0)} />
                <Stat label="Biggest category" value={data?.summary.by_category[0]?.name ?? '—'} hint={data?.summary.by_category[0] ? money(data.summary.by_category[0].amount) : undefined} />
            </StatRow>

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <Card>
                    <Toolbar>
                        <SearchInput value={search} onChange={setSearch} placeholder="Reference, payee or note" />
                        <Select aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-44">
                            <option value="">All categories</option>
                            {categories?.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </Select>
                        <div className="sm:ml-auto">
                            <DateRange value={range} onChange={setRange} />
                        </div>
                    </Toolbar>
                    <DataTable
                        columns={columns}
                        rows={data?.data}
                        loading={isLoading}
                        empty={<Empty icon={<Wallet />} title={expense ? 'No expenses in this period' : 'No income in this period'} />}
                    />
                    <Pager meta={data} onPage={setPage} />
                </Card>

                <Card>
                    <CardHeader title="By category" />
                    <BarList share items={(data?.summary.by_category ?? []).map((row) => ({ name: row.name, amount: row.amount }))} empty="Nothing recorded in this period." />
                </Card>
            </div>

            <EntryForm type={type} entry={editor.state} categories={categories} onClose={editor.close} />
            <CategoryManager type={type} categories={categories} open={categoryManager.isOpen} onClose={categoryManager.close} />

            <Confirm
                open={removal.isOpen}
                onClose={removal.close}
                onConfirm={() => removal.state && remove.mutate(removal.state.id)}
                loading={remove.isPending}
                title="Delete this entry?"
                message={
                    <>
                        <strong className="font-medium text-ink">{removal.state && money(removal.state.amount)}</strong> will be {expense ? 'returned to' : 'taken back out of'} {removal.state?.account.name}.
                    </>
                }
            />
        </Page>
    );
}
