import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { DELAI, avecClient, remplirOperateurEtReference } from './declared-payment-test-helpers';

/**
 * Déclaration de paiement mobile money du portail locataire (spec 049) :
 * numéros de réception, référence obligatoire, envoi du bon FormData, refus
 * 409 (référence déjà déclarée), déclarations désactivées, lecture IA.
 */

const declarePayment = vi.fn();
const getAvailability = vi.fn();
const readProof = vi.fn();
vi.mock('../../services/tenantPortalService', () => ({
  tenantPortalService: {
    declarePayment: (...a: unknown[]) => declarePayment(...a),
    getLeases: vi.fn().mockResolvedValue({ data: { data: [] } })
  }
}));
vi.mock('../../services/tenant-portal-declared-payment-service', async importOriginal => {
  const original = await importOriginal<typeof import('../../services/tenant-portal-declared-payment-service')>();
  return {
    ...original,
    getDeclaredPaymentAvailability: (...a: unknown[]) => getAvailability(...a),
    readPaymentProof: (...a: unknown[]) => readProof(...a)
  };
});

import PaymentDeclarationModal from '../../components/TenantPortal/PaymentDeclarationModal';

const DISPO = {
  enabled: true,
  available: true,
  receivingNumbers: [{ id: 'rn1', operator: 'ORANGE', phone: '+2250707070707', label: 'Agence' }],
  proofRequired: false,
  aiPrefillAvailable: false,
  maxAmount: 5000000,
  instructions: 'Payez avant le 5 du mois.'
};

function monter(props: Partial<React.ComponentProps<typeof PaymentDeclarationModal>> = {}) {
  const onCancel = vi.fn();
  const onSuccess = vi.fn();
  render(
    avecClient(
      <AntApp>
        <PaymentDeclarationModal open onCancel={onCancel} onSuccess={onSuccess} {...props} />
      </AntApp>
    )
  );
  return { onCancel, onSuccess };
}

async function remplirEtEnvoyer(user: ReturnType<typeof userEvent.setup>, montant = '25000') {
  const champ = (await screen.findAllByRole('spinbutton', {}, DELAI))[0];
  await remplirOperateurEtReference(user, 'mp 2611.AB-12');
  await user.type(champ, montant);
  await user.click(screen.getByRole('button', { name: 'Déclarer le paiement' }));
}

beforeEach(() => {
  declarePayment.mockReset();
  declarePayment.mockResolvedValue({ data: { data: { id: 'd1' } } });
  getAvailability.mockReset();
  getAvailability.mockResolvedValue(DISPO);
  readProof.mockReset();
});

