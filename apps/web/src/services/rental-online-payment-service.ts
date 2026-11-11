import apiClient from '../utils/api-client';
import type {
  CreateCollectionPayoutBody,
  CreateCollectionPayoutResultDto,
  ListCollectionPayoutsQuery,
  ListOnlinePaymentsQuery,
  OnlinePaymentAvailabilityDto,
  RentalCollectionAccountDto,
  RentalCollectionPayoutDto,
  RentalOnlinePaginated,
  RentalOnlinePaymentDetailDto,
  RentalOnlinePaymentRowDto,
  RentalOnlinePaymentsSummaryDto,
  ResolveOnlinePaymentBody,
  ResolveOnlinePaymentResultDto,
  VerifyOnlinePaymentResultDto
} from '../types/rental-online-payment';

/**
 * Paiement en ligne du locatif, côté gestionnaire (spec 049 §2).
 * Contrat : `specs/049-locatif-paiement-parite-syndic/contracts.md` §2.1 à 2.8.
 * Enveloppe `{ success, data }`, préfixe `/tenants/:tenantId/rental/online-payments`.
 */

type Envelope<T> = { success: boolean; data: T };

const base = (tenantId: string) => `/tenants/${tenantId}/rental/online-payments`;

/** 2.1 : liste paginée côté serveur. */
export async function listRentalOnlinePayments(
  tenantId: string,
  query: ListOnlinePaymentsQuery = {}
): Promise<RentalOnlinePaginated<RentalOnlinePaymentRowDto>> {
  const response = await apiClient.get<Envelope<RentalOnlinePaginated<RentalOnlinePaymentRowDto>>>(base(tenantId), {
    params: {
      status: query.status || undefined,
      reviewKind: query.reviewKind || undefined,
      search: query.search?.trim() || undefined,
      leaseId: query.leaseId || undefined,
      from: query.from || undefined,
      to: query.to || undefined,
      page: query.page,
      pageSize: query.pageSize
    }
  });
  return response.data.data;
}

/** 2.2 : compteurs de toute l'agence. */
export async function getRentalOnlinePaymentsSummary(tenantId: string): Promise<RentalOnlinePaymentsSummaryDto> {
  const response = await apiClient.get<Envelope<RentalOnlinePaymentsSummaryDto>>(`${base(tenantId)}/summary`);
  return response.data.data;
}

/** 2.8 : le paiement en ligne est-il utilisable pour l'agence ? */
export async function getRentalOnlinePaymentAvailability(tenantId: string): Promise<OnlinePaymentAvailabilityDto> {
  const response = await apiClient.get<Envelope<OnlinePaymentAvailabilityDto>>(`${base(tenantId)}/availability`);
  return response.data.data;
}

/** 2.3 : détail d'une tentative (journal compris). */
export async function getRentalOnlinePayment(
  tenantId: string,
  checkoutId: string
): Promise<RentalOnlinePaymentDetailDto> {
  const response = await apiClient.get<Envelope<RentalOnlinePaymentDetailDto>>(`${base(tenantId)}/${checkoutId}`);
  return response.data.data;
}

/** 2.4 : interroge la passerelle (RENTAL_PAYMENTS_ALLOCATE). */
export async function verifyRentalOnlinePayment(
  tenantId: string,
  checkoutId: string
): Promise<VerifyOnlinePaymentResultDto> {
  const response = await apiClient.post<Envelope<VerifyOnlinePaymentResultDto>>(
    `${base(tenantId)}/${checkoutId}/verify`
  );
  return response.data.data;
}

/** 2.5 : tranche une tentative en REVIEW (RENTAL_PAYMENTS_ALLOCATE). */
export async function resolveRentalOnlinePayment(
  tenantId: string,
  checkoutId: string,
  body: ResolveOnlinePaymentBody
): Promise<ResolveOnlinePaymentResultDto> {
  const response = await apiClient.post<Envelope<ResolveOnlinePaymentResultDto>>(
    `${base(tenantId)}/${checkoutId}/resolve`,
    body
  );
  return response.data.data;
}

/** 2.7 : solde du compte de collecte (5525) et solde PaySecureHub. */
export async function getRentalCollectionAccount(tenantId: string): Promise<RentalCollectionAccountDto> {
  const response = await apiClient.get<Envelope<RentalCollectionAccountDto>>(`${base(tenantId)}/collection-account`);
  return response.data.data;
}

/** 2.7 : historique des virements du 5525. */
export async function listRentalCollectionPayouts(
  tenantId: string,
  query: ListCollectionPayoutsQuery = {}
): Promise<RentalOnlinePaginated<RentalCollectionPayoutDto>> {
  const response = await apiClient.get<Envelope<RentalOnlinePaginated<RentalCollectionPayoutDto>>>(
    `${base(tenantId)}/collection-account/payouts`,
    { params: { page: query.page, pageSize: query.pageSize } }
  );
  return response.data.data;
}

/** 2.7 : reverse le solde du 5525 vers un compte de trésorerie (RENTAL_PAYMENTS_ALLOCATE). */
export async function createRentalCollectionPayout(
  tenantId: string,
  body: CreateCollectionPayoutBody
): Promise<CreateCollectionPayoutResultDto> {
  const response = await apiClient.post<Envelope<CreateCollectionPayoutResultDto>>(
    `${base(tenantId)}/collection-account/payouts`,
    body
  );
  return response.data.data;
}
