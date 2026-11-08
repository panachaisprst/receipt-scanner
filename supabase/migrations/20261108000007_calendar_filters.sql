create or replace function public.list_expenses_calendar(
  requested_scope text,
  filter_owner_id uuid,
  filter_department text,
  filter_year integer,
  filter_month integer,
  filter_day integer,
  page_limit integer,
  page_offset integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if requested_scope is null or requested_scope not in ('own', 'organization')
    or (filter_year is not null and filter_year not between 1 and 9998)
    or (filter_month is not null and filter_month not between 1 and 12)
    or (filter_day is not null and filter_day not between 1 and 31)
    or (filter_department is not null and length(btrim(filter_department)) not between 1 and 50)
    or (requested_scope = 'own' and (filter_owner_id is not null or filter_department is not null))
    or page_limit is null or page_limit not between 1 and 100
    or page_offset is null or page_offset < 0 then
    raise exception 'Invalid expense query' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.organization_members
    where user_id = (select auth.uid())
      and (requested_scope = 'own' or access_role = 'finance_head')
  ) then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  return (
    with filtered_expenses as (
      select e.id, e.owner_id, e.shop_name, e.payee_name, e.document_type, e.purchase_date, e.total_paid_satang
      from public.expenses e
      where (requested_scope = 'organization' or e.owner_id = (select auth.uid()))
        and (filter_owner_id is null or e.owner_id = filter_owner_id)
        and (filter_year is null or extract(year from e.purchase_date) = filter_year)
        and (filter_month is null or extract(month from e.purchase_date) = filter_month)
        and (filter_day is null or extract(day from e.purchase_date) = filter_day)
        and (filter_department is null or exists (
          select 1 from public.user_departments ud
          where ud.user_id = e.owner_id and ud.department_name = filter_department
        ))
    ), page as (
      select * from filtered_expenses
      order by purchase_date desc, id desc
      limit page_limit offset page_offset
    )
    select jsonb_build_object(
      'expenses', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', id,
            'shopName', shop_name,
            'payeeName', payee_name,
            'documentType', document_type,
            'purchaseDate', purchase_date,
            'totalPaidSatang', total_paid_satang
          ) || case when requested_scope = 'organization'
            then jsonb_build_object('ownerId', owner_id) else '{}'::jsonb end
          order by purchase_date desc, id desc
        ) from page
      ), '[]'::jsonb),
      'runningTotalSatang', (select coalesce(sum(total_paid_satang), 0) from filtered_expenses),
      'totalCount', (select count(*) from filtered_expenses)
    )
  );
end;
$$;

revoke all on function public.list_expenses_calendar(text, uuid, text, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.list_expenses_calendar(text, uuid, text, integer, integer, integer, integer, integer) to authenticated;
