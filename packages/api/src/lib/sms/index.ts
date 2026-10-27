import { env } from '../../config/env';
import { createDisabledSmsTransport } from './disabled';
import { createLogSmsTransport, takeLoggedSmsMessages } from './log';
import { createOrangeSmsTransport, resetOrangeTokenForTests } from './orange';
import type { SmsTransport } from './types';

/**
 * Choix du transport SMS selon `env.SMS_PROVIDER` (`disabled` par défaut).
 * Fabrique mise en cache, comme `lib/signature/provider`.
 */

export type { SmsProviderId, SmsSendResult, SmsTransport } from './types';
export { takeLoggedSmsMessages };

let cached: { id: string; transport: SmsTransport } | null = null;

export function getSmsTransport(): SmsTransport {
  const id = env.SMS_PROVIDER;
  if (cached && cached.id === id) return cached.transport;
  const transport =
    id === 'orange'
      ? createOrangeSmsTransport()
      : id === 'log'
        ? createLogSmsTransport()
        : createDisabledSmsTransport();
  cached = { id, transport };
  return transport;
}

export function isSmsAvailable(): boolean {
  return env.SMS_PROVIDER !== 'disabled';
}

/** Oublie le transport et le jeton mémorisés (tests qui changent `env`). */
export function resetSmsTransportForTests(): void {
  cached = null;
  resetOrangeTokenForTests();
}
