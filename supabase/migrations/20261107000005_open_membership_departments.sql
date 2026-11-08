-- Every authenticated account can join as a regular member, never as Finance Head.
create function public.ensure_member()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  insert into public.organization_members (user_id, access_role)
  values ((select auth.uid()), 'member') on conflict (user_id) do nothing;
end;
$$;
revoke all on function public.ensure_member() from public, anon;
grant execute on function public.ensure_member() to authenticated;

insert into public.departments (name) values
  ('BOARD'), ('FINANCE'), ('IT'), ('OPERATIONS'), ('SECRETARIAT'), ('MEMBER_RELATIONS')
on conflict do nothing;

grant insert (user_id, department_name), delete on public.user_departments to authenticated;
create policy members_insert_own_departments on public.user_departments for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.organization_members where user_id = (select auth.uid())
  ));
create policy members_delete_own_departments on public.user_departments for delete to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.organization_members where user_id = (select auth.uid())
  ));
