/**
 * Dossier du patrimoine propre de l'agence : polices d'assurance (actives, bientôt expirées,
 * expirées) avec leur attestation en PDF, sinistres de tous les statuts avec historique et pièces
 * réelles (photos, devis, rapport d'expertise, lettre de la compagnie, facture), carnet
 * d'entretien relié aux prestataires et aux dépenses, dossiers de régularisation foncière.
 *
 * Idempotent par bloc ; les fichiers vont au chemin privé des documents de bien
 * (`uploads/properties/<bien>/documents/`), servis par la route authentifiée.
 */
import type { InsuranceClaimStatus, MaintenanceLogCategory, Prisma } from '@prisma/client';
import { LAND_TRACKS } from '../../../src/lib/patrimoine/land/tracks';
import { runWithTenantContext } from '../../../src/utils/tenant-context';
import {
  claimQuote,
  expertReport,
  hnum,
  insurerLetter,
  insuranceCertificate,
  repairInvoice
} from './patrimoine-extras-docs';
import type { DocContent, PropFacts } from './patrimoine-extras-docs';
import { dateFr, sceneImage } from './patrimoine-extras-files';
import type { SceneKind } from './patrimoine-extras-files';
import { putPropertyDoc } from './patrimoine-extras-state';
import { addDays, between, monthsAgo, pick } from './types';
import { atDay, author, monthsBack } from './agence-patrimoine-state';
import type { OwnState } from './agence-patrimoine-state';
import { landTargets } from './agence-patrimoine-profile';
import type { Profile } from './agence-patrimoine-profile';
import { putExpense } from './agence-patrimoine-finance';

const OWNER_LABEL = 'L’agence, propriétaire du bien';

const factsOf = (p: Profile): PropFacts => ({
  title: p.prop.title,
  ref: p.prop.ref,
  type: p.prop.type,
  address: p.prop.address,
  zone: p.prop.zone,
  surface: p.prop.surface
});

const COVERAGE_LABEL: Record<string, string> = {
  MULTIRISK_HOME: 'multirisque habitation',
  MULTIRISK_BUILDING: 'multirisque immeuble',
  OWNER_LIABILITY: 'responsabilité civile propriétaire non occupant',
  OTHER: 'garantie spécifique'
};

// ------------------------------------------------------------------ polices d'assurance

export async function seedOwnPolicies(o: OwnState, profiles: Profile[]): Promise<void> {
  const { prisma, tenantId, log } = o.ctx;
  let created = 0;
  for (const p of profiles) {
    const existing = await prisma.insurancePolicy.findMany({
      where: { tenantId, propertyId: p.prop.id },
      select: { policyNumber: true }
    });
    const known = new Set(existing.map(e => e.policyNumber));
    for (const pol of p.policies) {
      if (known.has(pol.number)) continue;
      const doc = await putPropertyDoc(o.pat, p.prop, {
        type: 'INSURANCE',
        fileName: `Attestation d'assurance ${pol.start.getFullYear()} — ${p.prop.title}.pdf`,
        createdAt: pol.start,
        content: insuranceCertificate(
          factsOf(p),
          OWNER_LABEL,
          pol.insurer,
          pol.number,
          COVERAGE_LABEL[pol.coverage],
          pol.start,
          pol.end,
          pol.premium
        ),
        expiration: pol.end
      });
      await prisma.insurancePolicy.create({
        data: {
          tenantId,
          propertyId: p.prop.id,
          insurer: pol.insurer,
          policyNumber: pol.number,
          coverageType: pol.coverage,
          startDate: pol.start,
          endDate: pol.end,
          annualPremium: pol.premium,
          currency: 'XOF',
          notes:
            pol.end.getTime() < o.ctx.end.getTime() && p.policies[p.policies.length - 1] === pol
              ? 'Police arrivée à échéance : non renouvelée, à remettre en couverture.'
              : pol.start.getFullYear() === o.ctx.end.getFullYear() || pol.end.getTime() > o.ctx.end.getTime()
                ? 'Renouvellement annuel par tacite reconduction.'
                : null,
          documentId: doc.id,
          createdByUserId: author(o),
          createdAt: pol.start
        }
      });
      created += 1;
    }
  }
  log(
    `patrimoine propre : ${created} police(s) d'assurance (courantes, bientôt expirées, expirées) et leurs attestations.`
  );
}

