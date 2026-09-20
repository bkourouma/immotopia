import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, App, Button, DatePicker, Input, InputNumber, Modal, Select, Space, Tabs, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import {
  createStockCount,
  createStockTransfer,
  getStockCount,
  listStockBalances,
  listStockCounts,
  listStockItems,
  listStockLocations,
  removeStockCountLine,
  setStockCountLine,
  validateStockCount
} from '../../services/finance-stock-inventaire-service';
import {
  estEnEcart,
  formatQuantity,
  formatVariance,
  lignesSansMotif,
  STOCK_COUNT_STATUS_LABELS,
  STOCK_LOCATION_KIND_LABELS
} from '../../types/finance-stock-inventaire-types';
import type {
  StockCount,
  StockCountLine,
  StockCountStatus,
  StockTransfer
} from '../../types/finance-stock-inventaire-types';
import { detailKey, entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  ConfirmAction,
  DataCard,
  DataView,
  MoneyValue,
  PageHeader,
  StatCard,
  StateBlock,
  StatusTag
} from '../../components/primitives';
import { t } from '../../i18n/t';

const { Title, Text, Paragraph } = Typography;

/**
 * Transferts entre lieux et inventaire physique — lot 5, troisième sous-lot
 * (PRD E9, besoins S4 et S6 ; contrat gelé
 * `packages/api/src/lib/finance/types-lot5-inventaire.ts`, dérivé web
 * `types/finance-stock-inventaire-types.ts`).
 *
 * ---------------------------------------------------------------------------
 * Fichiers-registres, hors du territoire de cet agent
 * ---------------------------------------------------------------------------
 *
 * Cet écran n'est câblé nulle part : `App.tsx`, `navigation/model.tsx`,
 * `dev/atelier/Atelier.tsx` et `dev/atelier/mock-api.ts` appartiennent au
 * superviseur, qui les branche à l'intégration. Le chemin supposé, et lu comme
 * tel, est `/tenant/:tenantId/finance/stock/inventaire`. `tenantId` est lu dans
 * le CHEMIN (`useParams`), jamais en paramètre de requête — le défaut relevé
 * deux fois au lot 2.
 *
 * Extraits prêts à coller :
 *
 * ```tsx
 * // App.tsx
 * const StockInventaire = lazy(() => import('./pages/finance/StockInventaire'));
 * <Route path="/tenant/:tenantId/finance/stock/inventaire" element={<StockInventaire />} />
 * ```
 *
 * ```ts
 * // dev/atelier/mock-api.ts
 * import { repondreStockInventaire } from './finance-mock-stock-inventaire';
 * // dans la liste `for (const repondre of [...])` :
 * repondreStockInventaire
 * ```
 *
 * ```tsx
 * // dev/atelier/Atelier.tsx
 * const STOCK_INVENTAIRE = 'tenant/' + AGENCE + '/finance/stock/inventaire';
 * <Route
 *   path="tenant/:tenantId/finance/stock/inventaire"
 *   element={
 *     <Scene>
 *       <SessionSimulee>
 *         <StockInventaire />
 *       </SessionSimulee>
 *     </Scene>
 *   }
 * />
 * ```
 *
 * Articles, lieux et soldes sont lus **directement** par le service de ce
 * sous-lot (`GET /stock/items`, `/stock/locations`, `/stock/balances`), sans
 * passer par le service d'un sous-lot voisin encore en cours d'écriture. Le
 * doublon est assumé et consigné.
 *
 * ---------------------------------------------------------------------------
 * Le piège du sous-lot : un transfert n'impute RIEN
 * ---------------------------------------------------------------------------
 *
 * Livrer du ciment sur un chantier *ressemble* à une dépense. Ce n'en est pas
 * une : la matière reste à l'actif de l'agence, simplement ailleurs, et le coût
 * du chantier ne bouge pas d'un franc. Seule la SORTIE impute (principe P-7).
 * Quelqu'un qui croirait l'inverse se tromperait sur ses chiffres — il verrait
 * un chantier coûteux qui n'a encore rien consommé, et il le verrait au moment
 * où il fixe un prix. L'écran l'écrit donc en haut de l'onglet, avant le
 * formulaire, et le répète sur le reçu du transfert : `value` y est la valeur
 * **déplacée**, au coût moyen du lieu d'origine, jamais une charge.
 *
 * ---------------------------------------------------------------------------
 * Ce que l'écran ne calcule pas, et ne saisit pas
 * ---------------------------------------------------------------------------
 *
 * - **`expectedQuantity` n'est jamais saisie.** Le formulaire de ligne demande
 *   l'article, la quantité comptée et le motif — rien d'autre. Le serveur lit
 *   l'attendu dans le stock au moment de la saisie et le fige (principe P-4) ;
 *   son schéma est `.strict()` et refuserait le champ. Ce que l'écran affiche
 *   à côté du sélecteur d'article est le stock **à cet instant**, une
 *   prévenance de lecture, et il le dit ainsi.
 * - **`variance` et `varianceValue` arrivent calculées.** L'écran les affiche
 *   telles quelles. Sur un inventaire validé, le serveur fait autorité sur ce
 *   qui s'est réellement passé ; un écran qui referait la soustraction dirait
 *   la même chose par accident, et autre chose le jour où le serveur changera
 *   d'avis.
 * - **Aucun montant n'est calculé ici** (principe P-4).
 *
 * ---------------------------------------------------------------------------
 * Une quantité n'est pas un montant
 * ---------------------------------------------------------------------------
 *
 * Les quantités portent quatre décimales : un quart de mètre cube vaut 0,25 et
 * ne doit pas s'afficher « 0 ». Toutes passent par `formatQuantity` ou
 * `formatVariance` ; `<MoneyValue>` et `formatMoney` ne servent qu'aux valeurs,
 * jamais aux quantités.
 *
 * ---------------------------------------------------------------------------
 * Valider est irréversible, et écrase ce qui a bougé depuis le comptage
 * ---------------------------------------------------------------------------
 *
 * La validation écrit un vrai mouvement d'ajustement par ligne en écart, et
 * **aucune route ne la défait** : un comptage erroné se corrige par un second
 * comptage. Aucun bouton d'annulation n'est donc offert, et la confirmation le
 * dit.
 *
 * Elle ramène par ailleurs le stock à ce qui a été COMPTÉ, pas à un écart
 * recalculé : si de la matière a bougé entre le comptage et la validation,
 * l'ajustement écrase ce mouvement. C'est le comportement voulu — le comptage
 * physique fait foi — mais il faut le savoir, et la confirmation le dit aussi.
 *
 * **Un écart sans motif ne se valide pas** (besoin S6). L'écran liste les
 * lignes fautives et désactive la validation tant qu'il en reste, plutôt que
 * de laisser se heurter à un refus sec qui n'apprend rien. Le serveur reste la
 * seule autorité, et son message est relayé tel quel s'il tombe quand même.
 *
 * **Vocabulaire (P-1 du PRD).** On *transfère* de la matière, on *compte* un
 * lieu, on *justifie* un écart, on *valide* un inventaire — jamais « débit » ni
 * « crédit ».
 */

