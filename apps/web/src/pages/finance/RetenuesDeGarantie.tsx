import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  App,
  Alert,
  Button,
  Checkbox,
  Col,
  DatePicker,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Typography
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import {
  createRetention,
  getRetentionSummary,
  listRetentions,
  releaseRetention
} from '../../services/finance-retentions-service';
import { listConstructionSites, listSuppliers, listSupplierInvoices } from '../../services/finance-lot2-service';
import { listContractorContracts, listProgressStatements } from '../../services/finance-contractors-service';
import type { RetentionGuarantee, RetentionSourceType, RetentionStatus } from '../../types/finance-retentions-types';
import { RETENTION_SOURCE_TYPE_LABELS, RETENTION_STATUS_LABELS } from '../../types/finance-retentions-types';
import { entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  DataView,
  DataCard,
  MoneyValue,
  StatCard,
  StatusTag,
  ConfirmAction,
  FilterSheet,
  formatMoney
} from '../../components/primitives';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Text } = Typography;

/**
 * Retenues de garantie — un seul écran. Lot 4, cinquième sous-lot (PRD E6,
 * besoin P15 ; contrat gelé
 * `packages/api/src/lib/finance/types-lot4-retentions.ts`).
 *
 * **Fichiers-registres, hors du territoire de cet agent.** Cet écran n'est
 * câblé nulle part : `App.tsx`, `navigation/model.tsx`,
 * `dev/atelier/Atelier.tsx` et `dev/atelier/mock-api.ts` appartiennent au
 * superviseur, qui les branche à l'intégration. Le chemin supposé, et déclaré
 * ici comme tel, est :
 *
 * - `/tenant/:tenantId/finance/retenues` — cet écran
 *
 * Extraits prêts à coller, sur le modèle des sous-lots précédents :
 *
 * ```tsx
 * // App.tsx
 * import RetenuesDeGarantie from './pages/finance/RetenuesDeGarantie';
 * <Route path="finance/retenues" element={<RetenuesDeGarantie />} />
 * ```
 *
 * ```tsx
 * // dev/atelier/Atelier.tsx — une scène, et sa route
 * const RETENUES = 'tenant/' + AGENCE + '/finance/retenues';
 * {
 *   id: 'retenues-de-garantie',
 *   titre: 'Retenues de garantie — libérer n’est pas payer',
 *   description:
 *     'Ce qui est détenu, ce qui a été rendu, et ce qui traîne au-delà de la date convenue. Libérer rend l’argent exigible ; rien ne sort de la caisse ici.',
 *   scenario: 'nominal',
 *   chemin: RETENUES
 * }
 * <Route path="tenant/:tenantId/finance/retenues" element={<Scene><RetenuesDeGarantie /></Scene>} />
 * ```
 *
 * ```ts
 * // dev/atelier/mock-api.ts
 * import { repondreRetentions } from './finance-mock-retentions';
 * // dans la liste `for (const repondre of [...])` :
 * repondreRetentions
 * ```
 *
 * `tenantId` est lu dans le CHEMIN (`useParams`), jamais en paramètre de
 * requête : le défaut relevé deux fois au lot 2.
 *
 * ---------------------------------------------------------------------------
 * Les cinq choses que cet écran refuse de laisser croire
 * ---------------------------------------------------------------------------
 *
 * **1. Libérer n'est pas payer.** Libérer rend l'argent *exigible* : le tiers
 * redevient créancier, et il se sert ensuite par le chemin ordinaire du
 * fournisseur ou du tâcheron. Aucune sortie de caisse ne naît ici. Un bouton
 * « Payer » serait un mensonge — l'utilisateur croirait avoir versé l'argent.
 * Le libellé, la confirmation et le message de succès le disent tous trois, et
 * `__tests__/finance/retenues-de-garantie.test.tsx` échoue si les mots
 * « payer » ou « règlement » reparaissent sur ce geste.
 *
 * **2. Le montant retenu est dérivé du taux, jamais saisi** (principe P-4). Le
 * formulaire n'offre AUCUN champ de montant. L'aperçu affiché sous le taux est
 * nommé « aperçu » en toutes lettres : c'est la seule multiplication faite ici,
 * elle ne voyage pas, et le serveur reste seul à décider du montant retenu.
 *
 * **3. La date de libération prévue est une prévision.** Rien ne se libère
 * tout seul à cette date ; la libération reste un acte que quelqu'un pose. Le
 * formulaire le dit avant l'envoi, pour que personne n'attende que ça se
 * fasse.
 *
 * **4. Une retenue ne fait jamais baisser le coût d'un chantier.** L'ouvrage a
 * coûté son prix entier ; ce qui change, c'est ce qu'on doit *maintenant*. La
 * colonne « Montant de la pièce » est l'assiette du taux, pas un coût de
 * chantier diminué, et le bandeau de tête le dit en clair — c'est le piège
 * central de ce sous-lot.
 *
 * **5. Les refus du serveur sont lisibles.** Ils sont nombreux et précis
 * (pièce non validée, retenue déjà posée, taux hors de ]0, 100[, montant nul
 * après arrondi, facture déjà partiellement réglée). L'écran affiche le
 * message du serveur tel quel plutôt qu'une phrase générique : lui seul sait
 * lequel des cinq s'est produit.
 *
 * ---------------------------------------------------------------------------
 * Ce qui est calculé ici, et ce qui ne l'est pas
 * ---------------------------------------------------------------------------
 *
 * **Aucun montant affiché n'est calculé ici.** Le résumé de tête
 * (`getRetentionSummary`) arrive tout fait, et il porte sur toutes les
 * retenues de l'agence : le recalculer depuis la liste donnerait un chiffre
 * différent dès qu'un filtre est posé.
 *
 * Deux dérivations non monétaires subsistent, et elles sont assumées :
 *
 * - le drapeau « en retard » d'une LIGNE, faute d'indicateur par ligne dans le
 *   contrat gelé — c'est une comparaison de dates, jamais une somme ;
 * - le tri des pièces candidates sur `status === 'VALIDATED'` dans le
 *   formulaire, parce que le serveur refuse les autres et qu'il vaut mieux ne
 *   pas les proposer que faire échouer l'envoi.
 *
 * **Vocabulaire (P-1 du PRD).** On *pose* une retenue, on la *libère* ;
 * l'argent est *détenu* puis redevient *exigible*. Jamais « débit » ni
 * « crédit » — et « débiteur » non plus, qui contient le premier.
 */

