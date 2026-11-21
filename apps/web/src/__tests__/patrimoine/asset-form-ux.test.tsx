import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { AssetFormDrawer } from '../../components/patrimoine/actifs/AssetFormDrawer';
import { moneyInputProps } from '../../components/patrimoine/actifs/form-helpers';
import { PatrimoineForbidden } from '../../components/patrimoine/PatrimoineForbidden';

/**
 * Saisie d'un actif (lot 5 UX) : confirmation avant d'abandonner une saisie,
 * montants lisibles avec devise visible (valeur envoyée inchangée), Entrée qui valide.
 */

const createAsset = vi.fn();
const listProperties = vi.fn();

vi.mock('../../services/patrimoine-assets-service', () => ({
  createAsset: (...a: unknown[]) => createAsset(...a),
  updateAsset: vi.fn()
}));

vi.mock('../../services/property-service', () => ({
  listProperties: (...a: unknown[]) => listProperties(...a)
}));

function monter(onClose = vi.fn(), onSaved = vi.fn()) {
  render(
    <AntApp>
      <MemoryRouter>
        <AssetFormDrawer open tenantId="agence-1" onClose={onClose} onSaved={onSaved} />
      </MemoryRouter>
    </AntApp>
  );
  return { onClose, onSaved };
}

beforeEach(() => {
  vi.clearAllMocks();
  listProperties.mockResolvedValue({ properties: [], pagination: {} });
});

describe('<AssetFormDrawer> — abandon de saisie', () => {
  it('ferme sans question quand rien n’a été saisi', async () => {
    const user = userEvent.setup();
    const { onClose } = monter();

    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('demande confirmation quand des champs sont saisis, et garde la saisie si on continue', async () => {
    const user = userEvent.setup();
    const { onClose } = monter();

    await user.type(screen.getByLabelText("Nom de l'actif"), 'Terrain');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect((await screen.findAllByText('Abandonner la saisie ?')).length).toBeGreaterThan(0);
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Continuer la saisie' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nom de l'actif")).toHaveValue('Terrain');
  });

  it('ferme après confirmation de l’abandon', async () => {
    const user = userEvent.setup();
    const { onClose } = monter();

    await user.type(screen.getByLabelText("Nom de l'actif"), 'Terrain');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(await screen.findByRole('button', { name: 'Abandonner' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe('<AssetFormDrawer> — montants et clavier', () => {
  it('affiche la devise en suffixe et envoie le montant tel que saisi', async () => {
    const user = userEvent.setup();
    createAsset.mockResolvedValue({ id: 'a1' });
    monter();

    await user.type(screen.getByLabelText("Nom de l'actif"), 'Objet');
    await user.type(screen.getByLabelText('Libellé'), 'Divers');
    await user.type(screen.getByLabelText("Coût d'acquisition"), '1500000');

    expect(screen.getAllByText('XOF').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: "Créer l'actif" }));

    await waitFor(() =>
      expect(createAsset).toHaveBeenCalledWith('agence-1', expect.objectContaining({ acquisitionCost: 1500000 }))
    );
  });

  it('valide le formulaire avec Entrée depuis un champ simple', async () => {
    const user = userEvent.setup();
    createAsset.mockResolvedValue({ id: 'a1' });
    monter();

    await user.type(screen.getByLabelText('Libellé'), 'Divers');
    await user.type(screen.getByLabelText("Nom de l'actif"), 'Objet{Enter}');

    await waitFor(() => expect(createAsset).toHaveBeenCalledTimes(1));
  });

  it('met en forme un montant sans changer sa valeur numérique', () => {
    const { formatter, parser } = moneyInputProps('XOF');
    const affiche = formatter(1500000);
    expect(affiche.replace(/\D/g, '')).toBe('1500000');
    expect(affiche).not.toBe('1500000');
    expect(Number(parser(affiche))).toBe(1500000);
    expect(Number(parser(formatter('1234.5')))).toBe(1234.5);
  });
});

describe('<PatrimoineForbidden>', () => {
  it('reste lisible hors routeur et nomme la suite à donner', () => {
    render(<PatrimoineForbidden />);
    expect(screen.getByText('Accès non autorisé')).toBeInTheDocument();
    expect(screen.getByText(/Demandez l'accès à un administrateur/)).toBeInTheDocument();
  });

  it('propose « Retour » dans un routeur', () => {
    render(
      <MemoryRouter>
        <PatrimoineForbidden />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Retour' })).toBeInTheDocument();
  });
});
