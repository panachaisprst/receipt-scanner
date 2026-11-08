import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';

const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
const guest = '00000000-0000-4000-8000-000000000003';
const emptyMember = '00000000-0000-4000-8000-000000000004';
const may = '00000000-0000-4000-8000-000000000005';
const users = new Map([
  ['alice-token', alice],
  ['bob-token', bob],
  ['guest-token', guest],
  ['empty-member-token', emptyMember],
  ['may-token', may],
]);

const db = new PGlite();

beforeAll(async () => {
  // Stand-ins for the roles and verified JWT identity Supabase sets before running SQL.
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
    $$;
    grant usage on schema auth to authenticated;
  `);
  await db.exec(await readFile(
    new URL('../../supabase/migrations/20261107000000_expense_list.sql', import.meta.url),
    'utf8',
  ));
  await db.exec(await readFile(
    new URL('../../supabase/migrations/20261107000001_finance_expense_list.sql', import.meta.url),
    'utf8',
  ));
  await db.exec(await readFile(
    new URL('../../supabase/migrations/20261107000002_expense_writes.sql', import.meta.url),
    'utf8',
  ));
  await db.exec(await readFile(
    new URL('../../supabase/migrations/20261107000003_receipt_scanning.sql', import.meta.url),
    'utf8',
  ));
  await db.exec(await readFile(
    new URL('../../supabase/migrations/20261107000004_transfer_slips.sql', import.meta.url),
    'utf8',
  ));
  await db.exec(await readFile(
    new URL('../../supabase/migrations/20261107000005_open_membership_departments.sql', import.meta.url),
    'utf8',
  ));
  await db.exec(await readFile(new URL('../../supabase/migrations/20261108000006_member_display_names.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/20261108000007_calendar_filters.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users (id) values ($1), ($2), ($3), ($4), ($5)', [
    alice, bob, guest, emptyMember, may,
  ]);
  await db.query(
    "insert into public.organization_members (user_id, access_role) values ($1, 'finance_head')",
    [may],
  );
  await db.exec("insert into public.departments (name) values ('IT'), ('BOARD') on conflict do nothing");
  await db.query(`
    insert into public.user_departments (user_id, department_name)
    values ($1, 'IT'), ($1, 'BOARD'), ($2, 'BOARD')
  `, [alice, bob]);
  await db.query('insert into public.organization_members (user_id) values ($1), ($2), ($3)', [
    alice, bob, emptyMember,
  ]);
  await db.query(`
    insert into public.expenses (owner_id, shop_name, purchase_date, total_paid_satang)
    values ($1, 'Alice shop', '2026-11-07', 4500),
           ($1, 'Alice older shop', '2026-11-06', 1000),
           ($2, 'Bob shop', '2026-11-07', 8000),
           ($3, 'Guest shop', '2026-11-07', 9000)
  `, [alice, bob, guest]);
}, 30_000);

afterAll(() => db.close());

function queryAsUser<Row = unknown>(userId: string, sql: string, parameters: unknown[] = []) {
  return db.transaction(async tx => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId }),
    ]);
    return tx.query<Row>(sql, parameters);
  });
}

// Replace Supabase's HTTP services in tests. The app still uses the actual
// client library and forwards its token to PostgreSQL-backed queries.
const supabaseFetch = vi.fn<typeof fetch>(async (input, init) => {
  const req = new Request(input, init);
  const url = new URL(req.url);
  const userId = users.get(req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '');
  if (!userId) {
    return Response.json({ code: 'bad_jwt', message: 'Invalid token' }, { status: 401 });
  }

  try {
    switch (url.pathname) {
    case '/auth/v1/user':
      return Response.json({ id: userId, aud: 'authenticated' });
    case '/rest/v1/organization_members': {
      const requestedUser = url.searchParams.get('user_id')?.replace(/^eq\./, '');
      const { rows } = await queryAsUser(userId,
        'select user_id, access_role from public.organization_members where user_id = $1', [requestedUser]);
      return Response.json(rows);
    }
    case '/rest/v1/rpc/list_expenses_calendar': {
      const args = await req.json();
      const { rows } = await queryAsUser<{ result: unknown }>(
        userId, 'select public.list_expenses_calendar($1, $2, $3, $4, $5, $6, $7, $8) as result',
        [args.requested_scope, args.filter_owner_id, args.filter_department,
          args.filter_year, args.filter_month, args.filter_day, args.page_limit, args.page_offset],
      );
      return Response.json(rows[0].result);
    }
    case '/rest/v1/expenses': {
      let returning = `id, shop_name as "shopName", purchase_date::text as "purchaseDate",
        total_paid_satang as "totalPaidSatang", payee_name as "payeeName", document_type as "documentType"`;
      const selection = url.searchParams.get('select') ?? '';
      if (selection === 'id') returning = 'id';
      if (selection.includes('lineItems')) {
        returning += ', line_items as "lineItems", adjustments, scan_id as "scanId"';
      }
      let result;
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      const ownerId = url.searchParams.get('owner_id')?.replace(/^eq\./, '');
      if (req.method === 'POST') {
        const body: Record<string, unknown> = await req.json();
        const columns = Object.keys(body);
        const allowed = ['shop_name', 'purchase_date', 'total_paid_satang',
          'scan_id', 'line_items', 'adjustments', 'payee_name', 'document_type'];
        if (columns.some(column => !allowed.includes(column))) {
          throw new Error('Unexpected insert column in test transport');
        }
        const placeholders = columns.map((_column, index) => `$${index + 1}`);
        result = await queryAsUser(userId, `
          insert into public.expenses (${columns.join(', ')})
          values (${placeholders.join(', ')}) returning ${returning}
        `, Object.values(body).map(value => Array.isArray(value) ? JSON.stringify(value) : value));
      } else if (req.method === 'PATCH') {
        const body: Record<string, unknown> = await req.json();
        const columns = Object.keys(body);
        const allowedColumns = ['shop_name', 'purchase_date', 'total_paid_satang',
          'line_items', 'adjustments', 'payee_name', 'document_type'];
        if (columns.some(column => !allowedColumns.includes(column))) {
          throw new Error('Unexpected update column in test transport');
        }
        const assignments = columns.map((column, index) => `${column} = $${index + 3}`);
        result = await queryAsUser(userId, `
          update public.expenses set ${assignments.join(', ')}
          where id = $1 and owner_id = $2 returning ${returning}
        `, [id, ownerId,
          ...Object.values(body).map(value => Array.isArray(value) ? JSON.stringify(value) : value)]);
      } else if (req.method === 'DELETE') {
        result = await queryAsUser(userId, `
          delete from public.expenses where id = $1 and owner_id = $2 returning id
        `, [id, ownerId]);
      } else if (req.method === 'GET') {
        const hash = url.searchParams.get('photo_sha256')?.replace(/^eq\./, '');
        result = await queryAsUser(userId, `
          select ${returning} from public.expenses
          where ($1::uuid is null or id = $1) and ($2::uuid is null or owner_id = $2)
            and ($3::text is null or photo_sha256 = $3)
        `, [id ?? null, ownerId ?? null, hash ?? null]);
      } else {
        throw new Error('Unexpected expense request method');
      }
      const data = req.headers.get('Accept') === 'application/vnd.pgrst.object+json'
        ? result.rows[0] : result.rows;
      return Response.json(data, { status: req.method === 'POST' ? 201 : 200 });
    }
    case '/rest/v1/receipt_scans': {
      const body = await req.json();
      const result = await queryAsUser(userId, `
        insert into public.receipt_scans (photo_sha256) values ($1) returning id
      `, [body.photo_sha256]);
      return Response.json(result.rows[0], { status: 201 });
    }
    default:
      throw new Error(`Unexpected test request to ${url.pathname}`);
    }
  } catch (error) {
    const failure = error as { code?: string; message: string };
    if (!failure.code) throw error;
    return Response.json({ code: failure.code, message: failure.message }, { status: 400 });
  }
});

const app = createApp({
  supabaseUrl: 'https://receipt-test.example',
  supabasePublishableKey: 'sb_publishable_fixture',
  fetch: supabaseFetch,
});

describe('member display names', () => {
  it('initializes once, preserves edits, and protects profiles', async () => {
    await db.query("update auth.users set raw_user_meta_data = $1::jsonb where id = any($2::uuid[])", [JSON.stringify({full_name: 'Alice Google'}), [alice, bob]]);
    await queryAsUser(alice, 'select public.ensure_member()');
    await queryAsUser(bob, 'select public.ensure_member()');
    const own = await queryAsUser<{display_name: string}>(alice, 'select display_name from public.member_profiles');
    expect(own.rows).toEqual([{ display_name: 'Alice Google' }]);
    await queryAsUser(alice, "update public.member_profiles set display_name = 'New name' where user_id = $1", [alice]);
    await queryAsUser(alice, 'select public.ensure_member()');
    expect((await queryAsUser<{display_name: string}>(alice, 'select display_name from public.member_profiles')).rows[0].display_name).toBe('New name');
    const other = await queryAsUser(alice, "update public.member_profiles set display_name = 'Changed' where user_id = $1 returning user_id", [bob]);
    expect(other.rows).toEqual([]);
    await expect(queryAsUser(alice, "update public.organization_members set access_role = 'finance_head' where user_id = $1", [alice])).rejects.toThrow();
    const visible = await queryAsUser<{user_id: string}>(may, 'select user_id from public.member_profiles');
    expect(visible.rows.map(row => row.user_id)).toEqual(expect.arrayContaining([alice, bob]));
  });

  it('uses a fallback without a Google name and keeps same-named users distinct in filtering', async () => {
    await queryAsUser(emptyMember, 'select public.ensure_member()');
    const fallback = await queryAsUser<{display_name: string}>(emptyMember, 'select display_name from public.member_profiles');
    expect(fallback.rows).toEqual([{ display_name: 'ยังไม่ได้ตั้งชื่อ' }]);
    await queryAsUser(alice, "update public.member_profiles set display_name = 'Same name' where user_id = $1", [alice]);
    await queryAsUser(bob, "update public.member_profiles set display_name = 'Same name' where user_id = $1", [bob]);
    const filtered = await queryAsUser<{result: {expenses: {ownerId: string}[]; runningTotalSatang: number}}>(may,
      "select public.list_expenses('organization', $1, null, null, null, 50, 0) as result", [alice]);
    expect(filtered.rows[0].result.expenses.every(expense => expense.ownerId === alice)).toBe(true);
    expect(filtered.rows[0].result.runningTotalSatang).toBe(5500);
  });
});

describe('GET /api/expenses', () => {
  it('ignores only the Vercel catch-all route parameter on Vercel', async () => {
    const deployedApp = createApp({
      supabaseUrl: 'https://receipt-test.example', supabasePublishableKey: 'sb_publishable_fixture',
      fetch: supabaseFetch, vercelRouting: true,
    });
    await request(deployedApp).get('/api/expenses?...path=expenses&scope=own')
      .auth('alice-token', { type: 'bearer' }).expect(200);
    await request(deployedApp).get('/api/expenses?...path=other')
      .auth('alice-token', { type: 'bearer' }).expect(400);
    await request(app).get('/api/expenses?...path=expenses')
      .auth('alice-token', { type: 'bearer' }).expect(400);
  });
  it('rejects missing and invalid bearer tokens', async () => {
    await request(app).get('/api/expenses').expect(401, { error: 'unauthenticated' });
    await request(app).get('/api/expenses').auth('invalid-token', { type: 'bearer' })
      .expect(401, { error: 'unauthenticated' });
  });

  it('rejects a signed-in user without membership', async () => {
    await request(app).get('/api/expenses').auth('guest-token', { type: 'bearer' })
      .expect(403, { error: 'membership_required' });
  });

  it('rejects caller-supplied owner IDs and invalid pagination', async () => {
    for (const query of [`?ownerId=${bob}`, '?limit=0', '?offset=2147483648', '?limit=1&limit=2']) {
      await request(app).get(`/api/expenses${query}`).auth('alice-token', { type: 'bearer' })
        .expect(400, { error: 'invalid_expense_query' });
    }
  });

  it('isolates each caller and reports the full running total across pages', async () => {
    const [aliceResponse, bobResponse] = await Promise.all([
      request(app).get('/api/expenses?limit=1').auth('alice-token', { type: 'bearer' }).expect(200),
      request(app).get('/api/expenses').auth('bob-token', { type: 'bearer' }).expect(200),
    ]);

    expect(aliceResponse.body).toEqual({
      expenses: [{
        id: expect.any(String),
        shopName: 'Alice shop', payeeName: null, documentType: 'receipt',
        purchaseDate: '2026-11-07',
        totalPaidSatang: 4500,
      }],
      runningTotalSatang: 5500,
      totalCount: 2,
    });
    expect(aliceResponse.headers['cache-control']).toBe('no-store');
    expect(bobResponse.body).toMatchObject({
      expenses: [{ shopName: 'Bob shop', totalPaidSatang: 8000 }],
      runningTotalSatang: 8000,
      totalCount: 1,
    });
    const next = await request(app).get('/api/expenses?limit=1&offset=1')
      .auth('alice-token', { type: 'bearer' }).expect(200);
    expect(next.body.expenses).toMatchObject([{ shopName: 'Alice older shop' }]);
  });

  it('returns an empty list and zero total for a member with no expenses', async () => {
    await request(app).get('/api/expenses').auth('empty-member-token', { type: 'bearer' })
      .expect(200, { expenses: [], runningTotalSatang: 0, totalCount: 0 });
  });

  it('restricts organization scope to Finance Head even with a forged role parameter', async () => {
    await request(app).get('/api/expenses?scope=organization')
      .auth('alice-token', { type: 'bearer' }).expect(403, { error: 'finance_head_required' });
    await request(app).get('/api/expenses?scope=organization&access_role=finance_head')
      .auth('alice-token', { type: 'bearer' }).expect(400);
  });

  it('lets Finance Head read all retained expenses without duplicating multi-department users', async () => {
    const response = await request(app).get('/api/expenses?scope=organization&limit=1')
      .auth('may-token', { type: 'bearer' }).expect(200);
    expect(response.body).toMatchObject({
      expenses: [{ ownerId: expect.any(String) }],
      runningTotalSatang: 22500,
      totalCount: 4,
    });
    const own = await request(app).get('/api/expenses')
      .auth('may-token', { type: 'bearer' }).expect(200);
    expect(own.body).toEqual({ expenses: [], runningTotalSatang: 0, totalCount: 0 });
  });

  it('combines owner, current department, year and month filters before computing totals', async () => {
    const response = await request(app)
      .get(`/api/expenses?scope=organization&ownerId=${alice}&department=BOARD&year=2026&month=11&limit=1`)
      .auth('may-token', { type: 'bearer' }).expect(200);
    expect(response.body).toMatchObject({ runningTotalSatang: 5500, totalCount: 2 });
    const board = await request(app).get('/api/expenses?scope=organization&department=BOARD')
      .auth('may-token', { type: 'bearer' }).expect(200);
    expect(board.body).toMatchObject({ runningTotalSatang: 13500, totalCount: 3 });
    const mismatch = await request(app)
      .get(`/api/expenses?scope=organization&ownerId=${bob}&department=IT`)
      .auth('may-token', { type: 'bearer' }).expect(200);
    expect(mismatch.body).toEqual({ expenses: [], runningTotalSatang: 0, totalCount: 0 });
  });

  it('filters purchase dates for personal and organization scope, including empty periods', async () => {
    for (const query of ['?year=2025&month=11', '?year=2026&month=12']) {
      const response = await request(app).get(`/api/expenses${query}`)
        .auth('alice-token', { type: 'bearer' }).expect(200);
      expect(response.body).toEqual({ expenses: [], runningTotalSatang: 0, totalCount: 0 });
    }
    const response = await request(app)
      .get('/api/expenses?scope=organization&year=2026&month=12')
      .auth('may-token', { type: 'bearer' }).expect(200);
    expect(response.body.totalCount).toBe(0);
  });

  it('filters a month across years and an exact calendar date with correct totals and authorization', async () => {
    const added = await db.query<{id: string}>(`insert into public.expenses (owner_id, shop_name, purchase_date, total_paid_satang)
      values ($1, 'Previous year', '2025-11-07', 200), ($1, 'Other month', '2026-10-07', 300) returning id`, [alice]);
    try {
      const month = await request(app).get('/api/expenses?month=11').auth('alice-token', { type: 'bearer' }).expect(200);
      expect(month.body).toMatchObject({totalCount: 3, runningTotalSatang: 5700});
      const date = await request(app).get('/api/expenses?year=2026&month=11&day=7').auth('alice-token', { type: 'bearer' }).expect(200);
      expect(date.body).toMatchObject({totalCount: 1, runningTotalSatang: 4500});
      const organization = await request(app).get('/api/expenses?scope=organization&year=2026&month=11&day=7').auth('may-token', { type: 'bearer' }).expect(200);
      expect(organization.body).toMatchObject({totalCount: 3, runningTotalSatang: 21500});
      await request(app).get('/api/expenses?scope=organization&month=11').auth('alice-token', { type: 'bearer' }).expect(403);
    } finally { await db.query('delete from public.expenses where id = any($1::uuid[])', [added.rows.map(row => row.id)]); }
  });

  it('rejects invalid filters', async () => {
    for (const query of ['?month=13', '?day=0', '?day=32', '?year=2026&month=13', '?scope=other', '?year=0',
      '?scope=organization&ownerId=wrong', '?scope=organization&department=']) {
      await request(app).get(`/api/expenses${query}`)
        .auth('may-token', { type: 'bearer' }).expect(400);
    }
  });

  it('excludes other years and months when matching expenses also exist', async () => {
    const inserted = await db.query<{ id: string }>(`
      insert into public.expenses (owner_id, shop_name, purchase_date, total_paid_satang)
      values ($1, 'Previous year', '2025-11-07', 100),
             ($1, 'Next month', '2026-12-07', 200)
      returning id
    `, [alice]);
    try {
      const november = await request(app)
        .get('/api/expenses?scope=organization&department=IT&year=2026&month=11')
        .auth('may-token', { type: 'bearer' }).expect(200);
      expect(november.body).toMatchObject({ runningTotalSatang: 5500, totalCount: 2 });
      const year = await request(app).get('/api/expenses?year=2026')
        .auth('alice-token', { type: 'bearer' }).expect(200);
      expect(year.body).toMatchObject({ runningTotalSatang: 5700, totalCount: 3 });
    } finally {
      await db.query('delete from public.expenses where id = any($1::uuid[])',
        [inserted.rows.map(row => row.id)]);
    }
  });
});

describe('database permissions without Express', () => {
  it('enrolls a signed-in user as a member and restricts department edits to themselves', async () => {
    try {
      await queryAsUser(guest, 'select public.ensure_member()');
      await queryAsUser(guest, 'select public.ensure_member()');
      await queryAsUser(may, 'select public.ensure_member()');
      const finance = await queryAsUser(may, 'select access_role from public.organization_members');
      expect(finance.rows).toEqual([{ access_role: 'finance_head' }]);
      const membership = await queryAsUser(guest, 'select access_role from public.organization_members');
      expect(membership.rows).toEqual([{ access_role: 'member' }]);
      await expect(queryAsUser(guest, "update public.organization_members set access_role = 'finance_head' where user_id = $1", [guest]))
        .rejects.toMatchObject({ code: '42501' });
      await queryAsUser(guest, "insert into public.user_departments (user_id, department_name) values ($1, 'IT')", [guest]);
      await queryAsUser(guest, "insert into public.user_departments (user_id, department_name) values ($1, 'FINANCE')", [guest]);
      const unchangedRole = await queryAsUser(guest, 'select access_role from public.organization_members');
      expect(unchangedRole.rows).toEqual([{ access_role: 'member' }]);
      await expect(queryAsUser(guest, "insert into public.user_departments (user_id, department_name) values ($1, 'FINANCE')", [bob]))
        .rejects.toMatchObject({ code: '42501' });
      const removed = await queryAsUser(guest, 'delete from public.user_departments where user_id = $1 returning user_id', [bob]);
      expect(removed.rows).toEqual([]);
      await request(app).get('/api/expenses').auth('guest-token', { type: 'bearer' }).expect(200);
    } finally {
      await db.query('delete from public.user_departments where user_id = $1', [guest]);
      await db.query('delete from public.organization_members where user_id = $1', [guest]);
    }
  });

  it('shows each member only their own rows, including when they query a different owner', async () => {
    const aliceRows = await queryAsUser(alice, 'select distinct owner_id from public.expenses');
    const bobRows = await queryAsUser(bob, 'select distinct owner_id from public.expenses');
    const crossUserRows = await queryAsUser(alice,
      'select id from public.expenses where owner_id = $1', [bob]);
    const guestRows = await queryAsUser(guest, 'select id from public.expenses');

    expect(aliceRows.rows).toEqual([{ owner_id: alice }]);
    expect(bobRows.rows).toEqual([{ owner_id: bob }]);
    expect(crossUserRows.rows).toEqual([]);
    expect(guestRows.rows).toEqual([]);
  });

  it('denies self-promotion and writes to another member\'s expenses', async () => {
    await expect(queryAsUser(alice,
      "update public.organization_members set access_role = 'finance_head' where user_id = $1",
      [alice])).rejects.toMatchObject({ code: '42501' });
    const result = await queryAsUser(alice,
      'delete from public.expenses where owner_id = $1 returning id', [bob]);
    expect(result.rows).toEqual([]);
  });

  it('enforces Finance Head access when the API is bypassed', async () => {
    const { rows } = await queryAsUser(may, 'select id from public.expenses');
    expect(rows).toHaveLength(4);
    await expect(queryAsUser(alice,
      "select public.list_expenses('organization', null, null, null, null, 50, 0)"))
      .rejects.toMatchObject({ code: '42501' });
    const deleted = await queryAsUser(may,
      'delete from public.expenses where owner_id = $1 returning id', [bob]);
    expect(deleted.rows).toEqual([]);
    await expect(queryAsUser(alice,
      "insert into public.user_departments (user_id, department_name) values ($1, 'IT')", [bob]))
      .rejects.toMatchObject({ code: '42501' });
    await expect(queryAsUser(may,
      "select public.list_expenses('organization', null, null, null, 11, 50, 0)"))
      .rejects.toMatchObject({ code: '22023' });
  });

  it('uses the current protected role after a Finance Head is demoted', async () => {
    await db.query("update public.organization_members set access_role = 'member' where user_id = $1",
      [may]);
    try {
      await request(app).get('/api/expenses?scope=organization')
        .auth('may-token', { type: 'bearer' }).expect(403);
      const { rows } = await queryAsUser(may, 'select id from public.expenses');
      expect(rows).toEqual([]);
      await expect(queryAsUser(may,
        "select public.list_expenses('organization', null, null, null, null, 50, 0)"))
        .rejects.toMatchObject({ code: '42501' });
    } finally {
      await db.query(
        "update public.organization_members set access_role = 'finance_head' where user_id = $1", [may],
      );
    }
  });
});

describe('expense writes', () => {
  const fields = { documentType: 'receipt', payeeName: null, shopName: 'ร้านทดสอบ', purchaseDate: '2026-11-07', totalPaidSatang: 4500 };

  it('creates, partially updates and deletes an owned expense, updating the running total', async () => {
    const created = await request(app).post('/api/expenses')
      .auth('empty-member-token', { type: 'bearer' }).send(fields).expect(201);
    const id: string = created.body.id;
    try {
      expect(created.body).toEqual({ id: expect.any(String), ...fields });
      const stored = await db.query('select owner_id from public.expenses where id = $1', [id]);
      expect(stored.rows).toEqual([{ owner_id: emptyMember }]);
      const updated = await request(app).patch(`/api/expenses/${id}`)
        .auth('empty-member-token', { type: 'bearer' })
        .send({ totalPaidSatang: 5000 }).expect(200);
      expect(updated.body).toEqual({ id, ...fields, totalPaidSatang: 5000 });
      const list = await request(app).get('/api/expenses')
        .auth('empty-member-token', { type: 'bearer' }).expect(200);
      expect(list.body).toMatchObject({ runningTotalSatang: 5000, totalCount: 1 });
      await request(app).delete(`/api/expenses/${id}`)
        .auth('empty-member-token', { type: 'bearer' }).expect(204);
      await request(app).delete(`/api/expenses/${id}`)
        .auth('empty-member-token', { type: 'bearer' }).expect(404);
      await request(app).get('/api/expenses')
        .auth('empty-member-token', { type: 'bearer' })
        .expect(200, { expenses: [], runningTotalSatang: 0, totalCount: 0 });
    } finally {
      await db.query('delete from public.expenses where owner_id = $1', [emptyMember]);
    }
  });

  it('requires authentication and membership for every write method', async () => {
    for (const method of ['post', 'patch', 'delete'] as const) {
      const path = method === 'post' ? '/api/expenses' : `/api/expenses/${alice}`;
      await request(app)[method](path).send(fields).expect(401);
      await request(app)[method](path).auth('invalid-token', { type: 'bearer' })
        .send(fields).expect(401);
      await request(app)[method](path).auth('guest-token', { type: 'bearer' })
        .send(fields).expect(403);
    }
  });

  it('rejects invalid business fields, ownership and server-managed fields', async () => {
    for (const payload of [
      { ...fields, ownerId: bob }, { ...fields, owner_id: bob },
      { ...fields, id: alice }, { ...fields, created_at: '2026-11-07' },
      { ...fields, shopName: '  ' }, { ...fields, purchaseDate: '2026-02-30' },
      { ...fields, purchaseDate: '0000-01-01' },
      { ...fields, totalPaidSatang: -1 }, { ...fields, totalPaidSatang: 1.5 },
      { ...fields, totalPaidSatang: '4500' }, { ...fields, totalPaidSatang: 2147483648 },
    ]) {
      await request(app).post('/api/expenses').auth('alice-token', { type: 'bearer' })
        .send(payload).expect(400);
    }
    for (const payload of [{}, { ownerId: bob }, { owner_id: bob }, { totalPaidSatang: null }]) {
      await request(app).patch(`/api/expenses/${alice}`)
        .auth('alice-token', { type: 'bearer' }).send(payload).expect(400);
    }
    await request(app).patch('/api/expenses/invalid')
      .auth('alice-token', { type: 'bearer' }).send({ shopName: 'New shop' }).expect(400);
    await request(app).delete('/api/expenses/invalid')
      .auth('alice-token', { type: 'bearer' }).expect(400);
  });

  it('returns 404 for missing expenses and other owners, including Finance Head requests', async () => {
    const result = await db.query<{ id: string }>(
      "select id from public.expenses where shop_name = 'Bob shop'",
    );
    const bobExpense = result.rows[0].id;
    for (const token of ['alice-token', 'may-token']) {
      for (const id of [bobExpense, alice]) {
        await request(app).patch(`/api/expenses/${id}`)
          .auth(token, { type: 'bearer' }).send({ totalPaidSatang: 1 }).expect(404);
        await request(app).delete(`/api/expenses/${id}`)
          .auth(token, { type: 'bearer' }).expect(404);
      }
    }
    const original = await db.query('select total_paid_satang from public.expenses where id = $1',
      [bobExpense]);
    expect(original.rows).toEqual([{ total_paid_satang: 8000 }]);
  });

  it('rejects malformed and oversized JSON bodies', async () => {
    await request(app).post('/api/expenses').auth('alice-token', { type: 'bearer' })
      .set('Content-Type', 'application/json').send('{"shopName":')
      .expect(400, { error: 'invalid_json' });
    await request(app).post('/api/expenses').auth('alice-token', { type: 'bearer' })
      .send({ ...fields, shopName: 'x'.repeat(20_000) })
      .expect(413, { error: 'request_too_large' });
  });

  it('assigns the verified caller as owner and prevents owner reassignment in SQL', async () => {
    const inserted = await queryAsUser<{ id: string; owner_id: string }>(emptyMember, `
      insert into public.expenses (shop_name, purchase_date, total_paid_satang)
      values ('Direct insert', '2026-11-07', 100) returning id, owner_id
    `);
    const id = inserted.rows[0].id;
    try {
      expect(inserted.rows[0].owner_id).toBe(emptyMember);
      await expect(queryAsUser(emptyMember,
        'update public.expenses set owner_id = $1 where id = $2', [bob, id]))
        .rejects.toMatchObject({ code: '42501' });
      await expect(queryAsUser(emptyMember, `
        insert into public.expenses (owner_id, shop_name, purchase_date, total_paid_satang)
        values ($1, 'Spoofed', '2026-11-07', 100)
      `, [bob])).rejects.toMatchObject({ code: '42501' });
      await expect(queryAsUser(guest, `
        insert into public.expenses (shop_name, purchase_date, total_paid_satang)
        values ('No membership', '2026-11-07', 100)
      `)).rejects.toMatchObject({ code: '42501' });
    } finally {
      await db.query('delete from public.expenses where id = $1', [id]);
    }
  });

  it('blocks direct cross-owner updates and rolls back invalid changes atomically', async () => {
    for (const user of [alice, may]) {
      const result = await queryAsUser(user, `
        update public.expenses set total_paid_satang = 1 where owner_id = $1 returning id
      `, [bob]);
      expect(result.rows).toEqual([]);
    }
    await expect(queryAsUser(bob, `
      update public.expenses set shop_name = 'Changed', total_paid_satang = -1 where owner_id = $1
    `, [bob])).rejects.toMatchObject({ code: '23514' });
    const result = await queryAsUser(bob,
      'select shop_name, total_paid_satang from public.expenses where owner_id = $1', [bob]);
    expect(result.rows).toEqual([{ shop_name: 'Bob shop', total_paid_satang: 8000 }]);
  });

  it('allows Finance Head to manage their own expenses', async () => {
    const created = await request(app).post('/api/expenses')
      .auth('may-token', { type: 'bearer' }).send(fields).expect(201);
    try {
      await request(app).patch(`/api/expenses/${created.body.id}`)
        .auth('may-token', { type: 'bearer' }).send({ shopName: 'May shop' }).expect(200);
      await request(app).delete(`/api/expenses/${created.body.id}`)
        .auth('may-token', { type: 'bearer' }).expect(204);
    } finally {
      await db.query('delete from public.expenses where id = $1', [created.body.id]);
    }
  });
});

describe('receipt scan and confirmation', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const receipt = {
    documentType: 'receipt', payeeName: null,
    shopName: 'ร้านทดสอบ',
    purchaseDate: '2026-11-07',
    totalPaidSatang: 4500,
    lineItems: [
      { description: 'A', amountSatang: 2000 },
      { description: 'B', amountSatang: 3000 },
    ],
    adjustments: [{ description: 'ส่วนลดท้ายใบ', amountSatang: -500 }],
  };
  const geminiFetch = vi.fn<typeof fetch>();
  const scanApp = createApp({
    supabaseUrl: 'https://receipt-test.example',
    supabasePublishableKey: 'sb_publishable_fixture',
    fetch: supabaseFetch,
    geminiApiKey: 'test-gemini-key',
    geminiFetch,
  });

  beforeEach(() => {
    geminiFetch.mockReset();
    geminiFetch.mockImplementation(async () => Response.json({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(receipt) }] } }],
    }));
  });

  afterEach(async () => {
    await db.exec('delete from public.expenses where scan_id is not null');
    await db.query('delete from public.expenses where owner_id = $1', [emptyMember]);
    await db.exec('delete from public.receipt_scans');
  });

  function scan(token = 'empty-member-token') {
    return request(scanApp).post('/api/scans').auth(token, { type: 'bearer' })
      .set('Content-Type', 'image/png').send(png);
  }

  it('returns a reviewable draft and saves the confirmed breakdown without retaining image bytes', async () => {
    const scanned = await scan().expect(201);
    expect(scanned.body).toMatchObject({
      scanId: expect.any(String), receipt, readyToConfirm: true,
      reconciliation: { calculatedTotalSatang: 4500, differenceSatang: 0, matches: true },
    });
    const before = await queryAsUser(emptyMember, 'select id from public.expenses');
    expect(before.rows).toEqual([]);
    const metadata = await queryAsUser<Record<string, unknown>>(emptyMember,
      'select * from public.receipt_scans');
    expect(Object.keys(metadata.rows[0]).sort()).toEqual([
      'created_at', 'id', 'owner_id', 'photo_sha256',
    ]);
    const saved = await request(scanApp).post('/api/expenses')
      .auth('empty-member-token', { type: 'bearer' })
      .send({ ...receipt, scanId: scanned.body.scanId }).expect(201);
    const detail = await request(scanApp).get(`/api/expenses/${saved.body.id}`)
      .auth('empty-member-token', { type: 'bearer' }).expect(200);
    expect(detail.body).toEqual({
      id: saved.body.id, ...receipt, scanId: scanned.body.scanId,
    });
    await request(scanApp).get(`/api/expenses/${saved.body.id}`)
      .auth('alice-token', { type: 'bearer' }).expect(404);
    await request(scanApp).get(`/api/expenses/${saved.body.id}`)
      .auth('may-token', { type: 'bearer' }).expect(200);
  });

  it('scans and saves an itemless transfer with a separate payee and preserves ownership', async () => {
    const slip = { documentType: 'transfer', shopName: null, payeeName: 'Recipient Test',
      purchaseDate: '2026-11-07', totalPaidSatang: 25000, lineItems: null, adjustments: null };
    geminiFetch.mockImplementation(async () => Response.json({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(slip) }] } }],
    }));
    const scanned = await scan().expect(201);
    expect(scanned.body).toMatchObject({ receipt: slip, readyToConfirm: true });
    const saved = await request(scanApp).post('/api/expenses').auth('empty-member-token', { type: 'bearer' })
      .send({ documentType: 'transfer', payeeName: 'Recipient Test', purchaseDate: slip.purchaseDate,
        totalPaidSatang: slip.totalPaidSatang, scanId: scanned.body.scanId }).expect(201);
    const detail = await request(scanApp).get(`/api/expenses/${saved.body.id}`)
      .auth('empty-member-token', { type: 'bearer' }).expect(200);
    expect(detail.body).toMatchObject({ shopName: null, payeeName: 'Recipient Test', documentType: 'transfer', lineItems: null });
    const listed = await request(scanApp).get('/api/expenses').auth('empty-member-token', { type: 'bearer' }).expect(200);
    expect(listed.body.expenses[0]).toMatchObject({ payeeName: 'Recipient Test', documentType: 'transfer' });
    await request(scanApp).get(`/api/expenses/${saved.body.id}`).auth('alice-token', { type: 'bearer' }).expect(404);
    await request(scanApp).post('/api/expenses').auth('empty-member-token', { type: 'bearer' })
      .send({ documentType: 'transfer', purchaseDate: slip.purchaseDate, totalPaidSatang: 25000 }).expect(400);
  });

  it('allows correction of missing fields and flags a mismatch without inventing adjustments', async () => {
    geminiFetch.mockImplementation(async () => Response.json({
      candidates: [{ finishReason: 'STOP', content: { parts: [{
        text: JSON.stringify({ ...receipt, shopName: null, purchaseDate: null, adjustments: [] }),
      }] } }],
    }));
    const scanned = await scan().expect(201);
    expect(scanned.body).toMatchObject({
      readyToConfirm: false,
      receipt: { shopName: null, purchaseDate: null, adjustments: [] },
      reconciliation: { calculatedTotalSatang: 5000, differenceSatang: -500, matches: false },
    });
    await request(scanApp).post('/api/expenses')
      .auth('empty-member-token', { type: 'bearer' })
      .send({ ...scanned.body.receipt, scanId: scanned.body.scanId }).expect(400);
    await request(scanApp).post('/api/expenses')
      .auth('empty-member-token', { type: 'bearer' })
      .send({ ...receipt, adjustments: [], scanId: scanned.body.scanId }).expect(422);
    await request(scanApp).post('/api/expenses')
      .auth('empty-member-token', { type: 'bearer' })
      .send({ ...receipt, scanId: scanned.body.scanId }).expect(201);
  });

  it('guards concurrent confirmations and detects later duplicate uploads before invoking Gemini', async () => {
    const first = await scan().expect(201);
    const second = await scan().expect(201);
    const saved = await Promise.all([first, second].map(result =>
      request(scanApp).post('/api/expenses').auth('empty-member-token', { type: 'bearer' })
        .send({ ...receipt, scanId: result.body.scanId })));
    expect(saved.map(result => result.status).sort()).toEqual([201, 409]);
    expect(saved.find(result => result.status === 409)?.body).toEqual({ error: 'duplicate_receipt' });
    expect(geminiFetch).toHaveBeenCalledTimes(2);
    await scan().expect(409, { error: 'duplicate_receipt' });
    expect(geminiFetch).toHaveBeenCalledTimes(2);
    const rows = await queryAsUser(emptyMember, 'select id from public.expenses');
    expect(rows.rows).toHaveLength(1);
  });

  it('allows the same photo for different owners and after its saved expense is deleted', async () => {
    const first = await scan().expect(201);
    const saved = await request(scanApp).post('/api/expenses')
      .auth('empty-member-token', { type: 'bearer' })
      .send({ ...receipt, scanId: first.body.scanId }).expect(201);
    const bobScan = await scan('bob-token').expect(201);
    await request(scanApp).post('/api/expenses').auth('bob-token', { type: 'bearer' })
      .send({ ...receipt, scanId: bobScan.body.scanId }).expect(201);
    await request(scanApp).delete(`/api/expenses/${saved.body.id}`)
      .auth('empty-member-token', { type: 'bearer' }).expect(204);
    const again = await scan().expect(201);
    await request(scanApp).post('/api/expenses').auth('empty-member-token', { type: 'bearer' })
      .send({ ...receipt, scanId: again.body.scanId }).expect(201);
  });

  it('blocks foreign scan IDs and requires complete item data at confirmation', async () => {
    const scanned = await scan().expect(201);
    await request(scanApp).post('/api/expenses').auth('alice-token', { type: 'bearer' })
      .send({ ...receipt, scanId: scanned.body.scanId }).expect(403);
    const { lineItems: _items, adjustments: _adjustments, ...header } = receipt;
    await request(scanApp).post('/api/expenses')
      .auth('empty-member-token', { type: 'bearer' })
      .send({ ...header, scanId: scanned.body.scanId }).expect(400);
    for (const user of [alice, may, guest]) {
      const otherScans = await queryAsUser(user, 'select id from public.receipt_scans');
      expect(otherScans.rows).toEqual([]);
    }
  });

  it('keeps corrections reconciled, including when requests go directly to PostgreSQL', async () => {
    const scanned = await scan().expect(201);
    const saved = await request(scanApp).post('/api/expenses')
      .auth('empty-member-token', { type: 'bearer' })
      .send({ ...receipt, scanId: scanned.body.scanId }).expect(201);
    await request(scanApp).patch(`/api/expenses/${saved.body.id}`)
      .auth('empty-member-token', { type: 'bearer' })
      .send({ totalPaidSatang: 5000 }).expect(422);
    await expect(queryAsUser(emptyMember, `
      update public.expenses set total_paid_satang = 5000 where id = $1
    `, [saved.body.id])).rejects.toMatchObject({ code: '23514' });
    const unchanged = await request(scanApp).get(`/api/expenses/${saved.body.id}`)
      .auth('empty-member-token', { type: 'bearer' }).expect(200);
    expect(unchanged.body.totalPaidSatang).toBe(4500);
    await request(scanApp).patch(`/api/expenses/${saved.body.id}`)
      .auth('empty-member-token', { type: 'bearer' })
      .send({ totalPaidSatang: 5000, adjustments: [] }).expect(200);
    await expect(queryAsUser(emptyMember, `
      update public.expenses set line_items = '[]'::jsonb where id = $1
    `, [saved.body.id])).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects invalid uploads and requires active membership before scanning', async () => {
    await request(scanApp).post('/api/scans').set('Content-Type', 'image/png').send(png).expect(401);
    await scan('guest-token').expect(403);
    await request(scanApp).post('/api/scans').auth('empty-member-token', { type: 'bearer' })
      .set('Content-Type', 'application/pdf').send(png).expect(415);
    await request(scanApp).post('/api/scans').auth('empty-member-token', { type: 'bearer' })
      .set('Content-Type', 'image/png').send(Buffer.from('Not an image')).expect(400);
    await request(scanApp).post('/api/scans').auth('empty-member-token', { type: 'bearer' })
      .set('Content-Type', 'image/png').send(Buffer.alloc(4 * 1024 * 1024 + 1)).expect(413);
    expect(geminiFetch).not.toHaveBeenCalled();
  });

  it('returns safe errors for missing configuration and Gemini failures without creating scan metadata', async () => {
    await request(app).post('/api/scans').auth('empty-member-token', { type: 'bearer' })
      .set('Content-Type', 'image/png').send(png).expect(503);
    geminiFetch.mockImplementation(async () => new Response('private error', { status: 429 }));
    await scan().expect(429, { error: 'gemini_quota_exceeded' });
    geminiFetch.mockImplementation(async () => new Response('private error', { status: 500 }));
    await scan().expect(502, { error: 'receipt_extraction_failed' });
    const rows = await queryAsUser(emptyMember, 'select id from public.receipt_scans');
    expect(rows.rows).toEqual([]);
  });

  it('keeps legacy expense details readable with no line-item breakdown', async () => {
    const existing = await db.query<{ id: string }>(
      "select id from public.expenses where shop_name = 'Alice shop'",
    );
    const detail = await request(scanApp).get(`/api/expenses/${existing.rows[0].id}`)
      .auth('alice-token', { type: 'bearer' }).expect(200);
    expect(detail.body).toMatchObject({ lineItems: null, adjustments: [], scanId: null });
  });
});
