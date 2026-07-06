import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_PATH,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in" };

function safeFrom(value: string): string {
  // Only allow internal absolute paths to prevent open-redirects.
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

async function authenticate(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  const from = safeFrom(String(formData.get("from") ?? "/"));

  if (!verifyPassword(password)) {
    const suffix = from !== "/" ? `&from=${encodeURIComponent(from)}` : "";
    redirect(`/login?error=1${suffix}`);
  }

  const token = await createSessionToken();
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: SESSION_COOKIE_PATH,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  redirect(from);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const sp = await searchParams;
  const from = safeFrom(typeof sp?.from === "string" ? sp.from : "/");

  // Skip the form if the visitor already holds a valid session.
  const existing = (await cookies()).get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(existing)) {
    redirect(from);
  }

  const hasError = sp?.error === "1";
  const configured = Boolean(process.env.CRM_PASSWORD && process.env.CRM_AUTH_SECRET);

  return (
    <div className="grid min-h-screen place-items-center bg-[#0b1f3a] p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#d4a72c] text-lg font-black text-[#0b1f3a]">
            M
          </div>
          <div>
            <p className="font-bold tracking-tight text-[#0b1f3a]">Madar Hub CRM</p>
            <p className="text-xs text-slate-500">Sign in to continue</p>
          </div>
        </div>

        {!configured && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Sign-in is not configured. Set <code>CRM_PASSWORD</code> and{" "}
            <code>CRM_AUTH_SECRET</code> on the server.
          </p>
        )}

        <form action={authenticate} className="space-y-4">
          <input type="hidden" name="from" value={from} />
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#d4a72c] focus:ring-2 focus:ring-[#d4a72c]/30"
            />
          </div>

          {hasError && (
            <p className="text-sm font-medium text-red-600">Incorrect password. Please try again.</p>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b1f3a]/90"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
