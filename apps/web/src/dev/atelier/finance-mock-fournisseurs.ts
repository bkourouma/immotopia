/**
 * Atelier — fausse API du volet « fournisseurs », lot 2.
 *
 * Ce fichier appartient en entier à l'agent qui construit ces écrans : jeux
 * d'essai ET réponses. Les gestionnaires sont séparés, un par volet, pour
 * qu'aucun agent n'ait à modifier le fichier d'un autre — la leçon du lot 1.
 *
 * Il renvoie `null` quand l'URL ne le concerne pas ; `mock-api.ts` passe alors
 * au gestionnaire suivant.
 *
 * **Limite assumée**, commune aux six gestionnaires de l'atelier (voir
 * `finance-mock-campagne.ts`) : `mock-api.ts` route par le seul CHEMIN de
 * l'URL, jamais par la méthode HTTP ni par le corps de la requête. Un
 * `POST .../suppliers` (création) retombe donc sur la même branche qu'un
 * `GET .../suppliers` (liste), et un règlement saisi dans l'atelier ne peut
 * pas refléter le montant réellement tapé par la gestionnaire — il rend une
 * pièce déjà connue du jeu d'essai. Ce que `createSupplier`,
 * `createSupplierInvoice` et `createSupplierPayment` font réellement, avec le
 * bon corps de requête, est vérifié par les tests unitaires des écrans
 * (`__tests__/finance/fournisseurs.test.tsx`), qui mockent
 * `finance-lot2-service` directement plutôt que de passer par cette fausse API.
 *
 * **Le jeu de données** couvre les points que le mandat demande de pouvoir
 * montrer sans avoir à les chercher : un fournisseur de matériaux dont le
 * rattachement à un chantier est obligatoire, un fournisseur de prestation où
 * il ne l'est pas, une facture encore en brouillon, une facture validée, une
 * facture annulée, un règlement partiel (une seule des deux factures d'un
 * fournisseur est couverte), et surtout un acompte qui rend un compte
 * débiteur — le fournisseur 4 n'a encore aucune facture et a déjà reçu de
 * l'argent, le fournisseur 7 a réglé plus que sa facture validée ne le
 * demandait.
 */

import type {
  Supplier,
  SupplierInvoice,
  SupplierPayment,
  SuppliersBalance,
  SuppliersBalanceLine
} from '../../types/finance-lot2-types';
import type { Scenario } from './mock-api';

const CURRENCY = 'XOF';

/**
 * Dix fournisseurs ouest-africains plausibles : matériaux, prestation et
 * mixte, dont un lié à un prestataire de maintenance déjà connu (coexistence,
 * décision Q12 du plan) et un inactif.
 */
