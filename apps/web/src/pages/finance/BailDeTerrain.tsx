import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { App, Button, Card, DatePicker, InputNumber, Select, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import {
  createLandLeasePayment,
  getLandLease,
  listLandLeaseAccruals,
  listLandLeasePayments,
  recordLandLeaseAccrual,
  setSiteLandLease,
  validateLandLeasePayment
} from '../../services/finance-lot4-service';
import { listConstructionSites } from '../../services/finance-lot2-service';
import { LAND_LEASE_STATUS_LABELS } from '../../types/finance-lot4-types';
import type { LandLeaseAccrual, LandLeasePayment, LandLeaseSiteRef } from '../../types/finance-lot4-types';
import { detailKey, entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import { montantSaisiProps } from '../../utils/montant-saisi';
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

/**
 * Fiche d'un bail de terrain — lot 4, sous-lot 1
 * (`specs/019-finance-baux-terrain/data-model.md` §2, §5).
 *
 * URL : `/tenant/:tenantId/finance/baux-terrain/:landLeaseId`. Le bail est
 * dans le CHEMIN, pas en paramètre de requête — le défaut relevé deux fois au
 * lot 2 : une navigation en `?xxx=` vers une route qui porte l'identifiant
 * dans le chemin ne mène nulle part, et aucun test ne peut le voir puisque les
 * tests déclarent eux-mêmes leurs routes. `useParams` et l'URL déclarée ici
 * coïncident par construction (voir le test de navigation de
 * `__tests__/finance/baux-de-terrain.test.tsx`).
 *
 * ---------------------------------------------------------------------------
 * Le cœur de l'écran : rendre lisible un mécanisme contre-intuitif
 * ---------------------------------------------------------------------------
 *
 * On paie un bailleur une fois par an, d'avance, et la charge se répand sur
 * douze mois. Un écran qui n'afficherait qu'un solde ne serait pas compris :
 * cette fiche montre donc TROIS chiffres, jamais `accountBalance` brut :
 *
 * - **Payé à ce jour** — la somme des paiements VALIDÉS de ce bail. Ce n'est
 *   pas un champ du contrat gelé (`LandLease` n'en porte pas), donc ce total
 *   est composé ici à partir de la liste déjà entièrement affichée plus bas —
 *   une addition de rang, pas une règle métier reconstituée. Voir la rubrique
 *   « Hypothèses » du rapport de cet agent.
 * - **Consommé à ce jour** — la somme des constatations mensuelles, du même
 *   ressort : chaque constatation naît déjà validée (§3.3 du modèle), donc
 *   cette liste EST l'historique complet de ce qui a été consommé.
 * - **Reste à consommer** — dérivé du seul `accountBalance` du contrat, par un
 *   simple changement de signe (`resteAConsommer`), jamais recalculé à partir
 *   des deux totaux ci-dessus : c'est la grandeur que le compte de tiers porte
 *   déjà, et c'est elle qui doit rester la référence si jamais les deux totaux
 *   composés localement s'écartaient d'elle (paiement ou constatation qui
 *   n'aurait pas encore été rechargé, par exemple).
 *
 * **`monthlyAmount` n'est jamais divisé ici.** Il arrive tout fait ; le
 * reliquat d'arrondi du douzième mois est porté par la dernière constatation
 * de l'année, visible telle quelle dans la liste des constatations.
 *
 * **Une constatation sans imputation n'est pas une ligne manquante.** Quand
 * `allocations` est vide, ce bail n'avait aucun chantier actif à cette
 * date : la liste des constatations le dit explicitement, elle ne laisse pas
 * de blanc (§3.1 du modèle).
 *
 * **Validation d'un paiement : irréversible, dit avant.** Comme aux lots 2 et
 * 3, `<ConfirmAction>` porte l'avertissement dans sa description.
 *
 * **Le rattachement d'un chantier se fait depuis CETTE fiche**, pas depuis
 * `ChantierDetail.tsx` (lot 2, gelé, hors du territoire de cet agent) — voir
 * le commentaire de `setSiteLandLease` dans `finance-lot4-service.ts`.
 *
 * **Vocabulaire (P-1 du PRD).** On *loue*, on *paie*, on *constate*, on
 * *impute* — jamais « débit » ni « crédit ».
 *
 * **Le poste de dépense du bail (ajout au contrat du 19 septembre 2026).**
 * `costCategoryLabel` est affiché tel quel, jamais `costCategoryId` : c'est
 * le poste qui reçoit le loyer dans le coût des chantiers rattachés.
 */

const TONE_PAIEMENT: Record<string, StatusTone> = { DRAFT: 'neutral', VALIDATED: 'success' };

const MOIS_FR = [
  'janvier',
  t('février'),
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  t('août'),
  'septembre',
  'octobre',
  'novembre',
  t('décembre')
];

const OPTIONS_MOIS = MOIS_FR.map((libelle, index) => ({
  value: index + 1,
  label: libelle.charAt(0).toUpperCase() + libelle.slice(1)
}));

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

function libellePeriode(year: number, month: number): string {
  const nomMois = MOIS_FR[month - 1] ?? String(month);
  return `${nomMois.charAt(0).toUpperCase()}${nomMois.slice(1)} ${year}`;
}

/**
 * Traduit le solde du compte de tiers en « ce qu'il reste à consommer ».
 * Voir le commentaire jumeau dans `pages/finance/BauxDeTerrain.tsx` : même
 * fonction, recopiée plutôt qu'importée pour ne pas faire dépendre cette
 * fiche d'un détail d'implémentation de la liste.
 */
function resteAConsommer(accountBalance: number): number {
  return -accountBalance;
}

export const BailDeTerrain: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId, landLeaseId } = useParams<{ tenantId: string; landLeaseId: string }>();
  const queryClient = useQueryClient();
  const confirmerAction = useConfirmAction();

  const {
    data: bail,
    isPending: bailEnAttente,
    error: erreurBail,
    refetch: refetchBail
  } = useQuery({
    queryKey: detailKey('land-leases', tenantId, landLeaseId ?? ''),
    queryFn: () => getLandLease(tenantId as string, landLeaseId as string),
    enabled: Boolean(tenantId && landLeaseId),
    staleTime: STALE_TIME.list
  });

  const {
    data: paiements,
    isPending: paiementsEnAttente,
    error: erreurPaiements,
    refetch: refetchPaiements
  } = useQuery({
    queryKey: detailKey('land-lease-payments', tenantId, landLeaseId ?? ''),
    queryFn: () => listLandLeasePayments(tenantId as string, landLeaseId as string),
    enabled: Boolean(tenantId && landLeaseId),
    staleTime: STALE_TIME.list
  });

  const {
    data: constatations,
    isPending: constatationsEnAttente,
    error: erreurConstatations,
    refetch: refetchConstatations
  } = useQuery({
    queryKey: detailKey('land-lease-accruals', tenantId, landLeaseId ?? ''),
    queryFn: () => listLandLeaseAccruals(tenantId as string, landLeaseId as string),
    enabled: Boolean(tenantId && landLeaseId),
    staleTime: STALE_TIME.list
  });

  // Référentiel des chantiers, pour le seul sélecteur de rattachement
  // ci-dessous. `ConstructionSite` (lot 2, gelé) n'expose pas
  // `landLeaseId` : ce référentiel ne permet donc d'exclure que les chantiers
  // déjà listés dans `bail.sites`, pas ceux rattachés à un AUTRE bail — voir
  // la rubrique « Hypothèses » du rapport de cet agent.
  const { data: chantiers } = useQuery({
    queryKey: queryKey('construction-sites', tenantId, {}),
    queryFn: () => listConstructionSites(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const optionsRattachement = useMemo(() => {
    const idsRattaches = new Set((bail?.sites ?? []).map(s => s.siteId));
    return (chantiers ?? [])
      .filter(c => !idsRattaches.has(c.id))
      .map(c => ({ value: c.id, label: c.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [chantiers, bail]);

  // ---------------------------------------------------------------------
  // Les trois chiffres qui rendent le mécanisme lisible (voir l'en-tête)
  // ---------------------------------------------------------------------

  const paye = useMemo(
    () => (paiements ?? []).filter(p => p.status === 'VALIDATED').reduce((somme, p) => somme + p.amount, 0),
    [paiements]
  );
  const consomme = useMemo(() => (constatations ?? []).reduce((somme, c) => somme + c.amount, 0), [constatations]);

  // ---------------------------------------------------------------------
  // Rattachement d'un chantier
  // ---------------------------------------------------------------------

  const [siteARattacher, setSiteARattacher] = useState<string | undefined>(undefined);
  const [rattachementEnCours, setRattachementEnCours] = useState(false);

  const rattacherChantier = async () => {
    if (!tenantId || !landLeaseId || !siteARattacher) return;
    setRattachementEnCours(true);
    try {
      await setSiteLandLease(tenantId, siteARattacher, landLeaseId);
      await queryClient.invalidateQueries({ queryKey: detailKey('land-leases', tenantId, landLeaseId) });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('land-leases', tenantId) });
      message.success(t('Chantier rattaché au bail.'));
      setSiteARattacher(undefined);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('Le rattachement a échoué.'));
    } finally {
      setRattachementEnCours(false);
    }
  };

  const detacherChantier = async (site: LandLeaseSiteRef) => {
    if (!tenantId) return;
    try {
      await setSiteLandLease(tenantId, site.siteId, null);
      await queryClient.invalidateQueries({ queryKey: detailKey('land-leases', tenantId, landLeaseId ?? '') });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('land-leases', tenantId) });
      message.success(t('Chantier « {{siteLabel}} » détaché du bail.', { siteLabel: site.siteLabel }));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('Le détachement a échoué.'));
    }
  };

  // ---------------------------------------------------------------------
  // Paiement annuel — saisie et validation
  // ---------------------------------------------------------------------

  const [datePaiement, setDatePaiement] = useState<Dayjs>(() => dayjs());
  const [montantPaiement, setMontantPaiement] = useState<number | null>(null);
  const [debutCouverture, setDebutCouverture] = useState<Dayjs | null>(null);
  const [finCouverture, setFinCouverture] = useState<Dayjs | null>(null);
  const [enregistrementPaiementEnCours, setEnregistrementPaiementEnCours] = useState(false);

  const peutEnregistrerPaiement =
    Boolean(montantPaiement && montantPaiement > 0) && Boolean(debutCouverture) && Boolean(finCouverture);

  const enregistrerPaiement = async () => {
    if (!tenantId || !landLeaseId || !peutEnregistrerPaiement || !debutCouverture || !finCouverture) return;
    setEnregistrementPaiementEnCours(true);
    try {
      await createLandLeasePayment(tenantId, {
        landLeaseId,
        paymentDate: datePaiement.format('YYYY-MM-DD'),
        amount: montantPaiement as number,
        coverageStartDate: debutCouverture.format('YYYY-MM-DD'),
        coverageEndDate: finCouverture.format('YYYY-MM-DD')
      });
      await queryClient.invalidateQueries({ queryKey: detailKey('land-lease-payments', tenantId, landLeaseId) });
      message.success(t('Paiement enregistré en brouillon.'));
      setDatePaiement(dayjs());
      setMontantPaiement(null);
      setDebutCouverture(null);
      setFinCouverture(null);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'enregistrement du paiement a échoué."));
    } finally {
      setEnregistrementPaiementEnCours(false);
    }
  };

  const validerPaiement = async (paiement: LandLeasePayment) => {
    if (!tenantId || !landLeaseId) return;
    try {
      await validateLandLeasePayment(tenantId, paiement.id);
      await queryClient.invalidateQueries({ queryKey: detailKey('land-lease-payments', tenantId, landLeaseId) });
      // La validation fait bouger le compte du bailleur (§2 du modèle) : le
      // bail lui-même, et sa ligne dans la liste, doivent se recharger.
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('land-leases', tenantId) });
      message.success(t('Paiement validé.'));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La validation a échoué.'));
    }
  };

  // ---------------------------------------------------------------------
  // Constatation manuelle d'un mois
  // ---------------------------------------------------------------------

  const [anneeConstat, setAnneeConstat] = useState<number | null>(() => new Date().getFullYear());
  const [moisConstat, setMoisConstat] = useState<number | null>(() => new Date().getMonth() + 1);
  const [constatationEnCours, setConstatationEnCours] = useState(false);

  const constaterMois = async () => {
    if (!tenantId || !landLeaseId || !anneeConstat || !moisConstat) return;
    setConstatationEnCours(true);
    try {
      await recordLandLeaseAccrual(tenantId, landLeaseId, { periodYear: anneeConstat, periodMonth: moisConstat });
      await queryClient.invalidateQueries({ queryKey: detailKey('land-lease-accruals', tenantId, landLeaseId) });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('land-leases', tenantId) });
      message.success(
        t('Constatation de {{value}} enregistrée.', { value: libellePeriode(anneeConstat, moisConstat) })
      );
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La constatation a échoué.'));
    } finally {
      setConstatationEnCours(false);
    }
  };

  // ---------------------------------------------------------------------

  if (!tenantId || !landLeaseId) {
    return <StateBlock variant="empty" title={t('Aucun bail sélectionné')} />;
  }

  const filAriane = [
    { label: t('Finance'), to: `/tenant/${tenantId}/finance/baux-terrain` },
    { label: t('Baux de terrain'), to: `/tenant/${tenantId}/finance/baux-terrain` },
    ...(bail ? [{ label: bail.landLabel }] : [{ label: t('Bail') }])
  ];

  if (erreurBail) {
    return (
      <>
        <PageHeader title={t('Bail de terrain')} breadcrumbs={filAriane} />
        <StateBlock
          variant="error"
          description={t('Impossible de charger ce bail.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetchBail(), primary: true }]}
        />
      </>
    );
  }

  if (bailEnAttente || !bail) {
    return (
      <>
        <PageHeader title={t('Bail de terrain')} breadcrumbs={filAriane} />
        <StateBlock variant="loading" />
      </>
    );
  }

  const colonnesPaiements: ColumnsType<LandLeasePayment> = [
    { title: t('Date de paiement'), key: 'date', width: 140, render: (_, p) => dateCourte(p.paymentDate) },
    {
      title: t('Période couverte'),
      key: 'periode',
      render: (_, p) => `${dateCourte(p.coverageStartDate)} – ${dateCourte(p.coverageEndDate)}`
    },
    { title: t('Montant'), key: 'montant', align: 'end', render: (_, p) => <MoneyValue value={p.amount} /> },
    { title: t('Saisi par'), key: 'saisi', render: (_, p) => p.createdByLabel },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, p) => (
        <StatusTag status={p.status} tone={TONE_PAIEMENT[p.status]} label={LAND_LEASE_STATUS_LABELS[p.status]} />
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, p) =>
        p.status === 'DRAFT' ? (
          <ConfirmAction
            title={t('Valider le paiement du {{value}} ?', { value: dateCourte(p.paymentDate) })}
            description={t(
              "Cette opération est irréversible : une fois validé, ce paiement ne peut plus être modifié, et l'avance versée commence à être consommée mois après mois."
            )}
            okText={t('Confirmer la validation')}
            onConfirm={() => validerPaiement(p)}
          >
            <Button type="link">{t('Valider')}</Button>
          </ConfirmAction>
        ) : null
    }
  ];

  const colonnesConstatations: ColumnsType<LandLeaseAccrual> = [
    { title: t('Période'), key: 'periode', width: 160, render: (_, c) => libellePeriode(c.periodYear, c.periodMonth) },
    {
      title: t('Montant constaté'),
      key: 'montant',
      align: 'end',
      render: (_, c) => <MoneyValue value={c.amount} />
    },
    {
      title: t('Imputations'),
      key: 'imputations',
      render: (_, c) =>
        c.allocations.length > 0 ? (
          <Space orientation="vertical" size={0}>
            {c.allocations.map(a => (
              <span key={a.siteId}>
                {a.siteLabel} — <MoneyValue value={a.amount} />
              </span>
            ))}
          </Space>
        ) : (
          // Le point de vigilance du PRD : ce n'est pas une ligne manquante,
          // c'est qu'aucun chantier n'était actif sur ce bail à cette date.
          <Text type="secondary">
            {t('Aucun chantier actif sur ce bail à cette date : charge constatée sans imputation.')}
          </Text>
        )
    }
  ];

  const colonnesSites: ColumnsType<LandLeaseSiteRef> = [
    { title: t('Chantier'), key: 'chantier', render: (_, s) => s.siteLabel },
    { title: t('Statut'), key: 'statut', render: (_, s) => <StatusTag status={s.status} /> },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, s) => (
        <ConfirmAction
          title={t('Détacher « {{siteLabel}} » de ce bail ?', { siteLabel: s.siteLabel })}
          description={t(
            "Ce chantier ne recevra plus d'imputation de charge de ce bail à compter de la prochaine constatation mensuelle."
          )}
          okText={t('Confirmer le détachement')}
          onConfirm={() => detacherChantier(s)}
        >
          <Button type="link">{t('Détacher')}</Button>
        </ConfirmAction>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title={bail.landLabel}
        subtitle={bail.landlordName}
        breadcrumbs={filAriane}
        extra={<StatusTag status={bail.isActive ? 'ACTIVE' : 'INACTIVE'} />}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-6)'
        }}
      >
        {/* Les trois chiffres qui rendent le mécanisme lisible : voir
            l'en-tête de ce fichier. Aucun n'affiche `accountBalance` brut. */}
        <StatCard label={t('Payé à ce jour')} value={<MoneyValue value={paye} />} />
        <StatCard label={t('Consommé à ce jour')} value={<MoneyValue value={consomme} />} />
        <StatCard
          label={t('Reste à consommer')}
          value={<MoneyValue value={resteAConsommer(bail.accountBalance)} />}
          tone="positive"
        />
        <StatCard label={t('Loyer annuel')} value={<MoneyValue value={bail.annualAmount} />} />
        <StatCard label={t('Mensualité')} value={<MoneyValue value={bail.monthlyAmount} />} />
      </div>

      <Text type="secondary">
        {t('Début du bail le')} {dateCourte(bail.startDate)}
        {bail.endDate ? t(", jusqu'au {{value}}", { value: dateCourte(bail.endDate) }) : t('— tacite reconduction')}.
      </Text>
      <br />
      {/* Le nom du poste, jamais son identifiant (`costCategoryId`) : c'est
          lui qui reçoit le loyer dans le coût des chantiers rattachés (ajout
          au contrat du 19 septembre 2026). */}
      <Text type="secondary">
        {t('Loyer imputé au poste «')} {bail.costCategoryLabel} ».
      </Text>

      <Title level={4} style={{ marginTop: 'var(--space-6)' }}>
        {t('Chantiers rattachés')}
      </Title>
      <DataView<LandLeaseSiteRef>
        paginated={false}
        items={bail.sites}
        total={bail.sites.length}
        page={1}
        pageSize={Math.max(bail.sites.length, 1)}
        onPageChange={() => {}}
        emptyDescription={t(
          "Aucun chantier n'est rattaché à ce bail : les prochaines constatations mensuelles seront enregistrées sans imputation tant qu'aucun n'est ajouté ci-dessous."
        )}
        columns={colonnesSites}
        rowKey={s => s.siteId}
        aria-label={t('Chantiers rattachés au bail')}
        renderCard={s => (
          <DataCard
            title={s.siteLabel}
            aria-label={s.siteLabel}
            status={<StatusTag status={s.status} />}
            primaryAction={{
              label: t('Détacher'),
              onClick: () =>
                confirmerAction({
                  title: t('Détacher « {{siteLabel}} » de ce bail ?', { siteLabel: s.siteLabel }),
                  description: t(
                    "Ce chantier ne recevra plus d'imputation de charge de ce bail à compter de la prochaine constatation mensuelle."
                  ),
                  okText: t('Confirmer le détachement'),
                  onConfirm: () => detacherChantier(s)
                })
            }}
          />
        )}
      />

      <Card style={{ marginTop: 'var(--space-4)' }}>
        <Space wrap align="end" size="middle">
          <div style={{ minWidth: 260 }}>
            <div>
              <label htmlFor="rattacher-chantier">{t('Rattacher un chantier existant')}</label>
            </div>
            <Select
              id="rattacher-chantier"
              style={{ width: '100%' }}
              placeholder={t('Choisir un chantier')}
              value={siteARattacher}
              onChange={setSiteARattacher}
              showSearch
              optionFilterProp="label"
              options={optionsRattachement}
              notFoundContent={t('Aucun chantier disponible')}
            />
          </div>
          <Button type="primary" loading={rattachementEnCours} disabled={!siteARattacher} onClick={rattacherChantier}>
            {t('Rattacher')}
          </Button>
        </Space>
      </Card>

      <Title level={4} style={{ marginTop: 'var(--space-6)' }}>
        {t('Paiements annuels')}
      </Title>
      <DataView<LandLeasePayment>
        paginated={false}
        scrollX={900}
        items={paiements ?? []}
        total={(paiements ?? []).length}
        page={1}
        pageSize={Math.max((paiements ?? []).length, 1)}
        onPageChange={() => {}}
        loading={paiementsEnAttente}
        error={erreurPaiements ? t('Impossible de charger les paiements de ce bail.') : null}
        onRetry={() => refetchPaiements()}
        emptyDescription={t("Aucun paiement n'a encore été saisi pour ce bail.")}
        columns={colonnesPaiements}
        rowKey={p => p.id}
        aria-label={t('Paiements annuels du bail')}
        renderCard={p => (
          <DataCard
            title={dateCourte(p.paymentDate)}
            aria-label={t('Paiement du {{value}}', { value: dateCourte(p.paymentDate) })}
            subtitle={`${dateCourte(p.coverageStartDate)} – ${dateCourte(p.coverageEndDate)}`}
            status={
              <StatusTag status={p.status} tone={TONE_PAIEMENT[p.status]} label={LAND_LEASE_STATUS_LABELS[p.status]} />
            }
            highlight={<MoneyValue value={p.amount} />}
            fields={[{ label: t('Saisi par'), value: p.createdByLabel }]}
            primaryAction={
              p.status === 'DRAFT'
                ? {
                    label: t('Valider'),
                    onClick: () =>
                      confirmerAction({
                        title: t('Valider le paiement du {{value}} ?', { value: dateCourte(p.paymentDate) }),
                        description: t(
                          "Cette opération est irréversible : une fois validé, ce paiement ne peut plus être modifié, et l'avance versée commence à être consommée mois après mois."
                        ),
                        okText: t('Confirmer la validation'),
                        onConfirm: () => validerPaiement(p)
                      })
                  }
                : undefined
            }
          />
        )}
      />

      <Card style={{ marginTop: 'var(--space-4)' }}>
        <Title level={5} style={{ marginTop: 0 }}>
          {t('Nouveau paiement annuel')}
        </Title>
        <Space wrap size="middle" align="end">
          <div>
            <div>
              <label htmlFor="paiement-date">{t('Date de paiement')}</label>
            </div>
            <DatePicker
              id="paiement-date"
              format="DD/MM/YYYY"
              value={datePaiement}
              onChange={v => setDatePaiement(v ?? dayjs())}
            />
          </div>
          <div>
            <div>
              <label htmlFor="paiement-montant">{t('Montant')}</label>
            </div>
            <InputNumber
              id="paiement-montant"
              min={0}
              style={{ width: 180 }}
              value={montantPaiement ?? undefined}
              onChange={value => setMontantPaiement((value as number | null) ?? null)}
              {...montantSaisiProps}
            />
          </div>
          <div>
            <div>
              <label htmlFor="paiement-debut">{t('Début de la période couverte')}</label>
            </div>
            <DatePicker id="paiement-debut" format="DD/MM/YYYY" value={debutCouverture} onChange={setDebutCouverture} />
          </div>
          <div>
            <div>
              <label htmlFor="paiement-fin">{t('Fin de la période couverte')}</label>
            </div>
            <DatePicker
              id="paiement-fin"
              format="DD/MM/YYYY"
              value={finCouverture}
              onChange={setFinCouverture}
              disabledDate={current => (debutCouverture ? current.isBefore(debutCouverture, 'day') : false)}
            />
          </div>
          <Button
            type="primary"
            loading={enregistrementPaiementEnCours}
            disabled={!peutEnregistrerPaiement}
            onClick={enregistrerPaiement}
          >
            {t('Enregistrer le paiement')}
          </Button>
        </Space>
      </Card>

      <Title level={4} style={{ marginTop: 'var(--space-6)' }}>
        {t('Constatations mensuelles')}
      </Title>
      <DataView<LandLeaseAccrual>
        paginated={false}
        scrollX={800}
        items={constatations ?? []}
        total={(constatations ?? []).length}
        page={1}
        pageSize={Math.max((constatations ?? []).length, 1)}
        onPageChange={() => {}}
        loading={constatationsEnAttente}
        error={erreurConstatations ? t('Impossible de charger les constatations de ce bail.') : null}
        onRetry={() => refetchConstatations()}
        emptyDescription={t("Aucun mois n'a encore été constaté pour ce bail.")}
        columns={colonnesConstatations}
        rowKey={c => c.id}
        aria-label={t('Constatations mensuelles du bail')}
        renderCard={c => (
          <DataCard
            title={libellePeriode(c.periodYear, c.periodMonth)}
            aria-label={libellePeriode(c.periodYear, c.periodMonth)}
            highlight={<MoneyValue value={c.amount} />}
            fields={
              c.allocations.length > 0
                ? c.allocations.map(a => ({
                    label: a.siteLabel,
                    value: <MoneyValue value={a.amount} />
                  }))
                : [{ label: t('Imputations'), value: t('Aucun chantier actif sur ce bail à cette date') }]
            }
          />
        )}
      />

      <Card style={{ marginTop: 'var(--space-4)' }}>
        <Title level={5} style={{ marginTop: 0 }}>
          {t('Constater un mois à la main')}
        </Title>
        <Text type="secondary">
          {t(
            "À n'utiliser que si le travail programmé du 1er du mois n'a pas tourné : rejouer un mois déjà constaté ne double rien."
          )}
        </Text>
        <Space wrap size="middle" align="end" style={{ marginTop: 'var(--space-3)' }}>
          <div>
            <div>
              <label htmlFor="constat-annee">{t('Année')}</label>
            </div>
            <InputNumber
              id="constat-annee"
              style={{ width: 120 }}
              min={2000}
              max={2100}
              value={anneeConstat ?? undefined}
              onChange={value => setAnneeConstat((value as number | null) ?? null)}
            />
          </div>
          <div>
            <div>
              <label htmlFor="constat-mois">{t('Mois')}</label>
            </div>
            <Select
              id="constat-mois"
              style={{ width: 160 }}
              value={moisConstat ?? undefined}
              onChange={setMoisConstat}
              showSearch
              optionFilterProp="label"
              options={OPTIONS_MOIS}
            />
          </div>
          <Button
            type="primary"
            loading={constatationEnCours}
            disabled={!anneeConstat || !moisConstat}
            onClick={constaterMois}
          >
            {t('Constater ce mois')}
          </Button>
        </Space>
      </Card>
    </>
  );
};

export default BailDeTerrain;
