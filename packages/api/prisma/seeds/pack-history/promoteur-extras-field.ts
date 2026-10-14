/**
 * Volet terrain du stock : inventaire par WhatsApp (lot 041, historique d'un
 * chef de chantier inscrit qui compte par photo), pièces jointes (photos de
 * marchandise, bons de livraison, bons signés) et clés d'idempotence des
 * écritures terrain récentes.
 *
 * AUCUN envoi réel : uniquement des lignes d'historique (inscriptions,
 * sessions, messages, captures, photos écrites sur disque).
 */
import { randomUUID } from 'crypto';
import { addDays } from './types';
import type { Env } from './promoteur-extras-shared';
import { renderStockPhoto } from './promoteur-extras-shared';
import type { PhotoKind } from './promoteur-extras-shared';
import type { StockBook } from './promoteur-extras-stock';
import { countLinesFromBalances, runCount } from './promoteur-extras-stock';
import { buildPdf, writeUpload } from './seed-files';

export interface FieldKit {
  registrationId: string;
  userId: string;
}

const hoursAt = (d: Date, h: number, m = 0): Date => {
  const out = new Date(d.getTime());
  out.setHours(h, m, 0, 0);
  return out;
};

function wamid(env: Env): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = 'wamid.HBgM';
  for (let i = 0; i < 40; i++) s += alphabet[Math.floor(env.rng() * alphabet.length)];
  return `${s}==`;
}

async function freePhone(env: Env): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const digits = String(Math.floor(env.rng() * 90_000_000) + 10_000_000);
    const phone = `+22507${digits}`;
    const used = await env.prisma.stockWhatsappRegistration.findFirst({
      where: { phoneE164: phone, status: { not: 'REVOKED' } },
      select: { id: true }
    });
    if (!used) return phone;
  }
  throw new Error('Aucun numéro libre pour une inscription WhatsApp de démonstration');
}

const PHOTO_BY_FAMILY: Record<
  string,
  { kind: PhotoKind; method: 'SACKS_STACKED' | 'BARS_BUNDLE' | 'BLOCKS_PALLET' | 'OTHER' }
> = {
  Ciment: { kind: 'SACKS', method: 'SACKS_STACKED' },
  'Fer à béton': { kind: 'BARS', method: 'BARS_BUNDLE' },
  Agglomérés: { kind: 'BLOCKS', method: 'BLOCKS_PALLET' },
  Finition: { kind: 'TILES', method: 'OTHER' }
};

// ===========================================================================
// Inscriptions
// ===========================================================================

/** Chef inscrit (actif), ancien chef révoqué et, s'il existe un autre membre, une inscription en attente de code. */
export async function ensureWhatsappRegistry(env: Env, siteIds: string[], startDate: Date): Promise<FieldKit | null> {
  const { prisma, tenantId } = env;
  const existing = await prisma.stockWhatsappRegistration.findFirst({
    where: { tenantId, status: 'ACTIVE' },
    select: { id: true, userId: true }
  });
  if (existing) return { registrationId: existing.id, userId: existing.userId };
  if ((await prisma.stockWhatsappRegistration.count({ where: { tenantId } })) > 0) return null;

  const others = env.staff.filter(s => s !== env.admin);
  const chef = others[0] ?? env.admin;
  const { activationCodeHash } = await import('../../../src/lib/stock-whatsapp/registrations/activation');

  // Ancien chef de chantier, parti : inscription révoquée (son numéro est libre pour un autre).
  const revokedAt = addDays(env.ctx.end, -150);
  await prisma.stockWhatsappRegistration.create({
    data: {
      tenantId,
      userId: chef,
      phoneE164: await freePhone(env),
      status: 'REVOKED',
      activatedAt: addDays(startDate, -200),
      createdByUserId: env.admin,
      revokedAt,
      revokedByUserId: env.admin,
      revokeReason: 'Départ du chef de chantier : numéro retiré de la liste',
      lastInboundAt: addDays(revokedAt, -3),
      createdAt: addDays(startDate, -204)
    }
  });
  const active = await prisma.stockWhatsappRegistration.create({
    data: {
      tenantId,
      userId: chef,
      phoneE164: await freePhone(env),
      status: 'ACTIVE',
      activatedAt: addDays(startDate, 1),
      createdByUserId: env.admin,
      createdAt: addDays(startDate, -1),
      lastInboundAt: addDays(env.ctx.end, -2)
    }
  });
  for (const siteId of siteIds) {
    await prisma.stockWhatsappRegistrationSite.create({
      data: { tenantId, registrationId: active.id, siteId, createdAt: addDays(startDate, -1) }
    });
  }
  const second = others[1];
  if (second) {
    const id = randomUUID();
    await prisma.stockWhatsappRegistration.create({
      data: {
        id,
        tenantId,
        userId: second,
        phoneE164: await freePhone(env),
        status: 'PENDING_ACTIVATION',
        activationCodeHash: activationCodeHash('482913', id),
        activationExpiresAt: addDays(env.ctx.end, 2),
        activationAttempts: 0,
        createdByUserId: env.admin,
        createdAt: addDays(env.ctx.end, -1)
      }
    });
    for (const siteId of siteIds.slice(0, 1)) {
      await prisma.stockWhatsappRegistrationSite.create({
        data: { tenantId, registrationId: id, siteId, createdAt: addDays(env.ctx.end, -1) }
      });
    }
  }
  return { registrationId: active.id, userId: chef };
}