/** Un taux se lit comme un pourcentage, jamais par `<MoneyValue>`. */
function pourcentage(valeur: number): string {
  return `${valeur.toLocaleString(activeLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} %`;
}

/** Une date ISO se lit à la française. Vide plutôt que « Invalid Date ». */
function date(valeur: string | null): string {
  if (!valeur) return '—';
  const jour = dayjs(valeur);
  return jour.isValid() ? jour.format('DD/MM/YYYY') : '—';
}

export const RetenuesDeGarantie: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const queryClient = useQueryClient();

  // Figé au montage : une date qui bougerait entre deux rendus changerait la
  // clé de requête sans que rien ne l'ait demandé.
  const aujourdhui = useMemo(() => dayjs().format('YYYY-MM-DD'), []);

  // --- Filtres -------------------------------------------------------------
  const [statut, setStatut] = useState<RetentionStatus | undefined>(undefined);
  const [chantierId, setChantierId] = useState<string | undefined>(undefined);
  const [echeanceDepassee, setEcheanceDepassee] = useState(false);

  // --- Formulaire de pose --------------------------------------------------
  const [modalOuvert, setModalOuvert] = useState(false);
  const [poseEnCours, setPoseEnCours] = useState(false);
  const [natureSource, setNatureSource] = useState<RetentionSourceType>('SUPPLIER_INVOICE');
  const [fournisseurId, setFournisseurId] = useState<string | undefined>(undefined);
  const [factureId, setFactureId] = useState<string | undefined>(undefined);
  const [marcheId, setMarcheId] = useState<string | undefined>(undefined);
  const [situationId, setSituationId] = useState<string | undefined>(undefined);
  const [taux, setTaux] = useState<number | null>(null);
  const [dateLiberation, setDateLiberation] = useState<Dayjs | null>(null);

  /**
   * Le motif du refus, affiché DANS la fenêtre.
   *
   * Un refus de formulaire se lit là où l'on vient de saisir, pas dans une
   * notification qui passe : la fenêtre reste ouverte après un échec, et rien
   * n'y disait pourquoi. Le message reste aussi en notification, pour qui
   * regarde ailleurs.
   */
  const [refusPose, setRefusPose] = useState<string | null>(null);

  const filtresApi = {
    status: statut,
    siteId: chantierId,
    // Le serveur ne garde alors que les retenues dont la date prévue est
    // passée. Le filtre porte sur la DATE seule : c'est pourquoi la carte
    // « en retard » pose aussi le statut « détenue », visiblement, plutôt que
    // de le forcer en sous-main.
    dueBefore: echeanceDepassee ? aujourdhui : undefined
  };

  const {
    data: retenuesData,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('retentions', tenantId, filtresApi),
    queryFn: () => listRetentions(tenantId as string, filtresApi),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  /**
   * Le résumé suit le filtre CHANTIER, et lui seul : c'est le seul filtre que
   * `getRetentionSummary` accepte. Le lier au statut ou à l'échéance
   * laisserait croire que « détenu » et « libéré » se recalculent avec la
   * liste, alors que ces trois chiffres portent sur l'ensemble.
   */
  const { data: resume } = useQuery({
    queryKey: queryKey('retentions-summary', tenantId, { siteId: chantierId }),
    queryFn: () => getRetentionSummary(tenantId as string, chantierId ? { siteId: chantierId } : undefined),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const { data: chantiers } = useQuery({
    queryKey: queryKey('finance-chantiers-reference', tenantId, {}),
    queryFn: () => listConstructionSites(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  // --- Les pièces candidates, en cascade -----------------------------------
  //
  // Le contrat n'offre aucune liste transversale des « pièces sur lesquelles
  // on peut retenir » : on passe donc par le tiers puis par sa pièce. Deux
  // clics de plus, mais aucun identifiant à taper — l'écran ne montre jamais
  // un identifiant, et n'en fait pas saisir un non plus.

  const { data: fournisseurs } = useQuery({
    queryKey: queryKey('finance-fournisseurs-reference', tenantId, {}),
    queryFn: () => listSuppliers(tenantId as string),
    enabled: Boolean(tenantId) && modalOuvert && natureSource === 'SUPPLIER_INVOICE',
    staleTime: STALE_TIME.reference
  });

  const { data: factures } = useQuery({
    queryKey: queryKey('supplier-invoices', tenantId, { supplierId: fournisseurId }),
    queryFn: () => listSupplierInvoices(tenantId as string, fournisseurId as string),
    enabled: Boolean(tenantId) && Boolean(fournisseurId) && natureSource === 'SUPPLIER_INVOICE',
    staleTime: STALE_TIME.list
  });

  const { data: marches } = useQuery({
    queryKey: queryKey('contractor-contracts', tenantId, {}),
    queryFn: () => listContractorContracts(tenantId as string),
    enabled: Boolean(tenantId) && modalOuvert && natureSource === 'PROGRESS_STATEMENT',
    staleTime: STALE_TIME.reference
  });

  const { data: situations } = useQuery({
    queryKey: queryKey('progress-statements', tenantId, { contractId: marcheId }),
    queryFn: () => listProgressStatements(tenantId as string, marcheId as string),
    enabled: Boolean(tenantId) && Boolean(marcheId) && natureSource === 'PROGRESS_STATEMENT',
    staleTime: STALE_TIME.list
  });

  const retenues = retenuesData ?? [];

  const optionsChantiers = useMemo(
    () =>
      (chantiers ?? [])
        .map(chantier => ({ value: chantier.id, label: chantier.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [chantiers]
  );

  const optionsFournisseurs = useMemo(
    () =>
      (fournisseurs ?? []).map(f => ({ value: f.id, label: f.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [fournisseurs]
  );

  // Seules les pièces VALIDÉES sont proposées : le serveur refuse les autres
  // (« une retenue ne se pose que sur une pièce validée »), et proposer une
  // ligne dont on sait qu'elle échouera est une invitation à une erreur.
  const facturesValidees = useMemo(() => (factures ?? []).filter(f => f.status === 'VALIDATED'), [factures]);
  const situationsValidees = useMemo(() => (situations ?? []).filter(s => s.status === 'VALIDATED'), [situations]);

  const optionsMarches = useMemo(
    () => (marches ?? []).map(m => ({ value: m.id, label: `${m.reference} — ${m.contractorLabel} (${m.siteLabel})` })),
    [marches]
  );

  const optionsFactures = useMemo(
    () => facturesValidees.map(f => ({ value: f.id, label: `${f.reference} — ${formatMoney(f.amount)}` })),
    [facturesValidees]
  );

  const optionsSituations = useMemo(
    () =>
      situationsValidees.map(s => ({
        value: s.id,
        label: `${date(s.statementDate)} — ${s.description} — ${formatMoney(s.amount)}`
      })),
    [situationsValidees]
  );

  const pieceChoisieId = natureSource === 'SUPPLIER_INVOICE' ? factureId : situationId;

  /**
   * L'assiette de l'aperçu : le montant de la pièce choisie, tel que la liste
   * de pièces l'a rendu. Rien n'est stocké, rien n'est envoyé.
   *
   * Déclaré ICI, avec les autres `useMemo` et **avant** la sortie anticipée
   * ci-dessous : un hook appelé après un `return` conditionnel change l'ordre
   * des hooks d'un rendu à l'autre.
   */
  const assietteApercu = useMemo(() => {
    if (natureSource === 'SUPPLIER_INVOICE') {
      return facturesValidees.find(f => f.id === factureId)?.amount ?? null;
    }
    return situationsValidees.find(s => s.id === situationId)?.amount ?? null;
  }, [natureSource, facturesValidees, factureId, situationsValidees, situationId]);

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const nbFiltres = (statut ? 1 : 0) + (chantierId ? 1 : 0) + (echeanceDepassee ? 1 : 0);

  const effacerFiltres = () => {
    setStatut(undefined);
    setChantierId(undefined);
    setEcheanceDepassee(false);
  };

  /** Détenue, et la date convenue est passée. Comparaison de DATES, pas de montants. */
  const estEnRetard = (retenue: RetentionGuarantee) =>
    retenue.status === 'HELD' && dayjs(retenue.plannedReleaseDate).isBefore(aujourdhui, 'day');

  // --- Pose ----------------------------------------------------------------

  const ouvrirPose = () => {
    setNatureSource('SUPPLIER_INVOICE');
    setFournisseurId(undefined);
    setFactureId(undefined);
    setMarcheId(undefined);
    setSituationId(undefined);
    setTaux(null);
    setDateLiberation(null);
    setModalOuvert(true);
  };

  const fermerPose = () => {
    if (poseEnCours) return;
    setModalOuvert(false);
    // Le refus appartient à la tentative, pas à la fenêtre : rouvrir doit
    // repartir d'une ardoise propre.
    setRefusPose(null);
  };

  // APERÇU SEULEMENT, et l'écran le dit. Le montant retenu est décidé par le
  // serveur à partir du seul taux (principe P-4) ; cette multiplication ne
  // quitte jamais l'écran.
  const apercuMontant =
    assietteApercu !== null && taux !== null && taux > 0 ? Math.round((assietteApercu * taux) / 100) : null;

  const peutPoser = Boolean(pieceChoisieId) && taux !== null && taux > 0 && taux < 100 && dateLiberation !== null;

  const validerPose = async () => {
    if (!peutPoser) {
      message.error(t('La pièce, le taux et la date de libération prévue sont tous les trois obligatoires.'));
      return;
    }
    setPoseEnCours(true);
    setRefusPose(null);
    try {
      // Le corps ne porte QUE ces quatre champs — et surtout aucun montant.
      const retenue = await createRetention(tenantId, {
        sourceType: natureSource,
        sourceId: pieceChoisieId as string,
        ratePercent: taux as number,
        plannedReleaseDate: (dateLiberation as Dayjs).format('YYYY-MM-DD')
      });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('retentions', tenantId) });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('retentions-summary', tenantId) });
      message.success(t('Retenue posée sur « {{sourceLabel}} ».', { sourceLabel: retenue.sourceLabel }));
      setModalOuvert(false);
    } catch (err: any) {
      // Le message du serveur dit précisément lequel des cinq refus s'est
      // produit. Une phrase générique perdrait cette information.
      const motif = err?.response?.data?.message || t("La retenue n'a pas pu être posée.");
      setRefusPose(motif);
      message.error(motif);
    } finally {
      setPoseEnCours(false);
    }
  };

  // --- Libération ----------------------------------------------------------

  const libererRetenue = async (retenue: RetentionGuarantee) => {
    try {
      await releaseRetention(tenantId, retenue.id);
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('retentions', tenantId) });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('retentions-summary', tenantId) });
      // « Redevenu exigible », et non « versé » : rien n'est sorti de la
      // caisse. Voir le point 1 de l'en-tête.
      message.success(
        t('Retenue sur « {{sourceLabel}} » libérée : le montant est redevenu exigible.', {
          sourceLabel: retenue.sourceLabel
        })
      );
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("La retenue n'a pas pu être libérée."));
    }
  };

  /**
   * Le seul geste d'une ligne détenue.
   *
   * Le libellé dit « Libérer », pas « Payer » : la confirmation explique que
   * l'argent redevient exigible et que le versement se fait ensuite ailleurs.
   */
  const BoutonLiberer = ({ retenue }: { retenue: RetentionGuarantee }) => (
    <ConfirmAction
      title={t('Libérer la retenue sur « {{sourceLabel}} » ?', { sourceLabel: retenue.sourceLabel })}
      description={
        <>
          {t('Libérer ne verse rien. Le montant détenu redevient exigible et')} {retenue.thirdPartyLabel}{' '}
          {t('redevient créancier ; le versement se fait ensuite depuis sa fiche, par le chemin habituel.')}
        </>
      }
      okText={t('Confirmer la libération')}
      onConfirm={() => libererRetenue(retenue)}
    >
      <Button type="link">{t('Libérer')}</Button>
    </ConfirmAction>
  );

  const EtiquetteStatut = ({ retenue }: { retenue: RetentionGuarantee }) => (
    <Space size={4} wrap>
      {/* `HELD` et `RELEASED` ne sont pas dans la table de `<StatusTag>`, qui
          est un fichier-registre hors du territoire de cet agent : le libellé
          et le ton sont donc passés explicitement. */}
      <StatusTag
        status={retenue.status}
        label={RETENTION_STATUS_LABELS[retenue.status]}
        tone={retenue.status === 'HELD' ? 'info' : 'success'}
      />
      {estEnRetard(retenue) && <StatusTag status="OVERDUE" label={t('En retard')} tone="danger" />}
    </Space>
  );

  const colonnes: ColumnsType<RetentionGuarantee> = [
    {
      title: t('Pièce retenue'),
      key: 'piece',
      render: (_, r) => (
        <Space orientation="vertical" size={0}>
          <span>{r.sourceLabel}</span>
          <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
            {RETENTION_SOURCE_TYPE_LABELS[r.sourceType]}
          </Text>
        </Space>
      )
    },
    { title: t('Tiers'), key: 'tiers', render: (_, r) => r.thirdPartyLabel },
    {
      title: t('Chantier'),
      key: 'chantier',
      render: (_, r) => r.siteLabel ?? <Text type="secondary">{t('Hors chantier')}</Text>
    },
    {
      // L'ASSIETTE du taux, pas un coût de chantier. La retenue ne l'entame
      // pas : voir le bandeau de tête et le point 4 de l'en-tête.
      title: t('Montant de la pièce'),
      key: 'assiette',
      align: 'end',
      render: (_, r) => <MoneyValue value={r.baseAmount} />
    },
    { title: t('Taux'), key: 'taux', align: 'end', render: (_, r) => pourcentage(r.ratePercent) },
    { title: t('Retenu'), key: 'retenu', align: 'end', render: (_, r) => <MoneyValue value={r.amount} /> },
    {
      title: t('Libération prévue'),
      key: 'prevue',
      render: (_, r) => date(r.plannedReleaseDate)
    },
    { title: t('Statut'), key: 'statut', render: (_, r) => <EtiquetteStatut retenue={r} /> },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, r) =>
        r.status === 'HELD' ? (
          <BoutonLiberer retenue={r} />
        ) : (
          <Text type="secondary">
            {t('Libérée le')} {date(r.releasedAt)}
          </Text>
        )
    }
  ];

  return (
    <>
      <PageHeader
        title={t('Retenues de garantie')}
        subtitle={retenues.length > 0 ? `${retenues.length} retenue${retenues.length > 1 ? 's' : ''}` : undefined}
        primaryAction={{ label: t('Poser une retenue'), icon: <PlusOutlined />, onClick: ouvrirPose }}
      />

      {/* Le piège central de ce sous-lot, dit une fois, en haut, et jamais
          démenti plus bas. */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 'var(--space-4)' }}
        message={t('Une retenue ne diminue pas le coût du chantier')}
        description={t(
          "L'ouvrage a coûté son prix entier, et la pièce reste imputée pour son montant entier. Ce qu'une retenue change, c'est seulement ce qu'on doit maintenant : une part du dû est mise de côté jusqu'à la libération."
        )}
      />

      {resume && (
        <Row gutter={[16, 16]} style={{ marginBottom: 'var(--space-5)' }}>
          <Col xs={24} md={8}>
            <StatCard
              label={t("Détenu aujourd'hui")}
              value={<MoneyValue value={resume.totalHeld} />}
              hint={t('Ce qui est mis de côté, en attente de libération.')}
            />
          </Col>
          <Col xs={24} md={8}>
            <StatCard
              label={t('Déjà libéré')}
              value={<MoneyValue value={resume.totalReleased} />}
              hint={t('Redevenu exigible. Le versement se fait ailleurs, depuis la fiche du tiers.')}
            />
          </Col>
          <Col xs={24} md={8}>
            {/* Le seul chiffre qui appelle une action (contrat gelé). La carte
                est cliquable et pose les DEUX filtres correspondants, visibles
                dans la barre : « détenue » et « échéance dépassée ». */}
            <StatCard
              label={t('En retard')}
              tone={resume.overdueCount > 0 ? 'danger' : 'neutral'}
              value={<MoneyValue value={resume.overdueHeld} />}
              hint={
                resume.overdueCount > 0
                  ? t('{{overdueCount}} retenue{{value}} au-delà de la date convenue. Voir lesquelles.', {
                      overdueCount: resume.overdueCount,
                      value: resume.overdueCount > 1 ? 's' : ''
                    })
                  : t('Aucune retenue au-delà de la date convenue.')
              }
              onClick={
                resume.overdueCount > 0
                  ? () => {
                      setStatut('HELD');
                      setEcheanceDepassee(true);
                    }
                  : undefined
              }
            />
          </Col>
        </Row>
      )}

      <FilterSheet activeCount={nbFiltres} onClear={effacerFiltres} title={t('Filtrer les retenues')}>
        <div style={{ minWidth: 200 }}>
          <label htmlFor="filtre-statut-retenues">{t('Statut')}</label>
          <Select
            id="filtre-statut-retenues"
            style={{ width: '100%' }}
            placeholder={t('Tous les statuts')}
            allowClear
            value={statut}
            onChange={valeur => setStatut(valeur as RetentionStatus | undefined)}
            options={[
              { value: 'HELD', label: RETENTION_STATUS_LABELS.HELD },
              { value: 'RELEASED', label: RETENTION_STATUS_LABELS.RELEASED }
            ]}
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="filtre-chantier-retenues">{t('Chantier')}</label>
          <Select
            id="filtre-chantier-retenues"
            style={{ width: '100%' }}
            placeholder={t('Tous les chantiers')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={chantierId}
            onChange={valeur => setChantierId(valeur as string | undefined)}
            options={optionsChantiers}
          />
        </div>
        <div style={{ minWidth: 240 }}>
          {/* Le filtre porte sur la DATE seule, et le dit : croisé avec
              « libérée », il montre des retenues rendues en retard, ce qui est
              une information et non une incohérence. */}
          <Checkbox checked={echeanceDepassee} onChange={event => setEcheanceDepassee(event.target.checked)}>
            {t('Échéance de libération dépassée')}
          </Checkbox>
        </div>
      </FilterSheet>

      <DataView<RetentionGuarantee>
        // Le contrat de `listRetentions` ne pagine pas.
        paginated={false}
        scrollX={1300}
        items={retenues}
        total={retenues.length}
        page={1}
        pageSize={Math.max(retenues.length, 1)}
        onPageChange={() => {}}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger les retenues de garantie.') : null}
        onRetry={() => refetch()}
        isFiltered={nbFiltres > 0}
        onClearFilters={effacerFiltres}
        emptyDescription={t("Aucune retenue de garantie n'a encore été posée.")}
        emptyAction={{ label: t('Poser une retenue'), onClick: ouvrirPose }}
        columns={colonnes}
        rowKey={r => r.id}
        aria-label={t('Retenues de garantie')}
        renderCard={r => (
          <DataCard
            title={r.sourceLabel}
            aria-label={r.sourceLabel}
            subtitle={`${RETENTION_SOURCE_TYPE_LABELS[r.sourceType]} — ${r.thirdPartyLabel}`}
            status={<EtiquetteStatut retenue={r} />}
            highlight={<MoneyValue value={r.amount} />}
            fields={[
              { label: t('Montant de la pièce'), value: <MoneyValue value={r.baseAmount} /> },
              { label: t('Taux'), value: pourcentage(r.ratePercent) },
              { label: t('Chantier'), value: r.siteLabel ?? t('Hors chantier') },
              { label: t('Libération prévue'), value: date(r.plannedReleaseDate) }
            ]}
          />
        )}
      />

      <Modal
        title={t('Poser une retenue de garantie')}
        open={modalOuvert}
        onCancel={fermerPose}
        confirmLoading={poseEnCours}
        onOk={validerPose}
        okText={t('Poser la retenue')}
        cancelText={t('Annuler')}
        destroyOnHidden
        width={620}
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {refusPose && <Alert type="error" showIcon message={t('La retenue a été refusée')} description={refusPose} />}
          <div>
            <span id="retenue-nature-label">{t('Nature de la pièce')}</span>
            <div>
              <Radio.Group
                aria-labelledby="retenue-nature-label"
                value={natureSource}
                onChange={event => {
                  setNatureSource(event.target.value as RetentionSourceType);
                  setFournisseurId(undefined);
                  setFactureId(undefined);
                  setMarcheId(undefined);
                  setSituationId(undefined);
                }}
                options={[
                  { value: 'SUPPLIER_INVOICE', label: RETENTION_SOURCE_TYPE_LABELS.SUPPLIER_INVOICE },
                  { value: 'PROGRESS_STATEMENT', label: RETENTION_SOURCE_TYPE_LABELS.PROGRESS_STATEMENT }
                ]}
              />
            </div>
          </div>

          {natureSource === 'SUPPLIER_INVOICE' ? (
            <>
              <div>
                <label htmlFor="retenue-fournisseur">{t('Fournisseur')}</label>
                <Select
                  id="retenue-fournisseur"
                  style={{ width: '100%' }}
                  placeholder={t('Choisir un fournisseur')}
                  showSearch
                  optionFilterProp="label"
                  value={fournisseurId}
                  onChange={valeur => {
                    setFournisseurId(valeur as string);
                    setFactureId(undefined);
                  }}
                  options={optionsFournisseurs}
                />
              </div>
              <div>
                <label htmlFor="retenue-facture">{t('Facture validée')}</label>
                {/* Seules les factures validées sont proposées : le serveur
                    refuse les autres. */}
                <Select
                  id="retenue-facture"
                  style={{ width: '100%' }}
                  placeholder={fournisseurId ? t('Choisir une facture') : t("Choisir d'abord un fournisseur")}
                  disabled={!fournisseurId}
                  showSearch
                  optionFilterProp="label"
                  value={factureId}
                  onChange={valeur => setFactureId(valeur as string)}
                  options={optionsFactures}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="retenue-marche">{t('Marché')}</label>
                <Select
                  id="retenue-marche"
                  style={{ width: '100%' }}
                  placeholder={t('Choisir un marché')}
                  showSearch
                  optionFilterProp="label"
                  value={marcheId}
                  onChange={valeur => {
                    setMarcheId(valeur as string);
                    setSituationId(undefined);
                  }}
                  options={optionsMarches}
                />
              </div>
              <div>
                <label htmlFor="retenue-situation">{t('Situation validée')}</label>
                <Select
                  id="retenue-situation"
                  style={{ width: '100%' }}
                  placeholder={marcheId ? t('Choisir une situation') : t("Choisir d'abord un marché")}
                  disabled={!marcheId}
                  showSearch
                  optionFilterProp="label"
                  value={situationId}
                  onChange={valeur => setSituationId(valeur as string)}
                  options={optionsSituations}
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="retenue-taux">{t('Taux de retenue (%)')}</label>
            {/* LE SEUL CHAMP CHIFFRÉ DU FORMULAIRE. Il n'y a pas de champ de
                montant, et ce n'est pas un oubli : le montant retenu se dérive
                du taux côté serveur (principe P-4). */}
            <InputNumber
              id="retenue-taux"
              style={{ width: '100%' }}
              min={0.01}
              max={99.99}
              step={0.5}
              precision={2}
              value={taux ?? undefined}
              onChange={valeur => setTaux((valeur as number | null) ?? null)}
            />
            <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
              {t('Strictement entre 0 et 100. Cent pour cent ne serait pas une garantie.')}
            </Text>
          </div>

          {apercuMontant !== null && assietteApercu !== null && (
            <Alert
              type="info"
              message={t('Aperçu : environ {{value}} seraient retenus sur {{value2}}.', {
                value: formatMoney(apercuMontant),
                value2: formatMoney(assietteApercu)
              })}
              description={t(
                "Aperçu indicatif seulement. L'écran n'envoie que le taux ; le montant retenu est calculé et arrondi par le serveur, puis figé."
              )}
            />
          )}

          <div>
            <label htmlFor="retenue-date-liberation">{t('Date de libération prévue')}</label>
            <DatePicker
              id="retenue-date-liberation"
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              value={dateLiberation}
              onChange={setDateLiberation}
            />
            <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
              {t(
                "C'est une prévision, pas une échéance automatique : rien ne se libère tout seul à cette date. La libération restera un geste à poser depuis cette liste."
              )}
            </Text>
          </div>

          <Text type="secondary">
            {t(
              "La pièce doit être validée, et elle ne peut porter qu'une seule retenue. Le coût du chantier ne bouge pas : la pièce reste imputée pour son montant entier."
            )}
          </Text>
        </Space>
      </Modal>
    </>
  );
};

export default RetenuesDeGarantie;
