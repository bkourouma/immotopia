import type { Block } from './docx-standard-blocks';

/**
 * Contenu des modèles DOCX standard. Les textes et TOUTES les balises des
 * quatre modèles locatifs d'origine (`assets/modeles_documents/`) sont repris
 * tels quels ; l'en-tête, le pied et le tableau de références s'y ajoutent.
 * Les balises sont documentées dans `docs/modeles-documents/CATALOGUE-PLACEHOLDERS.md`.
 */

const h2 = (text: string): Block => ({ t: 'h2', text });
const p = (text: string): Block => ({ t: 'p', text });
const lines = (...items: string[]): Block => ({ t: 'lines', lines: items });
const bullets = (...items: string[]): Block => ({ t: 'bullets', items });
const article = (title: string): Block => h2(title);
const spacer: Block = { t: 'spacer' };

const refs = (...rows: Array<[string, string]>): Block => ({ t: 'refs', rows });

const SIGNATURE_PLACE: Block = p('Fait à {{LIEU_SIGNATURE}}, le {{DATE_SIGNATURE}}');

// --------------------------------------------------------------------- baux

function habitationBlocks(): Block[] {
  return [
    { t: 'title', text: 'CONTRAT DE BAIL À USAGE D’HABITATION', subtitle: 'Référence : {{REFERENCE_DOCUMENT}}' },
    refs(
      ['Bailleur', '{{BAILLEUR_NOM}}'],
      ['Preneur', '{{LOCATAIRE_NOM}}'],
      ['Bien loué', '{{ADRESSE_BIEN}}'],
      ['Loyer mensuel', '{{LOYER_MENSUEL}} {{DEVISE}}'],
      ['Date d’émission', '{{DATE_EMISSION_DOCUMENT}}'],
      ['Durée', '{{DUREE_BAIL}}']
    ),
    h2('ENTRE LES SOUSSIGNÉS'),
    p('**Le Bailleur**'),
    lines(
      'Nom / Raison sociale : {{BAILLEUR_NOM}}',
      'Adresse : {{BAILLEUR_ADRESSE}}',
      'Téléphone : {{BAILLEUR_TELEPHONE}}',
      'Email : {{BAILLEUR_EMAIL}}'
    ),
    p('Ci-après dénommé « le Bailleur »,'),
    p('ET'),
    p('**Le Preneur (Locataire)**'),
    lines(
      'Nom & Prénom : {{LOCATAIRE_NOM}}',
      'Adresse : {{LOCATAIRE_ADRESSE}}',
      'Téléphone : {{LOCATAIRE_TELEPHONE}}',
      'Email : {{LOCATAIRE_EMAIL}}',
      'Numéro de pièce d’identité : {{LOCATAIRE_PIECE_ID}}'
    ),
    p('Ci-après dénommé « le Preneur »,'),
    p('Il a été convenu et arrêté ce qui suit :'),
    ...habitationArticles(),
    SIGNATURE_PLACE,
    p('En deux (02) exemplaires originaux.'),
    {
      t: 'sign',
      left: ['LE BAILLEUR', 'Nom : __________________________', 'Signature : _____________________'],
      right: ['LE PRENEUR', 'Nom : __________________________', 'Signature : _____________________']
    },
    h2('ANNEXES'),
    bullets(
      'Copie de la pièce d’identité du Preneur',
      'État des lieux d’entrée',
      'Règlement intérieur (le cas échéant)'
    )
  ];
}

