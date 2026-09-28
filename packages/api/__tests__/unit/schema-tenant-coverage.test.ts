/**
 * Lot E (multi-tenant) — E3 : couverture du schema.
 *
 * Chaque modele du schema Prisma doit etre classe dans EXACTEMENT une de ces
 * trois categories :
 *
 *   1. CLOISONNE  — porte un champ `tenantId` ou `tenant_id` directement.
 *      Verifie automatiquement via `Prisma.dmmf` (comme
 *      `utils/prisma-tenant-guard-extension.ts`, D2) : rien a maintenir ici.
 *   2. ENFANT      — pas de champ d'agence propre, mais un CHEMIN DE RELATION
 *      explicite (`CHILD_MODELS` ci-dessous) vers un parent cloisonne. Le
 *      test verifie, via `Prisma.dmmf`, que chaque segment du chemin est une
 *      relation reelle, NON FACULTATIVE (`isRequired`), et que le dernier
 *      segment atterrit sur un modele cloisonne.
 *   3. GLOBAL      — plateforme, sans notion d'agence (`GLOBAL_MODELS`
 *      ci-dessous), commente au cas par cas.
 *
 * Un nouveau modele qui n'entre dans aucune des trois listes fait echouer le
 * test avec un message qui dit quoi faire. Aucune base requise : `Prisma.dmmf`
 * est disponible des que `@prisma/client` est genere (deja le cas ici),
 * independamment de toute connexion.
 */

import { Prisma } from '@prisma/client';

interface DmmfField {
  name: string;
  kind: string;
  type: string;
  isList: boolean;
  isRequired: boolean;
}
interface DmmfModel {
  name: string;
  fields: DmmfField[];
}

function allModels(): DmmfModel[] {
  const models = (Prisma as unknown as { dmmf: { datamodel: { models: DmmfModel[] } } }).dmmf.datamodel.models;
  expect(Array.isArray(models)).toBe(true);
  return models;
}

function byName(models: DmmfModel[]): Map<string, DmmfModel> {
  return new Map(models.map(m => [m.name, m]));
}

function tenantFieldOf(model: DmmfModel): string | undefined {
  return model.fields.find(f => f.name === 'tenantId' || f.name === 'tenant_id')?.name;
}

/**
 * Modeles plateforme, sans agence par nature. Commentes au cas par cas.
 * Doit rester synchronise avec `EXEMPT_MODELS` /
 * `deriveTenantFieldMap` de `utils/prisma-tenant-guard-extension.ts` pour les
 * deux cas qu'il traite en exemption (UserRole, AuditLog) : ceux-la PORTENT un
 * champ tenantId (facultatif par conception), donc tombent dans la categorie
 * CLOISONNE ici (le test C3 ne verifie pas l'obligation du champ, seulement
 * sa presence) — ils ne figurent donc pas dans cette liste.
 */
const GLOBAL_MODELS = new Set([
  'User', // Un compte peut appartenir a plusieurs agences (Membership) : pas d'agence unique.
  'Tenant', // L'agence elle-meme.
  'RefreshToken', // Rattache a un User, pas a une agence.
  'PasswordResetToken', // Rattache a un User.
  'EmailVerificationToken', // Rattache a un User.
  'Role', // Catalogue de roles (scope plateforme ou tenant, mais le modele Role lui-meme est global).
  'Permission', // Catalogue de permissions, plateforme.
  'RolePermission', // Table de jonction Role<->Permission, plateforme.
  'RoleMenuAccess', // Acces aux menus par role, plateforme (role-controller.ts).
  'Country', // Referentiel geographique public.
  'Region', // Referentiel geographique public.
  'Commune', // Referentiel geographique public.
  'PropertyTypeTemplate', // Catalogue de gabarits de biens, partage entre agences.
  // Abonnements par packs (docs/architecture/PLAN-ABONNEMENTS.md) : le
  // catalogue des offres est commun a toutes les agences et edite par le
  // super-admin ; chaque agence en fige les prix dans SubscriptionItem (cloisonne).
  'CatalogItem',
  'CatalogCapacity', // Capacite d'une offre du catalogue (enfant de CatalogItem, global lui aussi).
  // Vague 3, lot A : compteur de la serie continue IMT-AAAA-NNNNN des factures
  // PLATFORM. Une seule serie pour l'emetteur (Alliance Consultants), commune
  // a toutes les agences ; ne porte aucune donnee d'agence (annee, dernier numero).
  'PlatformInvoiceSequence',
  // Lot P4 (Patrimoine — entités détentrices et fiscalité) : référentiel
  // fiscal versionné par pays et par année, alimenté par migration, commun à
  // toutes les agences. Aucune écriture applicative (lecture seule).
  'TaxParameter'
]);

