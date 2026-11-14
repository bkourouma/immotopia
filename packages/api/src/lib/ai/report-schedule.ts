import { z } from 'zod';

const timeZone = z
  .string()
  .min(1)
  .max(100)
  .refine(value => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return /^[A-Za-z][A-Za-z0-9_+/-]*$/.test(value);
    } catch {
      return false;
    }
  });

const clock = z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/);
const timing = { time: clock, timeZone };
export const reportSchedule = z.discriminatedUnion('frequency', [
  z.object({ ...timing, frequency: z.literal('daily') }).strict(),
  z.object({ ...timing, frequency: z.literal('weekly'), day: z.number().int().min(1).max(7) }).strict(),
  z.object({ ...timing, frequency: z.literal('monthly'), day: z.number().int().min(1).max(28) }).strict()
]);
export type ReportSchedule = z.infer<typeof reportSchedule>;

const dayMs = 86_400_000;

export function nextReportRun(schedule: ReportSchedule, after: Date): Date {
  const local = new Intl.DateTimeFormat('en-GB', {
    timeZone: schedule.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const localTime = (instant: number) => {
    const fields = Object.fromEntries(local.formatToParts(instant).map(part => [part.type, Number(part.value)]));
    return Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second);
  };
  const offset = (instant: number) => localTime(instant) - instant;
  const today = new Date(localTime(after.getTime()));
  const [hour, minute] = schedule.time.split(':').map(Number);
  let day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (schedule.frequency === 'weekly') {
    day += (((schedule.day % 7) - today.getUTCDay() + 7) % 7) * dayMs;
  }
  if (schedule.frequency === 'monthly') day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), schedule.day);

  for (;;) {
    const wallTime = day + (hour * 60 + minute) * 60_000;
    const candidates = [...new Set([offset(wallTime - dayMs), offset(wallTime), offset(wallTime + dayMs)])]
      .map(shift => wallTime - shift)
      .sort((a, b) => a - b);
    // When the clock repeats, take the first occurrence. During a gap,
    // advance by the size of the transition.
    const instant =
      candidates.find(value => localTime(value) === wallTime) ?? candidates.find(value => localTime(value) > wallTime);
    if (instant !== undefined && instant > after.getTime()) return new Date(instant);
    if (schedule.frequency === 'monthly') {
      const month = new Date(day);
      day = Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, schedule.day);
    } else {
      day += (schedule.frequency === 'weekly' ? 7 : 1) * dayMs;
    }
  }
}
