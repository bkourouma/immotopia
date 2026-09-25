import { createCashVoucher, createSupplierInvoice, listSupplierInvoices } from '../../services/finance-lot2-service';
import { createPurchaseOrder, listPurchaseOrders } from '../../services/finance-lot3-service';
import { createSalaryNote, listSalaryNotes } from '../../services/finance-salaries-service';
import { createProgressStatement, listProgressStatements } from '../../services/finance-contractors-service';
import {
  listStockMovements,
  recordStockIssue,
  recordStockReceipt
} from '../../services/finance-stock-mouvements-service';
import { listLandLeaseAccruals, recordLandLeaseAccrual } from '../../services/finance-lot4-service';
import { aTraduire, t } from '../../i18n/t';
import { decouperPeriode } from './valeurs';
import type { ContexteImportation, DescripteurNature, ValeursLigne } from './types';

/**
 * Les sept natures du module, une par descripteur.
 *
 * ---------------------------------------------------------------------------
 * Ce fichier est le SEUL endroit qui connaît une nature
 * ---------------------------------------------------------------------------
 *
 * `pages/finance/Importation.tsx` lit `DESCRIPTEURS` et rien d'autre. Ajouter
 * la huitième nature, c'est ajouter un objet ici : l'écran, le rapprochement,
 * l'aperçu et l'exécution n'en sauront jamais le nom.
 *
 * Huit descripteurs pour sept natures : le mouvement de stock se saisit par
 * deux gestes opposés — une réception entre, une sortie s'impute à un
 * chantier — qui ne partagent ni leurs champs ni leur service. Les fondre en
 * un seul aurait obligé l'écran à connaître un « sens », c'est-à-dire à
 * connaître la nature.
 *
 * ---------------------------------------------------------------------------
 * Aucune pièce n'est validée ici
 * ---------------------------------------------------------------------------
 *
 * Chaque `enregistrer` appelle une création, jamais une validation. Les
 * pièces naissent BROUILLON et rejoignent « Pièces à valider » là où leur
 * nature y passe. C'est la décision du propriétaire du produit, et c'est ce
 * qui rend un import raté sans conséquence comptable.
 *
 * ---------------------------------------------------------------------------
 * Une ligne du fichier = une pièce
 * ---------------------------------------------------------------------------
 *
 * Un fichier tenu à la main n'exprime pas le regroupement : rien n'y dit que
 * les lignes 4 à 7 sont les quatre lignes d'une même facture. Une facture
 * importée porte donc UNE ligne, un bon de commande UNE ligne, une réception
 * UN article. Regrouper sur un numéro de pièce commun serait une seconde
 * fonctionnalité, avec ses propres pièges ; elle n'est pas faite, et c'est
 * dit au rapport.
 *
 * ---------------------------------------------------------------------------
 * Les textes restent en français ici
 * ---------------------------------------------------------------------------
 *
 * Libellés, descriptions et aides sont marqués `aTraduire()` et traduits par
 * l'écran au rendu : un `t()` au niveau du module serait appelé à l'import,
 * avant le choix de la langue. Le libellé sert d'ailleurs aussi à reconnaître
 * une colonne, tout comme `entetes`, qui ne se traduit jamais — ce sont les
 * en-têtes d'un fichier réel, et `scripts/i18n-migrate.mjs` les ignore.
 */

// ---------------------------------------------------------------------------
// Petits lecteurs, pour que chaque descripteur se lise d'une traite
// ---------------------------------------------------------------------------

function texte(valeurs: ValeursLigne, cle: string): string {
  const valeur = valeurs[cle];
  return typeof valeur === 'string' ? valeur : valeur === null || valeur === undefined ? '' : String(valeur);
}

function nombre(valeurs: ValeursLigne, cle: string): number {
  const valeur = valeurs[cle];
  return typeof valeur === 'number' ? valeur : 0;
}

