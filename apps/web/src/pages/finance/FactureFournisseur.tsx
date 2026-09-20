import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Typography
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  listSuppliers,
  listSupplierInvoices,
  createSupplierInvoice,
  validateSupplierInvoice,
  voidSupplierInvoice,
  createSupplierPayment,
  validateSupplierPayment,
  voidSupplierPayment,
  listConstructionSites,
  listCostCategories
} from '../../services/finance-lot2-service';
import { DOCUMENT_STATUS_LABELS } from '../../types/finance-lot2-types';
import type { Supplier, SupplierInvoice, SupplierPayment, DocumentStatus } from '../../types/finance-lot2-types';
import { detailKey, queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  StatusTag,
  MoneyValue,
  StatCard,
  DataView,
  DataCard,
  ConfirmAction,
  useConfirmAction
} from '../../components/primitives';
import type { StatusTone } from '../../components/primitives';
import { t } from '../../i18n/t';
import { montantCalcule, montantVerrouille } from '../../utils/ligne-quantite-prix';
import { montantSaisiProps } from '../../utils/montant-saisi';

import { activeLocale } from '../../i18n/format';
const { Text, Title } = Typography;

/**
 * Facture fournisseur — saisie, validation et règlement, récits 3 et 4 du
 * lot 2 (`specs/017-finance-fournisseurs-chantiers/spec.md`).
 *
 * Un seul écran, comme `Facturation.tsx` au lot 1 : la gestionnaire choisit
 * un fournisseur (`?fournisseur=` dans l'URL, partageable), et retrouve là
 * sa saisie de facture, la liste de ses factures avec leurs actions, et son
 * règlement. Le fournisseur est un champ de la facture (contrat gelé,
 * `CreateSupplierInvoiceInput`) : le préselectionner depuis
 * `Fournisseurs.tsx` évite de le ressaisir sans empêcher de le changer ici.
 *
 * **Le point de conception qui compte, premier volet : le rattachement au
 * chantier.** Obligatoire pour un fournisseur MATERIALS ou MIXED, facultatif
 * pour un fournisseur SERVICES (`Supplier.kind`). L'écran le dit par une
 * bannière AVANT l'envoi — pas seulement en désactivant le bouton — dès que
 * la condition n'est pas remplie, avant même que la gestionnaire n'ait tenté
 * d'enregistrer.
 *
 * **Second volet : l'écart d'imputation.** La somme des imputations doit
 * égaler le montant de la facture (somme des lignes). Un `<StatCard>` dédié
 * l'affiche en direct, coloré selon qu'il est nul ou non — la même primitive
 * que le total de contrôle des deux balances, pas un indicateur réinventé ici.
 *
 * **Validation : irréversible, et l'écran le dit.** Contrairement à la
 * campagne de facturation du lot 1 (idempotente, `Facturation.tsx`), valider
 * une facture ou un règlement ferme définitivement la pièce : la correction
 * passe par une annulation. La confirmation le nomme clairement, sans pour
 * autant styliser le bouton en danger — ce n'est pas un geste destructif, et
 * un avertissement mérité n'est pas un avertissement anxiogène.
 *
 * **Annulation : motif exigé.** Une modale dédiée (et non `<ConfirmAction>`,
 * qui ne porte pas de champ de saisie) bloque la confirmation tant que le
 * motif est vide.
 *
 * **Un acompte n'est pas une erreur.** Un règlement dont aucune facture n'est
 * cochée est accepté : l'écran l'annonce par une note neutre, jamais par une
 * bannière d'erreur — le compte du fournisseur devient débiteur, ce que le
 * relevé (lot 1) sait déjà représenter.
 *
 * **Limite assumée du contrat gelé.** `finance-lot2-service.ts` n'expose
 * aucun `listSupplierPayments` : impossible de relire l'historique des
 * règlements d'un fournisseur depuis le serveur. Les règlements créés dans
 * cette session sont donc conservés en mémoire (état local), affichés et
 * validables, mais un rechargement de la page les perd — au même titre que
 * le fait déjà remarquer `finance-mock-releve.ts` pour une autre limite du
 * même contrat.
 */

interface LigneSaisie {
  id: string;
  label: string;
  amount: number | null;
  /**
   * Quantité et prix unitaire, facultatifs. Règle complète dans
   * `utils/ligne-quantite-prix.ts` : renseignés tous les deux, le montant
   * devient leur produit et son champ passe en lecture seule ; sinon il se
   * saisit comme avant — une prestation ou un forfait n'a pas de quantité.
   */
  quantity: number | null;
  unitPrice: number | null;
}

