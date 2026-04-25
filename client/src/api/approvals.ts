import { apiClient } from "./client";
import type { ApiResponse, PaginatedResponse, ApprovalRequest } from "@/types";

export const approvalsApi = {
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    apiClient.get<PaginatedResponse<ApprovalRequest>>("/approvals", { params }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<ApiResponse<ApprovalRequest>>(`/approvals/${id}`).then((r) => r.data),

  approve: (id: string, note?: string) =>
    apiClient.post<ApiResponse<ApprovalRequest>>(`/approvals/${id}/approve`, { note }).then((r) => r.data),

  reject: (id: string, note: string) =>
    apiClient.post<ApiResponse<ApprovalRequest>>(`/approvals/${id}/reject`, { note }).then((r) => r.data),

  getPendingCount: () =>
    apiClient.get<ApiResponse<{ count: number }>>("/approvals/pending-count").then((r) => r.data),
};
