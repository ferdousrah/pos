import axios, { AxiosError } from 'axios';
import { useSession } from './session';

export const api = axios.create({
    baseURL: `${window.__APP__.base}/api`,
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    withCredentials: true,
    withXSRFToken: true,
});

api.interceptors.request.use((config) => {
    const { storeId } = useSession.getState();
    if (storeId) config.headers.set('X-Store-Id', String(storeId));
    return config;
});

api.interceptors.response.use(undefined, (error: AxiosError) => {
    const status = error.response?.status;
    const url = error.config?.url ?? '';

    if (status === 401 && !url.endsWith('login')) {
        useSession.getState().setProfile(null);
    }

    // The CSRF token went stale (session expired in another tab); a reload fetches a new one.
    if (status === 419) {
        window.location.reload();
    }

    return Promise.reject(error);
});

type ErrorBody = { message?: string; errors?: Record<string, string[]> };

export function fieldErrors(error: unknown): Record<string, string> {
    const errors = (error as AxiosError<ErrorBody>)?.response?.data?.errors ?? {};
    return Object.fromEntries(Object.entries(errors).map(([key, messages]) => [key, messages[0]]));
}

export function errorMessage(error: unknown): string {
    const response = (error as AxiosError<ErrorBody>)?.response;

    if (!response) return 'Could not reach the server. Check your connection and try again.';
    if (response.status === 403) return response.data?.message || 'You do not have permission to do this.';
    if (response.status >= 500) return 'Something went wrong on our side. Please try again.';

    const first = Object.values(response.data?.errors ?? {})[0]?.[0];
    return first ?? response.data?.message ?? 'The request could not be completed.';
}
