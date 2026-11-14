import type { HelpEntry } from '../../../types';

/** Zone « baux » du module « locatif » (fr). */
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
  },
  {
    id: 'locatif.baux.nouveau',
    kind: 'page',
    title: 'Créer un bail',
    summary:
      'Cet assistant crée un bail en cinq étapes : le bien, le locataire, les montants, les pénalités et vos notes. Le bail est actif dès que vous cliquez sur « Créer le bail ».',
    purpose:
      'Un bail relie un bien à un locataire pour une période et un loyer. Pour un bien proposé uniquement à la vente, les étapes « Informations financières » et « Pénalités » disparaissent : il ne reste que trois étapes.',
    steps: [
      {
        title: 'Informations générales',
        detail:
          "Choisissez le bien et la date de début. La date de fin, la date d'emménagement et la date de déménagement sont facultatives."
      },
      {
        title: 'Parties impliquées',
        detail:
          'Choisissez le locataire principal. Le propriétaire est facultatif ; il est proposé automatiquement quand le bien en a un.'
      },
      {
        title: 'Informations financières',
        detail:
          "Indiquez la devise, la fréquence de facturation, le jour d'échéance, le loyer, les charges et le dépôt de garantie."
      },
      {
        title: 'Pénalités',
        detail: 'Étape facultative : jours de grâce, puis pourcentage du solde ou montant fixe.'
      },
      {
        title: 'Notes',
        detail: 'Ajoutez un commentaire libre si vous le souhaitez.'
      },
      {
        title: 'Créer le bail',
        detail:
          'Sur la dernière étape, cliquez sur « Créer le bail ». « Précédent » permet de revenir corriger une étape.'
      }
    ],
    consequences: [
      'Le bail est créé « Actif » tout de suite, avec un numéro automatique de la forme BAIL-année-numéro. Vous revenez ensuite à la liste des baux.',
      "Le bien passe à « Loué » (ou « Vendu » s'il n'est proposé qu'à la vente). Si son état ne le permet pas, le bail est créé et le bien reste inchangé.",
      "Un bien ne peut avoir qu'un seul bail en cours sur une même période : si les dates se chevauchent avec un autre bail, la création est refusée.",
      "Le locataire et le propriétaire sont prévenus par e-mail (si cette notification est activée pour votre agence) et par WhatsApp (si votre agence l'a configuré). Une personne sans compte en reçoit un, avec le lien pour choisir son mot de passe.",
      "La création ne génère ni échéances ni documents : les échéances se génèrent ensuite depuis l'onglet « Échéances » de la fiche du bail."
    ],
    faq: [
      {
        q: 'Je ne trouve pas mon bien dans la liste. Pourquoi ?',
        a: "Seuls les biens proposés à la location apparaissent. Les biens déjà « Loué » ou « Vendu » et les immeubles qui contiennent des appartements n'y figurent pas : créez le bail sur l'appartement."
      },
      {
        q: "Mon locataire n'est pas dans la liste. Que faire ?",
        a: "Le locataire doit exister comme contact dans votre agence. Ajoutez-le d'abord dans les contacts, puis revenez à l'assistant."
      },
      {
        q: 'Le bouton « Suivant » est grisé. Pourquoi ?',
        a: "Un champ obligatoire de l'étape est vide ou contient une valeur incorrecte (par exemple un loyer à 0 ou un jour d'échéance hors de 1 à 31). Le message d'erreur s'affiche sous le champ."
      },
      {
        q: "Que se passe-t-il si l'enregistrement est refusé ?",
        a: "Un message rouge explique la raison. Quand elle concerne une autre étape, le bouton « Revenir à l'étape » vous y ramène."
      },
      {
        q: 'Pourra-t-on tout modifier ensuite ?',
        a: "Non. Le bien, le locataire, le propriétaire, la date de début, le jour d'échéance et la devise ne se changent plus une fois le bail créé."
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: "Créer un bail demande « Créer des baux ». Sans ce droit, le bouton « Nouveau bail » ne s'affiche pas."
    },
    related: [
      { label: 'Liste des baux', helpId: 'locatif.baux.liste' },
      { label: "Fiche d'un bail", helpId: 'locatif.baux.fiche' },
      { label: 'Modifier un bail', helpId: 'locatif.baux.edition' },
      { label: 'Échéances de loyer', helpId: 'locatif.echeances.liste' }
    ],
    keywords: [
      'nouveau bail',
      'créer un bail',
      'contrat de location',
      'assistant',
      'locataire',
      'loyer',
      'dépôt de garantie',
      'caution'
    ],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'bail-etapes',
          title: 'Les étapes',
          description:
            'La barre du haut montre où vous en êtes. Vous pouvez revenir à une étape déjà remplie en cliquant dessus.'
        },
        {
          target: 'bail-bien',
          title: 'Le bien loué',
          description: "Choisissez d'abord le bien. Le loyer et le propriétaire sont proposés d'après sa fiche."
        },
        {
          target: 'bail-dates',
          title: 'Les dates',
          description: 'La date de début est obligatoire. Sans date de fin, le bail est à durée indéterminée.'
        },
        {
          target: 'bail-navigation',
          title: 'Avancer et créer',
          description:
            "« Suivant » passe à l'étape suivante. Sur la dernière étape, « Créer le bail » enregistre le bail, qui est alors actif."
        }
      ]
    }
  },
  {
    id: 'locatif.baux.nouveau.general',
    kind: 'section',
    title: 'Étape « Informations générales »',
    summary: 'Vous choisissez le bien loué et la période du bail. Le bien et la date de début sont obligatoires.',
    howToRead: {
      notes: [
        "Propriété : la liste affiche le propriétaire, le titre du bien et, entre parenthèses, l'immeuble qui le contient.",
        'Date de fin : doit être après la date de début. Laissez-la vide pour un bail sans date de fin.',
        "Date d'emménagement et date de déménagement : facultatives, à titre d'information."
      ]
    },
    steps: [
      { title: 'Choisir le bien', detail: 'Tapez dans le champ « Propriété » pour rechercher un bien.' },
      { title: 'Saisir la date de début', detail: 'Elle est obligatoire.' },
      { title: 'Saisir la date de fin si elle est connue', detail: 'Elle doit suivre la date de début.' },
      { title: 'Cliquer sur « Suivant »', detail: 'Le bouton reste grisé tant que le bien ou la date de début manque.' }
    ],
    consequences: [
      "Choisir un bien pré-remplit le loyer avec le prix de la fiche du bien, et la devise, s'ils y sont renseignés. Vous pouvez les corriger à l'étape financière.",
      'La date de début ne se modifie plus après la création du bail.'
    ],
    faq: [
      {
        q: 'Que se passe-t-il si le bien est uniquement à vendre ?',
        a: "Il est accepté : l'assistant saute alors les étapes financières et de pénalités, et le bail est créé avec un loyer de 0 FCFA."
      },
      {
        q: 'Puis-je créer un bail pour un bien déjà loué ?',
        a: "Un bien « Loué » n'est pas proposé. Et si un autre bail du bien couvre une partie de la même période, la création est refusée."
      },
      {
        q: 'Que signifie un bail sans date de fin ?',
        a: "C'est un bail à durée indéterminée : il reste actif jusqu'à ce que vous le résiliez ou changiez son statut."
      }
    ],
    related: [{ label: "Vue d'ensemble de la création", helpId: 'locatif.baux.nouveau' }],
    keywords: ['bien', 'propriété', 'date de début', 'date de fin', 'emménagement', 'déménagement']
  },
  {
    id: 'locatif.baux.nouveau.parties',
    kind: 'section',
    title: 'Étape « Parties impliquées »',
    summary: 'Vous désignez le locataire principal, obligatoire, et le propriétaire du bien, facultatif.',
    howToRead: {
      notes: [
        'Locataire principal : choisissez une personne parmi les contacts de votre agence. La liste affiche son nom et son e-mail.',
        "Propriétaire : proposé automatiquement quand l'e-mail du propriétaire du bien correspond à un contact. Vous pouvez le changer ou l'effacer.",
        "Pour une agence qui ne gère que son propre patrimoine, le champ « Propriétaire » n'est pas affiché."
      ]
    },
    steps: [
      { title: 'Choisir le locataire principal', detail: 'Tapez son nom pour le retrouver.' },
      { title: 'Vérifier le propriétaire', detail: 'Corrigez-le ou effacez-le si besoin.' }
    ],
    consequences: [
      "Le contact choisi est rattaché à votre agence comme locataire (ou comme propriétaire) s'il ne l'était pas déjà.",
      "Le locataire et le propriétaire sont prévenus de la création du bail ; un compte leur est créé s'ils n'en ont pas.",
      'Ces deux choix ne se modifient plus après la création du bail. Les colocataires se gèrent depuis la fiche du bail.'
    ],
    faq: [
      {
        q: 'Pourquoi le propriétaire est-il déjà rempli ?',
        a: 'Votre agence a renseigné un propriétaire sur la fiche du bien et son e-mail correspond à un contact. Vous pouvez le changer.'
      },
      {
        q: 'Le propriétaire est-il obligatoire ?',
        a: 'Non. Sans propriétaire, le bail est créé quand même, mais il ne sera pas rattaché à un propriétaire.'
      }
    ],
    related: [{ label: "Vue d'ensemble de la création", helpId: 'locatif.baux.nouveau' }],
    keywords: ['locataire', 'propriétaire', 'bailleur', 'contact', 'colocataire']
  },
  {
    id: 'locatif.baux.nouveau.finances',
    kind: 'section',
    title: 'Étape « Informations financières »',
    summary:
      "Vous fixez la devise, le rythme de facturation, le jour d'échéance et les montants du bail. Le loyer est obligatoire et doit être supérieur à 0.",
    howToRead: {
      notes: [
        'Devise : FCFA, EUR ou USD. FCFA est proposé par défaut.',
        'Fréquence de facturation : Mensuel, Trimestriel, Semestriel ou Annuel.',
        "Jour d'échéance (1-31) : jour du mois où le loyer est dû. Un nombre entier de 1 à 31 est exigé.",
        'Montant du loyer : obligatoire. Il est pré-rempli avec le prix de la fiche du bien, que vous pouvez corriger.',
        'Charges de service et Dépôt de garantie : facultatifs, à 0 si vous ne les saisissez pas.'
      ]
    },
    steps: [
      { title: 'Vérifier la devise et la fréquence' },
      { title: "Saisir le jour d'échéance" },
      { title: 'Saisir le montant du loyer', detail: 'Exemple : 150 000.' },
      { title: 'Saisir les charges et le dépôt de garantie', detail: "Laissez 0 s'il n'y en a pas." }
    ],
    consequences: [
      "Le dépôt de garantie saisi ici est le montant attendu ; son suivi se fait dans l'onglet « Dépôt de garantie » de la fiche du bail.",
      "Le jour d'échéance et la devise ne se modifient plus après la création. Le loyer, les charges, le dépôt et la fréquence se modifient ensuite.",
      "Aucun montant n'est calculé à cette étape : les échéances sont générées plus tard, depuis la fiche du bail, avec ces montants."
    ],
    faq: [
      {
        q: 'Que se passe-t-il si je saisis le jour 31 ?',
        a: "Le jour 31 est accepté. Dans un mois plus court, l'échéance tombe le dernier jour du mois."
      },
      {
        q: 'Les charges sont-elles incluses dans le loyer ?',
        a: 'Non, elles sont séparées. Chaque échéance additionne le loyer et les charges de service.'
      },
      {
        q: 'Pourquoi le loyer est-il déjà rempli ?',
        a: 'Il reprend le prix de la fiche du bien. Corrigez-le si le loyer convenu est différent.'
      }
    ],
    related: [
      { label: "Vue d'ensemble de la création", helpId: 'locatif.baux.nouveau' },
      { label: 'Échéances de loyer', helpId: 'locatif.echeances.liste' }
    ],
    keywords: ['loyer', 'charges', 'dépôt de garantie', 'caution', 'devise', 'fréquence', "jour d'échéance", 'montant']
  },
  {
    id: 'locatif.baux.nouveau.penalites',
    kind: 'section',
    title: 'Étape « Pénalités »',
    summary:
      "Vous prévoyez ici la pénalité due en cas de retard de paiement. Cette étape est facultative : sans rien saisir, aucune pénalité n'est prévue.",
    howToRead: {
      notes: [
        "Jours de grâce pour pénalités : nombre de jours avant l'application des pénalités.",
        'Mode de pénalité : « Pourcentage du solde » ou « Montant fixe ».',
        'Taux de pénalité (%) : affiché avec « Pourcentage du solde ». La pénalité se calcule sur le solde impayé.',
        'Montant maximum de pénalité (optionnel) : plafond, affiché avec « Pourcentage du solde ».',
        "Montant fixe de pénalité : affiché avec « Montant fixe ». Il s'applique par période de retard."
      ]
    },
    steps: [
      { title: 'Fixer les jours de grâce', detail: '0 pour appliquer la pénalité dès le retard.' },
      { title: 'Choisir le mode de pénalité' },
      { title: 'Saisir le taux, ou le montant fixe', detail: 'Selon le mode choisi.' },
      { title: 'Saisir un plafond si vous le souhaitez', detail: 'Uniquement en mode pourcentage.' }
    ],
    consequences: [
      "Ces réglages sont enregistrés dans le bail. Les pénalités elles-mêmes sont calculées ensuite sur les échéances en retard : elles se consultent dans l'onglet « Pénalités » de la fiche du bail.",
      "Le choix des pénalités se fait à la création : le formulaire de modification d'un bail ne les propose pas."
    ],
    faq: [
      {
        q: 'Dois-je remplir cette étape ?',
        a: 'Non. Cliquez sur « Suivant » pour la passer : aucune pénalité ne sera prévue dans le bail.'
      },
      {
        q: 'Que veut dire « Pourcentage du solde » ?',
        a: "La pénalité est un pourcentage du montant resté impayé. Le plafond, s'il existe, limite le montant de la pénalité."
      }
    ],
    related: [{ label: "Vue d'ensemble de la création", helpId: 'locatif.baux.nouveau' }],
    keywords: ['pénalité', 'retard', 'jours de grâce', 'taux', 'plafond', 'montant fixe']
  },
  {
    id: 'locatif.baux.edition',
    kind: 'page',
    title: 'Modifier un bail',
    summary:
      "Ce formulaire corrige les informations d'un bail existant : dates de fin, d'emménagement et de déménagement, montants, fréquence de facturation et notes. Les autres informations sont figées.",
    purpose:
      "Utilisez-le pour une correction simple. Pour un changement de loyer daté, un renouvellement ou une résiliation, passez plutôt par l'onglet « Vie du bail » de la fiche : il garde la trace de chaque événement.",
    howToRead: {
      notes: [
        "Figés après la création : le bien, le locataire principal, le propriétaire, la date de début, le jour d'échéance et la devise. Ces champs sont grisés.",
        "Modifiables : la date de fin, la date d'emménagement, la date de déménagement, la fréquence de facturation, le loyer, les charges de service, le dépôt de garantie et les notes.",
        "Vider une date de fin ou de déménagement l'efface du bail."
      ]
    },
    steps: [
      { title: 'Modifier les champs', detail: 'Changez les valeurs voulues dans le formulaire.' },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Mettre à jour ». « Annuler » ferme le formulaire sans rien enregistrer.'
      }
    ],
    consequences: [
      "Si le loyer ou les charges changent, les échéances qui n'ont pas encore commencé et sans aucun paiement sont recalculées. Un message indique combien. Les échéances payées, commencées ou échues ne changent pas.",
      "Si le dépôt de garantie change, le montant attendu du dépôt déjà ouvert suit ; aucun mouvement enregistré n'est modifié.",
      "Aucun e-mail ni message n'est envoyé au locataire ou au propriétaire.",
      "Après l'enregistrement, vous revenez à la liste des baux."
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas changer le locataire ou la date de début ?',
        a: "Ces informations sont figées une fois le bail créé, car tout l'historique s'y rattache. Si elles sont fausses, créez un nouveau bail."
      },
      {
        q: 'Quelle différence avec « Réviser le loyer » ?',
        a: "Ici, le nouveau loyer s'applique aux échéances à venir sans date d'effet ni historique. La révision du loyer, dans « Vie du bail », choisit un mois d'effet et garde une trace."
      },
      {
        q: 'Comment changer le statut du bail ?',
        a: 'Depuis la fiche du bail, avec la liste de statuts en haut de la page.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Modifier un bail demande « Modifier les baux ».'
    },
    related: [
      { label: "Fiche d'un bail", helpId: 'locatif.baux.fiche' },
      { label: 'Liste des baux', helpId: 'locatif.baux.liste' }
    ],
    keywords: ['modifier un bail', 'corriger', 'loyer', 'date de fin', 'dépôt de garantie', 'notes']
  },
  {
    id: 'locatif.baux.fiche',
    kind: 'page',
    title: "Fiche d'un bail",
    summary:
      'La fiche réunit tout ce qui concerne un bail : ses informations, ses honoraires de gestion et, en bas, les onglets pour suivre échéances, paiements, signatures et documents. Vous y changez aussi le statut du bail.',
    purpose:
      "C'est l'écran de travail de chaque bail. Les cartes du haut résument le contrat ; les onglets du bas servent au suivi quotidien.",
    steps: [
      {
        title: 'Lire le résumé',
        detail: 'Les cartes montrent le bien, le locataire, les dates, les montants et les pénalités.'
      },
      { title: 'Changer le statut', detail: 'Utilisez la liste de statuts en haut à droite.' },
      { title: 'Modifier le bail', detail: 'Cliquez sur « Modifier » pour corriger les informations.' },
      {
        title: 'Suivre le bail',
        detail:
          'Utilisez les onglets : Échéances, Paiements, Pénalités, Dépôt de garantie, Vie du bail, États des lieux, Signatures, Prélèvements, Documents.'
      }
    ],
    consequences: [
      "Changer le statut en « Terminé » ou « Annulé » est définitif. Depuis « Actif » ou « Suspendu », le bien repasse à « Disponible » s'il n'a pas d'autre bail actif. Ni les échéances ni les paiements ne sont touchés.",
      "Pour un bien proposé uniquement à la vente, seules les cartes « Informations générales » et « Dates », les notes et l'onglet « Documents » sont affichés."
    ],
    faq: [
      {
        q: 'Pourquoi le bouton « Modifier » et la liste de statuts sont-ils absents ou grisés ?',
        a: 'Ils demandent le droit « Modifier les baux ». Sans lui, la fiche est en lecture seule.'
      },
      {
        q: "Où retrouver ce que j'ai fait sur le bail ?",
        a: "Dans l'onglet « Vie du bail », l'historique liste les révisions de loyer, renouvellements, avenants et résiliations."
      },
      {
        q: "Je ne vois pas l'onglet « Prélèvements ». Pourquoi ?",
        a: "Il demande le droit de voir les prélèvements bancaires. Demandez-le à l'administrateur de votre agence."
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Voir la fiche demande « Voir les baux ». Modifier, changer le statut, réviser, renouveler, résilier et enregistrer un avenant demandent « Modifier les baux ».'
    },
    related: [
      { label: 'Les onglets de la fiche', helpId: 'locatif.baux.fiche.onglets' },
      { label: 'Vie du bail', helpId: 'locatif.baux.fiche.vie' },
      { label: 'Modifier un bail', helpId: 'locatif.baux.edition' },
      { label: 'Liste des baux', helpId: 'locatif.baux.liste' }
    ],
    keywords: ['fiche du bail', 'détail du bail', 'statut', 'onglets', 'bail', 'locataire']
  },
  {
    id: 'locatif.baux.fiche.identite',
    kind: 'section',
    title: "Carte d'identité du bail et statut",
    summary:
      'La carte « Informations générales » donne le numéro du bail, son statut, le bien, le locataire principal et le propriétaire. Le statut se change avec la liste en haut à droite de la page.',
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: 'Bail préparé. Il peut passer à « Actif » ou « Annulé ».' },
        {
          value: 'ACTIVE',
          label: 'Actif',
          description: 'Bail en cours. Il peut passer à « Suspendu », « Terminé » ou « Annulé ».'
        },
        {
          value: 'SUSPENDED',
          label: 'Suspendu',
          description: 'Bail en pause. Il peut redevenir « Actif », ou passer à « Terminé » ou « Annulé ».'
        },
        { value: 'ENDED', label: 'Terminé', description: 'Bail arrivé à son terme. Son statut ne change plus.' },
        { value: 'CANCELED', label: 'Annulé', description: 'Bail annulé. Son statut ne change plus.' }
      ],
      notes: [
        'Le nom du locataire et celui du propriétaire ouvrent leur fiche de contact.',
        "Si aucun propriétaire n'est rattaché au bail, la mention « Non renseigné » s'affiche."
      ]
    },
    steps: [
      { title: 'Ouvrir la liste des statuts', detail: 'Elle se trouve en haut à droite de la fiche.' },
      {
        title: 'Choisir le nouveau statut',
        detail: "Le changement s'applique tout de suite. Un changement non permis est refusé avec un message."
      }
    ],
    consequences: [
      'Passer à « Terminé » ou « Annulé » depuis « Actif » ou « Suspendu » est définitif. Le bien repasse à « Disponible » si aucun autre bail actif ne le concerne.',
      'Activer un bail ou le réactiver est refusé si sa période chevauche un autre bail du même bien.',
      "Changer le statut ne génère, n'annule ni ne modifie aucune échéance, et n'envoie aucun message. Pour une fin de bail avec préavis et annulation des échéances futures, utilisez « Résilier le bail »."
    ],
    faq: [
      {
        q: 'Quelle différence entre « Terminé » et « Résilier le bail » ?',
        a: '« Terminé » change seulement le statut. « Résilier le bail », dans « Vie du bail », enregistre le préavis, fixe la fin, annule les échéances non payées après la fin et calcule le solde de tout compte.'
      },
      {
        q: 'Pourquoi mon changement de statut est-il refusé ?',
        a: 'Certains passages sont interdits, par exemple depuis « Terminé » ou « Annulé ». Le message indique de quel statut à quel statut.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Changer le statut demande « Modifier les baux ».' },
    related: [
      { label: "Vue d'ensemble de la fiche", helpId: 'locatif.baux.fiche' },
      { label: 'Vie du bail', helpId: 'locatif.baux.fiche.vie' }
    ],
    keywords: ['statut', 'actif', 'suspendu', 'terminé', 'annulé', 'brouillon', 'numéro de bail']
  },
  {
    id: 'locatif.baux.fiche.financier',
    kind: 'section',
    title: 'Carte « Financier »',
    summary:
      "Cette carte rappelle le loyer, les charges de service, le dépôt de garantie, la fréquence de facturation et le jour d'échéance du bail.",
    howToRead: {
      notes: [
        "Les montants sont ceux enregistrés sur le bail. Une révision de loyer prévue pour plus tard n'y apparaît qu'à sa date d'effet.",
        "Le jour d'échéance s'affiche sous la forme « Le 5 de chaque mois »."
      ]
    },
    consequences: [
      "C'est une carte de lecture. Pour changer un montant, utilisez « Modifier » ou « Réviser le loyer » dans « Vie du bail »."
    ],
    faq: [
      {
        q: 'Pourquoi cette carte est-elle absente ?',
        a: "Elle n'existe pas pour un bien proposé uniquement à la vente, qui n'a pas de loyer."
      },
      {
        q: 'Le loyer affiché est-il le loyer de ce mois ?',
        a: "C'est le loyer en vigueur sur le bail. Les échéances déjà générées gardent leur propre montant : consultez-les dans l'onglet « Échéances »."
      }
    ],
    related: [
      { label: 'Vie du bail', helpId: 'locatif.baux.fiche.vie' },
      { label: 'Échéances de loyer', helpId: 'locatif.echeances.liste' }
    ],
    keywords: ['loyer', 'charges', 'dépôt de garantie', 'fréquence', "jour d'échéance"]
  },
  {
    id: 'locatif.baux.fiche.penalites',
    kind: 'section',
    title: 'Carte « Pénalités de retard »',
    summary:
      'Cette carte rappelle la règle de pénalité prévue dans le bail : jours de grâce, mode, taux ou montant fixe, plafond éventuel.',
    howToRead: {
      notes: [
        "Jours de grâce : les pénalités s'appliquent après ce nombre de jours de retard. « Aucun » veut dire zéro jour.",
        "« Pourcentage du solde » : le taux s'applique sur le solde impayé ; le montant maximum limite la pénalité.",
        '« Montant fixe » : un montant fixe est appliqué par période de retard.',
        "« Pourcentage du loyer » : le taux s'applique sur le montant du loyer. Ce mode peut exister sur d'anciens baux."
      ]
    },
    consequences: [
      "C'est une carte de lecture : elle ne calcule rien. Les pénalités réellement dues apparaissent dans l'onglet « Pénalités »."
    ],
    faq: [
      {
        q: 'Comment changer la règle de pénalité ?',
        a: "Le formulaire de modification d'un bail ne la propose pas : elle se fixe à la création du bail."
      }
    ],
    related: [{ label: "Vue d'ensemble de la fiche", helpId: 'locatif.baux.fiche' }],
    keywords: ['pénalité', 'retard', 'jours de grâce', 'taux', 'plafond']
  },
  {
    id: 'locatif.baux.fiche.honoraires',
    kind: 'section',
    title: 'Honoraires et gestionnaire',
    summary:
      "Cette carte indique qui gère le bail et quels honoraires de gestion s'appliquent. Vous pouvez fixer des conditions propres à ce bail.",
    howToRead: {
      notes: [
        "Honoraires applicables : l'origine du taux est donnée. L'ordre de priorité est : conditions du bail, puis conditions du propriétaire, puis paramètres de l'agence.",
        "« Aucun taux fixé » : rien n'est paramétré nulle part. Le lien « Fixer le taux d'honoraires » mène aux paramètres financiers de l'agence.",
        "Mode « Pourcentage » : un taux, calculé sur « Le loyer seul » ou sur « Tout l'encaissé ». Mode « Forfait par échéance » : un montant fixe en FCFA par échéance."
      ]
    },
    steps: [
      {
        title: 'Choisir le gestionnaire',
        detail: 'Dans la liste « Aucun gestionnaire », choisissez un membre de votre agence, ou videz le champ.'
      },
      {
        title: 'Activer les conditions propres à ce bail',
        detail: "Utilisez l'interrupteur, puis choisissez le mode et saisissez le taux ou le forfait."
      },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer ». Le gestionnaire et les conditions sont enregistrés ensemble.'
      }
    ],
    consequences: [
      'Les honoraires sont calculés à chaque encaissement et figés : un changement de taux ne modifie pas les honoraires déjà comptés.',
      "Désactiver l'interrupteur puis enregistrer retire les conditions propres au bail : le taux du propriétaire ou de l'agence s'applique de nouveau."
    ],
    faq: [
      {
        q: 'Pourquoi est-il écrit « Aucun taux fixé » ?',
        a: "Aucun taux n'est défini pour ce bail, pour son propriétaire ni pour l'agence. Fixez-le dans les paramètres financiers ou ici, avec les conditions propres à ce bail."
      },
      {
        q: "Que change « Tout l'encaissé » par rapport à « Le loyer seul » ?",
        a: "Avec « Tout l'encaissé », le taux s'applique à toutes les sommes encaissées sur le bail. Avec « Le loyer seul », seule la part de loyer compte."
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: "Voir cette carte demande « Voir les baux ». L'enregistrement demande « Modifier les baux ». La carte est absente pour un bien proposé uniquement à la vente."
    },
    related: [{ label: "Vue d'ensemble de la fiche", helpId: 'locatif.baux.fiche' }],
    keywords: ['honoraires', 'commission', 'gestionnaire', 'agent', 'taux', 'forfait', 'gestion']
  },
  {
    id: 'locatif.baux.fiche.onglets',
    kind: 'section',
    title: 'Les onglets de la fiche',
    summary:
      "Sous les cartes, neuf onglets servent au suivi quotidien du bail. L'onglet affiché reste le même si vous rechargez la page.",
    howToRead: {
      notes: [
        'Échéances : les loyers à payer, mois par mois, avec leur statut.',
        'Paiements : les sommes reçues pour ce bail.',
        'Pénalités : les pénalités de retard calculées sur les échéances en retard.',
        'Dépôt de garantie : le dépôt attendu, encaissé, restitué ou conservé.',
        'Vie du bail : révision du loyer, renouvellement, avenant, résiliation et historique.',
        "États des lieux : l'état des lieux d'entrée et de sortie du logement.",
        "Signatures : l'envoi du bail à signer et le suivi des signatures.",
        'Prélèvements : le prélèvement bancaire du loyer (visible avec le droit de voir les prélèvements).',
        "Documents : les pièces du bail, par exemple l'avenant signé."
      ]
    },
    consequences: ["Pour un bien proposé uniquement à la vente, seul l'onglet « Documents » est affiché."],
    faq: [
      {
        q: 'Où générer les échéances du bail ?',
        a: "Dans l'onglet « Échéances » : la création du bail n'en génère aucune."
      },
      {
        q: 'Où est enregistré le contrat signé ?',
        a: "Dans l'onglet « Signatures » pour l'envoi et le suivi, et dans « Documents » pour les pièces déposées."
      }
    ],
    related: [
      { label: 'Échéances de loyer', helpId: 'locatif.echeances.liste' },
      { label: 'Paiements', helpId: 'locatif.paiements.liste' },
      { label: 'Prélèvements bancaires', helpId: 'locatif.prelevements.mandats' },
      { label: 'Signatures électroniques', helpId: 'locatif.signatures.liste' },
      { label: 'Vie du bail', helpId: 'locatif.baux.fiche.vie' }
    ],
    keywords: [
      'onglets',
      'échéances',
      'paiements',
      'pénalités',
      'dépôt',
      'états des lieux',
      'signatures',
      'prélèvements',
      'documents'
    ]
  },
  {
    id: 'locatif.baux.fiche.vie',
    kind: 'section',
    title: 'Vie du bail',
    summary:
      "Cet onglet regroupe les événements importants d'un bail : réviser le loyer, renouveler, enregistrer un avenant ou résilier. Chaque événement est gardé dans l'historique.",
    howToRead: {
      notes: [
        "Loyer en vigueur, Charges en vigueur et Date de fin : l'état actuel du bail.",
        'Les boutons « Réviser le loyer », « Renouveler » et « Résilier le bail » sont grisés une fois le bail résilié. « Enregistrer un avenant » reste possible.',
        'Un bandeau « Bail résilié — fin le … » apparaît après une résiliation.'
      ]
    },
    steps: [
      { title: 'Réviser le loyer', detail: "Pour un nouveau montant à partir d'un mois choisi." },
      { title: 'Renouveler', detail: 'Pour repousser la date de fin.' },
      { title: 'Enregistrer un avenant', detail: "Pour garder la trace d'une modification convenue." },
      { title: 'Résilier le bail', detail: 'Pour mettre fin au bail.' }
    ],
    consequences: [
      "Les quatre actions sont enregistrées dans l'historique avec le nom de la personne et la date.",
      "Aucune de ces actions n'envoie d'e-mail ni de message au locataire ou au propriétaire.",
      'La résiliation est définitive. La révision et le renouvellement ne peuvent plus se faire après une résiliation.'
    ],
    faq: [
      {
        q: 'Je ne vois pas les boutons. Pourquoi ?',
        a: "Les boutons demandent le droit « Modifier les baux ». Sans lui, vous consultez seulement l'état et l'historique."
      },
      {
        q: 'Que veut dire « échéance(s) déjà réglée(s) après la fin du bail » ?',
        a: 'Des échéances payées, même en partie, se situent après la date de fin. Elles ne sont pas annulées : régularisez-les par un avoir.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Consulter demande « Voir les baux ». Les quatre actions demandent « Modifier les baux ».'
    },
    related: [
      { label: 'Réviser le loyer', helpId: 'locatif.baux.fiche.vie.revision' },
      { label: 'Renouveler le bail', helpId: 'locatif.baux.fiche.vie.renouvellement' },
      { label: 'Enregistrer un avenant', helpId: 'locatif.baux.fiche.vie.avenant' },
      { label: 'Résilier le bail', helpId: 'locatif.baux.fiche.vie.resiliation' },
      { label: 'Historique du bail', helpId: 'locatif.baux.fiche.vie.historique' }
    ],
    keywords: ['vie du bail', 'révision', 'renouvellement', 'avenant', 'résiliation', 'historique']
  },
  {
    id: 'locatif.baux.fiche.vie.revision',
    kind: 'section',
    title: 'Réviser le loyer',
    summary:
      "Vous fixez un nouveau loyer, et de nouvelles charges si besoin, à partir d'un mois choisi. Les échéances concernées sont recalculées.",
    howToRead: {
      notes: [
        "Mois d'effet : le premier mois concerné. Il est proposé au mois suivant et ne peut pas précéder le début du bail.",
        "Taux de révision (%) : facultatif. S'il est saisi, il calcule le nouveau loyer à partir du loyer actuel ; vous pouvez ensuite corriger le montant.",
        'Nouveau loyer : obligatoire, supérieur à 0. Nouvelles charges : zéro ou plus, reprises du bail par défaut.',
        'Motif : texte libre, par exemple « révision annuelle indexée ».'
      ]
    },
    steps: [
      { title: 'Cliquer sur « Réviser le loyer »' },
      { title: "Choisir le mois d'effet" },
      { title: 'Saisir le taux ou le nouveau loyer' },
      { title: 'Vérifier les charges, ajouter un motif' },
      { title: 'Cliquer sur « Réviser »' }
    ],
    consequences: [
      "Les échéances de la période, non payées et sans aucun paiement, sont recalculées au nouveau montant ; l'écart est inscrit au compte du locataire.",
      "Si une échéance de cette période est déjà payée, même en partie, la révision est refusée : choisissez un mois d'effet plus tardif.",
      "Pour un mois d'effet à venir, le loyer du bail ne change qu'à cette date ; en attendant, la révision est seulement planifiée.",
      "La révision est inscrite dans l'historique. Elle ne s'annule pas depuis l'écran."
    ],
    faq: [
      {
        q: 'Que fait le taux de révision ?',
        a: "Il calcule le nouveau loyer : loyer actuel multiplié par le taux, arrondi au franc. Ce n'est qu'une aide, le montant reste modifiable."
      },
      {
        q: 'Pourquoi ma révision est-elle refusée ?',
        a: 'Soit des échéances de la période sont déjà payées, soit le bail est résilié ou annulé. Le message le précise.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Modifier les baux ».' },
    related: [{ label: 'Vie du bail', helpId: 'locatif.baux.fiche.vie' }],
    keywords: ['réviser', 'révision', 'augmentation', 'indexation', 'nouveau loyer', 'taux']
  },
  {
    id: 'locatif.baux.fiche.vie.renouvellement',
    kind: 'section',
    title: 'Renouveler le bail',
    summary:
      'Vous repoussez la date de fin du bail et, si vous le souhaitez, changez le loyer et les charges à partir du renouvellement.',
    howToRead: {
      notes: [
        'Nouvelle date de fin : obligatoire, postérieure à la fin actuelle.',
        "Nouveau loyer et Nouvelles charges : facultatifs. Un nouveau loyer s'applique au premier mois qui suit l'ancienne fin.",
        'Observations : texte libre.'
      ]
    },
    steps: [
      { title: 'Cliquer sur « Renouveler »' },
      { title: 'Choisir la nouvelle date de fin' },
      { title: 'Saisir un nouveau loyer si besoin' },
      { title: 'Cliquer sur « Renouveler »' }
    ],
    consequences: [
      "Les échéances manquantes, depuis le mois qui suit l'ancienne fin jusqu'à la nouvelle fin, sont créées. Le nombre est indiqué dans l'historique.",
      "Un nouveau loyer est aussi inscrit comme une révision dans l'historique.",
      'Un bail au statut « Terminé » (sans avoir été résilié) qui est renouvelé redevient « Actif ».',
      'La nouvelle période ne doit pas chevaucher un autre bail du même bien, sinon le renouvellement est refusé.'
    ],
    faq: [
      {
        q: 'Puis-je renouveler un bail sans date de fin ?',
        a: "Non : un bail à durée indéterminée n'a pas de fin à repousser."
      },
      {
        q: 'Puis-je renouveler un bail résilié ?',
        a: 'Non. Un bail résilié ou annulé ne se renouvelle plus.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Modifier les baux ».' },
    related: [{ label: 'Vie du bail', helpId: 'locatif.baux.fiche.vie' }],
    keywords: ['renouveler', 'prolonger', 'reconduire', 'nouvelle date de fin']
  },
  {
    id: 'locatif.baux.fiche.vie.avenant',
    kind: 'section',
    title: 'Enregistrer un avenant',
    summary:
      "Vous gardez dans l'historique la trace d'une modification convenue avec le locataire. L'avenant ne change aucun montant ni aucune date du bail.",
    howToRead: {
      notes: [
        "Date d'effet : proposée à aujourd'hui.",
        'Objet : obligatoire, par exemple « changement de destination du bien ».'
      ]
    },
    steps: [
      { title: 'Cliquer sur « Enregistrer un avenant »' },
      { title: "Choisir la date d'effet et décrire l'objet" },
      { title: 'Cliquer sur « Enregistrer »' },
      { title: "Déposer l'avenant signé", detail: "Dans l'onglet « Documents »." }
    ],
    consequences: [
      "Seule une ligne est ajoutée à l'historique. Aucun document n'est généré et rien n'est envoyé.",
      "Pour changer le loyer ou la fin, utilisez la révision, le renouvellement ou la résiliation : l'avenant seul ne les modifie pas."
    ],
    faq: [
      {
        q: "L'avenant se signe-t-il ici ?",
        a: "Non. L'avenant enregistré est une mention d'historique ; déposez le document signé dans l'onglet « Documents »."
      },
      {
        q: 'Peut-on enregistrer un avenant sur un bail résilié ?',
        a: "Oui, c'est le seul des quatre événements qui reste possible."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Modifier les baux ».' },
    related: [{ label: 'Vie du bail', helpId: 'locatif.baux.fiche.vie' }],
    keywords: ['avenant', 'modification du contrat', 'historique']
  },
  {
    id: 'locatif.baux.fiche.vie.resiliation',
    kind: 'section',
    title: 'Résilier le bail',
    summary:
      "Vous mettez fin au bail à une date donnée, en précisant le préavis et qui est à l'origine de la résiliation. Cette action est définitive.",
    howToRead: {
      notes: [
        'Date de préavis : jour où le préavis a été donné. Elle ne peut pas être après la date de fin.',
        'Date de fin : dernier jour du bail. Le mois de fin reste dû en entier, sans calcul au prorata.',
        "À l'initiative de : « Locataire », « Bailleur » ou « Accord amiable ».",
        'Date de sortie des lieux et Motif : facultatifs.'
      ]
    },
    steps: [
      { title: 'Cliquer sur « Résilier le bail »' },
      { title: 'Saisir les dates de préavis et de fin' },
      { title: "Choisir à l'initiative de qui" },
      { title: 'Cliquer sur « Résilier », puis confirmer', detail: 'Une fenêtre demande une confirmation.' }
    ],
    consequences: [
      'Cette action est définitive. Les échéances des mois suivant le mois de fin, sans aucun paiement, sont annulées et leur facturation est contre-passée au compte du locataire.',
      'Les échéances payées, même en partie, après la fin ne sont pas annulées : un bandeau demande de les régulariser par un avoir.',
      "Si la date de fin est passée, le bail passe à « Terminé » et, s'il était « Actif » ou « Suspendu », le bien repasse à « Disponible » quand il n'a pas d'autre bail actif. Si la fin est à venir, le statut ne change pas encore.",
      "Le solde de tout compte s'affiche ensuite. Aucun e-mail ni message n'est envoyé."
    ],
    faq: [
      {
        q: 'Peut-on annuler une résiliation ?',
        a: 'Non, pas depuis cet écran : la résiliation est définitive. Un bail résilié ne peut plus être révisé ni renouvelé.'
      },
      {
        q: 'Que deviennent les loyers déjà payés ?',
        a: 'Ils ne sont jamais touchés. Seuls les mois suivants non payés sont annulés.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Modifier les baux ».' },
    related: [
      { label: 'Solde de tout compte', helpId: 'locatif.baux.fiche.vie.solde' },
      { label: 'Vie du bail', helpId: 'locatif.baux.fiche.vie' }
    ],
    keywords: ['résilier', 'résiliation', 'préavis', 'fin de bail', 'départ du locataire', 'congé']
  },
  {
    id: 'locatif.baux.fiche.vie.solde',
    kind: 'section',
    title: 'Solde de tout compte',
    summary:
      "Une fois le bail résilié, cette carte compare le dépôt de garantie détenu, les impayés et les retenues de l'état des lieux de sortie. Elle dit ce qu'il faut restituer ou ce qui reste dû.",
    howToRead: {
      notes: [
        'Dépôt détenu : montant encaissé, moins ce qui a déjà été restitué ou conservé.',
        'Impayés : échéances échues non soldées, avec pénalités et frais.',
        "Retenues (état des lieux) : montants retenus saisis dans l'état des lieux de sortie, avec leur total.",
        'Résultat : « À restituer au locataire » si le dépôt couvre tout, « Reste dû par le locataire » sinon.'
      ]
    },
    consequences: [
      "C'est un calcul à lire : il ne restitue et n'encaisse rien. La restitution se fait dans l'onglet « Dépôt de garantie ».",
      "Si l'état des lieux de sortie n'est pas finalisé, un avertissement signale que les retenues peuvent encore changer."
    ],
    faq: [
      {
        q: 'Pourquoi le solde change-t-il ?',
        a: "Il suit les paiements, les échéances échues et l'état des lieux de sortie. Finalisez l'état des lieux pour figer les retenues."
      }
    ],
    related: [{ label: 'Résilier le bail', helpId: 'locatif.baux.fiche.vie.resiliation' }],
    keywords: ['solde de tout compte', 'restitution', 'dépôt', 'caution', 'retenues', 'impayés']
  },
  {
    id: 'locatif.baux.fiche.vie.historique',
    kind: 'section',
    title: 'Historique du bail',
    summary:
      "La liste montre, du plus récent au plus ancien, chaque révision, renouvellement, avenant et résiliation, avec qui l'a fait et quand.",
    howToRead: {
      notes: [
        'Chaque ligne est une phrase complète : par exemple le loyer avant et après une révision, ou la nouvelle date de fin.',
        'La ligne du dessous indique « Par … , le … » : la personne et la date de saisie. « Système » désigne une action automatique.'
      ]
    },
    consequences: ["L'historique ne se modifie pas et ne s'efface pas depuis l'écran."],
    faq: [
      {
        q: 'Que veut dire « échéance(s) recalculée(s) » ?',
        a: "C'est le nombre d'échéances dont le montant a changé à cause de la révision."
      }
    ],
    related: [{ label: 'Vie du bail', helpId: 'locatif.baux.fiche.vie' }],
    keywords: ['historique', 'événements', 'journal']
  }
];

export default entries;
