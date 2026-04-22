import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import toast from "react-hot-toast";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/store/auth";

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password required"),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const { setAuth, token } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const { mutate, isPending } = useMutation({
    mutationFn: authApi.login,
    onSuccess: (res) => {
      setAuth(res.data.user, res.data.accessToken);
    },
    onError: () => {
      toast.error("Invalid email or password");
    },
  });

  if (token) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-50 to-gray-100 p-4">
      <div className="w-full max-w-md">
        <div className="card">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600 text-white font-bold text-xl">C</div>
            <h1 className="text-2xl font-bold text-gray-900">Curtains ERP</h1>
            <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit((d) => mutate(d))} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input"
                placeholder="you@example.com"
                {...register("email")}
              />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="input"
                placeholder="••••••••"
                {...register("password")}
              />
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={isPending} className="btn-primary w-full justify-center">
              {isPending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
