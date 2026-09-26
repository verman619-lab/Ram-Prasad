import { loadEnv } from "./load-env";

async function main() {
  loadEnv();

  const { getDb, closeDb } = await import("./index");
  const { wipe } = await import("./wipe");
  const schema = await import("./schema");
  const { newId } = await import("../lib/ids");
  const { hashPassword } = await import("../lib/password");
  const { todayISO, addDaysISO } = await import("../lib/dates");

  const db = await getDb();
  await wipe(db);

  const today = todayISO();
  const d = (offset: number) => addDaysISO(today, offset);
  const R = (rupees: number) => Math.round(rupees * 100);

  /* ---------------------------------------------------------------- */
  /* Users                                                            */
  /* ---------------------------------------------------------------- */
  const passwordHash = await hashPassword("inverbrass");
  const ramId = newId();
  const salesId = newId();
  const opsId = newId();
  const financeId = newId();
  const mgmtId = newId();

  await db.insert(schema.users).values([
    { id: ramId, email: "ram@inverbrass.example", name: "Ram Prasad", role: "owner", passwordHash },
    { id: mgmtId, email: "management@inverbrass.example", name: "S. Menon", role: "management", passwordHash },
    { id: salesId, email: "sales@inverbrass.example", name: "Anita Rao", role: "sales", passwordHash },
    { id: opsId, email: "ops@inverbrass.example", name: "Vikram Shetty", role: "operations", passwordHash },
    { id: financeId, email: "finance@inverbrass.example", name: "Meera Iyer", role: "finance", passwordHash },
  ]);

  /* ---------------------------------------------------------------- */
  /* Settings & taxonomy                                              */
  /* ---------------------------------------------------------------- */
  await db.insert(schema.appSettings).values([
    { key: "company_name", value: "Inverbrass" },
    { key: "oem_capacity_mode", value: "per_order" },
    { key: "margin_floor_percent", value: "8" },
    { key: "quote_uncovered_override_required", value: "true" },
    { key: "commission_milestone", value: "oem_paid" },
    { key: "followup_no_response_days", value: "7" },
    { key: "document_expiry_warning_days", value: "90" },
  ]);

  const lossReasons: Array<[string, string]> = [
    ["price", "Price"],
    ["technical_non_compliance", "Technical non-compliance"],
    ["delivery_timeline", "Delivery timeline"],
    ["competitor_preference", "Competitor preference"],
    ["quantity_capacity", "Quantity / capacity"],
    ["cancelled", "Cancelled"],
    ["not_pursued", "Not pursued"],
    ["other", "Other"],
  ];
  await db.insert(schema.taxonomies).values(
    lossReasons.map(([code, label], i) => ({
      id: newId(),
      kind: "loss_reason",
      code,
      label,
      sort: i + 1,
      active: true,
    })),
  );

  /* ---------------------------------------------------------------- */
  /* Customers                                                        */
  /* ---------------------------------------------------------------- */
  const hal = newId();
  const bel = newId();
  const beml = newId();
  const drdo = newId();
  const bdll = newId();
  await db.insert(schema.customers).values([
    { id: hal, name: "HAL", division: "Aircraft", location: "Bangalore", gstNo: "29AAACH1234A1Z5", paymentTerms: "30 days", createdBy: ramId, updatedBy: ramId },
    { id: bel, name: "BEL", division: "Radar", location: "Bangalore", gstNo: "29AAACB5678B1Z2", paymentTerms: "45 days", createdBy: ramId, updatedBy: ramId },
    { id: beml, name: "BEML", division: "Heavy Engineering", location: "Delhi", paymentTerms: "30 days", createdBy: ramId, updatedBy: ramId },
    { id: drdo, name: "DRDO", division: "Missiles", location: "Hyderabad", paymentTerms: "60 days", createdBy: ramId, updatedBy: ramId },
    { id: bdll, name: "BDLL", division: "Spares", location: "Bhopal", paymentTerms: "30 days", createdBy: ramId, updatedBy: ramId },
  ]);

  /* ---------------------------------------------------------------- */
  /* OEMs                                                             */
  /* ---------------------------------------------------------------- */
  const precision = newId();
  const bharat = newId();
  const metro = newId();
  const northline = newId();
  await db.insert(schema.oems).values([
    {
      id: precision,
      name: "Precision Aero Pvt Ltd",
      location: "Bangalore",
      countryOfOrigin: "India",
      spoc: "R. Kumar",
      phone: "+91 98800 11111",
      email: "sales@precisionaero.example",
      gstNo: "29AABCP1111P1Z1",
      vendorCode: "OEM-001",
      productPortfolio: "Masts, shelters, lifting jacks",
      brandCategory: "Aerostructures",
      leadTimeDays: 45,
      paymentTerms: "30 days",
      commissionPercent: 2.5,
      approved: true,
      approvalNotes: "RCMA approved for mast assemblies",
      createdBy: ramId,
      updatedBy: ramId,
    },
    {
      id: bharat,
      name: "Bharat Fabricators",
      location: "Hyderabad",
      countryOfOrigin: "India",
      spoc: "P. Reddy",
      email: "contact@bharatfab.example",
      gstNo: "36AABCB2222B1Z9",
      vendorCode: "OEM-002",
      productPortfolio: "Power panels, electricals, MCBs",
      brandCategory: "Electricals",
      leadTimeDays: 60,
      paymentTerms: "45 days",
      commissionPercent: 3,
      approved: true,
      createdBy: ramId,
      updatedBy: ramId,
    },
    {
      id: metro,
      name: "Metro Components",
      location: "Mumbai",
      countryOfOrigin: "India",
      spoc: "A. Shah",
      email: "info@metrocomp.example",
      productPortfolio: "Standard fasteners, spares",
      leadTimeDays: 30,
      commissionPercent: 2,
      approved: false,
      approvalNotes: "Awaiting DGQA visit",
      createdBy: ramId,
      updatedBy: ramId,
    },
    {
      id: northline,
      name: "Northline Systems",
      location: "Delhi",
      countryOfOrigin: "India",
      spoc: "K. Singh",
      productPortfolio: "Winch cranes, hydraulic systems",
      brandCategory: "Hydraulics",
      leadTimeDays: 90,
      commissionPercent: 2.5,
      approved: true,
      createdBy: ramId,
      updatedBy: ramId,
    },
  ]);

  await db.insert(schema.oemContacts).values([
    { id: newId(), oemId: precision, name: "R. Kumar", role: "Sales Head", phone: "+91 98800 11111", email: "sales@precisionaero.example", isPrimary: true },
    { id: newId(), oemId: bharat, name: "P. Reddy", role: "Director", phone: "+91 99000 22222", email: "contact@bharatfab.example", isPrimary: true },
    { id: newId(), oemId: northline, name: "K. Singh", role: "GM", email: "k.singh@northline.example", isPrimary: true },
  ]);

  await db.insert(schema.oemCapabilities).values([
    { id: newId(), oemId: precision, productCategory: "Masts", description: "Telescopic EM masts up to 18 m", partNumberPattern: "1140%" },
    { id: newId(), oemId: precision, productCategory: "Lifting", description: "Shelter lifting jack systems", partNumberPattern: "384%" },
    { id: newId(), oemId: bharat, productCategory: "Electricals", description: "Power panels and distribution", partNumberPattern: "476%" },
    { id: newId(), oemId: bharat, productCategory: "Switchgear", description: "MCBs and protection", partNumberPattern: "456%" },
    { id: newId(), oemId: northline, productCategory: "Cranes", description: "ISO mounted winch cranes", partNumberPattern: "3842%" },
  ]);

  await db.insert(schema.complianceCertificates).values([
    {
      id: newId(),
      oemId: precision,
      authority: "RCMA",
      certificateNo: "RCMA/2024/0187",
      certDate: "2024-05-10",
      validTill: d(400),
      itemsApproved: "Mast assemblies",
      productCode: "1140 043 042 82",
      applyForRenewalDate: d(320),
      status: "valid",
      createdBy: ramId,
      updatedBy: ramId,
    },
    {
      id: newId(),
      oemId: bharat,
      authority: "CEMILAC",
      certificateNo: "CEM/2023/0451",
      certDate: "2023-06-01",
      validTill: d(20),
      itemsApproved: "Power panels",
      productCode: "4769 247 702 73",
      applyForRenewalDate: d(-10),
      status: "expiring",
      createdBy: ramId,
      updatedBy: ramId,
    },
    {
      id: newId(),
      oemId: northline,
      authority: "LCSO",
      certificateNo: "LCSO/2022/0092",
      certDate: "2022-04-15",
      validTill: d(-40),
      itemsApproved: "Winch cranes",
      status: "expired",
      createdBy: ramId,
      updatedBy: ramId,
    },
  ]);

  /* ---------------------------------------------------------------- */
  /* Requirement 1 — HAL LCA, submitted                               */
  /* ---------------------------------------------------------------- */
  const r1 = newId();
  const r1Item1 = newId();
  const r1Item2 = newId();
  await db.insert(schema.requirements).values({
    id: r1,
    refNo: "RFI-26-27-0001",
    title: "LCA ground support — masts and lifting jacks",
    customerId: hal,
    projectName: "LCA",
    source: "srm",
    bidType: "single",
    submissionType: "soft",
    enquiryNo: "H-01",
    enquiryDate: d(-22),
    submissionDeadline: d(-3),
    requiredDeliveryDate: d(70),
    quotationValidity: "90 days",
    approvalRequirements: "RCMA, CEMILAC",
    assignedUserId: salesId,
    status: "submitted",
    remarks: "Discussed with RCMA on 12th; no discount beyond 2nd rate.",
    createdBy: salesId,
    updatedBy: salesId,
  });
  await db.insert(schema.requirementItems).values([
    { id: r1Item1, requirementId: r1, lineNo: 1, partNumber: "1140 043 042 82", description: "EM Mast", quantity: 26, uom: "Nos", requiredDeliveryDate: d(70), technicalSpecs: "18 m telescopic, RCMA approved" },
    { id: r1Item2, requirementId: r1, lineNo: 2, partNumber: "3843 166 601 28", description: "Shelter Lifting Jack", quantity: 1, uom: "Nos", requiredDeliveryDate: d(70) },
  ]);

  const r1Req1 = newId();
  const r1Req2 = newId();
  await db.insert(schema.oemRequests).values([
    { id: r1Req1, requirementId: r1, oemId: precision, requestType: "rfq", requestedBy: salesId, status: "responded", channel: "email", requestedAt: new Date(Date.now() - 20 * 86400000) },
    { id: r1Req2, requirementId: r1, oemId: bharat, requestType: "availability", requestedBy: salesId, status: "responded", channel: "phone", requestedAt: new Date(Date.now() - 18 * 86400000) },
  ]);
  await db.insert(schema.oemResponses).values([
    { id: newId(), oemRequestId: r1Req1, requirementItemId: r1Item1, responseType: "firm_commitment", quantity: 26, unitPrice: R(846000), leadTimeDays: 45, validUntil: d(30), remarks: "Confirmed against existing stock", createdBy: salesId },
    { id: newId(), oemRequestId: r1Req1, requirementItemId: r1Item2, responseType: "firm_commitment", quantity: 1, unitPrice: R(2035000), leadTimeDays: 60, validUntil: d(30), createdBy: salesId },
    { id: newId(), oemRequestId: r1Req2, requirementItemId: r1Item1, responseType: "availability", quantity: 10, unitPrice: R(852000), leadTimeDays: 70, remarks: "One month earlier if PO released", createdBy: salesId },
  ]);

  const q1v1 = newId();
  const q1v2 = newId();
  await db.insert(schema.quotations).values([
    {
      id: q1v1,
      quoteNo: "QTN-26-27-0001",
      requirementId: r1,
      customerId: hal,
      primaryOemId: precision,
      version: 1,
      status: "superseded",
      deliveryTerms: "Ex-works Bangalore",
      paymentTerms: "30 days",
      validityDate: d(60),
      subtotal: R(24036200),
      total: R(24036200),
      marginPercent: 8.4,
      targetMarginPercent: 10,
      recommendedPrice: R(26700000),
      technicalCompliance: true,
      commercialCompliance: true,
      submittedAt: new Date(Date.now() - 12 * 86400000),
      approvedBy: ramId,
      approvedAt: new Date(Date.now() - 13 * 86400000),
      createdBy: salesId,
      updatedBy: salesId,
    },
    {
      id: q1v2,
      quoteNo: "QTN-26-27-0002",
      requirementId: r1,
      customerId: hal,
      primaryOemId: precision,
      version: 2,
      parentQuoteId: q1v1,
      status: "submitted",
      deliveryTerms: "Ex-works Bangalore",
      paymentTerms: "30 days",
      validityDate: d(60),
      subtotal: R(23800000),
      discount: R(120000),
      total: R(23680000),
      marginPercent: 7.2,
      targetMarginPercent: 10,
      pncStatus: "PNC completed",
      technicalCompliance: true,
      commercialCompliance: true,
      submittedAt: new Date(Date.now() - 4 * 86400000),
      approvedBy: mgmtId,
      approvedAt: new Date(Date.now() - 5 * 86400000),
      createdBy: salesId,
      updatedBy: salesId,
    },
  ]);
  await db.insert(schema.quotationItems).values([
    { id: newId(), quotationId: q1v1, requirementItemId: r1Item1, lineNo: 1, partNumber: "1140 043 042 82", description: "EM Mast", quantity: 26, oemUnitPrice: R(846000), firstRate: R(920000), secondRate: R(910000), unitPrice: R(900000), lineTotal: R(23400000), leadTimeDays: 45, marginPercent: 6, },
    { id: newId(), quotationId: q1v1, requirementItemId: r1Item2, lineNo: 2, partNumber: "3843 166 601 28", description: "Shelter Lifting Jack", quantity: 1, oemUnitPrice: R(2035000), firstRate: R(2100000), secondRate: R(2080000), unitPrice: R(2060000), lineTotal: R(2060000), marginPercent: 1.2 },
    { id: newId(), quotationId: q1v2, requirementItemId: r1Item1, lineNo: 1, partNumber: "1140 043 042 82", description: "EM Mast", quantity: 26, oemUnitPrice: R(846000), firstRate: R(920000), secondRate: R(910000), unitPrice: R(880000), lineTotal: R(22880000), leadTimeDays: 45, marginPercent: 3.9 },
    { id: newId(), quotationId: q1v2, requirementItemId: r1Item2, lineNo: 2, partNumber: "3843 166 601 28", description: "Shelter Lifting Jack", quantity: 1, oemUnitPrice: R(2035000), firstRate: R(2100000), secondRate: R(2080000), unitPrice: R(2040000), lineTotal: R(2040000), marginPercent: 0.2 },
  ]);

  /* ---------------------------------------------------------------- */
  /* Requirement 2 — BEL Radar power panels, WON → order              */
  /* ---------------------------------------------------------------- */
  const r2 = newId();
  const r2Item = newId();
  await db.insert(schema.requirements).values({
    id: r2,
    refNo: "RFI-26-27-0002",
    title: "Power panel supply for radar shelters",
    customerId: bel,
    projectName: "Radar",
    source: "srm",
    bidType: "double",
    enquiryNo: "B-01",
    enquiryDate: d(-60),
    submissionDeadline: d(-45),
    requiredDeliveryDate: d(25),
    approvalRequirements: "CEMILAC",
    assignedUserId: salesId,
    status: "won",
    createdBy: salesId,
    updatedBy: salesId,
  });
  await db.insert(schema.requirementItems).values([
    { id: r2Item, requirementId: r2, lineNo: 1, partNumber: "4769 247 702 73", description: "Power Panel", quantity: 1000, uom: "Nos", requiredDeliveryDate: d(25) },
  ]);

  const r2Request = newId();
  await db.insert(schema.oemRequests).values([
    { id: r2Request, requirementId: r2, oemId: bharat, requestType: "rfq", requestedBy: salesId, status: "responded", channel: "email", requestedAt: new Date(Date.now() - 55 * 86400000) },
  ]);
  // Two OEMs cover 1,000 exactly: 600 + 400.
  const r2Request2 = newId();
  await db.insert(schema.oemRequests).values([
    { id: r2Request2, requirementId: r2, oemId: precision, requestType: "availability", requestedBy: salesId, status: "responded", channel: "email", requestedAt: new Date(Date.now() - 54 * 86400000) },
  ]);
  await db.insert(schema.oemResponses).values([
    { id: newId(), oemRequestId: r2Request, requirementItemId: r2Item, responseType: "firm_commitment", quantity: 600, unitPrice: R(6500), leadTimeDays: 30, validUntil: d(10), createdBy: salesId },
    { id: newId(), oemRequestId: r2Request2, requirementItemId: r2Item, responseType: "firm_commitment", quantity: 400, unitPrice: R(6620), leadTimeDays: 35, validUntil: d(10), createdBy: salesId },
    { id: newId(), oemRequestId: r2Request, requirementItemId: r2Item, responseType: "availability", quantity: 500, unitPrice: R(6400), remarks: "Additional capacity in Q3", createdBy: salesId },
  ]);

  const q2 = newId();
  await db.insert(schema.quotations).values({
    id: q2,
    quoteNo: "QTN-26-27-0003",
    requirementId: r2,
    customerId: bel,
    primaryOemId: bharat,
    version: 2,
    status: "approved",
    deliveryTerms: "FOR Bangalore",
    paymentTerms: "45 days",
    validityDate: d(20),
    subtotal: R(7200000),
    total: R(7200000),
    marginPercent: 9.6,
    targetMarginPercent: 9,
    recommendedPrice: R(7200000),
    pncStatus: "PNC completed",
    technicalCompliance: true,
    commercialCompliance: true,
    submittedAt: new Date(Date.now() - 40 * 86400000),
    approvedBy: ramId,
    approvedAt: new Date(Date.now() - 20 * 86400000),
    createdBy: salesId,
    updatedBy: salesId,
  });
  const q2Item = newId();
  await db.insert(schema.quotationItems).values([
    { id: q2Item, quotationId: q2, requirementItemId: r2Item, lineNo: 1, partNumber: "4769 247 702 73", description: "Power Panel", quantity: 1000, oemUnitPrice: R(6500), firstRate: R(7600), secondRate: R(7400), unitPrice: R(7200), lineTotal: R(7200000), leadTimeDays: 30, marginPercent: 9.7 },
  ]);
  await db.insert(schema.approvals).values({
    id: newId(),
    entityType: "quotation",
    entityId: q2,
    requestedBy: salesId,
    approverId: ramId,
    status: "approved",
    comments: "Approved at PNC price",
    decidedAt: new Date(Date.now() - 20 * 86400000),
  });

  const order1 = newId();
  await db.insert(schema.orders).values({
    id: order1,
    orderNo: "ORD-26-27-0001",
    poNumber: "7000532062",
    poDate: d(-18),
    quotationId: q2,
    customerId: bel,
    oemId: bharat,
    supplierPoNumber: "PO-SUP-4412",
    supplierPoDate: d(-16),
    poValue: R(7200000),
    taxesNote: "GST 18% extra",
    deliveryDeadline: d(12),
    partialDeliveryAllowed: true,
    pdiRequired: true,
    pdiMode: "physical",
    pdiInspector: "BEL QA / DGQA",
    documentationRequired: "Test certificates, RCMA/approval, packing list",
    warrantyTerms: "12 months",
    paymentTerms: "45 days",
    status: "processing",
    createdBy: ramId,
    updatedBy: opsId,
  });
  const order1Item = newId();
  await db.insert(schema.orderItems).values([
    { id: order1Item, orderId: order1, quotationItemId: q2Item, lineNo: 1, partNumber: "4769 247 702 73", description: "Power Panel", quantity: 1000, unitPrice: R(7200), lineTotal: R(7200000) },
  ]);
  await db.insert(schema.fulfilmentMilestones).values([
    { id: newId(), orderId: order1, orderItemId: order1Item, step: "oem_po_placed", expectedDate: d(-16), actualDate: d(-16), status: "done", ownerUserId: opsId },
    { id: newId(), orderId: order1, orderItemId: order1Item, step: "production_started", expectedDate: d(-12), actualDate: d(-11), status: "done", ownerUserId: opsId },
    { id: newId(), orderId: order1, orderItemId: order1Item, step: "production_done", expectedDate: d(-2), actualDate: d(-1), status: "done", ownerUserId: opsId },
    { id: newId(), orderId: order1, orderItemId: order1Item, step: "pdi_scheduled", expectedDate: d(1), status: "pending", ownerUserId: opsId },
    { id: newId(), orderId: order1, orderItemId: order1Item, step: "pdi_passed", expectedDate: d(4), status: "pending", ownerUserId: opsId },
    { id: newId(), orderId: order1, orderItemId: order1Item, step: "govt_inspection", expectedDate: d(6), status: "pending" },
    { id: newId(), orderId: order1, orderItemId: order1Item, step: "dispatched", expectedDate: d(9), status: "pending" },
    { id: newId(), orderId: order1, orderItemId: order1Item, step: "delivered", expectedDate: d(13), status: "pending" },
    { id: newId(), orderId: order1, orderItemId: order1Item, step: "accepted", expectedDate: d(16), status: "pending" },
  ]);
  await db.insert(schema.pdiRecords).values([
    {
      id: newId(),
      orderId: order1,
      orderItemId: order1Item,
      inspectionType: "physical",
      agency: "DGQA",
      inspector: "Maj. Nair",
      scheduledDate: d(-1),
      quantityOffered: 1000,
      quantityCleared: 900,
      quantityRejected: 100,
      rejectionReason: "Label marking as per drawing not met on 100 nos",
      rePdiRequired: true,
      status: "failed",
      dispatchClearance: "hold",
      remarks: "Rework and re-offer rejected lot",
    },
  ]);

  const invoice1 = newId();
  await db.insert(schema.invoices).values([
    {
      id: invoice1,
      orderId: order1,
      invoiceNo: "INV-26-27-0014",
      invoiceDate: d(-1),
      invoiceKind: "customer",
      partyType: "customer",
      partyId: bel,
      quantity: 900,
      fullOrPartial: "partial",
      balanceQuantity: 100,
      netAmount: R(6480000),
      gstAmount: R(1166400),
      grossAmount: R(7646400),
      paymentDueDate: d(44),
      status: "submitted",
      remarks: "Partial invoice against 900 cleared",
      createdBy: financeId,
      updatedBy: financeId,
    },
  ]);
  await db.insert(schema.payments).values([
    {
      id: newId(),
      invoiceId: invoice1,
      direction: "customer_to_oem",
      customerId: bel,
      oemId: bharat,
      amount: R(4000000),
      paidDate: d(-1),
      mode: "RTGS",
      utr: "UTR8844221199",
      tds: R(76464),
      ld: 0,
      gstOnLd: 0,
      totalDeduction: R(76464),
      balance: R(3569936),
      finalBalance: R(3569936),
      status: "partial",
      followUpStatus: "pending",
      remarks: "Part payment received",
      createdBy: financeId,
    },
  ]);
  await db.insert(schema.commissions).values([
    {
      id: newId(),
      orderId: order1,
      oemId: bharat,
      milestone: "oem_paid",
      commissionPercent: 3,
      baseInvoiceAmount: R(6480000),
      commissionAmount: R(194400),
      gst: R(34992),
      gross: R(229392),
      paymentStatus: "blocked",
      outstanding: 0,
      remarks: "Blocked until OEM payment milestone is met",
      createdBy: financeId,
      updatedBy: financeId,
    },
  ]);

  /* ---------------------------------------------------------------- */
  /* Requirement 3 — BEML shelter, LOST (price)                       */
  /* ---------------------------------------------------------------- */
  const r3 = newId();
  await db.insert(schema.requirements).values({
    id: r3,
    refNo: "RFI-26-27-0003",
    title: "Shelter fabrication",
    customerId: beml,
    projectName: "Shelter",
    source: "direct",
    enquiryDate: d(-40),
    submissionDeadline: d(-30),
    assignedUserId: salesId,
    status: "lost",
    lossReason: "price",
    lossNotes: "Competitor quoted ~12% lower",
    competitorDetails: "Creative Tools & Eqpt",
    createdBy: salesId,
    updatedBy: salesId,
  });
  await db.insert(schema.requirementItems).values([
    { id: newId(), requirementId: r3, lineNo: 1, partNumber: "SHELTER-01", description: "Shelter fabrication", quantity: 10, uom: "Nos", requiredDeliveryDate: d(30) },
  ]);
  await db.insert(schema.quotations).values({
    id: newId(),
    quoteNo: "QTN-26-27-0004",
    requirementId: r3,
    customerId: beml,
    version: 1,
    status: "lost",
    subtotal: R(5300000),
    total: R(5300000),
    marginPercent: 11.2,
    submittedAt: new Date(Date.now() - 32 * 86400000),
    createdBy: salesId,
    updatedBy: salesId,
  });

  /* ---------------------------------------------------------------- */
  /* Requirement 4 — DRDO QRSAM, qualifying, PARTIAL coverage         */
  /* ---------------------------------------------------------------- */
  const r4 = newId();
  const r4Item = newId();
  await db.insert(schema.requirements).values({
    id: r4,
    refNo: "RFI-26-27-0004",
    title: "QRSAM shelter lifting jack system",
    customerId: drdo,
    projectName: "QRSAM",
    source: "client_portal",
    submissionDeadline: d(9),
    requiredDeliveryDate: d(120),
    approvalRequirements: "RCMA, LCSO",
    assignedUserId: salesId,
    status: "qualifying",
    createdBy: salesId,
    updatedBy: salesId,
  });
  await db.insert(schema.requirementItems).values([
    { id: r4Item, requirementId: r4, lineNo: 1, partNumber: "3860 102 260 146", description: "Shelter Lifting Jack System (QRSAM)", quantity: 500, uom: "Nos", requiredDeliveryDate: d(120), technicalSpecs: "RCMA approved, 6 Sqn standard" },
  ]);
  const r4Request = newId();
  await db.insert(schema.oemRequests).values([
    { id: r4Request, requirementId: r4, oemId: precision, requestType: "rfq", requestedBy: salesId, status: "responded", channel: "email", requestedAt: new Date(Date.now() - 6 * 86400000) },
    { id: newId(), requirementId: r4, oemId: northline, requestType: "availability", requestedBy: salesId, status: "pending", channel: "email", requestedAt: new Date(Date.now() - 6 * 86400000) },
    { id: newId(), requirementId: r4, oemId: metro, requestType: "availability", requestedBy: salesId, status: "pending", channel: "phone", requestedAt: new Date(Date.now() - 5 * 86400000) },
  ]);
  await db.insert(schema.oemResponses).values([
    { id: newId(), oemRequestId: r4Request, requirementItemId: r4Item, responseType: "firm_commitment", quantity: 200, unitPrice: R(1644000), leadTimeDays: 75, validUntil: d(25), remarks: "Firm for 200; balance on capacity review", createdBy: salesId },
    { id: newId(), oemRequestId: r4Request, requirementItemId: r4Item, responseType: "quote_indication", quantity: 300, unitPrice: R(1690000), leadTimeDays: 90, remarks: "Indicative only, not committed", createdBy: salesId },
  ]);
  await db.insert(schema.quotations).values({
    id: newId(),
    quoteNo: "QTN-26-27-0005",
    requirementId: r4,
    customerId: drdo,
    primaryOemId: precision,
    version: 1,
    status: "draft",
    targetMarginPercent: 10,
    createdBy: salesId,
    updatedBy: salesId,
  });

  /* ---------------------------------------------------------------- */
  /* Requirement 5 — BDLL spares, received, UNCOVERED                 */
  /* ---------------------------------------------------------------- */
  const r5 = newId();
  await db.insert(schema.requirements).values({
    id: r5,
    refNo: "RFI-26-27-0005",
    title: "Spares enquiry",
    customerId: bdll,
    source: "email",
    submissionDeadline: d(6),
    assignedUserId: salesId,
    status: "received",
    createdBy: salesId,
    updatedBy: salesId,
  });
  await db.insert(schema.requirementItems).values([
    { id: newId(), requirementId: r5, lineNo: 1, partNumber: "SP-9001", description: "Fastener set (standard)", quantity: 120, uom: "Nos", requiredDeliveryDate: d(40) },
  ]);

  /* ---------------------------------------------------------------- */
  /* Imported history sample (untrusted until verified)               */
  /* ---------------------------------------------------------------- */
  const batchId = newId();
  await db.insert(schema.importBatches).values({
    id: batchId,
    sourceFile: "2._Quotation_26_27__26_27.csv",
    sheet: "26-27",
    kind: "quotations",
    rowCount: 2,
    committed: true,
    notes: "imported as untrusted (default)",
    createdBy: ramId,
  });
  const rImp = newId();
  const rImpItem = newId();
  await db.insert(schema.requirements).values({
    id: rImp,
    refNo: "IMP-26-27-0001",
    title: "Imported: power panel history",
    customerId: bel,
    projectName: "Radar",
    source: "direct",
    enquiryNo: "B-LEGACY-14",
    enquiryDate: "2025-11-02",
    status: "lost",
    lossReason: "price",
    lossNotes: "Imported historical row, not verified",
    dataTrust: "untrusted",
    importBatchId: batchId,
    createdBy: ramId,
    updatedBy: ramId,
  });
  await db.insert(schema.requirementItems).values([
    {
      id: rImpItem,
      requirementId: rImp,
      lineNo: 1,
      partNumber: "4769 247 702 73",
      description: "Power Panel (legacy)",
      quantity: 900,
      uom: "Nos",
    },
  ]);
  await db.insert(schema.quotations).values({
    id: newId(),
    quoteNo: "QTN-26-27-9001",
    requirementId: rImp,
    customerId: bel,
    version: 1,
    status: "lost",
    subtotal: R(6120000),
    total: R(6120000),
    marginPercent: 4.4,
    submittedAt: new Date("2025-11-05T00:00:00.000Z"),
    dataTrust: "untrusted",
    importBatchId: batchId,
    createdBy: ramId,
    updatedBy: ramId,
  });

  /* ---------------------------------------------------------------- */
  /* Timeline events                                                  */
  /* ---------------------------------------------------------------- */
  await db.insert(schema.timelineEvents).values([
    { id: newId(), requirementId: r1, eventType: "created", summary: "Requirement RFI-26-27-0001 created with 2 line item(s)", actorUserId: salesId, happenedAt: new Date(Date.now() - 22 * 86400000) },
    { id: newId(), requirementId: r1, eventType: "oem_request", summary: "OEM request sent (rfq) to Precision Aero", actorUserId: salesId, happenedAt: new Date(Date.now() - 20 * 86400000) },
    { id: newId(), requirementId: r1, eventType: "status_change", summary: "Status changed received → quoted", actorUserId: salesId, happenedAt: new Date(Date.now() - 13 * 86400000) },
    { id: newId(), requirementId: r1, eventType: "status_change", summary: "Status changed quoted → submitted", actorUserId: salesId, happenedAt: new Date(Date.now() - 4 * 86400000) },
    { id: newId(), requirementId: r1, eventType: "note", summary: "PNC reduced mast rate to 8.8 L; validity 90 days retained", actorUserId: salesId, happenedAt: new Date(Date.now() - 5 * 86400000) },
    { id: newId(), requirementId: r2, eventType: "order_created", summary: "Order ORD-26-27-0001 created from approved quotation QTN-26-27-0003 v2", actorUserId: ramId, orderId: order1, happenedAt: new Date(Date.now() - 18 * 86400000) },
    { id: newId(), requirementId: r2, eventType: "pdi", summary: "PDI recorded: offered 1000, cleared 900, rejected 100 (hold)", actorUserId: opsId, orderId: order1, happenedAt: new Date(Date.now() - 1 * 86400000) },
    { id: newId(), requirementId: r3, eventType: "status_change", summary: "Status changed submitted → lost", actorUserId: salesId, happenedAt: new Date(Date.now() - 28 * 86400000) },
    { id: newId(), requirementId: r4, eventType: "note", summary: "Precision firm for 200 only; 300 still indicative. Do not commit balance.", actorUserId: salesId, happenedAt: new Date(Date.now() - 5 * 86400000) },
  ]);

  /* ---------------------------------------------------------------- */
  /* Documents                                                        */
  /* ---------------------------------------------------------------- */
  await db.insert(schema.documents).values([
    { id: newId(), docType: "approval_certificate", title: "RCMA approval — Precision Aero", source: "oem_supplied", supplierOemId: precision, issueDate: "2024-05-10", expiryDate: d(400), linkedRequirementId: r1, approvalStatus: "approved", fileRef: "vault/rcma-precision.pdf", createdBy: ramId, updatedBy: ramId },
    { id: newId(), docType: "compliance_certificate", title: "CEMILAC certificate — Bharat Fabricators", source: "oem_supplied", supplierOemId: bharat, issueDate: "2023-06-01", expiryDate: d(20), linkedRequirementId: r2, approvalStatus: "approved", fileRef: "vault/cemilac-bharat.pdf", createdBy: ramId, updatedBy: ramId },
    { id: newId(), docType: "tender_document", title: "DRDO QRSAM tender pack", source: "reused", customerId: drdo, issueDate: d(-6), linkedRequirementId: r4, approvalStatus: "pending", fileRef: "vault/qrsam-tender.zip", createdBy: salesId, updatedBy: salesId },
    { id: newId(), docType: "technical_drawing", title: "EM Mast GA drawing", source: "oem_supplied", supplierOemId: precision, issueDate: d(-19), linkedRequirementId: r1, approvalStatus: "approved", fileRef: "vault/em-mast-ga.pdf", createdBy: salesId, updatedBy: salesId },
    { id: newId(), docType: "test_certificate", title: "Power panel test certificate (partial lot)", source: "oem_supplied", supplierOemId: bharat, issueDate: d(-2), linkedRequirementId: r2, linkedOrderId: order1, approvalStatus: "pending", fileRef: "vault/panel-tc.pdf", createdBy: opsId, updatedBy: opsId },
    { id: newId(), docType: "compliance_certificate", title: "LCSO certificate — Northline Systems", source: "oem_supplied", supplierOemId: northline, issueDate: "2022-04-15", expiryDate: d(-40), approvalStatus: "none", fileRef: "vault/lcso-northline.pdf", createdBy: ramId, updatedBy: ramId },
  ]);

  /* ---------------------------------------------------------------- */
  /* Follow-up tasks                                                  */
  /* ---------------------------------------------------------------- */
  await db.insert(schema.followUpTasks).values([
    { id: newId(), requirementId: r1, type: "no_response", title: "HAL: no response on QTN-26-27-0002 for 4 days — follow up", dueAt: new Date(), assignedUserId: salesId, status: "open", auto: true },
    { id: newId(), requirementId: r4, type: "document_requested", title: "Northline: availability response pending — chase", dueAt: new Date(Date.now() + 86400000), assignedUserId: salesId, status: "open", auto: true },
    { id: newId(), orderId: order1, type: "pdi", title: "Rework 100 rejected panels and re-offer for PDI", dueAt: new Date(Date.now() + 2 * 86400000), assignedUserId: opsId, status: "open", auto: true },
    { id: newId(), orderId: order1, type: "payment", title: "BEL balance payment due on INV-26-27-0014", dueAt: new Date(Date.now() + 44 * 86400000), assignedUserId: financeId, status: "open", auto: true },
  ]);

  /* ---------------------------------------------------------------- */
  /* Audit entries                                                    */
  /* ---------------------------------------------------------------- */
  await db.insert(schema.auditLogs).values([
    { id: newId(), actorUserId: salesId, action: "create", entityType: "requirement", entityId: r1, summary: "Created requirement RFI-26-27-0001" },
    { id: newId(), actorUserId: ramId, action: "approve", entityType: "quotation", entityId: q2, summary: "QTN-26-27-0003 approved" },
    { id: newId(), actorUserId: ramId, action: "create", entityType: "order", entityId: order1, summary: "Created order ORD-26-27-0001 from QTN-26-27-0003" },
    { id: newId(), actorUserId: opsId, action: "create", entityType: "pdi_record", entityId: order1, summary: "PDI recorded (offered 1000 / cleared 900 / rejected 100)" },
    { id: newId(), actorUserId: salesId, action: "status_change", entityType: "requirement", entityId: r3, summary: "RFI-26-27-0003: submitted → lost (price)" },
  ]);

  console.log("Seed complete.");
  console.log("Sign in with: ram@inverbrass.example / inverbrass");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
