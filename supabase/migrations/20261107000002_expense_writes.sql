-- Assign ownership from Supabase's verified JWT identity on every new row.
alter table public.expenses alter column owner_id set default auth.uid();

-- Expose only business fields for inserts and updates.
grant insert (shop_name, purchase_date, total_paid_satang),
      update (shop_name, purchase_date, total_paid_satang)
  on public.expenses to authenticated;
grant delete on public.expenses to authenticated;

create policy members_insert_own_expenses
  on public.expenses for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.organization_members where user_id = (select auth.uid())
    )
  );

create policy members_update_own_expenses
  on public.expenses for update to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.organization_members where user_id = (select auth.uid())
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.organization_members where user_id = (select auth.uid())
    )
  );

create policy members_delete_own_expenses
  on public.expenses for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.organization_members where user_id = (select auth.uid())
    )
  );
