import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import dayjs from 'dayjs';
import { ApproveModal } from '../../../components/syndics/declared-payment/ApproveModal';
import { RejectModal } from '../../../components/syndics/declared-payment/RejectModal';
import type { DeclarationAlert, SyndicDeclarationRow } from '../../../services/syndic-declared-payment-service';

/**
 * Modales de validation et de rejet d'une déclaration (spec 047, T054).
 * Le service est mocké en entier : chaque export utilisé par les composants
 * figure ci-dessous (Vitest refuse tout import non déclaré). helpers.ts reste réel.
 */

const approveSyndicDeclaration = vi.fn();
const rejectSyndicDeclaration = vi.fn();

vi.mock('../../../services/syndic-declared-payment-service', () => ({
  approveSyndicDeclaration: (...a: unknown[]) => approveSyndicDeclaration(...a),
  rejectSyndicDeclaration: (...a: unknown[]) => rejectSyndicDeclaration(...a)
}));

const PAID_AT = '2026-10-10T09:30:00.000Z';

function row(alerts: DeclarationAlert[] = []): SyndicDeclarationRow {
  return {
    id: 'd1',
    status: 'PENDING',
    receivingNumber: { id: 'n1', operator: 'WAVE', phoneNumber: '+2250707070707', holderName: 'Syndic Les Palmiers' },
    declaredBy: { type: 'COOWNER', contactId: 'c1', name: 'Awa Koné' },
    payerPhone: '+2250505050505',
    amount: 100000,
    acceptedAmount: null,
    paidAt: PAID_AT,
    acceptedPaidAt: null,
    transactionReference: 'TX-98765',
    lines: [
      {
        id: 'l1',
        lot: { id: 'lot-1', lotNumber: 'A12' },
        amount: 60000,
        acceptedAmount: null,
        chargeCalls: [
          { id: 'cc-1', period: 'T1 2026', remainingDue: 30000 },
          { id: 'cc-2', period: 'T2 2026', remainingDue: 30000 }
        ],
        chargePaymentId: null,
        documents: []
      },
      {
        id: 'l2',
        lot: { id: 'lot-2', lotNumber: 'B07' },
        amount: 40000,
        acceptedAmount: null,
        chargeCalls: [{ id: 'cc-3', period: 'T1 2026', remainingDue: 40000 }],
        chargePaymentId: null,
        documents: []
      }
    ],
    hasProof: false,
    aiPrefilled: false,
    aiEditedFields: [],
    overdue: false,
    alerts,
    comment: null,
    rejectReason: null,
    reviewNote: null,
    reviewedAt: null,
    reviewedByName: null,
    createdAt: '2026-10-10T10:00:00.000Z'
  };
}

const apiError = (status: number, code: string | undefined, message: string) => ({
  response: { status, data: { code, message } }
});

function renderApprove(declaration: SyndicDeclarationRow = row(), extra: Record<string, unknown> = {}) {
  const props = { onClose: vi.fn(), onApproved: vi.fn(), onStale: vi.fn(), ...extra };
  render(
    <AntApp>
      <ApproveModal tenantId="t1" syndicId="s1" declaration={declaration} {...props} />
    </AntApp>
  );
  return props as {
    onClose: ReturnType<typeof vi.fn>;
    onApproved: ReturnType<typeof vi.fn>;
    onStale: ReturnType<typeof vi.fn>;
  };
}

function renderReject(declaration: SyndicDeclarationRow = row()) {
  const props = { onClose: vi.fn(), onRejected: vi.fn(), onStale: vi.fn() };
  render(
    <AntApp>
      <RejectModal tenantId="t1" syndicId="s1" declaration={declaration} {...props} />
    </AntApp>
  );
  return props;
}

const toggleCorrection = () => fireEvent.click(screen.getByRole('switch', { name: 'Corriger avant de valider' }));
const setAmount = (index: number, value: string) =>
  fireEvent.change(screen.getAllByLabelText('Montant retenu')[index], { target: { value } });
const setNote = (value: string) => fireEvent.change(screen.getByLabelText(/^Note/), { target: { value } });
const okButton = (name: string | RegExp) => screen.getByRole('button', { name });

