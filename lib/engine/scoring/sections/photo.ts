import type { ProfileData } from '@/lib/engine/types';
import type { PhotoJudgment } from '@/lib/engine/types/judge';

export interface PhotoScore {
  rawScore: number;
  reasons: string[];
  oneLineWhy: string;
  needsReview: boolean;
}

export function scorePhoto(
  profile: ProfileData,
  judgment: PhotoJudgment | undefined,
): PhotoScore {
  const photo = profile.photo.data;
  const reasons: string[] = [];

  // Extraction-missed branch: photo.data null with 'missing'/'low' confidence
  // means none of the photo selectors matched. Could be a real no-photo case
  // OR selector drift; surface as uncertainty.
  if (!photo) {
    const extractionMissed =
      profile.photo.confidence === 'missing' ||
      profile.photo.confidence === 'low';
    return {
      rawScore: extractionMissed ? 60 : 35,
      reasons: [
        extractionMissed
          ? 'Photo element could not be located on the page.'
          : 'No profile photo detected.',
      ],
      oneLineWhy: extractionMissed
        ? 'Photo could not be extracted — flagged for review.'
        : 'No photo — recruiters skip profiles without one.',
      needsReview: extractionMissed,
    };
  }

  if (!photo.present) {
    return {
      rawScore: 35,
      reasons: ['No profile photo detected.'],
      oneLineWhy: 'No photo — recruiters skip profiles without one.',
      needsReview: false,
    };
  }

  if (photo.isDefault) {
    return {
      rawScore: 45,
      reasons: ['Default LinkedIn avatar in place of a real photo.'],
      oneLineWhy: 'Default avatar reads as an unfinished profile.',
      needsReview: false,
    };
  }

  let score = 78; // present, non-default — start at solid C+

  // Tri-state: the proxy prompt allows fields to be omitted. Missing booleans
  // mustn't be scored as confident-false; framing already handled tri-state
  // (good / poor / unknown). Track misses to flag degraded coverage.
  let unknownFields = 0;
  if (judgment) {
    if (judgment.framing === 'good') {
      score += 8;
      reasons.push('Face fills a healthy share of the frame.');
    } else if (judgment.framing === 'poor') {
      score -= 8;
      reasons.push('Framing is off — face is too small or awkwardly cropped.');
    } else {
      unknownFields++;
    }
    if (judgment.professional === true) {
      score += 5;
      reasons.push('Reads as professional and role-appropriate.');
    } else if (judgment.professional === false) {
      score -= 6;
      reasons.push('Photo does not read as professional for the target role.');
    } else {
      unknownFields++;
    }
    if (judgment.appearsCurrent === true) {
      score += 4;
      reasons.push('Appears current.');
    } else if (judgment.appearsCurrent === false) {
      score -= 6;
      reasons.push('Appears dated.');
    } else {
      unknownFields++;
    }
    if (judgment.notes) reasons.push(judgment.notes);
  } else {
    reasons.push('Photo present; quality assessment pending AI review.');
  }

  return {
    rawScore: clamp(score),
    reasons,
    oneLineWhy: oneLine(score, judgment),
    // No judgment, or most AI fields missing → flag degraded coverage.
    needsReview: !judgment || unknownFields >= 2,
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function oneLine(score: number, j?: PhotoJudgment): string {
  if (!j) return 'Photo present — framing and professionalism pending AI review.';
  if (score >= 90) return 'Current, well-framed, professional, role-appropriate.';
  if (score >= 80) return 'Good photo with one fixable issue.';
  if (score >= 70) return 'Photo present but flawed — crop, framing, or styling.';
  return 'Photo actively undermines credibility.';
}
