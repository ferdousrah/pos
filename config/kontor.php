<?php

/*
 * First-run setup. Read by DatabaseSeeder, which runs on every container start
 * but only does something on an empty database.
 *
 * Kept in a config file (not read with env() in the seeder) so it still works
 * after `php artisan config:cache`.
 */

return [

    // Fill a fresh database with the demo business instead of an empty one.
    'seed_demo' => (bool) env('KONTOR_SEED_DEMO', env('APP_ENV', 'production') === 'local'),

    // The first owner account, created on an empty database.
    'admin' => [
        'name' => env('KONTOR_ADMIN_NAME', 'Owner'),
        'email' => env('KONTOR_ADMIN_EMAIL'),
        'password' => env('KONTOR_ADMIN_PASSWORD'),
    ],

    // The first store, created together with the owner.
    'store' => [
        'name' => env('KONTOR_STORE_NAME', 'Main store'),
        'code' => env('KONTOR_STORE_CODE', 'MAIN'),
    ],

    'business_name' => env('KONTOR_BUSINESS_NAME', env('APP_NAME', 'Kontor')),

];
