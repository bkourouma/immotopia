/**
 * Scénarios de facturation plateforme par pack (module PUR, sans base).
 *
 * Chaque pack raconte une histoire de 36 périodes de facturation (indice 0 =
 * première facture, 35 = période en cours) : montée en charge d'une capacité,
 * dépassement facturé un mois, demande d'extension acceptée, bloc retiré quand
 * le volume redescend, dérogation commerciale du super-administrateur, demande
 * refusée. Les consommations finales sont REMPLACÉES par la consommation réelle
 * de l'agence au moment du seed : l'historique rejoint toujours le présent.
 */

export type CapacityKeyName = 'LOTS' | 'COPROPRIETES' | 'CHANTIERS' | 'BIENS_DETENUS';

/** Points (période, consommation) : interpolation linéaire entre deux points. */
export type UsageCurve = ReadonlyArray<readonly [number, number]>;

export interface ExtensionStory {
  code: 'EXT_LOTS_10' | 'EXT_COPRO' | 'EXT_CHANTIER' | 'EXT_BIENS_10';
  quantity: number;
  /** Période (0-35) où l'élément est ajouté, et jours écoulés depuis le début de cette période. */
  startPeriod: number;
  startDay: number;
  /** Période d'échéance où il est retiré ; absent = toujours actif. */
  endPeriod?: number;
  endReason?: string;
  requestMessage: string;
  handledNote: string;
}

export interface OverrideStory {
  key: CapacityKeyName;
  delta: number;
  startPeriod: number;
  startDay: number;
  /** Nombre de jours de validité ; absent = sans limite de durée. */
  validDays?: number;
  /** Retrait anticipé (jours après le début). */
  revokeAfterDays?: number;
  reason: string;
}

export interface RequestStory {
  period: number;
  day: number;
  catalogCode: string | null;
  quantity: number | null;
  message: string;
  status: 'HANDLED' | 'DECLINED' | 'OPEN';
  handledNote?: string;
}

export interface PackStory {
  curves: Partial<Record<CapacityKeyName, UsageCurve>>;
  extensions: ExtensionStory[];
  overrides: OverrideStory[];
  requests: RequestStory[];
  /** Période de l'erreur de facturation corrigée par un avoir. */
  creditNotePeriod: number;
}

const CHANTIERS_CURVE: UsageCurve = [
  [0, 1],
  [10.9, 1],
  [11, 2],
  [21, 2],
  [21.2, 1],
  [34.3, 1],
  [34.5, 2],
  [35, 2]
];