// ===========================================================================
// Inventaire par WhatsApp
// ===========================================================================

async function bumpUsage(env: Env, date: Date, photos: number, reachedAt?: Date): Promise<void> {
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const found = await env.prisma.stockWhatsappUsage.findFirst({ where: { tenantId: env.tenantId, month } });
  if (found) {
    await env.prisma.stockWhatsappUsage.update({ where: { id: found.id }, data: { used: found.used + photos } });
  } else {
    await env.prisma.stockWhatsappUsage.create({
      data: { tenantId: env.tenantId, month, used: photos, quotaReachedAt: reachedAt ?? null }
    });
  }
}

async function storePhoto(
  env: Env,
  folder: 'stock-whatsapp' | 'stock',
  date: Date,
  kind: PhotoKind,
  seed: number
): Promise<{ fileUrl: string; sizeBytes: number; sha256: string; mimeType: string }> {
  const original = renderStockPhoto(kind, seed);
  const stored = env.svc.attach.stripImageMetadata(original, 'png') as Buffer;
  const file = await writeUpload([folder, env.tenantId, String(date.getUTCFullYear())], `${randomUUID()}.png`, stored);
  return {
    fileUrl: file.fileUrl,
    sizeBytes: stored.length,
    sha256: env.svc.attach.sha256Hex(stored),
    mimeType: 'image/png'
  };
}

interface WaPlan {
  siteId: string;
  locationId: string;
  siteName: string;
  date: Date;
  final: 'VALIDATED' | 'COUNTED';
  variance: 'clean' | 'forced';
}