/** `null` plutôt que `0` : un champ facultatif absent n'est pas un zéro. */
function nombreOuNul(valeurs: ValeursLigne, cle: string): number | null {
  const valeur = valeurs[cle];
  return typeof valeur === 'number' ? valeur : null;
}

function chantierExige(contexte: ContexteImportation): string {
  // `evaluerLigne` a déjà refusé la ligne si le chantier manque : cette
  // fonction n'est atteinte que sur une ligne valide.
  return contexte.siteId ?? '';
}

/** Les empreintes d'une liste, mises à plat. Le format importe peu, la stabilité si. */
function empreinteDe(parties: Array<string | number | null>): string | null {
  if (parties.some(partie => partie === null || partie === '' || partie === undefined)) return null;
  return parties.join('|');
}

// ---------------------------------------------------------------------------
// 1. Pièce de caisse
// ---------------------------------------------------------------------------

const PIECE_DE_CAISSE: DescripteurNature = {
  cle: 'piece-de-caisse',
  libelle: aTraduire('Pièce de caisse'),
  description: aTraduire(
    'Une dépense réglée en espèces, imputée à un chantier et à un poste. Créée à l’état brouillon.'
  ),
  chantier: 'exige',
  referentiels: ['postes'],
  champs: [
    {
      cle: 'costCategoryId',
      libelle: aTraduire('Poste de dépense'),
      obligatoire: true,
      type: 'reference',
      referentiel: 'postes',
      entetes: ['poste', 'catégorie', 'rubrique', 'imputation', 'nature de la dépense']
    },
    {
      cle: 'beneficiary',
      libelle: aTraduire('Bénéficiaire'),
      obligatoire: true,
      type: 'texte',
      entetes: ['bénéficiaire', 'payé à', 'destinataire', 'nom']
    },
    {
      cle: 'amount',
      libelle: aTraduire('Montant'),
      obligatoire: true,
      type: 'montant',
      entetes: ['somme', 'total', 'valeur']
    },
    {
      cle: 'voucherDate',
      libelle: aTraduire('Date de la pièce'),
      obligatoire: true,
      type: 'date',
      entetes: ['date', 'date de dépense', 'jour'],
      valeurParDefaut: contexte => contexte.dateParDefaut
    },
    {
      cle: 'reason',
      libelle: aTraduire('Motif'),
      obligatoire: true,
      type: 'texte',
      entetes: ['objet', 'libellé', 'description', 'raison', 'désignation']
    }
  ],
  enregistrer: async (valeurs, contexte) => {
    await createCashVoucher(contexte.tenantId, {
      siteId: chantierExige(contexte),
      costCategoryId: texte(valeurs, 'costCategoryId'),
      beneficiary: texte(valeurs, 'beneficiary'),
      amount: nombre(valeurs, 'amount'),
      voucherDate: texte(valeurs, 'voucherDate'),
      reason: texte(valeurs, 'reason')
    });
  },
  // Pas d'`empreinte`, pas de `chargerEmpreintes` : voir ci-dessous.
  doublonImpossible: aTraduire(
    'Aucune liste des pièces de caisse n’est lisible depuis l’application : la file de validation ne montre que les pièces en attente, sans leur chantier ni leur date. Les doublons ne peuvent donc pas être signalés pour cette nature.'
  )
};

// ---------------------------------------------------------------------------
// 2. Facture fournisseur
// ---------------------------------------------------------------------------

