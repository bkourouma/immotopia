import type { HelpEntry } from '../../../types';

/** Zone « newsletter » du module « communication » (fr). */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------------------
  // Listes de diffusion
  // ---------------------------------------------------------------------------
  {
    id: 'communication.newsletter.listes',
    kind: 'page',
    title: 'Listes de diffusion',
    summary:
      'Créez et gérez les listes de personnes à qui votre agence envoie sa newsletter. Cliquez sur une liste pour voir ses abonnés, en ajouter ou les exporter.',
    purpose:
      "Une liste de diffusion est le groupe de destinataires d'une campagne. Il en existe deux sortes : les listes « Manuelle », que vous remplissez vous-même, et les listes dérivées (« Propriétaires », « Locataires », « Contacts CRM »), construites automatiquement à partir des personnes de votre agence qui ont donné leur accord.",
    steps: [
      { title: 'Créer une liste', detail: 'Cliquez sur « Nouvelle liste », donnez un nom et choisissez le type.' },
      { title: 'Rechercher', detail: 'Tapez un nom dans « Rechercher » ou filtrez par « Type ».' },
      { title: 'Ouvrir une liste', detail: 'Cliquez sur sa carte pour voir ses abonnés.' },
      { title: 'Modifier une liste', detail: 'Bouton « Modifier » de la carte : changez le nom.' },
      { title: 'Supprimer une liste', detail: 'Bouton « Supprimer » de la carte, puis confirmez.' },
      { title: 'Écrire aux abonnés', detail: 'Créez ensuite une campagne dans la page « Campagnes newsletter ».' }
    ],
    consequences: [
      "Créer, modifier ou remplir une liste n'envoie aucun message : seuls les envois de campagne écrivent aux abonnés.",
      'Le type de la liste ne peut plus être changé après sa création, et son nom doit rester unique dans votre agence.',
      'Supprimer une liste est irréversible : ses abonnés sont effacés, ainsi que les campagnes envoyées à cette liste et leurs statistiques.'
    ],
    faq: [
      {
        q: 'Quelle différence entre une liste manuelle et une liste dérivée ?',
        a: 'Dans une liste manuelle, vous ajoutez vous-même les adresses (import, recherche CRM, formulaire public). Une liste dérivée ne garde aucun abonné : ses destinataires sont recalculés à chaque envoi à partir de vos propriétaires, locataires ou contacts qui ont donné leur accord.'
      },
      {
        q: "Pourquoi ne puis-je pas ajouter d'abonnés à une liste « Propriétaires » ?",
        a: "Les listes dérivées ne se remplissent pas à la main : une personne en fait partie dès qu'elle a donné son accord pour recevoir la newsletter (consentement e-mail pour un contact CRM)."
      },
      {
        q: 'Je ne vois pas cette page ou certains boutons. Pourquoi ?',
        a: "Il faut le droit « Accès au module Communication » (ou être administrateur de l'agence). Demandez-le à l'administrateur de votre agence."
      }
    ],
    permissions: {
      note: "Consulter, créer, modifier ou supprimer une liste demande le droit « Accès au module Communication » (ou d'être administrateur de l'agence). Aucun pack particulier n'est requis."
    },
    related: [
      { label: 'Cartes des listes', helpId: 'communication.newsletter.listes.cartes' },
      { label: 'Campagnes newsletter', helpId: 'communication.newsletter.campagnes' },
      { label: 'Templates newsletter', helpId: 'communication.newsletter.modeles' }
    ],
    keywords: [
      'newsletter',
      'liste',
      'listes de diffusion',
      'abonnés',
      'mailing',
      'e-mail',
      'destinataires',
      'diffusion',
      'double opt-in'
    ]
  },
  {
    id: 'communication.newsletter.listes.cartes',
    kind: 'section',
    title: 'Cartes des listes',
    summary:
      'Chaque carte est une liste de diffusion, avec son type et ses effectifs. Cliquez sur la carte pour ouvrir la liste.',
    howToRead: {
      notes: [
        'Chaque carte porte le nom de la liste, son type (Manuelle, Propriétaires, Locataires ou Contacts CRM) et, si elle est activée, la mention « Double opt-in ».',
        'Total : toutes les adresses de la liste, y compris celles qui attendent encore de confirmer ou qui se sont désabonnées.',
        'Actifs : les adresses qui recevront la prochaine campagne.',
        'Désabonnés : les personnes qui ont demandé à ne plus recevoir de messages.',
        'Pour une liste dérivée, Total et Actifs affichent le même nombre (les personnes qui ont donné leur accord) et Désabonnés reste à 0.'
      ]
    },
    steps: [
      { title: 'Ouvrir la liste', detail: "Cliquez n'importe où sur la carte." },
      { title: 'Renommer la liste', detail: 'Bouton « Modifier » en bas de la carte.' },
      {
        title: 'Supprimer la liste',
        detail: 'Bouton « Supprimer » en bas de la carte : une confirmation vous est demandée.'
      }
    ],
    consequences: [
      'La suppression efface aussi tous les abonnés de la liste, les campagnes envoyées à cette liste et leurs statistiques. Elle ne peut pas être annulée.'
    ],
    faq: [
      {
        q: 'Pourquoi « Actifs » est-il plus petit que « Total » ?',
        a: 'Total compte aussi les personnes en attente de confirmation et celles qui se sont désabonnées. Seuls les abonnés actifs reçoivent les campagnes.'
      },
      {
        q: 'Comment retrouver une liste quand il y en a beaucoup ?',
        a: "Utilisez « Rechercher » (nom de la liste) et le filtre « Type ». Le bouton « Effacer les critères » remet toutes les listes à l'écran."
      },
      {
        q: 'Que fait le bouton « Modifier » sur une liste dérivée ?',
        a: "Vous pouvez en changer le nom. L'interrupteur « Double opt-in » n'est proposé que pour les listes manuelles."
      }
    ],
    related: [
      { label: 'Créer ou modifier une liste', helpId: 'communication.newsletter.listes.creation' },
      { label: "Détail d'une liste", helpId: 'communication.newsletter.listes.abonnes' }
    ],
    keywords: ['carte', 'effectif', 'actifs', 'désabonnés', 'supprimer une liste']
  },
  {
    id: 'communication.newsletter.listes.creation',
    kind: 'section',
    title: 'Créer ou modifier une liste',
    summary:
      'Le formulaire demande un nom, un type et le réglage « Double opt-in ». Le type se choisit à la création et ne change plus ensuite.',
    purpose:
      'Le type décide qui recevra vos campagnes : des adresses que vous gérez (Manuelle) ou les personnes de votre agence qui ont donné leur accord.',
    steps: [
      { title: 'Ouvrir le formulaire', detail: 'Bouton « Nouvelle liste » (ou « Modifier » sur une carte).' },
      { title: 'Saisir le nom', detail: 'Il doit être unique dans votre agence.' },
      {
        title: 'Choisir le type',
        detail:
          '« Manuelle (import, ajout manuel) », « Propriétaires (avec accord newsletter) », « Locataires (avec accord newsletter) » ou « Contacts CRM (consentement email) ».'
      },
      { title: 'Régler le « Double opt-in »', detail: 'Interrupteur Oui / Non, activé par défaut.' },
      { title: 'Valider', detail: 'Bouton « Créer » (ou « Enregistrer » en modification).' }
    ],
    consequences: [
      "Une liste « Manuelle » reçoit automatiquement un lien public d'inscription, visible dans la liste ouverte (« Formulaire d'inscription publique »). Les autres types n'en ont pas.",
      "Si le nom existe déjà dans votre agence, un message vous le signale et rien n'est créé.",
      "En modification, vous pouvez changer le nom ; l'interrupteur « Double opt-in » n'apparaît que pour une liste manuelle."
    ],
    faq: [
      {
        q: 'Quel type choisir ?',
        a: '« Manuelle » pour des adresses que vous collectez ou importez. « Propriétaires », « Locataires » et « Contacts CRM » écrivent aux personnes de votre agence qui ont donné leur accord, sans rien à saisir.'
      },
      {
        q: "Que fait l'interrupteur « Double opt-in » ?",
        a: "Il est enregistré avec la liste et affiché sur sa carte. Les personnes qui s'inscrivent par le formulaire public doivent toujours confirmer par e-mail ; celles que vous ajoutez vous-même (import, recherche CRM) sont actives tout de suite."
      },
      {
        q: 'Puis-je changer le type plus tard ?',
        a: 'Non. Créez une nouvelle liste du type voulu.'
      }
    ],
    related: [{ label: 'Listes de diffusion', helpId: 'communication.newsletter.listes' }],
    keywords: ['nouvelle liste', 'créer une liste', 'type de liste', 'consentement', 'accord']
  },
  {
    id: 'communication.newsletter.listes.abonnes',
    kind: 'section',
    title: "Détail d'une liste",
    summary:
      'Une liste ouverte montre ses abonnés et les actions pour la remplir. Une liste dérivée montre seulement le nombre de destinataires et un export.',
    purpose:
      "Depuis une liste manuelle, vous suivez qui est inscrit, ajoutez des contacts du CRM, importez un fichier et partagez le formulaire d'inscription publique. Une liste dérivée n'a pas d'abonnés enregistrés : ses destinataires sont calculés au moment de chaque envoi.",
    steps: [
      { title: 'Ajouter depuis le CRM', detail: 'Bouton « Ajouter des contacts (recherche CRM) ».' },
      { title: 'Importer un fichier', detail: 'Bouton « Importer CSV » au-dessus du tableau.' },
      {
        title: 'Exporter la liste',
        detail: 'Bouton « Exporter CSV » : le fichier contient tous les abonnés de la liste.'
      },
      { title: 'Revenir aux listes', detail: 'Bouton « Retour aux listes ».' }
    ],
    consequences: [
      'Pour une liste dérivée, le bouton « Exporter CSV (destinataires actuels) » donne les adresses qui recevraient une campagne envoyée maintenant ; leur statut est « DESTINATAIRE » dans le fichier.',
      "Les abonnés d'une liste dérivée ne se retirent pas ici : retirez l'accord de la personne dans sa fiche.",
      "Pour une liste dérivée, le lien de désinscription d'un e-mail ne modifie pas la liste."
    ],
    faq: [
      {
        q: 'Pourquoi ne vois-je pas de tableau pour ma liste « Locataires » ?',
        a: "Une liste dérivée n'a pas d'abonnés enregistrés. Vous voyez le nombre de destinataires potentiels, et l'export donne leur liste."
      },
      {
        q: "Où est le formulaire d'inscription publique ?",
        a: "Dans une liste manuelle, au-dessus du tableau, dans la section repliée « Formulaire d'inscription publique »."
      },
      {
        q: 'Que contient le fichier exporté ?',
        a: "Les colonnes email, name, status et les dates d'inscription, de confirmation et de désinscription pour une liste manuelle ; seulement les adresses actuelles pour une liste dérivée."
      }
    ],
    related: [
      { label: 'Tableau des abonnés', helpId: 'communication.newsletter.listes.abonnes.tableau' },
      { label: 'Importer des abonnés', helpId: 'communication.newsletter.listes.import' },
      { label: "Formulaire d'inscription publique", helpId: 'communication.newsletter.listes.inscription' }
    ],
    keywords: ['abonnés', 'exporter', 'liste dérivée', 'destinataires']
  },
  {
    id: 'communication.newsletter.listes.abonnes.tableau',
    kind: 'table',
    title: 'Tableau des abonnés',
    summary:
      'Chaque ligne est une adresse e-mail de la liste, avec son statut. Seules les adresses « Actif » reçoivent les campagnes.',
    howToRead: {
      columns: [
        { key: 'email', label: 'Email', description: "L'adresse e-mail de l'abonné. Un bouton permet de la copier." },
        {
          key: 'name',
          label: 'Nom',
          description: "Le nom saisi à l'inscription ou dans le fichier. Un tiret (—) signale un nom absent."
        },
        { key: 'status', label: 'Statut', description: "L'état de l'abonné (voir les statuts ci-dessous)." },
        {
          key: 'subscribedAt',
          label: 'Inscrit le',
          description: "La date d'inscription, au format jour/mois/année."
        },
        { key: 'actions', label: 'Actions', description: 'Le bouton « Retirer » supprime la ligne de la liste.' }
      ],
      statuses: [
        {
          value: 'PENDING_CONFIRMATION',
          label: 'En attente',
          description:
            "La personne s'est inscrite par le formulaire public mais n'a pas encore cliqué sur le lien de confirmation. Elle ne reçoit aucune campagne."
        },
        {
          value: 'ACTIVE',
          label: 'Actif',
          description: 'Abonné confirmé, ou ajouté par vous (import, recherche CRM). Il reçoit les campagnes.'
        },
        {
          value: 'UNSUBSCRIBED',
          label: 'Désabonné',
          description:
            'La personne a demandé à ne plus recevoir de messages. Elle reste dans la liste mais ne reçoit plus rien.'
        }
      ],
      notes: [
        "La recherche porte sur l'e-mail et le nom ; le filtre « Statut » réduit la liste. Le total est rappelé sous le tableau.",
        'Le tableau propose aussi son propre export (Excel, CSV, PDF) : il reprend tous les abonnés correspondant à vos filtres, pas seulement la page affichée.',
        'Quand la liste est vide, le tableau affiche « Aucun abonné pour le moment. »'
      ]
    },
    steps: [
      { title: 'Retrouver une adresse', detail: "Tapez un morceau d'e-mail ou de nom dans « Rechercher »." },
      { title: 'Voir les inscriptions à confirmer', detail: 'Filtre « Statut », puis « En attente ».' },
      { title: 'Retirer un abonné', detail: 'Bouton « Retirer » sur sa ligne.' }
    ],
    consequences: [
      "« Retirer » efface l'abonné de la liste tout de suite, sans demande de confirmation.",
      "Un abonné « Désabonné » n'est pas supprimé : si vous réimportez ou rajoutez son adresse, elle est ignorée car déjà présente. Il peut se réinscrire lui-même par le formulaire public et devra confirmer."
    ],
    faq: [
      {
        q: 'Pourquoi un abonné reste-t-il « En attente » ?',
        a: "Il n'a pas encore cliqué sur le lien du courriel de confirmation. Tant qu'il ne l'a pas fait, il ne reçoit rien."
      },
      {
        q: 'Puis-je réactiver un abonné « Désabonné » ?',
        a: "Pas depuis cet écran. La personne peut se réinscrire elle-même par le formulaire public ; elle repasse alors « En attente » jusqu'à sa confirmation."
      },
      {
        q: 'Comment annuler un « Retirer » fait par erreur ?',
        a: "Ce n'est pas possible : ajoutez de nouveau l'adresse (import ou recherche CRM)."
      }
    ],
    related: [{ label: 'Importer des abonnés', helpId: 'communication.newsletter.listes.import' }],
    keywords: ['abonné', 'retirer', 'désinscrit', 'confirmation', 'statut']
  },
  {
    id: 'communication.newsletter.listes.import',
    kind: 'section',
    title: 'Importer des abonnés (CSV)',
    summary:
      "Ajoutez d'un coup plusieurs adresses à une liste manuelle à partir d'un fichier CSV. Le résultat indique combien d'adresses ont été acceptées, rejetées ou ignorées.",
    purpose:
      "Le fichier peut venir d'un tableur enregistré au format CSV. La première ligne contient les titres de colonnes.",
    steps: [
      {
        title: 'Préparer le fichier',
        detail: 'Une colonne « email » (obligatoire) et une colonne « name » (facultative), séparées par des virgules.'
      },
      { title: 'Ouvrir la fenêtre', detail: 'Bouton « Importer CSV » au-dessus du tableau des abonnés.' },
      { title: 'Choisir le fichier', detail: 'Cliquez dans la zone ou glissez-y le fichier CSV.' },
      { title: 'Lancer', detail: 'Bouton « Importer », puis lisez le résultat affiché.' }
    ],
    howToRead: {
      notes: [
        'Accepté(s) : adresses ajoutées à la liste.',
        'Rejeté(s) : lignes sans adresse ou avec une adresse invalide ; les premières erreurs sont listées.',
        'Doublon(s) : adresses déjà dans la liste, ignorées (y compris celles déjà désabonnées).'
      ]
    },
    consequences: [
      'Les adresses importées sont « Actif » tout de suite : aucun e-mail de confirmation ne leur est envoyé et elles recevront votre prochaine campagne.',
      "L'import ne vérifie pas le consentement des personnes : importez seulement des contacts qui acceptent de recevoir vos messages.",
      'La taille du fichier est limitée à 2 Mo. Seules les listes manuelles peuvent être importées.'
    ],
    faq: [
      {
        q: 'Mon fichier est refusé ou toutes les lignes sont rejetées. Que faire ?',
        a: "Vérifiez qu'il est bien au format CSV avec des virgules, que la première ligne contient « email » et que le fichier fait moins de 2 Mo."
      },
      {
        q: "Et si je n'ai pas de colonne « name » ?",
        a: 'Les adresses sont importées sans nom. Dans vos messages, « {{prenom}} » sera alors remplacé par « Cher abonné ».'
      },
      {
        q: 'Les adresses en double sont-elles créées deux fois ?',
        a: 'Non : une adresse déjà présente dans la liste est comptée comme doublon et ignorée.'
      }
    ],
    related: [{ label: 'Tableau des abonnés', helpId: 'communication.newsletter.listes.abonnes.tableau' }],
    keywords: ['importer', 'csv', 'fichier', 'excel', 'adresses']
  },
  {
    id: 'communication.newsletter.listes.inscription',
    kind: 'section',
    title: "Formulaire d'inscription publique",
    summary:
      "Chaque liste manuelle a un lien public où toute personne peut s'inscrire. L'inscription n'est valable qu'après confirmation par e-mail.",
    purpose:
      'Partagez ce lien sur votre site, vos réseaux ou par message pour que vos visiteurs rejoignent la liste eux-mêmes.',
    steps: [
      {
        title: 'Ouvrir la section',
        detail: "Dans une liste manuelle, cliquez sur « Formulaire d'inscription publique »."
      },
      { title: 'Copier le lien', detail: 'Le lien public est affiché en haut de la section.' },
      { title: 'Partager', detail: 'La personne saisit son e-mail (et son nom), puis valide.' },
      {
        title: 'Confirmation',
        detail: 'Elle reçoit un e-mail et clique sur le lien pour valider : elle devient « Actif ».'
      }
    ],
    consequences: [
      "Le formulaire affiché dans la section est le vrai formulaire : l'utiliser inscrit réellement l'adresse saisie et lui envoie l'e-mail de confirmation.",
      "Le lien de confirmation est valable 7 jours. Tant qu'il n'est pas utilisé, la personne reste « En attente » et ne reçoit aucune campagne.",
      'Une personne déjà inscrite ou déjà en attente reçoit un message en ce sens. Une personne désabonnée qui se réinscrit repasse « En attente » et reçoit un nouvel e-mail de confirmation.'
    ],
    faq: [
      {
        q: 'Pourquoi cette section est-elle absente de ma liste ?',
        a: "Elle n'existe que pour les listes « Manuelle ». Les listes dérivées n'ont pas de formulaire public."
      },
      {
        q: "Que voit la personne qui s'inscrit ?",
        a: 'Un message lui demande de vérifier sa boîte e-mail et de cliquer sur le lien de confirmation.'
      },
      {
        q: 'Les inscrits par ce formulaire apparaissent où ?',
        a: 'Dans le tableau des abonnés de la liste, avec le statut « En attente » puis « Actif » après confirmation.'
      }
    ],
    related: [{ label: 'Tableau des abonnés', helpId: 'communication.newsletter.listes.abonnes.tableau' }],
    keywords: ['inscription', 'formulaire', 'lien public', 'confirmation', 'double opt-in']
  },
  {
    id: 'communication.newsletter.listes.ajout-crm',
    kind: 'section',
    title: 'Ajouter des contacts depuis le CRM',
    summary:
      'Retrouvez des contacts de votre CRM avec la recherche avancée, cochez ceux que vous voulez, puis confirmez : leurs adresses sont ajoutées à la liste manuelle.',
    steps: [
      { title: 'Ouvrir la recherche', detail: 'Bouton « Ajouter des contacts (recherche CRM) ».' },
      { title: 'Chercher', detail: 'Utilisez la recherche rapide ou les filtres avancés.' },
      { title: 'Cocher les contacts', detail: "Le nombre de contacts sélectionnés s'affiche en bas." },
      { title: 'Valider', detail: 'Bouton « Confirmer la sélection ».' }
    ],
    consequences: [
      'Les contacts sont ajoutés « Actif » tout de suite, avec leur e-mail et leur nom, sans e-mail de confirmation.',
      "L'ajout ne vérifie pas le consentement du contact : assurez-vous qu'il accepte de recevoir vos messages.",
      'Un message indique combien de contacts ont été ajoutés et combien ont été ignorés (adresse invalide ou déjà présente).'
    ],
    faq: [
      {
        q: 'Que se passe-t-il si le contact est déjà dans la liste ?',
        a: 'Il est ignoré et compté parmi les contacts « ignorés ou déjà présents ».'
      },
      {
        q: "Si je modifie l'e-mail d'un contact dans le CRM, la liste change-t-elle ?",
        a: "Non : l'adresse est copiée au moment de l'ajout. Pour suivre automatiquement le CRM, utilisez une liste « Contacts CRM »."
      },
      {
        q: 'Les contacts ajoutés reçoivent-ils un message tout de suite ?',
        a: "Non. L'ajout ne leur envoie rien : ils recevront seulement vos prochaines campagnes."
      }
    ],
    related: [{ label: "Détail d'une liste", helpId: 'communication.newsletter.listes.abonnes' }],
    keywords: ['crm', 'contacts', 'recherche avancée', 'ajouter des abonnés']
  },

  // ---------------------------------------------------------------------------
  // Campagnes
  // ---------------------------------------------------------------------------
  {
    id: 'communication.newsletter.campagnes',
    kind: 'page',
    title: 'Campagnes newsletter',
    summary:
      'Préparez un message, envoyez-le tout de suite ou à une date choisie à une liste de diffusion, puis suivez les résultats. Les campagnes se retrouvent toutes dans un seul tableau.',
    purpose:
      "Une campagne est un message (sujet et contenu) adressé à une liste. Elle commence en « Brouillon » : vous pouvez la corriger, la prévisualiser, la planifier ou l'envoyer.",
    steps: [
      {
        title: 'Créer la campagne',
        detail: 'Bouton « Nouvelle campagne » : liste, template facultatif, sujet et contenu.'
      },
      { title: 'Vérifier', detail: 'Bouton « Aperçu » sur la ligne du brouillon.' },
      {
        title: 'Planifier ou envoyer',
        detail: '« Planifier » choisit une date ; « Envoyer » part tout de suite, après confirmation.'
      },
      { title: 'Suivre les résultats', detail: 'Colonne « Statistiques » : envoyés, ouverts, retournés.' }
    ],
    consequences: [
      "L'envoi ne peut pas être annulé : les destinataires reçoivent le message dès la confirmation. Seule une campagne « Planifiée » peut encore être annulée.",
      'Chaque destinataire reçoit un e-mail personnalisé avec son propre lien de désinscription ; le message doit contenir « {{lien_desinscription}} ».',
      'Si votre agence a configuré WhatsApp, une version texte est aussi envoyée aux destinataires qui ont donné leur consentement WhatsApp.'
    ],
    faq: [
      {
        q: 'Puis-je modifier une campagne déjà envoyée ou planifiée ?',
        a: "Non, seules les campagnes en « Brouillon » se modifient. Pour une campagne « Planifiée », vous pouvez l'annuler, mais elle ne revient pas en brouillon : créez-en une nouvelle."
      },
      {
        q: 'Comment supprimer une campagne ?',
        a: 'Cet écran ne propose pas de suppression de campagne. Elle disparaît seulement si la liste à laquelle elle est liée est supprimée.'
      },
      {
        q: 'Qui reçoit la campagne ?',
        a: "Les abonnés « Actif » d'une liste manuelle, ou les personnes ayant donné leur accord pour une liste dérivée. Les abonnés « En attente » et « Désabonné » ne reçoivent rien."
      }
    ],
    permissions: {
      note: "Créer, modifier, planifier, annuler et envoyer demandent le droit « Accès au module Communication » (ou d'être administrateur de l'agence). Aucun pack particulier n'est requis."
    },
    related: [
      { label: 'Tableau des campagnes', helpId: 'communication.newsletter.campagnes.tableau' },
      { label: 'Créer ou modifier une campagne', helpId: 'communication.newsletter.campagnes.formulaire' },
      { label: 'Listes de diffusion', helpId: 'communication.newsletter.listes' }
    ],
    keywords: ['campagne', 'newsletter', 'envoyer', 'e-mail', 'mailing', 'envoi groupé', 'planifier']
  },
  {
    id: 'communication.newsletter.campagnes.tableau',
    kind: 'table',
    title: 'Tableau des campagnes',
    summary:
      "Chaque ligne est une campagne, de la plus récente à la plus ancienne. Le statut, les chiffres d'envoi et les actions possibles dépendent de l'avancement.",
    howToRead: {
      columns: [
        { key: 'subject', label: 'Sujet', description: 'Le sujet du message, suivi de son statut.' },
        { key: 'listName', label: 'Liste', description: 'La liste de diffusion destinataire.' },
        {
          key: 'stats',
          label: 'Statistiques',
          description:
            "Pour une campagne « Envoyée » ou « En cours » : « Envoyés » (messages partis), « Ouverts » (messages ouverts) et « Retournés » (adresses où l'envoi a échoué, affiché seulement s'il y en a). Un tiret (—) sinon."
        },
        {
          key: 'sentAt',
          label: 'Date',
          description:
            "La date et l'heure d'envoi ; « Planifié » et la date prévue pour une campagne planifiée ; sinon la date de création."
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            'Brouillon : « Modifier », « Aperçu », « Planifier », « Envoyer ». Planifiée : « Annuler ». Autres statuts : aucune action.'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description: 'Message en préparation. Il peut être modifié, prévisualisé, planifié ou envoyé.'
        },
        {
          value: 'SCHEDULED',
          label: 'Planifiée',
          description: "Envoi programmé à une date et une heure. Il part tout seul ; vous pouvez l'annuler d'ici là."
        },
        { value: 'SENDING', label: 'En cours', description: "L'envoi est en train de partir vers les destinataires." },
        { value: 'SENT', label: 'Envoyée', description: 'Au moins un destinataire a reçu le message.' },
        {
          value: 'CANCELLED',
          label: 'Annulée',
          description: "L'envoi planifié a été annulé. La campagne ne peut plus être envoyée."
        },
        {
          value: 'FAILED',
          label: 'Échec',
          description: "Aucun destinataire n'a pu être joint, ou l'envoi planifié a échoué."
        }
      ],
      notes: [
        'Recherchez par sujet ou nom de liste, filtrez par « Statut », par « Liste de diffusion » ou par période de création (« Créée du / au »).',
        "L'export du tableau reprend toutes les campagnes qui correspondent à vos critères.",
        "Quand aucune campagne n'existe, le tableau affiche « Aucune campagne pour le moment. »"
      ]
    },
    steps: [
      { title: 'Retrouver une campagne', detail: 'Utilisez la recherche et les filtres au-dessus du tableau.' },
      {
        title: 'Envoyer un brouillon',
        detail: "Bouton « Envoyer » : une fenêtre demande de confirmer l'envoi à tous les abonnés actifs."
      },
      { title: 'Annuler un envoi planifié', detail: 'Bouton « Annuler », puis confirmez « Annuler la campagne ».' }
    ],
    consequences: [
      "Envoyer est irréversible. La campagne passe « En cours », puis « Envoyée » (ou « Échec » si personne n'a reçu le message).",
      'Annuler une campagne planifiée est définitif : elle devient « Annulée » et ne peut plus être replanifiée ni envoyée.'
    ],
    faq: [
      {
        q: 'Que veut dire « Ouverts » ?',
        a: "Le nombre de destinataires dont la messagerie a affiché le message. Si la personne ne charge pas les images, l'ouverture peut ne pas être comptée."
      },
      {
        q: 'Que veut dire « Retournés » ?',
        a: "Les adresses auxquelles le message n'a pas pu être envoyé, par exemple parce que l'adresse est invalide ou refusée."
      },
      {
        q: "Pourquoi ma campagne « Envoyée » n'a aucun bouton ?",
        a: 'Une fois envoyée, une campagne ne se modifie plus et ne se renvoie plus. Créez une nouvelle campagne pour un nouvel envoi.'
      }
    ],
    related: [
      { label: 'Planifier un envoi', helpId: 'communication.newsletter.campagnes.planification' },
      { label: 'Aperçu avant envoi', helpId: 'communication.newsletter.campagnes.apercu' }
    ],
    keywords: ['statistiques', 'ouverts', 'retournés', 'statut', 'brouillon', 'planifiée', 'annuler']
  },
  {
    id: 'communication.newsletter.campagnes.formulaire',
    kind: 'section',
    title: 'Créer ou modifier une campagne',
    summary:
      "Choisissez la liste, rédigez le sujet et le contenu du message, puis enregistrez : la campagne est créée en brouillon et rien n'est envoyé.",
    steps: [
      {
        title: 'Liste de diffusion',
        detail: 'Choisissez la liste ; le nombre de destinataires actifs est indiqué à côté de son nom.'
      },
      { title: 'Template (optionnel)', detail: 'Vous pouvez habiller le message avec un template existant.' },
      { title: 'Sujet', detail: "Le sujet de l'e-mail. Il accepte « {{prenom}} » et les autres variables." },
      { title: 'Corps du message (HTML)', detail: 'Le contenu. Il doit contenir « {{lien_desinscription}} ».' },
      {
        title: 'Enregistrer',
        detail: '« Créer la campagne » ; en modification, « Enregistrer ». Le bouton « Aperçu » montre le rendu.'
      }
    ],
    howToRead: {
      notes: [
        'Variables du message : {{prenom}}, {{nom}}, {{email}} et {{lien_desinscription}} (obligatoire). Si le prénom est inconnu, {{prenom}} devient « Cher abonné ».',
        "Un avertissement « Le lien de désinscription est obligatoire » s'affiche tant que {{lien_desinscription}} manque ; le bouton d'enregistrement reste alors grisé."
      ]
    },
    consequences: [
      "La campagne est enregistrée en « Brouillon » : aucun message n'est envoyé avant que vous cliquiez sur « Envoyer » ou « Planifier ».",
      "À l'enregistrement, le message est nettoyé : seules les balises de mise en forme courantes (paragraphes, titres, listes, liens, tableaux) sont conservées ; les images et les scripts sont retirés.",
      "Avec un template, le contenu du message remplace la variable {{contenu}} du template au moment de l'aperçu et de l'envoi.",
      'La liste ne peut plus être changée après la création. Seuls le sujet, le contenu et le template se modifient, tant que la campagne est en « Brouillon ».'
    ],
    faq: [
      {
        q: 'Pourquoi le bouton « Créer la campagne » est-il grisé ?',
        a: 'Le message ne contient pas {{lien_desinscription}}. Ajoutez-le, par exemple dans un lien « Se désabonner ».'
      },
      {
        q: 'Mon message est-il aussi envoyé sur WhatsApp ?',
        a: 'Si votre agence a configuré WhatsApp, une version texte part aux destinataires qui ont donné leur consentement WhatsApp et dont le numéro est connu dans le CRM.'
      },
      {
        q: 'Puis-je personnaliser le sujet ?',
        a: 'Oui, les variables comme {{prenom}} sont aussi remplacées dans le sujet.'
      }
    ],
    related: [
      { label: 'Templates newsletter', helpId: 'communication.newsletter.modeles' },
      { label: 'Aperçu avant envoi', helpId: 'communication.newsletter.campagnes.apercu' }
    ],
    keywords: ['nouvelle campagne', 'rédiger', 'sujet', 'contenu', 'html', 'variables', 'désinscription']
  },
  {
    id: 'communication.newsletter.campagnes.apercu',
    kind: 'section',
    title: 'Aperçu avant envoi',
    summary:
      "L'aperçu montre le sujet et le message tels qu'un destinataire les recevrait, avec des valeurs d'exemple. Rien n'est envoyé.",
    steps: [
      {
        title: 'Ouvrir',
        detail: 'Bouton « Aperçu » sur une campagne en brouillon, ou dans le formulaire de modification.'
      },
      { title: 'Relire', detail: 'Vérifiez le sujet, le texte, le template et les liens.' },
      { title: 'Fermer', detail: 'Fermez la fenêtre, puis corrigez ou envoyez.' }
    ],
    consequences: [
      "L'aperçu utilise des valeurs d'exemple (« Prénom », « Nom », « exemple@test.com ») ; le lien de désinscription affiché ne désabonne personne.",
      "L'aperçu ne compte pas dans les statistiques. Cet écran ne propose pas d'envoi de test : l'aperçu est le seul contrôle avant l'envoi."
    ],
    faq: [
      {
        q: "Pourquoi l'aperçu n'est-il disponible que pour un brouillon ?",
        a: "Les campagnes planifiées ou envoyées ne se modifient plus, donc le bouton « Aperçu » n'apparaît que sur les brouillons."
      },
      {
        q: 'Le rendu sera-t-il identique dans la messagerie du destinataire ?',
        a: 'À peu près : chaque messagerie affiche les e-mails à sa façon, surtout les mises en page complexes.'
      },
      {
        q: "L'aperçu envoie-t-il un e-mail ?",
        a: "Non, il s'affiche seulement à l'écran."
      }
    ],
    related: [{ label: 'Créer ou modifier une campagne', helpId: 'communication.newsletter.campagnes.formulaire' }],
    keywords: ['aperçu', 'prévisualiser', 'test', 'relire']
  },
  {
    id: 'communication.newsletter.campagnes.planification',
    kind: 'section',
    title: "Planifier l'envoi",
    summary:
      "Choisissez la date et l'heure auxquelles la campagne doit partir. Elle est ensuite envoyée automatiquement.",
    steps: [
      { title: 'Ouvrir', detail: 'Bouton « Planifier » sur une campagne en brouillon.' },
      {
        title: "Choisir la date et l'heure",
        detail: 'Elles doivent être dans le futur : sinon le bouton reste grisé.'
      },
      { title: 'Valider', detail: 'Bouton « Planifier ». La campagne passe « Planifiée ».' }
    ],
    consequences: [
      "L'application contrôle chaque minute les campagnes planifiées et envoie celles dont l'heure est arrivée.",
      "Une campagne « Planifiée » ne se modifie plus : seule l'annulation reste possible, et elle est définitive.",
      "Si l'envoi automatique échoue, la campagne passe « Échec ».",
      'Un template utilisé par une campagne planifiée ne peut pas être supprimé.'
    ],
    faq: [
      {
        q: 'Comment changer la date ou le contenu après avoir planifié ?',
        a: 'Annulez la campagne puis créez-en une nouvelle : une campagne annulée ne revient pas en brouillon.'
      },
      {
        q: 'Puis-je envoyer tout de suite une campagne planifiée ?',
        a: "Non, depuis cet écran une campagne planifiée n'a que le bouton « Annuler »."
      },
      {
        q: "Que se passe-t-il à l'heure prévue ?",
        a: "La campagne passe « En cours », puis « Envoyée » (ou « Échec » si personne n'a reçu le message)."
      }
    ],
    related: [{ label: 'Tableau des campagnes', helpId: 'communication.newsletter.campagnes.tableau' }],
    keywords: ['planifier', 'programmer', 'date', 'heure', 'envoi différé']
  },
  {
    id: 'communication.newsletter.campagnes.depuis-bien',
    kind: 'section',
    title: "Campagne à partir d'un bien",
    summary:
      "Depuis un bien, créez en quelques clics une campagne déjà rédigée à partir de sa fiche (type, prix, adresse, description). Elle est enregistrée en brouillon et rien n'est envoyé.",
    steps: [
      {
        title: 'Ouvrir la fenêtre',
        detail:
          "Dans la liste des biens, menu de la ligne puis « Diffuser en newsletter » ; dans la fiche d'un bien, « Créer une campagne newsletter »."
      },
      { title: 'Choisir la liste', detail: 'Champ « Liste de diffusion », obligatoire.' },
      { title: 'Relire le message', detail: 'Le sujet et le contenu sont préremplis : corrigez-les si besoin.' },
      { title: 'Valider', detail: 'Bouton « Créer la campagne ».' }
    ],
    consequences: [
      "La campagne est créée en « Brouillon ». Pour l'envoyer ou la planifier, rendez-vous dans « Campagnes newsletter ».",
      'Le message reprend le titre du bien, son type, ses modes de transaction, ses caractéristiques, son prix (ou « Prix sur demande »), son adresse, sa zone et sa description.',
      "Les images du bien insérées dans le message sont retirées lors de l'enregistrement : le message partira sans photos.",
      "Le message doit contenir « {{lien_desinscription}} » : il y est déjà, et le bouton reste grisé s'il disparaît."
    ],
    faq: [
      {
        q: 'Je ne vois pas cette action sur la fiche du bien.',
        a: "Elle dépend de votre pack d'abonnement (CRM) et de vos droits. Demandez-les à l'administrateur de votre agence."
      },
      {
        q: 'Le bien est-il diffusé tout de suite ?',
        a: 'Non. Vous créez seulement un brouillon, que vous envoyez ensuite depuis « Campagnes newsletter ».'
      },
      {
        q: 'Puis-je changer le message avant de créer la campagne ?',
        a: 'Oui, le sujet et le contenu sont modifiables ; vous pouvez aussi choisir un template.'
      }
    ],
    related: [{ label: 'Campagnes newsletter', helpId: 'communication.newsletter.campagnes' }],
    keywords: ['bien', 'propriété', 'annonce', 'diffuser', 'newsletter bien']
  },

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------
  {
    id: 'communication.newsletter.modeles',
    kind: 'page',
    title: 'Templates newsletter',
    summary:
      'Un template est une mise en page réutilisable pour vos messages. Vous le créez une fois, puis vous le choisissez dans vos campagnes.',
    purpose:
      "Le template contient l'habillage de l'e-mail (salutation, pied de page...) et la variable « {{contenu}} », à l'endroit où le texte de chaque campagne sera inséré.",
    steps: [
      { title: 'Créer un template', detail: 'Bouton « Nouveau template » : nom et HTML.' },
      { title: 'Rechercher', detail: 'Tapez un nom ou un mot du contenu dans la recherche.' },
      { title: 'Modifier ou supprimer', detail: 'Boutons « Modifier » et « Supprimer » de la ligne.' },
      { title: "L'utiliser", detail: 'Dans une campagne, champ « Template (optionnel) ».' }
    ],
    consequences: [
      "Modifier un template change aussi l'aperçu et l'envoi des campagnes non envoyées qui l'utilisent : il est appliqué au moment de l'aperçu et de l'envoi.",
      "Supprimer un template est irréversible. C'est refusé s'il est utilisé par une campagne planifiée. Sinon, les campagnes qui l'utilisaient restent mais perdent cet habillage.",
      'Le lien de désinscription obligatoire doit figurer dans le corps de chaque campagne, même si votre template en contient un.'
    ],
    faq: [
      {
        q: 'Un template est-il obligatoire ?',
        a: "Non, le champ « Template (optionnel) » d'une campagne peut rester vide."
      },
      {
        q: 'À quoi sert {{contenu}} ?',
        a: "C'est l'endroit où le texte de la campagne est inséré dans le template."
      },
      {
        q: 'Je ne peux pas supprimer un template. Pourquoi ?',
        a: 'Il est utilisé par une campagne « Planifiée ». Annulez cette campagne ou attendez son envoi.'
      }
    ],
    permissions: {
      note: "Créer, modifier et supprimer demandent le droit « Accès au module Communication » (ou d'être administrateur de l'agence). Aucun pack particulier n'est requis."
    },
    related: [
      { label: 'Tableau des templates', helpId: 'communication.newsletter.modeles.tableau' },
      { label: 'Créer ou modifier un template', helpId: 'communication.newsletter.modeles.formulaire' },
      { label: 'Campagnes newsletter', helpId: 'communication.newsletter.campagnes' }
    ],
    keywords: ['template', 'modèle', 'mise en page', 'habillage', 'html', 'newsletter']
  },
  {
    id: 'communication.newsletter.modeles.tableau',
    kind: 'table',
    title: 'Tableau des templates',
    summary: 'Chaque ligne est un template de votre agence, avec son nom et le début de son texte.',
    howToRead: {
      columns: [
        { key: 'name', label: 'Nom', description: 'Le nom du template, unique dans votre agence.' },
        {
          key: 'preview',
          label: 'Aperçu',
          description:
            "Le début du texte du template (80 caractères environ), sans mise en forme : ce n'est pas un rendu visuel."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Modifier » ouvre le formulaire ; « Supprimer » demande une confirmation.'
        }
      ],
      notes: [
        'La recherche porte sur le nom et sur le contenu des templates.',
        "L'export du tableau reprend tous les templates correspondant à votre recherche.",
        "Quand il n'y a aucun template, le tableau invite à en créer un."
      ]
    },
    steps: [
      { title: 'Retrouver un template', detail: 'Tapez un mot dans « Rechercher ».' },
      { title: 'Supprimer un template', detail: 'Bouton « Supprimer », puis confirmez.' }
    ],
    consequences: ['La suppression est définitive. Elle est refusée si une campagne planifiée utilise le template.'],
    faq: [
      {
        q: "Pourquoi la colonne « Aperçu » n'affiche-t-elle pas la mise en page ?",
        a: "Elle montre seulement le début du texte. Pour voir le rendu, utilisez l'aperçu d'une campagne qui utilise ce template."
      },
      {
        q: 'Combien de templates puis-je créer ?',
        a: 'Autant que vous voulez, à condition que chaque nom soit différent.'
      },
      {
        q: 'Comment modifier un template ?',
        a: "Cliquez sur « Modifier » sur sa ligne : le formulaire s'ouvre avec son nom et son HTML."
      }
    ],
    related: [{ label: 'Créer ou modifier un template', helpId: 'communication.newsletter.modeles.formulaire' }],
    keywords: ['liste des templates', 'supprimer un template', 'recherche']
  },
  {
    id: 'communication.newsletter.modeles.formulaire',
    kind: 'section',
    title: 'Créer ou modifier un template',
    summary:
      "Donnez un nom au template et écrivez son HTML avec la variable « {{contenu}} » à l'endroit où le texte de la campagne doit apparaître.",
    steps: [
      { title: 'Ouvrir', detail: 'Bouton « Nouveau template » (ou « Modifier » sur une ligne).' },
      { title: 'Nommer', detail: 'Le nom est obligatoire et doit être unique.' },
      { title: 'Écrire le HTML', detail: 'Un modèle de départ est proposé à la création : adaptez-le.' },
      { title: 'Valider', detail: 'Bouton « OK » de la fenêtre.' }
    ],
    howToRead: {
      notes: ['Variables disponibles : {{contenu}}, {{prenom}}, {{nom}}, {{email}} et {{lien_desinscription}}.']
    },
    consequences: [
      "À l'enregistrement, le HTML est nettoyé : seules les balises de mise en forme courantes (paragraphes, titres, listes, liens, tableaux) sont conservées ; les images et les scripts sont retirés.",
      "Si le nom existe déjà, un message l'indique et rien n'est enregistré."
    ],
    faq: [
      {
        q: 'Dois-je connaître le HTML ?',
        a: 'Un peu : partez du modèle proposé et ne changez que les textes entre les balises.'
      },
      {
        q: 'Où mettre le lien de désinscription ?',
        a: 'Dans le corps de chaque campagne, avec « {{lien_desinscription}} ». Il peut aussi figurer dans le template, mais cela ne remplace pas celui du message.'
      },
      {
        q: 'Quelles variables puis-je utiliser ?',
        a: '{{contenu}}, {{prenom}}, {{nom}}, {{email}} et {{lien_desinscription}}.'
      }
    ],
    related: [{ label: 'Templates newsletter', helpId: 'communication.newsletter.modeles' }],
    keywords: ['html', 'variables', 'contenu', 'nouveau template']
  }
];

export default entries;
