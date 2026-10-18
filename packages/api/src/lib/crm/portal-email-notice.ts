import { maskEmail } from '../direct-debit/recipient';

/**
 * Avertissement de la fiche contact CRM : les avis (prélèvement, rappels…)
 * partent à l'e-mail du compte portail du client lié, pas à celui de la fiche
 * (décision « Compte, et le dire »). Le lien contact <-> client est
 * `TenantClient.details.crmContactId`.
 *
 * Seule l'adresse MASQUÉE sort de ce module : jamais l'adresse complète du compte.
 */
export interface PortalAccountEmailNotice {
  maskedEmail: string;
}

/** Sous-ensemble de Prisma utilisé ici (testable sans base). */
export interface PortalNoticeDb {
  tenantClient: {
    findMany(args: {
      where: { tenantId: string; details: { path: string[]; equals: string } };
      select: { id: true; user: { select: { email: true } } };
    }): Promise<Array<{ id: string; user: { email: string | null } | null }>>;
  };
}

const normalize = (email: string | null | undefined): string => (email ?? '').trim().toLowerCase();

export async function getPortalAccountEmailNotice(
  db: PortalNoticeDb,
  tenantId: string,
  contactId: string,
  contactEmail: string | null | undefined
): Promise<PortalAccountEmailNotice | null> {
  const clients = await db.tenantClient.findMany({
    where: { tenantId, details: { path: ['crmContactId'], equals: contactId } },
    select: { id: true, user: { select: { email: true } } }
  });
  const own = normalize(contactEmail);
  for (const client of clients) {
    const accountEmail = client.user?.email?.trim();
    if (accountEmail && normalize(accountEmail) !== own) {
      return { maskedEmail: maskEmail(accountEmail) };
    }
  }
  return null;
}