const FACTURE_FOURNISSEUR: DescripteurNature = {
  cle: 'facture-fournisseur',
  libelle: aTraduire('Facture fournisseur'),
  description: aTraduire(
    'Une facture reçue, d’une seule ligne, imputée au chantier choisi. Créée à l’état brouillon : rien ne bouge au compte du fournisseur avant validation.'
  ),
  chantier: 'exige',
  referentiels: ['postes', 'fournisseurs'],
  champs: [
    {
      cle: 'supplierId',
      libelle: aTraduire('Fournisseur'),
      obligatoire: true,
      type: 'reference',
      referentiel: 'fournisseurs',
      entetes: ['prestataire', 'vendeur', 'raison sociale', 'tiers']
    },
    {
      cle: 'reference',
      libelle: aTraduire('Référence de la facture'),
      obligatoire: true,
      type: 'texte',
      entetes: ['référence', 'numéro', 'n° facture', 'facture', 'pièce']
    },
    {
      cle: 'invoiceDate',
      libelle: aTraduire('Date de la facture'),
      obligatoire: true,
      type: 'date',
      entetes: ['date', 'date facture'],
      valeurParDefaut: contexte => contexte.dateParDefaut
    },
    {
      cle: 'costCategoryId',
      libelle: aTraduire('Poste de dépense'),
      obligatoire: true,
      type: 'reference',
      referentiel: 'postes',
      entetes: ['poste', 'catégorie', 'rubrique', 'imputation']
    },
    {
      cle: 'label',
      libelle: aTraduire('Désignation'),
      obligatoire: true,
      type: 'texte',
      entetes: ['libellé', 'objet', 'description', 'article', 'prestation']
    },
    {
      cle: 'amount',
      libelle: aTraduire('Montant'),
      obligatoire: true,
      type: 'montant',
      entetes: ['total', 'somme', 'montant ttc']
    },
    {
      cle: 'quantity',
      libelle: aTraduire('Quantité'),
      obligatoire: false,
      type: 'quantite',
      entetes: ['qté', 'qte', 'nombre', 'nb'],
      aide: aTraduire('Facultative. Beaucoup de dépenses n’en ont pas : une prestation, un forfait.')
    },
    {
      cle: 'unitPrice',
      libelle: aTraduire('Prix unitaire'),
      obligatoire: false,
      type: 'montant',
      entetes: ['pu', 'p.u.', 'prix', 'coût unitaire']
    }
  ],
  enregistrer: async (valeurs, contexte) => {
    const montant = nombre(valeurs, 'amount');
    await createSupplierInvoice(contexte.tenantId, {
      supplierId: texte(valeurs, 'supplierId'),
      invoiceDate: texte(valeurs, 'invoiceDate'),
      reference: texte(valeurs, 'reference'),
      lines: [
        {
          label: texte(valeurs, 'label'),
          amount: montant,
          quantity: nombreOuNul(valeurs, 'quantity'),
          unitPrice: nombreOuNul(valeurs, 'unitPrice')
        }
      ],
      // La somme des imputations doit égaler le montant de la facture : une
      // ligne, une imputation, le compte tombe juste par construction.
      allocations: [
        { siteId: chantierExige(contexte), costCategoryId: texte(valeurs, 'costCategoryId'), amount: montant }
      ]
    });
  },
  empreinte: valeurs =>
    empreinteDe([
      'facture',
      texte(valeurs, 'supplierId'),
      texte(valeurs, 'invoiceDate'),
      nombre(valeurs, 'amount').toFixed(2)
    ]),
  chargerEmpreintes: async contexte => {
    // Le contrat n'offre aucune liste globale des factures : elle se compose
    // fournisseur par fournisseur, en parallèle. Un fournisseur illisible ne
    // fait pas échouer l'aperçu — il fait seulement manquer sa part de la
    // détection, ce qui est moins grave qu'un écran qui refuse de s'ouvrir.
    const paquets = await Promise.all(
      contexte.referentiel.fournisseurs.map(fournisseur =>
        listSupplierInvoices(contexte.tenantId, fournisseur.id).catch(() => [])
      )
    );
    return paquets
      .flat()
      .map(facture =>
        empreinteDe(['facture', facture.supplierId, facture.invoiceDate.slice(0, 10), facture.amount.toFixed(2)])
      )
      .filter((empreinte): empreinte is string => empreinte !== null);
  }
};

// ---------------------------------------------------------------------------
// 3. Bon de commande
// ---------------------------------------------------------------------------

