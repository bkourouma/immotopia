/**
 * Identité de l'agence pour ses documents (route /document-identity) : fiche
 * (raison sociale, adresse, contacts), logo public, signature et cachet privés.
 *
 * - logo : fichier public de la fiche agence
 *   `uploads/properties/agency-logos/<tenantId>/<fichier>` + `Tenant.logoUrl`
 *   (comme `POST /tenants/:tenantId/logo`) ;
 * - signature et cachet : stockage privé `branding/<tenantId>/agence/…`
 *   (`saveBrandingImage`) + `Tenant.documentSignaturePath` / `documentStampPath`.
 *
 * IDEMPOTENT par champ : une valeur déjà présente n'est jamais remplacée (le
 * Syndic et l'Opérateur intégré ont déjà signature et cachet). Les identités
 * d'agences mandantes du Syndic ne sont pas concernées.
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import type { Prisma } from '@prisma/client';
import { drawLogo, drawSignature, drawStamp } from './syndic-extras-images';
import { writeUpload } from './seed-files';
import type { HistoryContext } from './types';

interface AgencyIdentity {
  legalName: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  color: string;
  colorIndex: number;
  towers: number;
}

const IDENTITIES: Record<string, AgencyIdentity> = {
  AGENCE: {
    legalName: 'Cabinet Horizon Immobilier SARL',
    address: 'Cocody Riviera 2, boulevard Latrille, immeuble Les Acacias, 2e étage',
    city: 'Abidjan',
    phone: '+225 27 22 44 18 30',
    email: 'contact@horizon-immobilier.test',
    website: 'https://www.horizon-immobilier.test',
    color: '#14536e',
    colorIndex: 0,
    towers: 3
  },
  SYNDIC: {
    legalName: 'Syndic Conseil Abidjan SARL',
    address: 'Plateau, avenue Noguès, immeuble Le Diamant, 5e étage',
    city: 'Abidjan',
    phone: '+225 27 20 32 61 74',
    email: 'gestion@syndic-conseil.test',
    website: 'https://www.syndic-conseil.test',
    color: '#166534',
    colorIndex: 2,
    towers: 4
  },
  PROMOTEUR: {
    legalName: 'Atlantis Promotion Immobilière SA',
    address: 'Marcory Zone 4, rue du Canal, résidence Les Palmiers, bureau 12',
    city: 'Abidjan',
    phone: '+225 27 21 26 55 09',
    email: 'programmes@atlantis-promotion.test',
    website: 'https://www.atlantis-promotion.test',
    color: '#993c1d',
    colorIndex: 1,
    towers: 4
  },
  INTEGRE: {
    legalName: 'Groupe Immobilier Ébène SA',
    address: 'Plateau, boulevard de la République, tour Ébène, 8e étage',
    city: 'Abidjan',
    phone: '+225 27 20 21 88 40',
    email: 'direction@groupe-ebene.test',
    website: 'https://www.groupe-ebene.test',
    color: '#581c87',
    colorIndex: 3,
    towers: 3
  },
  PATRIMOINE_ESSENTIEL: {
    legalName: 'Famille Kouassi — Gestion patrimoniale',
    address: 'Cocody Angré 8e tranche, rue des Jasmins, villa 14',
    city: 'Abidjan',
    phone: '+225 07 48 22 61 30',
    email: 'patrimoine@famille-kouassi.test',
    website: 'https://www.famille-kouassi.test',
    color: '#1e40af',
    colorIndex: 4,
    towers: 2
  },
  PATRIMOINE_PRO: {
    legalName: 'Kouassi Patrimoine et Holding SARL',
    address: 'Plateau, rue du Commerce, immeuble Sciam, 3e étage',
    city: 'Abidjan',
    phone: '+225 27 20 22 74 15',
    email: 'direction@kouassi-patrimoine.test',
    website: 'https://www.kouassi-patrimoine.test',
    color: '#92400e',
    colorIndex: 5,
    towers: 3
  }
};

export async function seedAgencyIdentity(ctx: HistoryContext, pack: string): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  const identity = IDENTITIES[pack];
  if (!identity) return;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      legalName: true,
      address: true,
      city: true,
      country: true,
      contactEmail: true,
      contactPhone: true,
      website: true,
      brandingPrimaryColor: true,
      logoUrl: true,
      documentSignaturePath: true,
      documentStampPath: true
    }
  });
  if (!tenant) return;

  const data: Prisma.TenantUpdateInput = {};
  const done: string[] = [];
  const fill = <K extends keyof typeof tenant>(field: K, value: string): void => {
    if (!tenant[field]) {
      (data as Record<string, unknown>)[field as string] = value;
      done.push(String(field));
    }
  };
  fill('legalName', identity.legalName);
  fill('address', identity.address);
  fill('city', identity.city);
  fill('country', "Côte d'Ivoire");
  fill('contactEmail', identity.email);
  fill('contactPhone', identity.phone);
  fill('website', identity.website);
  fill('brandingPrimaryColor', identity.color);

  if (!tenant.logoUrl) {
    const file = await writeUpload(
      ['properties', 'agency-logos', tenantId],
      'logo-agence.png',
      drawLogo(identity.colorIndex, identity.towers)
    );
    data.logoUrl = file.fileUrl;
    done.push('logo');
  }
  if (!tenant.documentSignaturePath || !tenant.documentStampPath) {
    const { saveBrandingImage } = await import('../../../src/lib/documents/branding-storage');
    if (!tenant.documentSignaturePath) {
      data.documentSignaturePath = await saveBrandingImage(
        tenantId,
        ['agence'],
        'signature',
        drawSignature(identity.colorIndex + 1),
        'png'
      );
      done.push('signature');
    }
    if (!tenant.documentStampPath) {
      data.documentStampPath = await saveBrandingImage(
        tenantId,
        ['agence'],
        'cachet',
        drawStamp(identity.colorIndex),
        'png'
      );
      done.push('cachet');
    }
  }
  // Réparation : clé enregistrée mais fichier absent du disque (dépôt d'images perdu ou recréé).
  const repaired = await repairMissingImages(ctx, tenant, identity);
  if (done.length === 0 && repaired === 0) {
    log('core-communication identité : déjà complète.');
    return;
  }
  if (done.length > 0) await prisma.tenant.update({ where: { id: tenantId }, data });
  log(
    `core-communication identité : ${done.join(', ')}${repaired > 0 ? ` (+ ${repaired} fichier(s) restauré(s))` : ''}.`
  );
}

async function repairMissingImages(
  ctx: HistoryContext,
  tenant: { documentSignaturePath: string | null; documentStampPath: string | null },
  identity: AgencyIdentity
): Promise<number> {
  const { tenantId } = ctx;
  const { resolveBrandingKey } = await import('../../../src/lib/documents/branding-storage');
  let n = 0;
  const targets: Array<[string | null, Buffer]> = [
    [tenant.documentSignaturePath, drawSignature(identity.colorIndex + 1)],
    [tenant.documentStampPath, drawStamp(identity.colorIndex)]
  ];
  for (const [key, png] of targets) {
    const absolute = resolveBrandingKey(tenantId, key);
    if (!absolute) continue;
    try {
      await fs.access(absolute);
    } catch {
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, png);
      n += 1;
    }
  }
  return n;
}
