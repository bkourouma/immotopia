/**
 * Atelier — fausse API du lot 041 : l'inventaire de chantier par WhatsApp
 * (onglet WhatsApp, Comptages terrain, visualiseur de preuve).
 *
 * Même modèle que `finance-mock-stock-inventaire.ts` : renvoie `null` quand
 * l'URL ne le concerne pas, `mock-api.ts` passe alors au gestionnaire suivant.
 *
 * **Non câblé dans `mock-api.ts` ni dans `Atelier.tsx`** (propriétaire : lot
 * 040, WEB-3). Pour l'y ajouter :
 *
 * ```ts
 * import { repondreStockWhatsapp, repondreStockWhatsappFieldContext } from './finance-mock-stock-whatsapp';
 * // dans la liste `for (const repondre of [...])`, AVANT tout gestionnaire
 * // générique de `/finance/stock/…` :
 * repondreStockWhatsapp,
 * // seulement si aucun mock du lot 040 ne répond déjà à `/stock/field-context` :
 * repondreStockWhatsappFieldContext
 * ```
 *
 * Scènes proposées :
 *
 * - « WhatsApp, administrateur » : `tenant/:tenantId/finance/stock/whatsapp`,
 *   passerelle `log` (simulateur présent), quota à 83 % (ton `warning`), trois
 *   inscriptions (en attente, active avec un chantier devenu inéligible,
 *   révoquée) ;
 * - « Comptages terrain, comptable pendant un comptage » :
 *   `tenant/:tenantId/finance/stock/comptages-terrain?lieu=lieu-riviera-02` —
 *   le lieu de la Riviera est en comptage : quantité théorique et valeur
 *   masquées (« Comptage en cours »), bandeau de l'aveugle, rappel des non
 *   comptés (inventaire WhatsApp clos), une photo retirée.
 *
 * **Limites assumées.** `mock-api.ts` route par le CHEMIN seul, sans la
 * méthode ni la requête : les écritures (inscription, révocation, retrait de
 * photo, simulateur) rendent la forme de la lecture voisine. La photo d'une
 * capture (`…/file`) n'est pas simulée : l'atelier ne sait rendre que du JSON,
 * le visualiseur montre alors « La photo n'a pas pu être chargée. ».
 *
 * Aucun numéro de téléphone réel : les numéros sont factices et déjà masqués
 * comme le serveur les rend.
 */

import type {
  CaptureView,
  ConversationMessage,
  FieldCountRow,
  RegistrationView,
  RegistrationWithCode,
  SessionView,
  WhatsappOverview
} from '../../types/finance-stock-whatsapp-types';
import type { StockFieldContext } from '../../types/finance-stock-controle-types';
import type { Scenario } from './mock-api';

const MAGASIN = 'lieu-magasin-01';
const DEPOT_RIVIERA = 'lieu-riviera-02';
const CHANTIER_RIVIERA = 'chantier-riviera';
const CHANTIER_BINGERVILLE = 'chantier-bingerville';
const CIMENT = 'article-ciment-01';
const FER = 'article-fer-02';
const SABLE = 'article-sable-03';
const COMPTAGE_WHATSAPP = 'comptage-whatsapp-03';
const CAPTURE_CIMENT = 'capture-ciment-01';
const CAPTURE_FER = 'capture-fer-02';
const SESSION = 'session-riviera-01';

const OVERVIEW: WhatsappOverview = {
  transport: 'log',
  gatewayReady: true,
  botNumber: '+225 01 00 00 00 00',
  simulatorAvailable: true,
  vision: { provider: 'fake', model: 'fake-vision-1' },
  quota: { month: '2026-10', used: 415, limit: 500, source: 'OPTION', blocks: 1 },
  measures: {
    photosAnalyzed: 415,
    medianSecondsToConfirm: 38,
    acceptedFirstTimeRate: 0.9,
    proofCoverageRate: 0.97,
    unreadableRate: 0.04,
    unrecognizedRate: 0.02,
    failedRate: 0.01
  }
};

