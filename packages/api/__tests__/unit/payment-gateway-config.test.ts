/* eslint-disable @typescript-eslint/no-explicit-any */
/** SUR-08 : une config SIMULATOR n'est utilisable que si le simulateur est disponible. */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/lib/treasury/accounts', () => ({ ensureChartAccountTx: jest.fn() }));

function loadWith(simulatorAvailable: boolean) {
  let mod: typeof import('../../src/lib/payment-gateway/config');
  jest.isolateModules(() => {
    jest.doMock('../../src/config/env', () => ({
      env: { PAYSECUREHUB_BASE_URL: 'https://psh.example.test', PAYSECUREHUB_TIMEOUT_MS: 1000 },
      paymentGatewaySimulatorAvailable: simulatorAvailable
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../../src/lib/payment-gateway/config');
  });
  return mod!;
}

const simulatorConfig = {
  tenantId: 't1',
  mode: 'SIMULATOR',
  isActive: true,
  merchantId: null,
  apiKeyEncrypted: null
} as any;

describe('isConfigUsable : simulateur', () => {
  it('simulateur indisponible : config SIMULATOR active inutilisable', () => {
    expect(loadWith(false).isConfigUsable(simulatorConfig)).toBe(false);
  });

  it('simulateur disponible : config SIMULATOR active utilisable', () => {
    expect(loadWith(true).isConfigUsable(simulatorConfig)).toBe(true);
  });

  it('config inactive ou absente : jamais utilisable', () => {
    const { isConfigUsable } = loadWith(true);
    expect(isConfigUsable(null)).toBe(false);
    expect(isConfigUsable({ ...simulatorConfig, isActive: false })).toBe(false);
  });

  it('mode réel : exige identifiant marchand et clé, indépendamment du simulateur', () => {
    const { isConfigUsable } = loadWith(false);
    expect(isConfigUsable({ ...simulatorConfig, mode: 'LIVE' })).toBe(false);
    expect(isConfigUsable({ ...simulatorConfig, mode: 'LIVE', merchantId: 'm', apiKeyEncrypted: 'k' })).toBe(true);
  });
});
