/**
 * Inventaire de chantier par WhatsApp, de bout en bout sur base RÉELLE
 * (lot 041, plan §7.1 ; spec W3, W4, W5, W11).
 *
 * Contrairement aux tests unitaires du lot, qui simulent le pont
 * `lot040-bridge`, ce fichier joue le VRAI code du lot 040
 * (`createStockCountTx`, `setStockCountLineTx`, `closeStockCountTx`,
 * `validateStockCountTx`) contre PostgreSQL :
 *
 * 1. inscription créée par le service, activée par le code envoyé au bot ;
 * 2. photo (transport `log`, média déposé par le simulateur, vision `fake`) →
 *    proposition → « 1 » → ligne écrite dans un inventaire ouvert par le bot ;
 * 3. seconde photo du même article → « 1 » → M30 → « 1 » (additionner) ;
 * 4. `FIN` → inventaire `COUNTED`, ligne non comptée créée pour l'article non
 *    photographié, alerte `FIELD_COUNT_CLOSED` ;
 * 5. le chef ne peut pas valider ; une autre personne écarte la ligne non
 *    comptée et valide.
 *
 * Plus deux preuves de concurrence que seule une base apporte :
 * - 10 mauvais codes simultanés → exactement 5 essais comptés (W3-R7) ;
 * - une seconde inscription vivante du même numéro → 409, par l'index unique
 *   partiel (`meta.target` du P2002), et la course de deux inscriptions du même
 *   membre → une seule passe (W3-R4).
 *
 * Base : DÉDIÉE (`DATABASE_URL_TEST`), via `npm run test:isolation`. Absente
 * ou différente de `DATABASE_URL` → la suite est ignorée (`describe.skip`).
 */
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';

import { env } from '../../src/config/env';
import { runWithLanguage } from '../../src/i18n';
import { AppError, ErrorCode } from '../../src/middleware/error-middleware';
import { setAsideStockCountLineTx, validateStockCountTx } from '../../src/lib/finance/stock-inventaire';
import { botMessages } from '../../src/lib/stock-whatsapp/bot-messages';
import { deleteCapturePhoto } from '../../src/lib/stock-whatsapp/capture-files';
import { handleInboundMessage, resetEngineMemoryForTests } from '../../src/lib/stock-whatsapp/engine';
import { createRegistration } from '../../src/lib/stock-whatsapp/registrations/service';
import { depositSimulatorMedia } from '../../src/lib/stock-whatsapp/transport/log-transport';
import { resetWhatsappTransportForTests } from '../../src/lib/stock-whatsapp/transport';
import type { InboundMessage } from '../../src/lib/stock-whatsapp/types';
import { resetStockVisionProviderForTests } from '../../src/lib/stock-whatsapp/vision';
import { prisma } from '../../src/utils/database';
import { cleanupTenants, createTenantAdminUser, createTestTenant, TestTenant, TestUser } from '../helpers/fixtures';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.log(
    'DATABASE_URL_TEST absente (ou exécution hors `npm run test:isolation`) : ' +
      'stock-whatsapp-inventaire.test.ts est ignorée. Voir env.example et __tests__/helpers/run-isolation-tests.js.'
  );
}

/** Numéros fictifs de la plage de recette (jamais un vrai numéro). */
const PHONE_CHEF = '+2250100000201';
const PHONE_LOCKOUT = '+2250100000202';
const PHONE_OTHER = '+2250100000203';
const PHONE_RACE_A = '+2250100000204';
const PHONE_RACE_B = '+2250100000205';

const SITE_MANAGER_ROLE_KEY = 'TENANT_SITE_MANAGER';

function jpegSegment(marker: number, payload: Buffer): Buffer {
  const length = payload.length + 2;
  return Buffer.concat([Buffer.from([0xff, marker, length >> 8, length & 0xff]), payload]);
}

