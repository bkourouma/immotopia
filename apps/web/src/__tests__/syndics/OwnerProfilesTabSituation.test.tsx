import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OwnerProfilesTab } from '../../components/syndics/profiles/OwnerProfilesTab';
import type { LotOwnerProfile } from '../../types/syndic-types';

/**
 * Situation d'un profil propriétaire : même règle que l'API (`isCurrentOwnerProfile`) — un profil dont le début est
 * dans le futur (vente en cours) n'est pas « Actuel » : il ne compte ni dans les parts ni dans le propriétaire du lot.
 */

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

function profile(overrides: Partial<LotOwnerProfile> & { id: string }): LotOwnerProfile {
  return {
    lotId: 'lot-1',
    contactId: `contact-${overrides.id}`,
    ownershipPercentage: 100,
    ownedSince: iso(-400),
    ownedUntil: null,
    isActive: true,
    portalAccessEnabled: false,
    contact: { id: `contact-${overrides.id}`, firstName: 'Nom', lastName: overrides.id },
    ...overrides
  } as unknown as LotOwnerProfile;
}

describe('OwnerProfilesTab : situation du profil', () => {
  it('distingue actuel, à venir et ancien', () => {
    render(
      <MemoryRouter>
        <OwnerProfilesTab
          items={[
            profile({ id: 'actuel' }),
            profile({ id: 'futur', ownedSince: iso(30) }),
            profile({ id: 'termine', ownedUntil: iso(-10) }),
            profile({ id: 'inactif', isActive: false })
          ]}
          incompleteShares={[]}
          loading={false}
          lots={[]}
          lotsById={{}}
          propertiesByInternalReference={{}}
          invitingProfileId={null}
          revokingProfileId={null}
          onInvite={() => undefined}
          onRevoke={() => undefined}
        />
      </MemoryRouter>
    );

    const rowOf = (name: string) => screen.getByText(`Nom ${name}`).closest('tr') as HTMLElement;
    expect(rowOf('actuel').textContent).toContain('Actuel');
    expect(rowOf('futur').textContent).toContain('À venir');
    expect(rowOf('futur').textContent).not.toContain('Actuel');
    expect(rowOf('termine').textContent).toContain('Ancien');
    expect(rowOf('inactif').textContent).toContain('Ancien');
  });
});
