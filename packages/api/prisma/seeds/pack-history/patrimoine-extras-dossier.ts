/**
 * Dossier documentaire du patrimoine : pièces de chaque bien (titres, actes,
 * avis, attestations, diagnostics, plans), fichiers réels des documents
 * patrimoniaux déjà écrits sans fichier, carnet d'entretien, sinistres avec
 * leurs pièces et dossiers de régularisation foncière.
 *
 * Idempotent par bloc (jamais de doublon sur un tenant déjà peuplé) ; chaque
 * fichier est écrit sur disque au chemin que le module attend.
 */
import * as path from 'path';
import type { InsuranceClaimStatus, Prisma } from '@prisma/client';
import { env } from '../../../src/config/env';
import { LAND_TRACKS } from '../../../src/lib/patrimoine/land/tracks';
import { getUploadsRoot } from '../../../src/utils/project-root';
import { buildPdf, writeUpload } from './seed-files';
import {
  assetRecord,
  buildingPermit,
  claimQuote,
  diagnostic,
  expertReport,
  floorPlan,
  genericRecord,
  hnum,
  insurerLetter,
  insuranceCertificate,
  landConcession,
  NOTARIES,
  notarialDeed,
  repairInvoice,
  surveyReport,
  taxNotice,
  titleDeed,
  villageAttestation,
  type DocContent
} from './patrimoine-extras-docs';
import { dateFr, fileExists, sceneImage, slug, xof, type SceneKind } from './patrimoine-extras-files';
import { author, facts, putPropertyDoc, type PatProperty, type PatState } from './patrimoine-extras-state';
import { addDays, between, monthsAgo } from './types';

const atDay = (d: Date, day: number): Date => new Date(d.getFullYear(), d.getMonth(), day, 10, 0, 0, 0);
const BUILT = (p: PatProperty): boolean => p.type !== 'TERRAIN';
const COVERAGE_LABEL: Record<string, string> = {
  MULTIRISK_HOME: 'multirisque habitation',
  MULTIRISK_BUILDING: 'multirisque immeuble',
  OWNER_LIABILITY: 'responsabilité civile propriétaire non occupant',
  OTHER: 'garantie spécifique'
};

// ------------------------------------------------------------------ terrain en cours de régularisation

/**
 * Un terrain dont le titre n'existe pas encore (dossier ACD en cours) porte une
 * attestation villageoise, pas un titre foncier : on aligne le statut juridique
 * de l'actif et l'intitulé de ses documents sur le dossier de régularisation.
 */
export async function alignTerrain(s: PatState): Promise<void> {
  const { prisma, tenantId, log } = s.ctx;
  for (const p of s.properties.filter(x => x.type === 'TERRAIN' && x.assetId)) {
    if (p.legalStatus !== 'ATTESTATION_COUTUMIERE') {
      const asset = await prisma.asset.findUnique({ where: { id: p.assetId as string }, select: { details: true } });
      await prisma.asset.update({
        where: { id: p.assetId as string },
        data: { details: { ...((asset?.details ?? {}) as object), legalStatus: 'ATTESTATION_COUTUMIERE' } }
      });
      p.legalStatus = 'ATTESTATION_COUTUMIERE';
    }
    const rows = await prisma.patrimonyDocument.findMany({
      where: { tenantId, propertyId: p.id, type: { in: ['TITLE_DEED', 'NOTARIAL_DEED'] } },
      select: { id: true, type: true }
    });
    for (const row of rows) {
      await prisma.patrimonyDocument.update({
        where: { id: row.id },
        data: {
          type: 'OTHER',
          title:
            row.type === 'TITLE_DEED'
              ? `Attestation villageoise de cession — ${p.title}`
              : `Acte sous seing privé de cession — ${p.title}`
        }
      });
    }
  }
  log('patrimoine-extras : statut juridique du terrain aligné sur son dossier de régularisation.');
}

// ------------------------------------------------------------------ documents de bien

