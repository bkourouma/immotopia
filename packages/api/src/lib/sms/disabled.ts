import type { SmsTransport } from './types';

/** Transport `disabled` (défaut) : aucun SMS ne part. */
export function createDisabledSmsTransport(): SmsTransport {
  return {
    id: 'disabled',
    async send() {
      return { ok: false, reason: 'DISABLED' };
    }
  };
}