const REGISTRATIONS: RegistrationView[] = [
  {
    id: 'inscription-koffi',
    userId: 'user-koffi',
    userLabel: 'Koffi Yao',
    phoneE164: '+2250700000001',
    phoneMasked: '+225 07 •• •• •• 01',
    status: 'ACTIVE',
    activatedAt: '2026-09-28T08:12:00.000Z',
    lastInboundAt: '2026-10-04T09:41:00.000Z',
    access: { ok: true, reason: null },
    sites: [
      { siteId: CHANTIER_RIVIERA, name: 'Villa de la Riviera', locationId: DEPOT_RIVIERA, eligible: true },
      {
        siteId: CHANTIER_BINGERVILLE,
        name: 'Immeuble de Bingerville',
        locationId: null,
        eligible: false,
        ineligibleReason: 'CLOSED'
      }
    ],
    openSessionId: SESSION,
    createdAt: '2026-09-27T16:00:00.000Z'
  },
  {
    id: 'inscription-awa',
    userId: 'user-awa',
    userLabel: 'Awa Traoré',
    phoneE164: '+2250500000002',
    phoneMasked: '+225 05 •• •• •• 02',
    status: 'PENDING_ACTIVATION',
    activationExpiresAt: '2026-10-07T10:00:00.000Z',
    activationAttemptsLeft: 5,
    access: { ok: true, reason: null },
    sites: [{ siteId: CHANTIER_RIVIERA, name: 'Villa de la Riviera', locationId: DEPOT_RIVIERA, eligible: true }],
    createdAt: '2026-10-04T10:00:00.000Z'
  },
  {
    id: 'inscription-moussa',
    userId: 'user-moussa',
    userLabel: 'Moussa Diallo',
    phoneE164: '+2250100000003',
    phoneMasked: '+225 01 •• •• •• 03',
    status: 'REVOKED',
    revokedAt: '2026-09-30T12:00:00.000Z',
    revokeReason: 'Fin de mission',
    access: { ok: false, reason: 'ROLE_MISSING' },
    sites: [],
    createdAt: '2026-09-01T09:00:00.000Z'
  }
];

const WITH_CODE: RegistrationWithCode = {
  ...REGISTRATIONS[1],
  activationCode: '482913',
  botNumber: OVERVIEW.botNumber ?? null
};

const FIELD_COUNTS: FieldCountRow[] = [
  {
    locationId: DEPOT_RIVIERA,
    locationLabel: 'Dépôt de la Villa Riviera',
    siteId: CHANTIER_RIVIERA,
    siteName: 'Villa de la Riviera',
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    unit: 'sac',
    // Lieu en comptage : le serveur masque quantité ET valeur.
    theoreticalQuantity: null,
    theoreticalValue: null,
    averageUnitCost: null,
    lastCount: {
      countId: COMPTAGE_WHATSAPP,
      countStatus: 'COUNTED',
      countSource: 'WHATSAPP',
      countedQuantity: 60,
      countedAtServer: '2026-10-04T09:40:12.000Z',
      countedByLabel: 'Koffi Yao',
      captureId: CAPTURE_CIMENT,
      hasPhoto: true,
      outcome: 'ACCEPTED'
    }
  },
  {
    locationId: DEPOT_RIVIERA,
    locationLabel: 'Dépôt de la Villa Riviera',
    siteId: CHANTIER_RIVIERA,
    siteName: 'Villa de la Riviera',
    itemId: FER,
    itemReference: 'FER-12',
    itemLabel: 'Fer à béton HA 12',
    unit: 'barre',
    theoreticalQuantity: null,
    theoreticalValue: null,
    averageUnitCost: null,
    lastCount: {
      countId: COMPTAGE_WHATSAPP,
      countStatus: 'COUNTED',
      countSource: 'WHATSAPP',
      countedQuantity: 118,
      countedAtServer: '2026-10-04T09:44:50.000Z',
      countedByLabel: 'Koffi Yao',
      captureId: CAPTURE_FER,
      hasPhoto: false,
      outcome: 'CORRECTED'
    }
  },
  {
    locationId: DEPOT_RIVIERA,
    locationLabel: 'Dépôt de la Villa Riviera',
    siteId: CHANTIER_RIVIERA,
    siteName: 'Villa de la Riviera',
    itemId: SABLE,
    itemReference: 'SAB-00',
    itemLabel: 'Sable lavé',
    unit: 'm³',
    theoreticalQuantity: null,
    theoreticalValue: null,
    averageUnitCost: null,
    lastCount: {
      countId: COMPTAGE_WHATSAPP,
      countStatus: 'COUNTED',
      countSource: 'WHATSAPP',
      countedQuantity: null,
      countedAtServer: '2026-10-04T10:02:00.000Z',
      countedByLabel: null,
      captureId: null,
      hasPhoto: false,
      outcome: null
    }
  },
  {
    locationId: MAGASIN,
    locationLabel: "Magasin central d'Angré",
    siteId: null,
    siteName: null,
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    unit: 'sac',
    theoreticalQuantity: 340,
    theoreticalValue: 1_870_000,
    averageUnitCost: 5_500,
    lastCount: {
      countId: 'comptage-valide-02',
      countStatus: 'VALIDATED',
      countSource: 'WEB',
      countedQuantity: 338,
      countedAtServer: '2026-09-19T11:00:00.000Z',
      countedByLabel: 'Fatou Koné',
      captureId: null,
      hasPhoto: false,
      outcome: null
    }
  }
];

