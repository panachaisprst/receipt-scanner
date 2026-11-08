import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import {
  adjustments, expenseFields, extractReceipt, lineItems, matchesImage,
  ReceiptScanError, reconcileReceipt,
} from './receipt.ts';

type AppConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  fetch?: typeof globalThis.fetch;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiFetch?: typeof globalThis.fetch;
  vercelRouting?: boolean;
};

type Session = {
  supabase: SupabaseClient;
  userId: string;
  accessRole: string;
};

const breakdownFields = { lineItems: lineItems.optional(), adjustments: adjustments.optional() };
const createExpense = z.strictObject({
  ...expenseFields,
  documentType: expenseFields.documentType.default('receipt'),
  ...breakdownFields,
  scanId: z.uuid().optional(),
}).refine(value => !!(value.shopName || value.payeeName))
  .refine(value => value.scanId === undefined || value.documentType === 'transfer' || value.lineItems !== undefined);
const updateExpense = z.strictObject({ ...expenseFields, ...breakdownFields })
  .partial().refine(value => Object.keys(value).length > 0);
const expenseId = z.uuid();
const expenseSelection = 'id, shopName:shop_name, payeeName:payee_name, documentType:document_type, purchaseDate:purchase_date, totalPaidSatang:total_paid_satang';
const expenseDetailSelection = expenseSelection + ', lineItems:line_items, adjustments, scanId:scan_id';

const expenseQuery = z.strictObject({
  scope: z.enum(['own', 'organization']).optional(),
  ownerId: z.uuid().optional(),
  department: z.string().trim().min(1).max(50).optional(),
  year: z.string().regex(/^[0-9]{1,4}$/).transform(Number).pipe(z.int().min(1).max(9998)).optional(),
  month: z.string().regex(/^[0-9]{1,2}$/).transform(Number).pipe(z.int().min(1).max(12)).optional(),
  day: z.string().regex(/^[0-9]{1,2}$/).transform(Number).pipe(z.int().min(1).max(31)).optional(),
  limit: z.string().regex(/^[0-9]{1,3}$/).transform(Number).pipe(z.int().min(1).max(100)).optional(),
  offset: z.string().regex(/^[0-9]{1,10}$/).transform(Number).pipe(z.int().min(0).max(2_147_483_647)).optional(),
});

