import type { HelpEntry } from '../../../types';

/** Zone « fiche-bien » du module « commercial » (fr) : fiche détail d'un bien et ses onglets. */
const entries: HelpEntry[] = [
  // ───────────────────────── Fiche d'un bien (page) ─────────────────────────
  {
    id: 'commercial.biens.detail',
    kind: 'page',
    title: "Fiche d'un bien",
    summary:
      "La fiche réunit ce que votre agence sait d'un bien : description, propriétaires, vente, documents, mandat, visites et maintenance. Le prix et les chiffres clés restent visibles au-dessus des onglets.",
    purpose:
      "C'est le dossier du bien. Chaque onglet répond à une question : ce qu'est le bien, à quoi il ressemble, ce qu'il contient, ce qui s'y passe, ses papiers. Les onglets affichés dépendent du type de bien, de son propriétaire et du pack de votre agence.",
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: 'Fiche en préparation.' },
        { value: 'UNDER_REVIEW', label: 'En révision', description: 'Fiche en cours de vérification.' },
        { value: 'AVAILABLE', label: 'Disponible', description: 'Bien proposé et libre.' },
        { value: 'RESERVED', label: 'Réservé', description: 'Mis de côté pour un client.' },
        { value: 'UNDER_OFFER', label: 'Sous offre', description: 'Une offre est en cours.' },
        { value: 'RENTED', label: 'Loué', description: 'Un bail le met à cet état.' },
        { value: 'SOLD', label: 'Vendu', description: 'Le bien est vendu.' },
        { value: 'ARCHIVED', label: 'Archivé', description: 'Sorti du portefeuille actif.' }
      ],
      notes: [
        "Sous le titre : le statut du bien (et « Publié » s'il est en ligne), puis son adresse. Le bandeau donne le prix, la mise en marché et les chiffres clés.",
        "« Lots » n'existe que pour un immeuble. « Mandat de gestion » concerne un bien de client ou de l'agence. « Visites » demande le pack CRM ; « Patrimoine », « Assurances et sinistres » et « Carnet d'entretien », le pack Patrimoine."
      ]
    },
    steps: [
      { title: 'Lire le bandeau', detail: 'Titre, statut, adresse, prix, chiffres clés.' },
      { title: 'Ouvrir un onglet', detail: 'Cliquez sur son nom : chacun a son « ? ».' },
      { title: 'Modifier le bien', detail: 'Bouton « Modifier » : le formulaire permet aussi de changer le statut.' },
      {
        title: 'Autres actions',
        detail:
          'Menu à côté de « Modifier » : « Générer un contrat de bail » (pack Location), « Créer une campagne newsletter » (pack CRM).'
      }
    ],
    consequences: [
      "« Générer un contrat de bail » ouvre le formulaire de bail avec ce bien déjà choisi : rien n'est créé tant que vous n'enregistrez pas. Chaque onglet enregistre ses propres actions ; il n'y a pas d'enregistrement global."
    ],
    faq: [
      { q: "Pourquoi n'ai-je pas l'onglet « Lots » ?", a: "Il n'existe que pour un bien de type « Immeuble »." },
      {
        q: 'Où sont les photos, et comment en ajouter ?',
        a: "Dans l'onglet « Médias », en lecture seule. Pour en ajouter ou en retirer, passez par « Modifier »."
      },
      {
        q: 'Comment changer le statut du bien ?',
        a: 'Bouton « Modifier », puis champ « Statut ».'
      }
    ],
    permissions: {
      note: 'Voir la fiche demande « Voir les biens » ; « Modifier » et les actions des onglets demandent « Modifier les biens » ; planifier une visite demande « Planifier des visites ».'
    },
    related: [
      { label: 'Liste des biens', helpId: 'commercial.biens.liste' },
      { label: 'Modifier un bien', helpId: 'commercial.biens.modifier' },
      { label: 'Calendrier des visites', helpId: 'commercial.biens.visites' }
    ],
    keywords: ['bien', 'fiche', 'détail', 'propriété', 'immeuble', 'onglet', 'statut', 'prix', 'villa', 'appartement'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'fiche-bien-synthese',
          title: 'Prix et chiffres clés',
          description: "Ce bandeau reste visible quel que soit l'onglet."
        },
        {
          target: 'fiche-bien-onglets',
          title: 'Les onglets',
          description: "Passez d'un onglet à l'autre : médias, documents, mandat, visites."
        },
        {
          target: 'fiche-bien-informations',
          title: 'Les informations du bien',
          description: 'Référence, type, propriétaire, mise en marché et disponibilité.'
        }
      ]
    }
  },

  // ───────────────────────── Aperçu ─────────────────────────
  {
    id: 'commercial.biens.detail.apercu',
    kind: 'section',
    title: 'Onglet Aperçu',
    summary:
      "L'aperçu décrit le bien : description, caractéristiques, informations générales, propriétaires, vente et localisation. C'est l'onglet ouvert par défaut.",
    howToRead: {
      notes: [
        "« Caractéristiques » n'affiche que les champs renseignés (surface, surface utile, surface du terrain, pièces, chambres, salles de bain, ameublement) : une ligne absente veut dire qu'elle est vide.",
        '« Informations » : Référence, Type de bien, Propriété de, Mise en marché (Vente, Location, Court terme) et Disponibilité (Disponible, Indisponible, Bientôt disponible). Pour un terrain, un lien « Régularisation foncière » apparaît si votre pack inclut Patrimoine.',
        "« Localisation » : l'adresse, la zone et, si elles sont connues, les coordonnées GPS.",
        'Les cartes « Indivision » et « Vente » sont expliquées dans leurs propres fiches.'
      ]
    },
    faq: [
      {
        q: 'Comment corriger une information ?',
        a: 'Cet onglet est en lecture seule : utilisez le bouton « Modifier » en haut de la fiche.'
      },
      {
        q: 'Le prix est-il dans cet onglet ?',
        a: "Non, il est dans le bandeau au-dessus des onglets. Pour un immeuble sans prix, le bandeau n'affiche pas de prix."
      }
    ],
    related: [
      { label: 'Indivision et quotes-parts', helpId: 'commercial.biens.detail.indivision' },
      { label: 'Vente du bien', helpId: 'commercial.biens.detail.vente' }
    ],
    keywords: ['description', 'caractéristiques', 'surface', 'localisation', 'adresse', 'référence', 'type de bien']
  },

  // ───────────────────────── Indivision ─────────────────────────
  {
    id: 'commercial.biens.detail.indivision',
    kind: 'section',
    title: 'Indivision et quotes-parts',
    summary:
      'Cette carte dit qui possède le bien et dans quelle proportion. Sans quotes-parts, le bien appartient en entier au propriétaire désigné sur ses baux.',
    purpose:
      'Quand un bien appartient à plusieurs propriétaires, vous fixez la part de chacun (en %). Les revenus et dépenses du bien sont ensuite répartis selon ces parts.',
    steps: [
      {
        title: "Ouvrir l'indivision",
        detail: "Cliquez sur « Définir l'indivision » (ou « Modifier » s'il y a déjà des parts)."
      },
      { title: 'Ajouter les propriétaires', detail: '« Ajouter un propriétaire », puis choisissez-le dans la liste.' },
      {
        title: 'Saisir les parts',
        detail: 'Écrivez la part de chacun en %, ou cliquez sur « Répartir à parts égales ».'
      },
      { title: 'Vérifier le total', detail: 'Le « Total » doit être exactement 100 % (il passe au vert).' },
      { title: 'Enregistrer', detail: 'Cliquez sur « Enregistrer ».' }
    ],
    consequences: [
      'Les loyers, honoraires et dépenses du bien sont répartis selon ces parts dans le compte et le relevé de chaque propriétaire. Les reversements déjà faits ne changent pas.',
      "« Supprimer l'indivision » (avec confirmation) remet le bien en entier au propriétaire désigné sur les baux.",
      'Tant que les parts sont vides, rien ne change par rapport à un bien à propriétaire unique.'
    ],
    faq: [
      {
        q: 'Pourquoi « Enregistrer » est-il grisé ?',
        a: 'Chaque ligne doit avoir un propriétaire et une part supérieure à 0, aucun propriétaire ne peut apparaître deux fois, et le total doit faire 100 %.'
      },
      {
        q: "Un propriétaire n'apparaît pas dans la liste.",
        a: "La liste propose les propriétaires clients de votre agence. Un propriétaire doit d'abord être enregistré comme client de l'agence."
      },
      {
        q: 'Comment partager à trois sans arrondi ?',
        a: '« Répartir à parts égales » met 33,3333 % aux deux premiers et 33,3334 % au dernier, pour tomber juste sur 100 %.'
      }
    ],
    permissions: {
      note: "Voir la carte demande « Voir les biens » ; l'enregistrer ou la supprimer demande « Modifier les biens ». Elle est masquée sur un compte limité à ses propres biens."
    },
    related: [{ label: 'Mandat de gestion', helpId: 'commercial.biens.detail.mandats' }],
    keywords: ['indivision', 'quote-part', 'quotes-parts', 'copropriétaires', 'pourcentage', 'propriétaires', 'parts']
  },

  // ───────────────────────── Vente ─────────────────────────
  {
    id: 'commercial.biens.detail.vente',
    kind: 'section',
    title: 'Vente du bien',
    summary:
      "Cette carte résume la vente du bien : son mandat de vente, le prix demandé, l'offre retenue ou la dernière offre, et le compromis. Elle est en lecture seule.",
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'Le mandat de vente est en cours.' },
        { value: 'EXPIRED', label: 'Expiré', description: 'La date de fin du mandat est dépassée.' },
        { value: 'REVOKED', label: 'Révoqué', description: 'Le mandat a été retiré.' },
        { value: 'COMPLETED', label: 'Vendu', description: 'La vente est conclue.' }
      ],
      notes: [
        'La carte montre le mandat « Actif » du bien, sinon le premier de la liste.',
        "« Offre retenue » apparaît quand une offre est acceptée ; sinon la ligne s'appelle « Dernière offre » et affiche son statut.",
        '« Compromis » affiche le statut du compromis, ou « Aucun compromis ».'
      ]
    },
    steps: [
      {
        title: 'Créer un mandat de vente',
        detail: "Sans mandat, cliquez sur « Créer un mandat de vente » : le formulaire des ventes s'ouvre avec ce bien."
      },
      {
        title: 'Suivre la vente',
        detail: 'Avec un mandat, « Voir la fiche mandat » ouvre le détail du mandat de vente.'
      }
    ],
    consequences: ['La carte ne modifie rien : le mandat, les offres et le compromis se gèrent dans le module Ventes.'],
    faq: [
      {
        q: 'Pourquoi cette carte est-elle absente ?',
        a: "Elle fait partie du pack Ventes de votre agence ; sans ce pack, elle n'est pas affichée."
      },
      {
        q: "Pourquoi le mandat est-il « Expiré » alors que je ne l'ai pas touché ?",
        a: "Un mandat « Actif » dont la date de fin est dépassée s'affiche « Expiré »."
      }
    ],
    permissions: { feature: 'SALES' },
    related: [{ label: 'Fiche du bien', helpId: 'commercial.biens.detail' }],
    keywords: ['vente', 'mandat de vente', 'offre', 'compromis', 'prix demandé', 'acheteur']
  },

  // ───────────────────────── Médias ─────────────────────────
  {
    id: 'commercial.biens.detail.medias',
    kind: 'section',
    title: 'Onglet Médias',
    summary: "Les photos et les vidéos du bien. Le nombre de médias est indiqué sur l'onglet.",
    howToRead: {
      notes: [
        "Les photos défilent dans un diaporama, la photo principale en premier. Survolez une photo et cliquez sur « Voir » pour l'agrandir.",
        'Les vidéos se lisent directement dans la carte « Vidéos ».',
        'Sans média, la carte affiche « Aucune photo pour ce bien » ou « Aucune vidéo pour ce bien ».'
      ]
    },
    faq: [
      {
        q: 'Comment ajouter, retirer ou changer la photo principale ?',
        a: 'Cet onglet est en lecture seule. Passez par le bouton « Modifier » en haut de la fiche.'
      }
    ],
    related: [{ label: 'Modifier un bien', helpId: 'commercial.biens.modifier' }],
    keywords: ['photos', 'vidéos', 'images', 'galerie', 'médias']
  },

  // ───────────────────────── Lots (immeuble) ─────────────────────────
  {
    id: 'commercial.biens.detail.lots',
    kind: 'section',
    title: 'Onglet Lots (immeuble)',
    summary:
      "Pour un immeuble, cet onglet liste ses appartements et permet d'en créer plusieurs d'un coup. Chaque appartement est un bien à part entière, avec sa propre fiche.",
    steps: [
      { title: 'Voir les appartements', detail: 'Le titre « Appartements » indique leur nombre.' },
      {
        title: 'Rechercher',
        detail: 'Tapez un titre, une référence ou une adresse, ou filtrez par statut, prix (FCFA) et nombre de pièces.'
      },
      { title: 'Ouvrir un appartement', detail: 'Cliquez sur « Voir » (ou sur la carte, sur téléphone).' },
      {
        title: 'Créer des appartements',
        detail: 'Cliquez sur « Ajouter un appartement » (voir la fiche de la création).'
      }
    ],
    consequences: [
      "Chaque appartement créé est enregistré comme un bien de type « Appartement » rattaché à l'immeuble."
    ],
    faq: [
      {
        q: 'Peut-on exporter la liste ?',
        a: "Oui, depuis la barre du tableau : l'export reprend les appartements filtrés, pas seulement la page affichée."
      }
    ],
    related: [
      { label: 'Tableau des appartements', helpId: 'commercial.biens.detail.lots.tableau' },
      { label: 'Créer des appartements', helpId: 'commercial.biens.detail.lots.creation' }
    ],
    keywords: ['immeuble', 'lots', 'appartements', 'logements', 'unités']
  },
  {
    id: 'commercial.biens.detail.lots.tableau',
    kind: 'table',
    title: 'Tableau des appartements',
    summary:
      "Chaque ligne est un appartement de l'immeuble : titre, surface, pièces, prix et statut. Sur téléphone, le tableau devient une liste de cartes.",
    howToRead: {
      columns: [
        { key: 'title', label: 'Appartement', description: "Le titre de l'appartement." },
        { key: 'surfaceArea', label: 'Surface', description: 'La surface en m².' },
        { key: 'rooms', label: 'Pièces', description: 'Le nombre de pièces.' },
        { key: 'price', label: 'Prix', description: 'Le prix en FCFA.' },
        { key: 'status', label: 'Statut', description: "L'état de l'appartement (voir ci-dessous)." },
        { key: 'actions', label: 'Actions', description: '« Voir » ouvre la fiche de cet appartement.' }
      ],
      statuses: [
        { value: 'AVAILABLE', label: 'Disponible', description: 'Appartement libre.' },
        { value: 'RESERVED', label: 'Réservé', description: 'Mis de côté pour un client.' },
        { value: 'UNDER_OFFER', label: 'Sous offre', description: 'Une offre est en cours.' },
        { value: 'RENTED', label: 'Loué', description: 'Appartement loué.' },
        { value: 'SOLD', label: 'Vendu', description: 'Appartement vendu.' },
        { value: 'ARCHIVED', label: 'Archivé', description: 'Sorti du portefeuille actif.' }
      ]
    },
    faq: [
      {
        q: 'Pourquoi le tableau est-il vide ?',
        a: "L'immeuble ne contient encore aucun appartement : cliquez sur « Ajouter un appartement »."
      }
    ],
    related: [{ label: 'Créer des appartements', helpId: 'commercial.biens.detail.lots.creation' }],
    keywords: ['appartements', 'lots', 'liste', 'statut', 'prix']
  },
  {
    id: 'commercial.biens.detail.lots.creation',
    kind: 'section',
    title: 'Créer des appartements',
    summary:
      "Cette fenêtre crée en une fois jusqu'à 100 appartements identiques par groupe, et plusieurs groupes à la suite. Idéal pour un immeuble neuf.",
    purpose:
      "Vous décrivez un groupe (exemple : 12 appartements de 3 pièces à 50 000 000 FCFA) et l'application crée un appartement par unité, numérotés à partir du titre de base.",
    steps: [
      { title: 'Ouvrir la fenêtre', detail: 'Cliquez sur « Ajouter un appartement ».' },
      {
        title: 'Décrire le groupe',
        detail:
          "Renseignez « Nombre d'appartements » (de 1 à 100), « Titre de base » et « Nombre de pièces » (obligatoires), puis, si vous le souhaitez, surface, salles de bain, prix, ameublement et statut."
      },
      {
        title: 'Ajouter des médias',
        detail: 'Sous « Photos et Vidéos », les fichiers ajoutés sont partagés par tous les appartements du groupe.'
      },
      {
        title: "Ajouter d'autres groupes",
        detail: "« Ajouter un groupe d'appartements » pour une autre typologie ; « Supprimer » retire un groupe."
      },
      { title: 'Valider', detail: 'Validez la fenêtre : les appartements sont créés.' }
    ],
    consequences: [
      "Avec plusieurs appartements, le titre est suivi d'un numéro : « Appartement 1 », « Appartement 2 »…",
      'Le nombre de chambres est calculé : pièces moins une (le salon).',
      "Chaque appartement reprend de l'immeuble l'adresse, la zone, les coordonnées, le type de propriétaire et la devise (FCFA à défaut). Le statut est « Disponible » par défaut, l'ameublement « Non meublé ».",
      "Si certains appartements n'ont pas pu être créés, un message indique combien ont réussi et la raison des échecs ; les autres restent créés."
    ],
    faq: [
      {
        q: 'Peut-on annuler une création en masse ?',
        a: 'Pas depuis cette fenêtre : chaque appartement devient un bien à part, que vous gérez ensuite depuis sa fiche.'
      }
    ],
    permissions: { note: 'Demande le droit « Créer des biens ».' },
    related: [{ label: 'Tableau des appartements', helpId: 'commercial.biens.detail.lots.tableau' }],
    keywords: ['créer', 'appartements', 'en masse', 'programme neuf', 'lots', 'groupe']
  },

  // ───────────────────────── Maintenance ─────────────────────────
  {
    id: 'commercial.biens.detail.maintenance',
    kind: 'section',
    title: 'Onglet Maintenance',
    summary:
      "L'historique des tickets de maintenance ouverts pour ce bien. L'onglet sert à consulter ; chaque ticket s'ouvre dans sa propre page.",
    steps: [
      {
        title: 'Rechercher ou filtrer',
        detail: 'Par texte (titre, description, prestataire) ou par statut, catégorie, priorité et date de création.'
      },
      { title: 'Ouvrir un ticket', detail: 'Cliquez sur son titre.' }
    ],
    faq: [
      {
        q: 'Pourquoi cet onglet est-il vide ?',
        a: "Aucun ticket de maintenance n'a encore été déclaré pour ce bien : « Aucun ticket de maintenance pour cette propriété »."
      }
    ],
    related: [{ label: 'Tableau des tickets', helpId: 'commercial.biens.detail.maintenance.tableau' }],
    keywords: ['maintenance', 'panne', 'ticket', 'réparation', 'travaux', 'prestataire']
  },
  {
    id: 'commercial.biens.detail.maintenance.tableau',
    kind: 'table',
    title: 'Historique de maintenance',
    summary:
      'Chaque ligne est un ticket de maintenance du bien : titre, catégorie, priorité, statut, prestataire et date de création.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Titre', description: "Le titre du ticket ; cliquez dessus pour l'ouvrir." },
        { key: 'category', label: 'Catégorie', description: 'Plomberie, Électricité, Climatisation ou Autre.' },
        { key: 'priority', label: 'Priorité', description: 'Faible, Moyenne, Élevée ou Urgente.' },
        { key: 'status', label: 'Statut', description: "L'avancement du ticket (voir ci-dessous)." },
        {
          key: 'assignedVendor',
          label: 'Prestataire',
          description: "Le prestataire chargé de l'intervention ; un tiret s'il n'y en a pas encore."
        },
        { key: 'createdAt', label: 'Date de création', description: 'Le jour où le ticket a été créé.' }
      ],
      statuses: [
        { value: 'DECLARED', label: 'Déclaré', description: 'Le problème est signalé.' },
        { value: 'ASSIGNED', label: 'Assigné', description: 'Un prestataire est désigné.' },
        { value: 'IN_PROGRESS', label: 'En cours', description: "L'intervention est en cours." },
        { value: 'RESOLVED', label: 'Résolu', description: 'Le problème est réglé.' },
        { value: 'CANCELED', label: 'Annulé', description: 'Le ticket est annulé.' }
      ]
    },
    related: [{ label: 'Onglet Maintenance', helpId: 'commercial.biens.detail.maintenance' }],
    keywords: ['tickets', 'maintenance', 'priorité', 'statut', 'prestataire']
  },

  // ───────────────────────── Documents ─────────────────────────
  {
    id: 'commercial.biens.detail.documents',
    kind: 'section',
    title: 'Onglet Documents',
    summary:
      'Le coffre-fort documentaire du bien : titre de propriété, plans, diagnostics, assurance et autres pièces. Vous pouvez en ajouter, les télécharger ou les supprimer.',
    howToRead: {
      columns: [
        { key: 'fileName', label: 'Nom du fichier', description: 'Le nom du fichier envoyé.' },
        { key: 'documentType', label: 'Type', description: "Le type de document choisi à l'envoi." },
        {
          key: 'expirationDate',
          label: 'Expiration',
          description:
            "La date d'expiration et son état : « Valide », « Expire dans N j » (30 jours ou moins), « Expiré » ou « Sans expiration »."
        },
        { key: 'createdAt', label: 'Ajouté le', description: "La date d'ajout du document." },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Télécharger » récupère le fichier ; « Supprimer » le retire.'
        }
      ],
      notes: ["Le champ de recherche filtre par nom ou type, et par état d'expiration."]
    },
    steps: [
      { title: 'Ajouter', detail: "Cliquez sur « Ajouter un document » (voir la fiche de l'ajout)." },
      { title: 'Télécharger', detail: 'Bouton « Télécharger » de la ligne.' },
      { title: 'Supprimer', detail: 'Bouton « Supprimer », puis confirmez « Supprimer ce document ? ».' }
    ],
    consequences: [
      'La suppression est irréversible : le fichier et sa ligne sont effacés.',
      'Les documents ne sont jamais accessibles par un simple lien : le téléchargement passe par votre compte et vérifie vos droits.'
    ],
    faq: [
      {
        q: 'Quels fichiers puis-je envoyer ?',
        a: "PDF, DOC, DOCX, JPEG, PNG et TIFF, jusqu'à 10 Mo."
      },
      {
        q: 'Je ne vois pas « Ajouter un document » ou « Supprimer ».',
        a: 'Ces actions demandent le droit « Modifier les biens » ; consulter et télécharger demandent « Voir les biens ».'
      }
    ],
    permissions: {
      note: 'Consulter et télécharger : « Voir les biens » ; ajouter et supprimer : « Modifier les biens ».'
    },
    related: [{ label: 'Ajouter un document', helpId: 'commercial.biens.detail.documents.ajout' }],
    keywords: [
      'documents',
      'coffre-fort',
      'titre de propriété',
      'plan',
      'diagnostic',
      'expiration',
      'fichier',
      'pièces'
    ]
  },
  {
    id: 'commercial.biens.detail.documents.ajout',
    kind: 'section',
    title: 'Ajouter un document',
    summary:
      "Ce formulaire envoie un fichier dans le coffre-fort du bien, avec son type, sa date d'expiration éventuelle et la mention « requis ».",
    steps: [
      {
        title: 'Choisir le fichier',
        detail: '« Sélectionner un fichier » (PDF, DOC, DOCX, JPEG, PNG, TIFF, 10 Mo au plus).'
      },
      {
        title: 'Choisir le type',
        detail: '« Type de document » : titre de propriété, plan, acte notarié, assurance, diagnostic, mandat, autre…'
      },
      {
        title: "Indiquer l'expiration",
        detail: "« Date d'expiration (optionnel) » pour une assurance ou un diagnostic, par exemple."
      },
      { title: 'Marquer comme requis', detail: 'Cochez « Document requis » pour une pièce indispensable au dossier.' },
      {
        title: 'Envoyer',
        detail: 'Cliquez sur « Télécharger le document » : ce bouton envoie le fichier vers la fiche.'
      }
    ],
    consequences: [
      "Après l'envoi, le formulaire se ferme et le document apparaît dans la liste, avec le message « Document ajouté. »."
    ],
    faq: [
      {
        q: 'Le bouton « Télécharger le document » reste grisé.',
        a: "Il faut d'abord choisir un fichier avec « Sélectionner un fichier »."
      }
    ],
    permissions: { note: 'Demande le droit « Modifier les biens ».' },
    related: [{ label: 'Onglet Documents', helpId: 'commercial.biens.detail.documents' }],
    keywords: ['ajouter', 'envoyer', 'téléverser', 'document requis', 'expiration']
  },

  // ───────────────────────── Mandat de gestion ─────────────────────────
  {
    id: 'commercial.biens.detail.mandats',
    kind: 'section',
    title: 'Mandat de gestion',
    summary:
      "Le mandat de gestion est l'accord par lequel un propriétaire client confie son bien à votre agence. Vous le créez, le faites signer ou le résiliez ici.",
    purpose:
      "Un bien de client n'est géré par l'agence que sous mandat. Un seul mandat actif est possible par bien et par agence.",
    steps: [
      {
        title: 'Créer le mandat',
        detail:
          "Onglet « Mandat de gestion » : « Créer un mandat » (dans la carte de l'Aperçu : « Créer un mandat de gestion »)."
      },
      {
        title: 'Remplir le formulaire',
        detail:
          "« Date de début » (obligatoire, aujourd'hui par défaut), « Date de fin (optionnel) » qui ne peut précéder le début, et « Notes (optionnel) »."
      },
      { title: 'Valider', detail: 'Cliquez sur « Créer le mandat ».' },
      {
        title: 'Faire signer',
        detail: "Bouton « Signatures » de la ligne : le panneau permet d'envoyer le mandat à signer."
      },
      {
        title: 'Résilier',
        detail: "« Résilier » dans l'onglet (« Révoquer le mandat » dans la carte de l'Aperçu), puis confirmez."
      }
    ],
    consequences: [
      "Résilier met fin au mandat : il n'apparaît plus dans l'onglet et aucun bouton ne permet de le réactiver. Il n'est pas effacé. Pour reprendre la gestion, créez un nouveau mandat.",
      'Un mandat résilié ne peut plus être signé : ses demandes de signature en cours sont annulées.',
      "Création et résiliation sont enregistrées dans le journal d'audit de l'agence."
    ],
    faq: [
      {
        q: '« Un mandat actif existe déjà pour cette agence et ce bien »',
        a: "Un seul mandat actif est permis. Résiliez l'actuel avant d'en créer un autre."
      },
      {
        q: '« Propriétaire introuvable »',
        a: 'Le bien doit avoir un propriétaire qui est client de votre agence. Vérifiez le propriétaire du bien dans « Modifier ».'
      },
      {
        q: "Je n'ai pas d'onglet « Mandat de gestion ».",
        a: "Il n'existe que pour un bien de client ou de l'agence, et est masqué sur un compte limité à ses propres biens."
      }
    ],
    permissions: { note: 'Créer et résilier demandent « Modifier les biens » ; consulter demande « Voir les biens ».' },
    related: [
      { label: 'Tableau des mandats', helpId: 'commercial.biens.detail.mandats.tableau' },
      { label: 'Confier un bien à un propriétaire', helpId: 'commercial.biens.detail.confier' }
    ],
    keywords: ['mandat', 'gestion', 'propriétaire', 'résilier', 'révoquer', 'signature', 'contrat de gestion']
  },
  {
    id: 'commercial.biens.detail.mandats.tableau',
    kind: 'table',
    title: 'Tableau des mandats de gestion',
    summary: 'Il liste le mandat de gestion actif du bien : propriétaire, dates, notes et signature.',
    howToRead: {
      columns: [
        { key: 'owner', label: 'Propriétaire', description: 'Le propriétaire qui a confié le bien.' },
        { key: 'startDate', label: 'Début', description: 'La date de début du mandat.' },
        { key: 'endDate', label: 'Fin', description: "La date de fin ; un tiret si le mandat n'a pas de fin." },
        { key: 'notes', label: 'Notes', description: 'Vos notes sur le mandat.' },
        {
          key: 'signature',
          label: 'Signature',
          description: '« Signé le » suivi de la date quand le mandat est signé, sinon un tiret.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Signatures » ouvre le panneau de signature ; « Résilier » met fin au mandat.'
        }
      ],
      notes: ['Seul le mandat actif est listé : après une résiliation, la ligne disparaît.']
    },
    faq: [
      {
        q: 'Où est passé mon ancien mandat ?',
        a: "Un mandat résilié ne figure plus dans cette liste. Il est conservé par l'agence mais n'est plus consultable ici."
      }
    ],
    related: [{ label: 'Mandat de gestion', helpId: 'commercial.biens.detail.mandats' }],
    keywords: ['mandats', 'liste', 'signature', 'résiliation']
  },
  {
    id: 'commercial.biens.detail.confier',
    kind: 'section',
    title: 'Confier ce bien à un propriétaire',
    summary:
      "Un bien qui appartient à l'agence peut devenir un bien de client : choisissez le propriétaire, puis créez son mandat de gestion.",
    steps: [
      {
        title: 'Choisir le propriétaire',
        detail: '« Sélectionner un propriétaire » : la liste reprend vos contacts ayant un rôle actif.'
      },
      { title: 'Confier', detail: 'Cliquez sur « Confier ce bien ».' },
      {
        title: 'Créer le mandat',
        detail: "La fiche se recharge : l'onglet « Mandat de gestion » propose alors « Créer un mandat »."
      }
    ],
    consequences: [
      "Le bien n'appartient plus à l'agence mais au client choisi. Le changement est enregistré tout de suite, avec le message « Bien confié au propriétaire : vous pouvez maintenant créer le mandat. »."
    ],
    faq: [
      {
        q: 'Le propriétaire que je cherche est absent.',
        a: "La liste ne reprend que les contacts qui ont un rôle actif. Ajoutez-lui d'abord un rôle dans sa fiche contact."
      }
    ],
    permissions: { note: 'Demande le droit « Modifier les biens ».' },
    related: [{ label: 'Mandat de gestion', helpId: 'commercial.biens.detail.mandats' }],
    keywords: ['confier', 'propriétaire', 'bien de client', 'agence', 'transfert']
  },

  // ───────────────────────── Visites ─────────────────────────
  {
    id: 'commercial.biens.detail.visites',
    kind: 'section',
    title: 'Onglet Visites',
    summary:
      "Les visites prévues et passées de ce bien, avec un formulaire pour en planifier une nouvelle. L'onglet fait partie du pack CRM.",
    steps: [
      { title: 'Voir les visites', detail: 'La carte « Visites du bien » liste les visites déjà programmées.' },
      {
        title: 'Planifier',
        detail: 'Remplissez la carte « Planifier une visite » en dessous (voir sa fiche).'
      },
      {
        title: 'Mettre à jour le statut',
        detail: 'Dans la colonne « Statut », choisissez Planifié, Confirmé, Absent ou Annulé.'
      },
      {
        title: 'Clôturer',
        detail: 'Bouton « Clôturer » : saisissez un compte-rendu (facultatif) puis « Marquer comme terminée ».'
      }
    ],
    consequences: [
      'Clôturer une visite la met à « Terminé » et, si un contact y est lié, crée une activité « Visite » dans sa fiche contact (avec le compte-rendu).',
      "Une visite « Terminée » n'est plus modifiable ici. Une visite annulée ou « Absent » peut être remise à « Planifié » ou « Confirmé » si son créneau est encore libre."
    ],
    permissions: {
      feature: 'CRM',
      note: 'Consulter demande « Voir les biens » ; planifier, changer le statut et clôturer demandent « Planifier des visites ».'
    },
    related: [
      { label: 'Tableau des visites', helpId: 'commercial.biens.detail.visites.tableau' },
      { label: 'Planifier une visite', helpId: 'commercial.biens.detail.planifier-visite' },
      { label: 'Calendrier des visites', helpId: 'commercial.biens.visites' }
    ],
    keywords: ['visites', 'rendez-vous', 'planning', 'visiter', 'clôturer', 'compte-rendu']
  },
  {
    id: 'commercial.biens.detail.visites.tableau',
    kind: 'table',
    title: 'Tableau des visites du bien',
    summary: 'Chaque ligne est une visite de ce bien : date, contact, objectif, personne assignée, statut et notes.',
    howToRead: {
      columns: [
        { key: 'scheduledAt', label: 'Date', description: "La date et l'heure de la visite." },
        {
          key: 'contact',
          label: 'Contact',
          description: 'Le visiteur (prénom et nom du contact) ; un tiret si aucun.'
        },
        {
          key: 'goal',
          label: 'Objectif',
          description: 'Le but de la visite : prise de contact, évaluation, négociation, signature du contrat…'
        },
        { key: 'assignedTo', label: 'Assigné à', description: 'Le collaborateur qui fait la visite.' },
        {
          key: 'status',
          label: 'Statut',
          description:
            "L'état de la visite ; il se change directement dans la cellule tant que la visite n'est pas terminée."
        },
        { key: 'notes', label: 'Notes', description: 'Les notes ou le compte-rendu.' },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Clôturer » termine la visite (absent pour une visite terminée ou annulée).'
        }
      ],
      statuses: [
        { value: 'SCHEDULED', label: 'Planifié', description: 'La visite est programmée et occupe son créneau.' },
        { value: 'CONFIRMED', label: 'Confirmé', description: 'La visite est confirmée et occupe son créneau.' },
        { value: 'DONE', label: 'Terminé', description: 'La visite a eu lieu.' },
        {
          value: 'NO_SHOW',
          label: 'Absent',
          description: "Le visiteur ne s'est pas présenté ; le créneau est libéré."
        },
        { value: 'CANCELED', label: 'Annulé', description: 'La visite est annulée ; le créneau est libéré.' }
      ]
    },
    faq: [
      {
        q: 'Je ne peux pas changer le statut.',
        a: 'Il faut le droit « Planifier des visites » ; une visite « Terminé » ne peut plus changer de statut.'
      }
    ],
    related: [{ label: 'Onglet Visites', helpId: 'commercial.biens.detail.visites' }],
    keywords: ['visites', 'statut', 'contact', 'objectif', 'assigné']
  },
  {
    id: 'commercial.biens.detail.planifier-visite',
    kind: 'section',
    title: 'Planifier une visite',
    summary:
      "Ce formulaire programme une visite du bien pour un contact, à une date et une heure précises, et l'affecte à un collaborateur.",
    steps: [
      { title: 'Choisir le contact', detail: '« Contact » (obligatoire) : recherchez le visiteur dans vos contacts.' },
      {
        title: "Choisir l'objectif",
        detail:
          '« Objectif » (obligatoire) : prise de contact, mise en relation, évaluation, signature du contrat, suivi, négociation ou autre.'
      },
      {
        title: 'Lier une affaire',
        detail: '« Affaire (optionnel) » apparaît une fois le contact choisi et liste ses affaires.'
      },
      { title: "Fixer la date et l'heure", detail: '« Date » et « Heure » (obligatoires) doivent être dans le futur.' },
      {
        title: 'Compléter',
        detail:
          "« Lieu (optionnel) » : l'adresse du bien par défaut. « Assigné à (optionnel) » : un collaborateur. « Notes (optionnel) »."
      },
      { title: 'Valider', detail: 'Cliquez sur « Planifier la visite ».' }
    ],
    consequences: [
      'La visite est créée au statut « Planifié ». Une visite dure 60 minutes : si une autre visite « Planifié » ou « Confirmé » du même bien chevauche ce créneau, la planification est refusée avec le message « Créneau déjà occupé », et vous choisissez un autre horaire.',
      "Un contact étant obligatoire, une activité « Appel » est ajoutée à sa fiche, avec un prochain rendez-vous de type « Visite » à la date choisie. Aucun e-mail ni SMS n'est envoyé au visiteur.",
      'Après le succès, vous êtes redirigé vers le calendrier des visites.'
    ],
    faq: [
      {
        q: 'Pourquoi ma date est-elle refusée ?',
        a: "La date et l'heure doivent être dans le futur, et le créneau ne doit pas chevaucher une autre visite du même bien."
      },
      {
        q: 'Je ne vois pas le formulaire.',
        a: "Il faut le pack CRM pour voir l'onglet, et le droit « Planifier des visites » pour programmer une visite."
      }
    ],
    permissions: { feature: 'CRM', note: 'Demande le droit « Planifier des visites ».' },
    related: [
      { label: 'Calendrier des visites', helpId: 'commercial.biens.visites' },
      { label: 'Onglet Visites', helpId: 'commercial.biens.detail.visites' }
    ],
    keywords: ['planifier', 'visite', 'rendez-vous', 'créneau', 'agenda', 'visiteur']
  }
];

export default entries;
