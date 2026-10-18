import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { ReceivingNumbersCard } from '../../../components/syndics/declared-payment/ReceivingNumbersCard';
import { DeclaredSettingsCard } from '../../../components/syndics/declared-payment/DeclaredSettingsCard';
import type { DeclaredPaymentSettings, ReceivingNumberAdmin } from '../../../services/syndic-declared-payment-service';

/**
 * Écrans gestionnaire de la spec 047, lot L7 : numéros de réception et réglages.
 * Le service est mocké en entier : chaque export utilisé par les composants doit
 * figurer ci-dessous, Vitest refusant tout import non déclaré. Les helpers
 * (helpers.ts, online-payment/helpers) ne sont volontairement pas mockés.
 */

const listSyndicReceivingNumbers = vi.fn();
const createSyndicReceivingNumber = vi.fn();
const updateSyndicReceivingNumber = vi.fn();
const deleteSyndicReceivingNumber = vi.fn();
const getSyndicDeclaredSettings = vi.fn();
const updateSyndicDeclaredSettings = vi.fn();

vi.mock('../../../services/syndic-declared-payment-service', () => ({
  listSyndicReceivingNumbers: (...a: unknown[]) => listSyndicReceivingNumbers(...a),
  createSyndicReceivingNumber: (...a: unknown[]) => createSyndicReceivingNumber(...a),
  updateSyndicReceivingNumber: (...a: unknown[]) => updateSyndicReceivingNumber(...a),
  deleteSyndicReceivingNumber: (...a: unknown[]) => deleteSyndicReceivingNumber(...a),
  getSyndicDeclaredSettings: (...a: unknown[]) => getSyndicDeclaredSettings(...a),
  updateSyndicDeclaredSettings: (...a: unknown[]) => updateSyndicDeclaredSettings(...a)
}));

function numero(overrides: Partial<ReceivingNumberAdmin> = {}): ReceivingNumberAdmin {
  return {
    id: 'n1',
    operator: 'ORANGE',
    phoneNumber: '+2250707070707',
    holderName: 'Syndic Les Palmiers',
    label: 'Principal',
    isActive: true,
    sortOrder: 0,
    treasuryAccountNumber: '55211',
    treasuryBalance: 125000,
    sharedWithCount: 0,
    pendingDeclarations: 2,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides
  };
}

function reglages(overrides: Partial<DeclaredPaymentSettings> = {}): DeclaredPaymentSettings {
  return {
    syndicateId: 's1',
    enabled: false,
    reviewAlertBusinessDays: 3,
    proofRequired: true,
    payerInstructions: null,
    aiPrefillEnabled: false,
    aiPrefillAvailable: true,
    aiReadsThisMonth: 10,
    aiReadsMonthlyQuota: 300,
    usable: true,
    ...overrides
  };
}

function wrap(node: React.ReactNode) {
  return render(<AntApp>{node}</AntApp>);
}

