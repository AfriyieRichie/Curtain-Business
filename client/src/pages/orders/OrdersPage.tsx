import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, ClipboardList, Receipt } from "lucide-react";
import toast from "react-hot-toast";
import { ordersApi } from "@/api/orders";
import { invoicesApi } from "@/api/invoices";
import { useAuthStore } from "@/store/auth";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import { FullPageSpinner } from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/formatters";
import type { Order } from "@/types";

function fmtGhs(v: string | number) {
  return `GHS ${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function DepositForm({ orderId, totalGhs, currentDeposit, onDone }: { orderId: string; totalGhs: string; currentDeposit: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(Number(currentDeposit) > 0 ? currentDeposit : "");
  const { mutate, isPending } = useMutation({
    mutationFn: (depositAmount: string) => ordersApi.update(orderId, { depositAmount }),
    onSuccess: () => {
      toast.success("Deposit recorded");
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      onDone();
    },
    onError: () => toast.error("Failed to record deposit"),
  });
  const balance = Number(totalGhs) - Number(amount || 0);
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
      <h4 className="text-sm font-semibold text-amber-800">Record Deposit</h4>
      <div>
        <label className="label">Deposit Amount (GHS)</label>
        <input type="number" step="0.01" min="0" max={totalGhs} className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </div>
      <p className="text-sm text-gray-600">Balance due: <span className={`font-semibold ${balance > 0 ? "text-red-600" : "text-green-600"}`}>{fmtGhs(balance.toFixed(2))}</span></p>
      <div className="flex gap-2">
        <button onClick={() => mutate(amount)} disabled={!amount || isPending} className="btn-primary text-sm py-1.5 px-3">
          {isPending ? "Saving…" : "Save Deposit"}
        </button>
        <button onClick={onDone} className="btn-secondary text-sm py-1.5 px-3">Cancel</button>
      </div>
    </div>
  );
}

function JobCardActions({ orderId, jobCard, canAct }: { orderId: string; jobCard: { id: string; status: string }; canAct: boolean }) {
  const qc = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: (status: string) => ordersApi.updateJobCard(orderId, jobCard.id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order", orderId] }),
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Update failed";
      toast.error(msg);
    },
  });
  if (!canAct) return null;
  if (jobCard.status === "PENDING") {
    return (
      <button onClick={() => mutate("IN_PROGRESS")} disabled={isPending} className="text-xs text-blue-600 hover:underline disabled:opacity-50">
        {isPending ? "…" : "Start"}
      </button>
    );
  }
  if (jobCard.status === "IN_PROGRESS") {
    return (
      <button onClick={() => mutate("COMPLETED")} disabled={isPending} className="text-xs text-green-600 hover:underline disabled:opacity-50">
        {isPending ? "…" : "Complete"}
      </button>
    );
  }
  return null;
}

function OrderDetail({ order, onClose }: { order: Order; onClose: () => void }) {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canInvoice = role === "ADMIN" || role === "ACCOUNTS";
  const canManageJobCards = role === "ADMIN" || role === "ACCOUNTS" || role === "WORKSHOP";
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [costsJobCardId, setCostsJobCardId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["order", order.id], queryFn: () => ordersApi.get(order.id) });
  const full = data?.data ?? order;

  const { mutate: genCards, isPending: genPending } = useMutation({
    mutationFn: () => ordersApi.generateJobCards(order.id),
    onSuccess: () => { toast.success("Job cards generated"); qc.invalidateQueries({ queryKey: ["order", order.id] }); },
    onError: () => toast.error("Failed to generate job cards"),
  });

  const { mutate: updateStatus } = useMutation({
    mutationFn: (status: string) => ordersApi.update(order.id, { status }),
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["orders"] }); qc.invalidateQueries({ queryKey: ["order", order.id] }); },
    onError: () => toast.error("Failed to update status"),
  });

  const fullOrder = full as Order & {
    jobCards?: Array<{ id: string; jobNumber: string; status: string; notes?: string; labourCostGhs?: string; machineCostGhs?: string; overheadCostGhs?: string; materials?: Array<{ id: string; material?: { code: string; name: string }; requiredQty: string; isIssued: boolean }> }>;
    invoices?: Array<{ id: string; invoiceNumber: string; status: string }>;
  };
  const jobCards = fullOrder.jobCards ?? [];
  const existingInvoice = fullOrder.invoices?.[0];

  const { mutate: genInvoice, isPending: invoicePending } = useMutation({
    mutationFn: () => invoicesApi.generate({ orderId: order.id }),
    onSuccess: (res) => {
      toast.success(`Invoice ${res.data.invoiceNumber} created`);
      qc.invalidateQueries({ queryKey: ["order", order.id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to generate invoice";
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div><span className="text-gray-500">Customer:</span> <span className="font-medium">{full.customer?.name}</span></div>
        <div><span className="text-gray-500">Status:</span> <StatusBadge status={full.status} type="order" /></div>
        <div><span className="text-gray-500">Total:</span> <span className="font-semibold">{fmtGhs(full.totalGhs)}</span></div>
        <div>
          <span className="text-gray-500">Deposit:</span>{" "}
          <span>{fmtGhs(full.depositAmountGhs ?? "0")}</span>
          <button onClick={() => setShowDepositForm((v) => !v)} className="ml-2 text-xs text-violet-600 hover:underline">
            {showDepositForm ? "Cancel" : "Edit"}
          </button>
        </div>
        {Number(full.balanceDueGhs ?? 0) > 0 && (
          <div><span className="text-gray-500">Balance Due:</span> <span className="font-semibold text-red-600">{fmtGhs(full.balanceDueGhs ?? "0")}</span></div>
        )}
      </div>

      {showDepositForm && (
        <DepositForm
          orderId={order.id}
          totalGhs={full.totalGhs}
          currentDeposit={full.depositAmountGhs ?? "0"}
          onDone={() => setShowDepositForm(false)}
        />
      )}

      {/* Approval status banner */}
      {full.approvalStatus === "PENDING" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <span className="mt-0.5 text-base">⏳</span>
          <div>
            <p className="font-semibold">Awaiting Management Approval</p>
            <p className="text-xs text-amber-700 mt-0.5">This high-value order is in the Approvals queue. Production cannot begin until an Admin or Accounts manager approves it.</p>
          </div>
        </div>
      )}
      {full.approvalStatus === "REJECTED" && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <span className="mt-0.5 text-base">🚫</span>
          <div>
            <p className="font-semibold">Approval Rejected</p>
            <p className="text-xs text-red-700 mt-0.5">This order was rejected by management. Please contact your administrator.</p>
          </div>
        </div>
      )}

      {/* Status actions — all hidden while approval is pending */}
      {full.approvalStatus !== "PENDING" && full.approvalStatus !== "REJECTED" && (
        <div className="flex gap-2 flex-wrap">
          {full.status === "PENDING" && <button className="btn-secondary" onClick={() => updateStatus("CONFIRMED")}>Confirm Order</button>}
          {full.status === "CONFIRMED" && jobCards.length === 0 && canInvoice && <button className="btn-primary" onClick={() => genCards()} disabled={genPending}>Generate Job Cards</button>}
          {full.status === "IN_PRODUCTION" && <button className="btn-secondary" onClick={() => updateStatus("COMPLETED")}>Mark Completed</button>}
          {full.status === "COMPLETED" && <button className="btn-secondary" onClick={() => updateStatus("DELIVERED")}>Mark Delivered</button>}
        </div>
      )}

      {/* Invoice */}
      {(full.status === "COMPLETED" || full.status === "DELIVERED") && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex items-center justify-between">
          {existingInvoice ? (
            <>
              <div className="text-sm">
                <span className="text-gray-500">Invoice:</span>{" "}
                <span className="font-mono font-semibold text-violet-700">{existingInvoice.invoiceNumber}</span>
                <span className="ml-2"><StatusBadge status={existingInvoice.status} type="invoice" /></span>
              </div>
              <span className="text-xs text-gray-400">Go to Invoices to record payment</span>
            </>
          ) : canInvoice ? (
            <>
              <span className="text-sm text-gray-600">No invoice generated yet</span>
              <button onClick={() => genInvoice()} disabled={invoicePending} className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1.5">
                <Receipt size={14} /> {invoicePending ? "Generating…" : "Generate Invoice"}
              </button>
            </>
          ) : (
            <span className="text-sm text-gray-500">No invoice generated yet — contact Accounts to generate.</span>
          )}
        </div>
      )}

      {/* Job cards */}
      {isLoading ? (
        <FullPageSpinner />
      ) : jobCards.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Job Cards</h3>
          <div className="space-y-3">
            {jobCards.map((jc) => (
              <div key={jc.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono font-semibold text-violet-700">{jc.jobNumber || jc.id.slice(-8).toUpperCase()}</span>
                  <div className="flex items-center gap-2">
                    <JobCardActions orderId={order.id} jobCard={jc} canAct={canManageJobCards} />
                    <button onClick={() => setCostsJobCardId(costsJobCardId === jc.id ? null : jc.id)} className="text-xs text-violet-600 hover:underline">
                      {costsJobCardId === jc.id ? "Hide Costs" : "Costs"}
                    </button>
                    <StatusBadge status={jc.status} type="job" />
                  </div>
                </div>
                {(Number(jc.labourCostGhs) > 0 || Number(jc.machineCostGhs) > 0 || Number(jc.overheadCostGhs) > 0) && costsJobCardId !== jc.id && (
                  <p className="text-xs text-gray-500 mb-2">
                    Labour: {fmtGhs(jc.labourCostGhs ?? "0")} · Machine: {fmtGhs(jc.machineCostGhs ?? "0")} · Overhead: {fmtGhs(jc.overheadCostGhs ?? "0")}
                  </p>
                )}
                {costsJobCardId === jc.id && (
                  <ProductionCostForm orderId={order.id} jobCardId={jc.id} jobCard={jc} onDone={() => setCostsJobCardId(null)} />
                )}
                {jc.materials && jc.materials.length > 0 && (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="text-left pb-1">Material</th>
                        <th className="text-right pb-1">Required</th>
                        <th className="text-right pb-1">Issued</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jc.materials.map((m) => (
                        <tr key={m.id} className="border-t border-gray-50">
                          <td className="py-1">{m.material?.code} — {m.material?.name}</td>
                          <td className="py-1 text-right font-mono">{Number(m.requiredQty).toFixed(3)}</td>
                          <td className="py-1 text-right">
                            {m.isIssued ? (
                              <span className="text-green-600">✓</span>
                            ) : (
                              <IssueMaterialButton orderId={order.id} jobCardId={jc.id} materialId={m.id} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={onClose} className="btn-secondary">Close</button>
      </div>
    </div>
  );
}

function ProductionCostForm({ orderId, jobCardId, jobCard, onDone }: {
  orderId: string; jobCardId: string;
  jobCard: { labourCostGhs?: string; machineCostGhs?: string; overheadCostGhs?: string };
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [costs, setCosts] = useState({
    labourCostGhs: jobCard.labourCostGhs ?? "0",
    machineCostGhs: jobCard.machineCostGhs ?? "0",
    overheadCostGhs: jobCard.overheadCostGhs ?? "0",
  });
  const { mutate, isPending } = useMutation({
    mutationFn: () => ordersApi.updateJobCard(orderId, jobCardId, costs),
    onSuccess: () => { toast.success("Production costs saved"); qc.invalidateQueries({ queryKey: ["order", orderId] }); onDone(); },
    onError: () => toast.error("Failed to save costs"),
  });
  const total = Number(costs.labourCostGhs || 0) + Number(costs.machineCostGhs || 0) + Number(costs.overheadCostGhs || 0);
  return (
    <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-3 space-y-2">
      <p className="text-xs font-semibold text-gray-600">Production Costs (GHS)</p>
      {(["labourCostGhs", "machineCostGhs", "overheadCostGhs"] as const).map((k) => (
        <div key={k} className="flex items-center gap-2">
          <label className="text-xs text-gray-500 w-24">{k === "labourCostGhs" ? "Labour" : k === "machineCostGhs" ? "Machine" : "Overhead"}</label>
          <input type="number" step="0.01" min="0" className="input py-1 text-sm flex-1" value={costs[k]}
            onChange={(e) => setCosts((p) => ({ ...p, [k]: e.target.value }))} />
        </div>
      ))}
      <p className="text-xs text-gray-500">Total: <span className="font-semibold text-gray-800">{fmtGhs(total.toFixed(2))}</span></p>
      <div className="flex gap-2">
        <button onClick={() => mutate()} disabled={isPending} className="btn-primary text-xs py-1 px-2">{isPending ? "Saving…" : "Save"}</button>
        <button onClick={onDone} className="btn-secondary text-xs py-1 px-2">Cancel</button>
      </div>
    </div>
  );
}

function IssueMaterialButton({ orderId, jobCardId, materialId }: { orderId: string; jobCardId: string; materialId: string }) {
  const qc = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: () => ordersApi.issueMaterial(orderId, jobCardId, materialId),
    onSuccess: () => { toast.success("Material issued"); qc.invalidateQueries({ queryKey: ["order", orderId] }); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Issue failed";
      toast.error(msg);
    },
  });
  return (
    <button onClick={() => mutate()} disabled={isPending} className="text-blue-600 hover:underline disabled:opacity-50">
      {isPending ? "…" : "Issue"}
    </button>
  );
}

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["orders", page, search, status],
    queryFn: () => ordersApi.list({ page, limit: 20, search: search || undefined, status: status || undefined }),
    placeholderData: (p) => p,
  });

  const orders = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" subtitle="Track confirmed customer orders through production" />

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="search" placeholder="Search orders…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="input pl-9" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="input max-w-44">
          <option value="">All statuses</option>
          {["PENDING", "CONFIRMED", "IN_PRODUCTION", "COMPLETED", "DELIVERED", "CANCELLED"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <FullPageSpinner />
        ) : orders.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No orders" description="Convert a quote to create an order" />
        ) : (
          <>
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="table-th">Order #</th>
                  <th className="table-th">Customer</th>
                  <th className="table-th">Status</th>
                  <th className="table-th text-right">Total (GHS)</th>
                  <th className="table-th">Date</th>
                  <th className="table-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="table-td font-mono text-xs font-semibold text-violet-700">{o.orderNumber}</td>
                    <td className="table-td font-medium">{o.customer?.name ?? "—"}</td>
                    <td className="table-td"><StatusBadge status={o.status} type="order" /></td>
                    <td className="table-td text-right font-mono">{fmtGhs(o.totalGhs)}</td>
                    <td className="table-td text-gray-500">{formatDate(o.createdAt)}</td>
                    <td className="table-td">
                      <button onClick={() => setSelected(o)} className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pagination && <Pagination page={page} totalPages={pagination.totalPages} onPageChange={setPage} />}
          </>
        )}
      </div>

      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`Order ${selected.orderNumber}`} size="xl">
          <OrderDetail order={selected} onClose={() => setSelected(null)} />
        </Modal>
      )}
    </div>
  );
}
