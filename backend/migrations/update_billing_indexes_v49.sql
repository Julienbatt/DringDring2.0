-- Speed up billing views and audit queries
CREATE INDEX IF NOT EXISTS idx_billing_run_region_month
    ON billing_run (admin_region_id, period_month);

CREATE INDEX IF NOT EXISTS idx_billing_document_run_recipient
    ON billing_document (run_id, recipient_type, recipient_id);

CREATE INDEX IF NOT EXISTS idx_billing_document_line_document
    ON billing_document_line (document_id);
