import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/store/auth";

const schema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: z.string().min(8, "Minimum 8 characters"),
  confirmPassword: z.string().min(1, "Required"),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type FormData = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  const { user, setAuth, token } = useAuthStore();
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const { mutate, isPending } = useMutation({
    mutationFn: (d: FormData) => authApi.changePassword(d.currentPassword, d.newPassword),
    onSuccess: () => {
      toast.success("Password changed. Welcome!");
      if (user && token) {
        setAuth({ ...user, mustChangePassword: false }, token);
      }
      navigate("/dashboard", { replace: true });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to change password";
      toast.error(msg);
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-50 to-gray-100 p-4">
      <div className="w-full max-w-md">
        <div className="card">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600 text-white font-bold text-xl">C</div>
            <h1 className="text-xl font-bold text-gray-900">Set Your Password</h1>
            <p className="mt-2 text-sm text-gray-500">
              Welcome, <span className="font-medium">{user?.name}</span>. Your account was created with a temporary password. Please set a new one to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit((d) => mutate(d))} className="space-y-4">
            <div>
              <label className="label">Current (temporary) password</label>
              <input type="password" className="input" autoComplete="current-password" {...register("currentPassword")} />
              {errors.currentPassword && <p className="mt-1 text-xs text-red-600">{errors.currentPassword.message}</p>}
            </div>
            <div>
              <label className="label">New password</label>
              <input type="password" className="input" autoComplete="new-password" {...register("newPassword")} />
              {errors.newPassword && <p className="mt-1 text-xs text-red-600">{errors.newPassword.message}</p>}
            </div>
            <div>
              <label className="label">Confirm new password</label>
              <input type="password" className="input" autoComplete="new-password" {...register("confirmPassword")} />
              {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>}
            </div>
            <button type="submit" disabled={isPending} className="btn-primary w-full justify-center">
              {isPending ? "Saving…" : "Set Password & Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
