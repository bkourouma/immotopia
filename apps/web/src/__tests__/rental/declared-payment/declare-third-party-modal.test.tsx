import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import dayjs from 'dayjs';
import { DeclareForThirdPartyModal } from '../../../components/rental/declared-payment/DeclareForThirdPartyModal';

const createRentalDeclarationForThirdParty = vi.fn();
const listRentalReceivingNumbers = vi.fn();
const listInstallments = vi.fn();

vi.mock('../../../services/rental-declared-payment-service', () => ({
  createRentalDeclarationForThirdParty: (...args: unknown[]) => createRentalDeclarationForThirdParty(...args),
  listRentalReceivingNumbers: (...args: unknown[]) => listRentalReceivingNumbers(...args)
}));

vi.mock('../../../services/rental-service', () => ({
  RentalInstallmentStatus: { DRAFT: 'DRAFT', DUE: 'DUE', PARTIAL: 'PARTIAL', PAID: 'PAID', OVERDUE: 'OVERDUE' },
  listInstallments: (...args: unknown[]) => listInstallments(...args)
}));

vi.mock('../../../components/rental/LeaseSelectField', () => ({
  LeaseSelectField: ({ onChange }: { onChange?: (id: string | undefined) => void }) => (
    <button type="button" onClick={() => onChange?.('lease-1')}>
      choisir-bail
    </button>
  )
}));

const numbers = [{ id: 'rn-1', operator: 'ORANGE', phone: '+2250707070707', label: 'Principal', active: true }];

const renderModal = () => {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(
    <AntApp>
      <DeclareForThirdPartyModal tenantId="t1" open onClose={onClose} onCreated={onCreated} />
    </AntApp>
  );
  return { onClose, onCreated };
};

const chooseOption = async (comboIndex: number, label: string | RegExp) => {
  fireEvent.mouseDown(screen.getAllByRole('combobox')[comboIndex]);
  const options = await screen.findAllByText(label, { selector: '.ant-select-item-option-content' });
  fireEvent.click(options[options.length - 1]);
};

const submitButton = () => screen.getByRole('button', { name: 'Créer la déclaration' });

const fillValid = async (reference = 'TXN 1234') => {
  fireEvent.click(screen.getByText('choisir-bail'));
  // combobox : 0 échéance, 1 numéro, 2 opérateur
  await chooseOption(1, /Orange Money · \+225 07 07 07 07 07/);
  await chooseOption(2, 'Orange Money');
  fireEvent.change(screen.getByLabelText('Référence de transaction'), { target: { value: reference } });
  fireEvent.change(screen.getByLabelText('Montant (FCFA)'), { target: { value: '75000' } });
  const picker = screen.getByLabelText('Date et heure du transfert');
  fireEvent.mouseDown(picker);
  fireEvent.change(picker, { target: { value: dayjs().subtract(1, 'hour').format('DD/MM/YYYY HH:mm') } });
  fireEvent.keyDown(picker, { key: 'Enter', keyCode: 13 });
  const ok = document.querySelector('.ant-picker-ok button');
  if (ok) fireEvent.click(ok);
};

describe('DeclareForThirdPartyModal (locatif)', () => {
  beforeEach(() => {
    createRentalDeclarationForThirdParty.mockReset();
    listRentalReceivingNumbers.mockReset().mockResolvedValue(numbers);
    listInstallments.mockReset().mockResolvedValue({ success: true, data: [], pagination: {} });
  });

  it('charge les numéros actifs seulement', async () => {
    renderModal();
    await waitFor(() => expect(listRentalReceivingNumbers).toHaveBeenCalledWith('t1', true));
  });

  it('refuse une référence trop courte ou invalide et un champ vide', async () => {
    renderModal();
    fireEvent.click(submitButton());
    expect(await screen.findByText('Choisissez le bail.')).toBeInTheDocument();
    expect(screen.getByText('Saisissez la référence de transaction.')).toBeInTheDocument();
    expect(screen.getByText('Saisissez le montant.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Référence de transaction'), { target: { value: 'a b' } });
    fireEvent.click(submitButton());
    expect(
      await screen.findByText('La référence compte 4 à 40 caractères : lettres, chiffres, point ou tiret.')
    ).toBeInTheDocument();
    expect(createRentalDeclarationForThirdParty).not.toHaveBeenCalled();
  });

  it('refuse un montant supérieur à 5 000 000', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Montant (FCFA)'), { target: { value: '6000000' } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(screen.queryByText(/Saisissez un montant entier entre 1 et/)).not.toBeNull());
    expect(createRentalDeclarationForThirdParty).not.toHaveBeenCalled();
  });

  it('envoie le corps attendu en multipart (service) avec la capture jointe', async () => {
    createRentalDeclarationForThirdParty.mockResolvedValue({ id: 'decl-9' });
    const { onCreated } = renderModal();
    await waitFor(() => expect(listRentalReceivingNumbers).toHaveBeenCalled());
    await fillValid();

    const file = new File(['x'], 'capture.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(submitButton());
    await waitFor(() => expect(createRentalDeclarationForThirdParty).toHaveBeenCalledTimes(1));
    const [tenantId, body, proof] = createRentalDeclarationForThirdParty.mock.calls[0];
    expect(tenantId).toBe('t1');
    expect(body).toMatchObject({
      leaseId: 'lease-1',
      installmentId: null,
      receivingNumberId: 'rn-1',
      operator: 'ORANGE',
      reference: 'TXN 1234',
      amount: 75000,
      payerPhone: null,
      notes: null
    });
    expect(body.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(proof).toBe(file);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 'decl-9' }));
  });

  it('rejette une capture trop lourde ou d’un mauvais format', async () => {
    renderModal();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] } });
    expect(
      await screen.findByText('Format non accepté : joignez une image JPEG, PNG, WebP ou un PDF.')
    ).toBeInTheDocument();
  });

  it('rejette une capture de plus de 5 Mo', async () => {
    renderModal();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText('Capture trop lourde : 5 Mo au plus.')).toBeInTheDocument();
  });

  it('affiche l’erreur du serveur', async () => {
    createRentalDeclarationForThirdParty.mockRejectedValue({
      response: { data: { code: 'DECLARATION_REFERENCE_USED', message: 'Référence déjà utilisée.' } }
    });
    renderModal();
    await waitFor(() => expect(listRentalReceivingNumbers).toHaveBeenCalled());
    await fillValid();
    fireEvent.click(submitButton());
    await waitFor(() => expect(createRentalDeclarationForThirdParty).toHaveBeenCalled());
    const alerts = await screen.findAllByText('Référence déjà utilisée.');
    expect(alerts.length).toBeGreaterThan(0);
    expect(within(document.body).queryByText('Créer la déclaration')).toBeInTheDocument();
  });
});