const BON_DE_COMMANDE: DescripteurNature = {
  cle: 'bon-de-commande',
  libelle: aTraduire('Bon de commande'),
  description: aTraduire(
    'Une commande d’une seule ligne, passée sur le chantier choisi. Créée à l’état brouillon, non émise.'
  ),
  chantier: 'exige',
  referentiels: ['postes', 'fournisseurs'],
  champs: [
    {
      cle: 'supplierId',
      libelle: aTraduire('Fournisseur'),
      obligatoire: true,
      type: 'reference',
      referentiel: 'fournisseurs',
      entetes: ['prestataire', 'vendeur', 'raison sociale', 'tiers']
    },
    {
      cle: 'reference',
      libelle: aTraduire('Référence du bon'),
      obligatoire: true,
      type: 'texte',
      entetes: ['référence', 'numéro', 'n° bon', 'bon de commande', 'commande']
    },
    {
      cle: 'orderDate',
      libelle: aTraduire('Date de la commande'),
      obligatoire: true,
      type: 'date',
      entetes: ['date', 'date de commande'],
      valeurParDefaut: contexte => contexte.dateParDefaut
    },
    {
      cle: 'costCategoryId',
      libelle: aTraduire('Poste de dépense'),
      obligatoire: true,
      type: 'reference',
      referentiel: 'postes',
      entetes: ['poste', 'catégorie', 'rubrique', 'imputation']
    },
    {
      cle: 'label',
      libelle: aTraduire('Désignation'),
      obligatoire: true,
      type: 'texte',
      entetes: ['libellé', 'objet', 'description', 'article']
    },
    { cle: 'amount', libelle: aTraduire('Montant'), obligatoire: true, type: 'montant', entetes: ['total', 'somme'] },
    {
      cle: 'quantity',
      libelle: aTraduire('Quantité'),
      obligatoire: false,
      type: 'quantite',
      entetes: ['qté', 'qte', 'nombre']
    },
    {
      cle: 'unitPrice',
      libelle: aTraduire('Prix unitaire'),
      obligatoire: false,
      type: 'montant',
      entetes: ['pu', 'p.u.', 'prix', 'coût unitaire']
    }
  ],
  enregistrer: async (valeurs, contexte) => {
    await createPurchaseOrder(contexte.tenantId, {
      siteId: chantierExige(contexte),
      supplierId: texte(valeurs, 'supplierId'),
      reference: texte(valeurs, 'reference'),
      orderDate: texte(valeurs, 'orderDate'),
      lines: [
        {
          costCategoryId: texte(valeurs, 'costCategoryId'),
          label: texte(valeurs, 'label'),
          amount: nombre(valeurs, 'amount'),
          quantity: nombreOuNul(valeurs, 'quantity'),
          unitPrice: nombreOuNul(valeurs, 'unitPrice')
        }
      ]
    });
  },
  empreinte: (valeurs, contexte) =>
    empreinteDe([
      'bon',
      contexte.siteId,
      texte(valeurs, 'supplierId'),
      texte(valeurs, 'orderDate'),
      nombre(valeurs, 'amount').toFixed(2)
    ]),
  chargerEmpreintes: async contexte => {
    const bons = await listPurchaseOrders(contexte.tenantId, contexte.siteId ? { siteId: contexte.siteId } : undefined);
    return bons
      .map(bon =>
        empreinteDe(['bon', bon.siteId, bon.supplierId, bon.orderDate.slice(0, 10), bon.totalAmount.toFixed(2)])
      )
      .filter((empreinte): empreinte is string => empreinte !== null);
  }
};

// ---------------------------------------------------------------------------
// 4. Note de salaire
// ---------------------------------------------------------------------------

