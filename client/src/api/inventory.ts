import { apiClient } from "./client";
import type { ApiResponse, Material, MaterialCategory, StockMovement, PaginatedResponse } from "@/types";

export const inventoryApi = {
  // Categories
  getCategories: () =>
    apiClient.get<ApiResponse<MaterialCategory[]>>("/inventory/categories").then((r) => r.data),

  // Materials
  getMaterials: (params?: { page?: number; limit?: number; categoryId?: string; search?: string; lowStock?: boolean }) =>
    apiClient.get<PaginatedResponse<Material>>("/inventory/materials", { params }).then((r) => r.data),

  getMaterial: (id: string) =>
    apiClient.get<ApiResponse<Material>>(`/inventory/materials/${id}`).then((r) => r.data),

  createMaterial: (data: FormData) =>
    apiClient.post<ApiResponse<Material>>("/inventory/materials", data, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data),

  updateMaterial: (id: string, data: FormData) =>
    apiClient.put<ApiResponse<Material>>(`/inventory/materials/${id}`, data, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data),

  deleteMaterial: (id: string) =>
    apiClient.delete(`/inventory/materials/${id}`).then((r) => r.data),

  bulkImport: (formData: FormData) =>
    apiClient.post<ApiResponse<{ imported: number; skipped: number; errors: string[] }>>(
      "/inventory/materials/bulk-import",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    ).then((r) => r.data),

  // Stock movements
  getMovements: (materialId: string, params?: { page?: number; limit?: number }) =>
    apiClient.get<PaginatedResponse<StockMovement>>(`/inventory/materials/${materialId}/movements`, { params }).then((r) => r.data),

  adjustStock: (materialId: string, data: { quantity: number; movementType: string; notes?: string }) =>
    apiClient.post<ApiResponse<StockMovement>>(`/inventory/materials/${materialId}/adjust`, data).then((r) => r.data),

  // Valuation
  getValuation: () =>
    apiClient.get<ApiResponse<{ totalGhs: string; totalUsd: string; items: Material[] }>>("/inventory/valuation").then((r) => r.data),
};
