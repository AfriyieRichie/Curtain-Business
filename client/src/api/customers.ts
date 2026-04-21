import { apiClient } from "./client";
import type { ApiResponse, PaginatedResponse, Customer, CustomerWindow } from "@/types";

export const customersApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    apiClient.get<PaginatedResponse<Customer>>("/customers", { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<ApiResponse<Customer>>(`/customers/${id}`).then((r) => r.data),

  create: (data: Partial<Customer>) =>
    apiClient.post<ApiResponse<Customer>>("/customers", data).then((r) => r.data),

  update: (id: string, data: Partial<Customer>) =>
    apiClient.patch<ApiResponse<Customer>>(`/customers/${id}`, data).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`/customers/${id}`).then((r) => r.data),

  // Windows
  getWindows: (customerId: string) =>
    apiClient.get<ApiResponse<CustomerWindow[]>>(`/customers/${customerId}/windows`).then((r) => r.data),

  createWindow: (customerId: string, data: Partial<CustomerWindow>) =>
    apiClient.post<ApiResponse<CustomerWindow>>(`/customers/${customerId}/windows`, data).then((r) => r.data),

  updateWindow: (customerId: string, windowId: string, data: Partial<CustomerWindow>) =>
    apiClient.patch<ApiResponse<CustomerWindow>>(`/customers/${customerId}/windows/${windowId}`, data).then((r) => r.data),

  deleteWindow: (customerId: string, windowId: string) =>
    apiClient.delete(`/customers/${customerId}/windows/${windowId}`).then((r) => r.data),
};
