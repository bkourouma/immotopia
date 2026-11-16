import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelpContext, INERT_HELP, type HelpContextValue } from '../../help/help-context';
import { COPILOT_OPEN_EVENT } from '../../help/copilot-bridge';
import type { HelpEntry } from '../../help/types';
import HelpDrawer from '../../help/components/HelpDrawer';

const entries = new Map<string, { entry: HelpEntry; fallback: boolean }>();
const language = vi.fn(() => 'fr');

vi.mock('../../help/registry', () => ({
  useHelpEntry: (id: string | null | undefined) => {
    const found = id ? entries.get(id) : undefined;
    if (!id) return { entry: null, status: 'idle', fallback: false };
    return found
      ? { entry: found.entry, status: 'ready', fallback: found.fallback }
      : { entry: null, status: 'missing', fallback: false };
  },
  currentHelpLanguage: () => language(),
  resolvePageHelpId: () => null,
  getHelpEntry: async () => null
}));

vi.mock('../../help/feedback-api', () => ({
  sendHelpFeedback: vi.fn(async () => ({ id: 'x' }))
}));

const FULL: HelpEntry = {
  id: 'locatif.baux.liste',
  kind: 'page',
  title: 'Liste des baux',
  summary: 'Résumé de la page.',
  purpose: 'Premier paragraphe.\n\nSecond paragraphe.',
  howToRead: {
    columns: [{ key: 'a', label: 'Colonne A', description: 'Décrit A' }],
    statuses: [{ value: 's', label: 'Actif', description: 'Bail en cours' }],
    notes: ['Une note']
  },
  steps: [{ title: 'Créer', detail: 'Cliquez ici' }],
  consequences: ['Irréversible'],
  faq: [{ q: 'Pourquoi ?', a: 'Parce que.' }],
  permissions: { roles: ['Gestionnaire'], feature: 'RENTAL', note: 'Une note de droits' },
  related: [
    { label: 'Fiche liée', helpId: 'locatif.baux.liste.tableau' },
    { label: 'Nouveau bail', to: '/tenant/:tenantId/rental/leases/new' }
  ]
};

const BLOCK: HelpEntry = {
  id: 'locatif.baux.liste.tableau',
  kind: 'table',
  title: 'Tableau des baux',
  summary: 'Résumé du tableau.'
};

function renderDrawer(overrides: Partial<HelpContextValue> = {}) {
  const value: HelpContextValue = {
    ...INERT_HELP,
    available: true,
    open: true,
    pageHelpId: 'locatif.baux.liste',
    tenantId: 't1',
    ...overrides
  };
  return render(
    <MemoryRouter>
      <HelpContext.Provider value={value}>
        <HelpDrawer />
      </HelpContext.Provider>
    </MemoryRouter>
  );
}

