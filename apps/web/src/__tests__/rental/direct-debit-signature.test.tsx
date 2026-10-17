import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MandateSignatureSection } from '../../components/direct-debit/MandateSignatureSection';
import { MandateActions } from '../../components/rental/direct-debit/MandateActions';

/**
 * Spec 042 §10.6 : section « Signature électronique (facultatif) » d'un mandat de
 * prélèvement (brouillon sans scan), activation avec la date reprise, message au
 * téléchargement du PDF d'autorisation. Le mock couvre chaque export utilisé.
 */

const fetchSignatureContext = vi.fn();
const listSignatureRequests = vi.fn();

vi.mock('../../services/signature-service', () => ({
  fetchSignatureContext: (...a: unknown[]) => fetchSignatureContext(...a),
  listSignatureRequests: (...a: unknown[]) => listSignatureRequests(...a),
  createSignatureRequest: vi.fn(),
  cancelSignatureRequest: vi.fn(),
  remindSignatureRequest: vi.fn(),
  fetchSignatureFile: vi.fn(),
  reissueInPersonToken: vi.fn()
}));

const downloadAuthorizationPdf = vi.fn();
const activateMandate = vi.fn();
const saveBlob = vi.fn();

vi.mock('../../services/direct-debit-service', () => ({
  activateMandate: (...a: unknown[]) => activateMandate(...a),
  downloadAuthorizationPdf: (...a: unknown[]) => downloadAuthorizationPdf(...a),
  downloadSignedScan: vi.fn(),
  reactivateMandate: vi.fn(),
  revokeMandate: vi.fn(),
  suspendMandate: vi.fn(),
  updateMandate: vi.fn(),
  uploadSignedScan: vi.fn(),
  SIGNED_SCAN_MAX_BYTES: 10 * 1024 * 1024,
  SIGNED_SCAN_MIME_TYPES: ['application/pdf', 'image/jpeg', 'image/png']
}));
vi.mock('../../utils/save-blob', () => ({ saveBlob: (...a: unknown[]) => saveBlob(...a) }));

const CONTEXT = {
  kind: 'DIRECT_DEBIT_MANDATE',
  targetType: 'DIRECT_DEBIT_MANDATE',
  providerRequired: false,
  smsAvailable: true,
  signers: [
    { role: 'LOCATAIRE', fullName: 'Awa Traoré', email: 'awa@example.test', phone: '+2250700000000', contactId: 'c-1' }
  ]
};

function renderInApp(node: React.ReactElement) {
  return render(<AntApp>{node}</AntApp>);
}

function section(props: Partial<React.ComponentProps<typeof MandateSignatureSection>> = {}) {
  return renderInApp(
    <MandateSignatureSection
      kind="DIRECT_DEBIT_MANDATE"
      mandateId="m-1"
      status="DRAFT"
      hasSignedScan={false}
      reference="MDT-2026-0001"
      {...props}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSignatureContext.mockResolvedValue(CONTEXT);
  listSignatureRequests.mockResolvedValue([]);
});

