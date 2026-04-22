import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Receipt, Download, Mail } from "lucide-react";
import toast from "react-hot-toast";
import { useForm } from "react-hook-form";
import { invoicesApi } from "@/api/invoices";
import { pdfApi } from "@/api/pdf";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import { FullPageSpinner } from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import Spinner from "@/components/ui/Spinner";
import { formatDate } from "@/lib/formatters";
import type { Invoice, Payment } from "@/types";

function fmtGhs(v: string | number) {
  return `GHS ${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Payment form ──────────────────────────────────────────────────────────────

function PaymentForm({ invoiceId, onSuccess, onCancel }: { invoiceId: string; onSuccess: () => void; onCancel: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<{ amountGhs: string; method: string; reference?: string; notes?: string }>();
  const { mutate, isPending } = useMutation({
    mutationFn: (d: { amountGhs: string; method: string; reference?: string; notes?: string }) => invoicesApi.recordPayment(invoiceId, d),
    onSuccess: () => { toast.success("Payment recorded"); onSuccess(); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Payment failed";
      toast.error(msg);
    },
  });
  return (
    <form onSubmit={handleSubmit((d) => mutate(d))} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Amount (GHS) *</label>
          <input {...register("amountGhs", { required: true })} className="input" type="number" step="0.01" placeholder="0.00" />
          {errors.amountGhs && <p className="mt-1 text-xs text-red-600">Required</p>}
        </div>
        <div>
          <label className="label">Method *</label>
          <select {...register("method", { required: true })} className="input">
            <option value="">Select…</option>
            {["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE"].map((m) => <option key={m}>{m.replace("_", " ")}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Reference / Receipt #</label>
        <input {...register("reference")} className="input" />
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea {...register("notes")} className="input resize-none" rows={2} />
      </div>
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isPending} className="btn-primary">{isPending ? <Spinner size="sm" /> : "Record Payment"}</button>
      </div>
    </form>
  );
}

// ── Invoice detail ────────────────────────────────────────────────────────────

function InvoiceDetail({ invoice }: { invoice: Invoice }) {
  const qc = useQueryClient();
  const [showPayment, setShowPayment] = useState(false);
  const { data } = useQuery({ queryKey: ["invoice", invoice.id], queryFn: () => invoicesApi.get(invoice.id) });
  const { data: paymentsData } = useQuery({ queryKey: ["payments", invoice.id], queryFn: () => invoicesApi.listPayments(invoice.id) });
  const full = data?.data ?? invoice;
  const payments: Payment[] = paymentsData?.data ?? [];
  const { mutate: emailInv, isPending: isEmailing } = useMutation({
    mutationFn: () => invoicesApi.emailInvoice(invoice.id),
    onSuccess: () => toast.success("Invoice emailed"),
    onError: () => toast.error("Email failed"),
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div><span className="text-gray-500">Customer:</span> <span className="font-medium">{full.customer?.name}</span></div>
        <div><span className="text-gray-500">Status:</span> <StatusBadge status={full.status} type="invoice" /></div>
        <div><span className="text-gray-500">Total:</span> <span className="font-semibold">{fmtGhs(full.totalGhs)}</span></div>
        <div><span className="text-gray-500">Balance Due:</span> <span className={`font-semibold ${Number(full.balanceGhs) > 0 ? "text-red-600" : "text-green-600"}`}>{fmtGhs(full.balanceGhs)}</span></div>
        <div><span className="text-gray-500">Due Date:</span> <span>{formatDate(full.dueDate)}</span></div>
        <div><span className="text-gray-500">Issued:</span> <span>{formatDate(full.createdAt)}</span></div>
      </div>

      {/* Payments list */}
      {payments.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Payment History</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="pb-1 text-left">Date</th>
                <th className="pb-1 text-left">Method</th>
                <th className="pb-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="py-1.5">{formatDate((p as unknown as { paidAt?: string }).paidAt ?? p.createdAt)}</td>
                  <td className="py-1.5">{(p as unknown as { method?: string }).method ?? p.paymentMethod}</td>
                  <td className="py-1.5 text-right font-mono font-medium">{fmtGhs(p.amountGhs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => emailInv()} disabled={isEmailing} className="btn-secondary flex items-center gap-1 text-sm">
          {isEmailing ? <Spinner size="sm" /> : <Mail size={14} />} Email to Customer
        </button>
      </div>

      {full.status !== "PAID" && full.status !== "DRAFT" && (
        <div>
          {showPayment ? (
            <PaymentForm invoiceId={invoice.id} onSuccess={() => { setShowPayment(false); qc.invalidateQueries({ queryKey: ["invoices"] }); qc.invalidateQueries({ queryKey: ["invoice", invoice.id] }); qc.invalidateQueries({ queryKey: ["payments", invoice.id] }); }} onCancel={() => setShowPayment(false)} />
          ) : (
            <button className="btn-primary" onClick={() => setShowPayment(true)}>Record Payment</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Invoice | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", page, search, status],
    queryFn: () => invoicesApi.list({ page, limit: 20, search: search || undefined, status: status || undefined }),
    placeholderData: (p) => p,
  });

  const invoices = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" subtitle="Track sales invoices and payments" />

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="search" placeholder="Search invoices…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="input pl-9" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="input max-w-40">
          <option value="">All statuses</option>
          {["DRAFT", "SENT", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <FullPageSpinner />
        ) : invoices.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices" description="Generate an invoice from a completed order" />
        ) : (
          <>
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="table-th">Invoice #</th>
                  <th className="table-th">Customer</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Due Date</th>
                  <th className="table-th text-right">Total</th>
                  <th className="table-th text-right">Balance</th>
                  <th className="table-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => {
                  const balance = Number(inv.balanceGhs ?? "0");
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="table-td font-mono text-xs font-semibold text-violet-700">{inv.invoiceNumber}</td>
                      <td className="table-td font-medium">{inv.customer?.name ?? "—"}</td>
                      <td className="table-td"><StatusBadge status={inv.status} type="invoice" /></td>
                      <td className="table-td text-gray-500">{formatDate(inv.dueDate)}</td>
                      <td className="table-td text-right font-mono">{fmtGhs(inv.totalGhs)}</td>
                      <td className={`table-td text-right font-mono font-medium ${balance > 0 ? "text-red-600" : "text-green-600"}`}>{fmtGhs(balance)}</td>
                      <td className="table-td">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => setSelected(inv)} className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">View</button>
                          <button onClick={() => pdfApi.downloadInvoice(inv.id).catch(() => toast.error("PDF failed"))} className="rounded px-2 py-1 text-xs text-violet-600 hover:bg-violet-50 flex items-center gap-1"><Download size={12} /> PDF</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pagination && <Pagination page={page} totalPages={pagination.totalPages} onPageChange={setPage} />}
          </>
        )}
      </div>

      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`Invoice ${selected.invoiceNumber}`} size="lg">
          <InvoiceDetail invoice={selected} />
        </Modal>
      )}
    </div>
  );
}
