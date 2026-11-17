import type { FormDefinition } from '../types';

/**
 * Formulaires Syndic « appels de charges, budgets, compte du lot, recouvrement,
 * programmations ». Chaque `key` est la clé EXACTE du corps JSON envoyé à l'API ;
 * `defaultMode` reproduit le comportement d'avant le réglage.
 */
export const FORMS: FormDefinition[] = [
  {
    formKey: 'syndic.appel-de-charges',
    module: 'syndic',
    label: 'Créer un appel de charges',
    audience: 'agency',
    fields: [
      {
        key: 'fundId',
        label: 'Fonds alimenté',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ['OPTIONAL', 'REQUIRED', 'HIDDEN'],
        consequence:
          "Sans fonds, le paiement de l'appel n'alimente aucun fonds, sauf si le budget le prévoit par poste."
      },
      {
        key: 'isRecurring',
        label: 'Charge récurrente',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ['OPTIONAL', 'HIDDEN'],
        consequence:
          "Masqué, l'appel est toujours créé une seule fois : il n'est plus possible de générer des appels répétés depuis ce formulaire."
      }
    ]
  },
  {
    formKey: 'syndic.budget',
    module: 'syndic',
    label: 'Nouveau budget',
    audience: 'agency',
    fields: [
      {
        key: 'lines[].fundId',
        label: 'Fonds alimenté par ce poste',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ['OPTIONAL', 'REQUIRED', 'HIDDEN'],
        consequence: "Sans fonds sur un poste, la part de ce poste dans les paiements d'appels n'alimente aucun fonds."
      }
    ]
  },
  {
    formKey: 'syndic.programmation-appels',
    module: 'syndic',
    label: "Programmation d'appels automatiques",
    audience: 'agency',
    fields: [
      {
        key: 'endDate',
        label: 'Date de fin',
        fieldClass: 'OPEN',
        defaultMode: 'OPTIONAL',
        allowedModes: ['OPTIONAL', 'REQUIRED', 'HIDDEN'],
        consequence: "Sans date de fin, la programmation continue à générer des appels jusqu'à son arrêt manuel."
      }
    ]
  },
  {
    formKey: 'syndic.compte-lot-ajustement',
    module: 'syndic',
    label: 'Ajouter un ajustement (compte du lot)',
    audience: 'agency',
    fields: [
      {
        key: 'reference',
        label: 'Référence',
        fieldClass: 'OPEN',
        defaultMode: 'OPTIONAL',
        allowedModes: ['OPTIONAL', 'REQUIRED', 'HIDDEN'],
        consequence: "Sans référence, l'ajustement ne peut pas être rattaché à une pièce interne."
      }
    ]
  },
  {
    formKey: 'syndic.penalite',
    module: 'syndic',
    label: 'Appliquer une pénalité',
    audience: 'agency',
    fields: [
      {
        key: 'daysLate',
        label: 'Jours de retard',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ['OPTIONAL', 'REQUIRED', 'HIDDEN'],
        consequence:
          "Masqué, les jours de retard sont toujours calculés automatiquement et l'aperçu de la pénalité ne peut plus être ajusté à la main."
      }
    ]
  },
  {
    formKey: 'syndic.echeancier',
    module: 'syndic',
    label: 'Créer un échéancier de paiement',
    audience: 'agency',
    fields: [
      {
        key: 'agreedAt',
        label: "Date d'accord",
        fieldClass: 'OPEN',
        defaultMode: 'OPTIONAL',
        allowedModes: ['OPTIONAL', 'REQUIRED', 'HIDDEN'],
        consequence: "Sans date d'accord saisie, c'est la date du jour qui est enregistrée."
      }
    ]
  }
];
