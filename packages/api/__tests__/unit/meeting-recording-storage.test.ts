/**
 * Stockage S3 des enregistrements d'AG (spec 045, R5) : téléchargement en flux vers un
 * fichier temporaire puis renommage, suppression d'objet. Client S3 simulé.
 */
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';

const mockEnv: Record<string, string | number | undefined> = {
  LIVEKIT_RECORDING_S3_BUCKET: 'bucket-ag',
  LIVEKIT_RECORDING_S3_REGION: 'us-east-1',
  LIVEKIT_RECORDING_S3_ENDPOINT: 'http://minio.test:9000',
  LIVEKIT_RECORDING_S3_ACCESS_KEY: 'AKIATEST',
  LIVEKIT_RECORDING_S3_SECRET: 'secret-s3-ne-doit-jamais-fuiter',
  LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE: '1',
  LIVEKIT_RECORDING_MAX_BYTES: 1000
};
jest.mock('../../src/config/env', () => ({ env: mockEnv }));

const mockSend = jest.fn();
const mockClientCtor = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: function (config: unknown) {
    mockClientCtor(config);
    return { send: mockSend };
  },
  GetObjectCommand: function (input: unknown) {
    return { kind: 'get', input };
  },
  DeleteObjectCommand: function (input: unknown) {
    return { kind: 'delete', input };
  }
}));

import { RecordingTooLargeError } from '../../src/lib/syndics/meeting-recording-errors';
import {
  _resetRecordingStorageForTests,
  deleteRecordingObject,
  downloadRecordingObject
} from '../../src/lib/syndics/meeting-recording-storage';

let dir: string;

beforeEach(async () => {
  jest.clearAllMocks();
  _resetRecordingStorageForTests();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'immotopia-s3-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('downloadRecordingObject', () => {
  it('écrit en flux dans un fichier voisin puis le renomme ; rend la taille', async () => {
    const payload = Buffer.alloc(300_000, 7);
    mockSend.mockResolvedValue({ Body: Readable.from([payload.subarray(0, 100_000), payload.subarray(100_000)]) });
    const destination = path.join(dir, 'a', 'b', 'rec.mp4');

    const size = await downloadRecordingObject('ag-enregistrements/t/m/r.mp4', destination);

    expect(size).toBe(300_000);
    expect((await fs.readFile(destination)).equals(payload)).toBe(true);
    expect(await fs.readdir(path.dirname(destination))).toEqual(['rec.mp4']);
    expect(mockSend.mock.calls[0][0]).toEqual({
      kind: 'get',
      input: { Bucket: 'bucket-ag', Key: 'ag-enregistrements/t/m/r.mp4' }
    });
    expect(mockClientCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-east-1',
        endpoint: 'http://minio.test:9000',
        forcePathStyle: true,
        credentials: { accessKeyId: 'AKIATEST', secretAccessKey: 'secret-s3-ne-doit-jamais-fuiter' }
      })
    );
  });

  it('flux interrompu : aucun fichier final ni temporaire, et l erreur ne cite ni clé ni secret', async () => {
    async function* broken() {
      yield Buffer.from('début');
      throw new Error('connexion perdue');
    }
    mockSend.mockResolvedValue({ Body: Readable.from(broken()) });
    const destination = path.join(dir, 'rec.mp4');
    const error: Error = await downloadRecordingObject('cle-secrete/objet.mp4', destination).catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toContain('secret-s3');
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it('objet vide ou sans corps = erreur, rien n est conservé', async () => {
    const destination = path.join(dir, 'rec.mp4');
    mockSend.mockResolvedValueOnce({ Body: undefined });
    await expect(downloadRecordingObject('k', destination)).rejects.toThrow();
    mockSend.mockResolvedValueOnce({ Body: Readable.from([]) });
    await expect(downloadRecordingObject('k', destination)).rejects.toThrow();
    expect(await fs.readdir(dir)).toEqual([]);
  });
});

describe('plafond de taille', () => {
  it("taille annoncée par S3 au-dessus du plafond : refusée AVANT de télécharger, flux fermé, rien n'est écrit", async () => {
    const body = Readable.from([Buffer.alloc(10)]);
    mockSend.mockResolvedValue({ Body: body, ContentLength: 1001 });
    const destination = path.join(dir, 'rec.mp4');
    await expect(downloadRecordingObject('k', destination)).rejects.toBeInstanceOf(RecordingTooLargeError);
    expect(body.destroyed).toBe(true);
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it('exactement au plafond : accepté', async () => {
    mockSend.mockResolvedValue({ Body: Readable.from([Buffer.alloc(1000, 1)]), ContentLength: 1000 });
    const destination = path.join(dir, 'rec.mp4');
    await expect(downloadRecordingObject('k', destination)).resolves.toBe(1000);
  });
});

describe('deleteRecordingObject', () => {
  it('supprime l objet du bucket configuré', async () => {
    mockSend.mockResolvedValue({});
    await deleteRecordingObject('ag-enregistrements/t/m/r.mp4');
    expect(mockSend.mock.calls[0][0]).toEqual({
      kind: 'delete',
      input: { Bucket: 'bucket-ag', Key: 'ag-enregistrements/t/m/r.mp4' }
    });
  });
});