/** Un inventaire de chantier compté par WhatsApp : lignes d'inventaire (lot 040) + conversation, captures et photos. */
export async function whatsappCount(env: Env, book: StockBook, kit: FieldKit, p: WaPlan): Promise<void> {
  const { prisma, tenantId } = env;
  const { lines, reasons } = await countLinesFromBalances(env, p.locationId, p.variance, 7);
  if (lines.length === 0) return;
  const out = await runCount(env, book, {
    locationId: p.locationId,
    date: p.date,
    counters: [kit.userId],
    validator: env.admin,
    lines,
    reasons,
    final: p.final,
    source: 'WHATSAPP'
  });
  if (!out) return;
  const countLines = await prisma.stockCountLine.findMany({
    where: { countId: out.countId, countedQuantity: { not: null } },
    include: { item: { select: { id: true, reference: true, label: true, unit: true, category: true } } }
  });

  const open = hoursAt(p.date, 7, 42);
  const session = await prisma.stockWhatsappSession.create({
    data: {
      tenantId,
      registrationId: kit.registrationId,
      state: 'CLOSED',
      siteId: p.siteId,
      locationId: p.locationId,
      countId: out.countId,
      lastInboundAt: hoursAt(p.date, 8, 20 + countLines.length * 2),
      openedAt: open,
      closedAt: hoursAt(p.date, 8, 22 + countLines.length * 2),
      closeReason: 'FIN',
      countOutcome: 'COUNTED'
    }
  });

  let t = open.getTime();
  const next = (seconds: number): Date => {
    t += seconds * 1000;
    return new Date(t);
  };
  const msg = async (
    direction: 'INBOUND' | 'OUTBOUND',
    kind: 'TEXT' | 'IMAGE' | 'BUTTONS' | 'LIST' | 'REPLY',
    text: string | null,
    extra: { interactive?: unknown; captureId?: string | null; gap?: number } = {}
  ): Promise<void> => {
    await prisma.stockWhatsappMessage.create({
      data: {
        tenantId,
        registrationId: kit.registrationId,
        sessionId: session.id,
        captureId: extra.captureId ?? null,
        direction,
        kind,
        text,
        interactive: extra.interactive === undefined ? undefined : (extra.interactive as never),
        metaMessageId: wamid(env),
        via: 'META',
        createdAt: next(extra.gap ?? 4)
      }
    });
  };

  await msg('INBOUND', 'TEXT', 'Inventaire', { gap: 1 });
  await msg('OUTBOUND', 'LIST', 'Pour quel chantier voulez-vous compter le stock ?', {
    interactive: [{ id: p.siteId, title: p.siteName.slice(0, 24) }]
  });
  await msg('INBOUND', 'REPLY', p.siteName.slice(0, 24), {
    interactive: { id: p.siteId, title: p.siteName.slice(0, 24) }
  });
  await msg('OUTBOUND', 'TEXT', 'Envoyez une photo du stock à compter. Écrivez FIN quand vous avez terminé.');

  let n = 0;
  for (const line of countLines) {
    n += 1;
    const meta = PHOTO_BY_FAMILY[
      line.item.category === 'Matériaux' || !line.item.category ? 'Ciment' : line.item.category
    ] ?? { kind: 'SACKS' as PhotoKind, method: 'OTHER' as const };
    const family = line.item.reference.startsWith('FER')
      ? 'Fer à béton'
      : line.item.reference.startsWith('PAR')
        ? 'Agglomérés'
        : line.item.reference.startsWith('CAR')
          ? 'Finition'
          : 'Ciment';
    const photoMeta = PHOTO_BY_FAMILY[family] ?? meta;
    const counted = Number(line.countedQuantity);
    const corrected = n % 4 === 0;
    const proposed = corrected ? Math.max(1, Math.round(counted * (0.92 + env.rng() * 0.05))) : counted;
    const receivedAt = next(20);
    const photo = await storePhoto(env, 'stock-whatsapp', p.date, photoMeta.kind, Math.floor(env.rng() * 1_000_000));
    const capture = await prisma.stockFieldCapture.create({
      data: {
        tenantId,
        registrationId: kit.registrationId,
        sessionId: session.id,
        userId: kit.userId,
        siteId: p.siteId,
        locationId: p.locationId,
        countId: out.countId,
        countLineId: line.id,
        itemId: line.itemId,
        itemImposed: false,
        outcome: corrected ? 'CORRECTED' : 'ACCEPTED',
        via: 'META',
        metaMessageId: wamid(env),
        fileUrl: photo.fileUrl,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        sha256: photo.sha256,
        providerSha256: photo.sha256,
        receivedAt,
        visionProvider: 'gemini',
        visionModel: 'gemini-2.5-flash',
        analyzedAt: addDays(receivedAt, 0),
        analysisMs: 1800 + Math.floor(env.rng() * 2400),
        quality: 'OK',
        method: photoMeta.method,
        proposedTotal: proposed,
        confidence: 0.78 + Math.floor(env.rng() * 20) / 100,
        analysis: {
          quality: 'OK',
          itemId: line.itemId,
          itemConfidence: 0.9,
          visibleUnits: Math.max(1, Math.round(proposed * 0.35)),
          layers: 6,
          columns: 5,
          depthRows: 4,
          proposedTotal: proposed,
          confidence: 0.85,
          method: photoMeta.method,
          explanation: `Piles bien alignées, ${line.item.label} reconnu sur la photo.`.slice(0, 280)
        },
        quotaCounted: true,
        confirmedQuantity: counted,
        lineQuantityAfter: counted,
        confirmedAt: addDays(receivedAt, 0)
      } as never
    });
    await msg('INBOUND', 'IMAGE', null, { captureId: capture.id, gap: 1 });
    await msg(
      'OUTBOUND',
      'BUTTONS',
      `J'ai compté ${proposed} ${line.item.unit} (${line.item.label}). C'est bien ça ?`,
      {
        captureId: capture.id,
        interactive: [
          { id: 'OK', title: 'Oui' },
          { id: 'FIX', title: 'Corriger' }
        ]
      }
    );
    if (corrected) {
      await msg('INBOUND', 'REPLY', 'Corriger', {
        captureId: capture.id,
        interactive: { id: 'FIX', title: 'Corriger' }
      });
      await msg('OUTBOUND', 'TEXT', 'Quelle est la bonne quantité ?', { captureId: capture.id });
      await msg('INBOUND', 'TEXT', String(counted), { captureId: capture.id });
    } else {
      await msg('INBOUND', 'REPLY', 'Oui', { captureId: capture.id, interactive: { id: 'OK', title: 'Oui' } });
    }
    await msg('OUTBOUND', 'TEXT', `Enregistré : ${counted} ${line.item.unit}. Photo suivante ?`, {
      captureId: capture.id
    });
  }
  await msg('INBOUND', 'TEXT', 'FIN');
  await msg('OUTBOUND', 'TEXT', `Merci. ${countLines.length} article(s) comptés. Le bureau valide l'inventaire.`);
  await bumpUsage(env, p.date, countLines.length);
  await prisma.stockWhatsappRegistration.update({
    where: { id: kit.registrationId },
    data: { lastInboundAt: new Date(t) }
  });
}

