import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { App, Button, Card, DatePicker, Input, InputNumber, Select, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import {
  createBudgetAmendment,
  createSiteBudget,
  getSiteBudget,
  getSiteEngagement,
  listBudgetAmendments,
  validateBudgetAmendment,
  validateSiteBudget
} from '../../services/finance-lot3-service';
import { listConstructionSites, listCostCategories } from '../../services/finance-lot2-service';
import { SITE_BUDGET_STATUS_LABELS } from '../../types/finance-lot3-types';
import type { BudgetAmendment, SiteBudget } from '../../types/finance-lot3-types';
import { detailKey, entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
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
import { montantCalcule, montantVerrouille } from '../../utils/ligne-quantite-prix';
import { montantSaisiProps } from '../../utils/montant-saisi';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;

/**
 * Budget de chantier — écran du lot 3
 * (specs/018-finance-budget-pilotage/data-model.md §5).
 *
 * URL : `/tenant/:tenantId/finance/chantiers/:siteId/budget`. Le chantier est
 * dans le CHEMIN, pas en paramètre de requête — c'est très exactement le
 * défaut relevé au lot 2 (une navigation en `?chantierId=` vers une route qui
 * porte l'identifiant dans le chemin) : cet écran s'assure que sa propre
 * lecture (`useParams`) et l'URL qu'il documente coïncident.
 *
 * **Un seul geste de création, jamais de mise à jour de lignes.** Le contrat
 * gelé (`finance-lot3-types.ts`, `data-model.md` §2) n'expose aucune route
 * pour modifier les lignes d'un budget déjà créé — brouillon ou validé : seule
 * `validateSiteBudget` fait avancer le budget lui-même, et seul un avenant
 * peut ensuite le faire évoluer. Cet écran ne propose donc un éditeur de
 * lignes qu'à la création ; une fois le budget posé, ses lignes ne sont plus
 * qu'affichées.
 *
 * **Rien n'est recalculé ici.** `totalForecast` (le total du budget) et
 * `engagedAmount`/`actualCost` (l'engagé, `SiteEngagement`) arrivent déjà
 * calculés par le serveur. Il n'existe en revanche AUCUN champ « budget
 * révisé » sur `SiteBudget` — cette grandeur (initial plus avenants validés,
 * §2 du modèle) n'est exposée que sur une ligne du tableau de bord
 * (`SiteDashboardRow.revisedBudget`). Plutôt que de la recomposer ici à la
 * main — exactement le risque que ce principe interdit — cet écran affiche le
 * total initial et la liste des avenants avec leur écart signé, sans prétendre
 * à un total révisé qu'il ne peut pas calculer de façon fiable. Voir la
 * rubrique « Hypothèses » du rapport de cet agent.
 *
 * **Validation du budget et d'un avenant : irréversibles, dites avant.**
 * Comme au lot 2, `<ConfirmAction>` porte l'avertissement dans sa description,
 * avant tout appel réseau.
 *
 * **Vocabulaire (P-1).** On *budgète*, on *engage*, jamais « débit » ni
 * « crédit ».
 */

interface LigneBudgetSaisie {
  id: string;
  costCategoryId?: string;
  label: string;
  amountForecast: number | null;
  /**
   * Quantité et prix unitaire, facultatifs. Règle complète dans
   * `utils/ligne-quantite-prix.ts` : les deux renseignés, le montant prévu
   * devient leur produit et son champ passe en lecture seule ; sinon il se
   * saisit comme avant — une enveloppe de frais divers n'a pas de quantité.
   */
  quantity: number | null;
  unitPrice: number | null;
}

interface LigneAvenantSaisie {
  id: string;
  costCategoryId?: string;
  amountDelta: number | null;
  quantity: number | null;
  unitPrice: number | null;
}

function nouvelleLigneBudget(): LigneBudgetSaisie {
  return { id: crypto.randomUUID(), label: '', amountForecast: null, quantity: null, unitPrice: null };
}

function nouvelleLigneAvenant(): LigneAvenantSaisie {
  return { id: crypto.randomUUID(), amountDelta: null, quantity: null, unitPrice: null };
}

/**
 * Le montant prévu retenu pour une ligne de budget : le produit quand
 * quantité ET prix unitaire sont là, la saisie directe sinon.
 */
function montantPrevuDeLaLigne(ligne: LigneBudgetSaisie): number | null {
  return montantCalcule(ligne.quantity, ligne.unitPrice) ?? ligne.amountForecast;
}

/**
 * Idem pour une ligne d'avenant — **et c'est là que l'avenant se distingue**.
 *
 * L'écart d'un avenant est SIGNÉ : on réduit parfois une enveloppe. Une
 * quantité négative, elle, n'a aucun sens — on ne commande pas moins deux
 * tonnes. La décision prise ici : le champ « Quantité » reste positif et
 * c'est le « Prix unitaire » qui accepte le signe, de sorte que « 2 tonnes à
 * −95 000 » exprime une reprise de deux tonnes. La saisie en écart direct
 * reste évidemment ouverte, et c'est le chemin le plus simple pour une
 * réduction forfaitaire : on laisse quantité et prix unitaire vides.
 *
 * L'alternative — laisser l'avenant en saisie directe seule — a été écartée :
 * la hausse d'enveloppe motivée par « trois tonnes de ciment en plus » est
 * justement le cas courant d'un avenant, et c'est celui où quantité et prix
 * unitaire servent le plus.
 */
function ecartDeLaLigne(ligne: LigneAvenantSaisie): number | null {
  return montantCalcule(ligne.quantity, ligne.unitPrice) ?? ligne.amountDelta;
}

const TONE_BUDGET: Record<string, StatusTone> = { DRAFT: 'neutral', VALIDATED: 'success' };

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

export const BudgetChantier: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId, siteId } = useParams<{ tenantId: string; siteId: string }>();
  const queryClient = useQueryClient();
  const confirmerAction = useConfirmAction();

  const {
    data: budget,
    isPending: budgetEnAttente,
    error: erreurBudget,
    refetch: refetchBudget
  } = useQuery({
    queryKey: detailKey('site-budget', tenantId, siteId ?? ''),
    queryFn: () => getSiteBudget(tenantId as string, siteId as string),
    enabled: Boolean(tenantId && siteId),
    staleTime: STALE_TIME.list
  });

  // Référentiel, pour le seul nom du chantier affiché en sous-titre : le
  // contrat de `SiteBudget` ne porte pas de `siteLabel` (voir l'en-tête).
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

  const { data: engagement } = useQuery({
    queryKey: detailKey('site-engagement', tenantId, siteId ?? ''),
    queryFn: () => getSiteEngagement(tenantId as string, siteId as string),
    enabled: Boolean(tenantId && siteId),
    staleTime: STALE_TIME.list
  });

  const {
    data: avenants,
    isPending: avenantsEnAttente,
    error: erreurAvenants,
    refetch: refetchAvenants
  } = useQuery({
    queryKey: detailKey('budget-amendments', tenantId, budget?.id ?? ''),
    queryFn: () => listBudgetAmendments(tenantId as string, budget?.id as string),
    enabled: Boolean(tenantId && budget?.id),
    staleTime: STALE_TIME.list
  });

  const chantier = useMemo(() => chantiers?.find(c => c.id === siteId), [chantiers, siteId]);

  const optionsPostes = useMemo(
    () =>
      (postes ?? [])
        .filter(p => p.isActive)
        .sort((a, b) => a.position - b.position)
        .map(p => ({ value: p.id, label: p.label })),
    [postes]
  );

  // ---------------------------------------------------------------------
  // Création du budget — seul moment où ses lignes se composent (voir l'en-tête)
  // ---------------------------------------------------------------------

  const [nomBudget, setNomBudget] = useState('');
  const [lignesBudget, setLignesBudget] = useState<LigneBudgetSaisie[]>([nouvelleLigneBudget()]);
  const [creationEnCours, setCreationEnCours] = useState(false);

  const ajouterLigneBudget = () => setLignesBudget(prev => [...prev, nouvelleLigneBudget()]);
  const retirerLigneBudget = (id: string) =>
    setLignesBudget(prev => (prev.length > 1 ? prev.filter(l => l.id !== id) : prev));
  const modifierLigneBudget = (id: string, patch: Partial<LigneBudgetSaisie>) =>
    setLignesBudget(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));

  const lignesBudgetInvalides =
    lignesBudget.length === 0 ||
    lignesBudget.some(l => {
      const montant = montantPrevuDeLaLigne(l);
      return !l.costCategoryId || !l.label.trim() || !(montant && montant > 0);
    });

  const peutCreerBudget = Boolean(siteId) && Boolean(nomBudget.trim()) && !lignesBudgetInvalides;

  const creerBudget = async () => {
    if (!tenantId || !siteId || !peutCreerBudget) return;
    setCreationEnCours(true);
    try {
      await createSiteBudget(tenantId, {
        siteId,
        label: nomBudget.trim(),
        lines: lignesBudget.map(l => ({
          costCategoryId: l.costCategoryId as string,
          label: l.label.trim(),
          amountForecast: montantPrevuDeLaLigne(l) as number,
          // Conservés tels quels : le serveur les range à côté du montant
          // prévu, il ne refait pas la multiplication.
          quantity: l.quantity,
          unitPrice: l.unitPrice
        }))
      });
      await queryClient.invalidateQueries({ queryKey: detailKey('site-budget', tenantId, siteId) });
      message.success(t('Budget créé en brouillon.'));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La création du budget a échoué.'));
    } finally {
      setCreationEnCours(false);
    }
  };

  // ---------------------------------------------------------------------
  // Validation du budget
  // ---------------------------------------------------------------------

  const [validationBudgetEnCours, setValidationBudgetEnCours] = useState(false);

  const validerBudget = async () => {
    if (!tenantId || !siteId || !budget) return;
    setValidationBudgetEnCours(true);
    try {
      await validateSiteBudget(tenantId, budget.id);
      await queryClient.invalidateQueries({ queryKey: detailKey('site-budget', tenantId, siteId) });
      message.success(t('Budget validé.'));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La validation a échoué.'));
    } finally {
      setValidationBudgetEnCours(false);
    }
  };

  // ---------------------------------------------------------------------
  // Avenants — saisie et validation
  // ---------------------------------------------------------------------

  const [dateAvenant, setDateAvenant] = useState<Dayjs>(() => dayjs());
  const [motifAvenant, setMotifAvenant] = useState('');
  const [lignesAvenant, setLignesAvenant] = useState<LigneAvenantSaisie[]>([nouvelleLigneAvenant()]);
  const [enregistrementAvenant, setEnregistrementAvenant] = useState(false);

  const ajouterLigneAvenant = () => setLignesAvenant(prev => [...prev, nouvelleLigneAvenant()]);
  const retirerLigneAvenant = (id: string) =>
    setLignesAvenant(prev => (prev.length > 1 ? prev.filter(l => l.id !== id) : prev));
  const modifierLigneAvenant = (id: string, patch: Partial<LigneAvenantSaisie>) =>
    setLignesAvenant(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));

  // Un écart nul ne veut rien dire dans un avenant : on l'interdit, sans quoi
  // une ligne « vide » se glisserait dans un avenant enregistré.
  const lignesAvenantInvalides =
    lignesAvenant.length === 0 ||
    lignesAvenant.some(l => {
      const ecart = ecartDeLaLigne(l);
      return !l.costCategoryId || ecart === null || ecart === 0;
    });

  const peutEnregistrerAvenant = Boolean(budget) && Boolean(motifAvenant.trim()) && !lignesAvenantInvalides;

  const reinitialiserAvenant = () => {
    setDateAvenant(dayjs());
    setMotifAvenant('');
    setLignesAvenant([nouvelleLigneAvenant()]);
  };

  const enregistrerAvenant = async () => {
    if (!tenantId || !budget || !peutEnregistrerAvenant) return;
    setEnregistrementAvenant(true);
    try {
      await createBudgetAmendment(tenantId, {
        budgetId: budget.id,
        amendmentDate: dateAvenant.format('YYYY-MM-DD'),
        reason: motifAvenant.trim(),
        lines: lignesAvenant.map(l => ({
          costCategoryId: l.costCategoryId as string,
          amountDelta: ecartDeLaLigne(l) as number,
          quantity: l.quantity,
          unitPrice: l.unitPrice
        }))
      });
      await queryClient.invalidateQueries({ queryKey: detailKey('budget-amendments', tenantId, budget.id) });
      message.success(t('Avenant enregistré en brouillon.'));
      reinitialiserAvenant();
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'enregistrement de l'avenant a échoué."));
    } finally {
      setEnregistrementAvenant(false);
    }
  };

  const validerAvenant = async (avenant: BudgetAmendment) => {
    if (!tenantId || !budget) return;
    try {
      await validateBudgetAmendment(tenantId, avenant.id);
      // Valider un avenant change le budget RÉVISÉ (`revisedTotal`, dérivé par
      // le serveur), donc aussi l'engagé et le tableau de bord : tout se
      // rafraîchit tout de suite, plus au rechargement (BUG-…-026).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey('budget-amendments', tenantId, budget.id) }),
        queryClient.invalidateQueries({ queryKey: detailKey('site-budget', tenantId, siteId ?? '') }),
        queryClient.invalidateQueries({ queryKey: detailKey('site-engagement', tenantId, siteId ?? '') }),
        queryClient.invalidateQueries({ queryKey: entityKeyPrefix('sites-dashboard', tenantId) })
      ]);
      message.success(t('Avenant validé.'));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La validation a échoué.'));
    }
  };

  // ---------------------------------------------------------------------

  if (!tenantId || !siteId) {
    return <StateBlock variant="empty" title={t('Aucun chantier sélectionné')} />;
  }

  const filAriane = [
    { label: t('Finance'), to: `/tenant/${tenantId}/finance/chantiers` },
    { label: t('Chantiers'), to: `/tenant/${tenantId}/finance/chantiers` },
    ...(chantier ? [{ label: chantier.name, to: `/tenant/${tenantId}/finance/chantiers/${siteId}` }] : []),
    { label: t('Budget') }
  ];

  if (erreurBudget) {
    return (
      <>
        <PageHeader title={t('Budget du chantier')} breadcrumbs={filAriane} />
        <StateBlock
          variant="error"
          description={t('Impossible de charger le budget de ce chantier.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetchBudget(), primary: true }]}
        />
      </>
    );
  }

  if (budgetEnAttente) {
    return (
      <>
        <PageHeader title={t('Budget du chantier')} breadcrumbs={filAriane} />
        <StateBlock variant="loading" />
      </>
    );
  }

  // Quantité et prix unitaire ne s'affichent que là où ils existent : une
  // ligne saisie en montant direct montre une case vide plutôt qu'un « 1 »
  // inventé.
  const colonnesLignes: ColumnsType<SiteBudget['lines'][number]> = [
    { title: t('Poste'), key: 'poste', render: (_, l) => l.costCategoryLabel },
    { title: t('Libellé'), key: 'libelle', render: (_, l) => l.label },
    {
      title: t('Quantité'),
      key: 'quantite',
      align: 'end',
      render: (_, l) => (l.quantity == null ? '' : l.quantity.toLocaleString(activeLocale()))
    },
    {
      title: t('Prix unitaire'),
      key: 'prix-unitaire',
      align: 'end',
      render: (_, l) => (l.unitPrice == null ? '' : <MoneyValue value={l.unitPrice} />)
    },
    {
      title: t('Montant prévu'),
      key: 'montant',
      align: 'end',
      render: (_, l) => <MoneyValue value={l.amountForecast} />
    }
  ];

  const colonnesAvenants: ColumnsType<BudgetAmendment> = [
    { title: t('Date'), key: 'date', width: 120, render: (_, a) => dateCourte(a.amendmentDate) },
    { title: t('Motif'), key: 'motif', render: (_, a) => a.reason },
    { title: t('Saisi par'), key: 'saisi', render: (_, a) => a.createdByLabel },
    {
      title: t('Écart'),
      key: 'ecart',
      align: 'end',
      render: (_, a) => (
        <>
          {a.totalDelta > 0 ? '+' : ''}
          <MoneyValue value={a.totalDelta} signed />
        </>
      )
    },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, a) => (
        <StatusTag status={a.status} tone={TONE_BUDGET[a.status]} label={SITE_BUDGET_STATUS_LABELS[a.status]} />
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, a) =>
        a.status === 'DRAFT' ? (
          <ConfirmAction
            title={t("Valider l'avenant du {{value}} ?", { value: dateCourte(a.amendmentDate) })}
            description={t(
              "Cette opération est irréversible : un avenant validé ne peut plus être modifié, et son écart s'ajoute alors au budget révisé du chantier."
            )}
            okText={t('Confirmer la validation')}
            onConfirm={() => validerAvenant(a)}
          >
            <Button type="link">{t('Valider')}</Button>
          </ConfirmAction>
        ) : null
    }
  ];

  return (
    <>
      <PageHeader
        title={budget ? budget.label : t('Budget du chantier')}
        subtitle={chantier?.name}
        breadcrumbs={filAriane}
        extra={
          budget ? (
            <StatusTag
              status={budget.status}
              tone={TONE_BUDGET[budget.status]}
              label={SITE_BUDGET_STATUS_LABELS[budget.status]}
            />
          ) : undefined
        }
      />

      {!budget ? (
        <Card>
          <Title level={4} style={{ marginTop: 0 }}>
            {t("Aucun budget n'est encore posé pour ce chantier")}
          </Title>
          <Text type="secondary">
            {t(
              'Composez les lignes ci-dessous : une fois le budget créé, aucun poste ne pourra plus y être ajouté — seul un avenant pourra ensuite le faire évoluer.'
            )}
          </Text>

          <div style={{ margin: 'var(--space-4) 0', maxWidth: 420 }}>
            <label htmlFor="budget-nom">{t('Nom du budget')}</label>
            <Input
              id="budget-nom"
              value={nomBudget}
              onChange={event => setNomBudget(event.target.value)}
              placeholder={t('Ex. Budget initial 2026')}
            />
          </div>

          <Space orientation="vertical" size="small" style={{ width: '100%', marginBottom: 'var(--space-4)' }}>
            {lignesBudget.map(ligne => (
              <Space key={ligne.id} align="start" wrap>
                <Select
                  aria-label={t('Poste de dépense')}
                  placeholder={t('Poste')}
                  style={{ width: 200 }}
                  value={ligne.costCategoryId}
                  onChange={value => modifierLigneBudget(ligne.id, { costCategoryId: value })}
                  showSearch
                  optionFilterProp="label"
                  options={optionsPostes}
                />
                <Input
                  aria-label={t('Libellé de la ligne')}
                  placeholder={t('Libellé')}
                  style={{ width: 260 }}
                  value={ligne.label}
                  onChange={event => modifierLigneBudget(ligne.id, { label: event.target.value })}
                />
                <InputNumber
                  aria-label={t('Quantité')}
                  placeholder={t('Quantité')}
                  min={0}
                  style={{ width: 120 }}
                  value={ligne.quantity ?? undefined}
                  onChange={value => modifierLigneBudget(ligne.id, { quantity: (value as number | null) ?? null })}
                />
                <InputNumber
                  aria-label={t('Prix unitaire')}
                  placeholder={t('Prix unitaire')}
                  min={0}
                  style={{ width: 160 }}
                  value={ligne.unitPrice ?? undefined}
                  onChange={value => modifierLigneBudget(ligne.id, { unitPrice: (value as number | null) ?? null })}
                  {...montantSaisiProps}
                />
                <InputNumber
                  aria-label={t('Montant prévu')}
                  placeholder={t('Montant prévu')}
                  min={0}
                  style={{ width: 180 }}
                  // Lecture seule dès que le produit prend le relais.
                  disabled={montantVerrouille(ligne.quantity, ligne.unitPrice)}
                  value={montantPrevuDeLaLigne(ligne) ?? undefined}
                  onChange={value =>
                    modifierLigneBudget(ligne.id, { amountForecast: (value as number | null) ?? null })
                  }
                  {...montantSaisiProps}
                />
                <Button
                  aria-label={t('Retirer la ligne')}
                  icon={<DeleteOutlined />}
                  disabled={lignesBudget.length <= 1}
                  onClick={() => retirerLigneBudget(ligne.id)}
                />
              </Space>
            ))}
            <Button icon={<PlusOutlined />} onClick={ajouterLigneBudget}>
              {t('Ajouter une ligne')}
            </Button>
          </Space>

          <Button type="primary" loading={creationEnCours} disabled={!peutCreerBudget} onClick={creerBudget}>
            {t('Créer le budget')}
          </Button>
        </Card>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-6)'
            }}
          >
            {/* Les deux totaux viennent du serveur, jamais d'une addition faite
                ici : `totalForecast` est l'initial, `revisedTotal` l'initial
                augmenté des avenants VALIDÉS. C'est le révisé qui fait foi dès
                qu'un avenant est passé, et il manquait à cet écran — celui-là
                même où l'on saisit les avenants. Il fallait aller au tableau de
                bord des chantiers pour lire le chiffre qu'on venait de changer
                (demandé le 20 septembre 2026). */}
            <StatCard label={t('Budget initial')} value={<MoneyValue value={budget.totalForecast} />} />
            <StatCard label={t('Budget révisé')} value={<MoneyValue value={budget.revisedTotal} />} />
            {engagement && (
              <>
                <StatCard label={t('Réalisé')} value={<MoneyValue value={engagement.actualCost} />} />
                <StatCard label={t('Engagé')} value={<MoneyValue value={engagement.engagedAmount} />} />
              </>
            )}
          </div>

          {budget.status === 'VALIDATED' && (
            <Text type="secondary">
              {t('Validé')}
              {budget.validatedByLabel ? ` par ${budget.validatedByLabel}` : ''}
              {budget.validatedAt ? ` le ${dateCourte(budget.validatedAt)}` : ''}.
            </Text>
          )}

          {budget.status === 'DRAFT' && (
            <div style={{ margin: 'var(--space-4) 0' }}>
              <ConfirmAction
                title={t('Valider le budget « {{label}} » ?', { label: budget.label })}
                description={t(
                  'Cette opération est irréversible : un budget validé ne peut plus recevoir de nouvelle ligne. Toute évolution ultérieure passera par un avenant.'
                )}
                okText={t('Confirmer la validation')}
                onConfirm={validerBudget}
              >
                <Button type="primary" loading={validationBudgetEnCours}>
                  {t('Valider le budget')}
                </Button>
              </ConfirmAction>
            </div>
          )}

          <Title level={4} style={{ marginTop: 'var(--space-6)' }}>
            {t('Lignes du budget')}
          </Title>
          <DataView<SiteBudget['lines'][number]>
            paginated={false}
            items={budget.lines}
            total={budget.lines.length}
            page={1}
            pageSize={Math.max(budget.lines.length, 1)}
            onPageChange={() => {}}
            emptyDescription={t('Ce budget ne porte encore aucune ligne.')}
            columns={colonnesLignes}
            rowKey={l => l.id}
            aria-label={t('Lignes du budget')}
            renderCard={l => (
              <DataCard
                title={l.label}
                aria-label={l.label}
                subtitle={l.costCategoryLabel}
                highlight={<MoneyValue value={l.amountForecast} />}
                fields={
                  l.quantity != null || l.unitPrice != null
                    ? [
                        {
                          label: t('Quantité'),
                          value: l.quantity == null ? '' : l.quantity.toLocaleString(activeLocale())
                        },
                        {
                          label: t('Prix unitaire'),
                          value: l.unitPrice == null ? '' : <MoneyValue value={l.unitPrice} />
                        }
                      ]
                    : undefined
                }
              />
            )}
          />

          <Title level={4} style={{ marginTop: 'var(--space-6)' }}>
            {t('Avenants')}
          </Title>
          <DataView<BudgetAmendment>
            paginated={false}
            items={avenants ?? []}
            total={(avenants ?? []).length}
            page={1}
            pageSize={Math.max((avenants ?? []).length, 1)}
            onPageChange={() => {}}
            loading={avenantsEnAttente}
            error={erreurAvenants ? t('Impossible de charger les avenants de ce budget.') : null}
            onRetry={() => refetchAvenants()}
            emptyDescription={t("Aucun avenant n'a encore été saisi sur ce budget.")}
            columns={colonnesAvenants}
            rowKey={a => a.id}
            aria-label={t('Avenants du budget')}
            renderCard={a => (
              <DataCard
                title={dateCourte(a.amendmentDate)}
                aria-label={t('Avenant du {{value}}', { value: dateCourte(a.amendmentDate) })}
                subtitle={a.reason}
                status={
                  <StatusTag
                    status={a.status}
                    tone={TONE_BUDGET[a.status]}
                    label={SITE_BUDGET_STATUS_LABELS[a.status]}
                  />
                }
                highlight={<MoneyValue value={a.totalDelta} signed />}
                fields={[{ label: t('Saisi par'), value: a.createdByLabel }]}
                primaryAction={
                  a.status === 'DRAFT'
                    ? {
                        label: 'Valider',
                        onClick: () =>
                          confirmerAction({
                            title: t("Valider l'avenant du {{value}} ?", { value: dateCourte(a.amendmentDate) }),
                            description: t(
                              "Cette opération est irréversible : un avenant validé ne peut plus être modifié, et son écart s'ajoute alors au budget révisé du chantier."
                            ),
                            okText: t('Confirmer la validation'),
                            onConfirm: () => validerAvenant(a)
                          })
                      }
                    : undefined
                }
              />
            )}
          />

          <Card style={{ marginTop: 'var(--space-6)' }}>
            <Title level={4} style={{ marginTop: 0 }}>
              {t('Nouvel avenant')}
            </Title>

            <Space wrap size="middle" align="end" style={{ marginBottom: 'var(--space-4)', width: '100%' }}>
              <div>
                <div>
                  <label htmlFor="avenant-date">{t('Date')}</label>
                </div>
                <DatePicker
                  id="avenant-date"
                  format="DD/MM/YYYY"
                  value={dateAvenant}
                  onChange={v => setDateAvenant(v ?? dayjs())}
                />
              </div>
              <div style={{ minWidth: 320, flex: 1 }}>
                <div>
                  <label htmlFor="avenant-motif">{t('Motif')}</label>
                </div>
                <Input
                  id="avenant-motif"
                  value={motifAvenant}
                  onChange={event => setMotifAvenant(event.target.value)}
                  placeholder={t('Ex. Renchérissement du ciment')}
                />
              </div>
            </Space>

            <Space orientation="vertical" size="small" style={{ width: '100%', marginBottom: 'var(--space-4)' }}>
              {lignesAvenant.map(ligne => (
                <Space key={ligne.id} align="start" wrap>
                  <Select
                    aria-label={t('Poste de dépense')}
                    placeholder={t('Poste')}
                    style={{ width: 200 }}
                    value={ligne.costCategoryId}
                    onChange={value => modifierLigneAvenant(ligne.id, { costCategoryId: value })}
                    showSearch
                    optionFilterProp="label"
                    options={optionsPostes}
                  />
                  <InputNumber
                    aria-label={t('Quantité')}
                    placeholder={t('Quantité')}
                    // Jamais négative : c'est le prix unitaire qui porte le
                    // signe d'un écart en baisse (voir `ecartDeLaLigne`).
                    min={0}
                    style={{ width: 120 }}
                    value={ligne.quantity ?? undefined}
                    onChange={value => modifierLigneAvenant(ligne.id, { quantity: (value as number | null) ?? null })}
                  />
                  <InputNumber
                    aria-label={t('Prix unitaire')}
                    placeholder={t('Prix unitaire (+/-)')}
                    style={{ width: 160 }}
                    value={ligne.unitPrice ?? undefined}
                    onChange={value => modifierLigneAvenant(ligne.id, { unitPrice: (value as number | null) ?? null })}
                    {...montantSaisiProps}
                  />
                  <InputNumber
                    aria-label={t('Écart')}
                    placeholder={t('Écart (+/-)')}
                    style={{ width: 180 }}
                    disabled={montantVerrouille(ligne.quantity, ligne.unitPrice)}
                    value={ecartDeLaLigne(ligne) ?? undefined}
                    onChange={value =>
                      modifierLigneAvenant(ligne.id, { amountDelta: (value as number | null) ?? null })
                    }
                    {...montantSaisiProps}
                  />
                  <Button
                    aria-label={t('Retirer la ligne')}
                    icon={<DeleteOutlined />}
                    disabled={lignesAvenant.length <= 1}
                    onClick={() => retirerLigneAvenant(ligne.id)}
                  />
                </Space>
              ))}
              <Button icon={<PlusOutlined />} onClick={ajouterLigneAvenant}>
                {t('Ajouter une ligne')}
              </Button>
            </Space>

            <Button
              type="primary"
              loading={enregistrementAvenant}
              disabled={!peutEnregistrerAvenant}
              onClick={enregistrerAvenant}
            >
              {t("Enregistrer l'avenant")}
            </Button>
          </Card>
        </>
      )}
    </>
  );
};

export default BudgetChantier;
