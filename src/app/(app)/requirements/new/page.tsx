import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { Card, ErrorState, PageHeader } from "@/components/ui";
import { createRequirementAction } from "@/app/actions/requirements";
import { RequirementForm } from "./RequirementForm";

export const dynamic = "force-dynamic";

export default async function NewRequirementPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { error } = await searchParams;

  let customerOptions: Array<{ id: string; name: string }> = [];
  let userOptions: Array<{ id: string; name: string }> = [];
  try {
    const db = await getDb();
    [customerOptions, userOptions] = await Promise.all([
      db.select({ id: customers.id, name: customers.name }).from(customers).orderBy(asc(customers.name)),
      db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name)),
    ]);
  } catch (err) {
    return <ErrorState title="Could not load form data" detail={err instanceof Error ? err.message : String(err)} />;
  }

  if (customerOptions.length === 0) {
    return (
      <div>
        <PageHeader title="New requirement" />
        <Card title="No customers yet">
          <p className="text-[13px] text-[var(--muted)]">
            A requirement must belong to a customer. Run <code>npm run seed</code> to load demo data, or add a
            customer from the OEM master area.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="New requirement / RFI"
        subtitle="Capture the requirement once. Line items, sourcing, quotes, orders and payments all hang off this record."
      />
      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>
      )}
      <RequirementForm customers={customerOptions} users={userOptions} action={createRequirementAction} />
    </div>
  );
}
