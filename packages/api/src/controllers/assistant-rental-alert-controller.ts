import type { Request } from 'express';
import { z } from 'zod';
import { conversationParams } from '../lib/ai/conversations';
import {
  alertProperties,
  alertProperty,
  assertRentalAlertPermission,
  listRentalAlerts,
  removeRentalAlert,
  rentalAlertPermissions,
  rentalAlertRule,
  saveRentalAlert
} from '../lib/ai/rental-alerts';
import { asyncHandler, ForbiddenError } from '../middleware/error-middleware';
import { getUserPermissions } from '../services/permission-service';

function owner(req: Request) {
  const tenantId = req.tenantContext?.tenantId;
  const ownerId = req.user?.userId;
  if (!tenantId || !ownerId) throw new ForbiddenError();
  return { tenantId, ownerId };
}

async function permissionsFor({ tenantId, ownerId }: ReturnType<typeof owner>) {
  return new Set(await getUserPermissions(ownerId, tenantId, { fresh: true }));
}

export const listRentalAlertsHandler = asyncHandler(async (req, res) => {
  const identity = owner(req);
  const { cursor } = z.object({ cursor: z.string().uuid().optional() }).strict().parse(req.query);
  const data = await listRentalAlerts(identity, await permissionsFor(identity), cursor);
  res.set('Cache-Control', 'private, no-store').json({ success: true, data });
});

export const getRentalAlertPropertiesHandler = asyncHandler(async (req, res) => {
  const identity = owner(req);
  const permissions = await permissionsFor(identity);
  if (!Object.values(rentalAlertPermissions).some(permission => permissions.has(permission)))
    throw new ForbiddenError();
  const { q, id } = z
    .object({
      q: z.string().trim().max(160).default(''),
      id: z.string().uuid().optional()
    })
    .strict()
    .parse(req.query);
  const data = id ? [await alertProperty(identity.tenantId, id)] : await alertProperties(identity.tenantId, q);
  res.set('Cache-Control', 'private, no-store').json({ success: true, data });
});

export const saveRentalAlertHandler = asyncHandler(async (req, res) => {
  const identity = owner(req);
  const { id } = conversationParams.parse(req.params);
  const rule = rentalAlertRule.parse(req.body);
  assertRentalAlertPermission(await permissionsFor(identity), rule.kind);
  await saveRentalAlert(identity, id, rule);
  res.sendStatus(204);
});

export const removeRentalAlertHandler = asyncHandler(async (req, res) => {
  const { id } = conversationParams.parse(req.params);
  await removeRentalAlert(owner(req), id);
  res.sendStatus(204);
});
