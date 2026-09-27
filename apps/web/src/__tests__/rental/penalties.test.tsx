import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Penalties } from '../../pages/rental/Penalties';

/**
 * Pénalités — les garanties de l'écran.
 *
 * Les requêtes `findBy*` portent un délai explicite : le défaut d'une seconde
 * de Testing Library suffit isolément mais pas sous la charge parallèle de la
 * suite complète.
 *
 * `userEvent` est configuré sans délai : le défaut insère une attente entre
 * chaque interaction, ce qui suffisait à faire dépasser le délai de 20 s au
 * test d'ajustement sous charge parallèle. Monter une `<Modal>` d'Ant Design
 * dans jsdom coûte déjà cher ; y ajouter des pauses artificielles ne teste
 * rien de plus.
 *
 * Le test qui compte le plus est celui de la pénalité annulée. Une pénalité
 * ramenée à zéro est un geste commercial fréquent, et `adjusted_amount || amount`
 * — le réflexe naturel — afficherait alors le montant d'origine : l'écran
 * réclamerait une somme que l'agence a explicitement annulée.
 */

const listPenalties = vi.fn();
const updatePenalty = vi.fn();
const deletePenalty = vi.fn();
const calculatePenalties = vi.fn();
const uploadPenaltyJustification = vi.fn();
const downloadPenaltyJustification = vi.fn();
const saveBlob = vi.fn();

vi.mock('../../services/rental-service', () => ({
  listPenalties: (...a: unknown[]) => listPenalties(...a),
  updatePenalty: (...a: unknown[]) => updatePenalty(...a),
  deletePenalty: (...a: unknown[]) => deletePenalty(...a),
  calculatePenalties: (...a: unknown[]) => calculatePenalties(...a),
  uploadPenaltyJustification: (...a: unknown[]) => uploadPenaltyJustification(...a),
  downloadPenaltyJustification: (...a: unknown[]) => downloadPenaltyJustification(...a)
}));

vi.mock('../../utils/save-blob', () => ({ saveBlob: (...a: unknown[]) => saveBlob(...a) }));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function penalite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pen-1',
    tenant_id: 'agence-1',
    installment_id: 'ech-1',
    amount: 132_500,
    currency: 'XOF',
    days_late: 10,
    calculated_at: '2026-04-15T00:00:00.000Z',
    adjusted_amount: null,
    adjustment_reason: null,
    created_at: '',
    updated_at: '',
    ...overrides
  };
}

function mount(penalites: unknown[]) {
  listPenalties.mockResolvedValue({ success: true, data: penalites });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/rental/penalties']}>
          <Routes>
            <Route path="/tenant/:tenantId/rental/penalties" element={<Penalties />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  updatePenalty.mockResolvedValue({ success: true });
});

