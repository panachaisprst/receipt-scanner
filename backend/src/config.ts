import { z } from 'zod';
import { createApp } from './app.ts';

export function createConfiguredApp() {
  const config = z.object({
    SUPABASE_URL: z.url({ protocol: /^https?$/ }),
    SUPABASE_PUBLISHABLE_KEY: z.string().regex(/^sb_publishable_\S+$/),
    GEMINI_API_KEY: z.string().min(1).optional(),
    GEMINI_MODEL: z.string().regex(/^[a-zA-Z0-9.-]+$/).default('gemini-3.5-flash-lite'),
  }).safeParse(process.env);
  if (!config.success) {
    throw new Error(`Missing or invalid configuration: ${config.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
  }
  return createApp({
    supabaseUrl: config.data.SUPABASE_URL,
    supabasePublishableKey: config.data.SUPABASE_PUBLISHABLE_KEY,
    geminiApiKey: config.data.GEMINI_API_KEY,
    geminiModel: config.data.GEMINI_MODEL,
    vercelRouting: process.env.VERCEL === '1',
  });
}
