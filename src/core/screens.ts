/** Pure flat Screen/Panel composition helpers. */

import type {
  LayoutNode,
  PanelContent,
  PanelRect,
  Screen,
  ScreenPanel,
  ShowBackground,
} from './domain.js';

export const MAX_SCREEN_PANELS = 4;
export const SCREEN_TEMPLATES = [
  'full',
  'half-left-right',
  '65-35-left-right',
  '35-65-left-right',
  'half-top-bottom',
] as const;
export type ScreenTemplateId = (typeof SCREEN_TEMPLATES)[number] | 'imported';

export interface ResolvedPanelRect extends PanelRect {
  id: string;
  content: PanelContent;
}

export type ScreenValidationError =
  | 'not-an-array'
  | 'empty'
  | 'too-many-panels'
  | 'invalid-screen'
  | 'duplicate-screen-id'
  | 'duplicate-screen-name'
  | 'duplicate-panel-id'
  | 'invalid-panel'
  | 'invalid-geometry'
  | 'overlapping-panels'
  | 'missing-default'
  | 'invalid-cue-target';

export type ScreenValidationResult =
  | { ok: true; screens: Screen[]; defaultScreenId: string }
  | { ok: false; kind: ScreenValidationError; message: string };

const EPSILON = 1e-9;

function validText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !value.includes('\0');
}

function cloneContent(content: PanelContent): PanelContent {
  return content.kind === 'stats' && content.groupId
    ? { kind: 'stats', groupId: content.groupId }
    : ({ kind: content.kind } as PanelContent);
}

export function cloneScreen(screen: Screen): Screen {
  return {
    ...screen,
    panels: screen.panels.map((panel) => ({
      ...panel,
      rect: { ...panel.rect },
      content: cloneContent(panel.content),
    })),
    background: { ...screen.background },
  };
}

function panel(id: string, rect: PanelRect, content: PanelContent): ScreenPanel {
  return { id, rect, content };
}

export function screenFromTemplate(
  template: Exclude<ScreenTemplateId, 'imported'>,
  name = 'New Screen',
  id = 'screen-1',
  contents: readonly PanelContent[] = [{ kind: 'media' }, { kind: 'score' }],
): Screen {
  const first = cloneContent(contents[0] ?? { kind: 'media' });
  const second = cloneContent(contents[1] ?? { kind: 'blank' });
  let panels: ScreenPanel[];
  switch (template) {
    case 'full':
      panels = [panel('panel-1', { x: 0, y: 0, width: 1, height: 1 }, first)];
      break;
    case 'half-left-right':
      panels = [
        panel('panel-left', { x: 0, y: 0, width: 0.5, height: 1 }, first),
        panel('panel-right', { x: 0.5, y: 0, width: 0.5, height: 1 }, second),
      ];
      break;
    case '65-35-left-right':
      panels = [
        panel('panel-left', { x: 0, y: 0, width: 0.65, height: 1 }, first),
        panel('panel-right', { x: 0.65, y: 0, width: 0.35, height: 1 }, second),
      ];
      break;
    case '35-65-left-right':
      panels = [
        panel('panel-left', { x: 0, y: 0, width: 0.35, height: 1 }, first),
        panel('panel-right', { x: 0.35, y: 0, width: 0.65, height: 1 }, second),
      ];
      break;
    case 'half-top-bottom':
      panels = [
        panel('panel-top', { x: 0, y: 0, width: 1, height: 0.5 }, first),
        panel('panel-bottom', { x: 0, y: 0.5, width: 1, height: 0.5 }, second),
      ];
      break;
  }
  return {
    id,
    name,
    panels,
    background: { kind: 'black' },
    ...(panels.some((item) => item.content.kind === 'media')
      ? { cueTargetPanelId: panels.find((item) => item.content.kind === 'media')!.id }
      : {}),
  };
}

export function defaultVolleyballScreens(): { screens: Screen[]; defaultScreenId: string } {
  const definitions: Array<{
    id: string;
    name: string;
    template: Exclude<ScreenTemplateId, 'imported'>;
    contents: PanelContent[];
  }> = [
    {
      id: 'media-score',
      name: 'Media + Score',
      template: 'half-left-right',
      contents: [{ kind: 'media' }, { kind: 'score' }],
    },
    {
      id: 'media-stats',
      name: 'Media + Stats',
      template: 'half-left-right',
      contents: [{ kind: 'media' }, { kind: 'stats', groupId: 'on-court' }],
    },
    { id: 'full-media', name: 'Full Media', template: 'full', contents: [{ kind: 'media' }] },
    { id: 'full-score', name: 'Full Score', template: 'full', contents: [{ kind: 'score' }] },
    {
      id: 'full-stats',
      name: 'Full Stats',
      template: 'full',
      contents: [{ kind: 'stats', groupId: 'on-court' }],
    },
  ];
  return {
    screens: definitions.map((entry) =>
      screenFromTemplate(entry.template, entry.name, entry.id, entry.contents),
    ),
    defaultScreenId: 'media-score',
  };
}

