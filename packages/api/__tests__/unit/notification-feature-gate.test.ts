/**
 * BUG-2026-09-30-060 : les événements de notification (e-mail, WhatsApp) des
 * fonctionnalités non souscrites ne sont ni listés ni modifiables en `enforce`.
 */
const getEntitlements = jest.fn();
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: (...args: any[]) => getEntitlements(...args)
}));

const counts = {
  syndicate: 0,
  crmDeal: 0,
  rentalLease: 0,
  propertyLoan: 0,
  workProgram: 0,
  propertyExpense: 0,
  constructionSite: 0
};
jest.mock('../../src/utils/database', () => ({
  prisma: Object.fromEntries(
    ['syndicate', 'crmDeal', 'rentalLease', 'propertyLoan', 'workProgram', 'propertyExpense', 'constructionSite'].map(
      m => [m, { count: async () => (counts as any)[m] }]
    )
  )
}));

import { EMAIL_NOTIFICATION_KEYS } from '../../src/constants/email-notification-keys';
import { WHATSAPP_NOTIFICATION_KEYS } from '../../src/constants/whatsapp-notification-keys';
import { featureOfNotificationKey } from '../../src/constants/notification-key-features';
import {
  filterNotificationItems,
  requireNotificationKeyFeature
} from '../../src/lib/subscription/notification-feature-gate';

const proPatrimoine = {
  tenantId: 't1',
  enforcement: 'enforce',
  readOnly: false,
  moduleAccess: { MODULE_PATRIMOINE: 'FULL', MODULE_AGENCY: 'NONE', MODULE_SYNDIC: 'NONE', MODULE_PROMOTER: 'NONE' }
};
const items = (keys: readonly string[]) => keys.map(key => ({ key }));

beforeEach(() => {
  getEntitlements.mockReset();
  for (const k of Object.keys(counts)) (counts as any)[k] = 0;
});

describe('filterNotificationItems', () => {
  it('pack Patrimoine : ni Syndic ni CRM, mais locatif, patrimoine et socle', async () => {
    getEntitlements.mockResolvedValue(proPatrimoine);
    const email = (await filterNotificationItems('t1', items(EMAIL_NOTIFICATION_KEYS))).map(i => i.key);
    for (const k of ['DEAL_CREATED', 'CHARGE_CALL_ISSUED', 'GENERAL_MEETING_CONVOCATION', 'COMMON_AREA_INCIDENT']) {
      expect(email).not.toContain(k);
    }
    for (const k of [
      'LEASE_ACTIVATED',
      'INSTALLMENT_OVERDUE',
      'LOAN_MATURITY_ALERT',
      'INSURANCE_DEADLINE_ALERT',
      'MAINTENANCE_TICKET_CREATED_AGENCY',
      'INVITATION'
    ]) {
      expect(email).toContain(k);
    }
    const wa = (await filterNotificationItems('t1', items(WHATSAPP_NOTIFICATION_KEYS))).map(i => i.key);
    for (const k of [
      'DEAL_STAGE_CHANGED',
      'CRM_CONTACT_GROUP_INVITE',
      'PROPERTY_PUBLISHED_GROUP_BROADCAST',
      'CHARGE_CALL_REMINDER'
    ]) {
      expect(wa).not.toContain(k);
    }
    expect(wa).toContain('LEASE_ACTIVATED');
  });

  it('pack Syndic : plus d’événements locatifs, les charges restent', async () => {
    getEntitlements.mockResolvedValue({
      ...proPatrimoine,
      moduleAccess: { MODULE_SYNDIC: 'FULL', MODULE_AGENCY: 'NONE', MODULE_PATRIMOINE: 'NONE', MODULE_PROMOTER: 'NONE' }
    });
    const email = (await filterNotificationItems('t1', items(EMAIL_NOTIFICATION_KEYS))).map(i => i.key);
    expect(email).toContain('CHARGE_CALL_ISSUED');
    expect(email).not.toContain('LEASE_ACTIVATED');
  });

  it('hors enforce, ou si les droits sont indisponibles, rien n’est filtré', async () => {
    getEntitlements.mockResolvedValue({ ...proPatrimoine, enforcement: 'warn' });
    expect(await filterNotificationItems('t1', items(EMAIL_NOTIFICATION_KEYS))).toHaveLength(
      EMAIL_NOTIFICATION_KEYS.length
    );
    getEntitlements.mockRejectedValue(new Error('down'));
    expect(await filterNotificationItems('t1', items(EMAIL_NOTIFICATION_KEYS))).toHaveLength(
      EMAIL_NOTIFICATION_KEYS.length
    );
  });
});

describe('requireNotificationKeyFeature', () => {
  const run = async (key: string) => {
    const next = jest.fn();
    await requireNotificationKeyFeature({ params: { tenantId: 't1', key } } as any, {} as any, next);
    return next.mock.calls[0][0];
  };

  it('refuse en 403 MODULE_NOT_INCLUDED un événement Syndic pour un pack sans Syndic', async () => {
    getEntitlements.mockResolvedValue(proPatrimoine);
    const error = await run('CHARGE_CALL_ISSUED');
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('MODULE_NOT_INCLUDED');
  });

  it('laisse passer un événement possédé ou du socle', async () => {
    getEntitlements.mockResolvedValue(proPatrimoine);
    expect(await run('LEASE_ACTIVATED')).toBeUndefined();
    expect(await run('INVITATION')).toBeUndefined();
  });

  it('chaque clé a une fonctionnalité définie', () => {
    expect(featureOfNotificationKey('DEAL_CREATED')).toBe('CRM');
    expect(featureOfNotificationKey('CUSTOM')).toBe('CORE');
  });
});