function messageErreur(err: unknown, secours: string): string {
  const reponse = (err as { response?: { data?: { message?: string } } })?.response;
  return reponse?.data?.message || secours;
}

function dateCourte(iso: string | null): string {
  if (!iso) return '—';
  return dayjs(iso).format('DD/MM/YYYY');
}

/** Ce que porte le formulaire d'une ligne de comptage. Pas d'attendu : voir l'en-tête. */
interface SaisieLigne {
  itemId: string | undefined;
  countedQuantity: number | null;
  reason: string;
}

const LIGNE_VIDE: SaisieLigne = { itemId: undefined, countedQuantity: null, reason: '' };

export const StockInventaire: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------
  // Référentiels partagés par les deux onglets
  // ---------------------------------------------------------------------

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

  const optionsArticles = useMemo(
    () => (articles ?? []).map(a => ({ value: a.id, label: `${a.reference} — ${a.label}` })),
    [articles]
  );

  const optionsLieux = useMemo(
    () =>
      (lieux ?? []).map(l => ({
        value: l.id,
        label: `${l.label} (${STOCK_LOCATION_KIND_LABELS[l.kind]})`
      })),
    [lieux]
  );

  const uniteDe = (itemId: string | undefined): string | null =>
    (articles ?? []).find(a => a.id === itemId)?.unit ?? null;

  // ---------------------------------------------------------------------
  // Onglet « Transfert »
  // ---------------------------------------------------------------------

  const [origine, setOrigine] = useState<string | undefined>(undefined);
  const [arrivee, setArrivee] = useState<string | undefined>(undefined);
  const [articleTransfere, setArticleTransfere] = useState<string | undefined>(undefined);
  const [quantiteTransferee, setQuantiteTransferee] = useState<number | null>(null);
  const [dateTransfert, setDateTransfert] = useState<Dayjs | null>(dayjs());
  const [transfertEnCours, setTransfertEnCours] = useState(false);
  /** Le dernier transfert écrit. Aucune lecture ne le rend : il vient de la réponse. */
  const [dernierTransfert, setDernierTransfert] = useState<StockTransfer | null>(null);

  /**
   * Ce qu'il reste au lieu d'ORIGINE. Prévenance, pas autorité : la liste peut
   * être en retard d'un mouvement, et c'est le serveur qui refuse.
   */
  const { data: soldesOrigine } = useQuery({
    queryKey: queryKey('stock-balances', tenantId, { locationId: origine }),
    queryFn: () => listStockBalances(tenantId as string, { locationId: origine as string }),
    enabled: Boolean(tenantId && origine),
    staleTime: STALE_TIME.list
  });

  const soldeArticleOrigine = useMemo(
    () => (soldesOrigine ?? []).find(solde => solde.itemId === articleTransfere) ?? null,
    [soldesOrigine, articleTransfere]
  );

  const memeLieu = Boolean(origine && arrivee && origine === arrivee);
  const quantiteAuDela = Boolean(
    soldeArticleOrigine && quantiteTransferee !== null && quantiteTransferee > soldeArticleOrigine.quantity
  );
  const transfertPret = Boolean(
    origine &&
    arrivee &&
    !memeLieu &&
    articleTransfere &&
    quantiteTransferee !== null &&
    quantiteTransferee > 0 &&
    dateTransfert
  );

  const transferer = async () => {
    if (!tenantId || !transfertPret || !dateTransfert) return;
    setTransfertEnCours(true);
    try {
      const transfert = await createStockTransfer(tenantId, {
        fromLocationId: origine as string,
        toLocationId: arrivee as string,
        itemId: articleTransfere as string,
        quantity: quantiteTransferee as number,
        transferDate: dateTransfert.format('YYYY-MM-DD')
      });
      setDernierTransfert(transfert);
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-balances', tenantId) });
      message.success(t('Transfert enregistré : la matière a changé de lieu.'));
      setQuantiteTransferee(null);
    } catch (err) {
      // Même lieu, quantité supérieure au stock, lieu désactivé : le serveur
      // est la seule autorité, son message est relayé tel quel.
      message.error(messageErreur(err, t("Le transfert n'a pas pu être enregistré.")));
    } finally {
      setTransfertEnCours(false);
    }
  };

  // ---------------------------------------------------------------------
  // Onglet « Inventaire »
  // ---------------------------------------------------------------------

  const [lieuFiltre, setLieuFiltre] = useState<string | undefined>(undefined);
  const [statutFiltre, setStatutFiltre] = useState<StockCountStatus | undefined>(undefined);
  const filtresComptages = { locationId: lieuFiltre, status: statutFiltre };

  const {
    data: comptages,
    isPending: comptagesEnAttente,
    isFetching: comptagesEnRechargement,
    error: erreurComptages,
    refetch: refetchComptages
  } = useQuery({
    queryKey: queryKey('stock-counts', tenantId, filtresComptages),
    queryFn: () => listStockCounts(tenantId as string, filtresComptages),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const [comptageOuvert, setComptageOuvert] = useState<string | null>(null);

  const {
    data: comptage,
    isPending: comptageEnAttente,
    error: erreurComptage,
    refetch: refetchComptage
  } = useQuery({
    queryKey: detailKey('stock-counts', tenantId, comptageOuvert ?? ''),
    queryFn: () => getStockCount(tenantId as string, comptageOuvert as string),
    enabled: Boolean(tenantId && comptageOuvert),
    staleTime: STALE_TIME.list
  });

  /** Le stock du lieu compté, pour annoncer ce que le système dit à cet instant. */
  const { data: soldesComptage } = useQuery({
    queryKey: queryKey('stock-balances', tenantId, { locationId: comptage?.locationId }),
    queryFn: () => listStockBalances(tenantId as string, { locationId: comptage?.locationId as string }),
    enabled: Boolean(tenantId && comptage?.locationId),
    staleTime: STALE_TIME.list
  });

  // --- Ouvrir un comptage ------------------------------------------------

  const [ouvertureVisible, setOuvertureVisible] = useState(false);
  const [lieuCompte, setLieuCompte] = useState<string | undefined>(undefined);
  const [dateComptage, setDateComptage] = useState<Dayjs | null>(dayjs());
  const [ouvertureEnCours, setOuvertureEnCours] = useState(false);

  const ouvrirComptage = async () => {
    if (!tenantId || !lieuCompte || !dateComptage) return;
    setOuvertureEnCours(true);
    try {
      const cree = await createStockCount(tenantId, {
        locationId: lieuCompte,
        countedAt: dateComptage.format('YYYY-MM-DD')
      });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-counts', tenantId) });
      message.success(t('Comptage ouvert sur « {{locationLabel}} ».', { locationLabel: cree.locationLabel }));
      setOuvertureVisible(false);
      setComptageOuvert(cree.id);
    } catch (err) {
      // « Un inventaire est déjà en brouillon sur ce lieu » : relayé tel quel.
      message.error(messageErreur(err, t("Le comptage n'a pas pu être ouvert.")));
    } finally {
      setOuvertureEnCours(false);
    }
  };

  // --- Saisir une ligne --------------------------------------------------

  const [saisieLigne, setSaisieLigne] = useState<SaisieLigne>(LIGNE_VIDE);
  const [ligneEnCours, setLigneEnCours] = useState(false);

  const soldeArticleCompte = useMemo(
    () => (soldesComptage ?? []).find(solde => solde.itemId === saisieLigne.itemId) ?? null,
    [soldesComptage, saisieLigne.itemId]
  );

  const lignePrete = Boolean(
    saisieLigne.itemId && saisieLigne.countedQuantity !== null && saisieLigne.countedQuantity >= 0
  );

  const invaliderComptage = async () => {
    await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-counts', tenantId) });
    if (comptageOuvert) {
      await queryClient.invalidateQueries({ queryKey: detailKey('stock-counts', tenantId, comptageOuvert) });
    }
  };

  const enregistrerLigne = async () => {
    if (!tenantId || !comptageOuvert || !lignePrete) return;
    setLigneEnCours(true);
    try {
      // Le corps ne porte que l'article, la quantité comptée et — s'il y en a
      // un — le motif. Jamais `expectedQuantity` : le serveur la lit et la fige.
      await setStockCountLine(tenantId, comptageOuvert, {
        itemId: saisieLigne.itemId as string,
        countedQuantity: saisieLigne.countedQuantity as number,
        reason: saisieLigne.reason
      });
      await invaliderComptage();
      message.success(t('Comptage de l’article enregistré.'));
      setSaisieLigne(LIGNE_VIDE);
    } catch (err) {
      message.error(messageErreur(err, t("La ligne de comptage n'a pas pu être enregistrée.")));
    } finally {
      setLigneEnCours(false);
    }
  };

  /** Reprendre une ligne déjà saisie : le PUT la remplacera. */
  const reprendreLigne = (ligne: StockCountLine) => {
    setSaisieLigne({
      itemId: ligne.itemId,
      countedQuantity: ligne.countedQuantity,
      reason: ligne.reason ?? ''
    });
  };

  const retirerLigne = async (ligne: StockCountLine) => {
    if (!tenantId || !comptageOuvert) return;
    try {
      await removeStockCountLine(tenantId, comptageOuvert, ligne.itemId);
      await invaliderComptage();
      message.success(t('Ligne « {{itemReference}} » retirée du comptage.', { itemReference: ligne.itemReference }));
    } catch (err) {
      message.error(messageErreur(err, t("La ligne n'a pas pu être retirée.")));
    }
  };

  // --- Valider -----------------------------------------------------------

  const [validationEnCours, setValidationEnCours] = useState(false);

  const lignesAJustifier = useMemo(() => lignesSansMotif(comptage), [comptage]);
  const comptageVide = Boolean(comptage && comptage.lines.length === 0);
  const validationPossible = Boolean(
    comptage && comptage.status === 'DRAFT' && !comptageVide && lignesAJustifier.length === 0
  );

  const valider = async () => {
    if (!tenantId || !comptageOuvert) return;
    setValidationEnCours(true);
    try {
      await validateStockCount(tenantId, comptageOuvert);
      await invaliderComptage();
      message.success(t('Inventaire validé : les écarts sont devenus des ajustements de stock.'));
    } catch (err) {
      // Le serveur reste la seule autorité : écart sans motif, comptage vide,
      // inventaire déjà validé. Son message est relayé tel quel.
      message.error(messageErreur(err, t("L'inventaire n'a pas pu être validé.")));
    } finally {
      setValidationEnCours(false);
    }
  };

  // ---------------------------------------------------------------------

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const listeComptages = comptages ?? [];

  // =====================================================================
  // Onglet « Transfert »
  // =====================================================================

  const ongletTransfert = (
    <>
      {/*
        La mention la plus importante de cet onglet, et elle est AVANT le
        formulaire parce qu'elle dit comment lire ce qu'on s'apprête à faire.
      */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 'var(--space-4)' }}
        message={t('Un transfert n’impute rien : ce n’est pas une dépense.')}
        description={t(
          'Déplacer de la matière vers le lieu d’un chantier ne la consomme pas. Elle reste à l’actif de l’agence, simplement ailleurs, et le coût du chantier ne bouge pas d’un franc. Seule la sortie de stock impute un chantier. La valeur affichée après le transfert est la valeur déplacée, au coût moyen du lieu d’origine — jamais une charge.'
        )}
      />

      <Space wrap size="middle" align="start" style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ minWidth: 260 }}>
          <div>
            <label htmlFor="transfert-origine">{t('Lieu d’origine')}</label>
          </div>
          <Select
            id="transfert-origine"
            style={{ width: 260 }}
            placeholder={t('Choisir le lieu d’origine')}
            value={origine}
            onChange={valeur => setOrigine(valeur)}
            options={optionsLieux}
            notFoundContent={t('Aucun lieu de stockage disponible')}
          />
        </div>
        <div style={{ minWidth: 260 }}>
          <div>
            <label htmlFor="transfert-arrivee">{t('Lieu d’arrivée')}</label>
          </div>
          <Select
            id="transfert-arrivee"
            style={{ width: 260 }}
            placeholder={t('Choisir le lieu d’arrivée')}
            value={arrivee}
            onChange={valeur => setArrivee(valeur)}
            options={optionsLieux}
            notFoundContent={t('Aucun lieu de stockage disponible')}
          />
        </div>
        <div style={{ minWidth: 260 }}>
          <div>
            <label htmlFor="transfert-article">{t('Article transféré')}</label>
          </div>
          <Select
            id="transfert-article"
            style={{ width: 260 }}
            showSearch
            optionFilterProp="label"
            placeholder={t('Choisir un article')}
            value={articleTransfere}
            onChange={valeur => setArticleTransfere(valeur)}
            options={optionsArticles}
            notFoundContent={t('Aucun article disponible')}
          />
        </div>
        <div>
          <div>
            <label htmlFor="transfert-quantite">{t('Quantité')}</label>
          </div>
          {/* Quatre décimales : on déplace des mètres cubes et des tonnes. */}
          <InputNumber
            id="transfert-quantite"
            min={0}
            step={0.25}
            style={{ width: 180 }}
            value={quantiteTransferee ?? undefined}
            onChange={valeur => setQuantiteTransferee((valeur as number | null) ?? null)}
            addonAfter={uniteDe(articleTransfere) ?? undefined}
          />
        </div>
        <div>
          <div>
            <label htmlFor="transfert-date">{t('Date du transfert')}</label>
          </div>
          <DatePicker
            id="transfert-date"
            style={{ width: 180 }}
            format="DD/MM/YYYY"
            value={dateTransfert}
            onChange={valeur => setDateTransfert(valeur)}
          />
        </div>
      </Space>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        {articleTransfere && origine ? (
          <Text type="secondary">
            {t('Au lieu d’origine, il reste')}{' '}
            <strong>
              {formatQuantity(
                soldeArticleOrigine?.quantity ?? 0,
                soldeArticleOrigine?.itemUnit ?? uniteDe(articleTransfere)
              )}
            </strong>
            . C’est une prévenance de lecture : c’est le serveur qui refuse une quantité supérieure au stock.
          </Text>
        ) : (
          <Text type="secondary">{t('Choisissez un lieu d’origine et un article pour voir ce qu’il y reste.')}</Text>
        )}
      </div>

      {memeLieu && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 'var(--space-3)' }}
          message={t('Le lieu d’origine et le lieu d’arrivée sont les mêmes.')}
          description={t(
            'Un transfert déplace de la matière d’un lieu vers un autre. Choisissez deux lieux différents.'
          )}
        />
      )}

      {quantiteAuDela && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 'var(--space-3)' }}
          message={t('La quantité dépasse ce qu’il reste au lieu d’origine.')}
          description={t(
            'Le serveur refusera ce transfert. Vérifiez la quantité, ou enregistrez d’abord la réception qui manque.'
          )}
        />
      )}

      <Button type="primary" loading={transfertEnCours} disabled={!transfertPret} onClick={transferer}>
        {t('Enregistrer le transfert')}
      </Button>

      {dernierTransfert && (
        <div style={{ marginTop: 'var(--space-5)' }}>
          <Title level={5}>{t('Dernier transfert enregistré')}</Title>
          <Paragraph>
            <strong>{formatQuantity(dernierTransfert.quantity, dernierTransfert.movements[0]?.itemUnit)}</strong>{' '}
            {t('de «')} {dernierTransfert.movements[0]?.itemLabel ?? '—'} {t('», de «')}{' '}
            {dernierTransfert.fromLocationLabel} {t('» vers «')} {dernierTransfert.toLocationLabel} ».
          </Paragraph>
          <StatCard
            label={t('Valeur déplacée')}
            value={<MoneyValue value={dernierTransfert.value} currency={dernierTransfert.currency} />}
            hint={t('Au coût moyen du lieu d’origine. Ce n’est pas une dépense, et aucun chantier n’a été imputé.')}
          />
          <Paragraph type="secondary" style={{ marginTop: 'var(--space-3)' }}>
            {t(
              'Le transfert s’écrit en deux mouvements liés : une sortie du lieu d’origine, une entrée au lieu d’arrivée. La somme des valeurs des deux lieux ne bouge pas.'
            )}
          </Paragraph>
          <ul style={{ paddingInlineStart: 'var(--space-5)' }}>
            {dernierTransfert.movements.map(mouvement => (
              <li key={mouvement.id}>
                {mouvement.isDecrease ? t('Sortie de') : t('Entrée à')} « {mouvement.locationLabel} » :{' '}
                {formatQuantity(mouvement.quantity, mouvement.itemUnit)} {t('— il y reste')}{' '}
                {formatQuantity(mouvement.quantityAfter, mouvement.itemUnit)}.
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  // =====================================================================
  // Onglet « Inventaire »
  // =====================================================================

  const colonnesComptages: ColumnsType<StockCount> = [
    { title: t('Lieu'), key: 'lieu', render: (_, c) => c.locationLabel },
    { title: t('Compté le'), key: 'date', render: (_, c) => dateCourte(c.countedAt) },
    { title: t('État'), key: 'etat', render: (_, c) => <StatusTag status={c.status} /> },
    { title: t('Lignes'), key: 'lignes', align: 'end', render: (_, c) => c.lines.length },
    {
      title: t('Lignes en écart'),
      key: 'ecarts',
      align: 'end',
      // Calculé par le serveur : jamais recompté ici.
      render: (_, c) => c.varianceCount
    },
    {
      title: t('Valeur de l’écart'),
      key: 'valeur',
      align: 'end',
      render: (_, c) => <MoneyValue value={c.varianceValue} currency={c.currency} signed />
    },
    { title: t('Ouvert par'), key: 'auteur', render: (_, c) => c.createdByLabel },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, c) => (
        <Button type="link" onClick={() => setComptageOuvert(c.id)}>
          {c.status === 'DRAFT' ? t('Poursuivre le comptage') : t('Consulter')}
        </Button>
      )
    }
  ];

  const colonnesLignes: ColumnsType<StockCountLine> = [
    { title: t('Article'), key: 'article', render: (_, l) => `${l.itemReference} — ${l.itemLabel}` },
    {
      // Figée à la saisie : ce que le système disait au moment où l'on a
      // compté, pas ce qu'il dit aujourd'hui.
      title: t('Ce que le système disait'),
      key: 'attendu',
      align: 'end',
      render: (_, l) => formatQuantity(l.expectedQuantity, l.itemUnit)
    },
    {
      title: t('Compté'),
      key: 'compte',
      align: 'end',
      render: (_, l) => formatQuantity(l.countedQuantity, l.itemUnit)
    },
    {
      title: t('Écart'),
      key: 'ecart',
      align: 'end',
      // Affiché tel que le serveur l'a calculé.
      render: (_, l) => (
        <Text type={estEnEcart(l) ? 'warning' : undefined}>
          <strong>{formatVariance(l.variance, l.itemUnit)}</strong>
        </Text>
      )
    },
    {
      title: t('Motif'),
      key: 'motif',
      render: (_, l) =>
        l.reason ? (
          l.reason
        ) : estEnEcart(l) ? (
          <Text type="danger">{t('Motif à justifier')}</Text>
        ) : (
          <Text type="secondary">{t('Aucun écart à justifier')}</Text>
        )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, l) =>
        comptage?.status === 'DRAFT' ? (
          <Space>
            <Button type="link" onClick={() => reprendreLigne(l)}>
              {t('Reprendre')}
            </Button>
            <ConfirmAction
              title={t('Retirer « {{itemReference}} » du comptage ?', { itemReference: l.itemReference })}
              description={t(
                'La ligne disparaît du comptage. Le stock n’est pas touché : rien n’a encore été ajusté tant que l’inventaire n’est pas validé.'
              )}
              okText={t('Confirmer le retrait')}
              danger
              onConfirm={() => retirerLigne(l)}
            >
              <Button type="link" danger>
                {t('Retirer')}
              </Button>
            </ConfirmAction>
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        )
    }
  ];

  const detailComptage = () => {
    if (!comptageOuvert) return null;

    if (erreurComptage) {
      return (
        <StateBlock
          variant="error"
          description={t('Impossible de charger ce comptage.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetchComptage(), primary: true }]}
        />
      );
    }

    if (comptageEnAttente || !comptage) {
      return <StateBlock variant="loading" />;
    }

    const brouillon = comptage.status === 'DRAFT';

    return (
      <div style={{ marginTop: 'var(--space-6)' }}>
        <Space align="center" wrap style={{ marginBottom: 'var(--space-3)' }}>
          <Title level={4} style={{ margin: 0 }}>
            {t('Comptage de «')} {comptage.locationLabel} {t('» du')} {dateCourte(comptage.countedAt)}
          </Title>
          <StatusTag status={comptage.status} />
          <Button type="link" onClick={() => setComptageOuvert(null)}>
            {t('Fermer ce comptage')}
          </Button>
        </Space>

        {!brouillon && (
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 'var(--space-4)' }}
            message={t('Inventaire validé le {{value}} : les écarts sont devenus des ajustements de stock.', {
              value: dateCourte(comptage.validatedAt)
            })}
            description={t(
              'Cet inventaire ne s’annule pas. Ses ajustements sont des mouvements de stock comme les autres, et les défaire demanderait de rejouer tout ce qui a suivi. Un comptage erroné se corrige par un second comptage sur le même lieu.'
            )}
          />
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-5)'
          }}
        >
          <StatCard label={t('Articles comptés')} value={String(comptage.lines.length)} />
          {/* Compté par le serveur, jamais recompté ici. */}
          <StatCard
            label={t('Lignes en écart')}
            value={String(comptage.varianceCount)}
            tone={comptage.varianceCount > 0 ? 'warning' : 'neutral'}
          />
          <StatCard
            label={t('Valeur de l’écart')}
            value={<MoneyValue value={comptage.varianceValue} currency={comptage.currency} signed />}
            hint={
              brouillon
                ? t('Estimée : le coût moyen peut encore bouger d’ici la validation.')
                : t('Au coût moyen retenu à la validation.')
            }
          />
        </div>

        {brouillon && (
          <div
            style={{
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4)',
              marginBottom: 'var(--space-5)'
            }}
          >
            <Title level={5} style={{ marginTop: 0 }}>
              {t('Saisir le comptage d’un article')}
            </Title>
            <Space wrap size="middle" align="start">
              <div>
                <div>
                  <label htmlFor="ligne-article">{t('Article compté')}</label>
                </div>
                <Select
                  id="ligne-article"
                  style={{ width: 280 }}
                  showSearch
                  optionFilterProp="label"
                  placeholder={t('Choisir un article')}
                  value={saisieLigne.itemId}
                  onChange={valeur => setSaisieLigne({ ...saisieLigne, itemId: valeur })}
                  options={optionsArticles}
                  notFoundContent={t('Aucun article disponible')}
                />
              </div>
              <div>
                <div>
                  <label htmlFor="ligne-quantite">{t('Quantité comptée')}</label>
                </div>
                {/* Le zéro est un résultat de comptage : « on a regardé, il n’y
                    a rien ». Seul le négatif est refusé. */}
                <InputNumber
                  id="ligne-quantite"
                  min={0}
                  step={0.25}
                  style={{ width: 200 }}
                  value={saisieLigne.countedQuantity ?? undefined}
                  onChange={valeur =>
                    setSaisieLigne({ ...saisieLigne, countedQuantity: (valeur as number | null) ?? null })
                  }
                  addonAfter={uniteDe(saisieLigne.itemId) ?? undefined}
                />
              </div>
              <div>
                <div>
                  <label htmlFor="ligne-motif">{t('Motif de l’écart (facultatif à la saisie)')}</label>
                </div>
                <Input
                  id="ligne-motif"
                  style={{ width: 320 }}
                  placeholder={t('Ex. casse au déchargement, vol constaté, perte')}
                  value={saisieLigne.reason}
                  onChange={event => setSaisieLigne({ ...saisieLigne, reason: event.target.value })}
                />
              </div>
              <Button type="primary" loading={ligneEnCours} disabled={!lignePrete} onClick={enregistrerLigne}>
                {t('Enregistrer le comptage')}
              </Button>
            </Space>

            <Paragraph type="secondary" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
              {saisieLigne.itemId ? (
                <>
                  {t('Le système dit qu’il y a')}{' '}
                  <strong>
                    {formatQuantity(
                      soldeArticleCompte?.quantity ?? 0,
                      soldeArticleCompte?.itemUnit ?? uniteDe(saisieLigne.itemId)
                    )}
                  </strong>{' '}
                  {t('à cet instant.')}{' '}
                </>
              ) : null}
              <strong>{t('La quantité attendue ne se saisit pas')}</strong>{' '}
              {t(
                ': le serveur la lit dans le stock au moment où la ligne est enregistrée, et la fige. Comparer le comptage d’hier au stock d’aujourd’hui ferait lire une sortie enregistrée entre-temps comme une perte. Saisir le même article une seconde fois remplace son comptage, il ne s’ajoute pas.'
              )}
            </Paragraph>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t('Le motif peut attendre : on compte une allée d’abord, on explique ensuite. Il deviendra')}{' '}
              <strong>{t('obligatoire pour toute ligne en écart')}</strong> {t('au moment de valider.')}
            </Paragraph>
          </div>
        )}

        <DataView<StockCountLine>
          paginated={false}
          scrollX={1100}
          items={comptage.lines}
          total={comptage.lines.length}
          page={1}
          pageSize={Math.max(comptage.lines.length, 1)}
          onPageChange={() => {}}
          emptyDescription={t('Ce comptage ne porte encore aucune ligne. Saisissez le premier article compté.')}
          columns={colonnesLignes}
          rowKey={l => l.id}
          aria-label={t('Lignes du comptage')}
          renderCard={l => (
            <DataCard
              title={l.itemReference}
              aria-label={l.itemReference}
              subtitle={l.itemLabel}
              highlight={formatVariance(l.variance, l.itemUnit)}
              fields={[
                { label: t('Ce que le système disait'), value: formatQuantity(l.expectedQuantity, l.itemUnit) },
                { label: t('Compté'), value: formatQuantity(l.countedQuantity, l.itemUnit) },
                {
                  label: 'Motif',
                  value: l.reason ?? (estEnEcart(l) ? t('Motif à justifier') : t('Aucun écart à justifier'))
                }
              ]}
              {...(comptage.status === 'DRAFT'
                ? { primaryAction: { label: t('Reprendre'), onClick: () => reprendreLigne(l) } }
                : {})}
            />
          )}
        />

        {brouillon && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <Title level={5}>{t('Valider l’inventaire')}</Title>

            {comptageVide && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 'var(--space-3)' }}
                message={t('Ce comptage ne porte aucune ligne.')}
                description={t(
                  'Valider un comptage vide ne dirait rien, et pourrait se lire comme « tout est conforme ». Saisissez au moins un article compté.'
                )}
              />
            )}

            {/*
              Dit AVANT l'envoi (besoin S6) : se heurter à un refus sec après
              avoir cliqué n'apprend pas ce qu'il faut faire.
            */}
            {lignesAJustifier.length > 0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 'var(--space-3)' }}
                message={t('{{length}} ligne{{value}} en écart {{value2}} sans motif : la validation est impossible.', {
                  length: lignesAJustifier.length,
                  value: lignesAJustifier.length > 1 ? 's' : '',
                  value2: lignesAJustifier.length > 1 ? 'restent' : 'reste'
                })}
                description={
                  <>
                    <div>
                      {t(
                        'Un écart est une perte ou un gain réel. Sans motif, il deviendrait une ligne de tableau que personne ne relira. Reprenez chacune de ces lignes pour dire ce qui s’est passé : casse, perte, vol, erreur de saisie.'
                      )}
                    </div>
                    <ul style={{ margin: 0, paddingInlineStart: 'var(--space-5)' }}>
                      {lignesAJustifier.map(ligne => (
                        <li key={ligne.id}>
                          {ligne.itemReference} — {ligne.itemLabel} {t(': écart de')}{' '}
                          {formatVariance(ligne.variance, ligne.itemUnit)}
                        </li>
                      ))}
                    </ul>
                  </>
                }
              />
            )}

            {validationPossible ? (
              <ConfirmAction
                title={t('Valider l’inventaire de « {{locationLabel}} » ?', { locationLabel: comptage.locationLabel })}
                description={
                  <span>
                    <strong>{t('Cette opération est irréversible.')}</strong>{' '}
                    {t(
                      'Chaque ligne en écart, et seulement celles-là, produira un vrai mouvement d’ajustement qui ramènera le stock à la quantité comptée. Aucun geste ne défait un inventaire validé : un comptage erroné se corrige par un second comptage.'
                    )}{' '}
                    <strong>
                      {t('Si de la matière a bougé sur ce lieu depuis le comptage, l’ajustement écrasera ce mouvement')}
                    </strong>{' '}
                    {t(
                      '— le comptage physique fait foi. Aucun chantier ne sera imputé : personne n’a décidé de consommer ce qui a disparu.'
                    )}
                  </span>
                }
                okText={t('Confirmer la validation')}
                onConfirm={valider}
              >
                <Button type="primary" loading={validationEnCours}>
                  {t('Valider l’inventaire')}
                </Button>
              </ConfirmAction>
            ) : (
              <Button type="primary" disabled>
                {t('Valider l’inventaire')}
              </Button>
            )}

            <Paragraph type="secondary" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
              {t('La validation ramène le stock à ce qui a été')} <strong>{t('compté')}</strong>
              {t(', pas à un écart recalculé. Elle est définitive, et aucun bouton ne l’annule.')}
            </Paragraph>
          </div>
        )}
      </div>
    );
  };

  const ongletInventaire = (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 'var(--space-4)' }}
        message={t('Un inventaire se saisit en brouillon, article par article, puis se valide.')}
        description={t(
          'Rien ne bouge dans le stock tant qu’il n’est pas validé. À la validation, chaque ligne en écart produit un ajustement qui ramène le stock à la quantité comptée — et l’inventaire ne s’annule plus.'
        )}
      />

      <Space wrap size="middle" style={{ marginBottom: 'var(--space-3)' }}>
        <div>
          <div>
            <label htmlFor="comptages-lieu">{t('Lieu')}</label>
          </div>
          <Select
            id="comptages-lieu"
            style={{ width: 260 }}
            allowClear
            placeholder={t('Tous les lieux')}
            value={lieuFiltre}
            onChange={valeur => setLieuFiltre(valeur ?? undefined)}
            options={optionsLieux}
          />
        </div>
        <div>
          <div>
            <label htmlFor="comptages-statut">{t('État')}</label>
          </div>
          <Select
            id="comptages-statut"
            style={{ width: 200 }}
            allowClear
            placeholder={t('Tous les états')}
            value={statutFiltre}
            onChange={valeur => setStatutFiltre((valeur as StockCountStatus | undefined) ?? undefined)}
            options={[
              { value: 'DRAFT', label: STOCK_COUNT_STATUS_LABELS.DRAFT },
              { value: 'VALIDATED', label: STOCK_COUNT_STATUS_LABELS.VALIDATED }
            ]}
          />
        </div>
        <Button
          type="primary"
          onClick={() => {
            setLieuCompte(undefined);
            setDateComptage(dayjs());
            setOuvertureVisible(true);
          }}
        >
          {t('Ouvrir un comptage')}
        </Button>
      </Space>

      <DataView<StockCount>
        paginated={false}
        scrollX={1200}
        items={listeComptages}
        total={listeComptages.length}
        page={1}
        pageSize={Math.max(listeComptages.length, 1)}
        onPageChange={() => {}}
        loading={comptagesEnAttente}
        isReloading={comptagesEnRechargement && !comptagesEnAttente}
        error={erreurComptages ? t('Impossible de charger les inventaires.') : null}
        onRetry={() => refetchComptages()}
        isFiltered={Boolean(lieuFiltre || statutFiltre)}
        onClearFilters={() => {
          setLieuFiltre(undefined);
          setStatutFiltre(undefined);
        }}
        emptyDescription={t('Aucun inventaire n’a encore été ouvert.')}
        emptyAction={{ label: t('Ouvrir un comptage'), onClick: () => setOuvertureVisible(true) }}
        columns={colonnesComptages}
        rowKey={c => c.id}
        aria-label={t('Inventaires')}
        renderCard={c => (
          <DataCard
            title={c.locationLabel}
            aria-label={c.locationLabel}
            subtitle={t('Compté le {{value}}', { value: dateCourte(c.countedAt) })}
            status={<StatusTag status={c.status} />}
            highlight={<MoneyValue value={c.varianceValue} currency={c.currency} signed />}
            fields={[
              { label: 'Lignes', value: String(c.lines.length) },
              { label: t('Lignes en écart'), value: String(c.varianceCount) },
              { label: t('Ouvert par'), value: c.createdByLabel }
            ]}
            primaryAction={{
              label: c.status === 'DRAFT' ? t('Poursuivre le comptage') : 'Consulter',
              onClick: () => setComptageOuvert(c.id)
            }}
          />
        )}
      />

      {detailComptage()}
    </>
  );

  return (
    <>
      <PageHeader
        title={t('Transferts et inventaire du stock')}
        subtitle={t('Déplacer de la matière d’un lieu à un autre, et compter ce qui s’y trouve')}
      />

      <Tabs
        defaultActiveKey="transfert"
        items={[
          { key: 'transfert', label: t('Transfert entre lieux'), children: ongletTransfert },
          { key: 'inventaire', label: t('Inventaire physique'), children: ongletInventaire }
        ]}
      />

      {/* ------------------------------------------------------------------
          Ouvrir un comptage
      ------------------------------------------------------------------ */}
      <Modal
        title={t('Ouvrir un comptage')}
        open={ouvertureVisible}
        onCancel={() => {
          if (!ouvertureEnCours) setOuvertureVisible(false);
        }}
        confirmLoading={ouvertureEnCours}
        onOk={ouvrirComptage}
        okText={t('Ouvrir le comptage')}
        okButtonProps={{ disabled: !lieuCompte || !dateComptage }}
        cancelText={t('Annuler')}
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <label htmlFor="comptage-lieu">{t('Lieu à compter')}</label>
            <Select
              id="comptage-lieu"
              style={{ width: '100%' }}
              placeholder={t('Choisir un lieu de stockage')}
              value={lieuCompte}
              onChange={valeur => setLieuCompte(valeur)}
              options={optionsLieux}
              notFoundContent={t('Aucun lieu de stockage disponible')}
            />
            <Text type="secondary">
              {t(
                'Un seul comptage en brouillon par lieu : deux comptages simultanés du même dépôt produiraient deux vérités, et le second validé écraserait le premier sans que personne ne le voie.'
              )}
            </Text>
          </div>
          <div>
            <label htmlFor="comptage-date">{t('Date du comptage')}</label>
            <DatePicker
              id="comptage-date"
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              value={dateComptage}
              onChange={valeur => setDateComptage(valeur)}
            />
          </div>
          <Text type="secondary">
            {t('Le comptage s’ouvre')} <strong>sans aucune ligne</strong>{' '}
            {t(
              ': on compte une allée après l’autre, et exiger la liste complète d’un coup obligerait à tout ressaisir pour corriger un chiffre.'
            )}
          </Text>
        </Space>
      </Modal>
    </>
  );
};

export default StockInventaire;
