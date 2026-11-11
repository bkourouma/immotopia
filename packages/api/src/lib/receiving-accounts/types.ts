/**
 * Formes d'échange des comptes de réception (spec 048, lot Q, contrat §2).
 * Aucune de ces formes ne porte `qrFileUrl`, `qrSha256` ni un chemin disque.
 */

/** Cible d'un compte : l'agence (loyers) ou une copropriété (charges). */
export type ReceivingAccountTarget =
  { scope: 'AGENCY'; syndicateId: null } | { scope: 'SYNDICATE'; syndicateId: string };

/** Lecture portails. */
export interface ReceivingAccountPublic {
  id: string;
  institution: string;
  scannableWith: string | null;
  alias: string | null;
  holderName: string;
  instructions: string | null;
  hasQr: boolean;
  qrPath: string | null;
}

/** Portail copropriétaire : la copropriété du compte, pour regrouper l'affichage. */
export interface CoOwnerReceivingAccountPublic extends ReceivingAccountPublic {
  syndicateId: string;
}

/** Gestion (agence, copropriété). */
export interface ReceivingAccountAdmin extends ReceivingAccountPublic {
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
}

/** Fichier reçu par multer (`qr`). */
export type UploadedQr = { buffer: Buffer } | null | undefined;
