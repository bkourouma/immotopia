import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { DeclarationDrawer } from '../../../components/syndics/declared-payment/DeclarationDrawer';
import type { DeclarationAlert, SyndicDeclarationRow } from '../../../services/syndic-declared-payment-service';

/**
 * Tiroir de détail d'une déclaration (spec 047, lot L7 ; règles R17 et R27).
 * Le service est mocké en entier : chaque export utilisé par le composant doit
 * figurer ci-dessous, Vitest refusant tout import non déclaré.
 */

const getSyndicDeclaration = vi.fn();
const getSyndicDeclarationProof = vi.fn();

vi.mock('../../../services/syndic-declared-payment-service', () => ({
  getSyndicDeclaration: (...a: unknown[]) => getSyndicDeclaration(...a),
  getSyndicDeclarationProof: (...a: unknown[]) => getSyndicDeclarationProof(...a)
}));

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

function row(overrides: Partial<SyndicDeclarationRow> = {}): SyndicDeclarationRow {
  return {
    id: 'd1',
    status: 'PENDING',
    receivingNumber: { id: 'n1', operator: 'WAVE', phoneNumber: '+2250707070707', holderName: 'Syndic Les Palmiers' },
    declaredBy: { type: 'COOWNER', contactId: 'c1', name: 'Awa Koné' },
    payerPhone: '+2250101010101',
    amount: 50000,
    acceptedAmount: null,
    paidAt: '2026-10-10T09:30:00.000Z',
    acceptedPaidAt: null,
    transactionReference: 'TX-REF-001',
    lines: [
      {
        id: 'l1',
        lot: { id: 'lot-1', lotNumber: 'A12' },
        amount: 50000,
        acceptedAmount: null,
        chargeCalls: [
          { id: 'cc1', period: 'T3 2026', remainingDue: 42000 },
          { id: 'cc2', period: 'T4 2026', remainingDue: 12345 }
        ],
        chargePaymentId: null,
        documents: []
      }
    ],
    hasProof: false,
    aiPrefilled: false,
    aiEditedFields: [],
    overdue: false,
    alerts: [],
    comment: 'Paiement du trimestre',
    rejectReason: null,
    reviewNote: null,
    reviewedAt: null,
    reviewedByName: null,
    createdAt: '2026-10-11T08:00:00.000Z',
    ...overrides
  };
}

function renderDrawer(props: Partial<React.ComponentProps<typeof DeclarationDrawer>> = {}) {
  const handlers = { onClose: vi.fn(), onApprove: vi.fn(), onReject: vi.fn(), onStale: vi.fn() };
  const utils = render(
    <AntApp>
      <DeclarationDrawer tenantId="t1" syndicId="s1" declarationId="d1" {...handlers} {...props} />
    </AntApp>
  );
  return { ...utils, ...handlers };
}

beforeEach(() => {
  vi.clearAllMocks();
  let counter = 0;
  createObjectURL.mockImplementation(() => `blob:proof-${++counter}`);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });
  getSyndicDeclaration.mockResolvedValue(row());
});

