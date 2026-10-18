import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LiveLotsTable } from '../../components/syndics/live/LiveLotsTable';
import type { LiveLotRow } from '../../types/syndic-live-types';

const lots: LiveLotRow[] = [
  {
    lotId: 'l1',
    lotNumber: 'A1',
    generalShares: 100,
    voters: [{ contactId: 'c1', name: 'Awa Traoré' }],
    attendance: null,
    online: false
  },
  {
    lotId: 'l2',
    lotNumber: 'B2',
    generalShares: 100,
    voters: [{ contactId: 'c2', name: 'Ibrahim Koné' }],
    attendance: null,
    online: false
  }
];
const contacts = [
  { contactId: 'c1', name: 'Awa Traoré' },
  { contactId: 'c2', name: 'Ibrahim Koné' },
  { contactId: 'c9', name: 'Moussa Sylla' }
];

function mount(onSetLot = vi.fn()) {
  render(
    <LiveLotsTable
      lots={lots}
      contacts={contacts}
      proxyHolders={{ c1: { contactId: 'c9', name: 'Moussa Sylla' } }}
      readOnly={false}
      busy={false}
      onSetLot={onSetLot}
      onBulk={vi.fn()}
    />
  );
  return onSetLot;
}

describe('LiveLotsTable - procuration', () => {
  it('« Représenté » en un clic envoie le mandataire de la procuration', async () => {
    const onSetLot = mount();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Émargement du lot A1' }));
    fireEvent.click(await screen.findByTitle('Représenté'));
    expect(onSetLot).toHaveBeenCalledWith('l1', {
      status: 'REPRESENTED',
      mode: 'IN_PERSON',
      representedByContactId: 'c9'
    });
  });

  it('sans procuration, « Représenté » reste indisponible (choix via « Représenté par… »)', async () => {
    const onSetLot = mount();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Émargement du lot B2' }));
    const option = await screen.findByTitle('Représenté');
    expect(option.className).toContain('ant-select-item-option-disabled');
    fireEvent.click(option);
    expect(onSetLot).not.toHaveBeenCalled();
  });
});
