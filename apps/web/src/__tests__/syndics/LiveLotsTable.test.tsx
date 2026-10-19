import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      busyLotIds={new Set()}
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

describe('LiveLotsTable - mandataires et lignes occupées', () => {
  it('« Représenté par… » exclut les votants du lot (propriétaire et co-indivisaires)', async () => {
    const shared: LiveLotRow[] = [
      {
        lotId: 'l1',
        lotNumber: 'A1',
        generalShares: 100,
        voters: [
          { contactId: 'c1', name: 'Awa Traoré' },
          { contactId: 'c2', name: 'Ibrahim Koné' }
        ],
        attendance: null,
        online: false
      }
    ];
    render(<LiveLotsTable lots={shared} contacts={contacts} readOnly={false} onSetLot={vi.fn()} onBulk={vi.fn()} />);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Émargement du lot A1' }));
    await screen.findByTitle('Moussa Sylla');
    expect(screen.queryByTitle('Awa Traoré')).toBeNull();
    expect(screen.queryByTitle('Ibrahim Koné')).toBeNull();
  });

  it('propose les autres copropriétaires aux lots voisins', async () => {
    mount();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Émargement du lot B2' }));
    await screen.findByTitle('Awa Traoré');
    expect(screen.queryByTitle('Ibrahim Koné')).toBeNull();
  });

  it('ne désactive que la ligne du lot occupé', () => {
    render(
      <LiveLotsTable
        lots={lots}
        contacts={contacts}
        readOnly={false}
        busyLotIds={new Set(['l1'])}
        onSetLot={vi.fn()}
        onBulk={vi.fn()}
      />
    );
    expect((screen.getByRole('combobox', { name: 'Émargement du lot A1' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('combobox', { name: 'Émargement du lot B2' }) as HTMLInputElement).disabled).toBe(false);
  });

  it('signale l’ouverture et la fermeture d’un menu d’émargement', async () => {
    const onMenuOpenChange = vi.fn();
    render(
      <LiveLotsTable
        lots={lots}
        contacts={contacts}
        readOnly={false}
        onMenuOpenChange={onMenuOpenChange}
        onSetLot={vi.fn()}
        onBulk={vi.fn()}
      />
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Émargement du lot A1' }));
    await screen.findByTitle('Présent en salle');
    expect(onMenuOpenChange).toHaveBeenCalledWith(true);
    fireEvent.click(await screen.findByTitle('Présent en salle'));
    await waitFor(() => expect(onMenuOpenChange).toHaveBeenLastCalledWith(false));
  });
});