const NOTE_DE_SALAIRE: DescripteurNature = {
  cle: 'note-de-salaire',
  libelle: aTraduire('Note de salaire'),
  description: aTraduire(
    'Le salaire d’un mois pour un salarié. Le chantier est facultatif ; quand il est choisi, le poste de dépense devient exigé — le serveur refuse l’un sans l’autre.'
  ),
  chantier: 'facultatif',
  referentiels: ['postes', 'salaries'],
  champs: [
    {
      cle: 'employeeId',
      libelle: aTraduire('Salarié'),
      obligatoire: true,
      type: 'reference',
      referentiel: 'salaries',
      entetes: ['employé', 'nom', 'nom complet', 'personnel', 'agent']
    },
    {
      cle: 'periode',
      libelle: aTraduire('Mois'),
      obligatoire: true,
      type: 'periode',
      entetes: ['période', 'periode', 'mois', 'date'],
      valeurParDefaut: contexte => contexte.dateParDefaut,
      aide: aTraduire('Un mois, pas un jour : « 03/2026 » ou « 2026-03 ». Une date complète est ramenée à son mois.')
    },
    {
      cle: 'amount',
      libelle: aTraduire('Montant'),
      obligatoire: true,
      type: 'montant',
      entetes: ['salaire', 'net', 'net à payer', 'total', 'somme']
    },
    {
      cle: 'costCategoryId',
      libelle: aTraduire('Poste de dépense'),
      obligatoire: false,
      type: 'reference',
      referentiel: 'postes',
      entetes: ['poste', 'catégorie', 'imputation'],
      aide: aTraduire('Exigé seulement si un chantier est choisi à l’étape 1.')
    }
  ],
  valider: (valeurs, contexte) => {
    if (contexte.siteId && !texte(valeurs, 'costCategoryId')) {
      return [t('Un chantier est choisi : le poste de dépense devient obligatoire.')];
    }
    return [];
  },
  enregistrer: async (valeurs, contexte) => {
    const periode = decouperPeriode(texte(valeurs, 'periode'));
    if (!periode) throw new Error(t('Le mois de la note est illisible.'));
    const posteId = texte(valeurs, 'costCategoryId');
    await createSalaryNote(contexte.tenantId, texte(valeurs, 'employeeId'), {
      periodYear: periode.periodYear,
      periodMonth: periode.periodMonth,
      amount: nombre(valeurs, 'amount'),
      // Les deux vont par paire, ou pas du tout : le serveur refuse l'un sans
      // l'autre dans les DEUX sens.
      ...(contexte.siteId && posteId ? { siteId: contexte.siteId, costCategoryId: posteId } : {})
    });
  },
  empreinte: valeurs =>
    empreinteDe([
      'salaire',
      texte(valeurs, 'employeeId'),
      texte(valeurs, 'periode'),
      nombre(valeurs, 'amount').toFixed(2)
    ]),
  chargerEmpreintes: async contexte => {
    const notes = await listSalaryNotes(contexte.tenantId);
    return notes
      .map(note =>
        empreinteDe([
          'salaire',
          note.employeeId,
          `${note.periodYear}-${String(note.periodMonth).padStart(2, '0')}`,
          note.amount.toFixed(2)
        ])
      )
      .filter((empreinte): empreinte is string => empreinte !== null);
  }
};

// ---------------------------------------------------------------------------
// 5. Situation de tâcheron
// ---------------------------------------------------------------------------

