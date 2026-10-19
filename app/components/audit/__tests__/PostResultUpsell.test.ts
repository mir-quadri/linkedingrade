import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  EXTENSION_COMING_SOON,
  POST_RESULT_UPSELL_HEADING,
  WAITLIST_CTA_SHORT,
} from '@/lib/copy';

import PostResultUpsell from '../PostResultUpsell';

const render = (email?: string | null) =>
  renderToStaticMarkup(createElement(PostResultUpsell, { email }));

describe('PostResultUpsell', () => {
  it('is a section labelled by its heading', () => {
    const html = render('ada@example.com');
    const labelledBy = html.match(/<section[^>]*aria-labelledby="([^"]+)"/)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`<h2 id="${labelledBy}"`);
    expect(html).toContain(POST_RESULT_UPSELL_HEADING.replace(/'/g, '&#x27;'));
    expect(html).toContain(EXTENSION_COMING_SOON);
  });

  it('renders a labelled email input wired to the shared waitlist form', () => {
    const html = render('ada@example.com');
    const inputId = html.match(/<input[^>]*id="([^"]+)"/)?.[1];
    expect(inputId).toBeTruthy();
    expect(html).toContain(`<label for="${inputId}"`);
    expect(html).toContain('Email for the extension waitlist');
    expect(html).toContain(WAITLIST_CTA_SHORT);
  });

  it('prefills the audit email when available', () => {
    expect(render(' ada@example.com ')).toContain('value="ada@example.com"');
  });

  it('leaves the field empty when no usable email is known', () => {
    expect(render(null)).toContain('value=""');
    expect(render('nope')).toContain('value=""');
  });

  it('makes no price, urgency, or compliance claims', () => {
    const text = render('ada@example.com').replace(/<[^>]+>/g, ' ');
    expect(text).not.toMatch(/\$\d|per month|\/mo\b|limited time|hurry|today only|SOC ?2|Start Pro/i);
  });
});
