import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import HelpFeedbackPage from '../../pages/admin/HelpFeedbackPage';

vi.mock('../../services/help-feedback-admin-service', () => ({
  fetchPlatformHelpFeedback: vi.fn(),
  fetchTenantHelpFeedback: vi.fn()
}));

import { fetchPlatformHelpFeedback, fetchTenantHelpFeedback } from '../../services/help-feedback-admin-service';

const platform = fetchPlatformHelpFeedback as unknown as ReturnType<typeof vi.fn>;
const tenant = fetchTenantHelpFeedback as unknown as ReturnType<typeof vi.fn>;

const SCRIPT = '<script>alert(1)</script>';

function summary(tenantName: string | null) {
  return {
    items: [
      {
        helpId: 'finance.cash',
        useful: 3,
        notUseful: 7,
        questionsCount: 2,
        lastAt: '2026-11-10T10:00:00.000Z',
        questions: [
          { text: `Comment faire ?\n${SCRIPT}`, createdAt: '2026-11-10T10:00:00.000Z', locale: 'fr', tenantName },
          { text: 'Deuxième question', createdAt: '2026-11-09T10:00:00.000Z', locale: 'en', tenantName }
        ]
      },
      {
        helpId: 'crm.leads',
        useful: 1,
        notUseful: 0,
        questionsCount: 0,
        lastAt: '2026-11-01T10:00:00.000Z',
        questions: []
      }
    ]
  };
}

function renderPlatform() {
  return render(
    <MemoryRouter>
      <HelpFeedbackPage scope="platform" />
    </MemoryRouter>
  );
}

beforeEach(() => {
  platform.mockReset();
  tenant.mockReset();
});

describe('<HelpFeedbackPage>', () => {
  it('affiche le tableau et charge 30 jours par défaut (plateforme)', async () => {
    platform.mockResolvedValue(summary('Agence Alpha'));
    renderPlatform();

    expect(await screen.findByText('finance.cash')).toBeInTheDocument();
    expect(screen.getByText('crm.leads')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(platform).toHaveBeenCalledWith(30);
  });

  it('recharge avec la nouvelle période', async () => {
    platform.mockResolvedValue(summary(null));
    const user = userEvent.setup();
    renderPlatform();
    await screen.findByText('finance.cash');

    await user.click(screen.getByText('90 jours'));
    await screen.findByText('finance.cash');
    expect(platform).toHaveBeenCalledWith(90);
  });

  it("déplie les questions en texte brut avec le nom de l'agence (plateforme)", async () => {
    platform.mockResolvedValue(summary('Agence Alpha'));
    const user = userEvent.setup();
    renderPlatform();

    await user.click(await screen.findByText('finance.cash'));

    expect(await screen.findByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('Deuxième question')).toBeInTheDocument();
    expect(screen.getAllByText(/Agence : Agence Alpha/).length).toBeGreaterThan(0);
  });

  it("affiche l'état vide", async () => {
    platform.mockResolvedValue({ items: [] });
    renderPlatform();
    expect(await screen.findByText('Aucun avis sur cette période.')).toBeInTheDocument();
  });

  it("affiche l'erreur puis réessaie", async () => {
    platform.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(summary(null));
    const user = userEvent.setup();
    renderPlatform();

    await user.click(await screen.findByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('finance.cash')).toBeInTheDocument();
    expect(platform).toHaveBeenCalledTimes(2);
  });

  it("scope agence : lit le tenantId de l'URL et n'affiche aucun nom d'agence", async () => {
    tenant.mockResolvedValue(summary(null));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/tenant/t-42/aide']}>
        <Routes>
          <Route path="/tenant/:tenantId/aide" element={<HelpFeedbackPage scope="agency" />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(await screen.findByText('finance.cash'));
    await screen.findByText('Deuxième question');

    expect(tenant).toHaveBeenCalledWith('t-42', 30);
    expect(platform).not.toHaveBeenCalled();
    expect(screen.queryByText(/Agence :/)).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Agence' })).toBeNull();
  });
});
