import type { HelpEntry } from '../../../types';

/** Zone « assemblees » du module « syndic » (fr) : assemblées générales et coffre documentaire. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Assemblées : liste
  {
    id: 'syndic.assemblees.liste',
    kind: 'page',
    title: 'Assemblées générales',
    summary:
      "Cet onglet liste les assemblées générales de la copropriété et permet d'en créer une. Chaque ligne mène à la fiche de l'assemblée, où se prépare et se déroule la séance.",
    purpose:
      "C'est le point de départ d'une assemblée : vous la planifiez ici (type, date, heure, lieu), puis vous saisissez l'ordre du jour, les résolutions et les pouvoirs, et vous envoyez la convocation depuis sa fiche.",
    steps: [
      {
        title: 'Créer l’assemblée',
        detail:
          "Cliquez sur « Nouvelle assemblée », choisissez le type, la date, l'heure de début, puis si vous le souhaitez l'heure de fin et le lieu."
      },
      {
        title: 'Laisser la case des convocations décochée',
        detail:
          "« Envoyer les convocations maintenant » est décochée par défaut : vous avez ainsi le temps de saisir l'ordre du jour avant l'envoi."
      },
      { title: 'Ouvrir la fiche', detail: "Cliquez sur « Voir détails » pour préparer l'assemblée." },
      {
        title: 'Suivre le statut',
        detail:
          "Depuis la ligne, « Ouvrir la séance » ou « Annuler l'assemblée » pour une assemblée planifiée, « Clôturer la séance » pour une assemblée en cours."
      },
      { title: 'Retrouver une assemblée', detail: 'Utilisez la recherche, le statut, la date ou le type.' }
    ],
    consequences: [
      "Créer l'assemblée n'envoie rien tant que vous ne cochez pas « Envoyer les convocations maintenant ». Si vous la cochez, les convocations partent aussitôt, en arrière-plan, avant que vous ayez saisi l'ordre du jour.",
      "Après un envoi, un bandeau indique le nombre d'e-mails envoyés et échoués, avec un bouton « Renvoyer la convocation » si certains ont échoué.",
      'Annuler une assemblée et clôturer une séance sont définitifs.'
    ],
    faq: [
      {
        q: 'Pourquoi les convocations ne partent-elles pas à la création ?',
        a: "Pour vous laisser saisir l'ordre du jour d'abord. Vous les envoyez ensuite depuis la fiche de l'assemblée avec « Envoyer les convocations »."
      },
      {
        q: 'Puis-je supprimer une assemblée ?',
        a: "Pas depuis cet écran. Tant qu'elle est « Planifiée », vous pouvez l'annuler."
      },
      {
        q: "Que faire si le message dit que l'assemblée a peut-être été créée ?",
        a: "Une coupure a empêché de voir la réponse. Regardez la liste avant de réessayer : l'assemblée y figure peut-être déjà."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété'],
      note: "Consulter la liste demande « Consulter le module Syndic ». Créer, ouvrir, clôturer ou annuler demande « Modifier le module Syndic ». L'assemblée classique (convocation, résolutions, votes saisis, procès-verbal) est incluse dans le pack Syndic ; l'AG en direct et la visio sont une option payante, décrite dans la fiche « En direct »."
    },
    related: [
      { label: 'Liste des assemblées', helpId: 'syndic.assemblees.tableau' },
      { label: 'Créer une assemblée générale', helpId: 'syndic.assemblees.creation' },
      { label: 'Fiche d’une assemblée', helpId: 'syndic.assemblees.detail' }
    ],
    keywords: ['AG', 'assemblée générale', 'copropriété', 'convocation', 'séance', 'réunion', 'planifier']
  },
  {
    id: 'syndic.assemblees.tableau',
    kind: 'table',
    title: 'Liste des assemblées',
    summary:
      'Ce tableau montre chaque assemblée avec son type, sa date, ses horaires, son lieu et son statut. Vous pouvez la consulter ou changer son statut depuis la ligne.',
    purpose: 'Il sert à retrouver une assemblée et à faire avancer son statut sans ouvrir sa fiche.',
    howToRead: {
      columns: [
        { key: 'type', label: 'Type', description: 'Ordinaire ou Extraordinaire.' },
        { key: 'scheduledAt', label: 'Date', description: "Date et heure de l'assemblée (jour/mois/année)." },
        { key: 'startTime', label: 'Début', description: "Heure de début. « - » si elle n'est pas renseignée." },
        { key: 'endTime', label: 'Fin', description: "Heure de fin. « - » si elle n'est pas renseignée." },
        { key: 'location', label: 'Lieu', description: "Lieu de l'assemblée, ou « Non renseigné »." },
        { key: 'status', label: 'Statut', description: "Étape de l'assemblée (voir les statuts ci-dessous)." },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Voir détails » et le bouton de changement de statut possible.'
        }
      ],
      statuses: [
        {
          value: 'PLANNED',
          label: 'Planifiée',
          description: "L'assemblée est préparée : ordre du jour, résolutions, pouvoirs, convocation."
        },
        { value: 'IN_PROGRESS', label: 'En cours', description: 'La séance est ouverte : émargement et votes.' },
        { value: 'COMPLETED', label: 'Clôturée', description: 'Les votes sont figés ; plus aucune modification.' },
        { value: 'CANCELLED', label: 'Annulée', description: "L'assemblée n'a pas lieu ; plus aucune modification." }
      ],
      notes: [
        "Les filtres portent sur le texte, le statut, la date et le type. L'export reprend les colonnes du tableau."
      ]
    },
    steps: [
      { title: 'Consulter', detail: "« Voir détails » ouvre la fiche de l'assemblée." },
      { title: 'Ouvrir la séance', detail: 'Disponible pour une assemblée « Planifiée ».' },
      {
        title: 'Clôturer',
        detail: '« Clôturer la séance » est disponible pour une assemblée « En cours » ; une confirmation est demandée.'
      }
    ],
    consequences: [
      'Une assemblée annulée ne peut plus recevoir de vote.',
      'Clôturer fige les votes et ne se défait pas.'
    ],
    faq: [
      {
        q: "Pourquoi n'y a-t-il pas de bouton de statut sur une assemblée clôturée ?",
        a: 'Une assemblée clôturée ou annulée ne change plus de statut.'
      },
      {
        q: 'Puis-je annuler une assemblée en cours ?',
        a: "Non : une séance ouverte se clôture, elle ne s'annule pas."
      },
      {
        q: "Où vois-je l'ordre du jour ?",
        a: "Dans la fiche de l'assemblée, avec « Voir détails »."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Changer le statut demande « Modifier le module Syndic ».'
    },
    related: [{ label: 'Statut et clôture', helpId: 'syndic.assemblees.detail.statuts' }],
    keywords: ['statut', 'planifiée', 'clôturée', 'annulée', 'ouvrir la séance', 'liste']
  },
  {
    id: 'syndic.assemblees.creation',
    kind: 'section',
    title: 'Créer une assemblée générale',
    summary:
      "Cette fenêtre crée l'assemblée avec son type, sa date, ses horaires et son lieu. Elle propose aussi d'envoyer les convocations tout de suite.",
    purpose:
      "Créer l'assemblée ouvre sa fiche de travail. L'ordre du jour, les résolutions et les pouvoirs s'y ajoutent ensuite.",
    steps: [
      { title: 'Type', detail: '« Ordinaire » ou « Extraordinaire ».' },
      { title: 'Date et heure de début', detail: 'Les deux sont obligatoires, dans deux champs séparés.' },
      { title: 'Heure de fin et lieu', detail: "Facultatifs. L'heure de fin doit suivre l'heure de début." },
      {
        title: 'Convocations',
        detail:
          "Cochez « Envoyer les convocations maintenant » seulement si vous voulez les envoyer sans attendre. Sinon, envoyez-les depuis l'assemblée une fois l'ordre du jour saisi."
      },
      { title: 'Valider', detail: 'Cliquez sur « Créer ».' }
    ],
    consequences: [
      "Si la case est cochée, tous les copropriétaires sont convoqués en arrière-plan, sans attendre la fin de l'envoi à l'écran.",
      "La case décochée ne laisse aucune trace d'envoi : l'assemblée affichera « Envoyer les convocations » dans sa fiche."
    ],
    faq: [
      {
        q: "Pourquoi un message refuse l'heure de fin ?",
        a: "L'heure de fin doit être après l'heure de début."
      },
      {
        q: 'Puis-je changer la date plus tard ?',
        a: "La fiche permet de modifier l'heure de début, l'heure de fin et le lieu. Pour la date, voyez ce point avec votre administrateur : la fiche ne propose pas de la modifier."
      },
      {
        q: 'Un double clic crée-t-il deux assemblées ?',
        a: "Non : l'écran évite l'envoi en double et reprend la même création en cas de nouvel essai après une coupure."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Créer une assemblée demande « Modifier le module Syndic ».' },
    related: [{ label: 'Convocation des copropriétaires', helpId: 'syndic.assemblees.detail.convocation' }],
    keywords: ['nouvelle assemblée', 'créer', 'ordinaire', 'extraordinaire', 'date', 'lieu']
  },

  // ------------------------------------------------------------------ Assemblées : fiche
  {
    id: 'syndic.assemblees.detail',
    kind: 'page',
    title: 'Fiche d’une assemblée générale',
    summary:
      'La fiche réunit tout ce qui concerne une assemblée : date et lieu, ordre du jour, résolutions, pouvoirs, convocation, séance en direct et résultats. Son statut commande ce que vous pouvez encore modifier.',
    purpose:
      'Avant la séance, vous préparez et convoquez. Pendant la séance, vous faites émarger les lots et enregistrez les votes. Après la clôture, tout est figé et vous téléchargez le compte rendu.',
    steps: [
      {
        title: 'Vérifier date, heure et lieu',
        detail: '« Heure début », « Heure fin » et « Lieu », puis « Enregistrer ».'
      },
      { title: 'Saisir l’ordre du jour', detail: 'Carte « Ordre du jour », bouton « Ajouter un point ».' },
      {
        title: 'Ajouter les résolutions',
        detail: 'Bouton « Ajouter une résolution » : titre, description et règle de majorité.'
      },
      { title: 'Enregistrer les pouvoirs', detail: 'Carte « Pouvoirs », « Ajouter un pouvoir ».' },
      { title: 'Convoquer', detail: '« Envoyer les convocations », ou « Convocation (Word) » pour un lot.' },
      { title: 'Ouvrir la séance', detail: '« Ouvrir la séance » puis émargement et votes.' },
      { title: 'Clôturer', detail: '« Clôturer la séance », puis « Générer compte rendu Word ».' }
    ],
    consequences: [
      "La clôture et l'annulation sont définitives : plus de vote, de résolution, de pouvoir ni de changement d'ordre du jour, de date ou de lieu.",
      'La convocation envoyée ne se rappelle pas : seul un renvoi, limité, existe.'
    ],
    faq: [
      {
        q: 'Pourquoi tous les boutons sont-ils grisés ?',
        a: "L'assemblée est clôturée ou annulée : elle est figée. Une infobulle donne la raison."
      },
      {
        q: 'Où saisir les votes ?',
        a: 'Dans la carte « Ordre du jour et votes » : choisissez le lot votant puis « Pour », « Contre » ou « Abstention ».'
      },
      {
        q: 'La carte « En direct » affiche « option non souscrite ». Est-ce normal ?',
        a: "Oui si l'option « AG en direct et visio » n'est pas souscrite. L'assemblée classique reste utilisable."
      },
      {
        q: 'Où est le procès-verbal ?',
        a: "« Générer compte rendu Word » télécharge le compte rendu. Vous pouvez ensuite l'ajouter dans l'onglet « Documents »."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété'],
      note: "Consulter demande « Consulter le module Syndic » ; toute modification demande « Modifier le module Syndic ». La carte « En direct » (console, vote en ligne, visio) relève de l'option payante « AG en direct et visio »."
    },
    related: [
      { label: 'Ordre du jour', helpId: 'syndic.assemblees.detail.ordre-du-jour' },
      { label: 'Résultats des résolutions', helpId: 'syndic.assemblees.detail.resultats' },
      { label: 'Pouvoirs', helpId: 'syndic.assemblees.detail.pouvoirs' },
      { label: 'Convocation des copropriétaires', helpId: 'syndic.assemblees.detail.convocation' },
      { label: 'En direct', helpId: 'syndic.assemblees.detail.direct' }
    ],
    keywords: ['AG', 'préparer une assemblée', 'convocation', 'ordre du jour', 'vote', 'procès-verbal', 'séance'],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'ag-ordre-du-jour',
          title: "Saisir l'ordre du jour",
          description:
            "Ajoutez chaque point à débattre avec « Ajouter un point ». L'ordre du jour reste modifiable jusqu'à la clôture."
        },
        {
          target: 'ag-pouvoirs',
          title: 'Enregistrer les pouvoirs',
          description:
            "Un copropriétaire peut en mandater un autre ou un contact de l'agence : un seul pouvoir par mandant. Les pouvoirs ne se modifient plus après la clôture."
        },
        {
          target: 'ag-vote',
          title: 'Saisir les votes',
          description:
            "Une fois les résolutions ajoutées, choisissez le lot votant puis « Pour », « Contre » ou « Abstention ». Les boutons d'en-tête (résolutions, convocations, ouverture de la séance) dépendent du statut : voir la fiche."
        }
      ]
    }
  },
  {
    id: 'syndic.assemblees.detail.statuts',
    kind: 'section',
    title: 'Statut, clôture et compte rendu',
    summary:
      "Le statut indique où en est l'assemblée et commande ce qui reste modifiable. Les boutons de la fiche la font avancer : ouvrir la séance, la clôturer ou l'annuler.",
    purpose:
      "Le déroulement est à sens unique : une assemblée planifiée s'ouvre puis se clôture, ou s'annule avant l'ouverture. La clôture donne les résultats définitifs.",
    howToRead: {
      statuses: [
        {
          value: 'PLANNED',
          label: 'Planifiée',
          description: 'Vous préparez ; la convocation peut être envoyée ou renvoyée.'
        },
        {
          value: 'IN_PROGRESS',
          label: 'En cours',
          description: 'La séance est ouverte. Seul « Clôturer la séance » reste possible.'
        },
        { value: 'COMPLETED', label: 'Clôturée', description: 'Tout est figé, résultats compris.' },
        { value: 'CANCELLED', label: 'Annulée', description: "Tout est figé ; aucun vote n'est possible." }
      ]
    },
    steps: [
      { title: 'Ouvrir la séance', detail: 'Bouton « Ouvrir la séance » pour une assemblée « Planifiée ».' },
      { title: 'Annuler', detail: "« Annuler l'assemblée », avec confirmation, tant que la séance n'est pas ouverte." },
      { title: 'Clôturer', detail: '« Clôturer la séance », avec confirmation.' },
      {
        title: 'Télécharger le compte rendu',
        detail: '« Générer compte rendu Word » télécharge un fichier Word sur votre appareil.'
      }
    ],
    consequences: [
      "L'ouverture renseigne l'heure de début si elle était vide. La clôture renseigne l'heure de fin si elle était vide.",
      'La clôture ferme les votes encore ouverts, recalcule une dernière fois les résultats et les fige, puis ferme la salle de visio.',
      "Le compte rendu reprend la copropriété, le type, la date, les heures, le lieu, le quorum, l'ordre du jour et les discussions, les résolutions avec leur règle, leurs votes et leur résultat, les pouvoirs et la feuille de présence.",
      "Le compte rendu n'est ni envoyé ni classé tout seul : ajoutez-le dans l'onglet « Documents » (type « Procès-verbal d'AG ») pour le partager."
    ],
    faq: [
      {
        q: 'Peut-on rouvrir une assemblée clôturée ?',
        a: 'Non. Une assemblée clôturée ou annulée ne change plus de statut.'
      },
      {
        q: 'Peut-on annuler une séance déjà ouverte ?',
        a: 'Non : une séance en cours se clôture seulement.'
      },
      {
        q: 'Peut-on clôturer sans avoir ouvert la séance ?',
        a: "Non : la séance doit d'abord être ouverte."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Changer le statut demande « Modifier le module Syndic ».' },
    related: [{ label: 'Documents', helpId: 'syndic.documents.liste' }],
    keywords: ['ouvrir la séance', 'clôturer', 'annuler', 'compte rendu', 'procès-verbal', 'Word']
  },
  {
    id: 'syndic.assemblees.detail.ordre-du-jour',
    kind: 'section',
    title: 'Ordre du jour',
    summary:
      "Cette carte liste les points à traiter pendant l'assemblée, dans l'ordre, avec leurs discussions. Vous y ajoutez, modifiez ou supprimez des points.",
    purpose:
      "L'ordre du jour sert de trame à la séance et se retrouve dans la convocation Word (à défaut de points, ce sont les résolutions proposées) et dans le compte rendu.",
    steps: [
      {
        title: 'Ajouter un point',
        detail: "« Ajouter un point » : titre, numéro d'ordre et une ligne par discussion."
      },
      { title: 'Modifier', detail: "« Modifier » sur le point : changez le titre, l'ordre ou les discussions." },
      { title: 'Supprimer', detail: '« Supprimer », avec confirmation.' }
    ],
    consequences: [
      "L'ordre du jour reste modifiable tant que l'assemblée est « Planifiée » ou « En cours » : on peut saisir les discussions en séance.",
      "Une assemblée clôturée ou annulée n'accepte plus aucune modification.",
      'Supprimer un point est définitif.'
    ],
    faq: [
      {
        q: "Comment changer l'ordre des points ?",
        a: "Modifiez le champ « Ordre » du point : les points s'affichent par ordre croissant."
      },
      {
        q: "Un point d'ordre du jour est-il une résolution ?",
        a: 'Non. Les résolutions se votent et sont gérées à part avec « Ajouter une résolution ».'
      },
      {
        q: "L'ordre du jour part-il dans l'e-mail de convocation ?",
        a: "Le message de convocation par défaut n'en contient pas. L'ordre du jour figure dans la « Convocation (Word) »."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Ajouter, modifier ou supprimer un point demande « Modifier le module Syndic ».'
    },
    related: [{ label: 'Convocation des copropriétaires', helpId: 'syndic.assemblees.detail.convocation' }],
    keywords: ['point', 'discussion', 'ordre du jour', 'agenda']
  },
  {
    id: 'syndic.assemblees.detail.resolution',
    kind: 'section',
    title: 'Ajouter une résolution',
    summary:
      'Cette fenêtre crée une résolution à voter, avec sa règle de majorité. La règle décide de la façon dont le résultat est calculé en tantièmes.',
    purpose:
      'Une résolution est une décision soumise au vote des lots. Le résultat est recalculé à chaque vote et figé à la clôture.',
    howToRead: {
      notes: [
        "Article 24 — majorité simple : « Pour » doit dépasser « Contre » en tantièmes exprimés ; les abstentions sont exclues. C'est la règle par défaut.",
        "Article 25 — majorité absolue : « Pour » doit dépasser 50 % des tantièmes de tous les lots, qu'ils votent ou non.",
        'Article 26 — double majorité : plus de la moitié des copropriétaires et au moins 2/3 des tantièmes.',
        'Unanimité : tous les lots votent « Pour ».'
      ]
    },
    steps: [
      { title: 'Titre', detail: 'Obligatoire.' },
      { title: 'Description', detail: 'Facultative : détails soumis au vote.' },
      { title: 'Règle de majorité', detail: "Choisissez la règle ; l'aide sous le champ la rappelle." },
      { title: 'Ajouter', detail: 'Cliquez sur « Ajouter ».' }
    ],
    consequences: [
      'Une résolution ne peut plus être ajoutée ni supprimée sur une assemblée clôturée ou annulée.',
      "Elle ne peut être supprimée que tant que son vote n'est pas ouvert et qu'aucun vote n'est saisi.",
      'Aucune règle de quorum ne bloque le résultat : le quorum est indicatif.'
    ],
    faq: [
      {
        q: 'Quelle règle choisir ?',
        a: "Celle qui s'applique à la décision selon le règlement de copropriété et la loi. En cas de doute, demandez conseil : l'application calcule, elle ne choisit pas pour vous."
      },
      {
        q: 'Une même résolution est-elle créée deux fois si je clique deux fois ?',
        a: 'Non : un double clic ou un réessai immédiat ne crée pas de doublon.'
      },
      {
        q: 'Peut-on changer la règle après coup ?',
        a: "La fiche ne le propose pas. Si aucun vote n'est ouvert, supprimez la résolution et recréez-la."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Ajouter ou supprimer une résolution demande « Modifier le module Syndic ».'
    },
    related: [{ label: 'Résultats des résolutions', helpId: 'syndic.assemblees.detail.resultats' }],
    keywords: ['résolution', 'majorité', 'article 24', 'article 25', 'article 26', 'unanimité', 'tantièmes']
  },
  {
    id: 'syndic.assemblees.detail.resultats',
    kind: 'table',
    title: 'Résultats des résolutions',
    summary:
      'Ce tableau donne, pour chaque résolution, sa règle, les voix « Pour », « Contre » et « Abstention » (en lots et en tantièmes) et son résultat.',
    purpose: 'Il permet de suivre le vote en temps réel. Les résultats sont définitifs à la clôture.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Résolution', description: 'Titre de la résolution.' },
        { key: 'rule', label: 'Règle', description: 'Règle de majorité appliquée.' },
        { key: 'for', label: 'Pour', description: 'Nombre de lots et tantièmes « Pour ».' },
        { key: 'against', label: 'Contre', description: 'Nombre de lots et tantièmes « Contre ».' },
        { key: 'abstain', label: 'Abstention', description: 'Nombre de lots et tantièmes en abstention.' },
        {
          key: 'reference',
          label: 'Total de référence',
          description:
            "Total auquel « Pour » est comparé : les tantièmes exprimés pour l'article 24, tous les tantièmes sinon."
        },
        { key: 'result', label: 'Résultat', description: 'Décision calculée (voir les statuts).' },
        {
          key: 'actions',
          label: 'Actions',
          description: "« Supprimer », seulement si aucun vote n'est ouvert ni saisi."
        }
      ],
      statuses: [
        { value: 'PENDING', label: 'En attente', description: 'Aucun vote enregistré.' },
        { value: 'APPROVED', label: 'Approuvée', description: 'La règle de majorité est atteinte.' },
        { value: 'REJECTED', label: 'Rejetée', description: "La règle de majorité n'est pas atteinte." }
      ],
      notes: [
        "« Vote en cours » remplace le résultat tant qu'un vote est ouvert et que l'assemblée n'est pas clôturée : la décision provisoire est masquée.",
        'Un lot absent ne vote pas : ses éventuels bulletins ne sont pas comptés.'
      ]
    },
    steps: [
      { title: 'Lire les voix', detail: 'Chaque colonne donne les lots et les tantièmes.' },
      { title: 'Filtrer', detail: 'Recherchez par titre ou filtrez par « Résultat ».' }
    ],
    consequences: [
      "Le filtre ne change que l'affichage : aucun décompte n'est recalculé.",
      'Le résultat est recalculé à chaque vote et figé à la clôture.'
    ],
    faq: [
      {
        q: 'Pourquoi le résultat est-il à « Vote en cours » ?',
        a: "Un vote est ouvert. La décision n'apparaît qu'à la clôture du vote ou de la séance."
      },
      {
        q: 'Pourquoi « Supprimer » a-t-il disparu ?',
        a: 'Un vote est ouvert, clos ou saisi : la résolution ne peut plus être supprimée.'
      },
      {
        q: 'Les tantièmes comptent-ils plus que le nombre de lots ?',
        a: 'Oui : le résultat se calcule en tantièmes ; un lot de 400 tantièmes pèse quatre fois un lot de 100.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Consulter demande « Consulter le module Syndic ».' },
    related: [{ label: 'Ajouter une résolution', helpId: 'syndic.assemblees.detail.resolution' }],
    keywords: ['résultat', 'vote', 'tantièmes', 'approuvée', 'rejetée', 'majorité']
  },
  {
    id: 'syndic.assemblees.detail.quorum',
    kind: 'section',
    title: 'Quorum',
    summary:
      'Le quorum est la part des tantièmes présents ou représentés par rapport au total de la copropriété. Il est donné à titre indicatif.',
    purpose: "Il vous montre si l'assemblée est suffisamment représentée avant d'enregistrer les votes.",
    howToRead: {
      notes: [
        'Pourcentage = tantièmes représentés ÷ tantièmes totaux. La ligne en dessous donne ces deux chiffres.',
        "Sont comptés les lots émargés « Présent » ou « Représenté », et ceux qui ont voté sans émargement. Un lot émargé « Absent » n'est jamais compté.",
        'Dans la console en direct, « Présents », « Représentés » et « En ligne » comptent des lots, et « ont rejoint » compte les copropriétaires qui ont ouvert leur lien.'
      ]
    },
    consequences: ["Aucune règle de quorum ne bloque un vote ni un résultat : c'est vous qui jugez."],
    faq: [
      {
        q: 'Comment faire monter le quorum ?',
        a: 'Émargez les lots présents, enregistrez les pouvoirs ou saisissez les votes : un lot qui vote est compté présent.'
      },
      {
        q: "Pourquoi un lot n'est-il pas compté ?",
        a: "Il est émargé « Absent », ou il n'a ni émargement ni vote."
      },
      {
        q: 'Le quorum figure-t-il dans le compte rendu ?',
        a: 'Oui, il est repris dans le compte rendu Word.'
      }
    ],
    permissions: { feature: 'SYNDIC' },
    related: [{ label: 'Lots et émargement', helpId: 'syndic.assemblees.detail.direct-presences' }],
    keywords: ['quorum', 'présence', 'tantièmes', 'représentés']
  },
  {
    id: 'syndic.assemblees.detail.vote',
    kind: 'section',
    title: 'Ordre du jour et votes (saisie)',
    summary:
      "Cette carte permet de saisir à la main le vote d'un lot sur chaque résolution. Choisissez le lot votant, puis « Pour », « Contre » ou « Abstention ».",
    purpose:
      "C'est la saisie classique, sans l'option en direct : le gestionnaire enregistre les votes exprimés en salle ou reçus par écrit.",
    steps: [
      {
        title: 'Choisir le lot votant',
        detail:
          "Le menu « Lot votant » nomme le ou les propriétaires du lot à la date de l'assemblée, et le mandataire s'il y a un pouvoir."
      },
      { title: 'Voter', detail: 'Cliquez sur « Pour », « Contre » ou « Abstention ».' },
      { title: 'Corriger', detail: "Revotez avec le même lot : le nouveau vote remplace l'ancien." }
    ],
    consequences: [
      "Le vote est enregistré avec l'origine « Saisi par le gestionnaire » et remplace un éventuel vote en ligne du même lot ; un propriétaire en ligne ne peut pas remplacer un vote saisi par le gestionnaire.",
      "Un lot qui vote est émargé « Présent » s'il ne l'était pas encore. Un lot émargé « Absent » ne peut pas voter : modifiez d'abord son émargement.",
      "Le résultat et le quorum sont recalculés aussitôt. Le vote est possible tant que l'assemblée n'est ni clôturée ni annulée."
    ],
    faq: [
      {
        q: 'Un copropriétaire a plusieurs lots : combien de votes ?',
        a: 'Un vote par lot : saisissez le vote de chaque lot dans le menu « Lot votant ».'
      },
      {
        q: 'Que signifie « représenté par » ?',
        a: 'Un pouvoir est enregistré pour ce votant. Le vote reste saisi lot par lot.'
      },
      {
        q: 'Pourquoi ne puis-je plus voter ?',
        a: "L'assemblée est clôturée ou annulée : les votes sont figés."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Saisir un vote demande « Modifier le module Syndic ».' },
    related: [
      { label: 'Résultats des résolutions', helpId: 'syndic.assemblees.detail.resultats' },
      { label: 'Pouvoirs', helpId: 'syndic.assemblees.detail.pouvoirs' }
    ],
    keywords: ['voter', 'saisir un vote', 'lot votant', 'pour', 'contre', 'abstention']
  },
  {
    id: 'syndic.assemblees.detail.pouvoirs',
    kind: 'table',
    title: 'Pouvoirs',
    summary:
      "Ce tableau liste les pouvoirs de l'assemblée : un copropriétaire (le mandant) donne mandat à une personne (le mandataire) pour le représenter.",
    purpose: "Un pouvoir permet à un copropriétaire absent d'être représenté et compté dans le quorum.",
    howToRead: {
      columns: [
        { key: 'grantor', label: 'Mandant', description: 'Le copropriétaire représenté.' },
        { key: 'lots', label: 'Lots', description: 'Les lots de ce copropriétaire.' },
        { key: 'representative', label: 'Mandataire', description: 'La personne qui le représente.' },
        { key: 'actions', label: 'Actions', description: '« Retirer » le pouvoir.' }
      ]
    },
    steps: [
      {
        title: 'Ajouter un pouvoir',
        detail:
          "« Ajouter un pouvoir » : choisissez le mandant (un copropriétaire de la copropriété) puis le mandataire (un autre contact de l'agence)."
      },
      { title: 'Enregistrer', detail: 'Le pouvoir apparaît dans le tableau.' },
      { title: 'Retirer', detail: '« Retirer », avec confirmation.' }
    ],
    consequences: [
      'Un seul pouvoir par mandant et par assemblée. Le mandataire ne peut pas être le mandant.',
      "Séance ouverte, les lots du mandant passent « Représenté » (sauf ceux déjà « Présent ») ; retirer le pouvoir les remet « Absent ». Le mandataire ne peut pas être propriétaire du lot qu'il représente.",
      "Plus de modification possible après la clôture ou l'annulation."
    ],
    faq: [
      {
        q: 'Pourquoi « Ajouter un pouvoir » est-il grisé ?',
        a: "Aucun lot n'a de copropriétaire enregistré."
      },
      {
        q: 'Le mandataire peut-il voter ?',
        a: "Avec l'option en direct, il peut voter en ligne pour le lot représenté, sauf si le propriétaire a déjà voté lui-même. Le gestionnaire peut aussi saisir le vote."
      },
      {
        q: 'Un mandataire peut-il lui-même donner pouvoir à un autre ?',
        a: "Non : un pouvoir n'est pas transmissible."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Ajouter ou retirer un pouvoir demande « Modifier le module Syndic ».' },
    related: [{ label: 'Lots et émargement', helpId: 'syndic.assemblees.detail.direct-presences' }],
    keywords: ['procuration', 'pouvoir', 'mandant', 'mandataire', 'représenté']
  },
  {
    id: 'syndic.assemblees.detail.convocation',
    kind: 'section',
    title: 'Convocation des copropriétaires',
    summary:
      "La convocation prévient les copropriétaires de la date, de l'heure et du lieu de l'assemblée. Elle s'envoie depuis la fiche, ou se télécharge en Word pour un lot.",
    purpose:
      "Il y a deux gestes distincts : l'envoi par message à tous les copropriétaires, et le document Word d'un lot, à imprimer ou à envoyer vous-même.",
    steps: [
      {
        title: 'Saisir l’ordre du jour',
        detail: "Une fenêtre de confirmation rappelle le nombre de points saisis, ou signale qu'il n'y en a aucun."
      },
      {
        title: 'Envoyer',
        detail:
          '« Envoyer les convocations » (assemblée « Planifiée »). Après un premier envoi, le bouton devient « Renvoyer la convocation ».'
      },
      {
        title: 'Lire le résultat',
        detail: "Un message donne le nombre d'e-mails envoyés, échoués et sans adresse e-mail."
      },
      { title: 'Convocation Word', detail: 'Choisissez un lot dans « Choisir un lot », puis « Convocation (Word) ».' }
    ],
    consequences: [
      'Destinataires : les propriétaires actuels des lots, indivisaires compris, une seule fois chacun. Les lots à 0 tantième ne sont pas convoqués.',
      'Canaux : e-mail, si la notification « Convocation Assemblée Générale » est activée dans Communication > Notifications e-mail et si le copropriétaire a une adresse ; message WhatsApp si cette notification est activée et si un numéro est connu. Sinon rien ne part sur ce canal.',
      "Le message indique la copropriété, la date, l'heure et le lieu. Le lien personnel de suivi et de vote en ligne n'y figure qu'avec l'option « AG en direct et visio ». Le message par défaut ne contient pas l'ordre du jour.",
      "Un renvoi ne vise que les copropriétaires en échec ou jamais servis. Il est limité à un toutes les 10 minutes par assemblée et n'est possible que pour une assemblée « Planifiée ».",
      "La convocation Word reprend le copropriétaire du lot, l'ordre du jour (à défaut, les résolutions), la date, le lieu et le quorum ; elle n'envoie rien.",
      "L'application ne vérifie pas le délai entre l'envoi et la date de l'assemblée."
    ],
    faq: [
      {
        q: "Pourquoi aucun e-mail n'est-il parti ?",
        a: 'Le message affiché le dit : notification désactivée, aucun copropriétaire à convoquer, ou copropriétaires sans adresse e-mail.'
      },
      {
        q: 'Si je renvoie, tous les copropriétaires reçoivent-ils un second message ?',
        a: "Non : seuls ceux qui n'ont pas été servis (échec ou jamais envoyé)."
      },
      {
        q: "Le bouton « Renvoyer » dit d'attendre. Pourquoi ?",
        a: "Un renvoi n'est possible que toutes les 10 minutes pour une même assemblée."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Envoyer ou renvoyer demande « Modifier le module Syndic » ; la convocation Word demande « Consulter le module Syndic ».'
    },
    related: [
      { label: 'Ordre du jour', helpId: 'syndic.assemblees.detail.ordre-du-jour' },
      { label: 'En direct', helpId: 'syndic.assemblees.detail.direct' }
    ],
    keywords: ['convoquer', 'convocation', 'e-mail', 'WhatsApp', 'renvoyer', 'Word', 'copropriétaires']
  },
  {
    id: 'syndic.assemblees.detail.direct',
    kind: 'section',
    title: 'En direct',
    summary:
      'La carte « En direct » est la console de séance : quorum, émargement, ouverture des votes, liens personnels, visioconférence, discussion et enregistrements. Elle se rafraîchit toutes les 5 secondes.',
    purpose:
      'Elle sert à tenir la séance, en salle comme à distance, et à faire voter les copropriétaires en ligne avec leur lien personnel. Elle est masquée pour une assemblée annulée.',
    steps: [
      { title: 'Préparer', detail: "Avant l'ouverture, vérifiez les participants et leurs liens personnels." },
      { title: 'Ouvrir la séance', detail: 'Le quorum et les votes se mettent à jour ici.' },
      { title: 'Émarger', detail: 'Carte « Lots et émargement ».' },
      { title: 'Faire voter', detail: 'Carte « Résolutions en direct » : « Ouvrir le vote », puis « Clore le vote ».' },
      { title: 'Projeter', detail: "Le bouton « Projeter » ouvre l'écran de projection dans un nouvel onglet." }
    ],
    consequences: [
      'Option payante : « AG en direct et visio », 20 000 FCFA HT par mois, réservée au pack Syndic et incluse dans le pack Opérateur intégré. Elle ajoute la console, les liens personnels, le vote en ligne, la projection et la visioconférence.',
      "Sans l'option, tant que l'abonnement est appliqué strictement, la carte affiche « AG en direct et visio — option non souscrite » avec le bouton « Demander l'option ». Sans application stricte, rien n'est bloqué.",
      "L'assemblée classique (convocation, résolutions, votes saisis, pouvoirs, compte rendu) reste utilisable sans l'option."
    ],
    faq: [
      {
        q: 'La console ne se charge pas : que faire ?',
        a: 'Cliquez sur « Réessayer » dans le bandeau : la console garde les dernières données affichées.'
      },
      {
        q: "Pourquoi le rafraîchissement s'arrête-t-il ?",
        a: "Il se met en pause quand l'onglet est masqué ou qu'un menu d'émargement est ouvert, et s'arrête à la clôture."
      },
      {
        q: "Où demander l'option ?",
        a: "Avec le bouton « Demander l'option », qui mène à la page Abonnement."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Option payante « AG en direct et visio » du pack Syndic (extension à 20 000 FCFA HT par mois). Consulter la séance demande « Consulter le module Syndic » ; émarger, ouvrir ou clore un vote, délivrer des liens, gérer la visio et la discussion demandent « Modifier le module Syndic ».'
    },
    related: [
      { label: 'Lots et émargement', helpId: 'syndic.assemblees.detail.direct-presences' },
      { label: 'Résolutions en direct', helpId: 'syndic.assemblees.detail.direct-votes' },
      { label: 'Participants et liens personnels', helpId: 'syndic.assemblees.detail.direct-participants' },
      { label: 'Visioconférence', helpId: 'syndic.assemblees.detail.direct-visio' }
    ],
    keywords: ['direct', 'séance', 'console', 'vote en ligne', 'option', 'visio', 'EXT_AG_EN_DIRECT', 'projeter']
  },
  {
    id: 'syndic.assemblees.detail.direct-presences',
    kind: 'table',
    title: 'Lots et émargement',
    summary:
      "Ce tableau liste les lots de la séance et permet de les faire émarger : présent, représenté ou absent. L'émargement alimente le quorum.",
    purpose: 'Il fixe qui est présent ou représenté, donc quel lot compte dans le quorum et peut voter.',
    howToRead: {
      columns: [
        { key: 'lot', label: 'Lot', description: 'Numéro du lot (tri possible).' },
        { key: 'shares', label: 'Tantièmes', description: 'Poids du lot.' },
        { key: 'voters', label: 'Votant(s)', description: "Propriétaire(s) du lot à la date de l'assemblée." },
        {
          key: 'online',
          label: 'En ligne',
          description: 'En ligne si le copropriétaire est connecté par son lien personnel.'
        },
        {
          key: 'status',
          label: 'Statut',
          description: "Présence du lot ; le nom du mandataire s'affiche s'il est représenté."
        },
        { key: 'attendance', label: 'Émargement', description: 'Menu pour changer la présence du lot.' }
      ],
      statuses: [
        { value: 'PRESENT', label: 'Présent', description: 'Le lot compte dans le quorum et peut voter.' },
        {
          value: 'REPRESENTED',
          label: 'Représenté',
          description: 'Un mandataire le représente ; il compte dans le quorum.'
        },
        { value: 'ABSENT', label: 'Absent', description: 'Hors quorum ; ne peut pas voter.' }
      ]
    },
    steps: [
      {
        title: 'Un lot',
        detail:
          'Dans « Émargement » : « Présent en salle », « Absent », « Représenté » (si un pouvoir existe) ou « Représenté par… ».'
      },
      { title: 'Plusieurs lots', detail: 'Cochez des lots, puis « Marquer présents en salle » ou « Marquer absents ».' }
    ],
    consequences: [
      'Un lot « Absent » sort du quorum et ses bulletins ne sont plus comptés.',
      "« Présent en ligne » n'est pas choisi à la main : le lot passe en ligne quand son propriétaire rejoint l'assemblée par son lien.",
      "Le propriétaire d'un lot ne peut pas en être le mandataire.",
      'Après la clôture, le tableau est en lecture seule.'
    ],
    faq: [
      {
        q: 'Pourquoi « Représenté » est-il grisé ?',
        a: "Aucun pouvoir n'est enregistré pour ce lot. Utilisez « Représenté par… » ou ajoutez un pouvoir."
      },
      {
        q: 'Un tableau qui bouge pendant mon choix ?',
        a: 'Le rafraîchissement se met en pause quand un menu est ouvert.'
      },
      {
        q: 'Que devient un lot absent qui avait voté ?',
        a: "Son vote n'est plus compté dans les résultats."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Option « AG en direct et visio ». Émarger demande « Modifier le module Syndic ».'
    },
    related: [{ label: 'Quorum', helpId: 'syndic.assemblees.detail.quorum' }],
    keywords: ['émargement', 'présence', 'feuille de présence', 'absent', 'représenté', 'lots']
  },
  {
    id: 'syndic.assemblees.detail.direct-votes',
    kind: 'section',
    title: 'Résolutions en direct',
    summary:
      'Cette carte pilote le vote de chaque résolution pendant la séance : ouvrir le vote, suivre la participation, le clore. Les copropriétaires connectés votent avec leur lien personnel.',
    purpose: 'Elle gère le vote en ligne ; la saisie à la main reste possible avec « Saisir un vote ».',
    howToRead: {
      statuses: [
        { value: 'PENDING', label: 'Vote pas encore ouvert', description: "Le vote n'a pas été ouvert." },
        { value: 'OPEN', label: 'Vote ouvert', description: 'Les copropriétaires présents peuvent voter en ligne.' },
        { value: 'CLOSED', label: 'Vote clos', description: 'Le vote est terminé ; il peut être rouvert.' }
      ],
      notes: [
        '« Participation » donne le nombre de lots ayant voté sur le total.',
        '« Origine des votes » distingue les votes en ligne, ceux des mandataires et ceux saisis par le gestionnaire.'
      ]
    },
    steps: [
      { title: 'Ouvrir', detail: '« Ouvrir le vote » (la séance doit être ouverte).' },
      { title: 'Suivre', detail: 'La participation et les tantièmes se mettent à jour.' },
      { title: 'Clore', detail: '« Clore le vote », avec confirmation.' },
      { title: 'Rouvrir', detail: '« Rouvrir le vote » sur un vote clos.' },
      { title: 'Saisir à la main', detail: '« Saisir un vote » amène à la carte « Ordre du jour et votes ».' }
    ],
    consequences: [
      'Clore le vote affiche le résultat aux copropriétaires connectés.',
      "Vote en ligne : il faut avoir rejoint l'assemblée, la séance doit être en cours et le vote ouvert. Un vote saisi par le gestionnaire ne peut pas être changé en ligne ; un mandataire ne remplace pas le vote donné par le propriétaire lui-même.",
      'Clôturer la séance clôt les votes encore ouverts.'
    ],
    faq: [
      {
        q: 'Pourquoi « Ouvrir le vote » est-il absent ?',
        a: "La séance n'est pas « En cours », ou le vote est déjà ouvert."
      },
      {
        q: 'Où est la règle de majorité ?',
        a: 'Sous le titre de chaque résolution, avec son explication.'
      },
      {
        q: 'Le vote passe-t-il par la visio ?',
        a: 'Non : le vote se fait par le lien personnel ou par saisie du gestionnaire.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Option « AG en direct et visio ». Ouvrir ou clore un vote demande « Modifier le module Syndic ».'
    },
    related: [
      { label: 'Ordre du jour et votes (saisie)', helpId: 'syndic.assemblees.detail.vote' },
      { label: 'Résultats des résolutions', helpId: 'syndic.assemblees.detail.resultats' }
    ],
    keywords: ['vote en ligne', 'ouvrir le vote', 'clore le vote', 'participation', 'résolutions en direct']
  },
  {
    id: 'syndic.assemblees.detail.direct-participants',
    kind: 'table',
    title: 'Participants et liens personnels',
    summary:
      "Ce tableau liste les copropriétaires convoqués et leur lien personnel pour rejoindre l'assemblée en ligne. Vous pouvez copier ou révoquer ces liens.",
    purpose: "Chaque copropriétaire accède à l'assemblée, à la visio et au vote par un lien qui lui est propre.",
    howToRead: {
      columns: [
        { key: 'name', label: 'Participant', description: 'Nom, et e-mail s’il existe.' },
        { key: 'lots', label: 'Lots', description: 'Numéros de ses lots.' },
        { key: 'joined', label: 'A rejoint', description: 'Date de sa première arrivée, ou « Pas encore ».' },
        {
          key: 'online',
          label: 'En ligne',
          description: "En ligne ou hors ligne ; « En visio » s'il est dans la salle."
        },
        { key: 'links', label: 'Liens actifs', description: 'Nombre de liens encore valables.' },
        { key: 'actions', label: 'Actions', description: '« Copier le lien » et « Révoquer les liens ».' }
      ]
    },
    steps: [
      {
        title: 'Copier le lien',
        detail:
          "« Copier le lien » génère un lien et le copie ; s'il ne peut pas être copié, une fenêtre l'affiche pour que vous le copiiez à la main."
      },
      { title: 'Le transmettre', detail: 'Envoyez-le vous-même au copropriétaire.' },
      { title: 'Révoquer', detail: '« Révoquer les liens », avec confirmation.' }
    ],
    consequences: [
      'Révoquer rend inutilisables les liens déjà envoyés à ce participant.',
      "Le lien reste valable jusqu'à 7 jours après la date de l'assemblée.",
      'Après la clôture, les actions sont désactivées.'
    ],
    faq: [
      {
        q: 'Les copropriétaires reçoivent-ils leur lien automatiquement ?',
        a: "Oui, dans la convocation, si l'option est souscrite. Vous pouvez en copier un autre ici."
      },
      {
        q: 'Pourquoi « Révoquer les liens » est-il grisé ?',
        a: "Ce participant n'a aucun lien actif."
      },
      {
        q: 'Quelle est la différence entre « A rejoint » et « En ligne » ?',
        a: "« A rejoint » date de sa première arrivée ; « En ligne » dit s'il est connecté en ce moment."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Option « AG en direct et visio ». Copier ou révoquer demande « Modifier le module Syndic ».'
    },
    related: [{ label: 'Convocation des copropriétaires', helpId: 'syndic.assemblees.detail.convocation' }],
    keywords: ['lien personnel', 'participants', 'révoquer', 'copier le lien', 'en ligne']
  },
  {
    id: 'syndic.assemblees.detail.direct-visio',
    kind: 'section',
    title: 'Visioconférence',
    summary:
      'Deux outils coexistent : la « Visio intégrée » à ImmoTopia, avec ses commandes de modérateur, et un simple lien « Visioconférence » vers Zoom, Meet ou Teams.',
    purpose:
      "Elle permet aux copropriétaires à distance de suivre l'assemblée. La visio intégrée n'est affichée que si elle est disponible sur votre plateforme.",
    howToRead: {
      columns: [
        { key: 'name', label: 'Participant', description: 'Nom ; « Gestionnaire » pour les modérateurs.' },
        { key: 'state', label: 'État', description: '« Main levée » ou « écriture coupée ».' },
        { key: 'media', label: 'Micro et caméra', description: 'État du micro et de la caméra.' },
        { key: 'joinedAt', label: 'Entré à', description: "Heure d'entrée dans la salle." },
        { key: 'actions', label: 'Actions', description: 'Commandes de modération.' }
      ]
    },
    steps: [
      { title: 'Ouvrir la visio', detail: '« Ouvrir la visio » affiche la salle ; « Fermer la visio » la masque.' },
      {
        title: 'Modérer',
        detail:
          "« Couper le micro », « Couper la caméra », « Interdire micro et caméra », « Couper l'écriture », « Exclure »."
      },
      {
        title: 'Tous les micros',
        detail:
          "L'interrupteur « Interdire les micros à tous » coupe tout le monde ; les copropriétaires gardent la main levée."
      },
      {
        title: 'Lien externe',
        detail: 'Carte « Visioconférence » : collez un lien commençant par https://, puis « Enregistrer ».'
      }
    ],
    consequences: [
      '« Exclure » retire la personne de la salle ; elle pourra revenir, sans la parole, sauf si vous cochez « Révoquer aussi ses liens personnels ».',
      'Le vote ne passe jamais par la visio.',
      "Clôturer ou annuler l'assemblée ferme la salle."
    ],
    faq: [
      {
        q: "Pourquoi n'y a-t-il pas de « Visio intégrée » ?",
        a: "Elle n'est pas disponible sur votre plateforme. Le lien externe reste utilisable."
      },
      {
        q: 'Mon lien est refusé.',
        a: 'Il doit commencer par https://.'
      },
      {
        q: 'Peut-on enregistrer la séance ?',
        a: "Oui si l'enregistrement est disponible : « Enregistrer la séance », une fois la séance ouverte. Voir la carte « Enregistrements »."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Option « AG en direct et visio ». Modérer la visio demande « Modifier le module Syndic ».'
    },
    related: [
      { label: 'Discussion', helpId: 'syndic.assemblees.detail.direct-discussion' },
      { label: 'Enregistrements', helpId: 'syndic.assemblees.detail.direct-enregistrements' }
    ],
    keywords: ['visio', 'visioconférence', 'micro', 'caméra', 'main levée', 'Zoom', 'Meet', 'Teams']
  },
  {
    id: 'syndic.assemblees.detail.direct-discussion',
    kind: 'section',
    title: 'Discussion',
    summary:
      "La discussion est un échange écrit modéré pendant la visio. Vous l'ouvrez ou la fermez aux copropriétaires et vous pouvez masquer des messages.",
    purpose: "Elle garde un fil écrit pendant la séance. Cette carte n'apparaît que si la discussion est disponible.",
    steps: [
      { title: 'Ouvrir ou fermer', detail: "L'interrupteur « Discussion ouverte aux copropriétaires »." },
      { title: 'Écrire', detail: 'En séance, vous pouvez écrire même discussion fermée.' },
      { title: 'Masquer', detail: '« Masquer » cache un message aux copropriétaires ; « Rétablir » le remet.' }
    ],
    consequences: [
      'Un message masqué reste lisible, grisé, pour vous.',
      'La discussion est en lecture seule après la séance.'
    ],
    faq: [
      { q: 'Un message masqué est-il supprimé ?', a: 'Non, il est seulement caché des copropriétaires.' },
      {
        q: 'Qui peut écrire ?',
        a: "Les copropriétaires quand la discussion est ouverte et que leur écriture n'est pas coupée ; vous toujours, en séance."
      },
      { q: "Comment couper l'écriture de quelqu'un ?", a: "Dans le tableau de la visio, avec « Couper l'écriture »." }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Option « AG en direct et visio ». Modérer demande « Modifier le module Syndic ».'
    },
    related: [{ label: 'Visioconférence', helpId: 'syndic.assemblees.detail.direct-visio' }],
    keywords: ['discussion', 'messages', 'chat', 'masquer', 'modération']
  },
  {
    id: 'syndic.assemblees.detail.direct-enregistrements',
    kind: 'table',
    title: 'Enregistrements',
    summary:
      'Ce tableau liste les enregistrements de la séance : leur statut, leur début, leur durée et leur taille. Vous pouvez les lire, les télécharger ou les supprimer.',
    purpose:
      "Il conserve une trace de la séance. La carte n'apparaît que si l'enregistrement est disponible ou s'il en existe déjà.",
    howToRead: {
      columns: [
        {
          key: 'status',
          label: 'Statut',
          description: "État de l'enregistrement ; la cause s'affiche en cas d'échec."
        },
        { key: 'startedAt', label: 'Début', description: 'Date et heure de début.' },
        { key: 'duration', label: 'Durée', description: 'Durée du fichier.' },
        { key: 'size', label: 'Taille', description: 'Taille du fichier.' },
        { key: 'actions', label: 'Actions', description: '« Lire », « Télécharger », « Réessayer », « Supprimer ».' }
      ],
      statuses: [
        { value: 'RECORDING', label: 'En cours', description: "L'enregistrement tourne." },
        { value: 'PROCESSING', label: 'En traitement', description: 'Le fichier est en préparation.' },
        { value: 'AVAILABLE', label: 'Disponible', description: 'Le fichier peut être lu ou téléchargé.' },
        { value: 'FAILED', label: 'Échec', description: 'Le traitement a échoué ; « Réessayer » le relance.' },
        { value: 'DELETED', label: 'Supprimé', description: 'Le fichier a été effacé.' }
      ]
    },
    steps: [
      { title: 'Démarrer', detail: '« Enregistrer la séance » dans la carte « Visio intégrée », séance ouverte.' },
      { title: 'Arrêter', detail: "« Arrêter l'enregistrement »." },
      { title: 'Consulter', detail: '« Lire » ou « Télécharger » quand il est « Disponible ».' }
    ],
    consequences: [
      'La suppression efface définitivement le fichier ; elle est irréversible.',
      "L'avis d'enregistrement figure dans la convocation lorsque l'enregistrement est activé.",
      'Si un traitement dure trop, la liste cesse de se rafraîchir : rechargez la page.'
    ],
    faq: [
      {
        q: 'Pourquoi « Enregistrer la séance » est-il grisé ?',
        a: "La séance n'est pas encore ouverte, ou elle est clôturée."
      },
      { q: "Que faire d'un enregistrement en échec ?", a: 'Cliquez sur « Réessayer » ; sinon supprimez-le.' },
      {
        q: "L'enregistrement peut-il être modifié ?",
        a: 'Non : vous pouvez seulement le lire, le télécharger ou le supprimer.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Option « AG en direct et visio ». Lire ou télécharger demande « Consulter le module Syndic » ; démarrer, arrêter, réessayer ou supprimer demande « Modifier le module Syndic ».'
    },
    related: [{ label: 'Visioconférence', helpId: 'syndic.assemblees.detail.direct-visio' }],
    keywords: ['enregistrement', 'vidéo', 'séance', 'télécharger', 'MP4']
  },

  // ------------------------------------------------------------------ Documents
  {
    id: 'syndic.documents.liste',
    kind: 'page',
    title: 'Coffre documentaire',
    summary:
      'Le coffre réunit les documents de la copropriété : règlement, procès-verbaux, diagnostics, assurances, budgets. Vous décidez de ceux que les copropriétaires voient sur leur portail.',
    purpose:
      "Il centralise les pièces utiles à la gestion et surveille les dates d'expiration, par exemple d'une assurance ou d'un diagnostic.",
    steps: [
      {
        title: 'Ajouter',
        detail: "Bouton « Ajouter un document » : titre, type, fichier, visibilité, date d'expiration."
      },
      { title: 'Consulter', detail: '« Télécharger » récupère le fichier ; « Ouvrir » suit un lien externe.' },
      {
        title: 'Gérer la visibilité',
        detail: '« Rendre visible » ou « Retirer du portail » dans la colonne « Portail ».'
      }
    ],
    consequences: [
      'Un document visible est consultable et téléchargeable par les copropriétaires sur leur portail.',
      "Une date d'expiration dépassée s'affiche en rouge ; rien n'est envoyé automatiquement."
    ],
    faq: [
      { q: 'Quels fichiers puis-je déposer ?', a: "PDF, Word, JPEG, PNG ou TIFF, jusqu'à 10 Mo." },
      {
        q: 'Qui voit mes documents ?',
        a: "Les équipes de l'agence. Les copropriétaires voient seulement ceux marqués « Visible au portail »."
      },
      { q: 'Puis-je supprimer un document ?', a: 'Pas depuis cet écran : vous pouvez seulement le retirer du portail.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété'],
      note: 'Consulter et télécharger demandent « Consulter le module Syndic » ; ajouter un document ou changer sa visibilité demande « Modifier le module Syndic ».'
    },
    related: [{ label: 'Documents de la copropriété', helpId: 'syndic.documents.tableau' }],
    keywords: ['documents', 'coffre', 'règlement', 'procès-verbal', 'assurance', 'diagnostic', 'portail']
  },
  {
    id: 'syndic.documents.tableau',
    kind: 'table',
    title: 'Documents de la copropriété',
    summary:
      'Ce tableau liste les documents avec leur type, leur expiration et leur visibilité pour les copropriétaires. Vous pouvez les télécharger et changer leur visibilité.',
    purpose: "Il permet de retrouver un document et de décider s'il est partagé avec les copropriétaires.",
    howToRead: {
      columns: [
        { key: 'title', label: 'Titre', description: 'Nom du document.' },
        {
          key: 'type',
          label: 'Type',
          description: "Règlement de copropriété, Procès-verbal d'AG, Diagnostic, Assurance, Budget ou Autre."
        },
        {
          key: 'expiresAt',
          label: 'Expiration',
          description: "Date d'expiration, en rouge si elle est passée ; « Sans expiration » sinon."
        },
        {
          key: 'visibleToCoOwners',
          label: 'Visible au portail',
          description: '« Oui » si les copropriétaires le voient sur leur portail.'
        },
        {
          key: 'fileUrl',
          label: 'Document',
          description: '« Télécharger » (fichier déposé) ou « Ouvrir » (lien externe).'
        },
        {
          key: 'visibility',
          label: 'Portail',
          description: '« Rendre visible » ou « Retirer du portail » ; visible avec le droit de modification.'
        }
      ]
    },
    steps: [
      {
        title: 'Chercher',
        detail:
          "Recherchez par titre, nom de fichier ou type ; filtrez par type, visibilité, date d'ajout ou expiration."
      },
      { title: 'Télécharger', detail: '« Télécharger » ou « Ouvrir ».' },
      { title: 'Changer la visibilité', detail: 'Le bouton de la colonne « Portail », puis confirmez.' }
    ],
    consequences: [
      'Rendre visible donne accès au document à tous les copropriétaires de la copropriété ; retirer du portail le leur cache.',
      "Le fichier ne se télécharge que par l'application, après contrôle de l'agence."
    ],
    faq: [
      {
        q: 'Pourquoi la colonne « Portail » est-elle absente ?',
        a: "Vous n'avez pas le droit de modifier le module Syndic."
      },
      {
        q: 'Un document est-il visible dès son ajout ?',
        a: "Par défaut seulement le règlement et le procès-verbal d'AG ; les autres types ne le sont pas, sauf si vous cochez la case."
      },
      { q: 'Peut-on exporter la liste ?', a: "Oui, avec l'export du tableau." }
    ],
    permissions: { feature: 'SYNDIC', note: 'Changer la visibilité demande « Modifier le module Syndic ».' },
    related: [{ label: 'Ajouter un document', helpId: 'syndic.documents.ajout' }],
    keywords: ['documents', 'visible', 'portail', 'expiration', 'télécharger']
  },
  {
    id: 'syndic.documents.ajout',
    kind: 'section',
    title: 'Ajouter un document',
    summary:
      "Cette fenêtre dépose un document dans le coffre : titre, type, fichier, visibilité pour les copropriétaires et date d'expiration.",
    purpose: 'Elle range une pièce de la copropriété et décide si les copropriétaires peuvent la consulter.',
    steps: [
      {
        title: 'Titre et type',
        detail:
          "Obligatoires. Types : « Règlement de copropriété », « Procès-verbal d'AG », « Diagnostic », « Assurance », « Budget », « Autre »."
      },
      {
        title: 'Visibilité',
        detail:
          "La case « Visible des copropriétaires » est cochée d'office pour le règlement et le procès-verbal d'AG ; vous pouvez la changer."
      },
      { title: 'Fichier', detail: '« Choisir un fichier » : un seul, PDF, Word, JPEG, PNG ou TIFF, 10 Mo au plus.' },
      { title: "Date d'expiration", detail: 'Facultative.' },
      { title: 'Valider', detail: 'Cliquez sur « Ajouter ».' }
    ],
    consequences: [
      'Un document visible est consultable et téléchargeable par les copropriétaires sur leur portail.',
      'Le fichier est vérifié : son contenu doit correspondre à son type.'
    ],
    faq: [
      {
        q: 'Pourquoi le fichier est-il refusé ?',
        a: "Format non accepté, fichier trop gros ou contenu qui ne correspond pas à l'extension."
      },
      { q: 'Le fichier est obligatoire ?', a: "Oui : « Veuillez selectionner un fichier » s'affiche sinon." },
      {
        q: "Puis-je ajouter le compte rendu d'AG ?",
        a: "Oui : choisissez le type « Procès-verbal d'AG » ; il sera visible des copropriétaires par défaut."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Ajouter un document demande « Modifier le module Syndic ».' },
    related: [{ label: 'Statut, clôture et compte rendu', helpId: 'syndic.assemblees.detail.statuts' }],
    keywords: ['ajouter un document', 'déposer', 'procès-verbal', 'règlement', 'fichier']
  }
];

export default entries;
