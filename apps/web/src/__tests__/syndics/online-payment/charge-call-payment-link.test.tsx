import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { ChargeCallPaymentLinkModal } from '../../../components/syndics/online-payment/ChargeCallPaymentLinkModal';
import type { ChargeCallPaymentLinkSummary } from '../../../services/syndic-online-payment-service';

/**
 * Fenêtre « Lien de paiement » d'un appel de charges (spec 042, contrat §1.10).
 * Le service est mocké en entier : chaque export utilisé par le composant doit
 * figurer ci-dessous, Vitest refusant tout import non déclaré.
 */

const createChargeCallPaymentLink = vi.fn();
const listChargeCallPaymentLinks = vi.fn();
const revokeChargeCallPaymentLink = vi.fn();

vi.mock('../../../services/syndic-online-payment-service', () => ({
  createChargeCallPaymentLink: (...a: unknown[]) => createChargeCallPaymentLink(...a),
  listChargeCallPaymentLinks: (...a: unknown[]) => listChargeCallPaymentLinks(...a),
  revokeChargeCallPaymentLink: (...a: unknown[]) => revokeChargeCallPaymentLink(...a)
}));

const copyToClipboard = vi.fn();
vi.mock('../../../utils/copy-to-clipboard', () => ({
  copyToClipboard: (...a: unknown[]) => copyToClipboard(...a)
}));

const CHARGE = { id: 'cc-1', period: '2026-T4' };
const URL_SECRETE = 'https://app.example.com/payer-charges#JETON-EN-CLAIR';

function link(overrides: Partial<ChargeCallPaymentLinkSummary> = {}): ChargeCallPaymentLinkSummary {
  return {
    id: 'lk-1',
    createdAt: '2026-10-10T08:00:00.000Z',
    expiresAt: '2026-10-17T08:00:00.000Z',
    revokedAt: null,
    status: 'ACTIVE',
    viewCount: 3,
    lastViewedAt: '2026-10-11T08:00:00.000Z',
    createdByUserId: 'user-1',
    payment: { status: 'NONE', amount: null, updatedAt: null },
    ...overrides
  };
}

function renderModal(canEdit = true) {
  const onClose = vi.fn();
  render(
    <AntApp>
      <ChargeCallPaymentLinkModal
        tenantId="t1"
        syndicId="s1"
        charge={CHARGE}
        open
        canEdit={canEdit}
        onClose={onClose}
      />
    </AntApp>
  );
  return { onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  listChargeCallPaymentLinks.mockResolvedValue([]);
  copyToClipboard.mockResolvedValue(true);
});

