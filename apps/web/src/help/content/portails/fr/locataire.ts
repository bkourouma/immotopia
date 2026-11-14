import type { HelpEntry } from '../../../types';

/** Zone « locataire » du module « portails » (fr) : le portail du locataire. */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------- Accueil
  {
    id: 'portails.locataire.accueil',
    kind: 'page',
    title: 'Accueil du portail locataire',
    summary:
      "Votre tableau de bord de locataire : votre bail, vos retards, votre prochaine échéance, votre dépôt de garantie, vos derniers paiements et vos demandes d'incident. C'est l'écran de départ pour savoir où vous en êtes.",
    purpose:
      "Le portail vous permet de suivre votre location sans appeler l'agence : combien vous devez, quand, ce que vous avez déjà payé et où en sont vos demandes de réparation. Les chiffres viennent de l'agence qui gère votre bail.",
    steps: [
      {
        title: 'Regarder les retards',
        detail: 'La carte « Retard des échéances » compte les échéances non soldées dont la date est dépassée.'
      },
      {
        title: 'Repérer la prochaine échéance',
        detail:
          'La carte « Prochaine échéance » montre la plus ancienne échéance non soldée, avec son reste dû et sa date.'
      },
      {
        title: 'Payer',
        detail:
          "Ouvrez « Payer » dans le menu. Le bouton « Payer en ligne » de cet écran n'apparaît que si votre agence a activé le paiement en ligne et qu'il vous reste un montant dû."
      },
      {
        title: 'Vérifier vos paiements',
        detail: 'Les 5 derniers paiements réussis sont listés dans « Paiements récents ».'
      }
    ],
    consequences: [
      'Cet écran est en lecture seule : rien de ce que vous y faites ne modifie votre bail ni vos paiements.',
      "Si vous avez plusieurs baux actifs, la carte « Vos baux » donne le solde et les retards de chacun, et les chiffres des autres cartes sont cumulés sur l'ensemble."
    ],
    faq: [
      {
        q: 'Pourquoi le bouton « Payer en ligne » est-il absent ?',
        a: "Il n'apparaît que si votre agence a activé le paiement en ligne et s'il vous reste un montant à payer. Sinon, utilisez l'écran « Payer » pour voir les coordonnées de paiement de l'agence et déclarer votre paiement."
      },
      {
        q: 'Que signifie le montant de « Prochaine échéance » ?',
        a: "C'est ce qui reste à payer sur l'échéance non soldée la plus ancienne. Si vous avez déjà versé une partie, la ligne « Reste dû » indique la somme déjà réglée sur le total."
      },
      {
        q: 'Un paiement que je viens de faire ne se voit pas. Est-ce normal ?',
        a: "Oui, tant que l'agence ne l'a pas enregistré. Un paiement déclaré reste « En attente de validation » dans l'écran « Payer » et ne change pas votre solde avant la validation."
      }
    ],
    related: [
      { label: 'Payer ou déclarer un paiement', helpId: 'portails.locataire.paiements' },
      { label: 'Mon bail', helpId: 'portails.locataire.bail' },
      { label: 'Signaler un incident', helpId: 'portails.locataire.incidents' }
    ],
    keywords: ['tableau de bord', 'accueil', 'solde', 'retard', 'loyer', 'échéance', 'locataire', 'portail'],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'locataire-retard',
          title: 'Vos retards',
          description:
            'Ce chiffre compte vos échéances non soldées dont la date est dépassée. Il vaut 0 quand vous êtes à jour.'
        },
        {
          target: 'locataire-prochaine-echeance',
          title: 'La prochaine échéance à payer',
          description:
            'Voici la plus ancienne échéance non soldée, avec son reste dû. Pour la payer, ouvrez « Payer » dans le menu.'
        },
        {
          target: 'locataire-paiements-recents',
          title: 'Vérifier le résultat',
          description: 'Une fois le paiement confirmé, il apparaît dans cette liste de vos 5 derniers paiements.'
        }
      ]
    }
  },
  {
    id: 'portails.locataire.accueil.indicateurs',
    kind: 'section',
    title: "Indicateurs de l'accueil",
    summary:
      'Trois cartes résument votre situation : les échéances en retard, la prochaine échéance et votre dépôt de garantie.',
    howToRead: {
      notes: [
        "Retard des échéances : nombre d'échéances non soldées dont la date est passée. Le chiffre passe au rouge dès qu'il y en a une.",
        'Prochaine échéance : la plus ancienne échéance non soldée (à venir, partiellement payée ou en retard). Le montant affiché est le reste dû, suivi de la date et de la période. Quand une partie est déjà réglée, une ligne « Reste dû » indique la somme réglée sur le total.',
        "Dépôt de garantie : le montant déjà versé, suivi du montant total attendu (par exemple 300 000 FCFA / 450 000 FCFA). « Dépôt effectué » s'affiche quand il est complet ; « Aucun dépôt configuré » si aucun dépôt n'est prévu sur votre bail.",
        "S'il n'y a plus d'échéance à payer, la carte « Prochaine échéance » affiche 0 et « Aucune échéance à venir »."
      ]
    },
    faq: [
      {
        q: 'Pourquoi une échéance à venir peut-elle compter comme « en retard » ?',
        a: 'Elle ne le fait pas : seules les échéances dont la date est dépassée sont comptées en retard. Une échéance encore à venir apparaît seulement dans « Prochaine échéance ».'
      },
      {
        q: 'Où voir le détail de mon dépôt de garantie ?',
        a: "L'écran « Dépôt de garantie » du portail donne le montant versé, retenu, remboursé et l'historique des mouvements."
      },
      {
        q: 'Ce montant inclut-il les charges ?',
        a: "Le reste dû porte sur l'échéance complète telle que l'agence l'a établie : loyer, charges et frais éventuels. Ouvrez « Détails » dans l'écran « Payer » pour voir la composition."
      }
    ],
    related: [
      { label: 'Détail du dépôt de garantie', helpId: 'portails.locataire.caution' },
      { label: 'Échéances et paiements', helpId: 'portails.locataire.paiements.echeances' }
    ],
    keywords: ['retard', 'prochaine échéance', 'dépôt de garantie', 'caution', 'reste dû']
  },
  {
    id: 'portails.locataire.accueil.bail',
    kind: 'section',
    title: 'Informations du bail (accueil)',
    summary:
      "Un rappel de votre bail : l'adresse du bien, le loyer mensuel, les charges, les dates de début et de fin et le statut.",
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'Votre bail est en cours.' },
        { value: 'DRAFT', label: 'Brouillon', description: 'Le bail est préparé mais pas encore en vigueur.' },
        { value: 'SUSPENDED', label: 'Suspendu', description: "Le bail est mis en pause par l'agence." },
        { value: 'ENDED', label: 'Terminé', description: 'Le bail est arrivé à son terme.' },
        { value: 'CANCELED', label: 'Annulé', description: 'Le bail a été annulé.' }
      ],
      notes: [
        "« Non définie » à la place de la date de fin signifie que votre bail n'a pas de date de fin enregistrée.",
        "Si vous avez plusieurs baux actifs, une carte « Vos baux » s'affiche au-dessus, avec pour chaque bail son numéro, son adresse, son solde et son nombre d'échéances en retard."
      ]
    },
    faq: [
      {
        q: 'Où voir toutes les conditions de mon bail ?',
        a: 'Ouvrez « Mon bail » dans le menu : vous y trouvez le numéro, les parties, le dépôt, la fréquence de facturation et vos documents.'
      },
      {
        q: 'Une information est fausse. Que faire ?',
        a: 'Vous ne pouvez pas la corriger vous-même : contactez votre agence, qui gère les données de votre bail.'
      },
      {
        q: 'Que veut dire « Suspendu » ?',
        a: "L'agence a mis votre bail en pause. Elle peut le réactiver ou le terminer ; renseignez-vous auprès d'elle."
      }
    ],
    related: [{ label: 'Mon bail', helpId: 'portails.locataire.bail' }],
    keywords: ['bail', 'adresse', 'loyer mensuel', 'charges', 'statut du bail']
  },
  {
    id: 'portails.locataire.accueil.paiements',
    kind: 'section',
    title: 'Paiements récents',
    summary: 'La liste de vos 5 derniers paiements réussis, avec le montant, le mode de paiement et la date.',
    howToRead: {
      notes: [
        "Seuls les paiements enregistrés comme réussis apparaissent ici ; un paiement déclaré mais pas encore validé par l'agence n'y figure pas.",
        'Le mode est indiqué à côté du montant : Espèces, Virement bancaire, Chèque, Mobile Money, Prélèvement bancaire, Carte ou Autre.',
        "Pour l'historique complet, ouvrez l'écran « Payer », onglet « Historique des paiements »."
      ]
    },
    faq: [
      {
        q: "J'ai payé mais mon paiement n'apparaît pas.",
        a: "Si vous l'avez déclaré, il attend la validation de l'agence. Vous le retrouvez dans « Mes déclarations » de l'écran « Payer »."
      },
      {
        q: 'Pourquoi seulement 5 paiements ?',
        a: "Cet écran n'affiche que les cinq plus récents. L'historique complet se trouve dans l'écran « Payer »."
      },
      {
        q: 'Où trouver ma quittance ?',
        a: "Les documents que l'agence a établis pour votre bail sont dans la carte « Documents » de l'écran « Mon bail »."
      }
    ],
    related: [{ label: 'Historique des paiements', helpId: 'portails.locataire.paiements.historique' }],
    keywords: ['paiements récents', 'derniers paiements', 'historique']
  },
  {
    id: 'portails.locataire.accueil.maintenance',
    kind: 'section',
    title: 'Résumé maintenance',
    summary: "Le nombre de vos demandes d'incident, au total et par état d'avancement.",
    howToRead: {
      notes: [
        'Total : toutes vos demandes, y compris les demandes annulées.',
        'Ouverts : les demandes au statut « Déclaré », pas encore prises en charge.',
        'En cours : les demandes au statut « En cours » ou « Assigné ».',
        'Résolus : les demandes au statut « Résolu ».'
      ]
    },
    faq: [
      {
        q: 'Comment créer une demande ?',
        a: 'Ouvrez « Incidents » dans le menu, puis « Nouvelle demande ».'
      },
      {
        q: 'Pourquoi Total est-il plus grand que la somme des trois autres ?',
        a: 'Les demandes « Annulé » sont comptées dans le total mais dans aucune des trois autres cases.'
      },
      {
        q: 'Où suivre une demande précise ?',
        a: "Dans l'écran « Incidents » : « Détails » ouvre la fiche avec les commentaires de l'agence."
      }
    ],
    related: [{ label: 'Incidents', helpId: 'portails.locataire.incidents' }],
    keywords: ['maintenance', 'incident', 'réparation', 'ticket', 'panne']
  },

  // ---------------------------------------------------------------- Mon bail
  {
    id: 'portails.locataire.bail',
    kind: 'page',
    title: 'Mon bail',
    summary:
      'Toutes les informations de votre contrat de location : le bien, les dates, les montants, les personnes concernées et vos documents.',
    purpose:
      "Cet écran reprend ce que l'agence a enregistré pour votre bail. Vous pouvez le relire à tout moment et télécharger vos documents (contrat, quittances, reçus).",
    steps: [
      {
        title: 'Choisir le bail',
        detail:
          "Si vous avez plusieurs baux actifs, un sélecteur en haut de l'écran permet de passer de l'un à l'autre."
      },
      {
        title: 'Lire les informations',
        detail:
          "La carte « Informations du bail » donne le numéro, l'adresse, les dates, le loyer, les charges et le dépôt de garantie."
      },
      {
        title: 'Voir les personnes',
        detail:
          'Les cartes « Locataire principal », « Propriétaire » et « Co-locataires » rappellent qui est concerné par le bail.'
      },
      {
        title: 'Télécharger un document',
        detail: 'Dans la carte « Documents », cliquez sur « Télécharger » à droite du document voulu.'
      }
    ],
    consequences: [
      'Cet écran est en lecture seule : vous ne pouvez rien modifier. Pour corriger une information, contactez votre agence.',
      "Un document dont le bouton « Télécharger » est grisé n'a pas de fichier disponible pour le moment."
    ],
    faq: [
      {
        q: 'Je veux changer une information de mon bail.',
        a: "Seule l'agence peut modifier un bail. Contactez-la."
      },
      {
        q: 'Que signifie « Non définie » pour la date de fin ?',
        a: "Aucune date de fin n'est enregistrée sur votre bail."
      },
      {
        q: 'Je ne vois pas la carte « Propriétaire » ou « Co-locataires ».',
        a: "Ces cartes n'apparaissent que si l'agence a enregistré un propriétaire ou des co-locataires sur votre bail."
      }
    ],
    related: [
      { label: 'Vos documents', helpId: 'portails.locataire.bail.documents' },
      { label: 'Dépôt de garantie', helpId: 'portails.locataire.caution' }
    ],
    keywords: ['bail', 'contrat', 'location', 'loyer', 'adresse', 'propriétaire', 'co-locataire']
  },
  {
    id: 'portails.locataire.bail.informations',
    kind: 'section',
    title: 'Informations du bail',
    summary:
      'Les données de votre contrat : numéro, adresse, statut, dates, loyer, charges, dépôt et rythme de facturation.',
    howToRead: {
      notes: [
        "Numéro de bail et Nom du bail : le nom n'apparaît que s'il est renseigné.",
        'Statut : Actif, Brouillon, Suspendu, Terminé ou Annulé.',
        "Date d'emménagement : un tiret (-) signifie qu'aucune date n'est enregistrée.",
        'Loyer mensuel, Charges et Dépôt de garantie : montants en FCFA tels que fixés au bail.',
        'Fréquence de facturation : Mensuel, Trimestriel, Semestriel ou Annuel.',
        "Jour d'échéance : le jour du mois où vos échéances sont dues, par exemple « Le 5 de chaque mois »."
      ]
    },
    faq: [
      {
        q: 'Le loyer affiché comprend-il les charges ?',
        a: "Non : le loyer mensuel et les charges sont deux lignes séparées. Le détail de chaque échéance se voit dans l'écran « Payer » avec « Détails »."
      },
      {
        q: 'Pourquoi le sélecteur de bail est-il absent ?',
        a: "Il n'apparaît que si vous avez plusieurs baux actifs."
      },
      {
        q: 'Qui peut modifier ces informations ?',
        a: "Uniquement l'agence."
      }
    ],
    related: [{ label: 'Mon bail', helpId: 'portails.locataire.bail' }],
    keywords: ['numéro de bail', 'date de fin', "jour d'échéance", 'fréquence de facturation', 'dépôt de garantie']
  },
  {
    id: 'portails.locataire.bail.parties',
    kind: 'section',
    title: 'Locataire, propriétaire et co-locataires',
    summary:
      'Les personnes liées à votre bail : le locataire principal, le propriétaire et les éventuels co-locataires, avec leur adresse e-mail.',
    howToRead: {
      notes: [
        'Locataire principal : la personne à qui le bail est établi. Un « Non renseigné » signifie que son nom manque dans le dossier.',
        "Propriétaire : affiché seulement si l'agence l'a enregistré sur le bail.",
        "Co-locataires : affichés seulement s'il y en a."
      ]
    },
    faq: [
      {
        q: 'Comment ajouter un co-locataire ?',
        a: 'Vous ne pouvez pas le faire depuis le portail : adressez-vous à votre agence.'
      },
      {
        q: 'Mon nom est mal écrit.',
        a: "Contactez l'agence pour faire corriger votre fiche."
      },
      {
        q: "Pourquoi voit-on l'e-mail du propriétaire ?",
        a: "L'e-mail enregistré sur son compte est repris tel quel sur cette carte, avec son nom."
      }
    ],
    related: [{ label: 'Mon bail', helpId: 'portails.locataire.bail' }],
    keywords: ['colocataire', 'propriétaire', 'locataire principal', 'bailleur']
  },
  {
    id: 'portails.locataire.bail.documents',
    kind: 'section',
    title: 'Documents du bail',
    summary:
      "Les documents de votre bail, classés par type, avec leur date d'émission et un bouton pour les télécharger.",
    howToRead: {
      notes: [
        'Types possibles : Contrat de bail, Avenant, Quittance de loyer, Quittance, Reçu de dépôt, Relevé, Autre. Le nombre à côté du type est le nombre de documents.',
        "Sans titre ni numéro, un document est nommé « Document » suivi d'un court code.",
        "« Date non disponible » signifie que l'agence n'a pas renseigné de date d'émission.",
        "Les documents annulés par l'agence ne sont pas affichés."
      ]
    },
    steps: [
      {
        title: 'Télécharger',
        detail: 'Cliquez sur « Télécharger » à droite du document ; le fichier est enregistré sur votre appareil.'
      }
    ],
    faq: [
      {
        q: 'Le bouton « Télécharger » est grisé.',
        a: "Aucun fichier n'est disponible pour ce document pour l'instant. Contactez votre agence."
      },
      {
        q: 'Je ne trouve pas ma quittance.',
        a: "Elle apparaît ici quand l'agence l'a établie pour votre bail. Si elle manque, demandez-la à l'agence."
      },
      {
        q: 'Peut-on chercher un document ?',
        a: "Oui, dans l'écran « Documents » du portail, une recherche par nom, numéro ou type est disponible."
      }
    ],
    related: [{ label: 'Écran Documents', helpId: 'portails.locataire.documents' }],
    keywords: ['quittance', 'contrat de bail', 'avenant', 'reçu', 'télécharger']
  },

  // ---------------------------------------------------------------- Payer
  {
    id: 'portails.locataire.paiements',
    kind: 'page',
    title: 'Paiements et échéances',
    summary:
      "L'écran où vous suivez vos échéances de loyer, payez en ligne si votre agence le propose, déclarez un paiement déjà fait et consultez votre historique et votre relevé.",
    purpose:
      "Une échéance est une somme à payer à une date précise (loyer, charges, frais). Ici, vous voyez ce qui est payé, dû ou en retard, et vous prévenez l'agence quand vous avez payé.",
    steps: [
      {
        title: 'Voir comment payer',
        detail: "Si l'agence l'a configuré, la carte « Payer l'agence » donne ses coordonnées de paiement."
      },
      {
        title: 'Choisir votre façon de payer',
        detail:
          'En ligne : cochez les échéances puis « Payer en ligne » (si disponible). Hors ligne : payez vous-même, puis cliquez sur « Déclarer un paiement ».'
      },
      {
        title: 'Suivre vos échéances',
        detail:
          "L'onglet « Échéances » liste chaque période avec son statut ; « Détails » ouvre la composition de l'échéance."
      },
      {
        title: 'Suivre vos déclarations',
        detail: "« Mes déclarations » montre si l'agence a validé, rejeté ou n'a pas encore traité chaque déclaration."
      },
      {
        title: 'Relire vos paiements',
        detail:
          'Les onglets « Historique des paiements » et « Mon relevé » gardent la trace de tout ce qui a été réglé.'
      }
    ],
    consequences: [
      "Le bouton « Payer » d'une ligne ne prélève rien : il ouvre le formulaire pour déclarer un paiement que vous avez déjà envoyé.",
      "Une déclaration n'est pas un paiement validé : votre solde ne change qu'après validation par l'agence.",
      "Le paiement en ligne vous envoie vers la page de paiement sécurisée de l'opérateur, puis vous ramène sur cet écran où un bandeau suit la confirmation."
    ],
    faq: [
      {
        q: 'Quelle différence entre « Payer en ligne » et « Déclarer un paiement » ?',
        a: "Avec « Payer en ligne », vous payez sur la page sécurisée proposée par l'agence. Avec « Déclarer un paiement », vous avez déjà payé par un autre moyen (Mobile Money, espèces, chèque, virement) et vous le signalez à l'agence."
      },
      {
        q: 'Pourquoi ne puis-je pas cocher une échéance ?',
        a: 'Seules les échéances « Dû », « En retard » ou « Partiel » avec un reste à payer se cochent, et toutes doivent appartenir au même bail.'
      },
      {
        q: 'Mon paiement est parti mais mon solde est inchangé.',
        a: "Pour une déclaration, c'est normal : l'agence doit d'abord la vérifier. Pour un paiement en ligne, attendez la confirmation affichée dans le bandeau."
      },
      {
        q: "Je n'ai pas de bouton « Payer en ligne ».",
        a: "Votre agence ne l'a pas activé. Payez avec les coordonnées indiquées par l'agence, puis déclarez votre paiement."
      }
    ],
    related: [
      { label: 'Liste des échéances', helpId: 'portails.locataire.paiements.echeances' },
      { label: 'Déclarer un paiement', helpId: 'portails.locataire.paiements.declaration' },
      { label: 'Mes déclarations', helpId: 'portails.locataire.paiements.declarations' },
      { label: 'Accueil du portail', to: '/tenant' }
    ],
    keywords: [
      'payer',
      'paiement',
      'loyer',
      'échéance',
      'mobile money',
      'orange money',
      'wave',
      'mtn',
      'moov',
      'déclarer',
      'relevé'
    ],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'paiements-declarer',
          title: 'Déclarer un paiement',
          description:
            "Après avoir payé par Mobile Money, espèces, chèque ou virement, ce bouton ouvre le formulaire pour prévenir l'agence."
        },
        {
          target: 'paiements-tableau',
          title: 'Vos échéances',
          description:
            'Chaque ligne est une échéance. « Payer » ouvre la déclaration pour cette échéance et « Détails » montre sa composition.'
        },
        {
          target: 'paiements-en-ligne',
          title: 'Payer en ligne',
          description:
            'Cochez une ou plusieurs échéances du même bail dans le tableau : le total apparaît ici, puis « Payer en ligne » ouvre la page de paiement.'
        },
        {
          target: 'paiements-declarations',
          title: 'Suivre vos déclarations',
          description:
            "Dépliez cette section pour voir si l'agence a validé votre déclaration, et l'annuler tant qu'elle est en attente."
        }
      ]
    }
  },
  {
    id: 'portails.locataire.paiements.payer-agence',
    kind: 'section',
    title: "Payer l'agence",
    summary:
      "Les coordonnées de paiement de l'agence (institution, alias, nom du bénéficiaire), avec la marche à suivre pour payer depuis votre application.",
    purpose:
      "Cette carte n'apparaît que si l'agence a enregistré au moins un compte de réception actif. ImmoTopia ne génère aucun QR et ne remplit aucun montant à votre place.",
    howToRead: {
      notes: [
        "Institution : le nom de la banque ou de l'opérateur ; « À scanner avec » liste les applications qui lisent le QR, s'il y en a un.",
        "Alias à saisir : ce que vous tapez dans votre application. « Copier l'alias » le copie pour vous.",
        "Nom attendu du bénéficiaire : le nom qui doit s'afficher avant que vous validiez. S'il est différent, ne payez pas.",
        'Motif suggéré à recopier : généralement « Loyer » suivi de la période de votre plus ancienne échéance non soldée ; « Copier le motif » le copie.'
      ]
    },
    steps: [
      { title: 'Ouvrir votre application', detail: 'Ouvrez votre application de paiement ou de banque.' },
      { title: 'Scanner ou saisir', detail: "Scannez le QR ou saisissez l'alias." },
      { title: 'Saisir le montant', detail: 'Saisissez vous-même le montant à payer.' },
      { title: 'Vérifier le nom', detail: 'Le nom affiché doit correspondre au nom attendu du bénéficiaire.' },
      {
        title: 'Valider puis déclarer',
        detail: "Validez le paiement, puis cliquez sur « J'ai payé : déclarer mon paiement » pour prévenir l'agence."
      }
    ],
    consequences: [
      'Un paiement instantané est irrévocable : il ne peut pas être annulé.',
      "Payer ici ne crédite pas votre compte tout seul : l'agence doit enregistrer votre paiement, c'est pourquoi il faut le déclarer."
    ],
    faq: [
      {
        q: "Pourquoi cette carte ne s'affiche-t-elle pas ?",
        a: "L'agence n'a pas enregistré de compte de réception actif, ou la lecture a échoué. Contactez l'agence pour connaître ses coordonnées."
      },
      {
        q: 'Le montant est-il prérempli ?',
        a: 'Non, vous saisissez vous-même le montant dans votre application.'
      },
      {
        q: "Le nom affiché n'est pas celui attendu.",
        a: "Ne payez pas. Vérifiez l'alias, puis demandez confirmation à l'agence."
      }
    ],
    related: [{ label: 'Déclarer un paiement', helpId: 'portails.locataire.paiements.declaration' }],
    keywords: ['alias', 'qr', 'coordonnées', 'bénéficiaire', 'motif', 'copier']
  },
  {
    id: 'portails.locataire.paiements.indicateurs',
    kind: 'section',
    title: 'Indicateurs des échéances',
    summary: 'Quatre chiffres résument vos échéances : le total, les payées, celles en attente et celles en retard.',
    howToRead: {
      notes: [
        'Total échéances : toutes vos échéances facturées, y compris celles déjà payées.',
        'Payées : les échéances entièrement soldées.',
        "En attente : les échéances dont la date n'est pas encore passée (y compris partiellement payées).",
        'En retard : les échéances non soldées dont la date est passée (y compris partiellement payées).',
        "Une échéance encore à l'état de brouillon (pas encore facturée) ou annulée n'est comptée nulle part ; un brouillon dont la date est passée compte comme en retard.",
        "Ces chiffres s'affichent sur l'onglet « Échéances »."
      ]
    },
    faq: [
      {
        q: 'Pourquoi la somme des trois dernières ne fait-elle pas le total ?',
        a: 'Les chiffres comptent des échéances, pas des montants, et une échéance ne tombe que dans une seule des trois cases Payées, En attente ou En retard.'
      },
      {
        q: 'Ces chiffres tiennent-ils compte de mes filtres ?',
        a: 'Non, ils portent sur toutes vos échéances, quel que soit le filtre appliqué au tableau.'
      },
      {
        q: 'Où voir les montants ?',
        a: 'Dans le tableau « Liste des échéances » : colonnes Montant total, Payé et Solde.'
      }
    ],
    related: [{ label: 'Liste des échéances', helpId: 'portails.locataire.paiements.echeances' }],
    keywords: ['total échéances', 'payées', 'en attente', 'en retard']
  },
  {
    id: 'portails.locataire.paiements.declarations',
    kind: 'section',
    title: 'Mes déclarations',
    summary:
      "La liste des paiements que vous avez déclarés à l'agence, avec leur statut. Tant qu'une déclaration est en attente, vous pouvez l'annuler.",
    purpose:
      "Déclarer un paiement signale à l'agence que vous avez payé hors ligne. L'agence vérifie, puis valide ou rejette. La section s'ouvre d'elle-même s'il y a une déclaration en attente.",
    howToRead: {
      statuses: [
        {
          value: 'PENDING',
          label: 'En attente de validation',
          description: "L'agence n'a pas encore traité la déclaration. Votre solde ne change pas avant sa décision."
        },
        {
          value: 'APPROVED',
          label: 'Validée',
          description: "L'agence a accepté le paiement. Si elle a corrigé le montant, « Montant retenu » l'indique."
        },
        {
          value: 'REJECTED',
          label: 'Rejetée',
          description: "L'agence a refusé la déclaration ; le motif et un éventuel commentaire s'affichent."
        },
        { value: 'CANCELED', label: 'Annulée', description: 'Vous avez annulé la déclaration.' }
      ],
      notes: [
        'Motifs de rejet possibles : Paiement introuvable, Montant ne correspondant pas, Référence déjà utilisée, Numéro de réception erroné, Autre.',
        "Chaque carte donne le montant, la date et l'heure du paiement, la référence, le numéro de réception utilisé et l'échéance concernée.",
        'Le filtre « Filtrer par statut » permet de ne voir que les déclarations en attente, validées, rejetées ou annulées ; la liste se pagine par 10.'
      ]
    },
    steps: [
      { title: 'Ouvrir la section', detail: 'Cliquez sur « Mes déclarations » pour la déplier.' },
      {
        title: 'Filtrer',
        detail: 'Choisissez un statut dans la liste déroulante si vous cherchez une déclaration précise.'
      },
      {
        title: 'Annuler si besoin',
        detail: 'Sur une déclaration en attente, cliquez sur « Annuler la déclaration » puis confirmez.'
      }
    ],
    consequences: [
      "L'annulation n'est possible que tant que la déclaration est en attente ; ensuite, plus rien à faire de votre côté.",
      'Annuler ne supprime pas la ligne : elle reste visible avec le statut « Annulée ».',
      "Tant qu'une déclaration est en attente sur une échéance, le paiement en ligne de cette échéance est refusé, pour éviter un double règlement."
    ],
    faq: [
      {
        q: "Combien de temps l'agence met-elle à valider ?",
        a: "Cela dépend de l'agence : aucun délai n'est garanti dans l'application."
      },
      {
        q: 'Ma déclaration est rejetée. Que faire ?',
        a: "Lisez le motif, corrigez si besoin (montant, référence), puis redéclarez, ou contactez l'agence."
      },
      {
        q: 'Pourquoi le montant retenu diffère-t-il du mien ?',
        a: "L'agence a pu corriger le montant en validant. La ligne « Montant retenu » donne la somme prise en compte."
      }
    ],
    related: [{ label: 'Déclarer un paiement', helpId: 'portails.locataire.paiements.declaration' }],
    keywords: ['déclaration', 'validation', 'annuler', 'rejetée', 'en attente']
  },
  {
    id: 'portails.locataire.paiements.paiement-en-ligne',
    kind: 'section',
    title: 'Payer en ligne',
    summary:
      "Cochez les échéances à régler, vérifiez le total, puis cliquez sur « Payer en ligne » pour payer sur la page sécurisée de l'opérateur de paiement.",
    purpose:
      "Ce bloc n'apparaît que si votre agence a activé le paiement en ligne. Il se trouve au-dessus du tableau de l'onglet « Échéances ».",
    steps: [
      {
        title: 'Cocher les échéances',
        detail: 'Cochez une ou plusieurs lignes à régler. Elles doivent être du même bail.'
      },
      {
        title: 'Vérifier le total',
        detail: "« Total à payer » et le nombre d'échéances sélectionnées se mettent à jour."
      },
      { title: 'Payer', detail: 'Cliquez sur « Payer en ligne » : vous êtes envoyé vers la page de paiement.' },
      {
        title: "Revenir sur l'écran",
        detail: 'À votre retour, un bandeau suit la confirmation pendant 1 minute au plus.'
      }
    ],
    howToRead: {
      statuses: [
        { value: 'SUCCESS', label: 'Paiement confirmé.', description: 'Le paiement est enregistré.' },
        {
          value: 'PENDING',
          label: 'En cours de confirmation…',
          description:
            "L'opérateur n'a pas encore répondu ; l'écran vérifie toutes les 3 secondes pendant 1 minute au plus, puis garde le paiement en attente de confirmation."
        },
        {
          value: 'REVIEW',
          label: "En cours de vérification par l'agence.",
          description: "L'agence doit contrôler ce paiement."
        },
        {
          value: 'FAILED',
          label: 'Le paiement a échoué.',
          description: "Le motif est repris dans le bandeau quand l'opérateur le fournit."
        },
        {
          value: 'CANCELED',
          label: 'Le paiement a été annulé.',
          description: 'Vous avez annulé sur la page de paiement.'
        },
        { value: 'EXPIRED', label: 'Le délai de paiement a expiré.', description: 'Le paiement doit être relancé.' }
      ],
      notes: [
        "« Mode démonstration » signale un essai : aucun vrai argent n'est débité.",
        "Si l'agence a prévu des frais à votre charge, une mention précise que des frais de l'agrégateur de paiement peuvent s'ajouter au montant.",
        "Le nombre d'échéances par paiement est limité ; un message l'indique quand la limite est atteinte."
      ]
    },
    consequences: [
      "Vous quittez ImmoTopia pour la page de l'opérateur de paiement ; vous revenez ensuite sur cet écran.",
      "Si un paiement en ligne est déjà en cours depuis moins de 15 minutes sur l'une de vos échéances, vous êtes renvoyé vers ce paiement plutôt qu'un second.",
      "Une déclaration de paiement en attente sur la même échéance bloque le paiement en ligne : annulez-la dans « Mes déclarations » ou attendez la décision de l'agence."
    ],
    faq: [
      {
        q: 'Le bouton « Payer en ligne » reste grisé.',
        a: "Aucune échéance n'est cochée. Cochez au moins une ligne payable."
      },
      {
        q: 'Puis-je payer des échéances de baux différents ensemble ?',
        a: "Non : une fois une échéance cochée, celles d'un autre bail sont grisées."
      },
      {
        q: 'Mon paiement affiche « En cours de confirmation… » longtemps.',
        a: "Il apparaîtra automatiquement dans votre historique dès qu'il sera confirmé. Vous n'avez rien à refaire."
      }
    ],
    related: [{ label: 'Liste des échéances', helpId: 'portails.locataire.paiements.echeances' }],
    keywords: ['payer en ligne', 'carte', 'paysecurehub', 'paiement en ligne', 'frais']
  },
  {
    id: 'portails.locataire.paiements.echeances',
    kind: 'table',
    title: 'Liste des échéances',
    summary:
      'Chaque ligne est une échéance de votre bail : sa période, sa date, son montant, ce que vous avez payé, ce qui reste et son statut.',
    howToRead: {
      columns: [
        { key: 'period', label: 'Période', description: "Le mois ou la période couverte par l'échéance." },
        {
          key: 'leaseNumber',
          label: 'Bail',
          description: "Numéro du bail concerné. Cette colonne n'apparaît que si vous avez plusieurs baux actifs."
        },
        { key: 'dueDate', label: "Date d'échéance", description: 'La date limite de paiement.' },
        {
          key: 'amount',
          label: 'Montant total',
          description: "Le total de l'échéance en FCFA : loyer, charges et frais éventuels."
        },
        { key: 'paid', label: 'Payé', description: 'La somme déjà réglée sur cette échéance.' },
        {
          key: 'balance',
          label: 'Solde',
          description: "Ce qu'il reste à payer. En rouge tant qu'il reste un montant, en vert quand tout est payé."
        },
        {
          key: 'status',
          label: 'Statut',
          description:
            "L'état de l'échéance. Une pastille « Déclaration en attente de validation » s'ajoute si vous avez déclaré un paiement sur cette ligne."
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            "« Payer » ouvre la déclaration de paiement (seulement si l'échéance est payable) ; « Détails » ouvre sa composition."
        }
      ],
      statuses: [
        { value: 'PAID', label: 'Payé', description: "L'échéance est entièrement soldée." },
        { value: 'DUE', label: 'Dû', description: "Elle est à payer et sa date n'est pas dépassée." },
        { value: 'OVERDUE', label: 'En retard', description: "Sa date est dépassée et elle n'est pas soldée." },
        { value: 'PARTIAL', label: 'Partiel', description: 'Une partie a été payée, il reste un solde.' },
        { value: 'DRAFT', label: 'Brouillon', description: 'Pas encore facturée : elle ne peut pas être payée.' },
        { value: 'CANCELED', label: 'Annulé', description: "L'échéance est annulée." }
      ],
      notes: [
        "La recherche porte sur la période et le libellé ; les filtres sont Statut et Date d'échéance. Les critères s'inscrivent dans l'adresse de la page.",
        'Le bouton « Exporter » produit un fichier avec toutes les échéances correspondant à vos filtres, pas seulement la page affichée.',
        'Quand le paiement en ligne est disponible, une case à cocher apparaît en début de ligne pour les échéances payables.'
      ]
    },
    steps: [
      { title: 'Retrouver une échéance', detail: "Utilisez la recherche ou les filtres Statut et Date d'échéance." },
      {
        title: 'Voir sa composition',
        detail: 'Cliquez sur « Détails » pour voir le loyer, les charges, les pénalités et les paiements reçus.'
      },
      {
        title: 'Signaler un paiement',
        detail: 'Cliquez sur « Payer » sur la ligne pour déclarer un paiement déjà effectué.'
      }
    ],
    consequences: [
      "« Payer » ne débite rien : il ouvre un formulaire de déclaration, que l'agence devra valider.",
      'Consulter ou filtrer ne modifie rien dans votre dossier.'
    ],
    faq: [
      {
        q: "Pourquoi n'y a-t-il pas de bouton « Payer » sur certaines lignes ?",
        a: "Il n'apparaît que pour les échéances « Dû », « En retard » ou « Partiel » avec un solde à payer."
      },
      {
        q: 'Que signifie « Déclaration en attente de validation » ?',
        a: "Vous avez déclaré un paiement sur cette échéance et l'agence ne l'a pas encore traité. Le solde ne change pas avant sa décision."
      },
      {
        q: 'Pourquoi une échéance « Brouillon » apparaît-elle ?',
        a: "L'agence l'a préparée mais pas encore facturée. Elle ne peut pas être payée ; tant que sa date n'est pas passée, elle n'est pas comptée dans les indicateurs."
      }
    ],
    related: [
      { label: "Détail d'une échéance", helpId: 'portails.locataire.paiements.detail-echeance' },
      { label: 'Déclarer un paiement', helpId: 'portails.locataire.paiements.declaration' }
    ],
    keywords: ['échéance', 'loyer', 'solde', 'statut', 'payer', 'détails', 'export']
  },
  {
    id: 'portails.locataire.paiements.historique',
    kind: 'table',
    title: 'Historique des paiements',
    summary:
      'La liste de vos paiements et de vos déclarations non validées, de la plus récente à la plus ancienne, avec ce qui a été affecté à vos échéances.',
    howToRead: {
      columns: [
        {
          key: 'date',
          label: 'Date',
          description:
            "La date du paiement ; « (déclaration) » signale une déclaration qui n'est pas encore un paiement enregistré."
        },
        { key: 'amount', label: 'Montant', description: 'Le montant en FCFA.' },
        {
          key: 'method',
          label: 'Méthode',
          description:
            'Espèces, Virement bancaire, Mobile Money, Prélèvement bancaire, Chèque, Carte bancaire ou Autre.'
        },
        {
          key: 'reference',
          label: 'Référence',
          description: "La référence de la transaction, s'il y en a une ; un tiret (-) sinon."
        },
        {
          key: 'status',
          label: 'Statut',
          description:
            "Réussi, En attente, Rejetée, Échoué ou Annulé. Pour une déclaration rejetée, le motif s'affiche dessous."
        },
        { key: 'allocated', label: 'Alloué', description: 'La part du paiement déjà affectée à vos échéances.' },
        {
          key: 'unallocated',
          label: 'Non alloué',
          description: "La part pas encore affectée à une échéance ; un montant s'affiche en orange."
        }
      ],
      statuses: [
        { value: 'SUCCESS', label: 'Réussi', description: "Paiement enregistré par l'agence." },
        { value: 'PENDING', label: 'En attente', description: 'Déclaration pas encore traitée.' },
        { value: 'REJECTED', label: 'Rejetée', description: "Déclaration refusée par l'agence." },
        { value: 'FAILED', label: 'Échoué', description: "Paiement qui n'a pas abouti." },
        { value: 'CANCELED', label: 'Annulé', description: 'Déclaration que vous avez annulée.' }
      ],
      notes: [
        "Dépliez une ligne avec la flèche à gauche pour voir à quelles échéances le paiement a été affecté ; une ligne sans affectation n'est pas dépliable.",
        'Les déclarations validées ne sont pas répétées : elles sont remplacées par le paiement correspondant.',
        'Sous le tableau, « Total payé (tous les paiements) » additionne tous vos paiements réussis, filtres ou non.',
        'La recherche porte sur la référence et les notes ; les filtres sont Méthode de paiement et Date. Le bouton « Exporter » sort toute la liste filtrée.'
      ]
    },
    faq: [
      {
        q: 'Que veut dire « Non alloué » ?',
        a: "Le paiement est reçu mais n'a pas encore été imputé en totalité sur une échéance. L'agence s'en occupe."
      },
      {
        q: 'Pourquoi vois-je mes déclarations ici ?',
        a: "Pour que vous gardiez la trace de ce que vous avez signalé, tant qu'elles ne sont pas validées."
      },
      {
        q: 'Où trouver mon justificatif de paiement ?',
        a: "Les quittances établies par l'agence sont dans « Mon bail », carte « Documents »."
      }
    ],
    related: [{ label: 'Mes déclarations', helpId: 'portails.locataire.paiements.declarations' }],
    keywords: ['historique', 'paiements', 'référence', 'alloué', 'total payé']
  },
  {
    id: 'portails.locataire.paiements.releve',
    kind: 'table',
    title: 'Mon relevé',
    summary:
      'Votre compte client en lecture seule : tout ce qui vous a été facturé et tout ce que vous avez réglé, avec le solde après chaque ligne.',
    purpose:
      "C'est le même document que celui qu'utilise l'agence pour votre compte. Il ne permet aucune action, ni impression, et ne montre que votre compte.",
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'La date du mouvement.' },
        {
          key: 'nature',
          label: 'Nature',
          description:
            'Le genre de mouvement : Loyer, Règlement, Avance reçue, Avance imputée, Pénalité, Remise, Ajustement, Solde initial ou Annulation.'
        },
        { key: 'libelle', label: 'Libellé', description: 'Le texte du mouvement.' },
        { key: 'facture', label: 'Facturé', description: 'Le montant mis à votre charge par cette ligne.' },
        { key: 'regle', label: 'Réglé', description: 'Le montant que vous avez payé par cette ligne.' },
        { key: 'solde', label: 'Solde après', description: 'Le solde de votre compte une fois cette ligne passée.' }
      ],
      notes: [
        "En haut, une carte donne le compte, le « Solde d'ouverture » et le « Solde de clôture ».",
        'La recherche porte sur le libellé et la nature ; les filtres sont Nature et Date. « Exporter » sort la liste.',
        "Si votre profil n'est pas relié à un compte locataire, l'écran affiche « Aucun compte rattaché » ; s'il n'y a rien à montrer, « Aucun mouvement enregistré »."
      ]
    },
    faq: [
      {
        q: 'Que veut dire « Avance imputée » ?',
        a: 'Une avance que vous aviez versée a été utilisée pour régler une échéance.'
      },
      {
        q: 'Puis-je corriger une ligne ?',
        a: "Non, le relevé est en lecture seule. Contactez l'agence si vous constatez une erreur."
      },
      {
        q: 'Pourquoi un ajustement apparaît-il ?',
        a: "L'agence corrige parfois un compte (remise, correction). Chaque correction est visible sur sa propre ligne."
      }
    ],
    related: [{ label: 'Historique des paiements', helpId: 'portails.locataire.paiements.historique' }],
    keywords: ['relevé', 'compte', 'solde', 'facturé', 'réglé', 'avance']
  },
  {
    id: 'portails.locataire.paiements.detail-echeance',
    kind: 'section',
    title: "Détails de l'échéance",
    summary:
      "La fenêtre ouverte par « Détails » : la composition de l'échéance, ses informations, ses pénalités éventuelles et les paiements reçus.",
    howToRead: {
      notes: [
        'Informations financières : Loyer, Charges de service, Autres frais, Pénalités, Total dû, Montant payé et Reste à payer.',
        "Informations : période (mois/année), date d'échéance, statut, numéro de bail et adresse du bien.",
        "Détail des éléments : chaque ligne de l'échéance (Loyer, Charges de service, Consommations, Entretien, Frais de dossier, Autres frais) avec son montant et un total.",
        "Pénalités appliquées : montant, jours de retard et date d'application ; ce tableau n'apparaît que s'il y en a.",
        'Historique des paiements : les paiements reçus sur cette échéance, avec la part allouée ; « Aucun paiement enregistré pour cette échéance » sinon.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi le total est-il supérieur à mon loyer ?',
        a: 'Le total inclut les charges de service, les frais éventuels et les pénalités de retard le cas échéant.'
      },
      {
        q: "D'où viennent les pénalités ?",
        a: "Elles sont appliquées par l'agence en cas de retard, selon les règles de votre bail. Les jours de retard et la date d'application sont indiqués."
      },
      {
        q: 'Mon paiement ne figure pas dans la fenêtre.',
        a: "Seuls les paiements enregistrés par l'agence et affectés à cette échéance s'y trouvent."
      }
    ],
    related: [{ label: 'Liste des échéances', helpId: 'portails.locataire.paiements.echeances' }],
    keywords: ['détails', 'pénalité', 'composition', 'loyer', 'charges']
  },
  {
    id: 'portails.locataire.paiements.declaration',
    kind: 'section',
    title: 'Déclarer un paiement',
    summary:
      "Le formulaire pour signaler à l'agence un paiement que vous avez déjà fait (Mobile Money, espèces, chèque, virement, carte...). Il n'effectue aucun paiement.",
    purpose:
      "Vous ouvrez ce formulaire depuis « Déclarer un paiement », depuis « Payer » sur une ligne d'échéance (l'échéance et le reste à payer sont alors prérempli), ou depuis « J'ai payé : déclarer mon paiement ».",
    steps: [
      {
        title: 'Choisir le bail',
        detail: "Seulement si vous avez plusieurs baux et que vous ne partez pas d'une échéance."
      },
      {
        title: 'Choisir le mode de paiement',
        detail:
          'La liste ne propose que les modes acceptés par votre agence. Mobile Money est proposé en premier quand il est permis.'
      },
      {
        title: 'Mobile Money : renseigner le transfert',
        detail:
          "Choisissez le numéro de réception de l'agence que vous avez utilisé, l'opérateur, votre numéro (facultatif) et la référence de la transaction reçue par SMS."
      },
      {
        title: 'Saisir le montant et la date',
        detail:
          'Montant entier en FCFA, date et heure du paiement. La date ne peut pas être dans le futur, ni dater de plus de 90 jours.'
      },
      {
        title: 'Joindre la capture',
        detail:
          "Image JPEG, PNG, WebP ou PDF de 5 Mo au plus. Elle est obligatoire si votre agence l'exige. Si la lecture automatique est disponible, le formulaire se préremplit et vous gardez la main sur chaque champ."
      },
      { title: 'Ajouter une note', detail: 'Facultatif, 500 caractères au plus.' },
      { title: 'Envoyer', detail: 'Cliquez sur « Déclarer le paiement ».' }
    ],
    consequences: [
      "La déclaration est créée « En attente de validation » : votre solde ne change pas avant la décision de l'agence.",
      "L'agence est prévenue par e-mail si cette notification est activée chez elle.",
      "La référence d'une transaction Mobile Money ne peut être déclarée qu'une fois ; une référence déjà utilisée est refusée.",
      "Si un paiement très proche existe déjà, un message vous prévient que l'agence vérifiera.",
      "Vous pouvez annuler la déclaration tant qu'elle est en attente, depuis « Mes déclarations »."
    ],
    faq: [
      {
        q: "Le formulaire dit que la déclaration n'est pas activée.",
        a: "Votre agence n'a pas activé la déclaration de paiement, ou n'a renseigné aucun numéro de réception : contactez-la."
      },
      {
        q: 'Quel montant puis-je déclarer ?',
        a: 'Un montant entier en FCFA, positif, qui ne dépasse pas le plafond de votre agence (5 000 000 FCFA par défaut). Pour un paiement partiel, modifiez le montant proposé.'
      },
      {
        q: 'La référence est refusée.',
        a: 'Elle doit comporter 4 à 40 caractères (lettres, chiffres, point, tiret). Si elle a déjà été déclarée, vérifiez-la ou regardez « Mes déclarations ».'
      },
      {
        q: 'La lecture automatique a échoué.',
        a: "Ce n'est pas bloquant : remplissez les champs vous-même."
      }
    ],
    permissions: {
      note: "La déclaration n'est disponible que si votre agence l'a activée et, pour Mobile Money, a enregistré au moins un numéro de réception."
    },
    related: [
      { label: 'Numéros de réception Mobile Money', helpId: 'portails.locataire.paiements.numeros-reception' },
      { label: 'Mes déclarations', helpId: 'portails.locataire.paiements.declarations' }
    ],
    keywords: [
      'déclarer',
      'déclaration',
      'mobile money',
      'référence',
      'capture',
      'preuve',
      'orange money',
      'wave',
      'mtn',
      'moov'
    ]
  },
  {
    id: 'portails.locataire.paiements.numeros-reception',
    kind: 'section',
    title: 'Numéros pour payer par Mobile Money',
    summary:
      "Les numéros Mobile Money de l'agence vers lesquels envoyer votre transfert, avec une éventuelle consigne de l'agence.",
    howToRead: {
      notes: [
        "Chaque numéro indique l'opérateur (Orange Money, MTN MoMo, Moov Money, Wave ou Autre opérateur) et, si l'agence l'a renseigné, un libellé.",
        '« Copier le numéro » copie le numéro sous sa forme à 10 chiffres.',
        "« Consigne de l'agence » est un texte libre de l'agence, affiché tel quel."
      ]
    },
    steps: [
      { title: 'Faire le transfert', detail: "Depuis votre téléphone, envoyez le montant vers l'un de ces numéros." },
      { title: 'Noter la référence', detail: 'Conservez la référence de la transaction reçue par SMS.' },
      { title: 'Déclarer', detail: 'Remplissez ensuite le formulaire en dessous avec le numéro utilisé.' }
    ],
    consequences: [
      'Ce bloc ne déclenche aucun paiement : il vous donne seulement les numéros.',
      'Un transfert Mobile Money envoyé au mauvais numéro ne peut pas être récupéré par ImmoTopia.'
    ],
    faq: [
      {
        q: 'Je ne vois aucun numéro.',
        a: "L'agence n'a pas enregistré de numéro de réception actif : contactez-la, ou payez par un autre mode."
      },
      {
        q: 'Quel numéro choisir ?',
        a: "N'importe lequel, du moment que vous indiquez ensuite dans le formulaire celui que vous avez réellement utilisé."
      },
      {
        q: "J'ai envoyé l'argent au mauvais numéro.",
        a: 'Contactez immédiatement votre opérateur et votre agence.'
      }
    ],
    related: [{ label: 'Déclarer un paiement', helpId: 'portails.locataire.paiements.declaration' }],
    keywords: ['numéro', 'mobile money', 'orange money', 'wave', 'mtn', 'moov', 'réception']
  },

  // ---------------------------------------------------------------- Dépôt de garantie
  {
    id: 'portails.locataire.caution',
    kind: 'page',
    title: 'Dépôt de garantie',
    summary:
      "Le suivi de votre dépôt de garantie (caution) : le montant attendu, ce qui a été versé, retenu, remboursé ou confisqué, et l'historique de chaque mouvement.",
    purpose:
      "Le dépôt de garantie est une somme versée à l'entrée du bail pour couvrir d'éventuels impayés ou dégâts. Cet écran vous permet de vérifier ce que l'agence détient et ce qui s'est passé.",
    steps: [
      {
        title: 'Choisir le bail',
        detail:
          "Si vous avez plusieurs baux actifs, un sélecteur en haut de l'écran choisit celui dont vous voulez voir le dépôt."
      },
      {
        title: 'Lire les chiffres',
        detail: 'Les quatre cartes donnent le montant cible, collecté, retenu et disponible.'
      },
      {
        title: 'Voir le détail',
        detail: 'La carte « Détails du dépôt » reprend aussi les montants remboursé et confisqué.'
      },
      {
        title: 'Relire les mouvements',
        detail: 'Le tableau « Historique des mouvements » liste chaque versement, retenue, remboursement ou ajustement.'
      }
    ],
    consequences: [
      "Cet écran est en lecture seule : les mouvements sont enregistrés par l'agence.",
      "Si votre bail n'a pas de dépôt enregistré, l'écran affiche « Aucun dépôt de garantie trouvé »."
    ],
    faq: [
      {
        q: 'Que veut dire « Montant disponible » ?',
        a: "C'est ce que l'agence détient encore : le montant collecté moins ce qui a été remboursé et ce qui a été confisqué."
      },
      {
        q: 'Quelle différence entre « retenu » et « confisqué » ?',
        a: 'Une somme retenue est mise de côté en attendant une décision ; une somme confisquée est définitivement prélevée sur le dépôt.'
      },
      {
        q: 'Quand mon dépôt me sera-t-il remboursé ?',
        a: "Les remboursements sont décidés et enregistrés par l'agence ; l'application ne donne pas de date."
      }
    ],
    related: [
      { label: 'Historique des mouvements', helpId: 'portails.locataire.caution.mouvements' },
      { label: 'Mon bail', helpId: 'portails.locataire.bail' }
    ],
    keywords: ['caution', 'dépôt de garantie', 'remboursement', 'retenue', 'garantie']
  },
  {
    id: 'portails.locataire.caution.indicateurs',
    kind: 'section',
    title: 'Montants du dépôt',
    summary: 'Quatre cartes : le montant cible, le montant collecté, le montant retenu et le montant disponible.',
    howToRead: {
      notes: [
        'Montant cible : le dépôt attendu selon votre bail.',
        'Montant collecté : ce qui a déjà été versé et enregistré.',
        "Montant retenu : la part mise de côté par l'agence (retenues non encore libérées).",
        'Montant disponible : le collecté, moins ce qui a été remboursé, moins ce qui a été confisqué. Il passe au rouge à zéro.'
      ]
    },
    faq: [
      {
        q: 'Le montant collecté est inférieur au montant cible.',
        a: "Il reste une partie du dépôt à verser. Rapprochez-vous de l'agence pour savoir comment la régler."
      },
      {
        q: 'Le montant retenu est-il déduit du disponible ?',
        a: 'Non : le disponible ne retranche que ce qui a été remboursé ou confisqué. Une retenue est une mise de côté, pas encore un prélèvement.'
      },
      {
        q: 'Où voir les montants remboursé et confisqué ?',
        a: 'Dans la carte « Détails du dépôt ».'
      }
    ],
    related: [{ label: 'Détails du dépôt', helpId: 'portails.locataire.caution.details' }],
    keywords: ['montant cible', 'collecté', 'retenu', 'disponible']
  },
  {
    id: 'portails.locataire.caution.details',
    kind: 'section',
    title: 'Détails du dépôt',
    summary:
      'Le récapitulatif complet de votre dépôt : bail, devise et tous les montants, y compris remboursé et confisqué.',
    howToRead: {
      notes: [
        "Numéro de bail et Nom du bail (affiché seulement s'il existe), Devise.",
        'Montant cible, collecté, retenu, remboursé, confisqué et disponible, en FCFA (ou la devise du bail).',
        "Remboursé : ce qui vous a été rendu. Confisqué : ce que l'agence a définitivement prélevé."
      ]
    },
    faq: [
      {
        q: 'Pourquoi une somme a-t-elle été confisquée ?',
        a: "La note du mouvement, dans l'historique, donne en général la raison. Sinon, demandez des précisions à l'agence."
      },
      {
        q: 'Puis-je contester un montant ?',
        a: "L'application ne permet pas de contestation : adressez-vous à l'agence avec les informations de cet écran."
      },
      {
        q: 'Que contient « Devise » ?',
        a: 'La monnaie dans laquelle le dépôt est tenu, en principe le FCFA.'
      }
    ],
    related: [{ label: 'Historique des mouvements', helpId: 'portails.locataire.caution.mouvements' }],
    keywords: ['remboursé', 'confisqué', 'devise', 'détails']
  },
  {
    id: 'portails.locataire.caution.mouvements',
    kind: 'table',
    title: 'Historique des mouvements du dépôt',
    summary:
      'Chaque ligne est un mouvement sur votre dépôt de garantie : versement, retenue, libération, remboursement, confiscation ou ajustement.',
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: "Date et heure du mouvement ; cliquez sur l'en-tête pour trier." },
        { key: 'type', label: 'Type', description: 'Le genre de mouvement (voir les types ci-dessous).' },
        {
          key: 'amount',
          label: 'Montant',
          description:
            'Le montant précédé de + (vert) pour un versement ou un ajustement, ou de - (rouge) pour les autres mouvements. Le tri est possible.'
        },
        {
          key: 'payment',
          label: 'Paiement associé',
          description: 'Le mode et le montant du paiement lié au mouvement, ou un tiret (-).'
        },
        {
          key: 'installment',
          label: 'Échéance associée',
          description: "La période de l'échéance liée, ou un tiret (-)."
        },
        { key: 'note', label: 'Note', description: "Le commentaire de l'agence, ou un tiret (-)." }
      ],
      statuses: [
        { value: 'COLLECT', label: 'Collecte', description: 'Un versement sur le dépôt.' },
        { value: 'HOLD', label: 'Mise en retenue', description: "Une somme mise de côté par l'agence." },
        { value: 'RELEASE', label: 'Libération', description: 'Une retenue levée.' },
        { value: 'REFUND', label: 'Remboursement', description: 'Une somme rendue au locataire.' },
        { value: 'FORFEIT', label: 'Confiscation', description: "Une somme définitivement prélevée par l'agence." },
        { value: 'ADJUSTMENT', label: 'Ajustement', description: 'Une correction du montant collecté.' }
      ],
      notes: [
        "La recherche porte sur la note, le paiement et l'échéance ; les filtres sont Type et Date.",
        'Le bouton « Exporter » sort tous les mouvements, avec les montants signés.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi un ajustement est-il affiché avec un signe +?',
        a: "L'affichage traite les ajustements comme des ajouts au dépôt. La note de la ligne explique la correction."
      },
      {
        q: 'Je ne vois aucun mouvement.',
        a: "L'écran affiche « Aucun mouvement enregistré » tant que l'agence n'en a saisi aucun."
      },
      {
        q: 'Que veut dire la colonne « Paiement associé » ?',
        a: 'Elle montre le paiement qui a alimenté le dépôt, quand il y en a un.'
      }
    ],
    related: [{ label: 'Montants du dépôt', helpId: 'portails.locataire.caution.indicateurs' }],
    keywords: ['mouvement', 'collecte', 'retenue', 'remboursement', 'confiscation', 'ajustement']
  },

  // ---------------------------------------------------------------- Incidents
  {
    id: 'portails.locataire.incidents',
    kind: 'page',
    title: 'Incidents et maintenance',
    summary:
      "L'écran pour signaler un problème dans votre logement (fuite, panne, climatisation...) et suivre son traitement par l'agence.",
    purpose:
      "Chaque demande devient un « ticket » suivi par l'agence. Vous le suivez par son statut et échangez avec elle par commentaires.",
    steps: [
      {
        title: 'Choisir le bail',
        detail: 'Si vous avez plusieurs baux actifs, choisissez celui du logement concerné avant de créer la demande.'
      },
      { title: 'Créer une demande', detail: 'Cliquez sur « Nouvelle demande » et remplissez le formulaire.' },
      {
        title: 'Suivre la liste',
        detail:
          'Le tableau « Liste des tickets » donne le statut de chaque demande ; filtrez par statut, priorité ou catégorie.'
      },
      {
        title: 'Ouvrir une demande',
        detail: '« Détails » affiche la fiche, les photos et les commentaires ; vous pouvez y ajouter un commentaire.'
      }
    ],
    consequences: [
      "La création d'une demande l'enregistre immédiatement ; l'agence est prévenue par e-mail si cette notification est activée chez elle.",
      'Vous pouvez recevoir un e-mail quand le statut de votre demande change.',
      'Une demande ne se modifie ni ne se supprime depuis le portail : pour la corriger, ajoutez un commentaire.'
    ],
    faq: [
      {
        q: 'Quelle priorité choisir ?',
        a: 'Basse, Moyenne, Haute ou Urgente. La priorité par défaut est Moyenne ; réservez Urgente aux cas graves (fuite importante, panne de courant totale).'
      },
      {
        q: 'Comment corriger ma demande ?',
        a: 'Ouvrez « Détails » et ajoutez un commentaire. Les demandes ne sont pas modifiables depuis le portail.'
      },
      {
        q: 'Qui voit mes demandes ?',
        a: "Vous et l'agence. Vous ne voyez que les demandes de votre propre bail."
      },
      {
        q: 'Que signifie « Assigné » ?',
        a: "L'agence a confié la demande à un prestataire ; elle compte comme « En cours » dans les chiffres."
      }
    ],
    related: [
      { label: 'Nouvelle demande', helpId: 'portails.locataire.incidents.nouvelle-demande' },
      { label: 'Liste des tickets', helpId: 'portails.locataire.incidents.liste' }
    ],
    keywords: [
      'incident',
      'panne',
      'fuite',
      'réparation',
      'maintenance',
      'ticket',
      'plomberie',
      'électricité',
      'climatisation'
    ]
  },
  {
    id: 'portails.locataire.incidents.indicateurs',
    kind: 'section',
    title: 'Indicateurs de maintenance',
    summary: 'Quatre cartes comptent vos demandes : le total, les ouvertes, celles en cours et les résolues.',
    howToRead: {
      notes: [
        'Total tickets : toutes vos demandes, annulées comprises.',
        'Ouverts : statut « Déclaré ».',
        'En cours : statut « En cours » ou « Assigné ».',
        'Résolus : statut « Résolu ».',
        'Ces chiffres ignorent les filtres du tableau : ils portent sur toutes vos demandes (pour le bail choisi si vous en avez plusieurs).'
      ]
    },
    faq: [
      {
        q: 'Pourquoi le total ne correspond-il pas à la somme des trois autres ?',
        a: 'Les demandes « Annulé » sont comptées dans le total seulement.'
      },
      {
        q: 'Les chiffres suivent-ils mon filtre ?',
        a: 'Non, ils restent les mêmes quel que soit le filtre.'
      },
      {
        q: 'Comment faire baisser « Ouverts » ?',
        a: "Ce compteur baisse quand l'agence prend la demande en charge : c'est elle qui change le statut."
      }
    ],
    related: [{ label: 'Liste des tickets', helpId: 'portails.locataire.incidents.liste' }],
    keywords: ['total tickets', 'ouverts', 'en cours', 'résolus']
  },
  {
    id: 'portails.locataire.incidents.liste',
    kind: 'table',
    title: 'Liste des tickets',
    summary:
      'Chaque ligne est une de vos demandes de maintenance, avec sa catégorie, sa priorité, son statut et sa date de création.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Titre', description: 'Le titre que vous avez donné à la demande.' },
        { key: 'category', label: 'Catégorie', description: 'Plomberie, Électricité, Climatisation ou Autre.' },
        { key: 'priority', label: 'Priorité', description: 'Basse, Moyenne, Haute ou Urgente.' },
        { key: 'status', label: 'Statut', description: "L'état de traitement de la demande." },
        { key: 'created_at', label: 'Date de création', description: 'Date et heure de création.' },
        { key: 'actions', label: 'Actions', description: '« Détails » ouvre la fiche de la demande.' }
      ],
      statuses: [
        {
          value: 'DECLARED',
          label: 'Déclaré',
          description: "Votre demande est enregistrée, l'agence ne l'a pas encore prise en charge."
        },
        { value: 'ASSIGNED', label: 'Assigné', description: "L'agence l'a confiée à un prestataire." },
        { value: 'IN_PROGRESS', label: 'En cours', description: 'Le traitement est en cours.' },
        { value: 'RESOLVED', label: 'Résolu', description: 'Le problème est traité.' },
        { value: 'CANCELED', label: 'Annulé', description: 'La demande est annulée.' }
      ],
      notes: [
        'La recherche porte sur le titre et la description ; les filtres sont Statut, Priorité et Catégorie.',
        'Les demandes les plus récentes sont en haut.',
        '« Exporter » sort toutes les demandes correspondant à vos filtres.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi ma demande est-elle toujours « Déclaré » ?',
        a: "L'agence ne l'a pas encore traitée. Ajoutez un commentaire dans « Détails » pour relancer."
      },
      {
        q: "Où voir les photos que j'ai jointes ?",
        a: 'Dans « Détails », section « Pièces jointes ».'
      },
      {
        q: 'Puis-je annuler une demande ?',
        a: "Pas depuis le portail : demandez-le à l'agence par un commentaire."
      }
    ],
    related: [{ label: "Détail d'un ticket", helpId: 'portails.locataire.incidents.detail' }],
    keywords: ['tickets', 'demandes', 'statut', 'priorité', 'catégorie']
  },
  {
    id: 'portails.locataire.incidents.nouvelle-demande',
    kind: 'section',
    title: 'Nouvelle demande de maintenance',
    summary: 'Le formulaire pour signaler un problème dans votre logement, avec une description et des photos.',
    steps: [
      { title: 'Donner un titre', detail: "Obligatoire, par exemple « Fuite d'eau dans la salle de bain »." },
      { title: 'Choisir la catégorie', detail: 'Obligatoire : Plomberie, Électricité, Climatisation ou Autre.' },
      { title: 'Choisir la priorité', detail: 'Basse, Moyenne (par défaut), Haute ou Urgente.' },
      { title: 'Décrire le problème', detail: 'Obligatoire : décrivez-le en détail.' },
      {
        title: 'Préciser le lieu',
        detail: 'Facultatif, 500 caractères au plus (par exemple « Chambre principale, côté fenêtre »).'
      },
      { title: 'Ajouter des photos', detail: 'Images uniquement, 10 fichiers au plus et 5 Mo chacun.' },
      { title: 'Créer le ticket', detail: 'Cliquez sur « Créer le ticket ».' }
    ],
    consequences: [
      'La demande est créée tout de suite ; elle apparaît dans la liste au statut « Déclaré ».',
      "L'agence est prévenue par e-mail si cette notification est activée chez elle.",
      "Si vous avez plusieurs baux, la demande est rattachée au bail choisi en haut de l'écran."
    ],
    faq: [
      {
        q: 'Pourquoi ma photo est-elle refusée ?',
        a: 'Seules les images sont acceptées, et chacune doit faire moins de 5 Mo.'
      },
      {
        q: 'Puis-je envoyer un document PDF ?',
        a: 'Non, uniquement des images.'
      },
      {
        q: "Puis-je modifier la demande après l'envoi ?",
        a: 'Non : ajoutez un commentaire dans « Détails ».'
      }
    ],
    related: [{ label: 'Liste des tickets', helpId: 'portails.locataire.incidents.liste' }],
    keywords: ['nouvelle demande', 'créer un ticket', 'photos', 'priorité', 'catégorie']
  },
  {
    id: 'portails.locataire.incidents.detail',
    kind: 'section',
    title: "Détail d'un ticket",
    summary:
      "La fiche d'une demande : son état, sa description, ses photos et les commentaires échangés avec l'agence.",
    howToRead: {
      notes: [
        "En haut : Statut, Priorité, Catégorie, Date de création, Propriété, Description et, s'il existe, Détails de localisation.",
        "Pièces jointes : vos photos, téléchargeables ; la section n'apparaît que s'il y en a.",
        "Commentaires : le titre indique leur nombre. Un commentaire de l'agence porte le nom du gestionnaire ou « Gestionnaire »; le vôtre porte votre nom ou « Locataire »."
      ]
    },
    steps: [
      { title: 'Lire les commentaires', detail: 'Les échanges sont listés du plus ancien au plus récent.' },
      { title: 'Écrire', detail: 'Tapez votre message dans « Ajouter un commentaire... ».' },
      {
        title: 'Envoyer',
        detail: 'Cliquez sur « Ajouter un commentaire » ; le bouton reste grisé tant que le champ est vide.'
      }
    ],
    consequences: [
      'Un commentaire envoyé ne peut plus être modifié ni supprimé depuis le portail.',
      "La liste et les compteurs sont mis à jour après l'envoi."
    ],
    faq: [
      {
        q: "L'agence va-t-elle voir mon commentaire ?",
        a: "Oui, il est ajouté au ticket que l'agence suit."
      },
      {
        q: 'Puis-je ajouter une photo après coup ?',
        a: 'Pas depuis cette fenêtre : les photos se joignent à la création de la demande.'
      },
      {
        q: 'Mon commentaire contient une erreur.',
        a: 'Envoyez un nouveau commentaire pour la corriger.'
      }
    ],
    related: [{ label: 'Liste des tickets', helpId: 'portails.locataire.incidents.liste' }],
    keywords: ['commentaire', 'ticket', 'pièces jointes', 'photos']
  },

  // ---------------------------------------------------------------- Documents
  {
    id: 'portails.locataire.documents',
    kind: 'page',
    title: 'Documents de location',
    summary:
      'Tous les documents établis pour votre bail (contrat, avenants, quittances, reçus de dépôt, relevés), classés par type et téléchargeables.',
    purpose:
      "Vous retrouvez ici les documents que l'agence a produits pour vos baux. C'est utile pour justifier de votre domicile ou de vos paiements.",
    steps: [
      {
        title: 'Chercher',
        detail:
          "Tapez un nom, un numéro ou un type dans le champ de recherche (affiché seulement s'il y a des documents)."
      },
      { title: 'Repérer le type', detail: 'Chaque carte regroupe un type de document et indique combien il y en a.' },
      { title: 'Télécharger', detail: 'Cliquez sur « Télécharger » à droite du document voulu.' }
    ],
    consequences: [
      "L'écran est en lecture seule : vous ne pouvez ni ajouter ni supprimer de document.",
      "Les documents annulés par l'agence ne sont pas affichés."
    ],
    faq: [
      {
        q: 'Je ne trouve pas ma quittance.',
        a: "Elle apparaît ici quand l'agence l'a établie. Sinon, demandez-la à l'agence."
      },
      {
        q: 'Le bouton « Télécharger » est grisé.',
        a: "Le document n'a pas de fichier disponible pour l'instant."
      },
      {
        q: 'Que veut dire « Final » ou « Brouillon » ?',
        a: "« Final » est un document définitif ; « Brouillon » n'est pas encore arrêté par l'agence."
      }
    ],
    related: [{ label: 'Mon bail', helpId: 'portails.locataire.bail' }],
    keywords: ['documents', 'quittance', 'contrat', 'avenant', 'reçu', 'télécharger']
  },
  {
    id: 'portails.locataire.documents.liste',
    kind: 'section',
    title: 'Documents par type',
    summary: "Une carte par type de document, avec la liste de ses documents, leur statut et leur date d'émission.",
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: "Le document n'est pas encore définitif." },
        { value: 'FINAL', label: 'Final', description: 'Le document est définitif.' },
        { value: 'VOID', label: 'Annulé', description: "Document annulé : il n'est pas affiché dans le portail." }
      ],
      notes: [
        'Types : Contrat de bail, Avenant, Quittance de loyer, Quittance, Reçu de dépôt, Relevé, Autre. Le nombre à côté du titre est le nombre de documents du type.',
        "Un document sans titre ni numéro est nommé « Document » suivi d'un court code.",
        "La recherche porte sur le nom, le numéro et le type. « Aucun résultat » s'affiche si rien ne correspond, avec un moyen d'effacer la recherche."
      ]
    },
    faq: [
      {
        q: 'Pourquoi la recherche a-t-elle disparu ?',
        a: "Elle n'est affichée que lorsqu'il y a au moins un document."
      },
      {
        q: 'Le fichier a-t-il toujours le même format ?',
        a: "Non : le fichier est enregistré avec son format d'origine (par exemple PDF ou Word)."
      },
      {
        q: 'Mon document apparaît deux fois.',
        a: "Il peut s'agir de deux documents distincts (par exemple une quittance et son duplicata). Vérifiez leur numéro et leur date."
      }
    ],
    related: [{ label: 'Documents de la page Mon bail', helpId: 'portails.locataire.bail.documents' }],
    keywords: ['documents', 'type', 'statut', 'recherche']
  }
];

export default entries;
