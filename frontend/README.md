# Receipt Scanner test UI

This is a simple development interface for the backend, not the final team design.

1. In `backend`, configure `.env` and run `npm run dev` on port 3000.
2. In `frontend`, run `npm ci`. Copy `.env.example` to `.env` and set the same Supabase URL and **publishable** key used by the backend. Never put the Gemini key or service-role key in frontend variables.
3. In Supabase Authentication → URL Configuration, add `http://127.0.0.1:5173` to Redirect URLs. Open `http://127.0.0.1:5173` after running `npm run dev` in `frontend`.
4. Google accounts must be able to complete the OAuth consent flow. The app automatically enrolls signed-in accounts as regular members; Finance Head can be assigned only by an administrator. While Google OAuth is in Testing, its test-user restrictions or warnings may apply.

The Vite development server proxies `/api` to the backend. The UI displays the access role from Supabase, but the backend and database independently enforce all permissions. Filters are submitted with the button; month requires year. Department filtering uses the exact current department name. The owner filter accepts a UUID. Scanned receipts must be reviewed and totals must match before saving.

Select the document type and enter a shop name or payee name. Transfer slips may have no line items. Apply the transfer-slip migration before using these fields.

Run `npm test` and `npm run build` for local checks. Production hosting and its OAuth redirect URL require separate configuration.
