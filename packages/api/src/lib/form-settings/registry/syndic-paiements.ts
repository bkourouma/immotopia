import type { FormDefinition, FormFieldDefinition } from '../types';

/**
 * Formulaires Syndic « paiements » : paiement déclaré (gestionnaire et portail), validation,
 * factures prestataires, paiement par lot, prélèvements, paiement en ligne.
 *
 * Chaque `key` est la clé EXACTE du corps JSON envoyé à l'API (pour les déclarations multipart,
 * celle du JSON du champ `payload`). `defaultMode` reproduit le comportement d'avant le réglage.
 * Les pièces jointes (`file`) ne sont jamais « obligatoires » : le fichier n'est pas dans le
 * corps JSON, seul le masquage de la zone d'envoi est réglable.
 */

const ALL_MODES: FormFieldDefinition['allowedModes'] = ['OPTIONAL', 'REQUIRED', 'HIDDEN'];

const UNIQUE_REFERENCE_CONSEQUENCE =
  "Facultative ou masquée : ImmoTopia ne peut plus bloquer une même transaction déclarée deux fois ; seule l'alerte « doublon probable » (même payeur, même montant, même heure) reste. Conseil : rendre la capture obligatoire en compensation.";

const lineCallsField = (key: string, consequence: string): FormFieldDefinition => ({
  key,
  label: 'Appels visés',
  fieldClass: 'GATED',
  defaultMode: 'OPTIONAL',
  allowedModes: ['OPTIONAL', 'HIDDEN'],
  consequence
});

const referenceField = (label: string): FormFieldDefinition => ({
  key: 'transactionReference',
  label,
  fieldClass: 'GATED',
  defaultMode: 'REQUIRED',
  allowedModes: ALL_MODES,
  consequence: UNIQUE_REFERENCE_CONSEQUENCE
});

const commentField: FormFieldDefinition = {
  key: 'comment',
  label: 'Commentaire',
  fieldClass: 'OPEN',
  defaultMode: 'OPTIONAL',
  allowedModes: ALL_MODES,
  consequence: "Information libre : sans commentaire, le gestionnaire ne dispose d'aucun contexte complémentaire."
};

const notesField = (label = 'Notes'): FormFieldDefinition => ({
  key: 'notes',
  label,
  fieldClass: 'OPEN',
  defaultMode: 'OPTIONAL',
  allowedModes: ALL_MODES,
  consequence: 'Commentaire libre : sans lui, aucune précision complémentaire n’est conservée.'
});

