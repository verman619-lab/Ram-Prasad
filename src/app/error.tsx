"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = (error?.message ?? "").replace(/:\/\/[^@\s]+@/g, "://***@");
  const looksLikeDb = /DATABASE_URL|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|PGlite|password authentication|does not exist/i.test(
    message,
  );

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-2xl rounded-lg border border-red-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-red-700">The application could not load</h1>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          {looksLikeDb
            ? "This looks like a database connection problem. Set DATABASE_URL for this environment and redeploy."
            : "A server-side error occurred."}
        </p>
        {message && (
          <pre className="mt-3 max-h-64 overflow-auto rounded bg-slate-50 p-3 text-[12px] whitespace-pre-wrap">
            {message}
          </pre>
        )}
        {error?.digest && <p className="mt-2 text-[11px] text-[var(--muted)]">Digest: {error.digest}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <a className="btn btn-ghost" href="/api/health">
            Check database health
          </a>
        </div>
      </div>
    </main>
  );
}
