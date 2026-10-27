import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { DocumentTemplateStatus, DocumentType } from '@prisma/client';
import { prisma } from '../utils/database';
import { getShippedAssetsRoot, getShippedTemplatesDir, getTemplatesWriteDir } from '../utils/assets-paths';
import { standardTemplateForDocType } from '../lib/documents/docx-standard-templates';
import {
  decideTemplateRefresh,
  PREVIOUS_SHIPPED_HASHES,
  type ExistingDefaultTemplate
} from './document-template-refresh';
import { extractPlaceholders, uploadTemplate } from './document-template-service';

/**
 * Semis des modèles de documents globaux par défaut (bail habitation, bail
 * commercial, reçu de loyer, relevé locatif).
 *
 * Utilisable en production dans le conteneur de l'API (pas de ts-node) :
 *   docker exec immotopia-prod-api node dist/scripts/seed-default-document-templates.js
 *
 * Par défaut le semis est INSERT-ONLY : un modèle global par défaut actif déjà
 * présent n'est jamais modifié. Le rafraîchissement (remplacement du fichier
 * d'un ancien modèle livré) n'a lieu qu'avec `refresh` ; `force` (remplacer
 * aussi un global d'empreinte inconnue) n'a de sens qu'avec `refresh`.
 */

export interface SeedOptions {
  refresh: boolean;
  force: boolean;
}

export type SeedAction = 'CREATE' | 'SKIP_EXISTS' | 'SKIP_UP_TO_DATE' | 'SKIP_CUSTOM' | 'REFRESH';

/** Choix pur : insérer, ignorer ou (sur option explicite) rafraîchir. */
export function decideSeedAction(
  existing: ExistingDefaultTemplate | null,
  shippedHash: string,
  previousShippedHashes: readonly string[],
  options: SeedOptions
): SeedAction {
  if (!existing) return 'CREATE';
  if (!options.refresh) return 'SKIP_EXISTS';
  // `force` n'agit qu'avec `refresh` (déjà acquis ici).
  const decision = decideTemplateRefresh(existing, shippedHash, previousShippedHashes, options.force);
  if (decision === 'REFRESH') return 'REFRESH';
  if (decision === 'UP_TO_DATE') return 'SKIP_UP_TO_DATE';
  if (decision === 'KEEP_CUSTOM') return 'SKIP_CUSTOM';
  return 'CREATE';
}

interface DefaultTemplateConfig {
  type: DocumentType;
  filename: string;
  legacyFilename: string;
  name: string;
}

export const DEFAULT_TEMPLATES: readonly DefaultTemplateConfig[] = [
  {
    type: DocumentType.LEASE_HABITATION,
    filename: 'LEASE_HABITATION.docx',
    legacyFilename: 'contrat_bail_habitation.docx',
    name: 'Contrat de Bail Habitation (Par défaut)'
  },
  {
    type: DocumentType.LEASE_COMMERCIAL,
    filename: 'LEASE_COMMERCIAL.docx',
    legacyFilename: 'contrat_bail_commercial.docx',
    name: 'Contrat de Bail Commercial (Par défaut)'
  },
  {
    type: DocumentType.RENT_RECEIPT,
    filename: 'RENT_RECEIPT.docx',
    legacyFilename: 'Reçu_Loyer.docx',
    name: 'Reçu de Loyer (Par défaut)'
  },
  {
    type: DocumentType.RENT_STATEMENT,
    filename: 'RENT_STATEMENT.docx',
    legacyFilename: 'Releve_Compte.docx',
    name: 'Relevé de Compte Locatif (Par défaut)'
  }
];

export interface SeedReport {
  created: string[];
  skipped: string[];
  refreshed: string[];
  errors: string[];
}

/** Message lisible d'une erreur capturée. */
export function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class MissingSuperAdminError extends Error {
  constructor() {
    super(
      'Aucun utilisateur SUPER_ADMIN de plateforme : impossible de désigner le créateur des modèles. ' +
        "Aucun utilisateur n'est créé par ce script ; créez d'abord le super-administrateur."
    );
    this.name = 'MissingSuperAdminError';
  }
}

/** Fichier livré pour un type : modèle standard, puis ancien fichier de `assets/modeles_documents/`. */
async function findShippedFile(config: DefaultTemplateConfig): Promise<string | null> {
  const candidates: string[] = [];
  const standard = standardTemplateForDocType(config.type);
  if (standard) candidates.push(path.join(getShippedAssetsRoot(), 'modeles_standard', standard.fileName));
  candidates.push(path.join(getShippedTemplatesDir(), config.legacyFilename));
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // candidat suivant
    }
  }
  return null;
}