function habitationArticles(): Block[] {
  return [
    article('ARTICLE 1 – OBJET DU CONTRAT'),
    p(
      'Le présent contrat a pour objet la location d’un bien immobilier à usage exclusif d’habitation, appartenant au Bailleur, tel que décrit ci-après.'
    ),
    article('ARTICLE 2 – DÉSIGNATION DU BIEN LOUÉ'),
    lines(
      'Type de bien : {{TYPE_BIEN}}',
      'Adresse complète : {{ADRESSE_BIEN}}',
      'Description : {{DESCRIPTION_BIEN}}',
      'Superficie : {{SUPERFICIE}} m²',
      'Équipements et annexes : {{EQUIPEMENTS}}'
    ),
    article('ARTICLE 3 – DURÉE DU BAIL'),
    p(
      'Le présent bail est consenti pour une durée de {{DUREE_BAIL}}, prenant effet le {{DATE_DEBUT_BAIL}} pour se terminer le {{DATE_FIN_BAIL}}.'
    ),
    p('À l’expiration de cette période, le bail pourra être renouvelé par accord écrit entre les parties.'),
    article('ARTICLE 4 – LOYER ET CONDITIONS FINANCIÈRES'),
    p(
      'Le loyer mensuel est fixé à la somme de {{LOYER_MENSUEL}} {{DEVISE}}, payable d’avance au plus tard le {{JOUR_ECHEANCE}} de chaque mois.'
    ),
    p('Les charges locatives mensuelles sont fixées à {{CHARGES_MENSUELLES}} {{DEVISE}}.'),
    p('Le loyer et les charges sont payables par :'),
    bullets('Espèces', 'Virement bancaire', 'Paiement électronique / Mobile Money'),
    article('ARTICLE 5 – DÉPÔT DE GARANTIE'),
    p(
      'À la signature du présent contrat, le Preneur verse au Bailleur un dépôt de garantie d’un montant de {{DEPOT_GARANTIE}} {{DEVISE}}.'
    ),
    p(
      'Ce dépôt de garantie sera restitué au Preneur à la fin du bail, après déduction éventuelle des sommes restant dues ou des réparations locatives justifiées.'
    ),
    article('ARTICLE 6 – OBLIGATIONS DU PRENEUR'),
    p('Le Preneur s’engage à :'),
    bullets(
      'Payer régulièrement le loyer et les charges aux échéances convenues ;',
      'User paisiblement du bien loué ;',
      'Maintenir le logement en bon état d’entretien courant ;',
      'Ne pas modifier les lieux sans l’accord écrit du Bailleur ;',
      'Informer immédiatement le Bailleur de tout sinistre ou dégradation.'
    ),
    article('ARTICLE 7 – OBLIGATIONS DU BAILLEUR'),
    p('Le Bailleur s’engage à :'),
    bullets(
      'Mettre le bien loué à disposition du Preneur en bon état d’usage ;',
      'Garantir la jouissance paisible du logement ;',
      'Effectuer les grosses réparations nécessaires.'
    ),
    ...habitationClosingArticles()
  ];
}

function habitationClosingArticles(): Block[] {
  return [
    article('ARTICLE 8 – PÉNALITÉS DE RETARD'),
    p(
      'Tout retard de paiement au-delà de {{DELAI_GRACE}} jours après l’échéance entraînera {{CLAUSE_PENALITE}}, sans préjudice de toute action légale.'
    ),
    article('ARTICLE 9 – RÉSILIATION'),
    p('Le présent bail peut être résilié :'),
    bullets(
      'Par le Preneur, avec un préavis de {{PREAVIS_PRENEUR}} ;',
      'Par le Bailleur, en cas de manquement grave du Preneur à ses obligations.'
    ),
    p('Toute résiliation devra être notifiée par écrit.'),
    article('ARTICLE 10 – ÉTAT DES LIEUX'),
    p('Un état des lieux contradictoire sera établi lors de l’entrée et de la sortie du Preneur.'),
    article('ARTICLE 11 – CLAUSES PARTICULIÈRES'),
    p('{{CLAUSES_PARTICULIERES}}'),
    article('ARTICLE 12 – DROIT APPLICABLE ET JURIDICTION COMPÉTENTE'),
    p('Le présent contrat est régi par les lois et règlements en vigueur en République de Côte d’Ivoire.'),
    p(
      'Tout litige relatif à l’exécution ou à l’interprétation du présent contrat sera soumis aux juridictions compétentes.'
    ),
    spacer
  ];
}

