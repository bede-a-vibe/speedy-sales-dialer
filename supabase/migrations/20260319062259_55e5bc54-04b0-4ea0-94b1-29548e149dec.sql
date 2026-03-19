CREATE INDEX IF NOT EXISTS idx_call_logs_user_created ON call_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_contact ON call_logs (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_outcome ON call_logs (outcome);
CREATE INDEX IF NOT EXISTS idx_contacts_dialer ON contacts (status, is_dnc, industry, state);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_type_status ON pipeline_items (pipeline_type, status);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_assigned ON pipeline_items (assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_created_by ON pipeline_items (created_by);