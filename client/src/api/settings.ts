import { apiClient } from "./client";
import type { ApiResponse } from "@/types";

export interface BusinessSetting {
  key: string;
  value: string;
  description?: string;
}

export interface MaterialCategory {
  id: string;
  name: string;
  description?: string;
  _count?: { materials: number };
}

export const settingsApi = {
  list: () =>
    apiClient.get<ApiResponse<BusinessSetting[]>>("/settings").then((r) => r.data),

  get: (key: string) =>
    apiClient.get<ApiResponse<BusinessSetting>>(`/settings/${key}`).then((r) => r.data),

  upsert: (key: string, value: string, description?: string) =>
    apiClient.put<ApiResponse<BusinessSetting>>(`/settings/${key}`, { value, description }).then((r) => r.data),

  bulkUpsert: (updates: Array<{ key: string; value: string }>) =>
    apiClient.post<ApiResponse<BusinessSetting[]>>("/settings/bulk", updates).then((r) => r.data),

  // Material Categories
  listCategories: () =>
    apiClient.get<ApiResponse<MaterialCategory[]>>("/settings/material-categories").then((r) => r.data),

  createCategory: (data: { name: string; description?: string }) =>
    apiClient.post<ApiResponse<MaterialCategory>>("/settings/material-categories", data).then((r) => r.data),

  updateCategory: (id: string, data: { name?: string; description?: string }) =>
    apiClient.patch<ApiResponse<MaterialCategory>>(`/settings/material-categories/${id}`, data).then((r) => r.data),

  deleteCategory: (id: string) =>
    apiClient.delete<ApiResponse<null>>(`/settings/material-categories/${id}`).then((r) => r.data),

  uploadLogo: (file: File) => {
    const fd = new FormData();
    fd.append("logo", file);
    return apiClient.post<ApiResponse<BusinessSetting>>("/settings/logo", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },
};
