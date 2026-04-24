import { apiClient } from "./client";
import type { ApiResponse, PaginatedResponse, Order } from "@/types";

export const ordersApi = {
  list: (params?: { page?: number; limit?: number; customerId?: string; status?: string; search?: string }) =>
    apiClient.get<PaginatedResponse<Order>>("/orders", { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<ApiResponse<Order>>(`/orders/${id}`).then((r) => r.data),

  update: (id: string, data: { status?: string; depositAmount?: string; notes?: string }) =>
    apiClient.patch<ApiResponse<Order>>(`/orders/${id}`, data).then((r) => r.data),

  generateJobCards: (id: string, assignedToId?: string) =>
    apiClient.post<ApiResponse<unknown[]>>(`/orders/${id}/job-cards`, { assignedToId }).then((r) => r.data),

  updateJobCard: (orderId: string, jobCardId: string, data: { status?: string; assignedToId?: string; completedAt?: string; labourCostGhs?: string; machineCostGhs?: string; overheadCostGhs?: string }) =>
    apiClient.patch<ApiResponse<unknown>>(`/orders/${orderId}/job-cards/${jobCardId}`, data).then((r) => r.data),

  issueMaterial: (orderId: string, jobCardId: string, materialId: string) =>
    apiClient.post<ApiResponse<unknown>>(`/orders/${orderId}/job-cards/${jobCardId}/materials/${materialId}/issue`, {}).then((r) => r.data),
};
