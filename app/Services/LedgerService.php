<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Transaction;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;

class LedgerService
{
    /**
     * Posts money into or out of an account and keeps the running balance in step.
     * Must run inside a transaction.
     */
    public function record(
        int $accountId,
        string $direction,
        float $amount,
        string $category,
        ?Model $source = null,
        ?int $storeId = null,
        ?CarbonInterface $at = null,
        ?string $reference = null,
        ?string $description = null,
    ): Transaction {
        $account = Account::query()->lockForUpdate()->findOrFail($accountId);
        $signed = $direction === Transaction::IN ? $amount : -$amount;

        $account->update(['balance' => round($account->balance + $signed, 2)]);

        return Transaction::query()->create([
            'store_id' => $storeId,
            'account_id' => $account->id,
            'user_id' => auth()->id(),
            'direction' => $direction,
            'amount' => $amount,
            'category' => $category,
            'source_type' => $source?->getMorphClass(),
            'source_id' => $source?->getKey(),
            'reference' => $reference,
            'description' => $description,
            'transacted_at' => $at ?? now(),
        ]);
    }

    public function reverse(Transaction $transaction): void
    {
        $account = Account::query()->lockForUpdate()->findOrFail($transaction->account_id);
        $signed = $transaction->direction === Transaction::IN ? -$transaction->amount : $transaction->amount;

        $account->update(['balance' => round($account->balance + $signed, 2)]);
        $transaction->delete();
    }
}
