import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect } from './demo';

// WCAG 2 A/AA is the bar CLAUDE.md's "verified via automated accessibility
// audit" acceptance criterion is checked against -- axe's "best practice"
// rules cover things outside WCAG's actual conformance requirements and
// would make this assertion stricter than the story asks for.
export async function assertNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const summary = results.violations.map(
    (v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
  );
  expect(results.violations, summary.join('\n\n')).toEqual([]);
}

// A concrete, non-visual proxy for "renders usably without horizontal
// scrolling": if the document is wider than the viewport, something is
// overflowing rather than wrapping/stacking.
export async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth, `document is ${overflow.scrollWidth}px wide but the viewport is only ${overflow.clientWidth}px`).toBeLessThanOrEqual(
    overflow.clientWidth,
  );
}

// Confirms the currently-focused element has *some* visible indicator --
// either the browser's native outline or a custom box-shadow/ring -- rather
// than asserting a specific style, since either is a legitimate way to
// satisfy "visible focus order".
export async function assertFocusVisible(page: Page) {
  const style = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow };
  });
  expect(style, 'no element is focused').not.toBeNull();
  const hasOutline = style!.outlineStyle !== 'none' && style!.outlineWidth !== '0px';
  const hasBoxShadow = style!.boxShadow !== 'none';
  expect(hasOutline || hasBoxShadow, `focused element has neither a visible outline nor a box-shadow: ${JSON.stringify(style)}`).toBe(true);
}

export const MOBILE_VIEWPORT = { width: 375, height: 667 };
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