// ------------------------------------------------------------------ sinistres

interface ClaimDef {
  at: number;
  agoMonths: number;
  agoDays?: number;
  cause: 'WATER_DAMAGE' | 'FIRE' | 'THEFT' | 'STRUCTURAL' | 'STORM' | 'OTHER';
  claimed: number;
  indemnified?: number;
  deductible?: number;
  final: InsuranceClaimStatus;
  text: string;
  supplier: string;
  repair: string;
  reason?: string;
  scene: SceneKind;
}

const CLAIMS: readonly ClaimDef[] = [
  {
    at: 0,
    agoMonths: 14,
    cause: 'WATER_DAMAGE',
    claimed: 1_200_000,
    indemnified: 950_000,
    deductible: 100_000,
    final: 'SETTLED',
    text: 'Dégât des eaux dû à une fuite de la colonne montante, plafonds de la chambre et du couloir atteints.',
    supplier: 'Plomberie Express CI',
    repair: 'Remplacement de la colonne montante et reprise des plafonds',
    scene: 'stain'
  },
  {
    at: 1,
    agoMonths: 2,
    cause: 'STORM',
    claimed: 650_000,
    final: 'INSURER_NOTIFIED',
    text: 'Tôles de la terrasse arrachées par la tempête de la nuit du 14.',
    supplier: 'Multiservices Bâti Plus',
    repair: 'Remplacement des tôles de la terrasse',
    scene: 'storm'
  },
  {
    at: 3,
    agoMonths: 26,
    cause: 'FIRE',
    claimed: 3_800_000,
    indemnified: 3_200_000,
    deductible: 250_000,
    final: 'CLOSED',
    text: 'Début d’incendie dans l’arrière-boutique, causé par un court-circuit sur une multiprise.',
    supplier: 'Ivoire Électricité Services',
    repair: 'Remise en état de l’arrière-boutique et reprise de l’installation électrique',
    scene: 'room'
  },
  {
    at: 6,
    agoMonths: 20,
    cause: 'THEFT',
    claimed: 2_100_000,
    final: 'REJECTED',
    text: 'Vol de deux climatiseurs extérieurs et de matériel de jardin pendant l’absence du locataire.',
    supplier: 'Froid & Clim Abidjan',
    repair: 'Remplacement de deux unités extérieures de climatisation',
    reason: 'l’effraction n’est pas caractérisée et le vol est survenu hors des horaires garantis par le contrat.',
    scene: 'facade'
  },
  {
    at: 7,
    agoMonths: 6,
    cause: 'STRUCTURAL',
    claimed: 5_500_000,
    final: 'EXPERTISE',
    text: 'Fissures traversantes apparues sur le mur pignon après de fortes pluies : expertise en cours.',
    supplier: 'Multiservices Bâti Plus',
    repair: 'Reprise du mur pignon et injection de résine',
    scene: 'facade'
  },
  {
    at: 9,
    agoMonths: 0,
    agoDays: 25,
    cause: 'WATER_DAMAGE',
    claimed: 380_000,
    final: 'DECLARED',
    text: 'Infiltration depuis le logement du dessus : plafond du salon taché et cloqué.',
    supplier: 'Peinture & Rénovation Lagune',
    repair: 'Réfection du plafond du salon',
    scene: 'stain'
  },
  {
    at: 10,
    agoMonths: 9,
    cause: 'OTHER',
    claimed: 1_450_000,
    indemnified: 1_200_000,
    deductible: 150_000,
    final: 'SETTLED',
    text: 'Surtension sur le réseau : onduleur et tableau divisionnaire détruits.',
    supplier: 'Ivoire Électricité Services',
    repair: 'Remplacement de l’onduleur et du tableau divisionnaire',
    scene: 'room'
  },
  {
    at: 12,
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

export async function seedOwnClaims(o: OwnState, profiles: Profile[]): Promise<void> {
  const { ctx } = o;
  const { prisma, tenantId, end, log } = ctx;
  if (profiles.length === 0) return;
  let created = 0;
  let docs = 0;
  await runWithTenantContext({ tenantId, userId: ctx.adminUserId }, async () => {
    const policies = await prisma.insurancePolicy.findMany({ where: { tenantId } });
    for (const def of CLAIMS) {
      const occurred = def.agoDays ? addDays(end, -def.agoDays) : atDay(monthsAgo(end, def.agoMonths), 12);
      // Premier bien (à partir de l'indice prévu) acquis avant le sinistre et couvert ce jour-là.
      let chosen: { p: Profile; policyId: string } | null = null;
      for (let k = 0; k < profiles.length && !chosen; k++) {
        const p = profiles[(def.at + k) % profiles.length];
        if (p.acqDate.getTime() > occurred.getTime()) continue;
        const pol = policies.find(x => x.propertyId === p.prop.id && x.startDate <= occurred && x.endDate > occurred);
        if (pol) chosen = { p, policyId: pol.id };
      }
      if (!chosen) continue;
      const { p, policyId } = chosen;
      const known = await prisma.insuranceClaim.findFirst({
        where: { tenantId, propertyId: p.prop.id, cause: def.cause },
        select: { id: true }
      });
      if (known) continue;

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
        expenseId = await putExpense(o, p.prop.id, {
          category: 'ROUTINE_MAINTENANCE',
          label: `Réparation suite au sinistre — ${CAUSE_LABEL[def.cause]}`,
          amount: def.claimed,
          paidAt: addDays(occurred, 20),
          supplier: def.supplier
        });
      }
      const claim = await prisma.insuranceClaim.create({
        data: {
          tenantId,
          propertyId: p.prop.id,
          policyId,
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
          createdByUserId: author(o),
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
          note:
            n === 0
              ? 'Sinistre déclaré à la compagnie.'
              : status === 'REJECTED'
                ? 'Refus de prise en charge notifié par la compagnie.'
                : status === 'SETTLED'
                  ? 'Indemnité versée par la compagnie.'
                  : null,
          changedByUserId: author(o),
          changedAt: n === 0 ? addDays(occurred, 2) : stamp(n)
        }))
      });
      created += 1;

      // Pièces du dossier.
      const policy = policies.find(x => x.id === policyId);
      const f = factsOf(p);
      const tag = `${CAUSE_LABEL[def.cause]} ${dateFr(occurred)}`;
      const attach = async (
        kind: 'PHOTO_BEFORE' | 'PHOTO_AFTER' | 'QUOTE' | 'EXPERT_REPORT' | 'INSURER_LETTER' | 'INVOICE',
        docType: 'OTHER' | 'INSURANCE',
        fileName: string,
        when: Date,
        content?: DocContent,
        png?: Buffer
      ): Promise<void> => {
        const { id } = await putPropertyDoc(o.pat, p.prop, { type: docType, fileName, createdAt: when, content, png });
        await prisma.insuranceClaimDocument.create({ data: { tenantId, claimId: claim.id, documentId: id, kind } });
        docs += 1;
      };
      const variant = hnum(claim.id, 0, 4);
      await attach(
        'PHOTO_BEFORE',
        'OTHER',
        `Photo avant réparation — ${tag}.png`,
        addDays(occurred, 1),
        undefined,
        sceneImage(def.scene, variant)
      );
      if (def.final !== 'DECLARED') {
        await attach(
          'QUOTE',
          'OTHER',
          `Devis ${def.supplier} — ${tag}.pdf`,
          addDays(occurred, 6),
          claimQuote(f, def.supplier, def.repair, def.claimed, addDays(occurred, 6))
        );
      }
      if (['EXPERTISE', 'SETTLED', 'CLOSED', 'REJECTED'].includes(def.final)) {
        const retained = def.indemnified ? def.indemnified + (def.deductible ?? 0) : Math.round(def.claimed * 0.9);
        await attach(
          'EXPERT_REPORT',
          'OTHER',
          `Rapport d'expertise — ${tag}.pdf`,
          addDays(occurred, 18),
          expertReport(f, def.text, def.claimed, retained, addDays(occurred, 18))
        );
      }
      if (['SETTLED', 'CLOSED', 'REJECTED'].includes(def.final)) {
        const outcome =
          def.final === 'REJECTED'
            ? ({
                kind: 'REJECTED',
                reason: def.reason ?? 'le sinistre n’entre pas dans les garanties du contrat.'
              } as const)
            : ({ kind: 'SETTLED', indemnified: def.indemnified ?? 0, deductible: def.deductible ?? 0 } as const);
        await attach(
          'INSURER_LETTER',
          'INSURANCE',
          `Lettre de la compagnie — ${tag}.pdf`,
          addDays(occurred, 30),
          insurerLetter(
            policy?.insurer ?? 'La compagnie',
            f,
            policy?.policyNumber ?? '—',
            outcome,
            addDays(occurred, 30)
          )
        );
      }
      if (def.final === 'SETTLED' || def.final === 'CLOSED') {
        await attach(
          'INVOICE',
          'OTHER',
          `Facture ${def.supplier} — ${tag}.pdf`,
          addDays(occurred, 22),
          repairInvoice(f, def.supplier, def.repair, def.claimed, addDays(occurred, 22))
        );
        await attach(
          'PHOTO_AFTER',
          'OTHER',
          `Photo après réparation — ${tag}.png`,
          addDays(occurred, 24),
          undefined,
          sceneImage(def.scene === 'stain' ? 'room' : def.scene, variant + 1)
        );
      }
    }
  });
  log(`patrimoine propre : ${created} sinistre(s) de tous statuts, ${docs} pièce(s) de sinistre écrites.`);
}

