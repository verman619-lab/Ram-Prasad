import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loginAction } from "../actions/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand)] text-lg font-bold text-white">
            IB
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Inverbrass CRM</h1>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Requirement → OEM sourcing → quotation → order
          </p>
        </div>

        <form
          action={loginAction}
          className="space-y-3 rounded-lg border border-[var(--line)] bg-white p-5"
        >
          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {error}
            </p>
          )}
          <label className="block">
            <span className="label">Email</span>
            <input
              className="input"
              type="email"
              name="email"
              defaultValue="ram@inverbrass.example"
              autoComplete="username"
              required
            />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input
              className="input"
              type="password"
              name="password"
              defaultValue="inverbrass"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="btn btn-primary w-full justify-center" type="submit">
            Sign in
          </button>
        </form>

        <p className="mt-4 text-center text-[12px] text-[var(--muted)]">
          Demo accounts (password <code>inverbrass</code>): ram@inverbrass.example (owner),
          sales@inverbrass.example, ops@inverbrass.example, finance@inverbrass.example
        </p>
      </div>
    </main>
  );
}
