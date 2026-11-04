/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Réponses des portails locataire et propriétaire : aucun chemin disque.
 *
 * Les réponses qui décrivent un fichier (médias et documents d'un bien,
 * documents locatifs, pièces jointes de maintenance) rendaient la ligne
 * entière : `filePath` / `file_path` (chemin absolu sur le serveur) et
 * l'identifiant de stockage `/uploads/...` d'un fichier privé. Elles passent
 * désormais par un `select` explicite (lib/files/portal-files.ts) : nom, type,
 * taille, date, et `downloadPath` quand une route authentifiée sert le fichier.
 *
 * La base en mémoire (`helpers/fake-prisma.ts`) applique `select` : chaque
 * ligne y porte volontairement des chemins disque et des URL de stockage, qui
 * ressortiraient dans la réponse si un `select` manquait.
 * Le portail copropriétaire est couvert par `syndics.coowner-portal.test.ts`,
 * avec le même contrôle (`helpers/disk-path-leaks.ts`).
 */

import express from 'express';
import request from 'supertest';
import { createFakePrisma } from '../helpers/fake-prisma';
import { findDiskPathLeaks } from '../helpers/disk-path-leaks';

const mockPrisma = createFakePrisma();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const userId = req.headers['x-test-user'];
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }
    req.user = { userId, globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  flushAuditQueue: jest.fn()
}));

// La déclaration de paiement écrit la preuve sur le disque : rien n'est écrit ici.
jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'),
  mkdir: jest.fn(async () => undefined),
  writeFile: jest.fn(async () => undefined),
  unlink: jest.fn(async () => undefined)
}));

jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: jest.fn(async () => ({ enabled: false }))
}));

import tenantPortalRoutes from '../../src/routes/tenant-portal-routes';
import ownerPortalRoutes from '../../src/routes/owner-portal-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.use('/api/portal/tenant', tenantPortalRoutes);
app.use('/api/portal/owner', ownerPortalRoutes);
app.use(errorHandler);

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TENANT_A = 'tenant-a';
const P1 = 'prop-1';
const LEASE = id(11);
const TICKET = id(21);
const USER_AWA = 'user-awa';
const USER_OUMAR = 'user-oumar';

// Des chemins tels que le serveur les stocke : disque Windows, disque Unix,
// identifiants de stockage de fichiers privés.
const DISK = 'D:\\APP\\Immobillier\\uploads';

