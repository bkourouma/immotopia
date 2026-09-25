import type { PaymentGatewayMode } from '@prisma/client';
import type { GatewayClient } from '../types';
import { paySecureHubClient } from './client';
import { simulatorClient } from './simulator-client';

export { paySecureHubClient } from './client';
export { simulatorClient } from './simulator-client';

/** Le client à utiliser pour une agence, selon le mode qu'elle a choisi. */
export function gatewayClientForMode(mode: PaymentGatewayMode): GatewayClient {
  return mode === 'SIMULATOR' ? simulatorClient : paySecureHubClient;
}