describe('DeclarationDrawer : contenu', () => {
  it('charge la déclaration demandée et affiche le bloc « Paiement déclaré »', async () => {
    renderDrawer();
    await screen.findByText('Awa Koné');
    expect(getSyndicDeclaration).toHaveBeenCalledWith('t1', 's1', 'd1');
    expect(screen.getByText('TX-REF-001')).toBeTruthy();
    expect(screen.getByText('+225 01 01 01 01 01')).toBeTruthy();
    expect(screen.getByText(/Wave · \+225 07 07 07 07 07 · Syndic Les Palmiers/)).toBeTruthy();
    expect(screen.getByText('Paiement du trimestre')).toBeTruthy();
  });

  it('ne charge rien tant que le tiroir est fermé (declarationId null)', async () => {
    renderDrawer({ declarationId: null });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(getSyndicDeclaration).not.toHaveBeenCalled();
  });

  it('recharge quand refreshToken change', async () => {
    const handlers = { onClose: vi.fn(), onApprove: vi.fn(), onReject: vi.fn() };
    const { rerender } = render(
      <AntApp>
        <DeclarationDrawer tenantId="t1" syndicId="s1" declarationId="d1" refreshToken={0} {...handlers} />
      </AntApp>
    );
    await screen.findByText('Awa Koné');
    rerender(
      <AntApp>
        <DeclarationDrawer tenantId="t1" syndicId="s1" declarationId="d1" refreshToken={1} {...handlers} />
      </AntApp>
    );
    await waitFor(() => expect(getSyndicDeclaration).toHaveBeenCalledTimes(2));
  });

  it('affiche le reste dû actuel de chaque appel visé', async () => {
    renderDrawer();
    await screen.findByText('T3 2026');
    expect(screen.getByText('T4 2026')).toBeTruthy();
    expect(screen.getAllByText('Reste dû actuel').length).toBeGreaterThan(0);
    expect(screen.getByText(/42\s000/)).toBeTruthy();
    expect(screen.getByText(/12\s345/)).toBeTruthy();
  });

  it('sans appel visé, annonce que les plus anciens appels ouverts passent d’abord', async () => {
    getSyndicDeclaration.mockResolvedValue(
      row({
        lines: [
          {
            id: 'l1',
            lot: { id: 'lot-1', lotNumber: 'A12' },
            amount: 50000,
            acceptedAmount: null,
            chargeCalls: [],
            chargePaymentId: null,
            documents: []
          }
        ]
      })
    );
    renderDrawer();
    expect(await screen.findByText('Plus anciens appels ouverts du lot d’abord')).toBeTruthy();
  });

  it('affiche « Déclaration introuvable » sur une 404', async () => {
    getSyndicDeclaration.mockRejectedValue({ response: { status: 404, data: { message: 'Introuvable' } } });
    renderDrawer();
    expect(await screen.findByText('Déclaration introuvable')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Valider/ })).toBeNull();
  });

  it('signale la déclaration périmée au parent sur un 409 DECLARATION_NOT_PENDING', async () => {
    getSyndicDeclaration.mockRejectedValue({
      response: { status: 409, data: { code: 'DECLARATION_NOT_PENDING', message: 'Déjà traitée' } }
    });
    const { onStale } = renderDrawer();
    await waitFor(() => expect(onStale).toHaveBeenCalled());
  });
});

