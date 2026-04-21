import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { inventoryApi } from "@/api/inventory";
import Spinner from "@/components/ui/Spinner";
import type { Material } from "@/types";

const schema = z.object({
  quantity: z.string().regex(/^-?\d+(\.\d+)?$/, "Enter a number (negative to deduct)"),
  movementType: z.enum(["MANUAL_ADJUSTMENT", "DAMAGE", "RETURN"]),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props { material: Material; onSuccess: () => void; onCancel: () => void; }

export default function StockAdjustForm({ material, onSuccess, onCancel }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { movementType: "MANUAL_ADJUSTMENT" },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (data: FormData) =>
      inventoryApi.adjustStock(material.id, {
        quantity: Number(data.quantity),
        movementType: data.movementType,
        notes: data.notes,
      }),
    onSuccess: () => { toast.success("Stock adjusted"); onSuccess(); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Adjustment failed";
      toast.error(msg);
    },
  });

  return (
    <form onSubmit={handleSubmit((d) => mutate(d))} className="space-y-4">
      <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
        <span className="text-gray-500">Current stock: </span>
        <span className="font-semibold">{Number(material.currentStock).toFixed(2)} {material.unit}</span>
      </div>

      <div>
        <label className="label">Quantity Change *</label>
        <input {...register("quantity")} className="input" placeholder="e.g. 10 or -5" />
        <p className="mt-1 text-xs text-gray-400">Positive = add stock, Negative = remove stock</p>
        {errors.quantity && <p className="mt-1 text-xs text-red-600">{errors.quantity.message}</p>}
      </div>

      <div>
        <label className="label">Reason *</label>
        <select {...register("movementType")} className="input">
          <option value="MANUAL_ADJUSTMENT">Manual Adjustment</option>
          <option value="DAMAGE">Damage / Write-off</option>
          <option value="RETURN">Return to Stock</option>
        </select>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea {...register("notes")} className="input resize-none" rows={2} placeholder="Optional note…" />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? <Spinner size="sm" /> : "Adjust Stock"}
        </button>
      </div>
    </form>
  );
}
