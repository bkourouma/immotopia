import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelpContext, INERT_HELP } from '../../help/help-context';
import type { HelpEntry, HelpModule } from '../../help/types';

const searchHelp = vi.fn();
const getAllHelpEntries = vi.fn();

vi.mock('../../help/registry', () => ({
  searchHelp: (q: string) => searchHelp(q),
  getAllHelpEntries: () => getAllHelpEntries(),
  useHelpEntry: () => ({ entry: null, status: 'idle', fallback: false }),
  resolvePageHelpId: () => null,
  getHelpEntry: async () => null
}));

const { HelpCenterPage } = await import('../../pages/help/HelpCenterPage');

const entry = (id: string, title: string): HelpEntry => ({ id, kind: 'page', title, summary: `Résumé ${title}` });
const item = (module: HelpModule, e: HelpEntry, fallback = false) => ({ module, entry: e, fallback });

function renderPage(openHelp = vi.fn()) {
  render(
    <MemoryRouter>
      <HelpContext.Provider value={{ ...INERT_HELP, available: true, openHelp }}>
        <HelpCenterPage />
      </HelpContext.Provider>
    </MemoryRouter>
  );
  return openHelp;
}

describe('HelpCenterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchHelp.mockResolvedValue([]);
  });

  it('liste les entrées par module, triées par titre', async () => {
    getAllHelpEntries.mockResolvedValue([
      item('locatif', entry('locatif.b', 'Zèbre')),
      item('locatif', entry('locatif.a', 'Avenant')),
      item('syndic', entry('syndic.a', 'Assemblées'))
    ]);
    renderPage();
    expect(await screen.findByRole('button', { name: 'Gestion locative' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Syndic de copropriété' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finance et comptabilité' })).toBeNull();
    const ids = screen.getAllByTestId('help-entry').map(b => b.getAttribute('data-help-id'));
    expect(ids).toEqual(['locatif.a', 'locatif.b', 'syndic.a']);
  });

  it('la recherche affiche les résultats après anti-rebond', async () => {
    getAllHelpEntries.mockResolvedValue([item('locatif', entry('locatif.a', 'Avenant'))]);
    searchHelp.mockResolvedValue([
      { module: 'finance', entry: entry('finance.x', 'Quittance'), score: 5, fallback: false }
    ]);
    renderPage();
    await screen.findByText('Avenant');
    fireEvent.change(screen.getByLabelText("Rechercher dans l'aide"), { target: { value: 'quitt' } });
    expect(searchHelp).not.toHaveBeenCalled();
    expect(await screen.findByText('Quittance')).toBeInTheDocument();
    expect(searchHelp).toHaveBeenCalledWith('quitt');
    expect(screen.queryByText('Avenant')).toBeNull();
  });

  it('un clic sur une entrée ouvre sa fiche dans le panneau', async () => {
    getAllHelpEntries.mockResolvedValue([item('locatif', entry('locatif.a', 'Avenant'))]);
    const openHelp = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Avenant/ }));
    expect(openHelp).toHaveBeenCalledWith('locatif.a');
  });

  it('affiche un état vide quand la recherche ne trouve rien', async () => {
    getAllHelpEntries.mockResolvedValue([item('locatif', entry('locatif.a', 'Avenant'))]);
    renderPage();
    await screen.findByText('Avenant');
    fireEvent.change(screen.getByLabelText("Rechercher dans l'aide"), { target: { value: 'zzzz' } });
    expect(await screen.findByText(/Aucun résultat pour « zzzz »/)).toBeInTheDocument();
  });

  it("annonce que le contenu arrive quand il n'y a aucune fiche", async () => {
    getAllHelpEntries.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("Le contenu d'aide arrive progressivement.")).toBeInTheDocument();
  });

  it('balise le repli français', async () => {
    getAllHelpEntries.mockResolvedValue([item('locatif', entry('locatif.a', 'Avenant'), true)]);
    renderPage();
    const card = await screen.findByTestId('help-entry');
    expect(within(card).getByText('en français')).toBeInTheDocument();
    const title = within(card).getByText('Avenant');
    expect(title).toHaveAttribute('lang', 'fr');
    expect(title).toHaveAttribute('dir', 'ltr');
  });

  it('un échec de chargement reste non bloquant', async () => {
    getAllHelpEntries.mockRejectedValue(new Error('réseau'));
    renderPage();
    await waitFor(() => expect(screen.getByText(/n'a pas pu être chargée/)).toBeInTheDocument());
    expect(screen.getByLabelText("Rechercher dans l'aide")).toBeInTheDocument();
  });
});
