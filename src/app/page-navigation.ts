/** Page routing and rendered page state for the controller workspace. */

export const PAGE_NAMES = ['home', 'media', 'roster', 'scenes', 'live', 'output'] as const;

export type PageName = (typeof PAGE_NAMES)[number];

export interface PageDetails {
  eyebrow: string;
  title: string;
  description: string;
}

export const PAGE_DETAILS: Record<PageName, PageDetails> = {
  home: {
    eyebrow: 'Workspace',
    title: 'Home',
    description: 'Build the show, check the room, and go live.',
  },
  media: {
    eyebrow: 'Prepare',
    title: 'Media',
    description: 'Choose the images and videos that play in the program zone.',
  },
  roster: {
    eyebrow: 'Prepare',
    title: 'Roster',
    description: 'Build reusable teams, groups, and player presentation cards.',
  },
  live: {
    eyebrow: 'Operate',
    title: 'Live',
    description: 'Choose the active lineup and update event statistics quickly.',
  },
  scenes: {
    eyebrow: 'Prepare',
    title: 'Scenes',
    description: 'Compose the output canvas and choose what each zone shows.',
  },
  output: {
    eyebrow: 'Operate',
    title: 'Output',
    description: 'Confirm the destination and take the selected scene live.',
  },
};

export function isPageName(value: string): value is PageName {
  return (PAGE_NAMES as readonly string[]).includes(value);
}

export function pageFromHash(hash: string): PageName {
  const value = decodeURIComponent(hash.replace(/^#\/?/, '')).toLowerCase();
  return isPageName(value) ? value : 'home';
}

export function pageHash(page: PageName): string {
  return `#${page}`;
}

/** Applies visible page, active navigation, and page heading to rendered markup. */
export function renderPage(document: Document, page: PageName): void {
  for (const panel of document.querySelectorAll<HTMLElement>('[data-page-panel]')) {
    panel.hidden = panel.dataset['pagePanel'] !== page;
  }
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
