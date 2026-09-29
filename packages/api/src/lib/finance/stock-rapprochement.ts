/**
 * La bascule d'un chantier au stock, et le rapprochement acheté / consommé /
 * restant — lot 5, quatrième et dernier sous-lot
 * (`types-lot5-rapprochement.ts`, contrat gelé, PRD E9, besoin S7,
 * principe P-7).
 *
 * Gabarits suivis : `site-dashboard.ts` (lot 3) pour une lecture agrégée en un
 * nombre de requêtes CONSTANT, `salaries.ts` et `site-closing.ts` (lot 4) pour
 * les conventions de service — un client Prisma par lecture, `tx` par
 * écriture, les erreurs de `lib/errors.ts`, aucun libellé comptable rendu.
 *
 * ---------------------------------------------------------------------------
 * La bascule est irréversible, et ce fichier n'offre AUCUN retour
 * ---------------------------------------------------------------------------
 *
 * Il n'y a ici ni `disableStockOnSite`, ni variante d'administrateur, ni
 * raccourci « pour les tests ». Revenir en arrière obligerait à rejouer
 * l'imputation de toutes les factures postérieures à la bascule et à défaire
 * celle de toutes les sorties : le coût du chantier changerait sous les pieds
 * de celui qui le regarde, et rien ne dirait pourquoi (contrat, en-tête).
 *
 * Une agence qui bascule par erreur n'a qu'un recours : ne plus se servir du
 * chantier. C'est sévère, et c'est dit d'avance.
 *
 * ---------------------------------------------------------------------------
 * `isSiteStockEnabledTx` prend la DATE DE LA PIÈCE, jamais l'instant présent
 * ---------------------------------------------------------------------------
 *
 * Une facture du mois dernier, saisie aujourd'hui sur un chantier basculé
 * hier, appartient à l'avant : elle doit s'imputer comme avant. C'est la
 * fonction que `validateSupplierInvoiceTx` appellera À L'INTÉGRATION — geste
 * transverse, dans un fichier qui n'appartient pas à ce sous-lot, exactement
 * comme `assertSiteOpenTx` au lot 4. **Ce fichier ne l'appelle nulle part
 * lui-même, et tant que le branchement manque la bascule ne change rien et le
 * coût est compté deux fois.** C'est écrit ici pour que personne ne suppose le
 * contraire.
 *
 * ---------------------------------------------------------------------------
 * L'écart du besoin S7 n'est pas celui qu'on croit
 * ---------------------------------------------------------------------------
 *
 * **Entré − sorti − restant vaut zéro par construction** : c'est une identité
 * comptable, pas une mesure, et un rapprochement bâti là-dessus afficherait
 * toujours zéro en rassurant à tort. L'écart qui existe vraiment est ailleurs :
 *
 * ```
 * invoicedAmount       ce que les fournisseurs ont facturé au chantier
 *                      DEPUIS la bascule
 * receivedValue        ce qui est entré au lieu du chantier DEPUIS UNE FACTURE
 * ------------------------------------------------------------------------
 * unreconciledAmount   la différence, et elle est réelle
 * ```
 *
 * **Le système ne l'interprète jamais.** Cent sacs facturés, quatre-vingt-dix
 * arrivés : c'est un vol, une erreur, ou du transport que la facture portait —
 * et une soustraction ne sait pas les distinguer. Aucun message, aucun champ,
 * aucun libellé de ce fichier ne qualifie l'écart de « perte », de « vol » ni
 * d'« anomalie ». Il est montré, pas jugé.
 *
 * ### Une livraison interne n'est pas un achat
 *
 * Les transferts reçus sont comptés **à part**, dans `transferredInValue`, et
 * n'entrent PAS dans l'écart. Les mêler au reçu — ce que faisait le premier
 * jet de ce fichier — se trompait dans le cas le plus courant : un chantier
 * alimenté depuis un magasin central n'a aucune facture à son nom,
 * `invoicedAmount` vaut zéro, et l'écart affichait l'opposé de tout ce qu'on
 * lui avait livré. Cette matière a été payée ailleurs, ou jamais.
 *
 * Elle reste exposée, parce qu'elle explique une bonne part du restant — et
 * qu'un restant sans explication se lit comme une anomalie.
 *
 * ---------------------------------------------------------------------------
 * Une asymétrie VOULUE entre le consommé et les autres quantités
 * ---------------------------------------------------------------------------
 *
 * - `issuedQuantity` compte les sorties imputées à CE chantier, **depuis
 *   n'importe quel lieu** : on sort couramment d'un magasin central vers un
 *   chantier, et ne compter que les sorties depuis le lieu du chantier
 *   effacerait l'essentiel de ce qu'il a consommé.
 * - `receivedQuantity`, `transferredInQuantity` et `remainingQuantity`
 *   portent sur **le lieu du chantier** : elles disent ce qui est arrivé sur
 *   place et ce qui y reste, ce qui n'a de sens que pour un lieu.
 *
 * Elles ne se soustraient donc pas entre elles, et le contrat ne leur demande
 * pas de le faire.
 *
 * ---------------------------------------------------------------------------
 * Tout est calculé, rien n'est une colonne
 * ---------------------------------------------------------------------------
 *
 * Aucun chiffre rendu par `getSiteStockReconciliation` n'est stocké. Le nombre
 * de requêtes émises ne dépend QUE du nombre de sources distinctes (chantier,
 * lieu, factures, entrées, sorties, soldes, référentiel) — jamais du nombre
 * d'articles : pas une seule boucle qui relise une table par identifiant,
 * même discipline que `site-dashboard.ts`.
 */

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { conflict, notFound } from '../errors';
import { roundMoneyXof, roundQuantity } from './money';
import { assertSiteOpenTx } from './site-closing';
import { toAmountOrZero } from './types';
import type {
  EnableStockOnSiteTx,
  GetSiteStockReconciliation,
  GetSiteStockStatus,
  IsSiteStockEnabledTx,
  SiteStockReconciliationLine,
  SiteStockStatusRecord
} from './types-lot5-rapprochement';

