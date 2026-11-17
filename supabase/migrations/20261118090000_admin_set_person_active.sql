-- Team & settings: move a person to Former team members, or restore them (18 Nov 2026).
-- Admins only. Moving someone to former also removes their dialer roles, so they
-- lose access; restoring does not give access back. Their past meetings stay
-- attributed. Blocks moving yourself and removing the last admin.
create or replace function public.admin_set_person_active(_user_id uuid, _ghl_user_id text, _active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'Admins only';
  end if;
  if not _active and _user_id = auth.uid() then
    raise exception 'You cannot move yourself to former team members';
  end if;
  if not _active and _user_id is not null
     and public.has_role(_user_id, 'admin'::app_role)
     and (select count(*) from public.user_roles where role = 'admin'::app_role) <= 1 then
    raise exception 'That is the last admin';
  end if;
  if _user_id is not null then
    update public.profiles set is_active = _active where user_id = _user_id;
    if not _active then
      delete from public.user_roles where user_id = _user_id;
    end if;
  end if;
  if _ghl_user_id is not null then
    update public.ghl_users set is_active = _active where ghl_user_id = _ghl_user_id;
  end if;
end $$;
revoke all on function public.admin_set_person_active(uuid, text, boolean) from public, anon;
grant execute on function public.admin_set_person_active(uuid, text, boolean) to authenticated;
