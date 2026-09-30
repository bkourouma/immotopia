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
      { id: 'rental-search', text: t('Montre-moi les baux en cours'), requires: 'search_leases' },
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

/** Invitation d'accueil : ne cite que les capacités que les outils autorisés couvrent. */
export function getCopilotWelcome(tools: readonly CopilotToolName[]): string {
  const subjects: string[] = [];
  if (tools.includes('search_properties')) subjects.push(t('vos biens'));
  if (tools.includes('search_leases')) subjects.push(t('vos baux'));
  if (tools.includes('list_lease_documents') || tools.includes('list_property_documents')) {
    subjects.push(t('vos documents'));
  }
  if (subjects.length === 0) return t('Posez-moi une question.');
  if (subjects.length === 1) return t('Posez une question sur {{a}}.', { a: subjects[0] });
  if (subjects.length === 2) return t('Posez une question sur {{a}} ou {{b}}.', { a: subjects[0], b: subjects[1] });
  return t('Posez une question sur vos biens, vos baux ou vos documents.');
}
