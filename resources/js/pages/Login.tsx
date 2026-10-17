import { ArrowRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { HeroArt } from '@/components/HeroArt';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input } from '@/components/ui/Field';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Profile } from '@/lib/types';

const demo = [
    { role: 'Owner', email: 'owner@kontor.test' },
    { role: 'Store manager', email: 'manager@kontor.test' },
    { role: 'Cashier', email: 'cashier@kontor.test' },
];

export default function Login() {
    const setProfile = useSession((s) => s.setProfile);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [remember, setRemember] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError('');

        try {
            const { data } = await api.post<Profile>('login', { email, password, remember });
            setProfile(data);
        } catch (err) {
            setError(fieldErrors(err).email ?? errorMessage(err));
            setBusy(false);
        }
    };

    return (
        <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="flex flex-col px-6 py-8 sm:px-12">
                <div className="flex items-center gap-2.5">
                    <Logo />
                    <span className="text-[15px] font-semibold tracking-tight">{window.__APP__.name}</span>
                </div>

                <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-12">
                    <h1 className="text-[30px] font-medium tracking-[-0.02em]">Sign in</h1>
                    <p className="mt-1.5 text-ink-2">Use the account your administrator gave you.</p>

                    <form onSubmit={submit} className="mt-8 space-y-4">
                        <Input label="Email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
                        <Input
                            label="Password"
                            type="password"
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            error={error || undefined}
                            className="h-10"
                        />
                        <Checkbox checked={remember} onChange={setRemember} label="Keep me signed in on this device" />
                        <Button type="submit" variant="primary" loading={busy} className="h-11 w-full">
                            Sign in
                        </Button>
                    </form>

                    {import.meta.env.DEV && (
                        <div className="mt-10 rounded-2xl border border-dashed border-line-strong p-4">
                            <p className="text-xs font-medium text-ink-2">Demo accounts · password is “password”</p>
                            <ul className="mt-2 space-y-1">
                                {demo.map((account) => (
                                    <li key={account.email}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEmail(account.email);
                                                setPassword('password');
                                            }}
                                            className="group flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[13px] hover:bg-sunken"
                                        >
                                            <span>
                                                <span className="font-medium">{account.role}</span>
                                                <span className="ml-2 text-ink-3">{account.email}</span>
                                            </span>
                                            <ArrowRight className="size-3.5 text-ink-3 opacity-0 group-hover:opacity-100" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <p className="text-xs text-ink-3">© {new Date().getFullYear()} {window.__APP__.name}. All rights reserved.</p>
            </div>

            <div className="relative isolate m-3 hidden overflow-hidden rounded-[30px] lg:block">
                <HeroArt className="-z-10" />
                <div className="relative flex h-full flex-col justify-between p-14 text-white">
                    <p className="inline-flex w-fit rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-medium text-white ring-1 ring-white/30 backdrop-blur-md">Point of sale · Inventory · Accounts</p>

                    <div>
                        <p className="max-w-md text-[36px] leading-[1.12] font-medium tracking-[-0.025em] drop-shadow-sm">
                            Every counter, every shelf and every taka — in one ledger.
                        </p>
                        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/85">
                            Sell at the register, receive stock, pay suppliers and close the month across all of your stores.
                        </p>
                    </div>

                    <dl className="grid max-w-lg grid-cols-3 gap-3">
                        {[
                            ['Multi-store', 'One catalogue, separate stock'],
                            ['Live stock', 'Every movement recorded'],
                            ['Clear books', 'Cash, bank and dues'],
                        ].map(([title, text]) => (
                            <div key={title} className="rounded-[20px] bg-white/60 p-4 text-[#14160f] ring-1 ring-white/50 backdrop-blur-xl">
                                <dt className="text-[13px] font-medium">{title}</dt>
                                <dd className="mt-1 text-xs leading-relaxed text-[#14160f]/65">{text}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>
        </div>
    );
}
