import { LoanStatus, PropertyDocumentType, RentalLeaseStatus, WorkProgramStatus } from '@prisma/client';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { ConflictError } from '../../middleware/error-middleware';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../constants/email-notification-default-templates';
import { getEmailNotificationConfig } from '../../services/email-notification-config-service';
import { emailService } from '../../services/email-service';
import { sendWhatsappNotification } from '../../services/whatsapp-notification-send-service';
import { logAuditEvent, flushAuditEvents } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';

/**
 * Meme utilitaire que `services/email-service.ts` (non exporte de la, donc
 * duplique ici plutot qu'importe) : les valeurs injectees dans un template
 * HTML d'e-mail (nom du proprietaire, intitule d'une depense, reference d'un
 * bien...) viennent de saisies utilisateur et doivent etre echappees avant
 * d'atterrir dans le corps HTML -- jamais dans le sujet, texte brut.
 */
function escapeHtml(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

function normalizeOwnerStatementTemplateText(template: string): string {
  return template
    .replace(/Votre releve de gerance/g, 'Votre relevé de gérance')
    .replace(/Releve de gerance/g, 'Relevé de gérance')
    .replace(/Votre releve pour la periode/g, 'Votre relevé pour la période')
    .replace(/Total revenus/g, 'Total des revenus')
    .replace(/Total charges/g, 'Total des charges')
    .replace(/Proprietaire/g, 'Propriétaire')
    .replace(/relevÃ©/g, 'relevé')
    .replace(/gÃ©rance/g, 'gérance')
    .replace(/pÃ©riode/g, 'période')
    .replace(/PropriÃ©taire/g, 'Propriétaire');
}

/** Libelle francais lisible de chaque type de document patrimoine, pour le corps de l'alerte. */
const PROPERTY_DOCUMENT_TYPE_LABELS: Record<PropertyDocumentType, string> = {
  TITLE_DEED: 'Titre de propriété',
  MANDATE: 'Mandat',
  PLAN: 'Plan',
  TAX_DOCUMENT: 'Document fiscal',
  SYNDICATE_PV: 'Procès-verbal de copropriété',
  SYNDICATE_BUDGET: 'Budget de copropriété',
  SYNDICATE_CONTRAT: 'Contrat de copropriété',
  SYNDICATE_REGL_COPRO: 'Règlement de copropriété',
  NOTARIAL_DEED: 'Acte notarié',
  INSURANCE: 'Assurance',
  TECHNICAL_DIAGNOSIS: 'Diagnostic technique',
  BUILDING_PERMIT: 'Permis de construire',
  LAND_CONCESSION: 'Arrêté de concession définitive (ACD)',
  OTHER: 'Autre document'
};

interface ExpiringDocumentRecipient {
  contactId: string;
  email: string;
  name: string;
}

/**
 * Destinataires eligibles pour l'alerte d'expiration d'un document : les
 * proprietaires du bien (indivision comprise via `PropertyOwnershipShare`,
 * plus `Property.ownerUserId` s'il est renseigne), relies a leur contact CRM
 * par `TenantClient.details.crmContactId` (meme convention que
 * `lib/patrimoine/queries.ts` et `services/document-context-builder.ts`), avec
 * une adresse e-mail non vide et un consentement explicite
 * (`CrmContact.consentEmail === true`). Un proprietaire sans lien CRM, sans
 * e-mail ou sans consentement est silencieusement exclu de l'envoi -- jamais
 * de consentement suppose a partir du seul `User`.
 *
 * `extraTenantClientIds` ajoute des `TenantClient` supplementaires a
 * resoudre en plus de l'indivision/`ownerUserId` du bien -- utilise par
 * `alertExpiringLeases` pour inclure `RentalLease.owner_client_id`, qui est
 * la facon la plus courante d'assigner un proprietaire a un bail (pose a la
 * creation via `ownerClientId`/`ownerContactId`,
 * `services/rental-lease-service.ts`), independamment de toute indivision
 * declaree sur le bien.
 */
async function resolveDocumentOwnerRecipients(
  tenantId: string,
  property: { id: string; ownerUserId: string | null },
  extraTenantClientIds: string[] = []
): Promise<ExpiringDocumentRecipient[]> {
  const [shares, directClient] = await Promise.all([
    prisma.propertyOwnershipShare.findMany({
      where: { tenantId, propertyId: property.id },
      select: { ownerClientId: true }
    }),
    property.ownerUserId
      ? prisma.tenantClient.findFirst({
          where: { tenantId, userId: property.ownerUserId },
          select: { id: true }
        })
      : Promise.resolve(null)
  ]);

  const clientIds = Array.from(
    new Set([
      ...shares.map(share => share.ownerClientId),
      ...(directClient ? [directClient.id] : []),
      ...extraTenantClientIds
    ])
  );
  if (clientIds.length === 0) return [];

  const clients = await prisma.tenantClient.findMany({
    where: { tenantId, id: { in: clientIds } },
    select: { id: true, details: true }
  });

  const crmContactIds = Array.from(
    new Set(
      clients
        .map(client => (client.details as { crmContactId?: string } | null)?.crmContactId)
        .filter((id): id is string => Boolean(id))
    )
  );
  if (crmContactIds.length === 0) return [];

  const contacts = await prisma.crmContact.findMany({
    where: { tenantId, id: { in: crmContactIds } },
    select: { id: true, email: true, firstName: true, lastName: true, consentEmail: true }
  });

  const seenEmails = new Set<string>();
  const recipients: ExpiringDocumentRecipient[] = [];
  for (const contact of contacts) {
    if (!contact.email || !contact.email.trim() || contact.consentEmail !== true) continue;
    const normalizedEmail = contact.email.trim().toLowerCase();
    if (seenEmails.has(normalizedEmail)) continue;
    seenEmails.add(normalizedEmail);
    recipients.push({
      contactId: contact.id,
      email: contact.email.trim(),
      name: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Propriétaire'
    });
  }
  return recipients;
}

/**
 * Envoie l'alerte d'expiration d'un document a chacun de ses destinataires et
 * renvoie le nombre d'envois reussis. Un echec individuel (ex : fournisseur
 * e-mail indisponible pour un destinataire) est journalise avec le
 * `contactId` concerne et n'interrompt pas les envois suivants.
 */
async function sendExpiryAlertToRecipients(params: {
  recipients: ExpiringDocumentRecipient[];
  documentId: string;
  documentFileName: string;
  documentTypeLabel: string;
  propertyReference: string;
  expiresAtLabel: string;
  subjectTemplate: string;
  bodyTemplate: string;
  tenantId: string;
}): Promise<number> {
  let deliveredCount = 0;
  for (const recipient of params.recipients) {
    const subjectVariables = {
      ownerName: recipient.name,
      documentTitle: params.documentFileName,
      documentType: params.documentTypeLabel,
      propertyReference: params.propertyReference,
      expiresAt: params.expiresAtLabel
    };
    // Le sujet part en texte brut (pas de HTML a echapper) ; le corps HTML
    // reprend les memes valeurs, echappees.
    const bodyVariables = Object.fromEntries(
      Object.entries(subjectVariables).map(([key, value]) => [key, escapeHtml(value)])
    );

    try {
      await emailService.sendEmail({
        to: recipient.email,
        subject: applyTemplate(params.subjectTemplate, subjectVariables),
        html: applyTemplate(params.bodyTemplate, bodyVariables),
        tenantId: params.tenantId
      });
      deliveredCount += 1;
    } catch (error) {
      logger.warn('alertExpiringDocuments: envoi echoue pour un destinataire', {
        documentId: params.documentId,
        contactId: recipient.contactId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return deliveredCount;
}

/**
 * Alerte les proprietaires d'un document `PropertyDocument` dont l'echeance
 * (`expirationDate`) approche, une fois par document (`warningSentAt` sert de
 * marque anti-doublon, jamais reinitialise ailleurs qu'ici).
 *
 * Un document sans destinataire eligible (pas de consentement) n'est pas
 * marque : il sera retente au prochain passage, un consentement pouvant
 * arriver entretemps. La reservation (`updateMany` avec `warningSentAt: null`
 * en cible) est atomique : si un autre passage a deja pris le document, ce
 * passage-ci l'ignore plutot que d'envoyer un doublon. Si aucun envoi ne
 * reussit pour un document reserve, la marque est retiree pour un nouvel
 * essai le lendemain.
 *
 * Limite assumee (echec partiel en indivision) : des qu'au moins un
 * proprietaire a recu l'alerte, le document reste marque -- un
 * co-proprietaire dont l'envoi a echoue n'est pas relance individuellement
 * (l'echec est journalise avec son `contactId`). Seul l'echec total de tous
 * les destinataires retire la marque.
 *
 * Limite connue (arret en cours de traitement) : un arret du processus entre
 * la reservation (`warningSentAt` pose) et la fin des envois laisse le
 * document marque sans qu'aucun e-mail ne soit parti ; la marque n'est pas
 * retentee automatiquement dans ce cas.
 */
export async function alertExpiringDocuments(tenantId: string, options?: { daysAhead?: number; now?: Date }) {
  const daysAhead = options?.daysAhead ?? 30;
  const now = options?.now ?? new Date();
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + daysAhead);

  const eventKey = 'DOCUMENT_EXPIRY_ALERT' as const;
  const config = await getEmailNotificationConfig(tenantId, eventKey);
  if (!config.enabled) {
    return { matched: 0, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 };
  }

  const docs = await prisma.propertyDocument.findMany({
    where: {
      tenantId,
      expirationDate: { gte: now, lte: maxDate },
      warningSentAt: null
    },
    select: {
      id: true,
      propertyId: true,
      documentType: true,
      fileName: true,
      expirationDate: true,
      property: {
        select: { internalReference: true, title: true, ownerUserId: true }
      }
    }
  });

  const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[eventKey];
  let sent = 0;
  let skippedNoRecipient = 0;
  let skippedAlreadySent = 0;
  let failed = 0;

  // Les documents d'un meme bien partagent leurs destinataires : evite de
  // relire les parts d'indivision et les contacts CRM a chaque document.
  const recipientsByProperty = new Map<string, ExpiringDocumentRecipient[]>();

  for (const doc of docs) {
    let recipients = recipientsByProperty.get(doc.propertyId);
    if (!recipients) {
      recipients = await resolveDocumentOwnerRecipients(tenantId, {
        id: doc.propertyId,
        ownerUserId: doc.property?.ownerUserId ?? null
      });
      recipientsByProperty.set(doc.propertyId, recipients);
    }

    if (recipients.length === 0) {
      skippedNoRecipient += 1;
      continue;
    }

    // Reservation atomique : si un autre passage a deja pris ce document
    // (count === 0), ne pas envoyer une seconde fois.
    const reserved = await prisma.propertyDocument.updateMany({
      where: { id: doc.id, tenantId, warningSentAt: null },
      data: { warningSentAt: now }
    });
    if (reserved.count === 0) {
      skippedAlreadySent += 1;
      continue;
    }

    const documentTypeLabel = PROPERTY_DOCUMENT_TYPE_LABELS[doc.documentType];
    const propertyReference = doc.property?.internalReference || '';
    const expiresAtLabel = doc.expirationDate
      ? new Date(doc.expirationDate).toLocaleDateString('fr-FR', { timeZone: 'UTC' })
      : '';

    const deliveredCount = await sendExpiryAlertToRecipients({
      recipients,
      documentId: doc.id,
      documentFileName: doc.fileName,
      documentTypeLabel,
      propertyReference,
      expiresAtLabel,
      subjectTemplate: config.subjectOverride || defaults.subject,
      bodyTemplate: config.bodyHtmlOverride || defaults.bodyHtml,
      tenantId
    });

    if (deliveredCount > 0) {
      sent += 1;
    } else {
      failed += 1;
      // Aucun envoi n'a abouti : retirer la marque pour retenter demain.
      await prisma.propertyDocument.updateMany({
        where: { id: doc.id, tenantId },
        data: { warningSentAt: null }
      });
    }
  }

  logger.info('alertExpiringDocuments completed', {
    tenantId,
    daysAhead,
    matched: docs.length,
    sent,
    skippedNoRecipient,
    skippedAlreadySent,
    failed
  });

  return { matched: docs.length, sent, skippedNoRecipient, skippedAlreadySent, failed };
}

/**
 * Alertes d'echeance etendues (lot P3) : fin de bail, fin d'emprunt, travaux a
 * venir. L'assurance n'a pas de fonction dediee -- `alertExpiringDocuments`
 * ci-dessus la couvre deja, sans filtre sur `documentType`, des lors qu'un
 * document `INSURANCE` porte une `expirationDate`.
 */
interface AgencyAdminRecipient {
  email: string;
  fullName: string | null;
}

/**
 * Administrateurs actifs de l'agence (role `TENANT_ADMIN`), repli sur
 * `Tenant.contactEmail` si aucun n'est trouve -- meme requete que
 * `agencyAdminRecipients` de `jobs/subscription-usage-job.ts`, dupliquee ici
 * plutot qu'importee : ce job d'abonnements entraine tout son graphe
 * d'imports (facturation, catalogue...), sans rapport avec les alertes
 * patrimoine et couteux a mocker dans les tests de ce fichier.
 */
async function resolveAgencyAdminRecipients(tenantId: string): Promise<AgencyAdminRecipient[]> {
  const role = await prisma.role.findUnique({ where: { key: 'TENANT_ADMIN' }, select: { id: true } });
  if (role) {
    const links = await prisma.userRole.findMany({ where: { tenantId, roleId: role.id }, select: { userId: true } });
    const ids = [...new Set(links.map(link => link.userId))];
    if (ids.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: ids }, isActive: true },
        select: { email: true, fullName: true }
      });
      if (users.length > 0) return users;
    }
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { contactEmail: true, name: true }
  });
  return tenant?.contactEmail ? [{ email: tenant.contactEmail, fullName: tenant.name }] : [];
}

