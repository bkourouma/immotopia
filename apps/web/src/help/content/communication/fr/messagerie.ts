import type { HelpEntry } from '../../../types';

/** Zone « messagerie » du module « communication » (fr). */
const entries: HelpEntry[] = [
  {
    id: 'communication.messagerie.notifications',
    kind: 'page',
    title: 'Centre de notifications',
    summary:
      'Retrouvez ici toutes les notifications qui vous sont adressées, des plus récentes aux plus anciennes. Vous pouvez les rechercher, ne garder que les non lues et les marquer comme lues.',
    purpose:
      "Une notification vous prévient d'un événement qui vous concerne, par exemple l'arrivée d'un nouveau message privé. Cette page est personnelle : chacun ne voit que les siennes, dans l'agence ou le portail où il est connecté (collaborateur, locataire, propriétaire ou copropriétaire).\n\nLes e-mails, messages WhatsApp ou SMS que l'application vous envoie sont aussi listés ici, avec leur canal, lorsque l'envoi est enregistré à votre nom.",
    steps: [
      { title: 'Rechercher', detail: 'Tapez un mot du titre ou du message dans « Rechercher ».' },
      { title: 'Filtrer', detail: 'Activez « Non lues seulement » ou choisissez une « Période ».' },
      {
        title: 'Repérer le nouveau',
        detail: 'Une notification non lue a une pastille bleue et son titre en gras.'
      },
      {
        title: 'Ouvrir',
        detail:
          "Cliquez sur le titre quand il est cliquable : la notification est marquée comme lue et l'écran concerné s'ouvre."
      },
      { title: 'Marquer comme lue', detail: 'Cliquez sur « Marquer comme lue », sans ouvrir la notification.' },
      { title: 'Tout lire d’un coup', detail: 'Cliquez sur « Tout marquer comme lu ».' }
    ],
    consequences: [
      '« Tout marquer comme lu » concerne toutes vos notifications non lues, pas seulement celles affichées ou filtrées. Aucun bouton ne permet de remettre une notification en « non lue ».',
      'Marquer une notification comme lue ne la supprime pas : elle reste dans la liste. Cette page ne propose pas de suppression.',
      "Pour un message privé, la notification ne recopie jamais le texte : elle indique seulement que vous avez reçu un message, avec le nom de l'expéditeur en titre."
    ],
    faq: [
      {
        q: 'Pourquoi une étiquette rouge « Échec » apparaît-elle ?',
        a: "Un envoi sur ce canal (e-mail, WhatsApp ou SMS) n'est pas parti, et « Un envoi a échoué » s'affiche. Le détail est réservé à l'administrateur de l'agence, dans le journal des notifications."
      },
      {
        q: "Pourquoi le titre d'une notification n'est-il pas cliquable ?",
        a: "Certaines notifications n'ont pas d'écran associé : elles se lisent uniquement ici."
      },
      {
        q: 'Qui d’autre voit mes notifications ?',
        a: "Les autres utilisateurs ne voient pas votre liste. Un administrateur qui a le droit « Voir le journal des notifications » voit les envois faits par l'agence et leurs destinataires, mais jamais le contenu des messages privés."
      },
      {
        q: 'À quoi sert la cloche en haut de l’écran ?',
        a: 'Elle affiche le nombre de notifications non lues et ouvre les plus récentes sans quitter votre écran. « Tout voir » ramène ici.'
      }
    ],
    permissions: {
      note: 'Aucun droit particulier : chaque personne connectée voit ses propres notifications. La page sert aussi aux locataires, propriétaires et copropriétaires dans leur portail.'
    },
    related: [
      { label: 'Lire une notification', helpId: 'communication.messagerie.notifications.liste' },
      { label: 'La cloche de notifications', helpId: 'communication.messagerie.cloche' },
      { label: 'Messagerie interne', helpId: 'communication.messagerie.messages' },
      { label: 'Journal des notifications de l’agence', helpId: 'communication.messagerie.journal' }
    ],
    keywords: [
      'notification',
      'notifications',
      'alerte',
      'cloche',
      'non lues',
      'marquer comme lu',
      'avis',
      'message reçu'
    ]
  },
  {
    id: 'communication.messagerie.notifications.liste',
    kind: 'section',
    title: 'Lire une notification',
    summary:
      'Chaque notification affiche son titre, son message, sa date et, pour chaque canal utilisé, une étiquette « canal · statut ». Le statut dit si le message est bien parti.',
    howToRead: {
      statuses: [
        {
          value: 'PENDING',
          label: 'En attente',
          description: "L'envoi est en cours ou n'a pas encore été tenté."
        },
        { value: 'SENT', label: 'Envoyée', description: 'Le message est parti.' },
        {
          value: 'DELIVERED',
          label: 'Remise',
          description:
            "Le canal a confirmé l'arrivée du message. Ce statut est rare : vous verrez le plus souvent « Envoyée »."
        },
        {
          value: 'FAILED',
          label: 'Échec',
          description: "L'envoi n'a pas abouti. L'alerte « Un envoi a échoué » s'affiche sous la notification."
        },
        {
          value: 'SKIPPED',
          label: 'Non envoyée',
          description:
            "L'envoi a été volontairement ignoré, par exemple parce que le canal est désactivé, qu'il manque une adresse ou que le destinataire n'a pas donné son accord."
        }
      ],
      notes: [
        "Les canaux possibles sont « Dans l'application », « E-mail », « WhatsApp » et « SMS ». Une notification qui porte seulement « Dans l'application » est un simple avis visible ici et dans la cloche : rien n'est envoyé par e-mail ni par SMS.",
        'Lue ou non lue ne fait pas partie des statuts d’envoi : c’est la pastille bleue et le titre en gras qui l’indiquent.',
        'Un seul canal en échec suffit pour afficher l’alerte, même si un autre canal est bien parti.'
      ]
    },
    consequences: [
      "Vous ne voyez qu'un motif général d'échec. Le motif précis est consulté par l'administrateur de l'agence dans le journal des notifications."
    ],
    faq: [
      {
        q: 'Une notification « Envoyée » est-elle forcément lue ?',
        a: "Non. « Envoyée » dit seulement que le message est parti. Seule la pastille bleue indique que vous ne l'avez pas encore marquée comme lue."
      },
      {
        q: 'Les notifications sont-elles classées ?',
        a: 'Oui, de la plus récente à la plus ancienne. Utilisez la recherche et la période pour remonter plus loin.'
      },
      {
        q: 'Je ne vois pas de pagination.',
        a: 'Elle apparaît seulement quand il y a plus de notifications que ce qu’une page peut afficher.'
      }
    ],
    related: [{ label: 'Centre de notifications', helpId: 'communication.messagerie.notifications' }],
    keywords: ['statut', 'envoyée', 'échec', 'canal', 'pastille', 'non lue']
  },
  {
    id: 'communication.messagerie.cloche',
    kind: 'section',
    title: 'La cloche de notifications',
    summary:
      'La cloche, en haut de l’écran, affiche le nombre de notifications non lues. Un clic ouvre les plus récentes dans un volet, sans quitter votre écran.',
    purpose:
      "La cloche est présente sur tous les écrans pour les collaborateurs de l'agence et pour les clients des portails. À côté, l'icône « Messagerie » affiche le nombre de conversations qui contiennent des messages non lus.",
    steps: [
      {
        title: 'Voir le compteur',
        detail: 'Le nombre est mis à jour toutes les 30 secondes tant que la page est visible.'
      },
      { title: 'Ouvrir le volet', detail: 'Cliquez sur la cloche : les 20 dernières notifications s’affichent.' },
      { title: 'Trier', detail: 'Activez « Non lues seulement » pour masquer celles déjà lues.' },
      {
        title: 'Agir',
        detail:
          'Cliquez sur un titre pour ouvrir l’écran concerné (la notification est alors marquée comme lue), ou sur « Marquer comme lue ».'
      },
      { title: 'Tout voir', detail: 'Le bouton « Tout voir » ouvre le centre de notifications complet.' }
    ],
    consequences: [
      '« Tout marquer comme lu » remet le compteur à zéro. Le bouton est grisé quand il n’y a rien de non lu.',
      'Ouvrir une conversation dans la messagerie marque aussi comme lue la notification de ce message : le compteur de la cloche baisse en même temps.'
    ],
    faq: [
      {
        q: 'Je ne vois pas la cloche.',
        a: "Elle n'apparaît pas pour un compte qui n'est rattaché ni à une agence ni à un portail client."
      },
      {
        q: 'Le chiffre ne bouge pas.',
        a: 'Il se met à jour toutes les 30 secondes, et seulement quand l’onglet est visible. En cas de panne passagère du réseau, il garde sa dernière valeur.'
      },
      {
        q: 'Que signifie 99 ?',
        a: "Le compteur s'arrête d'afficher au-delà de 99 notifications non lues."
      }
    ],
    related: [
      { label: 'Centre de notifications', helpId: 'communication.messagerie.notifications' },
      { label: 'Messagerie interne', helpId: 'communication.messagerie.messages' }
    ],
    keywords: ['cloche', 'badge', 'compteur', 'notifications non lues', 'volet']
  },
  {
    id: 'communication.messagerie.messages',
    kind: 'page',
    title: 'Messagerie interne',
    summary:
      'Échangez par écrit avec les membres de votre agence et, selon votre profil, avec ses clients. Chaque conversation est privée.',
    purpose:
      "Un fil de discussion rattaché à l'agence, partagé par les collaborateurs et les clients des portails (locataire, propriétaire, copropriétaire).\n\nUn collaborateur peut écrire à un collègue et, avec le droit « Voir les contacts », à un client. Un client ne peut écrire qu'à l'équipe et ne voit ni les autres clients ni les e-mails.",
    steps: [
      {
        title: 'Ouvrir une conversation',
        detail: 'Cliquez sur une conversation de la liste.'
      },
      {
        title: 'En démarrer une',
        detail: 'Cliquez sur « Nouvelle conversation », choisissez une ou plusieurs personnes, puis « Démarrer ».'
      },
      {
        title: 'Retrouver une conversation',
        detail: 'Tapez le titre ou le nom d’un participant dans « Rechercher une conversation ».'
      },
      {
        title: 'Écrire',
        detail:
          'Saisissez votre texte dans « Écrire un message », puis Entrée pour envoyer (Maj + Entrée : nouvelle ligne).'
      },
      {
        title: 'Voir qui participe',
        detail: 'Cliquez sur le bouton « Participants ».'
      },
      {
        title: 'Sur téléphone',
        detail: 'Liste et fil s’affichent l’un après l’autre ; la flèche de retour ramène à la liste.'
      }
    ],
    consequences: [
      'Un message envoyé ne peut être ni modifié ni supprimé.',
      "Chaque autre participant reçoit dans l'application une notification « Vous avez reçu un nouveau message. », titrée de votre nom et sans le texte. Aucun e-mail ni SMS n'est envoyé.",
      "Seuls les participants lisent une conversation, pas même l'administrateur de l'agence ni l'équipe de la plateforme.",
      'Une personne ajoutée plus tard ne voit que les messages envoyés après son arrivée.',
      'La liste et la conversation ouverte se rafraîchissent toutes les 30 secondes.'
    ],
    faq: [
      {
        q: 'Puis-je envoyer un fichier ou une photo ?',
        a: 'Non, la messagerie ne transmet que du texte, jusqu’à 5 000 caractères par message.'
      },
      {
        q: 'Comment savoir si mon message a été lu ?',
        a: "Il n'y a pas d'accusé de lecture : le destinataire reçoit seulement une notification."
      },
      {
        q: 'Mon message ne part pas.',
        a: "Un message vide, de plus de 5 000 caractères ou au-delà de 30 envois par minute est refusé. Votre texte reste dans la zone d'écriture."
      },
      {
        q: 'Je ne trouve pas un client dans la liste.',
        a: 'Seuls les collaborateurs ayant le droit « Voir les contacts » voient les clients, et seulement ceux dont le compte est actif.'
      }
    ],
    permissions: {
      note: "Tout collaborateur et tout client d'un portail y a accès, sans pack particulier. Écrire à un client demande le droit « Voir les contacts »."
    },
    related: [
      { label: 'Liste des conversations', helpId: 'communication.messagerie.messages.conversations' },
      { label: 'Nouvelle conversation', helpId: 'communication.messagerie.messages.nouvelle' },
      { label: 'Fil de discussion et zone d’écriture', helpId: 'communication.messagerie.messages.fil' },
      { label: 'Participants', helpId: 'communication.messagerie.messages.participants' },
      { label: 'Centre de notifications', helpId: 'communication.messagerie.notifications' }
    ],
    keywords: ['messagerie', 'message', 'conversation', 'discussion', 'chat', 'écrire', 'groupe', 'client', 'équipe']
  },
  {
    id: 'communication.messagerie.messages.conversations',
    kind: 'section',
    title: 'Liste des conversations',
    summary:
      'Toutes vos conversations, de la plus récente à la plus ancienne. Un chiffre indique les messages que vous n’avez pas encore lus.',
    howToRead: {
      notes: [
        'Le titre est celui du groupe ; sans titre, ce sont les noms des autres participants. Dessous, vous voyez le début du dernier message.',
        "À droite du titre, l'heure du dernier message si elle date d'aujourd'hui, sinon la date (jour/mois).",
        'Le chiffre dans une pastille est le nombre de messages non lus dans cette conversation. Le titre est alors en gras.'
      ]
    },
    steps: [
      { title: 'Chercher', detail: 'Tapez dans « Rechercher une conversation » : titre ou participant.' },
      {
        title: 'Voir davantage',
        detail:
          '« Afficher plus de conversations » étend la liste (de 50 à 100 au plus). Au-delà, utilisez la recherche.'
      }
    ],
    consequences: [
      "Pour un collaborateur, la recherche porte sur le titre et sur le nom ou l'e-mail des autres participants. Pour un client, elle porte sur le titre et sur le nom du personnel seulement.",
      'Une conversation que vous avez quittée disparaît de votre liste.'
    ],
    faq: [
      {
        q: 'Une conversation a disparu de ma liste.',
        a: 'Vous l’avez peut-être quittée : une conversation quittée ne revient pas dans votre liste.'
      },
      {
        q: 'Pourquoi une conversation affiche-t-elle des noms plutôt qu’un titre ?',
        a: 'Une discussion directe, ou un groupe créé sans titre, prend le nom des autres participants.'
      },
      {
        q: 'Ma recherche ne trouve rien.',
        a: 'Le message « Aucune conversation ne correspond à votre recherche. » s’affiche. Essayez un autre mot ou effacez la recherche.'
      }
    ],
    related: [
      { label: 'Messagerie interne', helpId: 'communication.messagerie.messages' },
      { label: 'Nouvelle conversation', helpId: 'communication.messagerie.messages.nouvelle' }
    ],
    keywords: ['conversations', 'liste', 'non lus', 'recherche', 'pastille']
  },
  {
    id: 'communication.messagerie.messages.nouvelle',
    kind: 'section',
    title: 'Nouvelle conversation',
    summary:
      'Choisissez une personne pour une discussion directe, ou plusieurs pour un groupe. La conversation s’ouvre aussitôt.',
    steps: [
      { title: 'Chercher', detail: 'Tapez un nom dans « Rechercher une personne » : la liste se filtre.' },
      {
        title: 'Cocher',
        detail:
          'Cochez une personne pour une discussion directe, plusieurs pour un groupe. Une étiquette « Équipe » ou « Client » précise son profil.'
      },
      {
        title: 'Nommer le groupe',
        detail: 'Dès que vous cochez au moins deux personnes, un champ « Titre du groupe (facultatif) » apparaît.'
      },
      { title: 'Démarrer', detail: 'Cliquez sur « Démarrer ». Le bouton reste grisé tant que personne n’est coché.' }
    ],
    consequences: [
      "Une discussion directe avec la même personne n'est jamais créée deux fois : vous rouvrez la conversation existante.",
      "Personne n'est prévenu tant que vous n'avez pas envoyé un premier message.",
      "Un groupe compte au plus 50 participants, vous compris, et 5 dès qu'il contient un client.",
      "Un client ne peut démarrer qu'une discussion directe avec un membre de l'équipe : pas de groupe."
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas nommer ma conversation ?',
        a: 'Le titre n’existe que pour un groupe : cochez au moins deux personnes.'
      },
      {
        q: 'Une personne manque dans la liste.',
        a: "Seules les personnes actives de l'agence sont proposées. Les clients ne le sont qu'aux collaborateurs qui ont le droit « Voir les contacts »."
      },
      {
        q: 'Un message d’erreur « Action impossible » s’affiche.',
        a: 'Une des règles ci-dessus n’est pas respectée (trop de participants, groupe avec un client trop grand), ou un envoi trop rapide a été bloqué. Vérifiez votre choix et réessayez.'
      }
    ],
    related: [
      { label: 'Messagerie interne', helpId: 'communication.messagerie.messages' },
      { label: 'Participants', helpId: 'communication.messagerie.messages.participants' }
    ],
    keywords: ['nouvelle conversation', 'groupe', 'discussion directe', 'démarrer', 'participants']
  },
  {
    id: 'communication.messagerie.messages.fil',
    kind: 'section',
    title: 'Fil de discussion et zone d’écriture',
    summary:
      'Le fil affiche les messages dans l’ordre, les vôtres à droite et ceux des autres à gauche. En bas, la zone « Écrire un message » sert à répondre.',
    howToRead: {
      notes: [
        "Pour un message d'une autre personne, le nom de l'auteur s'affiche avec son profil (« Équipe » en bleu, « Client » en jaune) et l'heure.",
        'Les retours à la ligne sont conservés, et le texte est affiché tel quel.',
        "Un client voit « Autre participant » à la place du nom d'un autre client."
      ]
    },
    steps: [
      { title: 'Écrire', detail: 'Tapez votre message dans « Écrire un message ».' },
      {
        title: 'Envoyer',
        detail: 'Appuyez sur Entrée, ou cliquez sur le bouton d’envoi. Maj + Entrée passe à la ligne.'
      },
      {
        title: 'Relire l’historique',
        detail: 'Cliquez sur « Charger les messages plus anciens » en haut du fil quand il apparaît.'
      }
    ],
    consequences: [
      "L'envoi est définitif : un message ne se modifie ni ne se supprime.",
      'Chaque autre participant est prévenu par une notification dans l’application, sans le texte du message.',
      'Ouvrir la conversation, page visible, marque ses nouveaux messages comme lus.'
    ],
    faq: [
      {
        q: 'Pourquoi le bouton d’envoi est-il grisé ?',
        a: "Il l'est tant que la zone d'écriture est vide ou ne contient que des espaces."
      },
      {
        q: 'Quelle est la taille maximale ?',
        a: 'Un message compte au plus 5 000 caractères : la saisie s’arrête à cette limite.'
      },
      {
        q: 'Je ne vois pas les anciens messages d’un groupe.',
        a: 'Si vous avez été ajouté après leur envoi, vous ne les voyez pas : un participant ne voit que ce qui a été écrit depuis son arrivée.'
      }
    ],
    related: [
      { label: 'Messagerie interne', helpId: 'communication.messagerie.messages' },
      { label: 'Participants', helpId: 'communication.messagerie.messages.participants' }
    ],
    keywords: ['fil', 'message', 'écrire', 'envoyer', 'historique', 'composeur']
  },
  {
    id: 'communication.messagerie.messages.participants',
    kind: 'section',
    title: 'Participants',
    summary:
      'La liste des personnes de la conversation, avec leur profil. Dans un groupe, vous pouvez en ajouter ou quitter la conversation.',
    steps: [
      {
        title: 'Afficher la liste',
        detail: 'Cliquez sur « Participants » au-dessus du fil. Un second clic la referme.'
      },
      {
        title: 'Ajouter quelqu’un',
        detail: 'Dans un groupe, cliquez sur « Ajouter des participants », cochez les personnes, puis « Ajouter ».'
      },
      {
        title: 'Quitter',
        detail: 'Dans un groupe, cliquez sur « Quitter la conversation », puis « Quitter » pour confirmer.'
      }
    ],
    consequences: [
      "Quitter un groupe vous en retire : vous ne voyez plus la conversation ni ses messages. Aucun bouton ne permet d'y revenir, et les autres participants ne peuvent pas vous y rajouter.",
      'Une personne ajoutée voit seulement les messages envoyés après son arrivée.',
      "Un groupe compte au plus 50 participants, et 5 dès qu'il contient un client.",
      "Une discussion directe n'a ni « Ajouter des participants » ni « Quitter la conversation »."
    ],
    faq: [
      {
        q: 'Que signifie « Équipe de l’agence » ou « Autre participant » ?',
        a: "Ces noms protègent la vie privée. Un client voit « Équipe de l'agence » pour un membre du personnel dont le nom n'est pas renseigné, et « Autre participant » à la place d'un autre client."
      },
      {
        q: 'Que signifient « Équipe » et « Client » ?',
        a: "« Équipe » désigne un membre actif de l'agence ; « Client » un locataire, propriétaire ou copropriétaire qui a un compte sur son portail."
      },
      {
        q: 'Pourquoi je ne peux pas ajouter une personne de plus ?',
        a: "Le groupe a atteint sa limite : 50 participants, ou 5 s'il contient un client."
      }
    ],
    related: [
      { label: 'Nouvelle conversation', helpId: 'communication.messagerie.messages.nouvelle' },
      { label: 'Messagerie interne', helpId: 'communication.messagerie.messages' }
    ],
    keywords: ['participants', 'ajouter', 'quitter', 'groupe', 'équipe', 'client']
  },
  {
    id: 'communication.messagerie.journal',
    kind: 'page',
    title: 'Journal des notifications',
    summary:
      "Consultez toutes les notifications envoyées par l'agence, canal par canal, avec les échecs et leur motif. Vous pouvez renvoyer un envoi qui a échoué.",
    purpose:
      "Quand l'application prévient quelqu'un par e-mail, WhatsApp, SMS ou dans l'application, l'envoi est consigné ici avec son destinataire, son canal et son résultat. C'est l'écran à ouvrir pour savoir pourquoi un locataire, un propriétaire ou un collaborateur n'a pas reçu un message.\n\nLes messages privés de la messagerie n'y figurent jamais, même en résumé.",
    steps: [
      {
        title: 'Rechercher',
        detail: 'Tapez un nom, un titre ou un mot du message dans « Rechercher ».'
      },
      {
        title: 'Filtrer',
        detail:
          'Choisissez un « Destinataire », un « Canal » ou un « Statut ». La « Période » se règle sous « Plus de critères ».'
      },
      { title: 'Ouvrir le détail', detail: 'Cliquez sur une ligne : le volet de détail s’ouvre.' },
      {
        title: 'Renvoyer',
        detail: 'Sur une ligne en échec, cliquez sur « Renvoyer ». Un message confirme le résultat.'
      },
      { title: 'Actualiser', detail: 'Cliquez sur « Actualiser » pour recharger la liste.' }
    ],
    consequences: [
      "« Renvoyer » envoie réellement le message une nouvelle fois au destinataire. Ne l'utilisez que si l'envoi a bien échoué : si le premier message est finalement arrivé, il peut être reçu en double.",
      "Seuls les canaux en échec sont rejoués. Un renvoi est refusé si le message n'est pas rejouable, si le destinataire a retiré son consentement ou s'il n'est plus actif : l'envoi reste en échec et le motif l'explique.",
      "Le renvoi est irréversible, et le journal ne peut pas être exporté. Le tableau montre les destinataires et le texte des notifications de toute l'agence."
    ],
    faq: [
      {
        q: 'Pourquoi une ligne « Envoyée » a-t-elle un bouton « Renvoyer » ?',
        a: "Le statut d'ensemble est « Envoyée » dès qu'un canal est parti. Si un autre canal a échoué, le bouton reste proposé pour le rejouer."
      },
      {
        q: 'Je ne vois pas cet écran dans le menu.',
        a: "Il demande le droit « Voir le journal des notifications ». Par défaut, il est donné aux administrateurs et aux gestionnaires de l'agence ; demandez-le à votre administrateur pour un autre rôle."
      },
      {
        q: 'Le renvoi a de nouveau échoué.',
        a: "Un message vous le signale. Ouvrez le détail : le motif de l'échec s'affiche en rouge sur le canal concerné."
      },
      {
        q: 'Où est le message privé que je cherche ?',
        a: 'Les messages de la messagerie interne ne sont jamais consignés ici, pour protéger leur contenu.'
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire'],
      note: "Demande le droit « Voir le journal des notifications ». Il est donné par défaut aux administrateurs et aux gestionnaires de l'agence, et peut être attribué à un rôle personnalisé."
    },
    related: [
      { label: 'Comment lire le journal', helpId: 'communication.messagerie.journal.tableau' },
      { label: 'Détail d’un envoi', helpId: 'communication.messagerie.journal.detail' },
      { label: 'Notifications par e-mail', helpId: 'communication.canaux.email' },
      { label: 'Notifications WhatsApp', helpId: 'communication.canaux.whatsapp' }
    ],
    keywords: [
      'journal',
      'notifications',
      'envois',
      'échec',
      'renvoyer',
      'e-mail',
      'whatsapp',
      'sms',
      'historique des envois',
      'pas reçu'
    ]
  },
  {
    id: 'communication.messagerie.journal.tableau',
    kind: 'table',
    title: 'Comment lire le journal',
    summary:
      "Chaque ligne est une notification envoyée à une personne. Les étiquettes de la colonne « Canaux » montrent le résultat sur chaque canal ; la colonne « Statut » donne le résultat d'ensemble.",
    howToRead: {
      columns: [
        {
          key: 'createdAt',
          label: 'Date',
          description: 'Date et heure de création de la notification, de la plus récente à la plus ancienne.'
        },
        { key: 'recipient', label: 'Destinataire', description: 'La personne à qui la notification est adressée.' },
        { key: 'title', label: 'Notification', description: 'Le titre de la notification.' },
        {
          key: 'channels',
          label: 'Canaux',
          description:
            'Une étiquette « canal · statut » par canal utilisé : « Dans l’application », « E-mail », « WhatsApp » ou « SMS ».'
        },
        {
          key: 'status',
          label: 'Statut',
          description: 'Résultat d’ensemble : « Envoyée » dès qu’un canal est parti, « Échec » si tous ont échoué.'
        }
      ],
      statuses: [
        { value: 'PENDING', label: 'En attente', description: "L'envoi est en cours ou n'a pas encore été tenté." },
        { value: 'SENT', label: 'Envoyée', description: 'Le message est parti.' },
        {
          value: 'DELIVERED',
          label: 'Remise',
          description: "Le canal a confirmé l'arrivée du message. Ce statut est rare."
        },
        {
          value: 'FAILED',
          label: 'Échec',
          description: "L'envoi n'a pas abouti : le bouton « Renvoyer » est proposé."
        },
        {
          value: 'SKIPPED',
          label: 'Non envoyée',
          description:
            "L'envoi a été volontairement ignoré : canal désactivé, adresse ou numéro absent, accord manquant."
        }
      ],
      notes: [
        'Un envoi qui porte seulement « Dans l’application » n’a produit aucun e-mail ni SMS.',
        "Le bouton « Renvoyer » apparaît dès qu'un canal est en échec, même si le statut d'ensemble est « Envoyée »."
      ]
    },
    faq: [
      {
        q: 'Comment retrouver les envois à un destinataire précis ?',
        a: "Choisissez-le dans « Destinataire ». La liste propose les personnes déjà notifiées par l'agence."
      },
      {
        q: 'Comment ne voir que les échecs ?',
        a: 'Choisissez « Échec » dans « Statut ».'
      },
      {
        q: 'Les lignes sont-elles cliquables ?',
        a: 'Oui : un clic ouvre le détail de la notification, canal par canal.'
      }
    ],
    related: [
      { label: 'Journal des notifications', helpId: 'communication.messagerie.journal' },
      { label: 'Détail d’un envoi', helpId: 'communication.messagerie.journal.detail' }
    ],
    keywords: ['colonnes', 'statut', 'canal', 'destinataire', 'filtre']
  },
  {
    id: 'communication.messagerie.journal.detail',
    kind: 'section',
    title: 'Détail d’un envoi',
    summary:
      'Le volet qui s’ouvre au clic sur une ligne montre le message, qui l’a déclenché et, pour chaque canal, les tentatives et le motif d’un éventuel échec.',
    howToRead: {
      notes: [
        '« Destinataire », « Déclenchée par » (la personne dont l’action a provoqué l’envoi, quand elle est connue), « Date » et « Message » décrivent la notification.',
        'Chaque canal a sa carte : « Cible » (adresse e-mail ou numéro visé), « Tentatives », « Dernière tentative » et « Envoyée le ».',
        "Sur un canal en échec, l'encadré rouge « Échec de l'envoi » donne le motif, par exemple : le serveur de messagerie a refusé l'e-mail, ou WhatsApp n'a pas été envoyé faute d'accord ou de numéro."
      ]
    },
    steps: [
      { title: 'Lire le motif', detail: 'Repérez le canal en rouge et lisez le motif de l’échec.' },
      {
        title: 'Corriger la cause',
        detail: 'Par exemple, ajoutez l’adresse ou le numéro manquant dans la fiche de la personne.'
      },
      { title: 'Renvoyer', detail: 'Cliquez sur « Renvoyer » en haut du volet.' }
    ],
    consequences: [
      'Après un renvoi, le volet se met à jour : « Tentatives » augmente, et le message « Notification renvoyée. » ou un avertissement apparaît.',
      'Le renvoi envoie de nouveau le message au destinataire et ne peut pas être annulé.'
    ],
    faq: [
      {
        q: 'Que signifie « Motif non communiqué » ?',
        a: "Le canal a échoué sans donner d'explication. Réessayez avec « Renvoyer » ; si l'échec persiste, vérifiez la configuration du canal."
      },
      {
        q: 'Que veut dire « Tentatives » ?',
        a: 'Le nombre de fois où l’application a essayé d’envoyer le message sur ce canal.'
      },
      {
        q: 'Pourquoi aucune « Cible » n’est affichée ?',
        a: "Pour un avis « Dans l'application », il n'y a ni adresse ni numéro : le message n'est visible que dans la cloche et le centre de notifications."
      }
    ],
    related: [
      { label: 'Journal des notifications', helpId: 'communication.messagerie.journal' },
      { label: 'Comment lire le journal', helpId: 'communication.messagerie.journal.tableau' }
    ],
    keywords: ['détail', 'tentatives', 'motif', 'échec', 'renvoyer', 'cible']
  },
  {
    id: 'communication.messagerie.journal-plateforme',
    kind: 'page',
    title: 'Notifications (plateforme)',
    summary:
      'Consultez les notifications envoyées par toutes les agences, avec les échecs et leur motif. Vous pouvez renvoyer un envoi qui a échoué.',
    purpose:
      "Cet écran est réservé aux super-administrateurs de la plateforme. Il montre le même journal que celui d'une agence, mais pour toutes les agences à la fois : utile pour comprendre pourquoi une agence signale qu'un locataire, un propriétaire ou un collaborateur n'a pas reçu un message.\n\nLes messages privés de la messagerie n'y figurent jamais.",
    steps: [
      { title: 'Rechercher', detail: 'Tapez un destinataire, un titre ou un mot du message dans « Rechercher ».' },
      {
        title: 'Filtrer',
        detail:
          'Choisissez une « Agence », un « Canal » ou un « Statut ». La « Période » se règle sous « Plus de critères ».'
      },
      {
        title: 'Ouvrir le détail',
        detail: "Cliquez sur une ligne : le volet de détail s'ouvre, avec l'agence concernée."
      },
      {
        title: 'Renvoyer',
        detail: 'Sur une ligne en échec, cliquez sur « Renvoyer ». Un message confirme le résultat.'
      },
      { title: 'Actualiser', detail: 'Cliquez sur « Actualiser » pour recharger la liste.' }
    ],
    consequences: [
      "« Renvoyer » envoie réellement le message une nouvelle fois au destinataire, au nom de son agence. Ne l'utilisez que si l'envoi a bien échoué : si le premier message est finalement arrivé, il peut être reçu en double.",
      "Seuls les canaux en échec sont rejoués. Un renvoi est refusé si le message n'est pas rejouable, si le destinataire a retiré son consentement ou s'il n'est plus actif : l'envoi reste en échec et le motif l'explique.",
      'Le renvoi est irréversible. Cet écran montre les destinataires et le texte des notifications de toutes les agences : ne partagez pas son contenu.'
    ],
    faq: [
      {
        q: "Quelle différence avec le journal d'une agence ?",
        a: 'Le tableau gagne une colonne « Agence » et le filtre « Destinataire » est remplacé par le filtre « Agence ». Le reste se lit de la même façon.'
      },
      {
        q: 'Pourquoi une ligne « Envoyée » a-t-elle un bouton « Renvoyer » ?',
        a: "Le statut d'ensemble est « Envoyée » dès qu'un canal est parti. Si un autre canal a échoué, le bouton reste proposé pour le rejouer."
      },
      {
        q: 'Je ne vois pas cet écran.',
        a: "Il est réservé aux super-administrateurs de la plateforme. Un administrateur d'agence consulte le journal de sa seule agence, depuis « Journal des notifications »."
      },
      {
        q: 'Le renvoi a de nouveau échoué.',
        a: "Un message vous le signale. Ouvrez le détail : le motif de l'échec s'affiche sur le canal concerné."
      }
    ],
    permissions: {
      roles: ['Super-administrateur de la plateforme'],
      note: 'Réservé aux super-administrateurs. Consulter demande le droit de voir les agences de la plateforme ; renvoyer demande le droit de les modifier. Les renvois sont limités en nombre sur une courte durée.'
    },
    related: [
      { label: 'Comment lire le journal', helpId: 'communication.messagerie.journal.tableau' },
      { label: "Journal des notifications d'une agence", helpId: 'communication.messagerie.journal' },
      { label: 'Détail d’un envoi', helpId: 'communication.messagerie.journal.detail' }
    ],
    keywords: [
      'notifications plateforme',
      'toutes les agences',
      'envois',
      'échec',
      'renvoyer',
      'super-administrateur',
      'journal'
    ]
  }
];

export default entries;
