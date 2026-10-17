<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->restrictOnDelete();
            $table->foreignId('account_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reference_no', 40)->unique();
            // taken = the business borrowed (a liability); given = the business lent (an asset).
            $table->string('direction', 10);
            $table->string('party_name');
            $table->string('party_phone', 30)->nullable();
            $table->decimal('principal', 14, 2);
            $table->decimal('principal_repaid', 14, 2)->default(0);
            // Interest paid (taken) or received (given) so far. Only this part touches profit.
            $table->decimal('interest_total', 14, 2)->default(0);
            $table->date('issued_at')->index();
            $table->date('due_at')->nullable();
            $table->string('status', 10)->default('open'); // open | settled
            $table->string('note')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'direction', 'status']);
        });

        Schema::create('loan_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('loan_id')->constrained()->cascadeOnDelete();
            $table->foreignId('store_id')->constrained()->restrictOnDelete();
            $table->foreignId('account_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('principal_amount', 14, 2)->default(0);
            $table->decimal('interest_amount', 14, 2)->default(0);
            $table->date('paid_at')->index();
            $table->string('note')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loan_payments');
        Schema::dropIfExists('loans');
    }
};
