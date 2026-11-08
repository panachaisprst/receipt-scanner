# Receipt Scanner

[![CI](https://github.com/panachaisprst/receipt-scanner/actions/workflows/ci.yml/badge.svg)](https://github.com/panachaisprst/receipt-scanner/actions/workflows/ci.yml)

An AI-assisted course team project for scanning Thai and English receipts and bank transfer slips, reviewing extracted details, and saving expenses in THB.

This repository is a portfolio snapshot of a course team project. Panachai Seeprasert designed the overall application and workflow; Codex generated most of the implementation and test code. The original MIT license and copyright are retained.

## Features

- Google sign-in through Supabase Auth and automatic member enrollment.
- Gemini extraction with structured output validation and user review before saving.
- Expense creation, editing and deletion, with line items and receipt adjustments.
- Exact monetary reconciliation using integer satang.
- PostgreSQL row level security: members manage their own expenses; Finance Head can read team expenses.
- Calendar, owner and department filters, pagination and running totals.
- Per-user image fingerprints and a database uniqueness constraint to prevent duplicate saves.
- Automated tests for validation, authorization, database constraints and concurrent receipt confirmation.

## Stack

- Frontend: React, TypeScript and Vite.
- Backend: Node.js 24+, Express, TypeScript and Zod.
- Authentication and database: Supabase Auth and PostgreSQL.
- Receipt extraction: Gemini API.
- Tests: Vitest, Supertest and PGlite.

## Run locally

1. Install Node.js 24 or newer.
2. Create a development Supabase project and apply all SQL files in `supabase/migrations/` in filename order.
3. Configure Google sign-in and the development redirect URL in Supabase.
4. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`. Fill in the development project settings and a server-side Gemini API key. Never commit actual environment files or keys.
5. Install dependencies:

   ```sh
   npm ci --prefix backend
   npm ci --prefix frontend
   ```

6. Run the backend and frontend in separate terminals:

   ```sh
   npm run dev --prefix backend
   npm run dev --prefix frontend
   ```

See [backend documentation](backend/README.md) for API behavior and [the frontend guide](frontend/README.md) for its configuration and development proxy.

## Validation

[GitHub Actions](https://github.com/panachaisprst/receipt-scanner/actions/workflows/ci.yml) runs these checks on every push and pull request, and can also be triggered manually. It additionally builds the standalone prototype and checks its generated JavaScript. Tests need no Gemini key or live Supabase project. CI does not deploy the app.

The current baseline is **45 automated test cases in total: 44 backend + 1 frontend**. Counts refer to Vitest test cases, not assertions or extraction samples.

| Suite | What it checks |
| --- | --- |
| Backend | API validation, authorization and direct database access, receipt reconciliation, simulated Gemini failures, duplicate confirmation races |
| Frontend | Money parsing and formatting, including fractional satang and invalid input |


```sh
npm test --prefix backend
npm run typecheck --prefix backend
npm test --prefix frontend
npm run build --prefix frontend
```

Backend tests simulate Supabase and Gemini services and apply the migrations to PGlite. They do not establish live OAuth configuration, receipt extraction accuracy, production scale or uptime. Most test code was generated with Codex; passing tests alone are not independent verification.

See [engineering decisions and verification](ENGINEERING.md) for why duplicate protection lives in a database constraint, how ownership is enforced, what the tests assert and what still needs validation.

## Deployment and project context

- [Vercel deployment](DEPLOYMENT.md)
- [Project terminology and access rules](CONTEXT.md)
- [Terminal guide](TERMINAL_GUIDE.md)
- `receipt-scanner-demo/`: an earlier standalone receipt extraction prototype, separate from the full application in `frontend/` and `backend/`.

Use synthetic receipts and mock financial data for demonstrations.

## License

[MIT](LICENSE). Original project copyright: Aphoxia. This snapshot is published by Panachai Seeprasert.