/** Devise unique du module (décision D9 du plan, actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

// ---------------------------------------------------------------------------
// Lectures partagées
// ---------------------------------------------------------------------------

interface SiteShape {
  id: string;
  name: string;
  stockEnabledAt: Date | null;
}

const SITE_SELECT = { id: true, name: true, stockEnabledAt: true } as const;

async function loadSiteOrThrow(client: PrismaTransactionClient, tenantId: string, siteId: string): Promise<SiteShape> {
  const site = await client.constructionSite.findFirst({ where: { id: siteId, tenantId }, select: SITE_SELECT });
  if (!site) {
    throw notFound('Chantier introuvable');
  }
  return site as unknown as SiteShape;
}

/**
 * Le lieu de stockage du chantier, lu **directement par le client Prisma**.
 *
 * `stock-referentiel.ts` et `stock-inventaire.ts` portent chacun leur propre
 * lecture des lieux ; en importer quoi que ce soit ferait dépendre trois
 * territoires les uns des autres. Même parti pris que `stock-mouvements.ts`,
 * qui lit `stockLocation` par Prisma pour la même raison.
 *
 * `tenantId` entre TOUJOURS dans le filtre, jamais `findUnique` sur le seul
 * `siteId` : une agence lirait le lieu d'une autre si un identifiant fuitait.
 */
async function findSiteLocation(
  client: PrismaTransactionClient,
  tenantId: string,
  siteId: string
): Promise<{ id: string; label: string } | null> {
  const location = await client.stockLocation.findFirst({
    where: { tenantId, siteId },
    select: { id: true, label: true }
  });
  return location ? { id: location.id as string, label: location.label as string } : null;
}

function toStatusRecord(site: SiteShape, location: { id: string; label: string } | null): SiteStockStatusRecord {
  return {
    siteId: site.id,
    siteLabel: site.name,
    stockEnabledAt: site.stockEnabledAt ?? null,
    stockLocationId: location?.id ?? null,
    stockLocationLabel: location?.label ?? null
  };
}

// ---------------------------------------------------------------------------
// A. La bascule — explicite, par chantier, IRRÉVERSIBLE
// ---------------------------------------------------------------------------

/**
 * Le libellé du lieu de stockage d'un chantier, unique dans l'agence.
 *
 * `@@unique([tenantId, label])` sur `StockLocation` : deux chantiers nommés
 * pareil — cela arrive, « Villa Kipé » puis « Villa Kipé » — se disputeraient
 * le même libellé, et la seconde bascule échouerait sur une contrainte brute
 * que personne ne sait lire côté écran.
 *
 * **Lecture avant écriture.** En PostgreSQL une commande en échec condamne
 * toute la transaction : « tenter puis rattraper le P2002 » ne marche pas ici
 * (même raisonnement qu'au nom du lot, `site-closing.ts`). On cherche donc un
 * libellé libre avant d'écrire, et l'identifiant du chantier sert de dernier
 * recours — laid, mais unique par construction, et jamais atteint en pratique.
 */
