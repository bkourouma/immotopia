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
import type { StockMovementType } from '../../types/finance-stock-mouvements-types';
import type { StockMovementView } from '../../types/finance-stock-controle-types';
import { nouvelIdentifiantDeRequete } from '../../utils/stock-client-request-id';
import { t } from '../../i18n/t';
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
// Le stock (lot 040) : identifiant de requête stable, journal parcouru en entier
// ---------------------------------------------------------------------------

/**
 * Les identifiants de requête d'écritures de stock dont le succès n'est pas
 * encore confirmé, par contenu de ligne (spec B3-R2, ecrans §10.8).
 *
 * L'exécution de l'import ne transmet que les valeurs de la ligne, pas son
 * numéro : l'identifiant est donc rattaché au CONTENU (agence, nature,
 * chantier, valeurs). Une même ligne relancée après une coupure réutilise son
 * identifiant — le serveur rejoue l'écriture au lieu de la doubler — et un
 * identifiant est jeté dès que l'écriture a réussi : deux lignes identiques du
 * même fichier, ou une ligne réimportée plus tard, créent bien deux pièces.
 */
const IDENTIFIANTS_EN_ATTENTE = new Map<string, string[]>();

function cleDeContenu(nature: string, valeurs: ValeursLigne, contexte: ContexteImportation): string {
  const champs = Object.keys(valeurs)
    .sort()
    .map(cle => `${cle}=${valeurs[cle] === null || valeurs[cle] === undefined ? '' : String(valeurs[cle])}`);
  return [contexte.tenantId, nature, contexte.siteId ?? '', ...champs].join('|');
}

/**
 * Envoie une écriture de stock avec un `clientRequestId` stable pour cette
 * ligne : tiré au premier essai, gardé tant que l'envoi n'a pas réussi, jeté
 * après le succès.
 */
export async function avecIdentifiantStable<T>(
  nature: string,
  valeurs: ValeursLigne,
  contexte: ContexteImportation,
  envoi: (clientRequestId: string) => Promise<T>
): Promise<T> {
  const cle = cleDeContenu(nature, valeurs, contexte);
  const enAttente = IDENTIFIANTS_EN_ATTENTE.get(cle) ?? [];
  const identifiant = enAttente[0] ?? nouvelIdentifiantDeRequete();
  if (enAttente.length === 0) IDENTIFIANTS_EN_ATTENTE.set(cle, [identifiant]);
  const resultat = await envoi(identifiant);
  const restants = (IDENTIFIANTS_EN_ATTENTE.get(cle) ?? []).filter(id => id !== identifiant);
  if (restants.length > 0) {
    IDENTIFIANTS_EN_ATTENTE.set(cle, restants);
  } else {
    IDENTIFIANTS_EN_ATTENTE.delete(cle);
  }
  return resultat;
}

/** 200 par page : le plafond du contrat (`GET /stock/movements`, `limit` 1 à 200). */
const PAGE_DU_JOURNAL = 200;
/** Garde-fou : 100 pages, soit 20 000 mouvements, au-delà desquelles on s'arrête. */
const PAGES_MAXIMUM = 100;
/** Le réglage `backdatingLimitDays` ne dépasse jamais 365 jours (contrat `ControlsSettingsPatch`). */
const RECUL_MAXIMUM_JOURS = 365;

/**
 * Les mouvements d'une nature, TOUTES pages lues (journal paginé par curseur,
 * lot 040, A5-R1) : sans cela, les empreintes ne verraient que la première
 * page et laisseraient passer des doublons.
 *
 * La lecture est bornée à la seule période qu'une ligne importée peut encore
 * viser : le serveur refuse une date plus ancienne que la limite de saisie a
 * posteriori (au plus 365 jours) ou postérieure à aujourd'hui.
 */
