import { describe, expect, it } from 'vitest';

import { isSuspiciousName, normalizeProfileForPdfAudit } from '@/lib/engine/scoring';
import { makeProfile } from './fixtures';

describe('isSuspiciousName', () => {
  it('flags pipe-delimited strings (headline bled into the name slot)', () => {
    expect(isSuspiciousName('Senior Director, Data | Building AI Platforms')).toBe(true);
  });

  it('flags strings with more than 5 words', () => {
    expect(isSuspiciousName('Head of Data Science and Machine Learning Platforms')).toBe(true);
  });

  it('flags headline-like connectors (at / & / @ / •)', () => {
    expect(isSuspiciousName('VP Engineering at JPMC')).toBe(true);
    expect(isSuspiciousName('Product & Growth Lead')).toBe(true);
  });

  it('accepts ordinary names', () => {
    expect(isSuspiciousName('Mir Quadri')).toBe(false);
    expect(isSuspiciousName('John Napoli')).toBe(false);
    expect(isSuspiciousName('Maria del Carmen Ruiz')).toBe(false);
    expect(isSuspiciousName(null)).toBe(false);
    expect(isSuspiciousName('')).toBe(false);
  });
});

describe('normalizeProfileForPdfAudit', () => {
  it('clears a suspicious name and marks it low confidence', () => {
    const profile = makeProfile({ fullName: 'Senior Director | Building AI Platforms' });
    const normalized = normalizeProfileForPdfAudit(profile);
    // Cleared to null (not a placeholder string) so downstream consumers like
    // the email greeting don't treat it as a real name. The UI renders the
    // neutral "Your audit" header from nameConfidence.
    expect(normalized.fullName).toBeNull();
    expect(normalized.nameConfidence).toBe('low');
    // Input is not mutated.
    expect(profile.fullName).toBe('Senior Director | Building AI Platforms');
    expect(profile.nameConfidence).toBeUndefined();
  });

  it('leaves an ordinary name intact and marks it high confidence', () => {
    const profile = makeProfile({ fullName: 'Mir Quadri' });
    const normalized = normalizeProfileForPdfAudit(profile);
    expect(normalized.fullName).toBe('Mir Quadri');
    expect(normalized.nameConfidence).toBe('high');
  });
});
