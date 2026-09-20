import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { App, Button, Card, DatePicker, Input, InputNumber, Select, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import {
  createContractorContract,
  createContractorPayment,
  createProgressStatement,
  findContractor,
  listContractorContracts,
  listContractorPayments,
  listProgressStatements,
  validateContractorPayment,
  validateProgressStatement
} from '../../services/finance-contractors-service';
import { listConstructionSites, listCostCategories } from '../../services/finance-lot2-service';
import { montantSaisiProps } from '../../utils/montant-saisi';
import { CONTRACTOR_DOCUMENT_STATUS_LABELS } from '../../types/finance-contractors-types';
import type {
  Contractor,
  ContractorContract,
  ContractorPayment,
  ProgressStatement
} from '../../types/finance-contractors-types';
import { detailKey, queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  MoneyValue,
  DataView,
  DataCard,
  StatCard,
  StatusTag,
  ConfirmAction,
  useConfirmAction
} from '../../components/primitives';
import type { StatusTone } from '../../components/primitives';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;
const { TextArea } = Input;

/**
 * Fiche d'un tâcheron — lot 4, quatrième sous-lot (PRD E8, besoin P10 ;
 * contrat gelé `packages/api/src/lib/finance/types-lot4-contractors.ts`).
 *
 * **Fichiers-registres, hors du territoire de cet agent.** `App.tsx`,
 * `navigation/model.tsx`, `dev/atelier/Atelier.tsx` et
 * `dev/atelier/mock-api.ts` appartiennent au superviseur, qui câble cet écran
 * à l'intégration. Chemin supposé, et lu comme tel :
 * `/tenant/:tenantId/finance/tacherons/:contractorId`. `tenantId` et
 * `contractorId` sont lus dans le CHEMIN (`useParams`), jamais en paramètre de
 * requête — le défaut relevé deux fois au lot 2.
 *
 * ---------------------------------------------------------------------------
 * Le cœur de l'écran : DEUX soldes, qui ne se confondent jamais
 * ---------------------------------------------------------------------------
 *
 * ```
 * marché restant    = montant convenu − situations validées   -> reste à EXÉCUTER
 * ce qu'on lui doit = situations validées − règlements        -> reste à PAYER
 * ```
 *
 * Le premier vit sur chaque MARCHÉ (`remainingAmount`), le second sur le
 * TÂCHERON (`accountBalance`). Un tâcheron peut avoir terminé son marché et
 * rester créancier, ou n'avoir rien exécuté et avoir déjà reçu une avance.
 * L'écran les nomme donc **en toutes lettres**, l'un « Marché restant » et
 * l'autre « Ce qu'on lui doit », jamais « solde » tout court, et un encart
 * rappelle la distinction au-dessus des deux chiffres. Le test
 * « le marché est soldé mais rien n'a été payé » de
 * `__tests__/finance/tacherons.test.tsx` épingle précisément ce point.
 *
 * **Aucun de ces montants n'est calculé ici.** `statementedAmount`,
 * `remainingAmount`, `isOverrun` et `accountBalance` arrivent tout faits du
 * serveur (principe P-4 du PRD). L'écran ne fait que les nommer et les
 * disposer.
 *
 * ---------------------------------------------------------------------------
 * Un dépassement s'affiche, il ne s'interdit pas
 * ---------------------------------------------------------------------------
 *
 * Quand les situations validées dépassent le marché convenu, `remainingAmount`
 * devient négatif et `isOverrun` vaut vrai : la ligne du marché le signale
 * comme une information utile, pas comme une erreur. Le formulaire de
 * situation **ne bloque pas** un montant qui dépasse — il avertit. Refuser
 * côté écran empêcherait d'enregistrer un travail réellement fait, la même
 * leçon que l'alerte de dépassement du lot 3.
 *
 * De même, **un règlement supérieur à ce qu'on doit est accepté** : c'est un
 * acompte, que la première situation validée résorbera. L'écran avertit,
 * jamais ne bloque.
 *
 * ---------------------------------------------------------------------------
 * Ce que le contrat exige, et que l'écran dit avant l'envoi
 * ---------------------------------------------------------------------------
 *
 * - **La description d'une situation est obligatoire** : sans elle, le chiffre
 *   ne sera justifiable par personne dans six mois. Le serveur la refuse vide ;
 *   l'écran le dit sous le champ et ne laisse pas envoyer.
 * - **Le poste de dépense d'un marché est exigé, jamais deviné** : c'est lui
 *   qui recevra les situations dans le coût du chantier, et seule la
 *   gestionnaire sait lequel.
 *
 * **Vocabulaire (P-1 du PRD).** On *convient* d'un marché, on *saisit* une
 * situation, on la *valide*, on *règle* un tâcheron — jamais « débit » ni
 * « crédit ».
 */

const TONE_PIECE: Record<string, StatusTone> = { DRAFT: 'neutral', VALIDATED: 'success', VOIDED: 'danger' };

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

export const Tacheron: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId, contractorId } = useParams<{ tenantId: string; contractorId: string }>();
  const queryClient = useQueryClient();
  const confirmerAction = useConfirmAction();

  // Le contrat n'expose aucune route de détail d'un tâcheron : la fiche le
  // retrouve dans la liste (voir `findContractor`, et la rubrique
  // « Hypothèses » du rapport de cet agent).
  const {
    data: tacheron,
    isPending: tacheronEnAttente,
    error: erreurTacheron,
    refetch: refetchTacheron
  } = useQuery({
    queryKey: detailKey('contractors', tenantId, contractorId ?? ''),
    queryFn: () => findContractor(tenantId as string, contractorId as string),
    enabled: Boolean(tenantId && contractorId),
    staleTime: STALE_TIME.list
  });

  const {
    data: marches,
    isPending: marchesEnAttente,
    error: erreurMarches,
    refetch: refetchMarches
  } = useQuery({
    queryKey: queryKey('contractor-contracts', tenantId, { contractorId: contractorId ?? '' }),
    queryFn: () => listContractorContracts(tenantId as string, { contractorId: contractorId as string }),
    enabled: Boolean(tenantId && contractorId),
    staleTime: STALE_TIME.list
  });

  const {
    data: reglements,
    isPending: reglementsEnAttente,
    error: erreurReglements,
    refetch: refetchReglements
  } = useQuery({
    queryKey: detailKey('contractor-payments', tenantId, contractorId ?? ''),
    queryFn: () => listContractorPayments(tenantId as string, contractorId as string),
    enabled: Boolean(tenantId && contractorId),
    staleTime: STALE_TIME.list
  });

  // Référentiels du formulaire « convenir d'un marché ». Le poste est exigé par
  // le contrat, jamais deviné : il est choisi ici, à la convention du marché.
  const { data: chantiers } = useQuery({
    queryKey: queryKey('construction-sites', tenantId, {}),
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

  // ---------------------------------------------------------------------
  // Le marché dont on regarde les situations
  //
  // Les situations appartiennent à un marché, pas au tâcheron : une requête
  // par marché serait un nombre variable de hooks. On charge donc celles du
  // marché consulté, le premier par défaut, et on change de marché d'un clic.
  // ---------------------------------------------------------------------

  const [marcheChoisi, setMarcheChoisi] = useState<string | null>(null);
  const marcheConsulte = useMemo(
    () => (marches ?? []).find(m => m.id === marcheChoisi) ?? (marches ?? [])[0] ?? null,
    [marches, marcheChoisi]
  );

  const {
    data: situations,
    isPending: situationsEnAttente,
    error: erreurSituations,
    refetch: refetchSituations
  } = useQuery({
    queryKey: detailKey('progress-statements', tenantId, marcheConsulte?.id ?? ''),
    queryFn: () => listProgressStatements(tenantId as string, (marcheConsulte as ContractorContract).id),
    enabled: Boolean(tenantId && marcheConsulte),
    staleTime: STALE_TIME.list
  });

  // ---------------------------------------------------------------------
  // Convenir d'un marché
  // ---------------------------------------------------------------------

  const [chantierMarche, setChantierMarche] = useState<string | undefined>(undefined);
  const [posteMarche, setPosteMarche] = useState<string | undefined>(undefined);
  const [referenceMarche, setReferenceMarche] = useState('');
  const [montantMarche, setMontantMarche] = useState<number | null>(null);
  const [dateSignature, setDateSignature] = useState<Dayjs>(() => dayjs());
  const [marcheEnCours, setMarcheEnCours] = useState(false);

  const peutConvenirMarche =
    Boolean(chantierMarche) && Boolean(posteMarche) && Boolean(referenceMarche.trim()) && (montantMarche ?? 0) > 0;

  const convenirMarche = async () => {
    if (!tenantId || !contractorId || !chantierMarche || !posteMarche) return;
    if (!referenceMarche.trim()) {
      message.error(t('La référence du marché est obligatoire.'));
      return;
    }
    setMarcheEnCours(true);
    try {
      await createContractorContract(tenantId, contractorId, {
        siteId: chantierMarche,
        costCategoryId: posteMarche,
        reference: referenceMarche.trim(),
        agreedAmount: montantMarche as number,
        signedDate: dateSignature.format('YYYY-MM-DD')
      });
      await queryClient.invalidateQueries({
        queryKey: queryKey('contractor-contracts', tenantId, { contractorId })
      });
      message.success(t('Marché convenu.'));
      setChantierMarche(undefined);
      setPosteMarche(undefined);
      setReferenceMarche('');
      setMontantMarche(null);
      setDateSignature(dayjs());
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La convention du marché a échoué.'));
    } finally {
      setMarcheEnCours(false);
    }
  };

  // ---------------------------------------------------------------------
  // Saisir une situation d'avancement
  // ---------------------------------------------------------------------

  const [dateSituation, setDateSituation] = useState<Dayjs>(() => dayjs());
  const [montantSituation, setMontantSituation] = useState<number | null>(null);
  const [descriptionSituation, setDescriptionSituation] = useState('');
  const [situationEnCours, setSituationEnCours] = useState(false);

  const descriptionManquante = !descriptionSituation.trim();
  const peutSaisirSituation = (montantSituation ?? 0) > 0 && !descriptionManquante;

  /**
   * Le montant dépasse ce qu'il reste à exécuter sur ce marché. On AVERTIT,
   * on ne bloque pas : le serveur l'accepte, et refuser ici empêcherait
   * d'enregistrer un travail réellement fait.
   */
  const situationDepasseLeMarche = Boolean(
    marcheConsulte && montantSituation !== null && montantSituation > marcheConsulte.remainingAmount
  );

  const saisirSituation = async () => {
    if (!tenantId || !marcheConsulte) return;
    if (descriptionManquante) {
      // Dit avant l'envoi : le serveur refuserait une description vide, et
      // une situation sans description est un chiffre que personne ne saura
      // justifier six mois plus tard.
      message.error(t('La description de la situation est obligatoire.'));
      return;
    }
    if ((montantSituation ?? 0) <= 0) {
      message.error(t('Le montant de la situation doit être strictement positif.'));
      return;
    }
    setSituationEnCours(true);
    try {
      await createProgressStatement(tenantId, marcheConsulte.id, {
        statementDate: dateSituation.format('YYYY-MM-DD'),
        amount: montantSituation as number,
        description: descriptionSituation.trim()
      });
      await queryClient.invalidateQueries({ queryKey: detailKey('progress-statements', tenantId, marcheConsulte.id) });
      message.success(t('Situation saisie en brouillon.'));
      setDateSituation(dayjs());
      setMontantSituation(null);
      setDescriptionSituation('');
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La saisie de la situation a échoué.'));
    } finally {
      setSituationEnCours(false);
    }
  };

  const validerSituation = async (situation: ProgressStatement) => {
    if (!tenantId || !contractorId || !marcheConsulte) return;
    try {
      await validateProgressStatement(tenantId, situation.id);
      // La validation fait monter les situations validées du marché ET ce
      // qu'on doit au tâcheron : les deux soldes bougent, les deux listes se
      // rechargent.
      await queryClient.invalidateQueries({ queryKey: detailKey('progress-statements', tenantId, marcheConsulte.id) });
      await queryClient.invalidateQueries({
        queryKey: queryKey('contractor-contracts', tenantId, { contractorId })
      });
      await queryClient.invalidateQueries({ queryKey: detailKey('contractors', tenantId, contractorId) });
      message.success(t('Situation validée.'));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La validation de la situation a échoué.'));
    }
  };

  // ---------------------------------------------------------------------
  // Enregistrer un règlement
  // ---------------------------------------------------------------------

  const [dateReglement, setDateReglement] = useState<Dayjs>(() => dayjs());
  const [montantReglement, setMontantReglement] = useState<number | null>(null);
  const [reglementEnCours, setReglementEnCours] = useState(false);

  const peutEnregistrerReglement = (montantReglement ?? 0) > 0;

  /** Dépasse ce qu'on lui doit : c'est un acompte, on avertit sans jamais bloquer. */
  const reglementDepasseCeQuOnDoit = Boolean(
    tacheron && montantReglement !== null && montantReglement > tacheron.accountBalance
  );

  const enregistrerReglement = async () => {
    if (!tenantId || !contractorId || !peutEnregistrerReglement) return;
    setReglementEnCours(true);
    try {
      await createContractorPayment(tenantId, contractorId, {
        paymentDate: dateReglement.format('YYYY-MM-DD'),
        amount: montantReglement as number
      });
      await queryClient.invalidateQueries({ queryKey: detailKey('contractor-payments', tenantId, contractorId) });
      message.success(t('Règlement enregistré en brouillon.'));
      setDateReglement(dayjs());
      setMontantReglement(null);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'enregistrement du règlement a échoué."));
    } finally {
      setReglementEnCours(false);
    }
  };

  const validerReglement = async (reglement: ContractorPayment) => {
    if (!tenantId || !contractorId) return;
    try {
      await validateContractorPayment(tenantId, reglement.id);
      await queryClient.invalidateQueries({ queryKey: detailKey('contractor-payments', tenantId, contractorId) });
      await queryClient.invalidateQueries({ queryKey: detailKey('contractors', tenantId, contractorId) });
      message.success(t('Règlement validé.'));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La validation du règlement a échoué.'));
    }
  };

  // ---------------------------------------------------------------------

  if (!tenantId || !contractorId) {
    return <StateBlock variant="empty" title={t('Aucun tâcheron sélectionné')} />;
  }

  const filAriane = [
    { label: t('Finance'), to: `/tenant/${tenantId}/finance/tacherons` },
    { label: t('Tâcherons'), to: `/tenant/${tenantId}/finance/tacherons` },
    ...(tacheron ? [{ label: tacheron.fullName }] : [{ label: t('Tâcheron') }])
  ];

  if (erreurTacheron) {
    return (
      <>
        <PageHeader title={t('Tâcheron')} breadcrumbs={filAriane} />
        <StateBlock
          variant="error"
          description={t('Impossible de charger ce tâcheron.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetchTacheron(), primary: true }]}
        />
      </>
    );
  }

  if (tacheronEnAttente) {
    return (
      <>
        <PageHeader title={t('Tâcheron')} breadcrumbs={filAriane} />
        <StateBlock variant="loading" />
      </>
    );
  }

  if (!tacheron) {
    // `findContractor` rend `null` quand l'identifiant ne correspond à aucun
    // tâcheron de l'agence : introuvable, ce qui n'est pas « en chargement ».
    return (
      <>
        <PageHeader title={t('Tâcheron')} breadcrumbs={filAriane} />
        <StateBlock variant="empty" title={t('Ce tâcheron est introuvable dans cette agence.')} />
      </>
    );
  }

  const colonnesMarches: ColumnsType<ContractorContract> = [
    { title: t('Référence'), key: 'reference', render: (_, m) => m.reference },
    { title: t('Chantier'), key: 'chantier', render: (_, m) => m.siteLabel },
    // Le nom du poste, jamais son identifiant : c'est lui qui reçoit les
    // situations dans le coût du chantier.
    { title: t('Poste de dépense'), key: 'poste', render: (_, m) => m.costCategoryLabel },
    { title: t('Signé le'), key: 'signe', width: 120, render: (_, m) => dateCourte(m.signedDate) },
    {
      title: t('Montant convenu'),
      key: 'convenu',
      align: 'end',
      render: (_, m) => <MoneyValue value={m.agreedAmount} />
    },
    {
      title: t('Situations validées'),
      key: 'situe',
      align: 'end',
      render: (_, m) => <MoneyValue value={m.statementedAmount} />
    },
    {
      // « Marché restant », jamais « solde » : ce qui reste à EXÉCUTER, à ne
      // pas confondre avec ce qu'on doit au tâcheron (voir l'en-tête).
      title: t('Marché restant'),
      key: 'restant',
      align: 'end',
      render: (_, m) => (
        <Space orientation="vertical" size={0} style={{ alignItems: 'flex-end' }}>
          <MoneyValue value={m.remainingAmount} signed />
          {m.isOverrun && <StatusTag status="OVERRUN" tone="warning" label={t('Dépassement')} />}
        </Space>
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, m) => (
        <Button type="link" onClick={() => setMarcheChoisi(m.id)} disabled={marcheConsulte?.id === m.id}>
          {marcheConsulte?.id === m.id ? t('Situations affichées') : t('Voir les situations')}
        </Button>
      )
    }
  ];

  const colonnesSituations: ColumnsType<ProgressStatement> = [
    { title: t('Date'), key: 'date', width: 120, render: (_, s) => dateCourte(s.statementDate) },
    { title: t('Description'), key: 'description', render: (_, s) => s.description },
    { title: t('Montant'), key: 'montant', align: 'end', render: (_, s) => <MoneyValue value={s.amount} /> },
    { title: t('Saisie par'), key: 'saisie', render: (_, s) => s.createdByLabel },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, s) => (
        <StatusTag status={s.status} tone={TONE_PIECE[s.status]} label={CONTRACTOR_DOCUMENT_STATUS_LABELS[s.status]} />
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, s) =>
        s.status === 'DRAFT' ? (
          <ConfirmAction
            title={t('Valider la situation du {{value}} ?', { value: dateCourte(s.statementDate) })}
            description={t(
              'Cette opération est irréversible : la situation est constatée, le coût du chantier monte du même montant, et le tâcheron devient créancier de cette somme.'
            )}
            okText={t('Confirmer la validation')}
            onConfirm={() => validerSituation(s)}
          >
            <Button type="link">{t('Valider')}</Button>
          </ConfirmAction>
        ) : null
    }
  ];

  const colonnesReglements: ColumnsType<ContractorPayment> = [
    { title: t('Date'), key: 'date', width: 120, render: (_, r) => dateCourte(r.paymentDate) },
    { title: t('Montant'), key: 'montant', align: 'end', render: (_, r) => <MoneyValue value={r.amount} /> },
    { title: t('Saisi par'), key: 'saisi', render: (_, r) => r.createdByLabel },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, r) => (
        <StatusTag status={r.status} tone={TONE_PIECE[r.status]} label={CONTRACTOR_DOCUMENT_STATUS_LABELS[r.status]} />
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, r) =>
        r.status === 'DRAFT' ? (
          <ConfirmAction
            title={t('Valider le règlement du {{value}} ?', { value: dateCourte(r.paymentDate) })}
            description={t(
              "Cette opération est irréversible : la somme sort de la caisse et vient en diminution de ce qu'on doit au tâcheron."
            )}
            okText={t('Confirmer la validation')}
            onConfirm={() => validerReglement(r)}
          >
            <Button type="link">{t('Valider')}</Button>
          </ConfirmAction>
        ) : null
    }
  ];

  return (
    <>
      <PageHeader
        title={tacheron.fullName}
        subtitle={tacheron.trade ?? t('Corps de métier non renseigné')}
        breadcrumbs={filAriane}
        extra={<StatusTag status={tacheron.isActive ? 'ACTIVE' : 'INACTIVE'} />}
      />

      {/*
        L'encart qui empêche la confusion des deux soldes. Il est écrit en
        toutes lettres, au-dessus des chiffres, parce qu'aucune disposition ne
        suffit à elle seule : « marché restant » et « ce qu'on lui doit »
        répondent à deux questions différentes, et rien dans les nombres ne le
        dit. Voir l'en-tête de ce fichier.
      */}
      <Card style={{ marginBottom: 'var(--space-4)' }}>
        <Title level={5} style={{ marginTop: 0 }}>
          {t('Deux chiffres à ne pas confondre')}
        </Title>
        <Text type="secondary">
          <strong>{t('Marché restant')}</strong> {t('= montant convenu − situations validées : ce qui reste à')}{' '}
          <strong>{t('exécuter')}</strong>
          {t(', marché par marché.')} <strong>{t("Ce qu'on lui doit")}</strong>{' '}
          {t('= situations validées − règlements : ce qui reste à')} <strong>payer</strong>
          {t(
            ", tous marchés confondus. Un tâcheron peut avoir fini son marché et rester créancier, ou n'avoir rien exécuté et avoir déjà reçu une avance."
          )}
        </Text>
      </Card>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-6)'
        }}
      >
        {/* Le seul solde qui vive sur le TÂCHERON. Affiché tel que le serveur
            l'émet, jamais recalculé, et jamais nommé « solde » tout court. */}
        <StatCard
          label={t("Ce qu'on lui doit")}
          value={<MoneyValue value={tacheron.accountBalance} signed />}
          tone={tacheron.accountBalance > 0 ? 'warning' : 'neutral'}
          hint={
            tacheron.accountBalance < 0
              ? t('Avance déjà versée : ses prochaines situations validées la résorberont.')
              : t('Situations validées − règlements : ce qui reste à payer, tous marchés confondus.')
          }
        />
        <StatCard
          label={t('Marchés en cours')}
          value={(marches ?? []).filter(m => m.isActive).length}
          hint={t('Le marché restant de chacun se lit dans le tableau ci-dessous.')}
        />
      </div>

      <Title level={4}>{t('Marchés')}</Title>
      <DataView<ContractorContract>
        // Le contrat de `listContractorContracts` ne pagine pas.
        paginated={false}
        scrollX={1400}
        items={marches ?? []}
        total={(marches ?? []).length}
        page={1}
        pageSize={Math.max((marches ?? []).length, 1)}
        onPageChange={() => {}}
        loading={marchesEnAttente}
        error={erreurMarches ? t('Impossible de charger les marchés de ce tâcheron.') : null}
        onRetry={() => refetchMarches()}
        emptyDescription={t("Aucun marché n'a encore été convenu avec ce tâcheron.")}
        columns={colonnesMarches}
        rowKey={m => m.id}
        aria-label={t('Marchés du tâcheron')}
        renderCard={m => (
          <DataCard
            title={m.reference}
            aria-label={m.reference}
            subtitle={t('{{chantier}} — poste « {{poste}} »', {
              chantier: m.siteLabel,
              poste: m.costCategoryLabel
            })}
            status={m.isOverrun ? <StatusTag status="OVERRUN" tone="warning" label={t('Dépassement')} /> : undefined}
            highlight={<MoneyValue value={m.agreedAmount} />}
            fields={[
              { label: t('Situations validées'), value: <MoneyValue value={m.statementedAmount} /> },
              { label: t('Marché restant'), value: <MoneyValue value={m.remainingAmount} signed /> },
              { label: t('Signé le'), value: dateCourte(m.signedDate) }
            ]}
            primaryAction={{ label: t('Voir les situations'), onClick: () => setMarcheChoisi(m.id) }}
          />
        )}
      />

      <Card style={{ marginTop: 'var(--space-4)' }}>
        <Title level={5} style={{ marginTop: 0 }}>
          {t("Convenir d'un marché")}
        </Title>
        <Space wrap size="middle" align="end">
          <div style={{ minWidth: 220 }}>
            <div>
              <label htmlFor="marche-chantier">{t('Chantier')}</label>
            </div>
            <Select
              id="marche-chantier"
              style={{ width: 220 }}
              placeholder={t('Choisir un chantier')}
              value={chantierMarche}
              onChange={setChantierMarche}
              showSearch
              optionFilterProp="label"
              options={optionsChantiers}
              notFoundContent={t('Aucun chantier disponible')}
            />
            {/* Le chantier se fige ici, à la convention du marché : chaque
                situation qui en découlera l'hérite sans plus le choisir. Même
                avertissement que la sortie de stock (Stock.tsx). */}
            <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
              {t("Un chantier clos n'accepte plus d'imputation : la situation y serait refusée.")}
            </Text>
          </div>
          <div style={{ minWidth: 220 }}>
            <div>
              <label htmlFor="marche-poste">{t('Poste de dépense')}</label>
            </div>
            {/* Exigé, jamais deviné : c'est ce poste qui recevra les
                situations dans le coût du chantier (contrat gelé). */}
            <Select
              id="marche-poste"
              style={{ width: 220 }}
              placeholder={t('Choisir un poste')}
              value={posteMarche}
              onChange={setPosteMarche}
              showSearch
              optionFilterProp="label"
              options={optionsPostes}
              notFoundContent={t('Aucun poste de dépense disponible')}
            />
          </div>
          <div>
            <div>
              <label htmlFor="marche-reference">{t('Référence du marché')}</label>
            </div>
            <Input
              id="marche-reference"
              style={{ width: 220 }}
              value={referenceMarche}
              onChange={event => setReferenceMarche(event.target.value)}
              placeholder={t('Ex. MAR-2026-014')}
            />
          </div>
          <div>
            <div>
              <label htmlFor="marche-montant">{t('Montant convenu')}</label>
            </div>
            <InputNumber
              id="marche-montant"
              min={0}
              style={{ width: 180 }}
              value={montantMarche ?? undefined}
              onChange={value => setMontantMarche((value as number | null) ?? null)}
              {...montantSaisiProps}
            />
          </div>
          <div>
            <div>
              <label htmlFor="marche-date">{t('Date de signature')}</label>
            </div>
            <DatePicker
              id="marche-date"
              format="DD/MM/YYYY"
              value={dateSignature}
              onChange={v => setDateSignature(v ?? dayjs())}
            />
          </div>
          <Button type="primary" loading={marcheEnCours} disabled={!peutConvenirMarche} onClick={convenirMarche}>
            {t('Convenir le marché')}
          </Button>
        </Space>
      </Card>

      <Title level={4} style={{ marginTop: 'var(--space-6)' }}>
        {marcheConsulte
          ? t("Situations d'avancement — marché « {{reference}} »", { reference: marcheConsulte.reference })
          : t("Situations d'avancement")}
      </Title>

      {marcheConsulte ? (
        <>
          <Text type="secondary">
            {t('Marché restant sur «')} {marcheConsulte.reference} » :{' '}
            <MoneyValue value={marcheConsulte.remainingAmount} signed />
            {marcheConsulte.isOverrun
              ? t('— les situations validées dépassent le montant convenu. Le dépassement est enregistré, pas refusé.')
              : t('— ce qui reste à exécuter, et non ce qu’on lui doit.')}
          </Text>

          <div style={{ marginTop: 'var(--space-3)' }}>
            <DataView<ProgressStatement>
              paginated={false}
              scrollX={1000}
              items={situations ?? []}
              total={(situations ?? []).length}
              page={1}
              pageSize={Math.max((situations ?? []).length, 1)}
              onPageChange={() => {}}
              loading={situationsEnAttente}
              error={erreurSituations ? t('Impossible de charger les situations de ce marché.') : null}
              onRetry={() => refetchSituations()}
              emptyDescription={t("Aucune situation n'a encore été saisie sur ce marché.")}
              columns={colonnesSituations}
              rowKey={s => s.id}
              aria-label={t("Situations d'avancement du marché")}
              renderCard={s => (
                <DataCard
                  title={dateCourte(s.statementDate)}
                  aria-label={t('Situation du {{value}}', { value: dateCourte(s.statementDate) })}
                  subtitle={s.description}
                  status={
                    <StatusTag
                      status={s.status}
                      tone={TONE_PIECE[s.status]}
                      label={CONTRACTOR_DOCUMENT_STATUS_LABELS[s.status]}
                    />
                  }
                  highlight={<MoneyValue value={s.amount} />}
                  fields={[{ label: t('Saisie par'), value: s.createdByLabel }]}
                  primaryAction={
                    s.status === 'DRAFT'
                      ? {
                          label: 'Valider',
                          onClick: () =>
                            confirmerAction({
                              title: t('Valider la situation du {{value}} ?', { value: dateCourte(s.statementDate) }),
                              description: t(
                                'Cette opération est irréversible : la situation est constatée, le coût du chantier monte du même montant, et le tâcheron devient créancier de cette somme.'
                              ),
                              okText: t('Confirmer la validation'),
                              onConfirm: () => validerSituation(s)
                            })
                        }
                      : undefined
                  }
                />
              )}
            />
          </div>

          <Card style={{ marginTop: 'var(--space-4)' }}>
            <Title level={5} style={{ marginTop: 0 }}>
              {t('Saisir une situation')}
            </Title>
            <Space wrap size="middle" align="end">
              <div>
                <div>
                  <label htmlFor="situation-date">{t('Date de la situation')}</label>
                </div>
                <DatePicker
                  id="situation-date"
                  format="DD/MM/YYYY"
                  value={dateSituation}
                  onChange={v => setDateSituation(v ?? dayjs())}
                />
              </div>
              <div>
                <div>
                  <label htmlFor="situation-montant">{t('Montant de la situation')}</label>
                </div>
                {/* Aucune borne haute : un dépassement de marché est accepté
                    par le serveur, et le refuser ici empêcherait d'enregistrer
                    un travail réellement fait. */}
                <InputNumber
                  id="situation-montant"
                  min={0}
                  style={{ width: 180 }}
                  value={montantSituation ?? undefined}
                  onChange={value => setMontantSituation((value as number | null) ?? null)}
                  {...montantSaisiProps}
                />
              </div>
              <div style={{ minWidth: 320 }}>
                <div>
                  <label htmlFor="situation-description">{t('Description des travaux')}</label>
                </div>
                <TextArea
                  id="situation-description"
                  rows={2}
                  style={{ width: 320 }}
                  value={descriptionSituation}
                  onChange={event => setDescriptionSituation(event.target.value)}
                  placeholder={t('Ex. Élévation des murs du rez-de-chaussée, 60 %')}
                />
              </div>
              <Button
                type="primary"
                loading={situationEnCours}
                disabled={!peutSaisirSituation}
                onClick={saisirSituation}
              >
                {t('Saisir la situation')}
              </Button>
            </Space>

            {/* Dit AVANT l'envoi, pas après un 400 : le serveur refuse une
                description vide, et une situation sans description est un
                chiffre que personne ne saura justifier six mois plus tard. */}
            <div style={{ marginTop: 'var(--space-2)' }}>
              <Text type={descriptionManquante ? 'danger' : 'secondary'}>
                {t('La description est obligatoire : sans elle, personne ne saura justifier ce montant dans six mois.')}
              </Text>
            </div>

            {situationDepasseLeMarche && (
              <div style={{ marginTop: 'var(--space-2)' }}>
                {/* Un avertissement, jamais un blocage. */}
                <Text type="warning">
                  {t(
                    'Ce montant dépasse le marché restant. La situation sera tout de même enregistrée : le marché apparaîtra en dépassement, ce qui est une information, pas une erreur.'
                  )}
                </Text>
              </div>
            )}
          </Card>
        </>
      ) : (
        <StateBlock
          variant="empty"
          description={t(
            "Convenez d'abord un marché : les situations d'avancement se rattachent à un marché, jamais au tâcheron seul."
          )}
        />
      )}

      <Title level={4} style={{ marginTop: 'var(--space-6)' }}>
        {t('Règlements')}
      </Title>
      <DataView<ContractorPayment>
        paginated={false}
        scrollX={900}
        items={reglements ?? []}
        total={(reglements ?? []).length}
        page={1}
        pageSize={Math.max((reglements ?? []).length, 1)}
        onPageChange={() => {}}
        loading={reglementsEnAttente}
        error={erreurReglements ? t('Impossible de charger les règlements de ce tâcheron.') : null}
        onRetry={() => refetchReglements()}
        emptyDescription={t("Aucun règlement n'a encore été enregistré pour ce tâcheron.")}
        columns={colonnesReglements}
        rowKey={r => r.id}
        aria-label={t('Règlements du tâcheron')}
        renderCard={r => (
          <DataCard
            title={dateCourte(r.paymentDate)}
            aria-label={t('Règlement du {{value}}', { value: dateCourte(r.paymentDate) })}
            status={
              <StatusTag
                status={r.status}
                tone={TONE_PIECE[r.status]}
                label={CONTRACTOR_DOCUMENT_STATUS_LABELS[r.status]}
              />
            }
            highlight={<MoneyValue value={r.amount} />}
            fields={[{ label: t('Saisi par'), value: r.createdByLabel }]}
            primaryAction={
              r.status === 'DRAFT'
                ? {
                    label: 'Valider',
                    onClick: () =>
                      confirmerAction({
                        title: t('Valider le règlement du {{value}} ?', { value: dateCourte(r.paymentDate) }),
                        description: t(
                          "Cette opération est irréversible : la somme sort de la caisse et vient en diminution de ce qu'on doit au tâcheron."
                        ),
                        okText: t('Confirmer la validation'),
                        onConfirm: () => validerReglement(r)
                      })
                  }
                : undefined
            }
          />
        )}
      />

      <Card style={{ marginTop: 'var(--space-4)' }}>
        <Title level={5} style={{ marginTop: 0 }}>
          {t('Enregistrer un règlement')}
        </Title>
        <Space wrap size="middle" align="end">
          <div>
            <div>
              <label htmlFor="reglement-date">{t('Date du règlement')}</label>
            </div>
            <DatePicker
              id="reglement-date"
              format="DD/MM/YYYY"
              value={dateReglement}
              onChange={v => setDateReglement(v ?? dayjs())}
            />
          </div>
          <div>
            <div>
              <label htmlFor="reglement-montant">{t('Montant du règlement')}</label>
            </div>
            {/* Aucune borne haute non plus : un règlement supérieur à ce qu'on
                doit est un acompte, que le contrat prévoit explicitement. */}
            <InputNumber
              id="reglement-montant"
              min={0}
              style={{ width: 180 }}
              value={montantReglement ?? undefined}
              onChange={value => setMontantReglement((value as number | null) ?? null)}
              {...montantSaisiProps}
            />
          </div>
          <Button
            type="primary"
            loading={reglementEnCours}
            disabled={!peutEnregistrerReglement}
            onClick={enregistrerReglement}
          >
            {t('Enregistrer le règlement')}
          </Button>
        </Space>

        {reglementDepasseCeQuOnDoit && (
          <div style={{ marginTop: 'var(--space-2)' }}>
            {/* Averti, jamais bloqué : c'est un acompte, et le contrat le
                prévoit. */}
            <Text type="warning">
              {t(
                "Ce règlement dépasse ce qu'on lui doit aujourd'hui. Il sera enregistré comme une avance, que ses prochaines situations validées résorberont."
              )}
            </Text>
          </div>
        )}
      </Card>
    </>
  );
};

export default Tacheron;
