import { apiClient } from "./client";
import type { ApiResponse, ExchangeRate, PaginatedResponse } from "@/types";

export const exchangeRateApi = {
  getCurrent: () =>
    apiClient.get<ApiResponse<ExchangeRate>>("/exchange-rates/current").then((r) => r.data),

  getHistory: (params?: { page?: number; limit?: number }) =>
    apiClient.get<PaginatedResponse<ExchangeRate>>("/exchange-rates", { params }).then((r) => r.data),

  update: (rate: string) =>
    apiClient.post<ApiResponse<ExchangeRate>>("/exchange-rates", { rate }).then((r) => r.data),
};
