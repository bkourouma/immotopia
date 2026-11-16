import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpContext, INERT_HELP, type HelpContextValue } from '../../help/help-context';
import { HelpButton } from '../../help/components/HelpButton';
import { HelpSectionTitle } from '../../help/components/HelpSectionTitle';

const useHelpEntry = vi.fn();

vi.mock('../../help/registry', () => ({
  useHelpEntry: (id: string | null | undefined) => useHelpEntry(id),
  resolvePageHelpId: () => null,
  getHelpEntry: async () => null
}));

function renderWithHelp(ui: React.ReactElement, overrides: Partial<HelpContextValue> = {}) {
  const value: HelpContextValue = { ...INERT_HELP, available: true, ...overrides };
  return render(<HelpContext.Provider value={value}>{ui}</HelpContext.Provider>);
}

const READY = {
  entry: { id: 'locatif.baux.liste', kind: 'page', title: 'Les baux', summary: 'x' },
  status: 'ready',
  fallback: false
};

describe('HelpButton', () => {
  beforeEach(() => {
    useHelpEntry.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('est absent hors provider', () => {
    useHelpEntry.mockReturnValue(READY);
    const { container } = render(<HelpButton helpId="locatif.baux.liste" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('est absent quand la fiche manque (production)', () => {
    vi.stubEnv('DEV', false);
    useHelpEntry.mockReturnValue({ entry: null, status: 'missing', fallback: false });
    const { container } = renderWithHelp(<HelpButton helpId="locatif.inconnu.x" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('affiche un indicateur « aide manquante » en développement', () => {
    vi.stubEnv('DEV', true);
    useHelpEntry.mockReturnValue({ entry: null, status: 'missing', fallback: false });
    renderWithHelp(<HelpButton helpId="locatif.inconnu.x" />);
    expect(screen.getByTestId('help-missing')).toHaveTextContent('aide manquante');
  });

  it('est absent pendant le chargement', () => {
    useHelpEntry.mockReturnValue({ entry: null, status: 'loading', fallback: false });
    const { container } = renderWithHelp(<HelpButton helpId="locatif.baux.liste" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('affiche un bouton nommé avec le titre et ouvre la fiche au clic', () => {
    useHelpEntry.mockReturnValue(READY);
    const openHelp = vi.fn();
    const parentClick = vi.fn();
    renderWithHelp(
      <div onClick={parentClick}>
        <HelpButton helpId="locatif.baux.liste" />
      </div>,
      { openHelp }
    );
    const button = screen.getByRole('button', { name: /Aide.*Les baux/ });
    expect(button).toHaveAttribute('data-help-id', 'locatif.baux.liste');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(button);
    expect(openHelp).toHaveBeenCalledWith('locatif.baux.liste');
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('affiche le libellé visible quand il est fourni', () => {
    useHelpEntry.mockReturnValue(READY);
    renderWithHelp(<HelpButton helpId="locatif.baux.liste" label="Besoin d'aide" />);
    expect(screen.getByText("Besoin d'aide")).toBeInTheDocument();
  });

  it('HelpSectionTitle rend le titre suivi du bouton', () => {
    useHelpEntry.mockReturnValue(READY);
    renderWithHelp(<HelpSectionTitle title="Échéancier" helpId="locatif.baux.liste" />);
    expect(screen.getByText('Échéancier')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aide/ })).toBeInTheDocument();
  });
});
