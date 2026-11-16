import { t } from '../../i18n';
import type { AnalysisTable, ArtifactProvenance, BaseAnalysisQuery, CopilotArtifact } from './contracts';

const valueLabels: Readonly<Record<string, string>> = {
  asOf: 'Date de référence',
  batchType: 'Type d’appel',
  category: 'Catégorie',
  end: 'Date de fin',
  fiscalYear: 'Exercice',
  from: 'Date de début',
  groupBy: 'Regroupement',
  month: 'Mois',
  overdueAsOf: 'Retard constaté au',
  periodFrom: 'Début de période',
  periodTo: 'Fin de période',
  priority: 'Priorité',
  propertyType: 'Type de bien',
  signedFrom: 'Signature à partir du',
  signedTo: 'Signature jusqu’au',
  stages: 'Étapes',
  start: 'Date de début',
  status: 'Statut',
  to: 'Date de fin',
  year: 'Année'
};

// Afficher qu’une sélection est appliquée sans reprendre un identifiant interne
// ni une chaîne de recherche saisie dans un autre fil.
const selectedLabels: Readonly<Record<string, string>> = {
  agentUserId: 'Négociateur sélectionné',
  assignedToUserId: 'Collaborateur sélectionné',
  budgetId: 'Budget sélectionné',
  lotId: 'Lot sélectionné',
  onlyEnding: 'Baux arrivant à échéance uniquement',
  onlyOverBudget: 'Chantiers en dépassement uniquement',
  onlyOverdue: 'Éléments en retard uniquement',
  ownerClientId: 'Propriétaire sélectionné',
  ownerContactId: 'Propriétaire sélectionné',
  programId: 'Programme sélectionné',
  propertyId: 'Bien sélectionné',
  siteId: 'Chantier sélectionné',
  syndicateId: 'Copropriété sélectionnée',
  vendorId: 'Prestataire sélectionné',
  zone: 'Zone sélectionnée'
};

function analysisFilters(query: BaseAnalysisQuery): NonNullable<ArtifactProvenance['filters']> {
  const filters: NonNullable<ArtifactProvenance['filters']> = [];
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === false || value === '') continue;
    if (Object.prototype.hasOwnProperty.call(selectedLabels, key)) filters.push({ label: t(selectedLabels[key]) });
    if (Object.prototype.hasOwnProperty.call(valueLabels, key)) {
      filters.push({ label: t(valueLabels[key]), value: Array.isArray(value) ? value.join(', ') : String(value) });
    }
  }
  switch (query.tool) {
    case 'rental_receipts':
    case 'rental_receipts_sql':
      filters.push({ label: t('Statut'), value: t('Réussi') });
      break;
    case 'rental_arrears':
      filters.push({ label: t('Échéances non soldées') });
      break;
    case 'rental_due_comparison':
    case 'rental_installments_sql':
      filters.push({ label: t('Échéances non annulées') });
      break;
  }
  if (query.tool === 'rental_installments_sql' || query.tool === 'rental_receipts_sql') {
    filters.push({ label: t('Filtres de la requête SQL') });
  }
  return filters;
}

/** Enrichit uniquement les jeux issus d’une requête métier exécutée par le serveur. */
export function withAnalysisProvenance<T extends CopilotArtifact>(artifact: T, scope: 'agency' | 'shared'): T {
  if (artifact.kind === 'table' && artifact.provenance && artifact.query && artifact.query.tool !== 'pivot_analysis') {
    return {
      ...artifact,
      provenance: { ...artifact.provenance, scope, filters: analysisFilters(artifact.query) }
    };
  }
  if (artifact.kind === 'document') {
    return {
      ...artifact,
      blocks: artifact.blocks.map(block =>
        block.kind === 'table' ? { ...block, table: withAnalysisProvenance(block.table, scope) } : block
      )
    };
  }
  return artifact;
}

export function withoutSourceMarkers(response: string): string {
  return response
    .replace(/[ \t]*\[\[source:[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}(?::[1-9][0-9]{0,8})?\]\]/g, '')
    .replace(/\[\[source:[a-fA-F0-9-]{0,36}(?::[0-9]{0,9})?\]?$/, '');
}

export function analysisSources(artifact: CopilotArtifact): AnalysisTable[] {
  if (artifact.kind === 'table' && artifact.provenance) return [artifact];
  if (artifact.kind !== 'document') return [];
  return artifact.blocks.flatMap(block => (block.kind === 'table' && block.table.provenance ? [block.table] : []));
}
