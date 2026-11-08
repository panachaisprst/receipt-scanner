import { describe, expect, it, vi } from 'vitest';
import { extractReceipt, matchesImage, reconcileReceipt } from '../src/receipt.ts';

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
const png = Buffer.from('89504e470d0a1a0a', 'hex');

function providerResult(value: unknown, finishReason = 'STOP') {
  return Response.json({
    candidates: [{ finishReason, content: { parts: [
      { thought: true, text: 'Exclude internal reasoning' },
      { text: JSON.stringify(value) },
    ] } }],
  });
}

describe('receipt extraction', () => {
  it('sends the image, schema and key to Gemini and validates the returned receipt', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => providerResult(receipt));
    expect(await extractReceipt(png, 'image/png', 'test-key', 'gemini-test', fetch)).toEqual(receipt);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    const req = new Request(url, options);
    expect(req.headers.get('x-goog-api-key')).toBe('test-key');
    const body = await req.json();
    expect(body.contents[0].parts[1].inlineData).toEqual({
      mimeType: 'image/png', data: png.toString('base64'),
    });
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseJsonSchema.required).toContain('lineItems');
  });

  it('keeps unreadable fields null and normalizes invalid dates for user correction', async () => {
    const partial = { ...receipt, shopName: '', purchaseDate: '2026-02-30', lineItems: null };
    const fetch: typeof globalThis.fetch = async () => providerResult(partial);
    const extracted = await extractReceipt(png, 'image/png', 'test-key', 'gemini-test', fetch);
    expect(extracted).toMatchObject({ shopName: null, purchaseDate: null, lineItems: null });
    expect(reconcileReceipt(extracted)).toEqual({
      calculatedTotalSatang: null, differenceSatang: null, matches: false,
    });
  });

  it('preserves negative printed rows as adjustments for review', async () => {
    const raw = { ...receipt, lineItems: [...receipt.lineItems, { description: 'Credit note', amountSatang: -500 }], adjustments: [] };
    const extracted = await extractReceipt(png, 'image/png', 'test-key', 'gemini-test', async () => providerResult(raw));
    expect(extracted.lineItems).toEqual(receipt.lineItems);
    expect(extracted.adjustments).toEqual([{ description: 'Credit note', amountSatang: -500 }]);
    expect(reconcileReceipt(extracted).matches).toBe(true);
  });

  it('rejects quota errors, provider failures, truncation, malformed responses and invalid amounts', async () => {
    const responses = [
      { response: new Response('', { status: 429 }), status: 429 },
      { response: new Response('secret provider diagnostics', { status: 500 }), status: 502 },
      { response: providerResult(receipt, 'MAX_TOKENS'), status: 502 },
      { response: Response.json({ candidates: [] }), status: 502 },
      { response: new Response('invalid JSON'), status: 502 },
      { response: providerResult({ ...receipt, totalPaidSatang: 1.5 }), status: 502 },
    ];
    for (const { response, status } of responses) {
      await expect(extractReceipt(png, 'image/png', 'test-key', 'gemini-test', async () => response))
        .rejects.toMatchObject({ status });
    }
    await expect(extractReceipt(png, 'image/png', 'test-key', 'gemini-test', async () => {
      throw new DOMException('Timed out', 'TimeoutError');
    })).rejects.toMatchObject({ status: 502, message: 'receipt_extraction_failed' });
  });
});

describe('receipt arithmetic and upload signatures', () => {
  it('matches line amounts plus explicit adjustments exactly in integer satang', () => {
    expect(reconcileReceipt(receipt)).toEqual({
      calculatedTotalSatang: 4500, differenceSatang: 0, matches: true,
    });
    expect(reconcileReceipt({ ...receipt, adjustments: [] })).toEqual({
      calculatedTotalSatang: 5000, differenceSatang: -500, matches: false,
    });
    expect(reconcileReceipt({ ...receipt, totalPaidSatang: null }).matches).toBe(false);
    expect(reconcileReceipt({ ...receipt, lineItems: [] }).matches).toBe(false);
  });

  it('checks JPEG, PNG and WebP magic bytes against the declared MIME type', () => {
    expect(matchesImage(png, 'image/png')).toBe(true);
    expect(matchesImage(Buffer.from([255, 216, 255, 0]), 'image/jpeg')).toBe(true);
    expect(matchesImage(Buffer.from('RIFF0000WEBP'), 'image/webp')).toBe(true);
    expect(matchesImage(png, 'image/jpeg')).toBe(false);
    expect(matchesImage(Buffer.from('hello'), 'image/png')).toBe(false);
    expect(matchesImage(Buffer.alloc(0), 'image/png')).toBe(false);
  });
});