async function resolveFreeLocationLabel(
  tx: PrismaTransactionClient,
  tenantId: string,
  site: SiteShape
): Promise<string> {
  // « Chantier Émeraude » reste tel quel : préfixer un nom qui commence déjà par
  // « Chantier » donnait « Chantier Chantier Émeraude » (BUG-2026-09-29-029).
  const name = site.name.trim();
  const base = /^chantier(\s|$)/i.test(name) ? name : `Chantier ${name}`.trim();

  for (const candidate of [base, ...[2, 3, 4, 5, 6, 7, 8, 9].map(n => `${base} (${n})`)]) {
    const taken = await tx.stockLocation.findFirst({ where: { tenantId, label: candidate }, select: { id: true } });
    if (!taken) {
      return candidate;
    }
  }

  return `${base} (${site.id})`;
}

/**
 * Voir `EnableStockOnSiteTx` dans `./types-lot5-rapprochement.ts`.
 *
 * Date `stockEnabledAt` et **crée le lieu de stockage du chantier s'il n'en a
 * pas** : sans lieu, une réception pour ce chantier n'aurait nulle part où
 * atterrir, et l'utilisateur découvrirait le manque au pire moment. Si le lieu
 * existe déjà — créé à la main par le référentiel —, elle le réutilise : un
 * second lieu partagerait le stock du chantier en deux soldes dont aucun ne
 * dirait la vérité (`@unique` sur `StockLocation.siteId`).
 *
 * **Ne touche à aucune facture passée.** La bascule vaut pour la suite ; les
 * factures déjà imputées le restent — les défaire ferait baisser le coût d'un
 * chantier sans qu'aucune dépense n'ait été annulée.
 */
export const enableStockOnSiteTx: EnableStockOnSiteTx = async (tx, tenantId, siteId, params) => {
  const site = await loadSiteOrThrow(tx, tenantId, siteId);

  // Refus d'une seconde bascule : redater changerait, RÉTROACTIVEMENT, quelles
  // factures s'imputent et quelles factures entrent en stock (contrat).
  if (site.stockEnabledAt) {
    throw conflict(`Le chantier « ${site.name} » est déjà passé au stock : la bascule ne se rejoue pas`);
  }

  // Lot 4, sous-lot 6 : basculer ce qu'on a déclaré fini n'a pas de sens, et un
  // chantier clos n'accepte de toute façon plus d'imputation. La garde est
  // appelée AVANT toute écriture, et c'est `site-closing.ts` qui en porte la
  // seule définition — ce fichier n'en écrit pas une deuxième.
  await assertSiteOpenTx(tx, tenantId, siteId);

  // Mise à jour conditionnelle sur `stockEnabledAt: null`, même discipline
  // qu'à `closeSiteTx` : si une autre transaction a basculé ce chantier entre
  // notre lecture et cet instant, `count` vaut 0 et on abandonne plutôt que
  // d'écraser SA date par la nôtre.
  const updated = await tx.constructionSite.updateMany({
    where: { id: siteId, tenantId, stockEnabledAt: null },
    data: { stockEnabledAt: params.enabledAt }
  });
  if (updated.count !== 1) {
    throw conflict("Ce chantier vient d'être passé au stock par ailleurs");
  }

  let location = await findSiteLocation(tx, tenantId, siteId);
  if (!location) {
    const label = await resolveFreeLocationLabel(tx, tenantId, site);
    const created = await tx.stockLocation.create({
      data: { tenantId, kind: 'SITE' as any, label, siteId },
      select: { id: true, label: true }
    });
    location = { id: created.id as string, label: created.label as string };
  }

  return toStatusRecord({ ...site, stockEnabledAt: params.enabledAt }, location);
};

/** Voir `GetSiteStockStatus` dans `./types-lot5-rapprochement.ts`. */
export const getSiteStockStatus: GetSiteStockStatus = async (tenantId, siteId) => {
  const site = await loadSiteOrThrow(prisma, tenantId, siteId);
  // Le lieu est rendu DÈS QU'IL EXISTE, même sur un chantier qui n'a pas
  // basculé : le référentiel permet d'en créer un à la main, et le taire
  // laisserait un écran affirmer qu'il n'y en a pas alors qu'on peut y recevoir.
  const location = await findSiteLocation(prisma, tenantId, siteId);
  return toStatusRecord(site, location);
};

