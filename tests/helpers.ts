import type { Goal, GoalInput } from '../src/core/goals/types';
import { addGoal } from '../src/core/game';
import { initialState, type GameState } from '../src/core/state';

/** A moment on a given day in the default time zone (America/Sao_Paulo, UTC-3). */
export const at = (day: string, time = '12:00'): Date => new Date(`${day}T${time}:00-03:00`);

export const goalInput = (over: Partial<GoalInput> = {}): GoalInput => ({
  title: 'Beber água',
  difficulty: 'easy',
  recurrence: { type: 'daily' },
  ...over,
});

let counter = 0;
export const nextId = (): string => `goal-${++counter}`;

/** A ready-to-play state: onboarded, with the given goals created on `createdOn` (they start the next day). */
export function stateWith(createdOn: string, inputs: GoalInput[]): GameState {
  let state: GameState = {
    ...initialState(),
    profile: { displayName: 'Ana', activeCharacterId: 'mountain-goat', characters: { 'mountain-goat': { name: 'Pico' } }, onboarded: true },
  };
  for (const input of inputs) {
    const result = addGoal(state, input, at(createdOn), nextId());
    if (!result.ok) throw new Error(`could not add goal: ${result.reason}`);
    state = result.state;
  }
  return state;
}

export const goalIds = (state: GameState): string[] => state.goals.map((g: Goal) => g.id);