function seed() {
  mockPrisma.reset();
  // Les portails relisent `User.isActive` (tenant-portal-access.ts, owner-portal-access.ts).
  mockPrisma.user.rows.push({ id: USER_AWA, isActive: true }, { id: USER_OUMAR, isActive: true });
  const ACTIVE = { status: 'ACTIVE' };
  mockPrisma.tenant.rows.push({ id: TENANT_A, status: 'ACTIVE' });
  mockPrisma.tenantClient.rows.push(
    {
      id: 'tc-awa',
      userId: USER_AWA,
      tenantId: TENANT_A,
      clientType: 'RENTER',
      createdAt: new Date('2026-01-01'),
      tenant: ACTIVE,
      user: { email: 'awa@example.com' }
    },
    {
      id: 'tc-oumar',
      userId: USER_OUMAR,
      tenantId: TENANT_A,
      clientType: 'OWNER',
      createdAt: new Date('2026-01-02'),
      tenant: ACTIVE
    }
  );
  mockPrisma.crmContact.rows.push({ id: 'contact-awa', tenantId: TENANT_A, email: 'awa@example.com' });

  const media = {
    id: 'media-1',
    propertyId: P1,
    mediaType: 'PHOTO',
    filePath: `${DISK}\\properties\\${P1}\\salon.jpg`,
    fileUrl: `/uploads/properties/${P1}/salon.jpg`,
    fileName: 'salon.jpg',
    fileSize: 2048,
    mimeType: 'image/jpeg',
    displayOrder: 0,
    isPrimary: true,
    createdAt: new Date()
  };
  const propertyDocument = {
    id: 'pdoc-1',
    propertyId: P1,
    documentType: 'TITLE_DEED',
    filePath: `${DISK}\\properties\\${P1}\\documents\\titre.pdf`,
    fileUrl: `/uploads/properties/${P1}/documents/titre.pdf`,
    fileName: 'Titre foncier.pdf',
    fileSize: 4096,
    mimeType: 'application/pdf',
    expirationDate: null,
    isValid: true,
    createdAt: new Date()
  };
  mockPrisma.property.rows.push({
    id: P1,
    tenantId: TENANT_A,
    ownerUserId: USER_OUMAR,
    title: 'Villa Cocody',
    address: 'Cocody',
    media: [media],
    documents: [propertyDocument]
  });

  mockPrisma.rentalLease.rows.push({
    id: LEASE,
    tenant_id: TENANT_A,
    property_id: P1,
    status: 'ACTIVE',
    primary_renter_client_id: 'tc-awa',
    owner_client_id: null,
    end_date: null,
    property: { id: P1, address: 'Cocody', title: 'Villa Cocody' },
    coRenters: []
  });

  mockPrisma.rentalDocument.rows.push({
    id: id(31),
    tenant_id: TENANT_A,
    lease_id: LEASE,
    type: 'RENT_RECEIPT',
    status: 'ISSUED',
    document_number: 'Q-2026-001',
    title: 'Quittance avril',
    mime_type: 'application/pdf',
    file_path: '/srv/immotopia/storage/documents/tenant-a/Q-2026-001.pdf',
    file_url: '/uploads/documents/tenant-a/Q-2026-001.pdf',
    file_key: 'tenant-a/Q-2026-001.pdf',
    issued_at: new Date('2026-04-30'),
    created_at: new Date('2026-04-30'),
    lease: { id: LEASE, lease_number: 'BAIL-1', property_id: P1, property: { id: P1, address: 'Cocody' } }
  });

  const attachment = {
    id: id(41),
    tenant_id: TENANT_A,
    ticket_id: TICKET,
    file_url: `/uploads/maintenance/${TENANT_A}/${TICKET}/fuite.jpg`,
    file_name: 'fuite.jpg',
    mime_type: 'image/jpeg',
    file_size: 1024,
    created_at: new Date()
  };
  mockPrisma.maintenanceTicket.rows.push({
    id: TICKET,
    tenant_id: TENANT_A,
    property_id: P1,
    lease_id: LEASE,
    tenant_contact_id: 'contact-awa',
    created_by_contact_id: 'contact-awa',
    status: 'DECLARED',
    title: 'Fuite',
    category: 'PLUMBING',
    priority: 'HIGH',
    description: 'Fuite sous l’évier',
    created_at: new Date(),
    property: { id: P1, address: 'Cocody', title: 'Villa Cocody' },
    attachments: [attachment],
    comments: [],
    statusHistory: []
  });
  mockPrisma.maintenanceTicketAttachment.rows.push(attachment);
}

beforeEach(seed);

async function expectClean(userId: string, path: string) {
  const res = await request(app).get(path).set('x-test-user', userId);
  expect(`${path} : ${res.status}`).toBe(`${path} : 200`);
  expect(findDiskPathLeaks(res.body)).toEqual([]);
  return res.body.data;
}

