/**
 * The thumbnail strip.
 *
 * Reordering uses pointer events rather than HTML5 drag-and-drop on purpose:
 * with Tauri's OS-level file-drop handler enabled — which Picta needs so images
 * can be dropped onto the window — HTML5 drag-and-drop inside the webview is
 * unavailable on Windows. Pointer events behave the same on every platform.
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import type { ImageItem } from '../core/types.js';
import { basename, type PathStyle } from '../core/paths.js';

export interface ThumbCallbacks {
  onRemove(index: number): void;
  onReorder(from: number, to: number): void;
}

const DRAG_THRESHOLD_PX = 4;

export function renderThumbs(
  container: HTMLUListElement,
  images: readonly ImageItem[],
  style: PathStyle,
  callbacks: ThumbCallbacks,
): void {
  container.replaceChildren();

  images.forEach((image, index) => {
    const name = basename(image.path, style);
    const item = document.createElement('li');
    item.className = image.missing ? 'thumb missing' : 'thumb';
    item.dataset['index'] = String(index);
    item.tabIndex = 0;
    item.setAttribute(
      'aria-label',
      `${index + 1} of ${images.length}: ${name}${image.missing ? ' (missing)' : ''}. ` +
        'Alt with arrow keys to reorder.',
    );

    if (!image.missing) {
      const img = document.createElement('img');
      img.src = convertFileSrc(image.path);
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      // A file deleted between the existence check and now must not show a
      // broken-image glyph in the controller either.
      img.addEventListener('error', () => img.remove());
      item.append(img);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'thumb-remove';
    remove.textContent = '×';
    remove.title = `Remove ${name}`;
    remove.setAttribute('aria-label', `Remove ${name}`);
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      callbacks.onRemove(index);
    });
    item.append(remove);

    item.addEventListener('keydown', (event) => {
      if (!event.altKey) return;
      if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        callbacks.onReorder(index, index - 1);
      } else if (event.key === 'ArrowRight' && index < images.length - 1) {
        event.preventDefault();
        callbacks.onReorder(index, index + 1);
      }
    });

    container.append(item);
  });

  attachDragReorder(container, callbacks);
}

function attachDragReorder(container: HTMLUListElement, callbacks: ThumbCallbacks): void {
  let dragging: HTMLElement | null = null;
  let fromIndex = -1;
  let startX = 0;
  let startY = 0;
  let active = false;
  let targetIndex = -1;

  const clearMarkers = () => {
    for (const element of container.querySelectorAll('.drop-before, .drop-after')) {
      element.classList.remove('drop-before', 'drop-after');
    }
  };

  const finish = () => {
    clearMarkers();
    dragging?.classList.remove('dragging');
    if (active && targetIndex >= 0 && targetIndex !== fromIndex) {
      callbacks.onReorder(fromIndex, targetIndex);
    }
    dragging = null;
    active = false;
    fromIndex = -1;
    targetIndex = -1;
  };

  container.addEventListener('pointerdown', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('.thumb');
    if (!target || (event.target as HTMLElement).closest('.thumb-remove')) return;
    if (event.button !== 0) return;
    dragging = target;
    fromIndex = Number(target.dataset['index']);
    startX = event.clientX;
    startY = event.clientY;
    target.setPointerCapture(event.pointerId);
  });

  container.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    if (!active) {
      const moved = Math.hypot(event.clientX - startX, event.clientY - startY);
      if (moved < DRAG_THRESHOLD_PX) return;
      active = true;
      dragging.classList.add('dragging');
    }

    clearMarkers();
    const over = document
      .elementsFromPoint(event.clientX, event.clientY)
      .find(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && element.classList.contains('thumb'),
      );

    if (!over) return;
    const overIndex = Number(over.dataset['index']);
    const rect = over.getBoundingClientRect();
    const after = event.clientX > rect.left + rect.width / 2;

    over.classList.add(after ? 'drop-after' : 'drop-before');
    // Removing the dragged item first shifts every later index down by one.
    const insertAt = after ? overIndex + 1 : overIndex;
    targetIndex = insertAt > fromIndex ? insertAt - 1 : insertAt;
  });

  container.addEventListener('pointerup', finish);
  container.addEventListener('pointercancel', finish);
}
