<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Loan;
use App\Models\LoanPayment;
use App\Models\Transaction;
use App\Services\LedgerService;
use App\Services\SequenceService;
use App\Support\StoreContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Money borrowed by the business and money it has lent out.
 *
 * The principal only ever moves between an account and what is owed: it is never
 * income or expense. Interest is the one part that reaches profit and loss.
 */
class LoanController extends Controller
{
    public function __construct(
        private readonly StoreContext $context,
        private readonly LedgerService $ledger,
        private readonly SequenceService $sequences,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $search = $request->input('search');
        $base = Loan::query()->whereIn('store_id', $this->context->ids());

        $loans = (clone $base)
            ->with('store:id,name,code', 'account:id,name')
            ->when($search, fn (Builder $q) => $q->where(
                fn (Builder $w) => $w->where('party_name', 'like', "%{$search}%")
                    ->orWhere('party_phone', 'like', "%{$search}%")
                    ->orWhere('reference_no', 'like', "%{$search}%")
            ))
            ->when($request->filled('direction'), fn (Builder $q) => $q->where('direction', $request->input('direction')))
            ->when($request->filled('status'), fn (Builder $q) => $q->where('status', $request->input('status')))
            ->orderByRaw("field(status, 'open', 'settled')")
            ->orderByDesc('issued_at')
            ->orderByDesc('id')
            ->paginate($this->perPage($request));

        $summary = (clone $base)
            ->selectRaw("coalesce(sum(case when direction = 'taken' then principal - principal_repaid end), 0) as payable")
            ->selectRaw("coalesce(sum(case when direction = 'given' then principal - principal_repaid end), 0) as receivable")
            ->selectRaw("coalesce(sum(case when direction = 'taken' then interest_total end), 0) as interest_paid")
            ->selectRaw("coalesce(sum(case when direction = 'given' then interest_total end), 0) as interest_earned")
            ->selectRaw("coalesce(sum(status = 'open'), 0) as open_count")
            ->first();

        return response()->json($loans->toArray() + [
            'summary' => array_map('floatval', $summary->only(['payable', 'receivable', 'interest_paid', 'interest_earned', 'open_count'])),
        ]);
    }

    public function show(Loan $loan): JsonResponse
    {
        $this->ensureStoreAccess($loan->store_id);

        return response()->json($this->detail($loan));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'direction' => ['required', Rule::in([Loan::TAKEN, Loan::GIVEN])],
            'party_name' => ['required', 'string', 'max:255'],
            'party_phone' => ['nullable', 'string', 'max:30'],
            'principal' => ['required', 'numeric', 'gt:0'],
            'account_id' => ['required', $this->usableAccount()],
            'issued_at' => ['required', 'date', 'before_or_equal:today'],
            'due_at' => ['nullable', 'date', 'after_or_equal:issued_at'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $store = $this->context->require();

        $loan = DB::transaction(function () use ($data, $store, $request) {
            $date = Carbon::parse($data['issued_at'])->setTimeFrom(now());

            $loan = Loan::query()->create($data + [
                'store_id' => $store->id,
                'user_id' => $request->user()->id,
                'reference_no' => $this->sequences->next('loan', $store, $date),
            ]);

            // Borrowing brings money in; lending sends it out.
            $taken = $loan->direction === Loan::TAKEN;

            $this->ledger->record(
                $loan->account_id, $taken ? Transaction::IN : Transaction::OUT, $loan->principal, 'loan',
                $loan, $store->id, $date, $loan->reference_no,
                ($taken ? 'Loan from ' : 'Loan to ').$loan->party_name,
            );

            return $loan;
        });

        return response()->json($this->detail($loan), 201);
    }

    /**
     * A repayment: paid by the business on a loan it took, received on a loan it gave.
     */
    public function pay(Request $request, Loan $loan): JsonResponse
    {
        $this->ensureStoreAccess($loan->store_id);

        $data = $request->validate([
            'principal_amount' => ['nullable', 'numeric', 'min:0'],
            'interest_amount' => ['nullable', 'numeric', 'min:0'],
            'account_id' => ['required', $this->usableAccount()],
            'paid_at' => ['required', 'date', 'before_or_equal:today', 'after_or_equal:'.$loan->issued_at->toDateString()],
            'note' => ['nullable', 'string', 'max:255'],
        ], [
            'paid_at.after_or_equal' => 'A repayment cannot be dated before the loan itself.',
        ]);

        $principal = round((float) ($data['principal_amount'] ?? 0), 2);
        $interest = round((float) ($data['interest_amount'] ?? 0), 2);

        abort_if($principal + $interest <= 0, 422, 'Enter an amount for the principal, the interest, or both.');

        DB::transaction(function () use ($loan, $data, $principal, $interest, $request) {
            $loan = Loan::query()->lockForUpdate()->findOrFail($loan->id);

            abort_if($principal > $loan->outstanding + 0.001, 422, 'That is more than the principal still outstanding.');

            $date = Carbon::parse($data['paid_at'])->setTimeFrom(now());

            $payment = LoanPayment::query()->create([
                'loan_id' => $loan->id,
                'store_id' => $loan->store_id,
                'account_id' => $data['account_id'],
                'user_id' => $request->user()->id,
                'principal_amount' => $principal,
                'interest_amount' => $interest,
                'paid_at' => $date,
                'note' => $data['note'] ?? null,
            ]);

            $taken = $loan->direction === Loan::TAKEN;

            $this->ledger->record(
                $payment->account_id, $taken ? Transaction::OUT : Transaction::IN, round($principal + $interest, 2), 'loan_repayment',
                $payment, $loan->store_id, $date, $loan->reference_no,
                ($taken ? 'Repayment to ' : 'Repayment from ').$loan->party_name,
            );

            $this->refresh($loan);
        });

        return response()->json($this->detail($loan->refresh()));
    }

    public function destroyPayment(Loan $loan, LoanPayment $payment): JsonResponse
    {
        $this->ensureStoreAccess($loan->store_id);
        abort_unless($payment->loan_id === $loan->id, 404);

        DB::transaction(function () use ($loan, $payment) {
            $payment->transactions->each(fn (Transaction $t) => $this->ledger->reverse($t));
            $payment->delete();
            $this->refresh($loan);
        });

        return response()->json($this->detail($loan->refresh()));
    }

    /**
     * Removes a loan entered by mistake. Once repayments exist they must be removed first,
     * so money is never silently put back.
     */
    public function destroy(Loan $loan): JsonResponse
    {
        $this->ensureStoreAccess($loan->store_id);

        abort_if($loan->payments()->exists(), 422, 'This loan has repayments. Remove them first.');

        DB::transaction(function () use ($loan) {
            $loan->transactions->each(fn (Transaction $t) => $this->ledger->reverse($t));
            $loan->delete();
        });

        return response()->json(status: 204);
    }

    /**
     * Recomputes the running totals from the repayments, the single source of truth.
     */
    private function refresh(Loan $loan): void
    {
        $totals = LoanPayment::query()
            ->where('loan_id', $loan->id)
            ->selectRaw('coalesce(sum(principal_amount), 0) as principal, coalesce(sum(interest_amount), 0) as interest')
            ->first();

        $loan->update([
            'principal_repaid' => round((float) $totals->principal, 2),
            'interest_total' => round((float) $totals->interest, 2),
            'status' => (float) $totals->principal >= $loan->principal - 0.001 ? 'settled' : 'open',
        ]);
    }

    private function detail(Loan $loan): Loan
    {
        return $loan->load('store:id,name,code', 'account:id,name', 'user:id,name', 'payments.account:id,name', 'payments.user:id,name');
    }
}
