import type { SignatureDocumentKind } from '@prisma/client';
import type { PrismaTransactionClient } from '../../../utils/database';
import type { Feature } from '../../subscription/features';

/**
 * Contrat d'une « source de document » signable (spec 044). Le noyau de la
 * signature (création, jeton, code, scellement, annulation) est le même pour tous
 * les documents ; une source dit seulement COMMENT un type de document est
 * retrouvé, figé, vérifié et marqué signé dans SON module.
 */

/** Agence et utilisateur de l'appelant (posés par `requireTenantAccess`, jamais lus du corps). */
export type SourceCtx = { tenantId: string; userId: string };

/** Ce que le noyau fige à l'envoi : le PDF (SHA-256 calculé par le noyau) et son origine. */
export type LoadedSource = {
  /** Identifiant du document dans son module (ex. RentalDocument.id), s'il y en a un. */
  documentId?: string | null;
  /** Empreinte du fichier d'origine dans son module (ex. RentalDocument.file_hash), pour `isSourceIntact`. */
  documentHash?: string | null;
  /** PDF à signer. Jamais un DOCX : la conversion est l'affaire de la source. */
  pdf: Buffer;
  /** Titre montré au signataire et dans les messages (déjà traduit). */
  title: string;
};

/** Vue de la demande transmise aux hooks (champs lus en base, jamais de secret). */
export type SourceRequestView = {
  id: string;
  tenantId: string;
  kind: SignatureDocumentKind;
  targetType: string;
  targetId: string;
  sourceDocumentId: string | null;
  sourceDocHash: string | null;
};

/** Signataire proposé par une source pour préremplir l'écran « Envoyer pour signature ». */
export type DefaultSigner = {
  /** Rôle libre (LOCATAIRE, BAILLEUR, MANDANT…) : l'API accepte tout rôle. */
  role: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  /** CrmContact.id, s'il existe (consentement WhatsApp du CRM). */
  contactId?: string | null;
};

/**
 * Levée par `onSealed` quand le document a changé depuis l'envoi (empreinte ou statut) :
 * le noyau annule alors la demande (SOURCE_CHANGED) au lieu de réessayer le scellement.
 */
export class SourceChangedError extends Error {
  constructor() {
    super('SOURCE_CHANGED');
    this.name = 'SourceChangedError';
  }
}

export type SourceCancelReason = 'USER' | 'SEND_FAILED' | 'SOURCE_CHANGED';

export interface SignatureDocumentSource {
  /** Valeur de l'enum Prisma `SignatureDocumentKind` que cette source sert. */
  readonly kind: SignatureDocumentKind;
  /** Modèle cible (`SignatureRequest.targetType`), ex. `RentalLease`. */
  readonly targetType: string;
  /**
   * SG-R1 : vrai si la valeur juridique exige un prestataire (jamais la signature
   * interne). Le noyau refuse alors la création avec un message clair tant que le
   * fournisseur actif est `internal` ou `log`.
   */
  readonly providerRequired?: boolean;
  /** Clé RBAC qui autorise à LIRE (liste, détail, fichiers) les demandes de ce type. */
  readonly viewPermission: string;
  /** Clé RBAC qui autorise à CRÉER, annuler et relancer les demandes de ce type. */
  readonly editPermission: string;
  /** Fonctionnalité d'abonnement exigée (lib/subscription/features.ts), ex. RENTAL, SALES, CRM. */
  readonly feature: Feature;

  /**
   * La cible existe, appartient à l'agence (`assertBelongsToTenant`) et son statut
   * autorise la signature. Lève `NotFoundError` (même erreur qu'une cible d'une
   * autre agence) ou `BadRequestError`. Appelée avant toute réservation de quota.
   */
  assertTarget(ctx: SourceCtx, targetId: string): Promise<void>;

  /**
   * Retrouve le document à signer et le rend en PDF. Refuse clairement (400) s'il
   * n'existe pas encore. Appelée APRÈS la réservation du quota, qui est restituée
   * sur toute erreur.
   */
  loadSource(ctx: SourceCtx, targetId: string): Promise<LoadedSource>;

  /**
   * Le document source est-il encore celui qui a été envoyé (SG-R2) ? Comparaison à
   * l'état COURANT dans son module (statut, empreinte `documentHash`…). Faux : la
   * demande est annulée (`SOURCE_CHANGED`) et le signataire reçoit le 404 uniforme.
   * Le noyau contrôle déjà le SHA-256 du PDF figé ; ici, il s'agit du module d'origine.
   */
  isSourceIntact(request: SourceRequestView): Promise<boolean>;

  /**
   * Marque la cible « signée » dans son module, DANS la transaction du scellement
   * (atomique avec le passage à COMPLETED). Doit être idempotente et filtrer par
   * `tenantId`.
   */
  onSealed(tx: PrismaTransactionClient, request: SourceRequestView, now: Date): Promise<void>;

  /**
   * Optionnel : signataires proposés pour la cible (nom, rôle, e-mail, contactId),
   * servis par `GET /api/signatures/targets/:kind/:targetId/context` pour que le web
   * préremplisse sans recalculer. Toutes les lectures filtrent par `ctx.tenantId`.
   */
  defaultSigners?(ctx: SourceCtx, targetId: string): Promise<DefaultSigner[]>;

  /**
   * Optionnel, pour un document généré à la volée (sans RentalDocument) : empreinte
   * des DONNÉES qui alimentent le PDF, à l'instant T. Le noyau la stocke dans
   * `sourceDocHash` à l'envoi si `loadSource` ne rend pas de `documentHash` ; la
   * source la recalcule dans `isSourceIntact` pour détecter un changement.
   */
  snapshotHash?(ctx: SourceCtx, targetId: string): Promise<string | null>;

  /** Optionnel : effet de l'annulation sur la cible, dans la transaction d'annulation. */
  onCancel?(
    tx: PrismaTransactionClient,
    request: SourceRequestView,
    reason: SourceCancelReason,
    now: Date
  ): Promise<void>;
}
