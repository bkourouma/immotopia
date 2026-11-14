import type { HelpEntry } from '../../../types';

/** Zone « contacts » du module « commercial » (fr). */
const entries: HelpEntry[] = [
  // ───────────────────────── Liste des contacts ─────────────────────────
  {
    id: 'commercial.contacts.liste',
    kind: 'page',
    title: 'Liste des contacts',
    summary:
      "Retrouvez ici tous les contacts de votre agence : prospects, clients et contacts archivés. C'est le point de départ pour créer, rechercher, ouvrir, modifier ou supprimer un contact.",
    purpose:
      "Un contact est une personne ou une entreprise que votre agence suit : acheteur potentiel, futur locataire, propriétaire… Un contact créé est d'abord un « Prospect ». Il devient « Client actif » quand vous lui attribuez un rôle (Propriétaire, Locataire, Copropriétaire, Acquéreur). Chaque contact a sa fiche, avec ses tags, ses rôles et, si votre pack inclut le CRM, ses affaires et ses activités.",
    steps: [
      {
        title: 'Créer un contact',
        detail:
          "Cliquez sur « Nouveau contact ». Le formulaire demande au minimum le type, le prénom, le nom, l'« Email personnel » et la commune."
      },
      {
        title: 'Rechercher et filtrer',
        detail:
          'Tapez un nom, une raison sociale, un e-mail ou un téléphone dans le champ de recherche. Statut, Tags et Collaborateur sont toujours visibles ; les autres critères sont sous « Plus de critères ». « Effacer les critères » remet la liste à zéro.'
      },
      {
        title: 'Ouvrir une fiche',
        detail: "Cliquez sur l'icône « Voir les détails » (l'œil) de la ligne."
      },
      {
        title: 'Modifier un contact',
        detail: "Cliquez sur l'icône « Modifier » (le crayon) : le formulaire s'ouvre dans une fenêtre."
      },
      {
        title: 'Enregistrer une activité',
        detail:
          "Cliquez sur l'icône « Ajouter une activité » (le calendrier) pour ouvrir le formulaire d'activité de ce contact."
      },
      {
        title: 'Gérer les tags de plusieurs contacts',
        detail:
          'Cochez des lignes : une barre apparaît avec « Gérer les tags ». Vous ajoutez ou retirez des tags pour tous les contacts cochés.'
      },
      {
        title: 'Exporter',
        detail:
          'Bouton « Exporter » : Excel, CSV ou PDF. Tous les contacts correspondant à vos critères sont exportés, pas seulement la page affichée.'
      },
      {
        title: 'Supprimer un contact',
        detail: 'Icône « Supprimer » (la corbeille), puis confirmez dans la bulle « Supprimer ce contact ? ».'
      }
    ],
    consequences: [
      "Un nouveau contact est toujours créé avec le statut « Prospect ». L'adresse e-mail doit être unique dans votre agence : un doublon est refusé.",
      "Si WhatsApp est configuré pour votre agence, le contact peut recevoir à sa création une invitation à votre groupe WhatsApp, à condition d'avoir le « Consentement WhatsApp ».",
      "La suppression est définitive : elle efface aussi les affaires, les activités, les rôles et les tags rattachés au contact. Elle est refusée si le contact a un compte propriétaire, un compte de tiers ou un historique financier (par exemple une offre d'achat).",
      'Un export reprend les contacts correspondant à vos critères : pensez à effacer les critères pour tout exporter.'
    ],
    faq: [
      {
        q: 'Pourquoi ne vois-je pas les colonnes « Prochaine action » et « Affaire en cours » ?',
        a: "Elles, ainsi que les filtres « Affaire en cours » et « Activité à venir », font partie du pack CRM. Si votre agence ne l'a pas souscrit, elles sont masquées."
      },
      {
        q: 'Comment transformer un prospect en client ?',
        a: 'Ouvrez sa fiche et cliquez sur « Convertir », puis choisissez au moins un rôle. Vous pouvez aussi ajouter un rôle depuis la carte « Rôles » de la fiche.'
      },
      {
        q: 'Pourquoi la suppression est-elle refusée ?',
        a: 'Le contact porte un compte propriétaire, un compte de tiers ou un historique financier. Ces liens sont conservés : le contact ne peut pas être supprimé.'
      },
      {
        q: 'Mon enregistrement est refusé. Pourquoi ?',
        a: "Vérifiez d'abord l'e-mail (déjà utilisé ?) et les champs obligatoires. Sinon, il vous manque peut-être un droit : « Créer des contacts » pour créer, « Modifier les contacts » pour modifier ou supprimer."
      },
      {
        q: 'Comment retrouver un contact ?',
        a: 'Tapez son nom, sa raison sociale, son e-mail ou son téléphone dans le champ de recherche. Affinez ensuite avec Statut, Tags, Collaborateur ou « Plus de critères ».'
      }
    ],
    permissions: {
      note: "Voir la liste demande « Voir les contacts », créer demande « Créer des contacts » ; modifier, supprimer, convertir, gérer les rôles et les tags demandent « Modifier les contacts ». Les colonnes, filtres et cartes d'affaires et d'activités relèvent du pack CRM."
    },
    related: [
      { label: 'Comment lire le tableau des contacts', helpId: 'commercial.contacts.liste.tableau' },
      { label: 'Créer un contact', helpId: 'commercial.contacts.nouveau' },
      { label: "La fiche d'un contact", helpId: 'commercial.contacts.detail' },
      { label: 'Gérer les tags en masse', helpId: 'commercial.contacts.liste.tags-en-masse' }
    ],
    keywords: [
      'contact',
      'contacts',
      'prospect',
      'client',
      'lead',
      "carnet d'adresses",
      'créer un contact',
      'supprimer un contact',
      'rechercher',
      'tag',
      'export'
    ],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'contacts-nouveau',
          title: 'Créer un contact',
          description:
            'Ce bouton ouvre le formulaire de création. Prénom, nom, e-mail personnel et commune sont obligatoires ; le contact est créé « Prospect ».'
        },
        {
          target: 'contacts-tableau',
          title: "Vérifier qu'il n'existe pas déjà",
          description:
            "Avant de créer, cherchez le nom, l'e-mail ou le téléphone ici : un e-mail déjà utilisé dans votre agence est refusé."
        },
        {
          target: 'contacts-actions',
          title: 'Poursuivre depuis la ligne',
          description:
            "Après la création, cliquez sur l'œil pour ouvrir la fiche : vous y ajoutez des tags, des rôles et, avec le pack CRM, des affaires."
        }
      ]
    }
  },
  {
    id: 'commercial.contacts.liste.tableau',
    kind: 'table',
    title: 'Tableau des contacts',
    summary:
      "Chaque ligne est un contact de votre agence, du plus récemment créé au plus ancien. Le tableau montre le nom, les coordonnées et, avec le pack CRM, la prochaine action et l'affaire en cours.",
    howToRead: {
      columns: [
        { key: 'name', label: 'Nom', description: "Le nom du contact (nom de l'entreprise pour une entreprise)." },
        { key: 'email', label: 'Email', description: "L'adresse e-mail de la fiche." },
        {
          key: 'phone',
          label: 'Téléphone',
          description: "Le numéro principal. Un tiret (-) signifie qu'aucun numéro n'est enregistré."
        },
        {
          key: 'nextAction',
          label: 'Prochaine action',
          description:
            "L'action prévue la plus proche (type et date), tirée des activités du contact. Un tiret signifie qu'aucune action n'est planifiée. Colonne du pack CRM."
        },
        {
          key: 'activeDeal',
          label: 'Affaire en cours',
          description:
            "Type et étape de l'affaire la plus récemment modifiée qui n'est ni gagnée ni perdue. Un tiret signifie qu'aucune affaire n'est en cours. Colonne du pack CRM."
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            'Quatre icônes : « Ajouter une activité », « Voir les détails », « Modifier » et « Supprimer » (avec confirmation).'
        }
      ],
      notes: [
        "Le champ de recherche couvre le nom, la raison sociale, l'e-mail, les téléphones et la source. Les critères Statut (Prospects, Clients, Archivés), Tags (au moins un des tags choisis) et Collaborateur sont toujours visibles.",
        'Sous « Plus de critères » : Date de création, Type de contact (Personne, Entreprise), Maturité (Froid, Tiède, Chaud), Source du lead, et, avec le pack CRM, « Affaire en cours » et « Activité à venir ».',
        'La case en tête de colonne coche les contacts de la page affichée. Les lignes cochées servent à « Gérer les tags ».'
      ]
    },
    faq: [
      {
        q: "L'export contient-il tous les contacts ?",
        a: "Oui : l'export reprend tous les contacts qui correspondent à vos critères, pas seulement la page affichée."
      },
      {
        q: 'Pourquoi un contact apparaît-il sans prochaine action ?',
        a: "Aucune de ses activités n'a de prochaine action planifiée. Vous la définissez en enregistrant une activité."
      },
      {
        q: "Où voir le statut (Prospect, Client actif) d'un contact ?",
        a: 'Sur sa fiche, sous son nom, ou en filtrant la liste avec le critère Statut.'
      }
    ],
    related: [
      { label: "Vue d'ensemble de la liste", helpId: 'commercial.contacts.liste' },
      { label: 'Gérer les tags en masse', helpId: 'commercial.contacts.liste.tags-en-masse' }
    ],
    keywords: ['colonnes', 'prochaine action', 'affaire en cours', 'filtre', 'recherche', 'export']
  },
  {
    id: 'commercial.contacts.liste.tags-en-masse',
    kind: 'section',
    title: 'Gestion des tags en masse',
    summary: 'Ajoutez ou retirez des tags pour tous les contacts cochés dans la liste, en une seule validation.',
    purpose:
      'Les tags sont des étiquettes colorées propres à votre agence (par exemple « VIP » ou « À rappeler ») qui servent à classer et retrouver vos contacts. Cette fenêtre évite de les modifier fiche par fiche.',
    steps: [
      { title: 'Cocher les contacts', detail: 'Dans la liste, cochez les lignes voulues.' },
      { title: 'Ouvrir la fenêtre', detail: 'Cliquez sur « Gérer les tags » dans la barre qui apparaît.' },
      {
        title: 'Choisir les tags',
        detail:
          'Cliquez sur les tags sous « Tags à ajouter » ou sous « Tags à retirer ». Un même tag ne peut pas être dans les deux.'
      },
      {
        title: 'Appliquer',
        detail: 'Relisez le « Résumé des modifications », puis cliquez sur « Appliquer les modifications ».'
      }
    ],
    consequences: [
      "Rien n'est modifié tant que vous n'avez pas cliqué sur « Appliquer les modifications ».",
      "Les modifications sont appliquées contact par contact. Si certaines échouent, un message indique le nombre d'erreurs : certains tags peuvent alors ne pas avoir été modifiés.",
      "Retirer un tag le détache seulement des contacts cochés : le tag lui-même n'est pas supprimé. Cette fenêtre ne crée pas de nouveaux tags ; pour en créer, utilisez « Gérer les tags » dans la fiche d'un contact."
    ],
    faq: [
      {
        q: 'Combien de contacts sont concernés ?',
        a: 'Seulement ceux que vous avez cochés ; leur nombre est rappelé en haut de la fenêtre.'
      },
      {
        q: 'Que se passe-t-il si un contact a déjà le tag à ajouter ?',
        a: "Rien ne change pour ce contact : le tag n'est pas ajouté une seconde fois."
      },
      {
        q: 'Je ne vois aucun tag.',
        a: "Votre agence n'en a pas encore. Ouvrez la fiche d'un contact, « Gérer » dans la carte Tags, puis « Créer le tag »."
      }
    ],
    permissions: { note: 'Demande le droit « Modifier les contacts ».' },
    related: [{ label: "Gérer les tags d'un contact", helpId: 'commercial.contacts.detail.gerer-tags' }],
    keywords: ['tags', 'étiquettes', 'masse', 'plusieurs contacts', 'sélection']
  },

  // ───────────────────────── Nouveau contact ─────────────────────────
  {
    id: 'commercial.contacts.nouveau',
    kind: 'page',
    title: 'Nouveau contact',
    summary:
      'Créez un contact (personne ou entreprise) en remplissant un formulaire à six onglets. Seuls quelques champs sont obligatoires : le reste peut être complété plus tard.',
    purpose:
      "Le même formulaire sert à créer et à modifier un contact. Il s'ouvre en page entière (« Nouveau contact ») ou dans une fenêtre depuis la liste des contacts. Un contact créé est toujours un « Prospect » ; vous le convertissez en client depuis sa fiche.",
    steps: [
      {
        title: 'Onglet Basique',
        detail:
          "Choisissez Personne ou Entreprise, puis saisissez le prénom, le nom et l'« Email personnel » : tous trois obligatoires."
      },
      {
        title: 'Onglet Identité (entreprise)',
        detail:
          'Pour une entreprise, la « Raison sociale » est obligatoire. Pour une personne, cet onglet est facultatif.'
      },
      {
        title: 'Onglet Contact',
        detail:
          "Choisissez la « Commune » (obligatoire à la création) en tapant son nom, puis l'adresse et le quartier."
      },
      {
        title: 'Autres onglets',
        detail: 'Professionnel, CRM et Consentements sont facultatifs. Complétez-les si vous avez les informations.'
      },
      {
        title: 'Enregistrer',
        detail:
          "Cliquez sur « Créer le contact ». Au besoin, le formulaire ouvre lui-même l'onglet du premier champ à corriger."
      }
    ],
    consequences: [
      "Le contact est créé avec le statut « Prospect ». Aucune affaire ni activité n'est créée automatiquement.",
      "L'« Email personnel » doit être unique dans votre agence : si un contact l'utilise déjà, l'enregistrement est refusé et l'erreur s'affiche sous le champ.",
      'Si vous cochez un consentement, la date du jour est enregistrée avec lui.',
      'Si WhatsApp est configuré pour votre agence et que le « Consentement WhatsApp » est coché, le contact peut recevoir une invitation à votre groupe WhatsApp.',
      "Depuis la page « Nouveau contact », vous revenez à la liste des contacts après l'enregistrement. Depuis la fenêtre de la liste, elle se ferme et la liste se met à jour."
    ],
    faq: [
      {
        q: 'Quels champs sont obligatoires ?',
        a: "Type de contact, prénom, nom, « Email personnel » et « Commune ». Pour une entreprise, la « Raison sociale » s'y ajoute."
      },
      {
        q: "Pourquoi l'enregistrement est-il refusé alors que tout est rempli ?",
        a: "Souvent parce que l'e-mail existe déjà dans votre agence. Cherchez-le dans la liste des contacts."
      },
      {
        q: 'Où choisir le collaborateur responsable, les tags ou les rôles ?',
        a: 'Pas dans ce formulaire. Les tags et les rôles se gèrent depuis la fiche du contact, une fois créé.'
      },
      {
        q: 'Je ne trouve pas ma commune.',
        a: 'Tapez les premières lettres de son nom dans le champ « Commune » : la liste se filtre au fur et à mesure.'
      }
    ],
    permissions: { note: 'Demande le droit « Créer des contacts ».' },
    related: [
      { label: 'Onglet Basique', helpId: 'commercial.contacts.nouveau.basique' },
      { label: 'Liste des contacts', helpId: 'commercial.contacts.liste' },
      { label: 'Convertir un prospect en client', helpId: 'commercial.contacts.detail.convertir' }
    ],
    keywords: ['créer un contact', 'nouveau prospect', 'ajouter un contact', 'formulaire', 'entreprise', 'personne'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'contact-form-onglets',
          title: 'Six onglets',
          description:
            'Le formulaire est découpé en onglets. Seuls Basique et Contact (la commune) ont des champs obligatoires pour une personne.'
        },
        {
          target: 'contact-form-enregistrer',
          title: 'Enregistrer',
          description:
            "Cliquez ici une fois les champs obligatoires remplis. Si un champ est à corriger, l'onglet concerné s'ouvre tout seul."
        }
      ]
    }
  },
  {
    id: 'commercial.contacts.nouveau.basique',
    kind: 'section',
    title: 'Onglet Basique',
    summary: 'Les informations indispensables : type de contact, prénom, nom, e-mails et téléphones.',
    steps: [
      { title: 'Type de contact', detail: "Personne ou Entreprise. Ce choix change les champs de l'onglet Identité." },
      { title: 'Prénom et Nom', detail: 'Obligatoires, même pour une entreprise (indiquez le représentant).' },
      {
        title: 'Email personnel',
        detail: "Obligatoire et unique dans l'agence. L'« Email professionnel » est facultatif."
      },
      {
        title: 'Téléphones',
        detail:
          "Choisissez l'indicatif (+225 par défaut), puis le numéro. Cochez « WhatsApp » sous le téléphone qui sert sur WhatsApp."
      }
    ],
    consequences: [
      "Le numéro coché « WhatsApp » devient le numéro WhatsApp du contact ; si les deux sont cochés, c'est le téléphone principal.",
      "L'e-mail est enregistré en minuscules."
    ],
    faq: [
      {
        q: 'Un contact peut-il être créé sans e-mail ?',
        a: "Non, l'« Email personnel » est obligatoire pour créer ou modifier un contact."
      },
      {
        q: 'Que se passe-t-il si je change le type de contact ?',
        a: "L'onglet Identité affiche les champs correspondants : ceux d'une personne ou ceux d'une entreprise."
      },
      {
        q: "Comment indiquer qu'un numéro est joignable sur WhatsApp ?",
        a: 'Cochez « WhatsApp » sous le téléphone concerné.'
      }
    ],
    related: [{ label: "Vue d'ensemble du formulaire", helpId: 'commercial.contacts.nouveau' }],
    keywords: ['prénom', 'nom', 'e-mail', 'téléphone', 'whatsapp', 'indicatif']
  },
  {
    id: 'commercial.contacts.nouveau.identite',
    kind: 'section',
    title: 'Onglet Identité',
    summary:
      "Les informations d'état civil d'une personne, ou les informations légales d'une entreprise, selon le type de contact choisi.",
    steps: [
      {
        title: 'Pour une personne',
        detail:
          "Civilité (Monsieur, Madame, Mademoiselle, Docteur, Professeur), Date de naissance, Nationalité (« Ivoirienne » par défaut), pièce d'identité (Type, Numéro, Date d'expiration) et Photo de profil."
      },
      {
        title: 'Pour une entreprise',
        detail: 'Raison sociale (obligatoire), Forme juridique, RCCM, Numéro fiscal, Nom et Fonction du représentant.'
      },
      {
        title: 'Photo de profil',
        detail: 'Une image de moins de 2 Mo. Seules les images sont acceptées.'
      }
    ],
    consequences: [
      "Les champs affichés dans cet onglet dépendent du type de contact choisi dans l'onglet Basique : changez le type et l'onglet change."
    ],
    faq: [
      {
        q: "Les informations d'identité sont-elles obligatoires ?",
        a: "Non, sauf la « Raison sociale » d'une entreprise. Complétez-les quand vous les avez."
      },
      {
        q: "Quelles pièces d'identité sont proposées ?",
        a: 'CNI, Passeport, Permis de conduire ou Autre.'
      },
      {
        q: 'Quelle photo de profil puis-je ajouter ?',
        a: 'Une image de moins de 2 Mo : les autres types de fichiers sont refusés.'
      }
    ],
    related: [{ label: "Vue d'ensemble du formulaire", helpId: 'commercial.contacts.nouveau' }],
    keywords: ['identité', 'cni', 'passeport', 'raison sociale', 'rccm', 'nationalité', 'photo']
  },
  {
    id: 'commercial.contacts.nouveau.coordonnees',
    kind: 'section',
    title: 'Onglet Contact',
    summary: "L'adresse du contact, sa commune et ses préférences de communication.",
    steps: [
      { title: 'Adresse complète', detail: 'Facultative : rue, immeuble, repères.' },
      {
        title: 'Commune',
        detail:
          'Obligatoire à la création. Tapez le nom de la commune (exemple : Cocody) et choisissez-la dans la liste.'
      },
      { title: 'Quartier/Zone', detail: 'Facultatif : le quartier ou la zone du contact.' },
      {
        title: 'Préférences',
        detail: 'Langue préférée (Français, Anglais, Autre) et Canal de contact préféré (Appel, WhatsApp, Email, SMS).'
      }
    ],
    consequences: [
      "À la modification d'un contact déjà enregistré, la commune n'est plus obligatoire : une ancienne fiche sans commune reste modifiable."
    ],
    faq: [
      {
        q: 'Pourquoi la commune est-elle obligatoire ?',
        a: "Elle permet de classer et de filtrer vos contacts par commune. Elle n'est exigée que pour un nouveau contact."
      },
      {
        q: 'Le canal préféré bloque-t-il les autres canaux ?',
        a: "Non : c'est une information pour votre équipe, elle n'empêche aucun contact."
      }
    ],
    related: [{ label: "Vue d'ensemble du formulaire", helpId: 'commercial.contacts.nouveau' }],
    keywords: ['adresse', 'commune', 'quartier', 'langue', 'canal', 'cocody']
  },
  {
    id: 'commercial.contacts.nouveau.professionnel',
    kind: 'section',
    title: 'Onglet Professionnel',
    summary:
      'La situation professionnelle et financière du contact : utile pour qualifier un acheteur ou un locataire.',
    steps: [
      { title: 'Poste et employeur', detail: "Profession / Fonction, Secteur d'activité (liste) et Employeur." },
      {
        title: 'Revenus',
        detail: '« Revenus minimum (FCFA) » et « Revenus maximum (FCFA) » : une fourchette. « Salaire » : un montant.'
      },
      {
        title: 'Situation',
        detail:
          "Stabilité professionnelle (CDI, CDD, Freelance, Informel, Retraité, Étudiant, Sans emploi, Autre) et Capacité d'emprunt (Oui, Non, Inconnu)."
      }
    ],
    consequences: [
      "Ces informations sont facultatives. Elles servent aux filtres de la recherche avancée (revenus, capacité d'emprunt) et à votre propre suivi."
    ],
    faq: [
      {
        q: 'Quelle différence entre revenus et salaire ?',
        a: 'Les revenus sont une fourchette (minimum et maximum) ; le salaire est un montant unique. Remplissez celui que vous connaissez.'
      }
    ],
    related: [{ label: 'Recherche avancée de contacts', helpId: 'commercial.contacts.recherche-avancee.filtres' }],
    keywords: ['profession', 'revenus', 'salaire', 'employeur', 'emprunt', 'cdi']
  },
  {
    id: 'commercial.contacts.nouveau.crm',
    kind: 'section',
    title: 'Onglet CRM',
    summary:
      "Le suivi commercial du contact : d'où il vient, à quel point il est prêt à agir, quelle priorité lui donner.",
    howToRead: {
      statuses: [
        { value: 'COLD', label: 'Froid', description: 'Contact peu avancé dans son projet (valeur par défaut).' },
        { value: 'WARM', label: 'Tiède', description: 'Contact intéressé, projet en réflexion.' },
        { value: 'HOT', label: 'Chaud', description: 'Contact prêt à agir rapidement.' }
      ],
      notes: [
        "Le niveau de maturité est une appréciation que vous saisissez : elle n'est pas calculée par l'application.",
        'Source du lead : Site web, Réseaux sociaux, Recommandation, Campagne, Agence, Visite spontanée, Appel téléphonique, Autre. « Source (legacy) » est un ancien champ libre.',
        'Priorité : Basse, Normale (par défaut) ou Haute. Score : un nombre de 0 à 100, saisi à la main.'
      ]
    },
    consequences: [
      'Ces champs sont facultatifs. Le niveau de maturité et la source du lead servent de critères dans la liste des contacts.'
    ],
    faq: [
      {
        q: 'Le score se calcule-t-il tout seul ?',
        a: 'Non, il se saisit à la main dans ce formulaire.'
      },
      {
        q: 'Où voir mes contacts « Chauds » ?',
        a: 'Dans la liste des contacts, ouvrez « Plus de critères » et choisissez Maturité.'
      }
    ],
    related: [{ label: 'Tableau des contacts', helpId: 'commercial.contacts.liste.tableau' }],
    keywords: ['maturité', 'chaud', 'froid', 'tiède', 'source', 'lead', 'priorité', 'score']
  },
  {
    id: 'commercial.contacts.nouveau.consentements',
    kind: 'section',
    title: 'Onglet Consentements',
    summary:
      "Les accords donnés par le contact pour être sollicité, et vos notes internes. Rien n'est coché par défaut.",
    steps: [
      {
        title: 'Cocher les consentements',
        detail:
          '« Consentement marketing », « Consentement WhatsApp » et « Consentement Email » : cochez seulement ce que le contact a accepté.'
      },
      { title: 'Source du consentement', detail: "Notez comment l'accord a été obtenu (en agence, par téléphone…)." },
      { title: 'Notes internes', detail: 'Texte libre, réservé à votre équipe.' }
    ],
    consequences: [
      'Sans « Consentement WhatsApp », les messages WhatsApp de votre agence ne partent pas vers ce contact.',
      'Les listes de diffusion construites à partir des contacts ne retiennent que ceux qui ont le « Consentement Email ».',
      "Dès qu'un consentement est coché à la création, la date du jour est enregistrée."
    ],
    faq: [
      {
        q: 'Puis-je cocher un consentement à la place du contact ?',
        a: 'Non : ne cochez que si le contact a donné son accord, et notez comment dans « Source du consentement ».'
      },
      {
        q: 'Les notes internes sont-elles visibles par le contact ?',
        a: 'Elles sont destinées à votre équipe, dans la fiche du contact.'
      }
    ],
    related: [{ label: "Vue d'ensemble du formulaire", helpId: 'commercial.contacts.nouveau' }],
    keywords: ['consentement', 'rgpd', 'whatsapp', 'marketing', 'notes', 'accord']
  },

  // ───────────────────────── Modifier un contact ─────────────────────────
  {
    id: 'commercial.contacts.modifier',
    kind: 'page',
    title: 'Modifier un contact',
    summary: "Corrigez ou complétez les informations d'un contact avec le même formulaire que pour la création.",
    purpose:
      "Cette page s'ouvre depuis le bouton « Modifier » de la fiche ; depuis la liste, le formulaire s'ouvre dans une fenêtre. Les champs, les onglets et les règles sont ceux du formulaire de création.",
    steps: [
      { title: 'Ouvrir le formulaire', detail: 'Bouton « Modifier » de la fiche, ou icône « Modifier » de la liste.' },
      { title: 'Corriger les champs', detail: "Modifiez ce qu'il faut, dans n'importe quel onglet." },
      { title: 'Enregistrer', detail: 'Cliquez sur « Mettre à jour le contact ». « Annuler » ferme sans rien changer.' }
    ],
    consequences: [
      "Changer l'e-mail est refusé s'il est déjà utilisé par un autre contact de l'agence.",
      'Le statut, les rôles et les tags ne se modifient pas ici : utilisez la fiche du contact.',
      "Depuis cette page, l'enregistrement vous ramène à la liste des contacts ; « Annuler » vous ramène à la fiche."
    ],
    faq: [
      {
        q: 'Pourquoi la commune est-elle vide sur un ancien contact ?',
        a: "Les anciennes fiches n'en avaient pas toujours. Elle n'est obligatoire qu'à la création : vous pouvez enregistrer sans la remplir."
      },
      {
        q: 'Comment changer le statut du contact ?',
        a: 'Il change avec les rôles : voir « Convertir » et la carte « Rôles » dans la fiche.'
      },
      {
        q: 'Puis-je modifier un contact sans quitter la liste ?',
        a: "Oui : l'icône « Modifier » de la liste ouvre le même formulaire dans une fenêtre. Après l'enregistrement, la fenêtre se ferme et la liste se met à jour."
      },
      {
        q: 'Que se passe-t-il si je clique sur « Annuler » ?',
        a: "Rien n'est enregistré. Depuis la page de modification, vous revenez à la fiche du contact."
      },
      {
        q: "Puis-je changer l'e-mail d'un contact ?",
        a: "Oui, tant qu'aucun autre contact de votre agence n'utilise déjà cette adresse. Sinon l'enregistrement est refusé et l'erreur s'affiche sous le champ."
      }
    ],
    permissions: { note: 'Demande le droit « Modifier les contacts ».' },
    related: [
      { label: 'Le formulaire, onglet par onglet', helpId: 'commercial.contacts.nouveau' },
      { label: 'La fiche du contact', helpId: 'commercial.contacts.detail' }
    ],
    keywords: ['modifier', 'corriger', 'mettre à jour', 'contact']
  },

  // ───────────────────────── Fiche d'un contact ─────────────────────────
  {
    id: 'commercial.contacts.detail',
    kind: 'page',
    title: "Fiche d'un contact",
    summary:
      "Toutes les informations d'un contact : coordonnées, statut, rôles, tags et, avec le pack CRM, ses affaires et ses activités.",
    purpose:
      "La fiche est l'endroit où vous faites évoluer un contact : le convertir en client, lui attribuer des rôles, le classer avec des tags, lui rattacher des affaires et enregistrer vos échanges.",
    howToRead: {
      statuses: [
        { value: 'LEAD', label: 'Prospect', description: 'Contact créé, pas encore client : aucun rôle actif.' },
        {
          value: 'ACTIVE_CLIENT',
          label: 'Client actif',
          description: 'Contact avec au moins un rôle actif (Propriétaire, Locataire, Copropriétaire, Acquéreur).'
        },
        { value: 'ARCHIVED', label: 'Archivé', description: 'Contact archivé.' }
      ],
      notes: [
        'En haut : le nom, le statut, puis les boutons « Convertir » (visible pour un Prospect, ou un Client actif sans rôle actif) et « Modifier ».',
        'Dessous : Email, Téléphone, WhatsApp, Source et Dernière interaction (si renseignées), Créé le, Modifié le. La « Dernière interaction » se met à jour quand une activité est enregistrée pour ce contact.'
      ]
    },
    steps: [
      {
        title: 'Convertir un prospect',
        detail: 'Bouton « Convertir » : choisissez le ou les rôles du nouveau client.'
      },
      { title: 'Gérer les rôles', detail: 'Carte « Rôles », bouton « Ajouter ».' },
      { title: 'Classer avec des tags', detail: 'Carte « Tags », bouton « Gérer ».' },
      { title: 'Ajouter une affaire', detail: 'Carte « Affaires », bouton « Ajouter » (pack CRM).' },
      {
        title: 'Enregistrer une activité',
        detail: 'Carte « Chronologie des activités », bouton « Ajouter » (pack CRM).'
      },
      { title: 'Corriger les informations', detail: 'Bouton « Modifier ».' }
    ],
    consequences: [
      "Le statut change tout seul avec les rôles : un premier rôle fait passer un Prospect en Client actif ; retirer le dernier rôle d'un Client actif le ramène à Prospect.",
      "Un rôle « Propriétaire » rend le contact proposable partout où l'on désigne un propriétaire (bien, mandat de vente)."
    ],
    faq: [
      {
        q: 'Pourquoi le bouton « Convertir » a-t-il disparu ?',
        a: 'Le contact est déjà « Client actif » avec au moins un rôle actif. Pour changer ses rôles, utilisez la carte « Rôles ».'
      },
      {
        q: 'Pourquoi ne vois-je pas les cartes Affaires et Chronologie des activités ?',
        a: 'Elles font partie du pack CRM, non inclus dans votre pack.'
      },
      {
        q: 'Comment supprimer ce contact ?',
        a: "Depuis la liste des contacts, avec l'icône « Supprimer » de sa ligne."
      }
    ],
    permissions: {
      note: 'Voir la fiche demande « Voir les contacts » ; convertir, modifier, gérer les rôles et les tags demandent « Modifier les contacts ».'
    },
    related: [
      { label: 'Convertir un prospect en client', helpId: 'commercial.contacts.detail.convertir' },
      { label: 'Les rôles du contact', helpId: 'commercial.contacts.detail.roles' },
      { label: 'Les tags du contact', helpId: 'commercial.contacts.detail.tags' },
      { label: 'Liste des contacts', helpId: 'commercial.contacts.liste' }
    ],
    keywords: ['fiche contact', 'détail', 'prospect', 'client actif', 'convertir', 'rôle', 'tag', 'historique']
  },
  {
    id: 'commercial.contacts.detail.roles',
    kind: 'section',
    title: 'Rôles du contact',
    summary:
      'Les rôles disent ce que le contact est pour votre agence : Propriétaire, Locataire, Copropriétaire ou Acquéreur. Chaque rôle actif est affiché avec sa date de début.',
    steps: [
      { title: 'Ajouter ou retirer des rôles', detail: "Bouton « Ajouter » : la fenêtre « Gérer les rôles » s'ouvre." },
      {
        title: 'Supprimer un rôle',
        detail: 'Icône corbeille de la ligne du rôle, puis « Oui » dans la bulle « Supprimer ce rôle ».'
      }
    ],
    consequences: [
      "Supprimer un rôle l'efface définitivement.",
      "Si c'était le dernier rôle d'un « Client actif », le contact repasse « Prospect ».",
      "Le rôle « Propriétaire » le rend proposable comme propriétaire d'un bien ou vendeur d'un mandat."
    ],
    faq: [
      {
        q: 'Un contact peut-il avoir plusieurs rôles ?',
        a: 'Oui : par exemple Propriétaire et Locataire.'
      },
      {
        q: 'Pourquoi la carte dit « Aucun rôle assigné » ?',
        a: 'Le contact est un Prospect. Cliquez sur « Ajouter » ou sur « Convertir » pour lui en donner un.'
      }
    ],
    permissions: { note: 'Demande le droit « Modifier les contacts ».' },
    related: [{ label: 'Gérer les rôles', helpId: 'commercial.contacts.detail.gerer-roles' }],
    keywords: ['rôle', 'propriétaire', 'locataire', 'copropriétaire', 'acquéreur']
  },
  {
    id: 'commercial.contacts.detail.tags',
    kind: 'section',
    title: 'Tags du contact',
    summary:
      'Les tags sont des étiquettes colorées propres à votre agence. Cette carte affiche ceux du contact, avec leur nombre.',
    steps: [
      {
        title: 'Modifier les tags',
        detail: "Bouton « Gérer » (ou « Ajouter » si la carte est vide) : la fenêtre « Gérer les tags » s'ouvre."
      }
    ],
    consequences: ['Les tags servent à filtrer la liste des contacts (critère « Tags ») et la recherche avancée.'],
    faq: [
      {
        q: 'Les tags sont-ils partagés entre collègues ?',
        a: 'Oui : un tag créé existe pour toute votre agence.'
      },
      {
        q: 'Comment mettre un tag sur beaucoup de contacts ?',
        a: 'Dans la liste, cochez les contacts puis « Gérer les tags ».'
      }
    ],
    permissions: { note: 'Demande le droit « Modifier les contacts ».' },
    related: [{ label: 'Gérer les tags du contact', helpId: 'commercial.contacts.detail.gerer-tags' }],
    keywords: ['tag', 'étiquette', 'classer']
  },
  {
    id: 'commercial.contacts.detail.affaires',
    kind: 'section',
    title: 'Affaires du contact',
    summary:
      'Les affaires rattachées à ce contact (achat, location, vente, gestion de biens, mandat) : les 10 plus récentes, avec leur étape et leur budget maximum.',
    howToRead: {
      statuses: [
        { value: 'NEW', label: 'Nouveau', description: "Affaire qui vient d'être créée." },
        { value: 'QUALIFIED', label: 'Qualifié', description: 'Besoin du contact précisé.' },
        { value: 'VISIT', label: 'Visite', description: 'Visites en cours.' },
        { value: 'NEGOTIATION', label: 'Négociation', description: 'Discussion sur les conditions.' },
        { value: 'WON', label: 'Gagné', description: 'Affaire conclue.' },
        { value: 'LOST', label: 'Perdu', description: 'Affaire abandonnée.' }
      ],
      notes: [
        "Le montant affiché à droite est le budget maximum de l'affaire, quand il est renseigné. Cliquez sur une affaire pour ouvrir sa fiche."
      ]
    },
    steps: [{ title: 'Créer une affaire', detail: 'Bouton « Ajouter » (ou « Créer » si la carte est vide).' }],
    consequences: ["Une nouvelle affaire démarre à l'étape « Nouveau »."],
    faq: [
      {
        q: 'Pourquoi cette carte est-elle absente ?',
        a: "Les affaires relèvent du pack CRM : sans lui, la carte n'est pas affichée."
      },
      {
        q: 'Où voir toutes les affaires du contact ?',
        a: "La carte n'en montre que 10. La liste des affaires les regroupe toutes."
      }
    ],
    permissions: { feature: 'CRM' },
    related: [
      { label: 'Créer une affaire pour ce contact', helpId: 'commercial.contacts.detail.nouvelle-affaire' },
      { label: 'Liste des affaires', helpId: 'commercial.affaires.liste' }
    ],
    keywords: ['affaire', 'deal', 'achat', 'location', 'vente', 'mandat', 'budget']
  },
  {
    id: 'commercial.contacts.detail.activites',
    kind: 'section',
    title: 'Chronologie des activités',
    summary:
      "Les 10 dernières activités enregistrées pour ce contact, de la plus récente à la plus ancienne : votre historique d'échanges.",
    steps: [
      {
        title: 'Ajouter une activité',
        detail: "Bouton « Ajouter » (ou « Créer » si la carte est vide) : la fenêtre « Nouvelle activité » s'ouvre."
      }
    ],
    consequences: ['Enregistrer une activité met à jour la « Dernière interaction » du contact.'],
    faq: [
      {
        q: 'Pourquoi cette carte est-elle absente ?',
        a: "Les activités relèvent du pack CRM : sans lui, la carte n'est pas affichée."
      },
      {
        q: 'Où voir les activités plus anciennes ?',
        a: "La carte n'en montre que 10. La liste des activités les regroupe toutes."
      }
    ],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Liste des activités', helpId: 'commercial.activites.liste' }],
    keywords: ['activité', 'historique', 'appel', 'échange', 'suivi', 'chronologie']
  },
  {
    id: 'commercial.contacts.detail.convertir',
    kind: 'section',
    title: 'Convertir un prospect en client',
    summary: 'Fait passer un contact de « Prospect » à « Client actif » en lui attribuant un ou plusieurs rôles.',
    steps: [
      { title: 'Ouvrir la fenêtre', detail: 'Bouton « Convertir » de la fiche.' },
      {
        title: 'Choisir les rôles',
        detail: 'Cochez au moins un rôle : Propriétaire, Locataire, Copropriétaire ou Acquéreur.'
      },
      { title: 'Valider', detail: 'Cliquez sur « Convertir en client ». « Annuler » ferme sans rien changer.' }
    ],
    consequences: [
      'Le statut devient « Client actif » et les rôles cochés sont créés.',
      "Avec le rôle « Propriétaire », le contact devient proposable comme propriétaire. Si aucun compte d'accès n'existe avec son e-mail, un compte est créé ; le contact peut alors recevoir par WhatsApp (si votre agence l'a configuré et s'il a le « Consentement WhatsApp ») un message avec le lien pour choisir son mot de passe.",
      "Ce n'est pas un verrou : en retirant tous ses rôles, le contact redevient « Prospect »."
    ],
    faq: [
      {
        q: 'Le bouton « Convertir en client » est grisé.',
        a: 'Il faut cocher au moins un rôle.'
      },
      {
        q: 'Qui peut être converti ?',
        a: "Un Prospect, ou un Client actif qui n'a plus aucun rôle actif."
      }
    ],
    permissions: { note: 'Demande le droit « Modifier les contacts ».' },
    related: [{ label: 'Gérer les rôles', helpId: 'commercial.contacts.detail.gerer-roles' }],
    keywords: ['convertir', 'prospect', 'client', 'rôle', 'propriétaire']
  },
  {
    id: 'commercial.contacts.detail.gerer-roles',
    kind: 'section',
    title: 'Gérer les rôles',
    summary:
      "Cochez les rôles que le contact doit avoir. L'enregistrement ajoute les nouveaux rôles et retire ceux que vous décochez.",
    steps: [
      {
        title: 'Cocher les rôles',
        detail: 'Propriétaire (Owner), Locataire (Renter), Copropriétaire (Co-owner), Acquéreur (Buyer).'
      },
      { title: 'Enregistrer', detail: 'Bouton « Enregistrer ». « Annuler » ferme sans rien changer.' }
    ],
    consequences: [
      'Un rôle décoché est supprimé définitivement.',
      'Le statut suit : au moins un rôle fait passer un Prospect en Client actif ; aucun rôle ramène un Client actif à Prospect.',
      "Avec le rôle « Propriétaire », un compte d'accès est créé pour le contact s'il n'en a pas, avec un message WhatsApp possible (si configuré et si le contact y a consenti)."
    ],
    faq: [
      {
        q: 'Puis-je tout décocher ?',
        a: "Oui : le contact redevient « Prospect » s'il était « Client actif »."
      }
    ],
    permissions: { note: 'Demande le droit « Modifier les contacts ».' },
    related: [{ label: 'Rôles du contact', helpId: 'commercial.contacts.detail.roles' }],
    keywords: ['rôles', 'cocher', 'propriétaire', 'locataire']
  },
  {
    id: 'commercial.contacts.detail.gerer-tags',
    kind: 'section',
    title: "Gérer les tags d'un contact",
    summary:
      'Ajoutez ou retirez des tags pour ce contact, ou créez-en un nouveau pour toute votre agence. Chaque clic est enregistré tout de suite.',
    steps: [
      { title: 'Rechercher', detail: 'Champ « Rechercher un tag... » pour filtrer les listes.' },
      {
        title: 'Créer un tag',
        detail:
          'Choisissez une couleur, saisissez le nom (50 caractères au plus), puis « Créer le tag ». Il est aussitôt attribué au contact.'
      },
      { title: 'Ajouter un tag', detail: 'Cliquez sur un tag sous « Tags disponibles ».' },
      { title: 'Retirer un tag', detail: "Cliquez sur la croix d'un tag sous « Tags assignés »." },
      { title: 'Terminer', detail: "Bouton « Fermer » : il n'y a pas d'enregistrement final." }
    ],
    consequences: [
      'Chaque ajout ou retrait est enregistré immédiatement.',
      "Un tag créé ici est disponible pour toute l'agence. Un nom déjà pris est refusé.",
      'Retirer un tag du contact ne supprime pas le tag.'
    ],
    faq: [
      {
        q: 'Comment supprimer définitivement un tag ?',
        a: 'Cet écran ne le permet pas : il retire seulement le tag du contact.'
      },
      {
        q: 'Faut-il cliquer sur un bouton pour enregistrer ?',
        a: 'Non : chaque ajout ou retrait est enregistré tout de suite. « Fermer » ferme seulement la fenêtre.'
      },
      {
        q: 'Puis-je créer deux tags du même nom ?',
        a: 'Non : un nom déjà pris est refusé, avec le message « Un tag portant ce nom existe déjà. »'
      }
    ],
    permissions: { note: 'Demande le droit « Modifier les contacts », y compris pour créer un tag.' },
    related: [{ label: 'Gestion des tags en masse', helpId: 'commercial.contacts.liste.tags-en-masse' }],
    keywords: ['tags', 'créer un tag', 'couleur', 'étiquette']
  },
  {
    id: 'commercial.contacts.detail.nouvelle-affaire',
    kind: 'section',
    title: 'Nouvelle affaire pour un contact',
    summary:
      'Crée une affaire déjà rattachée à ce contact : le contact est rappelé en haut de la fenêtre (« Pour » suivi de son nom).',
    steps: [
      { title: 'Ouvrir la fenêtre', detail: 'Bouton « Ajouter » de la carte « Affaires ».' },
      {
        title: 'Remplir le formulaire',
        detail: 'Informations générales, budget, type de bien, critères et informations complémentaires.'
      },
      { title: 'Enregistrer', detail: "Validez le formulaire. Le message « Affaire créée avec succès » s'affiche." }
    ],
    consequences: [
      "L'affaire démarre à l'étape « Nouveau » et apparaît dans la carte « Affaires » du contact et dans la liste des affaires."
    ],
    faq: [
      {
        q: 'Où est expliqué chaque champ du formulaire ?',
        a: "Dans l'aide de la création d'une affaire (voir « Voir aussi »)."
      }
    ],
    permissions: { feature: 'CRM', note: 'Demande le droit « Créer des affaires ».' },
    related: [{ label: 'Créer une affaire', helpId: 'commercial.affaires.nouvelle' }],
    keywords: ['affaire', 'nouvelle affaire', 'deal', 'budget']
  },
  {
    id: 'commercial.contacts.detail.avis-portail',
    kind: 'section',
    title: 'Adresse du compte portail',
    summary:
      "Cette note apparaît sous l'e-mail quand le contact a un compte client dont l'adresse est différente de celle de la fiche.",
    purpose:
      "Les avis (prélèvement, rappels) partent à l'adresse du compte portail du client, et non à celle de la fiche. La note vous prévient pour éviter de chercher ces messages au mauvais endroit.",
    consequences: [
      "L'adresse du compte s'affiche masquée : l'adresse complète n'est jamais montrée.",
      "Modifier l'e-mail de la fiche contact ne suffit pas à changer l'adresse qui reçoit les avis."
    ],
    faq: [
      {
        q: 'Pourquoi cette note apparaît-elle ?',
        a: "Parce que le compte portail du client utilise une autre adresse que l'e-mail de la fiche."
      },
      {
        q: "Elle ne s'affiche pas : est-ce normal ?",
        a: "Oui : sans compte lié, ou si les deux adresses sont identiques, la note n'apparaît pas."
      }
    ],
    related: [{ label: "La fiche d'un contact", helpId: 'commercial.contacts.detail' }],
    keywords: ['compte portail', 'avis', 'prélèvement', 'e-mail différent']
  },

  // ───────────────────────── Recherche avancée de contacts ─────────────────────────
  {
    id: 'commercial.contacts.recherche-avancee',
    kind: 'section',
    title: 'Recherche avancée de contacts',
    summary:
      "Retrouvez des contacts avec des critères précis, enregistrez vos recherches et exportez les résultats. Elle s'ouvre notamment quand vous ajoutez des contacts du CRM à une liste de diffusion.",
    purpose:
      "Dans les lettres d'information, la fenêtre « Recherche avancée de contacts CRM » sert à choisir des contacts du CRM pour les ajouter à la liste de diffusion sélectionnée.",
    steps: [
      { title: 'Chercher vite', detail: 'Champ de recherche rapide : nom, e-mail, téléphone.' },
      {
        title: 'Affiner',
        detail:
          "Bouton « Filtres avancés » : voir l'aide « Filtres avancés ». Chaque critère actif apparaît en puce ; la croix le retire."
      },
      { title: 'Réutiliser une recherche', detail: 'Bouton « Recherches sauvegardées ».' },
      {
        title: 'Enregistrer la recherche',
        detail: "Bouton « Sauvegarder » (visible dès qu'un critère est actif) : donnez-lui un nom."
      },
      {
        title: 'Choisir des contacts',
        detail: 'Cochez les lignes ; le nombre apparaît, puis « Confirmer la sélection ».'
      },
      { title: 'Exporter', detail: 'Bouton « Exporter CSV ».' }
    ],
    consequences: [
      'Les contacts confirmés sont ajoutés à la liste de diffusion ; ceux déjà présents sont ignorés, et un message indique combien ont été ajoutés.',
      "L'export CSV reprend tous les résultats de la recherche en cours, dans la limite de 10 000 contacts.",
      'Une recherche sauvegardée ne garde que les critères, pas la liste des contacts : les résultats sont recalculés à chaque utilisation.'
    ],
    faq: [
      {
        q: 'Les critères se cumulent-ils ?',
        a: "Oui : un contact doit répondre à tous les critères. Pour un même critère à choix multiple, il suffit de correspondre à l'un des choix."
      },
      {
        q: 'Combien de résultats sont affichés ?',
        a: 'Par pages de 50 au départ ; vous pouvez changer la taille de page.'
      }
    ],
    permissions: { note: 'Demande le droit « Voir les contacts ».' },
    related: [
      { label: 'Filtres avancés', helpId: 'commercial.contacts.recherche-avancee.filtres' },
      { label: 'Recherches sauvegardées', helpId: 'commercial.contacts.recherche-avancee.enregistrees' },
      { label: 'Tableau des résultats', helpId: 'commercial.contacts.recherche-avancee.resultats' }
    ],
    keywords: ['recherche avancée', 'filtres', 'liste de diffusion', 'newsletter', 'sélection de contacts']
  },
  {
    id: 'commercial.contacts.recherche-avancee.resultats',
    kind: 'table',
    title: 'Résultats de la recherche de contacts',
    summary: 'Chaque ligne est un contact qui répond à vos critères.',
    howToRead: {
      columns: [
        { key: 'name', label: 'Nom', description: 'Le nom du contact.' },
        { key: 'email', label: 'Email', description: "L'adresse e-mail ; l'icône à côté la copie." },
        {
          key: 'phone',
          label: 'Téléphone',
          description:
            "Le téléphone principal, ou à défaut le numéro WhatsApp. Un tiret (—) signifie qu'aucun n'est enregistré."
        },
        { key: 'status', label: 'Statut', description: 'Prospect, Client actif ou Archivé.' },
        { key: 'maturityLevel', label: 'Maturité', description: 'Froid, Tiède ou Chaud ; un tiret si non renseigné.' },
        { key: 'commune', label: 'Commune', description: 'La commune du contact.' },
        { key: 'tags', label: 'Tags', description: 'Les tags du contact.' }
      ],
      notes: [
        "Quand vous choisissez des contacts pour une liste de diffusion, des cases à cocher apparaissent et l'export du tableau est retiré ; le bouton « Exporter CSV » reste disponible au-dessus."
      ]
    },
    faq: [
      {
        q: 'Mes cases cochées sont-elles conservées si je change de page ?',
        a: "Oui : la sélection est cumulée d'une page à l'autre jusqu'à la confirmation."
      },
      {
        q: 'Pourquoi un contact manque-t-il ?',
        a: "Un de vos critères l'exclut. Retirez les puces de filtres une à une pour voir lequel."
      },
      {
        q: 'À quoi sert le nombre sous le tableau ?',
        a: 'Il indique le total de contacts qui répondent aux critères.'
      }
    ],
    related: [{ label: 'Recherche avancée de contacts', helpId: 'commercial.contacts.recherche-avancee' }],
    keywords: ['résultats', 'colonnes', 'sélection']
  },
  {
    id: 'commercial.contacts.recherche-avancee.filtres',
    kind: 'section',
    title: 'Filtres avancés',
    summary:
      'Une fenêtre à sept volets pour définir précisément les contacts recherchés. Vous la validez avec « Appliquer les filtres ».',
    howToRead: {
      notes: [
        'Identité et contact : prénom, nom, e-mail, téléphone.',
        'Localisation : communes, ville, quartier.',
        'Statut et type : statuts (Prospect, Client actif, Archivé), types (Personne, Société), maturité, rôles CRM.',
        "Projet immobilier : types d'affaire (Achat, Location, Vente, Gestion, Mandat), budget min et max en FCFA, zones cibles.",
        'Tags et assignation : tags (avec la case « Doit avoir TOUS les tags (sinon au moins un) »), « Assigné à ».',
        "Informations financières : revenu min et max en FCFA, capacité d'emprunt.",
        'Consentements : Email, WhatsApp, Marketing.'
      ]
    },
    steps: [
      { title: 'Remplir les volets utiles', detail: 'Laissez vide ce qui ne compte pas.' },
      { title: 'Appliquer', detail: 'Cliquez sur « Appliquer les filtres » ; « Annuler » ferme sans rien changer.' }
    ],
    consequences: [
      "Tous les critères remplis doivent être vrais en même temps pour qu'un contact soit retenu.",
      'Attention : la case « Inclure les contacts non assignés » ne garde QUE les contacts sans collaborateur assigné ; combinée à « Assigné à », elle ne donne aucun résultat.',
      'Les cases de consentement cochées ne retiennent que les contacts qui ont donné ce consentement.'
    ],
    faq: [
      {
        q: 'Comment retirer un filtre ?',
        a: 'Cliquez sur la croix de sa puce sous la barre de recherche, ou rouvrez la fenêtre.'
      },
      {
        q: 'Quelle différence entre un tag « au moins un » et « TOUS » ?',
        a: "Par défaut, un contact qui a l'un des tags choisis est retenu. Avec la case cochée, il doit les avoir tous."
      },
      {
        q: "Pourquoi n'ai-je aucun résultat avec « Assigné à » et « Inclure les contacts non assignés » ?",
        a: 'La case « Inclure les contacts non assignés » ne garde que les contacts sans collaborateur : combinée à « Assigné à », aucun contact ne peut répondre aux deux.'
      }
    ],
    related: [{ label: 'Recherche avancée de contacts', helpId: 'commercial.contacts.recherche-avancee' }],
    keywords: ['filtres', 'critères', 'budget', 'tags', 'consentement', 'commune']
  },
  {
    id: 'commercial.contacts.recherche-avancee.enregistrees',
    kind: 'section',
    title: 'Recherches sauvegardées',
    summary:
      'Retrouvez les recherches que vous avez enregistrées, ainsi que celles partagées avec votre équipe, et relancez-les en un clic.',
    steps: [
      {
        title: 'Utiliser une recherche',
        detail: 'Bouton « Utiliser » : la recherche est relancée et ses critères sont appliqués.'
      },
      { title: 'Supprimer une recherche', detail: 'Bouton « Supprimer » : réservé à vos propres recherches.' },
      {
        title: 'Retrouver une recherche',
        detail: 'Au-delà de 10 recherches, un champ de recherche apparaît au-dessus de la liste.'
      }
    ],
    consequences: [
      'La suppression est définitive et immédiate.',
      "Les recherches que vous enregistrez vous sont personnelles. Vous ne pouvez supprimer que les vôtres : le serveur refuse la suppression d'une recherche créée par un autre."
    ],
    faq: [
      {
        q: "Qu'indique « Utilisée … fois » ?",
        a: 'Le nombre de fois où la recherche a été relancée, avec la date de dernière utilisation.'
      },
      {
        q: 'Comment enregistrer une recherche ?',
        a: 'Appliquez des critères, puis « Sauvegarder » (au-dessus des résultats) et donnez-lui un nom.'
      }
    ],
    related: [{ label: 'Recherche avancée de contacts', helpId: 'commercial.contacts.recherche-avancee' }],
    keywords: ['recherche enregistrée', 'sauvegarder', 'réutiliser']
  }
];

export default entries;
