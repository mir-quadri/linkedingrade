import { describe, expect, it } from 'vitest';

import { scoreAbout, CLICHE_OPENER_PENALTY } from '@/lib/engine/scoring/sections/about';
import { makeProfile } from './fixtures';

// A substantive About body (well over 60 words, no buzzwords) so the only
// difference between the two cases is the cliché opener.
const BODY =
  'build operating models that let regulated institutions move fast without breaking trust. Across four global banks over fifteen years I have run strategy, pilots, scale and the governance that makes adoption stick. I delivered three enterprise transformations end to end and cut decision cycles from eight weeks to two weeks while keeping every stakeholder aligned and informed throughout. My focus is always on shipping work that holds up under real production load and measuring whether it truly moves the outcomes that the organisation cares about over the long run.';

function rawForAbout(about: string): number {
  return scoreAbout(makeProfile({ about: { data: about, confidence: 'high' } }), undefined).rawScore;
}

describe('cliché-opener penalty cap', () => {
  it('caps the About cliché penalty at -5 raw', () => {
    expect(CLICHE_OPENER_PENALTY).toBe(5);
  });

  it('drops a substantive About by no more than 5 raw points for a cliché opener', () => {
    const clean = rawForAbout(BODY);
    const cliche = rawForAbout(`I am a ${BODY}`);
    const drop = clean - cliche;
    expect(drop).toBeGreaterThan(0);
    expect(drop).toBeLessThanOrEqual(5);
  });

  it('does not let a cliché opener push a substantive About from D to F', () => {
    // raw 72 base − 5 cap = 67 → still D, not F (the old −8 took it to 64/F).
    const cliche = rawForAbout(`I am a ${BODY}`);
    expect(cliche).toBeGreaterThanOrEqual(60);
  });
});
