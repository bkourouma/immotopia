import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from 'antd';
import dayjs from 'dayjs';
import { DeclareForThirdPartyModal } from '../../../components/syndics/declared-payment/DeclareForThirdPartyModal';

/**
 * Spec 047, parcours P4 : le gestionnaire déclare pour un copropriétaire.
 * Les services sont mockés en entier ; antd est réel (Select, Form.List, Upload).
 */

const createSyndicDeclaration = vi.fn();
const listSyndicReceivingNumbers = vi.fn();
const listSyndicateLots = vi.fn();
const listOpenLotCharges = vi.fn();
const getSyndicDeclaredSettings = vi.fn();

vi.mock('../../../services/syndic-declared-payment-service', () => ({
  createSyndicDeclaration: (...args: unknown[]) => createSyndicDeclaration(...args),
  getSyndicDeclaredSettings: (...args: unknown[]) => getSyndicDeclaredSettings(...args),
  listSyndicReceivingNumbers: (...args: unknown[]) => listSyndicReceivingNumbers(...args)
}));

vi.mock('../../../services/syndic-service', () => ({
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args)
}));

vi.mock('../../../services/syndic-lot-payment-service', () => ({
  listOpenLotCharges: (...args: unknown[]) => listOpenLotCharges(...args)
}));

const NUMBER_LABEL = 'Orange Money · +225 07 07 07 07 07 · Titulaire n-1';

const numberOf = (id: string, operator: string, phoneNumber: string, isActive: boolean) => ({
  id,
  operator,
  phoneNumber,
  holderName: `Titulaire ${id}`,
  label: null,
  isActive,
  sortOrder: 0,
  treasuryAccountNumber: '5521',
  treasuryBalance: 0,
  sharedWithCount: 0,
  pendingDeclarations: 0,
  createdAt: '',
  updatedAt: ''
});

const lotOf = (id: string, lotNumber: string, owners: Array<{ contactId: string; name: string }>) => ({
  id,
  syndicateId: 'syndic-1',
  lotNumber,
  owners: owners.map(o => ({ ...o, percentage: 100, ownedSince: '2020-01-01' }))
});

const AWA = { contactId: 'c-awa', name: 'Awa Koné' };
const MOUSSA = { contactId: 'c-moussa', name: 'Moussa Diallo' };

const openCall = {
  id: 'call-1',
  period: '2026-T3',
  periodStart: null,
  periodEnd: null,
  dueDate: '2026-09-10',
  amount: 90000,
  paid: 0,
  outstanding: 90000,
  currency: 'XOF',
  status: 'PENDING'
};

const createdRow = { id: 'decl-1', status: 'PENDING' };

function setup() {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(
    <App>
      <DeclareForThirdPartyModal tenantId="t-1" syndicId="s-1" open onClose={onClose} onCreated={onCreated} />
    </App>
  );
  return { onClose, onCreated };
}

async function ready() {
  await screen.findByLabelText('Copropriétaire');
  await waitFor(() => expect(listSyndicateLots).toHaveBeenCalled());
  await waitFor(() => expect(listSyndicReceivingNumbers).toHaveBeenCalled());
}

/** Options du dernier menu déroulant ouvert (les précédents restent un temps dans le DOM). */
function visibleOptions(text?: string): HTMLElement[] {
  const dropdowns = Array.from(document.querySelectorAll<HTMLElement>('.ant-select-dropdown')).filter(
    el => !el.classList.contains('ant-select-dropdown-hidden')
  );
  const last = dropdowns[dropdowns.length - 1];
  if (!last) return [];
  return Array.from(last.querySelectorAll<HTMLElement>('.ant-select-item-option-content')).filter(
    el => text === undefined || el.textContent === text
  );
}

async function pick(input: HTMLElement, text: string) {
  fireEvent.mouseDown(input);
  await waitFor(() => expect(visibleOptions(text).length).toBeGreaterThan(0));
  fireEvent.click(visibleOptions(text).at(-1) as HTMLElement);
}

async function optionTexts(input: HTMLElement): Promise<string[]> {
  fireEvent.mouseDown(input);
  await waitFor(() => expect(visibleOptions().length).toBeGreaterThan(0));
  return visibleOptions().map(el => el.textContent ?? '');
}

