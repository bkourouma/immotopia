import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Button, Card, DatePicker, Input, InputNumber, Modal, Select, Space, Typography } from 'antd';
import type { InputRef } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CopyOutlined, DeleteOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  issuePurchaseOrder
} from '../../services/finance-lot3-service';
import { listConstructionSites, listCostCategories, listSuppliers } from '../../services/finance-lot2-service';
import { INVOICING_STATE_LABELS, PURCHASE_ORDER_STATUS_LABELS } from '../../types/finance-lot3-types';
import type { PurchaseOrder, PurchaseOrderStatus } from '../../types/finance-lot3-types';
import { detailKey, queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  MoneyValue,
  DataView,
  DataCard,
  StatCard,
  StatusTag,
  ConfirmAction
} from '../../components/primitives';
import type { StatusTone } from '../../components/primitives';
import { t } from '../../i18n/t';
import { montantCalcule, montantVerrouille } from '../../utils/ligne-quantite-prix';
import { montantSaisiProps } from '../../utils/montant-saisi';
import { CLE_DUPLICATION_BON, copieDuBon, lireDuplicationBon } from '../../utils/duplication-piece';
import type { DuplicationBonDeCommande } from '../../utils/duplication-piece';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;

/**
 * Bon de commande — saisie et fiche, lot 3
 * (specs/018-finance-budget-pilotage/data-model.md §5).
 *
 * Deux chemins, un seul composant — modèle de `PieceDeCaisse.tsx` (lot 2),
 * qui distingue déjà émission et suivi dans un unique écran :
 *
 * - `/tenant/:tenantId/finance/bons-de-commande/nouveau` — saisie. Le
 *   chantier peut être prérempli par `?chantierId=` (identifiant, pas nom),
 *   pour un lien entrant depuis `BudgetChantier.tsx` ou le tableau de bord.
 * - `/tenant/:tenantId/finance/bons-de-commande/:orderId` — fiche d'un bon
 *   déjà créé, avec émission et annulation.
 *
 * Le segment littéral `nouveau` distingue les deux : un identifiant de bon
 * réel ne peut pas valoir ce mot. C'est le même procédé que
 * `Chantiers.tsx` → `ChantierDetail.tsx` avec un `:siteId` réel, mais ici les
 * deux gestes vivent dans le même fichier, comme le demande la consigne de
 * cet agent.
 *
 * **Un bon en brouillon n'engage rien (§3 du modèle).** Ce n'est qu'à
 * l'émission que son reste à facturer entre dans l'engagé du chantier — l'un
 * des trois seuls moments où une alerte de dépassement peut se déclencher
 * (§6). L'émission et l'annulation sont donc toutes deux irréversibles, et
 * l'écran le dit AVANT, dans une confirmation.
 *
 * **L'annulation exige un motif**, comme celles du lot 2. Elle se fait donc
 * dans une fenêtre, pas dans une simple confirmation : le bouton de
 * validation reste inerte tant que le motif est vide. L'écran s'en passait
 * jusqu'au 20 septembre 2026, alors que le serveur l'a toujours réclamé
 * (`cancelPurchaseOrderSchema`) : aucune annulation ne pouvait aboutir, et le
 * bon continuait d'engager son chantier.
 *
 * **Dupliquer.** Beaucoup de bons se ressemblent d'un mois ou d'un chantier à
 * l'autre. « Dupliquer » — sur la fiche ici, et sur chaque ligne de la liste
 * (`BonsDeCommande.tsx`) — ramène à `…/nouveau` avec le chantier, le
 * fournisseur et toutes les lignes du bon d'origine **pré-remplis, sans rien
 * créer** : la copie voyage dans l'état de navigation de react-router (le
 * pourquoi est dans `utils/duplication-piece.ts`), et rien n'est écrit tant
 * que « Enregistrer en brouillon » n'a pas été cliqué. La référence reste
 * vide et reçoit le focus ; la date est celle du jour.
 *
 * **Vocabulaire (P-1).** On *émet*, on *engage*, jamais « débit » ni
 * « crédit ».
 */

