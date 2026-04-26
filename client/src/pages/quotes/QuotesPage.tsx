import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, ShoppingCart, Download } from "lucide-react";
import toast from "react-hot-toast";
import { quotesApi } from "@/api/quotes";
import { pdfApi } from "@/api/pdf";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import { FullPageSpinner } from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatDate } from "@/lib/formatters";
import type { Quote } from "@/types";
import QuoteForm from "./components/QuoteForm";

function fmtGhs(v: string | number) {
  return `GHS ${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function QuotesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [viewQuote, setViewQuote] = useState<Quote | null>(null);
  const [convertQuote, setConvertQuote] = useState<Quote | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["quotes", page, search, status],
    queryFn: () => quotesApi.list({ page, limit: 20, search: search || undefined, status: status || undefined }),
    placeholderData: (p) => p,
  });

  const { mutate: updateStatus, isPending: updatingStatus } = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) => quotesApi.update(id, { status: s }),
    onSuccess: () => { toast.success("Quote updated"); qc.invalidateQueries({ queryKey: ["quotes"] }); setViewQuote(null); },
    onError: () => toast.error("Update failed"),
  });

  const { mutate: convert, isPending: converting } = useMutation({
    mutationFn: (id: string) => quotesApi.convertToOrder(id),
    onSuccess: (res) => {
      toast.success(`Order ${res.data.orderNumber} created`);
      setConvertQuote(null);
      qc.invalidateQueries({ queryKey: ["quotes"] });
    },
    onError: () => toast.error("Conversion failed"),
  });

  const quotes = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotes"
        subtitle="Create and manage customer quotations"
        action={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Quote
          </button>
        }
      />

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="search" placeholder="Search quotes…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="input pl-9" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="input max-w-40">
          <option value="">All statuses</option>
          {["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <FullPageSpinner />
        ) : quotes.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No quotes" action={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New Quote</button>} />
        ) : (
          <>
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="table-th">Quote #</th>
                  <th className="table-th">Customer</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Valid Until</th>
                  <th className="table-th text-right">Total (GHS)</th>
                  <th className="table-th">Created</th>
                  <th className="table-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quotes.map((q) => (
                  <tr key={q.id} className="hover:bg-gray-50">
                    <td className="table-td font-mono text-xs font-semibold text-violet-700">{q.quoteNumber}</td>
                    <td className="table-td font-medium">{q.customer?.name ?? "—"}</td>
                    <td className="table-td"><StatusBadge status={q.status} type="quote" /></td>
                    <td className="table-td text-gray-500">{formatDate(q.validUntil)}</td>
                    <td className="table-td text-right font-mono">{fmtGhs(q.totalGhs)}</td>
                    <td className="table-td text-gray-500">{formatDate(q.createdAt)}</td>
                    <td className="table-td">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setViewQuote(q)} className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">View</button>
                        <button onClick={() => pdfApi.downloadQuote(q.id).catch(() => toast.error("PDF failed"))} className="rounded px-2 py-1 text-xs text-violet-600 hover:bg-violet-50 flex items-center gap-1"><Download size={12} /> PDF</button>
                        {(q.status === "DRAFT" || q.status === "SENT") && !q.approvalStatus && (
                          <button onClick={() => setConvertQuote(q)} className="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50">Convert</button>
                        )}
                        {q.approvalStatus === "APPROVED" && (q.status === "DRAFT" || q.status === "SENT") && (
                          <button onClick={() => setConvertQuote(q)} className="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50">Convert</button>
                        )}
                        {q.approvalStatus === "PENDING" && (
                          <span className="rounded px-2 py-1 text-xs text-amber-600 bg-amber-50">Pending Approval</span>
                        )}
                        {q.approvalStatus === "REJECTED" && (
                          <span className="rounded px-2 py-1 text-xs text-red-600 bg-red-50">Approval Rejected</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pagination && <Pagination page={page} totalPages={pagination.totalPages} onPageChange={setPage} />}
          </>
        )}
      </div>

      {/* Create */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Quote" size="xl">
        <QuoteForm
          onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["quotes"] }); }}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>

      {/* View / status actions */}
      {viewQuote && (
        <Modal open onClose={() => setViewQuote(null)} title={`Quote ${viewQuote.quoteNumber}`} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Customer:</span> <span className="font-medium">{viewQuote.customer?.name}</span></div>
              <div><span className="text-gray-500">Status:</span> <StatusBadge status={viewQuote.status} type="quote" /></div>
              <div><span className="text-gray-500">Total:</span> <span className="font-semibold">{fmtGhs(viewQuote.totalGhs)}</span></div>
              <div><span className="text-gray-500">Valid Until:</span> <span>{formatDate(viewQuote.validUntil)}</span></div>
            </div>
            {viewQuote.notes && <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{viewQuote.notes}</p>}
            {viewQuote.approvalStatus === "PENDING" && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                <span className="mt-0.5 text-base">⏳</span>
                <div>
                  <p className="font-semibold">Awaiting Management Approval</p>
                  <p className="text-xs text-amber-700 mt-0.5">This quote cannot be sent to the customer until an Admin or Accounts manager approves it in the Approvals inbox.</p>
                </div>
              </div>
            )}
            {viewQuote.approvalStatus === "REJECTED" && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
                <span className="mt-0.5 text-base">🚫</span>
                <div>
                  <p className="font-semibold">Approval Rejected</p>
                  <p className="text-xs text-red-700 mt-0.5">Management has rejected this quote. It cannot be sent to the customer or converted to an order.</p>
                </div>
              </div>
            )}
            {viewQuote.status === "DRAFT" && !viewQuote.approvalStatus && (
              <div className="flex gap-2 pt-2">
                <button disabled={updatingStatus} onClick={() => updateStatus({ id: viewQuote.id, s: "SENT" })} className="btn-primary">Mark as Sent</button>
                <button disabled={updatingStatus} onClick={() => updateStatus({ id: viewQuote.id, s: "REJECTED" })} className="btn-danger">Reject</button>
              </div>
            )}
            {viewQuote.status === "DRAFT" && viewQuote.approvalStatus === "APPROVED" && (
              <div className="flex gap-2 pt-2">
                <button disabled={updatingStatus} onClick={() => updateStatus({ id: viewQuote.id, s: "SENT" })} className="btn-primary">Mark as Sent</button>
                <button disabled={updatingStatus} onClick={() => updateStatus({ id: viewQuote.id, s: "REJECTED" })} className="btn-danger">Reject</button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Convert confirm */}
      <ConfirmDialog
        open={!!convertQuote}
        onClose={() => setConvertQuote(null)}
        onConfirm={() => convertQuote && convert(convertQuote.id)}
        title="Convert to Order"
        message={`Convert "${convertQuote?.quoteNumber}" to a confirmed order?`}
        confirmLabel="Convert"
        loading={converting}
      />
    </div>
  );
}