function commercialBlocks(): Block[] {
  return [
    { t: 'title', text: 'CONTRAT DE BAIL À USAGE COMMERCIAL', subtitle: 'Référence : {{REFERENCE_DOCUMENT}}' },
    refs(
      ['Bailleur', '{{BAILLEUR_NOM}}'],
      ['Preneur', '{{LOCATAIRE_NOM}}'],
      ['Local loué', '{{ADRESSE_BIEN}}'],
      ['Loyer', '{{LOYER_MENSUEL}} {{DEVISE}}'],
      ['Date d’émission', '{{DATE_EMISSION_DOCUMENT}}'],
      ['Activité', '{{ACTIVITE_COMMERCIALE}}']
    ),
    h2('ENTRE LES SOUSSIGNÉS'),
    p('**Le Bailleur**'),
    lines(
      'Nom / Raison sociale : {{BAILLEUR_NOM}}',
      'Forme juridique : {{BAILLEUR_FORME_JURIDIQUE}}',
      'Adresse : {{BAILLEUR_ADRESSE}}',
      'Téléphone : {{BAILLEUR_TELEPHONE}}',
      'Email : {{BAILLEUR_EMAIL}}',
      'Représenté par : {{BAILLEUR_REPRESENTANT}}'
    ),
    p('Ci-après dénommé « le Bailleur »,'),
    p('ET'),
    p('**Le Preneur (Locataire commercial)**'),
    lines(
      'Dénomination / Nom : {{LOCATAIRE_NOM}}',
      'Forme juridique : {{LOCATAIRE_FORME_JURIDIQUE}}',
      'Adresse : {{LOCATAIRE_ADRESSE}}',
      'Téléphone : {{LOCATAIRE_TELEPHONE}}',
      'Email : {{LOCATAIRE_EMAIL}}',
      'RCCM / Registre : {{LOCATAIRE_RCCM}}',
      'Représenté par : {{LOCATAIRE_REPRESENTANT}}'
    ),
    p('Ci-après dénommé « le Preneur »,'),
    p('Il a été convenu et arrêté ce qui suit :'),
    ...commercialArticles(),
    SIGNATURE_PLACE,
    p('En deux (02) exemplaires originaux.'),
    {
      t: 'sign',
      left: ['LE BAILLEUR', 'Nom / Cachet : __________________________', 'Signature : ______________________________'],
      right: ['LE PRENEUR', 'Nom / Cachet : __________________________', 'Signature : ______________________________']
    },
    h2('ANNEXES'),
    bullets(
      'Extrait RCCM du Preneur',
      'État des lieux d’entrée',
      'Attestation d’assurance',
      'Règlement intérieur (le cas échéant)'
    )
  ];
}

function commercialArticles(): Block[] {
  return [
    article('ARTICLE 1 – OBJET DU CONTRAT'),
    p(
      'Le présent contrat a pour objet la location d’un bien immobilier à usage strictement commercial, destiné à l’exercice de l’activité suivante : {{ACTIVITE_COMMERCIALE}}.'
    ),
    p('Toute modification d’activité devra faire l’objet d’un accord écrit préalable du Bailleur.'),
    article('ARTICLE 2 – DÉSIGNATION DU BIEN LOUÉ'),
    lines(
      'Type de bien : {{TYPE_BIEN}}',
      'Adresse complète : {{ADRESSE_BIEN}}',
      'Superficie : {{SUPERFICIE}} m²',
      'Description et consistance : {{DESCRIPTION_BIEN}}',
      'Équipements et dépendances : {{EQUIPEMENTS}}'
    ),
    article('ARTICLE 3 – DURÉE DU BAIL'),
    p(
      'Le présent bail est consenti pour une durée de {{DUREE_BAIL}}, prenant effet le {{DATE_DEBUT_BAIL}} et expirant le {{DATE_FIN_BAIL}}.'
    ),
    p(
      'Il pourra être renouvelé par accord exprès et écrit entre les parties, conformément à la réglementation en vigueur.'
    ),
    article('ARTICLE 4 – LOYER, CHARGES ET MODALITÉS DE PAIEMENT'),
    p(
      'Le loyer est fixé à la somme de {{LOYER_MENSUEL}} {{DEVISE}}, payable d’avance au plus tard le {{JOUR_ECHEANCE}} de chaque période.'
    ),
    p(
      'Les charges locatives sont fixées à {{CHARGES_MENSUELLES}} {{DEVISE}} et comprennent notamment : {{DETAIL_CHARGES}}.'
    ),
    p('Le paiement s’effectue par :'),
    bullets('Virement bancaire', 'Espèces', 'Paiement électronique / Mobile Money'),
    article('ARTICLE 5 – DÉPÔT DE GARANTIE'),
    p(
      'À la signature du présent bail, le Preneur verse au Bailleur un dépôt de garantie d’un montant de {{DEPOT_GARANTIE}} {{DEVISE}}, destiné à garantir l’exécution de l’ensemble de ses obligations.'
    ),
    p('Le dépôt de garantie sera restitué à la fin du bail, après déduction des sommes éventuellement dues.'),
    article('ARTICLE 6 – DROIT D’ENTRÉE / PAS-DE-PORTE (LE CAS ÉCHÉANT)'),
    p(
      'Un droit d’entrée (pas-de-porte) d’un montant de {{PAS_DE_PORTE}} {{DEVISE}} est convenu entre les parties et payable à la signature du présent contrat.'
    ),
    ...commercialObligations(),
    ...commercialClosingArticles()
  ];
}