/**
 * Voir `IsSiteStockEnabledTx` dans `./types-lot5-rapprochement.ts`.
 *
 * Prend la **date de la pièce**, pas l'instant présent — voir l'en-tête. La
 * date de bascule elle-même compte comme « après » : une facture datée du jour
 * du basculement entre en stock, sans quoi il faudrait un instant précis à la
 * seconde pour départager, et personne ne saisit une facture à la seconde.
 *
 * Renvoie `false` pour un chantier inexistant plutôt que de lever : ce n'est
 * pas son travail, et l'appelant a déjà lu le chantier (contrat).
 */
/**
 * LA FRONTIERE DE LA BASCULE, ET SA SEULE DEFINITION DANS TOUT LE MODULE.
 *
 * La bascule se compare en JOURS, jamais en instants. La date d'une piece est
 * une date metier sans heure — minuit —, tandis que `stockEnabledAt` porte
 * l'instant exact ou la bascule a ete confirmee, en pleine journee. Confronter
 * les deux directement classait TOUTE piece du jour de la bascule comme
 * anterieure a elle.
 *
 * **Trois lectures dependent de cette frontiere**, et elles doivent donner la
 * meme reponse sous peine d'incoherence visible a l'ecran :
 *
 * | Lecture                             | Effet d'un desaccord                     |
 * |-------------------------------------|------------------------------------------|
 * | `isSiteStockEnabledTx`              | la facture s'impute, ou entre en stock   |
 * | `invoicedAmount` du rapprochement   | « Facture au chantier »                  |
 * | les agregats de MOUVEMENTS          | « Entre depuis une facture », « Consomme » |
 *
 * Le defaut a ete repare deux fois plutot qu'une, le 20 septembre 2026 : la
 * premiere passe a corrige les deux premieres lectures et laisse la troisieme
 * derriere, si bien que l'ecran annoncait 11 000 000 d'ecart sur une
 * marchandise bel et bien entree. D'ou cette fonction unique, et l'absence
 * deliberee de toute comparaison de dates ecrite a la main ailleurs : le
 * prochain qui ajoute une lecture doit passer par ici.
 *
 * Elle rend un `Date` et non un booleen parce que Prisma en a besoin tel quel
 * dans un `gte` — un predicat n'aurait servi qu'a un tiers des appelants, et
 * les deux autres auraient reecrit la regle.
 */
function debutDuJourDeLaBascule(stockEnabledAt: Date): Date {
  return new Date(Date.UTC(stockEnabledAt.getUTCFullYear(), stockEnabledAt.getUTCMonth(), stockEnabledAt.getUTCDate()));
}

export const isSiteStockEnabledTx: IsSiteStockEnabledTx = async (tx, tenantId, siteId, at) => {
  const site = await tx.constructionSite.findFirst({
    where: { id: siteId, tenantId },
    select: { stockEnabledAt: true }
  });

  if (!site || !site.stockEnabledAt) {
    return false;
  }

  if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
    // Une date de pièce illisible n'autorise pas à deviner : on répond « pas
    // encore au stock », c'est-à-dire le comportement d'avant la bascule, qui
    // est celui qui ne perd rien.
    return false;
  }

  // La DATE de la piece contre le JOUR de la bascule. C'est bien la date
  // metier de la piece qui tranche, et non l'instant de sa saisie : une
  // facture du mois dernier, saisie aujourd'hui sur un chantier bascule hier,
  // appartient a l'avant et doit s'imputer comme avant — sans quoi elle
  // creerait un stock que personne n'a jamais recu.
  return at.getTime() >= debutDuJourDeLaBascule(site.stockEnabledAt as Date).getTime();
};

// ---------------------------------------------------------------------------
// B. Le rapprochement — ce qu'on a payé face à ce qui est arrivé
// ---------------------------------------------------------------------------

/** Les totaux d'un article, accumulés avant d'être rendus en ligne. */
interface LineAccumulator {
  receivedQuantity: number;
  receivedValue: number;
  transferredInQuantity: number;
  transferredInValue: number;
  issuedQuantity: number;
  issuedValue: number;
  remainingQuantity: number;
  remainingValue: number;
}

