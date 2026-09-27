import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CoOwnerInvitationResult } from '../../components/syndics/CoOwnerInvitationResult';
import type { CoOwnerPortalInvitation } from '../../types/syndic-types';

/**
 * Résultat de « Inviter au portail », rendu avec le vrai Ant Design : le lien
 * se lit et se copie que l'e-mail soit parti ou non (modèle
 * `<TenantCreatedResult>`).
 */
function invitation(overrides: Partial<CoOwnerPortalInvitation> = {}): CoOwnerPortalInvitation {
  return {
    email: 'awa@example.com',
    contactName: 'Awa Konan',
    accountStatus: 'NEW_ACCOUNT',
    invitationUrl: 'http://localhost:3000/reset-password?token=abc',
    expiresAt: '2026-10-04T00:00:00.000Z',
    emailSent: false,
    openedLots: 2,
    ...overrides
  };
}

describe('<CoOwnerInvitationResult>', () => {
  it("e-mail non parti : l'avertissement, le lien et « Copier »", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CoOwnerInvitationResult invitation={invitation()} />);

    expect(
      screen.getByText("L'e-mail n'a pas pu être envoyé — copiez le lien et transmettez-le vous-même.")
    ).toBeInTheDocument();
    expect(screen.getByText("Lien d'invitation")).toBeInTheDocument();
    expect(screen.getByDisplayValue('http://localhost:3000/reset-password?token=abc')).toBeInTheDocument();
    expect(screen.getByText(/valable jusqu’au 04\/10\/2026/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Copier/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://localhost:3000/reset-password?token=abc'));
  });

  it('e-mail parti : le lien reste affiché', () => {
    render(<CoOwnerInvitationResult invitation={invitation({ emailSent: true })} />);

    expect(screen.getByText("E-mail d'invitation envoyé.")).toBeInTheDocument();
    expect(screen.getByDisplayValue('http://localhost:3000/reset-password?token=abc')).toBeInTheDocument();
  });

  it('compte existant : un lien de connexion, jamais présenté comme une activation', () => {
    render(
      <CoOwnerInvitationResult
        invitation={invitation({
          accountStatus: 'EXISTING_ACCOUNT',
          invitationUrl: 'http://localhost:3000/login?redirect=%2Fcopropriete',
          expiresAt: null,
          emailSent: true
        })}
      />
    );

    expect(screen.getByText('Lien de connexion')).toBeInTheDocument();
    expect(screen.getByText('Compte existant')).toBeInTheDocument();
    expect(screen.queryByText(/valable jusqu/)).not.toBeInTheDocument();
  });
});