export const FORMS: FormDefinition[] = [
  {
    formKey: 'syndic.facture-prestataire',
    module: 'syndic',
    label: 'Enregistrer une facture prestataire',
    audience: 'agency',
    fields: [
      {
        key: 'contractId',
        label: 'Contrat',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ALL_MODES,
        consequence: 'Masqué : la facture n’est plus rattachée à un contrat, le suivi du budget par contrat disparaît.'
      },
      {
        key: 'incidentId',
        label: 'Incident',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ALL_MODES,
        consequence: 'Masqué : la facture n’est plus rattachée à un incident.'
      },
      {
        key: 'budgetLineItemId',
        label: 'Ligne budgétaire',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ALL_MODES,
        consequence:
          'Masqué ou facultatif : sans imputation budgétaire, pas de suivi réalisé / prévu pour cette facture.'
      },
      {
        key: 'fundId',
        label: 'Fonds débité par défaut',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ALL_MODES,
        consequence: 'Masqué : aucun fonds par défaut n’est proposé au paiement de la facture.'
      },
      {
        key: 'dueDate',
        label: 'Échéance',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ALL_MODES,
        consequence: 'Masquée : plus d’alerte d’échéance de paiement pour cette facture.'
      },
      {
        key: 'file',
        label: 'Pièce jointe',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ['OPTIONAL', 'HIDDEN'],
        consequence: 'Masquée : le justificatif de la facture ne peut plus être joint à la saisie.'
      }
    ]
  },
  {
    formKey: 'syndic.facture-prestataire-paiement',
    module: 'syndic',
    label: 'Enregistrer un paiement de facture prestataire',
    audience: 'agency',
    fields: [
      {
        key: 'reference',
        label: 'Référence',
        fieldClass: 'OPEN',
        defaultMode: 'OPTIONAL',
        allowedModes: ALL_MODES,
        consequence:
          'Référence de transaction informative : sans elle, le paiement est plus difficile à rapprocher du relevé.'
      },
      {
        key: 'fundId',
        label: 'Fonds à débiter',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ALL_MODES,
        consequence: 'Masqué : le paiement utilise toujours le fonds par défaut de la facture.'
      }
    ]
  },
  {
    formKey: 'syndic.facture-prestataire-piece',
    module: 'syndic',
    label: 'Pièce jointe de la facture prestataire',
    audience: 'agency',
    fields: [
      {
        key: 'file',
        label: 'Pièce jointe',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ['OPTIONAL', 'HIDDEN'],
        consequence: 'Masquée : le justificatif ne peut plus être ajouté ni remplacé depuis la facture.'
      }
    ]
  },
  {
    formKey: 'syndic.paiement-lot',
    module: 'syndic',
    label: 'Enregistrer un paiement sur un lot',
    audience: 'agency',
    fields: [
      {
        key: 'reference',
        label: 'Référence',
        fieldClass: 'OPEN',
        defaultMode: 'OPTIONAL',
        allowedModes: ALL_MODES,
        consequence: 'Référence informative : sans elle, le paiement est plus difficile à rapprocher du relevé.'
      },
      {
        key: 'chargeCallIds',
        label: 'Appels couverts',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ['OPTIONAL', 'HIDDEN'],
        consequence:
          'Masqué ou facultatif : sans sélection, le paiement solde automatiquement les appels les plus anciens.'
      }
    ]
  },
  {
    formKey: 'syndic.paiement-declare-gestionnaire',
    module: 'syndic',
    label: 'Déclarer un paiement pour un copropriétaire',
    audience: 'agency',
    fields: [
      lineCallsField(
        'lines[].chargeCallIds',
        'Masqués ou facultatifs : sans appel visé, le paiement est imputé automatiquement sur les appels les plus anciens.'
      ),
      referenceField('Référence de transaction'),
      commentField
    ]
  },
  {
    formKey: 'syndic.paiement-declare-validation',
    module: 'syndic',
    label: 'Valider la déclaration de paiement',
    audience: 'agency',
    fields: [
      {
        key: 'correction.lines[].chargeCallIds',
        label: 'Appels couverts par lot',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ['OPTIONAL', 'HIDDEN'],
        consequence:
          'Masqués : en cas de correction, le crédit est imputé automatiquement sur les appels les plus anciens.'
      },
      {
        key: 'note',
        label: 'Note',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        // Jamais masquable : la note reste exigée en cas de correction réelle (traçabilité).
        allowedModes: ['OPTIONAL', 'REQUIRED'],
        consequence:
          'Obligatoire ici = une note à chaque validation. Quel que soit le réglage, elle reste exigée dès qu’il y a une correction (traçabilité).'
      }
    ]
  },
  {
    formKey: 'syndic.mandat-prelevement',
    module: 'syndic',
    label: 'Mandat de prélèvement',
    audience: 'agency',
    fields: [
      {
        key: 'maxAmount',
        label: 'Plafond par prélèvement (FCFA)',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ALL_MODES,
        consequence: 'Masqué ou facultatif : sans plafond, aucune limite n’est appliquée à chaque prélèvement.'
      },
      {
        key: 'collectionDay',
        label: 'Jour de collecte',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ALL_MODES,
        consequence: 'Masqué ou facultatif : sans jour propre au mandat, le jour du créancier s’applique.'
      },
      notesField()
    ]
  },
  {
    formKey: 'syndic.remise-prelevements',
    module: 'syndic',
    label: 'Préparer une remise de prélèvements',
    audience: 'agency',
    fields: [notesField()]
  },
  {
    formKey: 'syndic.lien-paiement-appel',
    module: 'syndic',
    label: 'Lien de paiement d’un appel de charges',
    audience: 'agency',
    // `delivery` (envoyer / copier) n'est pas réglable : le mode reste obligatoire côté API.
    fields: [
      {
        key: 'ttlDays',
        label: 'Durée de validité (jours)',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ['OPTIONAL', 'HIDDEN'],
        consequence: 'Masquée : la durée de vie du lien est toujours celle par défaut de l’application.'
      }
    ]
  },
  {
    formKey: 'syndic.reversement-paiement-en-ligne',
    module: 'syndic',
    label: 'Enregistrer un reversement (paiement en ligne)',
    audience: 'agency',
    fields: [{ ...notesField('Note'), key: 'note' }]
  },
  {
    formKey: 'syndic.paiement-declare-portail',
    module: 'syndic',
    label: 'Déclarer un paiement (portail copropriétaire)',
    audience: 'coowner-portal',
    fields: [
      referenceField('Référence de la transaction'),
      lineCallsField(
        'lines[].chargeCallIds',
        'Masqués ou facultatifs : sans sélection, le paiement est imputé automatiquement sur les appels les plus anciens.'
      ),
      commentField
    ]
  }
];
