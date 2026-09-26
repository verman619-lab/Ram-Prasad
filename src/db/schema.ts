import {
  pgTable,
  text,
  bigint,
  integer,
  boolean,
  doublePrecision,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/* Shared types                                                        */
/* ------------------------------------------------------------------ */

export type Role = "owner" | "management" | "sales" | "operations" | "finance";

export type RequirementStatus =
  | "received"
  | "qualifying"
  | "quoted"
  | "submitted"
  | "won"
  | "lost"
  | "cancelled";

export type LossReason =
  | "price"
  | "technical_non_compliance"
  | "delivery_timeline"
  | "competitor_preference"
  | "quantity_capacity"
  | "cancelled"
  | "not_pursued"
  | "other";

export type ResponseType = "availability" | "quote_indication" | "firm_commitment";

export type QuotationStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "sent"
  | "submitted"
  | "clarification_requested"
  | "technical_clarification"
  | "commercial_negotiation"
  | "awaiting_approval"
  | "won"
  | "lost"
  | "cancelled"
  | "superseded";

export type OrderStatus = "open" | "processing" | "completed" | "cancelled";

export type MilestoneStep =
  | "oem_po_placed"
  | "production_started"
  | "production_done"
  | "pdi_scheduled"
  | "pdi_passed"
  | "govt_inspection"
  | "dispatched"
  | "delivered"
  | "accepted";

export type PdiStatus = "pending" | "passed" | "failed";
export type DispatchClearance = "approved" | "hold";
export type InvoiceKind = "customer" | "oem" | "commission";
export type PaymentDirection =
  | "customer_to_oem"
  | "oem_to_us"
  | "customer_to_us"
  | "other";
export type DocumentSource = "generated" | "reused" | "oem_supplied" | "manual";
export type ApprovalStatus = "pending" | "approved" | "rejected";
/** Imported historical rows carry a trust marker; only trusted rows drive pricing. */
export type DataTrust = "untrusted" | "trusted" | "verified";

/** money = paise (bigint, mode number) */
const money = (name: string) => bigint(name, { mode: "number" });
/** quantity / percent = double precision (3dp is plenty for these units) */
const qty = (name: string) => doublePrecision(name);

const auditCols = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
};

/* ------------------------------------------------------------------ */
/* Identity & access                                                   */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").$type<Role>().notNull(),
  passwordHash: text("password_hash").notNull(),
  active: boolean("active").notNull().default(true),
  ...auditCols,
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export const taxonomies = pgTable(
  "taxonomies",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    sort: integer("sort").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("taxonomies_kind_code_idx").on(t.kind, t.code)],
);

/* ------------------------------------------------------------------ */
/* Module 1 — Requirement / RFI                                        */
/* ------------------------------------------------------------------ */

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  division: text("division"),
  subDivision: text("sub_division"),
  location: text("location"),
  address: text("address"),
  billingAddress: text("billing_address"),
  deliveryAddress: text("delivery_address"),
  spoc: text("spoc"),
  phone: text("phone"),
  email: text("email"),
  gstNo: text("gst_no"),
  gemRegistration: text("gem_registration"),
  vendorRegistrationNo: text("vendor_registration_no"),
  paymentTerms: text("payment_terms"),
  approvalRequirements: text("approval_requirements"),
  portalLoginRef: text("portal_login_ref"),
  notes: text("notes"),
  ...auditCols,
});

export const requirements = pgTable(
  "requirements",
  {
    id: text("id").primaryKey(),
    refNo: text("ref_no").notNull().unique(),
    title: text("title"),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    projectName: text("project_name"),
    source: text("source").notNull().default("direct"),
    bidType: text("bid_type"),
    submissionType: text("submission_type"),
    gemTenderNo: text("gem_tender_no"),
    enquiryNo: text("enquiry_no"),
    enquiryDate: date("enquiry_date"),
    submissionDeadline: date("submission_deadline"),
    requiredDeliveryDate: date("required_delivery_date"),
    quotationValidity: text("quotation_validity"),
    staggeredDelivery: boolean("staggered_delivery").notNull().default(false),
    moqNotes: text("moq_notes"),
    approvalRequirements: text("approval_requirements"),
    assignedUserId: text("assigned_user_id").references(() => users.id),
    status: text("status").$type<RequirementStatus>().notNull().default("received"),
    lossReason: text("loss_reason").$type<LossReason>(),
    lossNotes: text("loss_notes"),
    competitorDetails: text("competitor_details"),
    regretLetterDate: date("regret_letter_date"),
    remarks: text("remarks"),
    dataTrust: text("data_trust").$type<DataTrust>(),
    importBatchId: text("import_batch_id"),
    ...auditCols,
  },
  (t) => [
    index("requirements_customer_idx").on(t.customerId, t.status),
    index("requirements_deadline_idx").on(t.submissionDeadline),
    index("requirements_status_idx").on(t.status),
  ],
);

