// Matches a five-field cron schedule against a UTC minute. The account service keeps two schedules, "* * * * *" and
// "41 * * * *", so a field is "*" or one number; anything else is refused when the sidecar starts rather than never
// matching.

const FIELDS = ['minute', 'hour', 'day of month', 'month', 'day of week'] as const;

export type Schedule = { text: string; fields: Array<number | null> };

export function parseSchedule(text: string): Schedule {
  const parts = text.trim().split(/\s+/);
  if (parts.length !== FIELDS.length) throw new Error(`"${text}" is not a five-field cron schedule`);
  const fields = parts.map((part, i) => {
    if (part === '*') return null;
    if (!/^\d+$/.test(part)) throw new Error(`"${text}": the ${FIELDS[i]} field "${part}" is not "*" or a number`);
    return Number(part);
  });
  return { text, fields };
}

/** True when the schedule fires in the UTC minute that holds `at`. */
export function isDue(schedule: Schedule, at: Date): boolean {
  const now = [at.getUTCMinutes(), at.getUTCHours(), at.getUTCDate(), at.getUTCMonth() + 1, at.getUTCDay()];
  return schedule.fields.every((field, i) => field === null || field === now[i]);
}
