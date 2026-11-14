import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelpContext, INERT_HELP } from '../../help/help-context';
import { HelpButton } from '../../help/components/HelpButton';

vi.mock('../../help/registry', () => ({
  useHelpEntry: () => ({
    entry: { id: 'locatif.baux.liste', kind: 'page', title: 'Les baux', summary: 'x' },
    status: 'ready',
    fallback: false
  }),
  resolvePageHelpId: () => null,
  getHelpEntry: async () => null
}));

describe('HelpButton : clavier', () => {
  it.each([['{Enter}'], [' ']])('%s ne remonte pas au parent et ouvre le panneau', async keys => {
    const openHelp = vi.fn();
    const parentKeyDown = vi.fn();
    const seen: boolean[] = [];
    const { container } = render(
      <HelpContext.Provider value={{ ...INERT_HELP, available: true, openHelp }}>
        <div onKeyDown={parentKeyDown}>
          <HelpButton helpId="locatif.baux.liste" />
        </div>
      </HelpContext.Provider>
    );
    const button = screen.getByRole('button');
    // Sur la racine React, en phase bubble, posé après React : son écouteur passe en dernier (stopPropagation
    // n'empêche pas les autres écouteurs du même noeud), donc defaultPrevented est définitif. Sur document,
    // l'événement n'arrive pas : React l'arrête à la racine.
    const onRootKeyDown = (e: KeyboardEvent) => seen.push(e.defaultPrevented);
    container.addEventListener('keydown', onRootKeyDown);
    button.focus();
    const user = userEvent.setup();
    await user.keyboard(keys);
    container.removeEventListener('keydown', onRootKeyDown);
    expect(parentKeyDown).not.toHaveBeenCalled();
    expect(seen).toEqual([false]);
    expect(openHelp).toHaveBeenCalledWith('locatif.baux.liste');
  });
});
