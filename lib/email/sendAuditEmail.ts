import type { AuditResult, FixSuggestion } from '@/lib/engine/types';
import { TIER_LABEL } from '@/lib/engine/scoring';

interface SendAuditEmailParams {
  email: string;
  fullName: string | null;
  audit: AuditResult;
  resultUrl: string;
}

/**
 * Send the post-audit transactional email via Resend.
 *
 * Fail-soft contract: when `RESEND_API_KEY` is absent (the most common case
 * pre-provisioning) this logs a single warning and returns `false`. The
 * caller MUST still surface the audit on-page when this returns `false` —
 * the email is supplementary, not the primary delivery channel.
 */
export async function sendAuditEmail(params: SendAuditEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn(
      `[sendAuditEmail] missing ${!apiKey ? 'RESEND_API_KEY' : 'EMAIL_FROM'} — skipping email send for ${params.email}`,
    );
    return false;
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.email],
        subject: buildSubject(params.audit),
        html: buildHtml(params),
        text: buildText(params),
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error(
        `[sendAuditEmail] resend error status=${resp.status} body=${body.slice(0, 200)}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      `[sendAuditEmail] resend request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

function buildSubject(audit: AuditResult): string {
  return `Your LinkedInGrade audit: ${audit.composite.letter} (${audit.composite.score}/100)`;
}

function buildText(params: SendAuditEmailParams): string {
  const { audit, fullName, resultUrl } = params;
  const greeting = fullName ? `Hi ${fullName.split(/\s+/)[0]},` : 'Hi,';
  const tier = TIER_LABEL[audit.composite.tier];
  const fixes = audit.fixes.slice(0, 3);
  const fixLines = fixes.length > 0
    ? fixes.map((f, i) => `${i + 1}. ${f.label}: ${f.recommendation}`).join('\n')
    : '(No high-leverage fixes identified.)';
  return [
    greeting,
    '',
    `Your LinkedIn profile graded out at ${audit.composite.letter} (${audit.composite.score}/100), at the ${tier} tier.`,
    '',
    'Top three highest-leverage fixes:',
    fixLines,
    '',
    `Full report: ${resultUrl}`,
    '',
    '— LinkedInGrade',
    'You received this because you ran an audit on linkedingrade.com.',
  ].join('\n');
}

function buildHtml(params: SendAuditEmailParams): string {
  const { audit, fullName, resultUrl } = params;
  const greeting = fullName ? `Hi ${escape(fullName.split(/\s+/)[0]!)},` : 'Hi,';
  const tier = TIER_LABEL[audit.composite.tier];
  const fixes = audit.fixes.slice(0, 3);
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f6f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f3;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e8e4dc;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #e8e4dc;">
          <div style="font:500 13px/1 ui-monospace,monospace;letter-spacing:0.08em;text-transform:uppercase;color:#7a7468;">LINKEDINGRADE · YOUR AUDIT</div>
        </td></tr>
        <tr><td style="padding:32px 28px 24px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#1a1a1a;">${greeting}</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#1a1a1a;">Your LinkedIn profile graded out at <b>${audit.composite.letter}</b> (${audit.composite.score}/100), at the <b>${escape(tier)}</b> tier.</p>
          <div style="text-align:center;padding:24px 0;border:1px solid #e8e4dc;border-radius:6px;background:#fbfaf6;margin-bottom:24px;">
            <div style="font:500 60px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;letter-spacing:-0.04em;color:#1a1a1a;">${audit.composite.letter}</div>
            <div style="font:500 12px/1 ui-monospace,monospace;letter-spacing:0.08em;text-transform:uppercase;color:#7a7468;margin-top:8px;">${audit.composite.score} / 100</div>
          </div>
          ${renderFixesHtml(fixes)}
          <p style="margin:24px 0 0;font-size:15px;line-height:1.55;">
            <a href="${escape(resultUrl)}" style="display:inline-block;background:#1a1a1a;color:#ffffff;padding:12px 18px;border-radius:4px;text-decoration:none;font-weight:500;font-size:14px;">View full report →</a>
          </p>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #e8e4dc;background:#fbfaf6;font:400 12px/1.5 ui-monospace,monospace;color:#7a7468;">
          You received this because you ran an audit on <a href="https://linkedingrade.com" style="color:#7a7468;">linkedingrade.com</a>. Not affiliated with LinkedIn.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function renderFixesHtml(fixes: FixSuggestion[]): string {
  if (fixes.length === 0) {
    return '<p style="margin:0;font-size:14px;color:#7a7468;">No high-leverage fixes identified — your profile is already in good shape.</p>';
  }
  const rows = fixes
    .map(
      (f, i) => `<tr><td style="padding:12px 0;border-top:${i === 0 ? '0' : '1px solid #e8e4dc'};">
      <div style="font:500 12px/1 ui-monospace,monospace;letter-spacing:0.06em;text-transform:uppercase;color:#7a7468;margin-bottom:4px;">${i + 1} · ${escape(f.label)}</div>
      <div style="font-size:14px;line-height:1.5;color:#1a1a1a;">${escape(f.recommendation)}</div>
    </td></tr>`,
    )
    .join('');
  return `<div style="font:500 12px/1 ui-monospace,monospace;letter-spacing:0.08em;text-transform:uppercase;color:#7a7468;margin-bottom:8px;">Top 3 fixes</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
