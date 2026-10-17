<?php

namespace App\Http\Middleware;

use App\Support\StoreContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SetStoreContext
{
    public function __construct(private readonly StoreContext $context)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $stores = $request->user()->accessibleStores();
        $requested = (int) $request->header('X-Store-Id');
        $store = $requested ? $stores->firstWhere('id', $requested) : null;

        abort_if($requested && ! $store, 403, 'You do not have access to this store.');

        $this->context->set($store, $stores->pluck('id')->all());

        return $next($request);
    }
}
