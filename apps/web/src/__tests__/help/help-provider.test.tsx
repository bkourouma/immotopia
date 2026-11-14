import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { HelpProvider } from '../../help/components/HelpProvider';
import { useHelp, type HelpContextValue } from '../../help/help-context';

const resolvePageHelpId = vi.fn();
const getHelpEntry = vi.fn();
const canAutoStartTour = vi.fn();

vi.mock('../../help/registry', () => ({
  resolvePageHelpId: (p: string) => resolvePageHelpId(p),
  getHelpEntry: (...a: unknown[]) => getHelpEntry(...a),
  useHelpEntry: () => ({ entry: null, status: 'idle', fallback: false })
}));

vi.mock('../../help/tour-storage', () => ({
  canAutoStartTour: (e: unknown) => canAutoStartTour(e),
  hasSeenTour: () => false,
  markTourSeen: () => undefined,
  TOUR_STORAGE_PREFIX: 'x.',
  TOUR_AUTOSTART_MIN_WIDTH: 768
}));

let ctx: HelpContextValue;
let nav: (to: string) => void;

function Probe() {
  ctx = useHelp();
  nav = useNavigate();
  return null;
}

function setup(path = '/baux') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HelpProvider tenantId="t1">
        <Probe />
      </HelpProvider>
    </MemoryRouter>
  );
}

function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...init });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe('HelpProvider', () => {
  beforeEach(() => {
    resolvePageHelpId.mockImplementation((p: string) => (p.startsWith('/baux') ? 'locatif.baux.liste' : null));
    getHelpEntry.mockReset();
    canAutoStartTour.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('expose le contexte disponible avec la fiche de page', () => {
    setup();
    expect(ctx.available).toBe(true);
    expect(ctx.pageHelpId).toBe('locatif.baux.liste');
    expect(ctx.tenantId).toBe('t1');
    expect(ctx.copilotAvailable).toBe(false);
    expect(ctx.featureAccess).toBeNull();
  });

  it('F1 ouvre l’aide de la page, empêche l’aide du navigateur, puis la referme', () => {
    setup();
    const first = press('F1');
    expect(first.defaultPrevented).toBe(true);
    expect(ctx.open).toBe(true);
    expect(ctx.blockHelpId).toBeNull();
    press('F1');
    expect(ctx.open).toBe(false);
  });

  it('F1 empêche l’aide du navigateur même sans fiche de page, sans ouvrir', () => {
    setup('/ailleurs');
    const event = press('F1');
    expect(event.defaultPrevented).toBe(true);
    expect(ctx.open).toBe(false);
  });

  it('ignore F1 avec modificateur et ne touche pas Ctrl+J', () => {
    setup();
    expect(press('F1', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press('j', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(ctx.open).toBe(false);
  });

  it('Échap ferme le panneau', () => {
    setup();
    act(() => ctx.openHelp());
    expect(ctx.open).toBe(true);
    press('Escape');
    expect(ctx.open).toBe(false);
  });

  it('openHelp avec la fiche de page équivaut à la page ; sinon fiche de bloc', () => {
    setup();
    act(() => ctx.openHelp('locatif.baux.liste.tableau'));
    expect(ctx.blockHelpId).toBe('locatif.baux.liste.tableau');
    act(() => ctx.openHelp('locatif.baux.liste'));
    expect(ctx.blockHelpId).toBeNull();
  });

  it('remet blockHelpId à null à la navigation sans fermer le panneau', () => {
    setup();
    act(() => ctx.openHelp('locatif.baux.liste.tableau'));
    expect(ctx.blockHelpId).not.toBeNull();
    act(() => nav('/baux/2'));
    expect(ctx.blockHelpId).toBeNull();
    expect(ctx.open).toBe(true);
  });

  it('claimPageHelp compte les revendications et se libère une seule fois', () => {
    setup();
    expect(ctx.pageHelpClaimed).toBe(false);
    let release1!: () => void;
    let release2!: () => void;
    act(() => {
      release1 = ctx.claimPageHelp();
    });
    act(() => {
      release2 = ctx.claimPageHelp();
    });
    expect(ctx.pageHelpClaimed).toBe(true);
    act(() => release1());
    act(() => release1());
    expect(ctx.pageHelpClaimed).toBe(true);
    act(() => release2());
    expect(ctx.pageHelpClaimed).toBe(false);
  });

  it('propose la visite automatique après 800 ms quand la fiche s’y prête', async () => {
    vi.useFakeTimers();
    const entry = { id: 'locatif.baux.liste', tour: { autoStart: true, steps: [{ target: 'a' }] } };
    getHelpEntry.mockResolvedValue({ entry, language: 'fr', fallback: false });
    canAutoStartTour.mockReturnValue(true);
    setup();
    expect(ctx.tourHelpId).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(getHelpEntry).toHaveBeenCalledWith('locatif.baux.liste');
    expect(ctx.tourHelpId).toBe('locatif.baux.liste');
  });

  it('ne lance pas la visite si canAutoStartTour refuse', async () => {
    vi.useFakeTimers();
    getHelpEntry.mockResolvedValue({ entry: { id: 'locatif.baux.liste' }, language: 'fr', fallback: false });
    canAutoStartTour.mockReturnValue(false);
    setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(ctx.tourHelpId).toBeNull();
  });

  it('annule la proposition si la page change avant le délai', async () => {
    vi.useFakeTimers();
    getHelpEntry.mockResolvedValue({ entry: { id: 'x' }, language: 'fr', fallback: false });
    canAutoStartTour.mockReturnValue(true);
    setup();
    act(() => nav('/ailleurs'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(getHelpEntry).not.toHaveBeenCalled();
  });
});
