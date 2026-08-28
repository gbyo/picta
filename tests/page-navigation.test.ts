import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  PAGE_DETAILS,
  PAGE_NAMES,
  pageFromHash,
  pageHash,
  renderPage,
} from '../src/app/page-navigation.js';

function renderedController(): Document {
  const html = readFileSync(resolve(import.meta.dirname, '..', 'index.html'), 'utf8');
  return new JSDOM(html).window.document;
}

describe('controller page navigation', () => {
  it('renders a matching navigation item and panel for every supported page', () => {
    const document = renderedController();
    const navPages = [...document.querySelectorAll<HTMLElement>('.nav-item[data-page]')].map(
      (item) => item.dataset['page'],
    );
    const panelPages = [...document.querySelectorAll<HTMLElement>('[data-page-panel]')].map(
      (item) => item.dataset['pagePanel'],
    );

    expect(navPages).toEqual(PAGE_NAMES);
    expect(new Set(panelPages)).toEqual(new Set(PAGE_NAMES));
    expect(document.getElementById('tab-media')).toBeNull();
    expect(document.getElementById('panel-players')).toBeNull();
  });

  it.each(PAGE_NAMES)('shows only the %s page and updates the rendered heading', (page) => {
    const document = renderedController();
    renderPage(document, page);

    const visible = [...document.querySelectorAll<HTMLElement>('[data-page-panel]')]
      .filter((panel) => !panel.hidden)
      .map((panel) => panel.dataset['pagePanel']);
    const current = [
      ...document.querySelectorAll<HTMLElement>('.nav-item[aria-current="page"]'),
    ].map((item) => item.dataset['page']);

    expect(visible).toEqual([page]);
    expect(current).toEqual([page]);
    expect(document.getElementById('page-eyebrow')?.textContent).toBe(PAGE_DETAILS[page].eyebrow);
    expect(document.getElementById('page-title')?.textContent).toBe(PAGE_DETAILS[page].title);
    expect(document.getElementById('page-description')?.textContent).toBe(
      PAGE_DETAILS[page].description,
    );
  });

  it('round-trips page hashes and safely falls back to Home', () => {
    for (const page of PAGE_NAMES) expect(pageFromHash(pageHash(page))).toBe(page);
    expect(pageFromHash('#/live')).toBe('live');
    expect(pageFromHash('#not-a-page')).toBe('home');
    expect(pageFromHash('')).toBe('home');
  });

  it('does not throw for malformed URI escapes in the hash', () => {
    expect(() => pageFromHash('#%')).not.toThrow();
    expect(pageFromHash('#%')).toBe('home');
    expect(pageFromHash('#%E0%A4%A')).toBe('home');
  });

  it('keeps Home dashboard and Output readiness targets in the rendered document', () => {
    const document = renderedController();
    for (const id of [
      'home-media-summary',
      'home-scene-summary',
      'home-display-summary',
      'home-live-summary',
      'output-media-readiness',
      'output-team-readiness',
      'output-display-readiness',
      'update-dismiss',
      'media-empty',
      'live-empty',
      'team-dialog',
    ]) {
      expect(document.getElementById(id), `missing #${id}`).not.toBeNull();
    }
  });
});
