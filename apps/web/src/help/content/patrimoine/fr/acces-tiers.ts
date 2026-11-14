import type { HelpEntry } from '../../../types';

/** Zone « acces-tiers » du module « patrimoine » (fr). */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.acces-tiers',
    kind: 'page',
    title: 'Accès partagés',
    summary:
      "Donnez à votre notaire, expert-comptable ou banquier un accès en lecture seule à une partie de votre patrimoine, par un lien secret. Vous choisissez ce qu'il voit, pour combien de temps, et vous pouvez le couper à tout moment.",
    purpose:
      "Le bénéficiaire n'a pas de compte et ne peut rien modifier. Chaque ouverture du lien et chaque téléchargement sont journalisés.",
    steps: [
      { title: 'Créer un accès', detail: 'Cliquez sur « Nouvel accès » et suivez les quatre étapes.' },
      {
        title: 'Transmettre le lien',
        detail: "Le lien s'affiche une seule fois : copiez-le, ou laissez l'e-mail le transmettre."
      },
      {
        title: 'Suivre',
        detail:
          "La liste montre le statut, le périmètre, l'expiration et les consultations ; « Journal » détaille tout."
      },
      { title: 'Couper un accès', detail: "« Révoquer » arrête immédiatement l'accès et tous ses liens." }
    ],
    consequences: [
      'Le bénéficiaire ne voit que les rubriques cochées, sans coordonnées ni identité des locataires.',
      "La révocation est définitive et n'envoie aucun message au bénéficiaire."
    ],
    faq: [
      { q: 'Le bénéficiaire peut-il modifier mes données ?', a: "Non, l'accès est en lecture seule." },
      { q: "J'ai perdu le lien.", a: 'Utilisez « Renvoyer un lien » pour en générer un nouveau.' },
      {
        q: 'Quels droits faut-il ?',
        a: '« Voir les biens » pour consulter ; « Modifier les biens » pour créer, modifier, renvoyer un lien ou révoquer.'
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Lecture : « Voir les biens ». Actions : « Modifier les biens ».' },
    related: [
      { label: 'Tableau des accès', helpId: 'patrimoine.acces-tiers.liste' },
      { label: 'Assistant de création', helpId: 'patrimoine.acces-tiers.assistant' }
    ],
    keywords: ['accès partagé', 'notaire', 'expert-comptable', 'banquier', 'lien', 'tiers de confiance']
  },
  {
    id: 'patrimoine.acces-tiers.liste',
    kind: 'table',
    title: 'Tableau des accès partagés',
    summary:
      "Chaque ligne est un accès en lecture seule donné à un notaire, un expert-comptable ou un banquier. Vous y voyez son état, ce qu'il ouvre, son échéance et ses consultations.",
    purpose:
      'Un accès partagé permet à un tiers de confiance de consulter une partie de votre patrimoine (valeurs, emprunts, documents…) sans compte et sans rien pouvoir modifier. Il passe par un lien secret que vous transmettez.',
    howToRead: {
      columns: [
        { key: 'status', label: 'Statut', description: "L'état de l'accès (voir les statuts ci-dessous)." },
        {
          key: 'beneficiaire',
          label: 'Bénéficiaire',
          description: 'Le nom du bénéficiaire et son type : Notaire, Expert-comptable ou Banquier.'
        },
        {
          key: 'perimetre',
          label: 'Périmètre',
          description:
            "Le nombre de biens, d'entités détentrices et de documents partagés, et le propriétaire concerné s'il a été choisi."
        },
        { key: 'rubriques', label: 'Rubriques', description: 'Les rubriques que le bénéficiaire peut voir.' },
        {
          key: 'expiration',
          label: 'Expiration',
          description: "La date de fin de l'accès, ou « Permanent » (jusqu'à révocation)."
        },
        {
          key: 'consultation',
          label: 'Dernière consultation',
          description:
            'La date de la dernière ouverture du lien par le bénéficiaire et le nombre total de consultations.'
        }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: "L'accès fonctionne." },
        {
          value: 'EXPIRING',
          label: 'Expire bientôt',
          description: "La date de fin tombe dans les 7 jours. Un accès permanent n'est jamais dans ce cas."
        },
        { value: 'EXPIRED', label: 'Expiré', description: 'La date de fin est passée : le lien ne donne plus rien.' },
        { value: 'REVOKED', label: 'Révoqué', description: "Vous avez retiré l'accès : il ne peut plus être modifié." }
      ],
      notes: ['« Modifier » reste possible pour un accès expiré, par exemple pour reculer sa date de fin.']
    },
    steps: [
      { title: 'Créer un accès', detail: "Cliquez sur « Nouvel accès » et suivez l'assistant en quatre étapes." },
      {
        title: 'Modifier',
        detail: "« Modifier » rouvre l'assistant. Le type de bénéficiaire et le propriétaire ne changent plus."
      },
      {
        title: 'Renvoyer un lien',
        detail: '« Renvoyer un lien » émet un nouveau lien. Disponible pour un accès actif ou qui expire bientôt.'
      },
      { title: 'Consulter le journal', detail: '« Journal » montre qui a ouvert quoi, et quand.' },
      { title: 'Révoquer', detail: "« Révoquer » coupe l'accès après confirmation." }
    ],
    consequences: [
      'Le bénéficiaire ne voit que les rubriques cochées, en lecture seule, pour les biens du périmètre. Il ne voit ni coordonnées, ni identité des locataires ou des co-indivisaires.',
      'Chaque consultation et chaque téléchargement de document est journalisé (date, adresse IP, appareil) et compté.',
      "La révocation est immédiate et définitive : tous les liens cessent de fonctionner. Aucun message n'est envoyé au bénéficiaire, et le journal est conservé."
    ],
    faq: [
      {
        q: "Le bénéficiaire a-t-il besoin d'un compte ?",
        a: 'Non. Le lien secret suffit : gardez-le donc pour la personne concernée.'
      },
      {
        q: 'Je ne vois pas les boutons qui créent ou modifient.',
        a: 'Créer, modifier, renvoyer un lien et révoquer demandent le droit « Modifier les biens ». Lire la liste et le journal demande « Voir les biens ».'
      },
      {
        q: 'Pourquoi « Renvoyer un lien » est-il absent ?',
        a: "L'accès est expiré ou révoqué. Pour un accès expiré, prolongez d'abord sa date de fin avec « Modifier »."
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Lecture : « Voir les biens ». Création, modification, lien, révocation : « Modifier les biens ».'
    },
    related: [
      { label: 'Créer un accès (assistant)', helpId: 'patrimoine.acces-tiers.assistant' },
      { label: 'Journal des consultations', helpId: 'patrimoine.acces-tiers.journal' }
    ],
    keywords: [
      'accès partagé',
      'notaire',
      'expert-comptable',
      'banquier',
      'tiers de confiance',
      'lien',
      'partage',
      'lecture seule'
    ]
  },
  {
    id: 'patrimoine.acces-tiers.assistant',
    kind: 'section',
    title: "Assistant de création d'un accès",
    summary:
      'Quatre étapes pour créer ou modifier un accès : bénéficiaire, périmètre, rubriques, durée. Un message sous les boutons dit ce qui manque avant de continuer.',
    steps: [
      { title: 'Bénéficiaire', detail: 'Type, nom et adresse e-mail.' },
      { title: 'Périmètre', detail: 'Les biens et entités partagés.' },
      { title: 'Rubriques', detail: 'Ce que le bénéficiaire pourra voir, et les documents.' },
      { title: 'Durée', detail: 'Date de fin, durée du lien et envoi par e-mail.' },
      { title: 'Valider', detail: "Cliquez sur « Créer l'accès » (ou « Enregistrer » en modification)." }
    ],
    consequences: [
      "À la création, un lien est émis et affiché une seule fois. Si vous avez gardé l'envoi par e-mail, le bénéficiaire reçoit ce lien, à condition que ce message soit activé pour votre agence.",
      "La création et chaque modification sont tracées au journal de l'accès.",
      "En modification, les changements s'appliquent dès la consultation suivante : le périmètre et les rubriques sont relus à chaque ouverture du lien."
    ],
    faq: [
      {
        q: 'Peut-on changer le type de bénéficiaire ?',
        a: 'Non, il est figé après la création, de même que le propriétaire concerné.'
      },
      { q: 'Combien de biens au maximum ?', a: 'Un accès ne peut pas couvrir plus de 100 biens, entités comprises.' }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Demande « Modifier les biens ».' },
    related: [
      { label: 'Étape Bénéficiaire', helpId: 'patrimoine.acces-tiers.beneficiaire' },
      { label: 'Tableau des accès', helpId: 'patrimoine.acces-tiers.liste' }
    ],
    keywords: ['nouvel accès', 'assistant', 'créer', 'partager']
  },
  {
    id: 'patrimoine.acces-tiers.beneficiaire',
    kind: 'section',
    title: 'Étape 1 : le bénéficiaire',
    summary:
      "Indiquez qui reçoit l'accès : son type, son nom et son adresse e-mail. Le type règle les rubriques proposées à l'étape 3.",
    steps: [
      { title: 'Type', detail: 'Notaire, Expert-comptable ou Banquier.' },
      { title: 'Nom', detail: 'Obligatoire, 120 caractères au plus.' },
      {
        title: 'Adresse e-mail',
        detail: "Obligatoire et valide : c'est là que le lien sera envoyé si vous le demandez."
      }
    ],
    consequences: [
      "En modification, changer l'adresse e-mail révoque tous les liens actifs : vous devrez renvoyer un lien. Un nouveau bénéficiaire ne reçoit jamais les anciens liens."
    ],
    faq: [
      {
        q: 'Le bénéficiaire reçoit-il un message à la création ?',
        a: "Oui, si vous laissez coché « Envoyer le lien par e-mail » à l'étape 4 et que ce message est activé pour votre agence."
      }
    ],
    related: [{ label: 'Étape suivante : périmètre', helpId: 'patrimoine.acces-tiers.perimetre' }],
    keywords: ['bénéficiaire', 'e-mail', 'notaire', 'banquier']
  },
  {
    id: 'patrimoine.acces-tiers.perimetre',
    kind: 'section',
    title: 'Étape 2 : le périmètre',
    summary:
      'Choisissez les biens et les entités détentrices que le bénéficiaire pourra voir. Il faut au moins un bien ou une entité.',
    steps: [
      {
        title: 'Propriétaire (facultatif)',
        detail: 'Filtre la liste des biens sur un propriétaire. Il détermine aussi la quote-part appliquée aux totaux.'
      },
      { title: 'Biens', detail: 'Cochez les biens, ou « Tout cocher » pour la liste affichée.' },
      { title: 'Entités détentrices', detail: "Cochez une entité pour partager aussi tous les biens qu'elle détient." }
    ],
    consequences: [
      "Les biens d'une entité sont ajoutés à chaque consultation : si l'entité acquiert un bien, il devient visible.",
      "Le bénéficiaire ne voit que des biens de votre agence ; un bien qui sort du périmètre cesse d'être visible."
    ],
    faq: [
      {
        q: 'Une entité sans bien est-elle acceptée ?',
        a: "Non : l'accès est refusé si l'entité choisie ne détient aucun bien."
      }
    ],
    related: [{ label: 'Étape suivante : rubriques', helpId: 'patrimoine.acces-tiers.rubriques' }],
    keywords: ['biens', 'entité', 'périmètre', 'propriétaire']
  },
  {
    id: 'patrimoine.acces-tiers.rubriques',
    kind: 'section',
    title: 'Étape 3 : les rubriques',
    summary:
      'Cochez ce que le bénéficiaire verra. Les rubriques proposées suivent son type, et vous pouvez les modifier.',
    howToRead: {
      notes: [
        'Valorisations : valeur estimée, historique des estimations et plus-value latente.',
        'Rendement et ratios : rendement brut, net et net-net du bien.',
        'Emprunts : prêts en cours, capital restant dû, taux et mensualités.',
        'Dépenses : dépenses des 12 derniers mois par catégorie, sans détail libre.',
        'Baux et loyers : baux, loyers et charges, sans identité des locataires.',
        'Documents partageables : seulement les documents cochés ensuite.',
        'Titres et propriété : nature de la propriété, entités détentrices et quotes-parts.',
        'Par défaut : Notaire, Titres et propriété, Documents et Valorisations ; Expert-comptable, Dépenses, Baux et loyers et Emprunts ; Banquier, Valorisations, Rendement et ratios et Emprunts.'
      ]
    },
    steps: [
      { title: 'Cocher les rubriques', detail: 'Au moins une rubrique est obligatoire.' },
      {
        title: 'Choisir les documents',
        detail: "Avec « Documents partageables », cochez les fichiers des biens sélectionnés à l'étape 2."
      }
    ],
    consequences: [
      'Les documents proposés sont ceux des biens cochés directement, pas ceux des biens obtenus par une entité.',
      'Un document ne peut être partagé que si la rubrique « Documents partageables » est cochée. La décocher referme aussi les partages de documents.',
      'Le bénéficiaire peut télécharger les documents cochés ; chaque téléchargement est journalisé.'
    ],
    faq: [
      {
        q: 'Le bénéficiaire voit-il les noms de mes locataires ?',
        a: 'Non. Il ne voit ni identité de locataire, ni coordonnées, ni identité de co-indivisaire.'
      }
    ],
    related: [{ label: 'Étape suivante : durée', helpId: 'patrimoine.acces-tiers.duree' }],
    keywords: ['rubriques', 'documents', 'valorisations', 'emprunts', 'dépenses']
  },
  {
    id: 'patrimoine.acces-tiers.duree',
    kind: 'section',
    title: 'Étape 4 : la durée',
    summary:
      "Fixez la fin de l'accès, puis, à la création, la durée du lien et l'envoi par e-mail. Un accès permanent ne rend pas le lien éternel.",
    steps: [
      {
        title: "Durée de l'accès",
        detail:
          "« Jusqu'à une date » (90 jours proposés, date à venir obligatoire) ou « Permanent (jusqu'à révocation) »."
      },
      {
        title: 'Validité du lien',
        detail: 'En jours : 7 proposés, et un maximum fixé par la plateforme (30 jours par défaut). Création seulement.'
      },
      { title: 'Envoi', detail: "Cochez « Envoyer le lien par e-mail au bénéficiaire » pour l'avertir tout de suite." }
    ],
    consequences: [
      "Un lien ne vit jamais au-delà de la date de fin de l'accès. Vous pouvez renvoyer un nouveau lien à tout moment.",
      "Si l'envoi n'est pas demandé, est désactivé pour l'agence ou échoue, rien n'est envoyé : transmettez le lien vous-même."
    ],
    faq: [
      {
        q: 'Que se passe-t-il à la date de fin ?',
        a: "L'accès passe à « Expiré » et ne donne plus rien. Vous pouvez le prolonger avec « Modifier »."
      }
    ],
    keywords: ['durée', 'expiration', 'permanent', 'lien', 'e-mail']
  },
  {
    id: 'patrimoine.acces-tiers.lien',
    kind: 'section',
    title: "Lien d'accès",
    summary: 'Cette fenêtre affiche le lien secret une seule fois. Copiez-le avant de fermer : il ne sera plus montré.',
    steps: [
      {
        title: "Lire le résultat de l'envoi",
        detail: "Le message dit si un e-mail est parti, ou pourquoi il n'est pas parti."
      },
      { title: 'Copier', detail: 'Cliquez sur « Copier le lien », puis transmettez-le vous-même si besoin.' },
      { title: 'Fermer', detail: "« J'ai copié le lien, fermer »." }
    ],
    consequences: [
      'Fermée, la fenêtre ne garde aucune trace du lien. Perdu, il se remplace par « Renvoyer un lien ».',
      'La date de validité du lien est affichée en bas.'
    ],
    faq: [
      {
        q: "J'ai fermé sans copier le lien.",
        a: 'Utilisez « Renvoyer un lien » : cela génère un nouveau lien. Vous pouvez aussi révoquer les précédents.'
      }
    ],
    keywords: ['lien', 'copier', 'url']
  },
  {
    id: 'patrimoine.acces-tiers.renvoi',
    kind: 'section',
    title: 'Renvoyer un lien',
    summary: "Émet un nouveau lien pour un accès actif, avec sa durée, et l'envoie éventuellement par e-mail.",
    steps: [
      { title: 'Durée', detail: 'Durée de validité du lien en jours (7 proposés).' },
      { title: 'E-mail', detail: 'Cochez ou non « Envoyer le lien par e-mail au bénéficiaire ».' },
      {
        title: 'Anciens liens',
        detail: "Cochez « Révoquer les liens précédents » pour qu'ils cessent de fonctionner."
      },
      { title: 'Générer', detail: "Cliquez sur « Générer le lien » : le lien s'affiche une seule fois." }
    ],
    consequences: [
      'Sans la case « Révoquer les liens précédents », les anciens liens continuent de fonctionner.',
      "L'envoi est tracé au journal de l'accès (sans le lien ni l'adresse e-mail).",
      "Impossible pour un accès révoqué ou expiré : prolongez d'abord un accès expiré."
    ],
    faq: [
      {
        q: 'Le bénéficiaire est-il informé des anciens liens révoqués ?',
        a: "Non, aucun message n'est envoyé pour cela."
      }
    ],
    keywords: ['renvoyer', 'nouveau lien', 'révoquer']
  },
  {
    id: 'patrimoine.acces-tiers.journal',
    kind: 'table',
    title: 'Journal des consultations',
    summary:
      "Le journal liste tout ce qui s'est passé sur un accès : création, modifications, envois de lien, consultations et téléchargements.",
    howToRead: {
      columns: [
        { key: 'at', label: 'Date', description: "La date et l'heure de l'événement." },
        {
          key: 'action',
          label: 'Événement',
          description: 'Consultation, Document téléchargé, Lien envoyé, Accès créé, Accès modifié ou Accès révoqué.'
        },
        {
          key: 'detail',
          label: 'Détail',
          description: 'Le nom du document téléchargé, ou les rubriques ouvertes lors de la consultation.'
        },
        {
          key: 'ipAddress',
          label: 'Adresse IP',
          description:
            "L'adresse depuis laquelle le bénéficiaire s'est connecté ; un tiret si aucune adresse n'est enregistrée."
        }
      ]
    },
    steps: [
      { title: 'Rechercher', detail: 'Par nom de document ou adresse IP.' },
      { title: 'Filtrer', detail: "Par type d'événement et par période." }
    ],
    consequences: ['Le journal ne se modifie pas et reste consultable après une révocation.'],
    faq: [
      { q: 'Que veut dire une adresse IP inconnue ?', a: "Un tiret s'affiche quand aucune adresse n'est enregistrée." }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Demande « Voir les biens ».' },
    keywords: ['journal', 'consultation', 'historique', 'adresse IP', 'téléchargement']
  },
  {
    id: 'patrimoine.acces-tiers.revocation',
    kind: 'section',
    title: 'Révoquer un accès',
    summary:
      "La révocation coupe l'accès tout de suite : le bénéficiaire perd l'accès et tous ses liens cessent de fonctionner. Elle est définitive.",
    steps: [
      { title: 'Vérifier le nom', detail: 'Le titre rappelle le bénéficiaire concerné.' },
      { title: 'Confirmer', detail: "Cliquez sur « Révoquer », ou « Annuler » pour garder l'accès." }
    ],
    consequences: [
      'Un accès révoqué ne peut plus être modifié ni recevoir de lien : créez-en un nouveau si besoin.',
      "Aucun message n'est envoyé au bénéficiaire. La révocation est tracée au journal."
    ],
    faq: [{ q: 'Puis-je annuler une révocation ?', a: 'Non. Créez un nouvel accès.' }],
    keywords: ['révoquer', 'supprimer', "retirer l'accès"]
  }
];

export default entries;
