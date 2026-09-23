import { InspectionDeduction, InspectionMeters, InspectionRoom } from '../../../services/lease-inspections-service';

/**
 * Brouillon local d'un état des lieux — protège la saisie d'une visite contre
 * une coupure réseau ou un onglet fermé par erreur.
 *
 * Enregistré dans `localStorage`, une clé par état des lieux, à chaque
 * modification. Tout accès à `localStorage` est protégé par un `try/catch` :
 * un mode navigation privée ou un quota dépassé ne doit jamais faire échouer
 * la saisie elle-même, seulement priver l'utilisateur du filet de secours.
 */

export interface InspectionLocalDraft {
  savedAt: string;
  inspectionDate: string;
  rooms: InspectionRoom[];
  meters: InspectionMeters;
  keysCount: number | null;
  generalComment: string;
  tenantPresent: boolean;
  tenantSignatoryName: string;
  agentSignatoryName: string;
  deductions: InspectionDeduction[];
}

function storageKey(inspectionId: string): string {
  return `immotopia:inspection-draft:${inspectionId}`;
}

export function saveLocalDraft(inspectionId: string, draft: Omit<InspectionLocalDraft, 'savedAt'>): void {
  try {
    const payload: InspectionLocalDraft = { ...draft, savedAt: new Date().toISOString() };
    window.localStorage.setItem(storageKey(inspectionId), JSON.stringify(payload));
  } catch {
    // Stockage indisponible (navigation privée, quota) : la saisie continue,
    // simplement sans filet de secours.
  }
}

export function loadLocalDraft(inspectionId: string): InspectionLocalDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(inspectionId));
    if (!raw) return null;
    return JSON.parse(raw) as InspectionLocalDraft;
  } catch {
    return null;
  }
}

export function clearLocalDraft(inspectionId: string): void {
  try {
    window.localStorage.removeItem(storageKey(inspectionId));
  } catch {
    // Rien à faire : au pire la copie locale obsolète reste, sans conséquence.
  }
}
