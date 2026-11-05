import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SyndicMandatingAgencies } from '../../pages/syndics/SyndicMandatingAgencies';

/** Agences mandantes : recherche locale, critères et pagination locale de 20. */

const isDesktop = vi.hoisted(() => ({ value: true }));
const listMandatingAgencies = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    screens: {},
    active: isDesktop.value ? 'lg' : 'xs',
    isMobile: !isDesktop.value,
    isTablet: false,
    isDesktop: isDesktop.value
  })
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'tenant-1' } })
}));

vi.mock('../../services/document-branding-service', async importActual => ({
  ...(await importActual<typeof import('../../services/document-branding-service')>()),
  listMandatingAgencies: (...args: unknown[]) => listMandatingAgencies(...args)
}));

const T = { timeout: 8000 };

function agence(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    legalName: null,
    address: null,
    phone: null,
    email: null,
    rccm: null,
    taxId: null,
    hasLogo: false,
    hasSignature: false,
    hasStamp: false,
    logoUrl: null,
    signatureUrl: null,
    stampUrl: null,
    syndicateCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra
  };
}

function renderPage() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/mandants']}>
        <Routes>
          <Route path="/tenant/:tenantId/syndics/mandants" element={<SyndicMandatingAgencies />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

const trois = () => [
  agence('a1', 'Agence Alpha', { email: 'contact@alpha.ci', address: 'Cocody, Abidjan', syndicateCount: 2 }),
  agence('a2', 'Agence Beta', { rccm: 'CI-ABJ-2020-B-1234', syndicateCount: 0 }),
  agence('a3', 'Cabinet Gamma', { legalName: 'Gamma Immobilier SARL', phone: '+225 07 11 22 33' })
];

beforeEach(() => {
  isDesktop.value = true;
  listMandatingAgencies.mockReset();
});

describe('SyndicMandatingAgencies : recherche', () => {
  it('filtre à la saisie sur le nom, la raison sociale, l’adresse, l’e-mail, le téléphone ou le RCCM', async () => {
    listMandatingAgencies.mockResolvedValue(trois());
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Agence Alpha', undefined, T);
    const champ = () => within(screen.getByRole('search')).getByRole('textbox');

    await user.type(champ(), 'abidjan{enter}');
    await screen.findByText('Agence Alpha', undefined, T);
    expect(screen.queryByText('Agence Beta')).toBeNull();
    expect(screen.queryByText('Cabinet Gamma')).toBeNull();

    await user.clear(champ());
    await user.type(champ(), 'sarl{enter}');
    await screen.findByText('Cabinet Gamma', undefined, T);
    expect(screen.queryByText('Agence Alpha')).toBeNull();

    await user.clear(champ());
    await user.type(champ(), 'B-1234{enter}');
    await screen.findByText('Agence Beta', undefined, T);
    expect(screen.queryByText('Cabinet Gamma')).toBeNull();
  });

  it('filtre par copropriétés gérées (critère Oui)', async () => {
    listMandatingAgencies.mockResolvedValue(trois());
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Agence Alpha', undefined, T);

    await user.click(within(screen.getByRole('search')).getByRole('combobox', { name: 'Copropriétés gérées' }));
    await user.click(await screen.findByTitle('Avec copropriétés'));

    await screen.findByText('Agence Alpha', undefined, T);
    expect(screen.queryByText('Agence Beta')).toBeNull();
    expect(screen.queryByText('Cabinet Gamma')).toBeNull();
  });

  it('affiche « aucun résultat » avec un bouton pour effacer les critères', async () => {
    listMandatingAgencies.mockResolvedValue(trois());
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Agence Alpha', undefined, T);

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'zzzz{enter}');

    const effacer = await screen.findAllByRole('button', { name: 'Effacer les critères' }, T);
    expect(screen.queryByText('Agence Alpha')).toBeNull();
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('Agence Alpha', undefined, T)).toBeTruthy();
    expect(screen.getByText('Agence Beta')).toBeTruthy();
  });

  it('sans agence : état vide, pas de barre de recherche', async () => {
    listMandatingAgencies.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Aucune agence mandante enregistrée', undefined, T)).toBeTruthy();
    expect(screen.queryByRole('search')).toBeNull();
  });

  it('pagine par 20 en local', async () => {
    listMandatingAgencies.mockResolvedValue(
      Array.from({ length: 23 }, (_, index) => agence(`a${index + 1}`, `Mandant ${String(index + 1).padStart(2, '0')}`))
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mandant 01', undefined, T);
    expect(screen.getByText('Mandant 20')).toBeTruthy();
    expect(screen.queryByText('Mandant 21')).toBeNull();

    await user.click(screen.getByTitle('2'));
    await screen.findByText('Mandant 21', undefined, T);
    expect(screen.queryByText('Mandant 01')).toBeNull();
  });
});
