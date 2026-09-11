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
 * L'invariant est simple et mécanique : tout code déclaré dans une énumération
 * de statut du dépôt doit avoir un libellé français. Il se vérifie à partir des
 * énumérations elles-mêmes, pas d'une liste recopiée — une liste recopiée
 * oublierait le prochain code ajouté, ce qui est exactement le problème.
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
