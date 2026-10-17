import { BadgePercent, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ProductPicker } from '@/components/ProductPicker';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, SearchInput, Segmented, Select, Switch } from '@/components/ui/Field';
import { Card, Page, PageHeader, Stat, StatRow, Toolbar } from '@/components/ui/Layout';
import { MenuItem, RowMenu } from '@/components/ui/Menu';
import { Confirm, FormFooter, Modal } from '@/components/ui/Modal';
import { DataTable, Empty, Pager, Stack, type Column } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { formatDate, money } from '@/lib/format';
import { useAction, useApi, useDebounced, useDisclosure, useForm, usePaged } from '@/lib/hooks';
import { useCan, useSession } from '@/lib/session';
import type { Named, StoreRef, WithSummary } from '@/lib/types';

interface Discount {
    id: number;
    store_id: number | null;
    name: string;
    code: string | null;
    type: 'percent' | 'fixed';
    value: number;
    applies_to: 'order' | 'category' | 'product';
    min_purchase: number;
    max_discount: number | null;
    starts_at: string | null;
    ends_at: string | null;
    usage_limit: number | null;
    used_count: number;
    is_active: boolean;
    targets_count: number;
    store?: StoreRef | null;
    targets?: Named[];
}

function state(discount: Discount): { label: string; tone: Tone } {
    const now = Date.now();
    if (!discount.is_active) return { label: 'Paused', tone: 'neutral' };
    if (discount.ends_at && new Date(discount.ends_at).getTime() < now) return { label: 'Ended', tone: 'neutral' };
    if (discount.starts_at && new Date(discount.starts_at).getTime() > now) return { label: 'Scheduled', tone: 'info' };
    if (discount.usage_limit && discount.used_count >= discount.usage_limit) return { label: 'Used up', tone: 'neutral' };
    return { label: 'Running', tone: 'good' };
}

