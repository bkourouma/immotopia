/**
 * SUR-04 / SUR-11 : octets magiques des justificatifs et images de diffusion,
 * limites multer (files / fields) du logo. Vrai `errorHandler`, app minimale.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../src/utils/database', () => ({ prisma: {} }));

import { errorHandler } from '../../src/middleware/error-middleware';
import { logoUpload } from '../../src/middleware/logo-upload-middleware';
import { brandingImageUpload } from '../../src/middleware/branding-upload-middleware';
import {
  assertGroupBroadcastImageSignature,
  groupBroadcastImageUpload
} from '../../src/routes/whatsapp-notification-config-routes';
import { paymentProofUpload, recordManualPaymentHandler } from '../../src/controllers/platform-billing-controller';

const mockRecord = jest.fn();
jest.mock('../../src/services/platform-payment-service', () => ({
  recordManualPayment: (...a: unknown[]) => mockRecord(...a)
}));

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const PDF = Buffer.from('%PDF-1.4\n%fake\n');
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

function whatsappApp() {
  const app = express();
  app.post('/b', groupBroadcastImageUpload.single('image'), assertGroupBroadcastImageSignature, (req, res) =>
    res.json({ ok: true, hasFile: Boolean(req.file) })
  );
  app.use(errorHandler);
  return app;
}

describe('diffusion de groupe WhatsApp : image', () => {
  it('refuse un HTML declare image/png', async () => {
    const res = await request(whatsappApp())
      .post('/b')
      .attach('image', HTML, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });
  it('accepte un vrai PNG et un vrai JPEG', async () => {
    const a = await request(whatsappApp())
      .post('/b')
      .attach('image', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(a.status).toBe(200);
    const b = await request(whatsappApp())
      .post('/b')
      .attach('image', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(b.status).toBe(200);
  });
  it("laisse passer l'absence de fichier", async () => {
    const res = await request(whatsappApp()).post('/b').field('message', 'bonjour');
    expect(res.status).toBe(200);
    expect(res.body.hasFile).toBe(false);
  });
  it('refuse un PNG declare image/jpeg (type incoherent)', async () => {
    const res = await request(whatsappApp())
      .post('/b')
      .attach('image', PNG, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
  });
});

describe('constat manuel : justificatif', () => {
  const body = { method: 'BANK_TRANSFER', paidAt: '2026-01-01' };
  function app() {
    const a = express();
    a.use((req, _res, next) => {
      (req as any).user = { userId: 'u1' };
      next();
    });
    a.post('/p', paymentProofUpload.single('proof'), recordManualPaymentHandler);
    a.use(errorHandler);
    return a;
  }
  beforeEach(() => mockRecord.mockReset().mockResolvedValue({ id: 'x' }));

  it('refuse un faux PDF', async () => {
    const res = await request(app())
      .post('/p')
      .field('method', body.method)
      .field('paidAt', body.paidAt)
      .attach('proof', HTML, { filename: 'p.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('Justificatif');
    expect(mockRecord).not.toHaveBeenCalled();
  });
  it('accepte un vrai PDF', async () => {
    const res = await request(app())
      .post('/p')
      .field('method', body.method)
      .field('paidAt', body.paidAt)
      .attach('proof', PDF, { filename: 'p.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });
});

describe('limites multer', () => {
  it('logo : deux fichiers refuses', async () => {
    const app = express();
    app.post('/l', logoUpload.single('file'), (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    const res = await request(app)
      .post('/l')
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
      .attach('file', PNG, { filename: 'b.png', contentType: 'image/png' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
  it('logo : trop de champs texte refuses', async () => {
    const app = express();
    app.post('/l', logoUpload.single('file'), (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    let r = request(app).post('/l');
    for (let i = 0; i < 20; i += 1) r = r.field(`f${i}`, 'x');
    const res = await r.attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
  it('les instances exposent files, fields et fieldSize', () => {
    for (const m of [logoUpload, brandingImageUpload, groupBroadcastImageUpload, paymentProofUpload]) {
      const limits = (m as unknown as { limits: Record<string, number> }).limits;
      expect(limits.files).toBe(1);
      expect(limits.fields).toBeGreaterThanOrEqual(8);
      expect(limits.fieldSize).toBeGreaterThan(0);
    }
  });
});