const RESULT = {
  declaration: { ...row(), status: 'APPROVED' as const },
  documents: [
    { id: 'doc1', kind: 'RECEIPT' as const, number: 'REC-2026-0001' },
    { id: 'doc2', kind: 'QUITTANCE' as const, number: 'QUI-2026-0004' }
  ]
};

describe('ApproveModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    approveSyndicDeclaration.mockResolvedValue(RESULT);
  });

  it('ne rend rien quand la déclaration est null', () => {
    render(
      <AntApp>
        <ApproveModal tenantId="t1" syndicId="s1" declaration={null} onClose={vi.fn()} onApproved={vi.fn()} />
      </AntApp>
    );
    expect(screen.queryByText('Valider la déclaration de paiement')).toBeNull();
  });

  it('affiche le récapitulatif et une alerte par alerte', () => {
    renderApprove(
      row([
        { kind: 'PROBABLE_DUPLICATE', declarationId: 'd0', createdAt: PAID_AT },
        { kind: 'DECLARANT_NOT_CURRENT_OWNER', lotId: 'lot-1' }
      ])
    );
    expect(screen.getByText('Awa Koné')).toBeInTheDocument();
    expect(screen.getByText('TX-98765')).toBeInTheDocument();
    expect(screen.getByText('+225 05 05 05 05 05')).toBeInTheDocument();
    expect(screen.getByText(/Doublon probable/)).toBeInTheDocument();
    expect(screen.getByText(/n’est plus le copropriétaire actuel du lot A12/)).toBeInTheDocument();
  });

  it('valide telle que déclarée : aucune correction envoyée, note seulement si saisie', async () => {
    const props = renderApprove();
    fireEvent.click(okButton('Valider telle que déclarée'));
    await waitFor(() => expect(approveSyndicDeclaration).toHaveBeenCalledTimes(1));
    expect(approveSyndicDeclaration).toHaveBeenCalledWith('t1', 's1', 'd1', {});
    await waitFor(() => expect(props.onApproved).toHaveBeenCalledWith(RESULT));
    expect(await screen.findByText(/REC-2026-0001, QUI-2026-0004/)).toBeInTheDocument();
  });

  it('envoie la note facultative saisie sans correction', async () => {
    renderApprove();
    setNote('Vérifié sur le relevé Wave');
    fireEvent.click(okButton('Valider telle que déclarée'));
    await waitFor(() =>
      expect(approveSyndicDeclaration).toHaveBeenCalledWith('t1', 's1', 'd1', { note: 'Vérifié sur le relevé Wave' })
    );
  });

  it('correction du montant retenu : note obligatoire, toutes les lignes dans le corps', async () => {
    renderApprove();
    toggleCorrection();
    setAmount(0, '50000');

    // Correction réelle sans note : bloquée
    expect(okButton('Valider avec correction')).toBeDisabled();
    expect(
      screen.getByText('Cette note sera montrée au copropriétaire, avec le montant déclaré et le montant retenu.')
    ).toBeInTheDocument();
    expect(screen.getByText('Paiement partiel')).toBeInTheDocument();

    // Note trop courte : bloquée
    setNote('Trop bref');
    expect(okButton('Valider avec correction')).toBeDisabled();

    setNote('Montant réellement reçu : 50 000');
    expect(okButton('Valider avec correction')).toBeEnabled();
    fireEvent.click(okButton('Valider avec correction'));

    await waitFor(() => expect(approveSyndicDeclaration).toHaveBeenCalledTimes(1));
    expect(approveSyndicDeclaration).toHaveBeenCalledWith('t1', 's1', 'd1', {
      correction: {
        lines: [
          { lineId: 'l1', acceptedAmount: 50000, chargeCallIds: ['cc-1', 'cc-2'] },
          { lineId: 'l2', acceptedAmount: 40000, chargeCallIds: ['cc-3'] }
        ]
      },
      note: 'Montant réellement reçu : 50 000'
    });
  });

  it('mode correction ouvert sans rien changer : correction null, note facultative', async () => {
    renderApprove();
    toggleCorrection();
    expect(okButton('Valider telle que déclarée')).toBeEnabled();
    fireEvent.click(okButton('Valider telle que déclarée'));
    await waitFor(() => expect(approveSyndicDeclaration).toHaveBeenCalledWith('t1', 's1', 'd1', { correction: null }));
  });

  it('accepte une ligne à 0 si une autre reste supérieure à 0', async () => {
    renderApprove();
    toggleCorrection();
    setAmount(0, '0');
    expect(screen.getByText('Ligne non encaissée')).toBeInTheDocument();
    setNote('Le lot A12 a payé séparément');
    fireEvent.click(okButton('Valider avec correction'));
    await waitFor(() => expect(approveSyndicDeclaration).toHaveBeenCalledTimes(1));
    const body = approveSyndicDeclaration.mock.calls[0][3];
    expect(body.correction.lines).toEqual([
      { lineId: 'l1', acceptedAmount: 0, chargeCallIds: ['cc-1', 'cc-2'] },
      { lineId: 'l2', acceptedAmount: 40000, chargeCallIds: ['cc-3'] }
    ]);
  });

  it('refuse que toutes les lignes soient à 0', () => {
    renderApprove();
    toggleCorrection();
    setAmount(0, '0');
    setAmount(1, '0');
    setNote('Rien n’a été reçu en réalité');
    expect(screen.getByText('Au moins une ligne doit avoir un montant retenu supérieur à 0.')).toBeInTheDocument();
    expect(okButton('Valider avec correction')).toBeDisabled();
  });

  it('retire des appels de charges : chargeCallIds du Select dans le corps', async () => {
    renderApprove();
    toggleCorrection();
    // Retire le tag « T2 2026 » de la première ligne
    const removers = document.querySelectorAll('.ant-select-selection-item-remove');
    fireEvent.click(removers[1]);
    setNote('Seul le premier trimestre est visé');
    await waitFor(() => expect(okButton('Valider avec correction')).toBeEnabled());
    fireEvent.click(okButton('Valider avec correction'));
    await waitFor(() => expect(approveSyndicDeclaration).toHaveBeenCalledTimes(1));
    expect(approveSyndicDeclaration.mock.calls[0][3].correction.lines[0]).toEqual({
      lineId: 'l1',
      acceptedAmount: 60000,
      chargeCallIds: ['cc-1']
    });
  });

  it('exercice clos : correction imposée, date à changer, corps avec paidAt', async () => {
    renderApprove(row([{ kind: 'FISCAL_YEAR_CLOSED' }]));
    expect(screen.getByRole('switch', { name: 'Corriger avant de valider' })).toBeDisabled();
    expect(
      screen.getByText('La date déclarée tombe dans un exercice clos : indiquez une date dans un exercice ouvert.')
    ).toBeInTheDocument();
    // Date inchangée : bloqué
    expect(okButton('Valider telle que déclarée')).toBeDisabled();

    const input = screen.getByLabelText('Date et heure du paiement retenues');
    fireEvent.mouseDown(input);
    fireEvent.change(input, { target: { value: '15/01/2025 08:15' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });

    setNote('Date de valeur retenue : exercice ouvert');
    await waitFor(() => expect(okButton('Valider avec correction')).toBeEnabled());
    fireEvent.click(okButton('Valider avec correction'));

    await waitFor(() => expect(approveSyndicDeclaration).toHaveBeenCalledTimes(1));
    expect(approveSyndicDeclaration).toHaveBeenCalledWith('t1', 's1', 'd1', {
      correction: { paidAt: dayjs('2025-01-15T08:15:00').format() },
      note: 'Date de valeur retenue : exercice ouvert'
    });
  });

  it('409 DECLARATION_NOT_PENDING : message et onStale', async () => {
    approveSyndicDeclaration.mockRejectedValue(apiError(409, 'DECLARATION_NOT_PENDING', 'Déjà traitée'));
    const props = renderApprove();
    fireEvent.click(okButton('Valider telle que déclarée'));
    expect(await screen.findByText('Cette déclaration vient d’être traitée ou annulée.')).toBeInTheDocument();
    await waitFor(() => expect(props.onStale).toHaveBeenCalledTimes(1));
    expect(props.onApproved).not.toHaveBeenCalled();
  });

  it('erreur serveur : message affiché, la modale reste ouverte', async () => {
    approveSyndicDeclaration.mockRejectedValue(
      apiError(400, 'VALIDATION_ERROR', 'Cette date tombe dans un exercice clos.')
    );
    const props = renderApprove();
    fireEvent.click(okButton('Valider telle que déclarée'));
    expect(await screen.findByText('Cette date tombe dans un exercice clos.')).toBeInTheDocument();
    expect(props.onApproved).not.toHaveBeenCalled();
    expect(props.onStale).not.toHaveBeenCalled();
    await waitFor(() => expect(okButton(/Valider telle que déclarée/)).toBeEnabled());
  });

  it('empêche le double clic pendant l’envoi', async () => {
    let release: (value: typeof RESULT) => void = () => undefined;
    approveSyndicDeclaration.mockReturnValue(new Promise(resolve => (release = resolve)));
    renderApprove();
    const button = okButton('Valider telle que déclarée');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(approveSyndicDeclaration).toHaveBeenCalledTimes(1);
    release(RESULT);
    await waitFor(() => expect(approveSyndicDeclaration).toHaveBeenCalledTimes(1));
  });
});

