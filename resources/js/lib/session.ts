import { create } from 'zustand';
import type { Profile } from './types';

const STORE_KEY = 'kontor.store';
const THEME_KEY = 'kontor.theme';

interface SessionState {
    /** undefined while the first /me request is in flight, null when signed out. */
    profile: Profile | null | undefined;
    /** null means "all stores". */
    storeId: number | null;
    theme: 'light' | 'dark';
    setProfile: (profile: Profile | null) => void;
    setStore: (id: number | null) => void;
    toggleTheme: () => void;
}

const savedStore = () => {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? Number(raw) : null;
};

export const useSession = create<SessionState>((set, get) => ({
    profile: undefined,
    storeId: savedStore(),
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',

    setProfile: (profile) => {
        let storeId = get().storeId;

        if (profile) {
            const ids = profile.stores.map((s) => s.id);
            // Someone with a single store never needs the "all stores" view.
            if (ids.length === 1) storeId = ids[0];
            else if (storeId && !ids.includes(storeId)) storeId = null;
        }

        set({ profile, storeId });
    },

    setStore: (id) => {
        if (id) localStorage.setItem(STORE_KEY, String(id));
        else localStorage.removeItem(STORE_KEY);
        set({ storeId: id });
    },

    toggleTheme: () => {
        const theme = get().theme === 'dark' ? 'light' : 'dark';
        document.documentElement.classList.toggle('dark', theme === 'dark');
        localStorage.setItem(THEME_KEY, theme);
        set({ theme });
    },
}));

export function useCan() {
    const permissions = useSession((s) => s.profile?.user.permissions);
    return (permission: string) => permissions?.includes(permission) ?? false;
}

export function useCurrentStore() {
    return useSession((s) => s.profile?.stores.find((store) => store.id === s.storeId) ?? null);
}
