-- A no-show or cancellation is chased from the Pipelines To do list until the
-- lead rebooks or says no. The hourly resurface job was also putting some of
-- them back in the dialer queue while they were being chased, so two people
-- could ring the same lead. Same job as before, minus leads whose latest
-- booking is a no-show or cancellation. Saying no returns them to the queue.
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'resurface-due-followups'),
  command := $job$
  update contacts c
  set status = 'uncalled', updated_at = now()
  from (
    select distinct p.contact_id
    from pipeline_items p
    where p.pipeline_type='follow_up' and p.status='open' and p.scheduled_for < now()
  ) due
  where c.id = due.contact_id
    and c.status = 'follow_up'
    and c.is_dnc is not true and c.disqualified is not true and c.is_archived is not true
    and c.meeting_booked_date is null
    and not exists (
      select 1 from pipeline_items b
      where b.contact_id = c.id and b.pipeline_type = 'booked'
        and (b.status = 'canceled' or b.appointment_outcome in ('no_show','cancelled'))
        and not exists (
          select 1 from pipeline_items n
          where n.contact_id = b.contact_id and n.pipeline_type = 'booked' and n.scheduled_for > b.scheduled_for
        )
    )
$job$
);
