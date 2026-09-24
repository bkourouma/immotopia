import crypto from 'crypto';
import { prisma } from '../utils/database';
import { NewsletterListType } from '@prisma/client';

/**
 * NewsletterListService - CRUD et gestion des listes de diffusion
 * @see specs/012-newsletter-mailing/data-model.md
 */

export interface CreateListInput {
  name: string;
  type: NewsletterListType;
  doubleOptIn?: boolean;
}

export async function createList(tenantId: string, data: CreateListInput) {
  const existing = await prisma.newsletterList.findUnique({
    where: { tenantId_name: { tenantId, name: data.name } }
  });
  if (existing) {
    throw new Error('Une liste avec ce nom existe déjà pour ce tenant.');
  }

  const publicSubscribeToken = data.type === 'MANUAL' ? `lst_${crypto.randomBytes(16).toString('hex')}` : null;

  return prisma.newsletterList.create({
    data: {
      tenantId,
      name: data.name,
      type: data.type,
      doubleOptIn: data.doubleOptIn ?? true,
      publicSubscribeToken
    }
  });
}

async function getDerivedListCounts(tenantId: string, type: NewsletterListType) {
  if (type === 'FROM_OWNERS') {
    const count = await prisma.tenantClient.count({
      where: { tenantId, clientType: 'OWNER', newsletterConsent: true }
    });
    return { totalCount: count, activeCount: count, unsubscribedCount: 0 };
  }
  if (type === 'FROM_RENTERS') {
    const count = await prisma.tenantClient.count({
      where: { tenantId, clientType: 'RENTER', newsletterConsent: true }
    });
    return { totalCount: count, activeCount: count, unsubscribedCount: 0 };
  }
  if (type === 'FROM_CRM_CONTACTS') {
    const count = await prisma.crmContact.count({
      where: { tenantId, consentEmail: true }
    });
    return { totalCount: count, activeCount: count, unsubscribedCount: 0 };
  }
  return null;
}

export async function getList(tenantId: string, listId: string) {
  const list = await prisma.newsletterList.findFirst({
    where: { id: listId, tenantId }
  });
  if (!list) return null;

  const derived = await getDerivedListCounts(tenantId, list.type);
  if (derived) {
    return { ...list, ...derived };
  }

  const [totalCount, activeCount, unsubscribedCount] = await Promise.all([
    prisma.newsletterSubscriber.count({ where: { listId } }),
    prisma.newsletterSubscriber.count({ where: { listId, status: 'ACTIVE' } }),
    prisma.newsletterSubscriber.count({ where: { listId, status: 'UNSUBSCRIBED' } })
  ]);

  return { ...list, totalCount, activeCount, unsubscribedCount };
}

export async function getListsWithCounts(tenantId: string) {
  const lists = await prisma.newsletterList.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' }
  });

  return Promise.all(
    lists.map(async list => {
      const derived = await getDerivedListCounts(tenantId, list.type);
      if (derived) {
        return { ...list, ...derived };
      }
      const [totalCount, activeCount, unsubscribedCount] = await Promise.all([
        prisma.newsletterSubscriber.count({ where: { listId: list.id } }),
        prisma.newsletterSubscriber.count({ where: { listId: list.id, status: 'ACTIVE' } }),
        prisma.newsletterSubscriber.count({ where: { listId: list.id, status: 'UNSUBSCRIBED' } })
      ]);
      return { ...list, totalCount, activeCount, unsubscribedCount };
    })
  );
}

export async function updateList(tenantId: string, listId: string, data: { name?: string; doubleOptIn?: boolean }) {
  const list = await prisma.newsletterList.findFirst({ where: { id: listId, tenantId } });
  if (!list) throw new Error('Liste non trouvée.');

  if (data.name && data.name !== list.name) {
    const existing = await prisma.newsletterList.findUnique({
      where: { tenantId_name: { tenantId, name: data.name } }
    });
    if (existing) throw new Error('Une liste avec ce nom existe déjà.');
  }

  return prisma.newsletterList.update({
    where: { id: listId, tenantId },
    data: {
      ...(data.name != null && { name: data.name }),
      ...(data.doubleOptIn != null && { doubleOptIn: data.doubleOptIn })
    }
  });
}

export async function deleteList(tenantId: string, listId: string) {
  const list = await prisma.newsletterList.findFirst({ where: { id: listId, tenantId } });
  if (!list) throw new Error('Liste non trouvée.');

  await prisma.newsletterList.delete({ where: { id: listId, tenantId } });
  return { success: true };
}