const SITUATION_DE_TACHERON: DescripteurNature = {
  cle: 'situation-de-tacheron',
  libelle: aTraduire('Situation de tâcheron'),
  description: aTraduire(
    'Un avancement constaté sur un marché de tâcheron. Le chantier et le poste viennent du marché : il n’y a rien à choisir à l’étape 1.'
  ),
  chantier: 'sans',
  referentiels: ['contrats', 'tacherons'],
  champs: [
    {
      cle: 'contractId',
      libelle: aTraduire('Marché'),
      obligatoire: true,
      type: 'reference',
      referentiel: 'contrats',
      entetes: ['contrat', 'référence', 'n° marché', 'tâcheron', 'tacheron'],
      aide: aTraduire('Reconnu par la référence du marché, ou par « Nom du tâcheron + référence ».')
    },
    {
      cle: 'statementDate',
      libelle: aTraduire('Date de la situation'),
      obligatoire: true,
      type: 'date',
      entetes: ['date', 'date de situation'],
      valeurParDefaut: contexte => contexte.dateParDefaut
    },
    {
      cle: 'amount',
      libelle: aTraduire('Montant'),
      obligatoire: true,
      type: 'montant',
      entetes: ['total', 'somme', 'valeur']
    },
    {
      cle: 'description',
      libelle: aTraduire('Description'),
      obligatoire: true,
      type: 'texte',
      entetes: ['libellé', 'objet', 'avancement', 'travaux', 'désignation']
    }
  ],
  enregistrer: async (valeurs, contexte) => {
    await createProgressStatement(contexte.tenantId, texte(valeurs, 'contractId'), {
      statementDate: texte(valeurs, 'statementDate'),
      amount: nombre(valeurs, 'amount'),
      description: texte(valeurs, 'description')
    });
  },
  empreinte: valeurs =>
    empreinteDe([
      'situation',
      texte(valeurs, 'contractId'),
      texte(valeurs, 'statementDate'),
      nombre(valeurs, 'amount').toFixed(2)
    ]),
  chargerEmpreintes: async contexte => {
    const paquets = await Promise.all(
      contexte.referentiel.contrats.map(contrat =>
        listProgressStatements(contexte.tenantId, contrat.id).catch(() => [])
      )
    );
    return paquets
      .flat()
      .map(situation =>
        empreinteDe([
          'situation',
          situation.contractId,
          situation.statementDate.slice(0, 10),
          situation.amount.toFixed(2)
        ])
      )
      .filter((empreinte): empreinte is string => empreinte !== null);
  }
};

// ---------------------------------------------------------------------------
// 6. Réception de stock
// ---------------------------------------------------------------------------

const RECEPTION_DE_STOCK: DescripteurNature = {
  cle: 'reception-de-stock',
  libelle: aTraduire('Réception de stock'),
  description: aTraduire(
    'Une entrée d’article dans un lieu, adossée à une facture fournisseur validée. Une ligne du fichier = une réception d’un article.'
  ),
  chantier: 'sans',
  referentiels: ['articles', 'lieux', 'facturesFournisseur'],
  champs: [
    {
      cle: 'locationId',
      libelle: aTraduire('Lieu de stockage'),
      obligatoire: true,
      type: 'reference',
      referentiel: 'lieux',
      entetes: ['lieu', 'magasin', 'dépôt', 'entrepôt', 'emplacement']
    },
    {
      cle: 'supplierInvoiceId',
      libelle: aTraduire('Facture fournisseur'),
      obligatoire: true,
      type: 'reference',
      referentiel: 'facturesFournisseur',
      entetes: ['facture', 'référence facture', 'n° facture', 'pièce'],
      aide: aTraduire('Seules les factures validées peuvent porter une réception.')
    },
    {
      cle: 'receiptDate',
      libelle: aTraduire('Date de réception'),
      obligatoire: true,
      type: 'date',
      entetes: ['date', 'date de livraison', 'livraison'],
      valeurParDefaut: contexte => contexte.dateParDefaut
    },
    {
      cle: 'itemId',
      libelle: aTraduire('Article'),
      obligatoire: true,
      type: 'reference',
      referentiel: 'articles',
      entetes: ['matériau', 'désignation', 'référence article', 'produit', 'libellé']
    },
    {
      cle: 'quantity',
      libelle: aTraduire('Quantité'),
      obligatoire: true,
      type: 'quantite',
      entetes: ['qté', 'qte', 'nombre']
    },
    {
      cle: 'unitCost',
      libelle: aTraduire('Prix unitaire'),
      obligatoire: true,
      type: 'montant',
      entetes: ['pu', 'p.u.', 'coût unitaire', 'prix'],
      aide: aTraduire('Le zéro est accepté : un don, une chute récupérée entrent à valeur nulle.')
    }
  ],
  enregistrer: async (valeurs, contexte) => {
    await recordStockReceipt(contexte.tenantId, {
      locationId: texte(valeurs, 'locationId'),
      supplierInvoiceId: texte(valeurs, 'supplierInvoiceId'),
      receiptDate: texte(valeurs, 'receiptDate'),
      lines: [
        {
          itemId: texte(valeurs, 'itemId'),
          quantity: nombre(valeurs, 'quantity'),
          unitCost: nombre(valeurs, 'unitCost')
        }
      ]
    });
  },
  empreinte: valeurs =>
    empreinteDe([
      'reception',
      texte(valeurs, 'locationId'),
      texte(valeurs, 'itemId'),
      texte(valeurs, 'receiptDate'),
      nombre(valeurs, 'quantity').toString()
    ]),
  chargerEmpreintes: async contexte => {
    const mouvements = await listStockMovements(contexte.tenantId, { type: 'RECEIPT' });
    return mouvements
      .map(mouvement =>
        empreinteDe([
          'reception',
          mouvement.locationId,
          mouvement.itemId,
          mouvement.movementDate.slice(0, 10),
          mouvement.quantity.toString()
        ])
      )
      .filter((empreinte): empreinte is string => empreinte !== null);
  }
};