interface LigneSaisie {
  id: string;
  costCategoryId?: string;
  label: string;
  amount: number | null;
  /**
   * Quantité et prix unitaire, facultatifs. Voir
   * `utils/ligne-quantite-prix.ts` pour la règle : renseignés tous les deux,
   * le montant devient leur produit et son champ passe en lecture seule ;
   * sinon le montant se saisit comme avant — un forfait de pose n'a pas de
   * quantité.
   */
  quantity: number | null;
  unitPrice: number | null;
}

function nouvelleLigne(): LigneSaisie {
  return { id: crypto.randomUUID(), label: '', amount: null, quantity: null, unitPrice: null };
}

/**
 * Le montant retenu pour une ligne : le produit quand quantité ET prix
 * unitaire sont là, la saisie directe sinon. Une seule fonction pour le
 * total, pour la validation et pour la charge utile — trois lectures
 * différentes du même montant finiraient par diverger.
 */
function montantDeLaLigne(ligne: LigneSaisie): number | null {
  return montantCalcule(ligne.quantity, ligne.unitPrice) ?? ligne.amount;
}

const TONE_STATUT: Record<PurchaseOrderStatus, StatusTone> = {
  DRAFT: 'neutral',
  ISSUED: 'success',
  CANCELLED: 'danger'
};

const TONE_FACTURATION: Record<PurchaseOrder['invoicingState'], StatusTone> = {
  NOT_INVOICED: 'neutral',
  PARTIALLY_INVOICED: 'warning',
  SETTLED: 'success'
};

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

