/**
 * Votant d'un lot à la date de l'AG : `voters` est calculé côté API (seule
 * source), pas recalculé côté web. Ces tests couvrent `voterNames` et
 * `proxyForLot` (lot vendu depuis l'AG) ainsi que leur rendu dans
 * `MeetingAgenda` : le sélecteur « Lot votant » et les étiquettes de vote
 * doivent montrer l'ancien propriétaire (votant à la date de l'AG), pas
 * l'actuel.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { proxyForLot, voterNames } from '../../components/syndics/meeting-governance';
import { MeetingAgenda } from '../../components/syndics/MeetingAgenda';
import { MeetingLot, MeetingProxy, MeetingResolution } from '../../types/syndic-types';

vi.mock('antd', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const passthrough =
    (Tag: keyof JSX.IntrinsicElements = 'div') =>
    ({ children }: any) =>
      React.createElement(Tag, null, children);
  return {
    Button: ({ children, onClick, disabled }: any) => (
      <button type="button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
    Card: passthrough(),
    Empty: ({ description }: any) => <div>{description}</div>,
    Select: ({ options = [], value, onChange, 'aria-label': ariaLabel }: any) => (
      <select aria-label={ariaLabel} value={value} onChange={event => onChange?.(event.target.value)}>
        {options.map((option: any) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
    Space: passthrough(),
    Tag: passthrough('span'),
    Typography: {
      Title: passthrough('h1'),
      Paragraph: passthrough('p'),
      Text: passthrough('span')
    }
  };
});

const oldOwner = { id: 'c-old', firstName: 'Awa', lastName: 'Kone', legalName: null, email: null };
const newOwner = { id: 'c-new', firstName: 'Zeynab', lastName: 'Toure', legalName: null, email: null };

describe('voterNames', () => {
  it('joint les indivisaires par « et », le plus gros détenteur d abord', () => {
    const lot = {
      id: 'lot-1',
      voters: [
        { contactId: 'c1', firstName: 'Chantal', lastName: 'Yao', ownershipPercentage: 60 },
        { contactId: 'c2', firstName: 'Didier', lastName: 'Kouassi', ownershipPercentage: 40 }
      ]
    } as unknown as MeetingLot;

    expect(voterNames(lot)).toBe('Chantal Yao et Didier Kouassi');
  });

  it('se replie sur owner quand voters est absent (ancienne API)', () => {
    const lot = { id: 'lot-1', owner: oldOwner } as unknown as MeetingLot;
    expect(voterNames(lot)).toBe('Awa Kone');
  });

  it('se replie sur owner quand voters est vide (aucun votant connu à la date de l AG)', () => {
    const lot = { id: 'lot-1', voters: [], owner: oldOwner } as unknown as MeetingLot;
    expect(voterNames(lot)).toBe('Awa Kone');
  });

  it('affiche « Sans propriétaire » sans voters ni owner', () => {
    const lot = { id: 'lot-1' } as unknown as MeetingLot;
    expect(voterNames(lot)).toBe('Sans propriétaire');
  });
});

describe('proxyForLot', () => {
  it('garde le pouvoir donné par l ancien propriétaire d un lot vendu depuis l AG', () => {
    // Le lot appartient aujourd'hui à newOwner, mais à la date de l'AG le
    // votant était oldOwner : le pouvoir qu'il avait donné doit rester attaché au lot.
    const lot = {
      id: 'lot-1',
      owner: newOwner,
      ownerContactId: newOwner.id,
      voters: [{ contactId: oldOwner.id, firstName: 'Awa', lastName: 'Kone', ownershipPercentage: 100 }]
    } as unknown as MeetingLot;
    const proxies: MeetingProxy[] = [
      {
        id: 'proxy-1',
        meetingId: 'meeting-1',
        grantorContactId: oldOwner.id,
        representativeContactId: 'c-rep',
        createdAt: ''
      }
    ];

    const proxy = proxyForLot(lot, proxies);
    expect(proxy?.id).toBe('proxy-1');
  });

  it('ignore un pouvoir donné par le propriétaire actuel si ce n était pas le votant à la date de l AG', () => {
    const lot = {
      id: 'lot-1',
      owner: newOwner,
      ownerContactId: newOwner.id,
      voters: [{ contactId: oldOwner.id, firstName: 'Awa', lastName: 'Kone', ownershipPercentage: 100 }]
    } as unknown as MeetingLot;
    const proxies: MeetingProxy[] = [
      {
        id: 'proxy-new',
        meetingId: 'meeting-1',
        grantorContactId: newOwner.id,
        representativeContactId: 'c-rep',
        createdAt: ''
      }
    ];

    expect(proxyForLot(lot, proxies)).toBeUndefined();
  });

  it('se replie sur owner quand voters est absent ou vide', () => {
    const lot = { id: 'lot-1', owner: newOwner, ownerContactId: newOwner.id, voters: [] } as unknown as MeetingLot;
    const proxies: MeetingProxy[] = [
      {
        id: 'proxy-new',
        meetingId: 'meeting-1',
        grantorContactId: newOwner.id,
        representativeContactId: 'c-rep',
        createdAt: ''
      }
    ];

    expect(proxyForLot(lot, proxies)?.id).toBe('proxy-new');
  });
});

describe('MeetingAgenda — votant à la date de l AG', () => {
  const lot: MeetingLot = {
    id: 'lot-1',
    syndicateId: 'syndic-1',
    lotNumber: 'A2',
    lotType: 'APARTMENT',
    generalShares: 120,
    ownerContactId: newOwner.id,
    owner: newOwner,
    voters: [{ contactId: oldOwner.id, firstName: 'Awa', lastName: 'Kone', ownershipPercentage: 100 }],
    createdAt: '',
    updatedAt: ''
  } as unknown as MeetingLot;

  const resolution: MeetingResolution = {
    id: 'res-1',
    meetingId: 'meeting-1',
    title: 'Ravalement',
    votesFor: 1,
    votesAgainst: 0,
    votesAbstain: 0,
    sharesFor: 120,
    result: 'APPROVED',
    createdAt: '',
    updatedAt: '',
    votes: [{ id: 'v1', lotId: 'lot-1', vote: 'FOR' }]
  };

  it('montre l ancien propriétaire (votant à la date de l AG), pas l actuel, dans l option du sélecteur', () => {
    render(<MeetingAgenda resolutions={[resolution]} lots={[lot]} onVote={async () => undefined} proxies={[]} />);

    const select = screen.getByRole('combobox', { name: 'Lot votant :' });
    expect(within(select).getByText('A2 · Appartement · 120 tantièmes — Awa Kone')).toBeTruthy();
    expect(within(select).queryByText(/Zeynab Toure/)).toBeNull();
  });

  it('montre l ancien propriétaire dans l étiquette du vote enregistré, pas l actuel', () => {
    render(<MeetingAgenda resolutions={[resolution]} lots={[lot]} onVote={async () => undefined} proxies={[]} />);

    expect(screen.getByText(/A2 · Appartement · 120 tantièmes — Awa Kone : Pour/)).toBeTruthy();
    expect(screen.queryByText(/Zeynab Toure/)).toBeNull();
  });
});
