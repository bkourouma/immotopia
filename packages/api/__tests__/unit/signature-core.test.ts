/**
 * Noyau de la signature électronique (spec 044, lot S1) : code à usage unique,
 * jeton, chaînage de la piste de preuve, scellement PDF, saisie de signature,
 * masquage des contacts et du jeton dans les journaux.
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  generateOtpCode,
  normalizeOtpInput,
  otpHash,
  otpLimits,
  otpMatches,
  OTP_LENGTH
} from '../../src/lib/signature/otp';
import { generateToken, hashToken, looksLikeToken } from '../../src/lib/signature/token';
import { hashIp, sha256Hex, truncateIp } from '../../src/lib/signature/evidence';
import { canonicalJson, computeEventHash, verifyEventChain, type ChainedEvent } from '../../src/lib/signature/events';
import { safeText, sealSignedPdf } from '../../src/lib/signature/seal';
import { parseSignatureInput } from '../../src/lib/signature/signature-input';
import { maskContact, maskEmail, toRequestDto } from '../../src/lib/signature/dto';
import { maskSensitivePath } from '../../src/utils/sensitive-path';
import { maskRequestUrl } from '../../src/middleware/logging-middleware';

describe('code à usage unique', () => {
  it('produit 6 chiffres, zéros de tête conservés', () => {
    for (let i = 0; i < 200; i += 1) expect(generateOtpCode()).toMatch(new RegExp(`^\\d{${OTP_LENGTH}}$`));
  });

  it("n'est stocké qu'en HMAC lié au signataire (jamais le code, ni le même hachage d'un signataire à l'autre)", () => {
    const a = otpHash('123456', 'signer-a');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('123456');
    expect(a).not.toBe(otpHash('123456', 'signer-b'));
    expect(a).not.toBe(sha256Hex('123456:signer-a'));
  });

  it('compare à temps constant : bon code accepté, mauvais code refusé', () => {
    const stored = otpHash('482913', 's1');
    expect(otpMatches(stored, '482913', 's1')).toBe(true);
    expect(otpMatches(stored, '482914', 's1')).toBe(false);
    expect(otpMatches(stored, '482913', 's2')).toBe(false);
    expect(otpMatches('', '482913', 's1')).toBe(false);
  });

  it('normalise la saisie (espaces, tirets) et refuse tout le reste', () => {
    expect(normalizeOtpInput('482 913')).toBe('482913');
    expect(normalizeOtpInput('482-913')).toBe('482913');
    expect(normalizeOtpInput('48291')).toBeNull();
    expect(normalizeOtpInput('abcdef')).toBeNull();
    expect(normalizeOtpInput(undefined)).toBeNull();
  });

  it('applique les limites de la spec : 5 essais, 10 minutes, 3 renvois', () => {
    const limits = otpLimits();
    expect(limits.maxAttempts).toBe(5);
    expect(limits.ttlMs).toBe(10 * 60 * 1000);
    expect(limits.maxSends).toBe(4);
  });
});

describe('jeton du signataire', () => {
  it('fait 32 octets aléatoires, seul le SHA-256 est conservé', () => {
    const token = generateToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(looksLikeToken(token)).toBe(true);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
    expect(generateToken()).not.toBe(token);
  });

  it('rejette ce qui n’a pas la forme d’un jeton avant tout accès à la base', () => {
    expect(looksLikeToken('court')).toBe(false);
    expect(looksLikeToken('a'.repeat(200))).toBe(false);
    expect(looksLikeToken('../../etc/passwd-padding-padding')).toBe(false);
    expect(looksLikeToken(undefined)).toBe(false);
  });
});

describe('preuves : IP', () => {
  it('tronque en /24 (IPv4) et /48 (IPv6), jamais en clair dans l’empreinte', () => {
    expect(truncateIp('41.202.207.55')).toBe('41.202.207.0/24');
    expect(truncateIp('::ffff:41.202.207.55')).toBe('41.202.207.0/24');
    expect(truncateIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::/48');
    expect(truncateIp(undefined)).toBeNull();
    const hash = hashIp('41.202.207.55');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashIp('41.202.207.55'));
    expect(hash).not.toBe(sha256Hex('41.202.207.55'));
  });
});

describe('piste de preuve chaînée', () => {
  function build(count: number): ChainedEvent[] {
    const events: ChainedEvent[] = [];
    let prev: string | null = null;
    for (let seq = 1; seq <= count; seq += 1) {
      const base = {
        seq,
        type: seq === 1 ? 'CREATED' : 'SIGNED',
        signerId: seq === 1 ? null : `signer-${seq}`,
        payload: { b: 2, a: { z: 1, y: [1, 2] }, seq },
        createdAt: new Date(Date.UTC(2026, 9, 15, 10, seq)),
        prevHash: prev
      };
      const eventHash = computeEventHash(base);
      events.push({ ...base, eventHash });
      prev = eventHash;
    }
    return events;
  }

  it('accepte une chaîne intacte', () => {
    expect(verifyEventChain(build(5))).toEqual({ ok: true });
  });

  it('serialise le JSON de façon canonique (ordre des clés sans effet)', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it('détecte un événement modifié', () => {
    const events = build(4);
    events[1] = { ...events[1], payload: { forged: true } };
    expect(verifyEventChain(events)).toEqual({ ok: false, brokenAtSeq: 2 });
  });

  it('détecte un événement retiré ou réordonné', () => {
    const events = build(4);
    expect(verifyEventChain([events[0], events[2], events[3]])).toEqual({ ok: false, brokenAtSeq: 3 });
    expect(verifyEventChain([events[1], events[0]])).toEqual({ ok: false, brokenAtSeq: 2 });
  });
});

describe('saisie de la signature', () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);

  it('accepte un nom saisi propre et refuse un nom vide', () => {
    expect(parseSignatureInput('TYPED', '  Awa   Koné ')).toEqual({ mode: 'TYPED', typed: 'Awa Koné' });
    expect(() => parseSignatureInput('TYPED', ' ')).toThrow();
  });

  it('vérifie réellement la signature PNG d’un dessin', () => {
    const ok = parseSignatureInput('DRAWN', `data:image/png;base64,${PNG.toString('base64')}`);
    expect(ok.mode).toBe('DRAWN');
    expect(() =>
      parseSignatureInput('DRAWN', `data:image/png;base64,${Buffer.from('<svg/>').toString('base64')}`)
    ).toThrow();
    expect(() => parseSignatureInput('DRAWN', 'data:image/jpeg;base64,AAAA')).toThrow();
    expect(() => parseSignatureInput('DRAWN', 'javascript:alert(1)')).toThrow();
  });

  it('refuse un dessin trop lourd', () => {
    const big = Buffer.concat([PNG, Buffer.alloc(210 * 1024)]);
    expect(() => parseSignatureInput('DRAWN', `data:image/png;base64,${big.toString('base64')}`)).toThrow();
  });
});

describe('scellement du PDF', () => {
  async function sourcePdf(): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage().drawText('Contrat de bail', { x: 50, y: 700, size: 14, font });
    return Buffer.from(await doc.save());
  }

  const base = {
    title: 'Contrat de bail BAIL-2026-0012',
    requestId: '11111111-1111-1111-1111-111111111111',
    sourceHash: 'a'.repeat(64),
    chainHead: 'b'.repeat(64),
    sealedAt: new Date(Date.UTC(2026, 9, 15, 12, 0))
  };
  const signer = (name: string, mode: 'TYPED' | 'DRAWN') => ({
    fullName: name,
    role: 'LOCATAIRE',
    channel: 'EMAIL',
    signedAt: new Date(Date.UTC(2026, 9, 15, 11, 30)),
    ipTruncated: '41.202.207.0/24',
    mode,
    typed: mode === 'TYPED' ? name : null,
    png: null,
    consentTextHash: 'c'.repeat(64)
  });

  it('produit un PDF valide : pages ajoutées, empreinte finale cohérente', async () => {
    const result = await sealSignedPdf({
      ...base,
      sourcePdf: await sourcePdf(),
      language: 'fr',
      signers: [signer('Awa Koné', 'TYPED'), signer('Moussa Traoré', 'TYPED')]
    });
    expect(result.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(result.sha256).toBe(sha256Hex(result.pdf));
    const reloaded = await PDFDocument.load(result.pdf);
    expect(reloaded.getPageCount()).toBe(1 + 2);
    expect(result.pageCount).toBe(reloaded.getPageCount());
  });

  it('rend un certificat anglais pour une demande en anglais et reste valide pour l’arabe (repli français)', async () => {
    for (const language of ['en', 'ar'] as const) {
      const result = await sealSignedPdf({
        ...base,
        sourcePdf: await sourcePdf(),
        language,
        signers: [signer('Awa Koné', 'TYPED')]
      });
      expect((await PDFDocument.load(result.pdf)).getPageCount()).toBeGreaterThanOrEqual(3);
    }
  });

  it('ne casse pas sur un nom hors alphabet latin', async () => {
    const result = await sealSignedPdf({
      ...base,
      sourcePdf: await sourcePdf(),
      language: 'fr',
      signers: [signer('محمد Koné', 'TYPED')]
    });
    expect(result.pdf.length).toBeGreaterThan(500);
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    expect(safeText(font, 'Koné محمد')).toBe('Koné ????');
  });

  it('refuse un fichier source qui n’est pas un PDF', async () => {
    await expect(
      sealSignedPdf({
        ...base,
        sourcePdf: Buffer.from('pas un pdf'),
        language: 'fr',
        signers: [signer('A B', 'TYPED')]
      })
    ).rejects.toThrow();
  });
});

describe('sorties : contacts masqués, aucune empreinte', () => {
  it('masque e-mail et numéro', () => {
    expect(maskEmail('awa.kone@exemple.ci')).toBe('a•••@e•••.ci');
    expect(maskContact('EMAIL', 'awa.kone@exemple.ci')).not.toContain('awa.kone');
    expect(maskContact('WHATSAPP', '+2250712345678')).toBe('+225 07 •• •• •• 78');
    expect(maskContact('IN_PERSON', '')).toBe('');
  });

  it('ne laisse sortir ni contact en clair, ni empreintes de jeton ou de code', () => {
    const dto = toRequestDto(
      {
        id: 'r1',
        kind: 'LEASE_CONTRACT',
        targetType: 'RentalLease',
        targetId: 'l1',
        title: 'Bail',
        language: 'fr',
        status: 'SENT',
        sequential: false,
        expiresAt: new Date(),
        createdAt: new Date(),
        completedAt: null,
        sourceHash: 'a'.repeat(64),
        signedHash: null,
        signedFileKey: null,
        signers: [
          {
            id: 's1',
            role: 'LOCATAIRE',
            position: 0,
            fullName: 'Awa Koné',
            channel: 'EMAIL',
            contact: 'awa.kone@exemple.ci',
            status: 'PENDING',
            signedAt: null,
            inviteStatus: 'SENT',
            otpAttempts: 0
          }
        ]
      },
      { inPersonTokens: new Map() }
    );
    const json = JSON.stringify(dto);
    expect(json).not.toContain('awa.kone@exemple.ci');
    expect(json).not.toMatch(/tokenHash|otpHash|ipHash|FileKey"/);
    expect(dto.hasSignedFile).toBe(false);
  });
});

describe('journaux : le jeton du chemin est masqué', () => {
  it('masque le jeton des routes publiques de signature', () => {
    const token = generateToken();
    expect(maskSensitivePath(`/api/public/signatures/${token}`)).toBe('/api/public/signatures/[masqué]');
    expect(maskSensitivePath(`/api/public/signatures/${token}/file`)).toBe('/api/public/signatures/[masqué]/file');
    expect(maskRequestUrl(`/api/public/signatures/${token}/otp`)).not.toContain(token);
    expect(maskSensitivePath('/api/signatures/abc')).toBe('/api/signatures/abc');
  });
});
