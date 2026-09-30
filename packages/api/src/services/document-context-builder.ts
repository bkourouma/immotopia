import { prisma } from '../utils/database';
import { amountDueAt } from '../lib/finance/installment-status';
import { logger } from '../utils/logger';
import { DocumentType } from '@prisma/client';
import {
  DEFAULT_NOTICE_HABITATION,
  DEFAULT_NOTICE_COMMERCIAL,
  NON_RENSEIGNE,
  breakdownPayment,
  formatSurface,
  identityDocumentLabel,
  joinPresent,
  leaseDurationLabel,
  legalFormLabel,
  monthLabel,
  orDash,
  paymentMethodLabel,
  penaltyClauseLabel,
  penaltyRateLabel,
  periodRangeLabel,
  propertyEquipmentLabel,
  propertyTypeLabel
} from './document-context-helpers';
import { t } from '../i18n';
import { NotFoundError, BadRequestError } from '../middleware/error-middleware';

/** Montant Prisma (`Decimal`), nombre ou chaine. */
type AmountInput = number | string | null | undefined | { toString(): string };

/**
 * Format date to DD/MM/YYYY
 */
function formatDate(date: Date | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Nombre entier, separateur de milliers francais. Sans unite : c'est le modele
 * qui pose la sienne (une surface s'ecrit en m2, pas en francs).
 */
function formatNumber(value: AmountInput): string {
  if (value === null || value === undefined) return '0';
  const num = typeof value === 'number' ? value : parseFloat(value.toString());
  if (isNaN(num)) return '0';
  return Math.round(num).toLocaleString('fr-FR');
}

/**
 * Libelle de devise tel qu'un lecteur ivoirien l'ecrit.
 *
 * Le code ISO de la zone UEMOA est `XOF`, mais personne ne l'ecrit ainsi sur un
 * contrat : on ecrit FCFA. Les autres devises sont laissees telles quelles.
 */
function currencyLabel(currency: string | null | undefined): string {
  const code = (currency || '').toUpperCase();
  if (!code || code === 'XOF' || code === 'CFA' || code === 'XAF') return 'FCFA';
  return code;
}

/**
 * Montant suivi de sa devise.
 *
 * Sans la devise, un contrat porte « Le loyer est fixe a 120 000 » — une somme
 * sans unite, qu'un bailleur ne peut pas signer en l'etat.
 */
function formatAmount(amount: AmountInput, currency?: string | null): string {
  return `${formatNumber(amount)} ${currencyLabel(currency)}`;
}

/**
 * Helper function to get phone from TenantClient
 * Priority: 1. CRM Contact phonePrimary (from details.crmContactId), 2. CRM Contact phoneSecondary, 3. CRM Contact whatsappNumber, 4. TenantClient.details.phone
 */
async function getPhoneFromClient(client: any, tenantId?: string, clientType: string = 'unknown'): Promise<string> {
  logger.info('getPhoneFromClient called', {
    clientType,
    hasClient: !!client,
    tenantId,
    clientId: client?.id,
    hasDetails: !!client?.details
  });

  if (!client) {
    logger.warn('getPhoneFromClient: No client provided', { clientType });
    return '';
  }

  // First, try to get phone from CRM Contact via crmContactId in details
  if (client.details) {
    try {
      const details = typeof client.details === 'string' ? JSON.parse(client.details) : client.details;

      logger.info('getPhoneFromClient: Parsed details', {
        clientType,
        clientId: client.id,
        hasCrmContactId: !!details?.crmContactId,
        hasPhoneInDetails: !!(details?.phone || details?.telephone || details?.mobile)
      });

      // If we have a crmContactId, fetch the contact
      if (details?.crmContactId && tenantId) {
        try {
          logger.info('getPhoneFromClient: Fetching CRM contact', {
            clientType,
            crmContactId: details.crmContactId,
            tenantId
          });

          const contact = await prisma.crmContact.findFirst({
            where: {
              id: details.crmContactId,
              tenantId: tenantId
            },
            select: {
              id: true,
              phonePrimary: true,
              phoneSecondary: true,
              whatsappNumber: true
            }
          });

          if (contact) {
            logger.info('getPhoneFromClient: CRM contact found', {
              clientType,
              crmContactId: contact.id
            });

            if (contact.phonePrimary) {
              logger.info('getPhoneFromClient: Returning phonePrimary from CRM contact', {
                clientType
              });
              return contact.phonePrimary;
            }
            if (contact.phoneSecondary) {
              logger.info('getPhoneFromClient: Returning phoneSecondary from CRM contact', {
                clientType
              });
              return contact.phoneSecondary;
            }
            if (contact.whatsappNumber) {
              logger.info('getPhoneFromClient: Returning whatsappNumber from CRM contact', {
                clientType
              });
              return contact.whatsappNumber;
            }

            logger.warn('getPhoneFromClient: CRM contact found but no phone available', {
              clientType,
              crmContactId: contact.id
            });
          } else {
            logger.warn('getPhoneFromClient: CRM contact not found', {
              clientType,
              crmContactId: details.crmContactId,
              tenantId
            });
          }
        } catch (error) {
          // If contact fetch fails, continue to fallback
          logger.error('getPhoneFromClient: Failed to fetch CRM contact', {
            clientType,
            crmContactId: details.crmContactId,
            tenantId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          });
        }
      } else {
        logger.info('getPhoneFromClient: No crmContactId or tenantId', {
          clientType,
          hasCrmContactId: !!details?.crmContactId,
          hasTenantId: !!tenantId
        });
      }

      // Fallback to phone in details
      const phoneFromDetails = details?.phone || details?.telephone || details?.mobile || '';
      if (phoneFromDetails) {
        logger.info('getPhoneFromClient: Returning phone from details', {
          clientType
        });
      } else {
        logger.warn('getPhoneFromClient: No phone found in details', {
          clientType
        });
      }
      return phoneFromDetails;
    } catch (error) {
      logger.error('getPhoneFromClient: Error parsing details', {
        clientType,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return '';
    }
  } else {
    logger.warn('getPhoneFromClient: No details in client', {
      clientType,
      clientId: client.id
    });
  }

  return '';
}

/** Bailleur resolu pour un bail : identite et coordonnees, « — » quand une donnee manque. */
interface Landlord {
  BAILLEUR_NOM: string;
  BAILLEUR_EMAIL: string;
  BAILLEUR_TELEPHONE: string;
  BAILLEUR_ADRESSE: string;
  BAILLEUR_FORME_JURIDIQUE: string;
  BAILLEUR_REPRESENTANT: string;
}

/** Entites detentrices du bien, a inclure dans `property.include` (filtrees par agence). */
function landlordHoldingsInclude(tenantId: string) {
  return {
    where: { tenantId },
    include: {
      entity: {
        include: {
          contact: { select: { ...CRM_CONTACT_SELECT, tenantId: true } }
        }
      }
    }
  };
}

/** Entite detentrice principale du bien (plus forte part) : active et de l'agence uniquement. */
function pickHoldingEntity(property: any, tenantId: string): any | null {
  const holdings: any[] = (property?.holdings || []).filter(
    (h: any) => h?.tenantId === tenantId && h?.entity && h.entity.tenantId === tenantId && h.entity.isActive !== false
  );
  if (holdings.length === 0) return null;
  holdings.sort((x, y) => Number(y.sharePercent ?? 0) - Number(x.sharePercent ?? 0));
  return holdings[0].entity;
}

/** Forme juridique d'une entite detentrice (« INDIVIDUAL » se lit « Personne physique »). */
function entityLegalForm(entity: any): string {
  const labels: Record<string, string> = {
    SCI: 'SCI',
    HOLDING: 'Holding',
    COMPANY: 'Société',
    INDIVIDUAL: 'Personne physique'
  };
  return labels[entity?.legalForm] || NON_RENSEIGNE;
}

/**
 * Bailleur d'un bail, selon la propriete reelle du bien. Ordre :
 *
 * 1. entite detentrice du bien (SCI, holding, societe, personne physique
 *    rattachee via `PropertyHolding`) : denomination et coordonnees de sa
 *    fiche CRM ;
 * 2. proprietaire client (`lease.ownerClient`, sinon `property.owner` pour un
 *    bien de type CLIENT) : coordonnees de sa fiche CRM ; l'agence est alors
 *    designee comme mandataire ;
 * 3. sinon (bien detenu en propre) l'agence : denomination legale, adresse,
 *    telephone et e-mail de ses parametres.
 *
 * Jamais l'utilisateur qui a saisi le bien (`property.owner` d'un bien
 * TENANT/PUBLIC n'est que son createur). Une coordonnee absente vaut « — » :
 * la generation n'est pas bloquee. Seules les donnees de l'agence du bail
 * entrent dans le contexte (entites et fiches filtrees par `tenantId`).
 */
async function resolveLandlord(lease: any, tenantId: string): Promise<Landlord> {
  const agency = lease?.tenant;
  const property = lease?.property;

  const entity = pickHoldingEntity(property, tenantId);
  if (entity) {
    const contact = entity.contact && entity.contact.tenantId === tenantId ? entity.contact : null;
    return {
      BAILLEUR_NOM: orDash(entity.name),
      BAILLEUR_EMAIL: orDash(contact?.email),
      BAILLEUR_TELEPHONE: orDash(contactPhone(contact)),
      BAILLEUR_ADRESSE: joinPresent([contact?.address, contact?.district, contact?.city]),
      BAILLEUR_FORME_JURIDIQUE: entityLegalForm(entity),
      BAILLEUR_REPRESENTANT: partyRepresentative(contact)
    };
  }

  const ownerUser = lease?.ownerClient?.user || (property?.ownershipType === 'CLIENT' ? property?.owner : null) || null;
  if (lease?.ownerClient || ownerUser) {
    const contact = await loadCrmContact(lease.ownerClient, tenantId);
    const details = parseClientDetails(lease.ownerClient);
    const phone =
      contactPhone(contact) ||
      (lease.ownerClient ? await getPhoneFromClient(lease.ownerClient, tenantId, 'BAILLEUR') : '');
    const name = orDash(partyName(ownerUser, contact) || ownerUser?.email);
    const agencyName = agency?.legalName || agency?.name;
    return {
      // L'agence gere le bien pour le compte du proprietaire : elle figure comme mandataire.
      BAILLEUR_NOM:
        agencyName && name !== NON_RENSEIGNE ? `${name}, représenté par l'agence ${agencyName} (mandataire)` : name,
      BAILLEUR_EMAIL: orDash(ownerUser?.email || contact?.email),
      BAILLEUR_TELEPHONE: orDash(phone),
      BAILLEUR_ADRESSE: joinPresent([contact?.address || details.address, contact?.district, contact?.city]),
      BAILLEUR_FORME_JURIDIQUE: partyLegalForm(contact),
      BAILLEUR_REPRESENTANT: partyRepresentative(contact)
    };
  }

  // Bien detenu en propre : l'agence est le bailleur.
  return {
    BAILLEUR_NOM: orDash(agency?.legalName || agency?.name),
    BAILLEUR_EMAIL: orDash(agency?.contactEmail),
    BAILLEUR_TELEPHONE: orDash(agency?.contactPhone),
    BAILLEUR_ADRESSE: joinPresent([agency?.address, agency?.city]),
    BAILLEUR_FORME_JURIDIQUE: NON_RENSEIGNE,
    BAILLEUR_REPRESENTANT: NON_RENSEIGNE
  };
}

/**
 * Champs communs a la quittance et au releve dans les modeles DOCX du depot
 * (`Reçu_Loyer.docx`, `Releve_Compte.docx`), en plus des cles historiques.
 */
async function buildCommonDocumentFields(
  lease: any,
  tenantId: string,
  landlord?: Landlord
): Promise<Record<string, string>> {
  const resolved = landlord ?? (await resolveLandlord(lease, tenantId));
  return {
    ADRESSE_BIEN: orDash(lease?.property?.address),
    TYPE_BIEN: propertyTypeLabel(lease?.property?.propertyType),
    BAIL_REFERENCE: orDash(lease?.lease_number),
    BAILLEUR_NOM: resolved.BAILLEUR_NOM,
    BAILLEUR_EMAIL: resolved.BAILLEUR_EMAIL,
    BAILLEUR_TELEPHONE: resolved.BAILLEUR_TELEPHONE
  };
}

/** Lieu d'emission : ville de l'agence, a defaut son adresse. */
function issuePlace(agency: any): string {
  return orDash(agency?.city || agency?.address);
}

const CRM_CONTACT_SELECT = {
  id: true,
  contactType: true,
  firstName: true,
  lastName: true,
  email: true,
  identityDocumentType: true,
  identityDocumentNumber: true,
  legalName: true,
  legalForm: true,
  rccm: true,
  representativeName: true,
  representativeRole: true,
  phonePrimary: true,
  phoneSecondary: true,
  whatsappNumber: true,
  address: true,
  district: true,
  city: true,
  sectorOfActivity: true
} as const;

/** Details d'un client (JSON ou chaine JSON), objet vide si illisible. */
function parseClientDetails(client: any): Record<string, any> {
  const raw = client?.details;
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Fiche CRM (identite, adresse, societe) rattachee a un client par `details.crmContactId`, sinon `null`. */
async function loadCrmContact(client: any, tenantId: string): Promise<any | null> {
  const crmContactId = parseClientDetails(client).crmContactId;
  if (!crmContactId) return null;
  try {
    return await prisma.crmContact.findFirst({
      where: { id: crmContactId, tenantId },
      select: CRM_CONTACT_SELECT
    });
  } catch (error) {
    logger.warn('loadCrmContact: contact illisible', {
      crmContactId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
}

/** Premier telephone de la fiche CRM (principal, secondaire, WhatsApp). */
function contactPhone(contact: any): string {
  return contact?.phonePrimary || contact?.phoneSecondary || contact?.whatsappNumber || '';
}

/** Nom de la partie : raison sociale d'une societe, sinon nom du compte, sinon prenom et nom de la fiche. */
function partyName(user: any, contact: any): string {
  if (contact?.contactType === 'COMPANY' && contact.legalName) return contact.legalName;
  const contactName = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim();
  return user?.fullName || contactName || contact?.legalName || '';
}

/** Forme juridique : celle de la fiche, « Personne physique » pour un particulier, sinon « — ». */
function partyLegalForm(contact: any): string {
  if (contact?.legalForm) return legalFormLabel(contact.legalForm);
  return contact?.contactType === 'PERSON' ? 'Personne physique' : NON_RENSEIGNE;
}

/** « Nom (Fonction) » du representant legal de la fiche, sinon « — ». */
function partyRepresentative(contact: any): string {
  const name = (contact?.representativeName || '').trim();
  if (!name) return NON_RENSEIGNE;
  const role = (contact?.representativeRole || '').trim();
  return role ? `${name} (${role})` : name;
}

/** Champs communs aux deux baux pour le preneur : identite, coordonnees, adresse. */
async function buildRenterFields(lease: any, tenantId: string, contact: any): Promise<Record<string, string>> {
  const renter = lease.primaryRenter;
  const details = parseClientDetails(renter);
  const phone = contactPhone(contact) || (await getPhoneFromClient(renter, tenantId, 'LOCATAIRE'));
  return {
    LOCATAIRE_NOM: orDash(partyName(renter?.user, contact)),
    LOCATAIRE_EMAIL: orDash(renter?.user?.email || contact?.email),
    LOCATAIRE_TELEPHONE: orDash(phone),
    LOCATAIRE_ADRESSE: joinPresent([contact?.address || details.address, contact?.district, contact?.city]),
    LOCATAIRE_PIECE_ID: identityDocumentLabel(contact?.identityDocumentType, contact?.identityDocumentNumber)
  };
}

/** Champs du bien communs aux deux baux. */
function buildPropertyFields(property: any): Record<string, string> {
  return {
    DESCRIPTION_BIEN: orDash(property?.description || property?.title),
    SUPERFICIE: formatSurface(property?.surfaceArea ?? property?.surfaceUseful),
    EQUIPEMENTS: propertyEquipmentLabel(property)
  };
}

/** Conditions financieres et durees du bail, telles que les modeles les lisent (« FCFA » est pose par le modele). */
function buildLeaseTermsFields(lease: any): Record<string, string> {
  return {
    DATE_DEBUT_BAIL: orDash(formatDate(lease.start_date)),
    DATE_FIN_BAIL: orDash(formatDate(lease.end_date)),
    DUREE_BAIL: leaseDurationLabel(lease.start_date, lease.end_date),
    // Sans devise : les modeles ecrivent « {{LOYER_MENSUEL}} FCFA ».
    LOYER_MENSUEL: formatNumber(lease.rent_amount),
    CHARGES_MENSUELLES: formatNumber(lease.service_charge_amount),
    DEPOT_GARANTIE: formatNumber(lease.security_deposit_amount),
    JOUR_ECHEANCE: orDash(lease.due_day_of_month),
    DELAI_GRACE: String(lease.penalty_grace_days ?? 0),
    CLAUSE_PENALITE: penaltyClauseLabel(
      lease.penalty_mode,
      lease.penalty_rate,
      lease.penalty_fixed_amount,
      formatAmount(lease.penalty_fixed_amount, lease.currency),
      Number(lease.penalty_cap_amount) > 0 ? formatAmount(lease.penalty_cap_amount, lease.currency) : ''
    ),
    TAUX_PENALITE: penaltyRateLabel(
      lease.penalty_mode,
      lease.penalty_rate,
      formatAmount(lease.penalty_fixed_amount, lease.currency)
    ),
    CLAUSES_PARTICULIERES: orDash(lease.notes)
  };
}

/** Champs propres au bail commercial : activite, forme juridique, RCCM, representants, charges, pas-de-porte. */
function buildCommercialFields(lease: any, renterContact: any, landlord: Landlord): Record<string, string> {
  return {
    ACTIVITE_COMMERCIALE: orDash(renterContact?.sectorOfActivity),
    LOCATAIRE_FORME_JURIDIQUE: partyLegalForm(renterContact),
    LOCATAIRE_RCCM: orDash(renterContact?.rccm),
    LOCATAIRE_REPRESENTANT: partyRepresentative(renterContact),
    BAILLEUR_FORME_JURIDIQUE: landlord.BAILLEUR_FORME_JURIDIQUE,
    BAILLEUR_REPRESENTANT: landlord.BAILLEUR_REPRESENTANT,
    DETAIL_CHARGES:
      Number(lease.service_charge_amount) > 0 ? 'les charges de service convenues au bail' : NON_RENSEIGNE,
    // Aucun champ « droit d'entree » sur le bail : a completer a la main.
    PAS_DE_PORTE: NON_RENSEIGNE,
    PREAVIS_PRENEUR: DEFAULT_NOTICE_COMMERCIAL
  };
}

type LeaseKind = 'HABITATION' | 'COMMERCIAL';

/**
 * Build context for a lease contract (LEASE_HABITATION or LEASE_COMMERCIAL).
 *
 * Les cles historiques (`BAIL_*`, `BIEN_*`, `AGENCE_*`...) sont conservees pour
 * les modeles d'agence personnalises ; les cles des modeles DOCX du depot
 * (`contrat_bail_habitation.docx`, `contrat_bail_commercial.docx`) s'y ajoutent.
 */
async function buildLeaseContext(kind: LeaseKind, tenantId: string, leaseId: string): Promise<Record<string, any>> {
  logger.info('buildLeaseContext: Starting', { kind, tenantId, leaseId });

  const lease = await prisma.rentalLease.findFirst({
    where: {
      id: leaseId,
      tenant_id: tenantId
    },
    include: {
      property: {
        include: {
          owner: { select: { id: true, email: true, fullName: true } },
          holdings: landlordHoldingsInclude(tenantId)
        }
      },
      primaryRenter: {
        include: {
          user: {
            select: { id: true, email: true, fullName: true }
          }
        }
      },
      ownerClient: {
        include: {
          user: {
            select: { id: true, email: true, fullName: true }
          }
        }
      },
      tenant: true,
      coRenters: {
        include: {
          renterClient: {
            include: {
              user: {
                select: { id: true, email: true, fullName: true }
              }
            }
          }
        }
      }
    }
  });

  if (!lease) {
    throw new NotFoundError(t('Bail introuvable'));
  }

  // Helper function to format billing frequency
  const formatBillingFrequency = (freq: string | null | undefined): string => {
    if (!freq) return '';
    // Accorde au feminin et en minuscules : la valeur s'insere dans une phrase
    // (« la facturation est trimestrielle »), pas dans une case de tableau.
    // « La facturation est TRIMESTRIEL » se lit deux fois mal.
    const mapping: Record<string, string> = {
      MONTHLY: 'mensuelle',
      QUARTERLY: 'trimestrielle',
      SEMIANNUAL: 'semestrielle',
      ANNUAL: 'annuelle'
    };
    return mapping[freq.toUpperCase()] || freq;
  };

  const renterContact = await loadCrmContact(lease.primaryRenter, tenantId);
  const landlord = await resolveLandlord(lease, tenantId);

  const context: Record<string, any> = {
    // Tenant (Agency) info
    AGENCE_NOM: lease.tenant.name || '',
    AGENCE_ADRESSE: lease.tenant.address || lease.tenant.city || '',
    AGENCE_TELEPHONE: lease.tenant.contactPhone || '',
    AGENCE_EMAIL: lease.tenant.contactEmail || '',

    // Property info
    BIEN_ADRESSE: lease.property.address || '',
    BIEN_TYPE: lease.property.propertyType || '',
    // Une surface n'est pas une somme : pas de devise ici.
    BIEN_SURFACE: formatNumber(lease.property.surfaceArea),
    BIEN_PIECES: lease.property.rooms?.toString() || '',
    BIEN_CHAMBRES: lease.property.bedrooms?.toString() || '',

    // Lease info
    BAIL_NUMERO: lease.lease_number || '',
    BAIL_DATE_DEBUT: formatDate(lease.start_date),
    BAIL_DATE_FIN: lease.end_date ? formatDate(lease.end_date) : '',
    BAIL_LOYER_MENSUEL: formatAmount(lease.rent_amount, lease.currency),
    BAIL_CHARGES: formatAmount(lease.service_charge_amount, lease.currency),
    BAIL_DEPOT_GARANTIE: formatAmount(lease.security_deposit_amount, lease.currency),
    BAIL_FREQUENCE: formatBillingFrequency(lease.billing_frequency),
    BAIL_JOUR_ECHEANCE: lease.due_day_of_month?.toString() || '',

    // Dates
    DATE_GENERATION: formatDate(new Date()),

    // Champs des modeles DOCX du depot : preneur, bailleur (bien, type, adresse),
    // bien, conditions du bail. Ils reprennent les cles ci-dessus quand elles
    // existent (LOCATAIRE_*, BAILLEUR_*, DATE_SIGNATURE) avec « — » pour une
    // donnee absente : le moteur remplace tout champ vide par `{{NOM}}`.
    ...(await buildRenterFields(lease, tenantId, renterContact)),
    ...(await buildCommonDocumentFields(lease, tenantId, landlord)),
    BAILLEUR_ADRESSE: landlord.BAILLEUR_ADRESSE,
    ...buildPropertyFields(lease.property),
    ...buildLeaseTermsFields(lease),
    PREAVIS_PRENEUR: DEFAULT_NOTICE_HABITATION,
    LIEU_SIGNATURE: issuePlace(lease.tenant),
    // Date de signature : creation du bail, a defaut aujourd'hui.
    DATE_SIGNATURE: formatDate(lease.created_at || new Date()),
    ...(kind === 'COMMERCIAL' ? buildCommercialFields(lease, renterContact, landlord) : {})
  };

  logger.info('buildLeaseContext: Context built', {
    kind,
    leaseId: lease.id,
    tenantId: lease.tenant_id,
    tenantName: lease.tenant.name,
    tenantCity: lease.tenant.city,
    hasLOCATAIRE_TELEPHONE: !!context.LOCATAIRE_TELEPHONE,
    hasBAILLEUR_TELEPHONE: !!context.BAILLEUR_TELEPHONE,
    hasAGENCE_ADRESSE: !!context.AGENCE_ADRESSE,
    hasAGENCE_TELEPHONE: !!context.AGENCE_TELEPHONE,
    hasAGENCE_EMAIL: !!context.AGENCE_EMAIL
  });

  // Add co-renters if any
  if (lease.coRenters && lease.coRenters.length > 0) {
    context.COLOCATAIRES = lease.coRenters.map(cr => ({
      NOM: cr.renterClient?.user?.fullName || '',
      EMAIL: cr.renterClient?.user?.email || ''
    }));
  }

  return context;
}

/**
 * Build context for LEASE_HABITATION document
 */
export async function buildLeaseHabitationContext(tenantId: string, leaseId: string): Promise<Record<string, any>> {
  return buildLeaseContext('HABITATION', tenantId, leaseId);
}

/**
 * Build context for LEASE_COMMERCIAL document : les champs du bail d'habitation,
 * plus ceux du modele commercial (activite, RCCM, forme juridique, representants,
 * detail des charges, pas-de-porte, preavis commercial).
 */
export async function buildLeaseCommercialContext(tenantId: string, leaseId: string): Promise<Record<string, any>> {
  return buildLeaseContext('COMMERCIAL', tenantId, leaseId);
}

/**
 * Build context for RENT_RECEIPT document
 */
export async function buildRentReceiptContext(
  tenantId: string,
  paymentId: string,
  installmentId?: string
): Promise<Record<string, any>> {
  const payment = await prisma.rentalPayment.findFirst({
    where: {
      id: paymentId,
      tenant_id: tenantId
    },
    include: {
      lease: {
        include: {
          property: {
            include: {
              owner: { select: { id: true, email: true, fullName: true } },
              holdings: landlordHoldingsInclude(tenantId)
            }
          },
          primaryRenter: {
            include: {
              user: {
                select: { id: true, email: true, fullName: true }
              }
            }
          },
          ownerClient: {
            include: {
              user: {
                select: { id: true, email: true, fullName: true }
              }
            }
          },
          tenant: true
        }
      },
      renterClient: {
        include: {
          user: {
            select: { id: true, email: true, fullName: true }
          }
        }
      },
      allocations: {
        include: {
          installment: true
        }
      }
    }
  });

  if (!payment) {
    throw new NotFoundError(t('Paiement introuvable'));
  }

  // Get installment if provided or from first allocation
  let installment = null;
  if (installmentId) {
    installment = await prisma.rentalInstallment.findFirst({
      where: {
        id: installmentId,
        tenant_id: tenantId,
        lease_id: payment.lease_id || undefined
      },
      include: {
        items: true
      }
    });
  } else if (payment.allocations && payment.allocations.length > 0) {
    installment = await prisma.rentalInstallment.findFirst({
      where: {
        id: payment.allocations[0].installment_id,
        tenant_id: tenantId
      },
      include: {
        items: true
      }
    });
  }

  // Ventilation du paiement sur l'echeance (voir breakdownPayment) :
  // - avec `installmentId`, seule la part affectee a cette echeance ;
  // - sinon, tout le paiement : ses affectations, plus la part non affectee
  //   (avance), ajoutee au loyer.
  // MONTANT_TOTAL est la somme des trois montants ventiles ; il vaut le montant
  // paye, sauf quittance restreinte a une echeance d'un paiement qui en couvre
  // plusieurs (PAIEMENT_MONTANT reste alors le montant global du paiement).
  const allocations = payment.allocations || [];
  const dueOf = (inst: any) => ({
    rent: Number(inst.amount_rent),
    charges: Number(inst.amount_service) + Number(inst.amount_other_fees),
    penalties: Number(inst.penalty_amount || 0)
  });
  const paidAmount = Number(payment.amount);
  const targeted = installmentId ? allocations.filter(a => a.installment_id === installmentId) : allocations;

  let breakdown;
  let coveredInstallments: any[];
  if (targeted.length > 0) {
    const allocated = targeted.reduce((sum, a) => sum + Number(a.amount), 0);
    breakdown = breakdownPayment(
      targeted.map(a => ({ due: dueOf(a.installment), allocated: Number(a.amount) })),
      installmentId ? 0 : paidAmount - allocated
    );
    coveredInstallments = targeted.map(a => a.installment);
  } else if (installment) {
    breakdown = breakdownPayment([{ due: dueOf(installment), allocated: paidAmount }]);
    coveredInstallments = [installment];
  } else {
    breakdown = breakdownPayment([], paidAmount);
    coveredInstallments = [];
  }

  const paymentNumber = payment.id.substring(0, 8).toUpperCase();
  const agency = payment.lease?.tenant;
  const landlordAndProperty = await buildCommonDocumentFields(payment.lease, tenantId);

  const context: Record<string, any> = {
    // Tenant (Agency) info
    AGENCE_NOM: payment.lease?.tenant.name || '',
    AGENCE_ADRESSE: payment.lease?.tenant.address || '',
    AGENCE_TELEPHONE: payment.lease?.tenant.contactPhone || '',
    AGENCE_EMAIL: payment.lease?.tenant.contactEmail || '',

    // Property info
    BIEN_ADRESSE: payment.lease?.property.address || '',
    BIEN_TYPE: payment.lease?.property.propertyType || '',

    // Lease info
    BAIL_NUMERO: payment.lease?.lease_number || '',
    BAIL_LOYER_MENSUEL: formatAmount(payment.lease?.rent_amount, payment.lease?.currency),

    // Renter info
    LOCATAIRE_NOM: payment.renterClient?.user?.fullName || payment.lease?.primaryRenter?.user?.fullName || '',
    LOCATAIRE_EMAIL: payment.renterClient?.user?.email || payment.lease?.primaryRenter?.user?.email || '',
    LOCATAIRE_TELEPHONE: orDash(
      await getPhoneFromClient(payment.renterClient || payment.lease?.primaryRenter, tenantId, 'LOCATAIRE')
    ),

    // Payment info
    PAIEMENT_MONTANT: formatAmount(payment.amount, payment.currency),
    PAIEMENT_METHODE: payment.method || '',
    PAIEMENT_DATE: formatDate(payment.succeeded_at || payment.initiated_at),
    PAIEMENT_NUMERO: paymentNumber,

    // Period info
    PERIODE_MOIS: installment ? `${installment.period_month}/${installment.period_year}` : '',
    PERIODE_ANNEE: installment?.period_year?.toString() || '',

    // Dates
    DATE_GENERATION: formatDate(new Date()),

    // Champs du modele DOCX `Reçu_Loyer.docx`. RECU_NUMERO est la reference du
    // paiement : le numero definitif de quittance (RCU-...) n'est attribue
    // qu'apres le rendu.
    ...landlordAndProperty,
    RECU_NUMERO: paymentNumber,
    DATE_EMISSION: formatDate(new Date()),
    LIEU_EMISSION: issuePlace(agency),
    PERIODE_LOYER: periodRangeLabel(
      coveredInstallments.map(inst => ({ month: inst.period_month, year: inst.period_year }))
    ),
    MONTANT_LOYER: formatNumber(breakdown.rent),
    MONTANT_CHARGES: formatNumber(breakdown.charges),
    MONTANT_PENALITES: formatNumber(breakdown.penalties),
    MONTANT_TOTAL: formatNumber(breakdown.total),
    MODE_PAIEMENT: paymentMethodLabel(payment.method),
    REFERENCE_PAIEMENT: orDash(payment.psp_reference || payment.psp_transaction_id || paymentNumber),
    DATE_PAIEMENT: orDash(formatDate(payment.succeeded_at || payment.initiated_at))
  };

  return context;
}

/**
 * Build context for RENT_STATEMENT document
 */
export async function buildRentStatementContext(
  tenantId: string,
  leaseId: string,
  startDate: Date,
  endDate: Date
): Promise<Record<string, any>> {
  const lease = await prisma.rentalLease.findFirst({
    where: {
      id: leaseId,
      tenant_id: tenantId
    },
    include: {
      property: {
        include: {
          owner: { select: { id: true, email: true, fullName: true } },
          holdings: landlordHoldingsInclude(tenantId)
        }
      },
      primaryRenter: {
        include: {
          user: {
            select: { id: true, email: true, fullName: true }
          }
        }
      },
      ownerClient: {
        include: {
          user: {
            select: { id: true, email: true, fullName: true }
          }
        }
      },
      tenant: true,
      installments: {
        where: {
          due_date: {
            gte: startDate,
            lte: endDate
          }
        },
        include: {
          items: true,
          payments: {
            include: {
              payment: true
            }
          }
        },
        orderBy: {
          due_date: 'asc'
        }
      }
    }
  });

  if (!lease) {
    throw new NotFoundError(t('Bail introuvable'));
  }

  // Calculate totals
  let totalDue = 0;
  let totalPaid = 0;
  let totalRent = 0;
  let totalCharges = 0;
  let totalPenalties = 0;
  const installments = lease.installments || [];

  // Même règle que le grand livre (relevé du portail, compte du locataire,
  // balance clients) : une échéance n'est DUE au relevé qu'à sa date
  // d'exigibilité ; ce qui a été réglé d'avance, lui, compte déjà.
  const maintenant = new Date();
  const dueOf = (inst: Parameters<typeof amountDueAt>[0]) => amountDueAt(inst, maintenant);
  const exigible = (inst: { due_date: Date }) => inst.due_date <= maintenant;

  installments.forEach(inst => {
    totalDue += dueOf(inst);
    totalPaid += Number(inst.amount_paid);
    if (exigible(inst)) {
      totalRent += Number(inst.amount_rent);
      totalCharges += Number(inst.amount_service) + Number(inst.amount_other_fees);
      totalPenalties += Number(inst.penalty_amount || 0);
    }
  });

  // Solde initial : reste du sur les echeances anterieures a la periode, avec
  // les memes regles que les totaux (toutes les echeances, tous statuts).
  const previousInstallments = await prisma.rentalInstallment.findMany({
    where: {
      lease_id: lease.id,
      tenant_id: tenantId,
      due_date: { lt: startDate }
    },
    select: {
      due_date: true,
      amount_rent: true,
      amount_service: true,
      amount_other_fees: true,
      penalty_amount: true,
      amount_paid: true
    }
  });
  const openingBalance = previousInstallments.reduce((sum, inst) => sum + dueOf(inst) - Number(inst.amount_paid), 0);
  const closingBalance = openingBalance + totalDue - totalPaid;

  // Lignes d'operations du modele (3 lignes) : une echeance par ligne (debit =
  // du, credit = paye, solde cumule depuis le solde initial). Au-dela de trois
  // echeances, la 3e ligne regroupe toutes les suivantes : aucun montant ne se
  // perd, et son solde est le solde final.
  const OPERATION_LINES = 3;
  const currency = lease.currency;
  const groupedFrom = installments.length > OPERATION_LINES ? OPERATION_LINES - 1 : installments.length;
  const operationRows = installments.slice(0, groupedFrom).map(inst => ({
    date: formatDate(inst.due_date),
    label: `Échéance ${monthLabel(inst.period_month, inst.period_year)}`,
    debit: dueOf(inst),
    credit: Number(inst.amount_paid)
  }));
  if (installments.length > groupedFrom) {
    const rest = installments.slice(groupedFrom);
    const first = rest[0];
    const last = rest[rest.length - 1];
    operationRows.push({
      date:
        rest.length > 1 ? `${formatDate(first.due_date)} - ${formatDate(last.due_date)}` : formatDate(first.due_date),
      label:
        rest.length > 1
          ? `Échéances ${monthLabel(first.period_month, first.period_year)} à ${monthLabel(last.period_month, last.period_year)}`
          : `Échéance ${monthLabel(first.period_month, first.period_year)}`,
      debit: rest.reduce((sum, inst) => sum + dueOf(inst), 0),
      credit: rest.reduce((sum, inst) => sum + Number(inst.amount_paid), 0)
    });
  }

  const operationFields: Record<string, string> = {};
  let runningBalance = openingBalance;
  for (let n = 1; n <= OPERATION_LINES; n++) {
    const row = operationRows[n - 1];
    if (row) runningBalance += row.debit - row.credit;
    operationFields[`OP_DATE_${n}`] = row ? orDash(row.date) : NON_RENSEIGNE;
    operationFields[`OP_LIBELLE_${n}`] = row ? row.label : NON_RENSEIGNE;
    operationFields[`OP_DEBIT_${n}`] = row ? formatAmount(row.debit, currency) : NON_RENSEIGNE;
    operationFields[`OP_CREDIT_${n}`] = row ? formatAmount(row.credit, currency) : NON_RENSEIGNE;
    operationFields[`OP_SOLDE_${n}`] = row ? formatAmount(runningBalance, currency) : NON_RENSEIGNE;
  }

  const observations: string[] = [];
  if (installments.length === 0) {
    observations.push('Aucune échéance sur la période.');
  } else if (installments.length > OPERATION_LINES) {
    observations.push(
      `Les ${installments.length - groupedFrom} dernières échéances de la période sont regroupées sur la dernière ligne.`
    );
  }

  const statementMonth = `${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, '0')}`;
  const commonFields = await buildCommonDocumentFields(lease, tenantId);

  const context: Record<string, any> = {
    // Tenant (Agency) info
    AGENCE_NOM: lease.tenant.name || '',
    AGENCE_ADRESSE: lease.tenant.address || '',
    AGENCE_TELEPHONE: lease.tenant.contactPhone || '',
    AGENCE_EMAIL: lease.tenant.contactEmail || '',

    // Property info
    BIEN_ADRESSE: lease.property.address || '',
    BIEN_TYPE: lease.property.propertyType || '',

    // Lease info
    BAIL_NUMERO: lease.lease_number || '',
    BAIL_LOYER_MENSUEL: formatAmount(lease.rent_amount, lease.currency),

    // Renter info
    LOCATAIRE_NOM: lease.primaryRenter?.user?.fullName || '',
    LOCATAIRE_EMAIL: lease.primaryRenter?.user?.email || '',
    LOCATAIRE_TELEPHONE: orDash(await getPhoneFromClient(lease.primaryRenter, tenantId, 'LOCATAIRE')),

    // Period info
    PERIODE_DEBUT: formatDate(startDate),
    PERIODE_FIN: formatDate(endDate),

    // Totals
    TOTAL_DU: formatAmount(totalDue, lease.currency),
    TOTAL_PAYE: formatAmount(totalPaid, lease.currency),
    SOLDE: formatAmount(totalDue - totalPaid, lease.currency),

    // Installments detail
    ECHEANCES: installments.map(inst => ({
      MOIS: `${inst.period_month}/${inst.period_year}`,
      DATE_ECHEANCE: formatDate(inst.due_date),
      MONTANT_DU: formatAmount(
        Number(inst.amount_rent) +
          Number(inst.amount_service) +
          Number(inst.amount_other_fees) +
          Number(inst.penalty_amount || 0),
        inst.currency || lease.currency
      ),
      MONTANT_PAYE: formatAmount(inst.amount_paid, inst.currency || lease.currency),
      STATUT: inst.status
    })),

    // Dates
    DATE_GENERATION: formatDate(new Date()),

    // Champs du modele DOCX `Releve_Compte.docx`
    ...commonFields,
    ...operationFields,
    RELEVE_REFERENCE: `RLV-${lease.lease_number || lease.id.substring(0, 8).toUpperCase()}-${statementMonth}`,
    DATE_EDITION: formatDate(new Date()),
    LIEU_EDITION: issuePlace(lease.tenant),
    SOLDE_INITIAL: formatAmount(openingBalance, currency),
    TOTAL_LOYERS: formatAmount(totalRent, currency),
    TOTAL_CHARGES: formatAmount(totalCharges, currency),
    TOTAL_PENALITES: formatAmount(totalPenalties, currency),
    TOTAL_PAIEMENTS: formatAmount(totalPaid, currency),
    SOLDE_FINAL: formatAmount(closingBalance, currency),
    OBSERVATIONS: observations.length > 0 ? observations.join(' ') : NON_RENSEIGNE
  };

  return context;
}

/**
 * Build context for a document type
 */
export async function buildDocumentContext(
  tenantId: string,
  docType: DocumentType,
  sourceKey: string,
  additionalParams?: {
    installmentId?: string;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<Record<string, any>> {
  switch (docType) {
    case DocumentType.LEASE_HABITATION:
      return buildLeaseHabitationContext(tenantId, sourceKey);

    case DocumentType.LEASE_COMMERCIAL:
      return buildLeaseCommercialContext(tenantId, sourceKey);

    case DocumentType.RENT_RECEIPT:
      return buildRentReceiptContext(tenantId, sourceKey, additionalParams?.installmentId);

    case DocumentType.RENT_STATEMENT:
      if (!additionalParams?.startDate || !additionalParams?.endDate) {
        throw new BadRequestError(t('Les dates de début et de fin sont requises pour le relevé de loyer'));
      }
      return buildRentStatementContext(tenantId, sourceKey, additionalParams.startDate, additionalParams.endDate);

    default:
      throw new Error(`Unsupported document type: ${docType}`);
  }
}

/**
 * Validate context against template placeholders
 */
export function validateContext(
  context: Record<string, any>,
  placeholders: string[]
): { missing: string[]; warnings: string[] } {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Critical placeholders that must be present
  const criticalPlaceholders = ['AGENCE_NOM', 'LOCATAIRE_NOM', 'BAIL_NUMERO', 'BAIL_LOYER_MENSUEL'];

  placeholders.forEach(placeholder => {
    if (!(placeholder in context) || context[placeholder] === null || context[placeholder] === undefined) {
      if (criticalPlaceholders.includes(placeholder)) {
        missing.push(placeholder);
      } else {
        warnings.push(placeholder);
      }
    }
  });

  return { missing, warnings };
}