interface ImputationSaisie {
  id: string;
  siteId?: string;
  costCategoryId?: string;
  amount: number | null;
}

function nouvelleLigne(): LigneSaisie {
  return { id: crypto.randomUUID(), label: '', amount: null, quantity: null, unitPrice: null };
}

/**
 * Le montant retenu pour une ligne : le produit quand quantité ET prix
 * unitaire sont là, la saisie directe sinon. Une seule fonction pour le
 * total de la facture, pour la validation et pour la charge utile — trois
 * lectures du même montant finiraient par diverger.
 */
function montantDeLaLigne(ligne: LigneSaisie): number | null {
  return montantCalcule(ligne.quantity, ligne.unitPrice) ?? ligne.amount;
}

function nouvelleImputation(): ImputationSaisie {
  return { id: crypto.randomUUID(), amount: null };
}

const STATUT_TONE: Record<DocumentStatus, StatusTone> = {
  DRAFT: 'neutral',
  VALIDATED: 'success',
  VOIDED: 'danger'
};

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

export const FactureFournisseur: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  // Pendant imperatif de `<ConfirmAction>`, pour la carte mobile de
  // `<DataCard>` : sa `primaryAction` ne porte qu'un `onClick`, sans
  // déclencheur React à envelopper. La validation doit rester confirmée là
  // aussi — l'irréversibilité ne dépend pas du palier d'affichage.
  const confirmerAction = useConfirmAction();

  const supplierId = searchParams.get('fournisseur');

  const choisirFournisseur = (id: string | undefined) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id) next.set('fournisseur', id);
      else next.delete('fournisseur');
      return next;
    });
  };

  const { data: fournisseurs } = useQuery({
    queryKey: queryKey('suppliers', tenantId),
    queryFn: () => listSuppliers(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const { data: chantiers } = useQuery({
    queryKey: queryKey('finance-chantiers-reference', tenantId, {}),
    queryFn: () => listConstructionSites(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const { data: postes } = useQuery({
    queryKey: queryKey('finance-postes-reference', tenantId, {}),
    queryFn: () => listCostCategories(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const fournisseur = useMemo<Supplier | undefined>(
    () => fournisseurs?.find(f => f.id === supplierId),
    [fournisseurs, supplierId]
  );

  const {
    data: factures,
    isPending: facturesEnAttente,
    isFetching: facturesEnCours,
    error: erreurFactures,
    refetch: refetchFactures
  } = useQuery({
    queryKey: detailKey('supplier-invoices', tenantId, supplierId ?? ''),
    queryFn: () => listSupplierInvoices(tenantId as string, supplierId as string),
    enabled: Boolean(tenantId) && Boolean(supplierId),
    staleTime: STALE_TIME.list
  });

  const listeFactures = factures ?? [];

  const optionsChantiers = useMemo(
    () => (chantiers ?? []).map(c => ({ value: c.id, label: c.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [chantiers]
  );
  const optionsPostes = useMemo(
    () =>
      (postes ?? [])
        .filter(p => p.isActive)
        .sort((a, b) => a.position - b.position)
        .map(p => ({ value: p.id, label: p.label })),
    [postes]
  );

  // ---------------------------------------------------------------------
  // Saisie d'une facture
  // ---------------------------------------------------------------------

  const [date, setDate] = useState(() => dayjs());
  const [reference, setReference] = useState('');
  const [lignes, setLignes] = useState<LigneSaisie[]>([nouvelleLigne()]);
  const [imputations, setImputations] = useState<ImputationSaisie[]>([]);
  const [enregistrementFacture, setEnregistrementFacture] = useState(false);

  // Changer de fournisseur repart d'une saisie vierge : les lignes d'un
  // fournisseur n'ont pas de sens pour un autre.
  useEffect(() => {
    setDate(dayjs());
    setReference('');
    setLignes([nouvelleLigne()]);
    setImputations([]);
  }, [supplierId]);

  const montantFacture = lignes.reduce((somme, l) => somme + (montantDeLaLigne(l) ?? 0), 0);
  const montantImpute = imputations.reduce((somme, a) => somme + (a.amount ?? 0), 0);
  const ecart = montantFacture - montantImpute;

  const rattachementObligatoire = Boolean(fournisseur) && fournisseur?.kind !== 'SERVICES';
  const rattachementManquant = rattachementObligatoire && imputations.length === 0;
  const imputationsIncompletes = imputations.some(a => !a.siteId || !a.costCategoryId || !(a.amount && a.amount > 0));
  const ecartNonNul = imputations.length > 0 && !imputationsIncompletes && ecart !== 0;
  const afficherEcart = imputations.length > 0 || rattachementObligatoire;

  const lignesInvalides =
    lignes.length === 0 ||
    lignes.some(l => {
      const montant = montantDeLaLigne(l);
      return !l.label.trim() || !(montant && montant > 0);
    });
  const referenceManquante = !reference.trim();

  const peutEnregistrerFacture =
    Boolean(fournisseur) &&
    !referenceManquante &&
    !lignesInvalides &&
    montantFacture > 0 &&
    !rattachementManquant &&
    !imputationsIncompletes &&
    !ecartNonNul;

  const ajouterLigne = () => setLignes(prev => [...prev, nouvelleLigne()]);
  const retirerLigne = (id: string) => setLignes(prev => (prev.length > 1 ? prev.filter(l => l.id !== id) : prev));
  const modifierLigne = (id: string, patch: Partial<LigneSaisie>) =>
    setLignes(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));

  const ajouterImputation = () => setImputations(prev => [...prev, nouvelleImputation()]);
  const retirerImputation = (id: string) => setImputations(prev => prev.filter(a => a.id !== id));
  const modifierImputation = (id: string, patch: Partial<ImputationSaisie>) =>
    setImputations(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));

  const enregistrerFacture = async () => {
    if (!tenantId || !fournisseur || !peutEnregistrerFacture) return;
    setEnregistrementFacture(true);
    try {
      await createSupplierInvoice(tenantId, {
        supplierId: fournisseur.id,
        invoiceDate: date.format('YYYY-MM-DD'),
        reference: reference.trim(),
        lines: lignes.map(l => ({
          label: l.label.trim(),
          amount: montantDeLaLigne(l) as number,
          // Conservés tels quels : le serveur les range à côté du montant,
          // il ne refait pas la multiplication.
          quantity: l.quantity,
          unitPrice: l.unitPrice
        })),
        allocations: imputations.map(a => ({
          siteId: a.siteId as string,
          costCategoryId: a.costCategoryId as string,
          amount: a.amount as number
        }))
      });
      await queryClient.invalidateQueries({ queryKey: detailKey('supplier-invoices', tenantId, fournisseur.id) });
      message.success(t('Facture {{value}} enregistrée en brouillon.', { value: reference.trim() }));
      setDate(dayjs());
      setReference('');
      setLignes([nouvelleLigne()]);
      setImputations([]);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'enregistrement de la facture a échoué."));
    } finally {
      setEnregistrementFacture(false);
    }
  };

  // ---------------------------------------------------------------------
  // Validation et annulation d'une facture
  // ---------------------------------------------------------------------

  const validerFacture = async (facture: SupplierInvoice) => {
    if (!tenantId) return;
    try {
      await validateSupplierInvoice(tenantId, facture.id);
      await queryClient.invalidateQueries({ queryKey: detailKey('supplier-invoices', tenantId, facture.supplierId) });
      message.success(t('Facture {{reference}} validée.', { reference: facture.reference }));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La validation a échoué.'));
    }
  };

  const [cibleAnnulation, setCibleAnnulation] = useState<SupplierInvoice | null>(null);
  const [motifAnnulation, setMotifAnnulation] = useState('');
  const [annulationEnCours, setAnnulationEnCours] = useState(false);

  const ouvrirAnnulation = (facture: SupplierInvoice) => {
    setCibleAnnulation(facture);
    setMotifAnnulation('');
  };

  const confirmerAnnulation = async () => {
    if (!tenantId || !cibleAnnulation || !motifAnnulation.trim()) return;
    setAnnulationEnCours(true);
    try {
      await voidSupplierInvoice(tenantId, cibleAnnulation.id, motifAnnulation.trim());
      await queryClient.invalidateQueries({
        queryKey: detailKey('supplier-invoices', tenantId, cibleAnnulation.supplierId)
      });
      message.success(t('Facture {{reference}} annulée.', { reference: cibleAnnulation.reference }));
      setCibleAnnulation(null);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'annulation a échoué."));
    } finally {
      setAnnulationEnCours(false);
    }
  };

  // ---------------------------------------------------------------------
  // Règlement
  // ---------------------------------------------------------------------

  const facturesReglabes = listeFactures.filter(f => f.status === 'VALIDATED');

  const [dateReglement, setDateReglement] = useState(() => dayjs());
  const [montantReglement, setMontantReglement] = useState<number | null>(null);
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [enregistrementReglement, setEnregistrementReglement] = useState(false);
  // Aucun `listSupplierPayments` dans le contrat gelé (voir l'en-tête) : les
  // règlements de cette session sont gardés ici, pas relus du serveur.
  const [reglements, setReglements] = useState<SupplierPayment[]>([]);
  const [cibleAnnulationReglement, setCibleAnnulationReglement] = useState<SupplierPayment | null>(null);
  const [motifAnnulationReglement, setMotifAnnulationReglement] = useState('');
  const [annulationReglementEnCours, setAnnulationReglementEnCours] = useState(false);

  useEffect(() => {
    setDateReglement(dayjs());
    setMontantReglement(null);
    setSelection({});
    setReglements([]);
  }, [supplierId]);

  const basculerFacture = (facture: SupplierInvoice, cochee: boolean) => {
    setSelection(prev => {
      const next = { ...prev };
      if (cochee) next[facture.id] = facture.amount;
      else delete next[facture.id];
      return next;
    });
  };

  const modifierAffectation = (factureId: string, montant: number | null) => {
    setSelection(prev => ({ ...prev, [factureId]: montant ?? 0 }));
  };

  const sommeAffectee = Object.values(selection).reduce((somme, m) => somme + m, 0);
  const montant = montantReglement ?? 0;
  const partNonAffectee = montant - sommeAffectee;
  const depassement = sommeAffectee > montant;
  const acompteSansFacture = montant > 0 && sommeAffectee === 0;

  const peutEnregistrerReglement = Boolean(fournisseur) && montant > 0 && !depassement;

  const enregistrerReglement = async () => {
    if (!tenantId || !fournisseur || !peutEnregistrerReglement) return;
    setEnregistrementReglement(true);
    try {
      const allocations = Object.entries(selection)
        .filter(([, montantLigne]) => montantLigne > 0)
        .map(([invoiceId, montantLigne]) => ({ invoiceId, amount: montantLigne }));
      const reglement = await createSupplierPayment(tenantId, {
        supplierId: fournisseur.id,
        paymentDate: dateReglement.format('YYYY-MM-DD'),
        amount: montant,
        allocations
      });
      setReglements(prev => [reglement, ...prev]);
      message.success(t('Règlement enregistré en brouillon.'));
      setMontantReglement(null);
      setSelection({});
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'enregistrement du règlement a échoué."));
    } finally {
      setEnregistrementReglement(false);
    }
  };

  const validerReglement = async (reglement: SupplierPayment) => {
    if (!tenantId) return;
    try {
      const valide = await validateSupplierPayment(tenantId, reglement.id);
      setReglements(prev => prev.map(r => (r.id === reglement.id ? valide : r)));
      message.success(t('Règlement validé.'));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La validation a échoué.'));
    }
  };

  /**
   * Annule un règlement validé, par une pièce d'annulation liée.
   *
   * Même règle que pour la facture (principe P-6) : on ne modifie pas une pièce
   * validée, on en crée une seconde qui porte l'écriture inverse. Le solde du
   * fournisseur remonte d'autant, sans aucune correction à la main.
   */
  const confirmerAnnulationReglement = async () => {
    if (!tenantId || !cibleAnnulationReglement || !motifAnnulationReglement.trim()) return;
    setAnnulationReglementEnCours(true);
    try {
      await voidSupplierPayment(tenantId, cibleAnnulationReglement.id, motifAnnulationReglement.trim());
      setReglements(prev =>
        prev.map(r => (r.id === cibleAnnulationReglement.id ? { ...r, status: 'VOIDED' as DocumentStatus } : r))
      );
      message.success(t('Règlement annulé.'));
      setCibleAnnulationReglement(null);
      setMotifAnnulationReglement('');
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'annulation a échoué."));
    } finally {
      setAnnulationReglementEnCours(false);
    }
  };

  // ---------------------------------------------------------------------

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const optionsFournisseurs = (fournisseurs ?? [])
    .filter(f => f.isActive)
    .map(f => ({ value: f.id, label: f.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const colonnesFactures: ColumnsType<SupplierInvoice> = [
    { title: t('Référence'), dataIndex: 'reference', key: 'reference' },
    { title: t('Date'), key: 'date', render: (_, f) => dateCourte(f.invoiceDate) },
    { title: t('Chantier'), key: 'chantier', render: (_, f) => f.siteLabel ?? '—' },
    { title: t('Montant'), key: 'montant', align: 'end', render: (_, f) => <MoneyValue value={f.amount} /> },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, f) => (
        <StatusTag status={f.status} tone={STATUT_TONE[f.status]} label={DOCUMENT_STATUS_LABELS[f.status]} />
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, f) => {
        if (f.status === 'DRAFT') {
          return (
            <ConfirmAction
              title={t('Valider la facture {{reference}} ?', { reference: f.reference })}
              description={t(
                'Cette opération est irréversible : une facture validée ne peut plus être modifiée. Toute correction devra passer par une annulation dédiée, avec un motif.'
              )}
              okText={t('Confirmer la validation')}
              onConfirm={() => validerFacture(f)}
            >
              <Button type="link">{t('Valider')}</Button>
            </ConfirmAction>
          );
        }
        if (f.status === 'VALIDATED') {
          return (
            <Button type="link" onClick={() => ouvrirAnnulation(f)}>
              {t('Annuler')}
            </Button>
          );
        }
        return null;
      }
    }
  ];

  return (
    <>
      <PageHeader title={t('Factures fournisseurs')} subtitle={fournisseur ? fournisseur.name : undefined} />

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ maxWidth: 420 }}>
          <label htmlFor="facture-fournisseur">{t('Fournisseur')}</label>
          <Select
            id="facture-fournisseur"
            style={{ width: '100%' }}
            placeholder={t('Choisir un fournisseur…')}
            showSearch
            optionFilterProp="label"
            value={supplierId || undefined}
            onChange={choisirFournisseur}
            options={optionsFournisseurs}
          />
        </div>
      </Card>

      {!fournisseur ? (
        <StateBlock
          variant="empty"
          title={t('Choisissez un fournisseur')}
          description={t(
            'Sélectionnez un fournisseur ci-dessus pour saisir une facture, la valider ou enregistrer un règlement.'
          )}
        />
      ) : (
        <>
          <Card style={{ marginBottom: 'var(--space-6)' }}>
            <Title level={4} style={{ marginTop: 0 }}>
              {t('Nouvelle facture')}
            </Title>

            <Space wrap size="middle" align="end" style={{ marginBottom: 'var(--space-4)', width: '100%' }}>
              <div>
                <div>
                  <label htmlFor="facture-date">{t('Date')}</label>
                </div>
                <DatePicker id="facture-date" format="DD/MM/YYYY" value={date} onChange={v => setDate(v ?? dayjs())} />
              </div>
              <div style={{ minWidth: 220 }}>
                <div>
                  <label htmlFor="facture-reference">{t('Référence')}</label>
                </div>
                <Input
                  id="facture-reference"
                  placeholder={t('Ex. FRS-2026-0142')}
                  value={reference}
                  onChange={event => setReference(event.target.value)}
                />
              </div>
            </Space>

            <Title level={5}>{t('Lignes')}</Title>
            <Space orientation="vertical" size="small" style={{ width: '100%', marginBottom: 'var(--space-4)' }}>
              {lignes.map(ligne => (
                <Space key={ligne.id} align="start" wrap>
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

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <StatCard label={t('Montant de la facture')} value={<MoneyValue value={montantFacture} />} />
            </div>

            <Title level={5}>{t('Imputations au chantier')}</Title>

            {rattachementManquant && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 'var(--space-3)' }}
                message={t('Rattachement à un chantier obligatoire')}
                description={t(
                  "{{name}} est un fournisseur de {{value}} : ajoutez au moins une imputation avant d'enregistrer la facture.",
                  {
                    name: fournisseur.name,
                    value: fournisseur.kind === 'MATERIALS' ? 'matériaux' : 'matériaux et prestation'
                  }
                )}
              />
            )}

            <Space orientation="vertical" size="small" style={{ width: '100%', marginBottom: 'var(--space-4)' }}>
              {imputations.map(imputation => (
                <Space key={imputation.id} align="start" wrap>
                  <Select
                    aria-label={t('Chantier')}
                    placeholder={t('Chantier')}
                    style={{ width: 220 }}
                    value={imputation.siteId}
                    onChange={value => modifierImputation(imputation.id, { siteId: value })}
                    options={optionsChantiers}
                  />
                  <Select
                    aria-label={t('Poste de dépense')}
                    placeholder={t('Poste')}
                    style={{ width: 200 }}
                    value={imputation.costCategoryId}
                    onChange={value => modifierImputation(imputation.id, { costCategoryId: value })}
                    showSearch
                    optionFilterProp="label"
                    options={optionsPostes}
                  />
                  <InputNumber
                    aria-label={t('Montant imputé')}
                    placeholder={t('Montant')}
                    min={0}
                    style={{ width: 180 }}
                    value={imputation.amount ?? undefined}
                    onChange={value => modifierImputation(imputation.id, { amount: (value as number | null) ?? null })}
                    {...montantSaisiProps}
                  />
                  <Button
                    aria-label={t("Retirer l'imputation")}
                    icon={<DeleteOutlined />}
                    onClick={() => retirerImputation(imputation.id)}
                  />
                </Space>
              ))}
              <Button icon={<PlusOutlined />} onClick={ajouterImputation}>
                {t('Ajouter une imputation')}
              </Button>
            </Space>

            {afficherEcart && (
              <div style={{ marginBottom: 'var(--space-4)', maxWidth: 320 }}>
                <StatCard
                  label={t('Écart de saisie')}
                  value={<MoneyValue value={ecart} signed />}
                  tone={ecart === 0 ? 'positive' : 'danger'}
                  hint={
                    ecart === 0
                      ? t('Les imputations correspondent exactement au montant de la facture.')
                      : t('La somme des imputations doit égaler le montant de la facture.')
                  }
                />
              </div>
            )}

            <Button
              type="primary"
              loading={enregistrementFacture}
              disabled={!peutEnregistrerFacture}
              onClick={enregistrerFacture}
            >
              {t('Enregistrer en brouillon')}
            </Button>
          </Card>

          <Title level={4}>
            {t('Factures de')} {fournisseur.name}
          </Title>
          <DataView<SupplierInvoice>
            paginated={false}
            items={listeFactures}
            total={listeFactures.length}
            page={1}
            pageSize={Math.max(listeFactures.length, 1)}
            onPageChange={() => {}}
            loading={facturesEnAttente}
            isReloading={facturesEnCours && !facturesEnAttente}
            error={erreurFactures ? t('Impossible de charger les factures de ce fournisseur.') : null}
            onRetry={() => refetchFactures()}
            emptyDescription={t('Aucune facture enregistrée pour ce fournisseur.')}
            columns={colonnesFactures}
            rowKey={f => f.id}
            aria-label={t('Factures de {{name}}', { name: fournisseur.name })}
            renderCard={f => (
              <DataCard
                title={f.reference}
                aria-label={t('Facture {{reference}}', { reference: f.reference })}
                subtitle={`${dateCourte(f.invoiceDate)}${f.siteLabel ? ' · ' + f.siteLabel : ''}`}
                status={
                  <StatusTag status={f.status} tone={STATUT_TONE[f.status]} label={DOCUMENT_STATUS_LABELS[f.status]} />
                }
                highlight={<MoneyValue value={f.amount} />}
                primaryAction={
                  f.status === 'DRAFT'
                    ? {
                        label: 'Valider',
                        onClick: () =>
                          confirmerAction({
                            title: t('Valider la facture {{reference}} ?', { reference: f.reference }),
                            description: t(
                              'Cette opération est irréversible : une facture validée ne peut plus être modifiée. Toute correction devra passer par une annulation dédiée, avec un motif.'
                            ),
                            okText: t('Confirmer la validation'),
                            onConfirm: () => validerFacture(f)
                          })
                      }
                    : f.status === 'VALIDATED'
                      ? { label: 'Annuler', onClick: () => ouvrirAnnulation(f) }
                      : undefined
                }
              />
            )}
          />

          <Card style={{ marginTop: 'var(--space-6)' }}>
            <Title level={4} style={{ marginTop: 0 }}>
              {t('Règlement')}
            </Title>

            <Space wrap size="middle" align="end" style={{ marginBottom: 'var(--space-4)', width: '100%' }}>
              <div>
                <div>
                  <label htmlFor="reglement-date">{t('Date')}</label>
                </div>
                <DatePicker
                  id="reglement-date"
                  format="DD/MM/YYYY"
                  value={dateReglement}
                  onChange={v => setDateReglement(v ?? dayjs())}
                />
              </div>
              <div style={{ minWidth: 200 }}>
                <div>
                  <label htmlFor="reglement-montant">{t('Montant du règlement')}</label>
                </div>
                <InputNumber
                  id="reglement-montant"
                  min={0}
                  style={{ width: '100%' }}
                  value={montantReglement ?? undefined}
                  onChange={value => setMontantReglement((value as number | null) ?? null)}
                  {...montantSaisiProps}
                />
              </div>
            </Space>

            <Title level={5}>{t('Factures à régler')}</Title>
            {facturesReglabes.length === 0 ? (
              <Text type="secondary">
                {t('Aucune facture validée pour ce fournisseur : un règlement ici sera un acompte.')}
              </Text>
            ) : (
              <Space orientation="vertical" size="small" style={{ width: '100%', marginBottom: 'var(--space-4)' }}>
                {facturesReglabes.map(f => {
                  const cochee = f.id in selection;
                  return (
                    <Space key={f.id} align="center" wrap>
                      <Checkbox checked={cochee} onChange={event => basculerFacture(f, event.target.checked)}>
                        {f.reference} — <MoneyValue value={f.amount} />
                      </Checkbox>
                      {cochee && (
                        <InputNumber
                          aria-label={t('Montant affecté à {{reference}}', { reference: f.reference })}
                          min={0}
                          max={f.amount}
                          style={{ width: 160 }}
                          value={selection[f.id]}
                          onChange={value => modifierAffectation(f.id, value as number | null)}
                          {...montantSaisiProps}
                        />
                      )}
                    </Space>
                  );
                })}
              </Space>
            )}

            {depassement && (
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: 'var(--space-4)' }}
                message={t('La somme des factures sélectionnées dépasse le montant du règlement.')}
              />
            )}

            {!depassement && acompteSansFacture && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 'var(--space-4)' }}
                message={t('Ce règlement sera enregistré comme acompte')}
                description={t(
                  "Aucune facture n'est sélectionnée : le compte de ce fournisseur deviendra débiteur du montant versé. Ce n'est pas une erreur."
                )}
              />
            )}

            {!depassement && !acompteSansFacture && montant > 0 && partNonAffectee > 0 && (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <Text type="secondary">
                  {t('Part non affectée à une facture (acompte) :')} <MoneyValue value={partNonAffectee} />
                </Text>
              </div>
            )}

            <Button
              type="primary"
              loading={enregistrementReglement}
              disabled={!peutEnregistrerReglement}
              onClick={enregistrerReglement}
            >
              {t('Enregistrer le règlement')}
            </Button>

            {reglements.length > 0 && (
              <div style={{ marginTop: 'var(--space-6)' }}>
                <Title level={5}>{t('Règlements de cette session')}</Title>
                <DataView<SupplierPayment>
                  paginated={false}
                  items={reglements}
                  total={reglements.length}
                  page={1}
                  pageSize={Math.max(reglements.length, 1)}
                  onPageChange={() => {}}
                  emptyDescription={t('Aucun règlement enregistré.')}
                  columns={[
                    { title: 'Date', key: 'date', render: (_, r) => dateCourte(r.paymentDate) },
                    {
                      title: t('Montant réglé'),
                      key: 'montant',
                      align: 'end',
                      render: (_, r) => <MoneyValue value={r.amount} />
                    },
                    {
                      title: 'Affectation',
                      key: 'affectation',
                      render: (_, r) =>
                        r.allocations.length > 0
                          ? r.allocations.map(a => a.invoiceReference).join(' · ')
                          : t('Acompte, sans facture')
                    },
                    {
                      title: 'Statut',
                      key: 'statut',
                      render: (_, r) => (
                        <StatusTag
                          status={r.status}
                          tone={STATUT_TONE[r.status]}
                          label={DOCUMENT_STATUS_LABELS[r.status]}
                        />
                      )
                    },
                    {
                      title: 'Actions',
                      key: 'actions',
                      align: 'end',
                      render: (_, r) =>
                        r.status === 'DRAFT' ? (
                          <ConfirmAction
                            title={t('Valider ce règlement ?')}
                            description={t(
                              'Cette opération est irréversible : un règlement validé ne peut plus être modifié.'
                            )}
                            okText={t('Confirmer la validation')}
                            onConfirm={() => validerReglement(r)}
                          >
                            <Button type="link">{t('Valider')}</Button>
                          </ConfirmAction>
                        ) : r.status === 'VALIDATED' ? (
                          <Button type="link" danger onClick={() => setCibleAnnulationReglement(r)}>
                            {t('Annuler')}
                          </Button>
                        ) : null
                    }
                  ]}
                  rowKey={r => r.id}
                  aria-label={t('Règlements de cette session')}
                  renderCard={r => (
                    <DataCard
                      title={dateCourte(r.paymentDate)}
                      aria-label={t('Règlement du {{value}}', { value: dateCourte(r.paymentDate) })}
                      status={
                        <StatusTag
                          status={r.status}
                          tone={STATUT_TONE[r.status]}
                          label={DOCUMENT_STATUS_LABELS[r.status]}
                        />
                      }
                      highlight={<MoneyValue value={r.amount} />}
                      fields={[
                        {
                          label: 'Affectation',
                          value:
                            r.allocations.length > 0
                              ? r.allocations.map(a => a.invoiceReference).join(' · ')
                              : 'Acompte'
                        }
                      ]}
                      primaryAction={
                        r.status === 'DRAFT'
                          ? {
                              label: 'Valider',
                              onClick: () =>
                                confirmerAction({
                                  title: t('Valider ce règlement ?'),
                                  description: t(
                                    'Cette opération est irréversible : un règlement validé ne peut plus être modifié.'
                                  ),
                                  okText: t('Confirmer la validation'),
                                  onConfirm: () => validerReglement(r)
                                })
                            }
                          : r.status === 'VALIDATED'
                            ? { label: 'Annuler', onClick: () => setCibleAnnulationReglement(r) }
                            : undefined
                      }
                    />
                  )}
                />
              </div>
            )}
          </Card>
        </>
      )}

      <Modal
        title={
          cibleAnnulation
            ? t('Annuler la facture {{reference}} ?', { reference: cibleAnnulation.reference })
            : t('Annuler la facture ?')
        }
        open={Boolean(cibleAnnulation)}
        onCancel={() => setCibleAnnulation(null)}
        onOk={confirmerAnnulation}
        okText={t("Confirmer l'annulation")}
        okButtonProps={{ danger: true, disabled: !motifAnnulation.trim(), loading: annulationEnCours }}
        cancelText={t('Renoncer')}
        destroyOnHidden
      >
        <Text type="secondary">
          {t(
            "Cette opération est irréversible. Une pièce d'annulation liée sera créée ; la facture d'origine reste conservée, mais son montant ne compte plus dans le solde du fournisseur ni dans le coût du chantier."
          )}
        </Text>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <label htmlFor="motif-annulation-facture">{t("Motif de l'annulation")}</label>
          <Input.TextArea
            id="motif-annulation-facture"
            rows={3}
            value={motifAnnulation}
            onChange={event => setMotifAnnulation(event.target.value)}
            placeholder={t('Ex. Erreur de saisie sur le montant')}
          />
        </div>
      </Modal>

      <Modal
        title={t('Annuler ce règlement ?')}
        open={Boolean(cibleAnnulationReglement)}
        onCancel={() => setCibleAnnulationReglement(null)}
        onOk={confirmerAnnulationReglement}
        okText={t("Confirmer l'annulation")}
        okButtonProps={{
          danger: true,
          disabled: !motifAnnulationReglement.trim(),
          loading: annulationReglementEnCours
        }}
        cancelText={t('Renoncer')}
        destroyOnHidden
      >
        <Text type="secondary">
          {t(
            "Une pièce d'annulation liée sera créée. Le règlement d'origine reste conservé, mais son montant ne compte plus dans le solde du fournisseur : ce que nous lui devons remonte d'autant."
          )}
        </Text>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <label htmlFor="motif-annulation-reglement">{t("Motif de l'annulation")}</label>
          <Input.TextArea
            id="motif-annulation-reglement"
            rows={3}
            value={motifAnnulationReglement}
            onChange={event => setMotifAnnulationReglement(event.target.value)}
            placeholder={t('Ex. Virement rejeté par la banque')}
          />
        </div>
      </Modal>
    </>
  );
};
