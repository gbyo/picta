/** Page routing and rendered page state for the controller workspace. */

export const PAGE_NAMES = ['live', 'media', 'team', 'screens'] as const;

export type PageName = (typeof PAGE_NAMES)[number];

export interface PageDetails {
  eyebrow: string;
  title: string;
  description: string;
}

export const PAGE_DETAILS: Record<PageName, PageDetails> = {
  live: {
    eyebrow: 'Operate',
    title: 'Live',
    description: 'Preview the board, update the match, and control what is on air.',
  },
  media: {
    eyebrow: 'Setup',
    title: 'Media',
    description: 'Build the ordered media rotation used by Media panels.',
  },
  team: {
    eyebrow: 'Setup',
    title: 'Team',
    description: 'Manage the reusable roster, groups, colors, and player cues.',
  },
  screens: {
    eyebrow: 'Setup',
    title: 'Screens',
    description: 'Choose a template and assign Media, Score, Stats, or Blank panels.',
  },
};

export function isPageName(value: string): value is PageName {
  return (PAGE_NAMES as readonly string[]).includes(value);
}

export function pageFromHash(hash: string): PageName {
  let value: string;
  try {
    value = decodeURIComponent(hash.replace(/^#\/?/, '')).toLowerCase();
  } catch {
    // The hash is navigation input, not trusted application state.  Malformed
    // percent escapes must fall through to the normal Home validation path.
    value = '';
  }
  if (value === 'roster') return 'team';
  if (value === 'home' || value === 'scenes' || value === 'output')
    return value === 'scenes' ? 'screens' : 'live';
  return isPageName(value) ? value : 'live';
}

export function pageHash(page: PageName): string {
  return `#${page}`;
}

/** Applies visible page, active navigation, and page heading to rendered markup. */
export function renderPage(document: Document, page: PageName): void {
  for (const panel of document.querySelectorAll<HTMLElement>('[data-page-panel]')) {
    panel.hidden = panel.dataset['pagePanel'] !== page;
  }
  const liveOutput = document.getElementById('page-output');
  if (liveOutput) liveOutput.hidden = page !== 'live';
  for (const item of document.querySelectorAll<HTMLElement>('.nav-item[data-page]')) {
    const current = item.dataset['page'] === page;
    if (current) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  const details = PAGE_DETAILS[page];
  const eyebrow = document.getElementById('page-eyebrow');
  const title = document.getElementById('page-title');
  const description = document.getElementById('page-description');
  if (eyebrow) eyebrow.textContent = details.eyebrow;
  if (title) title.textContent = details.title;
  if (description) description.textContent = details.description;
}
