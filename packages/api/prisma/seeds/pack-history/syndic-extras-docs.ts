/**
 * Compléments SYNDIC — documents de copropriété (règlement, procès-verbaux,
 * budgets, assurances, diagnostics, pièces diverses) et pièces jointes des
 * factures de prestataires, avec de vrais PDF rangés au chemin privé attendu :
 *   `syndics/<copropriété>/documents/<fichier>`
 *   `syndics/<copropriété>/factures-prestataires/<fichier>`
 * Rien n'est servi en statique : les routes authentifiées du module les relisent.
 */
import { writeDemoPdf } from './seed-files';
import {
  addDays,
  chunk,
  fcfa,
  frDate,
  frLongDate,
  num,
  slug,
  type SyndicEnv,
  type SyndicRow
} from './syndic-extras-common';

const LOT_LABEL: Record<string, string> = {
  APARTMENT: 'Appartement',
  PARKING: 'Parking',
  CELLAR: 'Cave',
  OFFICE: 'Bureau',
  COMMERCIAL: 'Local commercial',
  OTHER: 'Autre'
};
const RESULT_LABEL: Record<string, string> = { APPROVED: 'ADOPTÉE', REJECTED: 'REJETÉE', DEFERRED: 'REPORTÉE' };

interface DocPlan {
  title: string;
  type: 'REGULATION' | 'GENERAL_MEETING_MINUTES' | 'DIAGNOSTIC' | 'INSURANCE' | 'BUDGET' | 'OTHER';
  at: Date;
  expiresAt?: Date | null;
  file: string;
  lines: string[];
}

export async function seedSyndicDocuments(env: SyndicEnv): Promise<void> {
  for (const s of env.syndicates) {
    const existing = await env.prisma.syndicateDocument.count({ where: { syndicateId: s.id } });
    if (existing > 0) continue;
    const plans = await buildPlans(env, s);
    const rows = [];
    let regulationUrl: string | null = null;
    for (const plan of plans) {
      const stored = await writeDemoPdf(['syndics', s.id, 'documents'], plan.file, plan.title, plan.lines);
      if (plan.type === 'REGULATION') regulationUrl = stored.fileUrl;
      rows.push({
        syndicateId: s.id,
        title: plan.title,
        type: plan.type,
        fileUrl: stored.fileUrl,
        expiresAt: plan.expiresAt ?? null,
        createdAt: plan.at
      });
    }
    await env.prisma.syndicateDocument.createMany({ data: rows });
    if (regulationUrl)
      await env.prisma.syndicate.update({ where: { id: s.id }, data: { regulationDocUrl: regulationUrl } });
    env.log(`syndic-extras documents « ${s.name} » : ${rows.length} documents (PDF écrits)`);
  }
}