/**
 * Anti-doublon des trois alertes ci-dessous (`RentalLease`, `PropertyLoan`,
 * `WorkProgram`) : ces modeles n'ont pas de colonne `warningSentAt` dediee
 * comme `PropertyDocument`. En ajouter une exigerait une migration Prisma ;
 * ce worktree partage son `node_modules/.prisma` (jonction Windows, voir
 * RUNBOOK.md) avec le checkout principal, et y lancer `prisma generate`
 * desynchroniserait le client genere des deux tant qu'il n'est pas relance
 * partout. On reutilise donc `AuditLog` (deja indexe sur
 * `entityType, entityId`) comme marque de reservation : une entree y est
 * ecrite apres l'envoi (flush immediat, `await flushAuditEvents()` juste
 * apres chaque `logAuditEvent` reussi -- pas en fin de boucle complete, pour
 * borner la fenetre de perte en cas de crash a une seule entite plutot qu'a
 * tout le lot du jour pour l'agence), et le prochain passage l'exclut.
 * Limite assumee : contrairement a la reservation atomique `updateMany` de
 * `alertExpiringDocuments`, cette lecture-puis-ecriture n'est pas atomique --
 * accepte car ce job tourne une fois par jour, sequentiellement, une agence a
 * la fois (jamais deux passages en parallele sur la meme agence).
 */