/** Plus ancien SUPER_ADMIN de plateforme ; jamais de création d'utilisateur. */
async function findCreatorId(): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: { globalRole: 'SUPER_ADMIN' },
    orderBy: { createdAt: 'asc' },
    select: { id: true }
  });
  if (!admin) throw new MissingSuperAdminError();
  return admin.id;
}

interface PlannedItem {
  config: DefaultTemplateConfig;
  action: SeedAction;
  buffer: Buffer;
  hash: string;
  existingId?: string;
}

export async function seedDefaultDocumentTemplates(
  options: SeedOptions,
  log: (message: string) => void = console.log
): Promise<SeedReport> {
  const report: SeedReport = { created: [], skipped: [], refreshed: [], errors: [] };
  const plan: PlannedItem[] = [];

  // Phase 1 : décider, sans rien écrire.
  for (const config of DEFAULT_TEMPLATES) {
    try {
      const filePath = await findShippedFile(config);
      if (!filePath) throw new Error(`fichier livré introuvable (${config.legacyFilename})`);
      const buffer = await fs.readFile(filePath);
      const hash = createHash('sha256').update(buffer).digest('hex');
      const existing = await prisma.documentTemplate.findFirst({
        where: {
          tenant_id: null,
          doc_type: config.type,
          is_default: true,
          status: DocumentTemplateStatus.ACTIVE
        },
        select: { id: true, tenant_id: true, is_default: true, file_hash_sha256: true }
      });
      const previous = [
        ...(PREVIOUS_SHIPPED_HASHES[config.legacyFilename] ?? []),
        ...(PREVIOUS_SHIPPED_HASHES[config.filename] ?? [])
      ];
      const action = decideSeedAction(existing, hash, previous, options);
      plan.push({ config, action, buffer, hash, existingId: existing?.id });
    } catch (error) {
      report.errors.push(config.type);
      log(`Erreur pour ${config.type} : ${errMsg(error)}`);
    }
  }

  // Le créateur n'est exigé que si au moins un modèle doit être créé ; échec avant toute écriture.
  let creatorId: string | null = null;
  if (plan.some(item => item.action === 'CREATE')) {
    creatorId = await findCreatorId();
  }

  // Phase 2 : écrire.
  for (const item of plan) {
    const { config, action } = item;
    try {
      if (action === 'SKIP_EXISTS') {
        log(`Ignoré ${config.type} : un modèle global par défaut actif existe déjà (non modifié).`);
        report.skipped.push(config.type);
      } else if (action === 'SKIP_UP_TO_DATE') {
        log(`Ignoré ${config.type} : modèle déjà à jour.`);
        report.skipped.push(config.type);
      } else if (action === 'SKIP_CUSTOM') {
        log(`Ignoré ${config.type} : modèle personnalisé, laissé intact (--force avec --refresh pour le remplacer).`);
        report.skipped.push(config.type);
      } else if (action === 'REFRESH' && item.existingId) {
        const storedFilename = `${config.type}_${Date.now()}.docx`;
        const storageDir = path.join(getTemplatesWriteDir(), 'default');
        await fs.mkdir(storageDir, { recursive: true });
        const storagePath = path.join(storageDir, storedFilename);
        await fs.writeFile(storagePath, item.buffer);
        let placeholders: string[] = [];
        try {
          placeholders = await extractPlaceholders(storagePath);
        } catch {
          // un modèle sans champ reste utilisable
        }
        await prisma.documentTemplate.update({
          where: { id: item.existingId },
          data: {
            stored_filename: storedFilename,
            storage_path: storagePath,
            file_size: item.buffer.length,
            file_hash_sha256: item.hash,
            placeholders,
            version: { increment: 1 }
          }
        });
        log(`Rafraîchi ${config.type} : fichier livré remplacé.`);
        report.refreshed.push(config.type);
      } else if (action === 'CREATE' && creatorId) {
        const template = await uploadTemplate(null, config.type, item.buffer, config.filename, config.name, creatorId);
        await prisma.documentTemplate.updateMany({
          where: { tenant_id: null, doc_type: config.type, is_default: true, id: { not: template.id } },
          data: { is_default: false }
        });
        await prisma.documentTemplate.update({
          where: { id: template.id },
          data: { is_default: true, status: DocumentTemplateStatus.ACTIVE }
        });
        log(`Créé ${config.type} : modèle global par défaut.`);
        report.created.push(config.type);
      }
    } catch (error) {
      report.errors.push(config.type);
      log(`Erreur pour ${config.type} : ${errMsg(error)}`);
    }
  }

  log(
    `Bilan : ${report.created.length} créé(s), ${report.skipped.length} ignoré(s), ` +
      `${report.refreshed.length} rafraîchi(s), ${report.errors.length} en erreur.`
  );
  return report;
}
