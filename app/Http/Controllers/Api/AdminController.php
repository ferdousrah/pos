<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Role;
use App\Models\Setting;
use App\Models\Store;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Back-office setup: stores, users, roles and business settings.
 */
class AdminController extends Controller
{
    // Stores ----------------------------------------------------------------

    public function stores(): JsonResponse
    {
        return response()->json(Store::query()->withCount('users')->orderBy('name')->get());
    }

    public function storeStore(Request $request): JsonResponse
    {
        $data = $this->validatedStore($request);

        $store = DB::transaction(function () use ($data) {
            $store = Store::query()->create($data);

            // A register cannot take cash without a drawer to put it in.
            Account::query()->create(['store_id' => $store->id, 'name' => 'Cash drawer', 'type' => 'cash']);

            return $store;
        });

        return response()->json($store, 201);
    }

    public function updateStore(Request $request, Store $store): JsonResponse
    {
        $store->update($this->validatedStore($request, $store));

        return response()->json($store);
    }

    private function validatedStore(Request $request, ?Store $store = null): array
    {
        $request->merge(['code' => strtoupper((string) $request->input('code'))]);

        return $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'code' => ['required', 'alpha_num', 'max:6', Rule::unique('stores')->ignore($store)],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:80'],
            'is_active' => ['boolean'],
        ]);
    }

    // Users -----------------------------------------------------------------

    public function users(Request $request): JsonResponse
    {
        $search = $request->input('search');

        return response()->json(
            User::query()
                ->with('role:id,name', 'stores:id,name,code')
                ->when($search, fn ($q) => $q->where(
                    fn ($w) => $w->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")
                ))
                ->orderBy('name')
                ->paginate($this->perPage($request))
        );
    }

    public function userOptions(): JsonResponse
    {
        return response()->json(User::query()->where('is_active', true)->orderBy('name')->get(['id', 'name', 'email']));
    }

    public function storeUser(Request $request): JsonResponse
    {
        $data = $this->validatedUser($request);

        $user = DB::transaction(function () use ($data) {
            $user = User::query()->create(collect($data)->except('store_ids')->all());
            $user->stores()->sync($data['store_ids'] ?? []);

            return $user;
        });

        return response()->json($user->load('role:id,name', 'stores:id,name,code'), 201);
    }

    public function updateUser(Request $request, User $user): JsonResponse
    {
        $data = $this->validatedUser($request, $user);

        if ($user->is($request->user())) {
            abort_if(($data['is_active'] ?? true) === false, 422, 'You cannot deactivate your own account.');
            abort_if((int) $data['role_id'] !== $user->role_id, 422, 'You cannot change your own role.');
        }

        if (blank($data['password'] ?? null)) {
            unset($data['password']);
        }

        DB::transaction(function () use ($user, $data) {
            $user->update(collect($data)->except('store_ids')->all());
            $user->stores()->sync($data['store_ids'] ?? []);
        });

        return response()->json($user->load('role:id,name', 'stores:id,name,code'));
    }

    private function validatedUser(Request $request, ?User $user = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users')->ignore($user)],
            'phone' => ['nullable', 'string', 'max:30'],
            'password' => [$user ? 'nullable' : 'required', Password::min(8)],
            'role_id' => ['required', 'exists:roles,id'],
            'store_ids' => ['array'],
            'store_ids.*' => ['integer', 'exists:stores,id'],
            'is_active' => ['boolean'],
        ]);
    }

    // Roles -----------------------------------------------------------------

    public function roles(): JsonResponse
    {
        return response()->json([
            'roles' => Role::query()->withCount('users')->orderByDesc('is_system')->orderBy('name')->get(),
            'catalogue' => collect(Permissions::GROUPS)->map(fn (array $permissions, string $group) => [
                'group' => $group,
                'permissions' => collect($permissions)->map(fn ($label, $key) => ['key' => $key, 'label' => $label])->values(),
            ])->values(),
        ]);
    }

    public function storeRole(Request $request): JsonResponse
    {
        return response()->json(Role::query()->create($this->validatedRole($request)), 201);
    }

    public function updateRole(Request $request, Role $role): JsonResponse
    {
        abort_if($role->is_system, 422, 'The owner role always has full access and cannot be changed.');

        $role->update($this->validatedRole($request, $role));

        return response()->json($role);
    }

    public function destroyRole(Role $role): JsonResponse
    {
        abort_if($role->is_system, 422, 'The owner role cannot be deleted.');
        abort_if($role->users()->exists(), 422, 'Move the users on this role to another one first.');

        $role->delete();

        return response()->json(status: 204);
    }

    private function validatedRole(Request $request, ?Role $role = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:60', Rule::unique('roles')->ignore($role)],
            'description' => ['nullable', 'string', 'max:255'],
            'permissions' => ['present', 'array'],
            'permissions.*' => [Rule::in(Permissions::keys())],
        ]);
    }

    // Settings --------------------------------------------------------------

    public function settings(): JsonResponse
    {
        return response()->json(Setting::allValues());
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'business_name' => ['required', 'string', 'max:120'],
            'business_phone' => ['nullable', 'string', 'max:30'],
            'business_address' => ['nullable', 'string', 'max:255'],
            'currency_symbol' => ['required', 'string', 'max:6'],
            'tax_label' => ['required', 'string', 'max:20'],
            'receipt_footer' => ['nullable', 'string', 'max:255'],
            'allow_negative_stock' => ['required', 'boolean'],
        ]);

        $data['allow_negative_stock'] = $data['allow_negative_stock'] ? '1' : '0';

        Setting::put($data);

        return response()->json(Setting::allValues());
    }
}
