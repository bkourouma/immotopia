import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { HelpContext, INERT_HELP } from '../../help/help-context';
import { SignaturesPanel } from '../../components/signature/SignaturesPanel';
import { SendForSignatureModal } from '../../components/signature/SendForSignatureModal';

/**
 * Aide interne : la modale d'envoi et le panneau « Signatures » servent aussi aux ventes,
 * aux mandats et aux états des lieux. Le « ? » du locatif ne doit apparaître que pour un bail.
 */

const listSignatureRequests = vi.fn();
const fetchSignatureContext = vi.fn();

vi.mock('../../services/signature-service', () => ({
  createSignatureRequest: vi.fn(),
  listSignatureRequests: (...a: unknown[]) => listSignatureRequests(...a),
  fetchSignatureContext: (...a: unknown[]) => fetchSignatureContext(...a),
  cancelSignatureRequest: vi.fn(),
  remindSignatureRequest: vi.fn(),
  fetchSignatureFile: vi.fn(),
  reissueInPersonToken: vi.fn()
}));

vi.mock('../../help/registry', () => ({
  useHelpEntry: (id: string | null | undefined) => ({
    entry: id ? { id, kind: 'section', title: 'Fiche test', summary: 'x' } : null,
    status: id ? 'ready' : 'missing',
    fallback: false
  }),
  resolvePageHelpId: () => null,
  getHelpEntry: async () => null
}));

function renderWithHelp(ui: React.ReactElement) {
  return render(
    <HelpContext.Provider value={{ ...INERT_HELP, available: true }}>
      <AntApp>{ui}</AntApp>
    </HelpContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listSignatureRequests.mockResolvedValue([]);
  fetchSignatureContext.mockRejectedValue(new Error('indisponible'));
});

describe('SignaturesPanel : « ? » réservé au bail', () => {
  const panel = (kind: React.ComponentProps<typeof SignaturesPanel>['kind']) => (
    <SignaturesPanel kind={kind} targetType="Cible" targetId="c-1" defaultSigners={[]} fileLabel="doc" />
  );

  it('affiche le « ? » du bail pour LEASE_CONTRACT', async () => {
    const { container } = renderWithHelp(panel('LEASE_CONTRACT'));
    await waitFor(() => expect(listSignatureRequests).toHaveBeenCalled());
    expect(container.querySelector('[data-help-id="locatif.signatures.bail"]')).not.toBeNull();
  });

  it('n’affiche aucun « ? » du locatif pour un compromis de vente', async () => {
    const { container } = renderWithHelp(panel('SALE_AGREEMENT'));
    await waitFor(() => expect(listSignatureRequests).toHaveBeenCalled());
    expect(container.querySelector('[data-help-id^="locatif."]')).toBeNull();
  });
});

describe('SendForSignatureModal : titre et fiche d’aide', () => {
  const signer = { role: 'LOCATAIRE', fullName: 'Awa', channel: 'EMAIL' as const, contact: 'awa@mail.test' };
  const modal = (helpId?: string) => (
    <SendForSignatureModal
      open
      kind="SALE_AGREEMENT"
      targetId="c-1"
      defaultSigners={[signer]}
      helpId={helpId}
      onClose={vi.fn()}
      onCreated={vi.fn()}
    />
  );

  it('sans helpId, rend le titre d’origine sans bouton d’aide', async () => {
    renderWithHelp(modal());
    expect(await screen.findByText('Envoyer pour signature', { selector: '.ant-modal-title' })).toBeInTheDocument();
    expect(document.querySelector('.ant-modal-title [data-help-id]')).toBeNull();
  });

  it('avec helpId, ajoute le « ? » à côté du titre', async () => {
    renderWithHelp(modal('locatif.signatures.envoi'));
    await screen.findByText('Envoyer pour signature');
    expect(document.querySelector('.ant-modal-title [data-help-id="locatif.signatures.envoi"]')).not.toBeNull();
  });
});