describe('DeclarationDrawer : alertes de contrôle (R17)', () => {
  const ALERTS: DeclarationAlert[] = [
    { kind: 'REFERENCE_ON_EXISTING_PAYMENT', chargePaymentId: 'p1', paidAt: '2026-10-01T10:00:00.000Z', amount: 50000 },
    { kind: 'PROBABLE_DUPLICATE', declarationId: 'd0', createdAt: '2026-10-11T07:55:00.000Z' },
    { kind: 'EXCESS', lotId: 'lot-1', excess: 8000 },
    { kind: 'PARTIAL', lotId: 'lot-1', remaining: 4000 },
    { kind: 'DECLARANT_NOT_CURRENT_OWNER', lotId: 'lot-1' },
    { kind: 'AI_FIELDS_EDITED', fields: ['amount'] },
    { kind: 'RECIPIENT_MISMATCH', recipientPhone: '+2250505050505' },
    { kind: 'FISCAL_YEAR_CLOSED' },
    { kind: 'OVERDUE', businessDays: 3 }
  ];

  it('affiche une alerte par élément, avec la gravité renvoyée par alertView', async () => {
    getSyndicDeclaration.mockResolvedValue(row({ alerts: ALERTS, overdue: true }));
    renderDrawer();
    await screen.findByText(/Cette référence figure déjà sur un paiement enregistré le 01\/10\/2026/);
    expect(screen.getByText(/Doublon probable/)).toBeTruthy();
    expect(screen.getByText(/deviendra une avance du lot A12/)).toBeTruthy();
    expect(screen.getByText(/Paiement partiel : il restera .* dû sur le lot A12/)).toBeTruthy();
    expect(screen.getByText(/n’est plus le copropriétaire actuel du lot A12/)).toBeTruthy();
    expect(screen.getByText(/Champs proposés par l’IA puis modifiés par le déclarant : Montant/)).toBeTruthy();
    expect(screen.getByText(/La capture montre un autre numéro de réception : \+225 05 05 05 05 05/)).toBeTruthy();
    expect(screen.getByText(/exercice clos/)).toBeTruthy();
    expect(screen.getByText('En attente depuis 3 jours ouvrés.')).toBeTruthy();
    expect(document.querySelectorAll('.ant-alert').length).toBe(ALERTS.length);
    expect(document.querySelectorAll('.ant-alert-error').length).toBe(1);
    expect(document.querySelectorAll('.ant-alert-info').length).toBe(3);
    expect(document.querySelectorAll('.ant-alert-warning').length).toBe(5);
  });

  it('place les alertes avant les boutons de décision', async () => {
    getSyndicDeclaration.mockResolvedValue(row({ alerts: [{ kind: 'FISCAL_YEAR_CLOSED' }] }));
    renderDrawer();
    const alert = await screen.findByText(/exercice clos/);
    const validate = screen.getByRole('button', { name: /Valider/ });
    // eslint-disable-next-line no-bitwise
    expect(alert.compareDocumentPosition(validate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('masque les alertes de contrôle pour une déclaration déjà traitée', async () => {
    getSyndicDeclaration.mockResolvedValue(row({ status: 'APPROVED', alerts: [{ kind: 'FISCAL_YEAR_CLOSED' }] }));
    renderDrawer();
    await screen.findByText('Awa Koné');
    expect(screen.queryByText(/exercice clos/)).toBeNull();
  });

  it('affiche les pastilles retard et doublon suspecté dans l’en-tête', async () => {
    getSyndicDeclaration.mockResolvedValue(
      row({
        overdue: true,
        alerts: [{ kind: 'PROBABLE_DUPLICATE', declarationId: 'd0', createdAt: '2026-10-11T07:55:00.000Z' }]
      })
    );
    renderDrawer();
    await screen.findByText('Awa Koné');
    const header = document.querySelector('.ant-drawer-title') as HTMLElement;
    expect(within(header).getByText('En retard')).toBeTruthy();
    expect(within(header).getByText('Doublon suspecté')).toBeTruthy();
    expect(within(header).getByText('En attente')).toBeTruthy();
  });
});

describe('DeclarationDrawer : témoins IA (R27)', () => {
  it('sans pré-remplissage IA, aucun encadré ni témoin', async () => {
    renderDrawer();
    await screen.findByText('Awa Koné');
    expect(screen.queryByText('Pré-rempli par IA')).toBeNull();
    expect(screen.queryByText('Lu par l’IA')).toBeNull();
  });

  it('distingue « Lu par l’IA » et « Lu par l’IA, retouché par le déclarant »', async () => {
    getSyndicDeclaration.mockResolvedValue(row({ aiPrefilled: true, aiEditedFields: ['amount', 'paidAt'] }));
    renderDrawer();
    await screen.findByText('Pré-rempli par IA');
    // Encadré : cinq champs, trois lus tels quels, deux retouchés.
    expect(screen.getAllByText('Lu par l’IA')).toHaveLength(3);
    expect(screen.getAllByText('Lu par l’IA, retouché par le déclarant')).toHaveLength(2);
    expect(screen.getByText('Opérateur')).toBeTruthy();
    expect(screen.getByText('Référence de transaction')).toBeTruthy();
    expect(screen.getByText('Numéro payeur', { selector: '.ant-alert span' })).toBeTruthy();
  });

  it('marque dans le bloc « Paiement déclaré » les champs lus et retouchés', async () => {
    getSyndicDeclaration.mockResolvedValue(row({ aiPrefilled: true, aiEditedFields: ['amount'] }));
    renderDrawer();
    await screen.findByText('Pré-rempli par IA');
    const details = document.querySelector('.ant-descriptions') as HTMLElement;
    expect(within(details).getAllByText('IA')).toHaveLength(4);
    expect(within(details).getAllByText('IA, retouché')).toHaveLength(1);
    const amountRow = within(details).getByText('Montant déclaré').closest('tr') as HTMLElement;
    expect(within(amountRow).getByText('IA, retouché')).toBeTruthy();
    const referenceRow = within(details).getByText('Référence').closest('tr') as HTMLElement;
    expect(within(referenceRow).getByText('IA')).toBeTruthy();
  });
});

describe('DeclarationDrawer : capture', () => {
  it("affiche « Aucune capture jointe » sans preuve et n'appelle pas le service", async () => {
    renderDrawer();
    expect(await screen.findByText('Aucune capture jointe')).toBeTruthy();
    expect(getSyndicDeclarationProof).not.toHaveBeenCalled();
  });

  it('charge une image en blob authentifié, l’agrandit au clic, puis révoque l’URL au démontage', async () => {
    getSyndicDeclaration.mockResolvedValue(row({ hasProof: true }));
    getSyndicDeclarationProof.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    const { unmount } = renderDrawer();

    const image = (await screen.findByAltText('Capture du paiement déclaré')) as HTMLImageElement;
    expect(getSyndicDeclarationProof).toHaveBeenCalledWith('t1', 's1', 'd1');
    expect(image.getAttribute('src')).toBe('blob:proof-1');
    expect(image.style.maxWidth).toBe('100%');
    expect(revokeObjectURL).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Agrandir la capture' }));
    expect(await screen.findByAltText('Capture agrandie')).toBeTruthy();

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:proof-1');
  });

  it('révoque l’URL quand on passe à une autre déclaration', async () => {
    getSyndicDeclaration.mockImplementation(async (_t: string, _s: string, id: string) =>
      row({ id, hasProof: true, transactionReference: `REF-${id}` })
    );
    getSyndicDeclarationProof.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
    const handlers = { onClose: vi.fn(), onApprove: vi.fn(), onReject: vi.fn() };
    const { rerender } = render(
      <AntApp>
        <DeclarationDrawer tenantId="t1" syndicId="s1" declarationId="d1" {...handlers} />
      </AntApp>
    );
    await screen.findByAltText('Capture du paiement déclaré');
    rerender(
      <AntApp>
        <DeclarationDrawer tenantId="t1" syndicId="s1" declarationId="d2" {...handlers} />
      </AntApp>
    );
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:proof-1'));
    await waitFor(() => expect(getSyndicDeclarationProof).toHaveBeenCalledWith('t1', 's1', 'd2'));
  });

  it('un PDF donne un lien vers un nouvel onglet, sans iframe', async () => {
    getSyndicDeclaration.mockResolvedValue(row({ hasProof: true }));
    getSyndicDeclarationProof.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    renderDrawer();
    const link = (await screen.findByRole('link', { name: /Ouvrir la capture \(PDF\)/ })) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('blob:proof-1');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('embed, object')).toBeNull();
  });

  it('une capture indisponible n’empêche pas le reste, et « Réessayer » la recharge', async () => {
    getSyndicDeclaration.mockResolvedValue(row({ hasProof: true }));
    getSyndicDeclarationProof
      .mockRejectedValueOnce(new Error('réseau'))
      .mockResolvedValueOnce(new Blob(['x'], { type: 'image/png' }));
    renderDrawer();
    expect(await screen.findByText('Capture indisponible')).toBeTruthy();
    expect(screen.getByText('TX-REF-001')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Valider/ })).toBeTruthy();

    const retry = screen.getAllByRole('button', { name: 'Réessayer' })[0];
    fireEvent.click(retry);
    expect(await screen.findByAltText('Capture du paiement déclaré')).toBeTruthy();
    expect(getSyndicDeclarationProof).toHaveBeenCalledTimes(2);
  });
});

describe('DeclarationDrawer : décision', () => {
  it('« Valider » et « Rejeter » appellent les callbacks avec la déclaration', async () => {
    const { onApprove, onReject } = renderDrawer();
    await screen.findByText('Awa Koné');
    fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove.mock.calls[0][0].id).toBe('d1');
    fireEvent.click(screen.getByRole('button', { name: /Rejeter/ }));
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject.mock.calls[0][0].id).toBe('d1');
  });

  it('sans canEdit, aucun bouton de décision', async () => {
    renderDrawer({ canEdit: false });
    await screen.findByText('Awa Koné');
    expect(screen.queryByRole('button', { name: /Valider/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Rejeter/ })).toBeNull();
  });

  it.each(['APPROVED', 'REJECTED', 'CANCELED'] as const)(
    'une déclaration %s n’offre aucun bouton et indique qu’elle est traitée',
    async status => {
      getSyndicDeclaration.mockResolvedValue(row({ status }));
      renderDrawer();
      expect(await screen.findByText('Cette déclaration a déjà été traitée.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Valider/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Rejeter/ })).toBeNull();
    }
  );

  it('signale la péremption quand le rechargement montre un statut traité', async () => {
    const handlers = { onClose: vi.fn(), onApprove: vi.fn(), onReject: vi.fn(), onStale: vi.fn() };
    const { rerender } = render(
      <AntApp>
        <DeclarationDrawer tenantId="t1" syndicId="s1" declarationId="d1" refreshToken={0} {...handlers} />
      </AntApp>
    );
    await screen.findByRole('button', { name: /Valider/ });
    getSyndicDeclaration.mockResolvedValue(row({ status: 'APPROVED' }));
    rerender(
      <AntApp>
        <DeclarationDrawer tenantId="t1" syndicId="s1" declarationId="d1" refreshToken={1} {...handlers} />
      </AntApp>
    );
    await screen.findByText('Cette déclaration a déjà été traitée.');
    expect(handlers.onStale).toHaveBeenCalled();
  });

  it('affiche le résultat d’une déclaration validée : retenu, relecteur, documents, note', async () => {
    getSyndicDeclaration.mockResolvedValue(
      row({
        status: 'APPROVED',
        acceptedAmount: 45000,
        acceptedPaidAt: '2026-10-09T12:00:00.000Z',
        reviewedByName: 'Marc Gestionnaire',
        reviewedAt: '2026-10-12T10:00:00.000Z',
        reviewNote: 'Vérifié sur le relevé Wave',
        lines: [
          {
            id: 'l1',
            lot: { id: 'lot-1', lotNumber: 'A12' },
            amount: 50000,
            acceptedAmount: 45000,
            chargeCalls: [{ id: 'cc1', period: 'T3 2026', remainingDue: 0 }],
            chargePaymentId: 'pay-1',
            documents: [
              { id: 'doc1', kind: 'RECEIPT', number: 'REC-2026-0012' },
              { id: 'doc2', kind: 'QUITTANCE', number: 'QUI-2026-0007' }
            ]
          }
        ]
      })
    );
    renderDrawer();
    await screen.findByText('Marc Gestionnaire');
    expect(screen.getByText('Montant retenu')).toBeTruthy();
    expect(screen.getByText('Vérifié sur le relevé Wave')).toBeTruthy();
    expect(screen.getByText('Reçu REC-2026-0012')).toBeTruthy();
    expect(screen.getByText('Quittance QUI-2026-0007')).toBeTruthy();
    expect(screen.getByText(/retenu : /)).toBeTruthy();
  });

  it('affiche le motif de rejet et la note d’une déclaration rejetée', async () => {
    getSyndicDeclaration.mockResolvedValue(
      row({
        status: 'REJECTED',
        rejectReason: 'NOT_FOUND',
        reviewNote: 'Aucune trace sur le relevé',
        reviewedByName: 'Marc Gestionnaire',
        reviewedAt: '2026-10-12T10:00:00.000Z'
      })
    );
    renderDrawer();
    await screen.findByText('Marc Gestionnaire');
    expect(screen.getByText('Paiement introuvable')).toBeTruthy();
    expect(screen.getByText('Aucune trace sur le relevé')).toBeTruthy();
  });
});
