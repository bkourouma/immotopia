import apiClient from '../utils/api-client';

/**
 * Comptes de réception de l'agence et de la copropriété (spec 048, lot Q).
 * Contrat : `specs/048-paiement-instantane-pispi/contracts-lot-q.md` §2 et §3.
 * Les types sont recopiés de l'API, jamais importés.
 *
 * ImmoTopia ne génère aucun QR et ne préremplit aucun montant : l'image du QR
 * est celle que l'agence a téléversée, lue par une route authentifiée (blob).
 */

/** Lecture côté portails (locataire, copropriétaire). */
export interface ReceivingAccountPublic {
  id: string;
  institution: string;
  scannableWith: string | null;
  alias: string | null;
  holderName: string;
  instructions: string | null;
  hasQr: boolean;
  /** Route authentifiée de l'image, préfixe `/api` compris. */
  qrPath: string | null;
}

/** Lecture côté gestion. */
export interface ReceivingAccountAdmin extends ReceivingAccountPublic {
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
}

export const RECEIVING_ACCOUNT_LIMIT = 10;
export const RECEIVING_ACCOUNT_QR_MAX_BYTES = 2 * 1024 * 1024;
export const RECEIVING_ACCOUNT_QR_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export interface ReceivingAccountInput {
  institution: string;
  scannableWith: string | null;
  alias: string | null;
  holderName: string;
  instructions: string | null;
  isActive: boolean;
  sortOrder: number;
}

/** Portail copropriétaire : la copropriété du compte, pour regrouper l'affichage. */
export interface CoOwnerReceivingAccountPublic extends ReceivingAccountPublic {
  syndicateId: string;
}

export interface ReceivingAccountWriteOptions {
  /** Image du QR téléversée (champ `qr`). */
  qrFile?: File | null;
  /** Modification seulement : retire l'image existante. */
  removeQr?: boolean;
  /**
   * Modification seulement : `updatedAt` de la ligne lue. L'API refuse (409)
   * si le compte a changé depuis, sans rien écrire.
   */
  expectedUpdatedAt?: string | null;
}

/** Où vivent les comptes : réglages de l'agence ou une copropriété. */
export type ReceivingAccountScope =
  { kind: 'agency'; tenantId: string } | { kind: 'syndicate'; tenantId: string; syndicId: string };

type Envelope<T> = { success: boolean; data: T };

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

function base(scope: ReceivingAccountScope): string {
  return scope.kind === 'agency'
    ? `/tenants/${scope.tenantId}/settings/receiving-accounts`
    : `/tenants/${scope.tenantId}/syndics/${scope.syndicId}/receiving-accounts`;
}

const TEXT_FIELDS = ['institution', 'scannableWith', 'alias', 'holderName', 'instructions'] as const;

/**
 * Corps multipart. Seuls les champs présents dans `input` partent : une
 * modification partielle (ex. `{ isActive }`) ne touche pas aux autres champs
 * côté serveur. Un champ facultatif à `null` part en chaîne vide, qui l'efface.
 */
function toFormData(
  input: Partial<ReceivingAccountInput>,
  options: ReceivingAccountWriteOptions,
  update: boolean
): FormData {
  const form = new FormData();
  for (const field of TEXT_FIELDS) {
    const value = input[field];
    if (value !== undefined) form.append(field, value ?? '');
  }
  if (input.isActive !== undefined) form.append('isActive', String(input.isActive));
  if (input.sortOrder !== undefined) form.append('sortOrder', String(input.sortOrder));
  if (update) {
    form.append('removeQr', String(Boolean(options.removeQr)));
    if (options.expectedUpdatedAt) form.append('expectedUpdatedAt', options.expectedUpdatedAt);
  }
  if (options.qrFile) form.append('qr', options.qrFile);
  return form;
}

export async function listReceivingAccounts(scope: ReceivingAccountScope): Promise<ReceivingAccountAdmin[]> {
  const response = await apiClient.get<Envelope<ReceivingAccountAdmin[]>>(base(scope));
  return response.data.data;
}

export async function createReceivingAccount(
  scope: ReceivingAccountScope,
  input: ReceivingAccountInput,
  options: ReceivingAccountWriteOptions = {}
): Promise<ReceivingAccountAdmin> {
  const response = await apiClient.post<Envelope<ReceivingAccountAdmin>>(
    base(scope),
    toFormData(input, options, false),
    MULTIPART
  );
  return response.data.data;
}

export async function updateReceivingAccount(
  scope: ReceivingAccountScope,
  accountId: string,
  input: Partial<ReceivingAccountInput>,
  options: ReceivingAccountWriteOptions = {}
): Promise<ReceivingAccountAdmin> {
  const response = await apiClient.put<Envelope<ReceivingAccountAdmin>>(
    `${base(scope)}/${accountId}`,
    toFormData(input, options, true),
    MULTIPART
  );
  return response.data.data;
}

export async function deleteReceivingAccount(scope: ReceivingAccountScope, accountId: string): Promise<void> {
  await apiClient.delete(`${base(scope)}/${accountId}`);
}

/**
 * Image du QR par la route authentifiée (`qrPath` du DTO). Le DTO porte le
 * préfixe `/api` alors que `apiClient` l'ajoute déjà par sa base : on le retire.
 */
export async function fetchReceivingAccountQr(qrPath: string): Promise<Blob> {
  const path = qrPath.replace(/^\/api(?=\/)/, '');
  const response = await apiClient.get<Blob>(path, { responseType: 'blob' });
  return response.data;
}
