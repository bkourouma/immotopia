import apiClient from '../utils/api-client';

export interface SyndicPaymentAllocation {
  id: string;
  amount: number | string;
  payment: { paidAt: string; method: string | null };
  chargeCall: {
    id: string;
    period: string;
    lotId: string;
    lot: {
      lotNumber: string;
      lotType: string;
      generalShares: number;
      property: { title: string } | null;
      owner: { firstName: string | null; lastName: string | null; email: string | null } | null;
    };
  };
}

export interface SyndicPaymentsQuery {
  page?: number;
  limit?: number;
  search?: string;
  method?: string;
  paidFrom?: string;
  paidTo?: string;
  amountMin?: number | string;
  amountMax?: number | string;
  sort?: string;
}

export interface SyndicPaymentsPage {
  items: SyndicPaymentAllocation[];
  methods: string[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function listSyndicPaymentsPage(
  tenantId: string,
  syndicId: string,
  query: SyndicPaymentsQuery = {}
): Promise<SyndicPaymentsPage> {
  const response = await apiClient.get<{
    success: boolean;
    data: SyndicPaymentAllocation[];
    methods: string[];
    pagination: SyndicPaymentsPage['pagination'];
  }>(`/tenants/${tenantId}/syndics/${syndicId}/paiements`, { params: query, noRetry: true });
  return { items: response.data.data, methods: response.data.methods, pagination: response.data.pagination };
}