export const SUPPLIERS: Supplier[] = [
  {
    id: 'frs-01',
    name: 'Matériaux du Fouta SARL',
    kind: 'MATERIALS',
    contactName: 'Ousmane Diallo',
    phone: '+224 622 10 20 30',
    email: 'contact@materiaux-fouta.gn',
    maintenanceVendorId: null,
    thirdPartyAccountId: 'compte-frs-01',
    isActive: true
  },
  {
    id: 'frs-02',
    name: 'BTP Sahel Construction',
    kind: 'MATERIALS',
    contactName: 'Fatoumata Keïta',
    phone: '+223 76 45 12 09',
    email: 'f.keita@btpsahel.ml',
    maintenanceVendorId: null,
    thirdPartyAccountId: 'compte-frs-02',
    isActive: true
  },
  {
    id: 'frs-03',
    name: 'Électricité Générale Bamako',
    kind: 'SERVICES',
    contactName: 'Boubacar Traoré',
    phone: '+223 65 88 40 12',
    email: 'boubacar.traore@elecbamako.ml',
    maintenanceVendorId: null,
    thirdPartyAccountId: 'compte-frs-03',
    isActive: true
  },
  {
    id: 'frs-04',
    name: 'Plomberie Moderne Abidjan',
    kind: 'SERVICES',
    contactName: 'Aya Kouassi',
    phone: '+225 07 09 55 21',
    email: 'aya.kouassi@plomberiemoderne.ci',
    maintenanceVendorId: null,
    thirdPartyAccountId: 'compte-frs-04',
    isActive: true
  },
  {
    id: 'frs-05',
    name: 'Quincaillerie Centrale Conakry',
    kind: 'MATERIALS',
    contactName: 'Mohamed Camara',
    phone: '+224 655 30 40 50',
    email: 'contact@quincaillerie-centrale.gn',
    maintenanceVendorId: null,
    thirdPartyAccountId: 'compte-frs-05',
    isActive: true
  },
  {
    // Coexiste avec un prestataire de maintenance déjà présent ailleurs dans
    // l'application, sans fusion des deux entités (décision Q12 du plan).
    id: 'frs-06',
    name: 'Groupe Sécurité & Gardiennage',
    kind: 'SERVICES',
    contactName: 'Kadiatou Barry',
    phone: '+224 628 77 11 02',
    email: 'k.barry@groupe-securite.gn',
    maintenanceVendorId: 'prestataire-maintenance-14',
    thirdPartyAccountId: 'compte-frs-06',
    isActive: true
  },
  {
    id: 'frs-07',
    name: 'Carrelages et Peintures Sory',
    kind: 'MIXED',
    contactName: 'Sory Condé',
    phone: '+224 664 90 12 34',
    email: 'sory.conde@carrelages-peintures.gn',
    maintenanceVendorId: null,
    thirdPartyAccountId: 'compte-frs-07',
    isActive: true
  },
  {
    id: 'frs-08',
    name: "Menuiserie Bois d'Ébène",
    kind: 'MATERIALS',
    contactName: 'Aminata Sow',
    phone: '+224 622 45 60 70',
    email: 'aminata.sow@bois-ebene.gn',
    maintenanceVendorId: null,
    thirdPartyAccountId: 'compte-frs-08',
    isActive: true
  },
  {
    id: 'frs-09',
    name: 'Climatisation Fraîcheur Plus',
    kind: 'MIXED',
    contactName: 'Ibrahima Bah',
    phone: '+224 611 22 33 44',
    email: 'contact@fraicheurplus.gn',
    maintenanceVendorId: null,
    thirdPartyAccountId: 'compte-frs-09',
    isActive: true
  },
  {
    // Inactif : la création d'une nouvelle facture pour lui doit être refusée
    // (récit 2, scénario 3 de la spécification) — un cas que la liste doit
    // pouvoir montrer sans avoir à le deviner.
    id: 'frs-10',
    name: 'Nettoyage Pro Services',
    kind: 'SERVICES',
    contactName: 'Mariame Cissé',
    phone: '+224 655 66 77 88',
    email: 'mariame.cisse@nettoyagepro.gn',
    maintenanceVendorId: null,
    thirdPartyAccountId: 'compte-frs-10',
    isActive: false
  }
];

const SUPPLIERS_PARTIEL = SUPPLIERS.slice(0, 3);

