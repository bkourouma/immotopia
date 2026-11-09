import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { ReceivingAccountsManagerCard } from '../../components/payment/ReceivingAccountsManagerCard';
import type { ReceivingAccountAdmin } from '../../services/receiving-account-service';

/**
 * Carte de gestion des comptes de réception (spec 048, lot Q) : liste, ajout,
 * erreurs serveur, règle « alias ou QR », image refusée, suppression.
 * Le service est mocké en entier : chaque export utilisé doit y figurer.
 */

const listReceivingAccounts = vi.fn();
const createReceivingAccount = vi.fn();
const updateReceivingAccount = vi.fn();
const deleteReceivingAccount = vi.fn();
const fetchReceivingAccountQr = vi.fn();

vi.mock('../../services/receiving-account-service', () => ({
  RECEIVING_ACCOUNT_LIMIT: 10,
  RECEIVING_ACCOUNT_QR_MAX_BYTES: 2 * 1024 * 1024,
  RECEIVING_ACCOUNT_QR_ACCEPTED_TYPES: ['image/png', 'image/jpeg', 'image/webp'],
  listReceivingAccounts: (...a: unknown[]) => listReceivingAccounts(...a),
  createReceivingAccount: (...a: unknown[]) => createReceivingAccount(...a),
  updateReceivingAccount: (...a: unknown[]) => updateReceivingAccount(...a),
  deleteReceivingAccount: (...a: unknown[]) => deleteReceivingAccount(...a),
  fetchReceivingAccountQr: (...a: unknown[]) => fetchReceivingAccountQr(...a)
}));

function row(overrides: Partial<ReceivingAccountAdmin> = {}): ReceivingAccountAdmin {
  return {
    id: 'a1',
    institution: 'Wave',
    scannableWith: null,
    alias: 'agence-soleil',
    holderName: 'Agence Soleil',
    instructions: null,
    hasQr: false,
    qrPath: null,
    isActive: true,
    sortOrder: 0,
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides
  };
}

const scope = { kind: 'agency' as const, tenantId: 'tenant-1' };

function mount(canEdit = true) {
  return render(
    <AntApp>
      <ReceivingAccountsManagerCard scope={scope} canEdit={canEdit} />
    </AntApp>
  );
}

async function fill(label: RegExp | string, value: string) {
  fireEvent.change(await screen.findByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  listReceivingAccounts.mockResolvedValue([row()]);
});

describe('ReceivingAccountsManagerCard', () => {
  it('liste les comptes de la portée demandée', async () => {
    mount();
    expect(await screen.findByText('Agence Soleil', { exact: false })).toBeInTheDocument();
    expect(listReceivingAccounts).toHaveBeenCalledWith(scope);
    expect(screen.getByText('agence-soleil')).toBeInTheDocument();
  });

  it("sans droit d'écriture : aucun bouton d'ajout, de modification ni de suppression", async () => {
    mount(false);
    await screen.findByText('agence-soleil');
    expect(screen.queryByRole('button', { name: /Ajouter un compte/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Modifier/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer/ })).not.toBeInTheDocument();
  });

  it('ajoute un compte avec alias', async () => {
    createReceivingAccount.mockResolvedValue(row({ id: 'a2', institution: 'Orange Money' }));
    mount();
    await screen.findByText('agence-soleil');
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un compte/ }));
    await fill(/Établissement/, 'Orange Money');
    await fill(/Alias/, 'agence-om');
    await fill(/Nom attendu du bénéficiaire/, 'Agence Soleil');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(createReceivingAccount).toHaveBeenCalledTimes(1));
    const [sentScope, input, options] = createReceivingAccount.mock.calls[0];
    expect(sentScope).toEqual(scope);
    expect(input).toMatchObject({
      institution: 'Orange Money',
      alias: 'agence-om',
      holderName: 'Agence Soleil',
      isActive: true
    });
    expect(options.qrFile).toBeNull();
    await waitFor(() => expect(listReceivingAccounts).toHaveBeenCalledTimes(2));
  });

  it('refuse un compte actif sans alias ni QR', async () => {
    mount();
    await screen.findByText('agence-soleil');
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un compte/ }));
    await fill(/Établissement/, 'Wave');
    await fill(/Nom attendu du bénéficiaire/, 'Agence Soleil');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Un compte actif doit avoir au moins un alias ou un QR.')).toBeInTheDocument();
    expect(createReceivingAccount).not.toHaveBeenCalled();
  });

  it('refuse avant envoi une image qui n’est pas PNG, JPEG ou WebP', async () => {
    mount();
    await screen.findByText('agence-soleil');
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un compte/ }));
    const input = await screen.findByLabelText('Choisir l’image du QR');
    const svg = new File(['<svg/>'], 'qr.svg', { type: 'image/svg+xml' });
    fireEvent.change(input, { target: { files: [svg] } });
    expect(await screen.findByText('Le QR doit être une image PNG, JPEG ou WebP.')).toBeInTheDocument();
  });

  it('refuse avant envoi une image de plus de 2 Mo', async () => {
    mount();
    await screen.findByText('agence-soleil');
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un compte/ }));
    const input = await screen.findByLabelText('Choisir l’image du QR');
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'qr.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText('Le QR ne doit pas dépasser 2 Mo.')).toBeInTheDocument();
  });

  it('affiche le message du serveur quand l’enregistrement échoue', async () => {
    createReceivingAccount.mockRejectedValue({ response: { data: { message: 'Alias invalide.' } } });
    mount();
    await screen.findByText('agence-soleil');
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un compte/ }));
    await fill(/Établissement/, 'Wave');
    await fill(/Alias/, 'x');
    await fill(/Nom attendu du bénéficiaire/, 'Agence Soleil');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Alias invalide.')).toBeInTheDocument();
  });

  it('supprime un compte après confirmation', async () => {
    deleteReceivingAccount.mockResolvedValue(undefined);
    mount();
    await screen.findByText('agence-soleil');
    fireEvent.click(screen.getByRole('button', { name: /Supprimer/ }));
    const confirm = await screen.findAllByRole('button', { name: 'Supprimer' });
    fireEvent.click(confirm[confirm.length - 1]);
    await waitFor(() => expect(deleteReceivingAccount).toHaveBeenCalledWith(scope, 'a1'));
  });

  it('bloque l’ajout à la limite de 10 comptes', async () => {
    listReceivingAccounts.mockResolvedValue(Array.from({ length: 10 }, (_, i) => row({ id: `a${i}` })));
    mount();
    await screen.findByText('Limite de 10 comptes atteinte.');
    expect(screen.getByRole('button', { name: /Ajouter un compte/ })).toBeDisabled();
  });

  it('affiche une erreur de chargement avec un bouton Réessayer', async () => {
    listReceivingAccounts.mockRejectedValueOnce({ response: { data: { message: 'Panne.' } } });
    mount();
    expect(await screen.findByText('Panne.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Réessayer/ }));
    await waitFor(() => expect(listReceivingAccounts).toHaveBeenCalledTimes(2));
  });
});