export async function seedPropertyDocuments(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log } = s.ctx;
  const [policies, taxes, loans] = await Promise.all([
    prisma.insurancePolicy.findMany({ where: { tenantId } }),
    prisma.propertyExpense.findMany({
      where: { tenantId, category: 'PROPERTY_TAX' },
      orderBy: { paidAt: 'desc' },
      select: { propertyId: true, label: true, amount: true, paidAt: true }
    }),
    prisma.propertyLoan.findMany({ where: { tenantId } })
  ]);
  let created = 0;
  const put = async (p: PatProperty, spec: Parameters<typeof putPropertyDoc>[2]): Promise<string> => {
    const r = await putPropertyDoc(s, p, spec);
    if (r.created) created += 1;
    return r.id;
  };

  for (const [i, p] of s.properties.entries()) {
    const f = facts(p);
    const acq = p.createdAt;
    const notary = NOTARIES[i % NOTARIES.length];

    if (p.type === 'TERRAIN') {
      await put(p, {
        type: 'OTHER',
        fileName: `Attestation villageoise de cession — ${p.title}.pdf`,
        createdAt: acq,
        content: villageAttestation(f, s.ownerName, acq),
        required: true
      });
      await put(p, {
        type: 'PLAN',
        fileName: `Dossier technique du géomètre — ${p.title}.pdf`,
        createdAt: monthsAgo(end, 15),
        content: floorPlan(f, monthsAgo(end, 15))
      });
      await put(p, {
        type: 'PLAN',
        fileName: `Procès-verbal de bornage contradictoire — ${p.title}.pdf`,
        createdAt: monthsAgo(end, 11),
        content: surveyReport(f, monthsAgo(end, 11))
      });
      await put(p, {
        type: 'OTHER',
        fileName: `Récépissé de dépôt de la demande d'ACD — ${p.title}.pdf`,
        createdAt: monthsAgo(end, 6),
        content: genericRecord(
          "Récépissé de dépôt de la demande d'ACD",
          "Ministère de la Construction, du Logement et de l'Urbanisme — guichet foncier",
          f,
          [
            "Le dossier de demande d'arrêté de concession définitive a été déposé et enregistré.",
            'Délai moyen de traitement : plusieurs mois.'
          ],
          monthsAgo(end, 6)
        )
      });
    } else {
      if (p.legalStatus === 'ACD') {
        await put(p, {
          type: 'LAND_CONCESSION',
          fileName: `Arrêté de concession définitive (ACD) — ${p.title}.pdf`,
          createdAt: acq,
          content: landConcession(f, s.ownerName, acq),
          required: true
        });
      } else {
        await put(p, {
          type: 'TITLE_DEED',
          fileName: `Titre foncier — ${p.title}.pdf`,
          createdAt: acq,
          content: titleDeed(f, s.ownerName, acq),
          required: true
        });
      }
      await put(p, {
        type: 'NOTARIAL_DEED',
        fileName: `Acte de vente notarié — ${p.title}.pdf`,
        createdAt: acq,
        content: notarialDeed(f, s.ownerName, p.acquisitionCost ?? 0, acq, notary),
        required: true
      });
    }

    // Avis de taxe foncière : les deux derniers exercices.
    for (const t of taxes.filter(x => x.propertyId === p.id).slice(0, 2)) {
      const year = Number(/(\d{4})/.exec(t.label)?.[1] ?? t.paidAt.getFullYear());
      await put(p, {
        type: 'TAX_DOCUMENT',
        fileName: `Avis de taxe foncière ${year} — ${p.title}.pdf`,
        createdAt: addDays(t.paidAt, -35),
        content: taxNotice(f, s.ownerName, year, Number(t.amount), t.paidAt)
      });
    }

    // Attestations d'assurance : une par police, rattachée à la police.
    for (const pol of policies.filter(x => x.propertyId === p.id)) {
      const warn = pol.endDate.getTime() < addDays(end, 30).getTime() ? addDays(pol.endDate, -30) : null;
      const id = await put(p, {
        type: 'INSURANCE',
        fileName: `Attestation d'assurance ${pol.policyNumber} — ${p.title}.pdf`,
        createdAt: pol.startDate,
        expiration: pol.endDate,
        required: true,
        warningSentAt: warn && warn.getTime() > pol.startDate.getTime() ? warn : null,
        content: insuranceCertificate(
          f,
          s.ownerName,
          pol.insurer,
          pol.policyNumber,
          COVERAGE_LABEL[pol.coverageType] ?? 'multirisque',
          pol.startDate,
          pol.endDate,
          Number(pol.annualPremium ?? 0)
        )
      });
      if (!pol.documentId) {
        await prisma.insurancePolicy.update({ where: { id: pol.id }, data: { documentId: id } });
      }
    }

    if (BUILT(p)) {
      const performedAgo = i % 5 === 0 ? 38 : 4 + ((i * 7) % 30);
      const performed = monthsAgo(end, performedAgo);
      await put(p, {
        type: 'TECHNICAL_DIAGNOSIS',
        fileName: `Diagnostic technique ${performed.getFullYear()} — ${p.title}.pdf`,
        createdAt: performed,
        expiration: monthsAgo(end, performedAgo - 36),
        warningSentAt: performedAgo >= 35 ? monthsAgo(end, performedAgo - 35) : null,
        content: diagnostic(f, performed, monthsAgo(end, performedAgo - 36))
      });
      await put(p, {
        type: 'PLAN',
        fileName: `Plan des niveaux — ${p.title}.pdf`,
        createdAt: acq,
        content: floorPlan(f, acq)
      });
      if (['MAISON_VILLA', 'IMMEUBLE', 'ENTREPOT_INDUSTRIEL', 'BUREAU', 'DUPLEX_TRIPLEX'].includes(p.type)) {
        const issued = monthsAgo(new Date(acq), 18);
        await put(p, {
          type: 'BUILDING_PERMIT',
          fileName: `Permis de construire — ${p.title}.pdf`,
          createdAt: issued,
          content: buildingPermit(f, s.ownerName, issued)
        });
      }
    }

    for (const loan of loans.filter(x => x.propertyId === p.id)) {
      const lines = [
        `Prêteur : ${loan.lender}`,
        `Capital emprunté : ${xof(Number(loan.capitalAmount))} au taux de ${Number(loan.interestRate)} % l'an.`,
        `Mensualité : ${xof(Number(loan.monthlyPayment))} — première échéance le ${dateFr(loan.startDate)}, dernière le ${dateFr(loan.endDate)}.`,
        `Capital restant dû au ${dateFr(end)} : ${xof(Number(loan.remainingCapital))}.`,
        '',
        '# Garanties',
        'Hypothèque de premier rang sur le bien financé, assurance décès-invalidité de l’emprunteur.'
      ];
      await put(p, {
        type: 'OTHER',
        fileName: `Offre de prêt et tableau d'amortissement — ${loan.lender} — ${p.title}.pdf`,
        createdAt: loan.startDate,
        content: { title: 'Offre de prêt immobilier', lines: [`# ${loan.lender}`, '', ...facts2(p), ...lines] }
      });
    }
  }
  log(`patrimoine-extras : ${created} document(s) de bien écrits (fichiers réels).`);
}

function facts2(p: PatProperty): string[] {
  return [`Bien financé : ${p.title}`, `Adresse : ${p.address}`, ''];
}

// ------------------------------------------------------------------ documents patrimoniaux (fichiers manquants)

interface SeedPatDoc {
  slugSuffix: string;
  type: 'TITLE_DEED' | 'NOTARIAL_DEED' | 'TAX_DOCUMENT' | 'TECHNICAL_DIAGNOSIS' | 'FLOOR_PLAN' | 'BUILDING_PERMIT';
  title: string;
}

