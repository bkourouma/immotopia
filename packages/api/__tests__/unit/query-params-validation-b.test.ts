/**
 * Tests de validation des paramètres de requête (query et body)
 * avec les fonctions parseEnumParam, parseIntParam, parseNumberParam, parsePagination.
 *
 * Vérifie que les paramètres invalides lèvent BadRequestError (400)
 * au lieu de traverser jusqu'au service.
 */

const listTemplates = jest.fn();
jest.mock('../../src/services/document-template-service', () => ({
  uploadTemplate: jest.fn(),
  listTemplates: (...args: any[]) => listTemplates(...args),
  activateTemplate: jest.fn(),
  deactivateTemplate: jest.fn(),
  setDefaultTemplate: jest.fn(),
  deleteTemplate: jest.fn()
}));

const updatePropertyStatus = jest.fn();
jest.mock('../../src/services/property-status-service', () => ({
  updatePropertyStatus: (...args: any[]) => updatePropertyStatus(...args),
  getStatusHistory: jest.fn()
}));

const uploadMedia = jest.fn();
jest.mock('../../src/services/property-media-service', () => ({
  uploadMedia: (...args: any[]) => uploadMedia(...args),
  reorderMedia: jest.fn(),
  setPrimaryMedia: jest.fn(),
  deleteMedia: jest.fn(),
  getPropertyMedia: jest.fn()
}));

const listMandates = jest.fn();
const listAgreements = jest.fn();
const listCommissions = jest.fn();
jest.mock('../../src/lib/sales/mandates', () => ({
  createMandate: jest.fn(),
  getMandateDetail: jest.fn(),
  listMandates: (...args: any[]) => listMandates(...args),
  revokeMandate: jest.fn(),
  updateMandate: jest.fn()
}));
jest.mock('../../src/lib/sales/offers', () => ({
  createOffer: jest.fn(),
  decideOffer: jest.fn()
}));
jest.mock('../../src/lib/sales/agreements', () => ({
  addCondition: jest.fn(),
  cancelAgreement: jest.fn(),
  completeAgreement: jest.fn(),
  createAgreementFromOffer: jest.fn(),
  deleteCondition: jest.fn(),
  getAgreementDetail: jest.fn(),
  listAgreements: (...args: any[]) => listAgreements(...args),
  patchCondition: jest.fn(),
  replaceMilestones: jest.fn(),
  signAgreement: jest.fn(),
  updateAgreement: jest.fn()
}));
jest.mock('../../src/lib/sales/commissions', () => ({
  createCommissionPayment: jest.fn(),
  getCommissionDetail: jest.fn(),
  listCommissions: (...args: any[]) => listCommissions(...args),
  voidCommissionPayment: jest.fn()
}));
jest.mock('../../src/lib/sales/pipeline', () => ({
  getSalesPipeline: jest.fn()
}));

import { listTemplatesHandler } from '../../src/controllers/document-template-controller';
import { updateStatusHandler } from '../../src/controllers/property-status-controller';
import { uploadMediaHandler } from '../../src/controllers/property-media-controller';
import { listMandatesHandler } from '../../src/controllers/sales-controller';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockNext() {
  return jest.fn();
}

beforeEach(() => {
  jest.clearAllMocks();
  listTemplates.mockClear();
  updatePropertyStatus.mockClear();
  uploadMedia.mockClear();
  listMandates.mockClear();
  listAgreements.mockClear();
  listCommissions.mockClear();
});

