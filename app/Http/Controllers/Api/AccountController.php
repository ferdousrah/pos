<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Transaction;
use App\Services\LedgerService;
use App\Support\StoreContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AccountController extends Controller
{
    public function __construct(
        private readonly StoreContext $context,
        private readonly LedgerService $ledger,
    ) {
    }

    public function index(): JsonResponse
    {
        return response()->json(
            Account::query()
                ->with('store:id,name,code')
                ->forStores($this->context->ids())
                ->orderByDesc('is_active')
                ->orderByRaw("field(type, 'cash', 'bank', 'mobile', 'card')")
                ->orderBy('name')
                ->get()
        );
    }

    /**
     * Active accounts money can be paid into or out of from the current store.
     */
    public function options(): JsonResponse
    {
        return response()->json(
            Account::query()
                ->with('store:id,code')
                ->where('is_active', true)
                ->forStores($this->context->ids())
                ->orderByRaw("field(type, 'cash', 'bank', 'mobile', 'card')")
                ->orderBy('name')
                ->get(['id', 'store_id', 'name', 'type', 'balance'])
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request) + $request->validate([
            'opening_balance' => ['nullable', 'numeric'],
        ]);

        $account = DB::transaction(function () use ($data) {
            $opening = (float) ($data['opening_balance'] ?? 0);
            $account = Account::query()->create(['opening_balance' => $opening, 'balance' => 0] + $data);

            if ($opening != 0.0) {
                $this->ledger->record(
                    $account->id, $opening > 0 ? Transaction::IN : Transaction::OUT, abs($opening),
                    'opening', storeId: $account->store_id, description: 'Opening balance',
                );
            }

            return $account->refresh();
        });

        return response()->json($account, 201);
    }

    public function update(Request $request, Account $account): JsonResponse
    {
        $this->ensureAccountAccess($account);

        $account->update($this->validated($request));

        return response()->json($account);
    }

    public function transfer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from_account_id' => ['required', 'different:to_account_id', $this->usableAccount()],
            'to_account_id' => ['required', $this->usableAccount()],
            'amount' => ['required', 'numeric', 'gt:0'],
            'date' => ['required', 'date', 'before_or_equal:today'],
            'note' => ['nullable', 'string', 'max:255'],
        ], [
            'from_account_id.different' => 'Choose two different accounts.',
        ]);

        DB::transaction(function () use ($data) {
            $from = Account::query()->findOrFail($data['from_account_id']);
            $to = Account::query()->findOrFail($data['to_account_id']);

            $this->ensureAccountAccess($from);
            $this->ensureAccountAccess($to);

            $at = Carbon::parse($data['date'])->setTimeFrom(now());
            $reference = 'TRX-'.now()->format('ymdHis');
            $note = $data['note'] ?? null;

            $this->ledger->record($from->id, Transaction::OUT, (float) $data['amount'], 'transfer', null, $from->store_id, $at, $reference, $note ?? "Transfer to {$to->name}");
            $this->ledger->record($to->id, Transaction::IN, (float) $data['amount'], 'transfer', null, $to->store_id, $at, $reference, $note ?? "Transfer from {$from->name}");
        });

        return response()->json(['message' => 'Transfer recorded.'], 201);
    }

    public function transactions(Request $request): JsonResponse
    {
        [$from, $to] = $this->period($request);
        $accountIds = Account::query()->forStores($this->context->ids())->pluck('id');
        $search = $request->input('search');

        $query = Transaction::query()
            ->whereIn('account_id', $accountIds)
            ->when($this->context->id(), fn (Builder $q, int $id) => $q->where(
                fn (Builder $w) => $w->where('store_id', $id)->orWhereNull('store_id')
            ))
            ->whereBetween('transacted_at', [$from, $to])
            ->when($request->filled('account_id'), fn (Builder $q) => $q->where('account_id', $request->integer('account_id')))
            ->when($request->filled('direction'), fn (Builder $q) => $q->where('direction', $request->input('direction')))
            ->when($request->filled('category'), fn (Builder $q) => $q->where('category', $request->input('category')))
            ->when($search, fn (Builder $q) => $q->where(
                fn (Builder $w) => $w->where('reference', 'like', "%{$search}%")->orWhere('description', 'like', "%{$search}%")
            ));

        $summary = (clone $query)
            ->selectRaw("coalesce(sum(case when direction = 'in' then amount end), 0) as money_in")
            ->selectRaw("coalesce(sum(case when direction = 'out' then amount end), 0) as money_out")
            ->first();

        $transactions = $query
            ->with('account:id,name,type', 'store:id,name,code', 'user:id,name')
            ->orderByDesc('transacted_at')
            ->orderByDesc('id')
            ->paginate($this->perPage($request, 25));

        return response()->json($transactions->toArray() + [
            'summary' => array_map('floatval', $summary->toArray()),
        ]);
    }

    private function ensureAccountAccess(Account $account): void
    {
        abort_unless($account->store_id === null || $this->context->canAccess($account->store_id), 404);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'type' => ['required', Rule::in(Account::TYPES)],
            'account_number' => ['nullable', 'string', 'max:60'],
            'store_id' => ['nullable', Rule::in($this->context->accessibleIds())],
            'is_active' => ['boolean'],
        ]);
    }
}
