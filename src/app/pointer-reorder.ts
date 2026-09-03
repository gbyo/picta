/** Pointer-capture reorder that does not compete with Tauri OS file drops. */

export interface PointerReorderOptions {
  element: HTMLElement;
  container: HTMLElement;
  itemSelector: string;
  dataKey: string;
  id: string;
  onMove(sourceId: string, targetId: string): void;
}

const MOVEMENT_THRESHOLD = 7;

export function attachPointerReorder(options: PointerReorderOptions): void {
  let pointerId: number | null = null;
  let originX = 0;
  let originY = 0;
  let targetId: string | null = null;
  let moving = false;

  const clear = () => {
    pointerId = null;
    targetId = null;
    moving = false;
    options.element.classList.remove('pointer-moving');
    for (const item of options.container.querySelectorAll('.reorder-before, .reorder-after'))
      item.classList.remove('reorder-before', 'reorder-after');
  };

  options.element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, input, select, a'))
      return;
    pointerId = event.pointerId;
    originX = event.clientX;
    originY = event.clientY;
    options.element.setPointerCapture(event.pointerId);
  });
  options.element.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId) return;
    if (
      !moving &&
      Math.hypot(event.clientX - originX, event.clientY - originY) < MOVEMENT_THRESHOLD
    )
      return;
    moving = true;
    options.element.classList.add('pointer-moving');
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>(options.itemSelector);
    for (const item of options.container.querySelectorAll('.reorder-before, .reorder-after'))
      item.classList.remove('reorder-before', 'reorder-after');
    if (!target || target === options.element) {
      targetId = null;
      return;
    }
    targetId = target.dataset[options.dataKey] ?? null;
    const rect = target.getBoundingClientRect();
    target.classList.add(
      event.clientY < rect.top + rect.height / 2 ? 'reorder-before' : 'reorder-after',
    );
  });
  options.element.addEventListener('pointerup', (event) => {
    if (pointerId !== event.pointerId) return;
    if (moving && targetId && targetId !== options.id) options.onMove(options.id, targetId);
    clear();
  });
  options.element.addEventListener('pointercancel', clear);
}
