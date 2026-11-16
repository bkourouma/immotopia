import type { FormDefinition } from '../types';

/**
 * Formulaires Syndic « assemblées générales ».
 * fieldKey = clé exacte du corps JSON envoyé à l'API. Les champs absents d'ici
 * (type, date, heure de début à la création, titre, ordre…) ne sont jamais réglables.
 */
export const FORMS: FormDefinition[] = [
  {
    formKey: 'syndic.assemblee-creation',
    module: 'syndic',
    label: 'Créer une assemblée générale',
    audience: 'agency',
    fields: [
      {
        key: 'endTime',
        label: 'Heure de fin',
        fieldClass: 'OPEN',
        defaultMode: 'OPTIONAL',
        allowedModes: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
        consequence: "Sans heure de fin, la durée prévue de l'assemblée n'est pas connue."
      },
      {
        key: 'location',
        label: 'Lieu',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
        consequence:
          "Mention de la convocation : sans lieu, la convocation envoyée aux copropriétaires n'indique pas où se tient l'assemblée."
      },
      {
        key: 'sendConvocation',
        label: 'Envoyer les convocations maintenant',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ['OPTIONAL', 'HIDDEN'],
        consequence:
          "Case qui déclenche l'envoi des notifications de convocation dès la création : masquée, les convocations ne partent qu'à l'envoi manuel depuis l'assemblée."
      }
    ]
  },
  {
    // Regroupe « Informations de l'assemblée » (bandeau du détail) et « Lien de visioconférence »
    // (console en direct) : même PATCH /assemblees/:meetingId.
    formKey: 'syndic.assemblee-informations',
    module: 'syndic',
    label: "Informations de l'assemblée (heures, lieu et visioconférence)",
    audience: 'agency',
    fields: [
      {
        key: 'startTime',
        label: 'Heure de début',
        fieldClass: 'OPEN',
        defaultMode: 'OPTIONAL',
        allowedModes: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
        consequence:
          "Sans heure de début renseignée ici, la convocation n'affiche pas l'heure de l'assemblée (l'heure fixée à la création n'est pas modifiable)."
      },
      {
        key: 'endTime',
        label: 'Heure de fin',
        fieldClass: 'OPEN',
        defaultMode: 'OPTIONAL',
        allowedModes: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
        consequence: "Sans heure de fin, la durée prévue de l'assemblée n'est pas connue."
      },
      {
        key: 'location',
        label: 'Lieu',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
        consequence: "Mention de la convocation : sans lieu, la convocation n'indique pas où se tient l'assemblée."
      },
      {
        key: 'videoConferenceUrl',
        label: 'Lien de visioconférence',
        fieldClass: 'GATED',
        defaultMode: 'OPTIONAL',
        allowedModes: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
        consequence:
          'Sans lien, pas de visioconférence externe pour les participants à distance (seules les adresses https sont acceptées).'
      }
    ]
  },
  {
    formKey: 'syndic.assemblee-resolution',
    module: 'syndic',
    label: 'Ajouter une résolution',
    audience: 'agency',
    fields: [
      {
        key: 'description',
        label: 'Description',
        fieldClass: 'OPEN',
        defaultMode: 'OPTIONAL',
        allowedModes: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
        consequence:
          "Sans description, les copropriétaires n'ont que le titre pour comprendre la résolution soumise au vote."
      }
    ]
  },
  {
    formKey: 'syndic.assemblee-ordre-du-jour',
    module: 'syndic',
    label: "Point d'ordre du jour",
    audience: 'agency',
    fields: [
      {
        key: 'discussions',
        label: 'Discussions',
        fieldClass: 'OPEN',
        defaultMode: 'OPTIONAL',
        allowedModes: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
        consequence:
          "Sans détails de discussion, le point d'ordre du jour n'a que son titre dans la convocation et le procès-verbal."
      }
    ]
  }
];
