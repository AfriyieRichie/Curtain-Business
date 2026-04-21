import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { inventoryApi } from "@/api/inventory";
import { purchasingApi } from "@/api/purchasing";
import Spinner from "@/components/ui/Spinner";
import type { Material } from "@/types";

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().min(1, "Category required"),
  unit: z.string().min(1),
  unitCostUsd: z.string().regex(/^\d+(\.\d{1,6})?$/, "Valid cost required"),
  currentStock: z.string().optional(),
  minimumStock: z.string().optional(),
  reorderQuantity: z.string().optional(),
  supplierId: z.string().optional(),
  sellingPriceGhs: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  material?: Material;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function MaterialForm({ material, onSuccess, onCancel }: Props) {
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: inventoryApi.getCategories });
  const { data: suppliers } = useQuery({ queryKey: ["suppliers-mini"], queryFn: () => purchasingApi.listSuppliers({ page: 1 }) });

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: material
      ? {
          code: material.code,
          name: material.name,
          description: material.description ?? "",
          categoryId: material.categoryId,
          unit: material.unit,
          unitCostUsd: material.unitCostUsd,
          currentStock: material.currentStock,
          minimumStock: material.minimumStock,
          reorderQuantity: material.reorderQuantity,
          supplierId: material.supplierId ?? "",
          sellingPriceGhs: material.sellingPriceGhs,
        }
      : {},
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (data: FormData) => {
      const fd = new FormData();
      Object.entries(data).forEach(([k, v]) => { if (v) fd.append(k, v); });
      return material
        ? inventoryApi.updateMaterial(material.id, fd)
        : inventoryApi.createMaterial(fd);
    },
    onSuccess: () => {
      toast.success(material ? "Material updated" : "Material created");
      onSuccess();
    },
    onError: () => toast.error("Failed to save material"),
  });

  const units = ["METER", "PIECE", "ROLL", "PACK", "SET"];

  return (
    <form onSubmit={handleSubmit((d) => mutate(d))} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Code *</label>
          <input {...register("code")} className="input uppercase" placeholder="FAB-001" />
          {errors.code && <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>}
        </div>
        <div>
          <label className="label">Unit *</label>
          <select {...register("unit")} className="input">
            <option value="">Select unit</option>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          {errors.unit && <p className="mt-1 text-xs text-red-600">{errors.unit.message}</p>}
        </div>
      </div>

      <div>
        <label className="label">Name *</label>
        <input {...register("name")} className="input" placeholder="Velvet Fabric — Deep Blue" />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>

      <div>
        <label className="label">Description</label>
        <textarea {...register("description")} className="input resize-none" rows={2} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Category *</label>
          <select {...register("categoryId")} className="input">
            <option value="">Select category</option>
            {categories?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {errors.categoryId && <p className="mt-1 text-xs text-red-600">{errors.categoryId.message}</p>}
        </div>
        <div>
          <label className="label">Supplier</label>
          <select {...register("supplierId")} className="input">
            <option value="">None</option>
            {suppliers?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Unit Cost (USD) *</label>
          <input {...register("unitCostUsd")} className="input" placeholder="12.5000" />
          {errors.unitCostUsd && <p className="mt-1 text-xs text-red-600">{errors.unitCostUsd.message}</p>}
        </div>
        <div>
          <label className="label">Selling Price (GHS) <span className="text-gray-400 font-normal">(auto if blank)</span></label>
          <input {...register("sellingPriceGhs")} className="input" placeholder="Auto-calculated" />
        </div>
      </div>

      {!material && (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Opening Stock</label>
            <input {...register("currentStock")} className="input" placeholder="0" />
          </div>
          <div>
            <label className="label">Minimum Stock</label>
            <input {...register("minimumStock")} className="input" placeholder="0" />
          </div>
          <div>
            <label className="label">Reorder Qty</label>
            <input {...register("reorderQuantity")} className="input" placeholder="0" />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? <Spinner size="sm" /> : (material ? "Save Changes" : "Create Material")}
        </button>
      </div>
    </form>
  );
}
