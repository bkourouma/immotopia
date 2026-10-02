import { csvRow, CsvValue } from '../csv';
import type { PlatformAuditLogDto } from '../../services/audit-platform-read-service';

/**
 * Format CSV de l'export du journal d'audit de la plateforme (ADR-006, phase 4).
 * L'échappement (guillemets, formules de tableur) est celui de `lib/csv.ts`,
 * qui est l'unique endroit où il se fait.
 */

export const PLATFORM_AUDIT_CSV_HEADER = [
  'Date',
  'Agence',
  "Identifiant de l'agence",
  'Acteur',
  "Type d'acteur",
  'Action',
  'Catégorie',
  'Résultat',
  'Portée',
  'Visibilité',
  'Type de ressource',
  'Identifiant de la ressource',
  'Libellé de la ressource',
  'Identifiant de requête',
  'Adresse IP',
  'Navigateur',
  'Détails',
  'Modifications'
];

/** Un champ JSON ne doit pas faire exploser une cellule. */
const MAX_JSON_LENGTH = 5000;

function json(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = JSON.stringify(value);
  return text.length > MAX_JSON_LENGTH ? `${text.slice(0, MAX_JSON_LENGTH)}…` : text;
}

function actorOf(log: PlatformAuditLogDto): string {
  return log.user?.fullName || log.user?.email || log.actorLabel || '';
}

export function platformAuditCsvLine(log: PlatformAuditLogDto): string {
  const cells: CsvValue[] = [
    log.createdAt,
    log.tenant?.name ?? '',
    log.tenantId ?? '',
    actorOf(log),
    log.actorType,
    log.action,
    log.category,
    log.outcome,
    log.scope,
    log.visibility,
    log.resourceType,
    log.resourceId,
    log.resourceLabel ?? '',
    log.requestId ?? '',
    log.ipAddress ?? '',
    log.userAgent ?? '',
    json(log.details),
    json(log.changes)
  ];
  return csvRow(cells);
}

/** Début du fichier : BOM UTF-8 (Excel) puis l'en-tête. */
export function platformAuditCsvHead(): string {
  return `﻿${csvRow(PLATFORM_AUDIT_CSV_HEADER)}\r\n`;
}