function commercialObligations(): Block[] {
  return [
    article('ARTICLE 7 – OBLIGATIONS DU PRENEUR'),
    p('Le Preneur s’engage à :'),
    bullets(
      'Exercer l’activité déclarée conformément aux lois et règlements ;',
      'Payer le loyer, les charges et taxes aux échéances convenues ;',
      'Maintenir les locaux en bon état d’entretien et de sécurité ;',
      'Souscrire toutes assurances obligatoires liées à son activité ;',
      'Ne pas sous-louer ni céder le bail sans autorisation écrite du Bailleur ;',
      'Respecter le règlement intérieur de l’immeuble.'
    ),
    article('ARTICLE 8 – OBLIGATIONS DU BAILLEUR'),
    p('Le Bailleur s’engage à :'),
    bullets(
      'Mettre les locaux à disposition du Preneur en état d’exploitation ;',
      'Garantir la jouissance paisible des lieux ;',
      'Effectuer les grosses réparations non imputables au Preneur.'
    ),
    article('ARTICLE 9 – TRAVAUX ET AMÉNAGEMENTS'),
    p(
      'Les travaux d’aménagement réalisés par le Preneur devront faire l’objet d’une autorisation préalable écrite du Bailleur.'
    ),
    p('Sauf stipulation contraire, les aménagements resteront acquis au Bailleur en fin de bail, sans indemnité.')
  ];
}

function commercialClosingArticles(): Block[] {
  return [
    article('ARTICLE 10 – PÉNALITÉS DE RETARD'),
    p('Tout retard de paiement entraînera {{CLAUSE_PENALITE}}, après un délai de grâce de {{DELAI_GRACE}} jours.'),
    article('ARTICLE 11 – RÉSILIATION ANTICIPÉE'),
    p('Le présent bail pourra être résilié :'),
    bullets(
      'Par le Preneur, avec un préavis de {{PREAVIS_PRENEUR}} ;',
      'Par le Bailleur, en cas de manquement grave ou répété du Preneur.'
    ),
    p('La résiliation devra être notifiée par écrit.'),
    article('ARTICLE 12 – ASSURANCES ET RESPONSABILITÉS'),
    p(
      'Le Preneur est tenu de souscrire une assurance couvrant les risques liés à son activité et aux locaux loués, et d’en justifier au Bailleur.'
    ),
    article('ARTICLE 13 – DROIT APPLICABLE ET JURIDICTION COMPÉTENTE'),
    p('Le présent contrat est régi par les lois et règlements en vigueur en République de Côte d’Ivoire.'),
    p(
      'Tout litige relatif à l’exécution ou à l’interprétation du présent bail sera soumis aux juridictions compétentes.'
    ),
    spacer
  ];
}

// ---------------------------------------------------------- reçu et relevé

