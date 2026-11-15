import { ASSISTANT_LANGUAGES, runWithAssistantLanguage } from '../../src/i18n';
import ar from '../../src/i18n/locales/ar.json';
import en from '../../src/i18n/locales/en.json';
import es from '../../src/i18n/locales/es-assistant.json';
import hi from '../../src/i18n/locales/hi-assistant.json';
import zh from '../../src/i18n/locales/zh-assistant.json';
import { datasetCatalog } from '../../src/lib/ai/dataset-catalog';
import { withDatasetCatalog } from '../../src/lib/ai/tools/list-datasets';
import { ALL_TOOLS } from '../../src/lib/ai/tools/registry';

const catalogs: Record<string, Record<string, string>> = { en, ar, es, hi, zh };
const texts = new Set(
  Object.values(datasetCatalog).flatMap(entry => [
    entry.title,
    entry.grain,
    entry.defaultPeriod,
    ...Object.values(entry.dimensions),
    ...Object.values(entry.measures).flatMap(([label, , definition]) => [label, definition])
  ])
);
for (const tool of ALL_TOOLS.filter(item => item.name in datasetCatalog)) {
  for (const property of Object.values((tool.jsonSchema.properties ?? {}) as Record<string, unknown>)) {
    if (
      property &&
      typeof property === 'object' &&
      'description' in property &&
      typeof property.description === 'string'
    ) {
      texts.add(property.description);
    }
  }
}

it.each(ASSISTANT_LANGUAGES.filter(language => language !== 'fr'))(
  'traduit chaque libellé, définition, période et aide de filtre du catalogue en %s',
  language => {
    const dictionary = catalogs[language];
    expect([...texts].filter(text => !dictionary[text]?.trim())).toEqual([]);
  }
);

it.each(ASSISTANT_LANGUAGES)('livre une fiche localisée en %s en conservant les clés et unités', async language => {
  const arrears = ALL_TOOLS.find(tool => tool.name === 'rental_arrears')!;
  const [, catalog] = withDatasetCatalog([arrears]);
  const entry = datasetCatalog.rental_arrears;
  const translated = (text: string) => catalogs[language]?.[text] ?? text;
  const result = await runWithAssistantLanguage(language, () =>
    catalog.execute(
      { dataset: 'rental_arrears' },
      {
        tenantId: 'agency',
        userId: 'owner',
        permissions: new Set([arrears.requiredPermission]),
        requestId: 'request',
        conversationId: 'conversation',
        signal: new AbortController().signal,
        seenLeaseIds: new Set()
      }
    )
  );
  expect(result.modelResult).toMatchObject({
    id: 'rental_arrears',
    title: translated(entry.title),
    grain: translated(entry.grain),
    defaultPeriod: translated(entry.defaultPeriod),
    dimensions: expect.arrayContaining([{ key: 'property', label: translated('Bien') }]),
    measures: expect.arrayContaining([
      {
        key: 'balance',
        label: translated(entry.measures.balance[0]),
        unit: 'currency',
        format: 'currency',
        definition: translated(entry.measures.balance[2])
      }
    ]),
    filters: {
      month: { type: 'string', pattern: expect.any(String), description: translated('Mois clos AAAA-MM.') }
    },
    granularities: ['month']
  });
});