describe('module Syndic retiré (READ_ONLY, D11) : visible, non modifiable', () => {
  const syndicReadOnly = {
    ...proPatrimoine,
    moduleAccess: { ...proPatrimoine.moduleAccess, MODULE_SYNDIC: 'READ_ONLY' }
  };

  it('les événements Syndic restent listés en lecture seule, disparaissent à NONE', async () => {
    counts.syndicate = 1; // module retiré mais encore des données : consultable
    getEntitlements.mockResolvedValue(syndicReadOnly);
    expect((await filterNotificationItems('t1', items(EMAIL_NOTIFICATION_KEYS))).map(i => i.key)).toContain(
      'CHARGE_CALL_ISSUED'
    );
    getEntitlements.mockResolvedValue(proPatrimoine);
    expect((await filterNotificationItems('t1', items(EMAIL_NOTIFICATION_KEYS))).map(i => i.key)).not.toContain(
      'CHARGE_CALL_ISSUED'
    );
  });

  it('la modification est refusée en 403 MODULE_READ_ONLY', async () => {
    getEntitlements.mockResolvedValue(syndicReadOnly);
    const next = jest.fn();
    await requireNotificationKeyFeature(
      { params: { tenantId: 't1', key: 'CHARGE_CALL_ISSUED' } } as any,
      {} as any,
      next
    );
    expect(next.mock.calls[0][0].statusCode).toBe(403);
    expect(next.mock.calls[0][0].code).toBe('MODULE_READ_ONLY');
  });
});

describe('classement complet du catalogue', () => {
  const pack = (access: Record<string, string>) => ({
    ...proPatrimoine,
    moduleAccess: {
      MODULE_AGENCY: 'NONE',
      MODULE_SYNDIC: 'NONE',
      MODULE_PROMOTER: 'NONE',
      MODULE_PATRIMOINE: 'NONE',
      ...access
    }
  });
  const visible = async (keys: readonly string[]) => (await filterNotificationItems('t1', items(keys))).map(i => i.key);

  it('Patrimoine seul (CRM NONE) : aucune clé CRM ni Syndic, e-mail comme WhatsApp', async () => {
    getEntitlements.mockResolvedValue(pack({ MODULE_PATRIMOINE: 'FULL' }));
    const crmSyndic = [
      'DEAL_CREATED',
      'DEAL_STAGE_CHANGED',
      'APPOINTMENT_REMINDER',
      'CRM_CONTACT_GROUP_INVITE',
      'PROPERTY_PUBLISHED_GROUP_BROADCAST',
      'CHARGE_CALL_ISSUED',
      'CHARGE_CALL_REMINDER',
      'CHARGE_PAYMENT_RECEIPT',
      'CHARGE_CALL_SETTLED',
      'GENERAL_MEETING_CONVOCATION',
      'GENERAL_MEETING_MINUTES',
      'CONTRACT_RENEWAL_ALERT',
      'COMMON_AREA_INCIDENT'
    ];
    const e = await visible(EMAIL_NOTIFICATION_KEYS);
    const w = await visible(WHATSAPP_NOTIFICATION_KEYS);
    for (const k of crmSyndic) {
      expect(e).not.toContain(k);
      expect(w).not.toContain(k);
    }
    expect(e).toContain('DOCUMENT_EXPIRY_ALERT');
  });

  it('Syndic seul (PATRIMOINE NONE) : aucune clé Patrimoine, locatif ni CRM', async () => {
    getEntitlements.mockResolvedValue(pack({ MODULE_SYNDIC: 'FULL' }));
    const e = await visible(EMAIL_NOTIFICATION_KEYS);
    for (const k of [
      'LOAN_MATURITY_ALERT',
      'INSURANCE_DEADLINE_ALERT',
      'WORK_PROGRAM_REMINDER',
      'DOCUMENT_EXPIRY_ALERT',
      'LEASE_ENDING_SOON',
      'DEAL_CREATED',
      'OWNER_STATEMENT_SENT'
    ]) {
      expect(e).not.toContain(k);
    }
    expect(e).toContain('CHARGE_CALL_ISSUED');
  });

  it('seules ces clés restent du socle (CORE) : toute autre est classée par fonctionnalité', () => {
    const core = [...new Set([...EMAIL_NOTIFICATION_KEYS, ...WHATSAPP_NOTIFICATION_KEYS])]
      .filter(k => featureOfNotificationKey(k) === 'CORE')
      .sort();
    expect(core).toEqual(
      [
        'CUSTOM',
        'DOCUMENT_EXPIRING',
        'INVITATION',
        'MAINTENANCE_TICKET_CREATED_AGENCY',
        'MAINTENANCE_TICKET_CREATED_OWNER',
        'MAINTENANCE_TICKET_CREATED_TENANT',
        'MAINTENANCE_TICKET_STATUS_CHANGED_OWNER',
        'MAINTENANCE_TICKET_STATUS_CHANGED_TENANT',
        'PASSWORD_RESET',
        'PAYMENT_CONFIRMED',
        'PAYMENT_RECEIVED',
        'PORTAL_ACCOUNT_CREATED',
        'PROPERTY_PUBLISHED'
      ].sort()
    );
  });

  it('module retiré (READ_ONLY) sans aucune donnée : traité comme NONE ; avec données : visible', async () => {
    getEntitlements.mockResolvedValue(pack({ MODULE_PATRIMOINE: 'FULL', MODULE_SYNDIC: 'READ_ONLY' }));
    expect(await visible(EMAIL_NOTIFICATION_KEYS)).not.toContain('CHARGE_CALL_ISSUED');
    counts.syndicate = 2;
    expect(await visible(EMAIL_NOTIFICATION_KEYS)).toContain('CHARGE_CALL_ISSUED');
  });
});
