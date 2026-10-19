import type { PrismaTransactionClient } from '../../utils/database';
import { SYNDIC_ACCOUNT_SEEDS } from './provider-invoice-accounting';

/**
 * Plan comptable modele SYSCOHADA d'une copropriete.
 *
 * Le plan d'une copropriete est vide a la creation : ce modele se charge a la
 * demande (`ensureSyndicChartTemplateTx`). Il ne cree que les comptes
 * MANQUANTS et ne modifie jamais un compte existant (meme nom different).
 *
 * Les comptes que le code applicatif utilise deja (401, 521, 624, 6241, 450,
 * 571, 5525 : `SYNDIC_ACCOUNT_SEEDS`) sont repris tels quels, pour que le plan
 * modele et les comptes poses automatiquement ne divergent jamais. Les numeros
 * sont a valider par un comptable.
 *
 * L'ordre place toujours un parent avant ses enfants.
 */

export type ChartAccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export interface ChartTemplateAccount {
  accountNumber: string;
  accountName: string;
  accountClass: number;
  accountType: ChartAccountType;
  parent?: string;
}

const seedByNumber = new Map(SYNDIC_ACCOUNT_SEEDS.map(seed => [seed.accountNumber as string, seed]));

/** Compte repris de `SYNDIC_ACCOUNT_SEEDS` (numero, libelle, classe, type) ; le parent du modele s'y ajoute. */
function fromSeed(accountNumber: string, parent?: string): ChartTemplateAccount {
  const seed = seedByNumber.get(accountNumber);
  if (!seed) throw new Error(`Compte ${accountNumber} absent de SYNDIC_ACCOUNT_SEEDS`);
  return {
    accountNumber: seed.accountNumber,
    accountName: seed.accountName,
    accountClass: seed.accountClass,
    accountType: seed.accountType,
    parent: seed.parent ?? parent
  };
}

function account(
  accountNumber: string,
  accountName: string,
  accountType: ChartAccountType,
  parent?: string
): ChartTemplateAccount {
  return { accountNumber, accountName, accountClass: Number(accountNumber[0]), accountType, parent };
}

