/**
 * The controller's scene layout preview, and the Edit Zones tools that replace
 * it while editing.
 *
 * Zones are real buttons: an operator can tab to one, press Enter or Space and
 * see where focus is.  Safe areas are drawn per zone, because a tiled wall has
 * one safe area per physical screen rather than one per canvas.
 */

import type { LayoutNode, ZoneRole } from '../core/domain.js';
import {
  layoutZones,
  resolveZoneRects,
  safeAreaForRect,
  zoneRoleLabel,
  type ZoneRect,
} from '../core/layouts.js';

export type LayoutPath = readonly ('first' | 'second')[];

export interface LayoutPreviewView {
  layout: LayoutNode;
  outputWidth: number;
  outputHeight: number;
  editing: boolean;
  selectedZoneId: string | null;
  showSafeAreas: boolean;
  onSelectZone(zoneId: string): void;
  /** Live drag feedback; not yet committed to the draft. */
  onRatioPreview(path: LayoutPath, ratio: number): void;
  onRatioCommit(path: LayoutPath, ratio: number): void;
}

const MIN_RATIO = 0.1;
const MAX_RATIO = 0.9;

function clamp(ratio: number): number {
  return Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio));
}

/** "Zone 2 · Live Board" — never the internal id. */
export function zoneDisplayName(role: ZoneRole, index: number): string {
  return `Zone ${index + 1} · ${zoneRoleLabel(role)}`;
}

function zoneElement(
  node: Extract<LayoutNode, { type: 'zone' }>,
  index: number,
  rect: ZoneRect | undefined,
  view: LayoutPreviewView,
): HTMLElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `preview-zone ${node.role}`;
  const selected = view.editing && view.selectedZoneId === node.id;
  if (selected) element.classList.add('selected');
  element.setAttribute('aria-pressed', String(selected));
  element.disabled = !view.editing;

  const label = document.createElement('span');
  label.className = 'preview-zone-label';
  label.textContent = `${zoneRoleLabel(node.role).toLocaleUpperCase()}\n${rect?.width ?? 0} × ${rect?.height ?? 0}`;
  element.append(label);
  element.setAttribute(
    'aria-label',
    `${zoneDisplayName(node.role, index)}, ${rect?.width ?? 0} by ${rect?.height ?? 0}`,
  );

  if (view.showSafeAreas && rect) {
    const safe = document.createElement('span');
    safe.className = 'preview-safe-area';
    safe.setAttribute('aria-hidden', 'true');
    const inset = safeAreaForRect(rect);
    safe.style.left = `${((inset.x - rect.x) / Math.max(1, rect.width)) * 100}%`;
    safe.style.top = `${((inset.y - rect.y) / Math.max(1, rect.height)) * 100}%`;
    safe.style.width = `${(inset.width / Math.max(1, rect.width)) * 100}%`;
    safe.style.height = `${(inset.height / Math.max(1, rect.height)) * 100}%`;
    element.append(safe);
  }

  // A button already answers Enter and Space; only wire the intent.
  if (view.editing) element.addEventListener('click', () => view.onSelectZone(node.id));
  return element;
}