describe('MandateSignatureSection', () => {
  it('est visible sur un brouillon sans scan et envoie sur la cible du mandat', async () => {
    section();

    expect(await screen.findByText('Signature électronique (facultatif)')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Envoyer pour signature électronique' })).toBeInTheDocument();
    expect(fetchSignatureContext).toHaveBeenCalledWith('DIRECT_DEBIT_MANDATE', 'm-1');
    expect(listSignatureRequests).toHaveBeenCalledWith({ targetType: 'DIRECT_DEBIT_MANDATE', targetId: 'm-1' });
  });

  it('sert tel quel à la copropriété (SYNDIC_DIRECT_DEBIT_MANDATE)', async () => {
    section({ kind: 'SYNDIC_DIRECT_DEBIT_MANDATE' });

    await screen.findByRole('button', { name: 'Envoyer pour signature électronique' });
    expect(fetchSignatureContext).toHaveBeenCalledWith('SYNDIC_DIRECT_DEBIT_MANDATE', 'm-1');
  });

  it("n'offre jamais le canal « sur place » et préremplit le débiteur", async () => {
    const user = userEvent.setup();
    section();

    await user.click(await screen.findByRole('button', { name: 'Envoyer pour signature électronique' }));
    const names = (await screen.findAllByLabelText('Nom complet')) as HTMLInputElement[];
    expect(names.map(input => input.value)).toEqual(['Awa Traoré']);

    await user.click(screen.getByLabelText('Canal'));
    await screen.findAllByText('WhatsApp');
    const labels = Array.from(document.querySelectorAll('.ant-select-item-option-content')).map(
      option => option.textContent ?? ''
    );
    expect(labels).toHaveLength(3);
    expect(labels.some(label => label.startsWith('E-mail'))).toBe(true);
    expect(labels.some(label => label.startsWith('SMS'))).toBe(true);
    expect(labels.some(label => label.startsWith('WhatsApp'))).toBe(true);
    expect(labels.some(label => label.includes('Sur place'))).toBe(false);
  });

  it('est absente quand un scan est déjà déposé sans signature électronique', async () => {
    const { container } = section({ hasSignedScan: true });
    await waitFor(() => expect(listSignatureRequests).toHaveBeenCalled());

    expect(container.querySelector('[data-testid="mandate-signature-section"]')).toBeNull();
    expect(screen.queryByText('Signature électronique (facultatif)')).not.toBeInTheDocument();
    expect(screen.queryByText('Scan signé (signature électronique)')).not.toBeInTheDocument();
  });

  it("est absente hors brouillon et n'appelle pas l'API", async () => {
    section({ status: 'ACTIVE', hasSignedScan: true });

    expect(screen.queryByText('Signature électronique (facultatif)')).not.toBeInTheDocument();
    expect(fetchSignatureContext).not.toHaveBeenCalled();
    expect(listSignatureRequests).not.toHaveBeenCalled();
  });

  it('une fois signé : mention « Scan signé (signature électronique) » avec la date de signature', async () => {
    listSignatureRequests.mockResolvedValue([{ id: 'r-1', status: 'COMPLETED', signers: [] }]);
    section({ hasSignedScan: true, signedAt: '2026-10-16T00:00:00.000Z' });

    const notice = await screen.findByTestId('mandate-signed-electronically');
    expect(within(notice).getByText('Scan signé (signature électronique)')).toBeInTheDocument();
    expect(within(notice).getByText(/Signé le/)).toBeInTheDocument();
    expect(fetchSignatureContext).not.toHaveBeenCalled();
  });
});

const baseMandate = {
  id: 'm-1',
  reference: 'MDT-2026-0001',
  status: 'DRAFT',
  hasSignedScan: false,
  signedAt: null,
  maxAmount: null,
  collectionDay: null,
  notes: null
};

function actions(mandate: Record<string, unknown>) {
  return renderInApp(<MandateActions tenantId="agence-1" mandate={mandate as never} onChanged={vi.fn()} />);
}

describe('MandateActions, signature électronique et autorisation', () => {
  it('affiche un message de succès qui nomme le fichier téléchargé', async () => {
    downloadAuthorizationPdf.mockResolvedValue({
      blob: new Blob(['%PDF']),
      filename: 'MDT-2026-0001-autorisation.pdf'
    });
    const user = userEvent.setup();
    actions(baseMandate);

    await user.click(screen.getByRole('button', { name: "Télécharger l'autorisation (PDF)" }));

    expect(await screen.findByText('Autorisation téléchargée : MDT-2026-0001-autorisation.pdf')).toBeInTheDocument();
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'MDT-2026-0001-autorisation.pdf');
  });

  it("affiche une erreur quand le téléchargement de l'autorisation échoue", async () => {
    downloadAuthorizationPdf.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    actions(baseMandate);

    await user.click(screen.getByRole('button', { name: "Télécharger l'autorisation (PDF)" }));

    expect(await screen.findByText(/Erreur lors du téléchargement de l'autorisation|boom/)).toBeInTheDocument();
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it('« Activer » reprend la date de signature de la signature électronique', async () => {
    const user = userEvent.setup();
    actions({ ...baseMandate, hasSignedScan: true, signedAt: '2026-10-16T00:00:00.000Z' });

    await user.click(screen.getByRole('button', { name: 'Activer' }));

    const dialog = await screen.findByRole('dialog');
    const input = dialog.querySelector('input.ant-picker-input input, .ant-picker input') as HTMLInputElement;
    expect(input.value).toBe('16/10/2026');
    expect(within(dialog).getAllByRole('button', { name: 'Activer' }).pop()).toBeEnabled();
  });

  it("« Activer » demande la date quand le scan papier n'en porte pas", async () => {
    const user = userEvent.setup();
    actions({ ...baseMandate, hasSignedScan: true, signedAt: null });

    await user.click(screen.getByRole('button', { name: 'Activer' }));

    const dialog = await screen.findByRole('dialog');
    expect((dialog.querySelector('input.ant-picker-input input, .ant-picker input') as HTMLInputElement).value).toBe(
      ''
    );
  });
});
