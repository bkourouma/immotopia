/**
 * Garde-fous de source pour les correctifs de sécurité de la recette qui ne se
 * testent pas sans base : script de rattrapage (isolation par agence, garde
 * production) et lectures d'utilisateur (jamais la ligne complète).
 */
import fs from 'fs';
import path from 'path';

const lire = (relatif: string) => fs.readFileSync(path.join(__dirname, '../..', relatif), 'utf8');

describe('scripts/backfill-user-full-names.ts', () => {
  const source = lire('scripts/backfill-user-full-names.ts');

  it('ne lit les contacts CRM que dans les agences liées au compte', () => {
    expect(source).toMatch(/crmContact\.findMany\(\{\s*where: \{ tenantId: \{ in: tenantIds \}/);
  });

  it('refuse de tourner en production sans --allow-production', () => {
    expect(source).toContain("process.env.NODE_ENV === 'production'");
    expect(source).toContain("'--allow-production'");
  });
});

describe('jamais include: { user: true }', () => {
  it.each(['src/services/owner-portal-service.ts', 'src/services/maintenance-ticket-service.ts'])('%s', file => {
    expect(lire(file)).not.toMatch(/^\s*user:\s*true/m);
  });
});

describe('routes des agences mandantes', () => {
  it('gardées par les droits du module Syndic, plus par PROPERTIES_*', () => {
    const source = lire('src/routes/document-branding-routes.ts');
    expect(source).not.toMatch(/PROPERTIES_(VIEW|CREATE|EDIT)'/);
  });
});