export function createApp(config: AppConfig) {
  const app = express();

  app.use(['/api/expenses', '/api/scans'], async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const token = /^Bearer (\S+)$/i.exec(req.get('Authorization') ?? '')?.[1];
    if (!token) {
      return res.status(401).json({ error: 'unauthenticated' });
    }

    // Create a fresh client for each request to keep callers' tokens separate.
    const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: config.fetch,
      },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError) {
      if (authError.status === 400 || authError.status === 401 || authError.status === 403) {
        return res.status(401).json({ error: 'unauthenticated' });
      }
      return res.status(503).json({ error: 'authentication_unavailable' });
    }
    if (!user) {
      return res.status(401).json({ error: 'unauthenticated' });
    }

    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('user_id, access_role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) {
      return res.status(403).json({ error: 'membership_required' });
    }

    res.locals.session = {
      supabase,
      userId: user.id,
      accessRole: membership.access_role,
    } satisfies Session;
    next();
  });

  app.use('/api/expenses', express.json({ limit: '16kb' }));

  app.post('/api/scans', express.raw({ type: () => true, limit: '4mb', inflate: false }), async (req, res) => {
    const mimeType = req.get('Content-Type')?.split(';')[0].trim().toLowerCase() ?? '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      return res.status(415).json({ error: 'unsupported_receipt_image' });
    }
    if (!Buffer.isBuffer(req.body) || !matchesImage(req.body, mimeType)) {
      return res.status(400).json({ error: 'invalid_receipt_image' });
    }
    if (!config.geminiApiKey) {
      return res.status(503).json({ error: 'receipt_scanning_unavailable' });
    }
    const { supabase, userId }: Session = res.locals.session;
    const fingerprint = createHash('sha256').update(req.body).digest('hex');
    const { data: duplicate, error: duplicateError } = await supabase.from('expenses')
      .select('id').eq('owner_id', userId).eq('photo_sha256', fingerprint).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) return res.status(409).json({ error: 'duplicate_receipt' });

    const receipt = await extractReceipt(
      req.body, mimeType, config.geminiApiKey,
      config.geminiModel ?? 'gemini-3.5-flash-lite', config.geminiFetch,
    );
    const { data: scan, error } = await supabase.from('receipt_scans')
      .insert({ photo_sha256: fingerprint }).select('id').single();
    if (error) throw error;
    const reconciliation = reconcileReceipt(receipt);
    const complete = createExpense.safeParse({ ...receipt, lineItems: receipt.lineItems ?? undefined, adjustments: receipt.adjustments ?? undefined, scanId: scan.id }).success;
    return res.status(201).json({
      scanId: scan.id, receipt, reconciliation,
      readyToConfirm: complete && (receipt.documentType === 'transfer' && receipt.lineItems === null || reconciliation.matches),
    });
  });

  app.get('/api/expenses', async (req, res) => {
    const { supabase, accessRole }: Session = res.locals.session;
    const parameters = { ...req.query };
    // Vercel adds the catch-all route parameter to its query helper. It is not
    // a user-selected filter; keep rejecting any other unexpected parameters.
    const routeParameter = parameters['...path'];
    if (config.vercelRouting && (routeParameter === 'expenses'
      || (Array.isArray(routeParameter) && routeParameter.length === 1 && routeParameter[0] === 'expenses'))) {
      delete parameters['...path'];
    }
    const query = expenseQuery.safeParse(parameters);
    if (!query.success) {
      return res.status(400).json({ error: 'invalid_expense_query' });
    }

    const scope = query.data.scope ?? 'own';
    if (scope === 'organization' && accessRole !== 'finance_head') {
      return res.status(403).json({ error: 'finance_head_required' });
    }
    if (
      (scope === 'own' && (query.data.ownerId !== undefined || query.data.department !== undefined))
    ) {
      return res.status(400).json({ error: 'invalid_expense_query' });
    }

    const { data, error } = await supabase.rpc('list_expenses_calendar', {
      requested_scope: scope,
      filter_owner_id: query.data.ownerId ?? null,
      filter_department: query.data.department ?? null,
      filter_year: query.data.year ?? null,
      filter_month: query.data.month ?? null,
      filter_day: query.data.day ?? null,
      page_limit: query.data.limit ?? 50,
      page_offset: query.data.offset ?? 0,
    });

    if (error?.code === '42501') {
      return res.status(403).json({ error: 'access_denied' });
    }
    if (error) throw error;
    return res.json(data);
  });

  app.post('/api/expenses', async (req, res) => {
    const body = createExpense.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'invalid_expense' });
    }
    if (body.data.lineItems) {
      const reconciliation = reconcileReceipt({
        ...body.data, lineItems: body.data.lineItems, adjustments: body.data.adjustments ?? [],
      });
      if (!reconciliation.matches) {
        return res.status(422).json({ error: 'expense_totals_mismatch', reconciliation });
      }
    }
    const { supabase }: Session = res.locals.session;
    const { data, error } = await supabase.from('expenses').insert({
      shop_name: body.data.shopName,
      payee_name: body.data.payeeName,
      document_type: body.data.documentType,
      purchase_date: body.data.purchaseDate,
      total_paid_satang: body.data.totalPaidSatang,
      scan_id: body.data.scanId,
      line_items: body.data.lineItems,
      adjustments: body.data.adjustments,
    }).select(expenseSelection).single();
    // PostgreSQL supplies owner_id from the verified caller's identity.
    if (error) throw error;
    return res.status(201).json(data);
  });

  app.get('/api/expenses/:id', async (req, res) => {
    const id = expenseId.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'invalid_expense_id' });
    const { supabase }: Session = res.locals.session;
    const { data, error } = await supabase.from('expenses')
      .select(expenseDetailSelection).eq('id', id.data).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'expense_not_found' });
    return res.json(data);
  });

  app.patch('/api/expenses/:id', async (req, res) => {
    const id = expenseId.safeParse(req.params.id);
    const body = updateExpense.safeParse(req.body);
    if (!id.success || !body.success) {
      return res.status(400).json({ error: 'invalid_expense' });
    }
    const { supabase, userId }: Session = res.locals.session;
    const { data, error } = await supabase.from('expenses').update({
      shop_name: body.data.shopName,
      payee_name: body.data.payeeName,
      document_type: body.data.documentType,
      purchase_date: body.data.purchaseDate,
      total_paid_satang: body.data.totalPaidSatang,
      line_items: body.data.lineItems,
      adjustments: body.data.adjustments,
    }).eq('id', id.data).eq('owner_id', userId).select(expenseSelection).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'expense_not_found' });
    return res.json(data);
  });

  app.delete('/api/expenses/:id', async (req, res) => {
    const id = expenseId.safeParse(req.params.id);
    if (!id.success) {
      return res.status(400).json({ error: 'invalid_expense_id' });
    }
    const { supabase, userId }: Session = res.locals.session;
    const { data, error } = await supabase.from('expenses').delete()
      .eq('id', id.data).eq('owner_id', userId).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'expense_not_found' });
    return res.status(204).end();
  });

  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ReceiptScanError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'invalid_json' });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'request_too_large' });
    }
    if (error.status === 415) {
      return res.status(415).json({ error: 'unsupported_receipt_image' });
    }
    if (error.code === '23505') {
      return res.status(409).json({ error: 'duplicate_receipt' });
    }
    if (error.code === '23514') {
      return res.status(422).json({ error: 'invalid_expense_breakdown' });
    }
    if (error.code === '42501') {
      return res.status(403).json({ error: 'access_denied' });
    }
    res.status(500).json({ error: 'internal_error' });
  };
  app.use(handleError);

  return app;
}
