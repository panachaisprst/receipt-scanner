# Vercel test deployment

Import the repository with the project root set to the repository root and Node.js 24. The root build command installs both packages and builds the Vite frontend. The Vercel Function in `api/[...path].ts` runs the same Express app without opening a listening port. Image uploads and JSON parsing are handled by Express.

Set these environment variables in Vercel for the deployment environment:

* `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`: the public Supabase project URL and publishable key. These are embedded in the frontend build.
* `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`: the same URL and publishable key for the backend.
* `GEMINI_API_KEY`: server-side only. Never use a `VITE_` prefix for this key.
* `GEMINI_MODEL`: optional; defaults to `gemini-3.5-flash-lite`.

Apply Supabase migrations through `20261107000005_open_membership_departments.sql` first. Add the exact deployed origin to Supabase Auth Redirect URLs. While Google OAuth is in Testing, add each tester in Google Cloud OAuth Audience. The app enrolls signed-in users as regular members; only a trusted administrator can assign Finance Head.

Check the deployed page, Google login, an authenticated expense request, and a synthetic image upload before sharing. Vercel routing, upload limits, deployment protection and function timeouts must be verified in the deployed environment; local tests alone do not verify those platform integrations. Only use mock financial data for the course demonstration.
