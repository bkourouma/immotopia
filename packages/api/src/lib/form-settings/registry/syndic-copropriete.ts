import type { FieldMode, FormDefinition, FormFieldDefinition } from '../types';

/**
 * Formulaires Syndic « copropriété, lots, documents, prestataires, contrats, agences
 * mandantes, profils propriétaires, incidents ». Chaque `key` est la clé EXACTE du corps JSON
 * envoyé à l'API ; `defaultMode` reproduit le comportement d'avant le réglage (aucun de ces
 * champs n'est exigé aujourd'hui, ils sont tous facultatifs).
 *
 * Quand un champ n'accepte pas `REQUIRED`, c'est que l'écran ne peut pas l'exiger de façon
 * utile : case à cocher (toujours renseignée), image téléversée à part (pas dans le corps), ou
 * champ absent du formulaire de création alors que le formulaire de création est strict
 * (`syndicManagerId`, présent seulement à la modification de la copropriété).
 */

const FACULTATIF_OU_OBLIGATOIRE: FieldMode[] = ['OPTIONAL', 'REQUIRED', 'HIDDEN'];
const FACULTATIF_OU_MASQUE: FieldMode[] = ['OPTIONAL', 'HIDDEN'];

function champ(
  key: string,
  label: string,
  fieldClass: FormFieldDefinition['fieldClass'],
  consequence: string,
  allowedModes: FieldMode[] = FACULTATIF_OU_OBLIGATOIRE
): FormFieldDefinition {
  return { key, label, fieldClass, defaultMode: 'OPTIONAL', allowedModes, consequence };
}