/** Écrit les fichiers des `patrimony_documents` dont le fichier manque et complète le dossier de chaque bien. */
export async function seedPatrimonyDocuments(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log } = s.ctx;
  const [policies, taxes] = await Promise.all([
    prisma.insurancePolicy.findMany({ where: { tenantId } }),
    prisma.propertyExpense.findMany({
      where: { tenantId, category: 'PROPERTY_TAX' },
      orderBy: { paidAt: 'desc' },
      select: { propertyId: true, label: true, amount: true, paidAt: true }
    })
  ]);

  // 1. lignes complémentaires (idempotent par fileUrl)
  let added = 0;
  const urlOf = (ref: string, suffix: string): string => `/uploads/patrimoine/seed/${tenantId}/${ref}-${suffix}.pdf`;
  for (const [i, p] of s.properties.entries()) {
    const ref = p.ref.replace(/^PAT-/, '');
    const wanted: SeedPatDoc[] = [];
    if (BUILT(p)) wanted.push({ slugSuffix: 'plan', type: 'FLOOR_PLAN', title: `Plan des niveaux — ${p.title}` });
    if (p.type !== 'TERRAIN')
      wanted.push({ slugSuffix: 'acte', type: 'NOTARIAL_DEED', title: `Acte de vente notarié — ${p.title}` });
    wanted.push({
      slugSuffix: 'taxe',
      type: 'TAX_DOCUMENT',
      title: `Avis de taxe foncière ${end.getFullYear() - (end.getMonth() < 3 ? 1 : 0)} — ${p.title}`
    });
    if (BUILT(p) && !s.isPro) {
      wanted.push({
        slugSuffix: 'diagnostic',
        type: 'TECHNICAL_DIAGNOSIS',
        title: `Diagnostic technique — ${p.title}`
      });
    }
    for (const w of wanted) {
      const fileUrl = urlOf(ref, w.slugSuffix);
      const exists = await prisma.patrimonyDocument.findFirst({
        where: { tenantId, fileUrl },
        select: { id: true }
      });
      if (exists) continue;
      const created = monthsAgo(end, w.type === 'TAX_DOCUMENT' ? 3 : Math.min(36, 6 + ((i * 5) % 30)));
      await prisma.patrimonyDocument.create({
        data: {
          tenantId,
          propertyId: p.id,
          assetId: p.assetId,
          title: w.title,
          type: w.type,
          fileUrl,
          expiresAt: w.type === 'TECHNICAL_DIAGNOSIS' ? monthsAgo(end, -between(s.ctx.rng, 6, 30)) : null,
          createdAt: created
        }
      });
      added += 1;
    }
  }

  // 2. fichiers : chaque ligne dont le fichier manque reçoit un PDF lisible
  const rows = await prisma.patrimonyDocument.findMany({ where: { tenantId } });
  const propById = new Map(s.properties.map(p => [p.id, p]));
  let written = 0;
  for (const row of rows) {
    if (!row.fileUrl.startsWith('/uploads/')) continue;
    const segments = row.fileUrl.replace(/^\/uploads\//, '').split('/');
    const fileName = segments.pop() as string;
    const absolute = path.join(getUploadsRoot(env.UPLOADS_DIR), ...segments, fileName);
    if (await fileExists(absolute)) continue;

    const p = row.propertyId ? propById.get(row.propertyId) : undefined;
    const f = p ? facts(p) : null;
    let content: DocContent;
    if (!p || !f) {
      content = assetRecord(
        row.title,
        'Dossier patrimonial',
        ['Pièce justificative archivée au dossier de l’actif.'],
        row.createdAt
      );
    } else if (/villageoise/i.test(row.title)) {
      content = villageAttestation(f, s.ownerName, row.createdAt);
    } else if (/sous seing privé/i.test(row.title)) {
      content = genericRecord(
        'Acte sous seing privé de cession',
        'Convention entre les parties',
        f,
        [`Le prix de cession de ${xof(p.acquisitionCost ?? 0)} a été payé comptant, devant témoins.`],
        row.createdAt
      );
    } else {
      switch (row.type) {
        case 'TITLE_DEED':
          content =
            p.legalStatus === 'ACD'
              ? landConcession(f, s.ownerName, row.createdAt)
              : titleDeed(f, s.ownerName, row.createdAt);
          break;
        case 'NOTARIAL_DEED':
          content = notarialDeed(f, s.ownerName, p.acquisitionCost ?? 0, row.createdAt, NOTARIES[hnum(p.ref, 0, 2)]);
          break;
        case 'TAX_DOCUMENT': {
          const t = taxes.find(x => x.propertyId === p.id);
          content = taxNotice(
            f,
            s.ownerName,
            t ? Number(/(\d{4})/.exec(t.label)?.[1] ?? t.paidAt.getFullYear()) : end.getFullYear(),
            t ? Number(t.amount) : hnum(p.ref, 40, 400) * 1000,
            t?.paidAt ?? row.createdAt
          );
          break;
        }
        case 'INSURANCE': {
          const pol =
            policies.find(
              x =>
                x.propertyId === p.id &&
                row.expiresAt &&
                Math.abs(x.endDate.getTime() - row.expiresAt.getTime()) < 5 * 86_400_000
            ) ?? policies.filter(x => x.propertyId === p.id)[0];
          content = pol
            ? insuranceCertificate(
                f,
                s.ownerName,
                pol.insurer,
                pol.policyNumber,
                COVERAGE_LABEL[pol.coverageType] ?? 'multirisque',
                pol.startDate,
                pol.endDate,
                Number(pol.annualPremium ?? 0)
              )
            : genericRecord(
                "Attestation d'assurance",
                'Compagnie d’assurance',
                f,
                ['Le bien est couvert par un contrat multirisque.'],
                row.createdAt
              );
          break;
        }
        case 'TECHNICAL_DIAGNOSIS':
          content = diagnostic(f, row.createdAt, row.expiresAt ?? monthsAgo(end, -12));
          break;
        case 'BUILDING_PERMIT':
          content = buildingPermit(f, s.ownerName, row.createdAt);
          break;
        case 'FLOOR_PLAN':
          content = floorPlan(f, row.createdAt);
          break;
        default:
          content = genericRecord(
            row.title,
            'Dossier patrimonial',
            f,
            ['Pièce archivée au dossier du bien.'],
            row.createdAt
          );
      }
    }
    await writeUpload(segments, fileName, buildPdf(content.title, content.lines));
    written += 1;
  }
  log(
    `patrimoine-extras : ${added} document(s) patrimonial(aux) ajouté(s), ${written} fichier(s) écrit(s) sur ${rows.length}.`
  );
}