export const BonDeCommande: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId, orderId } = useParams<{ tenantId: string; orderId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const modeCreation = !orderId || orderId === 'nouveau';
  const chantierPreselectionne = searchParams.get('chantierId') || undefined;

  const { data: chantiers } = useQuery({
    queryKey: queryKey('construction-sites', tenantId, {}),
    queryFn: () => listConstructionSites(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const { data: fournisseurs } = useQuery({
    queryKey: queryKey('suppliers', tenantId),
    queryFn: () => listSuppliers(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const { data: postes } = useQuery({
    queryKey: queryKey('cost-categories', tenantId, {}),
    queryFn: () => listCostCategories(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const {
    data: bon,
    isPending: bonEnAttente,
    error: erreurBon,
    refetch: refetchBon
  } = useQuery({
    queryKey: detailKey('purchase-order', tenantId, orderId ?? ''),
    queryFn: () => getPurchaseOrder(tenantId as string, orderId as string),
    enabled: Boolean(tenantId) && !modeCreation,
    staleTime: STALE_TIME.list
  });

  const optionsChantiers = (chantiers ?? [])
    .map(c => ({ value: c.id, label: c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const optionsFournisseurs = (fournisseurs ?? [])
    .filter(f => f.isActive)
    .map(f => ({ value: f.id, label: f.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const optionsPostes = (postes ?? [])
    .filter(p => p.isActive)
    .sort((a, b) => a.position - b.position)
    .map(p => ({ value: p.id, label: p.label }));

  // ---------------------------------------------------------------------
  // Saisie
  // ---------------------------------------------------------------------

  const [siteId, setSiteId] = useState<string | undefined>(chantierPreselectionne);
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
  const [reference, setReference] = useState('');
  const [date, setDate] = useState<Dayjs>(() => dayjs());
  const [lignes, setLignes] = useState<LigneSaisie[]>([nouvelleLigne()]);
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false);
  const champReference = useRef<InputRef>(null);

  useEffect(() => {
    if (chantierPreselectionne) setSiteId(chantierPreselectionne);
  }, [chantierPreselectionne]);

  /**
   * Applique la copie portée par l'état de navigation, puis la consomme.
   *
   * Un `useEffect`, et non une valeur initiale de `useState` : la fiche et la
   * saisie sont le MÊME composant sur la MÊME route (`:orderId`), si bien
   * qu'aller de `…/bons-de-commande/bon-1` à `…/bons-de-commande/nouveau` ne
   * remonte rien — seul le paramètre change, et les initialiseurs de `useState`
   * ne sont pas rejoués. Sans cet effet, « Dupliquer » depuis la fiche
   * n'aurait rien rempli du tout.
   *
   * La copie est effacée sitôt appliquée (`state: null`, en remplaçant
   * l'entrée d'historique) : un retour arrière ou un rechargement ne doit pas
   * re-remplir un formulaire qu'on vient peut-être d'abandonner.
   */
  useEffect(() => {
    const copie = lireDuplicationBon(location.state);
    if (!copie) return;

    setSiteId(copie.siteId);
    setSupplierId(copie.supplierId);
    // Règles non négociables : référence vide (deux pièces sous la même
    // référence sont une erreur comptable) et date du jour.
    setReference('');
    setDate(dayjs());
    setLignes(
      copie.lignes.length > 0
        ? copie.lignes.map(ligne => ({
            id: crypto.randomUUID(),
            costCategoryId: ligne.costCategoryId,
            label: ligne.label,
            amount: ligne.amount,
            quantity: ligne.quantity,
            unitPrice: ligne.unitPrice
          }))
        : [nouvelleLigne()]
    );

    navigate(location.pathname + location.search, { replace: true, state: null });
    champReference.current?.focus();

    message.info(
      copie.referenceOrigine
        ? t("Formulaire pré-rempli d'après le bon {{reference}}. Vérifiez la référence et la date.", {
            reference: copie.referenceOrigine
          })
        : t("Formulaire pré-rempli d'après un bon existant. Vérifiez la référence et la date.")
    );
    // `location.state` suffit : c'est lui seul qui porte une copie à appliquer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  /**
   * Repart de ce bon dans une saisie vierge. **N'écrit rien** : la copie
   * voyage dans l'état de navigation et rien n'est créé tant que la personne
   * n'a pas cliqué sur « Enregistrer en brouillon ».
   *
   * Offert quel que soit le statut, **annulé compris** : on annule justement
   * pour ressaisir, et c'est même le cas d'usage le plus courant.
   */
  const dupliquer = (source: PurchaseOrder) => {
    navigate(`/tenant/${tenantId}/finance/bons-de-commande/nouveau`, {
      state: { [CLE_DUPLICATION_BON]: copieDuBon(source) satisfies DuplicationBonDeCommande }
    });
  };

  const ajouterLigne = () => setLignes(prev => [...prev, nouvelleLigne()]);
  const retirerLigne = (id: string) => setLignes(prev => (prev.length > 1 ? prev.filter(l => l.id !== id) : prev));
  const modifierLigne = (id: string, patch: Partial<LigneSaisie>) =>
    setLignes(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));

  const montantTotal = lignes.reduce((somme, l) => somme + (montantDeLaLigne(l) ?? 0), 0);
  const lignesInvalides =
    lignes.length === 0 ||
    lignes.some(l => {
      const montant = montantDeLaLigne(l);
      return !l.costCategoryId || !l.label.trim() || !(montant && montant > 0);
    });

  const peutEnregistrer =
    Boolean(siteId) && Boolean(supplierId) && Boolean(reference.trim()) && !lignesInvalides && montantTotal > 0;

  const enregistrer = async () => {
    if (!tenantId || !siteId || !supplierId || !peutEnregistrer) return;
    setEnregistrementEnCours(true);
    try {
      const nouveauBon = await createPurchaseOrder(tenantId, {
        siteId,
        supplierId,
        reference: reference.trim(),
        orderDate: date.format('YYYY-MM-DD'),
        lines: lignes.map(l => ({
          costCategoryId: l.costCategoryId as string,
          label: l.label.trim(),
          amount: montantDeLaLigne(l) as number,
          // Conservés tels quels : le serveur les range à côté du montant,
          // il ne refait pas la multiplication.
          quantity: l.quantity,
          unitPrice: l.unitPrice
        }))
      });
      message.success(t('Bon {{reference}} enregistré en brouillon.', { reference: nouveauBon.reference }));
      navigate(`/tenant/${tenantId}/finance/bons-de-commande/${nouveauBon.id}`, { replace: true });
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'enregistrement du bon a échoué."));
    } finally {
      setEnregistrementEnCours(false);
    }
  };

  // ---------------------------------------------------------------------
  // Émission et annulation
  // ---------------------------------------------------------------------

  const [emissionEnCours, setEmissionEnCours] = useState(false);
  const [annulationEnCours, setAnnulationEnCours] = useState(false);

  const emettre = async () => {
    if (!tenantId || !bon) return;
    setEmissionEnCours(true);
    try {
      await issuePurchaseOrder(tenantId, bon.id);
      await queryClient.invalidateQueries({ queryKey: detailKey('purchase-order', tenantId, bon.id) });
      message.success(t('Bon {{reference}} émis.', { reference: bon.reference }));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'émission a échoué."));
    } finally {
      setEmissionEnCours(false);
    }
  };

  // Le motif de l'annulation, saisi dans sa propre fenêtre plutôt que dans une
  // simple confirmation. Le serveur l'exige (`cancelPurchaseOrderSchema`), et
  // l'écran ne le demandait pas : chaque annulation repartait en 400, et le
  // bon restait émis en continuant d'engager son chantier. Même geste que les
  // annulations de facture et de règlement, pour la même raison — une
  // annulation irréversible qui n'est pas tracée est un trou d'audit.
  const [annulationOuverte, setAnnulationOuverte] = useState(false);
  const [motifAnnulation, setMotifAnnulation] = useState('');

  const annuler = async () => {
    if (!tenantId || !bon) return;
    const motif = motifAnnulation.trim();
    if (!motif) return;
    setAnnulationEnCours(true);
    try {
      await cancelPurchaseOrder(tenantId, bon.id, motif);
      await queryClient.invalidateQueries({ queryKey: detailKey('purchase-order', tenantId, bon.id) });
      message.success(t('Bon {{reference}} annulé.', { reference: bon.reference }));
      setAnnulationOuverte(false);
      setMotifAnnulation('');
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'annulation a échoué."));
    } finally {
      setAnnulationEnCours(false);
    }
  };

  // ---------------------------------------------------------------------

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const filAriane = [
    { label: t('Finance'), to: `/tenant/${tenantId}/finance/bons-de-commande` },
    { label: t('Bons de commande'), to: `/tenant/${tenantId}/finance/bons-de-commande` }
  ];

  if (modeCreation) {
    return (
      <>
        <PageHeader title={t('Nouveau bon de commande')} breadcrumbs={[...filAriane, { label: 'Nouveau' }]} />
        <Card>
          <Space wrap size="middle" align="end" style={{ marginBottom: 'var(--space-4)', width: '100%' }}>
            <div style={{ minWidth: 220 }}>
              <div>
                <label htmlFor="bon-chantier">{t('Chantier')}</label>
              </div>
              <Select
                id="bon-chantier"
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                placeholder={t('Choisir le chantier')}
                value={siteId}
                onChange={setSiteId}
                options={optionsChantiers}
              />
            </div>
            <div style={{ minWidth: 220 }}>
              <div>
                <label htmlFor="bon-fournisseur">{t('Fournisseur')}</label>
              </div>
              <Select
                id="bon-fournisseur"
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                placeholder={t('Choisir le fournisseur')}
                value={supplierId}
                onChange={setSupplierId}
                options={optionsFournisseurs}
              />
            </div>
          </Space>

          <Space wrap size="middle" align="end" style={{ marginBottom: 'var(--space-4)', width: '100%' }}>
            <div style={{ minWidth: 220 }}>
              <div>
                <label htmlFor="bon-reference">{t('Référence')}</label>
              </div>
              <Input
                id="bon-reference"
                // Le champ que la duplication met au premier plan : la copie
                // arrive sans référence, et c'est la première chose à saisir.
                ref={champReference}
                placeholder={t('Ex. BC-2026-0042')}
                value={reference}
                onChange={event => setReference(event.target.value)}
              />
            </div>
            <div>
              <div>
                <label htmlFor="bon-date">{t('Date')}</label>
              </div>
              <DatePicker id="bon-date" format="DD/MM/YYYY" value={date} onChange={v => setDate(v ?? dayjs())} />
            </div>
          </Space>

          <Title level={5}>{t('Lignes')}</Title>
          <Space orientation="vertical" size="small" style={{ width: '100%', marginBottom: 'var(--space-4)' }}>
            {lignes.map(ligne => (
              <Space key={ligne.id} align="start" wrap>
                <Select
                  aria-label={t('Poste de dépense')}
                  placeholder={t('Poste')}
                  style={{ width: 200 }}
                  value={ligne.costCategoryId}
                  onChange={value => modifierLigne(ligne.id, { costCategoryId: value })}
                  showSearch
                  optionFilterProp="label"
                  options={optionsPostes}
                />
                <Input
                  aria-label={t('Libellé de la ligne')}
                  placeholder={t('Libellé')}
                  style={{ width: 280 }}
                  value={ligne.label}
                  onChange={event => modifierLigne(ligne.id, { label: event.target.value })}
                />
                <InputNumber
                  aria-label={t('Quantité')}
                  placeholder={t('Quantité')}
                  min={0}
                  style={{ width: 120 }}
                  value={ligne.quantity ?? undefined}
                  onChange={value => modifierLigne(ligne.id, { quantity: (value as number | null) ?? null })}
                />
                <InputNumber
                  aria-label={t('Prix unitaire')}
                  placeholder={t('Prix unitaire')}
                  min={0}
                  style={{ width: 160 }}
                  value={ligne.unitPrice ?? undefined}
                  onChange={value => modifierLigne(ligne.id, { unitPrice: (value as number | null) ?? null })}
                  {...montantSaisiProps}
                />
                <InputNumber
                  aria-label={t('Montant de la ligne')}
                  placeholder={t('Montant')}
                  min={0}
                  style={{ width: 180 }}
                  // Lecture seule dès que le produit prend le relais : deux
                  // chiffres contradictoires à l'écran valent moins qu'un
                  // seul champ inerte qui dit d'où vient le montant.
                  disabled={montantVerrouille(ligne.quantity, ligne.unitPrice)}
                  value={montantDeLaLigne(ligne) ?? undefined}
                  onChange={value => modifierLigne(ligne.id, { amount: (value as number | null) ?? null })}
                  {...montantSaisiProps}
                />
                <Button
                  aria-label={t('Retirer la ligne')}
                  icon={<DeleteOutlined />}
                  disabled={lignes.length <= 1}
                  onClick={() => retirerLigne(ligne.id)}
                />
              </Space>
            ))}
            <Button icon={<PlusOutlined />} onClick={ajouterLigne}>
              {t('Ajouter une ligne')}
            </Button>
          </Space>

          <div style={{ marginBottom: 'var(--space-4)', maxWidth: 320 }}>
            <Text strong>
              {t('Montant total :')} <MoneyValue value={montantTotal} />
            </Text>
          </div>

          <Button type="primary" loading={enregistrementEnCours} disabled={!peutEnregistrer} onClick={enregistrer}>
            {t('Enregistrer en brouillon')}
          </Button>
        </Card>
      </>
    );
  }

  if (erreurBon) {
    return (
      <>
        <PageHeader title={t('Bon de commande')} breadcrumbs={[...filAriane, { label: t('Détail') }]} />
        <StateBlock
          variant="error"
          description={t('Impossible de charger ce bon de commande.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetchBon(), primary: true }]}
        />
      </>
    );
  }

  if (bonEnAttente || !bon) {
    return (
      <>
        <PageHeader title={t('Bon de commande')} breadcrumbs={[...filAriane, { label: t('Détail') }]} />
        <StateBlock variant="loading" />
      </>
    );
  }

  // Quantité et prix unitaire ne s'affichent que là où ils existent : une
  // ligne saisie en montant direct montre une case vide plutôt qu'un « 1 »
  // inventé, qui laisserait croire à une quantité jamais saisie.
  const colonnesLignes: ColumnsType<PurchaseOrder['lines'][number]> = [
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
    { title: t('Montant'), key: 'montant', align: 'end', render: (_, l) => <MoneyValue value={l.amount} /> }
  ];

  return (
    <>
      <PageHeader
        title={bon.reference}
        subtitle={`${bon.siteLabel} · ${bon.supplierLabel}`}
        breadcrumbs={[...filAriane, { label: bon.reference }]}
        extra={
          <Space size="small">
            <StatusTag
              status={bon.status}
              tone={TONE_STATUT[bon.status]}
              label={PURCHASE_ORDER_STATUS_LABELS[bon.status]}
            />
            <StatusTag
              status={bon.invoicingState}
              tone={TONE_FACTURATION[bon.invoicingState]}
              label={INVOICING_STATE_LABELS[bon.invoicingState]}
            />
          </Space>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-6)'
        }}
      >
        <StatCard label={t('Date')} value={dateCourte(bon.orderDate)} />
        <StatCard label={t('Montant total')} value={<MoneyValue value={bon.totalAmount} />} />
        <StatCard label={t('Facturé')} value={<MoneyValue value={bon.invoicedAmount} />} />
        <StatCard label={t('Reste à facturer')} value={<MoneyValue value={bon.remainingAmount} />} />
      </div>

      <Space wrap style={{ marginBottom: 'var(--space-6)' }}>
        {bon.status === 'DRAFT' && (
          <ConfirmAction
            title={t('Émettre le bon {{reference}} ?', { reference: bon.reference })}
            description={t(
              "Cette opération est irréversible : un bon émis ne peut plus repasser en brouillon, et son reste à facturer commence dès lors à compter dans l'engagé du chantier."
            )}
            okText={t("Confirmer l'émission")}
            onConfirm={emettre}
          >
            <Button type="primary" icon={<SendOutlined />} loading={emissionEnCours}>
              {t('Émettre le bon')}
            </Button>
          </ConfirmAction>
        )}
        {bon.status === 'ISSUED' && (
          <Button danger loading={annulationEnCours} onClick={() => setAnnulationOuverte(true)}>
            {t('Annuler le bon')}
          </Button>
        )}
        {/*
          Sans condition de statut : un bon ANNULÉ se duplique aussi, et c'est
          même le cas d'usage le plus courant — on annule pour ressaisir.
        */}
        <Button icon={<CopyOutlined />} onClick={() => dupliquer(bon)}>
          {t('Dupliquer')}
        </Button>
      </Space>

      <Modal
        title={t('Annuler le bon {{reference}} ?', { reference: bon.reference })}
        open={annulationOuverte}
        onCancel={() => setAnnulationOuverte(false)}
        onOk={annuler}
        okText={t("Confirmer l'annulation")}
        okButtonProps={{ danger: true, disabled: !motifAnnulation.trim(), loading: annulationEnCours }}
        cancelText={t('Renoncer')}
        destroyOnHidden
      >
        <Text type="secondary">
          {t(
            "Cette opération est irréversible : le bon annulé n'engage plus rien au chantier. S'il porte déjà des factures rapprochées, corrigez-les d'abord depuis l'écran des factures fournisseurs."
          )}
        </Text>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <label htmlFor="motif-annulation-bon">{t("Motif de l'annulation")}</label>
          <Input.TextArea
            id="motif-annulation-bon"
            rows={3}
            value={motifAnnulation}
            onChange={event => setMotifAnnulation(event.target.value)}
            placeholder={t('Ex. Commande passée en double')}
          />
        </div>
      </Modal>

      <Title level={4}>{t('Lignes du bon')}</Title>
      <DataView<PurchaseOrder['lines'][number]>
        paginated={false}
        items={bon.lines}
        total={bon.lines.length}
        page={1}
        pageSize={Math.max(bon.lines.length, 1)}
        onPageChange={() => {}}
        emptyDescription={t('Ce bon ne porte encore aucune ligne.')}
        columns={colonnesLignes}
        rowKey={l => l.id}
        aria-label={t('Lignes du bon de commande')}
        renderCard={l => (
          <DataCard
            title={l.label}
            aria-label={l.label}
            subtitle={l.costCategoryLabel}
            highlight={<MoneyValue value={l.amount} />}
            fields={
              l.quantity != null || l.unitPrice != null
                ? [
                    {
                      label: t('Quantité'),
                      value: l.quantity == null ? '' : l.quantity.toLocaleString(activeLocale())
                    },
                    { label: t('Prix unitaire'), value: l.unitPrice == null ? '' : <MoneyValue value={l.unitPrice} /> }
                  ]
                : undefined
            }
          />
        )}
      />
    </>
  );
};

export default BonDeCommande;
