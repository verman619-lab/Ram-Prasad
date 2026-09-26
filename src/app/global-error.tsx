"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = (error?.message ?? "").replace(/:\/\/[^@\s]+@/g, "://***@");

  return (
    <html lang="en">
      <body style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", padding: 24, color: "#101828" }}>
        <h1 style={{ fontSize: 18, color: "#b42318" }}>The application could not load</h1>
        {message && (
          <pre
            style={{
              background: "#f4f4f5",
              padding: 12,
              fontSize: 12,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              maxWidth: 800,
            }}
          >
            {message}
          </pre>
        )}
        {error?.digest && <p style={{ fontSize: 11, color: "#667085" }}>Digest: {error.digest}</p>}
        <button onClick={() => reset()} style={{ marginTop: 12, padding: "6px 12px", cursor: "pointer" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
