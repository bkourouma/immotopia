import React from 'react';
import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Aides communes des tests de la déclaration de paiement du portail locataire
 * (spec 049). Les `vi.mock` restent dans chaque fichier de test (hissés par Vitest).
 */

export const DELAI = { timeout: 8000 };

export const DISPONIBILITE = {
  enabled: true,
  available: true,
  receivingNumbers: [{ id: 'rn1', operator: 'ORANGE', phone: '+2250707070707', label: null }],
  proofRequired: false,
  aiPrefillAvailable: false,
  maxAmount: 5000000,
  instructions: null
};

export function avecClient(children: React.ReactNode, client?: QueryClient): React.ReactElement {
  const qc = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** Choisit « Orange Money » comme opérateur utilisé et saisit une référence valide. */
export async function remplirOperateurEtReference(user: UserEvent, reference = 'MP260911.1234.A12345') {
  await user.click(await screen.findByRole('combobox', { name: /Opérateur utilisé/ }, DELAI));
  const options = await screen.findAllByText('Orange Money', {}, DELAI);
  await user.click(options[options.length - 1]);
  await user.type(screen.getByLabelText(/Référence de la transaction/), reference);
}
