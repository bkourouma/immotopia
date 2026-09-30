/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contrôleurs qui renvoyaient `error.message` brut : rental-document,
 * document-generation (regenerate), contact-search, property-mandate.
 * Une erreur non typée (ENOENT citant un chemin, erreur SQL) ne sort plus ;
 * une erreur typée garde son statut ; le 400 de `parsePagination` reste 400.
 */
import express from 'express';
import request from 'supertest';

const LEAK_WIN = 'ENOENT: no such file or directory, open D:\\APP\\Immobillier\\uploads\\x.pdf';
const LEAK_SQL = 'relation "users" does not exist';

const mockRental = { listDocuments: jest.fn(), generateDocument: jest.fn() };
jest.mock('../../src/services/rental-document-service', () => ({
  generateDocument: (...a: any[]) => mockRental.generateDocument(...a),
  updateDocumentStatus: jest.fn(),
  getDocumentById: jest.fn(),
  listDocuments: (...a: any[]) => mockRental.listDocuments(...a),
  toRentalDocumentDto: (d: any) => d
}));
const mockRegen = jest.fn();
jest.mock('../../src/services/document-generation-service', () => ({
  generateDocument: jest.fn(),
  regenerateDocument: (...a: any[]) => mockRegen(...a),
  getDocumentFile: jest.fn(),
  resolveLeaseDocumentType: jest.fn()
}));
const mockSearch = jest.fn();
jest.mock('../../src/services/contact-search.service', () => ({
  searchContacts: (...a: any[]) => mockSearch(...a),
  getFieldSuggestions: jest.fn(),
  saveSearch: jest.fn(),
  getSavedSearches: jest.fn(),
  useSavedSearch: jest.fn(),
  deleteSavedSearch: jest.fn(),
  exportSearchResultsCsv: jest.fn()
}));
const mockMandates = jest.fn();
jest.mock('../../src/services/property-mandate-service', () => ({
  createMandate: jest.fn(),
  revokeMandate: jest.fn(),
  getPropertyMandates: jest.fn(),
  getTenantMandates: (...a: any[]) => mockMandates(...a)
}));
jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({ getTenantIdFromRequest: () => 'tenant-1' }));

import { errorHandler, NotFoundError } from '../../src/middleware/error-middleware';
import { listDocumentsHandler } from '../../src/controllers/rental-document-controller';
import { regenerateDocumentHandler } from '../../src/controllers/document-generation-controller';
import { advancedSearchHandler } from '../../src/controllers/contact-search-controller';
import { getTenantMandatesHandler } from '../../src/controllers/property-mandate-controller';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { userId: 'u1' };
  req.tenantContext = { tenantId: 'tenant-1' };
  next();
});
app.get('/rental-docs', listDocumentsHandler);
app.post('/regenerate/:id', regenerateDocumentHandler);
app.post('/search', advancedSearchHandler);
app.get('/mandates', getTenantMandatesHandler);
app.use(errorHandler);

function expectNoLeak(res: request.Response) {
  const body = JSON.stringify(res.body);
  expect(body).not.toContain('ENOENT');
  expect(body).not.toContain('Immobillier');
  expect(body).not.toContain('users');
}

beforeEach(() => jest.clearAllMocks());

describe('aucun error.message brut', () => {
  it('rental-document : erreur inattendue -> 500 générique', async () => {
    mockRental.listDocuments.mockRejectedValue(new Error(LEAK_SQL));
    const res = await request(app).get('/rental-docs');
    expect(res.status).toBe(500);
    expectNoLeak(res);
  });

  it('rental-document : la pagination invalide reste un 400', async () => {
    const res = await request(app).get('/rental-docs?page=abc');
    expect(res.status).toBe(400);
    expect(mockRental.listDocuments).not.toHaveBeenCalled();
  });

  it('regenerate : ENOENT citant un chemin -> 500 générique', async () => {
    mockRegen.mockRejectedValue(new Error(LEAK_WIN));
    const res = await request(app).post('/regenerate/d1').send({});
    expect(res.status).toBe(500);
    expectNoLeak(res);
  });

  it('regenerate : une erreur typée garde son statut', async () => {
    mockRegen.mockRejectedValue(new NotFoundError('Document introuvable.'));
    const res = await request(app).post('/regenerate/d1').send({});
    expect(res.status).toBe(404);
  });

  it('contact-search : erreur SQL -> 500 générique', async () => {
    mockSearch.mockRejectedValue(new Error(LEAK_SQL));
    const res = await request(app).post('/search').send({ filters: {} });
    expect(res.status).toBe(500);
    expectNoLeak(res);
  });

  it('property-mandate : erreur inattendue -> 500 générique', async () => {
    mockMandates.mockRejectedValue(new Error(LEAK_WIN));
    const res = await request(app).get('/mandates');
    expect(res.status).toBe(500);
    expectNoLeak(res);
  });
});
