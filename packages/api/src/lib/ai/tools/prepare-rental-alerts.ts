import type { CopilotToolDefinition } from '../contracts';
import { alertProperty, rentalAlertPermissions, rentalAlertRule, type RentalAlertRule } from '../rental-alerts';
import { assertToolPermission, outcome } from './tool-utils';

const [lease, declaration, arrears] = rentalAlertRule.options;
const inputs = {
  lease_expiry: lease.omit({ kind: true }),
  declaration_pending: declaration.omit({ kind: true }),
  overdue_rent: arrears.omit({ kind: true })
};

function prepare(
  kind: RentalAlertRule['kind'],
  name: CopilotToolDefinition['name'],
  description: string
): CopilotToolDefinition {
  const amount = kind === 'overdue_rent';
  const permission = rentalAlertPermissions[kind];
  return {
    name,
    description:
      description +
      ' Pour cibler un bien, utiliser son identifiant dans ImmoTopia. Le membre valide la règle dans le formulaire.',
    requiredPermission: permission,
    feature: 'RENTAL',
    kind: 'proposal',
    inputSchema: inputs[kind],
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      required: amount ? ['days', 'minimumAmount', 'currency'] : ['days'],
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 3660 },
        propertyId: { type: 'string' },
        ...(amount
          ? {
              minimumAmount: { type: 'number', exclusiveMinimum: 0 },
              currency: { type: 'string', pattern: '^[A-Z]{3}$' }
            }
          : {})
      }
    },
    async execute(input, ctx) {
      assertToolPermission(ctx, permission);
      const rule = rentalAlertRule.parse({ ...input, kind });
      const property = rule.propertyId ? await alertProperty(ctx.tenantId, rule.propertyId) : undefined;
      const propertyLabel = property
        ? [property.internalReference, property.title].filter(Boolean).join(' — ')
        : undefined;
      return outcome(
        { prepared: true, ...rule, propertyLabel },
        {
          type: 'prepared_alert',
          alert: { kind: 'rental', rule, propertyLabel }
        }
      );
    }
  };
}

export const rentalAlertTools = [
  prepare(
    'lease_expiry',
    'prepare_lease_expiry_alert',
    'Prépare une surveillance des baux actifs se terminant dans les prochains jours (days).'
  ),
  prepare(
    'declaration_pending',
    'prepare_declaration_alert',
    'Prépare une surveillance des déclarations de paiement locatif en attente depuis au moins days jours ouvrés.'
  ),
  prepare(
    'overdue_rent',
    'prepare_rent_arrears_alert',
    'Prépare une surveillance du solde impayé cumulé dans une devise. Le seuil ne compte que les échéances en retard depuis au moins days jours.'
  )
];
