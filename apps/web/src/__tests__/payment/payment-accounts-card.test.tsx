import React from 'react';
import i18next from 'i18next';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PaymentAccountsCard } from '../../components/payment/PaymentAccountsCard';
import type { ReceivingAccountPublic } from '../../services/receiving-account-service';

/**
 * Carte « Payer l'agence » (spec 048, lot Q) : affichage, absence de compte,
 * plusieurs comptes, copie de l'alias, motif suggéré, image du QR chargée par
 * la route authentifiée (jamais par un chemin /uploads), rendu en arabe.
 */

const fetchReceivingAccountQr = vi.fn();
vi.mock('../../services/receiving-account-service', () => ({
  fetchReceivingAccountQr: (...a: unknown[]) => fetchReceivingAccountQr(...a)
}));

const success = vi.fn();
const error = vi.fn();
vi.mock('../../lib/feedback', async () => {
  const actual = await vi.importActual<typeof import('../../lib/feedback')>('../../lib/feedback');
  return {
    ...actual,
    feedback: { ...actual.feedback, success: (m: string) => success(m), error: (m: string) => error(m) }
  };
});

const ALIAS = '341c3e1b-8f1a-4c7e-9d2a-0b6f5a1c9e77';

function account(overrides: Partial<ReceivingAccountPublic> = {}): ReceivingAccountPublic {
  return {
    id: 'a1',
    institution: 'Wave',
    scannableWith: 'Application Wave',
    alias: ALIAS,
    holderName: 'Agence Soleil',
    instructions: null,
    hasQr: false,
    qrPath: null,
    ...overrides
  };
}

let writeText: ReturnType<typeof vi.fn>;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  createObjectURL = vi.fn(() => 'blob:qr-1');
  revokeObjectURL = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
});

afterEach(async () => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  await i18next.changeLanguage('fr');
});

describe('PaymentAccountsCard', () => {
  it('affiche établissement, « scannable avec », alias, nom attendu, étapes et avertissements', () => {
    render(<PaymentAccountsCard accounts={[account({ instructions: 'Payer avant le 5' })]} />);
    expect(screen.getByText('Payer l’agence')).toBeInTheDocument();
    expect(screen.getByText('Coordonnées de paiement')).toBeInTheDocument();
    expect(screen.getByText('Wave')).toBeInTheDocument();
    expect(screen.getByText(/Application Wave/)).toBeInTheDocument();
    expect(screen.getByText(ALIAS)).toBeInTheDocument();
    expect(screen.getByText('Agence Soleil')).toBeInTheDocument();
    expect(screen.getByText('Payer avant le 5')).toBeInTheDocument();
    expect(screen.getByText('Comment payer')).toBeInTheDocument();
    expect(screen.getByText('Saisissez vous-même le montant à payer.')).toBeInTheDocument();
    expect(screen.getByText(/irrévocable/)).toBeInTheDocument();
    expect(screen.getByText(/ne payez pas/)).toBeInTheDocument();
    expect(screen.queryByText(/paiement en ligne/i)).not.toBeInTheDocument();
  });

  it("n'affiche rien sans compte", () => {
    const { container } = render(<PaymentAccountsCard accounts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('affiche plusieurs comptes', () => {
    render(
      <PaymentAccountsCard
        accounts={[account(), account({ id: 'a2', institution: 'Orange Money', alias: 'Agence-OM' })]}
      />
    );
    expect(screen.getByText('Wave')).toBeInTheDocument();
    expect(screen.getByText('Orange Money')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Copier l'alias/ })).toHaveLength(2);
  });

  it("copie l'alias", async () => {
    render(<PaymentAccountsCard accounts={[account()]} />);
    fireEvent.click(screen.getByRole('button', { name: "Copier l'alias Wave" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ALIAS));
    await waitFor(() => expect(success).toHaveBeenCalled());
  });

  it('signale une copie impossible sans exception', async () => {
    writeText.mockRejectedValue(new Error('refus'));
    render(<PaymentAccountsCard accounts={[account()]} />);
    fireEvent.click(screen.getByRole('button', { name: "Copier l'alias Wave" }));
    await waitFor(() => expect(error).toHaveBeenCalled());
  });

  it('propose le motif suggéré et le copie', async () => {
    render(<PaymentAccountsCard accounts={[account()]} suggestedReason="Loyer janvier — Appartement 3" />);
    expect(screen.getByText('Loyer janvier — Appartement 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copier le motif de paiement' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Loyer janvier — Appartement 3'));
  });

  it("masque le motif quand l'écran n'en propose pas", () => {
    render(<PaymentAccountsCard accounts={[account()]} />);
    expect(screen.queryByText('Motif suggéré à recopier')).not.toBeInTheDocument();
  });

  it('le bouton de déclaration appelle onDeclare, et disparaît sans callback', () => {
    const onDeclare = vi.fn();
    const { rerender } = render(<PaymentAccountsCard accounts={[account()]} onDeclare={onDeclare} />);
    fireEvent.click(screen.getByRole('button', { name: 'J’ai payé : déclarer mon paiement' }));
    expect(onDeclare).toHaveBeenCalledTimes(1);
    rerender(<PaymentAccountsCard accounts={[account()]} />);
    expect(screen.queryByRole('button', { name: /déclarer mon paiement/ })).not.toBeInTheDocument();
  });

  it('charge le QR par la route authentifiée, l’agrandit, puis révoque l’URL au démontage', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    fetchReceivingAccountQr.mockResolvedValue(blob);
    const { unmount } = render(
      <PaymentAccountsCard
        accounts={[account({ hasQr: true, qrPath: '/api/portal/tenant/receiving-accounts/a1/qr' })]}
      />
    );
    const image = await screen.findByAltText('QR de paiement Wave');
    expect(fetchReceivingAccountQr).toHaveBeenCalledWith('/api/portal/tenant/receiving-accounts/a1/qr');
    expect(image.getAttribute('src')).toBe('blob:qr-1');
    expect(image.getAttribute('src')).not.toContain('/uploads');

    fireEvent.click(screen.getByRole('button', { name: 'Agrandir le QR Wave' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByAltText('QR de paiement Wave').length).toBeGreaterThan(1);

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:qr-1');
  });

  it("n'appelle aucune route d'image pour un compte sans QR", () => {
    render(<PaymentAccountsCard accounts={[account()]} />);
    expect(fetchReceivingAccountQr).not.toHaveBeenCalled();
  });

  it("dit que le QR est indisponible quand la route échoue, l'alias reste affiché", async () => {
    fetchReceivingAccountQr.mockRejectedValue(new Error('404'));
    render(<PaymentAccountsCard accounts={[account({ hasQr: true, qrPath: '/api/x/qr' })]} />);
    expect(await screen.findByText('Le QR ne peut pas être affiché pour le moment.')).toBeInTheDocument();
    expect(screen.getByText(ALIAS)).toBeInTheDocument();
  });

  it("se rend en arabe sans exception et sans marge physique, l'alias restant en LTR", async () => {
    await i18next.changeLanguage('ar');
    const { container } = render(
      <div dir="rtl">
        <PaymentAccountsCard accounts={[account()]} suggestedReason="Loyer" onDeclare={() => undefined} />
      </div>
    );
    expect(screen.getByText(ALIAS)).toHaveAttribute('dir', 'ltr');
    const html = container.innerHTML;
    expect(html).not.toMatch(/margin-left|margin-right|padding-left|padding-right/);
  });
});
