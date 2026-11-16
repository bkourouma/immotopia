import type { HelpEntry } from '../../../types';

/** Zone « agence » du module « administration » (fr) : paramètres de l'agence. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Paramètres de l'agence
  {
    id: 'administration.agence.parametres',
    kind: 'page',
    title: "Paramètres de l'agence",
    summary:
      "Renseignez ici l'identité de votre agence : logo, couleur, signature, cachet, nom, coordonnées et adresse. Ces informations sont reprises dans les documents générés par l'application.",
    purpose:
      "Les contrats de bail, reçus et autres documents générés affichent le nom, l'e-mail, le téléphone et l'adresse de votre agence tels qu'ils sont saisis ici. La carte « Portail propriétaire » règle en plus ce que vos propriétaires voient dans leur espace.",
    steps: [
      {
        title: 'Téléverser le logo',
        detail:
          'Carte « Logo et couleur de marque », bouton « Téléverser un logo ». Formats PNG, JPEG ou WebP, 2 Mo au plus. Le logo est enregistré tout de suite.'
      },
      {
        title: 'Choisir la couleur de marque',
        detail: 'Saisissez un code couleur au format #RRGGBB, par exemple #1677FF.'
      },
      {
        title: 'Ajouter la signature et le cachet',
        detail: 'Carte « Signature et cachet pour les documents ». Chaque image est enregistrée dès son envoi.'
      },
      {
        title: "Compléter les informations de l'agence",
        detail:
          "Nom de l'agence (obligatoire), dénomination légale, e-mail, téléphone, adresse, ville, pays et site web (adresse commençant par http:// ou https://)."
      },
      {
        title: 'Enregistrer',
        detail:
          "Cliquez sur « Enregistrer » en bas de page. Le logo, la signature, le cachet et les réglages du portail propriétaire ne l'attendent pas : ils sont enregistrés au moment où vous les modifiez."
      },
      {
        title: 'Régler le portail propriétaire',
        detail: 'Carte « Portail propriétaire » : chaque interrupteur est enregistré dès que vous le basculez.'
      }
    ],
    consequences: [
      "Le nom, l'e-mail, le téléphone et l'adresse enregistrés sont repris automatiquement dans les documents générés (contrats de bail, reçus, etc.). Vérifiez qu'ils sont complets et à jour.",
      "« Retirer » le logo, ou retirer la signature ou le cachet, est immédiat : il n'y a pas de confirmation.",
      'Les réglages du portail propriétaire changent aussitôt ce que vos propriétaires voient.'
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas enregistrer ?',
        a: "Le nom de l'agence est obligatoire, l'e-mail doit être valide, la couleur doit être au format #RRGGBB et le site web doit commencer par http:// ou https://. Si le message parle de droits, demandez-les à l'administrateur de votre agence."
      },
      {
        q: 'Mon logo est refusé, que faire ?',
        a: 'Utilisez une image PNG, JPEG ou WebP de 2 Mo au plus. Pour la signature et le cachet : PNG ou JPEG, 2 Mo au plus, 3000 × 3000 pixels au plus ; les grandes images sont réduites automatiquement à 800 pixels.'
      },
      {
        q: 'Où servent la signature et le cachet ?',
        a: "Ils servent d'identité par défaut sur les documents d'une copropriété qui n'a pas de mandant."
      },
      {
        q: 'Où changer les honoraires, la TVA ou le paiement en ligne ?',
        a: "Dans les paramètres financiers, ouverts depuis le menu des paramètres de l'agence."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      note: "Ouvrir la page demande le droit de voir les paramètres de l'agence ; enregistrer demande celui de les modifier."
    },
    related: [
      { label: 'Paramètres financiers', helpId: 'administration.agence.finance' },
      { label: 'Portail propriétaire', helpId: 'administration.agence.parametres.portail-proprietaire' },
      { label: 'Paramètres financiers (écran)', to: '/tenant/:tenantId/settings/finance' }
    ],
    keywords: [
      'agence',
      'logo',
      'identité',
      'coordonnées',
      'adresse',
      'cachet',
      'signature',
      'couleur',
      "profil de l'agence",
      'réglages'
    ]
  },
  {
    id: 'administration.agence.parametres.portail-proprietaire',
    kind: 'section',
    title: 'Portail propriétaire',
    summary:
      "Choisissez ce que vos propriétaires voient dans l'onglet « Mon patrimoine » de leur portail. Chaque interrupteur s'enregistre dès que vous le basculez.",
    purpose:
      'Le portail propriétaire peut montrer une vue patrimoine : valorisation, rendements, emprunts, travaux et documents. Vous pouvez la masquer en entier ou section par section.',
    howToRead: {
      notes: [
        "« Afficher la vue patrimoine » est l'interrupteur principal. Quand il est coupé, les cinq autres sont grisés.",
        'Les cinq sections sont : « Valorisation et plus-value », « Rendements », « Emprunts », « Travaux » et « Documents ».',
        "Tant que vous n'avez rien enregistré, tout est affiché."
      ]
    },
    steps: [
      { title: 'Activer ou couper la vue', detail: 'Basculez « Afficher la vue patrimoine ».' },
      { title: 'Choisir les sections', detail: 'Basculez les interrupteurs des sections à montrer ou à cacher.' },
      { title: 'Vérifier le message', detail: 'Le message « Réglage mis à jour » confirme chaque enregistrement.' }
    ],
    consequences: [
      'Masquer « Emprunts » retire aussi le rendement net-net, qui en révélerait les mensualités.',
      "Le changement est immédiat : il n'y a pas de bouton « Enregistrer » sur cette carte.",
      'Sans le droit de modifier les paramètres, la carte passe en lecture seule après un refus du serveur.'
    ],
    faq: [
      {
        q: 'Mes propriétaires voient-ils encore leurs loyers si je coupe la vue patrimoine ?',
        a: "Ce réglage ne concerne que l'onglet « Mon patrimoine » de leur portail. L'écran ne dit rien des autres onglets."
      },
      {
        q: 'Pourquoi les interrupteurs sont-ils grisés ?',
        a: "Soit « Afficher la vue patrimoine » est coupé, soit vous n'avez pas la permission de modifier ces réglages."
      },
      {
        q: 'Puis-je défaire un changement ?',
        a: "Oui, basculez de nouveau l'interrupteur : il se réenregistre aussitôt."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      note: "Modifier ces réglages demande le droit de modifier les paramètres de l'agence."
    },
    related: [{ label: "Paramètres de l'agence", helpId: 'administration.agence.parametres' }],
    keywords: ['portail propriétaire', 'patrimoine', 'masquer', 'rendement', 'emprunt', 'valorisation']
  },
  {
    id: 'administration.agence.parametres.logo',
    kind: 'section',
    title: 'Logo et couleur de marque',
    summary:
      'Ajoutez le logo de votre agence et sa couleur de marque. Le logo est enregistré dès son envoi ; la couleur, avec le bouton « Enregistrer » de la page.',
    purpose: "Ces éléments donnent à votre agence une identité visuelle dans l'application.",
    steps: [
      { title: 'Téléverser un logo', detail: 'Cliquez sur « Téléverser un logo » et choisissez une image.' },
      {
        title: 'Remplacer ou retirer',
        detail: 'Téléversez une autre image pour remplacer le logo, ou cliquez sur « Retirer ».'
      },
      { title: 'Saisir la couleur', detail: 'Format #RRGGBB. Un carré de couleur vous montre le résultat.' },
      { title: 'Enregistrer la couleur', detail: 'Cliquez sur « Enregistrer » en bas de la page.' }
    ],
    consequences: [
      'Le logo est pris en compte immédiatement ; « Retirer » le supprime sans demander confirmation.',
      "La couleur n'est prise en compte qu'après « Enregistrer »."
    ],
    faq: [
      {
        q: 'Quels formats et quelle taille ?',
        a: 'PNG, JPEG ou WebP, 2 Mo au plus. Un autre format est refusé avec un message.'
      },
      {
        q: 'Quel format pour la couleur ?',
        a: 'Un code à six caractères précédé de #, par exemple #1677FF. Sinon le formulaire affiche « Couleur invalide (#RRGGBB) ».'
      },
      {
        q: 'Le logo apparaît-il tout de suite sur les documents ?',
        a: "Le logo est enregistré dès son envoi. Nous n'avons pas vérifié ici son usage sur chaque type de document."
      }
    ],
    related: [{ label: "Paramètres de l'agence", helpId: 'administration.agence.parametres' }],
    keywords: ['logo', 'couleur', 'marque', 'image', 'identité visuelle']
  },
  {
    id: 'administration.agence.parametres.signature-cachet',
    kind: 'section',
    title: 'Signature et cachet pour les documents',
    summary:
      "Ajoutez l'image de la signature et celle du cachet de l'agence. Chaque image est enregistrée dès son envoi, sans cliquer sur « Enregistrer ».",
    purpose:
      "Ces images servent d'identité par défaut sur les documents d'une copropriété qui n'a pas de mandant. Elles sont privées : l'application les affiche pour vous, mais ne les rend jamais publiques.",
    steps: [
      {
        title: 'Téléverser',
        detail: 'Sous « Signature » ou « Cachet », cliquez sur « Téléverser » et choisissez une image.'
      },
      { title: 'Remplacer', detail: 'Le bouton devient « Remplacer » quand une image existe.' },
      { title: 'Retirer', detail: "Cliquez sur « Retirer » : l'image est supprimée aussitôt." }
    ],
    consequences: [
      "Les grandes images sont réduites automatiquement à 800 pixels avant l'envoi.",
      'Retirer une image est immédiat et sans confirmation.'
    ],
    faq: [
      {
        q: 'Quelles images sont acceptées ?',
        a: 'PNG ou JPEG, 2 Mo au plus, 3000 × 3000 pixels au plus.'
      },
      {
        q: 'Faut-il cliquer sur « Enregistrer » ?',
        a: "Non, chaque image est enregistrée dès l'envoi ; le bouton « Enregistrer » de la page ne concerne que le formulaire."
      },
      {
        q: 'Ces images sont-elles visibles par tout le monde ?',
        a: "Non, elles sont privées : l'application les charge de façon sécurisée pour l'aperçu."
      }
    ],
    related: [{ label: "Paramètres de l'agence", helpId: 'administration.agence.parametres' }],
    keywords: ['signature', 'cachet', 'tampon', 'copropriété', 'mandant']
  },
  {
    id: 'administration.agence.parametres.informations',
    kind: 'section',
    title: 'Informations générales',
    summary:
      'Indiquez le nom de votre agence et, si vous le souhaitez, sa dénomination légale. Le nom est obligatoire.',
    purpose: "Le nom et la dénomination légale sont repris dans les documents générés par l'application.",
    steps: [
      { title: "Saisir le nom de l'agence", detail: 'Champ obligatoire.' },
      { title: 'Saisir la dénomination légale', detail: 'Champ facultatif : le nom officiel de votre société.' },
      { title: 'Enregistrer', detail: 'Cliquez sur « Enregistrer » en bas de la page.' }
    ],
    consequences: ["Les informations s'appliquent aux documents générés après l'enregistrement."],
    faq: [
      {
        q: 'Que se passe-t-il si je laisse le nom vide ?',
        a: "Le formulaire affiche « Le nom est requis » et rien n'est enregistré."
      },
      {
        q: 'Quelle différence entre le nom et la dénomination légale ?',
        a: 'Le nom est celui que vous utilisez au quotidien ; la dénomination légale est le nom officiel de la société, facultatif.'
      },
      {
        q: "Où saisir le site web de l'agence ?",
        a: "Dans la carte « Informations Supplémentaires », champ « Site web ». L'adresse doit commencer par http:// ou https://."
      }
    ],
    related: [{ label: "Paramètres de l'agence", helpId: 'administration.agence.parametres' }],
    keywords: ['nom', 'agence', 'dénomination', 'raison sociale', 'site web']
  },
  {
    id: 'administration.agence.parametres.contact',
    kind: 'section',
    title: 'Informations de contact',
    summary: "Indiquez l'e-mail et le téléphone de votre agence. Ils sont repris dans les documents générés.",
    purpose:
      "Vos locataires et propriétaires retrouvent ces coordonnées sur les documents que l'application génère pour votre agence.",
    steps: [
      { title: "Saisir l'e-mail de contact", detail: 'Un e-mail valide, par exemple contact@agence.com.' },
      { title: 'Saisir le téléphone de contact', detail: 'Par exemple +225 XX XX XX XX XX.' },
      { title: 'Enregistrer', detail: 'Cliquez sur « Enregistrer » en bas de la page.' }
    ],
    consequences: ["L'e-mail et le téléphone sont utilisés dans les documents générés après l'enregistrement."],
    faq: [
      {
        q: 'Pourquoi « Email invalide » ?',
        a: "Le format de l'adresse n'est pas reconnu : vérifiez le @ et le nom de domaine."
      },
      {
        q: 'Ces champs sont-ils obligatoires ?',
        a: 'Non, mais ils sont utilisés dans les documents : mieux vaut les renseigner.'
      },
      {
        q: 'Cet e-mail sert-il à me connecter ?',
        a: "Non, c'est l'e-mail de contact de l'agence affiché sur les documents, pas un identifiant de connexion."
      }
    ],
    related: [{ label: "Paramètres de l'agence", helpId: 'administration.agence.parametres' }],
    keywords: ['e-mail', 'email', 'téléphone', 'contact', 'coordonnées']
  },
  {
    id: 'administration.agence.parametres.adresse',
    kind: 'section',
    title: 'Adresse',
    summary:
      "Indiquez l'adresse complète, la ville et le pays de votre agence. L'adresse est reprise dans les documents générés.",
    purpose: "L'adresse apparaît dans les documents que l'application génère pour votre agence.",
    steps: [
      {
        title: "Saisir l'adresse complète",
        detail: 'Rue, quartier, repère : comme vous voulez la voir sur les documents.'
      },
      { title: 'Saisir la ville et le pays', detail: 'Deux champs libres, facultatifs.' },
      { title: 'Enregistrer', detail: 'Cliquez sur « Enregistrer » en bas de la page.' }
    ],
    consequences: ["Les documents générés après l'enregistrement utilisent la nouvelle adresse."],
    faq: [
      {
        q: 'Tous les champs sont-ils obligatoires ?',
        a: "Non, aucun champ de cette carte n'est obligatoire."
      },
      {
        q: "J'ai déménagé, que faire ?",
        a: "Modifiez l'adresse ici puis cliquez sur « Enregistrer » : les prochains documents la reprendront."
      },
      {
        q: 'Les anciens documents changent-ils ?',
        a: "L'écran ne le dit pas : par prudence, considérez que seuls les nouveaux documents utilisent la nouvelle adresse."
      }
    ],
    related: [{ label: "Paramètres de l'agence", helpId: 'administration.agence.parametres' }],
    keywords: ['adresse', 'ville', 'pays', 'siège']
  },

  // ------------------------------------------------------------------ Paramètres financiers
  {
    id: 'administration.agence.finance',
    kind: 'page',
    title: 'Paramètres financiers',
    summary:
      "Réglez la fiscalité, les honoraires de gestion, les comptes comptables, les pénalités, la retenue à la source et le paiement en ligne de votre agence. Les relevés de gérance s'appuient sur ces réglages.",
    purpose:
      "Chaque calcul de relevé de gérance relit ces paramètres et en fige une copie : modifier un taux ici ne change pas un relevé déjà produit. Certaines cartes n'apparaissent que si votre abonnement comprend la gestion locative.",
    steps: [
      {
        title: 'Vérifier le bandeau',
        detail:
          "Si un bandeau jaune indique que les paramètres n'ont jamais été enregistrés, les valeurs affichées sont des propositions."
      },
      { title: 'Régler la fiscalité', detail: 'TVA, taux et numéro de compte contribuable.' },
      { title: 'Fixer les honoraires de gestion', detail: 'Pourcentage ou forfait par échéance (gestion locative).' },
      { title: 'Vérifier les comptes comptables', detail: 'À faire valider par votre comptable.' },
      { title: 'Choisir le sort des pénalités et de la retenue à la source', detail: 'Gestion locative seulement.' },
      {
        title: 'Enregistrer',
        detail:
          'Le bouton « Enregistrer » du formulaire couvre ces cartes. Les cartes du bas (paiement en ligne, conditions par propriétaire, commission des collaborateurs) ont leurs propres boutons.'
      }
    ],
    consequences: [
      "Les encaissements déjà faits gardent les honoraires de leurs conditions d'alors.",
      "Tant que le taux d'honoraires n'est pas fixé, les relevés de gérance ne déduisent aucun honoraire.",
      "Sans le droit de modifier les paramètres de l'agence, le formulaire est en lecture seule et le bouton « Enregistrer » n'apparaît pas."
    ],
    faq: [
      {
        q: 'Pourquoi certaines cartes manquent-elles ?',
        a: "Honoraires, pénalités et retenue à la source n'apparaissent que si votre abonnement comprend la gestion locative. Les conditions par propriétaire et la commission des collaborateurs sont aussi masquées avec un pack Patrimoine seul."
      },
      {
        q: 'Un relevé déjà produit va-t-il changer ?',
        a: 'Non : les relevés de gérance en gardent une copie figée.'
      },
      {
        q: 'Qui peut modifier ces réglages ?',
        a: "Il faut le droit de modifier les paramètres de l'agence. Sans lui, vous pouvez seulement consulter."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      note: "Voir demande le droit de voir les paramètres de l'agence ; enregistrer demande celui de les modifier."
    },
    related: [
      { label: 'Honoraires de gestion', helpId: 'administration.agence.finance.honoraires' },
      { label: 'Paiement en ligne', helpId: 'administration.agence.finance.paiement-en-ligne' },
      { label: "Paramètres de l'agence", helpId: 'administration.agence.parametres' }
    ],
    keywords: [
      'finance',
      'honoraires',
      'TVA',
      'comptes',
      'pénalités',
      'retenue',
      'relevé de gérance',
      'réglages financiers'
    ]
  },
  {
    id: 'administration.agence.finance.fiscalite',
    kind: 'section',
    title: 'Fiscalité',
    summary:
      'Indiquez si votre agence est assujettie à la TVA, le taux appliqué et son numéro de compte contribuable (NCC).',
    purpose: 'Ces informations servent au calcul de la TVA sur les honoraires de gestion.',
    steps: [
      { title: 'Activer la TVA', detail: "Cochez « L'agence est assujettie à la TVA » si elle est soumise à la TVA." },
      {
        title: 'Saisir le taux',
        detail: "« Taux de TVA (%) » : de 0 à 100. Il reste grisé tant que la TVA n'est pas activée."
      },
      { title: 'Saisir le NCC', detail: '« Numéro de compte contribuable (NCC) » : 30 caractères au plus.' },
      { title: 'Enregistrer', detail: 'Bouton « Enregistrer » en bas du formulaire.' }
    ],
    consequences: [
      "Une agence soumise à l'impôt synthétique ne facture pas la TVA : laissez l'interrupteur coupé.",
      'Le taux proposé par défaut est 18 %.'
    ],
    faq: [
      { q: 'Pourquoi le taux est-il grisé ?', a: "Parce que l'agence n'est pas déclarée assujettie à la TVA." },
      { q: 'Le NCC est-il obligatoire ?', a: 'Non, le champ est facultatif.' },
      {
        q: "Où voir l'effet de la TVA ?",
        a: 'Dans la carte « Honoraires de gestion », un exemple chiffré affiche les honoraires, la TVA et le net au propriétaire.'
      }
    ],
    related: [{ label: 'Honoraires de gestion', helpId: 'administration.agence.finance.honoraires' }],
    keywords: ['TVA', 'NCC', 'impôt synthétique', 'contribuable', 'taux']
  },
  {
    id: 'administration.agence.finance.honoraires',
    kind: 'section',
    title: 'Honoraires de gestion',
    summary:
      "Fixez ce que l'agence prélève sur les loyers encaissés : un pourcentage ou un forfait par échéance. Un exemple chiffré s'affiche sous le formulaire.",
    purpose:
      'Les relevés de gérance déduisent ces honoraires du loyer avant de reverser le net au propriétaire. Un propriétaire ou un bail peut avoir des conditions particulières, qui priment sur celles-ci.',
    howToRead: {
      notes: [
        "Exemple : sur un loyer encaissé de 200 000 FCFA, l'écran affiche les honoraires, la TVA (si l'agence y est assujettie) et le net au propriétaire.",
        "Pourcentage : le taux s'applique soit au loyer seul (hors charges et pénalités), soit à tout ce qui est encaissé.",
        "Forfait par échéance : dû en entier si l'échéance est payée en totalité, au prorata sinon."
      ]
    },
    steps: [
      { title: 'Choisir le mode de calcul', detail: '« Pourcentage » ou « Forfait par échéance ».' },
      {
        title: 'Saisir le taux ou le forfait',
        detail:
          "En pourcentage, laissez vide tant que le taux n'est pas décidé. En forfait, le montant doit être supérieur à 0."
      },
      {
        title: 'Choisir la base de calcul',
        detail:
          '« Le loyer seul, hors charges et pénalités » ou « Tout ce qui est encaissé » (mode pourcentage seulement).'
      },
      { title: "Contrôler l'exemple chiffré", detail: 'Vérifiez le net au propriétaire.' },
      { title: 'Enregistrer', detail: 'Bouton « Enregistrer » en bas du formulaire.' }
    ],
    consequences: [
      "Les encaissements déjà faits gardent les honoraires de leurs conditions d'alors ; la modification ne vaut que pour la suite.",
      "Tant que le taux n'est pas fixé, aucun honoraire n'est déduit sur les relevés de gérance.",
      "Cette carte n'apparaît que si votre abonnement comprend la gestion locative."
    ],
    faq: [
      {
        q: 'Que veut dire « Laisser vide tant que le taux n’est pas décidé » ?',
        a: "Un taux vide n'est pas un taux de zéro : il signifie « pas encore paramétré »."
      },
      {
        q: 'Les honoraires peuvent-ils être différents pour un propriétaire ?',
        a: 'Oui, dans la carte « Conditions par propriétaire ». Un bail peut aussi avoir ses conditions particulières ; celles-ci priment.'
      },
      {
        q: 'Le forfait est-il réduit si le locataire paie en partie ?',
        a: "Oui, il est dû au prorata de ce qui est payé ; l'exemple de l'écran suppose une échéance entièrement payée."
      }
    ],
    permissions: { feature: 'RENTAL', note: "Réservé aux agences dont l'abonnement comprend la gestion locative." },
    related: [
      { label: 'Conditions par propriétaire', helpId: 'administration.agence.finance.proprietaires' },
      { label: 'Fiscalité', helpId: 'administration.agence.finance.fiscalite' }
    ],
    keywords: ['honoraires', 'commission', 'pourcentage', 'forfait', 'gestion locative', 'loyer', 'taux']
  },
  {
    id: 'administration.agence.finance.comptes',
    kind: 'section',
    title: 'Comptes comptables',
    summary:
      "Indiquez les numéros de comptes SYSCOHADA qui reçoivent les écritures de l'agence. Faites-les valider par votre comptable.",
    purpose:
      "Avec la gestion locative, la carte s'appelle « Comptes comptables de la gestion locative » ; sinon, « Comptes comptables de la caisse », avec seulement les écarts de caisse.",
    howToRead: {
      notes: [
        '« Fonds des propriétaires » : compte de tiers « Mandants », avec un auxiliaire par propriétaire. Proposé : 4731.',
        '« Honoraires de gestion » : compte de produit « Honoraires de gestion locative ». Proposé : 70611.',
        '« TVA collectée » : compte de la TVA sur les honoraires. Proposé : 4432.',
        '« Écart de caisse — manquant » : compte de charge débité quand une session de caisse révèle un manquant, après enquête. Exemple : 6588.',
        '« Écart de caisse — excédent » : compte de produit crédité quand une session de caisse révèle un excédent, après enquête. Exemple : 7588.'
      ]
    },
    steps: [
      { title: 'Relire les numéros proposés', detail: "Ils sont proposés tant que rien n'a été enregistré." },
      { title: 'Corriger si besoin', detail: 'Un numéro ne contient que des chiffres : 2 à 12.' },
      { title: 'Enregistrer', detail: 'Bouton « Enregistrer » en bas du formulaire.' }
    ],
    consequences: [
      'Le numéro choisi vaut pour les écritures à venir.',
      "Les trois premiers comptes ne s'affichent qu'avec la gestion locative."
    ],
    faq: [
      {
        q: 'Que mettre si je ne connais pas mes comptes ?',
        a: 'Gardez les numéros proposés, puis faites-les valider par votre comptable.'
      },
      {
        q: 'Pourquoi « Un numéro de compte ne contient que des chiffres (2 à 12) » ?',
        a: 'Le numéro contient une lettre, un espace, ou compte moins de 2 ou plus de 12 chiffres.'
      },
      {
        q: 'Puis-je laisser un compte vide ?',
        a: "Les champs ne sont pas obligatoires à l'écran. Pour les pénalités revenant à l'agence, le compte de produit est en revanche exigé."
      }
    ],
    related: [{ label: 'Pénalités de retard', helpId: 'administration.agence.finance.penalites' }],
    keywords: ['comptes', 'comptable', 'SYSCOHADA', 'caisse', 'écart de caisse', 'mandants', 'TVA collectée']
  },
  {
    id: 'administration.agence.finance.penalites',
    kind: 'section',
    title: 'Pénalités de retard',
    summary:
      "Choisissez qui reçoit les pénalités de retard encaissées : le propriétaire ou l'agence. Si elles reviennent à l'agence, indiquez le compte de produit.",
    purpose: 'Le choix décide à qui reviennent les pénalités une fois payées par le locataire.',
    steps: [
      { title: 'Choisir le bénéficiaire', detail: "« Le propriétaire » ou « L'agence »." },
      {
        title: 'Indiquer le compte de produit',
        detail: "« Compte de produit des pénalités » : obligatoire quand les pénalités reviennent à l'agence."
      },
      { title: 'Enregistrer', detail: 'Bouton « Enregistrer » en bas du formulaire.' }
    ],
    consequences: [
      "Le champ « Compte de produit des pénalités » n'apparaît que si le bénéficiaire est « L'agence ».",
      "Cette carte n'apparaît que si votre abonnement comprend la gestion locative."
    ],
    faq: [
      {
        q: 'Quel est le choix par défaut ?',
        a: "Tant que rien n'est enregistré, « Le propriétaire » est proposé."
      },
      {
        q: 'Pourquoi le compte de produit est-il exigé ?',
        a: "Parce que les pénalités qui reviennent à l'agence sont un produit de l'agence : il faut un compte pour les enregistrer."
      },
      {
        q: 'Où se règle la pénalité elle-même ?',
        a: "Ce réglage ne dit que qui la reçoit. L'écran ne règle ni son montant ni son déclenchement."
      }
    ],
    permissions: { feature: 'RENTAL', note: "Réservé aux agences dont l'abonnement comprend la gestion locative." },
    related: [{ label: 'Comptes comptables', helpId: 'administration.agence.finance.comptes' }],
    keywords: ['pénalités', 'retard', 'bénéficiaire', 'impayé']
  },
  {
    id: 'administration.agence.finance.retenue',
    kind: 'section',
    title: 'Retenue à la source sur loyers',
    summary:
      "Activez la retenue à la source sur les loyers, seulement après confirmation de votre cabinet. Elle ne s'applique jamais aux loyers encaissés avant la date choisie.",
    purpose:
      "La retenue est calculée à partir du statut fiscal de chaque propriétaire, que vous réglez dans « Conditions par propriétaire ». Elle est désactivée tant que vous ne l'avez pas activée.",
    howToRead: {
      notes: [
        'Taux proposés par défaut : 12 % pour une personne physique, 15 % pour une personne morale.',
        'Compte de retenue proposé : 4478.',
        'Un bandeau rappelle : à activer seulement après confirmation du cabinet (statut fiscal de chaque propriétaire, assiette et échéances).'
      ]
    },
    steps: [
      {
        title: 'Activer la retenue',
        detail: "« Appliquer une retenue à la source sur les loyers ». La date de départ se remplit avec aujourd'hui."
      },
      {
        title: 'Choisir la date de départ',
        detail: '« Appliquer aux encaissements à partir du » : obligatoire quand la retenue est activée.'
      },
      { title: 'Vérifier les taux', detail: '« Taux — personne physique (%) » et « Taux — personne morale (%) ».' },
      { title: 'Vérifier le compte', detail: '« Compte de retenue à la source ».' },
      { title: 'Régler le statut fiscal des propriétaires', detail: 'Dans la carte « Conditions par propriétaire ».' },
      { title: 'Enregistrer', detail: 'Bouton « Enregistrer » en bas du formulaire.' }
    ],
    consequences: [
      "La retenue n'est jamais appliquée aux loyers déjà encaissés avant la date de départ.",
      "Sans date de départ, l'enregistrement est refusé quand la retenue est activée.",
      "Cette carte n'apparaît que si votre abonnement comprend la gestion locative."
    ],
    faq: [
      {
        q: "Dois-je l'activer ?",
        a: 'Seulement après confirmation de votre cabinet comptable : statut fiscal de chaque propriétaire, base de calcul et échéances.'
      },
      {
        q: 'Pourquoi une date de départ ?',
        a: 'Pour que la retenue ne soit jamais rétroactive : elle ne touche que les loyers encaissés à partir de cette date.'
      },
      {
        q: 'Quel taux est utilisé pour un propriétaire exonéré ?',
        a: "L'écran ne le précise pas. À confirmer auprès de votre cabinet avant d'activer la retenue."
      }
    ],
    permissions: { feature: 'RENTAL', note: "Réservé aux agences dont l'abonnement comprend la gestion locative." },
    related: [{ label: 'Conditions par propriétaire', helpId: 'administration.agence.finance.proprietaires' }],
    keywords: ['retenue à la source', 'impôt', 'loyers', 'propriétaire', 'taux', 'DGI']
  },
  {
    id: 'administration.agence.finance.paiement-en-ligne',
    kind: 'section',
    title: 'Paiement en ligne',
    summary:
      "Permettez à vos locataires de régler leurs échéances depuis leur portail, via la page de paiement de l'agrégateur PaySecureHub. Configurez ici le mode, vos identifiants et le compte qui reçoit l'argent.",
    purpose:
      "Le locataire paie sur la page hébergée de l'agrégateur ; l'encaissement arrive sur le compte de trésorerie que vous choisissez. Le bouton « Tester la connexion » vérifie vos identifiants.",
    howToRead: {
      notes: [
        "« Simulateur » est un mode d'essai, disponible seulement si votre environnement l'autorise ; « Réel » utilise vos identifiants PaySecureHub.",
        "La clé API enregistrée n'est jamais réaffichée : seuls ses 4 derniers caractères le sont.",
        "« Adresse de notification (IPN) » : l'adresse que l'agrégateur appelle pour confirmer un paiement.",
        '« Dernier test » : résultat et date du dernier test de connexion.'
      ]
    },
    steps: [
      { title: 'Choisir le mode', detail: '« Simulateur » pour essayer, « Réel » pour de vrais paiements.' },
      { title: "Saisir l'identifiant marchand", detail: 'Obligatoire en mode réel.' },
      {
        title: 'Saisir la clé API',
        detail:
          'Cliquez sur « Remplacer la clé » pour en saisir une nouvelle. Laissée inactive, la clé enregistrée reste inchangée.'
      },
      {
        title: 'Choisir le compte de trésorerie',
        detail:
          "Comptes Mobile Money et banque uniquement. Sans choix, un compte de collecte est créé automatiquement à l'activation."
      },
      { title: 'Choisir qui paie les frais', detail: "« Le locataire » ou « L'agence »." },
      { title: 'Activer et enregistrer', detail: '« Activer le paiement en ligne », puis « Enregistrer ».' },
      {
        title: 'Tester la connexion',
        detail: "Cliquez sur « Tester la connexion » : le résultat s'affiche et « Dernier test » est mis à jour."
      }
    ],
    consequences: [
      "Activer le mode réel exige l'identifiant marchand et la clé API ; sinon l'enregistrement est refusé.",
      "Changer le mode, l'identifiant marchand ou la clé est refusé tant que des paiements attendent leur confirmation.",
      'Le test de connexion est conservé dans « Dernier test » ; en mode réel, il affiche le solde du compte marchand.',
      'Sans clé de chiffrement sur le serveur, aucune clé API ne peut être enregistrée : un bandeau le signale.'
    ],
    faq: [
      {
        q: 'Que fait « Tester la connexion » ?',
        a: "Il vérifie auprès de PaySecureHub que l'identifiant marchand et la clé fonctionnent. En mode simulateur, la connexion est toujours disponible."
      },
      {
        q: 'Pourquoi le mode simulateur est-il grisé ?',
        a: "Votre environnement ne l'autorise pas : un bandeau le précise."
      },
      {
        q: 'Ai-je perdu ma clé API si je clique sur « Remplacer la clé » ?',
        a: "Non, la clé n'est remplacée que si vous saisissez la nouvelle puis enregistrez."
      },
      {
        q: 'Les locataires peuvent-ils payer tout de suite ?',
        a: 'Pour payer en ligne, la configuration doit être active et votre abonnement comprendre la gestion locative.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      note: "Enregistrer et tester demandent le droit de modifier les paramètres de l'agence."
    },
    related: [{ label: 'Paramètres financiers', helpId: 'administration.agence.finance' }],
    keywords: [
      'paiement en ligne',
      'PaySecureHub',
      'passerelle',
      'Mobile Money',
      'clé API',
      'agrégateur',
      'IPN',
      'marchand'
    ],
    tour: {
      steps: [
        {
          target: 'passerelle-identifiants',
          title: 'Mode et identifiants',
          description:
            'Choisissez le mode, saisissez votre identifiant marchand et votre clé API, puis le compte de trésorerie et qui paie les frais.'
        },
        {
          target: 'passerelle-enregistrer',
          title: 'Enregistrer',
          description: "Enregistrez vos choix. Le mode réel exige l'identifiant marchand et la clé API."
        },
        {
          target: 'passerelle-tester',
          title: 'Tester la connexion',
          description: 'Vérifiez que vos identifiants fonctionnent : le résultat est conservé dans « Dernier test ».'
        },
        {
          target: 'passerelle-ipn',
          title: 'Adresse de notification',
          description: "C'est l'adresse que l'agrégateur appelle pour confirmer les paiements : elle peut se copier."
        }
      ]
    }
  },
  {
    id: 'administration.agence.finance.proprietaires',
    kind: 'section',
    title: 'Conditions par propriétaire',
    summary:
      "Donnez à un propriétaire des honoraires différents de ceux de l'agence, et indiquez son statut fiscal pour la retenue à la source. Sans conditions particulières, il suit l'agence.",
    purpose:
      "Le taux applicable à un encaissement se résout dans cet ordre : le bail, puis le propriétaire, puis l'agence.",
    steps: [
      {
        title: 'Trouver le propriétaire',
        detail: 'Recherchez par nom ou e-mail, ou filtrez par conditions et statut fiscal.'
      },
      {
        title: 'Modifier',
        detail:
          'Cliquez sur « Modifier » : choisissez le mode, le taux ou le forfait, la base de calcul et le statut fiscal.'
      },
      { title: 'Enregistrer', detail: 'Bouton « Enregistrer » de la fenêtre.' },
      {
        title: "Revenir aux conditions de l'agence",
        detail: "Bouton « Revenir aux conditions de l'agence », puis « Revenir » pour confirmer."
      }
    ],
    consequences: [
      "« Revenir aux conditions de l'agence » supprime les conditions particulières du propriétaire.",
      "Les conditions d'un bail, si elles existent, priment sur celles du propriétaire.",
      "Cette carte n'apparaît que pour la gestion locative pour un tiers ; avec un pack Patrimoine seul, elle est masquée."
    ],
    faq: [
      {
        q: "Que veut dire « Suit l'agence » ?",
        a: "Le propriétaire n'a pas de conditions particulières : les honoraires de l'agence s'appliquent."
      },
      {
        q: 'À quoi sert le statut fiscal ?',
        a: 'À déterminer le taux de retenue à la source applicable à ce propriétaire, une fois la retenue activée.'
      },
      {
        q: 'Je vois « Non inclus dans votre pack ».',
        a: "Votre abonnement ne comprend pas la gestion locative : la carte n'est alors pas disponible."
      }
    ],
    permissions: { feature: 'RENTAL', note: "Modifier demande le droit de modifier les paramètres de l'agence." },
    related: [
      {
        label: 'Tableau des conditions par propriétaire',
        helpId: 'administration.agence.finance.proprietaires.tableau'
      },
      { label: 'Honoraires de gestion', helpId: 'administration.agence.finance.honoraires' }
    ],
    keywords: ['propriétaire', 'honoraires particuliers', 'conditions particulières', 'statut fiscal', 'exonéré']
  },
  {
    id: 'administration.agence.finance.proprietaires.tableau',
    kind: 'table',
    title: 'Tableau des conditions par propriétaire',
    summary:
      "Une ligne par propriétaire, avec ses honoraires et son statut fiscal. Les propriétaires sans conditions particulières affichent « Suit l'agence ».",
    howToRead: {
      columns: [
        { key: 'ownerName', label: 'Propriétaire', description: 'Nom du propriétaire.' },
        { key: 'leaseCount', label: 'Baux', description: 'Nombre de baux concernant ce propriétaire.' },
        {
          key: 'terms',
          label: 'Conditions',
          description:
            "Ses honoraires : « Suit l'agence », un pourcentage (du loyer seul ou de tout ce qui est encaissé), un forfait, ou « Taux non défini »."
        },
        {
          key: 'ownerTaxStatus',
          label: 'Statut fiscal (retenue à la source)',
          description: 'Personne physique, Personne morale, Exonéré ou Non renseigné.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            "« Modifier », et « Revenir aux conditions de l'agence » quand des conditions particulières existent."
        }
      ],
      notes: ["Les filtres proposés : « Conditions » (Suit l'agence, Pourcentage, Forfait) et « Statut fiscal »."]
    },
    faq: [
      {
        q: 'Comment chercher un propriétaire ?',
        a: 'Tapez son nom ou son e-mail dans le champ de recherche.'
      },
      {
        q: 'Que signifie « Taux non défini » ?',
        a: 'Le propriétaire a des conditions en pourcentage, mais sans taux renseigné.'
      },
      {
        q: 'Puis-je exporter le tableau ?',
        a: 'Oui, avec le bouton « Exporter » ; tous les propriétaires correspondant à vos filtres sont exportés.'
      }
    ],
    related: [{ label: 'Conditions par propriétaire', helpId: 'administration.agence.finance.proprietaires' }],
    keywords: ['propriétaires', 'tableau', 'honoraires', 'statut fiscal']
  },
  {
    id: 'administration.agence.finance.commissions',
    kind: 'section',
    title: 'Commission des collaborateurs',
    summary:
      "Indiquez la part des honoraires reversée à chaque collaborateur sur les baux dont il est le gestionnaire. La part s'exprime en pourcentage des honoraires hors taxes.",
    purpose:
      "La part enregistrée sert au calcul de la commission d'un collaborateur sur les baux dont il est le gestionnaire.",
    steps: [
      { title: 'Trouver le collaborateur', detail: 'Au-delà de 10 collaborateurs, un champ de recherche apparaît.' },
      { title: 'Saisir la part', detail: 'Colonne « Part (%) », de 0 à 100.' },
      {
        title: 'Enregistrer la ligne',
        detail: "Bouton « Enregistrer » de la ligne : il ne s'active que si la valeur a changé."
      }
    ],
    consequences: [
      "Chaque ligne s'enregistre séparément : le bouton de la page ne les couvre pas.",
      'Une nouvelle part ne change pas les honoraires déjà figés sur un encaissement passé.',
      "Cette carte n'apparaît que pour la gestion locative pour un tiers ; avec un pack Patrimoine seul, elle est masquée."
    ],
    faq: [
      {
        q: 'Pourquoi le bouton « Enregistrer » est-il grisé ?',
        a: 'La valeur saisie est identique à celle déjà enregistrée.'
      },
      {
        q: 'Sur quoi porte la part ?',
        a: 'Sur les honoraires hors taxes des baux dont le collaborateur est le gestionnaire.'
      },
      {
        q: 'Un collaborateur sans part ?',
        a: "Laissez le champ vide : aucune part n'est enregistrée pour lui."
      }
    ],
    permissions: { feature: 'RENTAL', note: "Enregistrer demande le droit de modifier les paramètres de l'agence." },
    related: [{ label: 'Tableau des commissions', helpId: 'administration.agence.finance.commissions.tableau' }],
    keywords: ['commission', 'collaborateur', 'négociateur', 'part', 'honoraires', 'gestionnaire']
  },
  {
    id: 'administration.agence.finance.commissions.tableau',
    kind: 'table',
    title: 'Tableau des commissions',
    summary: 'Une ligne par collaborateur, avec sa part en pourcentage. Saisissez la part puis enregistrez la ligne.',
    howToRead: {
      columns: [
        { key: 'fullName', label: 'Collaborateur', description: 'Nom du collaborateur.' },
        { key: 'email', label: 'E-mail', description: 'Adresse e-mail du collaborateur.' },
        {
          key: 'sharePercent',
          label: 'Part (%)',
          description:
            "La part des honoraires hors taxes qui lui est reversée, de 0 à 100. La valeur enregistrée apparaît à l'export, pas celle en cours de saisie."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: 'Bouton « Enregistrer » de la ligne, actif seulement si la part a changé.'
        }
      ]
    },
    faq: [
      {
        q: 'Mes saisies sont-elles perdues si je change de ligne ?',
        a: 'Non, chaque ligne garde sa saisie tant que vous ne quittez pas la page ; mais seule « Enregistrer » la conserve.'
      },
      {
        q: 'Comment chercher ?',
        a: 'Le champ de recherche (nom ou e-mail) apparaît au-delà de 10 collaborateurs.'
      },
      {
        q: 'Puis-je exporter ?',
        a: 'Oui, avec « Exporter » : la colonne « Part (%) » contient la valeur enregistrée.'
      }
    ],
    related: [{ label: 'Commission des collaborateurs', helpId: 'administration.agence.finance.commissions' }],
    keywords: ['commission', 'collaborateurs', 'part', 'tableau']
  },

  // ------------------------------------------------------------------ Abonnement
  {
    id: 'administration.agence.abonnement',
    kind: 'page',
    title: 'Abonnement',
    summary:
      "Consultez la formule de votre agence, ce que vous consommez et les modules ouverts, puis envoyez une demande d'extension à l'équipe ImmoTopia. Les changements de formule passent par ImmoTopia.",
    purpose:
      'Cette page est en consultation : vous ne modifiez pas la formule vous-même. Les factures et le paiement en ligne sont sur la page « Facturation ».',
    howToRead: {
      statuses: [
        { value: 'NONE', label: 'Aucun abonnement', description: "L'agence n'a pas encore d'abonnement." },
        { value: 'TRIAL', label: 'Essai', description: "Période d'essai : les jours restants s'affichent." },
        { value: 'ACTIVE', label: 'Actif', description: 'Abonnement en cours.' },
        {
          value: 'GRACE',
          label: 'Grâce',
          description: "Période de grâce avant la lecture seule, après la fin d'un essai ou d'une échéance impayée."
        },
        {
          value: 'READ_ONLY',
          label: 'Lecture seule',
          description: "Le compte est en lecture seule : un bandeau l'indique."
        }
      ],
      notes: [
        'Un bandeau « Compte en lecture seule » indique le motif décidé par ImmoTopia ou vous renvoie vers la facturation pour régler la facture en attente.'
      ]
    },
    steps: [
      {
        title: 'Lire la formule',
        detail: 'Carte « Formule » : statut, cycle de facturation, packs et période en cours.'
      },
      { title: 'Suivre la consommation', detail: 'Carte « Consommation » : chaque barre montre utilisé / limite.' },
      { title: 'Voir les modules', detail: 'Carte « Modules » : ce que votre abonnement ouvre.' },
      {
        title: 'Demander une extension',
        detail: 'Carte « Demander une extension » : choisissez une offre, décrivez votre besoin, envoyez.'
      },
      { title: 'Suivre vos demandes', detail: 'Le tableau « Mes demandes » apparaît dès la première demande.' }
    ],
    consequences: [
      "Une demande d'extension est enregistrée et envoyée par e-mail aux administrateurs d'ImmoTopia ; elle ne modifie pas votre abonnement tant qu'ImmoTopia ne l'a pas traitée.",
      "Un compte en lecture seule peut encore consulter cette page et régler ses factures. Les modifications dans le reste de l'application peuvent être refusées."
    ],
    faq: [
      {
        q: 'Comment changer de pack ?',
        a: "Les modifications de la formule passent par l'équipe ImmoTopia : utilisez « Demander une extension » ou contactez-la."
      },
      {
        q: 'Que faire si le compte est en lecture seule ?',
        a: "Réglez la facture en attente depuis la page « Facturation » pour retrouver l'accès complet. Si le motif est décidé par ImmoTopia, contactez-la."
      },
      {
        q: 'Pourquoi voit-on « Accès réservé » ?',
        a: "La page est réservée aux personnes autorisées à consulter les paramètres de l'agence."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      note: "Consulter demande le droit de voir les paramètres de l'agence ; envoyer une demande demande celui de les modifier."
    },
    related: [
      { label: 'Facturation', helpId: 'administration.agence.facturation' },
      { label: 'Page « Facturation »', to: '/tenant/:tenantId/settings/facturation' }
    ],
    keywords: ['abonnement', 'pack', 'formule', 'extension', 'quota', 'essai', 'lecture seule', 'consommation']
  },
  {
    id: 'administration.agence.abonnement.formule',
    kind: 'section',
    title: 'Formule',
    summary: 'Voyez le statut de votre abonnement, son cycle de facturation, vos packs et la période en cours.',
    purpose: 'Cette carte est un simple constat : vous ne modifiez rien ici.',
    howToRead: {
      statuses: [
        { value: 'NONE', label: 'Aucun abonnement', description: "Pas d'abonnement pour l'agence." },
        { value: 'TRIAL', label: 'Essai', description: "Période d'essai : « Jours d'essai restants » s'affiche." },
        { value: 'ACTIVE', label: 'Actif', description: 'Abonnement en cours.' },
        { value: 'GRACE', label: 'Grâce', description: 'Période de grâce avant la lecture seule.' },
        { value: 'READ_ONLY', label: 'Lecture seule', description: 'Compte en lecture seule.' }
      ],
      notes: [
        '« Cycle de facturation » : « Mensuel » ou « Annuel (11 mois facturés) ».',
        '« Packs » : les packs détenus, parmi Agence, Syndic, Promoteur, Opérateur intégré, Patrimoine Essentiel, Patrimoine Pro, Particulier Gratuit et Particulier Plus.',
        '« Période en cours » : dates de début et de fin.'
      ]
    },
    consequences: ["Rien n'est modifié par cette carte."],
    faq: [
      {
        q: 'Que veut dire « Annuel (11 mois facturés) » ?',
        a: 'Le cycle annuel est facturé à raison de 11 mois pour 12.'
      },
      {
        q: 'À quoi correspond la période de grâce ?',
        a: "Après la fin d'un essai ou d'une échéance impayée, vous gardez un délai avant le passage en lecture seule."
      },
      {
        q: 'Où régler une facture en attente ?',
        a: 'Sur la page « Facturation », lien « Aller à la facturation » du bandeau.'
      }
    ],
    related: [{ label: 'Facturation', helpId: 'administration.agence.facturation' }],
    keywords: ['formule', 'packs', 'cycle', 'période', 'statut', 'essai']
  },
  {
    id: 'administration.agence.abonnement.consommation',
    kind: 'section',
    title: 'Consommation',
    summary:
      "Une barre par capacité de votre abonnement, avec ce que vous avez utilisé sur ce que vous pouvez utiliser. Elle passe à l'orange à partir de 80 % et au rouge à 100 %.",
    purpose: 'Elle vous prévient quand vous approchez de la limite de votre formule.',
    howToRead: {
      notes: [
        'Capacités possibles : « Lots », « Copropriétés », « Chantiers », « Biens détenus », « Actifs », « Photos d’inventaire analysées (par mois) » et « Signatures électroniques (par mois) ».',
        "Seules les capacités de votre formule, ou qu'une extension peut ouvrir, s'affichent.",
        'Le chiffre « 12 / 100 » se lit : 12 utilisés sur 100 disponibles.'
      ]
    },
    steps: [
      { title: 'Lire les barres', detail: 'Vert sous 80 %, orange à partir de 80 %, rouge à 100 %.' },
      { title: 'Demander plus', detail: 'Utilisez « Demander une extension » plus bas.' }
    ],
    consequences: [
      "Cette carte ne modifie rien. Ce qui se passe au-delà d'une limite dépend de votre formule : consultez l'équipe ImmoTopia."
    ],
    faq: [
      {
        q: 'Pourquoi une capacité manque-t-elle ?',
        a: "Seules les capacités de vos packs, ou que les extensions peuvent ouvrir, s'affichent."
      },
      {
        q: 'Les photos et signatures sont-elles comptées chaque mois ?',
        a: 'Oui, ces deux capacités sont indiquées « par mois ».'
      },
      {
        q: 'Que faire à 100 % ?',
        a: "Envoyez une demande d'extension à l'équipe ImmoTopia."
      }
    ],
    related: [{ label: 'Demander une extension', helpId: 'administration.agence.abonnement.extension' }],
    keywords: ['consommation', 'quota', 'capacité', 'lots', 'limite', 'photos', 'signatures']
  },
  {
    id: 'administration.agence.abonnement.modules',
    kind: 'section',
    title: 'Modules',
    summary: 'Voyez les modules ouverts par votre abonnement : Agence, Syndic, Promoteur ou Patrimoine.',
    purpose:
      'Les modules déterminent les fonctions disponibles : Agence ouvre contacts, ventes, location et patrimoine ; Syndic, la copropriété ; Promoteur, contacts, ventes, patrimoine et chantiers ; Patrimoine, la location et le patrimoine.',
    howToRead: {
      notes: ["Si aucun module n'est ouvert, la carte affiche « Aucun module ouvert »."]
    },
    consequences: ["Une fonction qui n'est pas dans vos modules est indiquée « Non inclus dans votre pack »."],
    faq: [
      {
        q: 'Comment ouvrir un module de plus ?',
        a: "Contactez l'équipe ImmoTopia ou envoyez une demande d'extension."
      },
      {
        q: 'Pourquoi un menu manque-t-il ?',
        a: "Le menu suit vos modules : une fonction non comprise dans l'abonnement est retirée."
      },
      {
        q: 'Un module peut-il être en lecture seule ?',
        a: 'Oui, un module retiré après avoir été détenu reste consultable en lecture seule.'
      }
    ],
    related: [{ label: 'Formule', helpId: 'administration.agence.abonnement.formule' }],
    keywords: ['modules', 'agence', 'syndic', 'promoteur', 'patrimoine', 'fonctions']
  },
  {
    id: 'administration.agence.abonnement.extension',
    kind: 'section',
    title: 'Demander une extension',
    summary:
      "Demandez à l'équipe ImmoTopia plus de capacité ou une option. Choisissez une offre, indiquez la quantité et décrivez votre demande.",
    purpose:
      'Les offres proposées dépendent des packs de votre agence. Sans offre adaptée, choisissez « Autre demande » et décrivez votre besoin.',
    steps: [
      {
        title: 'Choisir une offre',
        detail:
          '« Offre souhaitée » : sous la liste, la description et le prix par mois (hors taxes) ou « Tarif à confirmer ».'
      },
      {
        title: 'Indiquer la quantité',
        detail: "Le champ « Quantité » n'apparaît que pour une offre qui ajoute de la capacité."
      },
      { title: 'Décrire la demande', detail: '« Votre demande » : 3 caractères au moins, 2000 au plus.' },
      {
        title: 'Envoyer',
        detail: "Cliquez sur « Envoyer la demande » : le message « Demande envoyée à l'équipe ImmoTopia » confirme."
      }
    ],
    consequences: [
      "La demande est enregistrée, apparaît dans « Mes demandes » et est envoyée par e-mail aux administrateurs d'ImmoTopia.",
      'Elle ne change pas votre abonnement tout de suite : ImmoTopia la traite ensuite.',
      "Réservé à l'administrateur de l'agence : sans le droit de modifier les paramètres, le formulaire est inactif."
    ],
    faq: [
      {
        q: 'Que veut dire « Tarif à confirmer » ?',
        a: "L'offre n'a pas de prix fixé : ImmoTopia la traite à la main."
      },
      {
        q: "Pourquoi n'y a-t-il aucune offre ?",
        a: "Le message « Aucune extension disponible pour vos packs, décrivez votre besoin » s'affiche : écrivez votre besoin en texte libre."
      },
      {
        q: 'Où suivre ma demande ?',
        a: 'Dans le tableau « Mes demandes », colonne « Statut ».'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      note: "Envoyer une demande demande le droit de modifier les paramètres de l'agence."
    },
    related: [{ label: 'Mes demandes', helpId: 'administration.agence.abonnement.extension.demandes' }],
    keywords: ['extension', 'demande', 'option', 'quantité', 'offre', 'capacité']
  },
  {
    id: 'administration.agence.abonnement.extension.demandes',
    kind: 'table',
    title: 'Mes demandes',
    summary:
      "La liste des demandes d'extension envoyées par votre agence, avec leur statut. Elle apparaît dès la première demande.",
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Date', description: "Date d'envoi de la demande." },
        { key: 'offer', label: 'Offre', description: "L'offre demandée, ou « Autre demande » sans offre." },
        { key: 'quantity', label: 'Quantité', description: "Quantité demandée, ou un tiret s'il n'y en a pas." },
        { key: 'message', label: 'Demande', description: 'Votre message.' },
        { key: 'status', label: 'Statut', description: 'Où en est la demande chez ImmoTopia.' }
      ],
      statuses: [
        { value: 'OPEN', label: 'En attente', description: "ImmoTopia n'a pas encore traité la demande." },
        { value: 'HANDLED', label: 'Traitée', description: 'ImmoTopia a traité la demande.' },
        { value: 'DECLINED', label: 'Refusée', description: "ImmoTopia n'a pas donné suite." }
      ]
    },
    faq: [
      {
        q: 'Pourquoi le tableau est-il absent ?',
        a: "Il n'apparaît que lorsque vous avez envoyé au moins une demande."
      },
      {
        q: 'Puis-je annuler une demande ?',
        a: "L'écran ne propose pas d'annulation : contactez ImmoTopia."
      },
      {
        q: 'Puis-je exporter la liste ?',
        a: 'Oui, avec le bouton « Exporter ».'
      }
    ],
    related: [{ label: 'Demander une extension', helpId: 'administration.agence.abonnement.extension' }],
    keywords: ['demandes', 'extension', 'statut', 'suivi']
  },

  // ------------------------------------------------------------------ Facturation
  {
    id: 'administration.agence.facturation',
    kind: 'page',
    title: 'Facturation',
    summary:
      "Retrouvez vos factures ImmoTopia : consultation, téléchargement en PDF et paiement en ligne. C'est ici que vous réglez la facture qui bloque un compte en lecture seule.",
    purpose:
      'Ces factures sont celles de votre abonnement à ImmoTopia, pas celles de vos locataires. Cette page reste ouverte même si le compte est en lecture seule.',
    steps: [
      {
        title: 'Chercher une facture',
        detail: "Par numéro ou référence de paiement ; filtres Statut, Date d'émission, Nature et Montant TTC."
      },
      { title: 'Télécharger', detail: 'Boutons « PDF » ou « Traduction arabe ».' },
      {
        title: 'Payer',
        detail: '« Payer en ligne » sur une facture à régler : vous êtes envoyé sur la page de paiement.'
      },
      { title: 'Revenir du paiement', detail: 'Au retour, la page suit le paiement et affiche le résultat.' }
    ],
    consequences: [
      "Après un paiement réussi, le message « Paiement reçu : la facture est réglée. » s'affiche et le compte peut sortir de la lecture seule.",
      "Un bandeau « Compte en lecture seule » reste affiché tant que la facture en attente n'est pas réglée, ou si ImmoTopia a décidé la lecture seule.",
      "Le paiement en ligne n'est proposé que s'il est disponible pour votre agence."
    ],
    faq: [
      {
        q: 'Je ne vois pas le bouton « Payer en ligne ».',
        a: "Il apparaît seulement pour une facture « Émise », « En retard » ou « Échouée » d'un montant supérieur à 0, si le paiement en ligne est disponible. Sans le droit de modifier les paramètres, le texte « Paiement réservé à l'administrateur de l'agence » le remplace."
      },
      {
        q: 'Mon paiement est « en cours de confirmation ».',
        a: 'La page interroge le paiement toutes les 3 secondes pendant une minute. Au-delà, « Paiement en cours de confirmation. » reste affiché : rechargez la page plus tard.'
      },
      {
        q: 'Que faire si le paiement échoue ?',
        a: 'La facture passe à « Échouée » et reste payable : recommencez avec « Payer en ligne ».'
      },
      {
        q: 'Pourquoi « Accès réservé » ?',
        a: "La page est réservée aux personnes autorisées à consulter les paramètres de l'agence."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      note: "Voir demande le droit de voir les paramètres de l'agence ; payer demande celui de les modifier."
    },
    related: [
      { label: 'Tableau des factures', helpId: 'administration.agence.facturation.factures' },
      { label: 'Abonnement', helpId: 'administration.agence.abonnement' }
    ],
    keywords: ['facture', 'facturation', 'paiement', 'abonnement', 'PDF', 'ImmoTopia', 'lecture seule']
  },
  {
    id: 'administration.agence.facturation.factures',
    kind: 'table',
    title: 'Factures',
    summary:
      "La liste de vos factures d'abonnement, la plus récente d'abord selon le tri. Téléchargez-les en PDF ou payez-les en ligne.",
    howToRead: {
      columns: [
        { key: 'number', label: 'Numéro', description: 'Numéro de la facture.' },
        { key: 'nature', label: 'Nature', description: 'Période (abonnement), Dépassement ou Avoir.' },
        { key: 'period', label: 'Période', description: 'Dates de début et de fin couvertes par la facture.' },
        { key: 'due', label: 'Échéance', description: 'Date limite de paiement.' },
        { key: 'amount', label: 'Montant TTC', description: 'Montant toutes taxes comprises.' },
        { key: 'status', label: 'Statut', description: 'Où en est la facture.' },
        {
          key: 'actions',
          label: 'Actions',
          description: '« PDF », « Traduction arabe » et « Payer en ligne » quand le paiement est possible.'
        }
      ],
      statuses: [
        { value: 'ISSUED', label: 'Émise', description: 'La facture est à régler.' },
        {
          value: 'OVERDUE',
          label: 'En retard',
          description: "L'échéance est dépassée ; la facture est encore payable."
        },
        { value: 'PAID', label: 'Payée', description: 'La facture est réglée.' },
        { value: 'FAILED', label: 'Échouée', description: "Un paiement n'a pas abouti ; la facture reste payable." },
        { value: 'CANCELED', label: 'Annulée', description: 'La facture est annulée.' },
        { value: 'REFUNDED', label: 'Remboursée', description: 'La facture a été remboursée.' }
      ],
      notes: [
        "Les brouillons ne sont jamais visibles par l'agence.",
        "Nature : « Période » est la facture de l'abonnement, « Dépassement » concerne un dépassement de capacité, « Avoir » est un document qui vient en déduction."
      ]
    },
    steps: [
      { title: 'Filtrer', detail: "Recherche, « Statut », « Date d'émission », « Nature », « Montant TTC »." },
      { title: 'Télécharger', detail: '« PDF » pour la facture, « Traduction arabe » pour sa présentation en arabe.' },
      { title: 'Payer en ligne', detail: "Cliquez sur « Payer en ligne » : la page de paiement s'ouvre." },
      {
        title: 'Reprendre un paiement',
        detail: 'Si un paiement est déjà en cours, « Reprendre le paiement » vous y ramène.'
      },
      { title: 'Exporter', detail: 'Bouton « Exporter » : toutes les factures correspondant aux filtres.' }
    ],
    consequences: [
      '« Payer en ligne » vous envoie sur la page de paiement. Au retour, la page suit le paiement et met la facture à jour.',
      "Un paiement réussi peut rétablir l'accès complet d'un compte en lecture seule.",
      "En mode démonstration, aucun paiement réel n'est fait : un texte le signale."
    ],
    faq: [
      {
        q: 'Que contient la « Traduction arabe » ?',
        a: 'Une présentation de la même facture en arabe, en PDF.'
      },
      {
        q: "Pourquoi « Payer en ligne » est-il absent d'une facture ?",
        a: "La facture est déjà payée ou annulée, son montant est nul, le paiement en ligne n'est pas disponible, ou vous n'avez pas le droit de modifier les paramètres."
      },
      {
        q: 'Que veut dire « Un paiement est déjà en cours pour cette facture » ?',
        a: 'Un paiement a été commencé et pas terminé : cliquez sur « Reprendre le paiement » pour le terminer.'
      },
      {
        q: 'La liste est vide.',
        a: "Le message « Aucune facture » s'affiche tant qu'aucune facture n'a été émise pour votre agence."
      }
    ],
    related: [{ label: 'Facturation', helpId: 'administration.agence.facturation' }],
    keywords: ['factures', 'PDF', 'payer', 'paiement en ligne', 'avoir', 'dépassement', 'échéance']
  },

  // ------------------------------------------------------------------ Journal d'activité
  {
    id: 'administration.agence.activite',
    kind: 'page',
    title: "Journal d'activité",
    summary:
      "Voyez qui a fait quoi, et quand, dans votre agence. Chaque ligne s'ouvre pour montrer le détail d'une action.",
    purpose:
      "Le journal sert à vérifier une modification, retrouver l'auteur d'une action, ou comprendre un refus. Il est en lecture seule : vous ne pouvez rien y modifier.",
    steps: [
      { title: 'Filtrer', detail: 'Recherche libre, « Catégorie », « Période », « Résultat » et « Action ».' },
      { title: 'Lire une ligne', detail: 'Date, acteur, action, ressource, résultat et catégorie.' },
      { title: 'Ouvrir le détail', detail: 'Cliquez sur une ligne ou sur « Voir ».' },
      { title: 'Charger la suite', detail: 'Bouton « Charger plus » en bas de la liste.' },
      { title: 'Exporter', detail: 'Bouton « Exporter », avec vos filtres.' }
    ],
    consequences: [
      "Ouvrir le journal est lui-même enregistré dans le journal de la plateforme (pas visible dans celui de l'agence).",
      'Les actions du support ImmoTopia apparaissent sous « Support ImmoTopia », sans nom ni adresse.',
      "L'export est limité à 10 000 lignes."
    ],
    faq: [
      {
        q: 'Qui peut voir ce journal ?',
        a: "Les personnes qui ont le droit de voir le journal d'activité, par défaut l'administrateur de l'agence."
      },
      {
        q: 'Une action que je cherche est absente.',
        a: "Le journal montre les événements visibles par l'agence. Les événements réservés à la plateforme n'y figurent pas."
      },
      {
        q: 'Que veut dire « Refusée » ?',
        a: "L'action a été refusée, par exemple faute de droits."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      note: "Demande le droit « Voir le journal d'activité »."
    },
    related: [
      { label: 'Tableau du journal', helpId: 'administration.agence.activite.journal' },
      { label: "Détail d'une activité", helpId: 'administration.agence.activite.detail' }
    ],
    keywords: ['journal', 'audit', 'historique', 'traçabilité', 'activité', 'qui a fait quoi']
  },
  {
    id: 'administration.agence.activite.journal',
    kind: 'table',
    title: "Journal d'activité",
    summary:
      "Une ligne par événement : date, acteur, action, ressource, résultat et catégorie. Le plus récent d'abord.",
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Date', description: "Date et heure de l'événement." },
        {
          key: 'actor',
          label: 'Acteur',
          description:
            'Qui a agi : nom ou e-mail de la personne, « Support ImmoTopia », « Système », « Assistant IA » ou « Portail ».'
        },
        { key: 'action', label: 'Action', description: 'Ce qui a été fait, en toutes lettres.' },
        {
          key: 'resource',
          label: 'Ressource',
          description: "L'objet concerné (bien, bail, contact, etc.). Survolez une valeur abrégée pour voir le détail."
        },
        { key: 'outcome', label: 'Résultat', description: 'Réussie, Échouée ou Refusée.' },
        {
          key: 'category',
          label: 'Catégorie',
          description:
            'Authentification, Données, Administration, Sécurité, Facturation, Export, Assistant IA ou Système.'
        }
      ],
      statuses: [
        { value: 'SUCCESS', label: 'Réussie', description: "L'action est allée à son terme." },
        { value: 'FAILURE', label: 'Échouée', description: "L'action a rencontré une erreur." },
        { value: 'DENIED', label: 'Refusée', description: "L'action a été refusée, par exemple faute de droits." }
      ],
      notes: [
        'Recherche libre : action (code), ressource, identifiant ou acteur.',
        'La liste se charge par pages : « Charger plus » ajoute les lignes suivantes.'
      ]
    },
    steps: [
      { title: 'Filtrer', detail: 'Par catégorie, période, résultat ou action.' },
      { title: 'Ouvrir une ligne', detail: 'Cliquez dessus ou sur « Voir ».' },
      { title: 'Charger plus', detail: 'Pour remonter dans le temps.' },
      { title: 'Exporter', detail: "Bouton « Exporter » : jusqu'à 10 000 lignes, avec vos filtres." }
    ],
    faq: [
      {
        q: 'Pourquoi un acteur est-il « Support ImmoTopia » ?',
        a: "C'est l'équipe d'ImmoTopia qui est intervenue. Son nom et son adresse ne sont jamais montrés."
      },
      {
        q: 'Pourquoi « Aucune activité enregistrée » ?',
        a: 'Aucun événement ne correspond encore à votre agence, ou tous sont filtrés.'
      },
      {
        q: 'Peut-on modifier ou supprimer une ligne ?',
        a: 'Non : le journal est en lecture seule.'
      }
    ],
    related: [{ label: "Détail d'une activité", helpId: 'administration.agence.activite.detail' }],
    keywords: ['journal', 'audit', 'acteur', 'ressource', 'résultat', 'catégorie', 'historique']
  },
  {
    id: 'administration.agence.activite.detail',
    kind: 'section',
    title: "Détail de l'activité",
    summary:
      "La fenêtre qui s'ouvre sur une ligne du journal : tout ce qu'on sait de l'événement, y compris ce qui a changé.",
    purpose: "Elle vous aide à comprendre exactement ce qui s'est passé, et par qui.",
    howToRead: {
      notes: [
        'Date, acteur, action, ressource, résultat et catégorie, comme dans le tableau.',
        "« Adresse IP » et « Navigateur » ne s'affichent pas pour une action du support ImmoTopia.",
        '« Identifiant de requête » aide le support si vous le contactez.',
        '« Modifications » : pour chaque champ, la valeur avant → la valeur après.',
        '« Détails » : informations complémentaires, affichées telles quelles.'
      ]
    },
    steps: [
      { title: 'Ouvrir', detail: 'Cliquez sur une ligne du journal ou sur « Voir ».' },
      { title: 'Lire', detail: "Parcourez les champs, puis « Modifications » et « Détails » s'ils existent." },
      { title: 'Fermer', detail: 'Bouton « Fermer ».' }
    ],
    consequences: ['La fenêtre ne modifie rien.'],
    faq: [
      {
        q: 'Pourquoi pas de « Modifications » ?',
        a: 'Seuls les événements qui changent des champs affichent ce bloc.'
      },
      {
        q: "À quoi sert l'identifiant de requête ?",
        a: "Le support d'ImmoTopia peut s'en servir pour retrouver la même action de son côté."
      },
      {
        q: "Pourquoi n'y a-t-il pas d'adresse IP ?",
        a: "Pour une action du support ImmoTopia, l'adresse et le navigateur ne sont pas communiqués."
      }
    ],
    related: [{ label: "Journal d'activité", helpId: 'administration.agence.activite' }],
    keywords: ['détail', 'modifications', 'avant après', 'adresse IP', 'navigateur']
  }
];

export default entries;