// ---------------------------------------------------------------------------
// 7. Sortie de stock vers un chantier
// ---------------------------------------------------------------------------

const SORTIE_DE_STOCK: DescripteurNature = {
  cle: 'sortie-de-stock',
  libelle: aTraduire('Sortie de stock'),
  description: aTraduire(
    'Un article sort d’un lieu vers le chantier choisi, et s’y impute. Aucun prix n’est saisi : la valeur vient du coût moyen du lieu.'
  ),
  chantier: 'exige',
  referentiels: ['articles', 'lieux', 'postes'],
  champs: [
    {
      cle: 'locationId',
      libelle: aTraduire('Lieu de stockage'),
      obligatoire: true,
      type: 'reference',
      referentiel: 'lieux',
      entetes: ['lieu', 'magasin', 'dépôt', 'entrepôt', 'emplacement']
    },
    {
      cle: 'itemId',
      libelle: aTraduire('Article'),
      obligatoire: true,
      type: 'reference',
      referentiel: 'articles',
      entetes: ['matériau', 'désignation', 'référence article', 'produit', 'libellé']
    },
    {
      cle: 'quantity',
      libelle: aTraduire('Quantité'),
      obligatoire: true,
      type: 'quantite',
      entetes: ['qté', 'qte', 'nombre']
    },
    {
      cle: 'costCategoryId',
      libelle: aTraduire('Poste de dépense'),
      obligatoire: true,
      type: 'reference',
      referentiel: 'postes',
      entetes: ['poste', 'catégorie', 'imputation'],
      aide: aTraduire('Exigé, jamais deviné depuis l’article : son poste par défaut n’est qu’une proposition.')
    },
    {
      cle: 'requestedBy',
      libelle: aTraduire('Demandeur'),
      obligatoire: true,
      type: 'texte',
      entetes: ['demandé par', 'demande par', 'responsable', 'chef de chantier', 'bénéficiaire']
    },
    {
      cle: 'issueDate',
      libelle: aTraduire('Date de sortie'),
      obligatoire: true,
      type: 'date',
      entetes: ['date', 'date de sortie'],
      valeurParDefaut: contexte => contexte.dateParDefaut
    }
  ],
  enregistrer: async (valeurs, contexte) => {
    await recordStockIssue(contexte.tenantId, {
      locationId: texte(valeurs, 'locationId'),
      itemId: texte(valeurs, 'itemId'),
      quantity: nombre(valeurs, 'quantity'),
      siteId: chantierExige(contexte),
      costCategoryId: texte(valeurs, 'costCategoryId'),
      requestedBy: texte(valeurs, 'requestedBy'),
      issueDate: texte(valeurs, 'issueDate')
    });
  },
  empreinte: (valeurs, contexte) =>
    empreinteDe([
      'sortie',
      contexte.siteId,
      texte(valeurs, 'locationId'),
      texte(valeurs, 'itemId'),
      texte(valeurs, 'issueDate'),
      nombre(valeurs, 'quantity').toString()
    ]),
  chargerEmpreintes: async contexte => {
    const mouvements = await listStockMovements(contexte.tenantId, {
      type: 'ISSUE',
      ...(contexte.siteId ? { siteId: contexte.siteId } : {})
    });
    return mouvements
      .map(mouvement =>
        empreinteDe([
          'sortie',
          mouvement.siteId,
          mouvement.locationId,
          mouvement.itemId,
          mouvement.movementDate.slice(0, 10),
          mouvement.quantity.toString()
        ])
      )
      .filter((empreinte): empreinte is string => empreinte !== null);
  }
};

