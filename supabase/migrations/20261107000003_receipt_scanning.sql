create table public.receipt_scans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  photo_sha256 text not null check (photo_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

alter table public.receipt_scans enable row level security;
revoke all on public.receipt_scans from public, anon, authenticated;
grant select on public.receipt_scans to authenticated;
grant insert (photo_sha256) on public.receipt_scans to authenticated;

create policy members_read_own_scans
  on public.receipt_scans for select to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (select 1 from public.organization_members where user_id = (select auth.uid()))
  );
create policy members_insert_own_scans
  on public.receipt_scans for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.organization_members where user_id = (select auth.uid()))
  );

alter table public.expenses
  add column scan_id uuid,
  add column photo_sha256 text,
  add column line_items jsonb,
  add column adjustments jsonb not null default '[]'::jsonb,
  add foreign key (scan_id, owner_id) references public.receipt_scans (id, owner_id);

create unique index expenses_owner_photo_unique
  on public.expenses (owner_id, photo_sha256) where photo_sha256 is not null;

-- The complete breakdown is stored in one row and validated in the same statement.
create function public.receipt_breakdown_valid(items jsonb, adjustments jsonb, total integer)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  entry record;
  value numeric;
  calculated numeric := 0;
begin
  if items is null then return adjustments = '[]'::jsonb; end if;
  if jsonb_typeof(items) is distinct from 'array'
    or jsonb_typeof(adjustments) is distinct from 'array' then return false; end if;
  if jsonb_array_length(items) not between 1 and 100
    or jsonb_array_length(adjustments) > 20 then return false; end if;

  for entry in
    select v, n from jsonb_array_elements(items || adjustments) with ordinality as entries(v, n)
  loop
    if jsonb_typeof(entry.v) is distinct from 'object' then return false; end if;
    if not (entry.v ?& array['description', 'amountSatang'])
      or entry.v - 'description' - 'amountSatang' <> '{}'::jsonb
      or jsonb_typeof(entry.v -> 'description') is distinct from 'string'
      or length(btrim(entry.v ->> 'description')) not between 1 and 200
      or jsonb_typeof(entry.v -> 'amountSatang') is distinct from 'number'
      then return false; end if;
    value := (entry.v ->> 'amountSatang')::numeric;
    if value <> trunc(value) or value not between -2147483647 and 2147483647
      or (entry.n <= jsonb_array_length(items) and value < 0) then return false; end if;
    calculated := calculated + value;
  end loop;
  return calculated = total;
end;
$$;

revoke all on function public.receipt_breakdown_valid(jsonb, jsonb, integer) from public, anon;
grant execute on function public.receipt_breakdown_valid(jsonb, jsonb, integer) to authenticated;

alter table public.expenses
  add constraint expense_breakdown_matches_total
    check (public.receipt_breakdown_valid(line_items, adjustments, total_paid_satang)),
  add constraint scanned_expense_has_breakdown check (
    (scan_id is null and photo_sha256 is null)
    or (scan_id is not null and photo_sha256 is not null and line_items is not null)
  );

create function public.attach_receipt_fingerprint()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.scan_id is not null then
    select s.photo_sha256 into new.photo_sha256
    from public.receipt_scans s where s.id = new.scan_id and s.owner_id = new.owner_id;
    if not found then raise exception 'Scan unavailable' using errcode = '42501'; end if;
  else
    new.photo_sha256 := null;
  end if;
  return new;
end;
$$;
revoke all on function public.attach_receipt_fingerprint() from public, anon, authenticated;

create trigger attach_receipt_fingerprint
  before insert or update of scan_id on public.expenses
  for each row execute function public.attach_receipt_fingerprint();

grant insert (scan_id, line_items, adjustments), update (line_items, adjustments)
  on public.expenses to authenticated;