export function resolvePanelRects(
  screen: Screen,
  outputWidth: number,
  outputHeight: number,
): Array<ResolvedPanelRect & { x: number; y: number; width: number; height: number }> {
  return screen.panels.map((item) => {
    const left = Math.round(item.rect.x * outputWidth);
    const top = Math.round(item.rect.y * outputHeight);
    const right = Math.round((item.rect.x + item.rect.width) * outputWidth);
    const bottom = Math.round((item.rect.y + item.rect.height) * outputHeight);
    return {
      id: item.id,
      content: cloneContent(item.content),
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  });
}

function parseContent(raw: unknown): PanelContent | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (!['media', 'score', 'stats', 'blank'].includes(String(value['kind']))) return null;
  if (value['kind'] === 'stats') {
    if (value['groupId'] !== undefined && !validText(value['groupId'])) return null;
    return value['groupId'] === undefined
      ? { kind: 'stats' }
      : { kind: 'stats', groupId: String(value['groupId']) };
  }
  return { kind: value['kind'] as 'media' | 'score' | 'blank' };
}

function parseRect(raw: unknown): PanelRect | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const numbers = ['x', 'y', 'width', 'height'].map((key) => value[key]);
  if (numbers.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) return null;
  const x = numbers[0] as number;
  const y = numbers[1] as number;
  const width = numbers[2] as number;
  const height = numbers[3] as number;
  if (
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > 1 + EPSILON ||
    y + height > 1 + EPSILON
  )
    return null;
  return { x, y, width, height };
}

function overlaps(a: PanelRect, b: PanelRect): boolean {
  return (
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > EPSILON &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > EPSILON
  );
}

export function validateScreens(
  screensValue: unknown,
  defaultScreenIdValue: unknown,
): ScreenValidationResult {
  if (!Array.isArray(screensValue))
    return { ok: false, kind: 'not-an-array', message: 'A show must contain a screens array.' };
  if (screensValue.length === 0)
    return { ok: false, kind: 'empty', message: 'A show must contain at least one screen.' };
  if (!validText(defaultScreenIdValue))
    return { ok: false, kind: 'missing-default', message: 'A show must name its default screen.' };
  const screenIds = new Set<string>();
  const screenNames = new Set<string>();
  const screens: Screen[] = [];
  for (const raw of screensValue) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      return { ok: false, kind: 'invalid-screen', message: 'Every screen must be an object.' };
    const value = raw as Record<string, unknown>;
    if (!validText(value['id']) || !validText(value['name']) || !Array.isArray(value['panels']))
      return {
        ok: false,
        kind: 'invalid-screen',
        message: 'Every screen needs an id, name, and panels.',
      };
    const id = value['id'];
    const name = value['name'];
    if (screenIds.has(id))
      return {
        ok: false,
        kind: 'duplicate-screen-id',
        message: `Screen id "${id}" is duplicated.`,
      };
    const normalizedName = name.trim().toLocaleLowerCase();
    if (screenNames.has(normalizedName))
      return {
        ok: false,
        kind: 'duplicate-screen-name',
        message: `Screen name "${name}" is duplicated.`,
      };
    if (value['panels'].length === 0 || value['panels'].length > MAX_SCREEN_PANELS)
      return {
        ok: false,
        kind: 'too-many-panels',
        message: `Screen "${name}" must contain between one and ${MAX_SCREEN_PANELS} panels.`,
      };
    const background = value['background'];
    if (
      typeof background !== 'object' ||
      background === null ||
      Array.isArray(background) ||
      !['black', 'primary', 'secondary'].includes(
        String((background as Record<string, unknown>)['kind']),
      )
    )
      return {
        ok: false,
        kind: 'invalid-screen',
        message: `Screen "${name}" has an invalid background.`,
      };
    const panelIds = new Set<string>();
    const panels: ScreenPanel[] = [];
    for (const rawPanel of value['panels']) {
      if (typeof rawPanel !== 'object' || rawPanel === null || Array.isArray(rawPanel))
        return {
          ok: false,
          kind: 'invalid-panel',
          message: `Screen "${name}" has an invalid panel.`,
        };
      const rawValue = rawPanel as Record<string, unknown>;
      if (!validText(rawValue['id']))
        return {
          ok: false,
          kind: 'invalid-panel',
          message: `Screen "${name}" has a panel without an id.`,
        };
      if (panelIds.has(rawValue['id']))
        return {
          ok: false,
          kind: 'duplicate-panel-id',
          message: `Screen "${name}" has a duplicate panel id.`,
        };
      const rect = parseRect(rawValue['rect']);
      if (!rect)
        return {
          ok: false,
          kind: 'invalid-geometry',
          message: `Screen "${name}" has invalid panel geometry.`,
        };
      const content = parseContent(rawValue['content']);
      if (!content)
        return {
          ok: false,
          kind: 'invalid-panel',
          message: `Screen "${name}" has invalid panel content.`,
        };
      if (panels.some((existing) => overlaps(existing.rect, rect)))
        return {
          ok: false,
          kind: 'overlapping-panels',
          message: `Screen "${name}" has overlapping panels.`,
        };
      panelIds.add(rawValue['id']);
      panels.push({ id: rawValue['id'], rect, content });
    }
    const cueTargetPanelId = value['cueTargetPanelId'];
    if (
      cueTargetPanelId !== undefined &&
      (!validText(cueTargetPanelId) || !panelIds.has(cueTargetPanelId))
    )
      return {
        ok: false,
        kind: 'invalid-cue-target',
        message: `Screen "${name}" has an invalid cue target.`,
      };
    screenIds.add(id);
    screenNames.add(normalizedName);
    screens.push({
      id,
      name,
      panels,
      background: {
        kind: (background as Record<string, unknown>)['kind'] as ShowBackground['kind'],
      },
      ...(cueTargetPanelId === undefined ? {} : { cueTargetPanelId }),
      ...(value['importedLayout'] === true ? { importedLayout: true } : {}),
    });
  }
  if (!screenIds.has(defaultScreenIdValue))
    return {
      ok: false,
      kind: 'missing-default',
      message: `The default screen "${defaultScreenIdValue}" does not exist.`,
    };
  return { ok: true, screens, defaultScreenId: defaultScreenIdValue };
}