// ------------------------------------------------------------------ carnet d'entretien

interface LogTemplate {
  category: MaintenanceLogCategory;
  description: string;
  cost: [number, number];
  nextMonths: number | null;
  warrantyMonths: number | null;
  specialties: string[];
  label: string;
}

const LOG: Record<string, LogTemplate> = {
  AC: {
    category: 'AIR_CONDITIONING',
    label: 'Entretien annuel des climatiseurs',
    description: 'Nettoyage des filtres, contrôle du niveau de gaz et des condensats de chaque split.',
    cost: [35_000, 110_000],
    nextMonths: 12,
    warrantyMonths: null,
    specialties: ['ac', 'refrigeration']
  },
  PLUMBING: {
    category: 'PLUMBING',
    label: 'Révision de la plomberie',
    description: 'Détartrage du chauffe-eau, remplacement des flexibles et des joints.',
    cost: [25_000, 120_000],
    nextMonths: 24,
    warrantyMonths: 6,
    specialties: ['plumbing', 'water_heater']
  },
  ELECTRICAL: {
    category: 'ELECTRICAL',
    label: 'Contrôle du tableau électrique',
    description: 'Resserrage des connexions, test des disjoncteurs différentiels et mesure de terre.',
    cost: [20_000, 90_000],
    nextMonths: 24,
    warrantyMonths: null,
    specialties: ['electricity']
  },
  GENERATOR: {
    category: 'GENERATOR',
    label: 'Entretien du groupe électrogène',
    description: 'Vidange, changement des filtres et test de bascule automatique.',
    cost: [60_000, 190_000],
    nextMonths: 6,
    warrantyMonths: null,
    specialties: ['generator', 'electricity']
  },
  ROOF: {
    category: 'ROOF_WATERPROOFING',
    label: 'Traitement de l’étanchéité de la toiture',
    description: 'Nettoyage des évacuations, reprise des relevés et application d’une résine d’étanchéité.',
    cost: [150_000, 480_000],
    nextMonths: 36,
    warrantyMonths: 24,
    specialties: ['masonry', 'other']
  },
  PAINTING: {
    category: 'PAINTING',
    label: 'Remise en peinture',
    description: 'Rebouchage, sous-couche et deux couches de peinture après le départ du locataire.',
    cost: [180_000, 650_000],
    nextMonths: 60,
    warrantyMonths: 12,
    specialties: ['painting']
  },
  OTHER: {
    category: 'OTHER',
    label: 'Désinsectisation et dératisation',
    description: 'Traitement complet des locaux et des parties communes.',
    cost: [30_000, 85_000],
    nextMonths: 6,
    warrantyMonths: null,
    specialties: ['other', 'locksmith']
  }
};

