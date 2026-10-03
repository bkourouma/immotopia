/**
 * Garde-fous du catalogue d'audit (ADR-006) : aucune action ne peut sortir sans
 * dire de quel niveau elle relève, et la migration de rattrapage dit la même
 * chose que le catalogue.
 */
import * as fs from 'fs';
import * as path from 'path';
import { AuditActionKey } from '../../src/types/audit-types';
import { AUDIT_CATALOG, getAuditCatalogEntry } from '../../src/types/audit-catalog';

const SRC = path.resolve(__dirname, '../../src');
const MIGRATION = path.resolve(__dirname, '../../prisma/migrations/20261007090000_audit_deux_niveaux/migration.sql');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

describe('catalogue d’audit', () => {
  it('a une entrée pour chaque AuditActionKey, et aucune en trop', () => {
    const enumKeys = Object.values(AuditActionKey).sort();
    expect(Object.keys(AUDIT_CATALOG).sort()).toEqual(enumKeys);
  });

  it('n’utilise que des catégories connues', () => {
    const categories = ['AUTH', 'DATA', 'ADMIN', 'SECURITY', 'BILLING', 'EXPORT', 'AI', 'SYSTEM'];
    for (const [key, entry] of Object.entries(AUDIT_CATALOG)) {
      expect({ key, ok: categories.includes(entry.category) }).toEqual({ key, ok: true });
    }
  });

  it('couvre toutes les clés écrites en chaîne littérale dans le code', () => {
    // `actionKey: 'XXX'` : une clé libre hors enum serait fermée par défaut
    // (PLATFORM_ONLY) et disparaîtrait du journal de l'agence sans bruit.
    const literal = /actionKey:\s*['"]([A-Z][A-Z0-9_]+)['"]/g;
    // Helper du cycle de vie des baux : `audit(actorUserId, tenantId, leaseId, 'CLE', …)`.
    // Cherché dans ce seul fichier : `audit(` est un nom courant ailleurs.
    const helper = /\baudit\(\s*[^,()]+,\s*[^,()]+,\s*[^,()]+,\s*['"]([A-Z][A-Z0-9_]+)['"]/g;
    const helperFile = path.join(SRC, 'lib/lease-lifecycle/service.ts');
    const missing = new Set<string>();

    for (const file of sourceFiles(SRC)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const re of file === helperFile ? [literal, helper] : [literal]) {
        for (const match of text.matchAll(re)) {
          if (!getAuditCatalogEntry(match[1])) missing.add(`${match[1]} (${path.relative(SRC, file)})`);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('est repris à l’identique par le rattrapage SQL de la migration', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    const blocks = [
      ...sql.matchAll(
        /SET "category" = '(\w+)',\s+"visibility" = CASE WHEN "tenant_id" IS NULL THEN 'PLATFORM_ONLY'::"AuditVisibility" ELSE '(\w+)'::"AuditVisibility" END\s+WHERE "action_key" IN \(([^)]*)\)/g
      )
    ];

    const fromSql: Record<string, string> = {};
    for (const [, category, visibility, list] of blocks) {
      for (const key of list.match(/'([A-Z0-9_]+)'/g) ?? []) {
        fromSql[key.replace(/'/g, '')] = `${category}/${visibility}`;
      }
    }

    // Clés créées APRÈS la migration : elles n'existent pas dans l'historique à
    // rattraper, donc pas dans le SQL. Chaque nouvelle clé du catalogue s'ajoute
    // ici, et nulle part ailleurs : la migration est figée.
    const postMigrationKeys = [
      'AUDIT_VIEWED',
      'AUDIT_EXPORTED',
      'AUDIT_SEALED',
      'AUDIT_PURGED',
      'AUDIT_INTEGRITY_FAILED',
      'PATRIMOINE_OWNER_MONTHLY_REPORT_SENT',
      'PATRIMOINE_INSURANCE_CLAIM_DECLARED',
      'PATRIMOINE_INSURANCE_CLAIM_STATUS_CHANGED',
      'LAND_REGULARIZATION_CREATED',
      'LAND_REGULARIZATION_STATUS_CHANGED',
      'LAND_STEP_STATUS_CHANGED',
      'LAND_STEP_UPDATED',
      'SECURE_LINK_CREATED',
      'SECURE_LINK_VIEWED',
      'SECURE_LINK_REVOKED',
      'SECURE_LINK_PAYMENT_STARTED',
      'RENTAL_PAYMENT_LINK_SENT',
      'EXTERNAL_ACCESS_GRANT_CREATED',
      'EXTERNAL_ACCESS_GRANT_UPDATED',
      'EXTERNAL_ACCESS_GRANT_REVOKED',
      'EXTERNAL_ACCESS_GRANT_LINK_SENT',
      'EXTERNAL_ACCESS_GRANT_VIEWED',
      'EXTERNAL_ACCESS_GRANT_DOCUMENT_DOWNLOADED',
      'ACCESS_DENIED',
      'TENANT_ACCESS_DENIED',
      'DOCUMENT_DOWNLOADED',
      'DATA_EXPORTED',
      // Écrites par une variable (`const actionKey = … ? … : …`), donc oubliées au
      // premier catalogue ; rattrapées par la migration 20261007110000.
      'CRM_DEAL_UPDATED',
      'CRM_DEAL_STAGE_CHANGED',
      // Refus d'un plan d'écriture de l'assistant (POST /ai/actions/reject).
      'AI_PROPOSAL_REJECTED'
    ];
    const fromCatalog = Object.fromEntries(
      Object.entries(AUDIT_CATALOG)
        .filter(([key]) => !postMigrationKeys.includes(key))
        .map(([key, e]) => [key, `${e.category}/${e.visibility}`])
    );
    // Clés RETIRÉES du catalogue après la migration : des marqueurs techniques
    // sortis du journal par la migration 20261007130000 (`notification_markers`).
    const removedAfterMigration = [
      'PATRIMOINE_LEASE_END_ALERT_SENT',
      'PATRIMOINE_LOAN_MATURITY_ALERT_SENT',
      'PATRIMOINE_WORK_UPCOMING_ALERT_SENT',
      'SYNDIC_MEETING_CONVOCATION_DELIVERY'
    ];
    for (const key of removedAfterMigration) {
      expect(fromSql).toHaveProperty(key);
      expect(AUDIT_CATALOG).not.toHaveProperty(key);
      delete fromSql[key];
    }
    expect(fromSql).toEqual(fromCatalog);
    for (const key of postMigrationKeys) {
      expect(AUDIT_CATALOG).toHaveProperty(key);
      expect(fromSql).not.toHaveProperty(key);
    }
  });
});
