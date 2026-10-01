import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-middleware';
import { requireTenantId, uuidParam } from '../lib/patrimoine/insurance/request-params';
import {
  attachClaimDocumentSchema,
  createClaimSchema,
  createPolicySchema,
  listClaimsQuerySchema,
  listPoliciesQuerySchema,
  transitionClaimSchema,
  updateClaimSchema,
  updatePolicySchema
} from '../lib/patrimoine/insurance/schemas';
import {
  createPolicy,
  deletePolicy,
  getPolicy,
  listPolicies,
  updatePolicy
} from '../lib/patrimoine/insurance/policy-service';
import {
  attachClaimDocument,
  createClaim,
  deleteClaim,
  detachClaimDocument,
  getClaim,
  listClaims,
  transitionClaim,
  updateClaim
} from '../lib/patrimoine/insurance/claim-service';

/**
 * Contrôleurs des polices, sinistres et pièces (lot B1, spec 032). Modèle :
 * `controllers/patrimoine-entities-controller.ts` : `.parse()` en tête,
 * `asyncHandler`, erreurs typées levées par les services.
 */

const policyIdOf = (req: Request) => uuidParam(req, 'policyId', "Police d'assurance introuvable.");
const claimIdOf = (req: Request) => uuidParam(req, 'claimId', 'Sinistre introuvable.');

// Polices ------------------------------------------------------------------

export const listPoliciesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listPoliciesQuerySchema.parse(req.query ?? {});
  res.json({ success: true, data: await listPolicies(requireTenantId(req), query) });
});

export const createPolicyHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createPolicySchema.parse(req.body ?? {});
  const data = await createPolicy(requireTenantId(req), body, req.user?.userId);
  res.status(201).json({ success: true, data });
});

export const getPolicyHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getPolicy(requireTenantId(req), policyIdOf(req)) });
});

export const updatePolicyHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = updatePolicySchema.parse(req.body ?? {});
  res.json({ success: true, data: await updatePolicy(requireTenantId(req), policyIdOf(req), body) });
});

export const deletePolicyHandler = asyncHandler(async (req: Request, res: Response) => {
  await deletePolicy(requireTenantId(req), policyIdOf(req));
  res.status(204).send();
});

// Sinistres ----------------------------------------------------------------

export const listClaimsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listClaimsQuerySchema.parse(req.query ?? {});
  res.json({ success: true, data: await listClaims(requireTenantId(req), query) });
});

export const createClaimHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createClaimSchema.parse(req.body ?? {});
  const data = await createClaim(requireTenantId(req), body, req.user?.userId);
  res.status(201).json({ success: true, data });
});

export const getClaimHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getClaim(requireTenantId(req), claimIdOf(req)) });
});

export const updateClaimHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = updateClaimSchema.parse(req.body ?? {});
  res.json({ success: true, data: await updateClaim(requireTenantId(req), claimIdOf(req), body) });
});

export const deleteClaimHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteClaim(requireTenantId(req), claimIdOf(req));
  res.status(204).send();
});

export const transitionClaimHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = transitionClaimSchema.parse(req.body ?? {});
  const data = await transitionClaim(requireTenantId(req), claimIdOf(req), body, req.user?.userId);
  res.json({ success: true, data });
});

// Pièces -------------------------------------------------------------------

export const attachClaimDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = attachClaimDocumentSchema.parse(req.body ?? {});
  const data = await attachClaimDocument(requireTenantId(req), claimIdOf(req), body);
  res.status(201).json({ success: true, data });
});

export const detachClaimDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  await detachClaimDocument(requireTenantId(req), claimIdOf(req), uuidParam(req, 'linkId', 'Pièce introuvable.'));
  res.status(204).send();
});