/** Factures reçues, par fournisseur. Statuts variés, dont une annulée. */
const INVOICES: Record<string, SupplierInvoice[]> = {
  'frs-01': [
    {
      id: 'fact-frs-01-01',
      supplierId: 'frs-01',
      supplierLabel: 'Matériaux du Fouta SARL',
      siteId: 'chantier-01',
      siteLabel: 'Chantier Résidence Palmeraie',
      invoiceDate: '2026-07-04',
      reference: 'FRS-FOUTA-2026-0101',
      amount: 2_400_000,
      currency: CURRENCY,
      status: 'VALIDATED',
      validatedAt: '2026-07-05T09:00:00.000Z'
    }
  ],
  'frs-02': [
    {
      id: 'fact-frs-02-01',
      supplierId: 'frs-02',
      supplierLabel: 'BTP Sahel Construction',
      siteId: 'chantier-02',
      siteLabel: 'Chantier Voirie Kaloum',
      invoiceDate: '2026-08-01',
      reference: 'FRS-BTP-2026-0201',
      amount: 3_800_000,
      currency: CURRENCY,
      status: 'VALIDATED',
      validatedAt: '2026-08-02T08:30:00.000Z'
    },
    {
      // Seule celle-ci reste totalement impayée : le règlement du fournisseur
      // ne couvre que la première, et partiellement — voir `PAYMENTS`.
      id: 'fact-frs-02-02',
      supplierId: 'frs-02',
      supplierLabel: 'BTP Sahel Construction',
      siteId: 'chantier-02',
      siteLabel: 'Chantier Voirie Kaloum',
      invoiceDate: '2026-08-20',
      reference: 'FRS-BTP-2026-0202',
      amount: 1_200_000,
      currency: CURRENCY,
      status: 'VALIDATED',
      validatedAt: '2026-08-21T08:30:00.000Z'
    }
  ],
  'frs-03': [
    {
      id: 'fact-frs-03-01',
      supplierId: 'frs-03',
      supplierLabel: 'Électricité Générale Bamako',
      siteId: null,
      siteLabel: null,
      invoiceDate: '2026-06-10',
      reference: 'FRS-ELEC-2026-0301',
      amount: 850_000,
      currency: CURRENCY,
      status: 'VALIDATED',
      validatedAt: '2026-06-11T10:00:00.000Z'
    },
    {
      // Toujours en brouillon : ni le compte du fournisseur ni un chantier ne
      // bougent tant qu'elle n'est pas validée.
      id: 'fact-frs-03-02',
      supplierId: 'frs-03',
      supplierLabel: 'Électricité Générale Bamako',
      siteId: null,
      siteLabel: null,
      invoiceDate: '2026-09-02',
      reference: 'FRS-ELEC-2026-0302',
      amount: 420_000,
      currency: CURRENCY,
      status: 'DRAFT',
      validatedAt: null
    }
  ],
  'frs-04': [],
  'frs-05': [
    {
      id: 'fact-frs-05-01',
      supplierId: 'frs-05',
      supplierLabel: 'Quincaillerie Centrale Conakry',
      siteId: 'chantier-01',
      siteLabel: 'Chantier Résidence Palmeraie',
      invoiceDate: '2026-05-14',
      reference: 'FRS-QUINC-2026-0501',
      amount: 1_750_000,
      currency: CURRENCY,
      status: 'VALIDATED',
      validatedAt: '2026-05-15T08:00:00.000Z'
    }
  ],
  'frs-06': [
    {
      id: 'fact-frs-06-01',
      supplierId: 'frs-06',
      supplierLabel: 'Groupe Sécurité & Gardiennage',
      siteId: null,
      siteLabel: null,
      invoiceDate: '2026-07-01',
      reference: 'FRS-SECU-2026-0601',
      amount: 620_000,
      currency: CURRENCY,
      status: 'VALIDATED',
      validatedAt: '2026-07-02T08:00:00.000Z'
    }
  ],
  'frs-07': [
    {
      id: 'fact-frs-07-01',
      supplierId: 'frs-07',
      supplierLabel: 'Carrelages et Peintures Sory',
      siteId: 'chantier-01',
      siteLabel: 'Chantier Résidence Palmeraie',
      invoiceDate: '2026-08-25',
      reference: 'FRS-SORY-2026-0701',
      amount: 1_500_000,
      currency: CURRENCY,
      status: 'VALIDATED',
      validatedAt: '2026-08-26T08:00:00.000Z'
    }
  ],
  'frs-08': [
    {
      id: 'fact-frs-08-01',
      supplierId: 'frs-08',
      supplierLabel: "Menuiserie Bois d'Ébène",
      siteId: 'chantier-03',
      siteLabel: 'Chantier Immeuble Teranga',
      invoiceDate: '2026-07-18',
      reference: 'FRS-BOIS-2026-0801',
      amount: 980_000,
      currency: CURRENCY,
      status: 'VALIDATED',
      validatedAt: '2026-07-19T08:00:00.000Z'
    },
    {
      // Annulée : le cas que l'écran doit savoir présenter, motif compris.
      id: 'fact-frs-08-02',
      supplierId: 'frs-08',
      supplierLabel: "Menuiserie Bois d'Ébène",
      siteId: 'chantier-03',
      siteLabel: 'Chantier Immeuble Teranga',
      invoiceDate: '2026-04-02',
      reference: 'FRS-BOIS-2026-0802',
      amount: 310_000,
      currency: CURRENCY,
      status: 'VOIDED',
      validatedAt: '2026-04-03T08:00:00.000Z'
    }
  ],
  'frs-09': [
    {
      id: 'fact-frs-09-01',
      supplierId: 'frs-09',
      supplierLabel: 'Climatisation Fraîcheur Plus',
      siteId: 'chantier-03',
      siteLabel: 'Chantier Immeuble Teranga',
      invoiceDate: '2026-06-05',
      reference: 'FRS-CLIM-2026-0901',
      amount: 3_200_000,
      currency: CURRENCY,
      status: 'VALIDATED',
      validatedAt: '2026-06-06T08:00:00.000Z'
    }
  ],
  'frs-10': [
    {
      id: 'fact-frs-10-01',
      supplierId: 'frs-10',
      supplierLabel: 'Nettoyage Pro Services',
      siteId: null,
      siteLabel: null,
      invoiceDate: '2026-03-01',
      reference: 'FRS-NETT-2026-1001',
      amount: 450_000,
      currency: CURRENCY,
      status: 'VALIDATED',
      validatedAt: '2026-03-02T08:00:00.000Z'
    }
  ]
};

