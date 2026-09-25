import { env } from '../../config/env';
import type { SubscriptionEnforcement } from './entitlements';

/** Mode d'application des droits d'abonnement (SUBSCRIPTION_ENFORCEMENT, defaut `warn`). */
export function getSubscriptionEnforcement(): SubscriptionEnforcement {
  return env.SUBSCRIPTION_ENFORCEMENT;
}
