import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DevAccountsSelect } from '../../dev/DevAccountsSelect';
import { DEV_TENANT_ACCOUNTS } from '../../dev/dev-accounts';

/**
 * Menu de comptes de test de l'écran de connexion (staging) : un groupe par
 * agence, choisir remplit via `onPick`, effacer appelle `onClear`.
 */

function openMenu(): HTMLElement {
  const select = screen.getByTestId('dev-accounts-select');
  fireEvent.mouseDown(within(select).getByRole('combobox'));
  return select;
}

describe('DevAccountsSelect', () => {
  it('liste les douze groupes de packs, puis les comptes historiques', () => {
    render(<DevAccountsSelect onPick={vi.fn()} onClear={vi.fn()} />);
    openMenu();

    const groupLabels = Array.from(document.querySelectorAll('.ant-select-item-group')).map(el => el.textContent);
    expect(groupLabels.slice(0, 12)).toEqual(
      [
        'Pack Agence',
        'Pack Syndic',
        'Pack Promoteur',
        'Pack Opérateur intégré',
        'Pack Patrimoine Essentiel',
        'Pack Patrimoine Pro'
      ].flatMap(label => [`${label} · 6 mois`, `${label} · 3 ans`])
    );
    expect(groupLabels).toHaveLength(DEV_TENANT_ACCOUNTS.length);
    expect(screen.getByText('Admin Test Syndic (6 mois)')).toBeInTheDocument();
    expect(screen.getByText('Super Administrator')).toBeInTheDocument();
  });

  it('affiche le texte d’invite et un nom accessible', () => {
    render(<DevAccountsSelect onPick={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText('Choisir un compte de test')).toBeInTheDocument();
    expect(screen.getByLabelText('Choisir un compte de test')).toBeInTheDocument();
  });

  it('choisir un compte appelle onPick avec son e-mail et son mot de passe', () => {
    const onPick = vi.fn();
    render(<DevAccountsSelect onPick={onPick} onClear={vi.fn()} />);
    openMenu();

    fireEvent.click(screen.getByText('Admin Test Promoteur (3 ans)'));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'promoteur-3ans@packs.immotopia.test', password: 'PackTest@2026' })
    );
  });

  it('filtre par libellé de pack et par adresse', () => {
    render(<DevAccountsSelect onPick={vi.fn()} onClear={vi.fn()} />);
    const select = openMenu();
    const input = within(select).getByRole('combobox');

    fireEvent.change(input, { target: { value: 'patrimoine pro' } });
    expect(screen.getByText('Admin Test Patrimoine Pro (6 mois)')).toBeInTheDocument();
    expect(screen.getByText('Admin Test Patrimoine Pro (3 ans)')).toBeInTheDocument();
    expect(screen.queryByText('Admin Test Syndic (6 mois)')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'syndic-3ans@packs' } });
    expect(screen.getByText('Admin Test Syndic (3 ans)')).toBeInTheDocument();
    expect(screen.queryByText('Admin Test Syndic (6 mois)')).not.toBeInTheDocument();
  });

  it('effacer le choix appelle onClear', () => {
    const onClear = vi.fn();
    render(<DevAccountsSelect activeEmail="syndic@packs.immotopia.test" onPick={vi.fn()} onClear={onClear} />);

    const select = screen.getByTestId('dev-accounts-select');
    expect(within(select).getByText('Admin Test Syndic (6 mois)')).toBeInTheDocument();

    const clear = select.querySelector('.ant-select-clear');
    expect(clear).not.toBeNull();
    fireEvent.mouseDown(clear as Element);
    fireEvent.click(clear as Element);

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