/** Ouvre la liste et attend qu'elle propose exactement `expected` (le filtre par copropriétaire est asynchrone). */
async function expectOptions(input: HTMLElement, expected: string[]): Promise<void> {
  fireEvent.mouseDown(input);
  await waitFor(() => expect(visibleOptions().map(el => el.textContent ?? '')).toEqual(expected));
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function setDate(date: dayjs.Dayjs) {
  const input = screen.getByLabelText('Date et heure du transfert');
  fireEvent.mouseDown(input);
  fireEvent.change(input, { target: { value: date.format('DD/MM/YYYY HH:mm') } });
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
  fireEvent.blur(input);
}

function makeFile(name: string, mime: string, size: number): File {
  const file = new File(['x'], name, { type: mime });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function proofInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  listSyndicReceivingNumbers.mockResolvedValue([
    numberOf('n-1', 'ORANGE', '+2250707070707', true),
    numberOf('n-2', 'WAVE', '+2250505050505', false)
  ]);
  listSyndicateLots.mockResolvedValue([
    lotOf('lot-1', 'A12', [AWA]),
    lotOf('lot-2', 'B07', [AWA, MOUSSA]),
    lotOf('lot-3', 'C03', [MOUSSA])
  ]);
  listOpenLotCharges.mockResolvedValue([openCall]);
  createSyndicDeclaration.mockResolvedValue(createdRow);
  getSyndicDeclaredSettings.mockResolvedValue({ enabled: true, usable: true });
});

/** Remplit numéro de réception, payeur, date et référence. */
async function fillCommon(reference = 'om 2024.ab-12') {
  await pick(screen.getByLabelText('Numéro de réception'), NUMBER_LABEL);
  type('Numéro du payeur', '07 11 22 33 44');
  setDate(dayjs().subtract(1, 'day').hour(10).minute(30));
  type('Référence de transaction', reference);
}

