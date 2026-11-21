/**
 * Altitude is calibrated by TIME, not by number: a reference player earns about 10 points a day.
 * At 5 m per point that is 50 m/day, so every milestone below is "days x 50 m".
 */
export const METERS_PER_POINT = 5;
export const REFERENCE_DAILY_POINTS = 10;
export const REFERENCE_DAILY_METERS = METERS_PER_POINT * REFERENCE_DAILY_POINTS;

export const COINS_PER_POINT = 2;
export const ENERGY_PER_POINT = 1;

export interface Reward {
  coins: number;
  energy: number;
  altitude: number;
}

/**
 * Coins and energy follow the goal's own value (so a capped day never feels wasted);
 * altitude follows the awarded ranking points, so the daily cap also limits the climb.
 */
export function rewardFor(args: { basePoints: number; awardedPoints: number }): Reward {
  return {
    coins: args.basePoints * COINS_PER_POINT,
    energy: args.basePoints * ENERGY_PER_POINT,
    altitude: args.awardedPoints * METERS_PER_POINT,
  };
}

/** Days of regular use each milestone should take, for the reference player. */
export const MILESTONE_DAYS: readonly number[] = [3, 7, 14, 30, 45, 60, 90, 120, 165];

/** Each milestone unlocks scenery and items (stage 4). Evolution thresholds are among them. */
export const ALTITUDE_MILESTONES: readonly number[] = MILESTONE_DAYS.map((d) => d * REFERENCE_DAILY_METERS);

export const reachedMilestones = (altitude: number): number[] => ALTITUDE_MILESTONES.filter((m) => altitude >= m);

export function nextMilestone(altitude: number): number | null {
  return ALTITUDE_MILESTONES.find((m) => altitude < m) ?? null;
}

/** 0..1 progress between the last reached milestone and the next one (1 once everything is reached). */
export function progressToNextMilestone(altitude: number): number {
  const next = nextMilestone(altitude);
  if (next === null) return 1;
  const reached = reachedMilestones(altitude);
  const previous = reached.length > 0 ? reached[reached.length - 1]! : 0;
  return (altitude - previous) / (next - previous);
}