// ---------------------------------------------------------------------------
// 8. Constatation de loyer de terrain
// ---------------------------------------------------------------------------

const CONSTATATION_DE_LOYER: DescripteurNature = {
  cle: 'constatation-de-loyer',
  libelle: aTraduire('Constatation de loyer de terrain'),
  description: aTraduire(
    'Le douzième mensuel d’un bail de terrain, constaté à la main pour un mois. Le montant vient du bail : il n’y a rien à saisir.'
  ),
  chantier: 'sans',
  referentiels: ['baux'],
  champs: [
    {
      cle: 'landLeaseId',
      libelle: aTraduire('Bail de terrain'),
      obligatoire: true,
      type: 'reference',
      referentiel: 'baux',
      entetes: ['bail', 'terrain', 'bailleur', 'propriétaire', 'parcelle']
    },
    {
      cle: 'periode',
      libelle: aTraduire('Mois'),
      obligatoire: true,
      type: 'periode',
      entetes: ['période', 'periode', 'mois', 'date'],
      valeurParDefaut: contexte => contexte.dateParDefaut,
      aide: aTraduire('Le montant n’est pas importé : le serveur constate le douzième du bail.')
    }
  ],
  enregistrer: async (valeurs, contexte) => {
    const periode = decouperPeriode(texte(valeurs, 'periode'));
    if (!periode) throw new Error(t('Le mois de la constatation est illisible.'));
    await recordLandLeaseAccrual(contexte.tenantId, texte(valeurs, 'landLeaseId'), periode);
  },
  empreinte: valeurs => empreinteDe(['loyer', texte(valeurs, 'landLeaseId'), texte(valeurs, 'periode')]),
  chargerEmpreintes: async contexte => {
    const paquets = await Promise.all(
      contexte.referentiel.baux.map(bail => listLandLeaseAccruals(contexte.tenantId, bail.id).catch(() => []))
    );
    return paquets
      .flat()
      .map(constatation =>
        empreinteDe([
          'loyer',
          constatation.landLeaseId,
          `${constatation.periodYear}-${String(constatation.periodMonth).padStart(2, '0')}`
        ])
      )
      .filter((empreinte): empreinte is string => empreinte !== null);
  }
};

// ---------------------------------------------------------------------------
// Le catalogue
// ---------------------------------------------------------------------------

export const DESCRIPTEURS: DescripteurNature[] = [
  PIECE_DE_CAISSE,
  FACTURE_FOURNISSEUR,
  BON_DE_COMMANDE,
  NOTE_DE_SALAIRE,
  SITUATION_DE_TACHERON,
  RECEPTION_DE_STOCK,
  SORTIE_DE_STOCK,
  CONSTATATION_DE_LOYER
];

export function trouverDescripteur(cle: string | null | undefined): DescripteurNature | null {
  if (!cle) return null;
  return DESCRIPTEURS.find(descripteur => descripteur.cle === cle) ?? null;
}
