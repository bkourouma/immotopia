/**
 * Compte de lot (grand livre `OwnerAccount`) et role CRM du coproprietaire.
 *
 * Extrait sans changement de comportement de `lib/syndics/queries.ts` (lot
 * S2) : l'affectation des paiements (`charge-allocation.ts`) en a besoin sans
 * importer le fichier de requetes entier (dependance circulaire).
 */

import { supportsOwnerAccount, type OwnerAccountTxClient } from '../finance/ledger';
import type { PrismaTransactionClient } from '../../utils/database';

export async function ensureCrmRoleForContact(
  tx: PrismaTransactionClient,
  tenantId: string,
  contactId: string,
  role: 'COOWNER' | 'TENANT'
) {
  const existing = await tx.crmContactRole.findFirst({
    where: {
      tenantId,
      contactId,
      role: role as any,
      active: true
    },
    select: { id: true }
  });

  if (existing) {
    return existing;
  }

  return tx.crmContactRole.create({
    data: {
      tenantId,
      contactId,
      role: role as any,
      active: true,
      startedAt: new Date()
    }
  });
}

export async function ensureOwnerAccountForLotTx(
  tx: OwnerAccountTxClient,
  tenantId: string,
  syndicateId: string,
  lotId: string
) {
  if (!supportsOwnerAccount(tx)) {
    return null;
  }

  const lot = await tx.syndicateLot.findFirst({
    where: {
      id: lotId,
      syndicateId,
      syndicate: { tenantId }
    },
    select: {
      id: true,
      coownerId: true,
      ownerContactId: true,
      property: {
        select: {
          owner: {
            select: {
              email: true
            }
          }
        }
      }
    }
  });

  if (!lot) {
    return null;
  }

  let contactId = lot.coownerId ?? lot.ownerContactId ?? null;

  // Fallback for imported lots: map property owner user email to tenant CRM contact.
  if (!contactId) {
    const ownerEmail = lot.property?.owner?.email?.trim().toLowerCase();
    if (ownerEmail) {
      const ownerContact = await tx.crmContact.findFirst({
        where: {
          tenantId,
          email: ownerEmail
        },
        select: {
          id: true
        }
      });

      if (ownerContact?.id) {
        contactId = ownerContact.id;

        await tx.syndicateLot.update({
          where: { id: lot.id },
          data: {
            coownerId: ownerContact.id,
            ownerContactId: ownerContact.id
          }
        });

        await ensureCrmRoleForContact(tx, tenantId, ownerContact.id, 'COOWNER');
      }
    }
  }

  if (!contactId) {
    return null;
  }

  // Concurrence (constat de recette, module 3.3) : deux requetes qui
  // consultent le compte du meme lot pour la premiere fois (la page web
  // demandait `/compte` et `/compte/transactions` en parallele, chacune
  // declenchant sa propre creation) faisaient toutes les deux ce
  // `findUnique` avant qu'aucune n'ait committe sa `create` : la seconde
  // heurtait la contrainte unique sur `lotId` (P2002), remontee en 409 sur
  // ce qui n'est censee etre qu'une lecture. `upsert` sur cette meme
  // contrainte se traduit, sur Postgres, par un `INSERT ... ON CONFLICT
  // (lot_id) DO UPDATE` — une seule instruction atomique : la requete
  // perdante attend le verrou puis relit le compte deja cree au lieu
  // d'echouer. Le correctif cote web (SyndicOwnerAccount.tsx, qui n'appelle
  // plus les transactions qu'apres avoir obtenu le compte) reste une
  // defense en profondeur ; celui-ci est ce qui rend l'API elle-meme sure
  // en concurrence, y compris pour un futur appelant qui repeterait la
  // meme erreur.
  return tx.ownerAccount.upsert({
    where: { lotId },
    create: {
      syndicateId,
      lotId,
      contactId,
      balance: 0
    },
    update: {}
  });
}
