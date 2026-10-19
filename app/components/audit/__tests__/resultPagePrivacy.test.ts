import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CAPTURED_PROFILES } from '@/lib/engine/__tests__/fixtures';
import { runPdfAudit } from '@/lib/engine/scoring';
import type { AuditRecord } from '@/lib/storage/auditStore';

// The permanent result page is a shareable link: anyone holding it must not
// learn the owner's address. Render the real server component with a mocked
// store and inspect the HTML it produces.

const RAW = 'zebulon.quartermaine@vexillology-leaktest.org';
const RAW_PARTS = ['zebulon', 'quartermaine', 'vexillology', 'leaktest'];

let record: AuditRecord | null = null;
vi.mock('@/lib/storage/auditStore', () => ({
  getAuditStore: async () => ({ get: async () => record }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const profile = Object.values(CAPTURED_PROFILES)[0]!;

function makeRecord(over: Partial<AuditRecord> = {}): AuditRecord {
  const { audit } = runPdfAudit(profile);
  return {
    auditId: 'audit-privacy-test',
    createdAt: '2026-10-18T00:00:00.000Z',
    email: RAW,
    emailedAt: '2026-10-18T00:00:00.000Z',
    profile,
    audit,
    selfReport: null,
    userAgent: null,
    ipHash: null,
    auditMode: 'pdf',
    ...over,
  } as AuditRecord;
}

async function renderPage(): Promise<string> {
  const { default: AuditResultPage } = await import('@/app/audit/result/[auditId]/page');
  const el = await AuditResultPage({ params: Promise.resolve({ auditId: 'audit-privacy-test' }) });
  return renderToStaticMarkup(el);
}

describe('result page email privacy (rendered)', () => {
  beforeEach(() => {
    record = makeRecord();
  });

  it('renders the masked email and never the raw address or its parts', async () => {
    const html = await renderPage();
    expect(html).toContain('z***@v***.org');
    expect(html).not.toContain(RAW);
    for (const part of RAW_PARTS) expect(html.toLowerCase()).not.toContain(part);
  });

  it('also holds for legacy records recomputed on the page', async () => {
    record = makeRecord({ auditMode: undefined });
    const html = await renderPage();
    expect(html).toContain('z***@v***.org');
    for (const part of RAW_PARTS) expect(html.toLowerCase()).not.toContain(part);
  });

  it('falls back to generic copy when the stored email cannot be masked', async () => {
    record = makeRecord({ email: 'not-an-email' });
    const html = await renderPage();
    expect(html).toContain('EMAILED TO YOUR ADDRESS');
    expect(html).not.toContain('not-an-email');
  });

  it('is not found for ungated records', async () => {
    record = makeRecord({ email: null });
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('result page source guard (coarse)', () => {
  // Rendering can't see the RSC payload props of client children, so also
  // make sure no email-bearing prop is handed to any child component.
  const src = readFileSync(
    path.resolve(__dirname, '../../../audit/result/[auditId]/page.tsx'),
    'utf8',
  );
  it('passes no email-bearing prop to any child component', () => {
    expect(src).not.toMatch(/\b\w*[eE]mail\w*=\{(?!maskedEmail)/);
  });
});