/**
 * Modeles sans champ d'agence propre, rattaches a un parent cloisonne par un
 * CHEMIN de relations (noms de champs Prisma, dans l'ordre, depuis le modele
 * lui-meme). Chaque segment est verifie par le test : la relation existe et
 * `isRequired` est vrai (pas de `?` dans le schema). Le dernier modele du
 * chemin doit etre cloisonne (porter tenantId/tenant_id).
 *
 * Ajouter une ressource = ajouter une ligne ici (ou dans GLOBAL_MODELS).
 */
const CHILD_MODELS: Record<string, string[]> = {
  // CRM
  CrmContactTag: ['contact'],
  CrmContactTargetZone: ['contact'],

  // Biens
  PropertyVisitCollaborator: ['visit'],
  PropertyQualityScore: ['property'],

  // Syndic — copropriete (rattaches a Syndicate, directement ou via un
  // ancetre commun : SyndicateLot, ChargeCall, GeneralMeeting, ...)
  SyndicateLot: ['syndicate'],
  SyndicateMaintenanceLink: ['syndicate'],
  SyndicateContractLink: ['syndicate'],
  ChargeCall: ['syndicate'],
  // Lot S2 : un paiement appartient a un lot (l'appel devient facultatif :
  // avance pure) ; ses affectations passent par le paiement.
  ChargePayment: ['lot', 'syndicate'],
  ChargePaymentAllocation: ['payment', 'lot', 'syndicate'],
  GeneralMeeting: ['syndicate'],
  GMAgendaItem: ['meeting', 'syndicate'],
  GMResolution: ['meeting', 'syndicate'],
  GMVote: ['lot', 'syndicate'],
  GMProxy: ['meeting', 'syndicate'],
  MaintenanceContract: ['syndicate'],
  CommonAreaAsset: ['syndicate'],
  SyndicateDocument: ['syndicate'],
  SyndicateFund: ['syndicate'],
  LotOwnerProfile: ['lot', 'syndicate'],
  LotTenantProfile: ['lot', 'syndicate'],
  ChargeCallBatch: ['syndicate'],
  SyndicPaymentMethod: ['syndicate'],
  PaymentReminder: ['lot', 'syndicate'],
  LatePaymentPenalty: ['lot', 'syndicate'],
  PaymentSchedule: ['lot', 'syndicate'],
  PaymentScheduleInstalment: ['schedule', 'lot', 'syndicate'],
  ReminderConfig: ['syndicate'],
  SyndicateBudget: ['syndicate'],
  BudgetLineItem: ['budget', 'syndicate'],
  BudgetAllocation: ['budget', 'syndicate'],
  OwnerAccount: ['syndicate'],
  OwnerAccountTransaction: ['account', 'syndicate'],
  SyndicateIncident: ['syndicate'],
  IncidentCostImputation: ['incident', 'syndicate'],

  // Comptabilite (JournalEntry est cloisonne directement)
  JournalEntryLine: ['entry'],

  // Patrimoine / statements de proprietaire (OwnerStatement est cloisonne)
  OwnerStatementItem: ['statement'],

  // Finance — fournisseurs (SupplierInvoice, SupplierPayment cloisonnes)
  SupplierInvoiceLine: ['invoice'],
  SupplierPaymentAllocation: ['invoice'],

  // Finance — chantiers, budgets, achats (parents cloisonnes)
  SiteBudgetLine: ['budget'],
  BudgetAmendmentLine: ['amendment'],
  PurchaseOrderLine: ['order'],

  // Finance — associations
  PartnershipShare: ['partnership'],

  // Finance — stock
  StockCountLine: ['count']
};

