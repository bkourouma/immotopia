import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tabs,
  Typography
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import {
  listStockBalances,
  listStockItems,
  listStockLocations,
  listStockMovements,
  listSupplierInvoicesForReceipt,
  recordStockIssue,
  recordStockReceipt
} from '../../services/finance-stock-mouvements-service';
import { listConstructionSites, listCostCategories, listSuppliers } from '../../services/finance-lot2-service';
import { STOCK_MOVEMENT_TYPE_LABELS, STOCK_MOVEMENT_TYPE_TONES } from '../../types/finance-stock-mouvements-types';
import type { StockBalance, StockMovement, StockMovementType } from '../../types/finance-stock-mouvements-types';
import { entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import { montantSaisiProps } from '../../utils/montant-saisi';
import {
  DataCard,
  DataView,
  MoneyValue,
  PageHeader,
  StateBlock,
  StatusTag,
  FilterSheet,
  formatMoney
} from '../../components/primitives';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Text, Paragraph } = Typography;

/**
 * Le stock au quotidien — état, réceptions, sorties, journal des mouvements.
 * Lot 5, deuxième sous-lot (PRD E9, besoins S2, S3, S4 ; contrat gelé
 * `packages/api/src/lib/finance/types-lot5-mouvements.ts`).
 *
 * C'est l'écran que la gestionnaire ouvre tous les jours.
 *
 * ---------------------------------------------------------------------------
 * Fichiers-registres, hors du territoire de cet agent
 * ---------------------------------------------------------------------------
 *
 * Cet écran n'est câblé nulle part : `App.tsx`, `navigation/model.tsx`,
 * `dev/atelier/Atelier.tsx` et `dev/atelier/mock-api.ts` appartiennent au
 * superviseur, qui les branche à l'intégration. Le chemin supposé, et lu comme
 * tel, est `/tenant/:tenantId/finance/stock`. `tenantId` est lu dans le CHEMIN
 * (`useParams`), jamais en paramètre de requête — le défaut relevé deux fois
 * au lot 2.
 *
 * Extraits prêts à coller :
 *
 * ```tsx
 * // App.tsx
 * const Stock = lazy(() => import('./pages/finance/Stock'));
 * <Route path="/tenant/:tenantId/finance/stock" element={<Stock />} />
 * ```
 *
 * ```tsx
 * // dev/atelier/Atelier.tsx — une scène, et sa route
 * const STOCK = 'tenant/' + AGENCE + '/finance/stock';
 * {
 *   id: 'stock',
 *   titre: 'Stock — c’est la sortie qui impute, pas la livraison',
 *   description:
 *     'Ce qu’il reste et ce que ça vaut, par lieu et par article. Un article à deux coûts moyens dans deux magasins, une réception à plusieurs lignes, une sortie vers un chantier, et le journal qui mêle les quatre natures.',
 *   scenario: 'nominal',
 *   chemin: STOCK
 * }
 * <Route path="tenant/:tenantId/finance/stock" element={<Scene><Stock /></Scene>} />
 * ```
 *
 * ```ts
 * // dev/atelier/mock-api.ts
 * import { repondreStockMouvements } from './finance-mock-stock-mouvements';
 * // dans la liste `for (const repondre of [...])` :
 * repondreStockMouvements
 * ```
 *
 * ```ts
 * // navigation/model.tsx — sous le module financier
 * { key: 'finance-stock', label: 'Stock', path: 'finance/stock' }
 * ```
 *
 * ---------------------------------------------------------------------------
 * 1. C'est la SORTIE qui impute le chantier, pas la livraison — principe P-7
 * ---------------------------------------------------------------------------
 *
 * Le piège central de cet écran, et il est dit trois fois : en bandeau de tête,
 * dans le formulaire de réception, et dans celui de sortie. Dès que le stock
 * est actif sur un chantier, le coût de ses matériaux vient des **sorties de
 * magasin**, et la facture n'impute plus rien. Un utilisateur qui croirait
 * qu'une réception fait monter le coût de son chantier attendrait un chiffre
 * qui ne viendra qu'à la sortie — et le prendrait pour une erreur.
 *
 * La réception, elle, **n'écrit aucune écriture comptable** : la facture a
 * déjà porté la valeur, et la doubler gonflerait l'actif de l'agence.
 *
 * ---------------------------------------------------------------------------
 * 2. Le prix d'une sortie n'est PAS saisi (principe P-4)
 * ---------------------------------------------------------------------------
 *
 * Le formulaire de sortie n'offre **aucun champ de montant** : article,
 * quantité, chantier, poste, demandeur, date, et rien d'autre. Le prix est
 * dérivé du coût moyen du lieu **avant** la sortie, par le serveur seul, dont
 * le schéma Zod est `.strict()` et refuse explicitement `unitCost`,
 * `totalValue` et `averageUnitCost`.
 *
 * L'**aperçu** affiché sous la quantité est nommé « aperçu » en toutes
 * lettres : c'est la seule multiplication de cet écran, elle ne voyage pas, et
 * la phrase qui l'accompagne dit que le serveur tranchera. Voir
 * `__tests__/finance/stock.test.tsx`, qui épingle le corps envoyé.
 *
 * ---------------------------------------------------------------------------
 * 3. Une sortie supérieure au stock est refusée, et c'est voulu
 * ---------------------------------------------------------------------------
 *
 * C'est la seule interdiction dure du sous-lot : un stock négatif n'a pas de
 * coût moyen qui veuille dire quelque chose, et toute la valorisation qui suit
 * deviendrait fausse. Quand la quantité physique dépasse ce que le système
 * croit, le geste juste est un **inventaire**, pas une sortie à découvert.
 *
 * L'écran montre donc le **stock disponible à côté du champ de quantité**,
 * pour qu'on le voie avant d'envoyer, avertit dès que la quantité le dépasse,
 * et relaie le message du serveur tel quel s'il refuse malgré tout — lui seul
 * connaît l'état réel au moment de l'écriture.
 *
 * ---------------------------------------------------------------------------
 * 4. `quantity × unitCost` ne fait PAS `totalValue`
 * ---------------------------------------------------------------------------
 *
 * Quand une sortie vide un emplacement, elle emporte toute la valeur
 * résiduelle : le contrat force la valeur du solde à zéro et loge l'écart
 * d'arrondi dans le mouvement. Les deux champs peuvent donc différer d'une
 * unité monétaire, et c'est une donnée, pas un défaut. **Cet écran n'affiche
 * jamais un total recalculé** : la colonne « Valeur du mouvement » rend
 * `totalValue`, tel que le serveur l'émet.
 *
 * ---------------------------------------------------------------------------
 * 5. Une quantité n'est pas un montant
 * ---------------------------------------------------------------------------
 *
 * Les quantités portent **quatre décimales** : on compte des tonnes et des
 * mètres cubes. Un quart de mètre cube vaut 0,25 et ne doit jamais s'afficher
 * « 0 ». `formatMoney` arrondit à l'unité et colle « FCFA » derrière : il ne
 * sert à aucune quantité, qui passe par `quantite()` ci-dessous.
 *
 * ---------------------------------------------------------------------------
 * Ce qui est calculé ici, et ce qui ne l'est pas
 * ---------------------------------------------------------------------------
 *
 * **Aucun montant n'est calculé ici**, à l'unique exception de l'aperçu de
 * sortie, documenté au point 2. Aucun total de colonne, aucune somme de
 * lignes : le contrat n'offre pas de résumé du stock, et en fabriquer un à
 * l'écran donnerait un chiffre qui changerait avec les filtres.
 *
 * Deux dérivations non monétaires subsistent, et elles sont assumées :
 *
 * - le **stock disponible** montré près du champ de quantité, lu dans la ligne
 *   de solde `(article, lieu)` que le serveur a rendue — c'est une lecture, pas
 *   un calcul ;
 * - le tri des factures candidates sur `status === 'VALIDATED'` dans le
 *   formulaire de réception, parce que le serveur refuse les autres.
 *
 * **Vocabulaire (P-1 du PRD).** On *reçoit* de la matière, on la *sort* vers un
 * chantier ; un stock a une *quantité*, une *valeur* et un *coût moyen
 * unitaire*. Jamais « débit » ni « crédit » — et « débiteur » non plus, qui
 * contient le premier.
 */