async function tousLesMouvements(
  tenantId: string,
  filtres: { type: StockMovementType; siteId?: string }
): Promise<StockMovementView[]> {
  const aujourdhui = new Date();
  const from = new Date(aujourdhui.getTime() - RECUL_MAXIMUM_JOURS * 86_400_000).toISOString().slice(0, 10);
  const to = aujourdhui.toISOString().slice(0, 10);
  const mouvements: StockMovementView[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < PAGES_MAXIMUM; page += 1) {
    const lu = await listStockMovements(tenantId, { ...filtres, from, to, limit: PAGE_DU_JOURNAL, cursor });
    mouvements.push(...lu.data);
    if (!lu.meta.nextCursor) break;
    cursor = lu.meta.nextCursor;
  }
  return mouvements;
}

// ---------------------------------------------------------------------------
// 1. Pièce de caisse
// ---------------------------------------------------------------------------

const PIECE_DE_CAISSE: DescripteurNature = {
  cle: 'piece-de-caisse',
  libelle: 'Pièce de caisse',
  description: 'Une dépense réglée en espèces, imputée à un chantier et à un poste. Créée à l’état brouillon.',
  chantier: 'exige',
  referentiels: ['postes'],
  champs: [
    {
      cle: 'costCategoryId',
      libelle: 'Poste de dépense',
      obligatoire: true,
      type: 'reference',
      referentiel: 'postes',
      entetes: ['poste', 'catégorie', 'rubrique', 'imputation', 'nature de la dépense']
    },
    {
      cle: 'beneficiary',
      libelle: 'Bénéficiaire',
      obligatoire: true,
      type: 'texte',
      entetes: ['bénéficiaire', 'payé à', 'destinataire', 'nom']
    },
    { cle: 'amount', libelle: 'Montant', obligatoire: true, type: 'montant', entetes: ['somme', 'total', 'valeur'] },
    {
      cle: 'voucherDate',
      libelle: 'Date de la pièce',
      obligatoire: true,
      type: 'date',
      entetes: ['date', 'date de dépense', 'jour'],
      valeurParDefaut: contexte => contexte.dateParDefaut
    },
    {
      cle: 'reason',
      libelle: 'Motif',
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
  doublonImpossible:
    'Aucune liste des pièces de caisse n’est lisible depuis l’application : la file de validation ne montre que les pièces en attente, sans leur chantier ni leur date. Les doublons ne peuvent donc pas être signalés pour cette nature.'
};

// ---------------------------------------------------------------------------
// 2. Facture fournisseur
// ---------------------------------------------------------------------------

const FACTURE_FOURNISSEUR: DescripteurNature = {
  cle: 'facture-fournisseur',
  libelle: 'Facture fournisseur',
  description:
    'Une facture reçue, d’une seule ligne, imputée au chantier choisi. Créée à l’état brouillon : rien ne bouge au compte du fournisseur avant validation.',
  chantier: 'exige',
  referentiels: ['postes', 'fournisseurs'],
  champs: [
    {
      cle: 'supplierId',
      libelle: 'Fournisseur',
      obligatoire: true,
      type: 'reference',
      referentiel: 'fournisseurs',
      entetes: ['prestataire', 'vendeur', 'raison sociale', 'tiers']
    },
    {
      cle: 'reference',
      libelle: 'Référence de la facture',
      obligatoire: true,
      type: 'texte',
      entetes: ['référence', 'numéro', 'n° facture', 'facture', 'pièce']
    },
    {
      cle: 'invoiceDate',
      libelle: 'Date de la facture',
      obligatoire: true,
      type: 'date',
      entetes: ['date', 'date facture'],
      valeurParDefaut: contexte => contexte.dateParDefaut
    },
    {
      cle: 'costCategoryId',
      libelle: 'Poste de dépense',
      obligatoire: true,
      type: 'reference',
      referentiel: 'postes',
      entetes: ['poste', 'catégorie', 'rubrique', 'imputation']
    },
    {
      cle: 'label',
      libelle: 'Désignation',
      obligatoire: true,
      type: 'texte',
      entetes: ['libellé', 'objet', 'description', 'article', 'prestation']
    },
    {
      cle: 'amount',
      libelle: 'Montant',
      obligatoire: true,
      type: 'montant',
      entetes: ['total', 'somme', 'montant ttc']
    },
    {
      cle: 'quantity',
      libelle: 'Quantité',
      obligatoire: false,
      type: 'quantite',
      entetes: ['qté', 'qte', 'nombre', 'nb'],
      aide: 'Facultative. Beaucoup de dépenses n’en ont pas : une prestation, un forfait.'
    },
    {
      cle: 'unitPrice',
      libelle: 'Prix unitaire',
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
  libelle: 'Bon de commande',
  description: 'Une commande d’une seule ligne, passée sur le chantier choisi. Créée à l’état brouillon, non émise.',
  chantier: 'exige',
  referentiels: ['postes', 'fournisseurs'],
  champs: [
    {
      cle: 'supplierId',
      libelle: 'Fournisseur',
      obligatoire: true,
      type: 'reference',
      referentiel: 'fournisseurs',
      entetes: ['prestataire', 'vendeur', 'raison sociale', 'tiers']
    },
    {
      cle: 'reference',
      libelle: 'Référence du bon',
      obligatoire: true,
      type: 'texte',
      entetes: ['référence', 'numéro', 'n° bon', 'bon de commande', 'commande']
    },
    {
      cle: 'orderDate',
      libelle: 'Date de la commande',
      obligatoire: true,
      type: 'date',
      entetes: ['date', 'date de commande'],
      valeurParDefaut: contexte => contexte.dateParDefaut
    },
    {
      cle: 'costCategoryId',
      libelle: 'Poste de dépense',
      obligatoire: true,
      type: 'reference',
      referentiel: 'postes',
      entetes: ['poste', 'catégorie', 'rubrique', 'imputation']
    },
    {
      cle: 'label',
      libelle: 'Désignation',
      obligatoire: true,
      type: 'texte',
      entetes: ['libellé', 'objet', 'description', 'article']
    },
    { cle: 'amount', libelle: 'Montant', obligatoire: true, type: 'montant', entetes: ['total', 'somme'] },
    { cle: 'quantity', libelle: 'Quantité', obligatoire: false, type: 'quantite', entetes: ['qté', 'qte', 'nombre'] },
    {
      cle: 'unitPrice',
      libelle: 'Prix unitaire',
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
  libelle: 'Note de salaire',
  description:
    'Le salaire d’un mois pour un salarié. Le chantier est facultatif ; quand il est choisi, le poste de dépense devient exigé — le serveur refuse l’un sans l’autre.',
  chantier: 'facultatif',
  referentiels: ['postes', 'salaries'],
  champs: [
    {
      cle: 'employeeId',
      libelle: 'Salarié',
      obligatoire: true,
      type: 'reference',
      referentiel: 'salaries',
      entetes: ['employé', 'nom', 'nom complet', 'personnel', 'agent']
    },
    {
      cle: 'periode',
      libelle: 'Mois',
      obligatoire: true,
      type: 'periode',
      entetes: ['période', 'periode', 'mois', 'date'],
      valeurParDefaut: contexte => contexte.dateParDefaut,
      aide: 'Un mois, pas un jour : « 03/2026 » ou « 2026-03 ». Une date complète est ramenée à son mois.'
    },
    {
      cle: 'amount',
      libelle: 'Montant',
      obligatoire: true,
      type: 'montant',
      entetes: ['salaire', 'net', 'net à payer', 'total', 'somme']
    },
    {
      cle: 'costCategoryId',
      libelle: 'Poste de dépense',
      obligatoire: false,
      type: 'reference',
      referentiel: 'postes',
      entetes: ['poste', 'catégorie', 'imputation'],
      aide: 'Exigé seulement si un chantier est choisi à l’étape 1.'
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
  libelle: 'Situation de tâcheron',
  description:
    'Un avancement constaté sur un marché de tâcheron. Le chantier et le poste viennent du marché : il n’y a rien à choisir à l’étape 1.',
  chantier: 'sans',
  referentiels: ['contrats', 'tacherons'],
  champs: [
    {
      cle: 'contractId',
      libelle: 'Marché',
      obligatoire: true,
      type: 'reference',
      referentiel: 'contrats',
      entetes: ['contrat', 'référence', 'n° marché', 'tâcheron', 'tacheron'],
      aide: 'Reconnu par la référence du marché, ou par « Nom du tâcheron + référence ».'
    },
    {
      cle: 'statementDate',
      libelle: 'Date de la situation',
      obligatoire: true,
      type: 'date',
      entetes: ['date', 'date de situation'],
      valeurParDefaut: contexte => contexte.dateParDefaut
    },
    { cle: 'amount', libelle: 'Montant', obligatoire: true, type: 'montant', entetes: ['total', 'somme', 'valeur'] },
    {
      cle: 'description',
      libelle: 'Description',
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
  libelle: 'Réception de stock',
  description:
    'Une entrée d’article dans un lieu, adossée à une facture fournisseur validée. Une ligne du fichier = une réception d’un article.',
  chantier: 'sans',
  referentiels: ['articles', 'lieux', 'facturesFournisseur'],
  champs: [
    {
      cle: 'locationId',
      libelle: 'Lieu de stockage',
      obligatoire: true,
      type: 'reference',
      referentiel: 'lieux',
      entetes: ['lieu', 'magasin', 'dépôt', 'entrepôt', 'emplacement']
    },
    {
      cle: 'supplierInvoiceId',
      libelle: 'Facture fournisseur',
      obligatoire: true,
      type: 'reference',
      referentiel: 'facturesFournisseur',
      entetes: ['facture', 'référence facture', 'n° facture', 'pièce'],
      aide: 'Seules les factures validées peuvent porter une réception.'
    },
    {
      cle: 'receiptDate',
      libelle: 'Date de réception',
      obligatoire: true,
      type: 'date',
      entetes: ['date', 'date de livraison', 'livraison'],
      valeurParDefaut: contexte => contexte.dateParDefaut,
      aide: 'Une date plus ancienne que la limite fixée dans les réglages de contrôle du stock est refusée par le serveur.'
    },
    {
      cle: 'itemId',
      libelle: 'Article',
      obligatoire: true,
      type: 'reference',
      referentiel: 'articles',
      entetes: ['matériau', 'désignation', 'référence article', 'produit', 'libellé']
    },
    { cle: 'quantity', libelle: 'Quantité', obligatoire: true, type: 'quantite', entetes: ['qté', 'qte', 'nombre'] },
    {
      cle: 'unitCost',
      libelle: 'Prix unitaire',
      // Lot 040 (A8-R3) : facultatif. Laissé vide, le serveur reprend le prix
      // de la facture, sinon le coût moyen du lieu, sinon le dernier prix reçu.
      obligatoire: false,
      type: 'montant',
      entetes: ['pu', 'p.u.', 'coût unitaire', 'prix'],
      aide: 'Facultatif : laissé vide, le prix est repris de la facture ou, à défaut, du coût moyen du lieu. Le zéro est accepté : un don, une chute récupérée entrent à valeur nulle.'
    }
  ],
  enregistrer: async (valeurs, contexte) => {
    const prix = nombreOuNul(valeurs, 'unitCost');
    // Une ligne de classeur = une réception, avec son identifiant de requête
    // stable : une relance après une coupure ne la doublera pas.
    const lu = await avecIdentifiantStable('reception-de-stock', valeurs, contexte, clientRequestId =>
      recordStockReceipt(contexte.tenantId, {
        locationId: texte(valeurs, 'locationId'),
        supplierInvoiceId: texte(valeurs, 'supplierInvoiceId'),
        receiptDate: texte(valeurs, 'receiptDate'),
        lines: [
          {
            itemId: texte(valeurs, 'itemId'),
            quantity: nombre(valeurs, 'quantity'),
            ...(prix === null ? {} : { unitCost: prix })
          }
        ],
        clientRequestId
      })
    );
    return lu.data.slip?.number ?? undefined;
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
    const mouvements = await tousLesMouvements(contexte.tenantId, { type: 'RECEIPT' });
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
  libelle: 'Sortie de stock',
  description:
    'Un article sort d’un lieu vers le chantier choisi, et s’y impute. Aucun prix n’est saisi : la valeur vient du coût moyen du lieu. Si votre agence exige un preneur du carnet, enregistrez les sorties depuis l’écran Stock.',
  chantier: 'exige',
  referentiels: ['articles', 'lieux', 'postes'],
  champs: [
    {
      cle: 'locationId',
      libelle: 'Lieu de stockage',
      obligatoire: true,
      type: 'reference',
      referentiel: 'lieux',
      entetes: ['lieu', 'magasin', 'dépôt', 'entrepôt', 'emplacement']
    },
    {
      cle: 'itemId',
      libelle: 'Article',
      obligatoire: true,
      type: 'reference',
      referentiel: 'articles',
      entetes: ['matériau', 'désignation', 'référence article', 'produit', 'libellé']
    },
    { cle: 'quantity', libelle: 'Quantité', obligatoire: true, type: 'quantite', entetes: ['qté', 'qte', 'nombre'] },
    {
      cle: 'costCategoryId',
      libelle: 'Poste de dépense',
      obligatoire: true,
      type: 'reference',
      referentiel: 'postes',
      entetes: ['poste', 'catégorie', 'imputation'],
      aide: 'Exigé, jamais deviné depuis l’article : son poste par défaut n’est qu’une proposition.'
    },
    {
      cle: 'requestedBy',
      libelle: 'Demandeur',
      obligatoire: true,
      type: 'texte',
      entetes: ['demandé par', 'demande par', 'responsable', 'chef de chantier', 'bénéficiaire']
    },
    {
      cle: 'issueDate',
      libelle: 'Date de sortie',
      obligatoire: true,
      type: 'date',
      entetes: ['date', 'date de sortie'],
      valeurParDefaut: contexte => contexte.dateParDefaut,
      aide: 'Une date plus ancienne que la limite fixée dans les réglages de contrôle du stock est refusée par le serveur.'
    }
  ],
  enregistrer: async (valeurs, contexte) => {
    // Lot 040 (B3-R3) : la forme multi-lignes, à une ligne ; le demandeur reste
    // un nom saisi. Un classeur importé dans une agence qui exige un preneur
    // du carnet échoue ligne par ligne (400 STOCK_TAKER_REQUIRED).
    const lu = await avecIdentifiantStable('sortie-de-stock', valeurs, contexte, clientRequestId =>
      recordStockIssue(contexte.tenantId, {
        locationId: texte(valeurs, 'locationId'),
        siteId: chantierExige(contexte),
        issueDate: texte(valeurs, 'issueDate'),
        lines: [
          {
            itemId: texte(valeurs, 'itemId'),
            quantity: nombre(valeurs, 'quantity'),
            costCategoryId: texte(valeurs, 'costCategoryId')
          }
        ],
        requestedBy: texte(valeurs, 'requestedBy'),
        clientRequestId
      })
    );
    return lu.data.slip?.number ?? undefined;
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
    const mouvements = await tousLesMouvements(contexte.tenantId, {
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
  libelle: 'Constatation de loyer de terrain',
  description:
    'Le douzième mensuel d’un bail de terrain, constaté à la main pour un mois. Le montant vient du bail : il n’y a rien à saisir.',
  chantier: 'sans',
  referentiels: ['baux'],
  champs: [
    {
      cle: 'landLeaseId',
      libelle: 'Bail de terrain',
      obligatoire: true,
      type: 'reference',
      referentiel: 'baux',
      entetes: ['bail', 'terrain', 'bailleur', 'propriétaire', 'parcelle']
    },
    {
      cle: 'periode',
      libelle: 'Mois',
      obligatoire: true,
      type: 'periode',
      entetes: ['période', 'periode', 'mois', 'date'],
      valeurParDefaut: contexte => contexte.dateParDefaut,
      aide: 'Le montant n’est pas importé : le serveur constate le douzième du bail.'
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