const CAPTURE: CaptureView = {
  id: CAPTURE_CIMENT,
  receivedAt: '2026-10-04T09:39:31.000Z',
  outcome: 'ACCEPTED',
  via: 'SIMULATOR',
  siteName: 'Villa de la Riviera',
  locationId: DEPOT_RIVIERA,
  itemId: CIMENT,
  itemLabel: 'Ciment CPJ 42,5',
  itemReference: 'CIM-42',
  unit: 'sac',
  proposedTotal: 60,
  confirmedQuantity: 60,
  chefLabel: 'Koffi Yao',
  countId: COMPTAGE_WHATSAPP,
  countStatus: 'COUNTED',
  hasPhoto: true,
  sha256: '3fa9b2c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6ec21e',
  mimeType: 'image/jpeg',
  sizeBytes: 812_344,
  itemImposed: false,
  lineQuantityAfter: 60,
  mergeMode: null,
  confirmedAt: '2026-10-04T09:40:12.000Z',
  sessionId: SESSION,
  analysis: {
    quality: 'OK',
    itemId: CIMENT,
    itemConfidence: 0.93,
    visibleUnits: 12,
    layers: 5,
    columns: 4,
    depthRows: 3,
    proposedTotal: 60,
    confidence: 0.86,
    method: 'SACKS_STACKED',
    explanation: 'Sacs empilés sur 5 couches de 4 colonnes, 3 rangées en profondeur.'
  },
  vision: { provider: 'fake', model: 'fake-vision-1', analysisMs: 2_400, failureReason: null },
  photoRemoved: null,
  canRemovePhoto: true,
  canReadConversation: true
};

const SESSIONS: SessionView[] = [
  {
    id: SESSION,
    registrationId: 'inscription-koffi',
    chefLabel: 'Koffi Yao',
    state: 'READY',
    siteName: 'Villa de la Riviera',
    countId: COMPTAGE_WHATSAPP,
    openedAt: '2026-10-04T09:35:00.000Z',
    lastInboundAt: '2026-10-04T09:41:00.000Z',
    capturesCount: 2
  }
];

const MESSAGES: ConversationMessage[] = [
  { id: 'm1', direction: 'INBOUND', kind: 'TEXT', text: 'Bonjour', createdAt: '2026-10-04T09:35:00.000Z' },
  {
    id: 'm2',
    direction: 'OUTBOUND',
    kind: 'BUTTONS',
    text: 'Bonjour Koffi. Sur quel chantier comptez-vous ?',
    interactive: [{ id: `site:${CHANTIER_RIVIERA}`, title: 'Villa de la Riviera' }],
    createdAt: '2026-10-04T09:35:01.000Z'
  },
  {
    id: 'm3',
    direction: 'INBOUND',
    kind: 'REPLY',
    interactive: [{ id: `site:${CHANTIER_RIVIERA}`, title: 'Villa de la Riviera' }],
    createdAt: '2026-10-04T09:35:20.000Z'
  },
  {
    id: 'm4',
    direction: 'INBOUND',
    kind: 'IMAGE',
    captureId: CAPTURE_CIMENT,
    createdAt: '2026-10-04T09:39:31.000Z'
  },
  {
    id: 'm5',
    direction: 'OUTBOUND',
    kind: 'BUTTONS',
    text: 'Ciment CPJ 42,5 : je compte 60 sacs. Est-ce correct ?',
    captureId: CAPTURE_CIMENT,
    interactive: [
      { id: 'confirm:yes', title: 'Oui' },
      { id: 'confirm:fix', title: 'Corriger' },
      { id: 'confirm:cancel', title: 'Annuler' }
    ],
    createdAt: '2026-10-04T09:39:35.000Z'
  }
];