/** ISO timestamp → value for <input type="datetime-local"> in the browser's zone. */
const toLocalInput = (iso: string | null) => {
    if (!iso) return '';
    const date = new Date(iso);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const blank = {
    name: '',
    kind: 'automatic' as 'automatic' | 'coupon',
    code: '',
    type: 'percent' as 'percent' | 'fixed',
    value: '',
    applies_to: 'order' as Discount['applies_to'],
    min_purchase: '',
    max_discount: '',
    starts_at: '',
    ends_at: '',
    usage_limit: '',
    store_id: '',
    is_active: true,
};

function DiscountForm({ discount, onClose }: { discount: Discount | true | null; onClose: () => void }) {
    const editing = typeof discount === 'object' ? discount : null;
    const stores = useSession((s) => s.profile!.stores);
    const symbol = useSession((s) => s.profile!.settings.currency_symbol);
    const form = useForm(blank);
    const [targets, setTargets] = useState<Named[]>([]);
    const { data: options } = useApi<{ categories: Named[] }>('products/options');
    const { data: detail } = useApi<Discount>(`discounts/${editing?.id}`, undefined, { enabled: !!editing });

    useEffect(() => {
        if (!discount) return;
        setTargets([]);
        form.reset(
            editing
                ? {
                      name: editing.name,
                      kind: editing.code ? 'coupon' : 'automatic',
                      code: editing.code ?? '',
                      type: editing.type,
                      value: String(editing.value),
                      applies_to: editing.applies_to,
                      min_purchase: editing.min_purchase ? String(editing.min_purchase) : '',
                      max_discount: editing.max_discount ? String(editing.max_discount) : '',
                      starts_at: toLocalInput(editing.starts_at),
                      ends_at: toLocalInput(editing.ends_at),
                      usage_limit: editing.usage_limit ? String(editing.usage_limit) : '',
                      store_id: editing.store_id ? String(editing.store_id) : '',
                      is_active: editing.is_active,
                  }
                : blank,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [discount]);

    useEffect(() => {
        if (editing && detail?.id === editing.id) setTargets(detail.targets ?? []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detail]);

    const v = form.values;
    const coupon = v.kind === 'coupon';
    const appliesTo = coupon ? 'order' : v.applies_to;

    const save = useAction(
        () => {
            const { kind: _kind, ...rest } = v;
            const payload = {
                ...Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, value === '' ? null : value])),
                code: coupon ? v.code : null,
                applies_to: appliesTo,
                target_ids: targets.map((t) => t.id),
            };
            return editing ? api.put(`discounts/${editing.id}`, payload) : api.post('discounts', payload);
        },
        { success: editing ? 'Discount updated' : 'Discount created', onInvalid: form.invalid, onSuccess: onClose },
    );

    const toggleTarget = (item: Named) => setTargets((current) => (current.some((t) => t.id === item.id) ? current.filter((t) => t.id !== item.id) : [...current, item]));

    return (
        <Modal
            open={discount !== null}
            onClose={onClose}
            variant="sheet"
            title={editing ? 'Edit discount' : 'New discount'}
            onSubmit={() => save.mutate()}
            footer={<FormFooter onCancel={onClose} loading={save.isPending} submitLabel={editing ? 'Save changes' : 'Create discount'} />}
        >
            <div className="space-y-5">
                <Segmented
                    className="flex w-full"
                    value={v.kind}
                    onChange={(kind) => form.set('kind', kind)}
                    options={[
                        { value: 'automatic', label: 'Automatic promotion' },
                        { value: 'coupon', label: 'Coupon code' },
                    ]}
                />
                <p className="-mt-2 text-xs text-ink-3">
                    {coupon ? 'The cashier enters the code at the register. Applies to the whole order.' : 'Applied at the register by itself whenever the conditions are met.'}
                </p>

                <Input label="Name" required placeholder="e.g. Weekend snack offer" hint="Shown on the register and in reports." {...form.bind('name')} />
                {coupon && <Input label="Code" required className="font-mono uppercase" placeholder="e.g. SAVE50" {...form.bind('code')} onChange={(e) => form.set('code', e.target.value.toUpperCase())} />}

                <div className="flex items-start gap-3">
                    <div>
                        <span className="mb-1.5 block text-[13px] font-medium">Type</span>
                        <Segmented
                            value={v.type}
                            onChange={(type) => form.set('type', type)}
                            options={[
                                { value: 'percent', label: 'Percentage' },
                                { value: 'fixed', label: 'Fixed amount' },
                            ]}
                        />
                    </div>
                    <Input wrapperClassName="flex-1" label="Value" required type="number" min="0" step="0.01" prefix={v.type === 'fixed' ? symbol : undefined} suffix={v.type === 'percent' ? '%' : undefined} {...form.bind('value')} />
                </div>

                {!coupon && (
                    <div>
                        <span className="mb-1.5 block text-[13px] font-medium">Applies to</span>
                        <Segmented
                            className="flex w-full"
                            value={v.applies_to}
                            onChange={(next) => {
                                form.set('applies_to', next);
                                setTargets([]);
                            }}
                            options={[
                                { value: 'order', label: 'Whole order' },
                                { value: 'category', label: 'Categories' },
                                { value: 'product', label: 'Products' },
                            ]}
                        />

                        {appliesTo === 'category' && (
                            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-2xl border border-line p-4">
                                {options?.categories.map((category) => (
                                    <Checkbox key={category.id} checked={targets.some((t) => t.id === category.id)} onChange={() => toggleTarget(category)} label={category.name} />
                                ))}
                            </div>
                        )}

                        {appliesTo === 'product' && (
                            <div className="mt-3">
                                <ProductPicker showStock={false} exclude={targets.map((t) => t.id)} onPick={(product) => setTargets((current) => [...current, { id: product.id, name: product.name }])} placeholder="Search products to include" />
                                {targets.length > 0 && (
                                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                                        {targets.map((target) => (
                                            <span key={target.id} className="flex h-7 items-center gap-1 rounded-full bg-sunken pr-1 pl-2.5 text-xs font-medium">
                                                {target.name}
                                                <button type="button" aria-label={`Remove ${target.name}`} onClick={() => toggleTarget(target)} className="grid size-5 place-items-center rounded-full text-ink-3 hover:bg-line hover:text-ink">
                                                    <X className="size-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {form.errors.target_ids && <p className="mt-1.5 text-xs text-bad">{form.errors.target_ids}</p>}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    {appliesTo === 'order' && <Input label="Minimum purchase" optional type="number" min="0" step="0.01" prefix={symbol} {...form.bind('min_purchase')} />}
                    {v.type === 'percent' && <Input label="Maximum discount" optional type="number" min="0" step="0.01" prefix={symbol} {...form.bind('max_discount')} />}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Input label="Starts" optional type="datetime-local" {...form.bind('starts_at')} />
                    <Input label="Ends" optional type="datetime-local" {...form.bind('ends_at')} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Select label="Available at" {...form.bind('store_id')}>
                        <option value="">All stores</option>
                        {stores.map((store) => (
                            <option key={store.id} value={store.id}>
                                {store.name}
                            </option>
                        ))}
                    </Select>
                    <Input label="Usage limit" optional type="number" min="1" step="1" placeholder="Unlimited" {...form.bind('usage_limit')} />
                </div>

                <Switch checked={v.is_active} onChange={(value) => form.set('is_active', value)} label="Active" description="Pause a discount without losing its settings." />
            </div>
        </Modal>
    );
}

export default function Discounts() {
    const can = useCan();
    const manage = can('discounts.manage');
    const [search, setSearch] = useState('');
    const [kind, setKind] = useState('');
    const term = useDebounced(search);
    const editor = useDisclosure<Discount | true>();
    const removal = useDisclosure<Discount>();

    const { data, isLoading, setPage } = usePaged<Discount, WithSummary<Discount, { total: number; coupons: number; running: number; used: number }>>('discounts', { search: term, kind });
    const remove = useAction((id: number) => api.delete(`discounts/${id}`), { success: 'Discount deleted', onSuccess: removal.close });

    const scope = (d: Discount) => {
        if (d.applies_to === 'order') return d.min_purchase > 0 ? `Orders over ${money(d.min_purchase)}` : 'Whole order';
        const noun = d.applies_to === 'category' ? 'categor' : 'product';
        return `${d.targets_count} ${noun}${d.applies_to === 'category' ? (d.targets_count === 1 ? 'y' : 'ies') : d.targets_count === 1 ? '' : 's'}`;
    };

    const columns: Column<Discount>[] = [
        {
            key: 'name',
            header: 'Discount',
            cell: (d) => <Stack primary={d.name} secondary={d.code ? <span className="font-mono">{d.code}</span> : 'Automatic'} />,
        },
        {
            key: 'value',
            header: 'Value',
            cell: (d) => (
                <span className="num font-medium">
                    {d.type === 'percent' ? `${d.value}%` : money(d.value)}
                    {d.max_discount ? <span className="ml-1.5 text-xs font-normal text-ink-3">up to {money(d.max_discount)}</span> : null}
                </span>
            ),
        },
        { key: 'scope', header: 'Applies to', hide: 'md', cell: (d) => <span className="text-ink-2">{scope(d)}</span> },
        { key: 'store', header: 'Store', hide: 'lg', cell: (d) => <span className="text-ink-2">{d.store?.name ?? 'All stores'}</span> },
        {
            key: 'period',
            header: 'Period',
            hide: 'lg',
            cell: (d) => <span className="num text-ink-2">{d.starts_at || d.ends_at ? `${d.starts_at ? formatDate(d.starts_at) : 'Now'} – ${d.ends_at ? formatDate(d.ends_at) : 'no end'}` : 'Always'}</span>,
        },
        {
            key: 'used',
            header: 'Used',
            align: 'right',
            hide: 'sm',
            cell: (d) => (
                <span className="num text-ink-2">
                    {d.used_count}
                    {d.usage_limit ? ` / ${d.usage_limit}` : ''}
                </span>
            ),
        },
        {
            key: 'state',
            header: 'Status',
            cell: (d) => {
                const s = state(d);
                return <Badge tone={s.tone}>{s.label}</Badge>;
            },
        },
        ...(manage
            ? [
                  {
                      key: 'actions',
                      header: '',
                      align: 'right',
                      className: 'w-12',
                      cell: (d: Discount) => (
                          <RowMenu>
                              <MenuItem icon={<Pencil />} onSelect={() => editor.open(d)}>
                                  Edit
                              </MenuItem>
                              <MenuItem icon={<Trash2 />} tone="danger" onSelect={() => removal.open(d)}>
                                  Delete
                              </MenuItem>
                          </RowMenu>
                      ),
                  } satisfies Column<Discount>,
              ]
            : []),
    ];

    return (
        <Page>
            <PageHeader
                title="Discounts"
                description="Promotions that apply by themselves and coupon codes for the register."
                actions={
                    manage && (
                        <Button variant="primary" icon={<Plus />} onClick={() => editor.open(true)}>
                            New discount
                        </Button>
                    )
                }
            />

            <StatRow>
                <Stat label="Discounts" value={data?.summary.total ?? 0} />
                <Stat label="Running now" value={data?.summary.running ?? 0} />
                <Stat label="Coupon codes" value={data?.summary.coupons ?? 0} hint={data ? `${data.summary.total - data.summary.coupons} automatic` : undefined} />
                <Stat label="Times used" value={(data?.summary.used ?? 0).toLocaleString()} />
            </StatRow>

            <Card>
                <Toolbar>
                    <SearchInput value={search} onChange={setSearch} placeholder="Name or code" />
                    <Select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} className="w-44">
                        <option value="">All discounts</option>
                        <option value="automatic">Automatic promotions</option>
                        <option value="coupon">Coupon codes</option>
                    </Select>
                </Toolbar>
                <DataTable
                    columns={columns}
                    rows={data?.data}
                    loading={isLoading}
                    onRowClick={manage ? (d) => editor.open(d) : undefined}
                    empty={<Empty icon={<BadgePercent />} title="No discounts yet" hint="Create a promotion or a coupon code to get started." />}
                />
                <Pager meta={data} onPage={setPage} />
            </Card>

            <DiscountForm discount={editor.state} onClose={editor.close} />

            <Confirm
                open={removal.isOpen}
                onClose={removal.close}
                onConfirm={() => removal.state && remove.mutate(removal.state.id)}
                loading={remove.isPending}
                title="Delete discount?"
                message={
                    <>
                        <strong className="font-medium text-ink">{removal.state?.name}</strong> will stop applying immediately. Past sales keep the discount they were given.
                    </>
                }
            />
        </Page>
    );
}
