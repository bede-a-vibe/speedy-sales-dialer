-- Booked contacts had no contact_person, so the Booked board showed "No contact name".
-- GHL calendar titles carry the prospect's first name ("Growth Session // Alan  and Bede");
-- fall back to the decision-maker name captured on the call. Applied to prod 13 Oct 2026.
with named as (
  select c.id,
    (select btrim(substring(a.title from '//\s*(.+?)\s+and\s')) from ghl_appointments a
      where a.contact_id = c.id and a.title ~ '// .+ and ' order by a.start_time desc limit 1) as title_name,
    nullif(btrim(c.dm_name), '') as dm
  from contacts c
  where (c.contact_person is null or btrim(c.contact_person) = '')
    and exists (select 1 from pipeline_items p where p.contact_id = c.id and p.pipeline_type = 'booked')
), pick as (
  select id, case when title_name is not null and title_name <> '' and title_name !~ '@' and length(title_name) <= 40 then title_name else dm end as name from named
)
update contacts c set contact_person = pick.name, updated_at = now() from pick where pick.id = c.id and pick.name is not null;
