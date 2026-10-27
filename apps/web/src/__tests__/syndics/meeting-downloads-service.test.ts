import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../utils/api-client', () => ({ default: client, apiClient: client }));

import { downloadMeetingRecordingFile, generateMeetingMinutesDocx } from '../../services/syndic-service';

beforeEach(() => vi.clearAllMocks());

describe('téléchargements de l AG : nom du fichier', () => {
  it('compte rendu Word : nom de Content-Disposition, sinon nom de repli', async () => {
    client.post.mockResolvedValueOnce({
      data: new Blob(['x']),
      headers: { 'content-disposition': "attachment; filename*=UTF-8''compte-rendu-AG%202026.docx" }
    });
    const named = await generateMeetingMinutesDocx('t1', 's1', 'm1', 'repli.docx');
    expect(named.filename).toBe('compte-rendu-AG 2026.docx');
    expect(client.post.mock.calls[0][2]).toEqual({ responseType: 'blob' });

    client.post.mockResolvedValueOnce({ data: new Blob(['x']), headers: {} });
    expect((await generateMeetingMinutesDocx('t1', 's1', 'm1', 'repli.docx')).filename).toBe('repli.docx');
  });

  it('enregistrement MP4 : route authentifiée en blob, nom lisible', async () => {
    client.get.mockResolvedValueOnce({ data: new Blob(['x']), headers: {} });
    const result = await downloadMeetingRecordingFile('t1', 's1', 'm1', 'rec1', 'AG-2026-10-20.mp4');
    expect(result.filename).toBe('AG-2026-10-20.mp4');
    const [url, config] = client.get.mock.calls[0];
    expect(url).toBe('/tenants/t1/syndics/s1/assemblees/m1/enregistrements/rec1/fichier');
    expect(config).toMatchObject({ responseType: 'blob', params: { telecharger: 1 } });
  });
});
