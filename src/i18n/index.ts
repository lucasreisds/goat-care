import { characters, itemNames } from './pt-BR/characters';
import { ui } from './pt-BR/ui';

/** Single locale for now (pt-BR). Keep strings out of logic. */
export const strings = { ui } as const;

const dictionary: Readonly<Record<string, string>> = { ...characters, ...itemNames };

/** Looks up a manifest `nameKey`. Returns undefined when the key has no translation. */
export function lookup(key: string): string | undefined {
  return dictionary[key];
}