/** Historique des sessions qui n'ont pas abouti à un comptage : photo illisible, objet inconnu, délai dépassé, échec d'analyse. */
export async function whatsappMisfires(
  env: Env,
  kit: FieldKit,
  site: { siteId: string; locationId: string; siteName: string },
  book: StockBook
): Promise<void> {
  const { prisma, tenantId } = env;
  const item = book.items.get('CIM-425');
  const cases: Array<{
    daysAgo: number;
    outcome: 'UNREADABLE' | 'UNRECOGNIZED' | 'EXPIRED' | 'FAILED' | 'CANCELLED';
    quality: 'TOO_DARK' | 'NOT_STOCK' | 'OK' | 'BLURRY';
    reason: 'FIN' | 'TIMEOUT' | 'SITE_CHANGE';
    failure?: 'TIMEOUT' | 'PROVIDER_ERROR';
    botText: string;
    photo: PhotoKind;
  }> = [
    {
      daysAgo: 64,
      outcome: 'UNREADABLE',
      quality: 'TOO_DARK',
      reason: 'FIN',
      botText: 'La photo est trop sombre pour compter. Pouvez-vous la reprendre avec plus de lumière ?',
      photo: 'SACKS'
    },
    {
      daysAgo: 49,
      outcome: 'UNRECOGNIZED',
      quality: 'NOT_STOCK',
      reason: 'FIN',
      botText: 'Je ne reconnais pas de matériaux de chantier sur cette photo. Envoyez une photo du stock à compter.',
      photo: 'NOTE'
    },
    {
      daysAgo: 36,
      outcome: 'EXPIRED',
      quality: 'OK',
      reason: 'TIMEOUT',
      botText: "J'ai compté 180 sacs de ciment. C'est bien ça ?",
      photo: 'SACKS'
    },
    {
      daysAgo: 21,
      outcome: 'FAILED',
      quality: 'OK',
      reason: 'FIN',
      failure: 'PROVIDER_ERROR',
      botText: "L'analyse de la photo n'a pas abouti. Réessayez dans quelques minutes.",
      photo: 'BARS'
    },
    {
      daysAgo: 13,
      outcome: 'CANCELLED',
      quality: 'OK',
      reason: 'SITE_CHANGE',
      botText: "J'ai compté 95 barres de fer. C'est bien ça ?",
      photo: 'BARS'
    }
  ];
  for (const c of cases) {
    const date = hoursAt(addDays(env.ctx.end, -c.daysAgo), 9, 5);
    const session = await prisma.stockWhatsappSession.create({
      data: {
        tenantId,
        registrationId: kit.registrationId,
        state: 'CLOSED',
        siteId: site.siteId,
        locationId: site.locationId,
        lastInboundAt: addDays(date, 0),
        openedAt: date,
        closedAt: new Date(date.getTime() + (c.reason === 'TIMEOUT' ? 3 * 3600_000 : 240_000)),
        closeReason: c.reason,
        countOutcome: 'NONE'
      }
    });
    const photo = await storePhoto(env, 'stock-whatsapp', date, c.photo, Math.floor(env.rng() * 1_000_000));
    const capture = await prisma.stockFieldCapture.create({
      data: {
        tenantId,
        registrationId: kit.registrationId,
        sessionId: session.id,
        userId: kit.userId,
        siteId: site.siteId,
        locationId: site.locationId,
        itemId: c.outcome === 'EXPIRED' || c.outcome === 'CANCELLED' ? (item?.id ?? null) : null,
        outcome: c.outcome,
        via: 'META',
        metaMessageId: wamid(env),
        fileUrl: photo.fileUrl,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        sha256: photo.sha256,
        providerSha256: photo.sha256,
        receivedAt: new Date(date.getTime() + 40_000),
        visionProvider: 'gemini',
        visionModel: 'gemini-2.5-flash',
        analyzedAt: c.failure ? null : new Date(date.getTime() + 44_000),
        analysisMs: c.failure ? null : 2300,
        quality: c.failure ? null : c.quality,
        method: c.failure ? null : c.outcome === 'EXPIRED' ? 'SACKS_STACKED' : null,
        proposedTotal: c.outcome === 'EXPIRED' ? 180 : c.outcome === 'CANCELLED' ? 95 : null,
        confidence: c.failure ? null : 0.7,
        failureReason: c.failure ?? null,
        quotaCounted: !c.failure
      } as never
    });
    const rows: Array<['INBOUND' | 'OUTBOUND', 'TEXT' | 'IMAGE', string | null, string | null]> = [
      ['INBOUND', 'TEXT', 'Inventaire', null],
      ['OUTBOUND', 'TEXT', 'Envoyez une photo du stock à compter. Écrivez FIN quand vous avez terminé.', null],
      ['INBOUND', 'IMAGE', null, capture.id],
      ['OUTBOUND', 'TEXT', c.botText, capture.id]
    ];
    let t = date.getTime();
    for (const [direction, kind, text, captureId] of rows) {
      t += 15_000;
      await prisma.stockWhatsappMessage.create({
        data: {
          tenantId,
          registrationId: kit.registrationId,
          sessionId: session.id,
          captureId,
          direction,
          kind,
          text,
          metaMessageId: wamid(env),
          via: 'META',
          createdAt: new Date(t)
        }
      });
    }
    await bumpUsage(env, date, c.failure ? 0 : 1);
  }
}