/**
 * Marque composee id+echeance plutot que le seul id de l'entite : un bail
 * renouvele, un emprunt restructure ou un programme de travaux replanifie
 * (meme ligne, `end_date`/`endDate`/`plannedDate` deplacee dans le futur)
 * doit pouvoir redeclencher une alerte pour sa nouvelle echeance plutot que
 * rester silencieusement exclu a vie par l'alerte du cycle precedent.
 */
function dateAlertKey(entityId: string, date: Date): string {
  return `${entityId}::${date.toISOString().slice(0, 10)}`;
}

async function alreadyAlertedEntityIds(
  tenantId: string,
  actionKey: AuditActionKey,
  entityType: string,
  candidateIds: string[]
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const rows = await prisma.auditLog.findMany({
    where: { tenantId, actionKey, entityType, entityId: { in: candidateIds } },
    select: { entityId: true }
  });
  return new Set(rows.map(row => row.entityId));
}

/**
 * Alerte les proprietaires des baux actifs dont `end_date` approche : meme
 * resolution que `alertExpiringDocuments` (indivision + `ownerUserId`,
 * contact CRM consentant), etendue avec `RentalLease.owner_client_id` --
 * facon la plus courante d'assigner un proprietaire a un bail (pose a la
 * creation, `services/rental-lease-service.ts`), independamment de toute
 * indivision declaree sur le bien. Sans cette extension, un bail cree
 * normalement (proprietaire assigne au bail, pas au bien) n'aurait jamais de
 * destinataire eligible.
 */