describe('Pénalités — montant retenu', () => {
  it('affiche ZÉRO pour une pénalité annulée, et non le montant d’origine', async () => {
    // `adjusted_amount || amount` retomberait sur 132 500 : l'écran réclamerait
    // une somme que l'agence a annulée. Seul `??` distingue « pas d'ajustement »
    // de « ajusté à zéro ».
    mount([penalite({ adjusted_amount: 0, adjustment_reason: 'Annulée, erreur de date de valeur' })]);

    const cellules = await screen.findAllByText(/XOF/, {}, { timeout: 8000 });
    // `MoneyValue` sépare le nombre de la devise par une espace insécable :
    // comparer sur une espace ordinaire échouerait sans rien dire du code.
    const textes = cellules.map(c => c.textContent?.replace(/\s/g, ' '));
    expect(textes.some(t => t?.trim() === '0 XOF')).toBe(true);
    // Le montant calculé reste visible : on doit pouvoir vérifier ce qui a été
    // annulé, pas seulement constater qu'il ne reste rien.
    expect(textes.some(t => t?.includes('132 500'))).toBe(true);
  });

  it('retient le montant calculé quand aucun ajustement n’existe', async () => {
    mount([penalite()]);
    const montants = await screen.findAllByText(/132\s500\sXOF/, {}, { timeout: 8000 });
    // Une fois en « montant calculé », une fois en « montant retenu ».
    expect(montants.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Pénalités — lecture du champ « raison »', () => {
  it('lit une raison sérialisée en JSON', async () => {
    mount([
      penalite({
        adjusted_amount: 30_000,
        adjustment_reason: JSON.stringify({
          reason: 'Geste commercial',
          justification: { fileUrl: '/uploads/a.pdf', fileName: 'accord.pdf' }
        })
      })
    ]);
    expect(await screen.findByText('Geste commercial', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Justificatif')).toBeInTheDocument();
  });

  it('télécharge le justificatif par la route authentifiée, jamais par /uploads', async () => {
    // `/uploads/rental/penalties` répond 404 : le fichier se demande à l'API.
    const blob = new Blob(['pdf']);
    downloadPenaltyJustification.mockResolvedValue({ blob, filename: 'accord.pdf' });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    mount([
      penalite({
        adjusted_amount: 30_000,
        adjustment_reason: JSON.stringify({
          reason: 'Geste commercial',
          justification: { fileUrl: '/uploads/rental/penalties/pen-1/j.pdf', fileName: 'accord.pdf' }
        })
      })
    ]);
    await userEvent.setup({ delay: null }).click(await screen.findByText('Justificatif', {}, { timeout: 8000 }));

    await waitFor(() => expect(downloadPenaltyJustification).toHaveBeenCalledWith('agence-1', 'pen-1', 'accord.pdf'));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'accord.pdf'));
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('lit une raison en texte brut, écrite avant que le format JSON n’existe', async () => {
    // Le champ est partagé entre deux formats. Une lecture qui suppose du JSON
    // ferait disparaître les raisons anciennes sans erreur visible.
    mount([penalite({ adjusted_amount: 50_000, adjustment_reason: 'Accord verbal du 3 mars' })]);
    expect(await screen.findByText('Accord verbal du 3 mars', {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('n’offre pas de justificatif quand il n’y en a pas', async () => {
    mount([penalite()]);
    await screen.findByText('10 jours', {}, { timeout: 8000 });
    expect(screen.queryByText('Justificatif')).not.toBeInTheDocument();
  });
});

describe('Pénalités — pagination', () => {
  it('n’affiche aucune pagination : l’API n’en rend pas', async () => {
    // Le endpoint ignore `page` et `limit` et renvoie tout. L'ancienne version
    // fabriquait un compteur a partir de `data.length` et une page unique, ce
    // qui laissait croire a une pagination inexistante.
    mount([penalite({ id: 'a' }), penalite({ id: 'b' }), penalite({ id: 'c' })]);
    expect(await screen.findByText('3 pénalités', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(document.querySelector('.ant-pagination')).toBeNull();
  });

  it('n’envoie ni page ni limite au service', async () => {
    mount([penalite()]);
    await waitFor(() => expect(listPenalties).toHaveBeenCalled());
    const filtres = listPenalties.mock.calls[0][1];
    expect(filtres).not.toHaveProperty('page');
    expect(filtres).not.toHaveProperty('limit');
  });
});

describe('Pénalités — ajustement', () => {
  it('exige une raison écrite avant d’enregistrer', async () => {
    // Un montant modifié sans justification est indéfendable devant le
    // locataire comme devant le propriétaire.
    const user = userEvent.setup({ delay: null });
    mount([penalite()]);

    await user.click(await screen.findByRole('button', { name: 'Ajuster' }, { timeout: 8000 }));
    await user.click(await screen.findByRole('button', { name: /Enregistrer l'ajustement/ }));

    expect(await screen.findByText(/Indiquez pourquoi le montant est ajusté/)).toBeInTheDocument();
    expect(updatePenalty).not.toHaveBeenCalled();
  });

  it('pré-remplit le montant retenu, pas le montant calculé', async () => {
    // Rouvrir un ajustement doit montrer ce qui est en vigueur, sinon le
    // rouvrir puis valider sans rien changer écraserait l'ajustement.
    const user = userEvent.setup({ delay: null });
    mount([penalite({ adjusted_amount: 30_000, adjustment_reason: 'Geste commercial' })]);

    await user.click(await screen.findByRole('button', { name: 'Ajuster' }, { timeout: 8000 }));
    const champ = document.querySelector('.ant-modal input') as HTMLInputElement;
    expect(champ.value.replace(/\s/g, '')).toBe('30000');
  });
});
