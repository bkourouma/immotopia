/**
 * Documents de l'agence « 3 ans » : pièces des biens (titres, diagnostics,
 * plans, assurances, actes…) avec de vrais PDF au chemin privé attendu, et
 * modèles de documents de l'agence (contrats de bail, quittances, relevés).
 */
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { Prisma } from '@prisma/client';
import { getProjectRoot } from '../../../src/utils/project-root';
import { between, pick } from './types';
import { writeDemoPdf } from './seed-files';
import { DOC_LABELS, addDays } from './agence-commercial-data';
import type { CommercialEnv, PropertyDocSpec } from './agence-commercial-data';

type DocType = PropertyDocSpec['type'];

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  APPARTEMENT: 'Appartement',
  MAISON_VILLA: 'Maison / villa',
  STUDIO: 'Studio',
  DUPLEX_TRIPLEX: 'Duplex / triplex',
  CHAMBRE_COLOCATION: 'Chambre en colocation',
  BUREAU: 'Bureau',
  BOUTIQUE_COMMERCIAL: 'Boutique commerciale',
  ENTREPOT_INDUSTRIEL: 'Entrepôt',
  TERRAIN: 'Terrain',
  IMMEUBLE: 'Immeuble',
  PARKING_BOX: 'Parking / box',
  LOT_PROGRAMME_NEUF: 'Lot de programme neuf'
};

const fmtDate = (d: Date): string => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const fmtMoney = (n: number): string => `${Math.round(n).toLocaleString('fr-FR')} F CFA`;