export const FORMS: FormDefinition[] = [
  {
    formKey: 'syndic.copropriete',
    module: 'syndic',
    label: 'Créer ou modifier une copropriété',
    audience: 'agency',
    fields: [
      champ(
        'cadastralReference',
        'Référence cadastrale',
        'OPEN',
        "Descriptif administratif : masqué ou facultatif, aucune fonction de l'application n'en dépend."
      ),
      champ(
        'registrationNo',
        "N° d'immatriculation",
        'OPEN',
        "Numéro du registre des copropriétés : masqué ou facultatif, aucune fonction de l'application n'en dépend."
      ),
      champ(
        'totalGeneralShares',
        'Total de référence des tantièmes',
        'GATED',
        "Sans ce total, l'application ne peut plus avertir quand la somme des tantièmes des lots s'en écarte."
      ),
      champ(
        'mandatingAgencyId',
        'Agence mandante',
        'GATED',
        "Sans agence mandante, les documents portent l'identité de votre agence au lieu du logo, du cachet et de la signature du mandant."
      ),
      champ(
        'syndicManagerId',
        'Gestionnaire',
        'OPEN',
        "Contact de référence de la copropriété, affiché sur la fiche : masqué ou facultatif, rien d'autre n'en dépend. Champ présent à la modification seulement.",
        FACULTATIF_OU_MASQUE
      )
    ]
  },
  {
    formKey: 'syndic.lot',
    module: 'syndic',
    label: 'Créer ou modifier un lot',
    audience: 'agency',
    fields: [
      champ(
        'propertyId',
        'Bien lié',
        'GATED',
        "Sans bien lié, le type et le numéro ne sont plus pré-remplis et le propriétaire n'est plus proposé ; un lot comme un parking ou une cave peut exister sans bien."
      ),
      champ(
        'specialShares',
        'Tantièmes spéciaux',
        'GATED',
        "Sans tantièmes spéciaux, aucune charge ne peut être répartie selon une clé spéciale, par exemple l'ascenseur."
      ),
      champ(
        'ownerSince',
        'Propriétaire depuis le',
        'GATED',
        "Sans cette date, l'historique de propriété est incomplet et les charges ne peuvent plus être imputées selon la date d'entrée du propriétaire."
      )
    ]
  },
  {
    formKey: 'syndic.lot-locataire',
    module: 'syndic',
    label: 'Ajouter un locataire à un lot',
    audience: 'agency',
    fields: [
      champ(
        'endDate',
        'Date de fin',
        'OPEN',
        "Sans date de fin, l'occupation est considérée comme en cours jusqu'à ce que vous y mettiez fin."
      ),
      champ(
        'leaseId',
        'Référence bail',
        'OPEN',
        "Simple lien d'information vers le bail : masqué ou facultatif, rien n'en dépend."
      ),
      champ('notes', 'Notes', 'OPEN', "Commentaire libre : masqué ou facultatif, rien n'en dépend.")
    ]
  },
  {
    formKey: 'syndic.document',
    module: 'syndic',
    label: 'Ajouter un document',
    audience: 'agency',
    fields: [
      champ(
        'visibleToCoOwners',
        'Visible des copropriétaires',
        'GATED',
        "Masquée, la case disparaît : la visibilité sur le portail copropriétaire suit alors le type du document (règlement et procès-verbaux visibles, le reste non) et ne peut plus être choisie à l'ajout.",
        FACULTATIF_OU_MASQUE
      ),
      champ(
        'expiresAt',
        "Date d'expiration",
        'GATED',
        "Sans date d'expiration, l'application ne peut pas alerter de l'échéance d'un document comme une assurance ou un diagnostic."
      )
    ]
  },
  {
    formKey: 'syndic.contrat-maintenance',
    module: 'syndic',
    label: 'Nouveau contrat de maintenance',
    audience: 'agency',
    fields: [
      champ(
        'endDate',
        'Date de fin',
        'GATED',
        "Sans date de fin, l'alerte de renouvellement du contrat ne peut pas se déclencher."
      ),
      champ(
        'annualAmount',
        'Montant annuel',
        'OPEN',
        "Information budgétaire : masqué ou facultatif, aucune fonction de l'application n'en dépend."
      ),
      champ(
        'currency',
        'Devise',
        'OPEN',
        'Masquée, la devise du contrat est toujours le franc CFA (XOF), valeur par défaut.'
      ),
      champ(
        'renewalAlertDays',
        'Alerte renouvellement (jours)',
        'GATED',
        "Masqué, le délai de l'alerte de renouvellement est toujours de 30 jours, valeur par défaut."
      )
    ]
  },
  {
    formKey: 'syndic.prestataire',
    module: 'syndic',
    label: 'Nouveau prestataire',
    audience: 'agency',
    fields: [
      champ('specialty', 'Spécialité', 'OPEN', "Descriptif du prestataire : masqué ou facultatif, rien n'en dépend."),
      champ(
        'email',
        'E-mail',
        'GATED',
        "Sans e-mail, l'application ne peut pas envoyer de notifications au prestataire (le format reste vérifié s'il est renseigné)."
      ),
      champ('phone', 'Téléphone', 'OPEN', "Coordonnées du prestataire : masqué ou facultatif, rien n'en dépend.")
    ]
  },
  {
    formKey: 'syndic.agence-mandante',
    module: 'syndic',
    label: 'Agence mandante (créer ou modifier)',
    audience: 'agency',
    fields: [
      champ(
        'legalName',
        'Dénomination légale',
        'GATED',
        'Sans dénomination légale, la mention légale des documents émis au nom du mandant est incomplète.'
      ),
      champ(
        'address',
        'Adresse',
        'GATED',
        "Sans adresse, l'en-tête des documents émis au nom du mandant est incomplet."
      ),
      champ(
        'phone',
        'Téléphone',
        'OPEN',
        "Sans téléphone, l'en-tête des documents émis au nom du mandant ne l'affiche plus."
      ),
      champ(
        'email',
        'E-mail',
        'OPEN',
        "Sans e-mail, l'en-tête des documents émis au nom du mandant ne l'affiche plus (le format reste vérifié s'il est renseigné)."
      ),
      champ(
        'rccm',
        'RCCM',
        'GATED',
        'Sans RCCM, la mention légale des documents émis au nom du mandant est incomplète.'
      ),
      champ(
        'taxId',
        'NIF',
        'GATED',
        'Sans NIF, la mention légale des documents émis au nom du mandant est incomplète.'
      ),
      champ(
        'logo',
        'Logo',
        'OPEN',
        "Masqué, le logo du mandant ne peut plus être ajouté ni remplacé depuis cet écran, et les documents n'en portent plus. Le logo se téléverse à part : il ne peut pas être rendu obligatoire.",
        FACULTATIF_OU_MASQUE
      ),
      champ(
        'signature',
        'Signature',
        'OPEN',
        "Masquée, la signature du mandant ne peut plus être ajoutée ni remplacée depuis cet écran, et les documents n'en portent plus. Elle se téléverse à part : elle ne peut pas être rendue obligatoire.",
        FACULTATIF_OU_MASQUE
      ),
      champ(
        'stamp',
        'Cachet',
        'OPEN',
        "Masqué, le cachet du mandant ne peut plus être ajouté ni remplacé depuis cet écran, et les documents n'en portent plus. Il se téléverse à part : il ne peut pas être rendu obligatoire.",
        FACULTATIF_OU_MASQUE
      )
    ]
  },
  {
    formKey: 'syndic.profil-proprietaire',
    module: 'syndic',
    label: 'Nouveau profil propriétaire',
    audience: 'agency',
    fields: [
      champ(
        'portalAccessEnabled',
        'Activer accès portail',
        'GATED',
        "Masqué, le profil est créé sans accès au portail : aucune invitation au portail copropriétaire n'est possible tant que l'accès n'est pas activé ailleurs."
      )
    ]
  },
  {
    formKey: 'syndic.incident-creation',
    module: 'syndic',
    label: 'Nouvel incident',
    audience: 'agency',
    fields: [
      champ(
        'lotId',
        'Lot',
        'GATED',
        "Sans lot, l'incident est rattaché aux parties communes et ne peut plus être imputé à un propriétaire."
      )
    ]
  },
  {
    formKey: 'syndic.incident-modification',
    module: 'syndic',
    label: "Modifier l'incident et affecter un prestataire",
    audience: 'agency',
    fields: [
      champ(
        'providerId',
        'Prestataire',
        'GATED',
        "Masqué, l'affectation d'un prestataire à l'incident n'est plus possible depuis l'écran ni depuis le tableau ; le prestataire déjà affecté reste affiché."
      ),
      champ(
        'resolvedAt',
        'Date de résolution',
        'GATED',
        "Masquée, la date de résolution n'est plus enregistrée quand l'incident passe au statut résolu ou clos."
      )
    ]
  },
  {
    formKey: 'syndic.incident-imputation',
    module: 'syndic',
    label: "Imputation d'incident",
    audience: 'agency',
    fields: [
      champ(
        'budgetLineId',
        'Poste de budget',
        'GATED',
        "Sans poste de budget, l'imputation n'est rattachée à aucune ligne du budget de la copropriété."
      ),
      champ(
        'contractId',
        'Contrat',
        'GATED',
        "Sans contrat, l'imputation n'est pas rattachée au contrat de maintenance concerné."
      ),
      champ(
        'lotId',
        'Lot',
        'GATED',
        "Sans lot, l'imputation ne peut pas être portée au compte du propriétaire d'un lot."
      ),
      champ('notes', 'Notes', 'OPEN', "Commentaire libre : masqué ou facultatif, rien n'en dépend.")
    ]
  }
];
