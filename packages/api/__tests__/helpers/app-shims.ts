/**
 * Remplacements de modules pour les tests qui importent l'app Express entiere
 * (`src/app`). A importer EN PREMIER dans ces fichiers.
 *
 * `jsdom` et `dompurify` sont ESM-only et jest-runtime ne sait pas les charger.
 * Seul `newsletter-campaign.service.ts` s'en sert, pour nettoyer le HTML des
 * campagnes ; ces tests n'exercent jamais les routes newsletter. Les faux
 * modules vivent donc ici, et pas dans jest.config.js : ailleurs, un
 * DOMPurify qui ne nettoie rien masquerait une regression XSS.
 */
jest.mock('jsdom', () => require('./jsdom-jest-shim.js'));
jest.mock('dompurify', () => require('./dompurify-jest-shim.js'));

export {};