function dividerElement(
  node: Extract<LayoutNode, { type: 'split' }>,
  container: HTMLElement,
  box: { x: number; y: number; width: number; height: number },
  path: LayoutPath,
  view: LayoutPreviewView,
): HTMLElement {
  const ratio = clamp(node.ratio);
  const divider = document.createElement('button');
  divider.type = 'button';
  divider.className = `preview-divider ${node.direction}`;
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-label', 'Adjust layout divider');
  divider.setAttribute('aria-valuemin', String(MIN_RATIO * 100));
  divider.setAttribute('aria-valuemax', String(MAX_RATIO * 100));
  divider.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));

  const firstWidth = node.direction === 'columns' ? box.width * ratio : box.width;
  const firstHeight = node.direction === 'rows' ? box.height * ratio : box.height;
  if (node.direction === 'columns') {
    divider.style.left = `${(box.x + firstWidth) * 100}%`;
    divider.style.top = `${box.y * 100}%`;
    divider.style.height = `${box.height * 100}%`;
  } else {
    divider.style.left = `${box.x * 100}%`;
    divider.style.top = `${(box.y + firstHeight) * 100}%`;
    divider.style.width = `${box.width * 100}%`;
  }

  let draftRatio = ratio;
  const setFromPointer = (clientX: number, clientY: number): void => {
    const bounds = container.getBoundingClientRect();
    const parentWidth = Math.max(1, box.width * bounds.width);
    const parentHeight = Math.max(1, box.height * bounds.height);
    draftRatio =
      node.direction === 'columns'
        ? clamp((clientX - bounds.left - box.x * bounds.width) / parentWidth)
        : clamp((clientY - bounds.top - box.y * bounds.height) / parentHeight);
    divider.setAttribute('aria-valuenow', String(Math.round(draftRatio * 100)));
    if (node.direction === 'columns')
      divider.style.left = `${(box.x + box.width * draftRatio) * 100}%`;
    else divider.style.top = `${(box.y + box.height * draftRatio) * 100}%`;
    view.onRatioPreview(path, draftRatio);
  };

  divider.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    divider.setPointerCapture(event.pointerId);
    setFromPointer(event.clientX, event.clientY);
  });
  divider.addEventListener('pointermove', (event) => {
    if (divider.hasPointerCapture(event.pointerId)) setFromPointer(event.clientX, event.clientY);
  });
  divider.addEventListener('pointerup', (event) => {
    if (!divider.hasPointerCapture(event.pointerId)) return;
    divider.releasePointerCapture(event.pointerId);
    view.onRatioCommit(path, draftRatio);
  });
  divider.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const decrease = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    view.onRatioCommit(path, ratio + (decrease ? -0.05 : 0.05));
  });
  return divider;
}

export function renderLayoutPreview(container: HTMLElement, view: LayoutPreviewView): void {
  container.replaceChildren();
  const rects = new Map(
    resolveZoneRects(view.layout, view.outputWidth, view.outputHeight).map((rect) => [
      rect.id,
      rect,
    ]),
  );
  const order = new Map(layoutZones(view.layout).map((zone, index) => [zone.id, index]));

  const walk = (
    node: LayoutNode,
    box: { x: number; y: number; width: number; height: number },
    path: LayoutPath,
  ): void => {
    if (node.type === 'zone') {
      const element = zoneElement(node, order.get(node.id) ?? 0, rects.get(node.id), view);
      element.style.left = `${box.x * 100}%`;
      element.style.top = `${box.y * 100}%`;
      element.style.width = `${box.width * 100}%`;
      element.style.height = `${box.height * 100}%`;
      container.append(element);
      return;
    }
    const ratio = clamp(node.ratio);
    const firstWidth = node.direction === 'columns' ? box.width * ratio : box.width;
    const firstHeight = node.direction === 'rows' ? box.height * ratio : box.height;
    if (view.editing) container.append(dividerElement(node, container, box, path, view));
    walk(node.first, { ...box, width: firstWidth, height: firstHeight }, [...path, 'first']);
    walk(
      node.second,
      {
        x: node.direction === 'columns' ? box.x + firstWidth : box.x,
        y: node.direction === 'rows' ? box.y + firstHeight : box.y,
        width: node.direction === 'columns' ? box.width - firstWidth : box.width,
        height: node.direction === 'rows' ? box.height - firstHeight : box.height,
      },
      [...path, 'second'],
    );
  };

  walk(view.layout, { x: 0, y: 0, width: 1, height: 1 }, []);
}

/** Fill the Edit Zones zone selector with operator-facing names. */
export function renderZoneSelect(select: HTMLSelectElement, layout: LayoutNode): void {
  select.replaceChildren();
  layoutZones(layout).forEach((zone, index) => {
    const option = document.createElement('option');
    option.value = zone.id;
    option.textContent = zoneDisplayName(zone.role, index);
    select.append(option);
  });
}