describe('document-template-controller — validation docType query param', () => {
  it('retourne 400 si docType est invalide', async () => {
    const req: any = {
      tenantContext: { tenantId: 'tenant-1' },
      query: {
        docType: 'INVALID_DOC_TYPE'
      }
    };
    const res = mockRes();
    const next = mockNext();

    await listTemplatesHandler(req, res, next);

    // Le service ne doit pas être appelé
    expect(listTemplates).not.toHaveBeenCalled();
    // L'erreur est passée à next()
    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toHaveProperty('statusCode', 400);
  });

  it('retourne 400 si status est invalide', async () => {
    const req: any = {
      tenantContext: { tenantId: 'tenant-1' },
      query: {
        status: 'INVALID_STATUS'
      }
    };
    const res = mockRes();
    const next = mockNext();

    await listTemplatesHandler(req, res, next);

    // Le service ne doit pas être appelé
    expect(listTemplates).not.toHaveBeenCalled();
    // L'erreur est passée à next()
    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toHaveProperty('statusCode', 400);
  });

  it('accepte un docType valide', async () => {
    listTemplates.mockResolvedValue([]);

    const req: any = {
      tenantContext: { tenantId: 'tenant-1' },
      query: {
        docType: 'LEASE_HABITATION'
      }
    };
    const res = mockRes();
    const next = mockNext();

    await listTemplatesHandler(req, res, next);

    expect(listTemplates).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('property-status-controller — validation status body param', () => {
  it('retourne 400 si status est invalide', async () => {
    const req: any = {
      params: { id: 'prop-1' },
      tenantContext: { tenantId: 'tenant-1' },
      user: { userId: 'user-1' },
      body: {
        status: 'INVALID_STATUS'
      }
    };
    const res = mockRes();
    const next = mockNext();

    await updateStatusHandler(req, res, next);

    // Le service ne doit pas être appelé
    expect(updatePropertyStatus).not.toHaveBeenCalled();
    // L'erreur est passée à next()
    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toHaveProperty('statusCode', 400);
  });

  it('accepte un status valide', async () => {
    updatePropertyStatus.mockResolvedValue({ id: 'prop-1', status: 'AVAILABLE' });

    const req: any = {
      params: { id: 'prop-1' },
      tenantContext: { tenantId: 'tenant-1' },
      user: { userId: 'user-1' },
      body: {
        status: 'AVAILABLE'
      }
    };
    const res = mockRes();
    const next = mockNext();

    await updateStatusHandler(req, res, next);

    expect(updatePropertyStatus).toHaveBeenCalledTimes(1);
  });
});

describe('property-media-controller — validation mediaType body param', () => {
  it('retourne 400 si mediaType est invalide', async () => {
    const req: any = {
      params: { id: 'prop-1' },
      tenantContext: { tenantId: 'tenant-1' },
      user: { userId: 'user-1' },
      file: { buffer: Buffer.from('fake'), originalname: 'image.jpg' },
      body: {
        mediaType: 'INVALID_TYPE'
      }
    };
    const res = mockRes();
    const next = mockNext();

    await uploadMediaHandler(req, res, next);

    // Le service ne doit pas être appelé
    expect(uploadMedia).not.toHaveBeenCalled();
    // L'erreur typée est passée à next() : 400
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toHaveProperty('statusCode', 400);
  });

  it('retourne 400 si displayOrder est invalide', async () => {
    const req: any = {
      params: { id: 'prop-1' },
      tenantContext: { tenantId: 'tenant-1' },
      user: { userId: 'user-1' },
      file: { buffer: Buffer.from('fake'), originalname: 'image.jpg' },
      body: {
        mediaType: 'PHOTO',
        displayOrder: 'not-a-number'
      }
    };
    const res = mockRes();
    const next = mockNext();

    await uploadMediaHandler(req, res, next);

    // Le service ne doit pas être appelé
    expect(uploadMedia).not.toHaveBeenCalled();
    // L'erreur typée est passée à next() : 400
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toHaveProperty('statusCode', 400);
  });

  it('accepte un mediaType valide et displayOrder valide', async () => {
    uploadMedia.mockResolvedValue({ id: 'media-1', type: 'PHOTO' });

    const req: any = {
      params: { id: 'prop-1' },
      tenantContext: { tenantId: 'tenant-1' },
      user: { userId: 'user-1' },
      file: { buffer: Buffer.from('fake'), originalname: 'image.jpg' },
      body: {
        mediaType: 'PHOTO',
        displayOrder: 1
      }
    };
    const res = mockRes();
    const next = mockNext();

    await uploadMediaHandler(req, res, next);

    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('sales-controller — validation status query param', () => {
  it('retourne 400 si mandate status est invalide', async () => {
    const req: any = {
      tenantContext: { tenantId: 'tenant-1' },
      user: { userId: 'user-1' },
      query: {
        status: 'INVALID_STATUS'
      }
    };
    const res = mockRes();
    const next = mockNext();

    await listMandatesHandler(req, res, next);

    // Le service ne doit pas être appelé
    expect(listMandates).not.toHaveBeenCalled();
    // L'erreur typée est passée à next() : 400
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toHaveProperty('statusCode', 400);
  });

  it('accepte un mandate status valide', async () => {
    listMandates.mockResolvedValue([]);

    const req: any = {
      tenantContext: { tenantId: 'tenant-1' },
      user: { userId: 'user-1' },
      query: {
        status: 'ACTIVE'
      }
    };
    const res = mockRes();
    const next = mockNext();

    await listMandatesHandler(req, res, next);

    expect(listMandates).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalled();
  });
});