function logPlan(p: Profile): LogTemplate[] {
  const t = p.prop.type;
  if (t === 'PARKING_BOX') return [LOG.ELECTRICAL, LOG.PAINTING];
  if (['BUREAU', 'BOUTIQUE_COMMERCIAL', 'ENTREPOT_INDUSTRIEL'].includes(t)) {
    return [
      LOG.AC,
      LOG.AC,
      LOG.GENERATOR,
      LOG.GENERATOR,
      LOG.GENERATOR,
      LOG.ELECTRICAL,
      ...(t === 'ENTREPOT_INDUSTRIEL' ? [LOG.ROOF] : [LOG.OTHER])
    ];
  }
  if (t === 'MAISON_VILLA' || t === 'DUPLEX_TRIPLEX') {
    return [LOG.AC, LOG.AC, LOG.GENERATOR, LOG.GENERATOR, LOG.PLUMBING, LOG.ROOF, LOG.OTHER];
  }
  return [LOG.AC, LOG.AC, LOG.PLUMBING, LOG.ELECTRICAL, LOG.PAINTING, LOG.OTHER];
}

export async function seedOwnMaintenanceLog(o: OwnState, profiles: Profile[]): Promise<void> {
  const { ctx } = o;
  const { prisma, tenantId, end, log } = ctx;
  const vendors = await prisma.maintenanceVendor.findMany({ where: { tenant_id: tenantId }, orderBy: { name: 'asc' } });
  let entries = 0;
  await runWithTenantContext({ tenantId, userId: ctx.adminUserId }, async () => {
    for (const p of profiles) {
      if ((await prisma.maintenanceLogEntry.count({ where: { tenantId, propertyId: p.prop.id } })) > 0) continue;
      const rngM = p.fork('carnet');
      const plan = logPlan(p);
      // Dates réparties sur 34 mois, après l'entrée du bien au patrimoine, la plus ancienne en premier.
      const earliestAgo = Math.max(2, Math.min(34, p.acqAgo - 1));
      const slots = plan
        .map((tpl, i) => ({
          tpl,
          ago: Math.max(1, Math.round(earliestAgo - (i * earliestAgo) / plan.length - between(rngM, 0, 3)))
        }))
        .sort((a, b) => b.ago - a.ago);
      for (const [i, s] of slots.entries()) {
        const performedAt = atDay(monthsBack(end, s.ago), between(rngM, 4, 26));
        if (performedAt.getTime() > end.getTime() || performedAt.getTime() < p.acqDate.getTime()) continue;
        const candidates = vendors.filter(v => v.specialties.some(sp => s.tpl.specialties.includes(sp)));
        const vendor = pick(rngM, candidates.length > 0 ? candidates : vendors);
        const cost = Math.round(between(rngM, s.tpl.cost[0], s.tpl.cost[1]) / 5_000) * 5_000;
        const label = `${s.tpl.label} — ${p.prop.title}`;
        await putExpense(o, p.prop.id, {
          category: 'ROUTINE_MAINTENANCE',
          label,
          amount: cost,
          paidAt: performedAt,
          supplier: vendor.name
        });
        let documentId: string | null = null;
        if (cost >= 60_000 || i % 3 === 0) {
          documentId = (
            await putPropertyDoc(o.pat, p.prop, {
              type: 'OTHER',
              fileName: `Facture ${vendor.name} — ${s.tpl.label} (${performedAt.getFullYear()}-${String(performedAt.getMonth() + 1).padStart(2, '0')}) — ${p.prop.title}.pdf`,
              createdAt: performedAt,
              content: repairInvoice(factsOf(p), vendor.name, s.tpl.label, cost, performedAt)
            })
          ).id;
        }
        await prisma.maintenanceLogEntry.create({
          data: {
            tenantId,
            propertyId: p.prop.id,
            category: s.tpl.category,
            performedAt,
            vendorId: vendor.id,
            cost,
            currency: 'XOF',
            description: `${s.tpl.description} Intervention de ${vendor.name}.`,
            nextDueDate: s.tpl.nextMonths
              ? new Date(performedAt.getFullYear(), performedAt.getMonth() + s.tpl.nextMonths, performedAt.getDate())
              : null,
            warrantyEndDate: s.tpl.warrantyMonths
              ? new Date(
                  performedAt.getFullYear(),
                  performedAt.getMonth() + s.tpl.warrantyMonths,
                  performedAt.getDate()
                )
              : null,
            documentId,
            createdByUserId: author(o),
            createdAt: performedAt
          }
        });
        entries += 1;
      }
    }
  });
  log(
    `patrimoine propre : ${entries} intervention(s) au carnet d'entretien, reliées aux prestataires et aux dépenses.`
  );
}

