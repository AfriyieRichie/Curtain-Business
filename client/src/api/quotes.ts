import { apiClient } from "./client";
import type { ApiResponse, PaginatedResponse, Quote } from "@/types";

export interface CreateQuoteItem {
  curtainTypeId: string;
  bomTemplateId: string;
  windowLabel: string;
  fabricMaterialId: string;
  liningMaterialId?: string;
  description?: string;
  widthCm: number;
  dropCm: number;
  quantity: number;
  fullnessRatio?: number;
  fabricWidthCm?: number;
  unitPriceGhs?: string;
}

export interface CreateQuotePayload {
  customerId: string;
  discountRate?: number;
  validUntil?: string;
  notes?: string;
  items: CreateQuoteItem[];
}

export const quotesApi = {
  list: (params?: { page?: number; limit?: number; customerId?: string; status?: string; search?: string }) =>
    apiClient.get<PaginatedResponse<Quote>>("/quotes", { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<ApiResponse<Quote>>(`/quotes/${id}`).then((r) => r.data),

  create: (data: CreateQuotePayload) =>
    apiClient.post<ApiResponse<Quote>>("/quotes", data).then((r) => r.data),

  update: (id: string, data: { status?: string; validUntil?: string; notes?: string }) =>
    apiClient.patch<ApiResponse<Quote>>(`/quotes/${id}`, data).then((r) => r.data),

  convertToOrder: (id: string, depositAmount?: string) =>
    apiClient.post<ApiResponse<{ id: string; orderNumber: string }>>(`/quotes/${id}/convert`, { depositAmount }).then((r) => r.data),
};