/** Pièces des biens : un jeu cohérent par bien, selon son type et son histoire. */
export async function seedPropertyDocuments(env: CommercialEnv): Promise<void> {
  const { prisma, tenantId, rng, ctx, log } = env;
  const [tenant, properties, existing] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.property.findMany({
      where: { tenantId },
      select: {
        id: true,
        internalReference: true,
        title: true,
        address: true,
        locationZone: true,
        propertyType: true,
        surfaceArea: true,
        price: true,
        status: true,
        createdAt: true,
        ownershipType: true,
        ownershipShares: {
          take: 1,
          orderBy: { sharePercent: 'desc' },
          select: { ownerClient: { select: { user: { select: { fullName: true, email: true } } } } }
        },
        mandates: { where: { tenantId }, select: { startDate: true, endDate: true, isActive: true }, take: 2 }
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    }),
    prisma.propertyDocument.findMany({ where: { tenantId }, select: { propertyId: true } })
  ]);
  const done = new Set(existing.map(d => d.propertyId));
  const agency = tenant?.name?.replace(/^Test — /, '') ?? 'Agence';

  const soldAgreements = await prisma.saleAgreement.findMany({
    where: { tenantId, status: 'COMPLETED' },
    select: { propertyId: true, deedDate: true, price: true, notaryName: true }
  });
  const soldByProperty = new Map(soldAgreements.map(a => [a.propertyId, a]));

  let written = 0;
  let touched = 0;
  for (const p of properties) {
    if (done.has(p.id)) continue;
    touched += 1;
    const owner = p.ownershipShares[0]?.ownerClient.user;
    const ownerName = owner?.fullName ?? owner?.email ?? agency;
    const typeLabel = PROPERTY_TYPE_LABELS[p.propertyType] ?? p.propertyType;
    const land = p.propertyType === 'TERRAIN';
    const building = p.propertyType === 'IMMEUBLE';
    const base = addDays(p.createdAt, -between(rng, 2, 20));
    const surface = Number(p.surfaceArea ?? 0);
    const tfNumber = `TF ${between(rng, 10000, 99999)} — Abidjan`;
    const sold = soldByProperty.get(p.id);

    const specs: Array<{
      type: DocType;
      date: Date;
      expiration?: Date | null;
      required?: boolean;
      lines: string[];
    }> = [];

    specs.push({
      type: 'TITLE_DEED',
      date: addDays(base, -between(rng, 200, 4000)),
      required: true,
      lines: [
        '# Conservation foncière d’Abidjan',
        `Titre foncier n° ${tfNumber}`,
        `Désignation : ${typeLabel}${surface ? `, superficie ${surface} m²` : ''}`,
        `Situation : ${p.address ?? p.locationZone ?? 'Abidjan'}`,
        `Propriétaire inscrit : ${ownerName}`,
        '# Charges et mentions',
        'Aucune hypothèque ni servitude inscrite à la date de délivrance du présent extrait.',
        `Extrait délivré le ${fmtDate(addDays(base, -between(rng, 5, 40)))} pour le dossier ${p.internalReference}.`
      ]
    });

    if (land) {
      specs.push({
        type: 'LAND_CONCESSION',
        date: addDays(base, -between(rng, 20, 200)),
        lines: [
          '# Arrêté de concession définitive',
          `Parcelle : ${p.title}`,
          `Bénéficiaire : ${ownerName}`,
          `Superficie : ${surface || 600} m²`,
          'Arrêté pris conformément aux dispositions du Code foncier domanial en vigueur.'
        ]
      });
      specs.push({
        type: 'OTHER',
        date: addDays(base, -between(rng, 5, 60)),
        lines: [
          '# Procès-verbal de bornage',
          `Bien : ${p.title} (${p.internalReference})`,
          'Bornage contradictoire réalisé en présence des propriétaires riverains.',
          'Quatre bornes posées et relevées par le géomètre-expert ; coordonnées reportées au plan.'
        ]
      });
    }
    if (building) {
      specs.push({
        type: 'BUILDING_PERMIT',
        date: addDays(base, -between(rng, 300, 3000)),
        lines: [
          '# Permis de construire',
          `Immeuble : ${p.title}`,
          `Maître d’ouvrage : ${ownerName}`,
          'Construction à usage d’habitation et de commerce, rez-de-chaussée plus trois étages.',
          'Conformité vérifiée par la direction de l’urbanisme.'
        ]
      });
    }

    if (!land && rng() < 0.85) {
      const r = rng();
      // Diagnostics : une part expirée, une part arrivant à échéance, le reste valide.
      const expiration =
        r < 0.12
          ? addDays(ctx.end, -between(rng, 10, 220))
          : r < 0.3
            ? addDays(ctx.end, between(rng, 5, 55))
            : addDays(ctx.end, between(rng, 120, 900));
      specs.push({
        type: 'TECHNICAL_DIAGNOSIS',
        date: addDays(expiration, -730),
        expiration,
        required: true,
        lines: [
          '# Diagnostic technique du bien',
          `Bien : ${p.title}`,
          `Adresse : ${p.address ?? p.locationZone ?? 'Abidjan'}`,
          '# Résultats',
          'Installation électrique : conforme, tableau de protection remplacé récemment.',
          'Plomberie : aucune fuite constatée, pression correcte.',
          `Structure : ${pick(rng, ['aucun désordre apparent', 'fissures superficielles sans gravité', 'état général satisfaisant'])}.`,
          `Validité du diagnostic : jusqu’au ${fmtDate(expiration)}.`
        ]
      });
    }

    if (rng() < 0.5) {
      specs.push({
        type: 'PLAN',
        date: addDays(base, -between(rng, 30, 800)),
        lines: [
          '# Plan du bien',
          `Bien : ${p.title}`,
          `Superficie utile : ${surface ? Math.round(surface * 0.9) : 70} m²`,
          'Plan coté établi par le géomètre ; repères des points d’eau et du tableau électrique reportés.'
        ]
      });
    }
    if (rng() < 0.55) {
      const year = ctx.end.getFullYear() - between(rng, 0, 1);
      specs.push({
        type: 'TAX_DOCUMENT',
        date: new Date(Date.UTC(year, 2, 15)),
        lines: [
          `# Avis d’imposition à la taxe foncière ${year}`,
          `Contribuable : ${ownerName}`,
          `Immeuble : ${p.title} (${tfNumber})`,
          `Montant dû : ${fmtMoney(between(rng, 60, 900) * 1000)}`,
          'Échéance de paiement : 30 juin. Quitus remis par la Direction générale des impôts.'
        ]
      });
    }
    if (!land && rng() < 0.45) {
      const expiration = rng() < 0.2 ? addDays(ctx.end, between(rng, 6, 40)) : addDays(ctx.end, between(rng, 90, 340));
      specs.push({
        type: 'INSURANCE',
        date: addDays(expiration, -365),
        expiration,
        lines: [
          '# Attestation d’assurance multirisque immeuble',
          `Assuré : ${ownerName}`,
          `Bien assuré : ${p.title}`,
          `Compagnie : ${pick(rng, ['NSIA Assurances', 'Allianz Côte d’Ivoire', 'Saham Assurance CI', 'SUNU Assurances'])}`,
          `Période de garantie jusqu’au ${fmtDate(expiration)}.`
        ]
      });
    }
    if (p.ownershipType === 'TENANT' && p.mandates.length === 0) {
      // Bien détenu par l'agence : pas de mandat.
    } else {
      const m = p.mandates.find(x => x.isActive) ?? p.mandates[0];
      if (m) {
        specs.push({
          type: 'MANDATE',
          date: m.startDate,
          lines: [
            '# Mandat de gestion confié à l’agence',
            `Mandant : ${ownerName}`,
            `Mandataire : ${agency}`,
            `Bien : ${p.title} — ${p.address ?? p.locationZone ?? 'Abidjan'}`,
            `Prise d’effet : ${fmtDate(m.startDate)}${m.endDate ? `, échéance : ${fmtDate(m.endDate)}` : ''}`,
            'Missions : recherche de locataires, établissement des baux, encaissement des loyers, suivi des travaux.',
            'Honoraires de gestion convenus entre les parties à la signature du mandat.'
          ]
        });
      }
    }
    if (sold?.deedDate) {
      specs.push({
        type: 'NOTARIAL_DEED',
        date: sold.deedDate,
        lines: [
          '# Acte notarié de vente',
          `Étude : ${sold.notaryName ?? 'Étude notariale, Plateau'}`,
          `Vendeur : ${ownerName}`,
          `Bien : ${p.title} (${tfNumber})`,
          `Prix de vente : ${fmtMoney(Number(sold.price))}`,
          `Acte signé le ${fmtDate(sold.deedDate)} ; formalités de mutation engagées auprès de la conservation foncière.`
        ]
      });
    }

    let n = 0;
    for (const s of specs) {
      n += 1;
      const label = DOC_LABELS[s.type];
      const file = await writeDemoPdf(
        ['properties', p.id, 'documents'],
        `${label.fileBase}-${String(n).padStart(2, '0')}.pdf`,
        `${label.title} — ${p.internalReference}`,
        [...s.lines, `Établi le ${fmtDate(s.date)}.`]
      );
      const expired = s.expiration ? s.expiration.getTime() < ctx.end.getTime() : false;
      const created = new Date(Math.min(addDays(s.date, 0).getTime(), ctx.end.getTime() - 3_600_000));
      const data: Prisma.PropertyDocumentUncheckedCreateInput = {
        propertyId: p.id,
        tenantId,
        documentType: s.type,
        filePath: file.filePath,
        fileUrl: file.fileUrl,
        fileName: `${label.title} — ${p.title}.pdf`,
        fileSize: file.fileSize,
        mimeType: 'application/pdf',
        expirationDate: s.expiration ?? null,
        isRequired: s.required ?? false,
        isValid: !expired,
        warningSentAt:
          s.expiration && !expired && s.expiration.getTime() - ctx.end.getTime() < 45 * 86_400_000
            ? addDays(ctx.end, -between(rng, 1, 8))
            : null,
        createdAt: created > p.createdAt ? created : addDays(p.createdAt, 1)
      };
      await prisma.propertyDocument.create({ data });
      written += 1;
    }
  }
  log(`commercial : ${written} documents de biens (PDF lisibles) pour ${touched} biens.`);
}

