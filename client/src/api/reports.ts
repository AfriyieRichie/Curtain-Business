import { apiClient } from "./client";
import type { ApiResponse } from "@/types";

export interface DashboardKPIs {
  totalCustomers: number;
  activeOrders: number;
  monthlyRevenueGhs: string;
  lowStockCount: number;
  totalOutstandingGhs: string;
  pendingJobCards: number;
}

export const reportsApi = {
  getDashboard: () =>
    apiClient.get<ApiResponse<DashboardKPIs>>("/reports/dashboard").then((r) => r.data),

  getSales: (params?: { from?: string; to?: string }) =>
    apiClient.get<ApiResponse<unknown>>("/reports/sales", { params }).then((r) => r.data),

  getProfitability: (params?: { from?: string; to?: string }) =>
    apiClient.get<ApiResponse<unknown[]>>("/reports/profitability", { params }).then((r) => r.data),

  getInventory: () =>
    apiClient.get<ApiResponse<{ totalGhs: string; totalUsd: string; items: unknown[] }>>("/reports/inventory").then((r) => r.data),

  getStockMovements: (params?: { from?: string; to?: string; materialId?: string; movementType?: string }) =>
    apiClient.get<ApiResponse<unknown[]>>("/reports/stock-movements", { params }).then((r) => r.data),

  getPurchases: (params?: { from?: string; to?: string; supplierId?: string }) =>
    apiClient.get<ApiResponse<unknown>>("/reports/purchases", { params }).then((r) => r.data),

  getAgedDebtors: () =>
    apiClient.get<ApiResponse<unknown>>("/reports/aged-debtors").then((r) => r.data),

  getCharts: () =>
    apiClient.get<ApiResponse<{
      revenueTrend: Array<{ month: string; revenueGhs: string }>;
      topMaterials: Array<{ code: string; name: string; value: number }>;
      jobStatus: Array<{ status: string; count: number }>;
    }>>("/reports/charts").then((r) => r.data),
};