export function screenTemplateId(screen: Screen): ScreenTemplateId {
  const close = (a: number, b: number) => Math.abs(a - b) < EPSILON;
  if (screen.importedLayout) return 'imported';
  if (screen.panels.length === 1) {
    const rect = screen.panels[0]!.rect;
    return close(rect.x, 0) && close(rect.y, 0) && close(rect.width, 1) && close(rect.height, 1)
      ? 'full'
      : 'imported';
  }
  if (screen.panels.length !== 2) return 'imported';
  const [first, second] = screen.panels;
  if (!first || !second) return 'imported';
  if (
    close(first.rect.y, 0) &&
    close(first.rect.height, 1) &&
    close(second.rect.y, 0) &&
    close(second.rect.height, 1)
  ) {
    if (close(first.rect.x, 0) && close(second.rect.x, first.rect.width)) {
      if (close(first.rect.width, 0.5) && close(second.rect.width, 0.5)) return 'half-left-right';
      if (close(first.rect.width, 0.65) && close(second.rect.width, 0.35))
        return '65-35-left-right';
      if (close(first.rect.width, 0.35) && close(second.rect.width, 0.65))
        return '35-65-left-right';
    }
  }
  if (
    close(first.rect.x, 0) &&
    close(first.rect.width, 1) &&
    close(second.rect.x, 0) &&
    close(second.rect.width, 1) &&
    close(first.rect.y, 0) &&
    close(first.rect.height, 0.5) &&
    close(second.rect.y, 0.5) &&
    close(second.rect.height, 0.5)
  )
    return 'half-top-bottom';
  return 'imported';
}

/** Flatten a legacy v2 layout without changing any resolved geometry. */
export function flattenLegacyLayout(layout: LayoutNode, groupId?: string): ScreenPanel[] {
  const panels: ScreenPanel[] = [];
  const walk = (node: LayoutNode, rect: PanelRect): void => {
    if (node.type === 'zone') {
      const content: PanelContent =
        node.role === 'program' || node.role === 'media'
          ? { kind: 'media' }
          : node.role === 'live-board'
            ? groupId
              ? { kind: 'stats', groupId }
              : { kind: 'stats' }
            : { kind: 'blank' };
      panels.push({ id: node.id, rect, content });
      return;
    }
    if (node.direction === 'columns') {
      walk(node.first, { ...rect, width: rect.width * node.ratio });
      walk(node.second, {
        x: rect.x + rect.width * node.ratio,
        y: rect.y,
        width: rect.width * (1 - node.ratio),
        height: rect.height,
      });
    } else {
      walk(node.first, { ...rect, height: rect.height * node.ratio });
      walk(node.second, {
        x: rect.x,
        y: rect.y + rect.height * node.ratio,
        width: rect.width,
        height: rect.height * (1 - node.ratio),
      });
    }
  };
  walk(layout, { x: 0, y: 0, width: 1, height: 1 });
  return panels;
}

export function screenHasContent(screen: Screen, kind: PanelContent['kind']): boolean {
  return screen.panels.some((item) => item.content.kind === kind);
}

export function updatePanelContent(screen: Screen, panelId: string, content: PanelContent): Screen {
  const next = cloneScreen(screen);
  next.panels = next.panels.map((item) =>
    item.id === panelId ? { ...item, content: cloneContent(content) } : item,
  );
  if (content.kind === 'media' && !next.cueTargetPanelId) next.cueTargetPanelId = panelId;
  if (
    next.cueTargetPanelId &&
    !next.panels.some((item) => item.id === next.cueTargetPanelId && item.content.kind === 'media')
  ) {
    const replacement = next.panels.find((item) => item.content.kind === 'media')?.id;
    if (replacement) next.cueTargetPanelId = replacement;
    else delete next.cueTargetPanelId;
  }
  return next;
}
