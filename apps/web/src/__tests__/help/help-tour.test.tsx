import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpContext, INERT_HELP, type HelpContextValue } from '../../help/help-context';
import type { HelpEntry } from '../../help/types';

let entryState: { entry: HelpEntry | null; status: string; fallback: boolean };
vi.mock('../../help/registry', () => ({
  useHelpEntry: () => entryState
}));

const markTourSeen = vi.fn();
vi.mock('../../help/tour-storage', () => ({
  markTourSeen: (id: string) => markTourSeen(id)
}));

import HelpTour from '../../help/components/HelpTour';

const ENTRY: HelpEntry = {
  id: 'locatif.baux.liste',
  kind: 'page',
  title: 'Baux',
  summary: 'Les baux.',
  tour: {
    steps: [
      { target: 'baux-tableau', title: 'Le tableau', description: 'Tous vos baux.' },
      { target: 'cible-absente', title: 'Fantôme', description: 'Introuvable.' },
      { target: 'baux-filtres', title: 'Les filtres', description: 'Affinez la liste.' }
    ]
  }
};

const stopTour = vi.fn();

function renderTour(entry: HelpEntry = ENTRY) {
  entryState = { entry, status: 'ready', fallback: false };
  const value: HelpContextValue = { ...INERT_HELP, available: true, tourHelpId: entry.id, stopTour };
  return render(
    <HelpContext.Provider value={value}>
      <HelpTour />
    </HelpContext.Provider>
  );
}

function addAnchor(name: string) {
  const el = document.createElement('div');
  el.setAttribute('data-help-anchor', name);
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  document.querySelectorAll('[data-help-anchor]').forEach(el => el.remove());
});

describe('HelpTour', () => {
  it('ignore les étapes dont la cible est absente et marque la visite comme vue', async () => {
    addAnchor('baux-tableau');
    addAnchor('baux-filtres');
    renderTour();
    expect(await screen.findByText('Le tableau')).toBeInTheDocument();
    expect(markTourSeen).toHaveBeenCalledWith('locatif.baux.liste');
    // 2 étapes retenues sur 3 : l'indicateur de progression le confirme.
    expect(document.querySelectorAll('.ant-tour-indicators > *')).toHaveLength(2);
    expect(screen.queryByText('Fantôme')).not.toBeInTheDocument();
  });

  it('appelle stopTour à la fermeture', async () => {
    addAnchor('baux-tableau');
    renderTour();
    await screen.findByText('Le tableau');
    const close = document.querySelector<HTMLElement>('.ant-tour-close');
    expect(close).not.toBeNull();
    await act(async () => close!.click());
    expect(stopTour).toHaveBeenCalled();
  });

  it('appelle stopTour à la fin du parcours', async () => {
    addAnchor('baux-tableau');
    addAnchor('baux-filtres');
    renderTour();
    await screen.findByText('Le tableau');
    const primary = () =>
      document.querySelector<HTMLElement>('.ant-tour-footer .ant-btn-primary, .ant-tour-buttons .ant-btn-primary');
    await act(async () => primary()!.click());
    await screen.findByText('Les filtres');
    expect(stopTour).not.toHaveBeenCalled();
    await act(async () => primary()!.click());
    expect(stopTour).toHaveBeenCalled();
  });

  it('sans aucune cible, réessaie puis arrête la visite après le délai', () => {
    vi.useFakeTimers();
    renderTour();
    expect(stopTour).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(stopTour).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(750);
    });
    expect(stopTour).toHaveBeenCalledTimes(1);
    expect(markTourSeen).not.toHaveBeenCalled();
  });

  it('démarre si la cible apparaît pendant l’attente', async () => {
    vi.useFakeTimers();
    renderTour();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    addAnchor('baux-filtres');
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(markTourSeen).toHaveBeenCalledWith('locatif.baux.liste');
    expect(stopTour).not.toHaveBeenCalled();
  });

  it('arrête la visite quand la fiche est introuvable', () => {
    entryState = { entry: null, status: 'missing', fallback: false };
    render(
      <HelpContext.Provider value={{ ...INERT_HELP, available: true, tourHelpId: 'x.y', stopTour }}>
        <HelpTour />
      </HelpContext.Provider>
    );
    expect(stopTour).toHaveBeenCalledTimes(1);
  });

  it('ne plante pas quand localStorage est indisponible', async () => {
    vi.resetModules();
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('refusé');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('refusé');
    });
    const real = await vi.importActual<typeof import('../../help/tour-storage')>('../../help/tour-storage');
    expect(() => real.markTourSeen('a.b')).not.toThrow();
    expect(real.hasSeenTour('a.b')).toBe(true);
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
