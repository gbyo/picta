/** Cladd's class merger knows its own size, radius and text tokens. */
export { cn } from '@cladd-ui/react';

/**
 * Drops undefined props. The app compiles with exactOptionalPropertyTypes, and
 * Cladd's props reject an explicit `undefined`, so optional values are spread
 * through this instead of being passed as `prop={maybeUndefined}`.
 */
export function defined<T extends Record<string, unknown>>(
  props: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}