/**
 * Règlements, par fournisseur. Pas d'endpoint de liste dans le contrat gelé
 * (`finance-lot2-service.ts` n'expose aucun `listSupplierPayments`) : ces
 * données ne servent qu'à simuler la création et la validation d'un
 * règlement, jamais un historique consulté par une liste.
 */
const PAYMENTS: Record<string, SupplierPayment[]> = {
  'frs-02': [
    {
      // Règlement PARTIEL d'une seule facture : 2 000 000 sur 3 800 000.
      id: 'regl-frs-02-01',
      supplierId: 'frs-02',
      supplierLabel: 'BTP Sahel Construction',
      paymentDate: '2026-08-15',
      amount: 2_000_000,
      currency: CURRENCY,
      status: 'VALIDATED',
      allocations: [{ invoiceId: 'fact-frs-02-01', invoiceReference: 'FRS-BTP-2026-0201', amount: 2_000_000 }]
    }
  ],
  'frs-04': [
    {
      // Acompte SANS facture en face : le compte de ce fournisseur devient
      // débiteur pour la totalité du montant.
      id: 'regl-frs-04-01',
      supplierId: 'frs-04',
      supplierLabel: 'Plomberie Moderne Abidjan',
      paymentDate: '2026-07-01',
      amount: 300_000,
      currency: CURRENCY,
      status: 'VALIDATED',
      allocations: []
    }
  ],
  'frs-07': [
    {
      // Couvre la facture entière (1 500 000) et laisse 500 000 en acompte :
      // le compte devient débiteur du surplus.
      id: 'regl-frs-07-01',
      supplierId: 'frs-07',
      supplierLabel: 'Carrelages et Peintures Sory',
      paymentDate: '2026-09-01',
      amount: 2_000_000,
      currency: CURRENCY,
      status: 'VALIDATED',
      allocations: [{ invoiceId: 'fact-frs-07-01', invoiceReference: 'FRS-SORY-2026-0701', amount: 1_500_000 }]
    }
  ]
};

function ligneBalance(fournisseur: Supplier, totalBilled: number, totalSettled: number): SuppliersBalanceLine {
  return {
    accountId: fournisseur.thirdPartyAccountId,
    supplierId: fournisseur.id,
    label: fournisseur.name,
    totalBilled,
    totalSettled,
    balance: totalBilled - totalSettled,
    currency: CURRENCY
  };
}

/**
 * Totaux de balance, cohérents avec `INVOICES` / `PAYMENTS` ci-dessus mais
 * fixés à la main plutôt que recalculés — même choix que
 * `finance-mock-balances.ts` pour son jumeau clients.
 */
const LIGNES_BALANCE: SuppliersBalanceLine[] = [
  ligneBalance(SUPPLIERS[0], 2_400_000, 2_400_000),
  ligneBalance(SUPPLIERS[1], 5_000_000, 2_000_000),
  ligneBalance(SUPPLIERS[2], 850_000, 0),
  // Acompte sans facture : solde négatif, l'entreprise a payé d'avance.
  ligneBalance(SUPPLIERS[3], 0, 300_000),
  ligneBalance(SUPPLIERS[4], 1_750_000, 1_750_000),
  ligneBalance(SUPPLIERS[5], 620_000, 620_000),
  // Facture réglée en totalité, plus un acompte : solde négatif également.
  ligneBalance(SUPPLIERS[6], 1_500_000, 2_000_000),
  ligneBalance(SUPPLIERS[7], 980_000, 500_000),
  ligneBalance(SUPPLIERS[8], 3_200_000, 3_200_000),
  ligneBalance(SUPPLIERS[9], 450_000, 450_000)
];

