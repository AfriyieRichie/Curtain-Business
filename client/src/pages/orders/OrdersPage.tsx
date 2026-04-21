import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, ClipboardList } from "lucide-react";
import toast from "react-hot-toast";
import { ordersApi } from "@/api/orders";
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

function OrderDetail({ order, onClose }: { order: Order; onClose: () => void }) {
  const qc = useQueryClient();
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

  const jobCards = (full as Order & { jobCards?: Array<{ id: string; status: string; materials?: Array<{ id: string; material?: { code: string; name: string }; requiredQty: string; isIssued: boolean }> }> }).jobCards ?? [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div><span className="text-gray-500">Customer:</span> <span className="font-medium">{full.customer?.name}</span></div>
        <div><span className="text-gray-500">Status:</span> <StatusBadge status={full.status} type="order" /></div>
        <div><span className="text-gray-500">Total:</span> <span className="font-semibold">{fmtGhs(full.totalGhs)}</span></div>
        <div><span className="text-gray-500">Deposit:</span> <span>{fmtGhs(full.depositAmountGhs ?? "0")}</span></div>
      </div>

      {/* Status actions */}
      <div className="flex gap-2 flex-wrap">
        {full.status === "PENDING" && <button className="btn-secondary" onClick={() => updateStatus("CONFIRMED")}>Confirm Order</button>}
        {full.status === "CONFIRMED" && <button className="btn-primary" onClick={() => genCards()} disabled={genPending}>Generate Job Cards</button>}
        {full.status === "IN_PRODUCTION" && <button className="btn-secondary" onClick={() => updateStatus("COMPLETED")}>Mark Completed</button>}
        {full.status === "COMPLETED" && <button className="btn-secondary" onClick={() => updateStatus("DELIVERED")}>Mark Delivered</button>}
      </div>

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
                  <span className="text-xs font-mono text-gray-500">{jc.id.slice(-8).toUpperCase()}</span>
                  <StatusBadge status={jc.status} type="job" />
                </div>
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
          {["PENDING", "CONFIRMED", "IN_PRODUCTION", "COMPLETED", "DELIVERED", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}
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