describe('Déclaration de paiement mobile money', () => {
  it('affiche les numéros de réception de l’agence et la consigne', async () => {
    monter();
    expect(await screen.findByText('Numéros pour payer par mobile money', {}, DELAI)).toBeInTheDocument();
    expect(screen.getByText('Copier le numéro')).toBeInTheDocument();
    expect(screen.getByText('Payez avant le 5 du mois.')).toBeInTheDocument();
  });

  it('exige la référence de transaction', async () => {
    monter();
    const user = userEvent.setup({ delay: null });
    const champ = (await screen.findAllByRole('spinbutton', {}, DELAI))[0];
    await user.type(champ, '25000');
    await user.click(screen.getByRole('button', { name: 'Déclarer le paiement' }));
    expect(await screen.findByText('La référence de la transaction est requise', {}, DELAI)).toBeInTheDocument();
    expect(declarePayment).not.toHaveBeenCalled();
  });

  it('refuse une référence trop courte', async () => {
    monter();
    const user = userEvent.setup({ delay: null });
    await remplirOperateurEtReference(user, 'AB');
    await user.click(screen.getByRole('button', { name: 'Déclarer le paiement' }));
    expect(await screen.findByText(/La référence doit comporter 4 à 40 caractères/, {}, DELAI)).toBeInTheDocument();
    expect(declarePayment).not.toHaveBeenCalled();
  });

  it('envoie le numéro, l’opérateur, la référence normalisée et un montant entier, sans paymentMethod', async () => {
    const { onSuccess, onCancel } = monter({ installmentId: 'ech-1' });
    const user = userEvent.setup({ delay: null });
    await remplirEtEnvoyer(user);
    await waitFor(() => expect(declarePayment).toHaveBeenCalled(), DELAI);
    const formData = declarePayment.mock.calls[0][0] as FormData;
    expect(formData.get('receivingNumberId')).toBe('rn1');
    expect(formData.get('operator')).toBe('ORANGE');
    expect(formData.get('reference')).toBe('MP2611.AB-12');
    expect(formData.get('amount')).toBe('25000');
    expect(formData.get('installmentId')).toBe('ech-1');
    expect(formData.get('paidAt')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(formData.get('paymentMethod')).toBeNull();
    expect(formData.get('proof')).toBeNull();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled(), DELAI);
    expect(onCancel).toHaveBeenCalled();
  });

  it('409 référence déjà déclarée : message lisible, la fenêtre reste ouverte', async () => {
    declarePayment.mockRejectedValue({
      response: {
        status: 409,
        data: { success: false, message: 'doublon', code: 'RENTAL_DECLARATION_DUPLICATE_REFERENCE' }
      }
    });
    const { onSuccess, onCancel } = monter();
    const user = userEvent.setup({ delay: null });
    await remplirEtEnvoyer(user);
    const messages = await screen.findAllByText(/Cette référence de transaction a déjà été déclarée/, {}, DELAI);
    expect(messages.length).toBeGreaterThan(0);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Déclarer le paiement' })).toBeInTheDocument();
  });

  it('plafond dépassé côté serveur : message explicite', async () => {
    declarePayment.mockRejectedValue({
      response: { status: 400, data: { success: false, message: 'x', code: 'RENTAL_DECLARATION_AMOUNT_TOO_HIGH' } }
    });
    monter();
    const user = userEvent.setup({ delay: null });
    await remplirEtEnvoyer(user);
    expect(
      await screen.findByText('Le montant dépasse le plafond autorisé pour une déclaration.', {}, DELAI)
    ).toBeInTheDocument();
  });

  it('déclarations désactivées : aucun formulaire, un message clair', async () => {
    getAvailability.mockResolvedValue({ ...DISPO, enabled: false, available: false, receivingNumbers: [] });
    monter();
    expect(await screen.findByText(/n'a pas activé la déclaration de paiement/, {}, DELAI)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Déclarer le paiement' })).toBeNull();
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
  });

  it('disponibilité en erreur : aucun formulaire', async () => {
    getAvailability.mockRejectedValue(new Error('réseau'));
    monter();
    expect(await screen.findByText(/n'est pas disponible pour le moment/, {}, DELAI)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Déclarer le paiement' })).toBeNull();
  });
});

describe('Déclaration de paiement — lecture IA de la capture', () => {
  const capture = () => new File(['x'], 'capture.png', { type: 'image/png' });

  it('pré-remplit et signale les champs lus, envoie proofReadId sans le fichier', async () => {
    getAvailability.mockResolvedValue({ ...DISPO, aiPrefillAvailable: true });
    readProof.mockResolvedValue({
      proofReadId: '11111111-1111-4111-8111-111111111111',
      quality: 'OK',
      operator: 'ORANGE',
      amount: 42000,
      reference: 'CI260911.0001',
      paidAt: new Date().toISOString(),
      payerPhone: null,
      recipientPhone: '+2250707070707',
      confidence: { amount: 0.9 },
      warnings: [],
      matchedReceivingNumberId: 'rn1'
    });
    const { container } = render(
      avecClient(
        <AntApp>
          <PaymentDeclarationModal open onCancel={vi.fn()} onSuccess={vi.fn()} />
        </AntApp>
      )
    );
    void container;
    const user = userEvent.setup({ delay: null });
    await screen.findByText('Joindre la capture', {}, DELAI);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, capture());

    await waitFor(() => expect(readProof).toHaveBeenCalled(), DELAI);
    expect(await screen.findByTestId('ai-hint-amount', {}, DELAI)).toBeInTheDocument();
    expect(screen.getByTestId('ai-hint-reference')).toBeInTheDocument();
    const montant = (await screen.findAllByRole('spinbutton'))[0] as HTMLInputElement;
    await waitFor(() => expect(montant.value.replace(/[^0-9]/g, '')).toBe('42000'), DELAI);

    // Le locataire corrige librement : la mention disparaît dès qu'il édite le champ.
    await user.clear(montant);
    await user.type(montant, '41000');
    await waitFor(() => expect(screen.queryByTestId('ai-hint-amount')).toBeNull(), DELAI);

    await user.click(screen.getByRole('button', { name: 'Déclarer le paiement' }));
    await waitFor(() => expect(declarePayment).toHaveBeenCalled(), DELAI);
    const formData = declarePayment.mock.calls[0][0] as FormData;
    expect(formData.get('proofReadId')).toBe('11111111-1111-4111-8111-111111111111');
    expect(formData.get('proof')).toBeNull();
    expect(formData.get('amount')).toBe('41000');
    expect(formData.get('reference')).toBe('CI260911.0001');
  });

  it('un échec de lecture ne bloque rien : message, champs libres, fichier envoyé', async () => {
    getAvailability.mockResolvedValue({ ...DISPO, aiPrefillAvailable: true });
    readProof.mockRejectedValue(new Error('panne'));
    monter();
    const user = userEvent.setup({ delay: null });
    await screen.findByText('Joindre la capture', {}, DELAI);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, capture());
    expect(
      await screen.findByText("La lecture automatique n'a pas abouti, remplissez les champs.", {}, DELAI)
    ).toBeInTheDocument();

    await remplirEtEnvoyer(user, '30000');
    await waitFor(() => expect(declarePayment).toHaveBeenCalled(), DELAI);
    const formData = declarePayment.mock.calls[0][0] as FormData;
    expect(formData.get('proofReadId')).toBeNull();
    expect(formData.get('proof')).toBeInstanceOf(File);
  });
});

