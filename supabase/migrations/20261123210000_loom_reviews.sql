-- Loom reviews (Bede, 23 Nov 2026): a recorded review, sent to one or more reps
-- with the calls it reviews attached, and optionally published as a Classroom
-- lesson carrying the same calls.

create table if not exists public.loom_reviews (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  loom_url text not null check (loom_url ~ '^https://(www\.)?loom\.com/(share|embed)/[A-Za-z0-9]+$'),
  duration_seconds integer,
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loom_review_recipients (
  review_id uuid not null references public.loom_reviews(id) on delete cascade,
  user_id uuid not null,
  seen_at timestamptz,
  watched_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);
create index if not exists loom_review_recipients_user_idx on public.loom_review_recipients (user_id);

-- A dialer call, or a pasted recording link (a Fathom meeting, for example).
create table if not exists public.loom_review_calls (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.loom_reviews(id) on delete cascade,
  call_log_id uuid references public.call_logs(id) on delete cascade,
  label text,
  url text check (url is null or url ~ '^https://'),
  note text,
  sort integer not null default 0,
  check (call_log_id is not null or url is not null)
);
create index if not exists loom_review_calls_review_idx on public.loom_review_calls (review_id);
create index if not exists loom_review_calls_call_idx on public.loom_review_calls (call_log_id);

alter table public.lms_lessons add column if not exists loom_review_id uuid
  references public.loom_reviews(id) on delete cascade;
create unique index if not exists lms_lessons_loom_review_key on public.lms_lessons (loom_review_id)
  where loom_review_id is not null;

-- Managers see every review. A rep sees the ones sent to them, and any that a
-- published lesson carries. Security definer so the policies below never recurse.
create or replace function public.can_view_loom_review(_review uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select public.is_admin_or_coach(auth.uid())
      or exists (select 1 from public.loom_review_recipients r where r.review_id = _review and r.user_id = auth.uid())
      or (public.is_team_member(auth.uid())
          and exists (select 1 from public.lms_lessons l
                        join public.lms_courses c on c.id = l.course_id
                       where l.loom_review_id = _review and l.published and c.published))
$function$;
revoke all on function public.can_view_loom_review(uuid) from public, anon;
grant execute on function public.can_view_loom_review(uuid) to authenticated;

alter table public.loom_reviews enable row level security;
alter table public.loom_review_recipients enable row level security;
alter table public.loom_review_calls enable row level security;

revoke all on public.loom_reviews, public.loom_review_recipients, public.loom_review_calls from anon, authenticated;
grant select, insert, update, delete on public.loom_reviews, public.loom_review_calls to authenticated;
grant select, insert, delete on public.loom_review_recipients to authenticated;
-- A rep may only stamp their own row as opened or watched.
grant update (seen_at, watched_at) on public.loom_review_recipients to authenticated;
grant all on public.loom_reviews, public.loom_review_recipients, public.loom_review_calls to service_role;

create policy "read visible loom reviews" on public.loom_reviews for select to authenticated
  using (public.can_view_loom_review(id));
create policy "managers manage loom reviews" on public.loom_reviews for all to authenticated
  using (public.is_admin_or_coach(auth.uid())) with check (public.is_admin_or_coach(auth.uid()));
create policy "read visible loom review calls" on public.loom_review_calls for select to authenticated
  using (public.can_view_loom_review(review_id));
create policy "managers manage loom review calls" on public.loom_review_calls for all to authenticated
  using (public.is_admin_or_coach(auth.uid())) with check (public.is_admin_or_coach(auth.uid()));
create policy "read own loom recipient row" on public.loom_review_recipients for select to authenticated
  using (user_id = auth.uid());
create policy "stamp own loom recipient row" on public.loom_review_recipients for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "managers manage loom recipients" on public.loom_review_recipients for all to authenticated
  using (public.is_admin_or_coach(auth.uid())) with check (public.is_admin_or_coach(auth.uid()));

-- One transaction for the review, who it goes to, its calls and its lesson, so a
-- dropped connection can't leave a review sent without its calls.
-- _course null = not in the Classroom (an existing lesson is removed).
-- Security invoker: the policies above decide who may do this.
create or replace function public.save_loom_review(
  _id uuid, _title text, _loom_url text, _duration integer, _notes text,
  _reps uuid[], _calls jsonb, _course uuid, _section text)
returns uuid language plpgsql security invoker set search_path to 'public'
as $function$
declare
  _review uuid := _id;
  _old_url text;
  _old_title text;
  _old_notes text;
  _lesson uuid;
begin
  if not public.is_admin_or_coach(auth.uid()) then
    raise exception 'Only a manager can send a Loom review';
  end if;
  if coalesce(array_length(_reps, 1), 0) = 0 and _course is null then
    raise exception 'Pick a rep, or put it in the Classroom';
  end if;

  if _review is null then
    insert into public.loom_reviews (title, loom_url, duration_seconds, notes)
    values (btrim(_title), _loom_url, _duration, nullif(btrim(_notes), ''))
    returning id into _review;
  else
    select loom_url, title, notes into _old_url, _old_title, _old_notes from public.loom_reviews where id = _review;
    if not found then raise exception 'That review no longer exists'; end if;
    update public.loom_reviews
       set title = btrim(_title), loom_url = _loom_url, duration_seconds = _duration,
           notes = nullif(btrim(_notes), ''), updated_at = now()
     where id = _review;
    delete from public.loom_review_recipients
     where review_id = _review and not (user_id = any (coalesce(_reps, '{}')));
    if _old_url is distinct from _loom_url then
      -- A new video is a new thing to watch.
      update public.loom_review_recipients set seen_at = null, watched_at = null where review_id = _review;
    end if;
  end if;

  insert into public.loom_review_recipients (review_id, user_id)
  select distinct _review, u from unnest(coalesce(_reps, '{}')) u
  on conflict (review_id, user_id) do nothing;

  delete from public.loom_review_calls where review_id = _review;
  insert into public.loom_review_calls (review_id, call_log_id, label, url, note, sort)
  select _review, nullif(c->>'call_log_id', '')::uuid, nullif(btrim(c->>'label'), ''),
         nullif(btrim(c->>'url'), ''), nullif(btrim(c->>'note'), ''), (ord - 1)::int
    from jsonb_array_elements(coalesce(_calls, '[]'::jsonb)) with ordinality as t(c, ord);

  select id into _lesson from public.lms_lessons where loom_review_id = _review;
  if _course is null then
    delete from public.lms_lessons where id = _lesson;
  elsif _lesson is null then
    insert into public.lms_lessons (course_id, section, title, sort, video_url, body, resources, published, created_by, loom_review_id)
    values (_course, coalesce(nullif(btrim(_section), ''), 'Loom reviews'), btrim(_title),
            coalesce((select max(sort) + 10 from public.lms_lessons where course_id = _course), 100),
            _loom_url, nullif(btrim(_notes), ''), '[]'::jsonb, true, auth.uid(), _review);
  else
    update public.lms_lessons
       set course_id = _course, section = coalesce(nullif(btrim(_section), ''), 'Loom reviews'),
           -- Words changed in the Classroom's own editor win over the review's.
           title = case when title is not distinct from _old_title then btrim(_title) else title end,
           body = case when body is not distinct from _old_notes then nullif(btrim(_notes), '') else body end,
           video_url = _loom_url, updated_at = now()
     where id = _lesson;
  end if;
  return _review;
end
$function$;
revoke all on function public.save_loom_review(uuid, text, text, integer, text, uuid[], jsonb, uuid, text) from public, anon;
grant execute on function public.save_loom_review(uuid, text, text, integer, text, uuid[], jsonb, uuid, text) to authenticated;
