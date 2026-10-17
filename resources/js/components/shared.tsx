import { ArrowLeft, HandCoins, Store } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useAction, useApi, useForm } from '@/lib/hooks';
import { useCurrentStore, useSession } from '@/lib/session';
import type { Account } from '@/lib/types';
import { Input, Select, type SelectProps } from './ui/Field';
import { FormFooter, Modal } from './ui/Modal';

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
    return (
        <Link to={to} className="mb-2 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
            <ArrowLeft className="size-3.5" />
            {children}
        </Link>
    );
}

/**
 * Shown on screens that create documents while "All stores" is selected:
 * a purchase or an adjustment always belongs to one store.
 */
export function StoreNotice({ action }: { action: string }) {
    const store = useCurrentStore();

    if (store) return null;

    return (
        <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-info/25 bg-info-soft px-4 py-2.5 text-[13px] text-info">
            <Store className="size-4 shrink-0" />
            You are viewing all stores. Pick a store from the switcher at the top to {action}.
        </div>
    );
}

export const useHasStore = () => useSession((s) => s.storeId !== null);

type AccountOption = Pick<Account, 'id' | 'name' | 'type' | 'balance' | 'store_id'>;

export function AccountSelect({ showBalance, ...props }: SelectProps & { showBalance?: boolean }) {
    const { data } = useApi<AccountOption[]>('accounts/options');

    return (
        <Select {...props}>
            <option value="">Choose an account</option>
            {data?.map((account) => (
                <option key={account.id} value={account.id}>
                    {account.name}
                    {showBalance ? ` — ${money(account.balance)}` : ''}
                </option>
            ))}
        </Select>
    );
}

interface SettleDialogProps {
    open: boolean;
    onClose: () => void;
    /** e.g. "sales/12/payments" */
    url: string;
    title: string;
    due: number;
    submitLabel: string;
    success: string;
}

/** Records a payment against an invoice or a purchase. */
export function SettleDialog({ open, onClose, url, title, due, submitLabel, success }: SettleDialogProps) {
    const form = useForm({ amount: '', account_id: '' });

    const save = useAction(() => api.post(url, form.values), {
        success,
        onInvalid: form.invalid,
        onSuccess: () => {
            form.reset({ amount: '', account_id: '' });
            onClose();
        },
    });

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={title}
            icon={<HandCoins />}
            description={`Outstanding balance ${money(due)}`}
            size="sm"
            onSubmit={() => save.mutate()}
            footer={<FormFooter onCancel={onClose} loading={save.isPending} submitLabel={submitLabel} />}
        >
            <div className="space-y-4">
                <Input
                    label="Amount"
                    type="number"
                    step="0.01"
                    min="0"
                    max={due}
                    required
                    hint={
                        <button type="button" className="font-medium text-ink underline decoration-accent-strong decoration-2 underline-offset-4 hover:decoration-ink" onClick={() => form.set('amount', due.toFixed(2))}>
                            Pay the full balance
                        </button>
                    }
                    {...form.bind('amount')}
                />
                <AccountSelect label="Account" required showBalance {...form.bind('account_id')} />
            </div>
        </Modal>
    );
}