describe('HelpDrawer', () => {
  beforeEach(() => {
    entries.clear();
    entries.set(FULL.id, { entry: FULL, fallback: false });
    entries.set(BLOCK.id, { entry: BLOCK, fallback: false });
    language.mockReturnValue('fr');
  });
  afterEach(() => vi.restoreAllMocks());

  it('rend toutes les sections dans l’ordre', () => {
    renderDrawer();
    const titles = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);
    expect(titles).toEqual([
      'À quoi ça sert',
      'Comment lire',
      'Procédure',
      'Conséquences',
      'Questions fréquentes',
      'Droits et pack nécessaires',
      'Voir aussi'
    ]);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Liste des baux');
  });

  it('ne rend pas une section absente', () => {
    entries.set(FULL.id, {
      entry: { id: FULL.id, kind: 'page', title: 'T', summary: 'S', purpose: 'P' },
      fallback: false
    });
    renderDrawer();
    const titles = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);
    expect(titles).toEqual(['À quoi ça sert']);
  });

  it('affiche deux onglets quand un bloc et une page existent', () => {
    renderDrawer({ blockHelpId: BLOCK.id });
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'Ce bloc' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Résumé du tableau.')).toBeTruthy();
  });

  it('affiche une seule vue sans bloc', () => {
    renderDrawer();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('affiche un message quand aucune fiche n’est disponible', () => {
    renderDrawer({ pageHelpId: null });
    expect(screen.getByText("Aucune aide n'est disponible pour cet écran.")).toBeTruthy();
  });

  it('signale une fonctionnalité absente du pack', () => {
    renderDrawer({ featureAccess: { RENTAL: 'NONE' } as unknown as HelpContextValue['featureAccess'] });
    expect(screen.getByText('Non inclus dans votre pack')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Voir mon abonnement' });
    expect(link.getAttribute('href')).toBe('/tenant/t1/settings/abonnement');
  });

  it('affiche Inclus dans votre pack sinon', () => {
    renderDrawer();
    expect(screen.getByText('Inclus dans votre pack')).toBeTruthy();
  });

  it('propose la visite guidée seulement avec tour', () => {
    const startTour = vi.fn();
    const closeHelp = vi.fn();
    renderDrawer({ startTour, closeHelp });
    expect(screen.queryByRole('button', { name: 'Visite guidée' })).toBeNull();
    cleanupAndRenderTour(startTour, closeHelp);
  });

  it('propose ImmoCopilot seulement si disponible et émet l’événement', () => {
    const closeHelp = vi.fn();
    const { unmount } = renderDrawer();
    expect(screen.queryByRole('button', { name: 'Demander à ImmoCopilot' })).toBeNull();
    unmount();
    const listener = vi.fn();
    window.addEventListener(COPILOT_OPEN_EVENT, listener);
    renderDrawer({ copilotAvailable: true, closeHelp });
    fireEvent.click(screen.getByRole('button', { name: 'Demander à ImmoCopilot' }));
    window.removeEventListener(COPILOT_OPEN_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.helpId).toBe(FULL.id);
    expect(detail.draft).toContain('Liste des baux');
    expect(closeHelp).toHaveBeenCalled();
  });

  it('affiche la note de repli et garde le français en ltr', () => {
    entries.set(FULL.id, { entry: FULL, fallback: true });
    language.mockReturnValue('ar');
    renderDrawer();
    expect(screen.getByText(/pas encore traduite/)).toBeTruthy();
    const title = screen.getByRole('heading', { level: 2 });
    expect(title.parentElement?.getAttribute('dir')).toBe('ltr');
    expect(title.parentElement?.getAttribute('lang')).toBe('fr');
  });

  it('découpe les paragraphes sur les lignes vides', () => {
    renderDrawer();
    expect(screen.getByText('Premier paragraphe.').tagName).toBe('P');
    expect(screen.getByText('Second paragraphe.').tagName).toBe('P');
  });

  it('affiche le HTML tel quel, sans l’interpréter', () => {
    entries.set(FULL.id, {
      entry: { id: FULL.id, kind: 'page', title: 'T', summary: 'S', purpose: '<script>alert(1)</script><b>gras</b>' },
      fallback: false
    });
    const { baseElement } = renderDrawer();
    expect(screen.getByText('<script>alert(1)</script><b>gras</b>')).toBeTruthy();
    expect(baseElement.querySelector('.ant-drawer script')).toBeNull();
  });

  it('s’ouvre à gauche en arabe et à droite sinon', () => {
    language.mockReturnValue('ar');
    const first = renderDrawer();
    expect(first.baseElement.querySelector('.ant-drawer-left')).not.toBeNull();
    first.unmount();
    language.mockReturnValue('fr');
    const second = renderDrawer();
    expect(second.baseElement.querySelector('.ant-drawer-right')).not.toBeNull();
    expect(second.baseElement.querySelector('.ant-drawer-mask')).toBeNull();
  });
});

function cleanupAndRenderTour(startTour: () => void, closeHelp: () => void) {
  document.body.innerHTML = '';
  entries.set(FULL.id, {
    entry: { ...FULL, tour: { steps: [{ target: 'a', title: 'A', description: 'B' }] } },
    fallback: false
  });
  renderDrawer({ startTour, closeHelp });
  fireEvent.click(screen.getByRole('button', { name: 'Visite guidée' }));
  expect(startTour).toHaveBeenCalledWith(FULL.id);
  expect(closeHelp).toHaveBeenCalled();
}