export const SYNDIC_CHART_TEMPLATE: ChartTemplateAccount[] = [
  // Classe 1 : capitaux
  account('10', 'Fonds de la copropriété', 'EQUITY'),
  account('101', 'Fonds de roulement', 'EQUITY', '10'),
  account('105', 'Fonds de travaux', 'EQUITY', '10'),
  account('11', 'Réserves', 'EQUITY'),
  account('118', 'Autres réserves', 'EQUITY', '11'),
  account('12', 'Report à nouveau', 'EQUITY'),
  account('121', 'Report à nouveau créditeur', 'EQUITY', '12'),
  account('129', 'Report à nouveau débiteur', 'EQUITY', '12'),
  account('13', "Résultat net de l'exercice", 'EQUITY'),
  account('131', 'Résultat excédentaire', 'EQUITY', '13'),
  account('139', 'Résultat déficitaire', 'EQUITY', '13'),
  account('16', 'Emprunts et dettes assimilées', 'LIABILITY'),
  account('162', 'Emprunts auprès des établissements de crédit', 'LIABILITY', '16'),

  // Classe 4 : tiers
  account('40', 'Fournisseurs et comptes rattachés', 'LIABILITY'),
  fromSeed('401', '40'),
  account('408', 'Fournisseurs, factures non parvenues', 'LIABILITY', '40'),
  account('42', 'Personnel', 'LIABILITY'),
  account('421', 'Personnel, rémunérations dues', 'LIABILITY', '42'),
  account('43', 'Organismes sociaux', 'LIABILITY'),
  account('431', 'Sécurité sociale (CNPS)', 'LIABILITY', '43'),
  account('44', 'État et collectivités publiques', 'LIABILITY'),
  account('441', 'État, impôt sur les bénéfices', 'LIABILITY', '44'),
  account('442', 'État, autres impôts et taxes', 'LIABILITY', '44'),
  account('443', 'État, TVA facturée', 'LIABILITY', '44'),
  account('445', 'État, TVA récupérable', 'ASSET', '44'),
  account('447', 'État, impôts retenus à la source', 'LIABILITY', '44'),
  account('45', 'Copropriétaires et associés', 'ASSET'),
  fromSeed('450', '45'),
  account('451', 'Copropriétaires, charges à recouvrer', 'ASSET', '45'),
  account('458', 'Copropriétaires, avances et provisions', 'LIABILITY', '45'),
  account('46', 'Créditeurs et débiteurs divers', 'LIABILITY'),
  account('461', 'Débiteurs divers', 'ASSET', '46'),
  account('462', 'Créditeurs divers', 'LIABILITY', '46'),
  account('47', 'Comptes transitoires et de régularisation', 'ASSET'),
  account('471', "Comptes d'attente", 'ASSET', '47'),
  account('476', "Charges constatées d'avance", 'ASSET', '47'),
  account('477', "Produits constatés d'avance", 'LIABILITY', '47'),

  // Classe 5 : trésorerie
  account('52', 'Banques', 'ASSET'),
  fromSeed('521', '52'),
  account('55', 'Monnaie électronique', 'ASSET'),
  account('552', 'Monnaie électronique — téléphone portable', 'ASSET', '55'),
  fromSeed('5525', '552'),
  account('57', 'Caisse', 'ASSET'),
  fromSeed('571', '57'),

  // Classe 6 : charges
  account('60', 'Achats et variations de stocks', 'EXPENSE'),
  account('601', "Achats de fournitures et produits d'entretien", 'EXPENSE', '60'),
  account('605', 'Eau', 'EXPENSE', '60'),
  account('6051', 'Électricité des parties communes', 'EXPENSE', '605'),
  account('61', 'Transports', 'EXPENSE'),
  account('62', 'Services extérieurs', 'EXPENSE'),
  account('621', 'Gardiennage et sécurité', 'EXPENSE', '62'),
  account('622', 'Nettoyage et hygiène', 'EXPENSE', '62'),
  account('623', 'Espaces verts et jardinage', 'EXPENSE', '62'),
  fromSeed('624', '62'),
  fromSeed('6241'),
  account('625', 'Maintenance des ascenseurs', 'EXPENSE', '62'),
  account('626', 'Assurances', 'EXPENSE', '62'),
  account('627', 'Honoraires du syndic', 'EXPENSE', '62'),
  account('628', 'Autres honoraires (avocat, expert, géomètre)', 'EXPENSE', '62'),
  account('63', 'Autres services extérieurs', 'EXPENSE'),
  account('631', 'Frais bancaires', 'EXPENSE', '63'),
  account('632', 'Frais postaux et de télécommunications', 'EXPENSE', '63'),
  account('64', 'Impôts et taxes', 'EXPENSE'),
  account('641', 'Impôts et taxes sur les immeubles', 'EXPENSE', '64'),
  account('65', 'Autres charges', 'EXPENSE'),
  account('658', 'Charges diverses', 'EXPENSE', '65'),
  account('66', 'Charges de personnel', 'EXPENSE'),
  account('661', 'Rémunérations du personnel de la copropriété', 'EXPENSE', '66'),
  account('664', 'Charges sociales', 'EXPENSE', '66'),
  account('67', 'Frais financiers', 'EXPENSE'),
  account('671', 'Intérêts des emprunts', 'EXPENSE', '67'),
  account('68', 'Dotations aux provisions et amortissements', 'EXPENSE'),
  account('681', 'Dotations aux provisions pour travaux', 'EXPENSE', '68'),

  // Classe 7 : produits
  account('70', 'Appels de charges', 'INCOME'),
  account('701', 'Appels de charges courantes', 'INCOME', '70'),
  account('702', 'Appels de fonds de travaux', 'INCOME', '70'),
  account('703', 'Appels de charges spéciales', 'INCOME', '70'),
  account('75', 'Autres produits', 'INCOME'),
  account('751', 'Pénalités et intérêts de retard', 'INCOME', '75'),
  account('758', 'Produits divers (location de parties communes)', 'INCOME', '75'),
  account('77', 'Produits financiers', 'INCOME'),
  account('771', 'Intérêts des comptes bancaires', 'INCOME', '77')
];

export interface SyndicChartTemplateResult {
  created: number;
  skipped: number;
  total: number;
}

/**
 * Charge le plan modele dans la comptabilite de LA copropriete. Idempotent :
 * lit les numeros existants (tenantId ET syndicateId), puis ne cree que les
 * manquants, parents d'abord. Un compte existant n'est jamais modifie.
 */
export async function ensureSyndicChartTemplateTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  syndicateId: string
): Promise<SyndicChartTemplateResult> {
  const existing = await tx.chartOfAccount.findMany({
    where: { tenantId, syndicateId, scope: 'SYNDICATE' },
    select: { id: true, accountNumber: true }
  });
  const index = new Map<string, string>(existing.map(row => [row.accountNumber, row.id]));

  let created = 0;
  let skipped = 0;
  for (const item of SYNDIC_CHART_TEMPLATE) {
    if (index.has(item.accountNumber)) {
      skipped += 1;
      continue;
    }
    const row = await tx.chartOfAccount.create({
      data: {
        tenantId,
        syndicateId,
        scope: 'SYNDICATE',
        accountNumber: item.accountNumber,
        accountName: item.accountName,
        accountClass: item.accountClass,
        accountType: item.accountType,
        parentAccountId: item.parent ? (index.get(item.parent) ?? null) : null
      },
      select: { id: true }
    });
    index.set(item.accountNumber, row.id);
    created += 1;
  }

  return { created, skipped, total: SYNDIC_CHART_TEMPLATE.length };
}
