import type { HelpEntry } from '../../types';

/** Fiches d'aide du module « locatif » (fr). */
const entries: HelpEntry[] = [
  {
    id: 'locatif.baux.liste',
    kind: 'page',
    title: 'Liste des baux',
    summary:
      "Retrouvez ici tous les baux de votre agence, avec le bien, le locataire, la période, le montant et le statut de chacun. C'est le point de départ pour créer, ouvrir, modifier ou supprimer un bail.",
    purpose:
      'Un bail relie un bien à son locataire pour une période donnée, avec un loyer. Chaque bail ouvre sa propre fiche, où vous suivez ses échéances, ses paiements et ses documents.',
    steps: [
      {
        title: 'Créer un bail',
        detail: 'Cliquez sur « Nouveau bail », puis remplissez le formulaire : bien, locataire, dates, loyer.'
      },
      {
        title: 'Rechercher',
        detail: 'Tapez un numéro de bail, un bien ou un nom de locataire dans le champ de recherche.'
      },
      {
        title: 'Filtrer',
        detail: 'Réduisez la liste avec les filtres Statut, Locataire et Bien.'
      },
      {
        title: 'Ouvrir un bail',
        detail: 'Cliquez sur « Voir ». Depuis la fiche, vous changez le statut : suspendre, terminer, annuler.'
      },
      {
        title: 'Modifier un bail',
        detail: 'Menu « ⋮ » de la ligne, puis « Modifier le bail ».'
      },
      {
        title: 'Supprimer un bail',
        detail: 'Menu « ⋮ », puis « Supprimer » et confirmez.'
      },
      {
        title: 'Exporter',
        detail:
          'Bouton « Exporter » : Excel, CSV ou PDF. Tous les baux correspondant à vos filtres sont exportés, pas seulement la page affichée.'
      }
    ],
    consequences: [
      "Un nouveau bail est créé directement « Actif », sans passer par « Brouillon ». Le bien passe à « Loué » (ou « Vendu » s'il n'est proposé qu'à la vente) ; si son état ne le permet pas, le bail est créé et le bien reste inchangé.",
      "À la création, le locataire et le propriétaire sont prévenus par e-mail (si cette notification est activée pour votre agence) et par WhatsApp (si votre agence l'a configuré). Sans compte, un compte leur est créé et le message contient le lien pour choisir un mot de passe.",
      'La création ne génère ni échéances ni documents : les échéances se génèrent ensuite depuis la fiche du bail.',
      'Si vous modifiez le loyer, les échéances à venir sont recalculées ; celles déjà payées, commencées ou échues ne changent pas.',
      'La suppression est irréversible : le bail et ses échéances sont effacés. Elle est refusée si un paiement est rattaché à une échéance. Pour garder une trace, préférez terminer ou annuler le bail.'
    ],
    faq: [
      {
        q: 'Pourquoi mon nouveau bail est-il déjà « Actif » ?',
        a: "Un bail créé depuis le formulaire est activé tout de suite : vérifiez les informations avant d'enregistrer."
      },
      {
        q: 'Comment terminer ou suspendre un bail ?',
        a: 'Ouvrez sa fiche avec « Voir » et changez son statut. Un bail « Terminé » ou « Annulé » ne change plus de statut. Le bien repasse à « Disponible » si aucun autre bail actif ne le concerne.'
      },
      {
        q: 'Je ne vois pas « Nouveau bail » ou le menu « ⋮ ». Pourquoi ?',
        a: "Ces actions dépendent de vos droits : « Créer des baux » pour créer, « Modifier les baux » pour modifier, changer le statut ou supprimer. Demandez-les à l'administrateur de votre agence."
      },
      {
        q: 'Pourquoi le montant est-il parfois le prix du bien ?',
        a: "Un bien proposé uniquement à la vente n'a pas de loyer : son prix est affiché à la place."
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Voir la liste demande « Voir les baux », créer demande « Créer des baux », modifier, changer le statut et supprimer demandent « Modifier les baux ».'
    },
    related: [
      { label: 'Comment lire le tableau des baux', helpId: 'locatif.baux.liste.tableau' },
      { label: 'Créer un nouveau bail', to: '/tenant/:tenantId/rental/leases/new' }
    ],
    keywords: [
      'bail',
      'baux',
      'contrat de location',
      'contrat',
      'location',
      'locataire',
      'loyer',
      'créer un bail',
      'supprimer un bail',
      'résilier',
      'export'
    ],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'baux-nouveau',
          title: 'Créer un bail',
          description: "Ce bouton ouvre le formulaire de création. Le bail est actif dès qu'il est enregistré."
        },
        {
          target: 'baux-tableau',
          title: 'La liste des baux',
          description: 'Cliquez sur « Voir » pour ouvrir un bail, ou sur « ⋮ » pour le modifier ou le supprimer.'
        }
      ]
    }
  },
  {
    id: 'locatif.baux.liste.tableau',
    kind: 'table',
    title: 'Tableau des baux',
    summary:
      'Chaque ligne est un bail de votre agence. Le tableau montre le bien, le locataire, la période, le montant de référence et le statut.',
    howToRead: {
      columns: [
        {
          key: 'bail',
          label: 'Bail',
          description: 'Le numéro du bail, avec en dessous le bien concerné.'
        },
        {
          key: 'locataire',
          label: 'Locataire',
          description: 'Le locataire principal du bail.'
        },
        {
          key: 'periode',
          label: 'Période',
          description:
            "Les dates de début et de fin du bail. Un tiret (—) à la place d'une date signifie qu'aucune date n'est enregistrée, par exemple pas de date de fin."
        },
        {
          key: 'montant',
          label: 'Montant',
          description:
            "Le loyer du bail en FCFA. Si le bien est uniquement proposé à la vente, c'est le prix du bien qui est affiché."
        },
        {
          key: 'statut',
          label: 'Statut',
          description: "L'état actuel du bail (voir les statuts ci-dessous)."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Voir » ouvre la fiche du bail. Le menu « ⋮ » propose « Modifier le bail » et « Supprimer ».'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description: 'Bail préparé mais pas encore en vigueur. Il peut être activé ou annulé.'
        },
        {
          value: 'ACTIVE',
          label: 'Actif',
          description: "Bail en cours. C'est l'état d'un bail à sa création. Il peut être suspendu, terminé ou annulé."
        },
        {
          value: 'SUSPENDED',
          label: 'Suspendu',
          description: 'Bail mis en pause. Il peut être réactivé, terminé ou annulé.'
        },
        {
          value: 'ENDED',
          label: 'Terminé',
          description: 'Bail arrivé à son terme. Son statut ne peut plus changer.'
        },
        {
          value: 'CANCELED',
          label: 'Annulé',
          description: 'Bail annulé. Son statut ne peut plus changer.'
        }
      ],
      notes: [
        'Sur téléphone ou petit écran, le tableau devient une liste de cartes : les mêmes informations y sont présentées, avec le menu « ⋮ » sur chaque carte.',
        "Le bouton « Exporter » propose Excel, CSV et PDF. L'export contient tous les baux qui correspondent à vos filtres, pas seulement la page affichée. Dans le fichier, le montant est un nombre que vous pouvez additionner.",
        "La liste n'est pas triable par colonne : utilisez la recherche et les filtres pour retrouver un bail."
      ]
    },
    steps: [
      {
        title: 'Retrouver un bail précis',
        detail: "Tapez son numéro, le nom du locataire ou l'adresse du bien dans la recherche."
      },
      {
        title: 'Voir tous les baux Actifs',
        detail: 'Choisissez le filtre Statut puis « Actif ».'
      }
    ],
    consequences: [
      'Changer de filtre ou de recherche ne modifie aucun bail : cela change seulement ce qui est affiché et ce qui sera exporté.'
    ],
    faq: [
      {
        q: 'Le locataire affiché est-il le seul du bail ?',
        a: "Non, c'est le locataire principal. Les éventuels colocataires se consultent sur la fiche du bail."
      },
      {
        q: 'Que signifie un tiret dans la colonne Période ?',
        a: "Aucune date n'est enregistrée à cet endroit, par exemple un bail sans date de fin."
      }
    ],
    related: [{ label: "Vue d'ensemble de la liste des baux", helpId: 'locatif.baux.liste' }],
    keywords: ['colonnes', 'statuts', 'tableau', 'export', 'excel', 'csv', 'pdf', 'montant', 'période']
  }
];

export default entries;