async function buildPlans(env: SyndicEnv, s: SyndicRow): Promise<DocPlan[]> {
  const { prisma, end } = env;
  const syndicate = await prisma.syndicate.findUniqueOrThrow({
    where: { id: s.id },
    select: {
      name: true,
      address: true,
      registrationNo: true,
      cadastralReference: true,
      mandatingAgency: { select: { name: true } },
      syndicManager: { select: { firstName: true, lastName: true } }
    }
  });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: env.tenantId }, select: { name: true } });
  const cabinet = syndicate.mandatingAgency?.name ?? tenant.name;
  const president = syndicate.syndicManager
    ? `${syndicate.syndicManager.firstName ?? ''} ${syndicate.syndicManager.lastName ?? ''}`.trim()
    : 'le président du conseil syndical';
  const lots = await prisma.syndicateLot.findMany({
    where: { syndicateId: s.id },
    select: {
      lotNumber: true,
      lotType: true,
      generalShares: true,
      owner: { select: { firstName: true, lastName: true, legalName: true } }
    },
    orderBy: { lotNumber: 'asc' }
  });
  const meetings = await prisma.generalMeeting.findMany({
    where: { syndicateId: s.id },
    orderBy: { scheduledAt: 'asc' },
    include: { agendaItems: { orderBy: { orderIndex: 'asc' } }, resolutions: true }
  });
  const budgets = await prisma.syndicateBudget.findMany({
    where: { syndicateId: s.id },
    orderBy: { fiscalYear: 'asc' },
    include: { lines: true }
  });
  const contracts = await prisma.maintenanceContract.findMany({
    where: { syndicateId: s.id },
    select: {
      nature: true,
      endDate: true,
      status: true,
      startDate: true,
      annualAmount: true,
      provider: { select: { name: true } }
    }
  });
  const hasElevator = (await prisma.commonAreaAsset.count({ where: { syndicateId: s.id, name: 'Ascenseur' } })) > 0;
  const base = `${syndicate.name} — ${syndicate.address}`;
  const ownerName = (o: { firstName: string | null; lastName: string | null; legalName: string | null } | null) =>
    o ? o.legalName || [o.firstName, o.lastName].filter(Boolean).join(' ') : '—';
  const plans: DocPlan[] = [];

  // règlement de copropriété
  plans.push({
    title: `Règlement de copropriété — ${syndicate.name}`,
    type: 'REGULATION',
    at: s.createdAt,
    file: `reglement-copropriete-${slug(syndicate.name)}`,
    lines: [
      `# Règlement de copropriété de l'immeuble ${syndicate.name}`,
      base,
      `Immatriculation : ${syndicate.registrationNo ?? 'en cours'} — Référence cadastrale : ${syndicate.cadastralReference ?? '—'}`,
      '',
      '# Titre Ier — Objet et division de l’immeuble',
      `Article 1. Le présent règlement fixe les droits et obligations des copropriétaires de l'immeuble ${syndicate.name}, soumis au régime de la copropriété.`,
      `Article 2. L'immeuble est divisé en ${lots.length} lots comprenant des parties privatives et des parties communes. Les tantièmes généraux totalisent 1 000 parties.`,
      'Article 3. Sont communes : le sol, les fondations, le gros œuvre, la toiture-terrasse, les halls, escaliers, couloirs, canalisations et colonnes montantes, les locaux techniques, les espaces verts et les accès.',
      '',
      '# Titre II — Charges',
      'Article 4. Les charges générales (gardiennage, nettoyage, eau et électricité des parties communes, assurance, honoraires du syndic) sont réparties selon les tantièmes généraux.',
      'Article 5. Les charges spéciales (ascenseur, groupe électrogène, parkings) sont réparties selon l’utilité que chaque lot en retire.',
      'Article 6. Les provisions sont appelées chaque trimestre ; elles sont exigibles le 15 du premier mois du trimestre. Tout retard est passible d’une pénalité de 1,5 % par mois.',
      'Article 7. Un fonds de travaux est alimenté chaque année par une dotation votée en assemblée générale.',
      '',
      '# Titre III — Assemblée générale et syndic',
      'Article 8. L’assemblée générale ordinaire se réunit chaque année pour approuver les comptes, voter le budget prévisionnel et élire le conseil syndical.',
      'Article 9. Les décisions courantes sont prises à la majorité simple (article 24) ; les travaux importants et la modification du règlement, à la majorité absolue (article 25).',
      `Article 10. Le syndic est ${cabinet}. Il exécute les décisions de l'assemblée, tient la comptabilité du syndicat et représente celui-ci en justice. Le conseil syndical est présidé par ${president}.`,
      '',
      '# Annexe — Tableau des lots et tantièmes',
      ...lots.map(
        l =>
          `Lot ${l.lotNumber} — ${LOT_LABEL[l.lotType] ?? l.lotType} — ${l.generalShares} tantièmes — ${ownerName(l.owner)}`
      )
    ]
  });

  // procès-verbaux
  for (const m of meetings.filter(x => x.status === 'COMPLETED')) {
    const kind = m.type === 'ORDINARY' ? 'ordinaire' : 'extraordinaire';
    plans.push({
      title: `Procès-verbal de l'assemblée générale ${kind} du ${frDate(m.scheduledAt)}`,
      type: 'GENERAL_MEETING_MINUTES',
      at: addDays(m.scheduledAt, 6),
      file: `pv-ag-${kind}-${m.scheduledAt.toISOString().slice(0, 10)}`,
      lines: [
        `# Procès-verbal de l'assemblée générale ${kind}`,
        base,
        `Réunion du ${frLongDate(m.scheduledAt)} — ${m.location ?? 'siège de la copropriété'}`,
        `Quorum constaté : ${num(m.quorum)} % des tantièmes. Syndic : ${cabinet}.`,
        '',
        '# Ordre du jour',
        ...m.agendaItems.map(a => `${a.orderIndex}. ${a.title}`),
        '',
        '# Résolutions et votes',
        ...m.resolutions.flatMap((r, i) => [
          `Résolution n° ${i + 1} — ${r.title}`,
          `${r.majorityRule ?? 'Majorité simple'} : pour ${r.votesFor}, contre ${r.votesAgainst}, abstentions ${r.votesAbstain} (${r.sharesFor} tantièmes pour). Résultat : ${RESULT_LABEL[r.result ?? ''] ?? 'À constater'}.`,
          ''
        ]),
        'La séance est levée après lecture et signature du présent procès-verbal par le président de séance et le secrétaire.'
      ]
    });
  }

  // budgets
  for (const b of budgets) {
    plans.push({
      title: `${b.label}`,
      type: 'BUDGET',
      at: b.createdAt,
      file: `budget-${b.fiscalYear}-${b.status.toLowerCase()}`,
      lines: [
        `# ${b.label}`,
        base,
        `Exercice ${b.fiscalYear} — statut : ${b.status === 'APPROVED' ? 'approuvé en assemblée' : b.status === 'CLOSED' ? 'clos' : b.status === 'DRAFT' ? 'projet' : 'révisé'}`,
        `Total des charges prévisionnelles : ${fcfa(num(b.totalAmount))}`,
        '',
        '# Postes de dépenses',
        ...b.lines.map(
          l =>
            `${l.category} — ${l.description} : ${fcfa(num(l.amountForecast))}${num(l.amountActual) > 0 ? ` (réalisé ${fcfa(num(l.amountActual))})` : ''}`
        )
      ]
    });
  }

  // assurance
  const insurance = contracts.find(c => c.nature.toLowerCase().includes('multirisque'));
  const insurer = insurance?.provider.name ?? 'NSIA Assurances';
  const renewal = insurance?.endDate ?? addDays(end, 20);
  plans.push(
    {
      title: `Attestation d'assurance multirisque immeuble — ${insurer} (exercice en cours)`,
      type: 'INSURANCE',
      at: addDays(renewal, -365),
      expiresAt: renewal,
      file: `assurance-mri-${slug(insurer)}-en-cours`,
      lines: [
        `# Attestation d'assurance multirisque immeuble`,
        base,
        `Assureur : ${insurer}. Souscripteur : syndicat des copropriétaires ${syndicate.name}, représenté par ${cabinet}.`,
        `Garanties : incendie, explosion, dégâts des eaux, tempête, vol des parties communes, responsabilité civile du syndicat.`,
        `Prime annuelle : ${fcfa(num(insurance?.annualAmount ?? 0) || 1_800_000)} — échéance de la police : ${frDate(renewal)}.`
      ]
    },
    {
      title: `Attestation d'assurance multirisque immeuble — ${insurer} (exercice précédent)`,
      type: 'INSURANCE',
      at: addDays(renewal, -730),
      expiresAt: addDays(renewal, -365),
      file: `assurance-mri-${slug(insurer)}-precedent`,
      lines: [
        `# Attestation d'assurance multirisque immeuble — exercice précédent`,
        base,
        `Assureur : ${insurer}. Police échue le ${frDate(addDays(renewal, -365))}, renouvelée par tacite reconduction.`
      ]
    },
    {
      title: `Conditions particulières de la police d'assurance — ${syndicate.name}`,
      type: 'INSURANCE',
      at: addDays(renewal, -365),
      file: `assurance-conditions-particulieres`,
      lines: [
        `# Conditions particulières`,
        base,
        `Franchise dégât des eaux : 150 000 F CFA. Franchise générale : 250 000 F CFA.`,
        `Capital assuré (valeur à neuf des parties communes) : ${fcfa(850_000_000)}.`
      ]
    }
  );

  // diagnostics
  if (hasElevator)
    plans.push({
      title: 'Rapport de contrôle technique de l’ascenseur',
      type: 'DIAGNOSTIC',
      at: addDays(end, -310),
      expiresAt: addDays(end, 55),
      file: 'diagnostic-ascenseur',
      lines: [
        '# Rapport de contrôle technique de l’ascenseur',
        base,
        'Organisme de contrôle : Bureau Veritas Côte d’Ivoire.',
        'Conclusion : appareil conforme sous réserve du remplacement préventif des câbles de traction dans les douze mois.',
        'Prochaine visite périodique avant l’échéance indiquée ci-dessus.'
      ]
    });
  plans.push(
    {
      title: 'Diagnostic sécurité incendie — extincteurs et issues de secours',
      type: 'DIAGNOSTIC',
      at: addDays(end, -380),
      expiresAt: addDays(end, -12),
      file: 'diagnostic-securite-incendie',
      lines: [
        '# Diagnostic sécurité incendie',
        base,
        'Extincteurs vérifiés et rechargés ; issues de secours dégagées ; signalisation à compléter au sous-sol.',
        'Validité d’un an : un nouveau contrôle est à planifier.'
      ]
    },
    {
      title: 'Diagnostic termites et insectes xylophages',
      type: 'DIAGNOSTIC',
      at: addDays(end, -165),
      expiresAt: addDays(end, 200),
      file: 'diagnostic-termites',
      lines: [
        '# Diagnostic termites',
        base,
        'Aucune infestation active constatée. Traitement préventif des menuiseries communes recommandé.'
      ]
    }
  );

  // pièces diverses
  plans.push(
    {
      title: 'Carnet d’entretien de l’immeuble',
      type: 'OTHER',
      at: s.createdAt,
      file: 'carnet-entretien',
      lines: [
        '# Carnet d’entretien',
        base,
        ...contracts.map(
          c =>
            `${c.nature} — ${c.provider.name} — depuis le ${frDate(c.startDate)}${c.endDate ? ` jusqu’au ${frDate(c.endDate)}` : ''}`
        )
      ]
    },
    {
      title: 'Liste des copropriétaires et de leurs tantièmes',
      type: 'OTHER',
      at: addDays(end, -140),
      file: 'liste-coproprietaires',
      lines: [
        '# Liste des copropriétaires',
        base,
        ...lots.map(l => `Lot ${l.lotNumber} — ${ownerName(l.owner)} — ${l.generalShares}/1000`)
      ]
    },
    {
      title: 'Appel d’offres ravalement — comparatif de trois devis',
      type: 'OTHER',
      at: addDays(end, -95),
      file: 'comparatif-devis-ravalement',
      lines: [
        '# Comparatif de trois devis — ravalement des façades',
        base,
        `Devis A — Façades & Peinture CI : ${fcfa(38_000_000)}, délai 10 semaines.`,
        `Devis B — BTP Ivoire Rénovation : ${fcfa(41_500_000)}, délai 8 semaines.`,
        `Devis C — Abidjan Bâtiment Services : ${fcfa(36_200_000)}, délai 14 semaines, références limitées.`,
        'Recommandation du conseil syndical : devis A, soumis au vote de la prochaine assemblée.'
      ]
    }
  );
  const planned = meetings.find(m => m.status === 'PLANNED');
  if (planned)
    plans.push({
      title: `Convocation à l'assemblée générale du ${frDate(planned.scheduledAt)}`,
      type: 'OTHER',
      at: addDays(end, -3),
      file: `convocation-ag-${planned.scheduledAt.toISOString().slice(0, 10)}`,
      lines: [
        `# Convocation à l'assemblée générale ${planned.type === 'ORDINARY' ? 'ordinaire' : 'extraordinaire'}`,
        base,
        `Madame, Monsieur, vous êtes convoqué(e) le ${frLongDate(planned.scheduledAt)} — ${planned.location ?? 'siège de la copropriété'}.`,
        '# Ordre du jour',
        ...(
          await prisma.gMAgendaItem.findMany({ where: { meetingId: planned.id }, orderBy: { orderIndex: 'asc' } })
        ).map(a => `${a.orderIndex}. ${a.title}`),
        'En cas d’empêchement, vous pouvez donner pouvoir à un autre copropriétaire.'
      ]
    });
  return plans;
}