/** Pièces des actifs non immobiliers (facture, relevé, statuts, reconnaissance de dette…). */
export async function seedAssetDocuments(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log } = s.ctx;
  const assets = await prisma.asset.findMany({
    where: { tenantId, assetClass: { not: 'REAL_ESTATE' } },
    select: {
      id: true,
      name: true,
      assetClass: true,
      acquisitionDate: true,
      acquisitionCost: true,
      details: true,
      createdAt: true
    }
  });
  let added = 0;
  for (const a of assets) {
    const fileUrl = `/uploads/patrimoine/seed/${tenantId}/actif-${slug(a.name)}.pdf`;
    if (await prisma.patrimonyDocument.findFirst({ where: { tenantId, fileUrl }, select: { id: true } })) continue;
    const when = a.acquisitionDate ?? a.createdAt;
    const d = (a.details ?? {}) as Record<string, unknown>;
    const cost = a.acquisitionCost == null ? null : Number(a.acquisitionCost);
    let title: string;
    let issuer: string;
    let lines: string[];
    switch (a.assetClass) {
      case 'VEHICLE_EQUIPMENT':
        title = `Facture d'achat et carte grise — ${a.name}`;
        issuer = 'Concessionnaire automobile, Abidjan-Marcory';
        lines = [
          `Véhicule : ${a.name}`,
          `Immatriculation : ${String(d.registration ?? 'en cours')}`,
          `Prix d'achat : ${xof(cost ?? 0)}`
        ];
        break;
      case 'CASH':
        title = `Relevé de compte — ${a.name}`;
        issuer = String(d.institution ?? 'Établissement financier');
        lines = [
          `Compte : ${a.name}`,
          `Relevé arrêté au ${dateFr(end)}.`,
          'Solde et mouvements du trimestre en pièce jointe du relevé.'
        ];
        break;
      case 'SAVINGS_INVESTMENT':
        title = `Relevé annuel et conditions du contrat — ${a.name}`;
        issuer = String(d.organization ?? 'Organisme gestionnaire');
        lines = [
          `Placement : ${a.name}`,
          `Versements cumulés : ${xof(Number(d.principal ?? cost ?? 0))}`,
          `Rendement attendu : ${String(d.expectedRatePercent ?? 4)} % l'an.`
        ];
        break;
      case 'BUSINESS_EQUITY':
        title = `Statuts et attestation de détention des parts — ${a.name}`;
        issuer = String(d.companyName ?? 'Société');
        lines = [
          `Détention : ${String(d.ownershipPercent ?? '')} % du capital.`,
          `Coût d'acquisition des parts : ${xof(cost ?? 0)}`
        ];
        break;
      case 'RECEIVABLE':
        title = `Reconnaissance de dette — ${a.name}`;
        issuer = `Débiteur : ${String(d.debtor ?? '')}`;
        lines = [
          `Montant dû en principal : ${xof(Number(d.principal ?? cost ?? 0))}`,
          `Taux : ${String(d.ratePercent ?? 0)} % l'an.`,
          `Échéance : ${String(d.dueDate ?? 'à convenir')}.`
        ];
        break;
      case 'AGRICULTURE':
        title = `Attestation foncière et plan de la plantation — ${a.name}`;
        issuer = 'Direction régionale de l’agriculture';
        lines = [
          `Exploitation : ${a.name}`,
          `Superficie : ${String(d.areaHectares ?? '')} ha.`,
          `Culture : ${String(d.crop ?? '')}.`
        ];
        break;
      default:
        title = `Justificatif de propriété — ${a.name}`;
        issuer = 'Dossier patrimonial';
        lines = [
          `Actif : ${a.name}`,
          cost ? `Valeur d'acquisition : ${xof(cost)}` : 'Valeur d’acquisition : non renseignée.'
        ];
    }
    const doc = assetRecord(title, issuer, lines, when);
    await writeUpload(['patrimoine', 'seed', tenantId], `actif-${slug(a.name)}.pdf`, buildPdf(doc.title, doc.lines));
    await prisma.patrimonyDocument.create({
      data: { tenantId, assetId: a.id, title, type: 'OTHER', fileUrl, createdAt: when }
    });
    added += 1;
  }
  log(`patrimoine-extras : ${added} pièce(s) d'actif non immobilier écrite(s).`);
}

// ------------------------------------------------------------------ carnet d'entretien

const CATEGORY_RULES: Array<
  [
    RegExp,
    'PLUMBING' | 'ELECTRICAL' | 'AIR_CONDITIONING' | 'GENERATOR' | 'ROOF_WATERPROOFING' | 'PAINTING',
    number | null,
    number | null
  ]
> = [
  [/groupe/i, 'GENERATOR', 6, null],
  [/plomberie|fuite|sinistre/i, 'PLUMBING', null, null],
  [/climatis/i, 'AIR_CONDITIONING', 12, null],
  [/peinture|ravalement|façade/i, 'PAINTING', null, 24],
  [/électri|elec/i, 'ELECTRICAL', null, null],
  [/toiture|étanchéité/i, 'ROOF_WATERPROOFING', null, 24]
];

