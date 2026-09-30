import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { App, Button, Card, Checkbox, Input, Modal, Radio, Select, Space, Tabs, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createStockItem,
  createStockLocation,
  getStockSettings,
  listStockItems,
  listStockLocations,
  setStockValuationMethod,
  updateStockItem,
  updateStockLocation
} from '../../services/finance-stock-referentiel-service';
import { listConstructionSites, listCostCategories } from '../../services/finance-lot2-service';
import { STOCK_LOCATION_KIND_LABELS, STOCK_VALUATION_METHOD_LABELS } from '../../types/finance-stock-referentiel-types';
import type {
  StockItem,
  StockLocation,
  StockLocationKind,
  UpdateStockItemInput
} from '../../types/finance-stock-referentiel-types';
import { entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  DataView,
  DataCard,
  StatusTag,
  ConfirmAction,
  useConfirmAction
} from '../../components/primitives';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

/**
 * Paramétrage du stock — articles, lieux de stockage, méthode de valorisation.
 * Lot 5, premier sous-lot (PRD E9, besoins S1, S4, S5 ; contrat gelé
 * `packages/api/src/lib/finance/types-lot5-referentiel.ts`).
 *
 * ---------------------------------------------------------------------------
 * Fichiers-registres, hors du territoire de cet agent
 * ---------------------------------------------------------------------------
 *
 * Cet écran n'est câblé nulle part : `App.tsx`, `navigation/model.tsx`,
 * `dev/atelier/Atelier.tsx` et `dev/atelier/mock-api.ts` appartiennent au
 * superviseur, qui les branche à l'intégration. Le chemin supposé, et lu comme
 * tel, est `/tenant/:tenantId/finance/stock/parametrage`. `tenantId` est lu
 * dans le CHEMIN (`useParams`), jamais en paramètre de requête — le défaut
 * relevé deux fois au lot 2.
 *
 * Extraits prêts à coller :
 *
 * ```tsx
 * // App.tsx
 * const StockReferentiel = lazy(() => import('./pages/finance/StockReferentiel'));
 * <Route path="/tenant/:tenantId/finance/stock/parametrage" element={<StockReferentiel />} />
 * ```
 *
 * ```ts
 * // dev/atelier/mock-api.ts
 * import { repondreStockReferentiel } from './finance-mock-stock-referentiel';
 * // dans la liste `for (const repondre of [...])` :
 * repondreStockReferentiel
 * ```
 *
 * ---------------------------------------------------------------------------
 * Le poste d'un article est une PROPOSITION, et l'écran le dit
 * ---------------------------------------------------------------------------
 *
 * Nulle part cet écran n'écrit « poste de dépense » tout court à propos d'un
 * article : il écrit **« poste proposé à la sortie »**, et rappelle sous le
 * champ qu'il restera modifiable au moment de sortir la marchandise. Le
 * contrat gelé y insiste : `defaultCostCategoryId` n'a *aucune autorité*, la
 * sortie exige toujours son poste. Un poste deviné se lirait comme un choix
 * sans en être un, et personne ne le vérifierait.
 *
 * ---------------------------------------------------------------------------
 * Changer l'unité d'un article est dangereux, et l'écran prévient AVANT
 * ---------------------------------------------------------------------------
 *
 * Passer un article de « sac » à « tonne » ne reconvertit aucune quantité déjà
 * enregistrée : les mouvements passés gardent leur nombre, qui voudra
 * désormais dire autre chose. Le domaine laisse faire — l'interdire
 * empêcherait de réparer une faute de frappe au premier jour. L'écran, lui,
 * affiche l'avertissement dès que l'unité change et **bloque l'envoi tant
 * qu'il n'a pas été acquitté**. C'est le seul endroit de cet écran où une case
 * à cocher conditionne un envoi, et c'est délibéré : le prix d'une erreur ici
 * est un stock entier qui ment sans le dire.
 *
 * ---------------------------------------------------------------------------
 * Ce qui ne se corrige pas, et n'est donc pas proposé
 * ---------------------------------------------------------------------------
 *
 * - **La référence d'un article** : c'est elle qu'on lit sur les bons déjà
 *   imprimés. Le formulaire de correction la montre, en lecture seule, avec sa
 *   raison.
 * - **La nature et le chantier d'un lieu** : un magasin qui deviendrait le lieu
 *   d'un chantier emporterait avec lui un stock qui n'y a jamais été.
 *
 * ---------------------------------------------------------------------------
 * Désactiver n'est pas supprimer — et rien ne supprime
 * ---------------------------------------------------------------------------
 *
 * **Aucun bouton de suppression sur cet écran**, parce qu'aucune route ne
 * supprime : leurs mouvements racontent où la matière est passée. Un article
 * ou un lieu désactivé garde son stock et son historique ; il cesse simplement
 * d'être proposé. C'est écrit sous chaque liste.
 *
 * ---------------------------------------------------------------------------
 * La méthode de valorisation enregistre une DÉCISION, pas un choix
 * ---------------------------------------------------------------------------
 *
 * `WEIGHTED_AVERAGE` est la seule méthode offerte. L'écran ne présente donc
 * pas une liste déroulante suggérant qu'une autre existe : il montre la
 * méthode en vigueur, **depuis quand et pourquoi**, et offre le geste
 * d'arrêter la décision à nouveau, motif exigé (besoin S5, « changement =
 * décision documentée »).
 *
 * **Vocabulaire (P-1 du PRD).** On *enregistre* un article, on *crée* un lieu,
 * on *désactive*, on *arrête* une méthode — jamais « débit » ni « crédit ».
 */

/** Ce que porte le formulaire d'un article, en création comme en correction. */
interface SaisieArticle {
  reference: string;
  label: string;
  unit: string;
  category: string;
  defaultCostCategoryId: string | undefined;
}

const SAISIE_VIDE: SaisieArticle = {
  reference: '',
  label: '',
  unit: '',
  category: '',
  defaultCostCategoryId: undefined
};

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

/**
 * Ce que la désactivation garde, dit une seule fois.
 *
 * Le tableau (`<ConfirmAction>`) et la carte mobile (`useConfirmAction`) posent
 * la même question : la formuler deux fois laisserait les deux versions
 * diverger, et l'une des deux finirait par laisser croire qu'on supprime.
 */