function receiptBlocks(): Block[] {
  return [
    { t: 'title', text: 'REÇU DE LOYER', subtitle: 'N° Reçu : {{RECU_NUMERO}}  ·  Date : {{DATE_EMISSION}}' },
    refs(
      ['N° Reçu', '{{RECU_NUMERO}}'],
      ['Date', '{{DATE_EMISSION}}'],
      ['Période', '{{PERIODE_LOYER}}'],
      ['Bail', '{{BAIL_REFERENCE}}']
    ),
    {
      t: 'cols',
      left: [h2('LOCATAIRE'), p('**{{LOCATAIRE_NOM}}**'), p('Tél : {{LOCATAIRE_TELEPHONE}}')],
      right: [
        h2('BAILLEUR'),
        p('**{{BAILLEUR_NOM}}**'),
        lines('Tél : {{BAILLEUR_TELEPHONE}}', 'Email : {{BAILLEUR_EMAIL}}')
      ]
    },
    h2('PAIEMENT DU LOYER'),
    p('**Période** : {{PERIODE_LOYER}}'),
    {
      t: 'grid',
      head: ['Désignation', 'Montant {{DEVISE}}'],
      rows: [
        ['Loyer', '{{MONTANT_LOYER}}'],
        ['Charges', '{{MONTANT_CHARGES}}'],
        ['Pénalités', '{{MONTANT_PENALITES}}'],
        ['TOTAL PAYÉ', '{{MONTANT_TOTAL}}']
      ],
      widths: [6638, 3000],
      right: [1],
      boldLast: true
    },
    {
      t: 'cols',
      left: [h2('BIEN LOUÉ'), lines('{{TYPE_BIEN}} — {{ADRESSE_BIEN}}', 'Bail : {{BAIL_REFERENCE}}')],
      right: [
        h2('MODE DE PAIEMENT'),
        lines('{{MODE_PAIEMENT}}', 'Réf : {{REFERENCE_PAIEMENT}}', 'Payé le : {{DATE_PAIEMENT}}')
      ]
    },
    p(
      '**ATTESTATION** : Je reconnais avoir reçu la somme de **{{MONTANT_TOTAL}} {{DEVISE}}** de {{LOCATAIRE_NOM}}, au titre du loyer de la période indiquée.'
    ),
    p('Fait à {{LIEU_EMISSION}}, le {{DATE_EMISSION}}'),
    { t: 'sign', left: ['Le Bailleur', 'Signature / Cachet'], right: [''] }
  ];
}

function statementBlocks(): Block[] {
  const operation = (n: number): string[] => [
    `{{OP_DATE_${n}}}`,
    `{{OP_LIBELLE_${n}}}`,
    `{{OP_DEBIT_${n}}}`,
    `{{OP_CREDIT_${n}}}`,
    `{{OP_SOLDE_${n}}}`
  ];
  return [
    { t: 'title', text: 'RELEVÉ DE COMPTE LOCATIF', subtitle: 'Période : {{PERIODE_DEBUT}} au {{PERIODE_FIN}}' },
    refs(
      ['Référence', '{{RELEVE_REFERENCE}}'],
      ['Date d’édition', '{{DATE_EDITION}}'],
      ['Période', '{{PERIODE_DEBUT}} au {{PERIODE_FIN}}'],
      ['Bail', '{{BAIL_REFERENCE}}']
    ),
    {
      t: 'cols',
      left: [
        h2('BAILLEUR'),
        p('**{{BAILLEUR_NOM}}**'),
        lines('Tél : {{BAILLEUR_TELEPHONE}}', 'Email : {{BAILLEUR_EMAIL}}')
      ],
      right: [h2('LOCATAIRE'), p('**{{LOCATAIRE_NOM}}**'), p('Tél : {{LOCATAIRE_TELEPHONE}}')]
    },
    h2('BIEN LOUÉ'),
    p('{{TYPE_BIEN}} — {{ADRESSE_BIEN}}'),
    p('Bail : {{BAIL_REFERENCE}}'),
    h2('SITUATION FINANCIÈRE'),
    {
      t: 'grid',
      head: ['Désignation', 'Montant ({{DEVISE}})'],
      rows: [
        ['Solde initial', '{{SOLDE_INITIAL}}'],
        ['Total loyers facturés', '{{TOTAL_LOYERS}}'],
        ['Total charges', '{{TOTAL_CHARGES}}'],
        ['Total pénalités', '{{TOTAL_PENALITES}}'],
        ['Total paiements reçus', '{{TOTAL_PAIEMENTS}}'],
        ['Solde final', '{{SOLDE_FINAL}}']
      ],
      widths: [6638, 3000],
      right: [1],
      boldLast: true
    },
    h2('DÉTAIL DES OPÉRATIONS'),
    {
      t: 'grid',
      head: ['Date', 'Libellé', 'Débit', 'Crédit', 'Solde'],
      rows: [operation(1), operation(2), operation(3)],
      widths: [1400, 3438, 1600, 1600, 1600],
      right: [2, 3, 4]
    },
    h2('OBSERVATIONS'),
    p('{{OBSERVATIONS}}'),
    p('Fait à {{LIEU_EDITION}}, le {{DATE_EDITION}}'),
    { t: 'sign', left: ['Le Bailleur / Gestionnaire', 'Signature / Cachet'], right: [''] }
  ];
}

