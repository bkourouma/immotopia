import { logger } from '../../utils/logger';
import type { MappedGatewayState } from './types';

/**
 * Correspondance `payments.state` -> notre statut interne — contrat §2.2.
 *
 * Insensible à la casse. Toute valeur non répertoriée retombe en attente,
 * avec un avertissement dans les journaux : l'agrégateur peut introduire un
 * nouvel état sans que ce code casse, mais on veut le savoir.
 */
const SUCCESS_STATES = new Set(['SUCCESSFUL', 'SUCCESS', 'SUCCES', 'PAID', 'VALIDATED']);
const FAILED_STATES = new Set(['FAILED', 'ECHEC', 'REJECTED']);
const CANCELED_STATES = new Set(['CANCEL', 'CANCELED', 'CANCELLED', 'ABANDONED']);
const PENDING_STATES = new Set(['PENDING', 'PENDDING', 'INITIATED', '']);

export function mapProviderState(state: string | null | undefined): MappedGatewayState {
  const normalized = (state ?? '').trim().toUpperCase();

  if (SUCCESS_STATES.has(normalized)) return 'SUCCESS';
  if (FAILED_STATES.has(normalized)) return 'FAILED';
  if (CANCELED_STATES.has(normalized)) return 'CANCELED';
  if (PENDING_STATES.has(normalized)) return 'PENDING';

  logger.warn('PaySecureHub : état payments.state inconnu, traité comme en attente', { state });
  return 'PENDING';
}
