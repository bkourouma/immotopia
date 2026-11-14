import { nextReportRun, reportSchedule } from '../../src/lib/ai/report-schedule';

it('calcule la prochaine échéance dans le fuseau choisi', () => {
  const next = nextReportRun(
    { frequency: 'weekly', day: 1, time: '08:15', timeZone: 'Africa/Abidjan' },
    new Date('2025-01-06T08:15:00Z')
  );
  expect(next.toISOString()).toBe('2025-01-13T08:15:00.000Z');
  expect(
    nextReportRun(
      { frequency: 'monthly', day: 28, time: '18:00', timeZone: 'Asia/Kolkata' },
      new Date('2025-12-28T12:30:00Z')
    ).toISOString()
  ).toBe('2026-01-28T12:30:00.000Z');
});

it('résout une heure inexistante au printemps et ne répète pas une heure en automne', () => {
  const schedule = { frequency: 'daily', time: '02:30', timeZone: 'Europe/Paris' } as const;
  expect(nextReportRun(schedule, new Date('2025-03-30T00:00:00Z')).toISOString()).toBe('2025-03-30T01:30:00.000Z');
  expect(nextReportRun(schedule, new Date('2025-10-26T00:00:00Z')).toISOString()).toBe('2025-10-26T00:30:00.000Z');
  expect(nextReportRun(schedule, new Date('2025-10-26T00:30:00Z')).toISOString()).toBe('2025-10-27T01:30:00.000Z');
});

it('rejette les horaires, les jours et les fuseaux invalides', () => {
  const input = { frequency: 'monthly', day: 1, time: '08:00', timeZone: 'Africa/Abidjan' };
  expect(reportSchedule.safeParse(input).success).toBe(true);
  for (const invalid of [{ day: 29 }, { time: '08:01' }, { timeZone: 'Nowhere/Local' }]) {
    expect(reportSchedule.safeParse({ ...input, ...invalid }).success).toBe(false);
  }
});
