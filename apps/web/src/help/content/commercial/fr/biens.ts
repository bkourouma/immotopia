import type { HelpEntry } from '../../../types';

/** Zone « biens » du module « commercial » (fr) : liste, création, modification, calendrier des visites. */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------------------
  // Liste des biens
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.biens.liste',
    kind: 'page',
    title: 'Biens',
    summary:
      "Retrouvez ici tous les biens de votre agence, présentés en cartes avec leur photo, leur statut et leur prix. C'est le point de départ pour ajouter, ouvrir, modifier ou supprimer un bien.",
    purpose:
      "Un bien est la fiche de base de l'agence : il sert aux ventes, aux locations, aux visites et aux affaires. Chaque carte ouvre la fiche complète du bien, où vous retrouvez ses détails, ses documents et ses visites.",
    steps: [
      {
        title: 'Ajouter un bien',
        detail: "Cliquez sur « Ajouter un bien » pour lancer l'assistant de création en plusieurs étapes."
      },
      {
        title: 'Rechercher',
        detail: 'Tapez un titre, une adresse ou une référence dans le champ « Rechercher ».'
      },
      {
        title: 'Filtrer',
        detail:
          'Choisissez un « Type de bien » ou une « Transaction », ou cliquez sur « Plus de critères » pour le statut, la commune, le prix et les chambres.'
      },
      {
        title: 'Ouvrir un bien',
        detail: 'Cliquez sur la carte ou sur « Voir la fiche » dans le menu « ⋮ ».'
      },
      {
        title: 'Modifier un bien',
        detail: 'Cliquez sur « Modifier » en bas de la carte.'
      },
      {
        title: 'Exporter',
        detail: 'Bouton « Exporter » : Excel, CSV ou PDF, avec les mêmes filtres que la liste affichée.'
      }
    ],
    consequences: [
      'La suppression est irréversible. Elle est refusée si le bien est lié à un bail, à des échéances impayées, à un mandat de gestion actif, à une copropriété, à des tickets de maintenance, à une vente, à une affaire active ou à un prêt actif.',
      "Quand la suppression est refusée, l'écran propose « Archiver ce bien » : le bien sort alors de la liste sans que ses données soient effacées.",
      "« Diffuser en newsletter » ouvre la préparation d'une campagne de newsletter pour le bien choisi."
    ],
    faq: [
      {
        q: 'Où est passé un bien archivé ?',
        a: "Les biens archivés n'apparaissent plus dans cette liste, qui ne propose pas de filtre pour les retrouver."
      },
      {
        q: 'Pourquoi le filtre « Commune » ne trouve pas mon bien ?',
        a: "Ce filtre cherche le nom de la commune dans l'adresse et dans le quartier du bien. Renseignez-les à la création ou en modification."
      },
      {
        q: 'Je ne vois pas « Ajouter un bien » ou je ne peux pas modifier un bien. Pourquoi ?',
        a: "Ces actions dépendent de vos droits : « Créer des biens » pour ajouter, « Modifier les biens » pour modifier. Demandez-les à l'administrateur de votre agence."
      }
    ],
    permissions: {
      note: 'Voir la liste demande « Voir les biens », ajouter demande « Créer des biens ». Modifier, supprimer et archiver demandent « Modifier les biens ».'
    },
    related: [
      { label: 'Comment lire les cartes de biens', helpId: 'commercial.biens.liste.cartes' },
      { label: 'Créer un nouveau bien', helpId: 'commercial.biens.nouveau' },
      { label: 'Calendrier des visites', helpId: 'commercial.biens.visites' },
      { label: 'Ouvrir la liste des biens', to: '/tenant/:tenantId/properties' }
    ],
    keywords: [
      'bien',
      'biens',
      'immeuble',
      'appartement',
      'maison',
      'villa',
      'terrain',
      'portefeuille',
      'annonce',
      'patrimoine immobilier'
    ]
  },
  {
    id: 'commercial.biens.liste.cartes',
    kind: 'table',
    title: 'Cartes des biens',
    summary:
      'Chaque carte est un bien de votre agence, du plus récent au plus ancien. Elle montre la photo, le titre, le lieu, le statut, le prix et quelques caractéristiques.',
    howToRead: {
      statuses: [
        {
          value: 'AVAILABLE',
          label: 'Disponible',
          description: 'Le bien est proposé. Il peut être publié sur le portail public.'
        },
        {
          value: 'RESERVED',
          label: 'Réservé',
          description: 'Le bien est réservé. Il peut encore être publié.'
        },
        {
          value: 'UNDER_OFFER',
          label: 'Sous offre',
          description: 'Une offre est en cours sur le bien. Il peut encore être publié.'
        },
        {
          value: 'RENTED',
          label: 'Loué',
          description: 'Le bien est loué. Il ne peut pas être publié dans cet état.'
        },
        {
          value: 'SOLD',
          label: 'Vendu',
          description: 'Le bien est vendu. Il ne peut pas être publié dans cet état.'
        },
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description: 'Le bien est en cours de saisie. Il ne peut pas être publié dans cet état.'
        },
        {
          value: 'UNDER_REVIEW',
          label: 'En révision',
          description: 'Le bien est en cours de vérification. Il ne peut pas être publié dans cet état.'
        }
      ],
      notes: [
        'Photo : la photo principale du bien ; à défaut, la première photo ; sans photo, une icône de maison.',
        "Prix : le prix de vente, ou le loyer mensuel pour un bien à louer, en FCFA. Il n'est pas affiché pour un immeuble.",
        "Sous le titre : l'adresse et le quartier. En bas de carte : le type, la transaction (Vente, Location) et la surface, avec le nombre de pièces et de chambres.",
        'Un clic sur la carte ouvre la fiche. « Modifier » ouvre le formulaire de modification. Le menu « ⋮ » propose « Voir la fiche », « Diffuser en newsletter » et « Supprimer ».',
        "Le « Statut » ne se filtre que sur « Disponible » et « Loué ». Les statuts « Archivé » ne s'affichent pas."
      ]
    },
    consequences: [
      "« Supprimer » demande une confirmation et efface le bien : c'est irréversible. S'il est refusé, « Archiver ce bien » le retire de la liste sans effacer ses données."
    ],
    faq: [
      {
        q: 'Les filtres sont-ils conservés ?',
        a: "Oui. Ils font partie de l'adresse de la page : copiez le lien pour partager une recherche, ou revenez en arrière depuis une fiche pour retrouver la même liste."
      },
      {
        q: 'Que contient le fichier exporté ?',
        a: 'Tous les biens qui correspondent à vos filtres, pas seulement la page affichée : référence, titre, type, transaction, statut, adresse, zone, prix, surface, pièces et chambres.'
      },
      {
        q: 'Pourquoi un bien apparaît-il sans photo ?',
        a: "Aucune photo n'a encore été ajoutée. Ouvrez « Modifier » puis la section « Photos et Vidéos »."
      }
    ],
    related: [
      { label: "Vue d'ensemble de la liste des biens", helpId: 'commercial.biens.liste' },
      { label: 'Ajouter des photos à un bien', helpId: 'commercial.biens.modifier.medias' }
    ],
    keywords: ['carte', 'photo', 'statut', 'prix', 'loyer', 'export', 'recherche', 'filtre', 'supprimer', 'archiver']
  },

  // ---------------------------------------------------------------------------
  // Création d'un bien
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.biens.nouveau',
    kind: 'page',
    title: 'Nouvelle propriété',
    summary:
      'Cet assistant crée un bien étape par étape : type et titre, localisation, caractéristiques, prix, spécificités, puis photos et vidéos. Seuls quelques champs sont obligatoires, le reste se complète plus tard.',
    purpose:
      "Créez le bien avec l'essentiel, puis enrichissez-le en modification avant de le publier. Un bien sert ensuite aux visites, aux affaires, aux ventes et aux locations.",
    steps: [
      {
        title: 'Type et identification',
        detail: 'Choisissez le type, saisissez le titre et dites à qui appartient le bien.'
      },
      {
        title: 'Localisation',
        detail: "Recherchez la commune. Le quartier et l'adresse sont facultatifs."
      },
      {
        title: 'Caractéristiques générales',
        detail: 'Surface, année, état, standing, pièces. Cette étape disparaît pour un terrain ou un parking.'
      },
      {
        title: 'Prix et conditions',
        detail: 'Choisissez « Vente » ou « Location », puis saisissez le prix ou le loyer.'
      },
      {
        title: 'Spécificités',
        detail: 'Détails propres au type de bien. Pour un immeuble, vous saisissez aussi ses appartements.'
      },
      {
        title: 'Médias',
        detail: 'Ajoutez des photos et des vidéos. Le bien est enregistré en arrivant à cette étape.'
      },
      {
        title: 'Terminer',
        detail: "Cliquez sur « Terminer » à la dernière étape : la fiche du bien s'ouvre."
      }
    ],
    consequences: [
      'Le bien est créé avec le statut « Disponible » et reçoit une référence interne automatique.',
      "Le bien est enregistré dès que vous arrivez à l'étape « Médias » : si vous quittez ensuite sans cliquer sur « Terminer », il existe déjà dans la liste des biens.",
      "Le bien n'est pas publié automatiquement : la publication se fait ensuite depuis « Modifier ».",
      "Si votre abonnement limite le nombre de biens, la création peut être refusée ; un message vous renvoie alors vers l'abonnement."
    ],
    faq: [
      {
        q: 'Quels champs sont obligatoires ?',
        a: "Le type de propriété, le titre, la localisation (pays, région, commune) et le type d'opération. S'il s'agit d'un bien de client, le propriétaire l'est aussi. À l'étape « Spécificités », les champs marqués d'une étoile rouge le sont également."
      },
      {
        q: "Pourquoi l'étape « Caractéristiques générales » n'apparaît-elle pas ?",
        a: "Un terrain et un parking (« Parking/Box ») n'ont rien à y renseigner : l'étape est sautée."
      },
      {
        q: 'Comment créer un immeuble avec ses appartements ?',
        a: "Choisissez « Immeuble », puis à l'étape « Spécificités » indiquez le « Nombre total d'appartements » : une ligne par appartement apparaît (200 au maximum). Les appartements sont créés au clic sur « Terminer »."
      }
    ],
    permissions: {
      note: 'Créer un bien demande « Créer des biens ». Ajouter des photos et des vidéos demande « Modifier les biens ».'
    },
    related: [
      { label: 'Publier un bien', helpId: 'commercial.biens.modifier.publication' },
      { label: 'Revenir à la liste des biens', helpId: 'commercial.biens.liste' }
    ],
    keywords: [
      'créer un bien',
      'ajouter un bien',
      'nouveau bien',
      'assistant',
      'immeuble',
      'appartement',
      'propriétaire',
      'mandat'
    ],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'biens-etapes',
          title: 'Les étapes',
          description:
            "Le parcours se fait étape par étape. Vous ne pouvez ouvrir que les étapes déjà atteintes, et « Suivant » reste grisé tant que l'étape en cours n'est pas correctement remplie."
        },
        {
          target: 'biens-type',
          title: 'Le type de bien',
          description:
            "Choisissez d'abord le type. Il détermine les étapes et les champs qui suivent : un terrain ou un parking n'a pas d'étape « Caractéristiques générales »."
        },
        {
          target: 'biens-titre',
          title: 'Le titre',
          description:
            'Donnez un titre clair, par exemple « Appartement 3 pièces à Cocody ». Le titre et le type sont obligatoires.'
        },
        {
          target: 'biens-proprietaire',
          title: 'Le propriétaire',
          description:
            "« L'agence » pour un bien de l'agence ; « Un client » pour un bien géré pour son propriétaire : un mandat de gestion est alors créé avec le bien."
        },
        {
          target: 'biens-navigation',
          title: 'Avancer et terminer',
          description:
            "« Suivant » passe à l'étape suivante. À la dernière étape, « Terminer » ouvre la fiche du bien, qui est déjà enregistré depuis l'étape « Médias »."
        }
      ]
    }
  },
  {
    id: 'commercial.biens.nouveau.identification',
    kind: 'section',
    title: 'Type et identification',
    summary:
      'Choisissez le type de bien, donnez-lui un titre et indiquez à qui il appartient. Le type et le titre sont obligatoires, ainsi que le propriétaire pour un bien de client.',
    steps: [
      {
        title: 'Type de propriété',
        detail:
          'Cliquez sur une vignette : Appartement, Maison/Villa, Studio, Duplex/Triplex, Bureau, Boutique / Commercial, Entrepôt/Industriel, Terrain, Immeuble ou Parking/Box.'
      },
      {
        title: 'Titre',
        detail: 'Un titre court et clair, par exemple « Appartement 3 pièces à Cocody ».'
      },
      {
        title: 'Propriétaire',
        detail: "Choisissez « L'agence », ou « Un client » puis sélectionnez le propriétaire dans la liste."
      },
      {
        title: 'Description',
        detail: 'Facultative ici, mais elle est obligatoire pour publier le bien.'
      }
    ],
    consequences: [
      "Avec « Un client », le propriétaire doit être un client de l'agence au rôle Propriétaire (les contacts convertis en font partie). Un mandat de gestion est créé en même temps que le bien.",
      "Avec « L'agence », le bien n'a pas de propriétaire distinct."
    ],
    faq: [
      {
        q: 'Puis-je changer le type de bien plus tard ?',
        a: "Non. L'écran de modification ne propose plus le choix du type : choisissez-le avec soin ici."
      },
      {
        q: 'Je ne vois pas le choix du propriétaire. Pourquoi ?',
        a: "Selon la configuration de votre compte, ce choix peut être masqué : le bien reste alors à l'agence."
      },
      {
        q: 'Le propriétaire que je cherche est absent de la liste.',
        a: "La liste ne contient que les clients de l'agence au rôle Propriétaire. Convertissez d'abord le contact concerné depuis sa fiche."
      }
    ],
    related: [{ label: "Vue d'ensemble de la création", helpId: 'commercial.biens.nouveau' }],
    keywords: ['type de bien', 'titre', 'propriétaire', 'client', 'agence', 'mandat de gestion']
  },
  {
    id: 'commercial.biens.nouveau.localisation',
    kind: 'section',
    title: 'Localisation',
    summary:
      "Indiquez où se trouve le bien. Seule la localisation (pays, région, commune) est obligatoire ; le quartier et l'adresse sont facultatifs.",
    steps: [
      {
        title: 'Localisation',
        detail: "Tapez le nom d'une commune, par exemple Cocody, puis choisissez-la dans la liste."
      },
      {
        title: 'Quartier / Zone',
        detail: 'Par exemple Angré ou Riviera. Facultatif.'
      },
      {
        title: 'Adresse',
        detail: 'Adresse complète. Facultative.'
      }
    ],
    consequences: [
      'Cet assistant ne demande pas les coordonnées (latitude et longitude). Elles sont obligatoires pour publier : vous les saisissez en modification.',
      "L'adresse est visible du public si le bien est publié."
    ],
    faq: [
      {
        q: 'Comment renseigner les coordonnées du bien ?',
        a: "Ouvrez « Modifier » : le champ « Adresse précise (optionnel) » remplit automatiquement l'adresse, le quartier et les coordonnées."
      },
      {
        q: 'À quoi sert le quartier ?',
        a: "Avec l'adresse, il permet de retrouver le bien avec le filtre « Commune » de la liste des biens."
      },
      {
        q: "Que se passe-t-il si je laisse l'adresse vide ?",
        a: "Le bien est créé sans adresse. Il ne pourra pas être publié tant qu'aucune adresse n'est saisie."
      }
    ],
    related: [{ label: 'Modifier la localisation', helpId: 'commercial.biens.modifier.localisation' }],
    keywords: ['commune', 'quartier', 'adresse', 'pays', 'région', 'gps', 'coordonnées']
  },
  {
    id: 'commercial.biens.nouveau.caracteristiques',
    kind: 'section',
    title: 'Caractéristiques générales',
    summary:
      "Renseignez la surface, l'année, l'état, le standing, le nombre de pièces. Aucun champ n'est obligatoire, et les champs proposés dépendent du type de bien.",
    howToRead: {
      notes: [
        'Surface principale (m²) : proposée pour tous les types sauf terrain, parking et immeuble.',
        'Année de construction et État général (Neuf, Bon, À rénover, En chantier) : pour tous les types sauf terrain et parking.',
        'Standing (Économique, Standard, Haut standing, Luxe) : pour un logement, un bureau ou un immeuble.',
        'Nombre de pièces, de chambres et de salles de bain : pour un logement (appartement, studio, duplex, maison).',
        'Surface terrain (m²) : pour une maison / villa seulement.',
        "Statut d'ameublement (Non meublé, Meublé, Partiellement meublé) : pour un appartement, un studio ou un duplex."
      ]
    },
    consequences: [
      "Cette étape n'existe pas pour un terrain ni pour un parking : l'assistant passe directement au prix."
    ],
    faq: [
      {
        q: 'Pourquoi certains champs manquent-ils ?',
        a: "L'assistant ne pose que les questions qui ont un sens pour le type choisi. Une « Surface principale » n'est par exemple pas demandée pour un immeuble, dont la surface vient de ses appartements."
      },
      {
        q: 'Puis-je compléter ces informations plus tard ?',
        a: 'Oui, depuis « Modifier », sections « 3. Caractéristiques générales » et « 5. Caractéristiques physiques ».'
      },
      {
        q: 'Puis-je passer cette étape sans rien remplir ?',
        a: "Oui : aucun champ de cette étape n'est obligatoire, cliquez simplement sur « Suivant »."
      }
    ],
    related: [{ label: 'Caractéristiques en modification', helpId: 'commercial.biens.modifier.caracteristiques' }],
    keywords: ['surface', 'pièces', 'chambres', 'standing', 'meublé', 'année de construction', 'état']
  },
  {
    id: 'commercial.biens.nouveau.prix',
    kind: 'section',
    title: 'Prix et conditions',
    summary:
      "Choisissez si le bien est en « Vente » ou en « Location », puis saisissez le prix ou le loyer en FCFA. Le type d'opération est obligatoire, les montants ne le sont pas.",
    steps: [
      {
        title: "Type d'opération",
        detail: '« Vente » ou « Location ». Un bien est soit à vendre, soit à louer, pas les deux.'
      },
      {
        title: 'Prix de vente ou Loyer mensuel',
        detail: 'Le libellé suit votre choix. Saisissez le montant en FCFA.'
      },
      {
        title: 'Charges',
        detail: '« Charges de copropriété » en vente, « Charges (provision mensuelle) » en location.'
      },
      {
        title: 'Dépôt de garantie',
        detail: 'Proposé seulement en location.'
      }
    ],
    consequences: [
      'Le prix est obligatoire pour publier le bien : sans lui, la publication est refusée.',
      "Pour un immeuble à louer, ni loyer ni charges ne sont demandés : le loyer se saisit sur chaque appartement, à l'étape « Spécificités »."
    ],
    faq: [
      {
        q: "Pourquoi n'y a-t-il pas de choix de devise ?",
        a: 'Les montants sont en FCFA : le choix de la devise a été retiré.'
      },
      {
        q: "Où saisir la commission de l'agence ?",
        a: "Pas sur cet écran : la rémunération de l'agence ne se gère pas depuis la fiche d'un bien."
      },
      {
        q: 'Faut-il saisir le prix maintenant ?',
        a: "Non, aucun montant n'est obligatoire ici. Il le devient seulement pour publier le bien."
      }
    ],
    related: [{ label: 'Prix en modification', helpId: 'commercial.biens.modifier.prix' }],
    keywords: ['prix', 'loyer', 'vente', 'location', 'charges', 'dépôt de garantie', 'caution', 'fcfa']
  },
  {
    id: 'commercial.biens.nouveau.specificites',
    kind: 'section',
    title: 'Caractéristiques spécifiques',
    summary:
      'Cette étape demande les détails propres au type de bien. Pour un immeuble, vous y saisissez aussi la liste de ses appartements.',
    steps: [
      {
        title: 'Remplir les champs',
        detail: 'Les champs dépendent du type choisi. Ceux qui portent une étoile rouge sont obligatoires.'
      },
      {
        title: "Immeuble : nombre d'appartements",
        detail:
          "Saisissez le « Nombre total d'appartements » (de 1 à 200) : autant de lignes apparaissent dans « Appartements »."
      },
      {
        title: 'Immeuble : décrire chaque appartement',
        detail:
          'Pour chaque ligne : titre, surface, pièces, chambres, salles de bain (SdB) et prix (en vente) ou loyer (en location).'
      }
    ],
    consequences: [
      "Les appartements ne sont créés qu'au clic sur « Terminer », une fois l'immeuble enregistré. Seuls ceux qui ont un titre sont créés ; chacun reçoit le statut « Disponible ».",
      "Si certains appartements ne peuvent pas être créés, un message indique combien l'ont été : ajoutez les autres depuis la fiche de l'immeuble."
    ],
    faq: [
      {
        q: "J'ai changé le nombre d'appartements : perds-je mes lignes ?",
        a: "Non. Si le nombre augmente, des lignes sont ajoutées ; s'il diminue, seules les dernières disparaissent."
      },
      {
        q: 'Que faire pour un immeuble de plus de 200 appartements ?',
        a: "Créez les 200 premiers ici, puis ajoutez les suivants un par un depuis la fiche de l'immeuble."
      },
      {
        q: 'Un message « est requis » apparaît sous un champ.',
        a: 'Ce champ porte une étoile rouge : remplissez-le pour pouvoir continuer.'
      }
    ],
    related: [{ label: 'Prix et conditions', helpId: 'commercial.biens.nouveau.prix' }],
    keywords: ['immeuble', 'appartements', 'lots', "nombre total d'appartements", 'caractéristiques spécifiques']
  },
  {
    id: 'commercial.biens.nouveau.medias',
    kind: 'section',
    title: 'Médias',
    summary:
      "Ajoutez les photos et les vidéos du bien. Le bien est enregistré en arrivant à cette étape, ce qui permet d'envoyer les fichiers.",
    steps: [
      {
        title: 'Ajouter des photos ou des vidéos',
        detail: 'Glissez vos fichiers dans la zone ou cliquez sur « Sélectionner des fichiers ».'
      },
      {
        title: 'Choisir la photo principale',
        detail: "Dans la galerie, cliquez sur l'étoile d'une photo : elle reçoit le badge « Principal »."
      },
      {
        title: 'Réordonner',
        detail: 'Faites glisser une photo à sa nouvelle place.'
      },
      {
        title: 'Terminer',
        detail: "Cliquez sur « Terminer » : la fiche du bien s'ouvre."
      }
    ],
    howToRead: {
      notes: [
        'Photos : JPEG, PNG ou WebP. Vidéos : MP4, WebM ou QuickTime. 50 Mo maximum, comme indiqué sous la zone de dépôt.',
        'Seule une photo peut être « Principal » ; une vidéo ne le peut pas.'
      ]
    },
    consequences: [
      "L'ajout de photos n'en fait pas automatiquement la photo principale. Une photo principale est pourtant exigée pour publier le bien.",
      "La suppression d'un fichier demande confirmation et efface le fichier : c'est irréversible."
    ],
    faq: [
      {
        q: 'Un fichier est refusé. Pourquoi ?',
        a: "Son format n'est pas accepté pour ce type de média : une photo doit être en JPEG, PNG ou WebP, une vidéo en MP4, WebM ou QuickTime."
      },
      {
        q: "Cette étape reste sur « Préparation de l'espace médias… ».",
        a: "Le bien n'a pas pu être enregistré, par exemple parce que votre abonnement limite le nombre de biens. Cliquez sur « Terminer » pour relancer l'enregistrement."
      },
      {
        q: 'Je ne peux pas envoyer de fichiers.',
        a: "L'ajout de médias demande le droit « Modifier les biens », en plus de « Créer des biens »."
      }
    ],
    related: [{ label: 'Photos et vidéos en modification', helpId: 'commercial.biens.modifier.medias' }],
    keywords: ['photo', 'vidéo', 'image', 'galerie', 'photo principale', 'télécharger']
  },

  // ---------------------------------------------------------------------------
  // Modification d'un bien
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.biens.modifier',
    kind: 'page',
    title: 'Modifier la propriété',
    summary:
      "Cet écran regroupe la publication du bien, son formulaire complet (six sections) et ses photos et vidéos. Le formulaire s'enregistre avec « Mettre à jour » ; la publication et les médias agissent tout de suite.",
    purpose:
      "Complétez ou corrigez un bien existant : titre, statut, localisation, prix, caractéristiques, photos. C'est aussi ici que vous le publiez sur le portail public ou que vous l'en retirez.",
    steps: [
      {
        title: 'Publier ou retirer',
        detail: 'En haut, le bloc « Publication » dit si le bien est publié et propose le bouton adapté.'
      },
      {
        title: 'Modifier le formulaire',
        detail: "Parcourez les sections 1 à 6 et corrigez ce qui doit l'être."
      },
      {
        title: 'Enregistrer',
        detail:
          "Cliquez sur « Mettre à jour » : la fiche du bien s'ouvre. « Annuler » revient à la fiche sans rien enregistrer."
      },
      {
        title: 'Gérer les médias',
        detail: 'Dans « Photos et Vidéos », ajoutez, classez ou supprimez les fichiers.'
      }
    ],
    consequences: [
      '« Mettre à jour » enregistre tout le formulaire en une fois ; la publication et les médias, eux, agissent immédiatement, sans attendre ce bouton.',
      "Chaque changement de statut fait par ce formulaire est enregistré dans l'historique du bien.",
      'Le type de bien et la référence interne ne se modifient pas.'
    ],
    faq: [
      {
        q: "J'ai changé un champ puis cliqué sur « Annuler » : est-ce perdu ?",
        a: 'Oui, les changements du formulaire non enregistrés sont perdus. Les photos ajoutées ou supprimées, elles, sont déjà prises en compte.'
      },
      {
        q: 'Pourquoi le changement de statut est-il refusé ?',
        a: 'Certains changements sont interdits : un bien « Loué » ou « Vendu » ne peut redevenir que « Disponible » ou être « Archivé ».'
      },
      {
        q: 'Où planifier une visite ?',
        a: 'Depuis la fiche du bien. Les visites planifiées se retrouvent ensuite dans le calendrier des visites.'
      }
    ],
    permissions: {
      note: 'Modifier demande « Modifier les biens ». Publier et retirer du portail demandent « Publier / dépublier des biens ».'
    },
    related: [
      { label: 'Publier un bien', helpId: 'commercial.biens.modifier.publication' },
      { label: 'Photos et vidéos', helpId: 'commercial.biens.modifier.medias' },
      { label: 'Retour à la liste des biens', helpId: 'commercial.biens.liste' }
    ],
    keywords: ['modifier un bien', 'corriger', 'mettre à jour', 'statut', 'publier', 'photos']
  },
  {
    id: 'commercial.biens.modifier.publication',
    kind: 'section',
    title: 'Publication',
    summary:
      'Ce bloc dit si le bien est visible sur le portail public, et permet de le publier ou de le retirer. Un bien ne peut être publié que si plusieurs conditions sont réunies.',
    howToRead: {
      notes: [
        "« Publié » : le bien est visible sur le portail public, avec sa date de publication. « Non publié » : il ne l'est pas.",
        'Conditions de publication : un titre, une description, une adresse, une photo principale, la latitude et la longitude, un prix, un statut « Disponible », « Réservé » ou « Sous offre »,.',
        'Quand une condition manque, un encadré « Conditions de publication non remplies » les liste toutes.'
      ]
    },
    steps: [
      {
        title: 'Vérifier les conditions',
        detail: 'Complétez le formulaire et les photos : description, adresse, coordonnées, prix, photo principale.'
      },
      {
        title: 'Publier',
        detail: 'Cliquez sur « Publier sur le portail public ».'
      },
      {
        title: 'Retirer',
        detail: 'Cliquez sur « Retirer du portail public », puis confirmez avec « Oui ».'
      }
    ],
    consequences: [
      'Publié, le bien devient visible du public : titre, description, adresse, quartier, coordonnées, prix, charges, surfaces, pièces et photos. Le propriétaire, la référence interne et les documents ne sont pas affichés.',
      'Retirer le bien du portail le rend invisible et efface sa date de publication ; vous pouvez le publier de nouveau.',
      'Si votre agence a configuré la diffusion WhatsApp, une annonce du bien peut être envoyée à son groupe lors de la publication.'
    ],
    faq: [
      {
        q: 'Pourquoi la publication est-elle refusée alors que le bien a des photos ?',
        a: "Il faut une photo « Principale ». L'ajout d'une photo ne la définit pas : cliquez sur l'étoile de la photo voulue dans la galerie."
      },
      {
        q: 'Où saisir la latitude et la longitude ?',
        a: 'Dans la section « 2. Localisation » : le champ « Adresse précise (optionnel) » les remplit automatiquement, ou saisissez-les à la main.'
      },
      {
        q: 'Je ne vois pas le bouton de publication.',
        a: "Il dépend du droit « Publier / dépublier des biens ». Demandez-le à l'administrateur de votre agence."
      }
    ],
    permissions: {
      note: 'Demande « Publier / dépublier des biens ».'
    },
    related: [
      { label: 'Ajouter une photo principale', helpId: 'commercial.biens.modifier.medias' },
      { label: 'Localisation et coordonnées', helpId: 'commercial.biens.modifier.localisation' }
    ],
    keywords: ['publier', 'dépublier', 'portail public', 'annonce', 'mise en ligne', 'visible']
  },
  {
    id: 'commercial.biens.modifier.identification',
    kind: 'section',
    title: '1. Identification',
    summary:
      "Titre, propriétaire, description, statut et disponibilité du bien. Le titre, le statut et la disponibilité sont obligatoires ; le propriétaire l'est pour un bien qui n'appartient pas à l'agence.",
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: 'Bien en cours de saisie, non publiable.' },
        { value: 'AVAILABLE', label: 'Disponible', description: 'Bien proposé, publiable.' },
        { value: 'RESERVED', label: 'Réservé', description: 'Bien réservé, encore publiable.' },
        { value: 'UNDER_OFFER', label: 'Sous offre', description: 'Offre en cours, encore publiable.' },
        { value: 'SOLD', label: 'Vendu', description: 'Bien vendu, non publiable.' },
        { value: 'RENTED', label: 'Loué', description: 'Bien loué, non publiable.' },
        { value: 'ARCHIVED', label: 'Archivé', description: 'Bien sorti de la liste des biens.' }
      ],
      notes: [
        'Disponibilité : « Immédiate », « Bientôt disponible » (une « Date de disponibilité » est alors demandée) ou « Indisponible ».',
        'La référence interne est affichée, non modifiable.'
      ]
    },
    consequences: [
      "Chaque changement de statut est enregistré dans l'historique du bien.",
      'Certains changements sont refusés : un bien « Loué » ou « Vendu » ne peut devenir que « Disponible » ou « Archivé ».'
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas changer le type de bien ?',
        a: 'Le type se choisit à la création et ne se modifie plus depuis cet écran.'
      },
      {
        q: 'Que se passe-t-il si je choisis « Archivé » ?',
        a: 'Le bien disparaît de la liste des biens.'
      },
      {
        q: 'Quelle différence entre « Statut » et « Disponibilité » ?',
        a: "Le statut dit où en est le bien (Disponible, Loué, Vendu…). La disponibilité dit s'il peut être occupé tout de suite, bientôt ou pas."
      }
    ],
    related: [{ label: 'Publication', helpId: 'commercial.biens.modifier.publication' }],
    keywords: ['titre', 'statut', 'disponibilité', 'propriétaire', 'description', 'référence']
  },
  {
    id: 'commercial.biens.modifier.localisation',
    kind: 'section',
    title: '2. Localisation',
    summary: "Commune, adresse, quartier et coordonnées du bien. L'adresse précise remplit le reste automatiquement.",
    steps: [
      {
        title: 'Localisation (Pays > Région > Commune)',
        detail: 'Recherchez la commune.'
      },
      {
        title: 'Adresse précise',
        detail:
          "Tapez une rue, un quartier ou un lieu et choisissez une suggestion : l'adresse, le quartier, la latitude et la longitude se remplissent."
      },
      {
        title: 'Vérifier et corriger',
        detail: "Ajustez à la main l'adresse, le quartier, la latitude, la longitude et les points d'intérêt si besoin."
      }
    ],
    consequences: [
      "L'adresse, le quartier et les coordonnées sont visibles du public quand le bien est publié.",
      "L'adresse, la latitude et la longitude sont nécessaires pour publier."
    ],
    faq: [
      {
        q: "D'où viennent les suggestions d'adresse ?",
        a: "D'un service gratuit, Photon / OpenStreetMap. Vérifiez la suggestion avant de l'enregistrer."
      },
      {
        q: "La suggestion d'adresse est fausse : que faire ?",
        a: "Corrigez à la main l'adresse, la latitude et la longitude dans les champs situés en dessous."
      },
      {
        q: "Pourquoi l'adresse est-elle importante ?",
        a: 'Avec la latitude et la longitude, elle est obligatoire pour publier le bien.'
      }
    ],
    related: [{ label: 'Publication', helpId: 'commercial.biens.modifier.publication' }],
    keywords: ['adresse', 'coordonnées', 'latitude', 'longitude', 'quartier', 'commune', 'gps']
  },
  {
    id: 'commercial.biens.modifier.caracteristiques',
    kind: 'section',
    title: 'Caractéristiques du bien',
    summary:
      "Les sections 3 (générales), 5 (physiques) et 6 (spécifiques) décrivent le bien : surfaces, année, état, standing, pièces, ameublement et détails propres à son type. Aucun de ces champs n'est obligatoire, sauf ceux marqués d'une étoile rouge dans la section 6.",
    howToRead: {
      notes: [
        "3. Caractéristiques générales : Surface principale, Surface utile, Année de construction, État général (Neuf, Bon, À rénover, En chantier), Standing (Économique, Standard, Haut standing, Luxe). Selon le type de bien, certains champs n'apparaissent pas.",
        "5. Caractéristiques physiques : Nombre de pièces, Chambres, Salles de bain / WC, et selon le type Surface terrain et Meublé. Cette section n'apparaît que pour un logement.",
        "6. Caractéristiques spécifiques : les détails propres au type de bien. Pour un immeuble, le champ « Nombre total d'appartements » s'y trouve."
      ]
    },
    faq: [
      {
        q: 'Une section est absente. Pourquoi ?',
        a: "Les sections 5 et 6 dépendent du type de bien : elles n'apparaissent que si elles ont un sens pour lui."
      },
      {
        q: "Où modifier les appartements d'un immeuble ?",
        a: "Depuis la fiche de l'immeuble."
      },
      {
        q: 'Que faire si je ne connais pas une valeur ?',
        a: "Laissez le champ vide : seuls les champs marqués d'une étoile rouge sont obligatoires."
      }
    ],
    related: [{ label: 'Prix et conditions', helpId: 'commercial.biens.modifier.prix' }],
    keywords: ['surface', 'pièces', 'chambres', 'standing', 'meublé', 'année', 'état', 'caractéristiques']
  },
  {
    id: 'commercial.biens.modifier.prix',
    kind: 'section',
    title: '4. Prix et conditions',
    summary:
      "Type d'opération, prix ou loyer, charges et dépôt de garantie, en FCFA. Le type d'opération est obligatoire.",
    steps: [
      {
        title: "Type d'opération",
        detail: '« Vente » ou « Location », jamais les deux.'
      },
      {
        title: 'Prix de vente ou Loyer mensuel',
        detail: "Le libellé suit le type d'opération."
      },
      {
        title: 'Charges et dépôt de garantie',
        detail:
          '« Charges de copropriété » en vente ; « Charges (provision mensuelle) » et « Dépôt de garantie » en location.'
      }
    ],
    consequences: [
      'Le prix est obligatoire pour publier le bien.',
      'Pour un immeuble en location, ni loyer ni charges ne sont demandés : le loyer se gère appartement par appartement.'
    ],
    faq: [
      {
        q: 'Puis-je passer un bien de la vente à la location ?',
        a: "Oui, en changeant le type d'opération puis en ressaisissant le montant : le même champ porte le prix de vente ou le loyer."
      },
      {
        q: 'Le prix est-il obligatoire ?',
        a: "Seul le type d'opération l'est. Le prix devient nécessaire pour publier le bien."
      },
      {
        q: 'Où est le dépôt de garantie ?',
        a: "Il n'apparaît que pour un bien en « Location »."
      }
    ],
    related: [{ label: 'Publication', helpId: 'commercial.biens.modifier.publication' }],
    keywords: ['prix', 'loyer', 'charges', 'dépôt de garantie', 'caution', 'vente', 'location', 'fcfa']
  },
  {
    id: 'commercial.biens.modifier.medias',
    kind: 'section',
    title: 'Photos et Vidéos',
    summary:
      'Ajoutez, classez et supprimez les photos et les vidéos du bien. Ces actions agissent tout de suite, sans passer par « Mettre à jour ».',
    steps: [
      {
        title: 'Ajouter',
        detail: 'Glissez vos fichiers dans la zone ou cliquez sur « Sélectionner des fichiers ».'
      },
      {
        title: 'Définir la photo principale',
        detail: "Survolez une photo et cliquez sur l'étoile : elle reçoit le badge « Principal »."
      },
      {
        title: 'Réordonner',
        detail: 'Faites glisser une photo ou une vidéo à sa nouvelle place.'
      },
      {
        title: 'Supprimer',
        detail: 'Survolez le fichier, cliquez sur la corbeille puis confirmez avec « Supprimer ».'
      }
    ],
    howToRead: {
      notes: [
        'Photos : JPEG, PNG ou WebP. Vidéos : MP4, WebM ou QuickTime. 50 Mo maximum, comme indiqué sous la zone de dépôt.',
        'Seule une photo peut être « Principal ». Elle sert de couverture sur la carte du bien.'
      ]
    },
    consequences: [
      "Une photo ajoutée n'est pas principale d'office. Sans photo principale, le bien ne peut pas être publié.",
      "Supprimer un fichier l'efface définitivement."
    ],
    faq: [
      {
        q: 'Quelle photo apparaît sur la carte de la liste ?',
        a: "La photo principale ; à défaut, la première photo dans l'ordre d'affichage."
      },
      {
        q: 'Pourquoi mon fichier est-il refusé ?',
        a: "Son format n'est pas accepté, ou son contenu ne correspond pas à une photo ou à une vidéo valide."
      },
      {
        q: 'Une vidéo peut-elle être la photo principale ?',
        a: 'Non, seule une photo peut être « Principal ».'
      }
    ],
    permissions: {
      note: 'Demande « Modifier les biens ».'
    },
    related: [{ label: 'Publication', helpId: 'commercial.biens.modifier.publication' }],
    keywords: ['photo', 'vidéo', 'galerie', 'photo principale', 'image', 'télécharger']
  },

  // ---------------------------------------------------------------------------
  // Calendrier des visites
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.biens.visites',
    kind: 'page',
    title: 'Calendrier des visites',
    summary:
      "Retrouvez ici toutes les visites de biens planifiées par votre agence, jour par jour. L'écran sert à consulter : on ne planifie pas une visite depuis cette page.",
    purpose:
      "Le calendrier donne la vue d'ensemble des visites à venir : à quelle heure, pour quel bien, avec quel contact et quel collaborateur. Les visites se planifient depuis la fiche du bien.",
    steps: [
      {
        title: 'Parcourir les jours',
        detail: 'Les visites sont groupées par date, avec le jour écrit en toutes lettres.'
      },
      {
        title: 'Filtrer par collaborateur',
        detail:
          'Choisissez un collaborateur dans « Filtrer par collaborateur » pour ne voir que ses visites. Videz le champ pour tout revoir.'
      },
      {
        title: 'Ouvrir le bien',
        detail: 'Cliquez sur le titre du bien pour ouvrir sa fiche.'
      }
    ],
    consequences: [
      "Le calendrier couvre la période qui commence maintenant et dure 30 jours. Il n'est pas possible de la changer sur cet écran, et les visites passées n'y figurent pas.",
      "Les visites annulées ou terminées s'y affichent aussi, avec leur statut."
    ],
    faq: [
      {
        q: 'Pourquoi ne vois-je aucune visite ?',
        a: "« Aucune visite planifiée » s'affiche quand rien n'est prévu dans les 30 prochains jours, ou quand le collaborateur choisi n'a aucune visite."
      },
      {
        q: "Comment planifier ou changer le statut d'une visite ?",
        a: 'Depuis la fiche du bien concerné. Le calendrier se met à jour ensuite.'
      },
      {
        q: 'Pourquoi une visite passée a-t-elle disparu ?',
        a: 'Le calendrier ne montre que les visites à venir, sur 30 jours.'
      }
    ],
    permissions: {
      note: 'Consulter le calendrier demande « Voir les biens » ; planifier une visite demande « Planifier des visites ».'
    },
    related: [
      { label: 'Comment lire une visite', helpId: 'commercial.biens.visites.calendrier' },
      { label: 'Liste des biens', helpId: 'commercial.biens.liste' }
    ],
    keywords: ['visite', 'visites', 'rendez-vous', 'agenda', 'calendrier', 'collaborateur']
  },
  {
    id: 'commercial.biens.visites.calendrier',
    kind: 'section',
    title: 'Visites planifiées',
    summary:
      "Chaque carte est une visite : heure, durée, statut, bien, lieu, collaborateur, contact, type d'affaire et notes. Le filtre par collaborateur restreint la liste.",
    howToRead: {
      statuses: [
        { value: 'SCHEDULED', label: 'Planifié', description: 'La visite est prévue.' },
        { value: 'CONFIRMED', label: 'Confirmé', description: 'La visite est confirmée.' },
        { value: 'DONE', label: 'Terminé', description: 'La visite a eu lieu.' },
        { value: 'NO_SHOW', label: 'Absent', description: "Le visiteur ne s'est pas présenté." },
        { value: 'CANCELED', label: 'Annulé', description: 'La visite est annulée.' }
      ],
      notes: [
        "En haut de chaque visite : l'heure, la durée en minutes quand elle est connue, et le statut.",
        "Dessous : le titre du bien (ou son adresse), le lieu de rendez-vous, « Assigné à » avec le collaborateur, le nom du contact, le type d'affaire liée et les notes."
      ]
    },
    related: [{ label: "Vue d'ensemble du calendrier", helpId: 'commercial.biens.visites' }],
    keywords: ['visite', 'statut', 'confirmé', 'annulé', 'absent', 'terminé']
  }
];

export default entries;