const rejected = (status: number, code: string, message: string) => ({
  response: { status, data: { code, message } }
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReceivingNumbersCard', () => {
  it('affiche le numéro, le solde du sous-compte et les déclarations en attente', async () => {
    listSyndicReceivingNumbers.mockResolvedValue([numero()]);
    wrap(<ReceivingNumbersCard tenantId="t1" syndicId="s1" />);

    expect(await screen.findByText('+225 07 07 07 07 07')).toBeTruthy();
    expect(screen.getByText('Orange Money')).toBeTruthy();
    expect(screen.getByText('Syndic Les Palmiers')).toBeTruthy();
    expect(screen.getByText('55211')).toBeTruthy();
    expect(screen.getByText(/125[\s.,]?000/)).toBeTruthy();
    expect(screen.getAllByText('Actif').some(el => el.closest('.ant-tag'))).toBe(true);
    expect(screen.queryByText(/reçoit aussi les paiements/)).toBeNull();
  });

  it('avertit qu’un numéro est partagé avec d’autres copropriétés', async () => {
    listSyndicReceivingNumbers.mockResolvedValue([numero({ sharedWithCount: 2 })]);
    wrap(<ReceivingNumbersCard tenantId="t1" syndicId="s1" />);

    expect(
      await screen.findByText(
        'Ce numéro reçoit aussi les paiements de 2 autre(s) copropriété(s) : le rapprochement se fera sur la référence.'
      )
    ).toBeTruthy();
  });

  it('ajoute un numéro avec le corps attendu puis recharge et prévient la page', async () => {
    listSyndicReceivingNumbers.mockResolvedValue([]);
    createSyndicReceivingNumber.mockResolvedValue(numero());
    const onChanged = vi.fn();
    wrap(<ReceivingNumbersCard tenantId="t1" syndicId="s1" onChanged={onChanged} />);

    expect(await screen.findByText('Aucun numéro de réception pour le moment.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un numéro/ }));

    fireEvent.change(await screen.findByLabelText('Numéro de téléphone'), { target: { value: ' 07 07 07 07 07 ' } });
    fireEvent.change(screen.getByLabelText('Titulaire du compte'), { target: { value: 'Syndic Les Palmiers' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(createSyndicReceivingNumber).toHaveBeenCalled());
    expect(createSyndicReceivingNumber).toHaveBeenCalledWith('t1', 's1', {
      operator: 'ORANGE',
      phoneNumber: '07 07 07 07 07',
      holderName: 'Syndic Les Palmiers',
      label: null,
      isActive: true
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(listSyndicReceivingNumbers.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('affiche le message du serveur sur le champ numéro pour INVALID_PHONE', async () => {
    listSyndicReceivingNumbers.mockResolvedValue([]);
    createSyndicReceivingNumber.mockRejectedValue(rejected(400, 'INVALID_PHONE', 'Numéro ivoirien invalide.'));
    wrap(<ReceivingNumbersCard tenantId="t1" syndicId="s1" />);

    await screen.findByText('Aucun numéro de réception pour le moment.');
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un numéro/ }));
    fireEvent.change(await screen.findByLabelText('Numéro de téléphone'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('Titulaire du compte'), { target: { value: 'Awa Koné' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Numéro ivoirien invalide.')).toBeTruthy();
  });

  it('désactive un numéro après confirmation, sans toucher aux autres champs', async () => {
    listSyndicReceivingNumbers.mockResolvedValue([numero()]);
    updateSyndicReceivingNumber.mockResolvedValue(numero({ isActive: false }));
    wrap(<ReceivingNumbersCard tenantId="t1" syndicId="s1" />);

    await screen.findByText('+225 07 07 07 07 07');
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }));
    expect(await screen.findByText(/restent validables/)).toBeTruthy();

    const confirmer = screen.getAllByRole('button', { name: 'Désactiver' });
    fireEvent.click(confirmer[confirmer.length - 1]);

    await waitFor(() => expect(updateSyndicReceivingNumber).toHaveBeenCalled());
    expect(updateSyndicReceivingNumber).toHaveBeenCalledWith('t1', 's1', 'n1', { isActive: false });
  });

  it('refuse la suppression d’un numéro en usage et conseille de le désactiver', async () => {
    listSyndicReceivingNumbers.mockResolvedValue([numero()]);
    deleteSyndicReceivingNumber.mockRejectedValue(rejected(409, 'RECEIVING_NUMBER_IN_USE', 'Numéro utilisé.'));
    const onChanged = vi.fn();
    wrap(<ReceivingNumbersCard tenantId="t1" syndicId="s1" onChanged={onChanged} />);

    await screen.findByText('+225 07 07 07 07 07');
    fireEvent.click(screen.getByRole('button', { name: /Supprimer/ }));
    const boutons = await screen.findAllByRole('button', { name: /Supprimer/ });
    fireEvent.click(boutons[boutons.length - 1]);

    await waitFor(() => expect(deleteSyndicReceivingNumber).toHaveBeenCalledWith('t1', 's1', 'n1'));
    expect(await screen.findByText('Ce numéro porte des déclarations : désactivez-le plutôt.')).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('propose de désactiver quand la modification d’un numéro en usage est refusée', async () => {
    listSyndicReceivingNumbers.mockResolvedValue([numero()]);
    updateSyndicReceivingNumber.mockRejectedValueOnce(
      rejected(409, 'RECEIVING_NUMBER_IN_USE', 'Ce numéro porte des déclarations.')
    );
    updateSyndicReceivingNumber.mockResolvedValueOnce(numero({ isActive: false }));
    wrap(<ReceivingNumbersCard tenantId="t1" syndicId="s1" />);

    await screen.findByText('+225 07 07 07 07 07');
    fireEvent.click(screen.getByRole('button', { name: /Modifier/ }));
    fireEvent.change(await screen.findByLabelText('Numéro de téléphone'), { target: { value: '05 05 05 05 05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Ce numéro porte des déclarations.')).toBeTruthy();
    expect(updateSyndicReceivingNumber.mock.calls[0][3]).toEqual({ phoneNumber: '05 05 05 05 05' });

    fireEvent.click(screen.getByRole('button', { name: 'Désactiver ce numéro' }));
    await waitFor(() => expect(updateSyndicReceivingNumber).toHaveBeenCalledTimes(2));
    expect(updateSyndicReceivingNumber.mock.calls[1][3]).toEqual({ isActive: false });
  });

  it('n’affiche aucun bouton d’écriture sans canEdit', async () => {
    listSyndicReceivingNumbers.mockResolvedValue([numero()]);
    wrap(<ReceivingNumbersCard tenantId="t1" syndicId="s1" canEdit={false} />);

    await screen.findByText('+225 07 07 07 07 07');
    expect(screen.queryByRole('button', { name: /Ajouter un numéro/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Modifier/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Désactiver' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull();
  });

  it('propose « Réessayer » quand le chargement échoue', async () => {
    listSyndicReceivingNumbers.mockRejectedValueOnce(rejected(500, 'INTERNAL', 'Panne serveur.'));
    listSyndicReceivingNumbers.mockResolvedValueOnce([numero()]);
    wrap(<ReceivingNumbersCard tenantId="t1" syndicId="s1" />);

    expect(await screen.findByText('Panne serveur.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Réessayer/ }));
    expect(await screen.findByText('+225 07 07 07 07 07')).toBeTruthy();
  });
});

describe('DeclaredSettingsCard', () => {
  it('avertit quand les paiements déclarés sont activés sans numéro actif', async () => {
    getSyndicDeclaredSettings.mockResolvedValue(reglages({ enabled: true, usable: false }));
    wrap(<DeclaredSettingsCard tenantId="t1" syndicId="s1" />);

    expect(
      await screen.findByText(
        'Ajoutez au moins un numéro de réception actif : tant qu’il n’y en a pas, le portail n’affiche rien.'
      )
    ).toBeTruthy();
  });

  it('enregistre seulement les champs modifiés et désactive le bouton sans changement', async () => {
    getSyndicDeclaredSettings.mockResolvedValue(reglages());
    updateSyndicDeclaredSettings.mockResolvedValue(
      reglages({ enabled: true, payerInstructions: 'Indiquez la référence' })
    );
    const onChanged = vi.fn();
    wrap(<DeclaredSettingsCard tenantId="t1" syndicId="s1" onChanged={onChanged} />);

    const save = (await screen.findByRole('button', { name: 'Enregistrer' })) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.click(screen.getByRole('switch', { name: 'Accepter les paiements déclarés' }));
    fireEvent.change(screen.getByLabelText('Consigne affichée au copropriétaire'), {
      target: { value: 'Indiquez la référence' }
    });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(updateSyndicDeclaredSettings).toHaveBeenCalled());
    expect(updateSyndicDeclaredSettings).toHaveBeenCalledWith('t1', 's1', {
      enabled: true,
      payerInstructions: 'Indiquez la référence'
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(save.disabled).toBe(true));
  });

  it('borne le délai d’alerte entre 1 et 15 jours ouvrés', async () => {
    getSyndicDeclaredSettings.mockResolvedValue(reglages());
    updateSyndicDeclaredSettings.mockResolvedValue(reglages({ reviewAlertBusinessDays: 15 }));
    wrap(<DeclaredSettingsCard tenantId="t1" syndicId="s1" />);

    const field = (await screen.findByLabelText('Délai d’alerte (jours ouvrés)')) as HTMLInputElement;
    fireEvent.change(field, { target: { value: '99' } });
    fireEvent.blur(field);
    await waitFor(() => expect(field.value).toBe('15'));

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(updateSyndicDeclaredSettings).toHaveBeenCalled());
    expect(updateSyndicDeclaredSettings.mock.calls[0][2]).toEqual({ reviewAlertBusinessDays: 15 });
  });

  it('limite la consigne à 500 caractères et affiche le compteur', async () => {
    getSyndicDeclaredSettings.mockResolvedValue(reglages({ payerInstructions: 'Bonjour' }));
    wrap(<DeclaredSettingsCard tenantId="t1" syndicId="s1" />);

    const area = (await screen.findByLabelText('Consigne affichée au copropriétaire')) as HTMLTextAreaElement;
    expect(area.maxLength).toBe(500);
    expect(screen.getByText('7 / 500')).toBeTruthy();
  });

  it('affiche le message du serveur quand l’enregistrement est refusé', async () => {
    getSyndicDeclaredSettings.mockResolvedValue(reglages());
    updateSyndicDeclaredSettings.mockRejectedValue(rejected(400, 'VALIDATION_ERROR', 'Délai invalide.'));
    wrap(<DeclaredSettingsCard tenantId="t1" syndicId="s1" />);

    fireEvent.click(await screen.findByRole('switch', { name: 'Capture obligatoire' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Délai invalide.')).toBeTruthy();
  });

  it('laisse l’interrupteur IA affiché mais désactivé quand la lecture n’est pas disponible', async () => {
    getSyndicDeclaredSettings.mockResolvedValue(reglages({ aiPrefillAvailable: false }));
    wrap(<DeclaredSettingsCard tenantId="t1" syndicId="s1" />);

    const ia = (await screen.findByRole('switch', {
      name: 'Pré-remplir par IA la déclaration à partir de la capture'
    })) as HTMLButtonElement;
    expect(ia.disabled).toBe(true);
    expect(screen.getByText('La lecture automatique n’est pas disponible sur ce serveur.')).toBeTruthy();
    expect(screen.queryByText(/Lectures IA ce mois-ci/)).toBeNull();
  });

  it('affiche le compteur du mois et le message de quota atteint à 100 %', async () => {
    getSyndicDeclaredSettings.mockResolvedValue(
      reglages({ aiPrefillEnabled: true, aiReadsThisMonth: 300, aiReadsMonthlyQuota: 300 })
    );
    wrap(<DeclaredSettingsCard tenantId="t1" syndicId="s1" />);

    expect(await screen.findByText('Lectures IA ce mois-ci : 300 sur 300')).toBeTruthy();
    expect(
      screen.getByText('Quota atteint : la lecture automatique est suspendue jusqu’au mois prochain.')
    ).toBeTruthy();
    expect(
      (
        screen.getByRole('switch', {
          name: 'Pré-remplir par IA la déclaration à partir de la capture'
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
  });

  it('n’affiche pas l’alerte de quota sous 100 %', async () => {
    getSyndicDeclaredSettings.mockResolvedValue(reglages({ aiReadsThisMonth: 270 }));
    wrap(<DeclaredSettingsCard tenantId="t1" syndicId="s1" />);

    expect(await screen.findByText('Lectures IA ce mois-ci : 270 sur 300')).toBeTruthy();
    expect(screen.queryByText(/Quota atteint/)).toBeNull();
  });

  it('est en lecture seule sans canEdit', async () => {
    getSyndicDeclaredSettings.mockResolvedValue(reglages({ enabled: true }));
    wrap(<DeclaredSettingsCard tenantId="t1" syndicId="s1" canEdit={false} />);

    const accept = (await screen.findByRole('switch', {
      name: 'Accepter les paiements déclarés'
    })) as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    expect((screen.getByLabelText('Consigne affichée au copropriétaire') as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
  });
});
