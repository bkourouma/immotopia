import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Modal } from 'antd';
import { HelpContext, INERT_HELP, type HelpContextValue } from '../../help/help-context';
import HelpDrawer from '../../help/components/HelpDrawer';
import { HelpButton } from '../../help/components/HelpButton';
import { HELP_DRAWER_Z_INDEX, HELP_TOUR_Z_INDEX } from '../../help/z-index';

const ENTRY = { id: 'locatif.baux.liste', kind: 'page', title: 'Liste des baux', summary: 'Résumé.' };

vi.mock('../../help/registry', () => ({
  useHelpEntry: (id: string | null | undefined) =>
    id ? { entry: ENTRY, status: 'ready', fallback: false } : { entry: null, status: 'idle', fallback: false },
  currentHelpLanguage: () => 'fr',
  resolvePageHelpId: () => null,
  getHelpEntry: async () => null
}));
vi.mock('../../help/feedback-api', () => ({ sendHelpFeedback: vi.fn(async () => ({ id: 'x' })) }));

function Harness() {
  const [open, setOpen] = useState(false);
  const [helpId, setHelpId] = useState<string | null>(null);
  const value: HelpContextValue = {
    ...INERT_HELP,
    available: true,
    open,
    pageHelpId: helpId,
    openHelp: id => {
      setHelpId(id ?? null);
      setOpen(true);
    },
    closeHelp: () => setOpen(false)
  };
  return (
    <MemoryRouter>
      <HelpContext.Provider value={value}>
        <Modal open title="Modale" footer={null}>
          <HelpButton helpId="locatif.baux.liste" />
        </Modal>
        <HelpDrawer />
      </HelpContext.Provider>
    </MemoryRouter>
  );
}

const zOf = (el: Element | null) => Number.parseInt((el as HTMLElement).style.zIndex, 10);

describe('HelpDrawer : empilement', () => {
  it('le panneau ouvert depuis une modale est au-dessus de la modale', async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: /Aide/ }));
    const drawerRoot = (await screen.findAllByText('Aide')).map(n => n.closest('.ant-drawer')).find(Boolean) ?? null;
    expect(drawerRoot).not.toBeNull();
    const modalRoot =
      document.querySelector('.ant-modal-root .ant-modal-wrap') ?? document.querySelector('.ant-modal-root');
    const modalZ = zOf(modalRoot) || 1000;
    expect(zOf(drawerRoot)).toBe(HELP_DRAWER_Z_INDEX);
    expect(zOf(drawerRoot)).toBeGreaterThan(modalZ);
  });

  it('la visite guidée reste au-dessus du panneau', () => {
    expect(HELP_TOUR_Z_INDEX).toBeGreaterThan(HELP_DRAWER_Z_INDEX);
  });
});