function emptyAccumulator(): LineAccumulator {
  return {
    receivedQuantity: 0,
    receivedValue: 0,
    transferredInQuantity: 0,
    transferredInValue: 0,
    issuedQuantity: 0,
    issuedValue: 0,
    remainingQuantity: 0,
    remainingValue: 0
  };
}

/**
 * Voir `GetSiteStockReconciliation` dans `./types-lot5-rapprochement.ts`.
 *
 * **Lecture seule, et tout y est calculé** : aucun de ces chiffres n'est une
 * colonne.
 *
 * ### Un chantier non basculé ne montre PAS que des zéros
 *
 * Rien n'empêche de sortir du stock d'un magasin central vers un chantier qui
 * n'a pas basculé — `recordStockIssueTx` ne regarde pas `stockEnabledAt` —, et
 * ces sorties ont bel et bien imputé son coût réel. Les afficher à zéro ferait
 * mentir l'écran sur un chiffre qui existe.
 *
 * **Deux chiffres seulement dépendent de la bascule**, et eux seuls valent zéro
 * sans elle : `invoicedAmount`, parce que sans période de bascule il n'y a
 * aucune facture à confronter, et `unreconciledAmount`, qui en découle. Le
 * consommé, le reçu et le restant disent la vérité dans tous les cas.
 *
 * C'est la correction portée au contrat après le premier jet de ce fichier,
 * qui prenait « tout y vaut zéro » à la lettre.
 */