const AVERTISSEMENT_DESACTIVATION_ARTICLE = t(
  "Désactiver n'est pas supprimer : l'article garde son stock et son historique, il cesse simplement d'être proposé à la saisie."
);

const AVERTISSEMENT_DESACTIVATION_LIEU = t(
  "Désactiver n'est pas supprimer : le lieu garde son stock et son historique, il cesse simplement d'être proposé à la saisie."
);

export const StockReferentiel: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const queryClient = useQueryClient();
  /**
   * Sous 992 px, `<DataView>` rend des cartes et non un tableau : la colonne
   * « Actions » disparaît avec lui. La désactivation passe donc par les actions
   * secondaires de la carte, faute de quoi elle serait **impossible sur
   * mobile** — et rien d'autre ne la remplace, puisque aucune route ne
   * supprime.
   */
  const confirmerAction = useConfirmAction();

  // ---------------------------------------------------------------------
  // Filtres des deux listes
  //
  // Les deux cases sont DÉCOCHÉES par défaut : un article ou un lieu
  // désactivé garde son stock, et le masquer d'office ferait disparaître de
  // la marchandise bien réelle de l'écran qui la paramètre.
  // ---------------------------------------------------------------------

  const [articlesActifsSeulement, setArticlesActifsSeulement] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [lieuxActifsSeulement, setLieuxActifsSeulement] = useState(false);
  const [natureFiltre, setNatureFiltre] = useState<StockLocationKind | undefined>(undefined);

  const filtresArticles = {
    onlyActive: articlesActifsSeulement || undefined,
    search: recherche.trim() || undefined
  };
  const filtresLieux = { onlyActive: lieuxActifsSeulement || undefined, kind: natureFiltre };

  const {
    data: articles,
    isPending: articlesEnAttente,
    isFetching: articlesEnRechargement,
    error: erreurArticles,
    refetch: refetchArticles
  } = useQuery({
    queryKey: queryKey('stock-items', tenantId, filtresArticles),
    queryFn: () => listStockItems(tenantId as string, filtresArticles),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const {
    data: lieux,
    isPending: lieuxEnAttente,
    error: erreurLieux,
    refetch: refetchLieux
  } = useQuery({
    queryKey: queryKey('stock-locations', tenantId, filtresLieux),
    queryFn: () => listStockLocations(tenantId as string, filtresLieux),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const {
    data: reglages,
    isPending: reglagesEnAttente,
    error: erreurReglages,
    refetch: refetchReglages
  } = useQuery({
    queryKey: queryKey('stock-settings', tenantId, {}),
    queryFn: () => getStockSettings(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  // Référentiels des formulaires. Les postes servent la PROPOSITION d'un
  // article ; les chantiers, le lieu de stockage d'un chantier.
  const { data: postes } = useQuery({
    queryKey: queryKey('cost-categories', tenantId, {}),
    queryFn: () => listCostCategories(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const { data: chantiers } = useQuery({
    queryKey: queryKey('construction-sites', tenantId, {}),
    queryFn: () => listConstructionSites(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const optionsPostes = useMemo(
    () =>
      (postes ?? [])
        .filter(p => p.isActive)
        .map(p => ({ value: p.id, label: p.label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [postes]
  );

  const optionsChantiers = useMemo(
    () => (chantiers ?? []).map(c => ({ value: c.id, label: c.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [chantiers]
  );

  // ---------------------------------------------------------------------
  // Enregistrer un article
  // ---------------------------------------------------------------------

  const [creationArticleOuverte, setCreationArticleOuverte] = useState(false);
  const [saisieCreation, setSaisieCreation] = useState<SaisieArticle>(SAISIE_VIDE);
  const [creationArticleEnCours, setCreationArticleEnCours] = useState(false);

  const peutCreerArticle = Boolean(
    saisieCreation.reference.trim() && saisieCreation.label.trim() && saisieCreation.unit.trim()
  );

  const enregistrerArticle = async () => {
    if (!tenantId) return;
    if (!peutCreerArticle) {
      message.error(t("La référence, la désignation et l'unité de l'article sont obligatoires."));
      return;
    }
    setCreationArticleEnCours(true);
    try {
      // `category` vide et poste non choisi ne partent pas en chaîne vide : le
      // service retire les clés (le serveur les refuserait en 400).
      const article = await createStockItem(tenantId, {
        reference: saisieCreation.reference.trim(),
        label: saisieCreation.label.trim(),
        unit: saisieCreation.unit.trim(),
        category: saisieCreation.category.trim(),
        defaultCostCategoryId: saisieCreation.defaultCostCategoryId ?? null
      });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-items', tenantId) });
      message.success(t('Article « {{label}} » enregistré.', { label: article.label }));
      setCreationArticleOuverte(false);
      setSaisieCreation(SAISIE_VIDE);
    } catch (err: any) {
      // Référence déjà prise, poste désactivé : le serveur est la seule
      // autorité, et son message est relayé tel quel.
      message.error(err?.response?.data?.message || t("L'enregistrement de l'article a échoué."));
    } finally {
      setCreationArticleEnCours(false);
    }
  };

  // ---------------------------------------------------------------------
  // Corriger un article — et l'avertissement sur l'unité
  // ---------------------------------------------------------------------

  const [articleCorrige, setArticleCorrige] = useState<StockItem | null>(null);
  const [saisieCorrection, setSaisieCorrection] = useState<SaisieArticle>(SAISIE_VIDE);
  const [uniteAcquittee, setUniteAcquittee] = useState(false);
  const [correctionArticleEnCours, setCorrectionArticleEnCours] = useState(false);

  const ouvrirCorrectionArticle = (article: StockItem) => {
    setArticleCorrige(article);
    setSaisieCorrection({
      reference: article.reference,
      label: article.label,
      unit: article.unit,
      category: article.category ?? '',
      defaultCostCategoryId: article.defaultCostCategoryId ?? undefined
    });
    setUniteAcquittee(false);
  };

  const fermerCorrectionArticle = () => {
    if (!correctionArticleEnCours) setArticleCorrige(null);
  };

  /**
   * L'unité a changé. **Le seul écart dangereux de cet écran** : rien ne sera
   * reconverti, et les quantités déjà enregistrées changeront de sens sans
   * changer de nombre.
   */
  const uniteChangee = Boolean(
    articleCorrige &&
    // Un champ momentanément VIDE n'est pas un changement d'unité : sans
    // cette garde, vider le champ pour le retaper affichait l'avertissement
    // « de « sac » en «  » », qui ne veut rien dire et use le seul
    // avertissement sérieux de cet écran. L'unité vide est refusée par
    // ailleurs (`uniteVide`).
    saisieCorrection.unit.trim() &&
    saisieCorrection.unit.trim() !== articleCorrige.unit
  );

  /** Ce qui a réellement changé, et rien d'autre : le serveur refuse un corps vide. */
  const correctionArticle: UpdateStockItemInput = useMemo(() => {
    if (!articleCorrige) return {};
    const diff: UpdateStockItemInput = {};
    const designation = saisieCorrection.label.trim();
    const unite = saisieCorrection.unit.trim();
    const famille = saisieCorrection.category.trim();
    const poste = saisieCorrection.defaultCostCategoryId;

    if (designation && designation !== articleCorrige.label) diff.label = designation;
    if (unite && unite !== articleCorrige.unit) diff.unit = unite;
    // `null` efface la famille, une clé absente ne la touche pas : la
    // distinction est celle du contrôleur serveur, et elle est tenue ici.
    if (famille !== (articleCorrige.category ?? '')) diff.category = famille === '' ? null : famille;
    if ((poste ?? null) !== articleCorrige.defaultCostCategoryId) diff.defaultCostCategoryId = poste ?? null;
    return diff;
  }, [articleCorrige, saisieCorrection]);

  const riensAChanger = Object.keys(correctionArticle).length === 0;
  const designationVide = !saisieCorrection.label.trim();
  const uniteVide = !saisieCorrection.unit.trim();
  const peutCorrigerArticle = !riensAChanger && !designationVide && !uniteVide && (!uniteChangee || uniteAcquittee);

  const corrigerArticle = async () => {
    if (!tenantId || !articleCorrige) return;
    if (uniteChangee && !uniteAcquittee) {
      // Dit AVANT l'envoi, jamais après coup : le domaine, lui, laisserait
      // passer sans rien dire.
      message.error(t("Confirmez d'abord avoir compris ce que change une unité différente."));
      return;
    }
    if (riensAChanger) {
      message.error(t("Aucune correction n'a été saisie."));
      return;
    }
    setCorrectionArticleEnCours(true);
    try {
      await updateStockItem(tenantId, articleCorrige.id, correctionArticle);
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-items', tenantId) });
      message.success(t('Article « {{reference}} » corrigé.', { reference: articleCorrige.reference }));
      setArticleCorrige(null);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("La correction de l'article a échoué."));
    } finally {
      setCorrectionArticleEnCours(false);
    }
  };

  /** Désactiver ou réactiver. Jamais supprimer : aucune route ne supprime. */
  const basculerArticle = async (article: StockItem, actif: boolean) => {
    if (!tenantId) return;
    try {
      await updateStockItem(tenantId, article.id, { isActive: actif });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-items', tenantId) });
      message.success(
        actif
          ? t('Article « {{reference}} » réactivé.', { reference: article.reference })
          : t('Article « {{reference}} » désactivé.', { reference: article.reference })
      );
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("Le changement d'état de l'article a échoué."));
    }
  };

  // ---------------------------------------------------------------------
  // Créer un lieu de stockage
  // ---------------------------------------------------------------------

  const [creationLieuOuverte, setCreationLieuOuverte] = useState(false);
  const [natureLieu, setNatureLieu] = useState<StockLocationKind>('WAREHOUSE');
  const [libelleLieu, setLibelleLieu] = useState('');
  const [chantierLieu, setChantierLieu] = useState<string | undefined>(undefined);
  const [creationLieuEnCours, setCreationLieuEnCours] = useState(false);

  const ouvrirCreationLieu = () => {
    setNatureLieu('WAREHOUSE');
    setLibelleLieu('');
    setChantierLieu(undefined);
    setCreationLieuOuverte(true);
  };

  const peutCreerLieu = Boolean(libelleLieu.trim()) && (natureLieu === 'WAREHOUSE' || Boolean(chantierLieu));

  /**
   * Le chantier choisi a déjà un lieu parmi ceux affichés. On AVERTIT sans
   * bloquer : la liste affichée peut être filtrée, et le serveur reste la
   * seule autorité — c'est lui qui refuse, et son message est relayé.
   */
  const chantierDejaPourvu = Boolean(
    natureLieu === 'SITE' && chantierLieu && (lieux ?? []).some(lieu => lieu.siteId === chantierLieu)
  );

  const creerLieu = async () => {
    if (!tenantId) return;
    if (!peutCreerLieu) {
      // Dire lequel des deux manque. Un message unique sur le libellé
      // renverrait l'utilisateur au mauvais champ quand c'est le chantier qui
      // n'a pas été choisi — le bouton est déjà désactivé dans les deux cas,
      // mais un message faux se lirait comme un défaut de l'écran.
      message.error(
        !libelleLieu.trim()
          ? t('Le libellé du lieu de stockage est obligatoire.')
          : t('Le chantier est obligatoire pour un lieu de stockage de chantier.')
      );
      return;
    }
    setCreationLieuEnCours(true);
    try {
      // `siteId` n'est JAMAIS envoyé pour un magasin : le serveur le refuse
      // pour toute nature autre que `SITE`, plutôt que de l'ignorer.
      const lieu =
        natureLieu === 'SITE'
          ? await createStockLocation(tenantId, {
              kind: 'SITE',
              label: libelleLieu.trim(),
              siteId: chantierLieu as string
            })
          : await createStockLocation(tenantId, { kind: 'WAREHOUSE', label: libelleLieu.trim() });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-locations', tenantId) });
      message.success(t('Lieu « {{label}} » créé.', { label: lieu.label }));
      setCreationLieuOuverte(false);
    } catch (err: any) {
      // « Ce chantier dispose déjà d’un lieu de stockage », « Un lieu de
      // stockage porte déjà ce libellé » : le message du serveur est relayé
      // tel quel, parce qu'il dit exactement ce qui s'est passé.
      message.error(err?.response?.data?.message || t('La création du lieu de stockage a échoué.'));
    } finally {
      setCreationLieuEnCours(false);
    }
  };

  // ---------------------------------------------------------------------
  // Corriger un lieu — son libellé, et rien d'autre
  // ---------------------------------------------------------------------

  const [lieuCorrige, setLieuCorrige] = useState<StockLocation | null>(null);
  const [libelleCorrige, setLibelleCorrige] = useState('');
  const [correctionLieuEnCours, setCorrectionLieuEnCours] = useState(false);

  const ouvrirCorrectionLieu = (lieu: StockLocation) => {
    setLieuCorrige(lieu);
    setLibelleCorrige(lieu.label);
  };

  const peutCorrigerLieu = Boolean(libelleCorrige.trim()) && libelleCorrige.trim() !== lieuCorrige?.label;

  const corrigerLieu = async () => {
    if (!tenantId || !lieuCorrige || !peutCorrigerLieu) return;
    setCorrectionLieuEnCours(true);
    try {
      await updateStockLocation(tenantId, lieuCorrige.id, { label: libelleCorrige.trim() });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-locations', tenantId) });
      message.success(t('Libellé du lieu corrigé.'));
      setLieuCorrige(null);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La correction du lieu a échoué.'));
    } finally {
      setCorrectionLieuEnCours(false);
    }
  };

  const basculerLieu = async (lieu: StockLocation, actif: boolean) => {
    if (!tenantId) return;
    try {
      await updateStockLocation(tenantId, lieu.id, { isActive: actif });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-locations', tenantId) });
      message.success(
        actif
          ? t('Lieu « {{label}} » réactivé.', { label: lieu.label })
          : t('Lieu « {{label}} » désactivé.', { label: lieu.label })
      );
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("Le changement d'état du lieu a échoué."));
    }
  };

  // ---------------------------------------------------------------------
  // Arrêter la méthode de valorisation
  // ---------------------------------------------------------------------

  const [motifDecision, setMotifDecision] = useState('');
  const [decisionEnCours, setDecisionEnCours] = useState(false);

  const motifManquant = !motifDecision.trim();

  const arreterMethode = async () => {
    if (!tenantId) return;
    if (motifManquant) {
      message.error(t('Le motif de la décision est obligatoire.'));
      return;
    }
    setDecisionEnCours(true);
    try {
      // Une seule méthode existe : ce geste n'en change pas, il ENREGISTRE la
      // décision, sa date et son motif (besoin S5).
      await setStockValuationMethod(tenantId, {
        valuationMethod: 'WEIGHTED_AVERAGE',
        decisionNote: motifDecision
      });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-settings', tenantId) });
      message.success(t('Décision enregistrée.'));
      setMotifDecision('');
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'enregistrement de la décision a échoué."));
    } finally {
      setDecisionEnCours(false);
    }
  };

  // ---------------------------------------------------------------------

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const listeArticles = articles ?? [];
  const listeLieux = lieux ?? [];

  const colonnesArticles: ColumnsType<StockItem> = [
    { title: t('Référence'), key: 'reference', render: (_, a) => a.reference },
    { title: t('Désignation'), key: 'designation', render: (_, a) => a.label },
    { title: t('Unité'), key: 'unite', render: (_, a) => a.unit },
    {
      title: t('Famille'),
      key: 'famille',
      render: (_, a) => a.category ?? <Text type="secondary">{t('Non renseignée')}</Text>
    },
    {
      // Jamais « poste de dépense » tout court : ce poste n'a aucune autorité,
      // et la sortie exigera le sien (contrat gelé).
      title: t('Poste proposé à la sortie'),
      key: 'poste',
      render: (_, a) => a.defaultCostCategoryLabel ?? <Text type="secondary">{t('Aucun poste proposé')}</Text>
    },
    { title: t('Statut'), key: 'statut', render: (_, a) => <StatusTag status={a.isActive ? 'ACTIVE' : 'INACTIVE'} /> },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, a) => (
        <Space>
          <Button type="link" onClick={() => ouvrirCorrectionArticle(a)}>
            {t('Corriger')}
          </Button>
          {/* Aucun bouton de suppression : aucune route ne supprime. */}
          {a.isActive ? (
            <ConfirmAction
              title={t("Désactiver l'article « {{reference}} » ?", { reference: a.reference })}
              description={AVERTISSEMENT_DESACTIVATION_ARTICLE}
              okText={t('Confirmer la désactivation')}
              onConfirm={() => basculerArticle(a, false)}
            >
              <Button type="link">{t('Désactiver')}</Button>
            </ConfirmAction>
          ) : (
            <Button type="link" onClick={() => basculerArticle(a, true)}>
              {t('Réactiver')}
            </Button>
          )}
        </Space>
      )
    }
  ];

  const colonnesLieux: ColumnsType<StockLocation> = [
    { title: t('Libellé'), key: 'libelle', render: (_, l) => l.label },
    { title: t('Nature'), key: 'nature', render: (_, l) => STOCK_LOCATION_KIND_LABELS[l.kind] },
    {
      title: t('Chantier'),
      key: 'chantier',
      render: (_, l) => l.siteLabel ?? <Text type="secondary">—</Text>
    },
    { title: t('Statut'), key: 'statut', render: (_, l) => <StatusTag status={l.isActive ? 'ACTIVE' : 'INACTIVE'} /> },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, l) => (
        <Space>
          <Button type="link" onClick={() => ouvrirCorrectionLieu(l)}>
            {t('Corriger le libellé')}
          </Button>
          {l.isActive ? (
            <ConfirmAction
              title={t('Désactiver le lieu « {{label}} » ?', { label: l.label })}
              description={AVERTISSEMENT_DESACTIVATION_LIEU}
              okText={t('Confirmer la désactivation')}
              onConfirm={() => basculerLieu(l, false)}
            >
              <Button type="link">{t('Désactiver')}</Button>
            </ConfirmAction>
          ) : (
            <Button type="link" onClick={() => basculerLieu(l, true)}>
              {t('Réactiver')}
            </Button>
          )}
        </Space>
      )
    }
  ];

  const ongletArticles = (
    <>
      <Card style={{ marginBottom: 'var(--space-4)' }}>
        <Text type="secondary">
          {t('Le')} <strong>{t('poste proposé à la sortie')}</strong>{' '}
          {t("n'est qu'une proposition : il sera présenté pré-sélectionné au moment de sortir la marchandise, et")}{' '}
          <strong>{t('restera modifiable à cet instant')}</strong>. C'est la sortie qui décide du poste, jamais
          l'article. <strong>{t("L'unité est du texte libre")}</strong>{' '}
          {t("— sac, tonne, barre, m³ — parce que les unités d'une agence ne sont pas celles d'une autre.")}
        </Text>
      </Card>

      <Space wrap size="middle" style={{ marginBottom: 'var(--space-3)' }}>
        <div>
          <label htmlFor="articles-recherche">{t('Rechercher un article')}</label>
          <Input
            id="articles-recherche"
            placeholder={t('Référence ou désignation')}
            allowClear
            style={{ width: 280 }}
            value={recherche}
            onChange={event => setRecherche(event.target.value)}
          />
        </div>
        <Checkbox
          checked={articlesActifsSeulement}
          onChange={event => setArticlesActifsSeulement(event.target.checked)}
        >
          {t('Articles actifs uniquement')}
        </Checkbox>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreationArticleOuverte(true)}>
          {t('Nouvel article')}
        </Button>
      </Space>

      <DataView<StockItem>
        // Le contrat de `listStockItems` ne pagine pas.
        paginated={false}
        scrollX={1200}
        items={listeArticles}
        total={listeArticles.length}
        page={1}
        pageSize={Math.max(listeArticles.length, 1)}
        onPageChange={() => {}}
        loading={articlesEnAttente}
        isReloading={articlesEnRechargement && !articlesEnAttente}
        error={erreurArticles ? t('Impossible de charger les articles.') : null}
        onRetry={() => refetchArticles()}
        isFiltered={articlesActifsSeulement || Boolean(recherche.trim())}
        onClearFilters={() => {
          setArticlesActifsSeulement(false);
          setRecherche('');
        }}
        emptyDescription={t("Aucun article n'est encore enregistré.")}
        emptyAction={{ label: t('Nouvel article'), onClick: () => setCreationArticleOuverte(true) }}
        columns={colonnesArticles}
        rowKey={a => a.id}
        aria-label={t('Articles du stock')}
        renderCard={a => (
          <DataCard
            title={a.reference}
            aria-label={a.reference}
            subtitle={a.label}
            status={<StatusTag status={a.isActive ? 'ACTIVE' : 'INACTIVE'} />}
            fields={[
              { label: t('Unité'), value: a.unit },
              { label: t('Famille'), value: a.category ?? t('Non renseignée') },
              { label: t('Poste proposé à la sortie'), value: a.defaultCostCategoryLabel ?? t('Aucun poste proposé') }
            ]}
            primaryAction={{ label: t('Corriger'), onClick: () => ouvrirCorrectionArticle(a) }}
            // Aucune suppression ici non plus : la seule action secondaire est
            // la bascule d'activité.
            secondaryActions={[
              a.isActive
                ? {
                    key: 'desactiver',
                    label: t('Désactiver'),
                    onClick: () =>
                      confirmerAction({
                        title: t("Désactiver l'article « {{reference}} » ?", { reference: a.reference }),
                        description: AVERTISSEMENT_DESACTIVATION_ARTICLE,
                        okText: t('Confirmer la désactivation'),
                        onConfirm: () => basculerArticle(a, false)
                      })
                  }
                : { key: 'reactiver', label: t('Réactiver'), onClick: () => basculerArticle(a, true) }
            ]}
          />
        )}
      />

      <Paragraph type="secondary" style={{ marginTop: 'var(--space-3)' }}>
        {t('Un article ne se supprime pas.')} <strong>{t("Désactiver n'est pas supprimer")}</strong>{' '}
        {t(": un article désactivé garde son stock et son historique, et cesse seulement d'être proposé à la saisie.")}
      </Paragraph>
    </>
  );

  const ongletLieux = (
    <>
      <Card style={{ marginBottom: 'var(--space-4)' }}>
        <Text type="secondary">
          {t('Un')} <strong>magasin</strong> {t("est un lieu de l'agence. Un")} <strong>lieu de chantier</strong>{' '}
          {t('est rattaché à un chantier, et')} <strong>{t("un chantier n'en a qu'un seul")}</strong>{' '}
          {t(': deux lieux partageraient son stock en deux soldes dont aucun ne dirait la vérité.')}
        </Text>
      </Card>

      <Space wrap size="middle" style={{ marginBottom: 'var(--space-3)' }}>
        <div>
          <label htmlFor="lieux-nature">{t('Nature')}</label>{' '}
          <Select
            id="lieux-nature"
            style={{ width: 200 }}
            allowClear
            placeholder={t('Toutes les natures')}
            value={natureFiltre}
            onChange={valeur => setNatureFiltre(valeur as StockLocationKind | undefined)}
            options={[
              { value: 'WAREHOUSE', label: STOCK_LOCATION_KIND_LABELS.WAREHOUSE },
              { value: 'SITE', label: STOCK_LOCATION_KIND_LABELS.SITE }
            ]}
          />
        </div>
        <Checkbox checked={lieuxActifsSeulement} onChange={event => setLieuxActifsSeulement(event.target.checked)}>
          {t('Lieux actifs uniquement')}
        </Checkbox>
        <Button type="primary" icon={<PlusOutlined />} onClick={ouvrirCreationLieu}>
          {t('Nouveau lieu de stockage')}
        </Button>
      </Space>

      <DataView<StockLocation>
        paginated={false}
        scrollX={900}
        items={listeLieux}
        total={listeLieux.length}
        page={1}
        pageSize={Math.max(listeLieux.length, 1)}
        onPageChange={() => {}}
        loading={lieuxEnAttente}
        error={erreurLieux ? t('Impossible de charger les lieux de stockage.') : null}
        onRetry={() => refetchLieux()}
        isFiltered={lieuxActifsSeulement || Boolean(natureFiltre)}
        onClearFilters={() => {
          setLieuxActifsSeulement(false);
          setNatureFiltre(undefined);
        }}
        emptyDescription={t("Aucun lieu de stockage n'est encore créé.")}
        emptyAction={{ label: t('Nouveau lieu de stockage'), onClick: ouvrirCreationLieu }}
        columns={colonnesLieux}
        rowKey={l => l.id}
        aria-label={t('Lieux de stockage')}
        renderCard={l => (
          <DataCard
            title={l.label}
            aria-label={l.label}
            subtitle={STOCK_LOCATION_KIND_LABELS[l.kind]}
            status={<StatusTag status={l.isActive ? 'ACTIVE' : 'INACTIVE'} />}
            fields={[{ label: t('Chantier'), value: l.siteLabel ?? '—' }]}
            primaryAction={{ label: t('Corriger le libellé'), onClick: () => ouvrirCorrectionLieu(l) }}
            secondaryActions={[
              l.isActive
                ? {
                    key: 'desactiver',
                    label: t('Désactiver'),
                    onClick: () =>
                      confirmerAction({
                        title: t('Désactiver le lieu « {{label}} » ?', { label: l.label }),
                        description: AVERTISSEMENT_DESACTIVATION_LIEU,
                        okText: t('Confirmer la désactivation'),
                        onConfirm: () => basculerLieu(l, false)
                      })
                  }
                : { key: 'reactiver', label: t('Réactiver'), onClick: () => basculerLieu(l, true) }
            ]}
          />
        )}
      />

      <Paragraph type="secondary" style={{ marginTop: 'var(--space-3)' }}>
        {t('Un lieu ne se supprime pas.')} <strong>{t("Désactiver n'est pas supprimer")}</strong>{' '}
        {t(": un lieu désactivé garde son stock et son historique, et cesse seulement d'être proposé à la saisie.")}
      </Paragraph>
    </>
  );

  const ongletMethode = (
    <>
      {erreurReglages ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger la méthode de valorisation.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetchReglages(), primary: true }]}
        />
      ) : reglagesEnAttente ? (
        <StateBlock variant="loading" />
      ) : (
        <>
          <Card style={{ marginBottom: 'var(--space-4)' }}>
            <Title level={5} style={{ marginTop: 0 }}>
              {t('La décision en vigueur')}
            </Title>
            <Paragraph style={{ marginBottom: 'var(--space-2)' }}>
              <strong>{STOCK_VALUATION_METHOD_LABELS[reglages?.valuationMethod ?? 'WEIGHTED_AVERAGE']}</strong>
              {reglages?.decidedAt ? (
                <>
                  {' '}
                  {t('— arrêtée le')} {dateCourte(reglages.decidedAt)}
                </>
              ) : null}
            </Paragraph>
            {reglages?.decisionNote ? (
              <Paragraph style={{ marginBottom: 0 }}>
                {t('Motif :')} {reglages.decisionNote}
              </Paragraph>
            ) : (
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {t(
                  "Aucune décision n'a encore été arrêtée : le coût moyen pondéré s'applique par défaut, comme le PRD le prévoit. Enregistrer la décision ci-dessous la datera et la motivera."
                )}
              </Paragraph>
            )}
          </Card>

          <Card>
            <Title level={5} style={{ marginTop: 0 }}>
              {t('Arrêter la décision')}
            </Title>
            {/*
              Une seule méthode existe aujourd'hui. Présenter une liste
              déroulante laisserait croire qu'un choix est offert : ce qui est
              enregistré ici, c'est la DÉCISION, sa date et son motif.
            */}
            <Paragraph type="secondary">
              <strong>{t("Une seule méthode existe aujourd'hui")}</strong>{' '}
              {t(": le coût moyen pondéré. Ce geste n'en change donc pas — il enregistre la")}{' '}
              <strong>{t('décision')}</strong>
              {t(
                ", sa date et son motif, comme le besoin S5 l'exige. En ajouter une autre est un travail à part entière, pas une ligne de paramétrage."
              )}
            </Paragraph>
            <Paragraph>
              {t('Méthode retenue :')} <strong>{STOCK_VALUATION_METHOD_LABELS.WEIGHTED_AVERAGE}</strong>
            </Paragraph>
            <div style={{ maxWidth: 520 }}>
              <label htmlFor="methode-motif">{t('Motif de la décision')}</label>
              <TextArea
                id="methode-motif"
                rows={3}
                value={motifDecision}
                onChange={event => setMotifDecision(event.target.value)}
                placeholder={t(
                  'Ex. Décision du comité de gestion du 12 mars : coût moyen pondéré retenu pour tous les chantiers.'
                )}
              />
              <div style={{ marginTop: 'var(--space-2)' }}>
                <Text type={motifManquant ? 'danger' : 'secondary'}>
                  {t(
                    'Le motif est obligatoire : sans lui, personne ne saura dans six mois pourquoi les chiffres ont changé de sens.'
                  )}
                </Text>
              </div>
              <Button
                type="primary"
                style={{ marginTop: 'var(--space-3)' }}
                loading={decisionEnCours}
                disabled={motifManquant}
                onClick={arreterMethode}
              >
                {t('Enregistrer la décision')}
              </Button>
            </div>
          </Card>
        </>
      )}
    </>
  );

  return (
    <>
      {/*
        Aucune action primaire dans l'en-tête, et c'est délibéré : cet écran en
        a deux (un article, un lieu), chacune propre à son onglet. Une seule
        action globale changerait de sens selon l'onglet affiché, ce que
        `<PageHeader>` ne peut pas dire.
      */}
      <PageHeader
        title={t('Paramétrage du stock')}
        subtitle={t('Articles, lieux de stockage et méthode de valorisation')}
      />

      <Tabs
        defaultActiveKey="articles"
        items={[
          { key: 'articles', label: t('Articles'), children: ongletArticles },
          { key: 'lieux', label: t('Lieux de stockage'), children: ongletLieux },
          { key: 'methode', label: t('Méthode de valorisation'), children: ongletMethode }
        ]}
      />

      {/* ------------------------------------------------------------------
          Enregistrer un article
      ------------------------------------------------------------------ */}
      <Modal
        title={t('Nouvel article')}
        open={creationArticleOuverte}
        onCancel={() => {
          if (!creationArticleEnCours) setCreationArticleOuverte(false);
        }}
        confirmLoading={creationArticleEnCours}
        onOk={enregistrerArticle}
        okText={t("Enregistrer l'article")}
        cancelText={t('Annuler')}
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <label htmlFor="article-reference">{t('Référence')}</label>
            <Input
              id="article-reference"
              value={saisieCreation.reference}
              onChange={event => setSaisieCreation({ ...saisieCreation, reference: event.target.value })}
              placeholder={t('Ex. CIM-42')}
            />
            <Text type="secondary">
              {t("C'est elle qu'on lira sur les bons.")} <strong>{t('Elle ne se corrigera plus')}</strong>{' '}
              {t("une fois l'article enregistré.")}
            </Text>
          </div>
          <div>
            <label htmlFor="article-designation">{t('Désignation')}</label>
            <Input
              id="article-designation"
              value={saisieCreation.label}
              onChange={event => setSaisieCreation({ ...saisieCreation, label: event.target.value })}
              placeholder={t('Ex. Ciment CPJ 42,5')}
            />
          </div>
          <div>
            <label htmlFor="article-unite">{t('Unité')}</label>
            {/* Texte libre, et c'est un choix du contrat : une énumération
                obligerait à livrer une version du logiciel pour ajouter
                « fût ». */}
            <Input
              id="article-unite"
              value={saisieCreation.unit}
              onChange={event => setSaisieCreation({ ...saisieCreation, unit: event.target.value })}
              placeholder={t('Ex. sac, tonne, barre, m³')}
            />
            <Text type="secondary">
              {t(
                'Toutes les quantités de cet article seront comptées dans cette unité. Choisissez-la bien : la changer plus tard ne reconvertira rien.'
              )}
            </Text>
          </div>
          <div>
            <label htmlFor="article-famille">{t('Famille (facultatif)')}</label>
            <Input
              id="article-famille"
              value={saisieCreation.category}
              onChange={event => setSaisieCreation({ ...saisieCreation, category: event.target.value })}
              placeholder={t('Ex. Gros œuvre')}
            />
          </div>
          <div>
            <label htmlFor="article-poste">{t('Poste proposé à la sortie (facultatif)')}</label>
            {/* PROPOSITION, et l'écran le dit. Le contrat est formel : ce
                poste n'a aucune autorité, la sortie exige le sien. */}
            <Select
              id="article-poste"
              style={{ width: '100%' }}
              allowClear
              placeholder={t('Aucun poste proposé')}
              value={saisieCreation.defaultCostCategoryId}
              onChange={valeur => setSaisieCreation({ ...saisieCreation, defaultCostCategoryId: valeur ?? undefined })}
              showSearch
              optionFilterProp="label"
              options={optionsPostes}
              notFoundContent={t('Aucun poste disponible')}
            />
            <Text type="secondary">
              {t('Simple')} <strong>proposition</strong>{' '}
              {t(
                ': ce poste sera pré-sélectionné à la sortie de la marchandise, et restera modifiable à ce moment-là. Laisser vide est un cas normal.'
              )}
            </Text>
          </div>
        </Space>
      </Modal>

      {/* ------------------------------------------------------------------
          Corriger un article — avec l'avertissement sur l'unité
      ------------------------------------------------------------------ */}
      <Modal
        title={
          articleCorrige
            ? t("Corriger l'article « {{reference}} »", { reference: articleCorrige.reference })
            : t("Corriger l'article")
        }
        open={Boolean(articleCorrige)}
        onCancel={fermerCorrectionArticle}
        confirmLoading={correctionArticleEnCours}
        onOk={corrigerArticle}
        okText={t('Enregistrer la correction')}
        okButtonProps={{ disabled: !peutCorrigerArticle }}
        cancelText={t('Annuler')}
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            {/* Montrée, jamais modifiable : c'est ce qu'on lit sur les bons
                déjà imprimés, et le serveur la refuserait en 400. */}
            <Text type="secondary">
              {t('Référence :')} <strong>{articleCorrige?.reference}</strong>{' '}
              {t("— elle ne se corrige pas, c'est elle qu'on lit sur les bons déjà imprimés.")}
            </Text>
          </div>
          <div>
            <label htmlFor="correction-designation">{t('Désignation')}</label>
            <Input
              id="correction-designation"
              value={saisieCorrection.label}
              onChange={event => setSaisieCorrection({ ...saisieCorrection, label: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor="correction-unite">{t('Unité')}</label>
            <Input
              id="correction-unite"
              value={saisieCorrection.unit}
              onChange={event => setSaisieCorrection({ ...saisieCorrection, unit: event.target.value })}
            />
          </div>

          {uniteChangee && (
            <div>
              {/*
                L'avertissement que le domaine ne donnera pas : il laisse
                faire, volontairement. Rien n'est reconverti, et les quantités
                déjà enregistrées changeront de sens sans changer de nombre.
              */}
              <Text type="warning">
                {t("Changer l'unité de «")} {articleCorrige?.unit} {t('» en «')} {saisieCorrection.unit.trim()} »{' '}
                <strong>{t('ne reconvertit aucune quantité déjà enregistrée')}</strong>. Les mouvements passés garderont
                leur nombre, qui voudra désormais dire autre chose. À ne faire que pour réparer une erreur de saisie,
                jamais pour changer de conditionnement.
              </Text>
              <div style={{ marginTop: 'var(--space-2)' }}>
                <Checkbox checked={uniteAcquittee} onChange={event => setUniteAcquittee(event.target.checked)}>
                  {t("J'ai compris : les quantités déjà enregistrées ne seront pas reconverties.")}
                </Checkbox>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="correction-famille">{t('Famille (facultatif)')}</label>
            <Input
              id="correction-famille"
              value={saisieCorrection.category}
              onChange={event => setSaisieCorrection({ ...saisieCorrection, category: event.target.value })}
              placeholder={t('Vider le champ efface la famille')}
            />
          </div>
          <div>
            <label htmlFor="correction-poste">{t('Poste proposé à la sortie (facultatif)')}</label>
            <Select
              id="correction-poste"
              style={{ width: '100%' }}
              allowClear
              placeholder={t('Aucun poste proposé')}
              value={saisieCorrection.defaultCostCategoryId}
              onChange={valeur =>
                setSaisieCorrection({ ...saisieCorrection, defaultCostCategoryId: valeur ?? undefined })
              }
              showSearch
              optionFilterProp="label"
              options={optionsPostes}
              notFoundContent={t('Aucun poste disponible')}
            />
            <Text type="secondary">
              {t('Toujours une')} <strong>proposition</strong>{' '}
              {t(": la sortie exigera son poste, et celui-ci n'y sera que pré-sélectionné.")}
            </Text>
          </div>
        </Space>
      </Modal>

      {/* ------------------------------------------------------------------
          Créer un lieu de stockage
      ------------------------------------------------------------------ */}
      <Modal
        title={t('Nouveau lieu de stockage')}
        open={creationLieuOuverte}
        onCancel={() => {
          if (!creationLieuEnCours) setCreationLieuOuverte(false);
        }}
        confirmLoading={creationLieuEnCours}
        onOk={creerLieu}
        okText={t('Enregistrer le lieu')}
        okButtonProps={{ disabled: !peutCreerLieu }}
        cancelText={t('Annuler')}
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <div id="lieu-nature-label">{t('Nature du lieu')}</div>
            {/* La nature est arrêtée à la création : elle ne se corrigera
                plus (contrat gelé). */}
            <Radio.Group
              aria-labelledby="lieu-nature-label"
              value={natureLieu}
              onChange={event => {
                const nature = event.target.value as StockLocationKind;
                setNatureLieu(nature);
                // Le chantier est oublié dès qu'on repasse en magasin : il ne
                // doit jamais partir dans le corps d'un magasin.
                if (nature !== 'SITE') setChantierLieu(undefined);
              }}
            >
              <Radio value="WAREHOUSE">{STOCK_LOCATION_KIND_LABELS.WAREHOUSE}</Radio>
              <Radio value="SITE">{STOCK_LOCATION_KIND_LABELS.SITE}</Radio>
            </Radio.Group>
            <div>
              <Text type="secondary">
                {t('La nature est arrêtée maintenant :')} <strong>elle ne se corrigera plus</strong>. Un magasin qui
                deviendrait le lieu d'un chantier emporterait avec lui un stock qui n'y a jamais été.
              </Text>
            </div>
          </div>
          <div>
            <label htmlFor="lieu-libelle">{t('Libellé')}</label>
            <Input
              id="lieu-libelle"
              value={libelleLieu}
              onChange={event => setLibelleLieu(event.target.value)}
              placeholder={t("Ex. Magasin central d'Angré")}
            />
          </div>

          {/* Le sélecteur de chantier n'existe QUE pour un lieu de chantier :
              le serveur exige `siteId` pour cette nature, et le refuse pour
              toute autre. */}
          {natureLieu === 'SITE' && (
            <div>
              <label htmlFor="lieu-chantier">{t('Chantier')}</label>
              <Select
                id="lieu-chantier"
                style={{ width: '100%' }}
                placeholder={t('Choisir un chantier')}
                value={chantierLieu}
                onChange={setChantierLieu}
                showSearch
                optionFilterProp="label"
                options={optionsChantiers}
                notFoundContent={t('Aucun chantier disponible')}
              />
              <Text type="secondary">
                {t('Obligatoire pour un lieu de chantier, et le chantier ne se corrigera plus ensuite.')}
              </Text>
              {chantierDejaPourvu && (
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <Text type="warning">
                    {t(
                      "Ce chantier dispose déjà d'un lieu de stockage. Un chantier n'en a qu'un : l'enregistrement sera refusé."
                    )}
                  </Text>
                </div>
              )}
            </div>
          )}
        </Space>
      </Modal>

      {/* ------------------------------------------------------------------
          Corriger un lieu — son libellé, et rien d'autre
      ------------------------------------------------------------------ */}
      <Modal
        title={lieuCorrige ? t('Corriger le lieu « {{label}} »', { label: lieuCorrige.label }) : t('Corriger le lieu')}
        open={Boolean(lieuCorrige)}
        onCancel={() => {
          if (!correctionLieuEnCours) setLieuCorrige(null);
        }}
        confirmLoading={correctionLieuEnCours}
        onOk={corrigerLieu}
        okText={t('Enregistrer le libellé')}
        okButtonProps={{ disabled: !peutCorrigerLieu }}
        cancelText={t('Annuler')}
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <label htmlFor="correction-libelle">{t('Libellé')}</label>
            <Input
              id="correction-libelle"
              value={libelleCorrige}
              onChange={event => setLibelleCorrige(event.target.value)}
            />
          </div>
          {/* Ni nature ni chantier ne sont proposés ici, et ce n'est pas un
              oubli : le contrat gelé l'interdit, et le schéma `.strict()` du
              serveur refuserait ces champs en 400. */}
          <Text type="secondary">
            {t('Seul le libellé se corrige.')} <strong>{t('Ni la nature ni le chantier')}</strong>{' '}
            {t(
              "d'un lieu ne changent : un magasin qui deviendrait le lieu d'un chantier emporterait avec lui un stock qui n'y a jamais été."
            )}
            {lieuCorrige ? (
              <>
                {' '}
                {t('Ce lieu reste un')} <strong>{STOCK_LOCATION_KIND_LABELS[lieuCorrige.kind].toLowerCase()}</strong>
                {lieuCorrige.siteLabel ? (
                  <>
                    {' '}
                    {t('du chantier «')} {lieuCorrige.siteLabel} »
                  </>
                ) : null}
                .
              </>
            ) : null}
          </Text>
        </Space>
      </Modal>
    </>
  );
};

export default StockReferentiel;
