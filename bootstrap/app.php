<?php

use App\Http\Middleware\CheckPermission;
use App\Http\Middleware\SetStoreContext;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function () {
            // The SPA is served from the same origin, so the API rides on the
            // session cookie and CSRF protection of the web stack.
            Route::middleware('web')->prefix('api')->group(base_path('routes/api.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Behind Coolify's proxy (Traefik/Caddy) TLS ends at the proxy. Trusting it makes
        // Laravel see the real https scheme, host and client IP, so links and cookies are right.
        $middleware->trustProxies(at: '*');

        $middleware->alias([
            'permission' => CheckPermission::class,
            'store' => SetStoreContext::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson()
        );
    })->create();