describe('Déclaration de paiement — lecture IA périmée', () => {
  const capture = (nom: string) => new File(['x'], nom, { type: 'image/png' });
  const lecture = (montant: number, id: string) => ({
    proofReadId: id,
    quality: 'OK' as const,
    operator: 'ORANGE' as const,
    amount: montant,
    reference: 'CI260911.0001',
    paidAt: new Date().toISOString(),
    payerPhone: null,
    recipientPhone: null,
    confidence: {},
    warnings: [],
    matchedReceivingNumberId: 'rn1'
  });
  const fichier = () => document.querySelector('input[type="file"]') as HTMLInputElement;
  const retirer = async (user: ReturnType<typeof userEvent.setup>) => {
    const bouton = document.querySelector('.ant-upload-list-item-actions button') as HTMLElement;
    await user.click(bouton);
  };

  it('capture retirée pendant la lecture : le résultat est ignoré (aucun champ rempli, pas de proofReadId)', async () => {
    getAvailability.mockResolvedValue({ ...DISPO, aiPrefillAvailable: true });
    let resoudre: (v: unknown) => void = () => undefined;
    readProof.mockReturnValue(new Promise(r => (resoudre = r)));
    monter();
    const user = userEvent.setup({ delay: null });
    await screen.findByText('Joindre la capture', {}, DELAI);
    await user.upload(fichier(), capture('a.png'));
    await waitFor(() => expect(readProof).toHaveBeenCalledTimes(1), DELAI);
    await retirer(user);
    await waitFor(() => expect(document.querySelector('.ant-upload-list-item')).toBeNull(), DELAI);

    resoudre(lecture(42000, '11111111-1111-4111-8111-111111111111'));
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByTestId('ai-hint-amount')).toBeNull();
    const montant = (await screen.findAllByRole('spinbutton'))[0] as HTMLInputElement;
    expect(montant.value).toBe('');
    expect(screen.queryByText('Lecture de la capture…')).toBeNull();

    await remplirEtEnvoyer(user, '30000');
    await waitFor(() => expect(declarePayment).toHaveBeenCalled(), DELAI);
    const formData = declarePayment.mock.calls[0][0] as FormData;
    expect(formData.get('proofReadId')).toBeNull();
    expect(formData.get('proof')).toBeNull();
  });

  it('capture A remplacée par B avant la fin de la lecture de A : le proofReadId de A n’est jamais envoyé', async () => {
    getAvailability.mockResolvedValue({ ...DISPO, aiPrefillAvailable: true });
    const resolveurs: Array<(v: unknown) => void> = [];
    readProof.mockImplementation(() => new Promise(r => resolveurs.push(r)));
    monter();
    const user = userEvent.setup({ delay: null });
    await screen.findByText('Joindre la capture', {}, DELAI);
    await user.upload(fichier(), capture('a.png'));
    await waitFor(() => expect(readProof).toHaveBeenCalledTimes(1), DELAI);
    await retirer(user);
    await waitFor(() => expect(document.querySelector('.ant-upload-list-item')).toBeNull(), DELAI);
    await user.upload(fichier(), capture('b.png'));
    await waitFor(() => expect(readProof).toHaveBeenCalledTimes(2), DELAI);

    // La lecture de A revient en retard : ignorée, la lecture de B est toujours en cours.
    resolveurs[0](lecture(11111, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByTestId('ai-hint-amount')).toBeNull();
    expect(screen.getByText('Lecture de la capture…')).toBeInTheDocument();
    const montant = (await screen.findAllByRole('spinbutton'))[0] as HTMLInputElement;
    expect(montant.value).toBe('');

    await remplirEtEnvoyer(user, '30000');
    await waitFor(() => expect(declarePayment).toHaveBeenCalled(), DELAI);
    const formData = declarePayment.mock.calls[0][0] as FormData;
    expect(formData.get('proofReadId')).toBeNull();
    expect((formData.get('proof') as File).name).toBe('b.png');
  });
});

