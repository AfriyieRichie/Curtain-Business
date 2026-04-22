import { apiClient } from "./client";
import type { ApiResponse, PaginatedResponse, Invoice, Payment } from "@/types";

export const invoicesApi = {
  list: (params?: { page?: number; limit?: number; customerId?: string; status?: string; search?: string }) =>
    apiClient.get<PaginatedResponse<Invoice>>("/invoices", { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<ApiResponse<Invoice>>(`/invoices/${id}`).then((r) => r.data),

  generate: (data: { orderId: string; dueDate?: string; notes?: string }) =>
    apiClient.post<ApiResponse<Invoice>>("/invoices", data).then((r) => r.data),

  update: (id: string, data: { dueDate?: string; notes?: string; status?: string }) =>
    apiClient.patch<ApiResponse<Invoice>>(`/invoices/${id}`, data).then((r) => r.data),

  listPayments: (id: string) =>
    apiClient.get<ApiResponse<Payment[]>>(`/invoices/${id}/payments`).then((r) => r.data),

  recordPayment: (id: string, data: { amountGhs: string; method: string; reference?: string; notes?: string; paidAt?: string }) =>
    apiClient.post<ApiResponse<Payment>>(`/invoices/${id}/payments`, data).then((r) => r.data),

  emailInvoice: (id: string) =>
    apiClient.post<ApiResponse<null>>(`/invoices/${id}/email`).then((r) => r.data),
};
