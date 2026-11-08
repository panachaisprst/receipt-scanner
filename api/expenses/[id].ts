import { createConfiguredApp } from '../../backend/src/config.ts';

// Vercel's generic /api/[...path] function handles one path segment here;
// provide an explicit route for expense IDs so Express receives nested URLs.
export const config = { api: { bodyParser: false } };
export default createConfiguredApp();
