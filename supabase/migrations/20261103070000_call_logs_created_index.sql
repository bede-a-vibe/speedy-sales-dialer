-- call_logs had no index on created_at, so every report page (ordered by
-- created_at desc, id desc with LIMIT/OFFSET) scanned and joined the whole
-- date range before taking its 1000 rows. With pages fetched in parallel
-- (PR #164) that ran at ~1 s per page. With this index a page reads only
-- offset + 1000 rows. Applied to production 2026-11-03 via query_database.
create index if not exists idx_call_logs_created_id on public.call_logs (created_at desc, id desc);
