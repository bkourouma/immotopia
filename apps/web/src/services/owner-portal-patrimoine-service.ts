import apiClient from '../utils/api-client';

/**
 * Portail propriétaire — vue patrimoine (lot P5).
 *
 * Contrat figé par le coordinateur (`p5-contrat-api.md`) : montants en
 * `number`, dates en chaîne ISO, une rubrique masquée par l'agence est
 * ABSENTE de la réponse (jamais `null`, jamais `false`) — chaque champ de
 * rubrique est donc optionnel ici, et l'écran ne rend le bloc que si la clé
 * existe. Lecture seule : aucune route d'écriture.
 */

export interface PatrimoineSections {
  valuation: boolean;
  yield: boolean;
  loans: boolean;
  works: boolean;
  documents: boolean;
}

/** `GET /portal/owner/patrimoine/settings` — toujours 200, sert au menu. */
export interface PatrimoineMenuSettings {
  enabled: boolean;
  sections: PatrimoineSections;
}

export interface PatrimoineValuation {
  estimatedValue: number;
  valuatedAt: string;
  /** `null` : prix d'acquisition non renseigné — jamais 0 par défaut. */
  acquisitionCost: number | null;
  currency: string;
}

export interface PatrimoineYield {
  grossYield: number;
  netYield: number;
  /** Absent quand `sections.loans` est masqué : il révèlerait les mensualités. */
  netNetYield?: number;
  annualRent: number;
  annualExpenses: number;
}

export interface PatrimoineLoanSummary {
  count: number;
  remainingCapital: number;
}

export interface PatrimoineSummaryProperty {
  id: string;
  title: string;
  address: string;
  city: string;
  /** Quote-part d'indivision ; `null` = bien détenu en entier. */
  ownerSharePercent: number | null;
  valuation?: PatrimoineValuation | null;
  latentCapitalGain?: number | null;
  yield?: PatrimoineYield;
  loanSummary?: PatrimoineLoanSummary;
}

export interface PatrimoineSummary {
  propertyCount: number;
  currency: string;
  totalEstimatedValue?: number;
  totalLatentCapitalGain?: number | null;
  totalRemainingLoanCapital?: number;
}

/** `GET /portal/owner/patrimoine` — 404 si la vue est masquée par l'agence. */
export interface PatrimoineOverview {
  sections: PatrimoineSections;
  summary: PatrimoineSummary;
  properties: PatrimoineSummaryProperty[];
}

export interface PatrimoineValuationHistoryEntry {
  id: string;
  valuatedAt: string;
  estimatedValue: number;
  method: string;
  currency: string;
}

export interface PatrimoineLoan {
  id: string;
  lender: string;
  capitalAmount: number;
  remainingCapital: number;
  interestRate: number;
  monthlyPayment: number;
  currency: string;
  startDate: string;
  endDate: string | null;
  status: string;
}

export interface PatrimoineWork {
  id: string;
  title: string;
  description: string | null;
  status: string;
  plannedDate: string | null;
  completedDate: string | null;
  estimatedCost: number | null;
  actualCost: number | null;
  currency: string;
}

export interface PatrimoineDocument {
  id: string;
  documentType: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  expirationDate: string | null;
  createdAt: string;
  /** Route authentifiée du fichier (relative à l'API) ; jamais un chemin disque. */
  downloadPath: string;
}

/** `GET /portal/owner/patrimoine/properties/:propertyId` — 404 si masqué ou hors périmètre. */
export interface PatrimoinePropertyDetails {
  sections: PatrimoineSections;
  property: {
    id: string;
    title: string;
    address: string;
    city: string;
    ownerSharePercent: number | null;
  };
  valuation?: PatrimoineValuation | null;
  /** Historique des valorisations, sans les notes internes de l'agence. */
  valuations?: PatrimoineValuationHistoryEntry[];
  latentCapitalGain?: number | null;
  yield?: PatrimoineYield;
  loans?: PatrimoineLoan[];
  works?: PatrimoineWork[];
  documents?: PatrimoineDocument[];
}

type ApiResponse<T> = { success: boolean; data: T };

export const ownerPortalPatrimoineService = {
  getSettings: async (): Promise<PatrimoineMenuSettings> => {
    const response = await apiClient.get<ApiResponse<PatrimoineMenuSettings>>('/portal/owner/patrimoine/settings');
    return response.data.data;
  },

  getPatrimoine: async (): Promise<PatrimoineOverview> => {
    const response = await apiClient.get<ApiResponse<PatrimoineOverview>>('/portal/owner/patrimoine');
    return response.data.data;
  },

  getPropertyDetails: async (propertyId: string): Promise<PatrimoinePropertyDetails> => {
    const response = await apiClient.get<ApiResponse<PatrimoinePropertyDetails>>(
      `/portal/owner/patrimoine/properties/${encodeURIComponent(propertyId)}`
    );
    return response.data.data;
  },

  /**
   * Fichier privé (`PropertyDocument`) : jamais servi en statique. `downloadPath`
   * vient tel quel de la réponse de `getPropertyDetails` — c'est déjà une route
   * authentifiée, `api-client` y porte la session (cookie + en-tête d'agence
   * du portail).
   */
  downloadDocument: async (downloadPath: string): Promise<Blob> => {
    const response = await apiClient.get<Blob>(downloadPath, { responseType: 'blob' });
    return response.data;
  }
};
