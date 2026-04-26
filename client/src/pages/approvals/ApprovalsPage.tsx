import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { approvalsApi } from "@/api/approvals";
import type { ApprovalRequest, ApprovalEntityType } from "@/types";
import PageHeader from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import Spinner from "@/components/ui/Spinner";
import Modal from "@/components/ui/Modal";
import { formatDate } from "@/lib/formatters";

const ENTITY_LABELS: Record<ApprovalEntityType, string> = {
  PURCHASE_ORDER:       "Purchase Order",
  EXPENSE:              "Expense",
  QUOTE_DISCOUNT:       "Quote Discount",
  QUOTE_HIGH_VALUE:     "Quote (High Value)",
  INVOICE_CANCELLATION: "Invoice Cancellation",
  STOCK_ADJUSTMENT:     "Stock Adjustment",
  ORDER_CONVERSION:     "Order (High Value)",
};

const ENTITY_COLORS: Record<ApprovalEntityType, string> = {
  PURCHASE_ORDER:       "bg-blue-50 text-blue-700",
  EXPENSE:              "bg-orange-50 text-orange-700",
  QUOTE_DISCOUNT:       "bg-violet-50 text-violet-700",
  QUOTE_HIGH_VALUE:     "bg-rose-50 text-rose-700",
  INVOICE_CANCELLATION: "bg-red-50 text-red-700",
  STOCK_ADJUSTMENT:     "bg-amber-50 text-amber-700",
  ORDER_CONVERSION:     "bg-green-50 text-green-700",
};

const STATUS_COLORS = {
  PENDING:  "bg-amber-50 text-amber-700",
  APPROVED: "bg-green-50 text-green-700",
  REJECTED: "bg-red-50 text-red-700",
};

function contextSummary(req: ApprovalRequest): string {
  const c = req.context;
  if (!c) return "";
  if (req.entityType === "PURCHASE_ORDER") return `PO ${c.poNumber ?? ""} · Total GHS ${Number(c.total ?? 0).toLocaleString()}`;
  if (req.entityType === "EXPENSE") return `GHS ${Number(c.amountGhs ?? 0).toLocaleString()} (threshold GHS ${Number(c.thresholdGhs ?? 0).toLocaleString()})`;
  if (req.entityType === "QUOTE_DISCOUNT") return `${c.quoteNumber ?? ""} · ${c.discountRate ?? 0}% discount`;
  if (req.entityType === "QUOTE_HIGH_VALUE") return `${c.quoteNumber ?? ""} · GHS ${Number(c.totalGhs ?? 0).toLocaleString()} (threshold GHS ${Number(c.thresholdGhs ?? 0).toLocaleString()})`;
  if (req.entityType === "INVOICE_CANCELLATION") return `Invoice ${c.invoiceNumber ?? ""} · GHS ${Number(c.totalGhs ?? 0).toLocaleString()}`;
  if (req.entityType === "STOCK_ADJUSTMENT") return `Qty ${c.quantity ?? 0} · ${c.movementType ?? ""}`;
  if (req.entityType === "ORDER_CONVERSION") return `Order ${c.orderNumber ?? ""} · GHS ${Number(c.totalGhs ?? 0).toLocaleString()}`;
  return "";
}

function ActionModal({ approval, onClose }: { approval: ApprovalRequest; onClose: () => void }) {
  const [note, setNote] = useState("");
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["approvals"] });
    qc.invalidateQueries({ queryKey: ["approval-pending-count"] });
    onClose();
  };

  const { mutate: approve, isPending: approving } = useMutation({
    mutationFn: () => approvalsApi.approve(approval.id, note || undefined),
    onSuccess: () => { toast.success("Approved"); invalidate(); },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed"),
  });

  const { mutate: reject, isPending: rejecting } = useMutation({
    mutationFn: () => approvalsApi.reject(approval.id, note),
    onSuccess: () => { toast.success("Rejected"); invalidate(); },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed"),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ENTITY_COLORS[approval.entityType]}`}>
            {ENTITY_LABELS[approval.entityType]}
          </span>
        </div>
        <p className="text-gray-700 font-medium mt-1">{contextSummary(approval)}</p>
        <p className="text-gray-500">Requested by <strong>{approval.requestedBy.name}</strong> · {formatDate(approval.requestedAt)}</p>
      </div>
      <div>
        <label className="label">Note <span className="font-normal text-gray-400">(required for rejection)</span></label>
        <textarea
          className="input resize-none"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a comment…"
        />
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          type="button"
          onClick={() => reject(undefined)}
          disabled={rejecting || !note.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50"
        >
          {rejecting ? <Spinner size="sm" /> : <XCircle size={14} />} Reject
        </button>
        <button
          type="button"
          onClick={() => approve(undefined)}
          disabled={approving}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
        >
          {approving ? <Spinner size="sm" /> : <CheckCircle size={14} />} Approve
        </button>
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const [statusFilter, setStatusFilter] = useState<"PENDING" | "ALL">("PENDING");
  const [acting, setActing] = useState<ApprovalRequest | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["approvals", statusFilter],
    queryFn: () => approvalsApi.list({ status: statusFilter, limit: 100 }),
  });

  const items = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Approvals" subtitle="Review and action pending requests" />

      <div className="flex gap-1 border-b border-gray-200">
        {(["PENDING", "ALL"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${statusFilter === s ? "border-violet-600 text-violet-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {s === "PENDING" ? "Pending" : "All Requests"}
          </button>
        ))}
      </div>

      {isLoading ? <FullPageSpinner /> : items.length === 0 ? (
        <div className="card text-center py-12">
          <CheckCircle size={32} className="mx-auto text-green-400 mb-2" />
          <p className="text-gray-500">No {statusFilter === "PENDING" ? "pending " : ""}approval requests.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="table-th">Type</th>
                <th className="table-th">Details</th>
                <th className="table-th">Requested By</th>
                <th className="table-th">Date</th>
                <th className="table-th">Status</th>
                {statusFilter === "PENDING" && <th className="table-th" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="table-td">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ENTITY_COLORS[item.entityType]}`}>
                      {ENTITY_LABELS[item.entityType]}
                    </span>
                  </td>
                  <td className="table-td text-sm text-gray-700">{contextSummary(item)}</td>
                  <td className="table-td text-sm">{item.requestedBy.name}</td>
                  <td className="table-td text-sm text-gray-500">{formatDate(item.requestedAt)}</td>
                  <td className="table-td">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[item.status]}`}>
                      {item.status}
                    </span>
                    {item.note && <p className="text-xs text-gray-400 mt-0.5 max-w-[180px] truncate">{item.note}</p>}
                  </td>
                  {statusFilter === "PENDING" && (
                    <td className="table-td text-right">
                      <button
                        onClick={() => setActing(item)}
                        className="rounded px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 border border-violet-200"
                      >
                        Review
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!acting} onClose={() => setActing(null)} title="Review Approval Request">
        {acting && <ActionModal approval={acting} onClose={() => setActing(null)} />}
      </Modal>
    </div>
  );
}
