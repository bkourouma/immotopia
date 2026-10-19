import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LanguageSwitcher } from '../../components/shell/LanguageSwitcher';

const setLanguage = vi.fn().mockResolvedValue(undefined);
let isSwitching = false;

vi.mock('../useLanguage', () => ({
  useLanguage: () => ({ language: 'fr', setLanguage, isSwitching })
}));
vi.mock('../index', async importOriginal => ({
  ...(await importOriginal<typeof import('../index')>()),
  loadLanguage: vi.fn().mockResolvedValue(undefined)
}));

describe('LanguageSwitcher', () => {
  it('un choix passe en explicite à setLanguage', async () => {
    isSwitching = false;
    render(<LanguageSwitcher />);
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(await screen.findByText('العربية'));
    expect(setLanguage).toHaveBeenCalledWith('ar', { explicit: true });
  });

  it('pendant isSwitching, les entrées du menu sont désactivées', async () => {
    // Menu ouvert d'abord (un bouton en `loading` ne s'ouvre plus), puis la
    // bascule démarre pendant qu'il est ouvert.
    isSwitching = false;
    setLanguage.mockClear();
    const { rerender } = render(<LanguageSwitcher />);
    await userEvent.click(screen.getByRole('button'));
    await screen.findByText('English');
    isSwitching = true;
    rerender(<LanguageSwitcher />);
    const item = (await screen.findByText('English')).closest('li');
    await waitFor(() => expect(item).toHaveClass('ant-dropdown-menu-item-disabled'));
    await userEvent.click(screen.getByText('English'));
    expect(setLanguage).not.toHaveBeenCalled();
  });
});
