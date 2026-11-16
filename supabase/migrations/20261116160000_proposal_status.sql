-- Bede, 16 Nov 2026: track proposals owed and sent after a sitting.
-- proposal_sent_date already exists (GHL opportunity field "Proposal Sent Date").
alter table public.pipeline_items add column if not exists proposal_status text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pipeline_items_proposal_status_check') then
    alter table public.pipeline_items add constraint pipeline_items_proposal_status_check check (proposal_status in ('to_send', 'sent'));
  end if;
end $$;
comment on column public.pipeline_items.proposal_status is 'Proposal after this sitting: to_send (owed) or sent. Null = no proposal.';