export const PACK_STORIES: Record<string, PackStory> = {
  AGENCE: {
    curves: {
      LOTS: [
        [0, 6],
        [5, 24],
        [11, 58],
        [14, 84],
        [17, 98],
        [19, 106],
        [22, 114],
        [25, 118],
        [27, 96],
        [30, 70],
        [33, 45]
      ]
    },
    extensions: [
      {
        code: 'EXT_LOTS_10',
        quantity: 2,
        startPeriod: 19,
        startDay: 10,
        endPeriod: 30,
        endReason: 'Retrait à l’échéance : le parc géré est revenu à son volume habituel.',
        requestMessage:
          'Nous venons de reprendre la gestion de la résidence Les Palmiers (24 appartements) : pouvez-vous ajouter deux blocs de 10 lots à notre abonnement ?',
        handledNote: 'Deux blocs de 10 lots ajoutés au prorata de la période en cours.'
      }
    ],
    overrides: [
      {
        key: 'LOTS',
        delta: 20,
        startPeriod: 25,
        startDay: 3,
        validDays: 75,
        reason:
          'Dérogation commerciale : reprise temporaire du mandat de la résidence Les Palmiers pendant la passation.'
      }
    ],
    requests: [
      {
        period: 24,
        day: 9,
        catalogCode: 'EXT_CHANTIER',
        quantity: 1,
        message: 'Nous voudrions suivre un petit chantier de réhabilitation : est-il possible d’ajouter un chantier ?',
        status: 'DECLINED',
        handledNote:
          'Les chantiers relèvent du pack Promoteur ou Opérateur intégré : cette extension n’est pas disponible avec le pack Agence.'
      },
      {
        period: 35,
        day: 0,
        catalogCode: null,
        quantity: null,
        message:
          'Nous étudions le passage au pack Opérateur intégré pour reprendre aussi la gestion de copropriétés : pouvez-vous nous contacter ?',
        status: 'OPEN'
      }
    ],
    creditNotePeriod: 9
  },
  SYNDIC: {
    curves: {
      COPROPRIETES: [
        [0, 1],
        [8, 1],
        [9, 2],
        [14, 2],
        [15, 3]
      ]
    },
    extensions: [
      {
        code: 'EXT_COPRO',
        quantity: 1,
        startPeriod: 16,
        startDay: 6,
        requestMessage:
          'Le conseil syndical de la résidence Les Orchidées nous a confié son mandat : pouvez-vous ajouter une copropriété supplémentaire ?',
        handledNote: 'Copropriété supplémentaire ajoutée, facturée au prorata.'
      }
    ],
    overrides: [
      {
        key: 'COPROPRIETES',
        delta: 1,
        startPeriod: 14,
        startDay: 2,
        validDays: 60,
        reason: 'Dérogation commerciale : deux mois d’essai de la troisième copropriété avant souscription du bloc.'
      }
    ],
    requests: [
      {
        period: 28,
        day: 12,
        catalogCode: 'EXT_LOTS_10',
        quantity: 5,
        message: 'Pouvez-vous ajouter cinq blocs de 10 lots pour anticiper la livraison d’un nouvel immeuble ?',
        status: 'DECLINED',
        handledNote:
          'La réserve de lots du pack couvre largement votre volume actuel : demande à renouveler à l’approche du plafond.'
      },
      {
        period: 35,
        day: 0,
        catalogCode: 'EXT_COPRO',
        quantity: 1,
        message: 'Nous allons reprendre une quatrième copropriété à Bingerville : merci d’ajouter une copropriété.',
        status: 'OPEN'
      }
    ],
    creditNotePeriod: 12
  },
  PROMOTEUR: {
    curves: {
      LOTS: [
        [0, 6],
        [5, 24],
        [11, 45],
        [17, 95],
        [20, 128],
        [22, 141],
        [24, 152],
        [26, 150],
        [28, 98],
        [32, 80]
      ],
      CHANTIERS: CHANTIERS_CURVE
    },
    extensions: [
      {
        code: 'EXT_LOTS_10',
        quantity: 1,
        startPeriod: 25,
        startDay: 9,
        endPeriod: 30,
        endReason: 'Retrait à l’échéance : les lots de la résidence livrée ne sont plus gérés par l’agence.',
        requestMessage: 'Le programme Les Cocotiers atteint 152 lots : pouvez-vous ajouter un bloc de 10 lots ?',
        handledNote: 'Un bloc de 10 lots ajouté au prorata.'
      }
    ],
    overrides: [
      {
        key: 'CHANTIERS',
        delta: 1,
        startPeriod: 11,
        startDay: 1,
        validDays: 45,
        reason:
          'Dérogation commerciale : démarrage anticipé du chantier Les Jardins d’Angré avant la livraison de Grand-Bassam.'
      }
    ],
    requests: [
      {
        period: 31,
        day: 5,
        catalogCode: 'EXT_CHANTIER',
        quantity: 2,
        message:
          'Deux nouveaux programmes sont prévus l’an prochain : pouvez-vous ajouter deux chantiers dès maintenant ?',
        status: 'DECLINED',
        handledNote:
          'Votre pack couvre deux chantiers actifs et un seul est démarré : nous ajouterons l’extension au lancement du programme.'
      },
      {
        period: 35,
        day: 1,
        catalogCode: 'EXT_INVENTAIRE_WHATSAPP',
        quantity: 1,
        message: 'Nous souhaitons activer l’inventaire de chantier par WhatsApp pour nos deux magasiniers.',
        status: 'OPEN'
      }
    ],
    creditNotePeriod: 7
  },
  INTEGRE: {
    curves: {
      LOTS: [
        [0, 10],
        [8, 60],
        [16, 160],
        [22, 260],
        [26, 310],
        [28, 250],
        [32, 160]
      ],
      COPROPRIETES: [
        [0, 0],
        [4, 1],
        [10, 2],
        [19, 3]
      ],
      CHANTIERS: CHANTIERS_CURVE
    },
    extensions: [
      {
        code: 'EXT_LOTS_10',
        quantity: 2,
        startPeriod: 27,
        startDay: 4,
        endPeriod: 33,
        endReason: 'Retrait à l’échéance : fin du mandat de gestion de la résidence Les Flamboyants.',
        requestMessage:
          'La réserve de 300 lots est atteinte : merci d’ajouter deux blocs de 10 lots le temps du mandat Les Flamboyants.',
        handledNote: 'Deux blocs de 10 lots ajoutés au prorata.'
      }
    ],
    overrides: [
      {
        key: 'COPROPRIETES',
        delta: 1,
        startPeriod: 18,
        startDay: 5,
        validDays: 60,
        reason: 'Dérogation commerciale : essai de la troisième copropriété pendant la reprise du mandat.'
      }
    ],
    requests: [
      {
        period: 22,
        day: 14,
        catalogCode: 'EXT_COPRO',
        quantity: 1,
        message: 'Peut-on ajouter une quatrième copropriété à Cocody ?',
        status: 'DECLINED',
        handledNote: 'Le mandat n’a finalement pas été signé : demande classée sans suite à la demande de l’agence.'
      }
    ],
    creditNotePeriod: 14
  },
  PATRIMOINE_ESSENTIEL: {
    curves: {
      BIENS_DETENUS: [
        [0, 2],
        [5, 5],
        [11, 8],
        [15, 9],
        [17, 11],
        [21, 14],
        [25, 13],
        [28, 11],
        [30, 10]
      ]
    },
    extensions: [
      {
        code: 'EXT_BIENS_10',
        quantity: 1,
        startPeriod: 18,
        startDay: 12,
        endPeriod: 31,
        endReason: 'Retrait à l’échéance : trois biens ont été vendus, le plafond de 10 biens suffit de nouveau.',
        requestMessage: 'Nous venons d’acquérir deux biens à Bingerville : pouvez-vous ajouter un bloc de 10 biens ?',
        handledNote: 'Un bloc de 10 biens ajouté au prorata.'
      }
    ],
    overrides: [
      {
        key: 'BIENS_DETENUS',
        delta: 5,
        startPeriod: 14,
        startDay: 3,
        validDays: 90,
        reason: 'Dérogation commerciale : accompagnement de la succession familiale (biens en cours de partage).'
      }
    ],
    requests: [
      {
        period: 33,
        day: 7,
        catalogCode: null,
        quantity: null,
        message:
          'Souhaitons-nous passer au pack Patrimoine Pro pour le suivi des sinistres et des projections ? Merci de nous présenter les tarifs.',
        status: 'HANDLED',
        handledNote: 'Devis du pack Patrimoine Pro envoyé par e-mail à l’administrateur de l’agence.'
      }
    ],
    creditNotePeriod: 10
  },
  PATRIMOINE_PRO: {
    curves: {
      BIENS_DETENUS: [
        [0, 1],
        [8, 5],
        [16, 9],
        [24, 11]
      ]
    },
    extensions: [],
    overrides: [
      {
        key: 'BIENS_DETENUS',
        delta: 20,
        startPeriod: 20,
        startDay: 6,
        reason: 'Geste commercial : réserve de biens portée à 120 après l’audit patrimonial de la société.'
      }
    ],
    requests: [
      {
        period: 26,
        day: 8,
        catalogCode: 'EXT_BIENS_10',
        quantity: 2,
        message: 'Pouvez-vous ajouter deux blocs de 10 biens pour la holding familiale ?',
        status: 'DECLINED',
        handledNote:
          'Le pack Pro n’a pas de bloc de biens : le plafond de 100 biens est commun, et une dérogation à 120 est déjà accordée.'
      }
    ],
    creditNotePeriod: 16
  }
};

