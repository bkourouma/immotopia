import { prisma } from '../utils/database';
import { logger } from '../utils/logger';

/**
 * Create a tag
 * @param tenantId - Tenant ID (required for isolation)
 * @param name - Tag name
 * @param color - Optional tag color
 * @returns Created tag
 */
export async function createTag(tenantId: string, name: string, color?: string) {
  // Check if tag already exists for this tenant
  const existingTag = await prisma.crmTag.findUnique({
    where: {
      tenantId_name: {
        tenantId,
        name
      }
    }
  });

  if (existingTag) {
    throw new Error(`Tag "${name}" already exists in this tenant`);
  }

  const tag = await prisma.crmTag.create({
    data: {
      tenantId,
      name,
      color: color || null
    }
  });

  logger.info('CRM tag created', {
    tagId: tag.id,
    tenantId,
    name
  });

  return tag;
}

/**
 * Assign tag to contact
 * @param tenantId - Tenant ID
 * @param contactId - Contact ID
 * @param tagId - Tag ID
 */
export async function assignTagToContact(tenantId: string, contactId: string, tagId: string) {
  // Verify contact belongs to tenant
  const contact = await prisma.crmContact.findFirst({
    where: {
      id: contactId,
      tenantId
    }
  });

  if (!contact) {
    throw new Error('Contact not found');
  }

  // Verify tag belongs to tenant
  const tag = await prisma.crmTag.findFirst({
    where: {
      id: tagId,
      tenantId
    }
  });

  if (!tag) {
    throw new Error('Tag not found');
  }

  // Check if already assigned
  const existing = await prisma.crmContactTag.findUnique({
    where: {
      contactId_tagId: {
        contactId,
        tagId
      }
    }
  });

  if (existing) {
    return; // Already assigned, no-op
  }

  await prisma.crmContactTag.create({
    data: {
      contactId,
      tagId
    }
  });

  logger.info('Tag assigned to contact', {
    contactId,
    tagId,
    tenantId
  });
}

/**
 * Remove tag from contact
 * @param tenantId - Tenant ID
 * @param contactId - Contact ID
 * @param tagId - Tag ID
 */
export async function removeTagFromContact(tenantId: string, contactId: string, tagId: string) {
  // Verify contact belongs to tenant
  const contact = await prisma.crmContact.findFirst({
    where: {
      id: contactId,
      tenantId
    }
  });

  if (!contact) {
    throw new Error('Contact not found');
  }

  await prisma.crmContactTag.deleteMany({
    where: {
      contactId,
      tagId
    }
  });

  logger.info('Tag removed from contact', {
    contactId,
    tagId,
    tenantId
  });
}

/**
 * Get tags for a contact
 * @param tenantId - Tenant ID
 * @param contactId - Contact ID
 * @returns Array of tags
 */
export async function getContactTags(tenantId: string, contactId: string) {
  // Verify contact belongs to tenant
  const contact = await prisma.crmContact.findFirst({
    where: {
      id: contactId,
      tenantId
    }
  });

  if (!contact) {
    throw new Error('Contact not found');
  }

  const contactTags = await prisma.crmContactTag.findMany({
    where: {
      contactId
    },
    include: {
      tag: true
    }
  });

  return contactTags.map(ct => ct.tag);
}

/**
 * List all tags for a tenant
 * @param tenantId - Tenant ID
 * @returns Array of tags
 */
export async function listTags(tenantId: string) {
  return prisma.crmTag.findMany({
    where: {
      tenantId
    },
    orderBy: {
      name: 'asc'
    }
  });
}