// -------------------------------------------------------------- syndic : AG

function minutesBlocks(): Block[] {
  return [
    { t: 'title', text: 'COMPTE RENDU D’ASSEMBLÉE GÉNÉRALE', subtitle: '{{SYNDICATE_NAME}}' },
    refs(
      ['Référence', '{{REFERENCE_DOCUMENT}}'],
      ['Émis le', '{{DATE_EMISSION_DOCUMENT}}'],
      ['Immatriculation', '{{COPROPRIETE_IMMATRICULATION}}'],
      ['Réf. cadastrale', '{{COPROPRIETE_REFERENCE_CADASTRALE}}']
    ),
    lines(
      '**Copropriété :** {{SYNDICATE_NAME}}',
      '**Adresse :** {{SYNDICATE_ADDRESS}}',
      '**Type :** {{MEETING_TYPE}}',
      '**Date :** {{MEETING_DATE}}',
      '**Heure de début :** {{MEETING_START_TIME}}',
      '**Heure de fin :** {{MEETING_END_TIME}}',
      '**Lieu :** {{MEETING_LOCATION}}',
      '**Quorum :** {{MEETING_QUORUM}}'
    ),
    h2('FEUILLE DE PRÉSENCE'),
    p('{{ATTENDANCE_SUMMARY}}'),
    {
      t: 'grid',
      head: ['Lot', 'Tantièmes', 'Copropriétaire', 'Statut', 'Mode'],
      rows: [
        [
          '{{#ATTENDANCE}}{{ATTENDANCE_LOT}}',
          '{{ATTENDANCE_SHARES}}',
          '{{ATTENDANCE_PERSON}}',
          '{{ATTENDANCE_STATUS}}',
          '{{ATTENDANCE_MODE}}{{/ATTENDANCE}}'
        ]
      ],
      widths: [900, 1300, 3838, 2000, 1600],
      right: [1]
    },
    h2('ORDRE DU JOUR ET DISCUSSIONS'),
    p('{{^AGENDA_ITEMS}}- Aucun point d’ordre du jour renseigné.{{/AGENDA_ITEMS}}'),
    p('{{#AGENDA_ITEMS}}'),
    p('**{{AGENDA_INDEX}}. {{AGENDA_TITLE}}**'),
    p('Discussion : {{AGENDA_DISCUSSION}}'),
    p('{{/AGENDA_ITEMS}}'),
    h2('RÉSOLUTIONS ET RÉSULTATS'),
    p('{{^RESOLUTIONS}}- Aucune résolution enregistrée.{{/RESOLUTIONS}}'),
    p('{{#RESOLUTIONS}}'),
    p('**{{RESOLUTION_INDEX}}. {{RESOLUTION_TITLE}}**'),
    lines(
      'Description : {{RESOLUTION_DESCRIPTION}}',
      'Règle de majorité : {{RESOLUTION_MAJORITY_RULE}}',
      'Votes : pour {{RESOLUTION_VOTES_FOR}}, contre {{RESOLUTION_VOTES_AGAINST}}, abstention {{RESOLUTION_VOTES_ABSTAIN}}',
      '{{RESOLUTION_TANTIEMES}}',
      'Résultat : {{RESOLUTION_RESULT}}'
    ),
    p('{{/RESOLUTIONS}}'),
    h2('POUVOIRS'),
    p('{{^PROXIES}}Aucun pouvoir enregistré.{{/PROXIES}}'),
    p('{{#PROXIES}}'),
    p('- {{PROXY_GRANTOR}} est représenté(e) par {{PROXY_REPRESENTATIVE}}.'),
    p('{{/PROXIES}}'),
    h2('SYNTHÈSE'),
    { t: 'p', text: '{{FINAL_SUMMARY}}', opts: { keepNext: true } },
    { t: 'sign', left: ['Le Président de séance', 'Signature'], right: ['Le Secrétaire', 'Signature'], keep: true }
  ];
}