export const requirementItems = pgTable(
  "requirement_items",
  {
    id: text("id").primaryKey(),
    requirementId: text("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    partNumber: text("part_number"),
    clientPartNumber: text("client_part_number"),
    oemPartNumber: text("oem_part_number"),
    description: text("description").notNull(),
    quantity: qty("quantity").notNull(),
    uom: text("uom").notNull().default("Nos"),
    requiredDeliveryDate: date("required_delivery_date"),
    technicalSpecs: text("technical_specs"),
    targetPrice: money("target_price"),
    remarks: text("remarks"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("requirement_items_line_idx").on(t.requirementId, t.lineNo),
    index("requirement_items_part_idx").on(t.partNumber),
  ],
);

export const timelineEvents = pgTable(
  "timeline_events",
  {
    id: text("id").primaryKey(),
    requirementId: text("requirement_id").references(() => requirements.id, {
      onDelete: "cascade",
    }),
    orderId: text("order_id"),
    eventType: text("event_type").notNull(),
    summary: text("summary").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    actorUserId: text("actor_user_id").references(() => users.id),
    happenedAt: timestamp("happened_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("timeline_requirement_idx").on(t.requirementId, t.happenedAt),
    index("timeline_order_idx").on(t.orderId, t.happenedAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Module 2 — OEM master & sourcing                                    */
/* ------------------------------------------------------------------ */

export const oems = pgTable("oems", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
  address: text("address"),
  countryOfOrigin: text("country_of_origin"),
  spoc: text("spoc"),
  phone: text("phone"),
  email: text("email"),
  gstNo: text("gst_no"),
  vendorCode: text("vendor_code"),
  productPortfolio: text("product_portfolio"),
  brandCategory: text("brand_category"),
  moqRules: text("moq_rules"),
  leadTimeDays: integer("lead_time_days"),
  pricingValidity: text("pricing_validity"),
  freightTerms: text("freight_terms"),
  warrantyTerms: text("warranty_terms"),
  paymentTerms: text("payment_terms"),
  commissionPercent: qty("commission_percent"),
  ndaStatus: text("nda_status"),
  bankDetails: text("bank_details"),
  capacityNote: text("capacity_note"),
  approved: boolean("approved").notNull().default(false),
  approvalNotes: text("approval_notes"),
  notes: text("notes"),
  ...auditCols,
});

export const oemContacts = pgTable("oem_contacts", {
  id: text("id").primaryKey(),
  oemId: text("oem_id")
    .notNull()
    .references(() => oems.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role"),
  phone: text("phone"),
  email: text("email"),
  isPrimary: boolean("is_primary").notNull().default(false),
});

export const oemCapabilities = pgTable("oem_capabilities", {
  id: text("id").primaryKey(),
  oemId: text("oem_id")
    .notNull()
    .references(() => oems.id, { onDelete: "cascade" }),
  productCategory: text("product_category"),
  description: text("description"),
  partNumberPattern: text("part_number_pattern"),
});

export const oemRequests = pgTable(
  "oem_requests",
  {
    id: text("id").primaryKey(),
    requirementId: text("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    oemId: text("oem_id")
      .notNull()
      .references(() => oems.id),
    requestType: text("request_type").notNull().default("rfq"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    requestedBy: text("requested_by").references(() => users.id),
    status: text("status").notNull().default("pending"),
    channel: text("channel"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("oem_requests_req_idx").on(t.requirementId, t.oemId)],
);

export const oemResponses = pgTable(
  "oem_responses",
  {
    id: text("id").primaryKey(),
    oemRequestId: text("oem_request_id")
      .notNull()
      .references(() => oemRequests.id, { onDelete: "cascade" }),
    requirementItemId: text("requirement_item_id")
      .notNull()
      .references(() => requirementItems.id, { onDelete: "cascade" }),
    responseType: text("response_type").$type<ResponseType>().notNull(),
    quantity: qty("quantity").notNull().default(0),
    unitPrice: money("unit_price"),
    currency: text("currency").notNull().default("INR"),
    leadTimeDays: integer("lead_time_days"),
    validUntil: date("valid_until"),
    documentsNote: text("documents_note"),
    remarks: text("remarks"),
    respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").references(() => users.id),
  },
  (t) => [
    index("oem_responses_item_idx").on(t.requirementItemId, t.responseType),
    index("oem_responses_request_idx").on(t.oemRequestId),
    check(
      "oem_responses_type_check",
      sql`${t.responseType} in ('availability','quote_indication','firm_commitment')`,
    ),
  ],
);

export const oemCapacityDeclarations = pgTable("oem_capacity_declarations", {
  id: text("id").primaryKey(),
  oemId: text("oem_id")
    .notNull()
    .references(() => oems.id, { onDelete: "cascade" }),
  partNumber: text("part_number").notNull(),
  declaredCapacity: qty("declared_capacity").notNull(),
  periodNote: text("period_note"),
  declaredAt: timestamp("declared_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").references(() => users.id),
});

export const complianceCertificates = pgTable("compliance_certificates", {
  id: text("id").primaryKey(),
  oemId: text("oem_id").references(() => oems.id, { onDelete: "cascade" }),
  customerId: text("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  authority: text("authority").notNull(),
  certificateNo: text("certificate_no"),
  certDate: date("cert_date"),
  validTill: date("valid_till"),
  extendedTill1: date("extended_till_1"),
  extendedTill2: date("extended_till_2"),
  itemsApproved: text("items_approved"),
  productCode: text("product_code"),
  applyForRenewalDate: date("apply_for_renewal_date"),
  renewalNo: text("renewal_no"),
  renewalDate: date("renewal_date"),
  renewalValidTill: date("renewal_valid_till"),
  status: text("status").notNull().default("valid"),
  documentId: text("document_id"),
  remarks: text("remarks"),
  ...auditCols,
});

/* ------------------------------------------------------------------ */
/* Module 4 — Quotations                                               */
/* ------------------------------------------------------------------ */

export const quotations = pgTable(
  "quotations",
  {
    id: text("id").primaryKey(),
    quoteNo: text("quote_no").notNull().unique(),
    requirementId: text("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    primaryOemId: text("primary_oem_id").references(() => oems.id),
    version: integer("version").notNull().default(1),
    parentQuoteId: text("parent_quote_id"),
    status: text("status").$type<QuotationStatus>().notNull().default("draft"),
    currency: text("currency").notNull().default("INR"),
    freight: money("freight").notNull().default(0),
    taxesNote: text("taxes_note"),
    deliveryTerms: text("delivery_terms"),
    paymentTerms: text("payment_terms"),
    validityDate: date("validity_date"),
    subtotal: money("subtotal").notNull().default(0),
    discount: money("discount").notNull().default(0),
    pncStatus: text("pnc_status"),
    technicalCompliance: boolean("technical_compliance").notNull().default(false),
    commercialCompliance: boolean("commercial_compliance").notNull().default(false),
    targetMarginPercent: qty("target_margin_percent"),
    marginPercent: qty("margin_percent"),
    recommendedPrice: money("recommended_price"),
    total: money("total").notNull().default(0),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    remarks: text("remarks"),
    dataTrust: text("data_trust").$type<DataTrust>(),
    importBatchId: text("import_batch_id"),
    ...auditCols,
  },
  (t) => [
    index("quotations_req_idx").on(t.requirementId, t.version),
    index("quotations_status_idx").on(t.status),
  ],
);

export const quotationItems = pgTable(
  "quotation_items",
  {
    id: text("id").primaryKey(),
    quotationId: text("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    requirementItemId: text("requirement_item_id").references(() => requirementItems.id, {
      onDelete: "set null",
    }),
    lineNo: integer("line_no").notNull(),
    partNumber: text("part_number"),
    description: text("description").notNull(),
    quantity: qty("quantity").notNull(),
    oemUnitPrice: money("oem_unit_price"),
    firstRate: money("first_rate"),
    secondRate: money("second_rate"),
    unitPrice: money("unit_price").notNull().default(0),
    lineTotal: money("line_total").notNull().default(0),
    leadTimeDays: integer("lead_time_days"),
    marginPercent: qty("margin_percent"),
    remarks: text("remarks"),
  },
  (t) => [
    uniqueIndex("quotation_items_line_idx").on(t.quotationId, t.lineNo),
    index("quotation_items_part_idx").on(t.partNumber),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    requestedBy: text("requested_by").references(() => users.id),
    approverId: text("approver_id").references(() => users.id),
    status: text("status").$type<ApprovalStatus>().notNull().default("pending"),
    comments: text("comments"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("approvals_entity_idx").on(t.entityType, t.entityId)],
);

/* ------------------------------------------------------------------ */
/* Module 6 — Orders & POs                                             */
/* ------------------------------------------------------------------ */

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    orderNo: text("order_no").notNull().unique(),
    poNumber: text("po_number"),
    poDate: date("po_date"),
    quotationId: text("quotation_id")
      .notNull()
      .references(() => quotations.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    oemId: text("oem_id").references(() => oems.id),
    supplierPoNumber: text("supplier_po_number"),
    supplierPoDate: date("supplier_po_date"),
    poValue: money("po_value").notNull().default(0),
    currency: text("currency").notNull().default("INR"),
    taxesNote: text("taxes_note"),
    deliveryDeadline: date("delivery_deadline"),
    partialDeliveryAllowed: boolean("partial_delivery_allowed").notNull().default(true),
    pdiRequired: boolean("pdi_required").notNull().default(true),
    pdiMode: text("pdi_mode"),
    pdiInspector: text("pdi_inspector"),
    documentationRequired: text("documentation_required"),
    specialConditions: text("special_conditions"),
    warrantyTerms: text("warranty_terms"),
    paymentTerms: text("payment_terms"),
    status: text("status").$type<OrderStatus>().notNull().default("open"),
    remarks: text("remarks"),
    ...auditCols,
  },
  (t) => [
    index("orders_status_idx").on(t.status, t.deliveryDeadline),
    index("orders_quote_idx").on(t.quotationId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    quotationItemId: text("quotation_item_id").references(() => quotationItems.id, {
      onDelete: "set null",
    }),
    lineNo: integer("line_no").notNull(),
    partNumber: text("part_number"),
    description: text("description").notNull(),
    quantity: qty("quantity").notNull(),
    unitPrice: money("unit_price").notNull().default(0),
    lineTotal: money("line_total").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("order_items_line_idx").on(t.orderId, t.lineNo)],
);

export const orderAmendments = pgTable("order_amendments", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  reason: text("reason"),
  amendedBy: text("amended_by").references(() => users.id),
  amendedAt: timestamp("amended_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Module 7 — Fulfilment, PDI, delivery                                */
/* ------------------------------------------------------------------ */

export const fulfilmentMilestones = pgTable(
  "fulfilment_milestones",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    orderItemId: text("order_item_id").references(() => orderItems.id, { onDelete: "cascade" }),
    step: text("step").$type<MilestoneStep>().notNull(),
    ownerUserId: text("owner_user_id").references(() => users.id),
    expectedDate: date("expected_date"),
    actualDate: date("actual_date"),
    status: text("status").notNull().default("pending"),
    remarks: text("remarks"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("milestones_order_idx").on(t.orderId, t.step)],
);

export const pdiRecords = pgTable(
  "pdi_records",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    orderItemId: text("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    inspectionType: text("inspection_type").notNull().default("physical"),
    agency: text("agency"),
    inspector: text("inspector"),
    scheduledDate: date("scheduled_date"),
    quantityOffered: qty("quantity_offered").notNull().default(0),
    quantityCleared: qty("quantity_cleared").notNull().default(0),
    quantityRejected: qty("quantity_rejected").notNull().default(0),
    rejectionReason: text("rejection_reason"),
    rePdiRequired: boolean("re_pdi_required").notNull().default(false),
    status: text("status").$type<PdiStatus>().notNull().default("pending"),
    dispatchClearance: text("dispatch_clearance").$type<DispatchClearance>().notNull().default("hold"),
    testCertificateDocumentId: text("test_certificate_document_id"),
    remarks: text("remarks"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pdi_order_idx").on(t.orderId, t.status)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    invoiceNo: text("invoice_no").notNull(),
    invoiceDate: date("invoice_date"),
    invoiceKind: text("invoice_kind").$type<InvoiceKind>().notNull().default("customer"),
    partyType: text("party_type").notNull().default("customer"),
    partyId: text("party_id"),
    linkedPdiId: text("linked_pdi_id").references(() => pdiRecords.id, { onDelete: "set null" }),
    quantity: qty("quantity").notNull().default(0),
    fullOrPartial: text("full_or_partial").notNull().default("full"),
    balanceQuantity: qty("balance_quantity").notNull().default(0),
    netAmount: money("net_amount").notNull().default(0),
    gstAmount: money("gst_amount").notNull().default(0),
    grossAmount: money("gross_amount").notNull().default(0),
    dispatchDate: date("dispatch_date"),
    lrAwb: text("lr_awb"),
    courier: text("courier"),
    ewayBill: text("eway_bill"),
    paymentDueDate: date("payment_due_date"),
    status: text("status").notNull().default("raised"),
    documentId: text("document_id"),
    remarks: text("remarks"),
    ...auditCols,
  },
  (t) => [
    index("invoices_order_idx").on(t.orderId),
    index("invoices_due_idx").on(t.paymentDueDate, t.status),
  ],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    deliveryDate: date("delivery_date"),
    location: text("location"),
    quantityDelivered: qty("quantity_delivered").notNull().default(0),
    status: text("status").notNull().default("in_transit"),
    acceptanceStatus: text("acceptance_status").notNull().default("pending"),
    grnNo: text("grn_no"),
    pendingBalanceQty: qty("pending_balance_qty").notNull().default(0),
    podDocumentId: text("pod_document_id"),
    closureStatus: text("closure_status").notNull().default("open"),
    remarks: text("remarks"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("deliveries_order_idx").on(t.orderId, t.status)],
);

/* ------------------------------------------------------------------ */
/* Module 8 — Payments & commission                                    */
/* ------------------------------------------------------------------ */

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    direction: text("direction").$type<PaymentDirection>().notNull(),
    customerId: text("customer_id").references(() => customers.id),
    oemId: text("oem_id").references(() => oems.id),
    amount: money("amount").notNull().default(0),
    paidDate: date("paid_date"),
    mode: text("mode"),
    utr: text("utr"),
    tds: money("tds").notNull().default(0),
    ld: money("ld").notNull().default(0),
    gstOnLd: money("gst_on_ld").notNull().default(0),
    totalDeduction: money("total_deduction").notNull().default(0),
    balance: money("balance").notNull().default(0),
    finalBalance: money("final_balance").notNull().default(0),
    status: text("status").notNull().default("pending"),
    followUpStatus: text("follow_up_status").notNull().default("pending"),
    remarks: text("remarks"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_invoice_idx").on(t.invoiceId)],
);

export const commissions = pgTable(
  "commissions",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    oemId: text("oem_id").references(() => oems.id),
    milestone: text("milestone").notNull().default("oem_paid"),
    milestonePaymentId: text("milestone_payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),
    baseInvoiceId: text("base_invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    commissionPercent: qty("commission_percent").notNull().default(0),
    baseInvoiceAmount: money("base_invoice_amount").notNull().default(0),
    commissionAmount: money("commission_amount").notNull().default(0),
    gst: money("gst").notNull().default(0),
    gross: money("gross").notNull().default(0),
    invoiceNo: text("invoice_no"),
    invoiceDate: date("invoice_date"),
    dueDate: date("due_date"),
    paymentStatus: text("payment_status").notNull().default("blocked"),
    receivedDate: date("received_date"),
    tdsDeducted: boolean("tds_deducted").notNull().default(false),
    outstanding: money("outstanding").notNull().default(0),
    remarks: text("remarks"),
    ...auditCols,
  },
  (t) => [index("commissions_order_idx").on(t.orderId)],
);

/* ------------------------------------------------------------------ */
/* Module 8/9 — Documents, tasks, audit                                */
/* ------------------------------------------------------------------ */

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    docType: text("doc_type").notNull(),
    title: text("title").notNull(),
    source: text("source").$type<DocumentSource>().notNull().default("manual"),
    supplierOemId: text("supplier_oem_id").references(() => oems.id, { onDelete: "set null" }),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    issueDate: date("issue_date"),
    expiryDate: date("expiry_date"),
    linkedProductId: text("linked_product_id"),
    linkedRequirementId: text("linked_requirement_id").references(() => requirements.id, {
      onDelete: "set null",
    }),
    linkedOrderId: text("linked_order_id").references(() => orders.id, { onDelete: "set null" }),
    fileRef: text("file_ref"),
    approvalStatus: text("approval_status").notNull().default("none"),
    version: integer("version").notNull().default(1),
    remarks: text("remarks"),
    ...auditCols,
  },
  (t) => [
    index("documents_expiry_idx").on(t.expiryDate),
    index("documents_requirement_idx").on(t.linkedRequirementId),
  ],
);

export const followUpTasks = pgTable(
  "follow_up_tasks",
  {
    id: text("id").primaryKey(),
    requirementId: text("requirement_id").references(() => requirements.id, { onDelete: "cascade" }),
    orderId: text("order_id").references(() => orders.id, { onDelete: "cascade" }),
    quotationId: text("quotation_id").references(() => quotations.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    assignedUserId: text("assigned_user_id").references(() => users.id),
    status: text("status").notNull().default("open"),
    auto: boolean("auto").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("followups_status_idx").on(t.status, t.dueAt)],
);

export const importBatches = pgTable("import_batches", {
  id: text("id").primaryKey(),
  sourceFile: text("source_file").notNull(),
  sheet: text("sheet"),
  kind: text("kind").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  committed: boolean("committed").notNull().default(false),
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId, t.createdAt)],
);
