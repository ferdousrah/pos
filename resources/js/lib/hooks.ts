import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage, fieldErrors } from './api';
import { useSession } from './session';
import type { Paginated } from './types';

type Params = Record<string, string | number | boolean | null | undefined>;

const clean = (params?: Params) =>
    Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== '' && v !== null && v !== undefined));

/**
 * GET a resource. The selected store is part of the cache key, so switching
 * stores refetches everything on screen without any extra wiring.
 */
export function useApi<T>(url: string, params?: Params, options?: Partial<UseQueryOptions<T>>) {
    const storeId = useSession((s) => s.storeId);
    const query = clean(params);

    return useQuery<T>({
        queryKey: [url, storeId, query],
        queryFn: ({ signal }) => api.get<T>(url, { params: query, signal }).then((r) => r.data),
        placeholderData: keepPreviousData,
        ...options,
    });
}

/**
 * A paginated list whose page resets whenever the filters change.
 */
export function usePaged<T, R extends Paginated<T> = Paginated<T>>(url: string, filters: Params = {}, perPage = 15) {
    const [page, setPage] = useState(1);
    const storeId = useSession((s) => s.storeId);
    const key = JSON.stringify(filters);

    useEffect(() => setPage(1), [key, storeId]);

    const query = useApi<R>(url, { ...filters, page, per_page: perPage });

    return { ...query, page, setPage };
}

interface ActionOptions<TResult> {
    success?: string | ((result: TResult) => string);
    onSuccess?: (result: TResult) => void;
    /** Validation errors are handed to the form instead of being shown as a toast. */
    onInvalid?: (errors: Record<string, string>) => void;
}

/**
 * A write. On success every cached query is refreshed — the data set is small
 * and almost every write touches several screens (stock, ledgers, dashboards).
 */
export function useAction<TVars = void, TResult = unknown>(
    fn: (vars: TVars) => Promise<{ data: TResult }>,
    options: ActionOptions<TResult> = {},
) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (vars: TVars) => fn(vars).then((r) => r.data),
        onSuccess: (result) => {
            queryClient.invalidateQueries();
            if (options.success) toast.success(typeof options.success === 'function' ? options.success(result) : options.success);
            options.onSuccess?.(result);
        },
        onError: (error) => {
            const errors = fieldErrors(error);
            if (options.onInvalid && Object.keys(errors).length) options.onInvalid(errors);
            else toast.error(errorMessage(error));
        },
    });
}

export function useDebounced<T>(value: T, delay = 250) {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
}

/**
 * Minimal form state: values, server-side validation errors and input bindings.
 */
export function useForm<T extends Record<string, unknown>>(initial: T) {
    const [values, setValues] = useState<T>(initial);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
        setValues((current) => ({ ...current, [key]: value }));
        setErrors((current) => {
            if (!(key in current)) return current;
            const { [key as string]: _removed, ...rest } = current;
            return rest;
        });
    }, []);

    const reset = useCallback((next: T) => {
        setValues(next);
        setErrors({});
    }, []);

    /** Surfaces errors for fields the form has no input for (e.g. "items") as a toast. */
    const invalid = useCallback(
        (next: Record<string, string>) => {
            setErrors(next);
            const orphan = Object.entries(next).find(([key]) => !(key.split('.')[0] in values));
            if (orphan) toast.error(orphan[1]);
        },
        [values],
    );

    const bind = <K extends keyof T>(key: K) => ({
        value: (values[key] ?? '') as string | number,
        onChange: (event: { target: { value: string } }) => set(key, event.target.value as T[K]),
        error: errors[key as string],
    });

    return { values, set, reset, errors, setErrors, invalid, bind };
}

export function useDisclosure<T = true>() {
    const [state, setState] = useState<T | null>(null);
    return { state, isOpen: state !== null, open: (value: T) => setState(value), close: () => setState(null) };
}
