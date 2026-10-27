import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { LotTypeRatesCard } from '../../components/syndics/LotTypeRatesCard';
import type { LotTypeRatesView } from '../../services/syndic-lot-type-rates-service';

/** Barème par type de lot (menu lot 2) : lecture, avertissements, édition. */

const getLotTypeRates = vi.fn();
const updateLotTypeRates = vi.fn();

vi.mock('../../services/syndic-lot-type-rates-service', () => ({
  getLotTypeRates: (...args: unknown[]) => getLotTypeRates(...args),
  updateLotTypeRates: (...args: unknown[]) => updateLotTypeRates(...args)
}));

const present = [
  { lotType: 'APARTMENT', count: 12 },
  { lotType: 'PARKING', count: 5 }
];

function makeView(overrides: Partial<LotTypeRatesView> = {}): LotTypeRatesView {
  return {
    rates: {},
    lotTypesPresent: present as LotTypeRatesView['lotTypesPresent'],
    missingTypes: ['APARTMENT', 'PARKING'],
    isEmpty: true,
    updatedAt: null,
    ...overrides
  };
}

function renderCard(canEdit = true) {
  return render(
    <AntApp>
      <LotTypeRatesCard tenantId="tenant-1" syndicId="syndic-1" canEdit={canEdit} />
    </AntApp>
  );
}

describe('LotTypeRatesCard', () => {
  beforeEach(() => {
    getLotTypeRates.mockReset();
    updateLotTypeRates.mockReset();
  });

  it('avertit quand aucun barème n’est enregistré', async () => {
    getLotTypeRates.mockResolvedValue(makeView());
    renderCard();
    expect(
      await screen.findByText('Aucun barème enregistré : le mode Par type de lot est indisponible')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Non renseigné')).toHaveLength(6);
  });

  it('nomme les types manquants d’un barème partiel', async () => {
    getLotTypeRates.mockResolvedValue(
      makeView({
        rates: { APARTMENT: 50000 },
        missingTypes: ['PARKING'],
        isEmpty: false,
        updatedAt: '2026-10-01T10:00:00.000Z'
      })
    );
    renderCard();
    expect(await screen.findByText(/Types de lots sans montant au barème : Parking/)).toBeInTheDocument();
    expect(screen.queryByText(/Aucun barème enregistré/)).not.toBeInTheDocument();
    expect(screen.getByText(/Dernière mise à jour/)).toBeInTheDocument();
  });

  it('n’affiche aucun avertissement pour un barème complet', async () => {
    getLotTypeRates.mockResolvedValue(
      makeView({
        rates: { APARTMENT: 50000, PARKING: 10000 },
        missingTypes: [],
        isEmpty: false
      })
    );
    renderCard();
    expect(await screen.findByRole('columnheader', { name: 'Montant par lot' })).toBeInTheDocument();
    expect(screen.queryByText(/Aucun barème enregistré/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sans montant au barème/)).not.toBeInTheDocument();
  });

  it('enregistre seulement les types renseignés', async () => {
    getLotTypeRates.mockResolvedValue(makeView());
    updateLotTypeRates.mockResolvedValue(makeView({ rates: { APARTMENT: 50000, CELLAR: 0 }, isEmpty: false }));
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: /Modifier le barème/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Appartement'), { target: { value: '50000' } });
    fireEvent.change(within(dialog).getByLabelText('Cave'), { target: { value: '0' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(updateLotTypeRates).toHaveBeenCalledWith('tenant-1', 'syndic-1', { APARTMENT: 50000, CELLAR: 0 })
    );
    await waitFor(() => expect(getLotTypeRates).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Barème enregistré')).toBeInTheDocument();
  });

  it('un champ vide quitté reste vide et n’est pas envoyé ; 0 saisi reste envoyé', async () => {
    getLotTypeRates.mockResolvedValue(makeView({ rates: { APARTMENT: 50000 }, isEmpty: false }));
    updateLotTypeRates.mockResolvedValue(makeView());
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: /Modifier le barème/ }));
    const dialog = await screen.findByRole('dialog');
    const parking = within(dialog).getByLabelText('Parking') as HTMLInputElement;
    fireEvent.focus(parking);
    fireEvent.blur(parking);
    expect(parking.value).toBe('');
    // Revenir à « Non renseigné » : effacer un montant déjà saisi.
    const apartment = within(dialog).getByLabelText('Appartement') as HTMLInputElement;
    fireEvent.change(apartment, { target: { value: '' } });
    fireEvent.blur(apartment);
    expect(apartment.value).toBe('');
    fireEvent.change(within(dialog).getByLabelText('Cave'), { target: { value: '0' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(updateLotTypeRates).toHaveBeenCalledWith('tenant-1', 'syndic-1', { CELLAR: 0 }));
  });

  it('refuse un montant négatif avec un message', async () => {
    getLotTypeRates.mockResolvedValue(makeView());
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: /Modifier le barème/ }));
    const dialog = await screen.findByRole('dialog');
    const apartment = within(dialog).getByLabelText('Appartement') as HTMLInputElement;
    fireEvent.change(apartment, { target: { value: '-5' } });
    fireEvent.blur(apartment);
    expect(await within(dialog).findByText('Un montant ne peut pas être négatif.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(updateLotTypeRates).not.toHaveBeenCalled();
  });

  it('refuse l’enregistrement sans aucun montant', async () => {
    getLotTypeRates.mockResolvedValue(makeView());
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: /Modifier le barème/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Renseignez au moins un montant')).toBeInTheDocument();
    expect(updateLotTypeRates).not.toHaveBeenCalled();
  });

  it('affiche l’erreur de l’API', async () => {
    getLotTypeRates.mockResolvedValue(makeView());
    updateLotTypeRates.mockRejectedValue({ response: { data: { error: 'Montant invalide' } } });
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: /Modifier le barème/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Parking'), { target: { value: '100' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Montant invalide')).toBeInTheDocument();
  });

  it('masque le bouton de modification sans droit d’écriture', async () => {
    getLotTypeRates.mockResolvedValue(makeView());
    renderCard(false);
    await screen.findByText(/Aucun barème enregistré/);
    expect(screen.queryByRole('button', { name: /Modifier le barème/ })).not.toBeInTheDocument();
  });

  it('reste discret quand la lecture échoue', async () => {
    getLotTypeRates.mockRejectedValue(new Error('boom'));
    renderCard();
    expect(await screen.findByText(/n’a pas pu être chargé/)).toBeInTheDocument();
  });
});
