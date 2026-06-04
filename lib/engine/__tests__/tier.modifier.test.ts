import { describe, expect, it } from 'vitest';

import { bandedTierModifier } from '@/lib/engine/scoring/seniority';

describe('bandedTierModifier — asymmetric, raw-banded', () => {
  it('T3 (Senior/Leadership): raw ≥75 → 0, 65–74 → -3, <65 → -7', () => {
    expect(bandedTierModifier('T3', 80)).toBe(0);
    expect(bandedTierModifier('T3', 75)).toBe(0);
    expect(bandedTierModifier('T3', 74)).toBe(-3);
    expect(bandedTierModifier('T3', 65)).toBe(-3);
    expect(bandedTierModifier('T3', 64)).toBe(-7);
    expect(bandedTierModifier('T3', 30)).toBe(-7);
  });

  it('T2 (Mid-level): raw ≥75 → 0, 65–74 → -2, <65 → -5', () => {
    expect(bandedTierModifier('T2', 90)).toBe(0);
    expect(bandedTierModifier('T2', 75)).toBe(0);
    expect(bandedTierModifier('T2', 70)).toBe(-2);
    expect(bandedTierModifier('T2', 65)).toBe(-2);
    expect(bandedTierModifier('T2', 64)).toBe(-5);
  });

  it('T1 (Early career): raw ≥75 → +5, 65–74 → +3, <65 → 0', () => {
    expect(bandedTierModifier('T1', 88)).toBe(5);
    expect(bandedTierModifier('T1', 75)).toBe(5);
    expect(bandedTierModifier('T1', 74)).toBe(3);
    expect(bandedTierModifier('T1', 65)).toBe(3);
    expect(bandedTierModifier('T1', 64)).toBe(0);
  });

  it('never penalises an excellent senior section', () => {
    expect(bandedTierModifier('T3', 85)).toBe(0);
  });

  it('actively rewards an excellent early-career section', () => {
    expect(bandedTierModifier('T1', 85)).toBeGreaterThan(0);
  });
});