describe('Schema — couverture multi-tenant de chaque modele (lot E, E3)', () => {
  const models = allModels();
  const modelsByName = byName(models);

  it('a bien charge un schema non trivial (garde-fou sur Prisma.dmmf)', () => {
    expect(models.length).toBeGreaterThan(50);
  });

  it('GLOBAL_MODELS et CHILD_MODELS ne se recouvrent pas', () => {
    const overlap = Object.keys(CHILD_MODELS).filter(name => GLOBAL_MODELS.has(name));
    expect(overlap).toEqual([]);
  });

  it('chaque entree de GLOBAL_MODELS et CHILD_MODELS designe un modele qui existe reellement', () => {
    const unknownGlobals = [...GLOBAL_MODELS].filter(name => !modelsByName.has(name));
    const unknownChildren = Object.keys(CHILD_MODELS).filter(name => !modelsByName.has(name));
    expect({ unknownGlobals, unknownChildren }).toEqual({ unknownGlobals: [], unknownChildren: [] });
  });

  it('chaque modele est CLOISONNE (tenantId/tenant_id), ENFANT (CHILD_MODELS) ou GLOBAL (GLOBAL_MODELS)', () => {
    const unclassified: string[] = [];

    for (const model of models) {
      if (tenantFieldOf(model)) {
        continue; // Cloisonne.
      }
      if (GLOBAL_MODELS.has(model.name)) {
        continue;
      }
      if (CHILD_MODELS[model.name]) {
        continue;
      }
      unclassified.push(model.name);
    }

    if (unclassified.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `Modele(s) non classe(s) dans __tests__/unit/schema-tenant-coverage.test.ts : ${unclassified.join(', ')}.\n` +
          'Pour chacun : ajoutez un champ tenantId/tenant_id (cloisonne), OU une ligne dans CHILD_MODELS avec le ' +
          'chemin de relation obligatoire vers un parent cloisonne, OU une ligne commentee dans GLOBAL_MODELS ' +
          "si le modele est reellement plateforme (sans notion d'agence)."
      );
    }

    expect(unclassified).toEqual([]);
  });

  describe('CHILD_MODELS — chaque chemin de relation est reel, obligatoire, et mene a un modele cloisonne', () => {
    /** `expect(x).toBeDefined()` ne porte pas de message custom : on le fabrique nous-memes. */
    function assertDefined<T>(value: T | undefined, message: string): T {
      if (value === undefined) {
        throw new Error(message);
      }
      return value;
    }

    for (const [modelName, path] of Object.entries(CHILD_MODELS)) {
      it(`${modelName} -> ${path.join(' -> ')}`, () => {
        let current = assertDefined(modelsByName.get(modelName), `Modele ${modelName} introuvable dans le schema`);

        for (const [index, fieldName] of path.entries()) {
          const model = current;
          const field = assertDefined(
            model.fields.find(f => f.name === fieldName),
            `${model.name}.${fieldName} : relation introuvable (chemin CHILD_MODELS.${modelName})`
          );

          if (field.kind !== 'object') {
            throw new Error(`${model.name}.${fieldName} n'est pas une relation (kind=${field.kind}).`);
          }
          if (field.isList) {
            throw new Error(`${model.name}.${fieldName} est une liste : ne peut pas servir de chemin vers UN parent.`);
          }
          if (!field.isRequired) {
            throw new Error(
              `${model.name}.${fieldName} est FACULTATIF : le chemin vers l'agence peut manquer. ` +
                `Rendez la relation obligatoire dans le schema, ou verifiez-la explicitement dans le service ` +
                `avant d'agir (comme utils/property-tenant-guard.ts) et documentez pourquoi elle reste facultative.`
            );
          }

          current = assertDefined(
            modelsByName.get(field.type),
            `Modele cible ${field.type} (${model.name}.${fieldName}) introuvable dans le schema`
          );

          const isLastSegment = index === path.length - 1;
          if (isLastSegment && !tenantFieldOf(current)) {
            throw new Error(
              `Le chemin CHILD_MODELS.${modelName} (${path.join(' -> ')}) atterrit sur ${current.name}, qui n'est pas ` +
                `cloisonne (pas de tenantId/tenant_id). Corrigez le chemin ou classez ${current.name} lui-meme.`
            );
          }
        }

        expect(true).toBe(true);
      });
    }
  });
});