async function chooseReason(label: string) {
  const select = screen.getByRole('combobox');
  fireEvent.mouseDown(select);
  fireEvent.click(await screen.findByText(label, { selector: '.ant-select-item-option-content' }));
}

describe('RejectModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rejectSyndicDeclaration.mockResolvedValue({ ...row(), status: 'REJECTED' });
  });

  it('affiche le récapitulatif et l’information sur la visibilité du motif', () => {
    renderReject();
    expect(screen.getByText('TX-98765')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Le motif et le texte sont montrés au copropriétaire. Une déclaration rejetée ne se rouvre pas : il en déposera une nouvelle, et la référence redevient libre.'
      )
    ).toBeInTheDocument();
  });

  it('bloque tant que le motif est absent ou le texte trop court', async () => {
    renderReject();
    const button = okButton('Rejeter la déclaration');
    expect(button).toBeDisabled();

    // Texte valide mais motif absent
    fireEvent.change(screen.getByLabelText(/^Texte/), { target: { value: 'Texte suffisamment long' } });
    expect(button).toBeDisabled();

    // Motif choisi mais texte de 9 caractères une fois les espaces retirés
    await chooseReason('Paiement introuvable');
    expect(button).toBeEnabled();
    fireEvent.change(screen.getByLabelText(/^Texte/), { target: { value: '   123456789   ' } });
    expect(button).toBeDisabled();
  });

  it('envoie le motif et le texte trimmé', async () => {
    const props = renderReject();
    await chooseReason('Montant ne correspondant pas');
    fireEvent.change(screen.getByLabelText(/^Texte/), { target: { value: '  Le relevé indique 50 000 FCFA  ' } });
    const button = okButton('Rejeter la déclaration');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() =>
      expect(rejectSyndicDeclaration).toHaveBeenCalledWith('t1', 's1', 'd1', {
        reason: 'AMOUNT_MISMATCH',
        note: 'Le relevé indique 50 000 FCFA'
      })
    );
    await waitFor(() => expect(props.onRejected).toHaveBeenCalledTimes(1));
  });

  it('409 DECLARATION_NOT_PENDING : message et onStale', async () => {
    rejectSyndicDeclaration.mockRejectedValue(apiError(409, 'DECLARATION_NOT_PENDING', 'Déjà traitée'));
    const props = renderReject();
    await chooseReason('Autre');
    fireEvent.change(screen.getByLabelText(/^Texte/), { target: { value: 'Déjà traitée par un collègue' } });
    fireEvent.click(okButton('Rejeter la déclaration'));
    expect(await screen.findByText('Cette déclaration vient d’être traitée ou annulée.')).toBeInTheDocument();
    await waitFor(() => expect(props.onStale).toHaveBeenCalledTimes(1));
    expect(props.onRejected).not.toHaveBeenCalled();
  });

  it('erreur serveur : message affiché, la modale reste ouverte', async () => {
    rejectSyndicDeclaration.mockRejectedValue(apiError(500, undefined, 'Erreur interne du serveur'));
    const props = renderReject();
    await chooseReason('Autre');
    fireEvent.change(screen.getByLabelText(/^Texte/), { target: { value: 'Motif détaillé suffisant' } });
    fireEvent.click(okButton('Rejeter la déclaration'));
    expect(await screen.findByText('Erreur interne du serveur')).toBeInTheDocument();
    expect(props.onRejected).not.toHaveBeenCalled();
    await waitFor(() => expect(okButton(/Rejeter la déclaration/)).toBeEnabled());
  });
});