// ───────────────────────────────────────────────────── pièces des factures

export async function seedProviderInvoiceFiles(env: SyndicEnv): Promise<void> {
  const { prisma } = env;
  const invoices = await prisma.syndicProviderInvoice.findMany({
    where: { tenantId: env.tenantId, filePath: null },
    select: {
      id: true,
      syndicateId: true,
      number: true,
      label: true,
      invoiceDate: true,
      dueDate: true,
      amountHT: true,
      vatAmount: true,
      amountTTC: true,
      amountPaid: true,
      status: true,
      provider: { select: { name: true, phone: true, email: true } },
      syndicate: { select: { name: true, address: true } }
    }
  });
  if (invoices.length === 0) return;
  let done = 0;
  for (const part of chunk(invoices, 50)) {
    await Promise.all(
      part.map(async inv => {
        const fileName = `facture-${slug(inv.number)}.pdf`;
        const stored = await writeDemoPdf(
          ['syndics', inv.syndicateId, 'factures-prestataires'],
          `${inv.id}.pdf`,
          `Facture ${inv.number}`,
          [
            `# ${inv.provider.name}`,
            `${inv.provider.phone ?? ''}  ${inv.provider.email ?? ''}`.trim(),
            '',
            `Facture n° ${inv.number} du ${frDate(inv.invoiceDate)}`,
            `Client : syndicat des copropriétaires ${inv.syndicate.name} — ${inv.syndicate.address}`,
            `Objet : ${inv.label}`,
            '',
            `Montant hors taxes : ${fcfa(num(inv.amountHT))}`,
            `TVA : ${fcfa(num(inv.vatAmount))}`,
            `Total à payer : ${fcfa(num(inv.amountTTC))}`,
            inv.dueDate ? `Échéance : ${frDate(inv.dueDate)}` : '',
            `Déjà réglé : ${fcfa(num(inv.amountPaid))}`,
            '',
            'Règlement par virement, chèque ou mobile money. Merci de rappeler le numéro de facture.'
          ]
        );
        await prisma.syndicProviderInvoice.update({
          where: { id: inv.id },
          data: { filePath: stored.fileUrl, fileName }
        });
        done++;
      })
    );
  }
  env.log(`syndic-extras factures prestataires : ${done} pièces jointes PDF`);
}