describe('Déclaration de paiement — autres modes (espèces, chèque, virement)', () => {
  async function choisirMode(user: ReturnType<typeof userEvent.setup>, libelle: string) {
    await user.click(await screen.findByRole('combobox', { name: 'Mode de paiement' }, DELAI));
    const options = await screen.findAllByText(libelle, {}, DELAI);
    await user.click(options[options.length - 1]);
  }

  it('espèces : ni numéro de réception, ni opérateur, ni référence exigée ; envoie paymentMethod', async () => {
    getAvailability.mockResolvedValue({ ...DISPO, receivingNumbers: [], allowedMethods: ['CASH', 'CHECK'] });
    const { onSuccess } = monter({ installmentId: 'ech-1' });
    const user = userEvent.setup({ delay: null });
    // Mobile money non permis : le mode par défaut est le premier permis.
    expect(await screen.findByText('Espèces', {}, DELAI)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Numéro de réception utilisé/)).toBeNull();
    expect(screen.queryByLabelText(/Opérateur utilisé/)).toBeNull();
    await user.type((await screen.findAllByRole('spinbutton'))[0], '25000');
    await user.click(screen.getByRole('button', { name: 'Déclarer le paiement' }));
    await waitFor(() => expect(declarePayment).toHaveBeenCalled(), DELAI);
    const formData = declarePayment.mock.calls[0][0] as FormData;
    expect(formData.get('paymentMethod')).toBe('CASH');
    expect(formData.get('receivingNumberId')).toBeNull();
    expect(formData.get('operator')).toBeNull();
    expect(formData.get('reference')).toBeNull();
    expect(formData.get('amount')).toBe('25000');
    expect(formData.get('installmentId')).toBe('ech-1');
    await waitFor(() => expect(onSuccess).toHaveBeenCalled(), DELAI);
  });

  it('chèque avec numéro de chèque, malgré des numéros de réception présents', async () => {
    monter();
    const user = userEvent.setup({ delay: null });
    await choisirMode(user, 'Chèque');
    expect(screen.queryByText('Numéros pour payer par mobile money')).toBeNull();
    await user.type((await screen.findAllByRole('spinbutton'))[0], '60000');
    await user.type(screen.getByLabelText(/Référence \(n° de chèque/), 'chq 0042');
    await user.click(screen.getByRole('button', { name: 'Déclarer le paiement' }));
    await waitFor(() => expect(declarePayment).toHaveBeenCalled(), DELAI);
    const formData = declarePayment.mock.calls[0][0] as FormData;
    expect(formData.get('paymentMethod')).toBe('CHECK');
    expect(formData.get('reference')).toBe('CHQ0042');
    expect(formData.get('receivingNumberId')).toBeNull();
    expect(formData.get('operator')).toBeNull();
  });

  it('aucun numéro actif mais d’autres modes : formulaire utilisable, message pour le mobile money seul', async () => {
    getAvailability.mockResolvedValue({
      ...DISPO,
      receivingNumbers: [],
      allowedMethods: ['MOBILE_MONEY', 'BANK_TRANSFER']
    });
    monter();
    const user = userEvent.setup({ delay: null });
    expect(await screen.findByText(/Aucun numéro de réception n'est disponible/, {}, DELAI)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Déclarer le paiement' })).toBeDisabled();
    await choisirMode(user, 'Virement bancaire');
    expect(screen.queryByText(/Aucun numéro de réception n'est disponible/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Déclarer le paiement' })).toBeEnabled();
  });

  it('la lecture IA ne se lance pas hors mobile money', async () => {
    getAvailability.mockResolvedValue({ ...DISPO, aiPrefillAvailable: true });
    monter();
    const user = userEvent.setup({ delay: null });
    await choisirMode(user, 'Espèces');
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['x'], 'recu.png', { type: 'image/png' })
    );
    await new Promise(r => setTimeout(r, 50));
    expect(readProof).not.toHaveBeenCalled();
    await user.type((await screen.findAllByRole('spinbutton'))[0], '10000');
    await user.click(screen.getByRole('button', { name: 'Déclarer le paiement' }));
    await waitFor(() => expect(declarePayment).toHaveBeenCalled(), DELAI);
    const formData = declarePayment.mock.calls[0][0] as FormData;
    expect(formData.get('proofReadId')).toBeNull();
    expect((formData.get('proof') as File).name).toBe('recu.png');
  });
});
