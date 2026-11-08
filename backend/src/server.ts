import { z } from 'zod';
import { createConfiguredApp } from './config.ts';

const config = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
}).safeParse(process.env);

if (!config.success) {
  const names = config.error.issues.map(issue => issue.path.join('.')).join(', ');
  throw new Error(`Missing or invalid configuration: ${names}`);
}

const app = createConfiguredApp();

app.listen(config.data.PORT, '127.0.0.1', () => {
  console.log(`Receipt Scanner API listening on http://127.0.0.1:${config.data.PORT}`);
});
