import React from 'react';
import { render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { planFieldLabel } from '../../components/copilot/copilot-labels';
import { planModuleLabel } from '../../components/copilot/write-plan-format';
import { WritePlanChangesTable } from '../../components/copilot/WritePlanChangesTable';

describe('WritePlanChangesTable — noms de champs', () => {
  it('affiche un nom lisible, garde le nom technique en infobulle, isole les valeurs', () => {
    render(<WritePlanChangesTable changes={[{ field: 'internalNotes', before: 'ancien', after: '-5 Villa' }]} />);
    const label = screen.getByText('Notes internes');
    expect(label.closest('span')).toHaveAttribute('title', 'internalNotes');
    expect(screen.queryByText('internalNotes')).not.toBeInTheDocument();
    expect(screen.getByText('-5 Villa').closest('bdi')).not.toBeNull();
  });
});

describe('planFieldLabel et planModuleLabel', () => {
  it('traduit les champs fréquents (camelCase, snake_case) et garde le repli humanisé', () => {
    expect(planFieldLabel('internalNotes')).toBe('Notes internes');
    expect(planFieldLabel('first_name')).toBe('Prénom');
    expect(planFieldLabel('lastName')).toBe('Nom de famille');
    expect(planFieldLabel('startDate')).toBe('Date de début');
    expect(planFieldLabel('color')).toBe('Couleur');
    expect(planFieldLabel('champInconnuXyz')).toBe('Champ inconnu xyz');
  });

  it('traduit les champs courants des écritures de bien, y compris en chemin imbriqué', () => {
    expect(planFieldLabel('ownershipType')).toBe('Type de détention');
    expect(planFieldLabel('propertyType')).toBe('Type de bien');
    expect(planFieldLabel('transactionMode')).toBe('Mode de transaction');
    expect(planFieldLabel('transactionModes')).toBe('Mode de transaction');
    expect(planFieldLabel('transactionModes[0]')).toBe('Mode de transaction');
    expect(planFieldLabel('status')).toBe('Statut');
    expect(planFieldLabel('address')).toBe('Adresse');
    expect(planFieldLabel('locationZone')).toBe('Zone');
    expect(planFieldLabel('price')).toBe('Prix');
    expect(planFieldLabel('currency')).toBe('Devise');
    expect(planFieldLabel('title')).toBe('Titre');
    expect(planFieldLabel('containerParentId')).toBe('Bien parent');
    expect(planFieldLabel('ownerUserId')).toBe('Propriétaire');
    expect(planFieldLabel('data.property.ownershipType')).toBe('Type de détention');
    expect(planFieldLabel('items[0].title')).toBe('Titre');
  });

  it('traduit les modules et segments de chemin, repli sur la valeur brute', () => {
    expect(planModuleLabel('CRM')).toBe('CRM');
    expect(planModuleLabel('RENTAL')).toBe('Gestion locative');
    expect(planModuleLabel('users')).toBe('Utilisateurs');
    expect(planModuleLabel('properties')).toBe('Biens');
    expect(planModuleLabel('leases')).toBe('Baux');
    expect(planModuleLabel('module-inconnu')).toBe('module-inconnu');
  });

  describe('changement de langue à chaud', () => {
    afterEach(async () => {
      await i18next.changeLanguage('fr');
    });

    it('retraduit champs et modules sans recharger les modules', async () => {
      i18next.addResourceBundle(
        'ar',
        'app',
        { 'Notes internes': 'ملاحظات داخلية', Utilisateurs: 'المستخدمون' },
        true,
        true
      );
      expect(planFieldLabel('internalNotes')).toBe('Notes internes');
      await i18next.changeLanguage('ar');
      expect(planFieldLabel('internalNotes')).toBe('ملاحظات داخلية');
      expect(planModuleLabel('users')).toBe('المستخدمون');
    });
  });
});
