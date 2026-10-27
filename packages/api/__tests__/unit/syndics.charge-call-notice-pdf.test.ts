import * as documentBranding from '../../src/lib/documents/document-branding';
import { renderChargeCallNoticePdf, type ChargeCallNoticeData } from '../../src/lib/syndics/charge-call-notice-pdf';

/**
 * L'avis d'appel de charges porte la signature et le cachet de l'émetteur
 * (décision métier, comme le relevé et la quittance).
 */
const image = (name: string) => ({ format: 'png', bytes: Buffer.from(name) }) as any;

const branding = (withSeals: boolean): documentBranding.DocumentBranding => ({
  issuer: {
    kind: 'MANDANT',
    name: 'Cabinet Mandant',
    legalName: null,
    address: null,
    phone: null,
    email: null,
    rccm: null,
    taxId: null
  },
  issuerLogo: null,
  signature: withSeals ? image('signature') : null,
  stamp: withSeals ? image('cachet') : null,
  syndicate: { name: 'Residence', address: null, registrationNo: null, cadastralReference: null, logo: null }
});

const data: ChargeCallNoticeData = {
  chargeCallId: 'call-1',
  period: { label: 'T1 2026' } as any,
  issuedAt: '2026-01-05',
  dueDate: '2026-01-31',
  currency: 'FCFA',
  amount: 150000,
  advanceImputed: 0,
  paid: 0,
  outstanding: 150000,
  lot: { number: 'A-12', type: 'Appartement', label: null },
  coowner: { name: 'Awa Traoré', address: null },
  paymentMethods: []
};

describe('renderChargeCallNoticePdf : signature et cachet', () => {
  afterEach(() => jest.restoreAllMocks());

  it('transmet signature et cachet du branding au bloc de signature', async () => {
    const draw = jest.spyOn(documentBranding, 'drawSignatureBlock').mockResolvedValue(undefined as any);
    const pdf = await renderChargeCallNoticePdf(data, branding(true));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(draw).toHaveBeenCalledTimes(1);
    const used = draw.mock.calls[0][2];
    expect(used.signature).not.toBeNull();
    expect(used.stamp).not.toBeNull();
  });

  it('sans signature ni cachet configurés, le PDF se génère quand même', async () => {
    const pdf = await renderChargeCallNoticePdf(data, branding(false));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
