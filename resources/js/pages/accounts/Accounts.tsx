import { ArrowLeftRight, Banknote, CreditCard, Landmark, Pencil, Plus, Smartphone } from 'lucide-react';
import { useEffect } from 'react';
import { AccountSelect } from '@/components/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select, Switch } from '@/components/ui/Field';
import { Card, Page, PageHeader, Stat, StatRow, Tabs, trackPointer } from '@/components/ui/Layout';
import { FormFooter, Modal } from '@/components/ui/Modal';
import { PageLoader } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { money, moneyRound, today } from '@/lib/format';
import { useAction, useApi, useDisclosure, useForm } from '@/lib/hooks';
import { useCan, useSession } from '@/lib/session';
import type { Account } from '@/lib/types';

export const accountTabs = [
    { to: '/accounts', label: 'Accounts', end: true },
    { to: '/accounts/transactions', label: 'Transactions' },
];

const kinds = {
    cash: { label: 'Cash', icon: Banknote },
    bank: { label: 'Bank', icon: Landmark },
    mobile: { label: 'Mobile banking', icon: Smartphone },
    card: { label: 'Card terminal', icon: CreditCard },
};

const blank = { name: '', type: 'cash' as Account['type'], account_number: '', store_id: '', opening_balance: '', is_active: true };

function AccountForm({ account, onClose }: { account: Account | true | null; onClose: () => void }) {
    const editing = typeof account === 'object' ? account : null;
    const stores = useSession((s) => s.profile!.stores);
    const form = useForm(blank);

    useEffect(() => {
        if (!account) return;
        form.reset(
            editing
                ? { name: editing.name, type: editing.type, account_number: editing.account_number ?? '', store_id: editing.store_id ? String(editing.store_id) : '', opening_balance: '', is_active: editing.is_active }
                : blank,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [account]);

    const save = useAction(
        () => {
            const payload = { ...form.values, store_id: form.values.store_id || null, opening_balance: form.values.opening_balance || null };
            return editing ? api.put(`accounts/${editing.id}`, payload) : api.post('accounts', payload);
        },
        { success: editing ? 'Account updated' : 'Account created', onInvalid: form.invalid, onSuccess: onClose },
    );

    return (
        <Modal open={account !== null} onClose={onClose} title={editing ? 'Edit account' : 'New account'} onSubmit={() => save.mutate()} footer={<FormFooter onCancel={onClose} loading={save.isPending} />}>
            <div className="grid gap-4 sm:grid-cols-2">
                <Input wrapperClassName="sm:col-span-2" label="Account name" required placeholder="e.g. Cash drawer" {...form.bind('name')} />
                <Select label="Type" {...form.bind('type')}>
                    {Object.entries(kinds).map(([key, kind]) => (
                        <option key={key} value={key}>
                            {kind.label}
                        </option>
                    ))}
                </Select>
                <Select label="Belongs to" hint="Shared accounts can be used from any store." {...form.bind('store_id')}>
                    <option value="">Shared by all stores</option>
                    {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                            {store.name}
                        </option>
                    ))}
                </Select>
                <Input label="Account number" optional className="font-mono" {...form.bind('account_number')} />
                {!editing && <Input label="Opening balance" optional type="number" step="0.01" placeholder="0.00" {...form.bind('opening_balance')} />}
                {editing && (
                    <div className="sm:col-span-2">
                        <Switch checked={form.values.is_active} onChange={(v) => form.set('is_active', v)} label="Active" description="Inactive accounts cannot receive or make payments." />
                    </div>
                )}
            </div>
        </Modal>
    );
}

function TransferForm({ open, onClose }: { open: boolean; onClose: () => void }) {
    const blankTransfer = { from_account_id: '', to_account_id: '', amount: '', date: today(), note: '' };
    const form = useForm(blankTransfer);

    const save = useAction(() => api.post('accounts/transfer', form.values), {
        success: 'Transfer recorded',
        onInvalid: form.invalid,
        onSuccess: () => {
            form.reset(blankTransfer);
            onClose();
        },
    });

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Move money"
            icon={<ArrowLeftRight />}
            description="For example, banking the day's cash from a drawer."
            onSubmit={() => save.mutate()}
            footer={<FormFooter onCancel={onClose} loading={save.isPending} submitLabel="Transfer" />}
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <AccountSelect label="From" required showBalance {...form.bind('from_account_id')} />
                <AccountSelect label="To" required showBalance {...form.bind('to_account_id')} />
                <Input label="Amount" required type="number" min="0" step="0.01" {...form.bind('amount')} />
                <Input label="Date" required type="date" max={today()} {...form.bind('date')} />
                <Input wrapperClassName="sm:col-span-2" label="Note" optional {...form.bind('note')} />
            </div>
        </Modal>
    );
}

export default function Accounts() {
    const can = useCan();
    const manage = can('accounts.manage');
    const { data } = useApi<Account[]>('accounts');
    const editor = useDisclosure<Account | true>();
    const transfer = useDisclosure();

    if (!data) return <PageLoader />;

    const active = data.filter((account) => account.is_active);
    const sum = (types: Account['type'][]) => active.filter((a) => types.includes(a.type)).reduce((total, a) => total + a.balance, 0);

    return (
        <Page>
            <PageHeader
                title="Accounts"
                description="Where your money sits: drawers, bank and mobile wallets."
                actions={
                    manage && (
                        <>
                            <Button icon={<ArrowLeftRight />} onClick={() => transfer.open(true)}>
                                Move money
                            </Button>
                            <Button variant="primary" icon={<Plus />} onClick={() => editor.open(true)}>
                                New account
                            </Button>
                        </>
                    )
                }
            />
            <Tabs tabs={accountTabs} />

            <StatRow>
                <Stat label="Total balance" value={moneyRound(sum(['cash', 'bank', 'mobile', 'card']))} />
                <Stat label="Cash in drawers" value={moneyRound(sum(['cash']))} />
                <Stat label="In the bank" value={moneyRound(sum(['bank']))} />
                <Stat label="Mobile and card" value={moneyRound(sum(['mobile', 'card']))} hint="Awaiting settlement" />
            </StatRow>

            <div onPointerMove={trackPointer} className="stat-row grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {data.map((account) => {
                    const kind = kinds[account.type];
                    return (
                        <Card key={account.id} className={cn("p-5 dark:ring-0", !account.is_active && 'opacity-60')}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface/80 text-ink">
                                        <kind.icon className="size-[18px]" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{account.name}</p>
                                        <p className="truncate text-xs text-ink-3">
                                            {kind.label} · {account.store?.name ?? 'Shared'}
                                        </p>
                                    </div>
                                </div>
                                {manage && (
                                    <Button variant="ghost" size="icon" aria-label={`Edit ${account.name}`} onClick={() => editor.open(account)} className="-mt-1 -mr-2">
                                        <Pencil />
                                    </Button>
                                )}
                            </div>
                            <p className={cn('num mt-5 text-2xl font-semibold tracking-[-0.02em]', account.balance < 0 && 'text-bad')}>{money(account.balance)}</p>
                            <div className="mt-1 flex items-center justify-between">
                                <span className="font-mono text-xs text-ink-3">{account.account_number ?? ' '}</span>
                                {!account.is_active && <Badge>Inactive</Badge>}
                            </div>
                        </Card>
                    );
                })}
            </div>

            <AccountForm account={editor.state} onClose={editor.close} />
            <TransferForm open={transfer.isOpen} onClose={transfer.close} />
        </Page>
    );
}