// ===========================================================================
// Pièces jointes
// ===========================================================================

export async function seedStockAttachments(env: Env): Promise<void> {
  const { prisma, tenantId } = env;
  if ((await prisma.stockAttachment.count({ where: { tenantId } })) > 0) return;
  const slips = await prisma.stockSlip.findMany({
    where: { tenantId },
    orderBy: { documentDate: 'asc' },
    include: { location: { select: { label: true } }, site: { select: { name: true } } }
  });
  const receipts = slips.filter(s => s.kind === 'RECEIPT');
  const issues = slips.filter(s => s.kind === 'ISSUE');
  const uploader = (): string => env.pickStaff();

  const attach = async (data: {
    targetType: 'MOVEMENT' | 'SLIP' | 'COUNT_LINE';
    slipId?: string;
    movementId?: string;
    countLineId?: string;
    purpose: 'GOODS_PHOTO' | 'DELIVERY_NOTE' | 'SIGNED_SLIP' | 'OTHER';
    caption: string;
    date: Date;
    kind?: PhotoKind;
    pdf?: { title: string; lines: string[] };
    removed?: boolean;
  }): Promise<void> => {
    const when = hoursAt(data.date, 10 + Math.floor(env.rng() * 6), Math.floor(env.rng() * 59));
    let fileUrl: string | null;
    let sizeBytes: number;
    let sha: string;
    let mimeType: string;
    let fileName: string;
    if (data.pdf) {
      const buf = buildPdf(data.pdf.title, data.pdf.lines);
      const file = await writeUpload(['stock', tenantId, String(when.getUTCFullYear())], `${randomUUID()}.pdf`, buf);
      fileUrl = file.fileUrl;
      sizeBytes = buf.length;
      sha = env.svc.attach.sha256Hex(buf);
      mimeType = 'application/pdf';
      fileName = 'bon-signe.pdf';
    } else {
      const photo = await storePhoto(env, 'stock', when, data.kind ?? 'SACKS', Math.floor(env.rng() * 1_000_000));
      fileUrl = photo.fileUrl;
      sizeBytes = photo.sizeBytes;
      sha = photo.sha256;
      mimeType = photo.mimeType;
      fileName = data.purpose === 'DELIVERY_NOTE' ? 'bon-de-livraison.png' : 'photo-marchandise.png';
    }
    await prisma.stockAttachment.create({
      data: {
        tenantId,
        targetType: data.targetType,
        slipId: data.slipId ?? null,
        movementId: data.movementId ?? null,
        countLineId: data.countLineId ?? null,
        purpose: data.purpose,
        caption: data.caption,
        fileName,
        fileUrl: data.removed ? null : fileUrl,
        mimeType,
        sizeBytes,
        sha256: sha,
        uploadedByUserId: uploader(),
        createdAt: when,
        removedAt: data.removed ? addDays(when, 1) : null,
        removedByUserId: data.removed ? env.admin : null,
        removalReason: data.removed ? 'Photo prise par erreur (mauvais bon de réception)' : null
      }
    });
  };

  const pick = <T>(list: T[], n: number): T[] => {
    if (list.length <= n) return list;
    const step = list.length / n;
    return Array.from({ length: n }, (_, i) => list[Math.floor(i * step)]);
  };
  const kinds: PhotoKind[] = ['SACKS', 'BARS', 'BLOCKS', 'TILES'];
  let i = 0;
  for (const slip of pick(receipts, 16)) {
    i += 1;
    await attach({
      targetType: 'SLIP',
      slipId: slip.id,
      purpose: 'DELIVERY_NOTE',
      caption: `Bon de livraison du fournisseur — ${slip.location.label}`,
      date: slip.documentDate,
      kind: 'NOTE'
    });
    if (i % 2 === 0) {
      const mv = await prisma.stockMovement.findFirst({ where: { tenantId, slipId: slip.id }, select: { id: true } });
      if (mv) {
        await attach({
          targetType: 'MOVEMENT',
          movementId: mv.id,
          purpose: 'GOODS_PHOTO',
          caption: 'Marchandise au déchargement',
          date: slip.documentDate,
          kind: kinds[i % kinds.length]
        });
      }
    }
  }
  for (const slip of pick(issues, 8)) {
    await attach({
      targetType: 'SLIP',
      slipId: slip.id,
      purpose: 'SIGNED_SLIP',
      caption: 'Bon de sortie signé par le preneur',
      date: slip.documentDate,
      pdf: {
        title: 'Bon de sortie de stock — exemplaire signé',
        lines: [
          `# Chantier : ${slip.site?.name ?? 'Chantier'}`,
          `Lieu de stockage : ${slip.location.label}`,
          `Date : ${slip.documentDate.toLocaleDateString('fr-FR')}`,
          `Demandeur : ${slip.requestedBy ?? ''}`,
          '',
          'Le preneur reconnaît avoir reçu les articles listés sur le bon de sortie.',
          'Signature du preneur : ______________________    Signature du magasinier : ______________________'
        ]
      }
    });
  }
  // Une pièce retirée (photo prise par erreur) : la ligne garde son empreinte, plus de fichier.
  const lastReceipt = receipts[receipts.length - 1];
  if (lastReceipt) {
    await attach({
      targetType: 'SLIP',
      slipId: lastReceipt.id,
      purpose: 'OTHER',
      caption: 'Photo remplacée',
      date: lastReceipt.documentDate,
      kind: 'SACKS',
      removed: true
    });
  }
  // Photos de lignes d'inventaire écartées ou en écart.
  const lines = await prisma.stockCountLine.findMany({
    where: { count: { tenantId, status: 'VALIDATED' }, reasonCode: { not: null } },
    orderBy: { count: { countedAt: 'asc' } },
    include: { count: { select: { countedAt: true } } },
    take: 40
  });
  for (const line of pick(lines, 6)) {
    await attach({
      targetType: 'COUNT_LINE',
      countLineId: line.id,
      purpose: 'GOODS_PHOTO',
      caption: 'Preuve photo du comptage',
      date: line.count.countedAt,
      kind: kinds[Math.floor(env.rng() * kinds.length)]
    });
  }
}

