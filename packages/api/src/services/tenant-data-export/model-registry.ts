import { Prisma } from '@prisma/client';

/**
 * Export complet d'une agence (lot S7) — quels modeles partent dans l'archive,
 * et avec quel filtre.
 *
 * La liste n'est PAS maintenue a la main : elle est derivee du schema Prisma
 * (`Prisma.dmmf.datamodel`), pour qu'un modele ajoute plus tard soit exporte
 * sans retouche ici.
 *
 *   - DIRECT   : le modele porte `tenantId` (ou `tenant_id`) → `where: { tenantId }`.
 *   - RELATION : pas de champ d'agence, mais une relation OBLIGATOIRE (non
 *     liste) vers un modele deja rattache → filtre imbrique
 *     `{ chargeCall: { syndicate: { tenantId } } }`. Chemin le plus court,
 *     calcule par parcours en largeur, niveau par niveau.
 *   - TENANT   : la ligne de l'agence elle-meme (`where: { id: tenantId }`).
 *   - USER     : les comptes membres ou clients de l'agence, champs surs
 *     seulement (voir `sensitive-fields.ts`).
 *
 * Tout modele du schema doit etre soit exporte, soit dans `EXCLUDED_MODELS`
 * avec sa raison ; `__tests__/unit/tenant-data-export.registry.test.ts`
 * echoue sur un modele non classe.
 */

export interface DmmfField {
  name: string;
  kind: string;
  type: string;
  isList: boolean;
  isRequired: boolean;
  isId?: boolean;
}

export interface DmmfModel {
  name: string;
  fields: DmmfField[];
}

export type ExportKind = 'DIRECT' | 'RELATION' | 'TENANT' | 'USER';

export interface ExportModelPlan {
  model: string;
  /** Nom du delegue Prisma (`gMVote` pour `GMVote`). */
  delegate: string;
  kind: ExportKind;
  /** DIRECT : [champ d'agence] ; RELATION : chemin de relations puis champ d'agence. */
  path: string[];
  idField: string;
}

export interface ModelClassification {
  plans: ExportModelPlan[];
  excluded: Array<{ model: string; reason: string }>;
  /** Ni exporte ni exclu : un nouveau modele a classer (le test echoue). */
  unclassified: string[];
}

/**
 * Modeles volontairement absents de l'archive. Chaque entree dit pourquoi.
 * Un modele listé ici n'est JAMAIS exporte, meme s'il porte un `tenantId`.
 */
export const EXCLUDED_MODELS: Readonly<Record<string, string>> = {
  // Securite et sessions : jetons a usage unique ou de session, rattaches a un
  // compte et non a une agence ; les remettre a un client n'a aucun sens et
  // exposerait des secrets.
  RefreshToken: 'Jeton de session (securite), rattache a un compte et non a une agence.',
  PasswordResetToken: 'Jeton de reinitialisation de mot de passe (securite).',
  EmailVerificationToken: "Jeton de verification d'adresse e-mail (securite).",
  SecureLink:
    "Lien securise a jeton (lot A3) : porte le SHA-256 du jeton d'acces public ; l'exporter remettrait un secret " +
    "d'authentification a quiconque lit l'archive. Les consultations sont dans le journal d'audit de la plateforme.",
  // Catalogues et referentiels globaux de la plateforme, sans donnee d'agence.
  Role: 'Catalogue de roles de la plateforme (sans agence).',
  Permission: 'Catalogue de permissions de la plateforme.',
  RolePermission: 'Jonction role/permission du catalogue plateforme.',
  RoleMenuAccess: 'Acces aux menus par role, reglage plateforme.',
  Country: 'Referentiel geographique public.',
  Region: 'Referentiel geographique public.',
  Commune: 'Referentiel geographique public.',
  PropertyTypeTemplate: 'Catalogue de gabarits de biens partage entre agences.',
  CatalogItem: "Catalogue des offres d'abonnement, commun a toutes les agences.",
  CatalogCapacity: "Capacites du catalogue d'offres, communes a toutes les agences.",
  PlatformInvoiceSequence: 'Compteur de la serie de factures de la plateforme, commun a toutes les agences.',
  // Compteur technique sans identifiant simple (cle composee) : les numeros
  // attribues figurent deja dans l'export des recus et quittances.
  SyndicReceiptSequence:
    'Compteur technique de numerotation des recus et quittances ; les numeros sont exportes avec chaque document.',
  // Journaux et meta-donnees de la plateforme.
  AuditLog:
    'Journal de securite de la plateforme : actions du super-admin, adresses IP et charges techniques ; ' +
    "conserve par ImmoTopia, pas remis a l'agence.",
  TenantDataExport: "Historique des exports eux-memes : chemins disque internes, sans donnee metier de l'agence.",
  // Lot P4 (Patrimoine — entités détentrices et fiscalité) : référentiel
  // fiscal de la plateforme, commun à toutes les agences.
  TaxParameter: 'Référentiel fiscal de la plateforme, commun à toutes les agences.',
  // Réglage IA (fournisseur, modèle) : singleton de la plateforme, sans donnée d'agence ni secret.
  PlatformAiSettings: "Réglage global de l'assistant IA de la plateforme (fournisseur, modèle), sans donnée d'agence."
};

