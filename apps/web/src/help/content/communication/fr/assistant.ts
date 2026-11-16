import type { HelpEntry } from '../../../types';

/** Zone « assistant » du module « communication » (fr) : la page de conversation avec l'assistant. */
const entries: HelpEntry[] = [
  {
    id: 'communication.assistant.page',
    kind: 'page',
    title: 'Assistant',
    summary:
      "L'assistant est une conversation dans laquelle vous posez vos questions en langage courant sur les données de votre agence. Il cherche et présente des résultats, et peut préparer certaines actions que vous validez avant qu'elles soient faites.",
    purpose:
      "Il vous évite de parcourir les menus : retrouver un bien ou un bail, lister des documents, préparer une quittance de loyer ou un relevé de compte. Ce qu'il sait faire dépend de ce qui est activé pour votre agence : la phrase d'accueil annonce les sujets couverts.\n\nIl agit avec vos propres droits : une donnée que vous ne pouvez pas consulter lui reste fermée.",
    howToRead: {
      notes: [
        "Les réponses sont rédigées par une intelligence artificielle : vérifiez les chiffres importants dans l'écran concerné.",
        "Une réponse peut s'accompagner de cartes (biens, baux, documents) et d'un bouton « Résultats » qui ouvre le panneau « Résultats et documents »."
      ]
    },
    steps: [
      {
        title: 'Posez votre question',
        detail:
          'Écrivez dans « Écrivez votre message… », puis appuyez sur Entrée (Maj+Entrée pour passer à la ligne) ou cliquez sur « Envoyer ». Au début, vous pouvez aussi cliquer sur une suggestion.'
      },
      { title: 'Arrêtez au besoin', detail: "Pendant que la réponse s'écrit, « Arrêter la réponse » la coupe." },
      { title: 'Recommencez à zéro', detail: '« Nouvelle conversation » efface la conversation affichée.' }
    ],
    consequences: [
      'Poser une question ne modifie rien.',
      "Quand l'assistant propose de créer ou de modifier quelque chose, une carte vous montre les changements. Rien n'est enregistré avant que vous cliquiez sur « Approuver et exécuter ». L'assistant ne supprime rien.",
      "Quitter la page arrête la réponse en cours, et la conversation n'est pas rouverte à votre retour."
    ],
    faq: [
      {
        q: "Pourquoi lire « L'assistant n'est pas activé pour cette agence » ?",
        a: "L'assistant n'a pas été activé pour votre agence. Demandez à un administrateur de l'activer."
      },
      {
        q: "Pourquoi lire « L'assistant n'est pas disponible pour ce compte » ?",
        a: "Il est réservé aux collaborateurs d'une agence."
      },
      {
        q: "L'assistant peut-il modifier mes données sans me demander ?",
        a: "Non. Une modification passe par une carte d'accord : sans votre clic sur « Approuver et exécuter », rien n'est fait."
      },
      {
        q: 'Puis-je retrouver ma conversation plus tard ?',
        a: 'Non. Elle disparaît quand vous quittez la page : copiez ce dont vous avez besoin, ou téléchargez les résultats.'
      }
    ],
    permissions: {
      roles: ["Collaborateur d'une agence"],
      note: "L'assistant doit être activé pour l'agence. Il utilise vos propres droits."
    },
    related: [
      { label: "Écrire à l'assistant et valider une action", helpId: 'communication.assistant.conversation' },
      { label: 'Le panneau « Résultats et documents »', helpId: 'communication.assistant.resultats' }
    ],
    keywords: [
      'assistant',
      'IA',
      'intelligence artificielle',
      'chat',
      'discussion',
      'copilote',
      'question',
      'quittance',
      'relevé de compte'
    ]
  },
  {
    id: 'communication.assistant.conversation',
    kind: 'section',
    title: "Écrire à l'assistant et valider une action",
    summary:
      "Écrivez comme vous parleriez à un collègue. Quand l'assistant propose une action, vous la vérifiez sur une carte avant de l'approuver.",
    purpose:
      'Exemples de demandes : « Montre-moi les biens disponibles », « Cherche un bail par numéro », « Génère une quittance de loyer ». Plus la demande est précise (numéro de bail, nom du bien), plus la réponse est juste.',
    steps: [
      { title: 'Formulez la demande', detail: 'Vous pouvez enchaîner les questions dans la même conversation.' },
      {
        title: "Lisez la carte d'accord",
        detail:
          "Elle indique le module, l'enregistrement visé, les « Données concernées » (avant et après), les « Avertissements » et le temps restant avant expiration. Ces éléments sont calculés par le système, pas par l'assistant."
      },
      {
        title: 'Approuvez ou refusez',
        detail:
          "« Approuver et exécuter » fait l'action. « Refuser » ne change rien. Pour une « Action sensible », saisissez d'abord le mot demandé (CONFIRMER)."
      },
      {
        title: 'Une quittance ou un relevé de compte',
        detail:
          "L'assistant propose une carte avec le bail, le bien, la période et le montant : « Confirmer et générer » crée le document, que vous pouvez ensuite télécharger."
      }
    ],
    consequences: [
      "Après « Approuver et exécuter », la carte indique « Exécuté » avec le résultat, ou l'erreur rencontrée.",
      "Une carte non validée expire : redemandez-la à l'assistant. Les données ont pu changer entre-temps.",
      "« Refuser » n'avertit pas l'assistant : dites-le lui dans un message si vous voulez qu'il en tienne compte.",
      "Si le document demandé existe déjà, la carte l'indique (« Ce document existait déjà »)."
    ],
    faq: [
      {
        q: "L'assistant dit avoir fait quelque chose : est-ce vrai ?",
        a: "Seule la carte « Exécuté » fait foi. Si elle n'apparaît pas, rien n'a été enregistré."
      },
      {
        q: 'Pourquoi dois-je saisir un mot pour approuver ?',
        a: 'Certaines actions sont sensibles, car difficiles à annuler : la carte vous demande alors de saisir CONFIRMER.'
      },
      {
        q: "Pourquoi l'assistant refuse-t-il de supprimer ?",
        a: "Il ne peut supprimer aucune donnée. Il peut proposer une alternative comme archiver, si elle existe dans l'application."
      }
    ],
    related: [{ label: "Vue d'ensemble de l'assistant", helpId: 'communication.assistant.page' }],
    keywords: ['approuver', 'valider', 'confirmer', 'carte', 'action sensible', 'quittance', 'document', 'plan']
  },
  {
    id: 'communication.assistant.resultats',
    kind: 'section',
    title: 'Résultats et documents',
    summary:
      "Quand l'assistant produit un tableau, un graphique ou un texte, il s'ouvre dans ce panneau, à côté de la conversation.",
    purpose:
      "Sur ordinateur, le panneau apparaît à droite dès le premier résultat. Sur téléphone, il s'ouvre en plein écran avec le bouton « Résultats » ou avec la pastille « Ouvrir » du message.",
    howToRead: {
      notes: [
        "S'il y a plusieurs résultats, la liste « Résultat affiché » permet de passer de l'un à l'autre ; le dernier reçu est affiché par défaut.",
        "Un tableau trop long est coupé : le message « Résultat tronqué : seules les premières lignes sont affichées » l'indique."
      ]
    },
    steps: [
      { title: 'Ouvrez le panneau', detail: "Cliquez sur « Résultats » dans l'en-tête si le panneau est fermé." },
      {
        title: 'Téléchargez',
        detail:
          'Bouton « Télécharger » : un tableau en CSV ou Excel, un graphique en image ou en données CSV, un texte en fichier.'
      },
      { title: 'Fermez', detail: '« Fermer le panneau » le referme ; le bouton « Résultats » le rouvre.' }
    ],
    consequences: [
      'Le panneau ne modifie rien : il présente des données et les télécharge sur votre appareil.',
      'Les résultats disparaissent avec la conversation (« Nouvelle conversation » ou départ de la page) : téléchargez ce que vous voulez garder.'
    ],
    related: [{ label: "Vue d'ensemble de l'assistant", helpId: 'communication.assistant.page' }],
    keywords: ['résultats', 'tableau', 'graphique', 'télécharger', 'excel', 'csv', 'export']
  }
];

export default entries;
