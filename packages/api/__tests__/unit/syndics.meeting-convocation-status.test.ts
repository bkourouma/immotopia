/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Etat d'envoi de la convocation d'une AG : lu dans le journal par
 * copropriétaire (NotificationMarker), filtre agence.
 */
import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import { hasMeetingConvocationBeenSent } from '../../src/lib/syndics/meeting-convocation-status';
import { MARKER_KIND } from '../../src/lib/notification-markers';

describe('hasMeetingConvocationBeenSent', () => {
  beforeEach(() => mockPrisma.reset());

  it('false tant qu aucune convocation n est journalisee, true ensuite', async () => {
    expect(await hasMeetingConvocationBeenSent('tenant-a', 'meeting-1')).toBe(false);
    mockPrisma.notificationMarker.rows.push({
      id: 'marker-1',
      tenantId: 'tenant-a',
      kind: MARKER_KIND.convocationDelivery,
      entityType: 'GeneralMeeting',
      entityId: 'meeting-1',
      payload: { contactId: 'c1', status: 'SENT' }
    });
    expect(await hasMeetingConvocationBeenSent('tenant-a', 'meeting-1')).toBe(true);
  });

  it('ignore une autre AG, un autre type de marqueur et une autre agence', async () => {
    mockPrisma.notificationMarker.rows.push(
      {
        id: 'm-other-meeting',
        tenantId: 'tenant-a',
        kind: MARKER_KIND.convocationDelivery,
        entityType: 'GeneralMeeting',
        entityId: 'meeting-2'
      },
      { id: 'm-other-kind', tenantId: 'tenant-a', kind: 'OTHER', entityType: 'GeneralMeeting', entityId: 'meeting-1' },
      {
        id: 'm-other-tenant',
        tenantId: 'tenant-b',
        kind: MARKER_KIND.convocationDelivery,
        entityType: 'GeneralMeeting',
        entityId: 'meeting-1'
      }
    );
    expect(await hasMeetingConvocationBeenSent('tenant-a', 'meeting-1')).toBe(false);
  });
});