/** Modèles de documents propres à l'agence (contrats de bail, quittances, relevés). */
export async function seedDocumentTemplates(env: CommercialEnv): Promise<void> {
  const { prisma, tenantId, adminUserId, ctx, rng, log } = env;
  if ((await prisma.documentTemplate.count({ where: { tenant_id: tenantId } })) > 0) {
    log('commercial : modèles de documents déjà présents.');
    return;
  }
  const root = getProjectRoot();
  const source = path.join(root, 'assets', 'modeles_documents');
  const targetDir = path.join(source, 'tenants', tenantId);
  const { extractPlaceholders } = await import('../../../src/services/document-template-service');

  const defs: Array<{
    docType: 'LEASE_HABITATION' | 'LEASE_COMMERCIAL' | 'RENT_RECEIPT' | 'RENT_STATEMENT';
    file: string;
    name: string;
    status: 'ACTIVE' | 'INACTIVE';
    isDefault: boolean;
    version: number;
    ageDays: number;
  }> = [
    {
      docType: 'LEASE_HABITATION',
      file: 'contrat_bail_habitation.docx',
      name: 'Contrat de bail d’habitation — modèle de l’agence',
      status: 'ACTIVE',
      isDefault: true,
      version: 3,
      ageDays: 540
    },
    {
      docType: 'LEASE_HABITATION',
      file: 'contrat_bail_habitation.docx',
      name: 'Contrat de bail d’habitation (ancienne version 2023)',
      status: 'INACTIVE',
      isDefault: false,
      version: 1,
      ageDays: 1020
    },
    {
      docType: 'LEASE_COMMERCIAL',
      file: 'contrat_bail_commercial.docx',
      name: 'Contrat de bail commercial — modèle de l’agence',
      status: 'ACTIVE',
      isDefault: true,
      version: 2,
      ageDays: 700
    },
    {
      docType: 'RENT_RECEIPT',
      file: 'Reçu_Loyer.docx',
      name: 'Quittance de loyer — papier à en-tête de l’agence',
      status: 'ACTIVE',
      isDefault: true,
      version: 2,
      ageDays: 650
    },
    {
      docType: 'RENT_STATEMENT',
      file: 'Releve_Compte.docx',
      name: 'Relevé de compte locataire',
      status: 'ACTIVE',
      isDefault: true,
      version: 1,
      ageDays: 600
    }
  ];

  let created = 0;
  for (const def of defs) {
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(path.join(source, def.file));
    } catch {
      log(`commercial : modèle de base ${def.file} introuvable, modèle ignoré.`);
      continue;
    }
    await fs.mkdir(targetDir, { recursive: true });
    const storedFilename = `${def.docType}_${def.version}_${def.status}_${created}.docx`;
    const storagePath = path.join(targetDir, storedFilename);
    await fs.writeFile(storagePath, buffer);
    let placeholders: string[] = [];
    try {
      placeholders = await extractPlaceholders(storagePath);
    } catch {
      placeholders = [];
    }
    const createdAt = addDays(ctx.end, -def.ageDays + between(rng, 0, 5));
    await prisma.documentTemplate.create({
      data: {
        tenant_id: tenantId,
        doc_type: def.docType,
        name: def.name,
        status: def.status,
        is_default: def.isDefault,
        original_filename: def.file,
        stored_filename: storedFilename,
        storage_path: storagePath,
        file_size: buffer.length,
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        file_hash_sha256: createHash('sha256').update(buffer).update(storedFilename).digest('hex'),
        placeholders,
        version: def.version,
        created_by_user_id: adminUserId,
        created_at: createdAt
      }
    });
    created += 1;
  }
  log(`commercial : ${created} modèles de documents de l'agence.`);
}
