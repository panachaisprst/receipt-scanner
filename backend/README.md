# Receipt Scanner backend

## Transfer slips and payees

Apply `20261107000004_transfer_slips.sql` after the earlier migrations. Expenses now include `documentType` (`receipt` or `transfer`) and an optional `payeeName`, separate from `shopName`. At least one of shop or payee is required. Existing expenses remain receipts. A scanned receipt requires line items; a transfer slip can be saved without a breakdown. When a breakdown is provided, its total must still reconcile. The user must check the extracted recipient and amount before saving. The existing ownership and Finance Head rules still apply.

Milestones 1–4 expose personal expense management, Finance Head reporting, and receipt extraction with confirmation. Use Node.js 24 or newer.

The frontend calls `ensure_member()` after sign-in to enroll the authenticated user as a regular member. Department selections are self-declared labels, separate from the protected Finance Head permission. Removing a membership alone does not permanently block a user from re-enrolling while open membership is enabled.

## Run locally

1. Apply the SQL files in `supabase/migrations/` to a development Supabase project, in filename order.
2. Create two test users under **Authentication → Users**. Use their UUIDs to add membership rows and expenses in the SQL editor. Run the following once per test user, replacing the UUID and sample values.

   ```sql
   insert into public.organization_members (user_id)
   values ('<test-user-uuid>');

   insert into public.expenses (owner_id, shop_name, purchase_date, total_paid_satang)
   values ('<test-user-uuid>', 'Sample shop', '2026-11-07', 4500);
   ```

3. From this directory run `npm ci`, copy `.env.example` to `.env`, and fill in the development project's URL and publishable key. Run `npm run dev`.
4. Sign in with a test user through Supabase Auth and pass that session's access token to the API. The example reads the token from your shell environment.

   ```sh
   curl -H "Authorization: Bearer ${RECEIPT_TEST_ACCESS_TOKEN}" \
     'http://127.0.0.1:3000/api/expenses?limit=10&offset=0'
   ```

The endpoint returns `expenses`, `runningTotalSatang`, and `totalCount`. Each expense has `id`, `shopName`, `purchaseDate`, and `totalPaidSatang`. The total and count cover all of the caller's expenses. Pages are sorted by purchase date descending, with the expense ID as a tie breaker.

## Finance Head reporting

A trusted project administrator assigns Finance Head access in the SQL editor.

```sql
update public.organization_members
set access_role = 'finance_head'
where user_id = '<finance-head-user-uuid>';
```

`GET /api/expenses` defaults to `scope=own` for every user. Finance Head can request
`GET /api/expenses?scope=organization&year=2026&month=11&department=IT&limit=10`.
Organization results also include `ownerId`. Filters apply before pagination and totals.

| Query parameter | Meaning |
| --- | --- |
| `scope` | `own` or `organization`. Organization scope requires Finance Head. |
| `ownerId` | Owner UUID. Available in organization scope. |
| `department` | Exact, case-sensitive current department name. Available in organization scope. |
| `year` | Purchase year from 1 to 9998. |
| `month` | Purchase month from 1 to 12. Requires `year`. |
| `limit`, `offset` | Page size from 1 to 100 (default 50), and zero-based offset (default 0). |

The development database represents one team. Organization reports include all retained
expenses, including those owned by users whose membership has been removed.
Department filters use current assignments. An expense contributes once even when
its owner belongs to multiple departments. Administrators can populate `departments`
and `user_departments` with development data in the SQL editor.
Finance Head status is read from the protected membership table for each request.
Members can create, edit and delete their own expenses. Finance Head can read team
expenses and manage their own expenses.

## Expense writes

All write routes require a verified Supabase access token and active membership.
Apply `20261107000002_expense_writes.sql` after the two earlier migrations.

| Request | Body | Successful response |
| --- | --- | --- |
| `POST /api/expenses` | All three fields below | `201` and the new expense |
| `PATCH /api/expenses/:id` | One or more of those fields | `200` and the updated expense |
| `DELETE /api/expenses/:id` | None | `204` with an empty body |

```json
{
  "shopName": "Sample shop",
  "purchaseDate": "2026-11-07",
  "totalPaidSatang": 4500
}
```

Shop names are trimmed and must have 1–200 characters. Purchase dates must be real
calendar dates in `YYYY-MM-DD` format, from year 0001. Amounts are integer satang
from 0 to 2147483647. PATCH requires at least one field. Unexpected fields,
including ownership and system-generated fields, return `400`.

