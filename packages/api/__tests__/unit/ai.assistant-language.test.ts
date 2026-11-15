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
import { buildSystemPrompt } from '../../src/lib/ai/system-prompt';

describe('Langues de l’assistant', () => {
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
});
