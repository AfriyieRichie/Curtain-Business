import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import toast from "react-hot-toast";
import { ordersApi } from "@/api/orders";
import PageHeader from "@/components/ui/PageHeader";
import { FullPageSpinner } from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";

interface JobCardMaterial {
  id: string;
  material?: { code: string; name: string; unit: string };
  requiredQty: string;
  issuedQty?: string;
  isIssued: boolean;
}

interface JobCard {
  id: string;
  orderId: string;
  status: string;
  order?: { orderNumber: string; customer?: { name: string } };
  materials?: JobCardMaterial[];
}

export default function ProductionPage() {
  const qc = useQueryClient();

  // Fetch all in-production orders to extract job cards
  const { data, isLoading } = useQuery({
    queryKey: ["production-orders"],
    queryFn: () => ordersApi.list({ status: "IN_PRODUCTION", page: 1, limit: 50 }),
    refetchInterval: 30_000,
  });

  const orders = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Production" subtitle="Job cards currently in production" />

      {isLoading ? (
        <FullPageSpinner />
      ) : orders.length === 0 ? (
        <EmptyState icon={Wrench} title="No active production jobs" description="Job cards appear here when orders move to In Production" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => (
            <OrderJobCards key={order.id} orderId={order.id} orderNumber={order.orderNumber} customerName={order.customer?.name ?? "—"} qc={qc} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderJobCards({ orderId, orderNumber, customerName, qc }: { orderId: string; orderNumber: string; customerName: string; qc: ReturnType<typeof useQueryClient> }) {
  const { data } = useQuery({ queryKey: ["order", orderId], queryFn: () => ordersApi.get(orderId) });
  const full = data?.data as (typeof data extends { data: infer D } ? D : unknown) & { jobCards?: JobCard[] };
  const jobCards: JobCard[] = (full as { jobCards?: JobCard[] })?.jobCards ?? [];

  const { mutate: updateJC } = useMutation({
    mutationFn: ({ jobCardId, status }: { jobCardId: string; status: string }) =>
      ordersApi.updateJobCard(orderId, jobCardId, { status }),
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["order", orderId] }); },
    onError: () => toast.error("Update failed"),
  });

  const { mutate: issueMat } = useMutation({
    mutationFn: ({ jobCardId, materialId }: { jobCardId: string; materialId: string }) =>
      ordersApi.issueMaterial(orderId, jobCardId, materialId),
    onSuccess: () => { toast.success("Material issued"); qc.invalidateQueries({ queryKey: ["order", orderId] }); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to issue";
      toast.error(msg);
    },
  });

  return (
    <div className="card space-y-3">
      <div>
        <p className="font-semibold text-gray-900">{orderNumber}</p>
        <p className="text-xs text-gray-500">{customerName}</p>
      </div>

      {jobCards.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No job cards yet</p>
      ) : (
        jobCards.map((jc) => (
          <div key={jc.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-gray-500">{jc.id.slice(-6).toUpperCase()}</span>
              <StatusBadge status={jc.status} type="job" />
            </div>

            {jc.materials && jc.materials.length > 0 && (
              <div className="space-y-1">
                {jc.materials.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-gray-700">{m.material?.code} — {m.material?.name}</span>
                    <span className="flex items-center gap-2 ml-2 flex-shrink-0">
                      <span className="font-mono text-gray-500">{Number(m.requiredQty).toFixed(2)} {m.material?.unit}</span>
                      {m.isIssued ? (
                        <span className="text-green-600 font-medium">Issued ✓</span>
                      ) : (
                        <button
                          onClick={() => issueMat({ jobCardId: jc.id, materialId: m.id })}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          Issue
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              {jc.status === "PENDING" && (
                <button onClick={() => updateJC({ jobCardId: jc.id, status: "IN_PROGRESS" })} className="btn-secondary text-xs py-1 px-2">Start</button>
              )}
              {jc.status === "IN_PROGRESS" && (
                <button onClick={() => updateJC({ jobCardId: jc.id, status: "COMPLETED" })} className="btn-primary text-xs py-1 px-2">Complete</button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
