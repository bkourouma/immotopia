/**
 * Critères à options distantes partagés par les listes du module locatif
 * (Baux, Échéances, Paiements) : locataire et bien.
 *
 * Ils remplacent les `listLeases({ limit: 500 })` qui remplissaient les filtres
 * « locataire » à chaque montage : le contrôle cherche à la frappe et ne
 * reçoit que 20 lignes au plus (guide `docs/architecture/recherche-listes.md` § e).
 *
 * - Locataire : l'API n'a pas de liste des locataires ; on cherche dans les
 *   baux (`search` couvre le nom et l'e-mail du locataire principal) et l'on
 *   garde un locataire par client. Une valeur venue de l'URL retrouve son nom
 *   par le premier bail de ce client.
 * - Bien : la liste des biens attend `q` (pas `search`).
 *
 * Fonctions et non constantes : les libellés passent par `t()` au rendu.
 */
import type { SelectCriterion } from '../../utils/list-search';
import { listLeases } from '../../services/rental-service';
import { getProperty, listProperties } from '../../services/property-service';
import { nomDeLaPersonne, nomDuBien, optionsLocatairesDesBaux } from '../../lib/rental-labels';
import { t } from '../../i18n/t';

/** Nombre maximal d'options demandées à l'API par frappe. */
export const REMOTE_OPTIONS_LIMIT = 20;

interface CriterionOptions {
  /** Clé d'URL du critère (défaut : la valeur de `api`). */
  key?: string;
  /** Nom du paramètre d'API (`primaryRenterClientId` pour les baux, `renterClientId` ailleurs). */
  api: string;
  primary?: boolean;
}

/** Critère « Locataire » à recherche distante. */
export function renterCriterion(tenantId: string | undefined, options: CriterionOptions): SelectCriterion {
  return {
    key: options.key ?? options.api,
    type: 'select',
    label: t('Locataire'),
    placeholder: t('Tous les locataires'),
    primary: options.primary,
    api: options.api,
    loadOptions: async (term: string) => {
      if (!tenantId) return [];
      const reponse = await listLeases(tenantId, {
        search: term.trim() || undefined,
        limit: REMOTE_OPTIONS_LIMIT
      });
      return optionsLocatairesDesBaux(reponse.data);
    },
    resolveLabel: async (clientId: string) => {
      if (!tenantId) return undefined;
      const reponse = await listLeases(tenantId, { primaryRenterClientId: clientId, limit: 1 });
      const bail = reponse.data?.[0];
      return bail?.primaryRenter ? nomDeLaPersonne(bail.primaryRenter.user) : undefined;
    }
  };
}

/** Libellé d'un bien dans un sélecteur : identique dans `loadOptions` et `resolveLabel`. */
export function libelleDuBien(bien: {
  title?: string | null;
  address?: string | null;
  internalReference?: string | null;
}): string {
  const nom = nomDuBien(bien);
  const reference = bien.internalReference?.trim();
  return reference && reference !== nom ? `${reference} · ${nom}` : nom;
}

/** Critère « Bien » à recherche distante. */
export function propertyCriterion(tenantId: string | undefined, options: CriterionOptions): SelectCriterion {
  return {
    key: options.key ?? options.api,
    type: 'select',
    label: t('Bien'),
    placeholder: t('Tous les biens'),
    primary: options.primary,
    api: options.api,
    loadOptions: async (term: string) => {
      if (!tenantId) return [];
      const { properties } = await listProperties(tenantId, {
        q: term.trim() || undefined,
        limit: REMOTE_OPTIONS_LIMIT
      });
      return (properties ?? []).map(bien => ({ value: bien.id, label: libelleDuBien(bien) }));
    },
    resolveLabel: async (propertyId: string) => {
      if (!tenantId) return undefined;
      const bien = await getProperty(tenantId, propertyId);
      return bien ? libelleDuBien(bien) : undefined;
    }
  };
}