PostgreSQL generates the expense ID and assigns ownership from the caller's verified
identity. Column privileges prevent users from inserting or changing `owner_id`.
Each write is a single database statement. RLS requires current membership and
ownership for writes, including requests made directly to Supabase.

PATCH and DELETE return `404` when there is no matching owned expense.
Malformed JSON returns `400`; JSON bodies over 16 KB return `413`.
Manual POST requests create separate expense records. Scanned expenses use a
photo fingerprint to prevent duplicate saves for the same owner.

## Scan, review and confirm a receipt

Apply `20261107000003_receipt_scanning.sql` after the earlier migrations.
Add `GEMINI_API_KEY` to the backend's ignored `.env` file. The default model is
`gemini-3.5-flash-lite`, matching the existing demo. Set `GEMINI_MODEL` to use
another compatible model. Existing expense routes can run without a Gemini key;
the scan route returns `503` until a key is configured.

1. Send a JPEG, PNG or WebP image as the raw HTTP body. The API checks its MIME
   type, magic bytes, and a 4 MiB upload limit.

   ```sh
   curl -X POST -H "Authorization: Bearer ${RECEIPT_TEST_ACCESS_TOKEN}" \
     -H 'Content-Type: image/jpeg' --data-binary @receipt.jpg \
     http://127.0.0.1:3000/api/scans
   ```

2. A successful `201` response contains `scanId`, `receipt`, `reconciliation`
   and `readyToConfirm`. No expense is saved yet. Null fields need correction.
   `differenceSatang` is the printed total minus the calculated total, or null
   when amounts are incomplete. `readyToConfirm` indicates complete fields and
   matching arithmetic; the user still reviews the extraction before saving.

3. Send the reviewed fields and `scanId` to `POST /api/expenses`.

   ```json
   {
     "scanId": "<scan-uuid>",
     "shopName": "ร้านตัวอย่าง",
     "purchaseDate": "2026-11-07",
     "totalPaidSatang": 4500,
     "lineItems": [
       { "description": "สินค้า A", "amountSatang": 2000 },
       { "description": "สินค้า B", "amountSatang": 3000 }
     ],
     "adjustments": [
       { "description": "ส่วนลดท้ายใบ", "amountSatang": -500 }
     ]
   }
   ```

4. `GET /api/expenses/:id` returns the saved header, `lineItems`, `adjustments`
   and `scanId`. Owners and Finance Head can read saved details. Lists and
   summaries continue to count the final receipt total once.

Line amounts include quantity and any item-level discount. Adjustments represent
receipt-level changes excluded from line amounts, such as a negative discount or
a positive fee. Tax already included in item prices is excluded from adjustments.
The API flags mismatches for correction and never invents a balancing adjustment.
There can be 1–100 items and 0–20 adjustments, each with a 1–200 character
description and integer satang amount. Item amounts are nonnegative.

Detailed expenses must satisfy `sum(lineItems) + sum(adjustments) = totalPaidSatang`.
PostgreSQL checks the complete row on inserts and updates, including direct
Supabase writes. PATCH can replace either array. When changing a total and its
breakdown, send both in the same PATCH. A mismatch returns `422` and leaves the
saved row intact. Legacy expenses without a breakdown remain readable and editable.

The app keeps the image transient while sending it to Gemini. Stored scan metadata
contains a UUID, owner, SHA-256 fingerprint and creation time. Users can read only
their own scan metadata. Finance Head reads confirmed expenses.
Fingerprints identify exact image bytes per owner. Separate photos of the same
purchase can be saved separately. A unique database index makes concurrent
duplicate confirmations return one `201` and one `409`. Re-uploading an already
saved photo returns `409` before another Gemini call. Deleting the expense allows
that photo to be saved again.

Gemini calls time out after 45 seconds. Quota errors return `429`; failed, blocked,
truncated or invalid extractions return `502`. Uploads with unsupported MIME
types return `415`, invalid signatures return `400`, and oversized bodies
return `413`. Provider diagnostics and keys are excluded from API responses.

## Run the tests

Run `npm test` and `npm run typecheck` from this directory. Supertest calls the Express app on a loopback port. The suite applies the migrations to PGlite and runs the database queries as separate users. It uses simulated Supabase Auth, Data API and Gemini HTTP services, so the suite runs without project credentials. These tests cover local PostgreSQL rules and API behavior. Live Supabase configuration, Google sign-in and Gemini extraction quality require separate integration checks.
