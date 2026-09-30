/* eslint-disable @typescript-eslint/no-explicit-any */
import { getLeaseById } from '../../src/services/rental-lease-service';
import { findDiskPathLeaks } from '../helpers/disk-path-leaks';

/**
 * Le détail d'un bail embarque ses documents : ils ne portent ni chemin disque
 * ni clé de stockage (`file_path`, `file_url`, `file_key`, hachages), seulement
 * `downloadable` / `download_url` (BUG-2026-09-30-038).
 */

let leaseFixture: any = null;

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalLease: { findFirst: jest.fn(async () => leaseFixture) },
    crmContact: { findMany: jest.fn(async () => []) }
  }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: jest.fn()
}));
jest.mock('../../src/services/property-status-service', () => ({ updatePropertyStatus: jest.fn() }));
jest.mock('../../src/services/tenant-service', () => ({ getTenantById: jest.fn() }));

describe('getLeaseById — documents du bail', () => {
  it('ne renvoie aucun chemin disque ni clé de stockage', async () => {
    leaseFixture = {
      id: 'lease-1',
      primaryRenter: null,
      ownerClient: null,
      documents: [
        {
          id: 'doc-1',
          tenant_id: 'tenant-1',
          status: 'GENERATED',
          document_number: '2026-001',
          file_path: 'D:\\APP\\Immobillier\\uploads\\rental\\doc-1.pdf',
          file_url: '/uploads/rental/tenant-1/doc-1.pdf',
          file_key: 'rental/tenant-1/doc-1.pdf',
          file_hash: 'abc'
        }
      ]
    };

    const lease: any = await getLeaseById('tenant-1', 'lease-1');

    expect(findDiskPathLeaks(lease)).toEqual([]);
    expect(lease.documents[0]).toMatchObject({
      id: 'doc-1',
      document_number: '2026-001',
      downloadable: true,
      download_url: '/api/tenants/tenant-1/documents/doc-1/download'
    });
    for (const key of ['file_path', 'file_url', 'file_key', 'file_hash']) {
      expect(lease.documents[0]).not.toHaveProperty(key);
    }
  });
});