export async function alertExpiringLeases(tenantId: string, options?: { daysAhead?: number; now?: Date }) {
  const daysAhead = options?.daysAhead ?? 30;
  const now = options?.now ?? new Date();
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + daysAhead);

  const eventKey = 'LEASE_ENDING_SOON' as const;
  const config = await getEmailNotificationConfig(tenantId, eventKey);
  if (!config.enabled) {
    return { matched: 0, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 };
  }

  const leases = await prisma.rentalLease.findMany({
    where: { tenant_id: tenantId, status: RentalLeaseStatus.ACTIVE, end_date: { gte: now, lte: maxDate } },
    select: {
      id: true,
      lease_number: true,
      end_date: true,
      property_id: true,
      owner_client_id: true,
      property: { select: { internalReference: true, ownerUserId: true } }
    }
  });

  const alreadySent = await alreadyAlertedEntityIds(
    tenantId,
    AuditActionKey.PATRIMOINE_LEASE_END_ALERT_SENT,
    'RentalLease',
    leases.filter(lease => lease.end_date).map(lease => dateAlertKey(lease.id, lease.end_date as Date))
  );

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const agencyName = tenant?.name ?? '';
  const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[eventKey];

  let sent = 0;
  let skippedNoRecipient = 0;
  let skippedAlreadySent = 0;
  let failed = 0;

  // Les baux d'un meme bien avec le meme proprietaire de bail partagent leurs
  // destinataires : evite de relire les parts d'indivision et les contacts
  // CRM a chaque bail.
  const recipientsByPropertyAndOwner = new Map<string, ExpiringDocumentRecipient[]>();

  for (const lease of leases) {
    if (!lease.end_date) {
      skippedAlreadySent += 1;
      continue;
    }
    const alertKey = dateAlertKey(lease.id, lease.end_date);
    if (alreadySent.has(alertKey)) {
      skippedAlreadySent += 1;
      continue;
    }

    const cacheKey = `${lease.property_id}::${lease.owner_client_id ?? ''}`;
    let recipients = recipientsByPropertyAndOwner.get(cacheKey);
    if (!recipients) {
      recipients = await resolveDocumentOwnerRecipients(
        tenantId,
        { id: lease.property_id, ownerUserId: lease.property?.ownerUserId ?? null },
        lease.owner_client_id ? [lease.owner_client_id] : []
      );
      recipientsByPropertyAndOwner.set(cacheKey, recipients);
    }
    if (recipients.length === 0) {
      skippedNoRecipient += 1;
      continue;
    }

    const leaseLabel = `${lease.lease_number} — ${lease.property?.internalReference ?? ''}`;
    const leaseEndDate = new Date(lease.end_date).toLocaleDateString('fr-FR', { timeZone: 'UTC' });

    let deliveredCount = 0;
    for (const recipient of recipients) {
      const subjectVariables = { contactName: recipient.name, leaseLabel, leaseEndDate, agencyName };
      const bodyVariables = Object.fromEntries(
        Object.entries(subjectVariables).map(([key, value]) => [key, escapeHtml(value)])
      );
      try {
        await emailService.sendEmail({
          to: recipient.email,
          subject: applyTemplate(config.subjectOverride || defaults.subject, subjectVariables),
          html: applyTemplate(config.bodyHtmlOverride || defaults.bodyHtml, bodyVariables),
          tenantId
        });
        deliveredCount += 1;
      } catch (error) {
        logger.warn('alertExpiringLeases: envoi echoue pour un destinataire', {
          leaseId: lease.id,
          contactId: recipient.contactId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (deliveredCount > 0) {
      sent += 1;
      logAuditEvent({
        tenantId,
        actionKey: AuditActionKey.PATRIMOINE_LEASE_END_ALERT_SENT,
        entityType: 'RentalLease',
        entityId: alertKey,
        payload: { leaseId: lease.id, endDate: lease.end_date.toISOString() }
      });
      // Flush immediat plutot qu'en fin de boucle : reduit la fenetre d'un
      // crash entre l'envoi et l'ecriture de la marque anti-doublon a une
      // seule entite plutot qu'a tout le lot du jour pour cette agence (la
      // reservation n'est de toute facon pas atomique avec l'envoi, voir la
      // doc de `alreadyAlertedEntityIds` ci-dessus).
      await flushAuditEvents();
    } else {
      failed += 1;
    }
  }

  await flushAuditEvents();
  logger.info('alertExpiringLeases completed', {
    tenantId,
    daysAhead,
    matched: leases.length,
    sent,
    skippedNoRecipient,
    skippedAlreadySent,
    failed
  });
  return { matched: leases.length, sent, skippedNoRecipient, skippedAlreadySent, failed };
}

/**
 * Alerte l'agence (`resolveAgencyAdminRecipients` ci-dessus) des emprunts
 * actifs dont `endDate` approche. Alerte operationnelle interne : pas de
 * consentement CRM a verifier, contrairement aux alertes proprietaire
 * ci-dessus.
 */
export async function alertLoanMaturity(tenantId: string, options?: { daysAhead?: number; now?: Date }) {
  const daysAhead = options?.daysAhead ?? 30;
  const now = options?.now ?? new Date();
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + daysAhead);

  const eventKey = 'LOAN_MATURITY_ALERT' as const;
  const config = await getEmailNotificationConfig(tenantId, eventKey);
  if (!config.enabled) {
    return { matched: 0, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 };
  }

  const loans = await prisma.propertyLoan.findMany({
    where: { tenantId, status: LoanStatus.ACTIVE, endDate: { gte: now, lte: maxDate } },
    select: { id: true, endDate: true, property: { select: { internalReference: true } } }
  });

  const alreadySent = await alreadyAlertedEntityIds(
    tenantId,
    AuditActionKey.PATRIMOINE_LOAN_MATURITY_ALERT_SENT,
    'PropertyLoan',
    loans.map(loan => dateAlertKey(loan.id, loan.endDate))
  );
  const recipients = await resolveAgencyAdminRecipients(tenantId);
  const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[eventKey];

  let sent = 0;
  let skippedNoRecipient = 0;
  let skippedAlreadySent = 0;
  let failed = 0;

  for (const loan of loans) {
    const alertKey = dateAlertKey(loan.id, loan.endDate);
    if (alreadySent.has(alertKey)) {
      skippedAlreadySent += 1;
      continue;
    }
    if (recipients.length === 0) {
      skippedNoRecipient += 1;
      continue;
    }

    const propertyReference = loan.property?.internalReference ?? '';
    const loanEndDate = new Date(loan.endDate).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
    const variables = { propertyReference, loanEndDate };
    const bodyVariables = Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, escapeHtml(value)]));

    let deliveredCount = 0;
    for (const recipient of recipients) {
      try {
        await emailService.sendEmail({
          to: recipient.email,
          subject: applyTemplate(config.subjectOverride || defaults.subject, variables),
          html: applyTemplate(config.bodyHtmlOverride || defaults.bodyHtml, bodyVariables),
          tenantId
        });
        deliveredCount += 1;
      } catch (error) {
        logger.warn('alertLoanMaturity: envoi echoue pour un destinataire', {
          loanId: loan.id,
          email: recipient.email,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (deliveredCount > 0) {
      sent += 1;
      logAuditEvent({
        tenantId,
        actionKey: AuditActionKey.PATRIMOINE_LOAN_MATURITY_ALERT_SENT,
        entityType: 'PropertyLoan',
        entityId: alertKey,
        payload: { loanId: loan.id, endDate: loan.endDate.toISOString() }
      });
      // Flush immediat : voir le commentaire equivalent dans `alertExpiringLeases`.
      await flushAuditEvents();
    } else {
      failed += 1;
    }
  }

  await flushAuditEvents();
  logger.info('alertLoanMaturity completed', {
    tenantId,
    daysAhead,
    matched: loans.length,
    sent,
    skippedNoRecipient,
    skippedAlreadySent,
    failed
  });
  return { matched: loans.length, sent, skippedNoRecipient, skippedAlreadySent, failed };
}

/**
 * Alerte l'agence (memes destinataires que `alertLoanMaturity`) des
 * programmes de travaux planifies dont `plannedDate` approche.
 */
export async function alertUpcomingWorks(tenantId: string, options?: { daysAhead?: number; now?: Date }) {
  const daysAhead = options?.daysAhead ?? 30;
  const now = options?.now ?? new Date();
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + daysAhead);

  const eventKey = 'WORK_PROGRAM_REMINDER' as const;
  const config = await getEmailNotificationConfig(tenantId, eventKey);
  if (!config.enabled) {
    return { matched: 0, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 };
  }

  const works = await prisma.workProgram.findMany({
    where: { tenantId, status: WorkProgramStatus.PLANNED, plannedDate: { gte: now, lte: maxDate } },
    select: { id: true, title: true, plannedDate: true, property: { select: { internalReference: true } } }
  });

  const alreadySent = await alreadyAlertedEntityIds(
    tenantId,
    AuditActionKey.PATRIMOINE_WORK_UPCOMING_ALERT_SENT,
    'WorkProgram',
    works.map(work => dateAlertKey(work.id, work.plannedDate))
  );
  const recipients = await resolveAgencyAdminRecipients(tenantId);
  const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[eventKey];

  let sent = 0;
  let skippedNoRecipient = 0;
  let skippedAlreadySent = 0;
  let failed = 0;

  for (const work of works) {
    const alertKey = dateAlertKey(work.id, work.plannedDate);
    if (alreadySent.has(alertKey)) {
      skippedAlreadySent += 1;
      continue;
    }
    if (recipients.length === 0) {
      skippedNoRecipient += 1;
      continue;
    }

    const propertyReference = work.property?.internalReference ?? '';
    const plannedDate = new Date(work.plannedDate).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
    const variables = { workProgramTitle: work.title, propertyReference, plannedDate };
    const bodyVariables = Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, escapeHtml(value)]));

    let deliveredCount = 0;
    for (const recipient of recipients) {
      try {
        await emailService.sendEmail({
          to: recipient.email,
          subject: applyTemplate(config.subjectOverride || defaults.subject, variables),
          html: applyTemplate(config.bodyHtmlOverride || defaults.bodyHtml, bodyVariables),
          tenantId
        });
        deliveredCount += 1;
      } catch (error) {
        logger.warn('alertUpcomingWorks: envoi echoue pour un destinataire', {
          workProgramId: work.id,
          email: recipient.email,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (deliveredCount > 0) {
      sent += 1;
      logAuditEvent({
        tenantId,
        actionKey: AuditActionKey.PATRIMOINE_WORK_UPCOMING_ALERT_SENT,
        entityType: 'WorkProgram',
        entityId: alertKey,
        payload: { workProgramId: work.id, plannedDate: work.plannedDate.toISOString() }
      });
      // Flush immediat : voir le commentaire equivalent dans `alertExpiringLeases`.
      await flushAuditEvents();
    } else {
      failed += 1;
    }
  }

  await flushAuditEvents();
  logger.info('alertUpcomingWorks completed', {
    tenantId,
    daysAhead,
    matched: works.length,
    sent,
    skippedNoRecipient,
    skippedAlreadySent,
    failed
  });
  return { matched: works.length, sent, skippedNoRecipient, skippedAlreadySent, failed };
}

export async function sendOwnerStatement(statementId: string, tenantId: string) {
  const statement = await prisma.ownerStatement.findFirst({
    where: { id: statementId, tenantId },
    include: {
      owner: true,
      items: {
        include: {
          property: true
        }
      }
    }
  });

  if (!statement) {
    logger.warn('sendOwnerStatement: statement not found', { statementId });
    return { sent: false, reason: 'STATEMENT_NOT_FOUND' as const };
  }

  const owner = statement.owner;
  if (!owner.email || !owner.email.trim()) {
    return { sent: false, reason: 'NO_EMAIL' as const };
  }

  // Le proprietaire peut avoir une adresse renseignee sans avoir consenti a
  // recevoir des communications par e-mail (`CrmContact.consentEmail`,
  // meme garde que `alertExpiringDocuments` ci-dessus) : envoyer quand meme
  // serait une violation du consentement, pas un simple e-mail manquant --
  // une erreur typee explicite plutot qu'un `{ sent: false }` silencieux que
  // l'appelant pourrait confondre avec NO_EMAIL.
  if (owner.consentEmail !== true) {
    throw new ConflictError(
      "Le propriétaire n'a pas consenti à recevoir des communications par e-mail : le relevé ne peut pas lui être envoyé."
    );
  }

  const eventKey = 'OWNER_STATEMENT_SENT' as const;
  const config = await getEmailNotificationConfig(statement.tenantId, eventKey);
  if (!config.enabled) {
    return { sent: false, reason: 'EVENT_DISABLED' as const };
  }

  const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[eventKey];
  const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Propriétaire';
  // `label` (saisi en depense/loyer) et `internalReference` (saisie du bien)
  // sont du texte utilisateur : echappes avant de rejoindre le corps HTML,
  // jamais dans les variantes texte brut (WhatsApp, sujet de l'e-mail).
  const statementLineItemsHtml = statement.items.map(
    item =>
      `- ${escapeHtml(item.label)} (${escapeHtml(item.property.internalReference)}): ${Number(item.amount).toLocaleString('fr-FR')} ${escapeHtml(statement.currency)}`
  );
  const statementLineItemsText = statement.items.map(
    item =>
      `- ${item.label} (${item.property.internalReference}): ${Number(item.amount).toLocaleString('fr-FR')} ${statement.currency}`
  );
  const linesHtml = statementLineItemsHtml.join('<br/>');
  const linesText = statementLineItemsText.join(' | ');

  // Variables texte brut : sujet de l'e-mail et WhatsApp -- jamais echappees.
  const plainVariables = {
    ownerName,
    period: statement.period,
    totalRentDue: Number(statement.totalRentDue).toLocaleString('fr-FR'),
    totalRevenue: Number(statement.totalRevenue).toLocaleString('fr-FR'),
    totalArrears: Number(statement.totalArrears).toLocaleString('fr-FR'),
    managementFees: Number(statement.totalManagementFees).toLocaleString('fr-FR'),
    managementFeesVat: Number(statement.totalManagementFeesVat).toLocaleString('fr-FR'),
    totalExpenses: Number(statement.totalExpenses).toLocaleString('fr-FR'),
    netAmount: Number(statement.netAmount).toLocaleString('fr-FR'),
    currency: statement.currency
  };
  // Variables du corps HTML : les memes, echappees, plus les lignes deja
  // construites en HTML.
  const htmlVariables = {
    ...Object.fromEntries(Object.entries(plainVariables).map(([key, value]) => [key, escapeHtml(value)])),
    statementLines: linesHtml
  };

  const subjectTemplate = normalizeOwnerStatementTemplateText(config.subjectOverride || defaults.subject);
  const bodyTemplate = normalizeOwnerStatementTemplateText(config.bodyHtmlOverride || defaults.bodyHtml);

  await emailService.sendEmail({
    to: owner.email,
    subject: applyTemplate(subjectTemplate, plainVariables),
    html: applyTemplate(bodyTemplate, htmlVariables)
  });

  const whatsappSent = await sendWhatsappNotification({
    tenantId: statement.tenantId,
    notificationKey: 'OWNER_STATEMENT_SENT',
    to: owner.whatsappNumber || owner.phonePrimary || undefined,
    variables: {
      ...plainVariables,
      statementLines: linesText
    }
  });

  await prisma.ownerStatement.update({
    where: { id: statement.id, tenantId },
    data: {
      status: 'SENT',
      sentAt: new Date()
    }
  });

  logger.info('sendOwnerStatement completed', {
    statementId,
    tenantId: statement.tenantId,
    ownerId: owner.id,
    whatsappSent
  });
  return { sent: true as const, whatsappSent };
}
