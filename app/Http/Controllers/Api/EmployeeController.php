<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\SalaryPayment;
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

class EmployeeController extends Controller
{
    public function __construct(private readonly StoreContext $context)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $search = $request->input('search');

        $employees = Employee::query()
            ->with('store:id,name,code', 'user:id,name,email')
            ->whereIn('store_id', $this->context->ids())
            ->when($search, fn (Builder $q) => $q->where(
                fn (Builder $w) => $w->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
            ))
            ->when($request->filled('status'), fn (Builder $q) => $q->where('status', $request->input('status')))
            ->orderBy('name')
            ->paginate($this->perPage($request));

        $summary = Employee::query()
            ->whereIn('store_id', $this->context->ids())
            ->selectRaw("count(*) as total, coalesce(sum(status = 'active'), 0) as active")
            ->selectRaw("coalesce(sum(case when status = 'active' then salary end), 0) as monthly_payroll")
            ->selectRaw('count(distinct store_id) as stores')
            ->first();

        return response()->json($employees->toArray() + [
            'summary' => array_map('floatval', $summary->only(['total', 'active', 'monthly_payroll', 'stores'])),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $employee = DB::transaction(function () use ($data) {
            $employee = Employee::query()->create($data + ['code' => 'TMP-'.uniqid()]);
            $employee->update(['code' => 'EMP-'.str_pad((string) $employee->id, 4, '0', STR_PAD_LEFT)]);

            return $employee;
        });

        return response()->json($employee, 201);
    }

    public function update(Request $request, Employee $employee): JsonResponse
    {
        $this->ensureStoreAccess($employee->store_id);
        $employee->update($this->validated($request, $employee));

        return response()->json($employee);
    }

    public function destroy(Employee $employee): JsonResponse
    {
        $this->ensureStoreAccess($employee->store_id);
        $employee->delete();

        return response()->json(status: 204);
    }

    /**
     * The payroll sheet for one month: every active employee and whether they have been paid.
     */
    public function payroll(Request $request): JsonResponse
    {
        $period = $request->validate(['period' => ['nullable', 'date_format:Y-m']])['period'] ?? now()->format('Y-m');

        $payments = SalaryPayment::query()
            ->with('account:id,name')
            ->whereIn('store_id', $this->context->ids())
            ->where('period', $period)
            ->get()
            ->keyBy('employee_id');

        $rows = Employee::query()
            ->withTrashed()
            ->with('store:id,name,code')
            ->whereIn('store_id', $this->context->ids())
            ->where(fn (Builder $q) => $q
                ->where(fn (Builder $active) => $active
                    ->where('status', 'active')
                    ->whereNull('deleted_at')
                    ->where(fn (Builder $j) => $j->whereNull('joined_at')->orWhere('joined_at', '<=', Carbon::parse($period)->endOfMonth())))
                ->orWhereIn('id', $payments->keys()))
            ->orderBy('name')
            ->get(['id', 'store_id', 'code', 'name', 'designation', 'salary'])
            ->map(fn (Employee $employee) => $employee->toArray() + ['payment' => $payments->get($employee->id)]);

        $paid = (float) $payments->sum('net_amount');
        $pending = (float) $rows->whereNull('payment')->sum('salary');

        return response()->json([
            'period' => $period,
            'rows' => $rows->values(),
            'summary' => [
                'employees' => $rows->count(),
                'paid_count' => $payments->count(),
                'paid' => $paid,
                'pending' => $pending,
            ],
        ]);
    }

    public function pay(Request $request, LedgerService $ledger, SequenceService $sequences): JsonResponse
    {
        $data = $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'period' => ['required', 'date_format:Y-m'],
            'basic_amount' => ['required', 'numeric', 'min:0'],
            'bonus_amount' => ['nullable', 'numeric', 'min:0'],
            'deduction_amount' => ['nullable', 'numeric', 'min:0'],
            'account_id' => ['required', $this->usableAccount()],
            'paid_at' => ['required', 'date', 'before_or_equal:today'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $employee = Employee::query()->with('store')->findOrFail($data['employee_id']);
        $this->ensureStoreAccess($employee->store_id);

        abort_if(
            SalaryPayment::query()->where('employee_id', $employee->id)->where('period', $data['period'])->exists(),
            422,
            "{$employee->name} has already been paid for this month."
        );

        $net = round($data['basic_amount'] + ($data['bonus_amount'] ?? 0) - ($data['deduction_amount'] ?? 0), 2);
        abort_if($net <= 0, 422, 'The net salary must be more than zero.');

        $payment = DB::transaction(function () use ($data, $employee, $net, $ledger, $sequences, $request) {
            $date = Carbon::parse($data['paid_at'])->setTimeFrom(now());

            $payment = SalaryPayment::query()->create([
                'employee_id' => $employee->id,
                'store_id' => $employee->store_id,
                'account_id' => $data['account_id'],
                'user_id' => $request->user()->id,
                'reference_no' => $sequences->next('salary', $employee->store, $date),
                'period' => $data['period'],
                'basic_amount' => $data['basic_amount'],
                'bonus_amount' => $data['bonus_amount'] ?? 0,
                'deduction_amount' => $data['deduction_amount'] ?? 0,
                'net_amount' => $net,
                'paid_at' => $date,
                'note' => $data['note'] ?? null,
            ]);

            $ledger->record(
                $payment->account_id, Transaction::OUT, $net, 'salary', $payment, $employee->store_id, $date,
                $payment->reference_no, "Salary {$data['period']} — {$employee->name}",
            );

            return $payment;
        });

        return response()->json($payment, 201);
    }

    public function voidPayment(SalaryPayment $payment, LedgerService $ledger): JsonResponse
    {
        $this->ensureStoreAccess($payment->store_id);

        DB::transaction(function () use ($payment, $ledger) {
            $payment->transactions->each(fn (Transaction $t) => $ledger->reverse($t));
            $payment->delete();
        });

        return response()->json(status: 204);
    }

    private function validated(Request $request, ?Employee $employee = null): array
    {
        return $request->validate([
            'store_id' => ['required', Rule::in($this->context->accessibleIds())],
            'user_id' => ['nullable', 'exists:users,id', Rule::unique('employees')->ignore($employee)->withoutTrashed()],
            'name' => ['required', 'string', 'max:255'],
            'designation' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'joined_at' => ['nullable', 'date'],
            'salary' => ['required', 'numeric', 'min:0'],
            'status' => ['required', Rule::in(['active', 'inactive'])],
            'note' => ['nullable', 'string', 'max:255'],
        ], [
            'user_id.unique' => 'This login is already linked to another employee.',
        ]);
    }
}
