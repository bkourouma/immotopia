import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HelpContext, INERT_HELP, type HelpContextValue } from '../../help/help-context';

vi.mock('../../help/registry', () => ({
  useHelpEntry: (id: string | null | undefined) =>
    id
      ? { entry: { id, kind: 'page', title: 'Liste des baux', summary: 'x' }, status: 'ready', fallback: false }
      : { entry: null, status: 'idle', fallback: false },
  resolvePageHelpId: () => null,
  getHelpEntry: async () => null
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { fullName: 'Alex Martin', globalRole: 'USER', avatarUrl: null },
    logout: async () => undefined
  })
}));
vi.mock('../../hooks/useBreakpoint', () => ({ useBreakpoint: () => ({ isDesktop: true }) }));
vi.mock('../../pwa/install', () => ({ promptInstall: async () => undefined, useInstallState: () => 'none' }));
vi.mock('../../components/shell/Breadcrumbs', () => ({ Breadcrumbs: () => null }));
vi.mock('../../components/shell/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));
vi.mock('../../components/TenantSwitcher', () => ({ TenantSwitcher: () => null }));

const { AppHeader } = await import('../../components/shell/AppHeader');

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function renderHeader(help?: Partial<HelpContextValue>) {
  const header = (
    <MemoryRouter initialEntries={['/dashboard']}>
      <AppHeader />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
  if (!help) return render(header);
  return render(
    <HelpContext.Provider value={{ ...INERT_HELP, available: true, ...help }}>{header}</HelpContext.Provider>
  );
}

describe('AppHeader : aide', () => {
  beforeEach(() => vi.clearAllMocks());

  it("affiche le « ? » de page quand une fiche existe et qu'aucun PageHeader ne l'a revendiqué", () => {
    const openHelp = vi.fn();
    renderHeader({ pageHelpId: 'locatif.baux.liste', openHelp });
    fireEvent.click(screen.getByRole('button', { name: /Aide/ }));
    expect(openHelp).toHaveBeenCalledWith('locatif.baux.liste');
  });

  it('ne duplique pas le « ? » quand un PageHeader le revendique', () => {
    renderHeader({ pageHelpId: 'locatif.baux.liste', pageHelpClaimed: true });
    expect(document.querySelector('[data-help-id]')).toBeNull();
  });

  it("n'affiche rien sans fiche de page", () => {
    renderHeader({ pageHelpId: null });
    expect(document.querySelector('[data-help-id]')).toBeNull();
  });

  it('ne rend aucun « ? » sans provider', () => {
    renderHeader();
    expect(document.querySelector('[data-help-id]')).toBeNull();
  });

  it("l'entrée « Centre d'aide » du menu du compte ouvre /aide", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Menu du compte' }));
    fireEvent.click(await screen.findByText("Centre d'aide"));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/aide'));
  });
});