/** Moyens de paiement de l'historique (poids relatifs). */
export const PAYMENT_METHOD_WEIGHTS: ReadonlyArray<
  readonly ['BANK_TRANSFER' | 'MOBILE_MONEY' | 'ONLINE' | 'CHECK' | 'CASH', number]
> = [
  ['BANK_TRANSFER', 38],
  ['MOBILE_MONEY', 24],
  ['ONLINE', 28],
  ['CHECK', 7],
  ['CASH', 3]
];

export const GATEWAY_SERVICES = ['ORANGE MONEY CI', 'MTN MOBILE MONEY CI', 'WAVE CI', 'MOOV MONEY CI', 'VISA'] as const;
export const BANKS = [
  'SGBCI',
  'Ecobank CI',
  'NSIA Banque',
  'Bank of Africa CI',
  'Société Générale CI',
  'UBA Côte d’Ivoire'
] as const;

/** Interpolation linéaire d'une courbe de consommation ; avant le premier point : premier point. */
export function interpolate(curve: UsageCurve, x: number): number {
  if (curve.length === 0) return 0;
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i += 1) {
    const [x1, y1] = curve[i];
    if (x <= x1) {
      const [x0, y0] = curve[i - 1];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return curve[curve.length - 1][1];
}

/** Courbe en S de 0,06 × final à `final` entre les périodes 0 et 35 (capacités sans scénario). */
export function defaultCurve(finalUsed: number): UsageCurve {
  const start = Math.max(0, Math.round(finalUsed * 0.06));
  return [
    [0, start],
    [6, Math.round(finalUsed * 0.3)],
    [14, Math.round(finalUsed * 0.62)],
    [24, Math.round(finalUsed * 0.86)],
    [35, finalUsed]
  ];
}
