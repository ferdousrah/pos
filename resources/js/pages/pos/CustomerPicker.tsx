import { Plus, Search, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { FormFooter, Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAction, useApi, useDebounced, useForm } from '@/lib/hooks';
import type { CartCustomer } from './cart';

interface Props {
    value: CartCustomer | null;
    onChange: (customer: CartCustomer | null) => void;
}

export function CustomerPicker({ value, onChange }: Props) {
    const [open, setOpen] = useState(false);
    const [term, setTerm] = useState('');
    const [creating, setCreating] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const search = useDebounced(term.trim(), 200);
    const { data } = useApi<CartCustomer[]>('customers/options', { search }, { enabled: open });

    const form = useForm({ name: '', phone: '' });
    const create = useAction(() => api.post<CartCustomer>('customers', form.values), {
        success: 'Customer added',
        onInvalid: form.invalid,
        onSuccess: (customer) => {
            onChange(customer);
            setCreating(false);
            setOpen(false);
        },
    });

    useEffect(() => {
        const close = (event: MouseEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    return (
        <div ref={root} className="relative">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line-strong bg-surface px-3 text-left shadow-card hover:bg-sunken"
                >
                    <UserRound className="size-4 shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-[13.5px]', value ? 'font-medium text-ink' : 'text-ink-2')}>{value?.name ?? 'Walk-in customer'}</span>
                    </span>
                    {value?.phone && <span className="num shrink-0 text-xs text-ink-3">{value.phone}</span>}
                </button>
                {value && (
                    <Button variant="ghost" size="icon" aria-label="Remove customer" onClick={() => onChange(null)} className="size-10">
                        <X />
                    </Button>
                )}
            </div>

            {open && (
                <div className="absolute inset-x-0 top-full z-30 mt-1.5 rounded-2xl border border-line bg-surface shadow-pop">
                    <div className="relative border-b border-line">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
                        <input
                            autoFocus
                            value={term}
                            onChange={(e) => setTerm(e.target.value)}
                            placeholder="Name or phone"
                            className="h-10 w-full bg-transparent pr-3 pl-9 text-[13.5px] placeholder:text-ink-3 focus:outline-none"
                        />
                    </div>
                    <div className="max-h-56 overflow-y-auto p-1">
                        {data?.length === 0 && <p className="px-3 py-4 text-center text-[13px] text-ink-3">No customer found.</p>}
                        {data?.map((customer) => (
                            <button
                                key={customer.id}
                                type="button"
                                onClick={() => {
                                    onChange(customer);
                                    setOpen(false);
                                    setTerm('');
                                }}
                                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-[13px] hover:bg-sunken"
                            >
                                <span className="truncate font-medium">{customer.name}</span>
                                <span className="num shrink-0 text-xs text-ink-3">{customer.phone}</span>
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            form.reset({ name: /^\+?[\d\s-]+$/.test(term) ? '' : term, phone: /^\+?[\d\s-]+$/.test(term) ? term : '' });
                            setCreating(true);
                        }}
                        className="flex w-full items-center gap-2 border-t border-line px-4 py-2.5 text-[13px] font-medium text-brand hover:bg-sunken dark:text-brand-strong"
                    >
                        <Plus className="size-4" />
                        New customer
                    </button>
                </div>
            )}

            <Modal
                open={creating}
                onClose={() => setCreating(false)}
                title="New customer"
                size="sm"
                onSubmit={() => create.mutate()}
                footer={<FormFooter onCancel={() => setCreating(false)} loading={create.isPending} submitLabel="Add customer" />}
            >
                <div className="space-y-4">
                    <Input label="Name" required {...form.bind('name')} />
                    <Input label="Phone" optional inputMode="tel" {...form.bind('phone')} />
                </div>
            </Modal>
        </div>
    );
}
