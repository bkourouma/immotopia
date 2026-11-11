/**
 * TEN-03 : PATCH /:tenantId/client-details etait ouvert a tout TenantClient et ecrivait `details`
 * (syndicCoOwnerContactIds, crmContactId) sans filtre. L'endpoint, son controleur et son service sont supprimes.
 */
jest.mock('../../src/services/tenant-service');
jest.mock('../../src/services/module-service');
jest.mock('../../src/services/tenant-provisioning-service');

import tenantRoutes from '../../src/routes/tenant-routes';
import * as controller from '../../src/controllers/tenant-controller';

describe('TEN-03 : client-details supprime', () => {
  it("le routeur n'expose plus aucune route client-details", () => {
    const paths = (tenantRoutes as any).stack.filter((l: any) => l.route).map((l: any) => l.route.path as string);
    expect(paths.length).toBeGreaterThan(5);
    expect(paths.filter((p: string) => p.includes('client-details'))).toEqual([]);
  });

  it('le controleur et le service ne sont plus exportes', () => {
    expect((controller as any).updateClientDetails).toBeUndefined();
    const service = jest.requireActual('../../src/services/tenant-service');
    expect(service.updateTenantClientDetails).toBeUndefined();
  });
});
