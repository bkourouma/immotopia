import { env } from '../../../config/env';
import { LogSmsProvider } from './log-sms.provider';
import { OrangeSmsProvider } from './orange-sms.provider';
import type { SmsProvider } from './types';

export * from './types';

let cached: SmsProvider | null = null;

/** Fournisseur SMS actif, selon `SMS_PROVIDER` (env.ts). Instance mémorisée en process. */
export function getSmsProvider(): SmsProvider {
  if (cached) return cached;
  cached = env.SMS_PROVIDER === 'orange' ? new OrangeSmsProvider() : new LogSmsProvider();
  return cached;
}
