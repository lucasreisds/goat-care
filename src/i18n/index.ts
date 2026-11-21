import { characters, itemNames, stageNames } from './pt-BR/characters';
import { cheers, greetings, moodExpression, moodReplies } from './pt-BR/dialogue';
import { suggestedNames } from './pt-BR/names';
import { ui } from './pt-BR/ui';

/** Single locale for now (pt-BR). Keep strings out of logic. */
export const strings = { ui, cheers, greetings, moodReplies, moodExpression, suggestedNames, stageNames } as const;

const dictionary: Readonly<Record<string, string>> = { ...characters, ...itemNames };

/** Looks up a manifest `nameKey`. Returns undefined when the key has no translation. */
export function lookup(key: string): string | undefined {
  return dictionary[key];
}
