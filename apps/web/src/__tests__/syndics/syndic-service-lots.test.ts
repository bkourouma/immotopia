import { createSyndicateLot, updateSyndicateLot } from '../../services/syndic-service';
import apiClient from '../../utils/api-client';

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

// Le formulaire des lots saisit les tantièmes spéciaux et « Propriétaire depuis
// le » : le service doit les transmettre tels quels à l'API (avant, il les
// remplaçait par un booléen déduit du type de lot et ignorait la date).
describe('syndic-service : lots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.post as any).mockResolvedValue({ data: { data: { id: 'lot-1' } } });
    (apiClient.patch as any).mockResolvedValue({ data: { data: { id: 'lot-1' } } });
  });

  it('création : transmet les tantièmes spéciaux saisis et la date', async () => {
    await createSyndicateLot('t1', 's1', {
      lotNumber: 'A101',
      lotType: 'APARTMENT',
      generalShares: 150,
      specialShares: 250,
      ownerSince: '2019-03-15T00:00:00.000Z'
    });
    const body = (apiClient.post as any).mock.calls[0][1];
    expect(body).toMatchObject({
      tantiemes: 150,
      specialShares: 250,
      ownerSince: '2019-03-15T00:00:00.000Z'
    });
    expect(body).not.toHaveProperty('isParkingIncluded');
  });

  it('création : un parking sans tantième spécial n’en reçoit pas', async () => {
    await createSyndicateLot('t1', 's1', { lotNumber: 'P01', lotType: 'PARKING', generalShares: 50 });
    const body = (apiClient.post as any).mock.calls[0][1];
    expect(body.specialShares).toBeNull();
  });

  it('modification : transmet la valeur saisie, null pour effacer, rien si non fourni', async () => {
    await updateSyndicateLot('t1', 's1', 'lot-1', {
      lotType: 'APARTMENT',
      generalShares: 150,
      specialShares: 250,
      ownerSince: '2021-07-02T00:00:00.000Z'
    });
    expect((apiClient.patch as any).mock.calls[0][1]).toMatchObject({
      specialShares: 250,
      ownerSince: '2021-07-02T00:00:00.000Z'
    });

    await updateSyndicateLot('t1', 's1', 'lot-1', { specialShares: null, ownerSince: null });
    expect((apiClient.patch as any).mock.calls[1][1]).toMatchObject({ specialShares: null, ownerSince: null });

    await updateSyndicateLot('t1', 's1', 'lot-1', { lotNumber: 'A102' });
    expect((apiClient.patch as any).mock.calls[2][1].specialShares).toBeUndefined();
  });
});
