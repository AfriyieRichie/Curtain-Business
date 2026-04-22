import { apiClient } from "./client";
import type { ApiResponse, User } from "@/types";

export interface LoginPayload { email: string; password: string; }
export interface LoginResult { accessToken: string; user: User; }
export interface CreateUserPayload { name: string; email: string; password: string; role: string; }

export const authApi = {
  login: (payload: LoginPayload) =>
    apiClient.post<ApiResponse<LoginResult>>("/auth/login", payload).then((r) => r.data),

  logout: () =>
    apiClient.post("/auth/logout").then((r) => r.data),

  refresh: () =>
    apiClient.post<ApiResponse<{ accessToken: string }>>("/auth/refresh").then((r) => r.data),

  me: () =>
    apiClient.get<ApiResponse<User>>("/auth/me").then((r) => r.data),

  listUsers: () =>
    apiClient.get<ApiResponse<User[]>>("/auth/users").then((r) => r.data),

  createUser: (data: CreateUserPayload) =>
    apiClient.post<ApiResponse<User>>("/auth/users", data).then((r) => r.data),

  updateUser: (id: string, data: Partial<{ name: string; role: string }>) =>
    apiClient.patch<ApiResponse<User>>(`/auth/users/${id}`, data).then((r) => r.data),

  deactivateUser: (id: string) =>
    apiClient.put<ApiResponse<User>>(`/auth/users/${id}/deactivate`).then((r) => r.data),

  resetPassword: (id: string, password: string) =>
    apiClient.put<ApiResponse<void>>(`/auth/users/${id}/reset-password`, { newPassword: password }).then((r) => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post<ApiResponse<void>>("/auth/change-password", { currentPassword, newPassword }).then((r) => r.data),
};