/** Un JPEG minimal, bien formé, différent à chaque appel (octets du balayage). */
function tinyJpeg(seed: number): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xe0, Buffer.from([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])),
    jpegSegment(0xfe, Buffer.from('commentaire retiré au stockage', 'utf8')),
    jpegSegment(0xdb, Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 1)])),
    jpegSegment(0xc0, Buffer.from([8, 0, 16, 0, 16, 1, 1, 0x11, 0])),
    jpegSegment(0xc4, Buffer.concat([Buffer.from([0x00, 1]), Buffer.alloc(15, 0), Buffer.from([0])])),
    jpegSegment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.from([0x12, seed & 0x7f, 0x34, 0x56]),
    Buffer.from([0xff, 0xd9])
  ]);
}

function fr<T>(fn: () => T): T {
  return runWithLanguage('fr', fn);
}

maybeDescribe('Inventaire WhatsApp — de bout en bout sur base réelle (lot 041)', () => {
  jest.setTimeout(120_000);

  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const roleIds: string[] = [];
  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let office: TestUser;
  let siteManagerRoleId: string;
  let siteId: string;
  let locationId: string;
  let cementId: string;
  let ironId: string;
  const cementReference = `CIM-${randomUUID().slice(0, 6)}`;
  const ironReference = `FER-${randomUUID().slice(0, 6)}`;
  const savedEnv: Record<string, unknown> = {};

  function setEnv(key: string, value: unknown): void {
    if (!(key in savedEnv)) savedEnv[key] = (env as Record<string, unknown>)[key];
    (env as Record<string, unknown>)[key] = value;
  }

  async function newMember(target: TestTenant, prefix: string, roleId: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${prefix}-${randomUUID().slice(0, 8)}@isolation-test.local`,
        fullName: `${prefix} (test WhatsApp)`,
        isActive: true,
        emailVerified: true
      }
    });
    userIds.push(user.id);
    await prisma.membership.create({
      data: { userId: user.id, tenantId: target.id, status: 'ACTIVE', acceptedAt: new Date() }
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId, tenantId: target.id } });
    return user.id;
  }

  async function newSite(target: TestTenant, name: string): Promise<{ siteId: string; locationId: string }> {
    const site = await prisma.constructionSite.create({
      data: { tenantId: target.id, name: `${name} ${randomUUID().slice(0, 6)}`, stockEnabledAt: new Date() }
    });
    const location = await prisma.stockLocation.create({
      data: { tenantId: target.id, kind: 'SITE', label: `Lieu ${site.name}`, siteId: site.id }
    });
    return { siteId: site.id, locationId: location.id };
  }

  function inbound(fromE164: string, body: { kind: 'TEXT'; text: string } | { kind: 'IMAGE'; caption: string }) {
    const now = new Date();
    const base = {
      metaMessageId: `sim-${randomUUID()}`,
      fromE164,
      receivedAt: now,
      sentAt: now,
      via: 'SIMULATOR' as const
    };
    if (body.kind === 'TEXT') return { ...base, kind: 'TEXT', text: body.text } satisfies InboundMessage;
    const buffer = tinyJpeg(Math.floor(Math.random() * 120));
    const mediaId = depositSimulatorMedia(buffer, 'image/jpeg');
    return {
      ...base,
      kind: 'IMAGE',
      media: { mediaId, mimeType: 'image/jpeg', providerSha256: null, caption: body.caption }
    } satisfies InboundMessage;
  }

  /** Envoie un message au moteur et ATTEND son traitement complet. */
  async function send(fromE164: string, body: Parameters<typeof inbound>[1]): Promise<void> {
    await handleInboundMessage(inbound(fromE164, body));
  }

  async function lastOutbound(registrationId: string) {
    return prisma.stockWhatsappMessage.findFirst({
      where: { tenantId: tenant.id, registrationId, direction: 'OUTBOUND' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { text: true, kind: true, captureId: true }
    });
  }

  beforeAll(async () => {
    setEnv('WHATSAPP_INVENTORY_TRANSPORT', 'log');
    setEnv('STOCK_VISION_PROVIDER', 'fake');
    setEnv('SUBSCRIPTION_ENFORCEMENT', 'off');
    resetWhatsappTransportForTests();
    resetStockVisionProviderForTests();
    resetEngineMemoryForTests();

    tenant = await createTestTenant('Agence-WA-Bout');
    otherTenant = await createTestTenant('Agence-WA-Autre');
    tenantIds.push(tenant.id, otherTenant.id);
    office = await createTenantAdminUser(tenant, 'bureau-wa');
    userIds.push(office.id);

    const siteManager = await prisma.role.findUnique({ where: { key: SITE_MANAGER_ROLE_KEY }, select: { id: true } });
    if (!siteManager)
      throw new Error('Rôle TENANT_SITE_MANAGER absent : migration `inventaire_whatsapp_role` non appliquée.');
    siteManagerRoleId = siteManager.id;

    // Le bureau valide (STOCK_COUNT_VALIDATE), lu en base par le lot 040 (A1-R3).
    const permission = await prisma.permission.upsert({
      where: { key: 'STOCK_COUNT_VALIDATE' },
      update: {},
      create: { key: 'STOCK_COUNT_VALIDATE', description: 'Valider un inventaire' }
    });
    const validatorRole = await prisma.role.create({
      data: { key: `TEST_WA_VALIDATEUR_${randomUUID().slice(0, 8)}`, name: 'Validateur de test', scope: 'TENANT' }
    });
    roleIds.push(validatorRole.id);
    await prisma.rolePermission.create({ data: { roleId: validatorRole.id, permissionId: permission.id } });
    await prisma.userRole.create({ data: { userId: office.id, roleId: validatorRole.id, tenantId: tenant.id } });

    ({ siteId, locationId } = await newSite(tenant, 'Chantier Cocody'));
    const cement = await prisma.stockItem.create({
      data: { tenantId: tenant.id, reference: cementReference, label: 'Ciment CPJ 45', unit: 'sac' }
    });
    const iron = await prisma.stockItem.create({
      data: { tenantId: tenant.id, reference: ironReference, label: 'Fer à béton HA 10', unit: 'barre' }
    });
    cementId = cement.id;
    ironId = iron.id;
    // Attendus : 124 sacs (compté juste par le chef), 30 barres (jamais photographiées).
    await prisma.stockBalance.create({
      data: { tenantId: tenant.id, itemId: cementId, locationId, quantity: 124, value: 620_000, currency: 'XOF' }
    });
    await prisma.stockBalance.create({
      data: { tenantId: tenant.id, itemId: ironId, locationId, quantity: 30, value: 90_000, currency: 'XOF' }
    });
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(savedEnv)) (env as Record<string, unknown>)[key] = value;
    resetWhatsappTransportForTests();
    resetStockVisionProviderForTests();
    if (tenantIds.length === 0) return;

    const files = await prisma.stockFieldCapture
      .findMany({ where: { tenantId: { in: tenantIds }, fileUrl: { not: null } }, select: { fileUrl: true } })
      .catch(() => [] as Array<{ fileUrl: string | null }>);
    for (const file of files) {
      if (file.fileUrl) await deleteCapturePhoto(file.fileUrl).catch(() => undefined);
    }

    const where = { tenantId: { in: tenantIds } };
    const steps: Array<() => Promise<unknown>> = [
      () => prisma.stockWhatsappMessage.deleteMany({ where }),
      () => prisma.stockWhatsappSession.updateMany({ where, data: { pendingCaptureId: null } }),
      () => prisma.stockFieldCapture.deleteMany({ where }),
      () => prisma.stockWhatsappSession.deleteMany({ where }),
      () => prisma.stockWhatsappRegistrationSite.deleteMany({ where }),
      () => prisma.stockWhatsappRegistration.deleteMany({ where }),
      () => prisma.stockWhatsappUsage.deleteMany({ where }),
      () => prisma.stockAlert.deleteMany({ where }),
      () => prisma.stockMovement.deleteMany({ where }),
      () => prisma.journalEntryLine.deleteMany({ where: { entry: where } }),
      () => prisma.journalEntry.deleteMany({ where }),
      () => prisma.stockSlip.deleteMany({ where }),
      () => prisma.stockCountLine.deleteMany({ where: { count: where } }),
      () => prisma.stockCount.deleteMany({ where }),
      () => prisma.stockBalance.deleteMany({ where }),
      () => prisma.stockItem.deleteMany({ where }),
      () => prisma.stockLocation.deleteMany({ where }),
      () => prisma.constructionSite.deleteMany({ where }),
      () => prisma.userRole.deleteMany({ where: { roleId: { in: roleIds } } }),
      () => prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } }),
      () => prisma.role.deleteMany({ where: { id: { in: roleIds } } })
    ];
    for (const step of steps) await step().catch(() => undefined);
    await cleanupTenants(tenantIds);
    await prisma.$disconnect();
  });

  it('inscription activée par code → deux photos du même article → FIN → COUNTED → validation par le bureau', async () => {
    const chefId = await newMember(tenant, 'chef-wa', siteManagerRoleId);

    // 1. Inscription par le service de l'agence (W3), puis activation par le bot.
    const registration = await createRegistration(tenant.id, office.id, {
      userId: chefId,
      phone: PHONE_CHEF,
      siteIds: [siteId]
    });
    expect(registration.status).toBe('PENDING_ACTIVATION');
    expect(registration.activationCode).toMatch(/^\d{6}$/);
    const stored = await prisma.stockWhatsappRegistration.findUniqueOrThrow({ where: { id: registration.id } });
    // Jamais le code en clair : une empreinte HMAC de 64 caractères hexadécimaux.
    expect(stored.activationCodeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.activationCodeHash).not.toContain(registration.activationCode);

    const wrong = registration.activationCode === '000000' ? '111111' : '000000';
    await send(PHONE_CHEF, { kind: 'TEXT', text: wrong });
    expect((await lastOutbound(registration.id))?.text).toBe(fr(() => botMessages.wrongCode(4).text));

    await send(PHONE_CHEF, { kind: 'TEXT', text: `Code ${registration.activationCode}` });
    const active = await prisma.stockWhatsappRegistration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(active.status).toBe('ACTIVE');
    expect(active.activationCodeHash).toBeNull();
    // Les messages d'une inscription en attente ne sont jamais journalisés en texte.
    const pendingInbound = await prisma.stockWhatsappMessage.findMany({
      where: { tenantId: tenant.id, registrationId: registration.id, direction: 'INBOUND' },
      select: { text: true }
    });
    expect(pendingInbound).toHaveLength(2);
    expect(pendingInbound.every(message => message.text === null)).toBe(true);

    // 2. Première photo : un seul chantier, associé d'office ; proposition de 84 sacs.
    await send(PHONE_CHEF, { kind: 'IMAGE', caption: `fake:item=${cementReference};total=84;conf=0.9` });
    const proposal = await lastOutbound(registration.id);
    expect(proposal?.kind).toBe('BUTTONS');
    expect(proposal?.text).toContain('84');
    const firstCapture = await prisma.stockFieldCapture.findFirstOrThrow({
      where: { tenantId: tenant.id, registrationId: registration.id },
      orderBy: { receivedAt: 'asc' }
    });
    expect(firstCapture.itemId).toBe(cementId);
    expect(firstCapture.outcome).toBe('PENDING');
    expect(firstCapture.fileUrl).toMatch(new RegExp(`^/uploads/stock-whatsapp/${tenant.id}/\\d{4}/`));
    expect(firstCapture.sha256).toMatch(/^[0-9a-f]{64}$/);

    await send(PHONE_CHEF, { kind: 'TEXT', text: '1' });
    expect((await lastOutbound(registration.id))?.text).toBe(
      fr(() => botMessages.recorded({ quantity: 84, unit: 'sac', item: 'Ciment CPJ 45' }).text)
    );
    const count = await prisma.stockCount.findFirstOrThrow({ where: { tenantId: tenant.id, locationId } });
    expect(count.status).toBe('DRAFT');
    expect(count.source).toBe('WHATSAPP');
    expect(count.createdByUserId).toBe(chefId);

    // 3. Seconde photo du même article : M30, « 1 » additionne (84 + 40 = 124).
    await send(PHONE_CHEF, { kind: 'IMAGE', caption: `fake:item=${cementReference};total=40;conf=0.9` });
    await send(PHONE_CHEF, { kind: 'TEXT', text: '1' });
    const merge = await lastOutbound(registration.id);
    expect(merge?.kind).toBe('BUTTONS');
    expect(merge?.text).toContain('84');
    await send(PHONE_CHEF, { kind: 'TEXT', text: '1' });

    const line = await prisma.stockCountLine.findFirstOrThrow({ where: { countId: count.id, itemId: cementId } });
    expect(Number(line.countedQuantity)).toBe(124);
    expect(line.countedByUserId).toBe(chefId);
    const captures = await prisma.stockFieldCapture.findMany({
      where: { tenantId: tenant.id, registrationId: registration.id },
      orderBy: { receivedAt: 'asc' },
      select: { outcome: true, mergeMode: true, countLineId: true, lineQuantityAfter: true }
    });
    expect(captures.map(capture => capture.outcome)).toEqual(['ACCEPTED', 'ACCEPTED']);
    expect(captures[1].mergeMode).toBe('ADD');
    expect(captures.every(capture => capture.countLineId === line.id)).toBe(true);
    expect(Number(captures[1].lineQuantityAfter)).toBe(124);

    // Aveugle (spec §8.3) : aucun message du bot ne cite l'attendu du fer (30).
    const outbound = await prisma.stockWhatsappMessage.findMany({
      where: { tenantId: tenant.id, registrationId: registration.id, direction: 'OUTBOUND' },
      select: { text: true }
    });
    expect(outbound.some(message => /\b30\b/.test(message.text ?? ''))).toBe(false);

    // 4. FIN : clos par le bot, ligne « non comptée » pour le fer, alerte levée.
    await send(PHONE_CHEF, { kind: 'TEXT', text: 'FIN' });
    const site = await prisma.constructionSite.findUniqueOrThrow({ where: { id: siteId }, select: { name: true } });
    expect((await lastOutbound(registration.id))?.text).toBe(
      fr(() => botMessages.closedCounted({ site: site.name, count: 1 }).text)
    );
    const closed = await prisma.stockCount.findUniqueOrThrow({
      where: { id: count.id },
      include: { lines: { select: { itemId: true, countedQuantity: true } } }
    });
    expect(closed.status).toBe('COUNTED');
    const ironLine = closed.lines.find(entry => entry.itemId === ironId);
    expect(ironLine).toBeDefined();
    expect(ironLine?.countedQuantity).toBeNull();

    const alert = await prisma.stockAlert.findFirst({
      where: { tenantId: tenant.id, kind: 'FIELD_COUNT_CLOSED', subjectId: count.id }
    });
    expect(alert).not.toBeNull();
    expect(alert?.subjectType).toBe('StockCount');
    const session = await prisma.stockWhatsappSession.findFirstOrThrow({
      where: { tenantId: tenant.id, registrationId: registration.id }
    });
    expect(session.closedAt).not.toBeNull();
    expect(session.countOutcome).toBe('COUNTED');

    // 5. Le bureau écarte la ligne non comptée ; le chef, qui a compté, ne valide pas.
    await prisma.$transaction(tx =>
      setAsideStockCountLineTx(tx, tenant.id, count.id, ironId, {
        reason: 'Fer non photographié, recompté au prochain passage',
        setAsideByUserId: office.id
      })
    );
    // Le chef a compté : il ne valide pas (un autre validateur existe, A1-R3).
    await expect(
      prisma.$transaction(tx => validateStockCountTx(tx, tenant.id, count.id, chefId))
    ).rejects.toMatchObject({ code: ErrorCode.STOCK_COUNT_SELF_VALIDATION_FORBIDDEN });
    // Le rôle Chef de chantier ne porte d'ailleurs pas STOCK_COUNT_VALIDATE.
    const chefValidates = await prisma.rolePermission.findFirst({
      where: { roleId: siteManagerRoleId, permission: { key: 'STOCK_COUNT_VALIDATE' } }
    });
    expect(chefValidates).toBeNull();

    const validated = await prisma.$transaction(tx => validateStockCountTx(tx, tenant.id, count.id, office.id));
    expect(validated.status).toBe('VALIDATED');
    expect(validated.selfValidated).toBe(false);
    const finalLine = await prisma.stockCountLine.findFirstOrThrow({ where: { countId: count.id, itemId: cementId } });
    expect(finalLine.countedByUserId).toBe(chefId);
  });

  it('W3-R7 : 10 mauvais codes simultanés → exactement 5 essais comptés, inscription verrouillée', async () => {
    const chefId = await newMember(tenant, 'chef-wa-essais', siteManagerRoleId);
    const registration = await createRegistration(tenant.id, office.id, {
      userId: chefId,
      phone: PHONE_LOCKOUT,
      siteIds: [siteId]
    });
    const wrong = registration.activationCode === '000000' ? '111111' : '000000';

    await Promise.all(Array.from({ length: 10 }, () => send(PHONE_LOCKOUT, { kind: 'TEXT', text: wrong })));

    const row = await prisma.stockWhatsappRegistration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(row.activationAttempts).toBe(5);
    expect(row.status).toBe('PENDING_ACTIVATION');

    // Le bon code, désormais, ne passe plus (M04).
    await send(PHONE_LOCKOUT, { kind: 'TEXT', text: registration.activationCode });
    const after = await prisma.stockWhatsappRegistration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(after.status).toBe('PENDING_ACTIVATION');
    expect(after.activationAttempts).toBe(5);
    expect((await lastOutbound(registration.id))?.text).toBe(fr(() => botMessages.codeLocked().text));
  });

  it('W3-R4 : une seconde inscription vivante du même numéro → 409 par l’index partiel', async () => {
    const chefId = await newMember(tenant, 'chef-wa-numero', siteManagerRoleId);
    await createRegistration(tenant.id, office.id, { userId: chefId, phone: PHONE_OTHER, siteIds: [siteId] });

    // Une autre agence, un autre membre, le MÊME numéro.
    const otherAdmin = await createTenantAdminUser(otherTenant, 'bureau-wa-autre');
    userIds.push(otherAdmin.id);
    const otherChefId = await newMember(otherTenant, 'chef-wa-autre', siteManagerRoleId);
    const other = await newSite(otherTenant, 'Chantier Yopougon');

    await expect(
      createRegistration(otherTenant.id, otherAdmin.id, {
        userId: otherChefId,
        phone: PHONE_OTHER,
        siteIds: [other.siteId]
      })
    ).rejects.toMatchObject({ statusCode: 409, code: ErrorCode.STOCK_WHATSAPP_PHONE_UNAVAILABLE });

    // Preuve en base : c'est l'index unique partiel du numéro qui refuse.
    let violation: unknown = null;
    try {
      await prisma.stockWhatsappRegistration.create({
        data: {
          tenantId: otherTenant.id,
          userId: otherChefId,
          phoneE164: PHONE_OTHER,
          status: 'ACTIVE',
          createdByUserId: otherAdmin.id
        }
      });
    } catch (error) {
      violation = error;
    }
    expect(violation).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((violation as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
    const target = JSON.stringify((violation as Prisma.PrismaClientKnownRequestError).meta ?? {});
    expect(target).toMatch(/phone/);
    expect(target).not.toMatch(/member|user_id/);

    // Une inscription révoquée libère le numéro (index partiel `status <> 'REVOKED'`).
    await prisma.stockWhatsappRegistration.updateMany({
      where: { tenantId: tenant.id, phoneE164: PHONE_OTHER },
      data: { status: 'REVOKED', revokedAt: new Date(), activationCodeHash: null, activationExpiresAt: null }
    });
    const reused = await createRegistration(otherTenant.id, otherAdmin.id, {
      userId: otherChefId,
      phone: PHONE_OTHER,
      siteIds: [other.siteId]
    });
    expect(reused.status).toBe('PENDING_ACTIVATION');
  });

  it('W3-R4 : deux inscriptions simultanées du même membre → une seule passe, l’autre 409', async () => {
    const chefId = await newMember(tenant, 'chef-wa-course', siteManagerRoleId);
    const results = await Promise.allSettled([
      createRegistration(tenant.id, office.id, { userId: chefId, phone: PHONE_RACE_A, siteIds: [siteId] }),
      createRegistration(tenant.id, office.id, { userId: chefId, phone: PHONE_RACE_B, siteIds: [siteId] })
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(AppError);
    expect(rejected?.reason).toMatchObject({
      statusCode: 409,
      code: ErrorCode.STOCK_WHATSAPP_MEMBER_ALREADY_REGISTERED
    });
    const live = await prisma.stockWhatsappRegistration.count({
      where: { tenantId: tenant.id, userId: chefId, status: { not: 'REVOKED' } }
    });
    expect(live).toBe(1);
  });
});
