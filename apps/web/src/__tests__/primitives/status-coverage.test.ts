import { describe, it, expect } from 'vitest';
import { statusLabel } from '../../components/primitives/StatusTag';
import {
  RentalLeaseStatus,
  RentalInstallmentStatus,
  RentalPaymentStatus,
  RentalDocumentStatus,
  PaymentDeclarationStatus
} from '../../services/rental-service';
import { PropertyStatus, PropertyVisitStatus, PropertyFurnishingStatus } from '../../types/property-types';

/**
 * Aucun code de statut ne doit s'afficher en anglais.
 *
 * Ce test existe parce que le défaut est arrivé **deux fois**, et qu'aucun autre
 * test ne pouvait le voir : `<StatusTag>` rend fidèlement le code qu'on lui
 * donne quand il ne le connaît pas. La liste des biens a donc affiché
 * « AVAILABLE » et « RENTED » à l'utilisateur, puis celle des documents
 * « VOID ». Les deux ont été découverts à l'œil, dans l'atelier.
 *
 * L'invariant est simple : tout code de statut affichable doit avoir un
 * libellé français.
 *
 * ---------------------------------------------------------------------------
 * Ce que ce test couvre, et ce qu'il ne couvre pas — dit franchement
 * ---------------------------------------------------------------------------
 *
 * `ENUMS` réunit des objets d'énumération **exécutables** : le test itère leurs
 * valeurs, si bien qu'un code ajouté à l'une d'elles est couvert sans que
 * personne ne touche à ce fichier. C'est le cas idéal.
 *
 * `UNIONS_FINANCE` est autre chose, et il faut le dire plutôt que de laisser
 * croire. Les statuts du module financier sont des **unions de types
 * TypeScript** (`type DocumentStatus = 'DRAFT' | …`) : elles s'effacent à la
 * compilation et n'ont aucune forme qu'un test puisse parcourir. Les codes
 * sont donc recopiés ici, à la main, avec ce que cela suppose — le prochain
 * code ajouté à une union n'apparaîtra pas tout seul.
 *
 * Cette limite n'est pas théorique : ce fichier affirmait couvrir « tout code
 * déclaré dans une énumération du dépôt », les statuts financiers n'y étaient
 * pas, et `ISSUED` s'affichait en anglais sur l'écran des bons de commande
 * depuis le lot 3. Un test qui promet plus qu'il ne tient est pire qu'un test
 * absent : on cesse de regarder.
 */

const ENUMS: Record<string, Record<string, string>> = {
  RentalLeaseStatus,
  RentalInstallmentStatus,
  RentalPaymentStatus,
  RentalDocumentStatus,
  PaymentDeclarationStatus,
  PropertyStatus,
  PropertyVisitStatus,
  PropertyFurnishingStatus
};

/**
 * Statuts du module financier. Recopiés — voir l'en-tête pour pourquoi.
 *
 * La source de vérité reste `apps/web/src/types/finance-*-types.ts`. Quand une
 * union y gagne un code, il vient ici aussi, sans quoi il s'affichera en
 * anglais à un utilisateur.
 */
const UNIONS_FINANCE: Record<string, string[]> = {
  DocumentStatus: ['DRAFT', 'VALIDATED', 'VOIDED'],
  ConstructionSiteStatus: ['PLANNED', 'IN_PROGRESS', 'SUSPENDED', 'CLOSED'],
  SiteBudgetStatus: ['DRAFT', 'VALIDATED'],
  PurchaseOrderStatus: ['DRAFT', 'ISSUED', 'CANCELLED'],
  LandLeaseDocumentStatus: ['DRAFT', 'VALIDATED'],
  SalaryDocumentStatus: ['DRAFT', 'VALIDATED', 'VOIDED'],
  ContractorDocumentStatus: ['DRAFT', 'VALIDATED', 'VOIDED'],
  RetentionStatus: ['HELD', 'RELEASED']
};

/**
 * Statuts de la plateforme (super-admin), eux aussi des unions TypeScript —
 * `services/admin-subscription-service.ts` (`SubscriptionStatus`), calquée sur
 * l'enum Prisma du même nom. TRIALING et PAST_DUE manquaient à `<StatusTag>`
 * et s'affichaient en code brut sur la fiche agence (BUG-2026-09-28-002).
 */
const UNIONS_PLATFORM: Record<string, string[]> = {
  SubscriptionStatus: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED']
};

describe('StatusTag — couverture des statuts du dépôt', () => {
  for (const [nom, valeurs] of Object.entries(ENUMS)) {
    describe(nom, () => {
      for (const code of Object.values(valeurs)) {
        it(`traduit ${code}`, () => {
          const libelle = statusLabel(code);
          expect(libelle, `« ${code} » (${nom}) s'afficherait en anglais à l'utilisateur`).not.toBeNull();
          // Un libellé identique au code n'est pas une traduction : il signale
          // une entrée ajoutée pour faire taire le test sans rien traduire.
          expect(libelle).not.toBe(code);
        });
      }
    });
  }

  for (const [nom, codes] of Object.entries(UNIONS_FINANCE)) {
    describe(nom, () => {
      for (const code of codes) {
        it(`traduit ${code}`, () => {
          const libelle = statusLabel(code);
          expect(libelle, `« ${code} » (${nom}) s'afficherait en anglais à l'utilisateur`).not.toBeNull();
          expect(libelle).not.toBe(code);
        });
      }
    });
  }

  for (const [nom, codes] of Object.entries(UNIONS_PLATFORM)) {
    describe(nom, () => {
      for (const code of codes) {
        it(`traduit ${code}`, () => {
          const libelle = statusLabel(code);
          expect(libelle, `« ${code} » (${nom}) s'afficherait en anglais à l'utilisateur`).not.toBeNull();
          expect(libelle).not.toBe(code);
        });
      }
    });
  }

  it('rend null pour un code inconnu, sans se plaindre', () => {
    // Le composant doit rester tolérant : un statut inattendu s'affiche tel
    // quel plutôt que de casser l'écran. C'est la tolérance que ce test
    // encadre, pas qu'il interdit.
    expect(statusLabel('CODE_QUI_N_EXISTE_PAS')).toBeNull();
    expect(statusLabel(null)).toBeNull();
    expect(statusLabel(undefined)).toBeNull();
  });

  it('ignore la casse du code', () => {
    expect(statusLabel('available')).toBe(statusLabel('AVAILABLE'));
  });
});
