import { Check, ChevronsUpDown, KeyRound, LogOut, Menu as MenuIcon, Moon, ScanLine, Store, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';
import { useAction, useForm } from '@/lib/hooks';
import { useCan, useCurrentStore, useSession } from '@/lib/session';
import { navigation, settingsTabs } from '@/navigation';
import { Logo } from './Logo';
import { Input } from './ui/Field';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from './ui/Menu';
import { FormFooter, Modal } from './ui/Modal';

/**
 * The navigation rail. On desktop it is a column of icons that widens to show
 * labels while the pointer is over it; in the phone drawer it is always wide.
 */
function Rail({ expanded, onNavigate }: { expanded?: boolean; onNavigate?: () => void }) {
    const can = useCan();
    const profile = useSession((s) => s.profile)!;
    const label = cn('ml-3 truncate whitespace-nowrap transition-opacity duration-150', expanded ? 'opacity-100' : 'opacity-0 group-hover/rail:opacity-100');

    return (
        <div className="flex h-full w-[248px] flex-col px-3.5 py-4">
            <Link to="/" onClick={onNavigate} className="flex h-10 shrink-0 items-center pl-1">
                <Logo />
                <span className={cn(label, 'min-w-0')}>
                    <span className="block truncate text-sm leading-4 font-medium text-ink">{profile.settings.business_name}</span>
                    <span className="block text-[11px] leading-4 text-ink-3">Retail management</span>
                </span>
            </Link>

            <nav className="mt-5 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:none]">
                {navigation.map((group, index) => {
                    const items = group.items
                        .filter((item) => item.permissions.some(can))
                        // Settings opens on the first tab this user may see.
                        .map((item) => (item.to === '/settings' ? { ...item, to: settingsTabs.find((tab) => can(tab.permission))?.to ?? item.to } : item));

                    if (items.length === 0) return null;

                    return (
                        <div key={index} className="mb-2 border-b border-line pb-2 last:mb-0 last:border-0 last:pb-0">
                            <ul className="space-y-0.5">
                                {items.map((item) => (
                                    <li key={item.label}>
                                        <NavLink
                                            to={item.to}
                                            end={item.to === '/'}
                                            onClick={onNavigate}
                                            title={expanded ? undefined : item.label}
                                            className="group/item flex h-10 items-center rounded-full text-[14px]"
                                        >
                                            {({ isActive }) => (
                                                <>
                                                    <span
                                                        className={cn(
                                                            'grid size-10 shrink-0 place-items-center rounded-full transition-[background-color,color,transform,translate,scale,rotate] duration-500 ease-smooth group-hover/item:scale-110 group-active/item:scale-95',
                                                            isActive ? 'bg-accent text-on-accent' : 'text-ink-2 group-hover/item:bg-sunken group-hover/item:text-ink',
                                                        )}
                                                    >
                                                        <item.icon className="size-[18px]" strokeWidth={1.8} />
                                                    </span>
                                                    <span className={cn(label, isActive ? 'font-medium text-ink' : 'text-ink-2 group-hover/item:text-ink')}>{item.label}</span>
                                                </>
                                            )}
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}
            </nav>

            {can('pos.access') && (
                <Link to="/pos" title={expanded ? undefined : 'Open register'} className="group/item mt-3 flex h-10 shrink-0 items-center rounded-full text-[14px] font-medium text-ink">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-inverse text-on-inverse transition-transform group-hover/item:scale-105">
                        <ScanLine className="size-[18px]" />
                    </span>
                    <span className={label}>Open register</span>
                </Link>
            )}
        </div>
    );
}

function StoreSwitcher() {
    const stores = useSession((s) => s.profile!.stores);
    const storeId = useSession((s) => s.storeId);
    const setStore = useSession((s) => s.setStore);
    const current = useCurrentStore();

    if (stores.length <= 1) {
        return (
            <div className="flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-[13.5px] font-medium text-ink shadow-card">
                <Store className="size-4 text-ink-3" />
                {current?.name ?? 'No store assigned'}
            </div>
        );
    }

    return (
        <Menu
            align="start"
            className="w-64"
            trigger={
                <button className="flex h-10 max-w-[60vw] items-center gap-2 rounded-full bg-surface pr-3 pl-4 text-[13.5px] font-medium text-ink shadow-card hover:bg-sunken dark:ring-1 dark:ring-line">
                    <Store className="size-4 shrink-0 text-ink-3" />
                    <span className="truncate">{current?.name ?? 'All stores'}</span>
                    <ChevronsUpDown className="size-3.5 shrink-0 text-ink-3" />
                </button>
            }
        >
            <MenuLabel>Viewing</MenuLabel>
            <MenuItem onSelect={() => setStore(null)} trailing={storeId === null && <Check className="!text-ink" />}>
                All stores
            </MenuItem>
            <MenuSeparator />
            {stores.map((store) => (
                <MenuItem key={store.id} onSelect={() => setStore(store.id)} trailing={storeId === store.id && <Check className="!text-ink" />}>
                    {store.name}
                    <span className="ml-2 font-mono text-[11px] text-ink-3">{store.code}</span>
                </MenuItem>
            ))}
        </Menu>
    );
}

function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const blank = { current_password: '', password: '', password_confirmation: '' };
    const form = useForm(blank);

    const save = useAction(() => api.put('me/password', form.values), {
        success: 'Password updated',
        onInvalid: form.invalid,
        onSuccess: () => {
            form.reset(blank);
            onClose();
        },
    });

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Change password"
            icon={<KeyRound />}
            size="sm"
            onSubmit={() => save.mutate()}
            footer={<FormFooter onCancel={onClose} loading={save.isPending} submitLabel="Update password" />}
        >
            <div className="space-y-4">
                <Input label="Current password" type="password" autoComplete="current-password" {...form.bind('current_password')} />
                <Input label="New password" type="password" autoComplete="new-password" hint="At least 8 characters." {...form.bind('password')} />
                <Input label="Confirm new password" type="password" autoComplete="new-password" {...form.bind('password_confirmation')} />
            </div>
        </Modal>
    );
}

const roundButton =
    'grid size-10 shrink-0 place-items-center rounded-full bg-surface text-ink shadow-card transition-[background-color,transform,translate,scale,rotate] duration-500 ease-smooth hover:bg-sunken active:scale-95 dark:ring-1 dark:ring-line [&_svg]:size-[18px] [&_svg]:transition-transform [&_svg]:duration-300 hover:[&_svg]:rotate-12';

function UserMenu() {
    const user = useSession((s) => s.profile!.user);
    const setProfile = useSession((s) => s.setProfile);
    const [passwordOpen, setPasswordOpen] = useState(false);

    const signOut = async () => {
        await api.post('logout').catch(() => undefined);
        // A full reload clears every cached query and picks up a fresh CSRF token.
        setProfile(null);
        window.location.assign(`${window.__APP__.base}/login`);
    };

    return (
        <>
            <Menu
                className="w-56"
                trigger={
                    <button className="flex h-10 items-center gap-2.5 rounded-full bg-surface py-1 pr-4 pl-1 shadow-card hover:bg-sunken max-md:pr-1 dark:ring-1 dark:ring-line" aria-label="Account menu">
                        <span className="grid size-8 place-items-center rounded-full bg-accent text-[11px] font-semibold text-on-accent">{initials(user.name)}</span>
                        <span className="hidden text-left leading-tight md:block">
                            <span className="block text-[13px] font-medium text-ink">{user.name}</span>
                            <span className="block text-[11px] text-ink-3">{user.role}</span>
                        </span>
                    </button>
                }
            >
                <div className="px-3 py-2">
                    <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
                    <p className="truncate text-xs text-ink-3">{user.email}</p>
                </div>
                <MenuSeparator />
                <MenuItem icon={<KeyRound />} onSelect={() => setPasswordOpen(true)}>
                    Change password
                </MenuItem>
                <MenuItem icon={<LogOut />} onSelect={signOut}>
                    Sign out
                </MenuItem>
            </Menu>
            <PasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
        </>
    );
}

export function ThemeToggle() {
    const theme = useSession((s) => s.theme);
    const toggle = useSession((s) => s.toggleTheme);

    return (
        <button type="button" className={roundButton} onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            {theme === 'dark' ? <Sun /> : <Moon />}
        </button>
    );
}

export function AppLayout() {
    const [drawer, setDrawer] = useState(false);
    const location = useLocation();

    useEffect(() => setDrawer(false), [location.pathname]);

    return (
        <div className="app-shell min-h-dvh lg:pl-[88px]">
            <aside className="group/rail fixed top-3 bottom-3 left-3 z-30 hidden w-[68px] overflow-hidden rounded-[30px] bg-surface shadow-card transition-[width,box-shadow] duration-500 ease-smooth hover:w-[248px] hover:shadow-pop lg:block dark:ring-1 dark:ring-line">
                <Rail />
            </aside>

            {drawer && (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <div className="absolute inset-0 animate-fade bg-overlay" onClick={() => setDrawer(false)} />
                    <aside className="absolute inset-y-2 left-2 animate-fade overflow-hidden rounded-[30px] bg-surface shadow-pop">
                        <Rail expanded onNavigate={() => setDrawer(false)} />
                        <button type="button" className={cn(roundButton, 'absolute top-4 right-3 shadow-none')} onClick={() => setDrawer(false)} aria-label="Close menu">
                            <X />
                        </button>
                    </aside>
                </div>
            )}

            <header className="sticky top-0 z-20 mx-auto flex h-16 w-full max-w-[1400px] items-center gap-2.5 bg-canvas/80 px-4 backdrop-blur-md sm:px-6">
                <button type="button" className={cn(roundButton, 'lg:hidden')} onClick={() => setDrawer(true)} aria-label="Open menu">
                    <MenuIcon />
                </button>
                <StoreSwitcher />
                <div className="flex-1" />
                <ThemeToggle />
                <UserMenu />
            </header>

            <main>
                <Outlet />
            </main>
        </div>
    );
}