/** Contexte terrain minimal (lot 040) pour les deux scènes : comptable, lieu de la Riviera en comptage. */
const FIELD_CONTEXT: Partial<StockFieldContext> = {
  locations: [],
  sites: [
    {
      id: CHANTIER_RIVIERA,
      name: 'Villa de la Riviera',
      status: 'IN_PROGRESS',
      closed: false,
      stockEnabled: true,
      locationId: DEPOT_RIVIERA
    }
  ],
  items: [
    {
      id: CIMENT,
      reference: 'CIM-42',
      label: 'Ciment CPJ 42,5',
      unit: 'sac',
      category: null,
      defaultCostCategoryId: null
    },
    {
      id: FER,
      reference: 'FER-12',
      label: 'Fer à béton HA 12',
      unit: 'barre',
      category: null,
      defaultCostCategoryId: null
    },
    { id: SABLE, reference: 'SAB-00', label: 'Sable lavé', unit: 'm³', category: null, defaultCostCategoryId: null }
  ],
  abilities: {
    canReceive: true,
    canIssue: true,
    canTransfer: true,
    canCount: true,
    canValidateCount: false,
    canDispose: true,
    canManageTakers: false,
    valuesVisible: true,
    canViewAlerts: true,
    canManageSettings: true
  }
};

const META = { valuesVisible: true, blindLocationIds: [DEPOT_RIVIERA], nextCursor: null };

export function repondreStockWhatsapp(chemin: string, scenario: Scenario): unknown | null {
  const racine = /\/tenants\/[^/]+\/finance\/stock\/whatsapp(\/.*)?$/.exec(chemin);
  if (!racine) return null;
  const reste = racine[1] ?? '';
  const vide = scenario === 'vide';

  if (reste === '/overview') return { success: true, data: OVERVIEW };
  if (reste === '/registrations') return { success: true, data: vide ? [] : REGISTRATIONS };
  if (/^\/registrations\/[^/]+\/regenerate-code$/.test(reste)) return { success: true, data: WITH_CODE };
  if (/^\/registrations\/[^/]+(\/revoke)?$/.test(reste)) return { success: true, data: REGISTRATIONS[0] };
  if (reste === '/eligible-members') {
    return {
      success: true,
      data: [
        { userId: 'user-koffi', label: 'Koffi Yao', registered: true },
        { userId: 'user-ibrahim', label: 'Ibrahim Ouattara', registered: false }
      ]
    };
  }
  if (reste === '/eligible-sites') {
    return { success: true, data: REGISTRATIONS[0].sites };
  }
  if (reste === '/field-counts') return { success: true, data: vide ? [] : FIELD_COUNTS, meta: META };
  if (/^\/captures\/[^/]+\/file$/.test(reste)) return null;
  if (/^\/captures\/[^/]+(\/remove-photo)?$/.test(reste)) return { success: true, data: CAPTURE };
  if (reste === '/captures') return { success: true, data: [CAPTURE], meta: { nextCursor: null } };
  if (/^\/counts\/[^/]+\/captures$/.test(reste)) {
    return {
      success: true,
      data: {
        countId: COMPTAGE_WHATSAPP,
        source: 'WHATSAPP',
        lines: [
          {
            itemId: CIMENT,
            captureId: CAPTURE_CIMENT,
            outcome: 'ACCEPTED',
            confirmedAt: CAPTURE.confirmedAt,
            hasPhoto: true,
            capturesCount: 1
          },
          {
            itemId: FER,
            captureId: CAPTURE_FER,
            outcome: 'CORRECTED',
            mergeMode: 'ADD',
            confirmedAt: '2026-10-04T09:44:50.000Z',
            hasPhoto: false,
            capturesCount: 2
          }
        ]
      }
    };
  }
  if (reste === '/sessions') return { success: true, data: SESSIONS, meta: { nextCursor: null } };
  if (/^\/sessions\/[^/]+\/messages$/.test(reste)) return { success: true, data: MESSAGES };
  if (reste === '/simulator/conversation') return { success: true, data: { session: SESSIONS[0], messages: MESSAGES } };
  if (reste === '/simulator/messages') return { success: true, data: { metaMessageId: 'sim-atelier' } };
  if (/^\/simulator\/sessions\/[^/]+\/advance$/.test(reste)) return { success: true, data: SESSIONS[0] };
  return null;
}

/** À inscrire seulement si le lot 040 ne simule pas déjà `/stock/field-context`. */
export function repondreStockWhatsappFieldContext(chemin: string, _scenario: Scenario): unknown | null {
  if (!/\/tenants\/[^/]+\/finance\/stock\/field-context$/.test(chemin)) return null;
  return { success: true, data: FIELD_CONTEXT, meta: META };
}