/**
 * Une quantité, à quatre décimales au plus et zéro au moins.
 *
 * **Jamais `formatMoney`** : il arrondit à l'unité et colle « FCFA » derrière.
 * Un quart de mètre cube s'écrit « 0,25 m³ », pas « 0 FCFA ».
 */
function quantite(valeur: number, unite?: string): string {
  const texte = valeur.toLocaleString(activeLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  return unite ? `${texte} ${unite}` : texte;
}

/**
 * Ramène une quantité saisie à quatre décimales au plus, sans lui imposer
 * d'en afficher : c'est ce que ferait un `precision` fixe sur `<InputNumber>`,
 * qui écrirait « 800,0000 » pour un entier. Ici, `800` reste `800` et
 * `12.3456789` devient `12.3457`.
 */
function arrondirQuantite(valeur: number): number {
  return Math.round(valeur * 10000) / 10000;
}

/** Une date ISO se lit à la française. « — » plutôt que « Invalid Date ». */
function date(valeur: string | null): string {
  if (!valeur) return '—';
  const jour = dayjs(valeur);
  return jour.isValid() ? jour.format('DD/MM/YYYY') : '—';
}

/** Une ligne du formulaire de réception. Le serveur écrit un mouvement par ligne. */
interface LigneReception {
  /** Clé de rendu locale. Ne voyage jamais. */
  cle: number;
  itemId: string | undefined;
  quantity: number | null;
  unitCost: number | null;
}

function ligneVide(cle: number): LigneReception {
  return { cle, itemId: undefined, quantity: null, unitCost: null };
}

export const Stock: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const queryClient = useQueryClient();

  // -----------------------------------------------------------------------
  // Filtres de l'état du stock
  // -----------------------------------------------------------------------

  const [lieuFiltre, setLieuFiltre] = useState<string | undefined>(undefined);
  const [articleFiltre, setArticleFiltre] = useState<string | undefined>(undefined);
  /**
   * « Masquer les lignes à zéro ». **Décoché par défaut** : une ligne à zéro
   * dit qu'un article a existé dans un lieu et n'y est plus, et c'est une
   * information. Le filtre est OMIS quand il est faux plutôt qu'envoyé
   * `false`, pour que l'URL et la clé de cache soient celles du premier
   * chargement.
   */
  const [masquerZero, setMasquerZero] = useState(false);

  const filtresSoldes = {
    locationId: lieuFiltre,
    itemId: articleFiltre,
    onlyInStock: masquerZero || undefined
  };

  // -----------------------------------------------------------------------
  // Filtres du journal
  // -----------------------------------------------------------------------

  const [journalArticle, setJournalArticle] = useState<string | undefined>(undefined);
  const [journalLieu, setJournalLieu] = useState<string | undefined>(undefined);
  const [journalChantier, setJournalChantier] = useState<string | undefined>(undefined);
  const [journalNature, setJournalNature] = useState<StockMovementType | undefined>(undefined);
  const [journalDu, setJournalDu] = useState<Dayjs | null>(null);
  const [journalAu, setJournalAu] = useState<Dayjs | null>(null);

  const filtresJournal = {
    itemId: journalArticle,
    locationId: journalLieu,
    siteId: journalChantier,
    type: journalNature,
    from: journalDu ? journalDu.format('YYYY-MM-DD') : undefined,
    to: journalAu ? journalAu.format('YYYY-MM-DD') : undefined
  };

  // -----------------------------------------------------------------------
  // Lectures
  // -----------------------------------------------------------------------

  const {
    data: soldesData,
    isPending: soldesEnAttente,
    isFetching: soldesEnRechargement,
    error: erreurSoldes,
    refetch: refetchSoldes
  } = useQuery({
    queryKey: queryKey('stock-balances', tenantId, filtresSoldes),
    queryFn: () => listStockBalances(tenantId as string, filtresSoldes),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const {
    data: mouvementsData,
    isPending: journalEnAttente,
    isFetching: journalEnRechargement,
    error: erreurJournal,
    refetch: refetchJournal
  } = useQuery({
    queryKey: queryKey('stock-movements', tenantId, filtresJournal),
    queryFn: () => listStockMovements(tenantId as string, filtresJournal),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  /**
   * Les soldes SANS filtre, pour le stock disponible et l'aperçu d'une sortie.
   *
   * Une requête à part, et non la liste filtrée de l'écran : un filtre posé
   * sur l'état du stock ne doit pas faire croire qu'un article n'est plus
   * disponible. Quand aucun filtre n'est posé, la clé est celle de la liste et
   * React Query ne fait qu'une seule requête.
   */
  const { data: soldesComplets } = useQuery({
    queryKey: queryKey('stock-balances', tenantId, {}),
    queryFn: () => listStockBalances(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  // Les articles et les lieux appartiennent au sous-lot voisin (le
  // référentiel) : ils sont appelés par leurs routes, sans importer son
  // service. Voir l'en-tête de `finance-stock-mouvements-service.ts`.
  const { data: articles } = useQuery({
    queryKey: queryKey('stock-items', tenantId, { onlyActive: true }),
    queryFn: () => listStockItems(tenantId as string, { onlyActive: true }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const { data: lieux } = useQuery({
    queryKey: queryKey('stock-locations', tenantId, { onlyActive: true }),
    queryFn: () => listStockLocations(tenantId as string, { onlyActive: true }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const { data: chantiers } = useQuery({
    queryKey: queryKey('finance-chantiers-reference', tenantId, {}),
    queryFn: () => listConstructionSites(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const { data: postes } = useQuery({
    queryKey: queryKey('cost-categories', tenantId, {}),
    queryFn: () => listCostCategories(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  // -----------------------------------------------------------------------
  // Enregistrer une réception
  // -----------------------------------------------------------------------

  const [receptionOuverte, setReceptionOuverte] = useState(false);
  const [receptionEnCours, setReceptionEnCours] = useState(false);
  const [receptionLieu, setReceptionLieu] = useState<string | undefined>(undefined);
  const [receptionFournisseur, setReceptionFournisseur] = useState<string | undefined>(undefined);
  const [receptionFacture, setReceptionFacture] = useState<string | undefined>(undefined);
  const [receptionDate, setReceptionDate] = useState<Dayjs | null>(null);
  const [lignes, setLignes] = useState<LigneReception[]>([ligneVide(0)]);
  const [prochaineCle, setProchaineCle] = useState(1);

  const { data: fournisseurs } = useQuery({
    queryKey: queryKey('finance-fournisseurs-reference', tenantId, {}),
    queryFn: () => listSuppliers(tenantId as string),
    enabled: Boolean(tenantId) && receptionOuverte,
    staleTime: STALE_TIME.reference
  });

  /**
   * Les factures sur lesquelles une réception peut s'adosser.
   *
   * **Aucune route ne liste les factures « sans réception »** : le détour est
   * isolé dans `listSupplierInvoicesForReceipt`, qui compose la liste depuis
   * les factures VALIDÉES du fournisseur choisi. Conséquence assumée : une
   * facture déjà réceptionnée reste proposée, parce que rien ne permet de le
   * savoir depuis le web — et parce que le contrat prévoit explicitement
   * qu'une réception puisse ne pas totaliser sa facture (besoin S7).
   */
  const { data: factures } = useQuery({
    queryKey: queryKey('supplier-invoices-receivable', tenantId, { supplierId: receptionFournisseur }),
    queryFn: () => listSupplierInvoicesForReceipt(tenantId as string, receptionFournisseur as string),
    enabled: Boolean(tenantId) && Boolean(receptionFournisseur),
    staleTime: STALE_TIME.list
  });

  // -----------------------------------------------------------------------
  // Enregistrer une sortie — le geste du lot
  // -----------------------------------------------------------------------

  const [sortieOuverte, setSortieOuverte] = useState(false);
  const [sortieEnCours, setSortieEnCours] = useState(false);
  const [sortieLieu, setSortieLieu] = useState<string | undefined>(undefined);
  const [sortieArticle, setSortieArticle] = useState<string | undefined>(undefined);
  const [sortieQuantite, setSortieQuantite] = useState<number | null>(null);
  const [sortieChantier, setSortieChantier] = useState<string | undefined>(undefined);
  const [sortiePoste, setSortiePoste] = useState<string | undefined>(undefined);
  /** Vrai tant que le poste affiché vient de la PROPOSITION de l'article. */
  const [postePropose, setPostePropose] = useState(false);
  const [sortieDemandeur, setSortieDemandeur] = useState('');
  const [sortieDate, setSortieDate] = useState<Dayjs | null>(null);

  // -----------------------------------------------------------------------
  // Options des listes déroulantes
  // -----------------------------------------------------------------------

  const optionsArticles = useMemo(
    () =>
      (articles ?? [])
        .map(a => ({ value: a.id, label: `${a.reference} — ${a.label}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [articles]
  );

  const optionsLieux = useMemo(
    () => (lieux ?? []).map(l => ({ value: l.id, label: l.label })).sort((a, b) => a.label.localeCompare(b.label)),
    [lieux]
  );

  const optionsChantiers = useMemo(
    () => (chantiers ?? []).map(c => ({ value: c.id, label: c.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [chantiers]
  );

  const optionsPostes = useMemo(
    () =>
      (postes ?? [])
        .filter(p => p.isActive)
        .map(p => ({ value: p.id, label: p.label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [postes]
  );

  const optionsFournisseurs = useMemo(
    () =>
      (fournisseurs ?? []).map(f => ({ value: f.id, label: f.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [fournisseurs]
  );

  // Le service a déjà écarté les factures non validées : le serveur refuse les
  // autres, et proposer une ligne dont on sait qu'elle échouera est une
  // invitation à une erreur.
  const optionsFactures = useMemo(
    () => (factures ?? []).map(f => ({ value: f.id, label: `${f.reference} — ${formatMoney(f.amount)}` })),
    [factures]
  );

  /** L'article choisi pour la sortie — son unité, et le poste qu'il propose. */
  const articleSortie = useMemo(
    () => (articles ?? []).find(a => a.id === sortieArticle) ?? null,
    [articles, sortieArticle]
  );

  /**
   * La ligne de solde `(article, lieu)` de la sortie en cours.
   *
   * **Lue, jamais calculée** : c'est le serveur qui l'a rendue, coût moyen
   * compris. L'écran s'en sert pour montrer le stock disponible et l'aperçu.
   */
  const soldeSortie = useMemo<StockBalance | null>(() => {
    if (!sortieArticle || !sortieLieu) return null;
    return (soldesComplets ?? []).find(s => s.itemId === sortieArticle && s.locationId === sortieLieu) ?? null;
  }, [soldesComplets, sortieArticle, sortieLieu]);

  /**
   * **APERÇU SEULEMENT**, et l'écran le dit en toutes lettres.
   *
   * La seule multiplication de cet écran. Elle ne voyage pas : le corps posté
   * ne porte aucun montant, et le serveur valorise la sortie au coût moyen du
   * lieu tel qu'il sera au moment de l'écriture — qui peut avoir changé
   * depuis, si une réception est passée entre-temps.
   */
  const apercuSortie = useMemo(() => {
    if (!soldeSortie || sortieQuantite === null || sortieQuantite <= 0) return null;
    return Math.round(soldeSortie.averageUnitCost * sortieQuantite);
  }, [soldeSortie, sortieQuantite]);

  const stockDisponible = soldeSortie?.quantity ?? 0;
  const uniteSortie = articleSortie?.unit ?? soldeSortie?.itemUnit ?? '';
  /** Dit AVANT l'envoi ce que le serveur refuserait. Le serveur reste l'autorité. */
  const sortieAuDela = Boolean(
    sortieArticle && sortieLieu && sortieQuantite !== null && sortieQuantite > stockDisponible
  );

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const soldes = soldesData ?? [];
  const mouvements = mouvementsData ?? [];

  const nbFiltresSoldes = (lieuFiltre ? 1 : 0) + (articleFiltre ? 1 : 0) + (masquerZero ? 1 : 0);
  const nbFiltresJournal =
    (journalArticle ? 1 : 0) +
    (journalLieu ? 1 : 0) +
    (journalChantier ? 1 : 0) +
    (journalNature ? 1 : 0) +
    (journalDu ? 1 : 0) +
    (journalAu ? 1 : 0);

  const effacerFiltresSoldes = () => {
    setLieuFiltre(undefined);
    setArticleFiltre(undefined);
    setMasquerZero(false);
  };

  const effacerFiltresJournal = () => {
    setJournalArticle(undefined);
    setJournalLieu(undefined);
    setJournalChantier(undefined);
    setJournalNature(undefined);
    setJournalDu(null);
    setJournalAu(null);
  };

  // -----------------------------------------------------------------------
  // Réception — ouverture, lignes, envoi
  // -----------------------------------------------------------------------

  const ouvrirReception = () => {
    setReceptionLieu(undefined);
    setReceptionFournisseur(undefined);
    setReceptionFacture(undefined);
    setReceptionDate(dayjs());
    setLignes([ligneVide(0)]);
    setProchaineCle(1);
    setReceptionOuverte(true);
  };

  const ajouterLigne = () => {
    setLignes([...lignes, ligneVide(prochaineCle)]);
    setProchaineCle(prochaineCle + 1);
  };

  const retirerLigne = (cle: number) => {
    // Une réception comporte au moins une ligne : le serveur refuse un tableau
    // vide, et un formulaire sans ligne ne voudrait rien dire.
    if (lignes.length <= 1) return;
    setLignes(lignes.filter(l => l.cle !== cle));
  };

  const modifierLigne = (cle: number, champs: Partial<LigneReception>) => {
    setLignes(lignes.map(l => (l.cle === cle ? { ...l, ...champs } : l)));
  };

  const lignesCompletes = lignes.every(
    l => Boolean(l.itemId) && l.quantity !== null && l.quantity > 0 && l.unitCost !== null && l.unitCost >= 0
  );

  const peutRecevoir = Boolean(receptionLieu) && Boolean(receptionFacture) && receptionDate !== null && lignesCompletes;

  const validerReception = async () => {
    if (!peutRecevoir) {
      message.error(
        t('Le lieu, la facture validée, la date et chaque ligne (article, quantité, prix unitaire) sont obligatoires.')
      );
      return;
    }
    setReceptionEnCours(true);
    try {
      // Le corps porte exactement les quatre champs du schéma serveur, et le
      // `tenantId` reste dans le chemin.
      const mouvementsCrees = await recordStockReceipt(tenantId, {
        locationId: receptionLieu as string,
        supplierInvoiceId: receptionFacture as string,
        receiptDate: (receptionDate as Dayjs).format('YYYY-MM-DD'),
        lines: lignes.map(l => ({
          itemId: l.itemId as string,
          quantity: l.quantity as number,
          unitCost: l.unitCost as number
        }))
      });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-balances', tenantId) });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-movements', tenantId) });
      const n = mouvementsCrees.length;
      message.success(
        t("Réception enregistrée : {{n}} ligne{{value}} entrée{{value2}} en stock. Aucun coût de chantier n'a bougé.", {
          n: n,
          value: n > 1 ? 's' : '',
          value2: n > 1 ? 's' : ''
        })
      );
      setReceptionOuverte(false);
    } catch (err: any) {
      // Facture non validée, lieu désactivé, article inconnu : le serveur seul
      // sait lequel des refus s'est produit, et son message le dit.
      message.error(err?.response?.data?.message || t("La réception n'a pas pu être enregistrée."));
    } finally {
      setReceptionEnCours(false);
    }
  };

  // -----------------------------------------------------------------------
  // Sortie — ouverture, proposition de poste, envoi
  // -----------------------------------------------------------------------

  const ouvrirSortie = () => {
    setSortieLieu(undefined);
    setSortieArticle(undefined);
    setSortieQuantite(null);
    setSortieChantier(undefined);
    setSortiePoste(undefined);
    setPostePropose(false);
    setSortieDemandeur('');
    setSortieDate(dayjs());
    setSortieOuverte(true);
  };

  /**
   * Changer d'article **pré-sélectionne** le poste qu'il propose.
   *
   * Une proposition, jamais une autorité : le contrat est formel, le poste
   * d'une sortie est exigé et n'est jamais deviné depuis l'article. L'écran le
   * pré-remplit, le dit, et laisse changer. Un poste déjà choisi à la main
   * n'est pas écrasé.
   */
  const choisirArticleSortie = (valeur: string) => {
    setSortieArticle(valeur);
    const article = (articles ?? []).find(a => a.id === valeur);
    if (!article) return;
    if (article.defaultCostCategoryId && (!sortiePoste || postePropose)) {
      setSortiePoste(article.defaultCostCategoryId);
      setPostePropose(true);
    } else if (!article.defaultCostCategoryId && postePropose) {
      // La proposition précédente n'a plus de raison d'être : l'utilisateur
      // choisit.
      setSortiePoste(undefined);
      setPostePropose(false);
    }
  };

  const peutSortir =
    Boolean(sortieLieu) &&
    Boolean(sortieArticle) &&
    sortieQuantite !== null &&
    sortieQuantite > 0 &&
    Boolean(sortieChantier) &&
    Boolean(sortiePoste) &&
    Boolean(sortieDemandeur.trim()) &&
    sortieDate !== null;

  const validerSortie = async () => {
    if (!peutSortir) {
      message.error(
        t(
          'Le lieu, l’article, la quantité, le chantier, le poste de dépense, le demandeur et la date sont tous obligatoires.'
        )
      );
      return;
    }
    setSortieEnCours(true);
    try {
      // AUCUN MONTANT dans ce corps, sous aucun nom : le prix est dérivé du
      // coût moyen du lieu avant la sortie (principe P-4), et le schéma
      // serveur `.strict()` refuserait `unitCost`, `totalValue` ou
      // `averageUnitCost` par un 400 explicite.
      const mouvement = await recordStockIssue(tenantId, {
        locationId: sortieLieu as string,
        itemId: sortieArticle as string,
        quantity: sortieQuantite as number,
        siteId: sortieChantier as string,
        costCategoryId: sortiePoste as string,
        requestedBy: sortieDemandeur,
        issueDate: (sortieDate as Dayjs).format('YYYY-MM-DD')
      });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-balances', tenantId) });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-movements', tenantId) });
      // Le montant annoncé est celui que le SERVEUR a retenu, jamais l'aperçu.
      message.success(
        t('Sortie enregistrée : {{value}} de {{itemLabel}} imputés à « {{value2}} » pour {{value3}}.', {
          value: quantite(mouvement.quantity, mouvement.itemUnit),
          itemLabel: mouvement.itemLabel,
          value2: mouvement.siteLabel ?? 'ce chantier',
          value3: formatMoney(mouvement.totalValue)
        })
      );
      setSortieOuverte(false);
    } catch (err: any) {
      // « Stock insuffisant », « chantier clos » : le message du serveur est
      // relayé tel quel, parce que lui seul dit ce qui s'est passé — et que la
      // réponse à un stock insuffisant est un inventaire, pas un réessai.
      message.error(err?.response?.data?.message || t("La sortie n'a pas pu être enregistrée."));
    } finally {
      setSortieEnCours(false);
    }
  };

  // -----------------------------------------------------------------------
  // Colonnes
  // -----------------------------------------------------------------------

  const colonnesSoldes: ColumnsType<StockBalance> = [
    {
      title: t('Article'),
      key: 'article',
      render: (_, b) => (
        <Space orientation="vertical" size={0}>
          <span>{b.itemLabel}</span>
          <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
            {b.itemReference}
          </Text>
        </Space>
      )
    },
    { title: t('Lieu'), key: 'lieu', render: (_, b) => b.locationLabel },
    {
      title: t('Quantité'),
      key: 'quantite',
      align: 'end',
      // Quatre décimales, et jamais le formateur monétaire : un quart de
      // mètre cube vaut 0,25, pas « 0 ».
      render: (_, b) =>
        b.quantity === 0 ? (
          <Text type="secondary">
            0 {b.itemUnit} {t('— plus rien ici')}
          </Text>
        ) : (
          quantite(b.quantity, b.itemUnit)
        )
    },
    {
      // Par (article, LIEU) : un même article peut avoir deux coûts moyens
      // dans deux magasins, et c'est normal.
      title: t('Coût moyen unitaire'),
      key: 'cout-moyen',
      align: 'end',
      render: (_, b) => (
        <Space size={4}>
          <MoneyValue value={b.averageUnitCost} />
          <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
            / {b.itemUnit}
          </Text>
        </Space>
      )
    },
    {
      title: t('Valeur'),
      key: 'valeur',
      align: 'end',
      render: (_, b) => <MoneyValue value={b.value} />
    }
  ];

  const colonnesJournal: ColumnsType<StockMovement> = [
    { title: t('Date'), key: 'date', render: (_, m) => date(m.movementDate) },
    {
      title: t('Nature'),
      key: 'nature',
      render: (_, m) => (
        <StatusTag
          status={m.type}
          label={STOCK_MOVEMENT_TYPE_LABELS[m.type]}
          tone={STOCK_MOVEMENT_TYPE_TONES[m.type]}
        />
      )
    },
    {
      title: t('Article'),
      key: 'article',
      render: (_, m) => (
        <Space orientation="vertical" size={0}>
          <span>{m.itemLabel}</span>
          <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
            {m.itemReference}
          </Text>
        </Space>
      )
    },
    { title: t('Lieu'), key: 'lieu', render: (_, m) => m.locationLabel },
    {
      title: t('Quantité'),
      key: 'quantite',
      align: 'end',
      // La quantité est toujours positive dans le contrat : c'est `isDecrease`
      // qui dit le sens, et le signe affiché vient de lui.
      render: (_, m) => `${m.isDecrease ? '−' : '+'} ${quantite(m.quantity, m.itemUnit)}`
    },
    {
      title: t('Prix unitaire'),
      key: 'prix-unitaire',
      align: 'end',
      render: (_, m) => <MoneyValue value={m.unitCost} />
    },
    {
      // `totalValue` TEL QUEL, jamais `quantity × unitCost` : une sortie qui
      // vide un emplacement emporte la valeur résiduelle, et les deux peuvent
      // différer d'une unité monétaire.
      title: t('Valeur du mouvement'),
      key: 'valeur',
      align: 'end',
      render: (_, m) => <MoneyValue value={m.totalValue} />
    },
    {
      title: t('Reste après'),
      key: 'reste',
      align: 'end',
      render: (_, m) => (
        <Space orientation="vertical" size={0} style={{ alignItems: 'flex-end' }}>
          <span>{quantite(m.quantityAfter, m.itemUnit)}</span>
          <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
            <MoneyValue value={m.valueAfter} />
          </Text>
        </Space>
      )
    },
    {
      title: t('Chantier imputé'),
      key: 'chantier',
      render: (_, m) =>
        m.siteLabel ? (
          <Space orientation="vertical" size={0}>
            <span>{m.siteLabel}</span>
            <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
              {m.costCategoryLabel ?? t('Poste non renseigné')}
            </Text>
          </Space>
        ) : (
          // Dit pourquoi la case est vide plutôt que de la laisser vide : une
          // réception n'impute aucun chantier, et ce n'est pas un oubli.
          <Text type="secondary">{t('Aucune imputation')}</Text>
        )
    },
    {
      title: t('Demandeur'),
      key: 'demandeur',
      render: (_, m) => m.requestedBy ?? <Text type="secondary">—</Text>
    },
    {
      title: t('Pièce'),
      key: 'piece',
      render: (_, m) => m.supplierInvoiceReference ?? <Text type="secondary">—</Text>
    },
    { title: t('Saisi par'), key: 'auteur', render: (_, m) => m.createdByLabel }
  ];

  // -----------------------------------------------------------------------
  // Onglets
  // -----------------------------------------------------------------------

  const ongletSoldes = (
    <>
      <FilterSheet activeCount={nbFiltresSoldes} onClear={effacerFiltresSoldes} title={t("Filtrer l'état du stock")}>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="filtre-lieu-stock">{t('Lieu')}</label>
          <Select
            id="filtre-lieu-stock"
            style={{ width: '100%' }}
            placeholder={t('Tous les lieux')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={lieuFiltre}
            onChange={valeur => setLieuFiltre(valeur as string | undefined)}
            options={optionsLieux}
          />
        </div>
        <div style={{ minWidth: 260 }}>
          <label htmlFor="filtre-article-stock">{t('Article')}</label>
          <Select
            id="filtre-article-stock"
            style={{ width: '100%' }}
            placeholder={t('Tous les articles')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={articleFiltre}
            onChange={valeur => setArticleFiltre(valeur as string | undefined)}
            options={optionsArticles}
          />
        </div>
        <div style={{ minWidth: 240 }}>
          <Checkbox checked={masquerZero} onChange={event => setMasquerZero(event.target.checked)}>
            {t('Masquer les lignes à zéro')}
          </Checkbox>
        </div>
      </FilterSheet>

      <DataView<StockBalance>
        // Le contrat de `listStockBalances` ne pagine pas.
        paginated={false}
        scrollX={1000}
        items={soldes}
        total={soldes.length}
        page={1}
        pageSize={Math.max(soldes.length, 1)}
        onPageChange={() => {}}
        loading={soldesEnAttente}
        isReloading={soldesEnRechargement && !soldesEnAttente}
        error={erreurSoldes ? t("Impossible de charger l'état du stock.") : null}
        onRetry={() => refetchSoldes()}
        isFiltered={nbFiltresSoldes > 0}
        onClearFilters={effacerFiltresSoldes}
        emptyDescription={t("Aucun stock n'est encore enregistré.")}
        emptyAction={{ label: t('Enregistrer une réception'), onClick: ouvrirReception }}
        columns={colonnesSoldes}
        rowKey={b => `${b.itemId}-${b.locationId}`}
        aria-label={t('État du stock')}
        renderCard={b => (
          <DataCard
            title={b.itemLabel}
            aria-label={b.itemLabel}
            subtitle={`${b.itemReference} — ${b.locationLabel}`}
            highlight={<MoneyValue value={b.value} />}
            fields={[
              { label: t('Quantité'), value: quantite(b.quantity, b.itemUnit) },
              { label: t('Coût moyen unitaire'), value: <MoneyValue value={b.averageUnitCost} /> }
            ]}
          />
        )}
      />

      <Paragraph type="secondary" style={{ marginTop: 'var(--space-3)' }}>
        {t('Le')} <strong>{t('coût moyen unitaire')}</strong>{' '}
        {t(
          "est propre à chaque couple article / lieu : un même article peut valoir deux prix différents dans deux magasins, selon ce qu'on y a reçu et à quel prix. Il se déduit de la valeur et de la quantité, et n'est jamais une donnée saisie."
        )}
      </Paragraph>
    </>
  );

  const ongletJournal = (
    <>
      <FilterSheet activeCount={nbFiltresJournal} onClear={effacerFiltresJournal} title={t('Filtrer le journal')}>
        <div style={{ minWidth: 260 }}>
          <label htmlFor="journal-article">{t('Article')}</label>
          <Select
            id="journal-article"
            style={{ width: '100%' }}
            placeholder={t('Tous les articles')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={journalArticle}
            onChange={valeur => setJournalArticle(valeur as string | undefined)}
            options={optionsArticles}
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="journal-lieu">{t('Lieu')}</label>
          <Select
            id="journal-lieu"
            style={{ width: '100%' }}
            placeholder={t('Tous les lieux')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={journalLieu}
            onChange={valeur => setJournalLieu(valeur as string | undefined)}
            options={optionsLieux}
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="journal-chantier">{t('Chantier')}</label>
          <Select
            id="journal-chantier"
            style={{ width: '100%' }}
            placeholder={t('Tous les chantiers')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={journalChantier}
            onChange={valeur => setJournalChantier(valeur as string | undefined)}
            options={optionsChantiers}
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="journal-nature">{t('Nature')}</label>
          <Select
            showSearch
            optionFilterProp="label"
            id="journal-nature"
            style={{ width: '100%' }}
            placeholder={t('Toutes les natures')}
            allowClear
            value={journalNature}
            onChange={valeur => setJournalNature(valeur as StockMovementType | undefined)}
            options={(Object.keys(STOCK_MOVEMENT_TYPE_LABELS) as StockMovementType[]).map(nature => ({
              value: nature,
              label: STOCK_MOVEMENT_TYPE_LABELS[nature]
            }))}
          />
        </div>
        <div style={{ minWidth: 180 }}>
          <label htmlFor="journal-du">{t('Du')}</label>
          <DatePicker
            id="journal-du"
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            value={journalDu}
            onChange={setJournalDu}
          />
        </div>
        <div style={{ minWidth: 180 }}>
          <label htmlFor="journal-au">{t('Au')}</label>
          <DatePicker
            id="journal-au"
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            value={journalAu}
            onChange={setJournalAu}
          />
        </div>
      </FilterSheet>

      <DataView<StockMovement>
        paginated={false}
        scrollX={1800}
        items={mouvements}
        total={mouvements.length}
        page={1}
        pageSize={Math.max(mouvements.length, 1)}
        onPageChange={() => {}}
        loading={journalEnAttente}
        isReloading={journalEnRechargement && !journalEnAttente}
        error={erreurJournal ? t('Impossible de charger le journal des mouvements.') : null}
        onRetry={() => refetchJournal()}
        isFiltered={nbFiltresJournal > 0}
        onClearFilters={effacerFiltresJournal}
        emptyDescription={t("Aucun mouvement de stock n'a encore été enregistré.")}
        columns={colonnesJournal}
        rowKey={m => m.id}
        aria-label={t('Journal des mouvements de stock')}
        renderCard={m => (
          <DataCard
            title={m.itemLabel}
            aria-label={m.itemLabel}
            subtitle={`${date(m.movementDate)} — ${m.locationLabel}`}
            status={
              <StatusTag
                status={m.type}
                label={STOCK_MOVEMENT_TYPE_LABELS[m.type]}
                tone={STOCK_MOVEMENT_TYPE_TONES[m.type]}
              />
            }
            highlight={<MoneyValue value={m.totalValue} />}
            fields={[
              { label: t('Quantité'), value: `${m.isDecrease ? '−' : '+'} ${quantite(m.quantity, m.itemUnit)}` },
              { label: t('Chantier imputé'), value: m.siteLabel ?? t('Aucune imputation') },
              { label: t('Demandeur'), value: m.requestedBy ?? '—' },
              { label: t('Pièce'), value: m.supplierInvoiceReference ?? '—' }
            ]}
          />
        )}
      />
    </>
  );

  return (
    <>
      <PageHeader title={t('Stock')} subtitle={t('État du stock, réceptions, sorties et journal des mouvements')} />

      {/*
        Le piège central de ce lot, dit une fois, en haut, et jamais démenti
        plus bas : c'est la SORTIE qui impute le chantier, pas la livraison.
      */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 'var(--space-4)' }}
        message={t("C'est la sortie qui impute le chantier, pas la livraison")}
        description={t(
          "Recevoir de la marchandise fait monter le stock, et rien d'autre : aucun coût de chantier ne bouge à ce moment-là. Le matériau entre dans le coût d'un chantier le jour où il sort du magasin pour lui, à son coût moyen d'alors."
        )}
      />

      <Space wrap size="middle" style={{ marginBottom: 'var(--space-4)' }}>
        <Button icon={<PlusOutlined />} onClick={ouvrirReception}>
          {t('Enregistrer une réception')}
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={ouvrirSortie}>
          {t('Enregistrer une sortie')}
        </Button>
      </Space>

      <Tabs
        defaultActiveKey="etat"
        items={[
          { key: 'etat', label: t('État du stock'), children: ongletSoldes },
          { key: 'journal', label: t('Journal des mouvements'), children: ongletJournal }
        ]}
      />

      {/* ------------------------------------------------------------------
          Enregistrer une réception
      ------------------------------------------------------------------ */}
      <Modal
        title={t('Enregistrer une réception')}
        open={receptionOuverte}
        onCancel={() => {
          if (!receptionEnCours) setReceptionOuverte(false);
        }}
        confirmLoading={receptionEnCours}
        onOk={validerReception}
        okText={t('Enregistrer la réception')}
        okButtonProps={{ disabled: !peutRecevoir }}
        cancelText={t('Annuler')}
        destroyOnHidden
        width={820}
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {/* Dit ici aussi, parce que c'est ici qu'on se trompera. */}
          <Alert
            type="info"
            showIcon
            message={t('Une réception ne fait monter aucun coût de chantier')}
            description={t(
              "Elle enregistre des quantités et la valeur qui leur est attachée. La facture a déjà porté cette valeur ; c'est la sortie vers un chantier qui l'imputera à son coût, plus tard."
            )}
          />

          <div>
            <label htmlFor="reception-lieu">{t('Lieu de réception')}</label>
            <Select
              id="reception-lieu"
              style={{ width: '100%' }}
              placeholder={t('Choisir un lieu')}
              showSearch
              optionFilterProp="label"
              value={receptionLieu}
              onChange={valeur => setReceptionLieu(valeur as string)}
              options={optionsLieux}
              notFoundContent={t('Aucun lieu de stockage disponible')}
            />
          </div>

          <div>
            <label htmlFor="reception-fournisseur">{t('Fournisseur')}</label>
            <Select
              id="reception-fournisseur"
              style={{ width: '100%' }}
              placeholder={t('Choisir un fournisseur')}
              showSearch
              optionFilterProp="label"
              value={receptionFournisseur}
              onChange={valeur => {
                setReceptionFournisseur(valeur as string);
                setReceptionFacture(undefined);
              }}
              options={optionsFournisseurs}
            />
            <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
              {t(
                "Le fournisseur sert à retrouver sa facture : aucune liste des factures restant à réceptionner n'existe."
              )}
            </Text>
          </div>

          <div>
            <label htmlFor="reception-facture">{t('Facture validée')}</label>
            {/* Le lien est EXIGÉ (besoin S2, principe P-2) : une entrée de
                stock sans pièce est une valeur qui apparaît de nulle part.
                Seules les factures validées sont proposées — le serveur
                refuse les autres. */}
            <Select
              id="reception-facture"
              style={{ width: '100%' }}
              placeholder={receptionFournisseur ? t('Choisir une facture') : t("Choisir d'abord un fournisseur")}
              disabled={!receptionFournisseur}
              showSearch
              optionFilterProp="label"
              value={receptionFacture}
              onChange={valeur => setReceptionFacture(valeur as string)}
              options={optionsFactures}
              notFoundContent={t('Aucune facture validée pour ce fournisseur')}
            />
            <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
              {t('La facture est')} <strong>obligatoire</strong>{' '}
              {t(
                ": c'est elle qui justifie la valeur entrée en stock. Le total reçu n'a pas à égaler le montant de la facture — un écart est une donnée, que le rapprochement exposera."
              )}
            </Text>
          </div>

          <div>
            <label htmlFor="reception-date">{t('Date de réception')}</label>
            <DatePicker
              id="reception-date"
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              value={receptionDate}
              onChange={setReceptionDate}
            />
          </div>

          <div>
            <Text strong>{t('Lignes reçues')}</Text>
            <div>
              <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                <strong>{t('Une ligne par article')}</strong>
                {t(
                  ', au moins une : le coût moyen se recalcule article par article, et le serveur écrit un mouvement par ligne. Un prix unitaire à zéro est accepté — un don, une reprise, une chute récupérée entrent en stock à valeur nulle.'
                )}
              </Text>
            </div>
          </div>

          {lignes.map((ligne, index) => (
            <Card key={ligne.cle} size="small" title={t('Ligne {{value}}', { value: index + 1 })}>
              <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                <div>
                  <label htmlFor={`reception-article-${index}`}>{t('Article')}</label>
                  <Select
                    id={`reception-article-${index}`}
                    style={{ width: '100%' }}
                    placeholder={t('Choisir un article')}
                    showSearch
                    optionFilterProp="label"
                    value={ligne.itemId}
                    onChange={valeur => modifierLigne(ligne.cle, { itemId: valeur as string })}
                    options={optionsArticles}
                    notFoundContent={t('Aucun article disponible')}
                  />
                </div>
                <div>
                  <label htmlFor={`reception-quantite-${index}`}>{t('Quantité')}</label>
                  {/* Quatre décimales au plus : on reçoit des tonnes et des
                      mètres cubes, pas seulement des sacs entiers. Un
                      `precision` fixe forcerait l'affichage à quatre
                      décimales même pour un entier (« 800,0000 ») ; on
                      arrondit donc la valeur nous-mêmes plutôt que de
                      laisser le champ imposer son format. */}
                  <InputNumber
                    id={`reception-quantite-${index}`}
                    style={{ width: '100%' }}
                    min={0.0001}
                    step={1}
                    value={ligne.quantity ?? undefined}
                    onChange={valeur =>
                      modifierLigne(ligne.cle, {
                        quantity: valeur === null || valeur === undefined ? null : arrondirQuantite(valeur as number)
                      })
                    }
                  />
                </div>
                <div>
                  <label htmlFor={`reception-prix-${index}`}>{t('Prix unitaire')}</label>
                  {/* Le SEUL prix saisi de cet écran, et il est ici parce
                      qu'une entrée en stock apporte une valeur neuve. Une
                      sortie, elle, n'en saisit aucun. */}
                  <InputNumber
                    id={`reception-prix-${index}`}
                    style={{ width: '100%' }}
                    min={0}
                    step={100}
                    value={ligne.unitCost ?? undefined}
                    onChange={valeur => modifierLigne(ligne.cle, { unitCost: (valeur as number | null) ?? null })}
                    {...montantSaisiProps}
                  />
                </div>
                {lignes.length > 1 && (
                  <Button
                    type="link"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => retirerLigne(ligne.cle)}
                    aria-label={t('Retirer la ligne {{value}}', { value: index + 1 })}
                  >
                    {t('Retirer cette ligne')}
                  </Button>
                )}
              </Space>
            </Card>
          ))}

          <Button icon={<PlusOutlined />} onClick={ajouterLigne}>
            {t('Ajouter une ligne')}
          </Button>
        </Space>
      </Modal>

      {/* ------------------------------------------------------------------
          Enregistrer une sortie — le geste du lot
      ------------------------------------------------------------------ */}
      <Modal
        title={t('Enregistrer une sortie vers un chantier')}
        open={sortieOuverte}
        onCancel={() => {
          if (!sortieEnCours) setSortieOuverte(false);
        }}
        confirmLoading={sortieEnCours}
        onOk={validerSortie}
        okText={t('Enregistrer la sortie')}
        okButtonProps={{ disabled: !peutSortir }}
        cancelText={t('Annuler')}
        destroyOnHidden
        width={720}
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message={t("C'est ce geste qui impute le chantier")}
            description={t(
              "La sortie fait entrer le matériau dans le coût réel du chantier, au coût moyen du lieu avant la sortie. La livraison, elle, n'y avait rien changé."
            )}
          />

          <div>
            <label htmlFor="sortie-lieu">{t('Lieu de sortie')}</label>
            <Select
              id="sortie-lieu"
              style={{ width: '100%' }}
              placeholder={t('Choisir un lieu')}
              showSearch
              optionFilterProp="label"
              value={sortieLieu}
              onChange={valeur => setSortieLieu(valeur as string)}
              options={optionsLieux}
              notFoundContent={t('Aucun lieu de stockage disponible')}
            />
          </div>

          <div>
            <label htmlFor="sortie-article">{t('Article')}</label>
            <Select
              id="sortie-article"
              style={{ width: '100%' }}
              placeholder={t('Choisir un article')}
              showSearch
              optionFilterProp="label"
              value={sortieArticle}
              onChange={valeur => choisirArticleSortie(valeur as string)}
              options={optionsArticles}
              notFoundContent={t('Aucun article disponible')}
            />
          </div>

          <div>
            <label htmlFor="sortie-quantite">{t('Quantité')}</label>
            {/* Quatre décimales au plus, sans forcer leur affichage : voir le
                commentaire sur le même champ du formulaire de réception. */}
            <InputNumber
              id="sortie-quantite"
              style={{ width: '100%' }}
              min={0.0001}
              step={1}
              value={sortieQuantite ?? undefined}
              onChange={valeur =>
                setSortieQuantite(valeur === null || valeur === undefined ? null : arrondirQuantite(valeur as number))
              }
            />
            {/* Le stock disponible, MONTRÉ AVANT l'envoi : une sortie
                supérieure au stock est refusée, et il vaut mieux le voir ici
                que dans un message d'erreur. */}
            <div>
              {sortieArticle && sortieLieu ? (
                <Text type={sortieAuDela ? 'danger' : 'secondary'}>
                  {t('Stock disponible dans ce lieu :')} <strong>{quantite(stockDisponible, uniteSortie)}</strong>
                </Text>
              ) : (
                <Text type="secondary">
                  {t('Choisissez un lieu et un article pour voir le stock disponible avant de saisir la quantité.')}
                </Text>
              )}
            </div>
            {sortieAuDela && (
              <div style={{ marginTop: 'var(--space-2)' }}>
                <Alert
                  type="warning"
                  showIcon
                  message={t('Cette sortie dépasse le stock disponible, et sera refusée')}
                  description={t(
                    "Un stock négatif n'aurait pas de coût moyen qui veuille dire quelque chose, et toute la valorisation qui suit deviendrait fausse. Si la marchandise est bien partie, le geste juste est un inventaire, pas une sortie à découvert."
                  )}
                />
              </div>
            )}
          </div>

          {/* L'APERÇU, nommé comme tel. Voir le point 2 de l'en-tête : c'est la
              seule multiplication de cet écran, elle ne voyage pas. */}
          {apercuSortie !== null && soldeSortie && (
            <Alert
              type="info"
              message={t(
                'Aperçu : cette sortie vaudrait environ {{value}}, au coût moyen actuel de {{value2}} par {{itemUnit}}.',
                {
                  value: formatMoney(apercuSortie),
                  value2: formatMoney(soldeSortie.averageUnitCost),
                  itemUnit: soldeSortie.itemUnit
                }
              )}
              description={t(
                "Aperçu indicatif seulement. Aucun prix n'est saisi ni envoyé : le serveur valorise la sortie au coût moyen du lieu à l'instant de l'écriture, et c'est lui qui tranchera — une réception passée entre-temps aura changé ce coût."
              )}
            />
          )}

          <div>
            <label htmlFor="sortie-chantier">{t('Chantier imputé')}</label>
            <Select
              id="sortie-chantier"
              style={{ width: '100%' }}
              placeholder={t('Choisir un chantier')}
              showSearch
              optionFilterProp="label"
              value={sortieChantier}
              onChange={valeur => setSortieChantier(valeur as string)}
              options={optionsChantiers}
              notFoundContent={t('Aucun chantier disponible')}
            />
            <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
              {t("Un chantier clos n'accepte plus d'imputation : la sortie y serait refusée.")}
            </Text>
          </div>

          <div>
            <label htmlFor="sortie-poste">{t('Poste de dépense')}</label>
            {/* EXIGÉ, jamais deviné. La proposition de l'article est
                pré-sélectionnée, dite comme telle, et modifiable. */}
            <Select
              id="sortie-poste"
              style={{ width: '100%' }}
              placeholder={t('Choisir un poste')}
              showSearch
              optionFilterProp="label"
              value={sortiePoste}
              onChange={valeur => {
                setSortiePoste(valeur as string);
                setPostePropose(false);
              }}
              options={optionsPostes}
              notFoundContent={t('Aucun poste disponible')}
            />
            {articleSortie?.defaultCostCategoryLabel ? (
              <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                « {articleSortie.defaultCostCategoryLabel} {t('» est le poste')} <strong>{t('proposé')}</strong>{' '}
                {t(
                  "par cet article : une proposition seulement, pré-sélectionnée ici et libre d'être changée. C'est la sortie qui décide du poste, jamais l'article."
                )}
              </Text>
            ) : (
              <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                {t(
                  "Cet article ne propose aucun poste, et c'est un cas normal : choisissez celui de cette sortie. Le poste est"
                )}{' '}
                <strong>obligatoire</strong>.
              </Text>
            )}
          </div>

          <div>
            <label htmlFor="sortie-demandeur">{t('Demandeur')}</label>
            {/* Exigé (besoin S3) : une sortie sans demandeur est un matériau
                qui a disparu sans que personne n'en réponde. */}
            <Input
              id="sortie-demandeur"
              value={sortieDemandeur}
              onChange={event => setSortieDemandeur(event.target.value)}
              placeholder={t('Ex. Mamadou Kouassi, chef de chantier')}
            />
            <Text type={sortieDemandeur.trim() ? 'secondary' : 'danger'} style={{ fontSize: 'var(--font-size-sm)' }}>
              <strong>{t('Obligatoire')}</strong>{' '}
              {t(
                ": c'est la personne qui répond de cette marchandise. Sans nom, le matériau disparaît sans que personne n'en réponde."
              )}
            </Text>
          </div>

          <div>
            <label htmlFor="sortie-date">{t('Date de sortie')}</label>
            <DatePicker
              id="sortie-date"
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              value={sortieDate}
              onChange={setSortieDate}
            />
          </div>

          {/* Aucun champ de montant, et ce n'est pas un oubli : dit à
              l'utilisateur plutôt que laissé à deviner. */}
          <Text type="secondary">
            {t('Ce formulaire ne demande')} <strong>aucun prix</strong>
            {t(
              ", et c'est voulu : la valeur d'une sortie se déduit du coût moyen du lieu au moment où elle est enregistrée. Personne ne la saisit, personne ne la corrige à la main."
            )}
          </Text>
        </Space>
      </Modal>
    </>
  );
};

export default Stock;