/** Champs d'agence reconnus, comme `schema-tenant-coverage.test.ts`. */
export function tenantFieldOf(model: DmmfModel): string | undefined {
  return model.fields.find(f => f.name === 'tenantId' || f.name === 'tenant_id')?.name;
}

export function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function idFieldOf(model: DmmfModel): string | undefined {
  return model.fields.find(f => f.isId)?.name;
}

/** Modeles du client Prisma genere. */
export function schemaModels(): DmmfModel[] {
  return (Prisma as unknown as { dmmf: { datamodel: { models: DmmfModel[] } } }).dmmf.datamodel.models;
}

/**
 * Chemins de rattachement par parcours en largeur : niveau 0 = modeles
 * DIRECT ; au niveau n, un modele se rattache par une relation obligatoire
 * vers un modele du niveau n-1. Le premier champ trouve (ordre du schema)
 * l'emporte a longueur egale, pour un resultat stable.
 */
function relationPaths(models: DmmfModel[]): Map<string, string[]> {
  const attached = new Map<string, string[]>();
  for (const model of models) {
    const field = tenantFieldOf(model);
    if (field && !EXCLUDED_MODELS[model.name]) attached.set(model.name, [field]);
  }

  let frontier = new Set(attached.keys());
  while (frontier.size > 0) {
    const next = new Map<string, string[]>();
    for (const model of models) {
      if (attached.has(model.name) || EXCLUDED_MODELS[model.name]) continue;
      const via = model.fields.find(f => f.kind === 'object' && !f.isList && f.isRequired && frontier.has(f.type));
      if (via) next.set(model.name, [via.name, ...(attached.get(via.type) as string[])]);
    }
    for (const [name, path] of next) attached.set(name, path);
    frontier = new Set(next.keys());
  }
  return attached;
}

export function classifyModels(models: DmmfModel[] = schemaModels()): ModelClassification {
  const paths = relationPaths(models);
  const plans: ExportModelPlan[] = [];
  const excluded: ModelClassification['excluded'] = [];
  const unclassified: string[] = [];

  for (const model of models) {
    const reason = EXCLUDED_MODELS[model.name];
    if (reason) {
      excluded.push({ model: model.name, reason });
      continue;
    }
    const idField = idFieldOf(model);
    const base = { model: model.name, delegate: delegateName(model.name), idField: idField ?? 'id' };
    if (model.name === 'Tenant') {
      plans.push({ ...base, kind: 'TENANT', path: ['id'] });
    } else if (model.name === 'User') {
      plans.push({ ...base, kind: 'USER', path: [] });
    } else if (idField && paths.has(model.name)) {
      const path = paths.get(model.name) as string[];
      plans.push({ ...base, kind: path.length === 1 ? 'DIRECT' : 'RELATION', path });
    } else {
      unclassified.push(model.name);
    }
  }
  return { plans, excluded, unclassified };
}

/**
 * Filtre Prisma qui borne un modele a l'agence. Construit de l'interieur vers
 * l'exterieur : `['chargeCall', 'syndicate', 'tenantId']` donne
 * `{ chargeCall: { syndicate: { tenantId } } }`.
 */
export function buildTenantWhere(plan: ExportModelPlan, tenantId: string): Record<string, unknown> {
  if (!tenantId) throw new Error('tenantId requis pour borner un export.');
  if (plan.kind === 'USER') {
    return {
      OR: [
        { memberships: { some: { tenantId } } },
        { clientProfiles: { some: { tenantId } } },
        { userRoles: { some: { tenantId } } }
      ]
    };
  }
  let where: Record<string, unknown> = { [plan.path[plan.path.length - 1]]: tenantId };
  for (let i = plan.path.length - 2; i >= 0; i -= 1) {
    where = { [plan.path[i]]: where };
  }
  return where;
}