describe('ChargeCallPaymentLinkModal — liens de l’appel', () => {
  it('charge les liens de CET appel et n’affiche que les liens actifs par défaut', async () => {
    listChargeCallPaymentLinks.mockResolvedValue([
      link({ id: 'lk-actif', viewCount: 7 }),
      link({ id: 'lk-expire', status: 'EXPIRED' }),
      link({ id: 'lk-revoque', status: 'REVOKED', revokedAt: '2026-10-12T08:00:00.000Z' })
    ]);
    renderModal();

    await waitFor(() => expect(listChargeCallPaymentLinks).toHaveBeenCalledWith('t1', 's1', 'cc-1'));
    expect(await screen.findByText('Actif')).toBeInTheDocument();
    expect(screen.queryByText('Expiré')).not.toBeInTheDocument();
    expect(screen.queryByText('Révoqué')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch'));
    expect(await screen.findByText('Expiré')).toBeInTheDocument();
    expect(screen.getByText('Révoqué')).toBeInTheDocument();
  });

  it('dit « Aucun lien actif. » quand il n’y en a pas', async () => {
    renderModal();
    expect(await screen.findByText('Aucun lien actif.')).toBeInTheDocument();
  });

  it('distingue un lien du gestionnaire d’un lien joint automatiquement et montre l’état du paiement', async () => {
    listChargeCallPaymentLinks.mockResolvedValue([
      link({ id: 'lk-1', createdByUserId: null, payment: { status: 'REVIEW', amount: 50000, updatedAt: null } })
    ]);
    renderModal();

    expect(await screen.findByText('Joint à un avis ou une relance')).toBeInTheDocument();
    expect(screen.getByText('À trancher')).toBeInTheDocument();
  });

  it('affiche l’erreur de chargement avec un bouton « Réessayer »', async () => {
    listChargeCallPaymentLinks.mockRejectedValueOnce({ response: { data: { message: 'Accès refusé.' } } });
    renderModal();

    expect(await screen.findByText('Accès refusé.')).toBeInTheDocument();
    listChargeCallPaymentLinks.mockResolvedValue([link()]);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Actif')).toBeInTheDocument();
  });
});

describe('ChargeCallPaymentLinkModal — copier le lien', () => {
  it('montre l’URL une seule fois avec « Copier » et prévient qu’elle ne reviendra pas', async () => {
    createChargeCallPaymentLink.mockResolvedValue({
      linkId: 'lk-9',
      url: URL_SECRETE,
      expiresAt: '2026-10-23T08:00:00.000Z',
      amountDue: 100000,
      currency: 'XOF'
    });
    renderModal();

    fireEvent.click(await screen.findByLabelText('Copier le lien'));
    fireEvent.click(screen.getByRole('button', { name: 'Créer le lien' }));

    await waitFor(() =>
      expect(createChargeCallPaymentLink).toHaveBeenCalledWith('t1', 's1', 'cc-1', { delivery: 'COPY', ttlDays: 7 })
    );
    const field = (await screen.findByLabelText('Lien de paiement')) as HTMLInputElement;
    expect(field.value).toBe(URL_SECRETE);
    expect(screen.getByText('Ce lien ne sera plus affiché après la fermeture de cette fenêtre.')).toBeInTheDocument();
    expect(screen.getByText(/Montant dû : .*100.*FCFA/)).toBeInTheDocument();
    // La liste est rechargée : le nouveau lien en fait partie.
    await waitFor(() => expect(listChargeCallPaymentLinks).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Copier' }));
    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith(URL_SECRETE));
  });

  it('efface l’URL de l’écran avec « Créer un autre lien »', async () => {
    createChargeCallPaymentLink.mockResolvedValue({
      linkId: 'lk-9',
      url: URL_SECRETE,
      expiresAt: '2026-10-23T08:00:00.000Z',
      amountDue: 100000,
      currency: 'XOF'
    });
    renderModal();

    fireEvent.click(await screen.findByLabelText('Copier le lien'));
    fireEvent.click(screen.getByRole('button', { name: 'Créer le lien' }));
    await screen.findByLabelText('Lien de paiement');

    fireEvent.click(screen.getByRole('button', { name: 'Créer un autre lien' }));
    expect(screen.queryByDisplayValue(URL_SECRETE)).not.toBeInTheDocument();
    // Le mode choisi (copie) est conservé : le gestionnaire peut enchaîner un second lien.
    expect(screen.getByRole('button', { name: 'Créer le lien' })).toBeInTheDocument();
  });

  it('affiche l’erreur du serveur quand la création est refusée', async () => {
    createChargeCallPaymentLink.mockRejectedValue({
      response: { data: { message: 'Le paiement en ligne n’est pas configuré pour cette copropriété.' } }
    });
    renderModal();

    fireEvent.click(await screen.findByRole('button', { name: 'Envoyer le lien' }));
    expect(
      await screen.findByText('Le paiement en ligne n’est pas configuré pour cette copropriété.')
    ).toBeInTheDocument();
  });
});

describe('ChargeCallPaymentLinkModal — envoyer le lien', () => {
  it('envoie par défaut au copropriétaire et confirme le canal', async () => {
    createChargeCallPaymentLink.mockResolvedValue({
      sent: true,
      channel: 'WHATSAPP',
      linkId: 'lk-9',
      expiresAt: '2026-10-23T08:00:00.000Z',
      amountDue: 100000,
      currency: 'XOF'
    });
    renderModal();

    fireEvent.click(await screen.findByRole('button', { name: 'Envoyer le lien' }));

    await waitFor(() =>
      expect(createChargeCallPaymentLink).toHaveBeenCalledWith('t1', 's1', 'cc-1', { delivery: 'SEND', ttlDays: 7 })
    );
    expect(await screen.findByText('Lien de paiement envoyé par WhatsApp.')).toBeInTheDocument();
    await waitFor(() => expect(listChargeCallPaymentLinks).toHaveBeenCalledTimes(2));
  });

  it.each([
    ['NO_ELIGIBLE_CHANNEL', /Aucun canal éligible/],
    ['EVENT_DISABLED', /désactivé dans la configuration de l'agence/],
    ['SEND_FAILED', /L'envoi a échoué/],
    ['RECIPIENT_NOT_FOUND', /Fiche du copropriétaire introuvable/]
  ])('explique pourquoi rien n’est parti (%s) sans recharger la liste', async (reason, expected) => {
    createChargeCallPaymentLink.mockResolvedValue({ sent: false, reason });
    renderModal();

    fireEvent.click(await screen.findByRole('button', { name: 'Envoyer le lien' }));
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(listChargeCallPaymentLinks).toHaveBeenCalledTimes(1);
  });
});

describe('ChargeCallPaymentLinkModal — révoquer', () => {
  it('révoque un lien actif après confirmation puis recharge la liste', async () => {
    listChargeCallPaymentLinks.mockResolvedValueOnce([link({ id: 'lk-1' })]).mockResolvedValue([]);
    revokeChargeCallPaymentLink.mockResolvedValue({ revoked: true });
    renderModal();

    const trigger = await screen.findByRole('button', { name: 'Révoquer' });
    fireEvent.click(trigger);
    // Une seule confirmation, ancrée (bureau) ou en feuille basse (mobile) : le dernier « Révoquer » la valide.
    const buttons = await screen.findAllByRole('button', { name: 'Révoquer' });
    expect(revokeChargeCallPaymentLink).not.toHaveBeenCalled();
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(revokeChargeCallPaymentLink).toHaveBeenCalledWith('t1', 's1', 'cc-1', 'lk-1'));
    expect(await screen.findByText('Aucun lien actif.')).toBeInTheDocument();
  });

  it('ne propose pas de révoquer un lien expiré ou déjà révoqué', async () => {
    listChargeCallPaymentLinks.mockResolvedValue([
      link({ id: 'lk-expire', status: 'EXPIRED' }),
      link({ id: 'lk-revoque', status: 'REVOKED' })
    ]);
    renderModal();

    fireEvent.click(await screen.findByRole('switch'));
    await screen.findByText('Expiré');
    expect(screen.queryByRole('button', { name: 'Révoquer' })).not.toBeInTheDocument();
  });
});

describe('ChargeCallPaymentLinkModal — lecture seule (SYNDIC_VIEW)', () => {
  it('liste les liens mais ne propose ni création, ni envoi, ni révocation', async () => {
    listChargeCallPaymentLinks.mockResolvedValue([link()]);
    renderModal(false);

    expect(await screen.findByText('Actif')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText('Vous pouvez consulter les liens de cet appel, mais pas en créer ni en révoquer.')
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Envoyer le lien' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Créer le lien' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Révoquer' })).not.toBeInTheDocument();
  });
});

describe('ChargeCallPaymentLinkModal — fermeture', () => {
  it('appelle onClose avec « Fermer »', async () => {
    const { onClose } = renderModal();
    fireEvent.click(await screen.findByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ChargeCallPaymentLinkModal — changement d’appel', () => {
  it('efface l’URL affichée quand la fenêtre passe à un autre appel', async () => {
    createChargeCallPaymentLink.mockResolvedValue({
      linkId: 'lk-9',
      url: URL_SECRETE,
      expiresAt: '2026-10-23T08:00:00.000Z',
      amountDue: 100000,
      currency: 'XOF'
    });
    const onClose = vi.fn();
    const { rerender } = render(
      <AntApp>
        <ChargeCallPaymentLinkModal tenantId="t1" syndicId="s1" charge={CHARGE} open canEdit onClose={onClose} />
      </AntApp>
    );

    fireEvent.click(await screen.findByLabelText('Copier le lien'));
    fireEvent.click(screen.getByRole('button', { name: 'Créer le lien' }));
    await screen.findByDisplayValue(URL_SECRETE);

    rerender(
      <AntApp>
        <ChargeCallPaymentLinkModal
          tenantId="t1"
          syndicId="s1"
          charge={{ id: 'cc-2', period: '2026-T3' }}
          open
          canEdit
          onClose={onClose}
        />
      </AntApp>
    );

    await waitFor(() => expect(screen.queryByDisplayValue(URL_SECRETE)).not.toBeInTheDocument());
    expect(listChargeCallPaymentLinks).toHaveBeenLastCalledWith('t1', 's1', 'cc-2');
  });
});
