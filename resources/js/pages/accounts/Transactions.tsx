import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { Badge, type Tone } from '@/components/ui/Badge';
import { DateRange, useRange } from '@/components/ui/DateRange';
import { SearchInput, Select } from '@/components/ui/Field';
import { Card, Page, PageHeader, Stat, StatRow, Tabs, Toolbar } from '@/components/ui/Layout';
import { DataTable, Empty, Pager, Stack, type Column } from '@/components/ui/Table';
import { formatDateTime, money, moneyRound } from '@/lib/format';
import { useApi, useDebounced, usePaged } from '@/lib/hooks';
import type { Account, Payment, WithSummary } from '@/lib/types';
import { accountTabs } from './Accounts';

const categories: Record<string, { label: string; tone: Tone }> = {
    sale: { label: 'Sale', tone: 'good' },
    sale_refund: { label: 'Refund', tone: 'warn' },
    purchase: { label: 'Supplier payment', tone: 'info' },
    expense: { label: 'Expense', tone: 'bad' },
    income: { label: 'Other income', tone: 'good' },
    salary: { label: 'Salary', tone: 'bad' },
    loan: { label: 'Loan', tone: 'info' },
    loan_repayment: { label: 'Loan repayment', tone: 'info' },
    transfer: { label: 'Transfer', tone: 'neutral' },
    opening: { label: 'Opening balance', tone: 'neutral' },
};

export default function Transactions() {
    const [range, setRange] = useRange('7d');
    const [search, setSearch] = useState('');
    const [accountId, setAccountId] = useState('');
    const [category, setCategory] = useState('');
    const term = useDebounced(search);

    const { data: accounts } = useApi<Account[]>('accounts');
    const { data, isLoading, setPage } = usePaged<Payment, WithSummary<Payment, { money_in: number; money_out: number }>>(
        'transactions',
        { search: term, account_id: accountId, category, from: range.from, to: range.to },
        25,
    );

    const columns: Column<Payment>[] = [
        { key: 'when', header: 'Date', cell: (t) => <span className="num whitespace-nowrap text-ink-2">{formatDateTime(t.transacted_at)}</span> },
        { key: 'what', header: 'Description', cell: (t) => <Stack primary={<span className="font-normal">{t.description ?? '—'}</span>} secondary={t.reference && <span className="font-mono">{t.reference}</span>} /> },
        { key: 'category', header: 'Type', hide: 'sm', cell: (t) => <Badge tone={categories[t.category]?.tone}>{categories[t.category]?.label ?? t.category}</Badge> },
        { key: 'account', header: 'Account', hide: 'md', cell: (t) => <span className="text-ink-2">{t.account?.name}</span> },
        { key: 'in', header: 'Money in', align: 'right', cell: (t) => (t.direction === 'in' ? <span className="num font-medium text-good">{money(t.amount)}</span> : null) },
        { key: 'out', header: 'Money out', align: 'right', cell: (t) => (t.direction === 'out' ? <span className="num font-medium">{money(t.amount)}</span> : null) },
    ];

    const moneyIn = data?.summary.money_in ?? 0;
    const moneyOut = data?.summary.money_out ?? 0;

    return (
        <Page>
            <PageHeader title="Accounts" description="Every payment in and out, across all accounts." />
            <Tabs tabs={accountTabs} />

            <StatRow>
                <Stat label="Money in" value={moneyRound(moneyIn)} tone="good" />
                <Stat label="Money out" value={moneyRound(moneyOut)} />
                <Stat label="Net movement" value={moneyRound(moneyIn - moneyOut)} tone={moneyIn - moneyOut < 0 ? 'bad' : 'default'} />
            </StatRow>

            <Card>
                <Toolbar>
                    <SearchInput value={search} onChange={setSearch} placeholder="Reference or description" />
                    <Select aria-label="Account" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-48">
                        <option value="">All accounts</option>
                        {accounts?.map((account) => (
                            <option key={account.id} value={account.id}>
                                {account.name}
                                {account.store ? ` (${account.store.code})` : ''}
                            </option>
                        ))}
                    </Select>
                    <Select aria-label="Type" value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
                        <option value="">All types</option>
                        {Object.entries(categories).map(([key, value]) => (
                            <option key={key} value={key}>
                                {value.label}
                            </option>
                        ))}
                    </Select>
                    <div className="sm:ml-auto">
                        <DateRange value={range} onChange={setRange} />
                    </div>
                </Toolbar>
                <DataTable dense columns={columns} rows={data?.data} loading={isLoading} empty={<Empty icon={<ScrollText />} title="No transactions in this period" />} />
                <Pager meta={data} onPage={setPage} />
            </Card>
        </Page>
    );
}