// ------------------------------------------------- syndic : nouveaux modèles

const SYNDICATE_REFS: Array<[string, string]> = [
  ['Copropriété', '{{COPROPRIETE_NOM}}'],
  ['Adresse', '{{COPROPRIETE_ADRESSE}}'],
  ['Immatriculation', '{{COPROPRIETE_IMMATRICULATION}}'],
  ['Réf. cadastrale', '{{COPROPRIETE_REFERENCE_CADASTRALE}}']
];

const COOWNER_AND_LOT: Block = {
  t: 'cols',
  left: [
    h2('COPROPRIÉTAIRE'),
    p('**{{COPROPRIETAIRE_NOM}}**'),
    lines('{{COPROPRIETAIRE_ADRESSE}}', '{{COPROPRIETAIRE_EMAIL}}')
  ],
  right: [
    h2('LOT'),
    p('**Lot n° {{LOT_NUMERO}}**'),
    lines('Type : {{LOT_TYPE}}', 'Tantièmes : {{LOT_TANTIEMES}} / {{LOT_TANTIEMES_TOTAL}}')
  ]
};

function chargeCallBlocks(): Block[] {
  return [
    { t: 'title', text: 'AVIS D’APPEL DE CHARGES', subtitle: 'Période : {{PERIODE}}' },
    refs(['Référence', '{{REFERENCE_DOCUMENT}}'], ['Émis le', '{{DATE_EMISSION_DOCUMENT}}'], ...SYNDICATE_REFS),
    COOWNER_AND_LOT,
    h2('DÉTAIL DE L’APPEL'),
    {
      t: 'grid',
      head: ['Désignation', 'Base de répartition', 'Montant ({{DEVISE}})'],
      rows: [['{{#LIGNES}}{{LIGNE_LIBELLE}}', '{{LIGNE_BASE}}', '{{LIGNE_MONTANT}}{{/LIGNES}}']],
      widths: [5038, 2400, 2200],
      right: [2]
    },
    {
      t: 'grid',
      head: ['Récapitulatif', 'Montant ({{DEVISE}})'],
      rows: [
        ['Montant appelé', '{{MONTANT_APPELE}}'],
        ['Solde antérieur', '{{SOLDE_ANTERIEUR}}'],
        ['TOTAL À PAYER', '{{TOTAL_A_PAYER}}']
      ],
      widths: [6638, 3000],
      right: [1],
      boldLast: true
    },
    p('Montant appelé en lettres : {{MONTANT_APPELE_LETTRES}}'),
    p('**Échéance : {{ECHEANCE}}**'),
    h2('MODALITÉS DE RÈGLEMENT'),
    p('{{MODALITES_PAIEMENT}}'),
    p('Le présent avis vaut demande de paiement ; il n’atteste aucun règlement.'),
    p('Fait à {{LIEU_EMISSION}}, le {{DATE_EMISSION_DOCUMENT}}'),
    { t: 'sign', left: ['Le Syndic', '{{EMETTEUR_NOM}}'], right: [''] }
  ];
}

