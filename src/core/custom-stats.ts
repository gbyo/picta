/** Helpers for operator-defined statistics on a custom sport. */

export function statIdFromLabel(label: string): string {
  return label
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function shortLabelFromLabel(label: string): string {
  return label.trim().slice(0, 4).toLocaleUpperCase();
}
