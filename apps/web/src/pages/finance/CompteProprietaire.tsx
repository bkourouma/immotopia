import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { App, Button, DatePicker, Input, InputNumber, Modal, Select, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { createOwnerPayout, getOwnerAccount, voidOwnerPayout } from '../../services/owner-accounts-service';
import type {
  OwnerMovement,
  OwnerMovementType,
  OwnerPayout,
  PayoutMethod
} from '../../services/owner-accounts-service';
import { detailKey, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  MoneyValue,
  DataView,
  DataCard,
  StatCard,
  StatusTag
} from '../../components/primitives';
import type { StatusTone } from '../../components/primitives';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';
import { montantSaisiProps } from '../../utils/montant-saisi';
import { useMyMenuAccess } from '../../hooks/useMenuAccess';
import { writeErrorMessage } from '../../utils/error-handler';
import { TreasuryAccountSelector } from '../../components/finance/TreasuryAccountSelector';

const { Title, Text } = Typography;
const { TextArea } = Input;

/**
 * Détail du compte propriétaire — lot 3 de la gestion locative.
 *
 * Le compte courant d'un propriétaire, tel que l'agence le tient : ce qui l'a
 * crédité (loyers), ce qui l'a débité (honoraires, TVA, dépenses,
 * reversements), et le solde dû qui en résulte. Construit sur le modèle de
 * `pages/finance/ChantierDetail.tsx` — en-tête avec indicateurs calculés
 * côté serveur, jamais recalculés ici, puis un `<DataView>` par tableau.
 *
 * Contrat : `lot3-contrat-api.md` (scratchpad de l'atelier), section 1.
 * L'API n'existe pas encore ; l'écran est codé contre le contrat et testé
 * avec un mock de `services/owner-accounts-service.ts`.
 *
 * **Un reversement est validé dès son enregistrement** (contrat, §Principe) :
 * il ne se modifie pas, ne se supprime pas. En cas d'erreur, on l'annule —
 * avec un motif obligatoire — et on en saisit un nouveau. C'est pourquoi
 * l'annulation ouvre une modale qui exige ce motif, sur le modèle de
 * `pages/finance/PieceDeCaisse.tsx`, et non un simple `<ConfirmAction>`.
 *
 * **La liaison à un relevé (`statementId`) n'est pas implémentée** ici : le
 * contrat la dit facultative et invite à la laisser de côté si elle n'est pas
 * simple (§1, note sur `owner-statements`).
 */

const METHOD_LABELS: Record<PayoutMethod, string> = {
  CASH: t('Espèces'),
  BANK_TRANSFER: t('Virement'),
  CHECK: t('Chèque'),
  MOBILE_MONEY: t('Mobile Money'),
  OTHER: t('Autre')
};

const MOVEMENT_LABELS: Record<OwnerMovementType, string> = {
  RENT_COLLECTED: t('Loyer encaissé'),
  MANAGEMENT_FEE: t('Honoraires'),
  MANAGEMENT_FEE_VAT: t('TVA sur honoraires'),
  EXPENSE: t('Dépense'),
  PAYOUT: t('Reversement'),
  VOID: t('Annulation'),
  WITHHOLDING_TAX: t('Retenue à la source'),
  DEPOSIT_RETAINED: t('Dépôt de garantie conservé')
};

const MOVEMENT_TONE: Record<OwnerMovementType, StatusTone> = {
  RENT_COLLECTED: 'success',
  MANAGEMENT_FEE: 'neutral',
  MANAGEMENT_FEE_VAT: 'neutral',
  EXPENSE: 'warning',
  PAYOUT: 'info',
  VOID: 'danger',
  WITHHOLDING_TAX: 'warning',
  DEPOSIT_RETAINED: 'neutral'
};

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

/** Bien ou bail d'un mouvement : les deux sont facultatifs et indépendants. */
function bienOuBail(m: OwnerMovement): string {
  return [m.propertyTitle, m.leaseNumber].filter(Boolean).join(' · ') || '—';
}

export const CompteProprietaire: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId, ownerClientId } = useParams<{ tenantId: string; ownerClientId: string }>();

  // Annuler un reversement exige FINANCE_DOCUMENTS_VALIDATE (l'API répond 403
  // sinon, après saisie du motif). `permissions` nul = aucune restriction
  // (administrateur d'agence) ou permissions pas encore connues.
  const { permissions } = useMyMenuAccess(tenantId);
  const peutAnnuler = permissions === null || permissions.has('FINANCE_DOCUMENTS_VALIDATE');

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: detailKey('owner-accounts', tenantId, ownerClientId ?? ''),
    queryFn: () => getOwnerAccount(tenantId as string, ownerClientId as string),
    enabled: Boolean(tenantId && ownerClientId),
    staleTime: STALE_TIME.list
  });

  // --- Nouveau reversement -------------------------------------------------
  const [modalOuverte, setModalOuverte] = useState(false);
  const [montant, setMontant] = useState<number | null>(null);
  const [date, setDate] = useState<Dayjs>(() => dayjs());
  const [mode, setMode] = useState<PayoutMethod>('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [treasuryAccountId, setTreasuryAccountId] = useState<string | null>(null);
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false);

  const ouvrirNouveauReversement = () => {
    // Le solde dû par défaut, seulement s'il est positif : un solde négatif
    // ne représente rien à reverser (contrat, §Principe).
    setMontant(data && data.balance > 0 ? data.balance : null);
    setDate(dayjs());
    setMode('CASH');
    setReference('');
    setNotes('');
    setTreasuryAccountId(null);
    setModalOuverte(true);
  };

  const enregistrerReversement = async () => {
    if (!tenantId || !ownerClientId || !montant || montant <= 0) {
      message.error(t('Indiquez un montant positif.'));
      return;
    }
    setEnregistrementEnCours(true);
    try {
      const payout = await createOwnerPayout(tenantId, ownerClientId, {
        amount: montant,
        paidAt: date.format('YYYY-MM-DD'),
        method: mode,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        treasuryAccountId: treasuryAccountId || undefined
      });
      message.success(t('Reversement {{number}} enregistré.', { number: payout.number }));
      setModalOuverte(false);
      refetch();
    } catch (err: any) {
      // Le message 409 (« Le reversement dépasse le solde dû au
      // propriétaire ») est celui de l'API, affiché tel quel.
      message.error(err?.response?.data?.message || t("L'enregistrement du reversement a échoué."));
    } finally {
      setEnregistrementEnCours(false);
    }
  };

  // --- Annulation d'un reversement -----------------------------------------
  const [payoutAAnnuler, setPayoutAAnnuler] = useState<OwnerPayout | null>(null);
  const [motifAnnulation, setMotifAnnulation] = useState('');
  const [annulationEnCours, setAnnulationEnCours] = useState(false);

  const annulerReversement = async () => {
    if (!tenantId || !ownerClientId || !payoutAAnnuler || !motifAnnulation.trim()) return;
    setAnnulationEnCours(true);
    try {
      await voidOwnerPayout(tenantId, ownerClientId, payoutAAnnuler.id, motifAnnulation.trim());
      message.success(t('Reversement {{number}} annulé.', { number: payoutAAnnuler.number }));
      setPayoutAAnnuler(null);
      setMotifAnnulation('');
      refetch();
    } catch (err: any) {
      message.error(
        writeErrorMessage(
          err,
          t("L'annulation a échoué."),
          t("Vous n'avez pas le droit d'annuler un reversement. Demandez à un responsable de le faire.")
        )
      );
    } finally {
      setAnnulationEnCours(false);
    }
  };

  if (!tenantId || !ownerClientId) {
    return <StateBlock variant="empty" title={t('Aucun propriétaire sélectionné')} />;
  }

  const filAriane = [{ label: t('Finance'), to: `/tenant/${tenantId}/finance/owner-accounts` }];

  if (erreurRequete) {
    return (
      <>
        <PageHeader
          title={t('Compte propriétaire')}
          breadcrumbs={[
            ...filAriane,
            { label: t('Comptes propriétaires'), to: `/tenant/${tenantId}/finance/owner-accounts` }
          ]}
        />
        <StateBlock
          variant="error"
          description={t('Impossible de charger ce compte.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetch(), primary: true }]}
        />
      </>
    );
  }

  if (isPending || !data) {
    return <StateBlock variant="loading" />;
  }

  const colonnesMouvements: ColumnsType<OwnerMovement> = [
    { title: t('Date'), key: 'date', width: 120, render: (_, m) => dateCourte(m.date) },
    {
      title: t('Type'),
      key: 'type',
      render: (_, m) => <StatusTag status={m.type} tone={MOVEMENT_TONE[m.type]} label={MOVEMENT_LABELS[m.type]} />
    },
    { title: t('Libellé'), key: 'libelle', render: (_, m) => m.label },
    { title: t('Bien ou bail'), key: 'bien-bail', render: (_, m) => bienOuBail(m) },
    { title: t('Débit'), key: 'debit', align: 'end', render: (_, m) => <MoneyValue value={m.debit} /> },
    { title: t('Crédit'), key: 'credit', align: 'end', render: (_, m) => <MoneyValue value={m.credit} /> },
    {
      title: t('Solde dû après'),
      key: 'solde',
      align: 'end',
      render: (_, m) => (
        <strong>
          <MoneyValue value={m.balanceAfter} />
        </strong>
      )
    }
  ];

  const colonnesReversements: ColumnsType<OwnerPayout> = [
    { title: t('Numéro'), key: 'numero', render: (_, p) => p.number },
    { title: t('Date'), key: 'date', render: (_, p) => dateCourte(p.paidAt) },
    { title: t('Mode'), key: 'mode', render: (_, p) => METHOD_LABELS[p.method] },
    { title: t('Référence'), key: 'reference', render: (_, p) => p.reference ?? '—' },
    {
      title: t('Montant'),
      key: 'montant',
      align: 'end',
      render: (_, p) => (
        <span
          style={{
            textDecoration: p.status === 'VOIDED' ? 'line-through' : undefined,
            opacity: p.status === 'VOIDED' ? 0.6 : 1
          }}
        >
          <MoneyValue value={p.amount} />
        </span>
      )
    },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, p) =>
        p.status === 'VOIDED' ? (
          <span>
            <StatusTag status={p.status} tone="danger" label={t('Annulé')} />
            {p.voidReason && (
              <Text type="secondary" style={{ display: 'block', fontSize: 'var(--font-size-caption)' }}>
                {p.voidReason}
              </Text>
            )}
          </span>
        ) : (
          <StatusTag status={p.status} tone="success" label={t('Validé')} />
        )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, p) =>
        p.status === 'VALIDATED' && peutAnnuler ? (
          <Button
            danger
            size="small"
            onClick={() => {
              setPayoutAAnnuler(p);
              setMotifAnnulation('');
            }}
          >
            {t('Annuler')}
          </Button>
        ) : null
    }
  ];

  return (
    <>
      <PageHeader
        title={data.ownerName}
        breadcrumbs={[
          ...filAriane,
          { label: t('Comptes propriétaires'), to: `/tenant/${tenantId}/finance/owner-accounts` },
          { label: data.ownerName }
        ]}
        subtitle={data.email ?? undefined}
        primaryAction={{
          label: t('Nouveau reversement'),
          icon: <PlusOutlined />,
          onClick: ouvrirNouveauReversement
        }}
      />

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <Text type="secondary">{t('Solde dû')}</Text>
        <div>
          <span style={{ fontSize: 'var(--font-size-h1)', fontWeight: 'var(--font-weight-h1)' as unknown as number }}>
            <MoneyValue value={data.balance} signed />
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-6)'
        }}
      >
        <StatCard label={t('Loyers encaissés')} value={<MoneyValue value={data.totals.rentCollected} />} />
        <StatCard label={t('Honoraires')} value={<MoneyValue value={data.totals.fees} />} />
        <StatCard label={t('TVA')} value={<MoneyValue value={data.totals.vat} />} />
        <StatCard label={t('Dépenses')} value={<MoneyValue value={data.totals.expenses} />} />
        <StatCard label={t('Reversements')} value={<MoneyValue value={data.totals.payouts} />} />
      </div>

      <Title level={4}>{t('Mouvements du compte')}</Title>
      <DataView<OwnerMovement>
        paginated={false}
        scrollX={960}
        items={data.movements}
        total={data.movements.length}
        page={1}
        pageSize={Math.max(data.movements.length, 1)}
        onPageChange={() => {}}
        isReloading={isFetching}
        emptyDescription={t('Aucun mouvement sur ce compte.')}
        columns={colonnesMouvements}
        rowKey={m => m.id}
        aria-label={t('Mouvements du compte')}
        renderCard={m => (
          <DataCard
            title={MOVEMENT_LABELS[m.type]}
            subtitle={`${dateCourte(m.date)} · ${m.label}`}
            highlight={<MoneyValue value={m.balanceAfter} />}
            fields={[
              { label: t('Débit'), value: <MoneyValue value={m.debit} /> },
              { label: t('Crédit'), value: <MoneyValue value={m.credit} /> },
              { label: t('Bien ou bail'), value: bienOuBail(m) }
            ]}
          />
        )}
      />

      <Title level={4} style={{ marginTop: 'var(--space-6)' }}>
        {t('Reversements')}
      </Title>
      <DataView<OwnerPayout>
        paginated={false}
        scrollX={880}
        items={data.payouts}
        total={data.payouts.length}
        page={1}
        pageSize={Math.max(data.payouts.length, 1)}
        onPageChange={() => {}}
        isReloading={isFetching}
        emptyDescription={t('Aucun reversement enregistré.')}
        columns={colonnesReversements}
        rowKey={p => p.id}
        aria-label={t('Reversements')}
        renderCard={p => (
          <DataCard
            title={p.number}
            subtitle={`${dateCourte(p.paidAt)} · ${METHOD_LABELS[p.method]}`}
            highlight={<MoneyValue value={p.amount} />}
            status={
              p.status === 'VOIDED' ? (
                <StatusTag status={p.status} tone="danger" label={t('Annulé')} />
              ) : (
                <StatusTag status={p.status} tone="success" label={t('Validé')} />
              )
            }
            fields={[{ label: t('Référence'), value: p.reference ?? '—' }]}
            primaryAction={
              p.status === 'VALIDATED' && peutAnnuler
                ? {
                    label: t('Annuler'),
                    onClick: () => {
                      setPayoutAAnnuler(p);
                      setMotifAnnulation('');
                    }
                  }
                : undefined
            }
          />
        )}
      />

      <Modal
        title={t('Nouveau reversement')}
        open={modalOuverte}
        onCancel={() => setModalOuverte(false)}
        onOk={enregistrerReversement}
        okText={t('Enregistrer')}
        okButtonProps={{ loading: enregistrementEnCours, disabled: !montant || montant <= 0 }}
        cancelText={t('Renoncer')}
        destroyOnHidden
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 'var(--space-4)' }}>
          {t('Un reversement enregistré ne se modifie pas : en cas d’erreur, on l’annule et on en saisit un nouveau.')}
        </Text>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label htmlFor="reversement-montant">{t('Montant')}</label>
          <InputNumber
            id="reversement-montant"
            style={{ width: '100%' }}
            min={1}
            step={1000}
            value={montant ?? undefined}
            onChange={valeur => setMontant(typeof valeur === 'number' ? valeur : null)}
            {...montantSaisiProps}
          />
        </div>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label htmlFor="reversement-date">{t('Date')}</label>
          <DatePicker
            id="reversement-date"
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            value={date}
            // Jamais dans le futur (contrat, §1).
            disabledDate={courant => courant.isAfter(dayjs(), 'day')}
            onChange={valeur => valeur && setDate(valeur)}
          />
        </div>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label htmlFor="reversement-mode">{t('Mode')}</label>
          <Select<PayoutMethod>
            id="reversement-mode"
            style={{ width: '100%' }}
            value={mode}
            onChange={valeur => {
              setMode(valeur);
              // Le compte choisi ne correspond plus forcément au nouveau mode.
              setTreasuryAccountId(null);
            }}
            options={(Object.keys(METHOD_LABELS) as PayoutMethod[]).map(cle => ({
              value: cle,
              label: METHOD_LABELS[cle]
            }))}
          />
        </div>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label htmlFor="reversement-compte">{t('Compte de trésorerie')}</label>
          <TreasuryAccountSelector
            id="reversement-compte"
            tenantId={tenantId}
            paymentMethod={mode}
            value={treasuryAccountId}
            onChange={setTreasuryAccountId}
          />
        </div>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label htmlFor="reversement-reference">{t('Référence')}</label>
          <Input id="reversement-reference" value={reference} onChange={event => setReference(event.target.value)} />
        </div>

        <div>
          <label htmlFor="reversement-notes">{t('Notes')}</label>
          <TextArea id="reversement-notes" rows={2} value={notes} onChange={event => setNotes(event.target.value)} />
        </div>
      </Modal>

      <Modal
        title={t('Annuler ce reversement ?')}
        open={Boolean(payoutAAnnuler)}
        onCancel={() => setPayoutAAnnuler(null)}
        onOk={annulerReversement}
        okText={t("Confirmer l'annulation")}
        okButtonProps={{ danger: true, disabled: !motifAnnulation.trim(), loading: annulationEnCours }}
        cancelText={t('Renoncer')}
        destroyOnHidden
      >
        <Text type="secondary">
          {t(
            'Une pièce d’annulation liée sera créée. Le reversement d’origine reste visible avec son numéro, mais son montant ne compte plus dans le solde dû.'
          )}
        </Text>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <label htmlFor="motif-annulation-reversement">{t("Motif de l'annulation")}</label>
          <TextArea
            id="motif-annulation-reversement"
            rows={3}
            value={motifAnnulation}
            onChange={event => setMotifAnnulation(event.target.value)}
            placeholder={t('Ex. Erreur sur le montant')}
          />
        </div>
      </Modal>
    </>
  );
};

export default CompteProprietaire;