export async function seedMaintenanceLog(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log, rng } = s.ctx;
  if ((await prisma.maintenanceLogEntry.count({ where: { tenantId } })) > 0) return;

  // Entretien du groupe électrogène : deux passages par an sur les biens qui en ont un.
  const genTypes = ['MAISON_VILLA', 'IMMEUBLE', 'ENTREPOT_INDUSTRIEL', 'BUREAU', 'DUPLEX_TRIPLEX'];
  for (const p of s.properties.filter(x => genTypes.includes(x.type))) {
    for (let m = 5; m <= 35; m += 6) {
      if (monthsAgo(end, m).getTime() < p.createdAt.getTime()) continue;
      await prisma.propertyExpense.create({
        data: {
          tenantId,
          propertyId: p.id,
          category: 'ROUTINE_MAINTENANCE',
          label: 'Entretien du groupe électrogène',
          amount: between(rng, 85, 180) * 1000,
          currency: 'XOF',
          paidAt: atDay(monthsAgo(end, m), between(rng, 6, 24)),
          paymentMethod: 'BANK_TRANSFER',
          supplierName: 'Groupes Électrogènes Ivoire',
          recurrence: 'ONE_OFF'
        }
      });
    }
  }

  const expenses = await prisma.propertyExpense.findMany({
    where: { tenantId, category: { in: ['ROUTINE_MAINTENANCE', 'RENOVATION'] }, supplierName: { not: null } },
    orderBy: { paidAt: 'asc' }
  });
  const vendors = new Map<string, string>();
  const vendorFor = async (name: string): Promise<string> => {
    const known = vendors.get(name);
    if (known) return known;
    const found = await prisma.maintenanceVendor.findFirst({
      where: { tenant_id: tenantId, name },
      select: { id: true }
    });
    const id =
      found?.id ??
      (
        await prisma.maintenanceVendor.create({
          data: {
            tenant_id: tenantId,
            name,
            phone: `+225 07 ${hnum(name, 10, 99)} ${hnum(name, 10, 99)} ${hnum(`${name}x`, 10, 99)} ${hnum(`${name}y`, 10, 99)}`,
            email: `contact.${slug(name).toLowerCase().slice(0, 24)}@example.ci`,
            address: 'Abidjan, Côte d’Ivoire',
            specialties: [
              name.toLowerCase().includes('plomb')
                ? 'plumbing'
                : name.toLowerCase().includes('élec') || name.toLowerCase().includes('elec')
                  ? 'electrical'
                  : 'general'
            ],
            is_active: true
          },
          select: { id: true }
        })
      ).id;
    vendors.set(name, id);
    return id;
  };

  const propById = new Map(s.properties.map(p => [p.id, p]));
  let count = 0;
  for (const [i, e] of expenses.entries()) {
    const p = propById.get(e.propertyId);
    if (!p) continue;
    const rule = CATEGORY_RULES.find(r => r[0].test(e.label));
    const category = rule ? rule[1] : 'OTHER';
    const nextMonths = rule?.[2] ?? (/désinsect/i.test(e.label) ? 6 : /jardin/i.test(e.label) ? 3 : null);
    const warrantyMonths = rule?.[3] ?? null;
    let documentId: string | null = null;
    if (Number(e.amount) >= 100_000 || i % 3 === 0) {
      const when = e.paidAt;
      const f = facts(p);
      const inv = repairInvoice(f, e.supplierName as string, e.label, Number(e.amount), when);
      documentId = (
        await putPropertyDoc(s, p, {
          type: 'OTHER',
          fileName: `Facture ${e.supplierName} — ${e.label} (${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}) — ${p.title}.pdf`,
          createdAt: when,
          content: inv
        })
      ).id;
    }
    await prisma.maintenanceLogEntry.create({
      data: {
        tenantId,
        propertyId: p.id,
        category,
        performedAt: e.paidAt,
        vendorId: await vendorFor(e.supplierName as string),
        cost: Number(e.amount),
        currency: 'XOF',
        description: `${e.label} — intervention de ${e.supplierName}.`,
        nextDueDate: nextMonths
          ? new Date(e.paidAt.getFullYear(), e.paidAt.getMonth() + nextMonths, e.paidAt.getDate())
          : null,
        warrantyEndDate: warrantyMonths
          ? new Date(e.paidAt.getFullYear(), e.paidAt.getMonth() + warrantyMonths, e.paidAt.getDate())
          : null,
        documentId,
        createdByUserId: author(s),
        createdAt: e.paidAt
      }
    });
    count += 1;
  }
  log(`patrimoine-extras : ${count} intervention(s) au carnet d'entretien, ${vendors.size} prestataire(s).`);
}

// ------------------------------------------------------------------ sinistres

interface ClaimDef {
  ref: string;
  agoMonths: number;
  agoDays?: number;
  cause: 'WATER_DAMAGE' | 'FIRE' | 'THEFT' | 'STRUCTURAL' | 'STORM' | 'OTHER';
  claimed: number;
  indemnified?: number;
  deductible?: number;
  final: 'DECLARED' | 'INSURER_NOTIFIED' | 'EXPERTISE' | 'SETTLED' | 'REJECTED' | 'CLOSED';
  text: string;
  supplier: string;
  repair: string;
  reason?: string;
  scene: SceneKind;
}

const CLAIMS: readonly ClaimDef[] = [
  {
    ref: 'STU-MARCORY',
    agoMonths: 14,
    cause: 'WATER_DAMAGE',
    claimed: 1_200_000,
    indemnified: 950_000,
    deductible: 100_000,
    final: 'SETTLED',
    text: 'Dégât des eaux dû à une fuite de la colonne montante.',
    supplier: 'Plomberie Moderne d’Abobo',
    repair: 'Remplacement de la colonne montante et reprise des plafonds',
    scene: 'stain'
  },
  {
    ref: 'APP-2PLAT',
    agoMonths: 2,
    cause: 'STORM',
    claimed: 650_000,
    final: 'INSURER_NOTIFIED',
    text: 'Tôles arrachées par la tempête sur la terrasse.',
    supplier: 'Étanchéité Ivoire',
    repair: 'Remplacement des tôles de la terrasse',
    scene: 'storm'
  },
  {
    ref: 'BOU-TREICH',
    agoMonths: 26,
    cause: 'FIRE',
    claimed: 3_800_000,
    indemnified: 3_200_000,
    deductible: 250_000,
    final: 'CLOSED',
    text: 'Début d’incendie dans l’arrière-boutique, causé par un court-circuit sur une multiprise.',
    supplier: 'Bâtiment Plus Cocody',
    repair: 'Remise en état de l’arrière-boutique et reprise de l’installation électrique',
    scene: 'room'
  },
  {
    ref: 'VIL-RIVIERA',
    agoMonths: 20,
    cause: 'THEFT',
    claimed: 2_100_000,
    final: 'REJECTED',
    text: 'Vol de matériel de jardin et de deux climatiseurs extérieurs pendant l’absence du locataire.',
    supplier: 'Froid Service CI',
    repair: 'Remplacement de deux unités extérieures de climatisation',
    reason: 'l’effraction n’est pas caractérisée et le vol est survenu hors des horaires garantis par le contrat.',
    scene: 'facade'
  },
  {
    ref: 'IMM-YOP',
    agoMonths: 6,
    cause: 'STRUCTURAL',
    claimed: 5_500_000,
    final: 'EXPERTISE',
    text: 'Fissures traversantes apparues sur le mur pignon du troisième étage après de fortes pluies.',
    supplier: 'Bâtiment Plus Cocody',
    repair: 'Reprise du mur pignon et injection de résine',
    scene: 'facade'
  },
  {
    ref: 'APP-ANGRE',
    agoMonths: 0,
    agoDays: 25,
    cause: 'WATER_DAMAGE',
    claimed: 380_000,
    final: 'DECLARED',
    text: 'Infiltration depuis l’appartement du dessus : plafond du salon taché et cloqué.',
    supplier: 'Peinture Pro Abidjan',
    repair: 'Réfection du plafond du salon',
    scene: 'stain'
  },
  {
    ref: 'BUR-PLATEAU',
    agoMonths: 9,
    cause: 'OTHER',
    claimed: 1_450_000,
    indemnified: 1_200_000,
    deductible: 150_000,
    final: 'SETTLED',
    text: 'Surtension sur le réseau : onduleur et tableau divisionnaire détruits.',
    supplier: 'Élec-Habitat Cocody',
    repair: 'Remplacement de l’onduleur et du tableau divisionnaire',
    scene: 'room'
  },
  {
    ref: 'ENT-VRIDI',
    agoMonths: 1,
    cause: 'THEFT',
    claimed: 2_300_000,
    final: 'INSURER_NOTIFIED',
    text: 'Vol de câbles de cuivre et de la porte du local technique pendant la nuit.',
    supplier: 'Métal Concept CI',
    repair: 'Remplacement des câbles et de la porte métallique',
    scene: 'facade'
  }
];