describe('DeclareForThirdPartyModal', () => {
  it('ne propose que les numéros de réception actifs', async () => {
    setup();
    await ready();
    expect(await optionTexts(screen.getByLabelText('Numéro de réception'))).toEqual([NUMBER_LABEL]);
  });

  it('le montant total est la somme des parts des lots', async () => {
    setup();
    await ready();
    await pick(screen.getByLabelText('Copropriétaire'), 'Awa Koné');
    await pick(screen.getAllByLabelText('Lot')[0], 'A12');
    type('Part du lot (FCFA)', '150000');
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un lot/ }));
    await pick(screen.getAllByLabelText('Lot')[1], 'B07');
    fireEvent.change(screen.getAllByLabelText('Part du lot (FCFA)')[1], { target: { value: '50000' } });
    await waitFor(() => expect(screen.getByTestId('declared-total').textContent).toMatch(/200\D?000/));
  });

  it('refuse un total au-delà de 5 000 000 sans rien envoyer', async () => {
    setup();
    await ready();
    await pick(screen.getByLabelText('Copropriétaire'), 'Awa Koné');
    await pick(screen.getAllByLabelText('Lot')[0], 'A12');
    type('Part du lot (FCFA)', '5000001');
    expect(await screen.findByText(/ne peut pas dépasser/)).toBeInTheDocument();
    await fillCommon();
    fireEvent.click(screen.getByRole('button', { name: 'Créer la déclaration' }));
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(createSyndicDeclaration).not.toHaveBeenCalled();
  }, 30000);

  it('ne propose pas deux fois le même lot et restreint les lots au copropriétaire', async () => {
    setup();
    await ready();
    await pick(screen.getByLabelText('Copropriétaire'), 'Moussa Diallo');
    await expectOptions(screen.getAllByLabelText('Lot')[0], ['B07', 'C03']);
    await pick(screen.getAllByLabelText('Lot')[0], 'B07');
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un lot/ }));
    await expectOptions(screen.getAllByLabelText('Lot')[1], ['C03']);
  });

  it('bloque une référence trop courte', async () => {
    setup();
    await ready();
    type('Référence de transaction', 'AB1');
    fireEvent.click(screen.getByRole('button', { name: 'Créer la déclaration' }));
    expect(await screen.findByText(/4 à 40 caractères/)).toBeInTheDocument();
    expect(createSyndicDeclaration).not.toHaveBeenCalled();
  });

  it('refuse côté client une capture trop lourde ou d’un mauvais type', async () => {
    setup();
    await ready();
    fireEvent.change(proofInput(), {
      target: { files: [makeFile('gros.png', 'image/png', 6 * 1024 * 1024)] }
    });
    expect(await screen.findByText(/Capture trop lourde/)).toBeInTheDocument();
    fireEvent.change(proofInput(), {
      target: { files: [makeFile('note.docx', 'application/msword', 1000)] }
    });
    expect(await screen.findByText(/Format non accepté/)).toBeInTheDocument();
    expect(screen.queryByText('gros.png')).not.toBeInTheDocument();
  });

  async function fillNominal() {
    await pick(screen.getByLabelText('Copropriétaire'), 'Awa Koné');
    await pick(screen.getAllByLabelText('Lot')[0], 'A12');
    type('Part du lot (FCFA)', '150000');
    await waitFor(() => expect(listOpenLotCharges).toHaveBeenCalledWith('t-1', 's-1', 'lot-1'));
    fireEvent.mouseDown(screen.getByLabelText('Appels visés'));
    await waitFor(() => expect(visibleOptions().length).toBeGreaterThan(0));
    fireEvent.click(visibleOptions().at(-1) as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un lot/ }));
    await pick(screen.getAllByLabelText('Lot')[1], 'B07');
    fireEvent.change(screen.getAllByLabelText('Part du lot (FCFA)')[1], { target: { value: '50000' } });
    await fillCommon();
    type('Commentaire (facultatif)', ' Reçu par le gardien ');
    fireEvent.change(proofInput(), { target: { files: [makeFile('capture.png', 'image/png', 1000)] } });
  }

  it('envoie le corps exact et la capture, puis appelle onCreated', async () => {
    const { onCreated } = setup();
    await ready();
    await fillNominal();
    fireEvent.click(screen.getByRole('button', { name: 'Créer la déclaration' }));
    await waitFor(() => expect(createSyndicDeclaration).toHaveBeenCalledTimes(1), { timeout: 10000 });
    const [tenantId, syndicId, body, proof] = createSyndicDeclaration.mock.calls[0];
    expect(tenantId).toBe('t-1');
    expect(syndicId).toBe('s-1');
    expect(body).toEqual({
      receivingNumberId: 'n-1',
      payerPhone: '07 11 22 33 44',
      amount: 200000,
      paidAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/),
      transactionReference: 'OM2024.AB-12',
      lines: [
        { lotId: 'lot-1', amount: 150000, chargeCallIds: ['call-1'] },
        { lotId: 'lot-2', amount: 50000, chargeCallIds: [] }
      ],
      comment: 'Reçu par le gardien',
      declaredForContactId: 'c-awa'
    });
    expect(proof).toBeInstanceOf(File);
    expect((proof as File).name).toBe('capture.png');
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdRow));
  }, 60000);

  it('affiche DECLARATION_REFERENCE_USED sous la référence et garde la modale ouverte', async () => {
    createSyndicDeclaration.mockRejectedValue({
      response: { data: { code: 'DECLARATION_REFERENCE_USED', message: 'Cette référence a déjà été déclarée.' } }
    });
    const { onCreated, onClose } = setup();
    await ready();
    await pick(screen.getByLabelText('Copropriétaire'), 'Awa Koné');
    await pick(screen.getAllByLabelText('Lot')[0], 'A12');
    type('Part du lot (FCFA)', '10000');
    await fillCommon();
    fireEvent.click(screen.getByRole('button', { name: 'Créer la déclaration' }));
    await waitFor(
      () =>
        expect(document.querySelector('.ant-form-item-explain-error')?.textContent).toBe(
          'Cette référence a déjà été déclarée.'
        ),
      { timeout: 10000 }
    );
    const message = document.querySelector('.ant-form-item-explain-error') as HTMLElement;
    const item = message.closest('.ant-form-item') as HTMLElement;
    expect(within(item).getByLabelText('Référence de transaction')).toHaveValue('om 2024.ab-12');
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Numéro du payeur')).toHaveValue('07 11 22 33 44');
  }, 60000);

  it('réglage désactivé : alerte persistante dès l’ouverture et bouton de soumission désactivé', async () => {
    getSyndicDeclaredSettings.mockResolvedValue({ enabled: false, usable: false });
    setup();
    await ready();
    expect(await screen.findByText(/Les paiements déclarés sont désactivés/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer la déclaration' })).toBeDisabled();
  });

  it('lecture des réglages en échec : ne bloque pas le formulaire', async () => {
    getSyndicDeclaredSettings.mockRejectedValue(new Error('boom'));
    setup();
    await ready();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Créer la déclaration' })).toBeEnabled());
    expect(screen.queryByText(/Les paiements déclarés sont désactivés/)).not.toBeInTheDocument();
  });

  it('réglage actif et erreur serveur : message d’erreur affiché en toast et dans l’alerte', async () => {
    createSyndicDeclaration.mockRejectedValue({
      response: { data: { code: 'DECLARED_PAYMENT_UNAVAILABLE', message: 'Paiements déclarés indisponibles.' } }
    });
    setup();
    await ready();
    await pick(screen.getByLabelText('Copropriétaire'), 'Awa Koné');
    await pick(screen.getAllByLabelText('Lot')[0], 'A12');
    type('Part du lot (FCFA)', '10000');
    await fillCommon();
    fireEvent.click(screen.getByRole('button', { name: 'Créer la déclaration' }));
    await waitFor(() => expect(document.querySelector('.ant-message .ant-message-notice')).not.toBeNull(), {
      timeout: 10000
    });
    expect(document.querySelector('.ant-message')?.textContent).toContain('Paiements déclarés indisponibles.');
    expect(screen.getAllByText('Paiements déclarés indisponibles.').length).toBeGreaterThanOrEqual(2);
  }, 60000);
});
