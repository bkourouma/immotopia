/**
 * Deux projets Jest partagent la meme configuration de base.
 *
 * - `api` : toutes les suites, comme avant. ts-jest y verifie les types de
 *   chaque fichier compile.
 * - `api-app` : les suites qui importent l'app Express ENTIERE (`src/app`) —
 *   inventaire des routes, secrets absents des reponses, etancheite entre
 *   agences. Elles chargent tous les routeurs, donc tous les services ; or le
 *   paquet porte encore des erreurs TypeScript anciennes (voir AGENTS.md), et
 *   ts-jest refuserait la suite a la premiere rencontree. Elles sont donc
 *   compilees sans verification de types (`isolatedModules`) : ce qu'elles
 *   testent, c'est le comportement, et `npm run typecheck` surveille les types.
 *   S'y ajoutent les suites qui montent les routeurs des portails locataire
 *   et propriétaire, des biens ou de la gestion locative : leurs contrôleurs
 *   et services portent aussi de ces erreurs anciennes.
 */

const APP_LEVEL_TESTS = [
  '<rootDir>/__tests__/unit/routes-inventory.test.ts',
  '<rootDir>/__tests__/unit/route-features.test.ts',
  '<rootDir>/__tests__/unit/particulier-routes.test.ts',
  '<rootDir>/__tests__/unit/no-secret-in-responses.test.ts',
  '<rootDir>/__tests__/integration/isolation.test.ts',
  '<rootDir>/__tests__/integration/patrimoine.property-asset.integration.test.ts',
  // Importe `createProperty` (services/property-service), donc property-template-service et ses erreurs TS anciennes.
  '<rootDir>/__tests__/integration/personal-space.integration.test.ts',
  '<rootDir>/__tests__/api/maintenance.attachment-files.test.ts',
  '<rootDir>/__tests__/api/maintenance.tenant-portal-visibility.test.ts',
  '<rootDir>/__tests__/api/private-files.test.ts',
  '<rootDir>/__tests__/api/portal-no-disk-paths.test.ts',
  '<rootDir>/__tests__/api/property-documents-no-disk-paths.test.ts',
  '<rootDir>/__tests__/api/owner-portal-patrimoine.test.ts',
  '<rootDir>/__tests__/api/owner-portal-reports-filename.test.ts'
];

const base = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // `uuid` v13 est ESM-only ; jest-runtime ne sait pas encore le charger
    // via `require(esm)` (Node 24 le peut, Jest non). Voir le commentaire de
    // tete du shim pour le detail — necessaire depuis que des tests du lot E
    // (multi-tenant) importent l'app Express complete.
    '^uuid$': '<rootDir>/__tests__/helpers/uuid-jest-shim.js'
    // jsdom et dompurify (ESM-only eux aussi) ne sont PAS remplaces ici : un
    // DOMPurify factice qui ne nettoie rien ferait passer a tort tout test de
    // la newsletter. Seuls les tests qui importent l'app entiere les
    // remplacent, par jest.mock (voir __tests__/helpers/app-shims.ts).
  },
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts']
};

module.exports = {
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  projects: [
    {
      ...base,
      displayName: 'api',
      testMatch: ['**/__tests__/**/*.spec.ts', '**/__tests__/**/*.test.ts'],
      testPathIgnorePatterns: ['/node_modules/', ...APP_LEVEL_TESTS.map(p => p.replace('<rootDir>', ''))]
    },
    {
      ...base,
      displayName: 'api-app',
      testMatch: APP_LEVEL_TESTS,
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }]
      }
    }
  ]
};
