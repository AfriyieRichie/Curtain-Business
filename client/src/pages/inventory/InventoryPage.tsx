import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Upload, Package, TrendingDown } from "lucide-react";
import toast from "react-hot-toast";
import { inventoryApi } from "@/api/inventory";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import { FullPageSpinner } from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import MaterialForm from "./components/MaterialForm";
import StockAdjustForm from "./components/StockAdjustForm";
import type { Material } from "@/types";

export default function InventoryPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<Material | null>(null);
  const [adjustItem, setAdjustItem] = useState<Material | null>(null);
  const [deactivateItem, setDeactivateItem] = useState<Material | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["materials", page, search, lowStock],
    queryFn: () => inventoryApi.getMaterials({ page, limit: 20, search: search || undefined, lowStock: lowStock || undefined }),
    placeholderData: (prev) => prev,
  });

  const { mutate: deactivate, isPending: deactivating } = useMutation({
    mutationFn: (id: string) => inventoryApi.deleteMaterial(id),
    onSuccess: () => {
      toast.success("Material deactivated");
      setDeactivateItem(null);
      qc.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: () => toast.error("Failed to deactivate material"),
  });

  async function handleBulkImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkImporting(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await inventoryApi.bulkImport(fd);
      toast.success(`Imported ${res.data.imported} materials. Skipped: ${res.data.skipped}`);
      qc.invalidateQueries({ queryKey: ["materials"] });
    } catch {
      toast.error("Bulk import failed");
    } finally {
      setBulkImporting(false);
      e.target.value = "";
    }
  }

  const materials = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        subtitle="Manage materials, stock levels, and pricing"
        action={
          <div className="flex gap-2">
            <label className="btn-secondary cursor-pointer">
              <Upload size={16} />
              {bulkImporting ? "Importing…" : "Import CSV"}
              <input type="file" accept=".csv" className="hidden" onChange={handleBulkImport} disabled={bulkImporting} />
            </label>
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> Add Material
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search by code or name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={lowStock}
            onChange={(e) => { setLowStock(e.target.checked); setPage(1); }}
            className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
          />
          <TrendingDown size={14} className="text-amber-500" />
          Low stock only
        </label>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <FullPageSpinner />
        ) : materials.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No materials found"
            description={search ? "Try adjusting your search" : "Add your first material to get started"}
            action={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> Add Material</button>}
          />
        ) : (
          <>
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="table-th">Code</th>
                  <th className="table-th">Name</th>
                  <th className="table-th">Category</th>
                  <th className="table-th text-right">Stock</th>
                  <th className="table-th text-right">Cost (GHS)</th>
                  <th className="table-th text-right">Cost (USD)</th>
                  <th className="table-th text-right">Sell Price (GHS)</th>
                  <th className="table-th">Supplier</th>
                  <th className="table-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materials.map((m) => {
                  const isLow = Number(m.currentStock) <= Number(m.minimumStock);
                  const rate = Number(m.exchangeRateUsed);
                  const costGhs = Number(m.unitCostGhs);
                  const effectiveUsd = rate > 0 ? costGhs / rate : Number(m.unitCostUsd);
                  return (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="table-td font-mono text-xs font-semibold text-violet-700">{m.code}</td>
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          {m.imageUrl && (
                            <img src={m.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                          )}
                          <span className="font-medium">{m.name}</span>
                        </div>
                      </td>
                      <td className="table-td text-gray-500">{m.category?.name ?? "—"}</td>
                      <td className="table-td text-right">
                        <span className={`font-mono ${isLow ? "text-amber-600 font-semibold" : ""}`}>
                          {Number(m.currentStock).toFixed(2)} {m.unit}
                        </span>
                        {isLow && <span className="ml-1 text-xs text-amber-500">⚠</span>}
                      </td>
                      <td className="table-td text-right font-mono text-gray-900">GHS {costGhs.toFixed(4)}</td>
                      <td className="table-td text-right font-mono text-gray-500 text-xs">${effectiveUsd.toFixed(4)}</td>
                      <td className="table-td text-right font-mono">GHS {Number(m.sellingPriceGhs).toFixed(2)}</td>
                      <td className="table-td text-gray-500 text-xs">{m.supplier?.name ?? "—"}</td>
                      <td className="table-td">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setAdjustItem(m)}
                            className="rounded-md px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                          >
                            Adjust
                          </button>
                          <button
                            onClick={() => setEditItem(m)}
                            className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeactivateItem(m)}
                            className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pagination && (
              <Pagination page={page} totalPages={pagination.totalPages} onPageChange={setPage} />
            )}
          </>
        )}
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Material" size="lg">
        <MaterialForm
          onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["materials"] }); }}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Material" size="lg">
        {editItem && (
          <MaterialForm
            material={editItem}
            onSuccess={() => { setEditItem(null); qc.invalidateQueries({ queryKey: ["materials"] }); }}
            onCancel={() => setEditItem(null)}
          />
        )}
      </Modal>

      {/* Stock adjust modal */}
      <Modal open={!!adjustItem} onClose={() => setAdjustItem(null)} title={`Adjust Stock — ${adjustItem?.code}`} size="sm">
        {adjustItem && (
          <StockAdjustForm
            material={adjustItem}
            onSuccess={() => { setAdjustItem(null); qc.invalidateQueries({ queryKey: ["materials"] }); }}
            onCancel={() => setAdjustItem(null)}
          />
        )}
      </Modal>

      {/* Deactivate confirm */}
      <ConfirmDialog
        open={!!deactivateItem}
        onClose={() => setDeactivateItem(null)}
        onConfirm={() => deactivateItem && deactivate(deactivateItem.id)}
        title="Deactivate Material"
        message={`Deactivate "${deactivateItem?.name}"? It will be hidden from new quotes and orders.`}
        confirmLabel="Deactivate"
        danger
        loading={deactivating}
      />
    </div>
  );
}
