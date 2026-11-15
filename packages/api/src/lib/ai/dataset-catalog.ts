import type { BaseAnalysisQuery } from './contracts';
import { sqlViews } from './assistant-sql';

type Measure = [label: string, unit: 'currency' | 'XOF' | 'count' | 'percent' | 'day', definition: string];
interface Dataset {
  title: string;
  grain: string;
  dimensions: Readonly<Record<string, string>>;
  measures: Readonly<Record<string, Measure>>;
  defaultPeriod: string;
  granularities: readonly string[];
  view?: string;
}

const current = 'Situation à la date de consultation';
const closedMonth = 'Dernier mois civil clos';
const today = 'Date de consultation';
const debtRule = 'Le total des actifs diminué du total des dettes.';
const patrimonyDimensions = { date: 'Date', currency: 'Devise' };
const patrimonyMeasures = {
  totalAssets: ['Total des actifs', 'XOF', 'Somme des actifs retenus à la date de référence.'],
  totalDebts: ['Total des dettes', 'XOF', 'Somme des dettes retenues à la date de référence.'],
  netWorth: ['Valeur nette', 'XOF', debtRule],
  lowReliabilityShare: [
    'Part peu fiable ou inconnue (%)',
    'percent',
    'Part de la valeur des actifs peu fiables ou de fiabilité inconnue.'
  ],
  excludedAssets: ['Actifs exclus', 'count', 'Actifs écartés du calcul.'],
  excludedLoans: ['Dettes exclues', 'count', 'Dettes écartées du calcul.']
} satisfies Dataset['measures'];

const maintenance = {
  title: 'Maintenance',
  grain: 'Une ligne par statut et priorité, ou par ticket dans la liste des retards.',
  dimensions: {
    status: 'Statut',
    priority: 'Priorité',
    ticket: 'Ticket',
    property: 'Bien',
    contractDueDate: 'Échéance contractuelle'
  },
  measures: {
    count: ['Nombre de tickets', 'count', 'Tickets de la combinaison statut et priorité.'],
    open: ['Tickets ouverts', 'count', 'Tickets déclarés, assignés ou en cours.'],
    urgent: ['Tickets urgents ouverts', 'count', 'Tickets ouverts de priorité urgente.'],
    overdue: ['Tickets en retard', 'count', 'Tickets ouverts dont l’échéance contractuelle est dépassée.'],
    withoutDeadline: [
      'Tickets ouverts sans échéance',
      'count',
      'Tickets ouverts sans échéance contractuelle renseignée.'
    ],
    averageAge: [
      'Ancienneté moyenne des tickets ouverts (jours)',
      'day',
      'Moyenne des jours écoulés depuis la déclaration des tickets ouverts.'
    ],
    averageResolution: [
      'Délai moyen de résolution (jours)',
      'day',
      'Moyenne des jours entre déclaration et résolution pour les tickets résolus.'
    ]
  },
  defaultPeriod: current,
  granularities: ['snapshot']
} satisfies Dataset;

