<?php

use Illuminate\Support\Facades\Route;

// Everything that is not the API is the single-page app; React Router takes it from there.
Route::view('/{any?}', 'app')->where('any', '^(?!api/|up$).*$')->name('app');
