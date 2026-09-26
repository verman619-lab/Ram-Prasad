import Link from "next/link";
import { getDb } from "@/db";
import { answerQuestion, type AskResult } from "@/lib/ask";
import { SAMPLE_QUESTIONS } from "@/lib/nlq";
import { requireUser } from "@/lib/auth";
import { Card, ErrorState, PageHeader, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const { q } = await searchParams;

  let result: AskResult | null = null;
  let error: string | null = null;
  if (q && q.trim()) {
    try {
      const db = await getDb();
      result = await answerQuestion(db, q);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <div>
      <PageHeader
        title="Ask"
        subtitle="Plain-language questions answered from stored data only. If a question cannot be mapped to a query, no answer is invented."
      />

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block flex-1">
            <span className="label">Your question</span>
            <input
              className="input"
              name="q"
              defaultValue={q ?? ""}
              placeholder="e.g. how many orders are there?"
              autoFocus
            />
          </label>
          <button className="btn btn-primary" type="submit">
            Ask
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {SAMPLE_QUESTIONS.map((s) => (
            <Link
              key={s}
              href={`/ask?q=${encodeURIComponent(s)}`}
              className="rounded-full border border-[var(--line)] px-3 py-1 text-[12px] text-[#475467] hover:border-[#c7cdd6]"
            >
              {s}
            </Link>
          ))}
        </div>
      </Card>

      {error && <ErrorState title="Could not answer" detail={error} />}

      {result && (
        <Card title="Answer">
          <p className="text-[15px] font-medium">{result.answer}</p>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            Basis: {result.matched ? result.basis : "no matching intent"} · intent: {result.intent ?? "none"}
          </p>

          {result.columns.length > 0 && (
            <div className="mt-3">
              <Table head={result.columns} empty="No rows to show.">
                {result.rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-[var(--line)] last:border-0">
                    {result!.columns.map((c) => (
                      <td key={c} className="px-3 py-2">
                        {row[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
