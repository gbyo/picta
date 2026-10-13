/**
 * Reordering without HTML drag-and-drop.
 *
 * Tauri's native file-drop handler (which Picta needs for importing media from
 * the desktop) intercepts HTML5 drag events on Windows. dnd-kit drives drags
 * from pointer events instead, so mouse, pen and touch reordering coexist with
 * OS file drops, and its keyboard sensor gives a non-pointer alternative
 * (Space to pick up, arrows to move, Space to drop, Escape to cancel).
 */

import type { CSSProperties, ReactNode } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export function SortableArea({
  ids,
  onMove,
  layout = 'vertical',
  disabled,
  children,
}: {
  ids: string[];
  onMove(activeId: string, overId: string): void;
  layout?: 'vertical' | 'grid';
  disabled?: boolean;
  children: ReactNode;
}) {
  const sensors = useSensors(
    // A small distance keeps ordinary clicks as clicks.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) onMove(String(active.id), String(over.id));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={ids}
        strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}
        disabled={disabled ?? false}
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function useSortableItem(id: string, disabled = false) {
  const sortable = useSortable({ id, disabled });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
    zIndex: sortable.isDragging ? 20 : undefined,
    position: 'relative',
  };
  return {
    ref: sortable.setNodeRef,
    handleRef: sortable.setActivatorNodeRef,
    style,
    attributes: sortable.attributes,
    listeners: sortable.listeners,
    dragging: sortable.isDragging,
  };
}
