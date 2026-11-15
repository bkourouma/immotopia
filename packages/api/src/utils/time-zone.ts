import { z } from 'zod';

export const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(value => {
    if (!/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(value)) return false;
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  });
