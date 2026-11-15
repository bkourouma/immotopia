import {
  currentAssistantLanguage,
  currentLanguage,
  negotiateAssistantLanguage,
  negotiateLanguage,
  runInFrench,
  runWithAssistantLanguage,
  runWithLanguage,
  t
} from '../../src/i18n';
import { extractAssistantFile } from '../../src/lib/ai/assistant-files';
import { buildSystemPrompt } from '../../src/lib/ai/system-prompt';

describe('Langues de l’assistant', () => {
  it('conserve l’extension après avoir raccourci le nom Unicode sans couper un caractère', async () => {
    const base = '文'.repeat(175);
    const name = base + '🏠échéances.txt';
    const file = {
      originalname: Buffer.from(name, 'utf8').toString('latin1'),
      buffer: Buffer.from('Échéance')
    } as Express.Multer.File;
    await expect(extractAssistantFile(file, 't1')).resolves.toEqual({ name: base + '.txt', excerpt: 'Échéance' });
    await expect(extractAssistantFile({ ...file, originalname: 'txt' }, 't1')).rejects.toThrow('Formats acceptés');
  });

  test.each([
    ['es-ES', 'es', 'espagnol', 'Fuente de datos'],
    ['zh-CN', 'zh', 'chinois', '数据来源'],
    ['hi-IN', 'hi', 'hindi', 'डेटा स्रोत']
  ] as const)('%s est reconnu dans le contexte du chat et des artefacts', async (tag, language, name, label) => {
    expect(negotiateLanguage(`${tag},en`)).toBe('en');
    expect(negotiateAssistantLanguage(`${tag},en`)).toBe(language);
    await runWithLanguage('en', () =>
      runWithAssistantLanguage(language, async () => {
        await Promise.resolve();
        expect(currentLanguage()).toBe('en');
        expect(currentAssistantLanguage()).toBe(language);
        expect(t('Source des données')).toBe(label);
        expect(runInFrench(() => t('Source des données'))).toBe('Source des données');
        expect(buildSystemPrompt(currentAssistantLanguage(), [])).toContain(`réponds en ${name}`);
      })
    );
    expect(currentAssistantLanguage()).toBe('fr');
  });

  test.each([
    ['es', 'Archivo importado', 'Se aceptan archivos adjuntos CSV, TXT, XLSX y PDF.'],
    ['zh', '导入的文件', '支持的附件格式为 CSV、TXT、XLSX 和 PDF。'],
    ['hi', 'आयात की गई फ़ाइल', 'CSV, TXT, XLSX और PDF अटैचमेंट स्वीकार किए जाते हैं।']
  ] as const)('localise la provenance et les erreurs d’import en %s', async (language, source, error) => {
    const csv = {
      originalname: 'loyers.csv',
      buffer: Buffer.from('Immeuble;Loyer\nAtrium;50000')
    } as Express.Multer.File;
    await runWithAssistantLanguage(language, async () => {
      const result = await extractAssistantFile(csv, 't1');
      expect(result.table).toMatchObject({
        title: 'loyers.csv',
        columns: [expect.objectContaining({ label: 'Immeuble' }), expect.objectContaining({ label: 'Loyer' })],
        rows: [{ column1: 'Atrium', column2: 50000 }],
        provenance: { source }
      });
      await expect(extractAssistantFile({ ...csv, originalname: 'loyers.zip' }, 't1')).rejects.toThrow(error);
    });
  });
});
