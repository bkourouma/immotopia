import { prisma } from '../utils/database';

/**
 * NewsletterTemplateService - CRUD des templates newsletter
 * @see specs/012-newsletter-mailing/data-model.md
 */

export interface CreateTemplateInput {
  name: string;
  html: string;
}

export async function createTemplate(tenantId: string, data: CreateTemplateInput) {
  const existing = await prisma.newsletterTemplate.findUnique({
    where: { tenantId_name: { tenantId, name: data.name } }
  });
  if (existing) throw new Error('Un template avec ce nom existe déjà.');

  return prisma.newsletterTemplate.create({
    data: { tenantId, name: data.name, html: data.html }
  });
}

export async function getTemplate(tenantId: string, templateId: string) {
  return prisma.newsletterTemplate.findFirst({
    where: { id: templateId, tenantId }
  });
}

export async function listTemplates(tenantId: string) {
  return prisma.newsletterTemplate.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' }
  });
}

export async function updateTemplate(tenantId: string, templateId: string, data: { name?: string; html?: string }) {
  const tpl = await prisma.newsletterTemplate.findFirst({ where: { id: templateId, tenantId } });
  if (!tpl) throw new Error('Template non trouvé.');

  if (data.name && data.name !== tpl.name) {
    const existing = await prisma.newsletterTemplate.findUnique({
      where: { tenantId_name: { tenantId, name: data.name } }
    });
    if (existing) throw new Error('Un template avec ce nom existe déjà.');
  }

  return prisma.newsletterTemplate.update({
    where: { id: templateId, tenantId },
    data: {
      ...(data.name != null && { name: data.name }),
      ...(data.html != null && { html: data.html })
    }
  });
}

export async function deleteTemplate(tenantId: string, templateId: string) {
  const tpl = await prisma.newsletterTemplate.findFirst({ where: { id: templateId, tenantId } });
  if (!tpl) throw new Error('Template non trouvé.');

  const scheduledUse = await prisma.newsletterCampaign.findFirst({
    where: { templateId, status: 'SCHEDULED', tenantId }
  });
  if (scheduledUse) throw new Error('Ce template est utilisé par une campagne planifiée.');

  await prisma.newsletterTemplate.delete({ where: { id: templateId, tenantId } });
  return { success: true };
}
