<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Collection;

class User extends Authenticatable
{
    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'is_active' => 'boolean',
            'last_login_at' => 'datetime',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function stores(): BelongsToMany
    {
        return $this->belongsToMany(Store::class);
    }

    public function hasPermission(string $permission): bool
    {
        return $this->role?->allows($permission) ?? false;
    }

    /**
     * Stores this user may work in. Holders of "stores.all" see every active store
     * without needing to be assigned to each one.
     */
    public function accessibleStores(): Collection
    {
        if ($this->hasPermission('stores.all')) {
            return Store::active()->orderBy('name')->get();
        }

        return $this->stores()->where('is_active', true)->orderBy('name')->get();
    }
}