// ------------------------------------------------------------------ régularisation foncière

export async function seedOwnLand(o: OwnState, profiles: Profile[]): Promise<void> {
  const { prisma, tenantId, end, log } = o.ctx;
  const track = LAND_TRACKS.find(t => t.key === 'CI_ACD');
  if (!track) return;
  const targets = landTargets(profiles);
  let created = 0;

  const stepData = (
    regId: string,
    done: number,
    startedAgo: number,
    documentOf: Record<number, string> = {},
    all = false
  ): Prisma.LandRegularizationStepCreateManyInput[] => {
    const stepMonths = Math.max(1, Math.floor(startedAgo / (done + 1)));
    return track.steps.map((st, idx) => {
      const isDone = all ? true : idx < done;
      const running = !all && idx === done;
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
        costXof: isDone ? between(o.ctx.rng, 150, 450) * 1000 : 0,
        notes: running ? 'Dossier déposé, en attente du passage de la commission.' : null,
        documentId: documentOf[st.order] ?? null
      };
    });
  };

  const exists = async (propertyId: string): Promise<boolean> =>
    !!(await prisma.landRegularization.findFirst({ where: { tenantId, propertyId }, select: { id: true } }));

  if (targets.inProgress && !(await exists(targets.inProgress.prop.id))) {
    const startedAgo = 16;
    const reg = await prisma.landRegularization.create({
      data: {
        tenantId,
        propertyId: targets.inProgress.prop.id,
        track: 'CI_ACD',
        status: 'EN_COURS',
        startDate: monthsAgo(end, startedAgo),
        notes: 'Passage de l’attestation villageoise au titre foncier pour le terrain d’assiette de l’entrepôt.',
        createdByUserId: author(o),
        createdAt: monthsAgo(end, startedAgo)
      },
      select: { id: true }
    });
    await prisma.landRegularizationStep.createMany({ data: stepData(reg.id, 3, startedAgo) });
    created += 1;
  }

  if (targets.done && !(await exists(targets.done.prop.id))) {
    const title = await prisma.propertyDocument.findFirst({
      where: { tenantId, propertyId: targets.done.prop.id, documentType: 'TITLE_DEED' },
      select: { id: true }
    });
    const startedAgo = 22;
    const reg = await prisma.landRegularization.create({
      data: {
        tenantId,
        propertyId: targets.done.prop.id,
        track: 'CI_ACD',
        status: 'TERMINEE',
        startDate: monthsAgo(end, startedAgo),
        endedAt: monthsAgo(end, 5),
        notes:
          'Arrêté de concession définitive transformé en titre foncier : dossier clôturé, titre remis par la conservation foncière.',
        createdByUserId: author(o),
        createdAt: monthsAgo(end, startedAgo)
      },
      select: { id: true }
    });
    await prisma.landRegularizationStep.createMany({
      data: stepData(reg.id, 6, startedAgo - 3, title ? { 6: title.id } : {}, true)
    });
    created += 1;
  }
  log(`patrimoine propre : ${created} dossier(s) de régularisation foncière avec leurs étapes.`);
}
