<?php

namespace App\Support;

use App\Models\Store;
use Illuminate\Validation\ValidationException;

/**
 * The store the current request is working in.
 *
 * The SPA sends the selected store in the X-Store-Id header. Without it the request
 * runs in "all stores" mode: reads span every store the user can access, and any
 * write that needs a concrete store is rejected.
 */
class StoreContext
{
    private ?Store $store = null;

    /** @var int[] */
    private array $accessibleIds = [];

    public function set(?Store $store, array $accessibleIds): void
    {
        $this->store = $store;
        $this->accessibleIds = array_map('intval', $accessibleIds);
    }

    public function store(): ?Store
    {
        return $this->store;
    }

    public function id(): ?int
    {
        return $this->store?->id;
    }

    /**
     * Store ids a read query should be limited to.
     *
     * @return int[]
     */
    public function ids(): array
    {
        return $this->store ? [$this->store->id] : $this->accessibleIds;
    }

    /**
     * @return int[]
     */
    public function accessibleIds(): array
    {
        return $this->accessibleIds;
    }

    public function canAccess(int $storeId): bool
    {
        return in_array($storeId, $this->accessibleIds, true);
    }

    public function require(): Store
    {
        if (! $this->store) {
            throw ValidationException::withMessages([
                'store' => 'Choose a specific store from the store switcher before doing this.',
            ]);
        }

        return $this->store;
    }
}
