import type { HelpEntry } from '../../../types';

/** Zone « stock » du module finance (fr). */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------------------
  // Écran Stock
  // ---------------------------------------------------------------------------
  {
    id: 'finance.stock.page',
    kind: 'page',
    title: 'Stock',
    summary:
      "Suivez ce qu'il reste de chaque article dans chaque magasin ou chantier, et enregistrez les réceptions, les sorties, les rebuts et les retours. Le journal garde la trace de chaque mouvement.",
    purpose:
      "Le stock de chantier suit les matériaux achetés : combien il en reste, où, et ce que cela vaut. La marchandise entre par une réception rattachée à une facture fournisseur validée. Elle sort vers un chantier par une sortie : c'est ce geste, et lui seul, qui fait entrer le coût du matériau dans le coût du chantier.\n\nCet écran est fait pour le bureau. Sur téléphone, à l'entrepôt ou sur le chantier, utilisez plutôt l'écran « Magasin ».",
    steps: [
      {
        title: 'Lire le stock',
        detail: "Onglet « État du stock » : une ligne par article et par lieu, avec la quantité qu'il reste."
      },
      {
        title: 'Enregistrer une réception',
        detail:
          'Bouton « Enregistrer une réception » : choisissez la facture validée, le lieu, les articles et les quantités.'
      },
      {
        title: 'Enregistrer une sortie',
        detail:
          'Bouton « Enregistrer une sortie » : choisissez le chantier, le lieu, le preneur, puis les articles avec leur poste de dépense.'
      },
      {
        title: 'Rebut ou retour',
        detail:
          'Menu « Autres mouvements » : « Rebut » pour une matière détruite, « Retour au fournisseur » pour rendre une marchandise facturée.'
      },
      {
        title: 'Retrouver un mouvement',
        detail:
          'Onglet « Journal des mouvements » : filtrez par nature, période, article, lieu ou chantier, puis ouvrez le bon ou la facture liés.'
      }
    ],
    consequences: [
      "Une réception augmente le stock mais ne fait monter aucun coût de chantier : la facture a déjà porté la valeur, et aucune écriture comptable n'est passée à la réception.",
      'Une sortie diminue le stock et impute le chantier au coût moyen du lieu à cet instant. Elle passe aussi une écriture comptable : la charge du poste de dépense est débitée, le compte de stock est crédité.',
      "Un transfert entre lieux se fait depuis l'écran « Magasin » : il ne change ni la valeur totale ni le coût des chantiers. Un inventaire se fait depuis « Inventaire » ou depuis « Magasin ».",
      'Aucun mouvement ne se supprime ni ne se modifie : une erreur se corrige par un mouvement inverse ou par un inventaire. Le journal garde tout.',
      "Les boutons dépendent de vos droits. Sans le droit de voir les valeurs, les montants, les coûts et les filtres par personne n'apparaissent pas."
    ],
    faq: [
      {
        q: 'Pourquoi le coût de mon chantier ne bouge-t-il pas après une réception ?',
        a: "Parce que la réception ne fait qu'ajouter du stock. Le matériau entre dans le coût du chantier quand il en sort, par une sortie vers ce chantier."
      },
      {
        q: 'Pourquoi ne vois-je aucun montant ?',
        a: 'Les valeurs du stock demandent le droit « Voir les valeurs du stock ». Sans lui, vous voyez les quantités et les mouvements, mais ni coûts ni valeurs.'
      },
      {
        q: 'Pourquoi une quantité affiche-t-elle « Comptage en cours » ?',
        a: "Un inventaire est en cours sur ce lieu. Pour que le comptage reste honnête, la quantité attendue est masquée jusqu'à la clôture du comptage, sauf pour les personnes qui valident les inventaires."
      }
    ],
    permissions: {
      roles: ['Magasinier'],
      feature: 'CONSTRUCTION',
      note: "Voir le stock demande « Consulter le stock ». Recevoir, sortir, « Rebuts et retours » et « Voir les valeurs du stock » sont des droits séparés. Les droits se donnent à l'administrateur de l'agence."
    },
    related: [
      { label: "L'état du stock", helpId: 'finance.stock.etat' },
      { label: 'Le journal des mouvements', helpId: 'finance.stock.journal' },
      { label: "L'écran Magasin (téléphone)", to: '/tenant/:tenantId/finance/stock/magasin' },
      { label: 'Articles et lieux', to: '/tenant/:tenantId/finance/stock/parametrage' }
    ],
    keywords: [
      'stock',
      'matériaux',
      'magasin',
      'entrepôt',
      'réception',
      'sortie',
      'rebut',
      'retour fournisseur',
      'mouvement',
      'coût moyen',
      'imputation chantier'
    ],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'stock-imputation',
          title: 'Qui impute le chantier ?',
          description:
            'Seule la sortie fait entrer le coût du matériau dans le chantier. Une réception ne change que les quantités.'
        },
        {
          target: 'stock-actions',
          title: 'Les gestes de stock',
          description:
            'Réception, sortie, et dans « Autres mouvements » le rebut et le retour au fournisseur. Vous ne voyez que ceux que vos droits permettent.'
        },
        {
          target: 'stock-onglets',
          title: "L'état et le journal",
          description:
            "« État du stock » dit ce qu'il reste ; « Journal des mouvements » dit comment on en est arrivé là."
        }
      ]
    }
  },
  {
    id: 'finance.stock.etat',
    kind: 'section',
    title: 'État du stock',
    summary:
      "Cet onglet montre, pour chaque article et chaque lieu, la quantité qu'il reste et, si vous voyez les valeurs, ce qu'elle vaut.",
    purpose:
      "C'est la photographie du stock à l'instant. Le même article peut être en stock dans plusieurs magasins ou chantiers : chaque couple article et lieu a sa propre ligne et son propre coût moyen.",
    steps: [
      {
        title: 'Chercher un article',
        detail: 'Tapez une référence, une désignation ou un lieu dans « Rechercher ».'
      },
      {
        title: 'Filtrer',
        detail: 'Filtres « Lieu » et « Article ». La case « Masquer les lignes à zéro » cache les articles épuisés.'
      },
      {
        title: 'Exporter',
        detail: "Le bouton d'export du tableau reprend les mêmes filtres."
      }
    ],
    consequences: [
      'Ouvrir, chercher ou filtrer ne modifie rien : ce sont des lectures.',
      "Si aucune ligne n'apparaît alors que vous attendez du stock, vérifiez les filtres, puis qu'une réception a bien été enregistrée."
    ],
    faq: [
      {
        q: 'Pourquoi un même article apparaît-il sur plusieurs lignes ?',
        a: "Parce qu'il est stocké dans plusieurs lieux. Chaque lieu a sa quantité, son coût moyen et sa valeur."
      },
      {
        q: 'Comment lire « 0 sac — plus rien ici » ?',
        a: "L'article a déjà été reçu dans ce lieu, mais tout est sorti. La ligne reste pour garder l'historique."
      },
      {
        q: 'Pourquoi le coût moyen est-il différent entre deux magasins ?',
        a: "Il dépend de ce qu'on a reçu dans chaque lieu et à quel prix. Il n'est jamais saisi à la main : il se déduit de la valeur et de la quantité."
      }
    ],
    permissions: {
      roles: ['Magasinier'],
      feature: 'CONSTRUCTION',
      note: 'Demande « Consulter le stock ». Coût moyen et valeur demandent « Voir les valeurs du stock ».'
    },
    related: [{ label: "Le tableau de l'état du stock", helpId: 'finance.stock.etat.tableau' }],
    keywords: ['solde', 'quantité en stock', 'disponible', 'état du stock', 'inventaire courant']
  },
  {
    id: 'finance.stock.etat.tableau',
    kind: 'table',
    title: "Tableau de l'état du stock",
    summary:
      'Chaque ligne est un article dans un lieu. Elle donne la quantité en stock et, si vous voyez les valeurs, le coût moyen et la valeur.',
    howToRead: {
      columns: [
        { key: 'article', label: 'Article', description: "La désignation de l'article, avec sa référence en dessous." },
        {
          key: 'lieu',
          label: 'Lieu',
          description:
            'Le magasin ou le lieu de chantier où se trouve ce stock. La mention « Comptage en cours » signale un inventaire en cours sur ce lieu.'
        },
        {
          key: 'quantite',
          label: 'Quantité',
          description:
            "La quantité en stock, dans l'unité de l'article (sac, tonne, barre…). « Comptage en cours » remplace le chiffre quand le lieu est en inventaire et que vous ne validez pas les inventaires."
        },
        {
          key: 'cout-moyen',
          label: 'Coût moyen unitaire',
          description: "Le prix moyen d'une unité dans ce lieu, en FCFA. Affiché seulement si vous voyez les valeurs."
        },
        {
          key: 'valeur',
          label: 'Valeur',
          description: 'Ce que vaut la quantité en stock, en FCFA. Affiché seulement si vous voyez les valeurs.'
        }
      ],
      notes: [
        'Sur téléphone, le tableau devient une liste de cartes avec les mêmes informations.',
        'Le coût moyen est un coût moyen pondéré : chaque réception le recalcule, et chaque sortie sort au coût moyen du moment.'
      ]
    },
    steps: [
      { title: "Voir le stock d'un magasin", detail: 'Choisissez le lieu dans le filtre « Lieu ».' },
      {
        title: 'Voir où se trouve un article',
        detail: "Choisissez l'article dans le filtre « Article » : une ligne par lieu apparaît."
      }
    ],
    consequences: [
      "Le tableau est en lecture seule : les quantités ne se modifient qu'en enregistrant un mouvement ou un inventaire."
    ],
    faq: [
      {
        q: 'Pourquoi les colonnes de valeur sont-elles absentes ?',
        a: "Votre rôle n'a pas le droit « Voir les valeurs du stock ». Un message le rappelle en haut de l'écran."
      },
      {
        q: 'Le stock affiché est-il à jour après ma saisie ?',
        a: 'Oui, la liste se relit après chaque enregistrement. Sinon, rechargez la page.'
      },
      {
        q: 'Puis-je corriger une quantité ici ?',
        a: 'Non. Une quantité change par un mouvement (réception, sortie, rebut, retour, transfert) ou par un inventaire validé.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Consulter le stock ».' },
    related: [{ label: 'Le journal des mouvements', helpId: 'finance.stock.journal' }],
    keywords: ['solde', 'quantité', 'valeur du stock', 'coût moyen pondéré', 'article', 'lieu']
  },
  {
    id: 'finance.stock.journal',
    kind: 'section',
    title: 'Journal des mouvements',
    summary:
      'Chaque entrée, sortie, transfert, rebut, retour ou ajustement du stock y est inscrit, avec sa date, son auteur et, si besoin, son bon.',
    purpose:
      "Le journal sert à comprendre pourquoi une quantité a changé et à retrouver qui a pris quoi, pour quel chantier. Rien n'y est effacé : une erreur se corrige par un nouveau mouvement, qui s'ajoute à la suite.",
    steps: [
      {
        title: 'Filtrer',
        detail:
          'Filtres « Nature », « Période », « Article », « Lieu », « Chantier » ; « Preneur » et « Saisi par » si vous voyez les valeurs.'
      },
      {
        title: 'Ouvrir un bon',
        detail:
          "Cliquez sur le numéro dans la colonne « Bon » : le bon s'ouvre à droite, avec ses lignes et ses pièces jointes."
      },
      {
        title: 'Voir la facture',
        detail: "Cliquez sur la référence dans la colonne « Pièce » : les réceptions de la facture s'affichent."
      },
      { title: 'Exporter', detail: 'Bouton « Exporter (CSV) » : mêmes filtres que la liste, 50 000 lignes au plus.' }
    ],
    consequences: [
      'Lire, filtrer ou exporter le journal ne modifie rien.',
      "L'export CSV ne contient pas les colonnes de valeur si votre rôle ne voit pas les valeurs. Au-delà de 50 000 lignes, réduisez la période ou ajoutez un filtre."
    ],
    faq: [
      {
        q: 'Que signifie « +2 j » à côté de « Saisi le » ?',
        a: "Le mouvement a été saisi 2 jours après la date qu'on lui a donnée. À partir de 3 jours, la pastille passe en alerte. La date réelle de saisie reste toujours enregistrée."
      },
      {
        q: 'Pourquoi un transfert occupe-t-il deux lignes ?',
        a: "Un transfert s'écrit en deux mouvements : une sortie du lieu d'origine (signe −) et une entrée dans le lieu d'arrivée (signe +)."
      },
      {
        q: "Comment retrouver ce qu'un chantier a consommé ?",
        a: 'Filtrez la nature sur « Sortie vers un chantier » et le chantier voulu : la colonne « Chantier imputé » montre aussi le poste de dépense.'
      },
      {
        q: 'Où voir plus de lignes ?',
        a: "Le journal s'affiche par pages de 50 lignes : bouton « Charger plus » en bas de la liste."
      }
    ],
    permissions: {
      roles: ['Magasinier'],
      feature: 'CONSTRUCTION',
      note: 'Demande « Consulter le stock ». Les filtres par personne et les colonnes de valeur demandent « Voir les valeurs du stock ».'
    },
    related: [{ label: 'Le tableau du journal', helpId: 'finance.stock.journal.tableau' }],
    keywords: ['historique', 'traçabilité', 'mouvements', 'qui a pris', 'export', 'bon de sortie']
  },
  {
    id: 'finance.stock.journal.tableau',
    kind: 'table',
    title: 'Tableau du journal des mouvements',
    summary:
      "Chaque ligne est un mouvement d'un article dans un lieu. Le signe devant la quantité dit si le stock monte (+) ou baisse (−).",
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'La date du mouvement, telle que déclarée à la saisie.' },
        {
          key: 'saisi-le',
          label: 'Saisi le',
          description:
            "Le jour et l'heure réels de la saisie. « +N j » indique que la saisie a eu lieu N jours après la date du mouvement."
        },
        { key: 'nature', label: 'Nature', description: 'Le type de mouvement (voir les natures ci-dessous).' },
        {
          key: 'bon',
          label: 'Bon',
          description:
            "Le numéro du bon (réception, sortie ou inventaire). Un clic l'ouvre. Un tiret signifie qu'aucun bon n'est lié, par exemple pour un transfert, un rebut ou un retour."
        },
        { key: 'article', label: 'Article', description: "La désignation de l'article, avec sa référence." },
        { key: 'lieu', label: 'Lieu', description: 'Le magasin ou lieu de chantier touché par le mouvement.' },
        {
          key: 'quantite',
          label: 'Quantité',
          description: 'La quantité déplacée, précédée de + (le stock monte) ou − (le stock baisse).'
        },
        {
          key: 'reste',
          label: 'Reste après',
          description:
            'La quantité en stock dans ce lieu juste après le mouvement, et sa valeur si vous voyez les valeurs. « Masqué (comptage en cours) » si le lieu est en inventaire.'
        },
        {
          key: 'prix-unitaire',
          label: 'Prix unitaire',
          description:
            "Le prix d'une unité retenu pour ce mouvement, en FCFA. Visible avec le droit de voir les valeurs."
        },
        {
          key: 'valeur',
          label: 'Valeur du mouvement',
          description:
            "La valeur du mouvement en FCFA. Pour un retour au fournisseur, l'infobulle donne aussi le montant porté au fournisseur."
        },
        {
          key: 'chantier',
          label: 'Chantier imputé',
          description:
            'Le chantier et le poste de dépense auxquels une sortie a été imputée. « Aucune imputation » pour les autres natures.'
        },
        {
          key: 'preneur',
          label: 'Preneur ou demandeur',
          description:
            "La personne qui a emporté la marchandise, telle qu'enregistrée ce jour-là. Si son nom a changé depuis, le nom actuel est rappelé."
        },
        {
          key: 'motif',
          label: 'Motif',
          description: "La raison du mouvement quand elle est exigée : rebut, retour, transfert, écart d'inventaire."
        },
        {
          key: 'piece',
          label: 'Pièce',
          description: 'La facture fournisseur liée à une réception ou à un retour. Un clic ouvre ses réceptions.'
        },
        { key: 'auteur', label: 'Saisi par', description: "L'utilisateur qui a enregistré le mouvement." },
        {
          key: 'pieces-jointes',
          label: 'Pièces jointes',
          description: 'Le nombre de photos et de documents joints. Un clic les ouvre.'
        }
      ],
      statuses: [
        {
          value: 'RECEIPT',
          label: 'Réception',
          description:
            'Marchandise livrée et rattachée à une facture validée. Le stock monte ; aucun coût de chantier ne bouge.'
        },
        {
          value: 'ISSUE',
          label: 'Sortie vers un chantier',
          description:
            'Marchandise remise à un preneur pour un chantier. Le stock baisse et le chantier est imputé au coût moyen du moment.'
        },
        {
          value: 'TRANSFER',
          label: 'Transfert entre lieux',
          description:
            "Marchandise déplacée d'un lieu à un autre, sur deux lignes. Ni imputation ni écriture comptable."
        },
        {
          value: 'ADJUSTMENT',
          label: 'Ajustement d’inventaire',
          description: 'Correction du stock constatée par un inventaire (casse, perte, surplus).'
        },
        {
          value: 'SUPPLIER_RETURN',
          label: 'Retour au fournisseur',
          description: 'Marchandise rendue au fournisseur. Le stock baisse, ainsi que la dette envers ce fournisseur.'
        },
        {
          value: 'SCRAP',
          label: 'Rebut',
          description: 'Matière détruite ou inutilisable, retirée du stock. Jamais imputée à un chantier.'
        }
      ],
      notes: [
        "Les colonnes « Prix unitaire » et « Valeur du mouvement » n'apparaissent que si vous voyez les valeurs.",
        'Sur téléphone, chaque mouvement devient une carte.'
      ]
    },
    steps: [
      { title: 'Retrouver une sortie', detail: 'Filtre « Nature » sur « Sortie vers un chantier », puis le chantier.' },
      { title: 'Retrouver un jour précis', detail: 'Utilisez le filtre « Période ».' }
    ],
    consequences: ["Le journal est en lecture seule : on n'y modifie ni ne supprime aucune ligne."],
    faq: [
      {
        q: 'Une ligne affiche « Aucune imputation ». Est-ce une erreur ?',
        a: "Non. Seule une sortie vers un chantier impute un chantier. Réceptions, transferts, rebuts, retours et ajustements n'en ont pas."
      },
      {
        q: 'Que veut dire « Poste non renseigné » ?',
        a: "La sortie est liée à un chantier mais aucun poste de dépense n'est enregistré sur cette ligne."
      },
      {
        q: "Le nom du preneur a changé : lequel s'affiche ?",
        a: "Le nom tel qu'il était le jour du mouvement, suivi du nom actuel entre parenthèses."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Consulter le stock ».' },
    related: [{ label: 'Les gestes de stock', helpId: 'finance.stock.page' }],
    keywords: ['mouvements', 'journal', 'traçabilité', 'nature', 'chantier imputé', 'reste après']
  },
  {
    id: 'finance.stock.reception',
    kind: 'section',
    title: 'Enregistrer une réception',
    summary:
      'Une réception ajoute au stock la marchandise livrée, en la rattachant à une facture fournisseur validée. Elle produit un bon de réception.',
    purpose:
      "Quand le fournisseur livre, la réception dit quelle quantité de quel article est arrivée, dans quel lieu. Elle ne fait monter aucun coût de chantier : la facture a déjà porté la valeur, et c'est la sortie vers un chantier qui l'imputera plus tard.",
    steps: [
      {
        title: 'Choisir la facture',
        detail:
          'Seules les factures validées par la comptabilité sont proposées. Une pastille indique si elle a déjà été reçue.'
      },
      {
        title: 'Choisir le lieu',
        detail:
          "Le lieu du chantier de la facture est proposé d'abord si ce chantier a un stock. Un lieu de chantier clos n'est pas proposé."
      },
      {
        title: 'Indiquer la date',
        detail: 'Pas dans le futur, et pas plus ancienne que la limite fixée par votre agence (7 jours par défaut).'
      },
      {
        title: 'Saisir les lignes',
        detail:
          "Pour chaque ligne : l'article, la quantité reçue et, si vous le voulez, la ligne de la facture correspondante. « Ajouter une ligne » pour en ajouter."
      },
      { title: 'Ajouter des photos', detail: 'Facultatif : le bon de livraison et la marchandise.' },
      {
        title: 'Enregistrer',
        detail: 'Le bon de réception est créé. Vous pouvez en télécharger le PDF et photographier le bon signé.'
      }
    ],
    consequences: [
      "Le stock du lieu augmente. Aucune écriture comptable n'est passée et aucun chantier n'est imputé : la valeur est déjà dans la facture.",
      "Le prix retenu est celui de la ligne de facture ; à défaut le coût moyen du lieu, puis le dernier prix reçu. Il recalcule le coût moyen du lieu. Si vous voyez les valeurs, vous pouvez saisir un prix, sinon rien n'est à saisir.",
      "Le total reçu n'a pas à égaler le montant de la facture : une livraison en plusieurs fois est normale. Un message d'alerte s'affiche si cette facture a déjà été reçue, si les réceptions dépassent son montant, ou si des articles sont reçus sans prix connu.",
      'Un article désactivé ne peut pas être reçu.',
      "Si la connexion coupe, réessayez : l'opération n'est jamais enregistrée deux fois."
    ],
    faq: [
      {
        q: 'Pourquoi ma facture ne figure-t-elle pas dans la liste ?',
        a: "Elle n'est sans doute pas encore validée par la comptabilité. La réception exige une facture validée."
      },
      {
        q: 'La facture a déjà été reçue. Puis-je recevoir encore ?',
        a: "Oui, une livraison en plusieurs fois est normale. L'écran liste les réceptions déjà faites pour vous éviter un doublon."
      },
      {
        q: 'Je me suis trompé de quantité. Que faire ?',
        a: 'Une réception ne se modifie pas. Corrigez par un inventaire, ou par un retour au fournisseur si la marchandise est rendue.'
      },
      {
        q: 'Quelle date saisir ?',
        a: 'La date de la livraison. La date de saisie réelle est enregistrée à côté, et un écart de plusieurs jours est visible dans le journal.'
      }
    ],
    permissions: { roles: ['Magasinier'], feature: 'CONSTRUCTION', note: 'Demande « Recevoir ».' },
    related: [
      { label: 'Les réceptions déjà faites sur une facture', helpId: 'finance.stock.facture' },
      { label: 'Le bon de réception', helpId: 'finance.stock.bon' }
    ],
    keywords: ['livraison', 'réceptionner', 'bon de réception', 'facture fournisseur', 'entrée de stock']
  },
  {
    id: 'finance.stock.sortie',
    kind: 'section',
    title: 'Enregistrer une sortie vers un chantier',
    summary:
      "Une sortie remet de la marchandise à un preneur pour un chantier. C'est ce geste qui fait entrer le coût du matériau dans le coût du chantier.",
    purpose:
      'La sortie dit qui a emporté quoi, depuis quel lieu, pour quel chantier et sur quel poste de dépense. Elle produit un bon de sortie à faire signer par le preneur.',
    steps: [
      { title: 'Choisir le chantier', detail: "Un chantier clos n'accepte plus de sortie : il n'est pas proposé." },
      { title: 'Choisir le lieu de sortie', detail: "Le magasin ou le lieu de chantier d'où part la marchandise." },
      {
        title: 'Indiquer le preneur',
        detail:
          "Choisissez une personne du carnet des preneurs. Si votre agence ne l'exige pas, vous pouvez saisir un nom libre."
      },
      {
        title: 'Saisir les articles',
        detail:
          "Article, quantité et poste de dépense, ligne par ligne (jusqu'à 50). L'écran montre le stock disponible dans le lieu."
      },
      { title: 'Indiquer la date', detail: 'Pas dans le futur, et pas au-delà de la limite fixée par votre agence.' },
      {
        title: 'Enregistrer',
        detail: 'Le bon de sortie est créé : téléchargez le PDF, faites-le signer, puis photographiez-le.'
      }
    ],
    consequences: [
      'Le stock du lieu baisse. Un article ne peut pas sortir en plus grande quantité que le stock disponible : la sortie est refusée.',
      "La valeur de la sortie est calculée par le serveur au coût moyen du lieu à cet instant. Aucun prix n'est saisi. L'écran affiche seulement un aperçu indicatif.",
      "Le chantier est imputé de cette valeur, sur le poste de dépense choisi : c'est ce qui augmente son coût réel.",
      'Une écriture comptable est passée pour chaque ligne qui a une valeur : la charge du poste (à défaut les charges de chantier) est débitée et le compte de stock est crédité.',
      'Si la valeur du bon atteint le seuil fixé par votre agence, une alerte de stock est créée.',
      "Le poste de dépense est obligatoire et jamais deviné : le poste que propose l'article n'est qu'une suggestion modifiable."
    ],
    faq: [
      {
        q: 'Pourquoi ma sortie est-elle refusée ?',
        a: 'Le plus souvent parce que la quantité dépasse le stock disponible du lieu, ou que le chantier est clos. Le message affiché précise la cause.'
      },
      {
        q: 'Peut-on sortir sans préciser le preneur ?',
        a: "Non : un preneur du carnet ou un nom est exigé. Si votre agence l'impose, seul un preneur du carnet est accepté."
      },
      {
        q: 'Pourquoi le formulaire ne demande-t-il aucun prix ?',
        a: 'Le prix vient du coût moyen du lieu au moment de la sortie. Cela évite les prix saisis à la main.'
      },
      {
        q: 'Comment annuler une sortie ?',
        a: "Elle ne s'annule pas. Remettez la marchandise en stock par une réception ou un transfert, ou régularisez par un inventaire."
      }
    ],
    permissions: { roles: ['Magasinier'], feature: 'CONSTRUCTION', note: 'Demande « Sortir ».' },
    related: [
      { label: 'Le carnet des preneurs', helpId: 'finance.preneurs.page' },
      { label: 'Le bon de sortie', helpId: 'finance.stock.bon' }
    ],
    keywords: ['sortie de stock', 'bon de sortie', 'imputation', 'consommation chantier', 'preneur', 'poste de dépense']
  },
  {
    id: 'finance.stock.rebut',
    kind: 'section',
    title: 'Enregistrer un rebut',
    summary: "Un rebut retire du stock une matière détruite ou devenue inutilisable. Il n'est imputé à aucun chantier.",
    purpose:
      "Utilisez-le pour une matière brisée ou détériorée (humidité, péremption). La perte est enregistrée avec son motif, au lieu de laisser le stock afficher une quantité qui n'existe plus.",
    steps: [
      { title: "Choisir le lieu et l'article", detail: 'Le stock concerné.' },
      { title: 'Saisir la quantité', detail: 'Elle ne peut pas dépasser le stock disponible dans ce lieu.' },
      {
        title: 'Choisir le motif',
        detail: '« Casse », « Détérioration » ou « Autre » : avec « Autre », une précision est obligatoire.'
      },
      { title: 'Indiquer la date', detail: 'Pas dans le futur, et dans la limite fixée par votre agence.' },
      { title: 'Enregistrer', detail: "Vous pouvez joindre une photo de la marchandise avant d'enregistrer." }
    ],
    consequences: [
      'Le stock du lieu baisse de la quantité rebutée, valorisée au coût moyen du lieu.',
      "Une écriture comptable est passée si la valeur n'est pas nulle : la variation des stocks (compte 603) est débitée, le compte de stock (311) est crédité.",
      "Le rebut n'est jamais imputé à un chantier.",
      'Une alerte de stock peut être créée si la valeur atteint le seuil fixé par votre agence.',
      "Un rebut ne s'annule pas : il est définitif dans le journal."
    ],
    faq: [
      {
        q: 'Rebut ou ajustement : que choisir ?',
        a: "Le rebut déclare une perte connue (casse, détérioration). L'ajustement vient d'un inventaire qui constate un écart."
      },
      {
        q: "Pourquoi ne puis-je pas rebuter plus que ce qu'il y a ?",
        a: 'Le stock ne peut pas devenir négatif. Vérifiez la quantité et le lieu.'
      },
      {
        q: 'Puis-je annuler un rebut enregistré ?',
        a: "Non, un rebut est définitif dans le journal des mouvements. Avant d'enregistrer, vérifiez donc le lieu, l'article et la quantité."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Rebuts et retours » (menu « Autres mouvements »).' },
    related: [{ label: 'Le journal des mouvements', helpId: 'finance.stock.journal' }],
    keywords: ['casse', 'perte', 'détérioration', 'matière détruite', 'sortie hors chantier']
  },
  {
    id: 'finance.stock.retour',
    kind: 'section',
    title: 'Retourner une marchandise au fournisseur',
    summary:
      "Un retour retire du stock une marchandise rendue au fournisseur et diminue ce qu'on lui doit. Il se rattache à une facture validée.",
    purpose:
      'Utilisez-le pour une marchandise non conforme, abîmée à la livraison ou livrée en trop. Le retour ne peut porter que sur ce qui a été reçu sur la facture, et pas encore retourné.',
    steps: [
      { title: 'Choisir la facture', detail: 'Une facture validée dont des articles ont été reçus.' },
      {
        title: "Choisir l'article",
        detail: "L'écran rappelle ce qui a été reçu, déjà retourné et encore retournable."
      },
      {
        title: 'Choisir la ligne de facture',
        detail:
          "Exigée quand l'article a été reçu sans prix issu de la facture : le prix de cette ligne fixe le montant déduit de la dette du fournisseur."
      },
      {
        title: 'Choisir le lieu et la quantité',
        detail: 'La quantité ne dépasse ni le retournable ni le stock du lieu.'
      },
      {
        title: 'Choisir le motif',
        detail:
          '« Non conforme à la commande », « Endommagé à la livraison », « Livré en trop » ou « Autre » avec précision.'
      },
      { title: 'Enregistrer', detail: 'Date dans les limites de votre agence ; photo facultative.' }
    ],
    consequences: [
      'Le stock du lieu baisse, valorisé au coût moyen du lieu.',
      'Une écriture comptable est passée : le stock est crédité, la dette envers le fournisseur est débitée au prix de la facture, et un éventuel écart de prix va en variation des stocks.',
      "Le retour ne modifie pas le reste à payer affiché sur la facture : rapprochez ensuite l'avoir du fournisseur.",
      "Un retour ne s'annule pas."
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas retourner plus ?',
        a: 'Le retour est plafonné à la quantité reçue sur la facture moins ce qui a déjà été retourné, et au stock présent dans le lieu.'
      },
      {
        q: 'Le fournisseur me doit-il un avoir ?',
        a: "L'écran enregistre le retour et la baisse de la dette. L'avoir lui-même se rapproche ensuite côté fournisseur."
      },
      {
        q: "Pourquoi l'article que je cherche n'est-il pas proposé ?",
        a: "Seuls les articles reçus sur la facture choisie sont proposés, et la liste reste inactive tant que vous n'avez pas choisi la facture. Vérifiez que l'article a bien été reçu sur cette facture."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Rebuts et retours » (menu « Autres mouvements »).' },
    related: [{ label: "Les réceptions et retours d'une facture", helpId: 'finance.stock.facture' }],
    keywords: ['retour fournisseur', 'avoir', 'marchandise non conforme', 'rendre', 'facture']
  },
  {
    id: 'finance.stock.bon',
    kind: 'section',
    title: 'Bon de stock',
    summary:
      "Le bon regroupe les lignes d'une réception, d'une sortie ou d'un inventaire, avec son numéro, ses dates, son PDF et ses pièces jointes.",
    purpose:
      "Le bon est la pièce que l'on signe et que l'on archive : « Bon de réception », « Bon de sortie » ou « Procès-verbal d'inventaire ». Il rappelle le lieu, le chantier, le preneur ou la facture concernés.",
    steps: [
      {
        title: 'Lire le bon',
        detail:
          "Dates, lieu, chantier, preneur ou demandeur, facture, puis les articles et quantités. La valeur totale s'affiche si vous voyez les valeurs."
      },
      { title: 'Télécharger le PDF', detail: "Pour le faire signer ou l'archiver." },
      {
        title: 'Joindre une pièce',
        detail: 'Photo du bon signé, du bon de livraison ou de la marchandise, si vos droits le permettent.'
      },
      { title: 'Voir les mouvements', detail: '« Voir les mouvements de ce bon » ouvre le journal filtré sur ce bon.' }
    ],
    consequences: [
      'Consulter un bon ne modifie rien.',
      'Ajouter une pièce jointe est possible selon le type de bon : « Recevoir » pour une réception, « Sortir » pour une sortie, « Valider les inventaires » pour un procès-verbal.',
      "La date « Enregistré » est l'heure du serveur, non modifiable."
    ],
    faq: [
      {
        q: "Pourquoi un transfert ou un rebut n'a-t-il pas de bon ?",
        a: "Seuls la réception, la sortie et l'inventaire produisent un bon numéroté."
      },
      { q: 'Où retrouver le bon signé ?', a: "Dans les pièces jointes du bon, si quelqu'un l'a photographié." },
      {
        q: "Pourquoi la valeur totale n'apparaît-elle pas sur le bon ?",
        a: "Elle ne s'affiche que si vos droits vous permettent de voir les valeurs."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Lire un bon demande « Consulter le stock ».' },
    related: [{ label: 'Le journal des mouvements', helpId: 'finance.stock.journal' }],
    keywords: ['bon de réception', 'bon de sortie', 'pièce jointe', 'pdf', 'signature']
  },
  {
    id: 'finance.stock.facture',
    kind: 'section',
    title: "Réceptions d'une facture",
    summary:
      'Ce panneau montre, pour une facture fournisseur, ce qui a déjà été reçu en stock et ce qui a été retourné.',
    purpose:
      'Il aide à éviter un doublon avant une nouvelle réception, et à suivre une livraison faite en plusieurs fois.',
    steps: [
      {
        title: 'Lire le montant',
        detail: 'Le montant de la facture, puis la liste des réceptions avec date, lieu et auteur.'
      },
      { title: 'Ouvrir un bon', detail: 'Depuis une réception, ouvrez son bon de réception.' },
      { title: 'Voir les retours', detail: 'La section « Retours au fournisseur » liste ce qui a été rendu.' }
    ],
    consequences: ['Ce panneau est en lecture seule : il ne modifie ni la facture ni le stock.'],
    faq: [
      {
        q: 'Le total reçu doit-il égaler la facture ?',
        a: 'Non. Un écart est possible et il est visible ici ; il ne bloque pas la réception.'
      },
      { q: "Pourquoi aucune réception n'apparaît-elle ?", a: "Cette facture n'a pas encore été reçue en stock." },
      {
        q: "Pourquoi n'y a-t-il pas de section « Retours au fournisseur » ?",
        a: "Elle n'apparaît que si au moins un retour a été enregistré sur cette facture."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Consulter le stock ».' },
    related: [{ label: 'Enregistrer une réception', helpId: 'finance.stock.reception' }],
    keywords: ['facture fournisseur', 'réceptions', 'livraison partielle', 'retours']
  },

  // ---------------------------------------------------------------------------
  // Magasin (téléphone)
  // ---------------------------------------------------------------------------
  {
    id: 'finance.magasin.page',
    kind: 'page',
    title: 'Magasin',
    summary:
      "L'écran Magasin sert au téléphone, à l'entrepôt ou sur le chantier. Il enregistre une réception, une sortie, un transfert ou un comptage en quelques étapes simples, avec la photo.",
    purpose:
      "Il est pensé pour un petit téléphone et un réseau fragile : un geste par écran, de grandes listes à choisir, et aucun montant affiché ni demandé, même à qui voit les valeurs. Vous travaillez toujours sur un lieu, que l'écran se souvient d'une fois à l'autre sur ce navigateur.",
    steps: [
      {
        title: 'Choisir le lieu',
        detail:
          "Au premier passage, choisissez votre magasin ou votre chantier. « Changer » permet d'en prendre un autre."
      },
      {
        title: 'Choisir un geste',
        detail: '« Recevoir », « Sortir », « Compter » ; « Transférer » se trouve sous « Autres gestes ».'
      },
      {
        title: 'Suivre les écrans',
        detail: 'Chaque écran pose une question. « Retour » revient en arrière sans perdre ce que vous avez saisi.'
      },
      {
        title: 'Vérifier puis enregistrer',
        detail: "Le dernier écran résume l'opération. Le bouton d'enregistrement crée le bon."
      },
      {
        title: 'Faire signer et photographier',
        detail: 'Après une sortie ou une réception, téléchargez le bon, faites-le signer et photographiez-le.'
      }
    ],
    consequences: [
      "Les gestes proposés dépendent de vos droits. Sans aucun droit d'écriture, l'écran dit « Aucun geste de stock ne vous est ouvert ».",
      "Rien n'est enregistré tant que vous n'avez pas appuyé sur le bouton d'enregistrement. Quitter une saisie commencée demande confirmation.",
      "Si la connexion coupe, vos saisies sont conservées et « Réessayer » ne crée pas de doublon. Il n'y a pas de mode hors ligne : gardez l'écran ouvert pendant l'envoi.",
      "Les effets sont ceux de l'écran Stock : une sortie impute le chantier, une réception non, un transfert ni l'un ni l'autre."
    ],
    faq: [
      {
        q: 'Pourquoi le message « Le stock ne vous est pas ouvert » ?',
        a: "Votre rôle ne comprend pas la consultation du stock. Demandez à l'administrateur de l'agence le rôle Magasinier, ou un rôle qui la comprend."
      },
      {
        q: 'Pourquoi aucun montant sur cet écran ?',
        a: "C'est voulu : à l'entrepôt on parle de quantités. Les prix et les valeurs se consultent sur l'écran Stock."
      },
      {
        q: 'Mon lieu a disparu de la liste. Pourquoi ?',
        a: "Seuls les lieux actifs sont proposés. Si le lieu mémorisé est désactivé, l'écran vous redemande d'en choisir un."
      },
      {
        q: "Où voir ce que j'ai fait aujourd'hui ?",
        a: "Dans « Aujourd'hui sur ce lieu », sur l'accueil : touchez un bon pour l'ouvrir."
      }
    ],
    permissions: {
      roles: ['Magasinier'],
      feature: 'CONSTRUCTION',
      note: 'Demande « Consulter le stock ». Chaque geste demande son droit : « Recevoir », « Sortir », « Transférer », « Compter ».'
    },
    related: [
      { label: "L'accueil du Magasin", helpId: 'finance.magasin.accueil' },
      { label: 'Recevoir de la marchandise', helpId: 'finance.magasin.recevoir' },
      { label: 'Sortir de la marchandise', helpId: 'finance.magasin.sortir' },
      { label: "L'écran Stock (bureau)", to: '/tenant/:tenantId/finance/stock' }
    ],
    keywords: ['magasinier', 'mobile', 'téléphone', 'entrepôt', 'terrain', 'réception', 'sortie', 'comptage', 'photo']
  },
  {
    id: 'finance.magasin.lieu',
    kind: 'section',
    title: 'Choisir le lieu',
    summary:
      "Choisissez le magasin ou le lieu de chantier sur lequel vous travaillez. L'écran le retient pour la prochaine fois.",
    purpose:
      'Tous les gestes partent de ce lieu ou y arrivent : sortie depuis ce lieu, comptage de ce lieu, transfert depuis ce lieu.',
    steps: [
      { title: 'Chercher', detail: 'Tapez le nom du lieu ou du chantier pour réduire la liste.' },
      { title: 'Choisir', detail: "Touchez le lieu : vous arrivez sur l'accueil." },
      { title: 'En changer', detail: "Sur l'accueil, « Changer » à côté du nom du lieu." }
    ],
    consequences: [
      'Le choix est gardé dans ce navigateur, pour votre agence. Il ne change rien au stock.',
      'Les pastilles préviennent : « Comptage en cours », « Comptage clos » (écarts à justifier) et « Chantier clos » (le lieu ne reçoit plus de marchandise).'
    ],
    faq: [
      {
        q: 'Pourquoi un lieu manque-t-il ?',
        a: "Il est désactivé, ou ne fait pas partie de ceux de votre agence. L'administrateur gère les lieux dans « Articles et lieux »."
      },
      { q: 'Faut-il rechoisir à chaque fois ?', a: 'Non, le lieu est mémorisé sur ce navigateur.' },
      {
        q: "Pourquoi le choix du lieu m'est-il redemandé ?",
        a: "Le lieu mémorisé n'est plus disponible ou a été désactivé. Choisissez-en un autre dans la liste."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Consulter le stock ».' },
    related: [{ label: 'Articles et lieux', to: '/tenant/:tenantId/finance/stock/parametrage' }],
    keywords: ['lieu', 'magasin', 'chantier', 'changer de lieu']
  },
  {
    id: 'finance.magasin.accueil',
    kind: 'section',
    title: 'Accueil du Magasin',
    summary:
      "L'accueil propose les gestes que vos droits permettent, puis liste ce qui a été enregistré aujourd'hui sur le lieu.",
    purpose:
      'Gros boutons pour le téléphone : « Recevoir » (marchandise livrée), « Sortir » (remettre à un chantier), « Compter » (inventaire du lieu), et sous « Autres gestes » « Transférer vers un autre lieu ».',
    steps: [
      { title: 'Choisir un geste', detail: 'Touchez le bouton correspondant.' },
      {
        title: 'Relire le jour',
        detail:
          "« Aujourd'hui sur ce lieu » montre jusqu'à 20 opérations du jour, regroupées par bon, avec l'heure, la nature et le nombre d'articles."
      },
      { title: 'Ouvrir un bon', detail: "Touchez une ligne qui porte un numéro de bon : il s'ouvre en plein écran." }
    ],
    consequences: [
      "Une ligne sans bon (transfert, rebut, retour) est affichée en grisé : elle ne s'ouvre pas.",
      "Aucun montant n'est affiché sur cet écran."
    ],
    faq: [
      { q: 'Je ne vois pas « Transférer ».', a: 'Il est sous « Autres gestes » et demande le droit « Transférer ».' },
      { q: 'Je ne vois pas « Compter ».', a: 'Il demande le droit « Compter ».' },
      {
        q: "Pourquoi n'ai-je aucun bouton sur l'accueil ?",
        a: "Si « Aucun geste de stock ne vous est ouvert » s'affiche, votre rôle permet de consulter le stock mais pas de l'enregistrer. Demandez à l'administrateur de l'agence de vous ouvrir les droits nécessaires."
      }
    ],
    permissions: { roles: ['Magasinier'], feature: 'CONSTRUCTION', note: 'Chaque bouton demande son droit.' },
    related: [{ label: 'Le bon', helpId: 'finance.magasin.bon' }],
    keywords: ['accueil', 'gestes', "aujourd'hui", 'opérations du jour']
  },
  {
    id: 'finance.magasin.recevoir',
    kind: 'section',
    title: 'Recevoir de la marchandise',
    summary:
      'Le geste « Recevoir » enregistre une livraison : facture, lieu, articles reçus, photos, puis un bon de réception.',
    purpose:
      'Sur le terrain, il remplace le formulaire de bureau. Il ne demande aucun prix : seul compte ce qui est arrivé. La réception ne fait monter aucun coût de chantier.',
    steps: [
      {
        title: 'Quelle facture ?',
        detail: 'Choisissez parmi les factures validées. « Chercher dans toutes les factures » élargit la recherche.'
      },
      {
        title: 'Déjà reçue ?',
        detail:
          "Si la facture a déjà été reçue, l'écran liste les réceptions faites. Continuez seulement si c'est une autre livraison."
      },
      {
        title: 'Où arrive la marchandise ?',
        detail: "Le lieu de réception. Celui du chantier de la facture est proposé d'abord."
      },
      {
        title: "Qu'avez-vous reçu ?",
        detail: 'Ajoutez chaque article avec sa quantité, et si vous la connaissez la ligne de la facture.'
      },
      {
        title: 'Photos',
        detail: 'Facultatif : bon de livraison et marchandise. Touchez « Passer » pour ne pas en prendre.'
      },
      { title: 'Vérifiez', detail: 'Relisez, changez la date si besoin, puis « Enregistrer la réception ».' }
    ],
    consequences: [
      'Le stock du lieu augmente. Aucune écriture comptable, aucune imputation de chantier.',
      "Le prix est celui de la facture, sinon le coût moyen du lieu, sinon le dernier prix reçu. Rien n'est à saisir.",
      'Un bon de réception est créé avec son numéro. Vous pouvez en télécharger le PDF et photographier le bon signé.',
      "Après l'enregistrement, des avertissements peuvent apparaître : facture déjà reçue, réceptions au-dessus du montant de la facture, articles sans prix connu. Un responsable vérifie ensuite."
    ],
    faq: [
      {
        q: "Aucune facture ne s'affiche.",
        a: 'Seules les factures validées par la comptabilité sont proposées. Utilisez « Chercher dans toutes les factures » ou demandez la validation.'
      },
      { q: 'La connexion a été perdue.', a: 'Vos saisies sont conservées. « Réessayer » ne crée pas de doublon.' },
      {
        q: 'Une photo a échoué.',
        a: "L'opération est enregistrée ; l'écran signale les photos non envoyées pour que vous les reprenniez."
      }
    ],
    permissions: { roles: ['Magasinier'], feature: 'CONSTRUCTION', note: 'Demande « Recevoir ».' },
    related: [{ label: 'La réception sur ordinateur', helpId: 'finance.stock.reception' }],
    keywords: ['réception', 'livraison', 'bon de livraison', 'facture', 'photo']
  },
  {
    id: 'finance.magasin.sortir',
    kind: 'section',
    title: 'Sortir de la marchandise',
    summary:
      'Le geste « Sortir » remet de la marchandise à un preneur pour un chantier : chantier, preneur, articles, photo, puis un bon à faire signer.',
    purpose:
      "La sortie part du lieu courant. C'est elle qui impute le chantier : le coût du matériau entre alors dans le coût du chantier.",
    steps: [
      { title: 'Pour quel chantier ?', detail: 'Seuls les chantiers ouverts sont proposés.' },
      {
        title: 'Qui emporte la marchandise ?',
        detail:
          "Un preneur du carnet. « Ajouter un preneur » si vous avez ce droit ; « Saisir un nom sans l'ajouter au carnet » sauf si votre agence impose le carnet."
      },
      {
        title: 'Quels articles ?',
        detail:
          'Pour chaque article : la quantité (le stock disponible est rappelé) et le poste du chantier, obligatoire.'
      },
      { title: 'Photo', detail: 'Facultatif : la marchandise remise.' },
      { title: 'Vérifiez', detail: 'Relisez, changez la date si besoin, puis « Enregistrer la sortie ».' },
      { title: 'Faire signer', detail: 'Téléchargez le bon, faites-le signer par le preneur, puis photographiez-le.' }
    ],
    consequences: [
      "Le stock du lieu baisse ; une quantité au-dessus du disponible est refusée, et l'article concerné est signalé.",
      'Le coût est calculé au coût moyen du lieu et imputé au chantier sur le poste choisi. Une écriture comptable est passée pour chaque ligne valorisée.',
      'Le nom du preneur est imprimé sur le bon.',
      "Sur un lieu en comptage, le stock disponible n'est pas montré ; c'est le serveur qui refuse un dépassement."
    ],
    faq: [
      { q: "Aucun chantier n'apparaît.", a: "Aucun chantier ouvert n'est disponible, ou les chantiers sont clos." },
      {
        q: 'Aucun preneur dans la liste.',
        a: "Le carnet est vide. Demandez à une personne habilitée de l'alimenter depuis l'écran « Preneurs », ou ajoutez-le vous-même avec le droit voulu."
      },
      {
        q: 'Le poste du chantier est exigé : pourquoi ?',
        a: "Pour savoir sur quelle dépense du chantier imputer la sortie. Il n'est jamais deviné."
      }
    ],
    permissions: { roles: ['Magasinier'], feature: 'CONSTRUCTION', note: 'Demande « Sortir ».' },
    related: [
      { label: 'La sortie sur ordinateur', helpId: 'finance.stock.sortie' },
      { label: 'Le carnet des preneurs', helpId: 'finance.preneurs.page' }
    ],
    keywords: ['sortie', 'bon de sortie', 'preneur', 'chantier', 'imputation']
  },
  {
    id: 'finance.magasin.transferer',
    kind: 'section',
    title: 'Transférer vers un autre lieu',
    summary:
      "Le geste « Transférer » déplace de la marchandise du lieu courant vers un autre lieu : lieu d'arrivée, article, quantité, demandeur, motif.",
    purpose:
      'Utilisez-le pour approvisionner un chantier depuis le magasin, rapporter un reste au magasin, évacuer un chantier ou rééquilibrer deux lieux. Un transfert déplace du stock sans le consommer.',
    steps: [
      { title: 'Vers quel lieu ?', detail: 'Un lieu de chantier clos ne reçoit plus de marchandise ; il est signalé.' },
      { title: 'Quel article ?', detail: 'Un article par transfert.' },
      { title: 'Quelle quantité ?', detail: "Le stock disponible du lieu d'origine est rappelé." },
      {
        title: 'Qui demande ou emporte ?',
        detail: "Un preneur du carnet, ou un nom libre si votre agence l'autorise."
      },
      {
        title: 'Pourquoi ?',
        detail:
          "Motif obligatoire : « Approvisionnement d'un chantier », « Retour au magasin », « Évacuation d'un chantier », « Rééquilibrage entre lieux » ou « Autre » avec précision."
      },
      { title: 'Vérifier et enregistrer', detail: 'Photo facultative, date, puis « Enregistrer le transfert ».' }
    ],
    consequences: [
      "Le stock baisse dans le lieu d'origine et monte dans le lieu d'arrivée de la même valeur : le coût moyen du lieu d'origine est repris.",
      'Aucune imputation de chantier ni écriture comptable : seule la sortie impute.',
      "Le transfert apparaît sur deux lignes du journal et n'a pas de bon numéroté."
    ],
    faq: [
      {
        q: 'Je veux transférer plusieurs articles.',
        a: 'Un transfert porte un seul article : recommencez avec « Nouveau transfert ».'
      },
      {
        q: "Le chantier d'arrivée est clos.",
        a: 'Il ne reçoit plus de marchandise. En revanche, on peut encore évacuer son reste vers un autre lieu.'
      },
      {
        q: "Pourquoi le lieu où je me trouve n'est-il pas proposé comme lieu d'arrivée ?",
        a: "Seuls les autres lieux actifs sont proposés. S'il n'y en a aucun, l'écran indique « Aucun autre lieu actif. »"
      }
    ],
    permissions: { roles: ['Magasinier'], feature: 'CONSTRUCTION', note: 'Demande « Transférer ».' },
    related: [{ label: 'Le journal des mouvements', helpId: 'finance.stock.journal' }],
    keywords: ['transfert', 'déplacer', 'approvisionner un chantier', 'retour au magasin', 'évacuation']
  },
  {
    id: 'finance.magasin.compter',
    kind: 'section',
    title: 'Compter le stock',
    summary:
      'Le geste « Compter » ouvre un inventaire du lieu, saisit les quantités trouvées, clôt le comptage puis justifie les écarts.',
    purpose:
      "Le comptage est à l'aveugle : tant qu'il est ouvert, les quantités attendues ne s'affichent pas, pour que chacun compte sans être influencé.",
    steps: [
      { title: "Commencer l'inventaire", detail: "Disponible si aucun inventaire n'est en cours sur le lieu." },
      {
        title: 'Compter chaque article',
        detail: "Choisissez l'article dans « À compter », saisissez la quantité trouvée, ou « Rien trouvé (0) »."
      },
      { title: 'Recompter si besoin', detail: 'Une nouvelle quantité remplace la précédente.' },
      {
        title: 'Clore le comptage',
        detail: "Après la clôture, les quantités ne se modifient plus et les écarts s'affichent."
      },
      {
        title: 'Justifier les écarts',
        detail: 'Pour chaque écart, « Justifier » et choisissez un motif. Une photo peut être ajoutée.'
      }
    ],
    consequences: [
      "Les articles en stock que personne n'a comptés apparaissent « non comptés » : une personne habilitée devra les écarter ou les faire recompter.",
      "Le stock ne change pas à la clôture. Il change quand une personne habilitée valide l'inventaire : les écarts deviennent alors des ajustements.",
      'Pendant le comptage, la quantité du lieu est masquée pour qui ne valide pas les inventaires.'
    ],
    faq: [
      {
        q: "Où valider l'inventaire ?",
        a: "Une personne qui a le droit « Valider les inventaires » le fait depuis l'écran Inventaire."
      },
      {
        q: 'Pourquoi ne vois-je pas le stock attendu ?',
        a: "C'est le principe du comptage à l'aveugle, jusqu'à la clôture."
      },
      {
        q: 'Pourquoi « Clore le comptage » est-il grisé ?',
        a: "Le bouton reste grisé tant qu'aucun article n'a été compté. Comptez au moins un article, puis réessayez."
      }
    ],
    permissions: {
      roles: ['Magasinier', 'Chef de chantier'],
      feature: 'CONSTRUCTION',
      note: 'Compter demande « Compter ». Valider ou abandonner demande « Valider les inventaires ».'
    },
    related: [{ label: "L'écran Inventaire", to: '/tenant/:tenantId/finance/stock/inventaire' }],
    keywords: ['inventaire', 'comptage', 'écart', "à l'aveugle", 'compter']
  },
  {
    id: 'finance.magasin.bon',
    kind: 'section',
    title: 'Bon (Magasin)',
    summary:
      "Le bon s'ouvre en plein écran : nature et numéro, dates, lieu, chantier, preneur, facture et articles, avec le PDF et les pièces jointes.",
    purpose:
      "C'est la pièce à faire signer ou à retrouver. L'écran Magasin n'y affiche aucune valeur, seulement les quantités.",
    steps: [
      { title: 'Lire le bon', detail: 'Les articles sont listés avec leur quantité et leur unité.' },
      { title: 'Télécharger le PDF', detail: "Pour le faire signer ou l'envoyer." },
      { title: 'Joindre une pièce', detail: 'Photo du bon signé, du bon de livraison ou de la marchandise.' }
    ],
    consequences: [
      'Ajouter une pièce demande le droit lié au bon : « Recevoir » pour une réception, « Sortir » pour une sortie, « Valider les inventaires » pour un procès-verbal.',
      "L'heure d'enregistrement est celle du serveur."
    ],
    faq: [
      { q: 'Ce bon est introuvable.', a: "Il n'existe plus ou n'appartient pas à votre agence. Revenez à l'accueil." },
      {
        q: "Pourquoi ce bon n'affiche-t-il aucun montant ?",
        a: "L'écran Magasin n'affiche jamais de valeur, seulement les quantités. Les valeurs se lisent sur ordinateur, dans le bon de stock, si vos droits le permettent."
      },
      {
        q: 'Comment faire signer ce bon ?',
        a: 'Touchez « Télécharger le bon (PDF) » et faites-le signer. Si vos droits le permettent, joignez ensuite une photo du bon signé dans les pièces jointes.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Consulter le stock ».' },
    related: [{ label: 'Le bon sur ordinateur', helpId: 'finance.stock.bon' }],
    keywords: ['bon', 'pdf', 'pièce jointe', 'signé']
  },

  // ---------------------------------------------------------------------------
  // Preneurs
  // ---------------------------------------------------------------------------
  {
    id: 'finance.preneurs.page',
    kind: 'page',
    title: 'Preneurs',
    summary:
      "Le carnet des preneurs liste les personnes qui emportent la marchandise : chefs d'équipe, tâcherons. Les sorties et les transferts sont enregistrés à leur nom.",
    purpose:
      "Savoir qui a pris quoi est la base du contrôle du stock. Le carnet ne garde que le nom, l'équipe ou l'entreprise et, si vous le souhaitez, un téléphone que vous pouvez effacer. Un preneur ne se supprime pas : il se désactive.",
    steps: [
      {
        title: 'Ajouter un preneur',
        detail:
          'Bouton « Ajouter un preneur » : nom, équipe ou entreprise, téléphone facultatif, lien facultatif avec un employé ou un tâcheron.'
      },
      {
        title: 'Chercher',
        detail: 'Tapez un nom, une équipe, un téléphone ou une personne liée. Filtre « Statut » : Actif ou Désactivé.'
      },
      { title: 'Corriger', detail: "« Corriger » modifie le nom, l'équipe, le téléphone ou le lien." },
      {
        title: 'Désactiver ou réactiver',
        detail: '« Désactiver » retire le preneur des choix de sortie ; « Réactiver » le remet.'
      },
      {
        title: 'Effacer le téléphone',
        detail: '« Effacer le téléphone » retire le numéro, le preneur reste dans le carnet.'
      }
    ],
    consequences: [
      'Le nom du preneur est imprimé sur les bons de sortie. Informez les personnes concernées.',
      "Désactiver un preneur l'empêche d'être choisi pour une nouvelle sortie ; ses sorties passées restent à son nom.",
      "Un preneur actif ne peut pas porter le même nom qu'un autre de la même équipe.",
      'Votre agence peut exiger un preneur du carnet pour chaque sortie et chaque transfert.'
    ],
    faq: [
      {
        q: 'Peut-on supprimer un preneur ?',
        a: "Non : il se désactive, pour que l'historique des sorties garde son nom."
      },
      {
        q: 'Pourquoi ne vois-je pas la colonne « Téléphone » ?',
        a: 'Elle est réservée aux personnes qui tiennent le carnet : le serveur ne renvoie pas les numéros aux autres.'
      },
      { q: "Je ne vois aucun bouton d'action.", a: 'Il faut le droit « Tenir le carnet des preneurs ».' },
      {
        q: 'À quoi sert le lien avec un employé ou un tâcheron ?',
        a: "À relier le preneur à une personne déjà connue de l'agence. C'est facultatif."
      }
    ],
    permissions: {
      roles: ['Magasinier'],
      feature: 'CONSTRUCTION',
      note: "Lire le carnet demande « Consulter le stock » ; l'alimenter demande « Tenir le carnet des preneurs »."
    },
    related: [
      { label: 'Le tableau du carnet', helpId: 'finance.preneurs.tableau' },
      { label: 'Enregistrer une sortie', helpId: 'finance.stock.sortie' }
    ],
    keywords: ['preneur', "chef d'équipe", 'tâcheron', 'carnet', 'qui emporte', 'responsable de sortie']
  },
  {
    id: 'finance.preneurs.tableau',
    kind: 'table',
    title: 'Carnet des preneurs',
    summary:
      'Chaque ligne est un preneur, actif ou désactivé. Les boutons de la ligne permettent de le corriger, le désactiver ou effacer son téléphone.',
    howToRead: {
      columns: [
        { key: 'nom', label: 'Nom', description: "Le nom complet du preneur, tel qu'il est imprimé sur les bons." },
        {
          key: 'equipe',
          label: 'Équipe ou entreprise',
          description: 'Son équipe ou son entreprise, utile pour distinguer deux personnes de même nom.'
        },
        {
          key: 'telephone',
          label: 'Téléphone',
          description: 'Son numéro, visible seulement pour qui tient le carnet.'
        },
        { key: 'lien', label: 'Lié à', description: "L'employé ou le tâcheron auquel il est relié, s'il y en a un." },
        {
          key: 'statut',
          label: 'Statut',
          description: "Actif : il peut être choisi pour une sortie. Désactivé : il n'est plus proposé."
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            '« Corriger », « Désactiver » ou « Réactiver », et « Effacer le téléphone » quand un numéro existe.'
        }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Actif',
          description: 'Le preneur peut être choisi pour une sortie ou un transfert.'
        },
        {
          value: 'INACTIVE',
          label: 'Désactivé',
          description: "Le preneur n'est plus proposé. Ses sorties passées restent à son nom."
        }
      ],
      notes: [
        'Sur téléphone, le tableau devient une liste de cartes ; le premier geste est un bouton, les autres sont dans un menu.',
        'Le carnet entier est chargé : la recherche et le filtre travaillent sur toute la liste.'
      ]
    },
    steps: [
      { title: 'Retrouver un preneur', detail: 'Tapez une partie de son nom ou de son équipe.' },
      { title: 'Voir les désactivés', detail: 'Filtre « Statut » puis « Désactivé ».' }
    ],
    consequences: [
      'Désactiver et effacer le téléphone demandent une confirmation. Aucune de ces actions ne supprime le preneur.',
      "Lors d'un ajout refusé parce que le nom existe déjà, « Voir ce preneur » réduit la liste à la personne déjà présente."
    ],
    faq: [
      {
        q: 'Pourquoi « Effacer le téléphone » manque-t-il ?',
        a: "Il n'apparaît que pour un preneur dont le numéro est renseigné."
      },
      { q: 'Peut-on exporter le carnet ?', a: "Oui, par le bouton d'export du tableau." },
      { q: 'Un preneur désactivé revient-il ?', a: 'Oui : « Réactiver » le remet dans les choix.' }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Colonnes « Téléphone » et « Actions » réservées au droit « Tenir le carnet des preneurs ».'
    },
    related: [{ label: 'Ajouter ou corriger un preneur', helpId: 'finance.preneurs.formulaire' }],
    keywords: ['preneur', 'désactiver', 'téléphone', 'équipe']
  },
  {
    id: 'finance.preneurs.formulaire',
    kind: 'section',
    title: 'Ajouter ou corriger un preneur',
    summary:
      'Ce formulaire enregistre un nouveau preneur, ou corrige un preneur existant. Ne saisissez que ce qui sert à le reconnaître.',
    purpose:
      "Le nom est imprimé sur les bons de sortie. L'équipe ou l'entreprise aide à distinguer deux personnes qui portent le même nom.",
    steps: [
      { title: 'Nom complet', detail: 'Obligatoire, de 2 à 120 caractères.' },
      { title: 'Équipe ou entreprise', detail: 'Facultatif.' },
      { title: 'Téléphone', detail: 'Facultatif, et effaçable à tout moment depuis le carnet.' },
      {
        title: 'Lier à une personne',
        detail: 'Facultatif : choisissez un employé ou un tâcheron déjà enregistré, si la liste est proposée.'
      },
      { title: 'Enregistrer', detail: '« Ajouter le preneur » ou « Enregistrer la correction ».' }
    ],
    consequences: [
      "Si un preneur actif porte déjà ce nom dans la même équipe, l'enregistrement est refusé et vous pouvez voir ou choisir la personne existante.",
      'Une correction ne change que les champs modifiés. Un champ vidé est effacé.',
      'Corriger un nom ne réécrit pas les anciens bons : le journal garde le nom du jour du mouvement et rappelle le nom actuel.'
    ],
    faq: [
      {
        q: "Pourquoi n'y a-t-il pas de liste d'employés ?",
        a: "La liste n'est proposée qu'aux personnes qui tiennent le carnet, et seulement s'il existe des employés ou des tâcherons actifs."
      },
      { q: 'Dois-je saisir un téléphone ?', a: "Non, c'est facultatif." },
      {
        q: "Que faire si le nom est refusé à l'enregistrement ?",
        a: "Un preneur actif porte déjà ce nom dans la même équipe. Utilisez « Voir ce preneur » pour retrouver la personne existante, ou distinguez-les par l'équipe ou l'entreprise."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Tenir le carnet des preneurs ».' },
    related: [{ label: 'Le carnet des preneurs', helpId: 'finance.preneurs.page' }],
    keywords: ['nouveau preneur', 'corriger un preneur', 'nom', 'équipe']
  },

  // ---------------------------------------------------------------------------
  // Articles et lieux
  // ---------------------------------------------------------------------------
  {
    id: 'finance.articles-lieux.page',
    kind: 'page',
    title: 'Articles et lieux',
    summary:
      'Le paramétrage du stock tient les articles (ciment, fer, sable…), les lieux de stockage (magasins et lieux de chantier) et la méthode de valorisation.',
    purpose:
      "C'est le référentiel sur lequel reposent les réceptions, les sorties et les inventaires. Ce qui est enregistré ici ne se supprime jamais : un article ou un lieu se désactive, et garde alors son stock et son historique.",
    steps: [
      {
        title: 'Onglet « Articles »',
        detail:
          'Enregistrez et corrigez les articles : référence, désignation, unité, famille, poste proposé à la sortie.'
      },
      { title: 'Onglet « Lieux de stockage »', detail: 'Créez les magasins et les lieux de chantier.' },
      {
        title: 'Onglet « Méthode de valorisation »',
        detail: 'Lisez la méthode en vigueur et enregistrez la décision, avec son motif.'
      },
      {
        title: 'Désactiver',
        detail:
          '« Désactiver » retire un article ou un lieu des choix de saisie, sans effacer son historique ; « Réactiver » le remet.'
      }
    ],
    consequences: [
      "Aucune suppression n'existe, ni pour un article ni pour un lieu.",
      "Certains champs sont définitifs : la référence d'un article, la nature d'un lieu et son chantier ne se corrigent plus après l'enregistrement.",
      "Changer l'unité d'un article ne convertit aucune quantité déjà enregistrée.",
      "Sans le droit de paramétrer le module financier, les écrans se lisent mais aucun bouton d'écriture n'apparaît."
    ],
    faq: [
      {
        q: "Comment corriger la référence d'un article ?",
        a: "Elle ne se corrige pas : c'est elle qu'on lit sur les bons déjà imprimés. Désactivez l'article et créez-en un autre si nécessaire."
      },
      {
        q: 'Puis-je supprimer un article inutilisé ?',
        a: "Non. Désactivez-le : il cesse d'être proposé et son historique reste."
      },
      {
        q: 'Un chantier peut-il avoir deux lieux ?',
        a: 'Non, un seul : deux lieux sépareraient son stock en deux soldes.'
      },
      { q: 'Je ne vois pas « Nouvel article ».', a: 'Il faut le droit « Paramétrer le module financier ».' }
    ],
    permissions: {
      roles: ['Administrateur'],
      feature: 'CONSTRUCTION',
      note: 'Lire demande « Consulter le stock » ; créer, corriger, désactiver et décider de la méthode demandent « Paramétrer le module financier ».'
    },
    related: [
      { label: 'Les articles', helpId: 'finance.articles-lieux.articles' },
      { label: 'Les lieux de stockage', helpId: 'finance.articles-lieux.lieux' },
      { label: 'La méthode de valorisation', helpId: 'finance.articles-lieux.valorisation' }
    ],
    keywords: ['référentiel', 'article', 'lieu', 'magasin', 'paramétrage', 'unité', 'valorisation']
  },
  {
    id: 'finance.articles-lieux.articles',
    kind: 'section',
    title: 'Articles',
    summary: "La liste des articles que l'agence stocke. Chaque article a une référence, une désignation et une unité.",
    purpose:
      "Le « poste proposé à la sortie » d'un article n'est qu'une suggestion : il sera présélectionné lors d'une sortie, et restera modifiable. C'est la sortie qui décide du poste, jamais l'article. L'unité est du texte libre : sac, tonne, barre, m³.",
    steps: [
      {
        title: 'Créer un article',
        detail:
          '« Nouvel article » : référence, désignation, unité, famille et poste proposé (ces deux derniers facultatifs).'
      },
      {
        title: 'Chercher et filtrer',
        detail: 'Recherche libre, filtres « Statut », « Unité », « Famille » et « Poste proposé à la sortie ».'
      },
      { title: 'Corriger', detail: "« Corriger » modifie la désignation, l'unité, la famille et le poste proposé." },
      { title: 'Désactiver', detail: '« Désactiver » puis « Confirmer la désactivation ».' }
    ],
    consequences: [
      "Désactiver n'est pas supprimer : l'article garde son stock et son historique, il cesse seulement d'être proposé. Un article désactivé ne peut plus être reçu.",
      "La référence ne se corrige plus une fois l'article enregistré.",
      "Changer l'unité demande une confirmation et ne reconvertit aucune quantité."
    ],
    faq: [
      {
        q: 'Faut-il toujours un poste proposé ?',
        a: 'Non, laisser vide est un cas normal : on choisira le poste à chaque sortie.'
      },
      {
        q: 'Quelle unité choisir ?',
        a: "Celle dans laquelle vous comptez : toutes les quantités de l'article seront comptées dans cette unité."
      },
      {
        q: 'Comment retrouver un article désactivé ?',
        a: 'Utilisez le filtre « Statut » et choisissez « Inactif ». Le bouton « Réactiver » le remet à disposition.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Écriture : « Paramétrer le module financier ».' },
    related: [{ label: 'Le tableau des articles', helpId: 'finance.articles-lieux.articles.tableau' }],
    keywords: ['article', 'référence', 'unité', 'famille', 'poste proposé']
  },
  {
    id: 'finance.articles-lieux.articles.tableau',
    kind: 'table',
    title: 'Tableau des articles',
    summary:
      'Chaque ligne est un article du stock, avec son unité, sa famille et le poste de dépense proposé à la sortie.',
    howToRead: {
      columns: [
        {
          key: 'reference',
          label: 'Référence',
          description: "Le code de l'article, imprimé sur les bons. Il ne change plus après l'enregistrement."
        },
        {
          key: 'designation',
          label: 'Désignation',
          description: "Le nom courant de l'article, par exemple « Ciment CPJ 42,5 »."
        },
        { key: 'unite', label: 'Unité', description: "L'unité de comptage : sac, tonne, barre, m³…" },
        {
          key: 'famille',
          label: 'Famille',
          description: 'Un regroupement libre, par exemple « Gros œuvre ». « Non renseignée » si vide.'
        },
        {
          key: 'poste',
          label: 'Poste proposé à la sortie',
          description:
            "Le poste de dépense présélectionné lors d'une sortie. Une simple proposition, modifiable à chaque sortie."
        },
        {
          key: 'statut',
          label: 'Statut',
          description: "Actif : proposé à la saisie. Inactif : n'est plus proposé, historique conservé."
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            '« Corriger » et « Désactiver » ou « Réactiver ». Colonne visible seulement si vous pouvez paramétrer.'
        }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Actif',
          description: "L'article est proposé dans les réceptions, sorties et transferts."
        },
        {
          value: 'INACTIVE',
          label: 'Inactif',
          description: "L'article n'est plus proposé ; son stock et son historique sont conservés."
        }
      ],
      notes: [
        'Sur téléphone, le tableau devient des cartes : « Corriger » est le bouton principal et « Désactiver » est dans le menu.'
      ]
    },
    steps: [{ title: 'Retrouver un article', detail: 'Recherchez par référence, désignation ou famille.' }],
    consequences: ['Le tableau se lit sans rien modifier. Les changements passent par les formulaires.'],
    faq: [
      { q: 'Où est le bouton supprimer ?', a: "Il n'existe pas : aucun article ne se supprime. Désactivez-le." },
      { q: 'La liste est longue.', a: 'Elle est paginée ; utilisez la recherche et les filtres.' },
      {
        q: 'Puis-je remettre un article désactivé en service ?',
        a: "Oui, avec « Réactiver » dans la colonne « Actions », si vous pouvez paramétrer. L'article est de nouveau proposé à la saisie."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Colonne « Actions » : « Paramétrer le module financier ».' },
    related: [{ label: 'Nouvel article, correction', helpId: 'finance.articles-lieux.article-formulaire' }],
    keywords: ['liste des articles', 'référence', 'désignation', 'inactif']
  },
  {
    id: 'finance.articles-lieux.article-formulaire',
    kind: 'section',
    title: 'Créer ou corriger un article',
    summary:
      'Ce formulaire enregistre un nouvel article ou corrige un article existant. La référence, elle, ne se corrige plus.',
    purpose:
      "Choisissez bien la référence et l'unité à la création : l'une est lue sur les bons, l'autre fixe l'unité de toutes les quantités.",
    steps: [
      { title: 'Référence', detail: 'Obligatoire à la création, par exemple « CIM-42 ». Elle ne se corrigera plus.' },
      { title: 'Désignation', detail: "Le nom courant de l'article." },
      { title: 'Unité', detail: 'Texte libre : sac, tonne, barre, m³.' },
      { title: 'Famille', detail: 'Facultatif. À la correction, vider le champ efface la famille.' },
      { title: 'Poste proposé à la sortie', detail: 'Facultatif. Simple proposition, modifiable à chaque sortie.' },
      { title: 'Enregistrer', detail: "« Enregistrer l'article » ou « Enregistrer la correction »." }
    ],
    consequences: [
      "Si vous changez l'unité d'un article, un avertissement apparaît et une case « J'ai compris » est obligatoire : les quantités déjà enregistrées ne sont pas reconverties et changeraient de sens. Ne le faites que pour réparer une erreur de saisie.",
      'La référence est affichée en lecture seule pendant la correction.',
      'Un poste de dépense désactivé est refusé.'
    ],
    faq: [
      {
        q: "Je me suis trompé d'unité.",
        a: 'Vous pouvez la corriger, mais vérifiez ensuite par un inventaire, car les quantités passées ne sont pas converties.'
      },
      {
        q: 'Je me suis trompé de référence.',
        a: "Elle ne se corrige pas. Désactivez l'article et créez-en un nouveau."
      },
      {
        q: "Pourquoi l'enregistrement de l'article est-il refusé ?",
        a: "La référence, la désignation et l'unité sont obligatoires à la création. Remplissez ces trois champs."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Paramétrer le module financier ».' },
    related: [{ label: 'Articles', helpId: 'finance.articles-lieux.articles' }],
    keywords: ['nouvel article', 'corriger article', 'unité', 'référence']
  },
  {
    id: 'finance.articles-lieux.lieux',
    kind: 'section',
    title: 'Lieux de stockage',
    summary:
      "Les lieux de stockage sont les endroits où le stock se trouve : magasins de l'agence et lieux de chantier.",
    purpose:
      "Un magasin est un lieu de l'agence. Un lieu de chantier est rattaché à un chantier, et un chantier n'en a qu'un seul : deux lieux partageraient son stock en deux soldes dont aucun ne dirait la vérité.",
    steps: [
      {
        title: 'Créer un lieu',
        detail: '« Nouveau lieu de stockage » : nature, libellé et, pour un lieu de chantier, le chantier.'
      },
      { title: 'Chercher et filtrer', detail: 'Recherche libre, filtres « Nature » et « Statut ».' },
      { title: 'Corriger le libellé', detail: '« Corriger le libellé » : seul le libellé change.' },
      { title: 'Désactiver', detail: '« Désactiver » puis « Confirmer la désactivation ».' }
    ],
    consequences: [
      "La nature et le chantier d'un lieu ne se corrigent plus : un magasin qui deviendrait le lieu d'un chantier emporterait un stock qui n'y a jamais été.",
      "Désactiver n'est pas supprimer : le lieu garde son stock et son historique, il cesse d'être proposé.",
      "Un lieu qui porte un inventaire en cours ou clos ne peut pas être désactivé : terminez ou abandonnez l'inventaire d'abord."
    ],
    faq: [
      { q: 'Puis-je changer un magasin en lieu de chantier ?', a: 'Non. Créez un nouveau lieu de la bonne nature.' },
      {
        q: "Pourquoi mon chantier n'est-il pas proposé ?",
        a: "Il a peut-être déjà un lieu de stockage, ou aucun chantier n'est disponible."
      },
      {
        q: 'Puis-je supprimer un lieu ?',
        a: 'Non, un lieu ne se supprime pas. Désactivez-le : il garde son stock et son historique.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Écriture : « Paramétrer le module financier ».' },
    related: [{ label: 'Le tableau des lieux', helpId: 'finance.articles-lieux.lieux.tableau' }],
    keywords: ['magasin', 'lieu de chantier', 'entrepôt', 'dépôt']
  },
  {
    id: 'finance.articles-lieux.lieux.tableau',
    kind: 'table',
    title: 'Tableau des lieux de stockage',
    summary:
      "Chaque ligne est un lieu : magasin ou lieu de chantier, avec son statut et l'éventuel inventaire en cours.",
    howToRead: {
      columns: [
        { key: 'libelle', label: 'Libellé', description: "Le nom du lieu, par exemple « Magasin central d'Angré »." },
        { key: 'nature', label: 'Nature', description: '« Magasin » ou « Lieu de chantier ».' },
        {
          key: 'chantier',
          label: 'Chantier',
          description: 'Le chantier auquel est rattaché un lieu de chantier. Un tiret pour un magasin.'
        },
        {
          key: 'statut',
          label: 'Statut',
          description:
            'Actif ou Inactif, avec une pastille « Comptage en cours » ou « Comptage clos » si un inventaire porte sur le lieu.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Corriger le libellé » et « Désactiver » ou « Réactiver », si vous pouvez paramétrer.'
        }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'Le lieu est proposé pour recevoir, sortir et compter.' },
        {
          value: 'INACTIVE',
          label: 'Inactif',
          description: "Le lieu n'est plus proposé ; son stock et son historique restent."
        }
      ],
      notes: ["Les pastilles de comptage sont celles de l'inventaire : « Comptage en cours » ou « Comptage clos »."]
    },
    steps: [{ title: 'Voir les lieux de chantier', detail: 'Filtre « Nature » puis « Lieu de chantier ».' }],
    consequences: ['Lecture seule : les modifications passent par les formulaires et demandent confirmation.'],
    faq: [
      {
        q: 'Pourquoi « Désactiver » est-il refusé ?',
        a: "Le lieu porte un inventaire en cours : terminez-le ou abandonnez-le d'abord. Le message du serveur le dit."
      },
      { q: 'Un lieu désactivé garde-t-il son stock ?', a: 'Oui, et son historique aussi.' },
      {
        q: 'Comment ne voir que les lieux de chantier ?',
        a: 'Utilisez le filtre « Nature » et choisissez « Lieu de chantier ».'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Colonne « Actions » : « Paramétrer le module financier ».' },
    related: [{ label: 'Nouveau lieu, correction', helpId: 'finance.articles-lieux.lieu-formulaire' }],
    keywords: ['lieux', 'magasins', 'statut', 'comptage en cours']
  },
  {
    id: 'finance.articles-lieux.lieu-formulaire',
    kind: 'section',
    title: 'Créer ou corriger un lieu',
    summary:
      'Ce formulaire crée un lieu de stockage ou en corrige le libellé. La nature et le chantier sont définitifs.',
    purpose: "Choisissez la nature avant d'enregistrer : elle ne se corrigera plus.",
    steps: [
      { title: 'Nature du lieu', detail: '« Magasin » ou « Lieu de chantier ».' },
      { title: 'Libellé', detail: "Le nom du lieu, par exemple « Magasin central d'Angré »." },
      { title: 'Chantier', detail: 'Obligatoire pour un lieu de chantier uniquement. Il ne se corrigera plus.' },
      { title: 'Enregistrer', detail: '« Enregistrer le lieu » ou « Enregistrer le libellé ».' }
    ],
    consequences: [
      "Si le chantier choisi a déjà un lieu de stockage, l'enregistrement est refusé : un chantier n'en a qu'un.",
      'À la correction, seul le libellé change. Ni la nature ni le chantier ne se modifient.'
    ],
    faq: [
      { q: "Le sélecteur de chantier n'apparaît pas.", a: "Il n'existe que pour la nature « Lieu de chantier »." },
      { q: 'Puis-je renommer un lieu ?', a: 'Oui, avec « Corriger le libellé ».' },
      {
        q: "Pourquoi l'enregistrement du lieu est-il refusé ?",
        a: "Le libellé est obligatoire, et pour un lieu de chantier le chantier aussi. Si ce chantier a déjà un lieu de stockage, l'enregistrement est refusé : un chantier n'en a qu'un."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Paramétrer le module financier ».' },
    related: [{ label: 'Lieux de stockage', helpId: 'finance.articles-lieux.lieux' }],
    keywords: ['nouveau lieu', 'corriger le lieu', 'nature', 'chantier']
  },
  {
    id: 'finance.articles-lieux.valorisation',
    kind: 'section',
    title: 'Méthode de valorisation',
    summary:
      'Cet onglet montre comment le stock est valorisé : le coût moyen pondéré. Il garde la date et le motif de la décision.',
    purpose:
      'Le coût moyen pondéré est la seule méthode disponible. Chaque réception recalcule le coût moyen du lieu, et chaque sortie sort au coût moyen du moment. Ce geste enregistre la décision, sa date et son motif ; il ne change donc pas la méthode.',
    steps: [
      {
        title: 'Lire la décision en vigueur',
        detail:
          "La méthode, la date d'arrêt et le motif. Sans décision enregistrée, le coût moyen pondéré s'applique par défaut."
      },
      { title: 'Arrêter la décision', detail: 'Rédigez le « Motif de la décision ».' },
      {
        title: 'Enregistrer',
        detail: '« Enregistrer la décision » : le bouton reste grisé tant que le motif est vide.'
      }
    ],
    consequences: [
      'Le motif est obligatoire : il permettra de savoir plus tard pourquoi les chiffres ont été lus ainsi.',
      'Enregistrer la décision ne modifie ni les quantités ni les valeurs du stock.'
    ],
    faq: [
      {
        q: 'Peut-on choisir une autre méthode (PEPS, coût standard) ?',
        a: "Non, seul le coût moyen pondéré existe aujourd'hui."
      },
      { q: 'Pourquoi ce formulaire est-il absent ?', a: 'Il demande le droit « Paramétrer le module financier ».' },
      {
        q: 'Pourquoi « Enregistrer la décision » est-il grisé ?',
        a: 'Le motif est obligatoire : le bouton reste grisé tant que le « Motif de la décision » est vide.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Écriture : « Paramétrer le module financier ».' },
    related: [{ label: "L'état du stock", helpId: 'finance.stock.etat' }],
    keywords: ['coût moyen pondéré', 'valorisation', 'décision', 'méthode', 'cmp']
  }
];

export default entries;