// ===========================================================================
// Clés d'idempotence des écritures terrain récentes (conservées 30 jours)
// ===========================================================================

export async function seedClientRequests(env: Env): Promise<void> {
  const { prisma, tenantId } = env;
  if ((await prisma.stockClientRequest.count({ where: { tenantId } })) > 0) return;
  const since = addDays(env.ctx.end, -29);
  const slips = await prisma.stockSlip.findMany({
    where: { tenantId, createdAt: { gte: since }, kind: { in: ['RECEIPT', 'ISSUE'] } },
    orderBy: { createdAt: 'asc' },
    include: { movements: { select: { itemId: true, quantity: true } } },
    take: 30
  });
  for (const slip of slips) {
    const body = {
      locationId: slip.locationId,
      lines: slip.movements.map(m => ({ itemId: m.itemId, quantity: Number(m.quantity) })),
      date: slip.documentDate.toISOString()
    };
    await prisma.stockClientRequest.create({
      data: {
        tenantId,
        clientRequestId: randomUUID(),
        operation: slip.kind === 'RECEIPT' ? 'RECEIPT' : 'ISSUE',
        bodyHash: env.svc.stockCtl.hashRequestBody(body),
        resultType: 'StockSlip',
        resultId: slip.id,
        createdByUserId: slip.createdByUserId,
        createdAt: slip.createdAt
      }
    });
  }
  const transfers = await prisma.stockMovement.findMany({
    where: { tenantId, type: 'TRANSFER', isDecrease: true, createdAt: { gte: since } },
    take: 6
  });
  for (const t of transfers) {
    await prisma.stockClientRequest.create({
      data: {
        tenantId,
        clientRequestId: randomUUID(),
        operation: 'TRANSFER',
        bodyHash: env.svc.stockCtl.hashRequestBody({
          itemId: t.itemId,
          quantity: Number(t.quantity),
          from: t.locationId
        }),
        resultType: 'StockMovement',
        resultId: t.transferGroupId ?? t.id,
        createdByUserId: t.createdByUserId,
        createdAt: t.createdAt
      }
    });
  }
  const lines = await prisma.stockCountLine.findMany({
    where: { count: { tenantId, createdAt: { gte: since } }, countedQuantity: { not: null } },
    take: 8
  });
  for (const l of lines) {
    await prisma.stockClientRequest.create({
      data: {
        tenantId,
        clientRequestId: randomUUID(),
        operation: 'COUNT_LINE',
        bodyHash: env.svc.stockCtl.hashRequestBody({ itemId: l.itemId, countedQuantity: Number(l.countedQuantity) }),
        resultType: 'StockCountLine',
        resultId: l.id,
        createdByUserId: l.countedByUserId ?? env.admin,
        createdAt: l.countedAtServer ?? since
      }
    });
  }
  const atts = await prisma.stockAttachment.findMany({ where: { tenantId, createdAt: { gte: since } }, take: 4 });
  for (const a of atts) {
    await prisma.stockClientRequest.create({
      data: {
        tenantId,
        clientRequestId: randomUUID(),
        operation: 'ATTACHMENT',
        bodyHash: a.sha256,
        resultType: 'StockAttachment',
        resultId: a.id,
        createdByUserId: a.uploadedByUserId,
        createdAt: a.createdAt
      }
    });
  }
}