function chargeReceiptBlocks(): Block[] {
  return [
    { t: 'title', text: 'QUITTANCE DE CHARGES', subtitle: 'Période : {{PERIODE}}' },
    refs(
      ['N° de quittance', '{{REFERENCE_DOCUMENT}}'],
      ['Date de paiement', '{{DATE_PAIEMENT}}'],
      ['Appel de charges', '{{APPEL_REFERENCE}}'],
      ['Émise le', '{{DATE_EMISSION_DOCUMENT}}'],
      ...SYNDICATE_REFS
    ),
    COOWNER_AND_LOT,
    h2('RÈGLEMENT'),
    {
      t: 'grid',
      head: ['Désignation', 'Montant ({{DEVISE}})'],
      rows: [
        ['Montant appelé', '{{MONTANT_APPELE}}'],
        ['Montant payé', '{{MONTANT_PAYE}}'],
        ['RESTE DÛ', '{{RESTE_DU}}']
      ],
      widths: [6638, 3000],
      right: [1],
      boldLast: true
    },
    lines('Mode de paiement : {{MODE_PAIEMENT}}', 'Référence du paiement : {{REFERENCE_PAIEMENT}}'),
    p(
      '**ATTESTATION** : Le syndic {{EMETTEUR_NOM}} reconnaît avoir reçu de {{COPROPRIETAIRE_NOM}} la somme de **{{MONTANT_PAYE}} {{DEVISE}}** ({{MONTANT_PAYE_LETTRES}}), au titre des charges de copropriété de la période {{PERIODE}}, pour le lot n° {{LOT_NUMERO}}.'
    ),
    p('Fait à {{LIEU_EMISSION}}, le {{DATE_EMISSION_DOCUMENT}}'),
    { t: 'sign', left: ['Le Syndic', 'Signature / Cachet'], right: [''] }
  ];
}

function convocationBlocks(): Block[] {
  return [
    { t: 'title', text: 'CONVOCATION À L’ASSEMBLÉE GÉNÉRALE', subtitle: '{{ASSEMBLEE_TYPE}}' },
    refs(['Référence', '{{REFERENCE_DOCUMENT}}'], ['Émise le', '{{DATE_EMISSION_DOCUMENT}}'], ...SYNDICATE_REFS),
    COOWNER_AND_LOT,
    p('Madame, Monsieur,'),
    p(
      'En votre qualité de copropriétaire du lot n° {{LOT_NUMERO}} ({{LOT_TANTIEMES}} tantièmes), vous êtes convoqué(e) à l’assemblée générale {{ASSEMBLEE_TYPE}} de la copropriété {{COPROPRIETE_NOM}}, qui se tiendra :'
    ),
    lines('**Date :** {{ASSEMBLEE_DATE}}', '**Heure :** {{ASSEMBLEE_HEURE}}', '**Lieu :** {{ASSEMBLEE_LIEU}}'),
    h2('ORDRE DU JOUR'),
    p('{{#ORDRE_DU_JOUR}}'),
    p('**{{POINT_NUMERO}}. {{POINT_TITRE}}**'),
    p('{{POINT_DESCRIPTION}}'),
    p('{{/ORDRE_DU_JOUR}}'),
    h2('PARTICIPATION ET POUVOIRS'),
    p(
      'Si vous ne pouvez pas assister à l’assemblée, vous pouvez vous faire représenter par un mandataire de votre choix en lui remettant un pouvoir écrit, à transmettre au syndic avant le {{DATE_LIMITE_POUVOIR}}.'
    ),
    p('{{MENTION_QUORUM}}'),
    p('Fait à {{LIEU_EMISSION}}, le {{DATE_EMISSION_DOCUMENT}}'),
    { t: 'sign', left: ['Le Syndic', '{{EMETTEUR_NOM}}'], right: [''] }
  ];
}

export const STANDARD_CONTENT = {
  bail_habitation: habitationBlocks,
  bail_commercial: commercialBlocks,
  recu_loyer: receiptBlocks,
  releve_locatif: statementBlocks,
  compte_rendu_assemblee_generale: minutesBlocks,
  avis_appel_charges: chargeCallBlocks,
  quittance_charges: chargeReceiptBlocks,
  convocation_assemblee_generale: convocationBlocks
} as const;

export type StandardTemplateKey = keyof typeof STANDARD_CONTENT;