export const datasetCatalog = {
  rental_arrears: {
    title: 'Échéances locatives non soldées',
    grain: 'Un bien et une devise pour le mois sélectionné.',
    dimensions: { property: 'Bien', currency: 'Devise' },
    measures: {
      count: ['Nombre d’échéances', 'count', 'Nombre d’échéances non soldées au solde positif.'],
      balance: ['Solde restant dû', 'currency', 'Loyer, charges, frais et pénalités diminués des paiements affectés.']
    },
    defaultPeriod: closedMonth,
    granularities: ['month']
  },
  rental_receipts: {
    title: 'Encaissements locatifs',
    grain: 'Un mois et une devise.',
    dimensions: { period: 'Période', currency: 'Devise' },
    measures: {
      amount: ['Montant encaissé', 'currency', 'Somme des paiements réussis à leur date effective d’encaissement.'],
      count: ['Nombre de paiements', 'count', 'Nombre de paiements réussis dans la période.']
    },
    defaultPeriod: closedMonth,
    granularities: ['month']
  },
  rental_due_comparison: {
    title: 'Échéances du mois et de l’année précédente',
    grain: 'Un mois et une devise, avec le même mois un an auparavant.',
    dimensions: { period: 'Période', currency: 'Devise' },
    measures: {
      expected: [
        'Montant attendu',
        'currency',
        'Loyers, charges, autres frais et pénalités des échéances non annulées.'
      ],
      allocated: ['Paiements affectés', 'currency', 'Affectations enregistrées à la consultation.'],
      overdue: ['Solde restant dû', 'currency', 'Soldes positifs des échéances non soldées.'],
      overdueCount: [
        'Nombre d’échéances en retard',
        'count',
        'Nombre d’échéances en retard ayant encore un solde positif.'
      ]
    },
    defaultPeriod: closedMonth,
    granularities: ['month']
  },
  maintenance_overview: maintenance,
  syndicate_maintenance: { ...maintenance, title: 'Suivi des tickets de maintenance' },
  syndicate_charges: {
    title: 'Appels de charges',
    grain: 'Un lot et une devise pour les échéances de la période.',
    dimensions: { lot: 'Lot', currency: 'Devise' },
    measures: {
      count: ['Nombre d’appels', 'count', 'Appels dont la date d’échéance est dans la période.'],
      called: ['Montant appelé', 'currency', 'Montants appelés pour le lot.'],
      paid: ['Montant réglé', 'currency', 'Règlements affectés à la consultation.'],
      outstanding: ['Reste à payer', 'currency', 'Solde positif de chaque appel, ramené à zéro en cas de trop-perçu.'],
      overdue: ['Montant en retard', 'currency', 'Reste à payer sur les appels dont la date d’échéance est dépassée.']
    },
    defaultPeriod: 'Année civile demandée',
    granularities: ['year', 'month']
  },
  syndicate_budget: {
    title: 'Écarts budgétaires de copropriété',
    grain: 'Un poste budgétaire par budget et devise.',
    dimensions: {
      budget: 'Budget',
      status: 'Statut',
      category: 'Catégorie',
      line: 'Poste budgétaire',
      currency: 'Devise'
    },
    measures: {
      forecast: ['Prévisionnel', 'currency', 'Montant prévu sur le poste.'],
      actual: ['Réalisé', 'currency', 'Montant réalisé du poste selon le service du budget syndic.'],
      variance: ['Écart', 'currency', 'Prévisionnel diminué du réalisé.']
    },
    defaultPeriod: 'Exercice demandé',
    granularities: ['year']
  },
  property_portfolio: {
    title: 'Parc immobilier',
    grain: 'Un type de bien ou une zone.',
    dimensions: { category: 'Regroupement' },
    measures: {
      total: ['Nombre de biens', 'count', 'Biens du parc dans le groupe et le périmètre retenus.'],
      occupied: ['Biens occupés', 'count', 'Biens loués ou vendus selon la règle du tableau de bord.'],
      available: ['Biens disponibles', 'count', 'Biens au statut Disponible.'],
      occupancy: [
        'Taux d’occupation (%)',
        'percent',
        'Nombre de biens occupés divisé par le total du groupe, en pourcentage.'
      ]
    },
    defaultPeriod: today,
    granularities: ['snapshot']
  },
  lease_portfolio: {
    title: 'Baux actifs et fins de bail',
    grain: 'Un bien.',
    dimensions: { property: 'Bien', firstEnd: 'Première fin de bail dans la période' },
    measures: {
      active: ['Baux actifs', 'count', 'Nombre de baux au statut actif.'],
      ending: [
        'Baux se terminant dans la période',
        'count',
        'Baux actifs dont la date de fin est comprise dans la période.'
      ]
    },
    defaultPeriod: 'Trente prochains jours',
    granularities: ['range']
  },
  crm_pipeline: {
    title: 'Pipeline des affaires',
    grain: 'Une étape ouverte du pipeline CRM.',
    dimensions: { stage: 'Étape', currency: 'Devise' },
    measures: {
      count: ['Nombre d’affaires', 'count', 'Nombre d’affaires ouvertes de cette étape.'],
      value: ['Valeur attendue', 'XOF', 'Somme des montants attendus enregistrés dans le CRM.'],
      avgAgeDays: ['Âge moyen en jours', 'day', 'Nombre moyen de jours écoulés depuis la création des affaires.'],
      percentage: ['Part des affaires (%)', 'percent', 'Part de cette étape parmi les affaires des étapes retenues.']
    },
    defaultPeriod: today,
    granularities: ['snapshot']
  },
  sale_mandates: {
    title: 'Mandats de vente',
    grain: 'Un mandat actif arrivant à échéance.',
    dimensions: {
      mandate: 'Mandat',
      property: 'Bien',
      agent: 'Négociateur',
      start: 'Date de début',
      end: 'Date de fin',
      currency: 'Devise'
    },
    measures: { askingPrice: ['Prix demandé', 'currency', 'Prix annoncé pour le mandat.'] },
    defaultPeriod: 'Trente prochains jours',
    granularities: ['range']
  },
  construction_budget: {
    title: 'Tableau de bord des chantiers',
    grain: 'Un chantier.',
    dimensions: { site: 'Chantier', zone: 'Zone', status: 'Statut', currency: 'Devise' },
    measures: {
      initialBudget: ['Budget initial', 'currency', 'Budget avant révisions.'],
      revisedBudget: ['Budget révisé', 'currency', 'Budget validé après révisions.'],
      actualCost: ['Réalisé', 'currency', 'Coût réalisé déclaré par le tableau de bord.'],
      engagedAmount: ['Engagé', 'currency', 'Montant engagé déclaré par le tableau de bord.'],
      variance: ['Écart', 'currency', 'Budget révisé diminué de l’engagé.'],
      progress: ['Avancement (%)', 'percent', 'Avancement du chantier enregistré dans le tableau de bord.']
    },
    defaultPeriod: today,
    granularities: ['snapshot']
  },
  owner_statements: {
    title: 'Relevés de gérance',
    grain: 'Un relevé propriétaire dans la période.',
    dimensions: {
      owner: 'Propriétaire',
      period: 'Période',
      status: 'Statut',
      currency: 'Devise',
      calculation: 'Version du calcul'
    },
    measures: {
      revenue: ['Recettes', 'currency', 'Recettes figurant sur le relevé enregistré.'],
      expenses: ['Dépenses', 'currency', 'Dépenses figurant sur ce relevé.'],
      fees: ['Honoraires de gestion', 'currency', 'Honoraires facturés sur le relevé.'],
      vat: ['TVA sur les honoraires', 'currency', 'TVA portée sur les honoraires de gestion du relevé.'],
      net: ['Net du relevé', 'currency', 'Montant net du relevé, distinct du solde du compte propriétaire.']
    },
    defaultPeriod: closedMonth,
    granularities: ['range']
  },
  owner_payouts: {
    title: 'Reversements propriétaires exécutés',
    grain: 'Un reversement validé.',
    dimensions: { number: 'Numéro', owner: 'Propriétaire', paidAt: 'Date du reversement', currency: 'Devise' },
    measures: { amount: ['Montant reversé', 'XOF', 'Montant validé en XOF à la date du reversement.'] },
    defaultPeriod: closedMonth,
    granularities: ['range']
  },
  owner_balances: {
    title: 'Comptes propriétaires',
    grain: 'Un compte propriétaire au solde créditeur.',
    dimensions: { owner: 'Propriétaire', currency: 'Devise' },
    measures: { balance: ['Solde à reverser', 'currency', 'Solde positif établi sur les écritures déjà inscrites.'] },
    defaultPeriod: today,
    granularities: ['snapshot']
  },
  patrimony_net_worth: {
    title: 'Valeur nette',
    grain: 'Un instantané du patrimoine à la date choisie.',
    dimensions: patrimonyDimensions,
    measures: patrimonyMeasures,
    defaultPeriod: today,
    granularities: ['snapshot']
  },
  patrimony_history: {
    title: 'Évolution de la valeur nette',
    grain: 'Un instantané par date de la série.',
    dimensions: patrimonyDimensions,
    measures: patrimonyMeasures,
    defaultPeriod: 'Douze mois jusqu’à la date de consultation',
    granularities: ['month']
  },
  maintenance_log: {
    title: 'Carnet d’entretien',
    grain: 'Une intervention inscrite au carnet.',
    dimensions: {
      property: 'Bien',
      category: 'Catégorie',
      vendor: 'Prestataire',
      performedAt: 'Date d’intervention',
      currency: 'Devise',
      nextDueDate: 'Prochaine échéance'
    },
    measures: { cost: ['Coût', 'currency', 'Coût enregistré dans sa devise. Un coût absent reste vide.'] },
    defaultPeriod: 'Dernier mois civil clos',
    granularities: ['range']
  },
  reserved_sale_properties: {
    title: 'Biens et lots réservés à la vente',
    grain: 'Un bien ou lot de vente au statut Réservé.',
    dimensions: {
      reference: 'Référence',
      name: 'Bien ou lot',
      program: 'Programme / immeuble',
      zone: 'Zone',
      currency: 'Devise'
    },
    measures: { price: ['Prix affiché', 'currency', 'Prix affiché sur le bien ou le lot réservé.'] },
    defaultPeriod: today,
    granularities: ['snapshot']
  },
  sale_commitments: {
    title: 'Compromis de vente',
    grain: 'Un compromis signé et encore en cours.',
    dimensions: {
      number: 'Compromis',
      property: 'Bien ou lot',
      signedAt: 'Date de signature',
      expectedDeedDate: 'Date prévue de l’acte',
      currency: 'Devise'
    },
    measures: {
      price: ['Prix convenu', 'currency', 'Prix convenu du compromis en cours.'],
      deposit: ['Dépôt prévu', 'currency', 'Montant prévu au compromis.']
    },
    defaultPeriod: 'Compromis signés et encore en cours à la consultation',
    granularities: ['range']
  },
  rental_receipts_sql: {
    title: 'Encaissements locatifs',
    grain: 'Un paiement réussi dans la vue avant agrégation.',
    dimensions: { received_on: 'Date d’encaissement', currency: 'Devise', method: 'Méthode' },
    measures: { amount: ['Montant encaissé', 'currency', 'Montant d’un paiement réussi.'] },
    defaultPeriod: 'Selon les filtres de la requête',
    granularities: ['day'],
    view: sqlViews.receipts.name
  },
  rental_installments_sql: {
    title: 'Échéances locatives',
    grain: 'Une échéance non annulée dans la vue avant agrégation.',
    dimensions: { due_on: 'Date d’échéance', currency: 'Devise', status: 'Statut' },
    measures: {
      gross_amount: ['Montant attendu', 'currency', 'Montant brut avec charges, frais et pénalités.'],
      allocated_amount: ['Paiements affectés', 'currency', 'Montant affecté à l’échéance.'],
      outstanding_amount: [
        'Solde restant dû',
        'currency',
        'Montant brut diminué des affectations, ramené à zéro si négatif.'
      ]
    },
    defaultPeriod: 'Selon les filtres de la requête',
    granularities: ['day'],
    view: sqlViews.installments.name
  }
} satisfies Record<BaseAnalysisQuery['tool'], Dataset>;

export function isDatasetName(value: string): value is keyof typeof datasetCatalog {
  return Object.prototype.hasOwnProperty.call(datasetCatalog, value);
}
