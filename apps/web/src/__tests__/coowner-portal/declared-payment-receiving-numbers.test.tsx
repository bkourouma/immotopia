import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ReceivingNumbersCard } from '../../components/coowner-portal/declared-payment/ReceivingNumbersCard';
import type { ReceivingNumber } from '../../services/coowner-portal-service';

/**
 * Carte des numéros de réception mobile money (spec 047, étape 1) : rendu,
 * copie du numéro national et de la consigne, carte vide, repli sans exception.
 */

const success = vi.fn();
const error = vi.fn();

vi.mock('../../lib/feedback', async () => {
  const actual = await vi.importActual<typeof import('../../lib/feedback')>('../../lib/feedback');
  return {
    ...actual,
    feedback: {
      ...actual.feedback,
      success: (m: string) => success(m),
      error: (m: string) => error(m)
    }
  };
});

function number(overrides: Partial<ReceivingNumber> = {}): ReceivingNumber {
  return {
    id: 'n1',
    operator: 'ORANGE',
    phoneNumber: '+2250707070707',
    holderName: 'Syndic Acacias',
    label: null,
    isActive: true,
    sortOrder: 0,
    ...overrides
  };
}

const two = () => [
  number(),
  number({
    id: 'n2',
    operator: 'WAVE',
    phoneNumber: '+2250505050505',
    holderName: 'Awa Koné',
    label: 'Caisse',
    sortOrder: 1
  })
];

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
});

describe('ReceivingNumbersCard', () => {
  it('affiche opérateur, numéro formaté et titulaire de chaque numéro actif', () => {
    render(<ReceivingNumbersCard numbers={two()} payerInstructions={null} />);
    expect(screen.getByText('Orange Money')).toBeInTheDocument();
    expect(screen.getByText('Wave')).toBeInTheDocument();
    expect(screen.getByText('+225 07 07 07 07 07')).toBeInTheDocument();
    expect(screen.getByText('+225 05 05 05 05 05')).toBeInTheDocument();
    expect(screen.getByText(/Syndic Acacias/)).toBeInTheDocument();
    expect(screen.getByText(/Awa Koné/)).toBeInTheDocument();
    expect(screen.queryByText('Consigne du syndic')).not.toBeInTheDocument();
  });

  it('ignore les numéros inactifs', () => {
    render(
      <ReceivingNumbersCard
        numbers={[number(), number({ id: 'n3', phoneNumber: '+2250101010101', isActive: false })]}
        payerInstructions={null}
      />
    );
    expect(screen.queryByText('+225 01 01 01 01 01')).not.toBeInTheDocument();
  });

  it('copie le numéro national à 10 chiffres', async () => {
    render(<ReceivingNumbersCard numbers={[number()]} payerInstructions={null} />);
    fireEvent.click(screen.getByRole('button', { name: /Copier le numéro/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('0707070707'));
    expect(success).toHaveBeenCalledWith('Numéro copié');
  });

  it('affiche et copie la consigne du syndic', async () => {
    render(<ReceivingNumbersCard numbers={[number()]} payerInstructions={'Mettre le lot en motif\nMerci'} />);
    expect(screen.getByText('Consigne du syndic')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Copier la consigne/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Mettre le lot en motif\nMerci'));
  });

  it('ne rend rien sans numéro actif', () => {
    const { container } = render(
      <ReceivingNumbersCard numbers={[number({ isActive: false })]} payerInstructions="x" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('ne lève pas si le presse-papiers échoue et affiche le repli', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(<ReceivingNumbersCard numbers={[number()]} payerInstructions={null} />);
    fireEvent.click(screen.getByRole('button', { name: /Copier le numéro/ }));
    await waitFor(() => expect(error).toHaveBeenCalledWith('Copie impossible, recopiez le numéro à la main.'));
    expect(success).not.toHaveBeenCalled();
  });

  it('ne lève pas si le presse-papiers est indisponible et rend le pied de carte', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<ReceivingNumbersCard numbers={[number()]} payerInstructions={null} extra={<button>Pied</button>} />);
    expect(screen.getByRole('button', { name: 'Pied' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Copier le numéro/ }));
    await waitFor(() => expect(error).toHaveBeenCalled());
  });
});