const CHAIN = ['DECLARED', 'INSURER_NOTIFIED', 'EXPERTISE'] as const;
const CAUSE_LABEL: Record<string, string> = {
  WATER_DAMAGE: 'dégât des eaux',
  FIRE: 'incendie',
  THEFT: 'vol',
  STRUCTURAL: 'désordres structurels',
  STORM: 'tempête',
  OTHER: 'sinistre'
};

export async function seedClaims(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log } = s.ctx;
  const policies = await prisma.insurancePolicy.findMany({ where: { tenantId } });
  let created = 0;

  for (const def of CLAIMS) {
    const p = s.properties.find(x => x.ref === `PAT-${def.ref}`);
    if (!p) continue;
    const occurred = def.agoDays ? addDays(end, -def.agoDays) : atDay(monthsAgo(end, def.agoMonths), 12);
    if (occurred.getTime() < p.createdAt.getTime()) continue;
    const known = await prisma.insuranceClaim.findFirst({
      where: { tenantId, propertyId: p.id, cause: def.cause },
      select: { id: true }
    });
    if (known) continue;
    const policy =
      policies.find(x => x.propertyId === p.id && x.startDate <= occurred && x.endDate > occurred) ??
      policies.filter(x => x.propertyId === p.id).sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];
    if (!policy) continue;

    const steps: string[] = [...CHAIN];
    if (def.final === 'DECLARED') steps.length = 1;
    else if (def.final === 'INSURER_NOTIFIED') steps.length = 2;
    else if (def.final === 'SETTLED') steps.push('SETTLED');
    else if (def.final === 'CLOSED') steps.push('SETTLED', 'CLOSED');
    else if (def.final === 'REJECTED') steps.push('REJECTED');
    const stamp = (n: number): Date => new Date(Math.min(end.getTime(), addDays(occurred, 3 + n * 12).getTime()));
    const at = (status: string): Date | null => {
      const n = steps.indexOf(status);
      return n < 0 ? null : stamp(n);
    };

    let expenseId: string | null = null;
    if (def.final === 'SETTLED' || def.final === 'CLOSED') {
      expenseId = (
        await prisma.propertyExpense.create({
          data: {
            tenantId,
            propertyId: p.id,
            category: 'ROUTINE_MAINTENANCE',
            label: `Réparation suite au sinistre — ${CAUSE_LABEL[def.cause]}`,
            amount: def.claimed,
            currency: 'XOF',
            paidAt: addDays(occurred, 20),
            paymentMethod: 'BANK_TRANSFER',
            supplierName: def.supplier,
            recurrence: 'ONE_OFF'
          },
          select: { id: true }
        })
      ).id;
    }

    const claim = await prisma.insuranceClaim.create({
      data: {
        tenantId,
        propertyId: p.id,
        policyId: policy.id,
        expenseId,
        occurredAt: occurred,
        declaredAt: addDays(occurred, 2),
        cause: def.cause,
        description: def.text,
        status: def.final,
        claimedAmount: def.claimed,
        indemnifiedAmount: def.indemnified ?? null,
        deductible: def.deductible ?? null,
        rejectionReason: def.final === 'REJECTED' ? `Refus de la compagnie : ${def.reason}` : null,
        insurerNotifiedAt: at('INSURER_NOTIFIED'),
        expertiseAt: at('EXPERTISE'),
        settledAt: at('SETTLED'),
        rejectedAt: at('REJECTED'),
        closedAt: at('CLOSED'),
        createdByUserId: author(s),
        createdAt: addDays(occurred, 2)
      },
      select: { id: true }
    });
    await prisma.insuranceClaimStatusHistory.createMany({
      data: steps.map((status, n) => ({
        tenantId,
        claimId: claim.id,
        fromStatus: n === 0 ? null : (steps[n - 1] as InsuranceClaimStatus),
        toStatus: status as InsuranceClaimStatus,
        note: n === 0 ? 'Sinistre déclaré à la compagnie.' : null,
        changedByUserId: author(s),
        changedAt: n === 0 ? addDays(occurred, 2) : stamp(n)
      }))
    });
    created += 1;
  }

  // Pièces : tout sinistre sans pièce reçoit son dossier (photos, devis, rapport, lettre, facture).
  const claims = await prisma.insuranceClaim.findMany({
    where: { tenantId, documents: { none: {} } },
    include: { policy: { select: { insurer: true, policyNumber: true } } }
  });
  let docs = 0;
  for (const c of claims) {
    const p = s.properties.find(x => x.id === c.propertyId);
    if (!p) continue;
    const def = CLAIMS.find(d => `PAT-${d.ref}` === p.ref && d.cause === c.cause);
    const scene: SceneKind = def?.scene ?? 'room';
    const supplier = def?.supplier ?? 'Bâtiment Plus Cocody';
    const repair = def?.repair ?? `Remise en état après ${CAUSE_LABEL[c.cause]}`;
    const f = facts(p);
    const claimed = Number(c.claimedAmount);
    const tag = `${CAUSE_LABEL[c.cause]} ${dateFr(c.occurredAt)}`;
    const attach = async (
      kind: 'PHOTO_BEFORE' | 'PHOTO_AFTER' | 'QUOTE' | 'EXPERT_REPORT' | 'INSURER_LETTER' | 'INVOICE',
      docType: 'OTHER' | 'INSURANCE',
      fileName: string,
      when: Date,
      content?: DocContent,
      png?: Buffer
    ): Promise<void> => {
      const { id } = await putPropertyDoc(s, p, { type: docType, fileName, createdAt: when, content, png });
      await prisma.insuranceClaimDocument.create({ data: { tenantId, claimId: c.id, documentId: id, kind } });
      docs += 1;
    };
    const variant = hnum(c.id, 0, 4);
    await attach(
      'PHOTO_BEFORE',
      'OTHER',
      `Photo avant réparation — ${tag}.png`,
      addDays(c.occurredAt, 1),
      undefined,
      sceneImage(scene, variant)
    );
    if (c.status !== 'DECLARED') {
      await attach(
        'QUOTE',
        'OTHER',
        `Devis ${supplier} — ${tag}.pdf`,
        addDays(c.occurredAt, 6),
        claimQuote(f, supplier, repair, claimed, addDays(c.occurredAt, 6))
      );
    }
    if (['EXPERTISE', 'SETTLED', 'CLOSED', 'REJECTED'].includes(c.status)) {
      const retained = c.indemnifiedAmount
        ? Number(c.indemnifiedAmount) + Number(c.deductible ?? 0)
        : Math.round(claimed * 0.9);
      await attach(
        'EXPERT_REPORT',
        'OTHER',
        `Rapport d'expertise — ${tag}.pdf`,
        addDays(c.occurredAt, 18),
        expertReport(f, c.description, claimed, retained, addDays(c.occurredAt, 18))
      );
    }
    if (['SETTLED', 'CLOSED', 'REJECTED'].includes(c.status)) {
      const outcome =
        c.status === 'REJECTED'
          ? ({
              kind: 'REJECTED',
              reason: def?.reason ?? 'le sinistre n’entre pas dans les garanties du contrat.'
            } as const)
          : ({
              kind: 'SETTLED',
              indemnified: Number(c.indemnifiedAmount ?? 0),
              deductible: Number(c.deductible ?? 0)
            } as const);
      await attach(
        'INSURER_LETTER',
        'INSURANCE',
        `Lettre de la compagnie — ${tag}.pdf`,
        addDays(c.occurredAt, 30),
        insurerLetter(c.policy.insurer, f, c.policy.policyNumber, outcome, addDays(c.occurredAt, 30))
      );
    }
    if (c.status === 'SETTLED' || c.status === 'CLOSED') {
      await attach(
        'INVOICE',
        'OTHER',
        `Facture ${supplier} — ${tag}.pdf`,
        addDays(c.occurredAt, 22),
        repairInvoice(f, supplier, repair, claimed, addDays(c.occurredAt, 22))
      );
      await attach(
        'PHOTO_AFTER',
        'OTHER',
        `Photo après réparation — ${tag}.png`,
        addDays(c.occurredAt, 24),
        undefined,
        sceneImage(scene === 'stain' ? 'room' : scene, variant + 1)
      );
    }
  }
  log(`patrimoine-extras : ${created} sinistre(s) ajouté(s), ${docs} pièce(s) de sinistre écrites.`);
}

