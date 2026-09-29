import { t } from '../../i18n/t';
import type { CopilotToolName } from '../../types/copilot';

export interface CopilotSuggestion {
  id: string;
  /** Texte affiché et envoyé au copilote. */
  text: string;
  /** Outil dont dépend la suggestion : masquée s'il n'est pas dans `status.tools`. */
  requires: CopilotToolName;
}

const LEASE_PATH = /\/rental\/leases\/(?!new(?:\/|$))[^/]+/;
const PROPERTY_PATH = /\/properties\/(?!new(?:\/|$))[^/]+/;
const RENTAL_PATH = /\/rental(\/|$)/;

/** Suggestions selon la route courante, filtrées par les outils autorisés. */
export function getCopilotSuggestions(pathname: string, tools: readonly CopilotToolName[]): CopilotSuggestion[] {
  let candidates: CopilotSuggestion[];

  if (LEASE_PATH.test(pathname)) {
    candidates = [
      { id: 'lease-receipt', text: t('Génère la quittance de ce bail'), requires: 'propose_rental_document' },
      { id: 'lease-statement', text: t('Génère le relevé de compte de ce bail'), requires: 'propose_rental_document' },
      { id: 'lease-documents', text: t('Liste les documents de ce bail'), requires: 'list_lease_documents' }
    ];
  } else if (PROPERTY_PATH.test(pathname)) {
    candidates = [
      { id: 'property-documents', text: t('Liste les documents de ce bien'), requires: 'list_property_documents' },
      { id: 'property-leases', text: t('Quels baux concernent ce bien ?'), requires: 'search_leases' }
    ];
  } else if (RENTAL_PATH.test(pathname)) {
    candidates = [
      { id: 'rental-search', text: t('Trouve le bail du locataire…'), requires: 'search_leases' },
      { id: 'rental-receipt', text: t('Génère une quittance de loyer'), requires: 'propose_rental_document' }
    ];
  } else {
    candidates = [
      { id: 'default-properties', text: t('Montre-moi les biens disponibles'), requires: 'search_properties' },
      { id: 'default-leases', text: t('Cherche un bail par numéro'), requires: 'search_leases' },
      { id: 'default-receipt', text: t('Génère une quittance de loyer'), requires: 'propose_rental_document' }
    ];
  }

  return candidates.filter(s => tools.includes(s.requires));
}
