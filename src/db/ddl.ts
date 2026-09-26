/**
 * Idempotent DDL applied on first DB init. Kept in lockstep with schema.ts.
 * Uses CREATE TABLE/INDEX IF NOT EXISTS so the same code path provisions a
 * fresh Neon/Supabase database and the local embedded PGlite database alike.
 */
export const DDL = /* sql */ `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS taxonomies (
  id text PRIMARY KEY,
  kind text NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS taxonomies_kind_code_idx ON taxonomies (kind, code);

CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  name text NOT NULL,
  division text,
  sub_division text,
  location text,
  address text,
  billing_address text,
  delivery_address text,
  spoc text,
  phone text,
  email text,
  gst_no text,
  gem_registration text,
  vendor_registration_no text,
  payment_terms text,
  approval_requirements text,
  portal_login_ref text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS requirements (
  id text PRIMARY KEY,
  ref_no text NOT NULL UNIQUE,
  title text,
  customer_id text NOT NULL REFERENCES customers(id),
  project_name text,
  source text NOT NULL DEFAULT 'direct',
  bid_type text,
  submission_type text,
  gem_tender_no text,
  enquiry_no text,
  enquiry_date date,
  submission_deadline date,
  required_delivery_date date,
  quotation_validity text,
  staggered_delivery boolean NOT NULL DEFAULT false,
  moq_notes text,
  approval_requirements text,
  assigned_user_id text REFERENCES users(id),
  status text NOT NULL DEFAULT 'received',
  loss_reason text,
  loss_notes text,
  competitor_details text,
  regret_letter_date date,
  remarks text,
  data_trust text,
  import_batch_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
CREATE INDEX IF NOT EXISTS requirements_customer_idx ON requirements (customer_id, status);
CREATE INDEX IF NOT EXISTS requirements_deadline_idx ON requirements (submission_deadline);
CREATE INDEX IF NOT EXISTS requirements_status_idx ON requirements (status);

CREATE TABLE IF NOT EXISTS requirement_items (
  id text PRIMARY KEY,
  requirement_id text NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  part_number text,
  client_part_number text,
  oem_part_number text,
  description text NOT NULL,
  quantity double precision NOT NULL,
  uom text NOT NULL DEFAULT 'Nos',
  required_delivery_date date,
  technical_specs text,
  target_price bigint,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS requirement_items_line_idx ON requirement_items (requirement_id, line_no);
CREATE INDEX IF NOT EXISTS requirement_items_part_idx ON requirement_items (part_number);

CREATE TABLE IF NOT EXISTS timeline_events (
  id text PRIMARY KEY,
  requirement_id text REFERENCES requirements(id) ON DELETE CASCADE,
  order_id text,
  event_type text NOT NULL,
  summary text NOT NULL,
  detail jsonb,
  actor_user_id text REFERENCES users(id),
  happened_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS timeline_requirement_idx ON timeline_events (requirement_id, happened_at);
CREATE INDEX IF NOT EXISTS timeline_order_idx ON timeline_events (order_id, happened_at);

CREATE TABLE IF NOT EXISTS oems (
  id text PRIMARY KEY,
  name text NOT NULL,
  location text,
  address text,
  country_of_origin text,
  spoc text,
  phone text,
  email text,
  gst_no text,
  vendor_code text,
  product_portfolio text,
  brand_category text,
  moq_rules text,
  lead_time_days integer,
  pricing_validity text,
  freight_terms text,
  warranty_terms text,
  payment_terms text,
  commission_percent double precision,
  nda_status text,
  bank_details text,
  capacity_note text,
  approved boolean NOT NULL DEFAULT false,
  approval_notes text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS oem_contacts (
  id text PRIMARY KEY,
  oem_id text NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  phone text,
  email text,
  is_primary boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS oem_capabilities (
  id text PRIMARY KEY,
  oem_id text NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  product_category text,
  description text,
  part_number_pattern text
);

CREATE TABLE IF NOT EXISTS oem_requests (
  id text PRIMARY KEY,
  requirement_id text NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  oem_id text NOT NULL REFERENCES oems(id),
  request_type text NOT NULL DEFAULT 'rfq',
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending',
  channel text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oem_requests_req_idx ON oem_requests (requirement_id, oem_id);

CREATE TABLE IF NOT EXISTS oem_responses (
  id text PRIMARY KEY,
  oem_request_id text NOT NULL REFERENCES oem_requests(id) ON DELETE CASCADE,
  requirement_item_id text NOT NULL REFERENCES requirement_items(id) ON DELETE CASCADE,
  response_type text NOT NULL,
  quantity double precision NOT NULL DEFAULT 0,
  unit_price bigint,
  currency text NOT NULL DEFAULT 'INR',
  lead_time_days integer,
  valid_until date,
  documents_note text,
  remarks text,
  responded_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES users(id),
  CONSTRAINT oem_responses_type_check CHECK (response_type in ('availability','quote_indication','firm_commitment'))
);
CREATE INDEX IF NOT EXISTS oem_responses_item_idx ON oem_responses (requirement_item_id, response_type);
CREATE INDEX IF NOT EXISTS oem_responses_request_idx ON oem_responses (oem_request_id);

CREATE TABLE IF NOT EXISTS oem_capacity_declarations (
  id text PRIMARY KEY,
  oem_id text NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  part_number text NOT NULL,
  declared_capacity double precision NOT NULL,
  period_note text,
  declared_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS compliance_certificates (
  id text PRIMARY KEY,
  oem_id text REFERENCES oems(id) ON DELETE CASCADE,
  customer_id text REFERENCES customers(id) ON DELETE CASCADE,
  authority text NOT NULL,
  certificate_no text,
  cert_date date,
  valid_till date,
  extended_till_1 date,
  extended_till_2 date,
  items_approved text,
  product_code text,
  apply_for_renewal_date date,
  renewal_no text,
  renewal_date date,
  renewal_valid_till date,
  status text NOT NULL DEFAULT 'valid',
  document_id text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS quotations (
  id text PRIMARY KEY,
  quote_no text NOT NULL UNIQUE,
  requirement_id text NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  customer_id text NOT NULL REFERENCES customers(id),
  primary_oem_id text REFERENCES oems(id),
  version integer NOT NULL DEFAULT 1,
  parent_quote_id text,
  status text NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'INR',
  freight bigint NOT NULL DEFAULT 0,
  taxes_note text,
  delivery_terms text,
  payment_terms text,
  validity_date date,
  subtotal bigint NOT NULL DEFAULT 0,
  discount bigint NOT NULL DEFAULT 0,
  pnc_status text,
  technical_compliance boolean NOT NULL DEFAULT false,
  commercial_compliance boolean NOT NULL DEFAULT false,
  target_margin_percent double precision,
  margin_percent double precision,
  recommended_price bigint,
  total bigint NOT NULL DEFAULT 0,
  submitted_at timestamptz,
  approved_by text REFERENCES users(id),
  approved_at timestamptz,
  remarks text,
  data_trust text,
  import_batch_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
CREATE INDEX IF NOT EXISTS quotations_req_idx ON quotations (requirement_id, version);
CREATE INDEX IF NOT EXISTS quotations_status_idx ON quotations (status);

CREATE TABLE IF NOT EXISTS quotation_items (
  id text PRIMARY KEY,
  quotation_id text NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  requirement_item_id text REFERENCES requirement_items(id) ON DELETE SET NULL,
  line_no integer NOT NULL,
  part_number text,
  description text NOT NULL,
  quantity double precision NOT NULL,
  oem_unit_price bigint,
  first_rate bigint,
  second_rate bigint,
  unit_price bigint NOT NULL DEFAULT 0,
  line_total bigint NOT NULL DEFAULT 0,
  lead_time_days integer,
  margin_percent double precision,
  remarks text
);
CREATE UNIQUE INDEX IF NOT EXISTS quotation_items_line_idx ON quotation_items (quotation_id, line_no);
CREATE INDEX IF NOT EXISTS quotation_items_part_idx ON quotation_items (part_number);

CREATE TABLE IF NOT EXISTS approvals (
  id text PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  requested_by text REFERENCES users(id),
  approver_id text REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending',
  comments text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approvals_entity_idx ON approvals (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  order_no text NOT NULL UNIQUE,
  po_number text,
  po_date date,
  quotation_id text NOT NULL REFERENCES quotations(id),
  customer_id text NOT NULL REFERENCES customers(id),
  oem_id text REFERENCES oems(id),
  supplier_po_number text,
  supplier_po_date date,
  po_value bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  taxes_note text,
  delivery_deadline date,
  partial_delivery_allowed boolean NOT NULL DEFAULT true,
  pdi_required boolean NOT NULL DEFAULT true,
  pdi_mode text,
  pdi_inspector text,
  documentation_required text,
  special_conditions text,
  warranty_terms text,
  payment_terms text,
  status text NOT NULL DEFAULT 'open',
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status, delivery_deadline);
CREATE INDEX IF NOT EXISTS orders_quote_idx ON orders (quotation_id);

CREATE TABLE IF NOT EXISTS order_items (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  quotation_item_id text REFERENCES quotation_items(id) ON DELETE SET NULL,
  line_no integer NOT NULL,
  part_number text,
  description text NOT NULL,
  quantity double precision NOT NULL,
  unit_price bigint NOT NULL DEFAULT 0,
  line_total bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS order_items_line_idx ON order_items (order_id, line_no);

CREATE TABLE IF NOT EXISTS order_amendments (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text,
  new_value text,
  reason text,
  amended_by text REFERENCES users(id),
  amended_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fulfilment_milestones (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id text REFERENCES order_items(id) ON DELETE CASCADE,
  step text NOT NULL,
  owner_user_id text REFERENCES users(id),
  expected_date date,
  actual_date date,
  status text NOT NULL DEFAULT 'pending',
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS milestones_order_idx ON fulfilment_milestones (order_id, step);

CREATE TABLE IF NOT EXISTS pdi_records (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id text REFERENCES order_items(id) ON DELETE SET NULL,
  inspection_type text NOT NULL DEFAULT 'physical',
  agency text,
  inspector text,
  scheduled_date date,
  quantity_offered double precision NOT NULL DEFAULT 0,
  quantity_cleared double precision NOT NULL DEFAULT 0,
  quantity_rejected double precision NOT NULL DEFAULT 0,
  rejection_reason text,
  re_pdi_required boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  dispatch_clearance text NOT NULL DEFAULT 'hold',
  test_certificate_document_id text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pdi_order_idx ON pdi_records (order_id, status);

CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  invoice_no text NOT NULL,
  invoice_date date,
  invoice_kind text NOT NULL DEFAULT 'customer',
  party_type text NOT NULL DEFAULT 'customer',
  party_id text,
  linked_pdi_id text REFERENCES pdi_records(id) ON DELETE SET NULL,
  quantity double precision NOT NULL DEFAULT 0,
  full_or_partial text NOT NULL DEFAULT 'full',
  balance_quantity double precision NOT NULL DEFAULT 0,
  net_amount bigint NOT NULL DEFAULT 0,
  gst_amount bigint NOT NULL DEFAULT 0,
  gross_amount bigint NOT NULL DEFAULT 0,
  dispatch_date date,
  lr_awb text,
  courier text,
  eway_bill text,
  payment_due_date date,
  status text NOT NULL DEFAULT 'raised',
  document_id text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
CREATE INDEX IF NOT EXISTS invoices_order_idx ON invoices (order_id);
CREATE INDEX IF NOT EXISTS invoices_due_idx ON invoices (payment_due_date, status);

CREATE TABLE IF NOT EXISTS deliveries (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  invoice_id text REFERENCES invoices(id) ON DELETE SET NULL,
  delivery_date date,
  location text,
  quantity_delivered double precision NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'in_transit',
  acceptance_status text NOT NULL DEFAULT 'pending',
  grn_no text,
  pending_balance_qty double precision NOT NULL DEFAULT 0,
  pod_document_id text,
  closure_status text NOT NULL DEFAULT 'open',
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deliveries_order_idx ON deliveries (order_id, status);

CREATE TABLE IF NOT EXISTS payments (
  id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  direction text NOT NULL,
  customer_id text REFERENCES customers(id),
  oem_id text REFERENCES oems(id),
  amount bigint NOT NULL DEFAULT 0,
  paid_date date,
  mode text,
  utr text,
  tds bigint NOT NULL DEFAULT 0,
  ld bigint NOT NULL DEFAULT 0,
  gst_on_ld bigint NOT NULL DEFAULT 0,
  total_deduction bigint NOT NULL DEFAULT 0,
  balance bigint NOT NULL DEFAULT 0,
  final_balance bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  follow_up_status text NOT NULL DEFAULT 'pending',
  remarks text,
  created_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON payments (invoice_id);

CREATE TABLE IF NOT EXISTS commissions (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  oem_id text REFERENCES oems(id),
  milestone text NOT NULL DEFAULT 'oem_paid',
  milestone_payment_id text REFERENCES payments(id) ON DELETE SET NULL,
  base_invoice_id text REFERENCES invoices(id) ON DELETE SET NULL,
  commission_percent double precision NOT NULL DEFAULT 0,
  base_invoice_amount bigint NOT NULL DEFAULT 0,
  commission_amount bigint NOT NULL DEFAULT 0,
  gst bigint NOT NULL DEFAULT 0,
  gross bigint NOT NULL DEFAULT 0,
  invoice_no text,
  invoice_date date,
  due_date date,
  payment_status text NOT NULL DEFAULT 'blocked',
  received_date date,
  tds_deducted boolean NOT NULL DEFAULT false,
  outstanding bigint NOT NULL DEFAULT 0,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
CREATE INDEX IF NOT EXISTS commissions_order_idx ON commissions (order_id);

CREATE TABLE IF NOT EXISTS documents (
  id text PRIMARY KEY,
  doc_type text NOT NULL,
  title text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  supplier_oem_id text REFERENCES oems(id) ON DELETE SET NULL,
  customer_id text REFERENCES customers(id) ON DELETE SET NULL,
  issue_date date,
  expiry_date date,
  linked_product_id text,
  linked_requirement_id text REFERENCES requirements(id) ON DELETE SET NULL,
  linked_order_id text REFERENCES orders(id) ON DELETE SET NULL,
  file_ref text,
  approval_status text NOT NULL DEFAULT 'none',
  version integer NOT NULL DEFAULT 1,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
CREATE INDEX IF NOT EXISTS documents_expiry_idx ON documents (expiry_date);
CREATE INDEX IF NOT EXISTS documents_requirement_idx ON documents (linked_requirement_id);

CREATE TABLE IF NOT EXISTS follow_up_tasks (
  id text PRIMARY KEY,
  requirement_id text REFERENCES requirements(id) ON DELETE CASCADE,
  order_id text REFERENCES orders(id) ON DELETE CASCADE,
  quotation_id text REFERENCES quotations(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  due_at timestamptz NOT NULL,
  assigned_user_id text REFERENCES users(id),
  status text NOT NULL DEFAULT 'open',
  auto boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS followups_status_idx ON follow_up_tasks (status, due_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY,
  actor_user_id text REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before jsonb,
  after jsonb,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_logs (entity_type, entity_id, created_at);

CREATE TABLE IF NOT EXISTS import_batches (
  id text PRIMARY KEY,
  source_file text NOT NULL,
  sheet text,
  kind text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  committed boolean NOT NULL DEFAULT false,
  notes text,
  created_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotent forward migration for databases created before these columns existed.
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS data_trust text;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS import_batch_id text;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS data_trust text;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS import_batch_id text;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS base_invoice_id text;
`;