// ------------------------------------------------------------------ régularisation foncière

export async function seedLand(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log } = s.ctx;
  const track = LAND_TRACKS.find(t => t.key === 'CI_ACD');
  if (!track) return;
  let created = 0;

  const stepData = (
    regId: string,
    done: number,
    startedAgo: number,
    opts: { all?: boolean } = {}
  ): Prisma.LandRegularizationStepCreateManyInput[] => {
    const stepMonths = Math.max(1, Math.floor(startedAgo / (done + 1)));
    return track.steps.map((st, idx) => {
      const isDone = opts.all ? true : idx < done;
      const running = !opts.all && idx === done;
      return {
        tenantId,
        regularizationId: regId,
        stepKey: st.key,
        sortOrder: st.order,
        label: st.label,
        required: st.required,
        status: isDone ? 'TERMINEE' : running ? 'EN_COURS' : 'A_FAIRE',
        startedAt: isDone || running ? atDay(monthsAgo(end, startedAgo - stepMonths * idx), 5) : null,
        completedAt: isDone ? atDay(monthsAgo(end, Math.max(0, startedAgo - stepMonths * (idx + 1) + 1)), 20) : null,
        dueDate: running ? addDays(end, 45) : null,
        costXof: isDone ? between(s.ctx.rng, 150, 450) * 1000 : 0
      };
    });
  };

  // 1. terrain : dossier en cours si le générateur de base n'en a pas écrit
  const terrain = s.properties.find(p => p.type === 'TERRAIN');
  if (
    terrain &&
    !(await prisma.landRegularization.findFirst({ where: { tenantId, propertyId: terrain.id }, select: { id: true } }))
  ) {
    const startedAgo = 18;
    const reg = await prisma.landRegularization.create({
      data: {
        tenantId,
        propertyId: terrain.id,
        track: 'CI_ACD',
        status: 'EN_COURS',
        startDate: monthsAgo(end, startedAgo),
        notes: 'Passage de l’attestation villageoise au titre foncier.',
        createdByUserId: author(s),
        createdAt: monthsAgo(end, startedAgo)
      },
      select: { id: true }
    });
    await prisma.landRegularizationStep.createMany({ data: stepData(reg.id, 3, startedAgo) });
    created += 1;
  }

  // 2. Pro : un dossier abouti (ACD puis titre foncier) et un dossier abandonné
  if (s.isPro) {
    const villa = s.properties.find(p => p.ref === 'PAT-VIL-BINGER');
    if (
      villa &&
      !(await prisma.landRegularization.findFirst({ where: { tenantId, propertyId: villa.id }, select: { id: true } }))
    ) {
      const startedAgo = 21;
      const reg = await prisma.landRegularization.create({
        data: {
          tenantId,
          propertyId: villa.id,
          track: 'CI_ACD',
          status: 'TERMINEE',
          startDate: monthsAgo(end, startedAgo),
          endedAt: monthsAgo(end, 4),
          notes:
            'Lettre d’attribution transformée en titre foncier : dossier clôturé, titre remis par la conservation foncière.',
          createdByUserId: author(s),
          createdAt: monthsAgo(end, startedAgo)
        },
        select: { id: true }
      });
      await prisma.landRegularizationStep.createMany({ data: stepData(reg.id, 6, startedAgo - 3, { all: true }) });
      created += 1;
    }
    const koum = s.properties.find(p => p.ref === 'PAT-APP-KOUMASSI');
    if (
      koum &&
      !(await prisma.landRegularization.findFirst({ where: { tenantId, propertyId: koum.id }, select: { id: true } }))
    ) {
      const reg = await prisma.landRegularization.create({
        data: {
          tenantId,
          propertyId: koum.id,
          track: 'PERSONNALISEE',
          status: 'ABANDONNEE',
          startDate: monthsAgo(end, 10),
          endedAt: monthsAgo(end, 3),
          notes:
            'Abandon : le promoteur n’a jamais produit le titre mère ; le certificat de propriété est resté bloqué.',
          createdByUserId: author(s),
          createdAt: monthsAgo(end, 10)
        },
        select: { id: true }
      });
      const labels = [
        ['Vérification du lot auprès du promoteur', 'TERMINEE'],
        ['Demande de certificat de propriété', 'BLOQUEE'],
        ['Mise en demeure du promoteur', 'A_FAIRE']
      ] as const;
      await prisma.landRegularizationStep.createMany({
        data: labels.map(([label, status], idx) => ({
          tenantId,
          regularizationId: reg.id,
          stepKey: `custom_${idx + 1}`,
          sortOrder: idx + 1,
          label,
          required: true,
          status,
          startedAt: status === 'A_FAIRE' ? null : atDay(monthsAgo(end, 10 - idx * 3), 8),
          completedAt: status === 'TERMINEE' ? atDay(monthsAgo(end, 8), 15) : null,
          costXof: status === 'TERMINEE' ? 120_000 : status === 'BLOQUEE' ? 85_000 : 0,
          notes: status === 'BLOQUEE' ? 'Dossier bloqué : titre mère introuvable à la conservation.' : null
        }))
      });
      created += 1;
    }
  }

  // 3. pièces : chaque étape terminée porte le document suggéré par la filière
  const regs = await prisma.landRegularization.findMany({
    where: { tenantId, track: 'CI_ACD' },
    include: { steps: true }
  });
  let linked = 0;
  for (const reg of regs) {
    const p = s.properties.find(x => x.id === reg.propertyId);
    if (!p) continue;
    const f = facts(p);
    for (const st of reg.steps.filter(x => x.status === 'TERMINEE' && !x.documentId)) {
      const when = st.completedAt ?? end;
      const make = ((): {
        type: 'OTHER' | 'PLAN' | 'LAND_CONCESSION' | 'TITLE_DEED';
        name: string;
        content: DocContent;
      } => {
        switch (st.stepKey) {
          case 'attestation_villageoise':
            return {
              type: 'OTHER',
              name: `Attestation villageoise de cession — ${p.title}.pdf`,
              content: villageAttestation(f, s.ownerName, when)
            };
          case 'dossier_technique_geometre':
            return {
              type: 'PLAN',
              name: `Dossier technique du géomètre — ${p.title}.pdf`,
              content: floorPlan(f, when)
            };
          case 'bornage_contradictoire':
            return {
              type: 'PLAN',
              name: `Procès-verbal de bornage contradictoire — ${p.title}.pdf`,
              content: surveyReport(f, when)
            };
          case 'demande_acd':
            return {
              type: 'OTHER',
              name: `Récépissé de dépôt de la demande d'ACD — ${p.title}.pdf`,
              content: genericRecord(
                "Récépissé de dépôt de la demande d'ACD",
                'Ministère de la Construction — guichet foncier',
                f,
                ['Dossier enregistré.'],
                when
              )
            };
          case 'acd':
            return {
              type: 'LAND_CONCESSION',
              name: `Arrêté de concession définitive (ACD) — ${p.title}.pdf`,
              content: landConcession(f, s.ownerName, when)
            };
          default:
            return {
              type: 'TITLE_DEED',
              name: `Titre foncier — ${p.title}.pdf`,
              content: titleDeed(f, s.ownerName, when)
            };
        }
      })();
      const { id } = await putPropertyDoc(s, p, {
        type: make.type,
        fileName: make.name,
        createdAt: when,
        content: make.content,
        required: make.type !== 'PLAN'
      });
      await prisma.landRegularizationStep.update({ where: { id: st.id }, data: { documentId: id } });
      linked += 1;
    }
    // Un dossier abouti : le bien porte désormais un titre foncier.
    if (reg.status === 'TERMINEE' && p.assetId && p.legalStatus !== 'TITRE_FONCIER') {
      const asset = await prisma.asset.findUnique({ where: { id: p.assetId }, select: { details: true } });
      await prisma.asset.update({
        where: { id: p.assetId },
        data: { details: { ...((asset?.details ?? {}) as object), legalStatus: 'TITRE_FONCIER' } }
      });
      p.legalStatus = 'TITRE_FONCIER';
    }
  }
  log(
    `patrimoine-extras : ${created} dossier(s) de régularisation ajouté(s), ${linked} pièce(s) rattachée(s) aux étapes.`
  );
}
