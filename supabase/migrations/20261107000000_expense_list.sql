create table public.organization_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_role text not null default 'member'
    check (access_role in ('member', 'finance_head'))
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  shop_name text not null check (length(btrim(shop_name)) > 0),
  purchase_date date not null,
  total_paid_satang integer not null check (total_paid_satang >= 0),
  created_at timestamptz not null default now()
);

create index expenses_owner_purchase_date_idx
  on public.expenses (owner_id, purchase_date desc, id desc);

alter table public.organization_members enable row level security;
alter table public.expenses enable row level security;

revoke all on public.organization_members, public.expenses from public, anon, authenticated;
grant select on public.organization_members, public.expenses to authenticated;

create policy members_read_own_membership
  on public.organization_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy members_read_own_expenses
  on public.expenses for select to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- Run with the caller's privileges so RLS applies to both the rows and the total.
create function public.list_my_expenses(page_limit integer, page_offset integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with owned_expenses as (
    select id, shop_name, purchase_date, total_paid_satang
    from public.expenses
    where owner_id = (select auth.uid())
  ), page as (
    select *
    from owned_expenses
    order by purchase_date desc, id desc
    limit least(greatest(page_limit, 1), 100)
    offset greatest(page_offset, 0)
  )
  select jsonb_build_object(
    'expenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'shopName', shop_name,
          'purchaseDate', purchase_date,
          'totalPaidSatang', total_paid_satang
        ) order by purchase_date desc, id desc
      ) from page
    ), '[]'::jsonb),
    'runningTotalSatang', (select coalesce(sum(total_paid_satang), 0) from owned_expenses),
    'totalCount', (select count(*) from owned_expenses)
  );
$$;

revoke all on function public.list_my_expenses(integer, integer) from public, anon, authenticated;
grant execute on function public.list_my_expenses(integer, integer) to authenticated;
