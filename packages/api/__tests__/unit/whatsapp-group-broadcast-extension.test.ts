/**
 * Diffusion WhatsApp de groupe : l'extension du fichier stocké vient du type
 * réel (octets), jamais de `originalname`.
 */
const writeFile = jest.fn().mockResolvedValue(undefined);
const mkdir = jest.fn().mockResolvedValue(undefined);
jest.mock('fs/promises', () => ({
  writeFile: (...a: unknown[]) => writeFile(...a),
  mkdir: (...a: unknown[]) => mkdir(...a)
}));
jest.mock('../../src/utils/project-root', () => ({ getProjectRoot: () => '/tmp/root' }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/providers/whatsapp.provider', () => ({
  configureWhatsAppProvider: () => true,
  getConfiguredWhatsAppProvider: () => 'twilio',
  sendImage: jest.fn().mockResolvedValue({ messageId: 'm1' }),
  sendText: jest.fn().mockResolvedValue({ messageId: 'm2' })
}));

import { sendManualGroupBroadcast } from '../../src/services/whatsapp-group-broadcast-service';

const PNG = Buffer.from('89504e470d0a1a0a0000000d', 'hex');
const file = (buffer: Buffer, mimetype: string, originalname: string) =>
  ({ buffer, mimetype, originalname }) as Express.Multer.File;

describe('whatsapp group broadcast : extension stockée', () => {
  beforeEach(() => {
    process.env.WHATSAPP_GROUP_BROADCAST_TO = 'group-1';
    writeFile.mockClear();
  });

  it('écrit un PNG en .png même si originalname est x.html', async () => {
    const result = await sendManualGroupBroadcast({
      tenantId: 't1',
      message: 'bonjour',
      imageFile: file(PNG, 'image/png', 'x.html')
    });
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(String(writeFile.mock.calls[0][0])).toMatch(/\.png$/);
    expect(result.mediaUrl).toMatch(/^\/uploads\/whatsapp\/group-broadcast\/t1\/group-.*\.png$/);
  });

  it('refuse un HTML déclaré image/png (400) sans écriture', async () => {
    await expect(
      sendManualGroupBroadcast({
        tenantId: 't1',
        message: 'bonjour',
        imageFile: file(Buffer.from('<html><script>1</script>'), 'image/png', 'a.png')
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(writeFile).not.toHaveBeenCalled();
  });
});