describe('portail locataire — aucune réponse ne porte de chemin disque', () => {
  it('bail : documents décrits, avec la route de téléchargement', async () => {
    const data = await expectClean(USER_AWA, '/api/portal/tenant/lease');
    expect(data.documents[0]).toMatchObject({
      id: id(31),
      title: 'Quittance avril',
      downloadPath: `/portal/tenant/documents/${id(31)}/download`
    });
  });

  it('documents', async () => {
    const data = await expectClean(USER_AWA, '/api/portal/tenant/documents');
    expect(data.documents[0].downloadPath).toBe(`/portal/tenant/documents/${id(31)}/download`);
  });

  it('détail d’une échéance : ni motif interne de pénalité ni champs techniques de paiement', async () => {
    const INSTALLMENT = id(51);
    mockPrisma.rentalInstallment.rows.push({
      id: INSTALLMENT,
      tenant_id: TENANT_A,
      lease_id: LEASE,
      period_year: 2026,
      period_month: 4,
      due_date: new Date('2026-04-05'),
      status: 'PARTIAL',
      amount_rent: 100000,
      amount_service: 0,
      amount_other_fees: 0,
      penalty_amount: 5000,
      amount_paid: 40000,
      invoice_id: 'invoice-interne',
      items: [
        {
          id: id(56),
          tenant_id: TENANT_A,
          installment_id: INSTALLMENT,
          charge_type: 'RENT',
          label: 'Loyer',
          amount: 100000,
          currency: 'FCFA',
          metadata: { source: 'interne' },
          created_at: new Date('2026-04-01')
        }
      ],
      payments: [
        {
          id: id(57),
          tenant_id: TENANT_A,
          payment_id: id(53),
          installment_id: INSTALLMENT,
          amount: 40000,
          currency: 'FCFA',
          created_at: new Date('2026-04-10'),
          payment: {
            id: id(53),
            amount: 40000,
            method: 'MOBILE_MONEY',
            status: 'SUCCESS',
            currency: 'FCFA',
            initiated_at: new Date('2026-04-10'),
            succeeded_at: new Date('2026-04-10'),
            psp_reference: 'REF-1',
            psp_transaction_id: 'TX-INTERNE'
          }
        }
      ],
      penalties: [
        {
          id: id(52),
          tenant_id: TENANT_A,
          installment_id: INSTALLMENT,
          amount: 5000,
          currency: 'FCFA',
          days_late: 10,
          calculated_at: new Date('2026-04-15'),
          created_at: new Date('2026-04-15'),
          is_manual_override: true,
          override_reason: `Justificatif ${'/uploads/documents/tenant-a/penalites/geste.pdf'}`,
          created_by_user_id: 'user-agent'
        }
      ],
      lease: { id: LEASE, lease_number: 'BAIL-1', property: { id: P1, address: 'Cocody' } }
    });
    mockPrisma.rentalPayment.rows.push({
      id: id(53),
      tenant_id: TENANT_A,
      lease_id: LEASE,
      status: 'SUCCESS',
      amount: 40000,
      currency: 'FCFA',
      method: 'MOBILE_MONEY',
      succeeded_at: new Date('2026-04-10'),
      psp_reference: 'REF-1',
      mm_phone: '+2250700000000',
      treasury_account_id: id(54),
      idempotency_key: 'idem-1',
      raw_event_payload: { secret: 'x' },
      created_by_user_id: 'user-agent',
      allocations: [{ id: id(55), installment_id: INSTALLMENT, amount: 40000, currency: 'FCFA', tenant_id: TENANT_A }]
    });

    const data = await expectClean(USER_AWA, `/api/portal/tenant/installments/${INSTALLMENT}`);
    const penalty = data.installment.penalties[0];
    expect(penalty).toMatchObject({ id: id(52), amount: 5000, days_late: 10 });
    expect(penalty).not.toHaveProperty('override_reason');
    expect(penalty).not.toHaveProperty('created_by_user_id');

    // Échéance, lignes et affectations : `select` explicite, aucun champ interne.
    expect(data.installment).not.toHaveProperty('tenant_id');
    expect(data.installment).not.toHaveProperty('invoice_id');
    expect(data.installment.items[0]).toMatchObject({
      id: id(56),
      charge_type: 'RENT',
      label: 'Loyer',
      amount: 100000
    });
    for (const key of ['tenant_id', 'installment_id', 'metadata']) {
      expect(data.installment.items[0]).not.toHaveProperty(key);
    }
    expect(data.installment.payments[0]).toMatchObject({ id: id(57), amount: 40000, currency: 'FCFA' });
    for (const key of ['tenant_id', 'payment_id', 'installment_id']) {
      expect(data.installment.payments[0]).not.toHaveProperty(key);
    }
    expect(data.installment.payments[0].payment).not.toHaveProperty('psp_transaction_id');
    const related = data.relatedPayments[0];
    expect(related).toMatchObject({ id: id(53), amount: 40000 });
    for (const key of [
      'mm_phone',
      'treasury_account_id',
      'idempotency_key',
      'raw_event_payload',
      'created_by_user_id'
    ]) {
      expect(related).not.toHaveProperty(key);
    }
  });

  it('déclaration de paiement avec preuve : ni chemin /uploads ni champs internes dans la réponse', async () => {
    // PNG minimal : l'extension et le type viennent de la signature du contenu.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );
    const res = await request(app)
      .post('/api/portal/tenant/payments/declare')
      .set('x-test-user', USER_AWA)
      .field('amount', '50000')
      .field('paymentDate', '2026-04-10')
      .field('paymentMethod', 'MOBILE_MONEY')
      .field('mobileOperator', 'ORANGE')
      .field('transactionPhone', '+2250700000000')
      .attach('proof', png, { filename: 'preuve.png', contentType: 'image/png' });

    expect(`${res.status} ${JSON.stringify(res.body)}`).toMatch(/^201 /);
    expect(findDiskPathLeaks(res.body)).toEqual([]);
    const declaration = res.body.data;
    expect(declaration).toMatchObject({ amount: 50000, status: 'PENDING', hasProof: true });
    for (const key of ['proof_file_url', 'tenant_id', 'declared_by', 'reviewed_by', 'review_notes']) {
      expect(declaration).not.toHaveProperty(key);
    }
    // La preuve est bien enregistrée côté serveur, mais ne sort pas.
    expect(mockPrisma.rentalPaymentDeclaration.rows[0].proof_file_url).toMatch(/^\/uploads\/portal\/payments\//);
  });

  it('détail d’un ticket : pièces jointes sans URL de stockage', async () => {
    const data = await expectClean(USER_AWA, `/api/portal/tenant/maintenance/${TICKET}`);
    expect(data.attachments).toEqual([
      expect.objectContaining({
        id: id(41),
        file_name: 'fuite.jpg',
        downloadPath: `/portal/tenant/maintenance/${TICKET}/attachments/${id(41)}`
      })
    ]);
  });
});

describe('portail propriétaire — aucune réponse ne porte de chemin disque', () => {
  it('détail d’un bien : médias publics, documents décrits sans chemin ni URL', async () => {
    const data = await expectClean(USER_OUMAR, `/api/portal/owner/properties/${P1}`);
    expect(data.property.media[0].fileUrl).toBe(`/uploads/properties/${P1}/salon.jpg`);
    expect(data.property.documents[0]).toEqual(
      expect.objectContaining({ id: 'pdoc-1', fileName: 'Titre foncier.pdf', documentType: 'TITLE_DEED' })
    );
    expect(data.property.documents[0]).not.toHaveProperty('fileUrl');
  });

  it('détail d’un ticket', async () => {
    const data = await expectClean(USER_OUMAR, `/api/portal/owner/maintenance/${TICKET}`);
    expect(data.ticket.attachments[0].downloadPath).toBe(`/portal/owner/maintenance/${TICKET}/attachments/${id(41)}`);
  });

  it('documents', async () => {
    const data = await expectClean(USER_OUMAR, '/api/portal/owner/documents');
    expect(data.documents[0]).toMatchObject({
      downloadPath: `/portal/owner/documents/${id(31)}/download`,
      lease: { property: { address: 'Cocody' } }
    });
  });
});

describe('findDiskPathLeaks — le contrôle lui-même', () => {
  it('repère clés et chaînes interdites, laisse passer les médias publics', () => {
    expect(
      findDiskPathLeaks({
        a: { filePath: 'x' },
        b: 'C:\\srv\\uploads\\x.pdf',
        c: '/srv/app/uploads/maintenance/x.jpg',
        d: '/uploads/maintenance/t/k/x.jpg',
        e: '/uploads/properties/p1/documents/t.pdf',
        ok: [
          '/uploads/properties/p1/photo.jpg',
          '/uploads/properties/agency-logos/t/logo.png',
          'https://exemple.ci/reglement.pdf',
          'Titre'
        ]
      })
    ).toEqual([
      '$.a.filePath (clé interdite)',
      '$.b = C:\\srv\\uploads\\x.pdf',
      '$.c = /srv/app/uploads/maintenance/x.jpg',
      '$.d = /uploads/maintenance/t/k/x.jpg',
      '$.e = /uploads/properties/p1/documents/t.pdf'
    ]);
  });
});
