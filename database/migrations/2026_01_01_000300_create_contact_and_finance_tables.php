<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('phone', 30)->nullable()->unique();
            $table->string('email')->nullable();
            $table->string('address')->nullable();
            $table->string('note')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('contact_person')->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('email')->nullable();
            $table->string('address')->nullable();
            $table->string('note')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        // store_id = null means the account is shared by every store (e.g. a head-office bank account).
        Schema::create('accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('type', 20); // cash | bank | mobile | card
            $table->string('account_number', 60)->nullable();
            $table->decimal('opening_balance', 14, 2)->default(0);
            $table->decimal('balance', 14, 2)->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('finance_categories', function (Blueprint $table) {
            $table->id();
            $table->string('type', 10); // expense | income
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['type', 'name']);
        });

        Schema::create('finance_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->restrictOnDelete();
            $table->foreignId('finance_category_id')->constrained()->restrictOnDelete();
            $table->foreignId('account_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 10); // expense | income
            $table->string('reference_no', 40)->unique();
            $table->decimal('amount', 14, 2);
            $table->date('entry_date')->index();
            $table->string('payee')->nullable();
            $table->string('note')->nullable();
            $table->timestamps();

            $table->index(['type', 'store_id', 'entry_date']);
        });

        // Every movement of money, whatever caused it, lands here exactly once.
        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('account_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('direction', 3); // in | out
            $table->decimal('amount', 14, 2);
            $table->string('category', 30);
            $table->nullableMorphs('source');
            $table->string('reference', 60)->nullable();
            $table->string('description')->nullable();
            $table->dateTime('transacted_at')->index();
            $table->timestamps();

            $table->index(['account_id', 'transacted_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions');
        Schema::dropIfExists('finance_entries');
        Schema::dropIfExists('finance_categories');
        Schema::dropIfExists('accounts');
        Schema::dropIfExists('suppliers');
        Schema::dropIfExists('customers');
    }
};
