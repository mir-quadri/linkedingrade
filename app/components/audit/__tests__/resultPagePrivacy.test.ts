import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The permanent result page is a shareable link. Guard its source so the
// owner's raw address is never rendered (and therefore never serialized into
// the HTML / RSC payload): only the masked form may reach the JSX.
const src = readFileSync(
  path.resolve(__dirname, '../../../audit/result/[auditId]/page.tsx'),
  'utf8',
);

describe('result page email privacy', () => {
  it('renders the masked email, not the raw one', () => {
    expect(src).toContain("from '@/lib/audit/maskEmail'");
    expect(src).toMatch(/EMAILED TO \{maskedEmail \?\? 'YOUR ADDRESS'\}/);
    expect(src).not.toMatch(/\{\s*email\s*\}/);
    expect(src).not.toMatch(/\{\s*record\.email\s*\}/);
  });

  it('does not destructure the raw email into page scope', () => {
    expect(src).not.toMatch(/const\s*\{[^}]*\bemail\b[^}]*\}\s*=\s*record/);
  });

  it('passes no email-bearing prop to any child component', () => {
    expect(src).not.toMatch(/\b\w*[eE]mail\w*=\{(?!maskedEmail)/);
  });
});
