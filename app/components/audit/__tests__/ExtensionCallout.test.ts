import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WAITLIST_CTA } from '@/lib/copy';

import ExtensionCallout, { type ExtensionCalloutProps } from '../ExtensionCallout';

const render = (props: ExtensionCalloutProps = {}) =>
  renderToStaticMarkup(createElement(ExtensionCallout, props));

describe('ExtensionCallout', () => {
  it('keeps the informational copy in every mode', () => {
    expect(render()).toContain('8 more sections in the Chrome extension');
    expect(render({ showCta: false })).toContain('8 more sections in the Chrome extension');
  });

  it('renders its waitlist link as a ghost button, never primary', () => {
    const html = render();
    expect(html).toContain('btn btn-ghost');
    expect(html).not.toContain('btn-primary');
    expect(html).toContain(WAITLIST_CTA);
  });

  it('hides the waitlist link when showCta is false', () => {
    const html = render({ showCta: false });
    expect(html).not.toContain('<a');
    expect(html).not.toContain('btn');
  });
});