export const getSiteStockReconciliation: GetSiteStockReconciliation = async (tenantId, siteId) => {
  const site = await loadSiteOrThrow(prisma, tenantId, siteId);

  const stockEnabledAt = site.stockEnabledAt ?? null;

  /**
   * La borne de période des FLUX, et seulement quand elle existe.
   *
   * Avec bascule : les mouvements d'avant relèvent de l'avant, comme les
   * factures — c'est la même frontière que celle sur laquelle
   * `isSiteStockEnabledTx` tranche, et la garder d'un seul côté ferait
   * confronter des périodes différentes.
   *
   * Sans bascule : il n'y a pas de frontière, donc pas de borne. On prend
   * tout, sans quoi le consommé d'un chantier non basculé retomberait à zéro
   * par un détour — exactement le défaut que la correction du contrat vient
   * de supprimer.
   *
   * La borne est le PREMIER INSTANT DU JOUR de la bascule, jamais l'instant
   * de la bascule lui-meme : un mouvement porte la date metier saisie au
   * formulaire, donc minuit, et minuit precede l'heure a laquelle on bascule.
   * Compare a l'instant brut, tout ce qui s'est recu, transfere ou sorti le
   * jour de la bascule tombait du mauvais cote — le rapprochement affichait
   * alors zero recu et zero consomme face a un restant juste, c'est-a-dire
   * l'ecart le plus alarmant possible sur la marchandise la mieux rangee.
   */
  const depuisLaBascule = stockEnabledAt ? { movementDate: { gte: debutDuJourDeLaBascule(stockEnabledAt) } } : {};

  const location = await findSiteLocation(prisma, tenantId, siteId);

  /** Les entrées d'un lieu, d'une seule nature, groupées par article. */
  const entreesDuLieu = (type: 'RECEIPT' | 'TRANSFER'): Promise<Array<Record<string, any>>> =>
    location
      ? (prisma.stockMovement.groupBy({
          by: ['itemId'],
          where: {
            tenantId,
            locationId: location.id,
            type: type as any,
            // Écarte la moitié SORTANTE d'un transfert, qui porte le même type
            // et le même groupe : chaque mouvement ne touche qu'un lieu, et
            // celui-ci n'entre que d'un côté.
            isDecrease: false,
            ...depuisLaBascule
          },
          _sum: { quantity: true, totalValue: true }
        }) as Promise<Array<Record<string, any>>>)
      : Promise.resolve([] as Array<Record<string, any>>);

  const [invoiced, receipts, transfersIn, issues, balances] = await Promise.all([
    // LES QUATRE CONDITIONS, et pas trois : validée, non annulée, rattachée au
    // chantier, POSTÉRIEURE à la bascule. `status: 'VALIDATED'` porte les deux
    // premières — `VOIDED` est un statut, pas une colonne à part. La date
    // retenue est `invoiceDate`, la date de la PIÈCE, la même que celle sur
    // laquelle `isSiteStockEnabledTx` tranche : une facture d'avant la bascule
    // s'est imputée normalement, et la compter ici inventerait un écart qui
    // n'existe pas.
    //
    // SANS BASCULE, la requête n'est même pas émise : il n'y a pas de période
    // à confronter, et prendre « toutes les factures du chantier » fabriquerait
    // un écart contre un stock qui n'a jamais eu à les recevoir.
    stockEnabledAt
      ? prisma.supplierInvoice.aggregate({
          // Le JOUR de la bascule, pas son instant : meme raison qu'a
          // `isSiteStockEnabledTx`, et surtout meme regle. Les deux doivent
          // basculer ensemble, faute de quoi une facture entrerait dans le
          // cout sans jamais paraitre au rapprochement, ou l'inverse.
          where: {
            tenantId,
            siteId,
            status: 'VALIDATED' as any,
            invoiceDate: { gte: debutDuJourDeLaBascule(stockEnabledAt) }
          },
          _sum: { amount: true }
        })
      : Promise.resolve({ _sum: { amount: null } } as Record<string, any>),

    // LE REÇU : ce qui est entré au lieu du chantier DEPUIS UNE FACTURE.
    // C'est la seule entrée qui se confronte au facturé.
    entreesDuLieu('RECEIPT'),

    // LE TRANSFÉRÉ : ce qui est venu d'un AUTRE LIEU de l'agence. Compté à
    // part, jamais mêlé au reçu — une livraison interne n'est pas un achat :
    // elle a été payée ailleurs, ou jamais. Les mêler ferait afficher, sur un
    // chantier alimenté depuis un magasin central et sans facture à son nom,
    // l'opposé de tout ce qu'on lui a livré.
    //
    // Les ajustements d'inventaire ne sont dans NI L'UNE NI L'AUTRE : un
    // excédent de comptage n'a été ni facturé ni livré. Ils restent visibles
    // dans le restant, que le solde porte.
    entreesDuLieu('TRANSFER'),

    // LE CONSOMMÉ : les sorties imputées à CE chantier, DEPUIS N'IMPORTE QUEL
    // LIEU — pas seulement depuis le lieu du chantier. On sort couramment d'un
    // magasin central vers un chantier. Voir l'asymétrie, en en-tête.
    //
    // Compté même sans bascule : ces sorties ont imputé le coût réel du
    // chantier, et le taire cacherait une dépense qui a eu lieu.
    prisma.stockMovement.groupBy({
      by: ['itemId'],
      where: { tenantId, siteId, type: 'ISSUE' as any, ...depuisLaBascule },
      _sum: { quantity: true, totalValue: true }
    }),

    // CE QUI RESTE, à l'instant de la lecture : le solde du lieu du chantier,
    // sans borne de date — c'est un état, pas un flux (contrat,
    // `remainingQuantity`).
    location
      ? prisma.stockBalance.findMany({
          where: { tenantId, locationId: location.id },
          select: { itemId: true, quantity: true, value: true }
        })
      : Promise.resolve([] as Array<Record<string, any>>)
  ]);

  const byItem = new Map<string, LineAccumulator>();
  const accumulatorFor = (itemId: string): LineAccumulator => {
    let accumulator = byItem.get(itemId);
    if (!accumulator) {
      accumulator = emptyAccumulator();
      byItem.set(itemId, accumulator);
    }
    return accumulator;
  };

  for (const row of receipts as Array<Record<string, any>>) {
    const accumulator = accumulatorFor(row.itemId as string);
    accumulator.receivedQuantity = roundQuantity(accumulator.receivedQuantity + toAmountOrZero(row._sum?.quantity));
    accumulator.receivedValue = roundMoneyXof(accumulator.receivedValue + toAmountOrZero(row._sum?.totalValue));
  }

  for (const row of transfersIn as Array<Record<string, any>>) {
    const accumulator = accumulatorFor(row.itemId as string);
    accumulator.transferredInQuantity = roundQuantity(
      accumulator.transferredInQuantity + toAmountOrZero(row._sum?.quantity)
    );
    accumulator.transferredInValue = roundMoneyXof(
      accumulator.transferredInValue + toAmountOrZero(row._sum?.totalValue)
    );
  }

  for (const row of issues as Array<Record<string, any>>) {
    const accumulator = accumulatorFor(row.itemId as string);
    accumulator.issuedQuantity = roundQuantity(accumulator.issuedQuantity + toAmountOrZero(row._sum?.quantity));
    accumulator.issuedValue = roundMoneyXof(accumulator.issuedValue + toAmountOrZero(row._sum?.totalValue));
  }

  for (const row of balances as Array<Record<string, any>>) {
    const accumulator = accumulatorFor(row.itemId as string);
    accumulator.remainingQuantity = roundQuantity(accumulator.remainingQuantity + toAmountOrZero(row.quantity));
    accumulator.remainingValue = roundMoneyXof(accumulator.remainingValue + toAmountOrZero(row.value));
  }

  // Le référentiel est résolu PAR LOT, jamais une requête par article : le
  // nombre de requêtes de cette fonction ne doit dépendre que du nombre de
  // sources, jamais du nombre de lignes rendues.
  const itemIds = [...byItem.keys()];
  const items = itemIds.length
    ? await prisma.stockItem.findMany({
        where: { tenantId, id: { in: itemIds } },
        select: { id: true, reference: true, label: true, unit: true }
      })
    : [];
  const itemsById = new Map<string, Record<string, any>>(
    (items as Array<Record<string, any>>).map(item => [item.id as string, item])
  );

  const lines: SiteStockReconciliationLine[] = itemIds
    .map(itemId => {
      const accumulator = byItem.get(itemId)!;
      const item = itemsById.get(itemId);
      return {
        itemId,
        itemReference: (item?.reference as string) ?? 'Article inconnu',
        itemLabel: (item?.label as string) ?? 'Article inconnu',
        itemUnit: (item?.unit as string) ?? '',
        receivedQuantity: accumulator.receivedQuantity,
        transferredInQuantity: accumulator.transferredInQuantity,
        issuedQuantity: accumulator.issuedQuantity,
        remainingQuantity: accumulator.remainingQuantity,
        receivedValue: accumulator.receivedValue,
        transferredInValue: accumulator.transferredInValue,
        issuedValue: accumulator.issuedValue,
        remainingValue: accumulator.remainingValue,
        currency: DEFAULT_CURRENCY
      };
    })
    .sort((a, b) => a.itemReference.localeCompare(b.itemReference) || a.itemLabel.localeCompare(b.itemLabel));

  const invoicedAmount = roundMoneyXof(toAmountOrZero((invoiced as Record<string, any>)?._sum?.amount));
  const receivedValue = roundMoneyXof(lines.reduce((sum, line) => sum + line.receivedValue, 0));
  const transferredInValue = roundMoneyXof(lines.reduce((sum, line) => sum + line.transferredInValue, 0));
  const issuedValue = roundMoneyXof(lines.reduce((sum, line) => sum + line.issuedValue, 0));
  const remainingValue = roundMoneyXof(lines.reduce((sum, line) => sum + line.remainingValue, 0));

  return {
    siteId: site.id,
    siteLabel: site.name,
    stockEnabledAt,
    invoicedAmount,
    receivedValue,
    // Exposé, et ne se confronte à rien : cette matière a été payée ailleurs,
    // ou jamais. Elle est là parce qu'elle explique une bonne part du restant,
    // et qu'un restant sans explication se lit comme une anomalie.
    transferredInValue,
    // L'ÉCART, et il est réel. Il n'est ni nommé, ni qualifié, ni interprété :
    // un vol et des frais de transport se ressemblent dans une soustraction.
    //
    // LES TRANSFERTS REÇUS N'Y SONT PAS : une livraison interne a déjà été
    // payée ailleurs, ou ne l'a jamais été, et la compter réduirait un écart
    // sans qu'aucun fournisseur n'ait rien apporté.
    //
    // SANS BASCULE, il vaut zéro — et surtout PAS la soustraction. Un chantier
    // non basculé peut avoir un lieu et y avoir reçu : `0 − receivedValue`
    // afficherait alors un écart négatif de toute la valeur reçue, qui ne
    // veut rien dire puisqu'il n'y avait rien à confronter. C'est le piège
    // qu'un test de ce sous-lot a fait apparaître, et la raison pour laquelle
    // ce chiffre est posé à zéro plutôt que déduit.
    unreconciledAmount: stockEnabledAt ? roundMoneyXof(invoicedAmount - receivedValue) : 0,
    issuedValue,
    remainingValue,
    currency: DEFAULT_CURRENCY,
    lines
  };
};
