import { apiClient } from "./client";
import type { ApiResponse, User } from "@/types";

export interface LoginPayload { email: string; password: string; }
export interface LoginResult { accessToken: string; user: User; }

export const authApi = {
  login: (payload: LoginPayload) =>
    apiClient.post<ApiResponse<LoginResult>>("/auth/login", payload).then((r) => r.data),

  logout: () =>
    apiClient.post("/auth/logout").then((r) => r.data),

  refresh: () =>
    apiClient.post<ApiResponse<{ accessToken: string }>>("/auth/refresh").then((r) => r.data),

  me: () =>
    apiClient.get<ApiResponse<User>>("/auth/me").then((r) => r.data),
};
