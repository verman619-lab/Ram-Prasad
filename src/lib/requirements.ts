import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  customers,
  documents,
  oemCapacityDeclarations,
  oemRequests,
  oemResponses,
  oems,
  quotationItems,
  quotations,
  requirementItems,
  requirements,
  timelineEvents,
  users,
  type ResponseType,
} from "@/db/schema";
import {
  computeCoverage,
  requirementCoverageRollup,
  type CapacityMode,
  type OemCoverageLine,
} from "./coverage";
import { getSettings } from "./settings";

export interface RequirementListItem {
  id: string;
  refNo: string;
  title: string | null;
  status: string;
  customer: string;
  projectName: string | null;
  source: string;
  submissionDeadline: string | null;
  requiredDeliveryDate: string | null;
  enquiryDate: string | null;
  itemCount: number;
  totalQuantity: number;
  quoteCount: number;
  createdAt: Date;
}

export async function listRequirements(
  db: DB,
  filters: { status?: string; customerId?: string; source?: string; q?: string } = {},
): Promise<RequirementListItem[]> {
  const conds = [];
  if (filters.status) conds.push(eq(requirements.status, filters.status as never));
  if (filters.customerId) conds.push(eq(requirements.customerId, filters.customerId));
  if (filters.source) conds.push(eq(requirements.source, filters.source));
  if (filters.q) {
    const like = `%${filters.q}%`;
    conds.push(
      or(
        ilike(requirements.refNo, like),
        ilike(requirements.title, like),
        ilike(requirements.projectName, like),
        ilike(requirements.gemTenderNo, like),
        ilike(requirements.enquiryNo, like),
        sql`exists (select 1 from requirement_items ri where ri.requirement_id = ${requirements.id} and (ri.part_number ilike ${like} or ri.description ilike ${like}))`,
      ),
    );
  }

  const rows = await db
    .select({
      id: requirements.id,
      refNo: requirements.refNo,
      title: requirements.title,
      status: requirements.status,
      customer: customers.name,
      projectName: requirements.projectName,
      source: requirements.source,
      submissionDeadline: requirements.submissionDeadline,
      requiredDeliveryDate: requirements.requiredDeliveryDate,
      enquiryDate: requirements.enquiryDate,
      createdAt: requirements.createdAt,
      itemCount: sql<number>`(select count(*)::int from requirement_items ri where ri.requirement_id = ${requirements.id})`,
      totalQuantity: sql<number>`coalesce((select sum(ri.quantity) from requirement_items ri where ri.requirement_id = ${requirements.id}), 0)`,
      quoteCount: sql<number>`(select count(*)::int from quotations q where q.requirement_id = ${requirements.id})`,
    })
    .from(requirements)
    .innerJoin(customers, eq(customers.id, requirements.customerId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(requirements.createdAt))
    .limit(300);

  return rows;
}

export interface RequirementItemView {
  id: string;
  lineNo: number;
  partNumber: string | null;
  clientPartNumber: string | null;
  oemPartNumber: string | null;
  description: string;
  quantity: number;
  uom: string;
  requiredDeliveryDate: string | null;
  technicalSpecs: string | null;
  targetPrice: number | null;
  firmCommitted: number;
  indicated: number;
  firmElsewhere: number;
  coverage: ReturnType<typeof computeCoverage>;
  byOem: OemCoverageLine[];
}

export interface OemResponseView {
  id: string;
  oemId: string;
  oemName: string;
  requirementItemId: string;
  itemDescription: string;
  responseType: ResponseType;
  quantity: number;
  unitPrice: number | null;
  leadTimeDays: number | null;
  validUntil: string | null;
  remarks: string | null;
  respondedAt: Date;
}

export interface RequirementDetail {
  requirement: {
    id: string;
    refNo: string;
    title: string | null;
    status: string;
    customerId: string;
    customer: string;
    projectName: string | null;
    source: string;
    bidType: string | null;
    submissionType: string | null;
    gemTenderNo: string | null;
    enquiryNo: string | null;
    enquiryDate: string | null;
    submissionDeadline: string | null;
    requiredDeliveryDate: string | null;
    quotationValidity: string | null;
    staggeredDelivery: boolean;
    moqNotes: string | null;
    approvalRequirements: string | null;
    assignedUserId: string | null;
    assignedUserName: string | null;
    lossReason: string | null;
    lossNotes: string | null;
    competitorDetails: string | null;
    regretLetterDate: string | null;
    remarks: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  items: RequirementItemView[];
  rollup: ReturnType<typeof requirementCoverageRollup>;
  oemRequests: Array<{
    id: string;
    oemId: string;
    oemName: string;
    requestType: string;
    status: string;
    channel: string | null;
    notes: string | null;
    requestedAt: Date;
  }>;
  responses: OemResponseView[];
  quotes: Array<{
    id: string;
    quoteNo: string;
    version: number;
    status: string;
    total: number;
    marginPercent: number | null;
    createdAt: Date;
    approvedAt: Date | null;
  }>;
  timeline: Array<{
    id: string;
    eventType: string;
    summary: string;
    actor: string | null;
    happenedAt: Date;
  }>;
  documents: Array<{
    id: string;
    title: string;
    docType: string;
    source: string;
    issueDate: string | null;
    expiryDate: string | null;
    fileRef: string | null;
  }>;
  capacityMode: CapacityMode;
}

export async function getRequirementDetail(db: DB, id: string): Promise<RequirementDetail | null> {
  const settings = await getSettings(db);
  const capacityMode = (settings.oem_capacity_mode as CapacityMode) ?? "per_order";

  const reqRows = await db
    .select({
      r: requirements,
      customer: customers.name,
      assignedUserName: users.name,
    })
    .from(requirements)
    .innerJoin(customers, eq(customers.id, requirements.customerId))
    .leftJoin(users, eq(users.id, requirements.assignedUserId))
    .where(eq(requirements.id, id))
    .limit(1);

  const row = reqRows[0];
  if (!row) return null;
  const r = row.r;

  const [itemRows, requestRows, responseRows, quoteRows, timelineRows, docRows] = await Promise.all([
    db.select().from(requirementItems).where(eq(requirementItems.requirementId, id)).orderBy(asc(requirementItems.lineNo)),
    db
      .select({
        id: oemRequests.id,
        oemId: oemRequests.oemId,
        oemName: oems.name,
        requestType: oemRequests.requestType,
        status: oemRequests.status,
        channel: oemRequests.channel,
        notes: oemRequests.notes,
        requestedAt: oemRequests.requestedAt,
      })
      .from(oemRequests)
      .innerJoin(oems, eq(oems.id, oemRequests.oemId))
      .where(eq(oemRequests.requirementId, id))
      .orderBy(desc(oemRequests.requestedAt)),
    db
      .select({
        id: oemResponses.id,
        oemRequestId: oemResponses.oemRequestId,
        oemId: oemRequests.oemId,
        oemName: oems.name,
        requirementItemId: oemResponses.requirementItemId,
        itemDescription: requirementItems.description,
        responseType: oemResponses.responseType,
        quantity: oemResponses.quantity,
        unitPrice: oemResponses.unitPrice,
        leadTimeDays: oemResponses.leadTimeDays,
        validUntil: oemResponses.validUntil,
        remarks: oemResponses.remarks,
        respondedAt: oemResponses.respondedAt,
      })
      .from(oemResponses)
      .innerJoin(oemRequests, eq(oemRequests.id, oemResponses.oemRequestId))
      .innerJoin(oems, eq(oems.id, oemRequests.oemId))
      .innerJoin(requirementItems, eq(requirementItems.id, oemResponses.requirementItemId))
      .where(eq(oemRequests.requirementId, id))
      .orderBy(desc(oemResponses.respondedAt)),
    db
      .select({
        id: quotations.id,
        quoteNo: quotations.quoteNo,
        version: quotations.version,
        status: quotations.status,
        total: quotations.total,
        marginPercent: quotations.marginPercent,
        createdAt: quotations.createdAt,
        approvedAt: quotations.approvedAt,
      })
      .from(quotations)
      .where(eq(quotations.requirementId, id))
      .orderBy(desc(quotations.version)),
    db
      .select({
        id: timelineEvents.id,
        eventType: timelineEvents.eventType,
        summary: timelineEvents.summary,
        actor: users.name,
        happenedAt: timelineEvents.happenedAt,
      })
      .from(timelineEvents)
      .leftJoin(users, eq(users.id, timelineEvents.actorUserId))
      .where(eq(timelineEvents.requirementId, id))
      .orderBy(desc(timelineEvents.happenedAt)),
    db
      .select({
        id: documents.id,
        title: documents.title,
        docType: documents.docType,
        source: documents.source,
        issueDate: documents.issueDate,
        expiryDate: documents.expiryDate,
        fileRef: documents.fileRef,
      })
      .from(documents)
      .where(eq(documents.linkedRequirementId, id))
      .orderBy(desc(documents.createdAt)),
  ]);

  // Firm commitments held on the same part number elsewhere (global capacity view).
  const partNumbers = itemRows.map((i) => i.partNumber).filter((p): p is string => !!p);
  const elsewhere = new Map<string, number>();
  const elsewhereByOem = new Map<string, number>();
  if (partNumbers.length > 0) {
    const otherFirm = await db
      .select({
        oemId: oemRequests.oemId,
        partNumber: requirementItems.partNumber,
        quantity: oemResponses.quantity,
      })
      .from(oemResponses)
      .innerJoin(oemRequests, eq(oemRequests.id, oemResponses.oemRequestId))
      .innerJoin(requirementItems, eq(requirementItems.id, oemResponses.requirementItemId))
      .innerJoin(requirements, eq(requirements.id, requirementItems.requirementId))
      .where(
        and(
          eq(oemResponses.responseType, "firm_commitment"),
          ne(requirementItems.requirementId, id),
          inArray(requirementItems.partNumber, partNumbers),
          sql`${requirements.status} not in ('lost','cancelled')`,
        ),
      );
    for (const f of otherFirm) {
      if (!f.partNumber) continue;
      elsewhere.set(f.partNumber, (elsewhere.get(f.partNumber) ?? 0) + f.quantity);
      const k = `${f.oemId}::${f.partNumber}`;
      elsewhereByOem.set(k, (elsewhereByOem.get(k) ?? 0) + f.quantity);
    }
  }

  const declarations = await db
    .select({
      oemId: oemCapacityDeclarations.oemId,
      partNumber: oemCapacityDeclarations.partNumber,
      declaredCapacity: oemCapacityDeclarations.declaredCapacity,
    })
    .from(oemCapacityDeclarations);
  const declByOemPart = new Map<string, number>();
  for (const d of declarations) declByOemPart.set(`${d.oemId}::${d.partNumber}`, d.declaredCapacity);

  const items: RequirementItemView[] = itemRows.map((item) => {
    const itemResponses = responseRows.filter((rsp) => rsp.requirementItemId === item.id);
    const firmCommitted = sum(itemResponses.filter((x) => x.responseType === "firm_commitment").map((x) => x.quantity));
    const indicated = sum(
      itemResponses.filter((x) => x.responseType !== "firm_commitment").map((x) => x.quantity),
    );

    const byOemMap = new Map<string, OemCoverageLine>();
    for (const rsp of itemResponses) {
      const entry = byOemMap.get(rsp.oemId) ?? {
        oemId: rsp.oemId,
        oemName: rsp.oemName,
        firmQuantity: 0,
        indicatedQuantity: 0,
      };
      if (rsp.responseType === "firm_commitment") entry.firmQuantity += rsp.quantity;
      else entry.indicatedQuantity += rsp.quantity;
      byOemMap.set(rsp.oemId, entry);
    }
    const byOem = [...byOemMap.values()];

    for (const entry of byOem) {
      if (!item.partNumber) continue;
      const key = `${entry.oemId}::${item.partNumber}`;
      const declared = declByOemPart.get(key) ?? null;
      entry.declaredCapacity = declared;
      entry.availableGlobal = declared === null ? null : Math.max(declared - (elsewhereByOem.get(key) ?? 0), 0);
    }

    const firmElsewhere = item.partNumber ? (elsewhere.get(item.partNumber) ?? 0) : 0;
    const declaredCapacity =
      byOem.length === 1 && item.partNumber
        ? (declByOemPart.get(`${byOem[0].oemId}::${item.partNumber}`) ?? null)
        : null;

    const coverage = computeCoverage(
      {
        required: item.quantity,
        firmCommittedHere: firmCommitted,
        indicatedHere: indicated,
        firmCommittedElsewhere: firmElsewhere,
        declaredCapacity,
      },
      capacityMode,
    );

    return {
      id: item.id,
      lineNo: item.lineNo,
      partNumber: item.partNumber,
      clientPartNumber: item.clientPartNumber,
      oemPartNumber: item.oemPartNumber,
      description: item.description,
      quantity: item.quantity,
      uom: item.uom,
      requiredDeliveryDate: item.requiredDeliveryDate,
      technicalSpecs: item.technicalSpecs,
      targetPrice: item.targetPrice,
      firmCommitted,
      indicated,
      firmElsewhere,
      coverage,
      byOem,
    };
  });

  return {
    requirement: {
      id: r.id,
      refNo: r.refNo,
      title: r.title,
      status: r.status,
      customerId: r.customerId,
      customer: row.customer,
      projectName: r.projectName,
      source: r.source,
      bidType: r.bidType,
      submissionType: r.submissionType,
      gemTenderNo: r.gemTenderNo,
      enquiryNo: r.enquiryNo,
      enquiryDate: r.enquiryDate,
      submissionDeadline: r.submissionDeadline,
      requiredDeliveryDate: r.requiredDeliveryDate,
      quotationValidity: r.quotationValidity,
      staggeredDelivery: r.staggeredDelivery,
      moqNotes: r.moqNotes,
      approvalRequirements: r.approvalRequirements,
      assignedUserId: r.assignedUserId,
      assignedUserName: row.assignedUserName,
      lossReason: r.lossReason,
      lossNotes: r.lossNotes,
      competitorDetails: r.competitorDetails,
      regretLetterDate: r.regretLetterDate,
      remarks: r.remarks,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    },
    items,
    rollup: requirementCoverageRollup(items.map((i) => i.coverage)),
    oemRequests: requestRows,
    responses: responseRows,
    quotes: quoteRows,
    timeline: timelineRows,
    documents: docRows,
    capacityMode,
  };
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export interface ComparableBidRow {
  quotationId: string;
  quoteNo: string;
  requirementRef: string;
  customerName: string;
  partNumber: string | null;
  quantity: number;
  unitPrice: number;
  outcome: "won" | "lost" | "submitted" | "unknown";
  requirementStatus: string;
  quotedAt: string | null;
  oemName: string | null;
  dataTrust: string | null;
}

/** Past bids for the same part number(s), used before pricing a new quote. */
export async function getComparableBids(
  db: DB,
  opts: { partNumbers: string[]; excludeRequirementId?: string; limit?: number },
): Promise<ComparableBidRow[]> {
  const parts = opts.partNumbers.filter(Boolean);
  if (parts.length === 0) return [];

  const conds = [inArray(quotationItems.partNumber, parts)];
  if (opts.excludeRequirementId) conds.push(ne(quotations.requirementId, opts.excludeRequirementId));

  const rows = await db
    .select({
      quotationId: quotations.id,
      quoteNo: quotations.quoteNo,
      requirementRef: requirements.refNo,
      requirementStatus: requirements.status,
      customerName: customers.name,
      partNumber: quotationItems.partNumber,
      quantity: quotationItems.quantity,
      unitPrice: quotationItems.unitPrice,
      quotedAt: quotations.submittedAt,
      oemName: oems.name,
      dataTrust: quotations.dataTrust,
    })
    .from(quotationItems)
    .innerJoin(quotations, eq(quotations.id, quotationItems.quotationId))
    .innerJoin(requirements, eq(requirements.id, quotations.requirementId))
    .innerJoin(customers, eq(customers.id, quotations.customerId))
    .leftJoin(oems, eq(oems.id, quotations.primaryOemId))
    .where(and(...conds))
    .orderBy(desc(quotations.submittedAt))
    .limit(opts.limit ?? 50);

  return rows.map((r) => ({
    quotationId: r.quotationId,
    quoteNo: r.quoteNo,
    requirementRef: r.requirementRef,
    customerName: r.customerName,
    partNumber: r.partNumber,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    requirementStatus: r.requirementStatus,
    outcome:
      r.requirementStatus === "won"
        ? "won"
        : r.requirementStatus === "lost"
          ? "lost"
          : r.requirementStatus === "submitted" || r.requirementStatus === "quoted"
            ? "submitted"
            : "unknown",
    quotedAt: r.quotedAt ? new Date(r.quotedAt).toISOString() : null,
    oemName: r.oemName,
    dataTrust: r.dataTrust ?? null,
  }));
}