function construireBalance(lignes: SuppliersBalanceLine[]): SuppliersBalance {
  return { lines: lignes, totalBalance: lignes.reduce((somme, l) => somme + l.balance, 0), currency: CURRENCY };
}

const BALANCE_NOMINALE = construireBalance(LIGNES_BALANCE);
const BALANCE_PARTIELLE = construireBalance(LIGNES_BALANCE.slice(0, 3));
const BALANCE_VIDE = construireBalance([]);

function toutesLesFactures(): SupplierInvoice[] {
  return Object.values(INVOICES).flat();
}

function tousLesReglements(): SupplierPayment[] {
  return Object.values(PAYMENTS).flat();
}

export function repondreFournisseurs(chemin: string, scenario: Scenario): unknown | null {
  // Balance fournisseurs.
  if (/\/tenants\/[^/]+\/finance\/suppliers\/balance$/.test(chemin)) {
    const data = scenario === 'vide' ? BALANCE_VIDE : scenario === 'partiel' ? BALANCE_PARTIELLE : BALANCE_NOMINALE;
    return { success: true, data };
  }

  // Règlement d'un fournisseur — POST uniquement dans le contrat, mais servi
  // ici avant la liste des factures pour ne pas être capté par erreur.
  const paiement = /\/tenants\/[^/]+\/finance\/suppliers\/([^/]+)\/payments$/.exec(chemin);
  if (paiement) {
    const [existant] = PAYMENTS[paiement[1]] ?? [];
    const donnee: SupplierPayment = existant ?? {
      id: `regl-${paiement[1]}-nouveau`,
      supplierId: paiement[1],
      supplierLabel: SUPPLIERS.find(f => f.id === paiement[1])?.name ?? SUPPLIERS[0].name,
      paymentDate: new Date().toISOString().slice(0, 10),
      amount: 0,
      currency: CURRENCY,
      status: 'DRAFT',
      allocations: []
    };
    return { success: true, data: donnee };
  }

  // Factures d'un fournisseur — liste ET création partagent le même chemin
  // (voir la limite assumée en tête de fichier).
  const factures = /\/tenants\/[^/]+\/finance\/suppliers\/([^/]+)\/invoices$/.exec(chemin);
  if (factures) {
    const liste = INVOICES[factures[1]] ?? INVOICES['frs-01'];
    return { success: true, data: scenario === 'vide' ? [] : liste };
  }

  // Liste ET création des fournisseurs eux-mêmes.
  if (/\/tenants\/[^/]+\/finance\/suppliers$/.test(chemin)) {
    const data = scenario === 'vide' ? [] : scenario === 'partiel' ? SUPPLIERS_PARTIEL : SUPPLIERS;
    return { success: true, data };
  }

  // Validation d'une facture : irréversible, l'écran doit le dire avant.
  const validationFacture = /\/tenants\/[^/]+\/finance\/supplier-invoices\/([^/]+)\/validate$/.exec(chemin);
  if (validationFacture) {
    const facture = toutesLesFactures().find(f => f.id === validationFacture[1]) ?? toutesLesFactures()[0];
    return {
      success: true,
      data: { ...facture, status: 'VALIDATED', validatedAt: new Date().toISOString() }
    };
  }

  // Annulation d'une facture validée : exige un motif, saisi côté écran — la
  // fausse API ne le voit pas (elle ne lit pas le corps de la requête) mais
  // rend malgré tout la pièce annulée pour que la scène se voie.
  const annulationFacture = /\/tenants\/[^/]+\/finance\/supplier-invoices\/([^/]+)\/void$/.exec(chemin);
  if (annulationFacture) {
    const facture = toutesLesFactures().find(f => f.id === annulationFacture[1]) ?? toutesLesFactures()[0];
    return { success: true, data: { ...facture, status: 'VOIDED' } };
  }

  // Validation d'un règlement.
  const validationReglement = /\/tenants\/[^/]+\/finance\/supplier-payments\/([^/]+)\/validate$/.exec(chemin);
  if (validationReglement) {
    const reglement = tousLesReglements().find(p => p.id === validationReglement[1]) ?? tousLesReglements()[0];
    return { success: true, data: { ...reglement, status: 'VALIDATED' } };
  }

  return null;
}
