-- Names are presentation data. Account IDs and access roles remain authoritative.
create table public.member_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 100)
);

alter table public.member_profiles enable row level security;
revoke all on public.member_profiles from public, anon, authenticated;
grant select on public.member_profiles to authenticated;
grant update (display_name) on public.member_profiles to authenticated;

create policy profiles_read_self_or_finance_head on public.member_profiles
  for select to authenticated using (
    user_id = (select auth.uid()) or exists (
      select 1 from public.organization_members
      where user_id = (select auth.uid()) and access_role = 'finance_head'
    )
  );
create policy profiles_update_self on public.member_profiles
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Existing users get the same initial name as new users; never replace edits.
insert into public.member_profiles (user_id, display_name)
select m.user_id, coalesce(
  nullif(left(btrim(u.raw_user_meta_data ->> 'full_name'), 100), ''),
  nullif(left(btrim(u.raw_user_meta_data ->> 'name'), 100), ''),
  'ยังไม่ได้ตั้งชื่อ'
)
from public.organization_members m join auth.users u on u.id = m.user_id
on conflict (user_id) do nothing;

create or replace function public.ensure_member()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  insert into public.organization_members (user_id, access_role)
  values ((select auth.uid()), 'member') on conflict (user_id) do nothing;
  insert into public.member_profiles (user_id, display_name)
  select u.id, coalesce(
    nullif(left(btrim(u.raw_user_meta_data ->> 'full_name'), 100), ''),
    nullif(left(btrim(u.raw_user_meta_data ->> 'name'), 100), ''),
    'ยังไม่ได้ตั้งชื่อ'
  ) from auth.users u where u.id = (select auth.uid())
  on conflict (user_id) do nothing;
end;
$$;
