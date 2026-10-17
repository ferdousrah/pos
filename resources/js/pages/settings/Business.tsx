import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Switch, Textarea } from '@/components/ui/Field';
import { Card, Page, PageHeader } from '@/components/ui/Layout';
import { api } from '@/lib/api';
import { useAction, useForm } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Settings } from '@/lib/types';
import { SettingsTabs } from './common';

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
    return (
        <div className="grid gap-x-10 gap-y-4 border-b border-line px-6 py-6 last:border-0 md:grid-cols-[240px_minmax(0,1fr)]">
            <div>
                <h2 className="text-sm font-semibold">{title}</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{description}</p>
            </div>
            <div className="max-w-lg space-y-4">{children}</div>
        </div>
    );
}

export default function Business() {
    const profile = useSession((s) => s.profile!);
    const setProfile = useSession((s) => s.setProfile);
    const form = useForm({ ...profile.settings, allow_negative_stock: profile.settings.allow_negative_stock === '1' });

    useEffect(() => {
        form.reset({ ...profile.settings, allow_negative_stock: profile.settings.allow_negative_stock === '1' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile.settings]);

    const save = useAction(() => api.put<Settings>('settings', form.values), {
        success: 'Settings saved',
        onInvalid: form.invalid,
        onSuccess: (settings) => setProfile({ ...profile, settings }),
    });

    return (
        <Page>
            <PageHeader title="Settings" description="How your business appears on receipts and how the system behaves." />
            <SettingsTabs />

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    save.mutate();
                }}
            >
                <Card>
                    <Section title="Business profile" description="Printed at the top of every receipt.">
                        <Input label="Business name" required {...form.bind('business_name')} />
                        <Input label="Phone" optional {...form.bind('business_phone')} />
                        <Input label="Address" optional {...form.bind('business_address')} />
                    </Section>

                    <Section title="Money" description="Used wherever amounts are shown.">
                        <div className="grid grid-cols-2 gap-4">
                            <Input label="Currency symbol" required {...form.bind('currency_symbol')} />
                            <Input label="Tax name" required hint="For example VAT or GST." {...form.bind('tax_label')} />
                        </div>
                    </Section>

                    <Section title="Receipts" description="A closing line under the totals.">
                        <Textarea label="Footer message" optional rows={2} {...form.bind('receipt_footer')} />
                    </Section>

                    <Section title="Stock control" description="What happens when the register sells more than the system thinks is on the shelf.">
                        <Switch
                            checked={form.values.allow_negative_stock}
                            onChange={(v) => form.set('allow_negative_stock', v)}
                            label="Allow selling when out of stock"
                            description="Stock goes negative until the next delivery is received. Turn this off to block the sale instead."
                        />
                    </Section>

                    <div className="flex justify-end border-t border-line bg-canvas/60 px-6 py-3.5">
                        <Button type="submit" variant="primary" loading={save.isPending}>
                            Save settings
                        </Button>
                    </div>
                </Card>
            </form>
        </Page>
    );
}
