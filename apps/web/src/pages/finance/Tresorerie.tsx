import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Tabs,
  Typography
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  createTaxRemittance,
  createTreasuryAccount,
  createTreasuryTransfer,
  getWithholdingSummary,
  listTaxRemittances,
  listTreasuryAccounts,
  listTreasuryTransfers,
  updateTreasuryAccount,
  voidTaxRemittance,
  voidTreasuryTransfer
} from '../../services/treasury-service';
import type {
  TaxRemittanceDto,
  TreasuryAccountDto,
  TreasuryAccountKind,
  TreasuryTransferDto
} from '../../services/treasury-service';
import { queryKey, entityKeyPrefix, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  MoneyValue,
  StatCard,
  DataView,
  DataCard,
  StatusTag
} from '../../components/primitives';
import { dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';
import { montantSaisiProps } from '../../utils/montant-saisi';

const { Title, Text } = Typography;
const { TextArea } = Input;

/**
 * Trésorerie — Lot 10, conformité SYSCOHADA (contrat commun `LOT10-CONTRAT.md`,
 * section « Trésorerie (agent B) »).
 *
 * Trois onglets : les comptes de trésorerie (caisses, banques, Mobile Money,
 * chèques et cartes à encaisser), les virements internes qui déplacent des
 * fonds d'un compte à l'autre — typiquement une remise de chèques en banque —
 * et la retenue à la source, dont on suit ici ce qui a été collecté sur les
 * loyers, ce qui a été reversé à la DGI, et ce qui reste dû.
 *
 * **Écrit contre le contrat, l'API n'existant pas encore.** `services/
 * treasury-service.ts` porte les types gelés ; les tests (`__tests__/finance/
 * tresorerie.test.tsx`) mockent ce service.
 */

type Onglet = 'comptes' | 'virements' | 'retenues';

const KIND_LABEL: Record<TreasuryAccountKind, string> = {
  CASH: t('Caisse'),
  BANK: t('Banque'),
  MOBILE_MONEY: t('Mobile Money'),
  CHECKS_TO_CASH: t('Chèques à encaisser'),
  CARDS_TO_CASH: t('Cartes à encaisser')
};

const OPTIONS_NATURE = (Object.keys(KIND_LABEL) as TreasuryAccountKind[]).map(kind => ({
  value: kind,
  label: KIND_LABEL[kind]
}));

function dateHeure(iso: string): string {
  return dayjs(iso).format(dateFormat('dateTime'));
}

function dateJour(iso: string): string {
  return dayjs(iso).format(dateFormat('short'));
}

interface FormulaireCompte {
  kind: TreasuryAccountKind;
  label: string;
  accountNumber: string;
  mmOperator?: string;
  bankName?: string;
  bankAccountRef?: string;
  isDefault?: boolean;
}

interface FormulaireEditionCompte {
  label: string;
  bankName?: string;
  bankAccountRef?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

interface FormulaireVirement {
  fromTreasuryAccountId: string;
  toTreasuryAccountId: string;
  amount: number;
  transferredAt: dayjs.Dayjs;
  reference?: string;
  notes?: string;
}

interface FormulaireVersement {
  amount: number;
  paidAt: dayjs.Dayjs;
  periodLabel: string;
  treasuryAccountId: string;
  reference?: string;
}

export const Tresorerie: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const queryClient = useQueryClient();

  const [onglet, setOnglet] = useState<Onglet>('comptes');

  // --- Comptes ---------------------------------------------------------------
  const [modalCompteOuvert, setModalCompteOuvert] = useState(false);
  const [compteEnEdition, setCompteEnEdition] = useState<TreasuryAccountDto | null>(null);
  const [natureChoisie, setNatureChoisie] = useState<TreasuryAccountKind | undefined>(undefined);
  const [enregistrementCompte, setEnregistrementCompte] = useState(false);
  const [formulaireCompte] = Form.useForm<FormulaireCompte>();
  const [formulaireEditionCompte] = Form.useForm<FormulaireEditionCompte>();

  // --- Virements internes ------------------------------------------------
  const [modalVirementOuvert, setModalVirementOuvert] = useState(false);
  const [enregistrementVirement, setEnregistrementVirement] = useState(false);
  const [formulaireVirement] = Form.useForm<FormulaireVirement>();
  const [virementAAnnuler, setVirementAAnnuler] = useState<TreasuryTransferDto | null>(null);
  const [motifAnnulationVirement, setMotifAnnulationVirement] = useState('');
  const [annulationVirementEnCours, setAnnulationVirementEnCours] = useState(false);

  // --- Retenue à la source -------------------------------------------------
  const [modalVersementOuvert, setModalVersementOuvert] = useState(false);
  const [enregistrementVersement, setEnregistrementVersement] = useState(false);
  const [formulaireVersement] = Form.useForm<FormulaireVersement>();
  const [versementAAnnuler, setVersementAAnnuler] = useState<TaxRemittanceDto | null>(null);
  const [motifAnnulationVersement, setMotifAnnulationVersement] = useState('');
  const [annulationVersementEnCours, setAnnulationVersementEnCours] = useState(false);

  const comptesQuery = useQuery({
    queryKey: queryKey('treasury-accounts', tenantId, {}),
    queryFn: () => listTreasuryAccounts(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const virementsQuery = useQuery({
    queryKey: queryKey('treasury-transfers', tenantId, {}),
    queryFn: () => listTreasuryTransfers(tenantId as string),
    enabled: Boolean(tenantId) && onglet === 'virements',
    staleTime: STALE_TIME.list
  });

  const retenueQuery = useQuery({
    queryKey: queryKey('treasury-withholding', tenantId, {}),
    queryFn: () => getWithholdingSummary(tenantId as string),
    enabled: Boolean(tenantId) && onglet === 'retenues',
    staleTime: STALE_TIME.list
  });

  const versementsQuery = useQuery({
    queryKey: queryKey('tax-remittances', tenantId, {}),
    queryFn: () => listTaxRemittances(tenantId as string),
    enabled: Boolean(tenantId) && onglet === 'retenues',
    staleTime: STALE_TIME.list
  });

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const comptes = comptesQuery.data ?? [];
  const comptesActifs = comptes.filter(c => c.isActive);

  // --- Comptes : création et modification ----------------------------------

  const ouvrirCreationCompte = () => {
    setNatureChoisie(undefined);
    formulaireCompte.resetFields();
    setModalCompteOuvert(true);
  };

  const fermerModalCompte = () => {
    setModalCompteOuvert(false);
    setNatureChoisie(undefined);
    formulaireCompte.resetFields();
  };

  const soumettreCompte = async () => {
    if (!tenantId) return;
    try {
      const valeurs = await formulaireCompte.validateFields();
      setEnregistrementCompte(true);
      await createTreasuryAccount(tenantId, {
        kind: valeurs.kind,
        label: valeurs.label,
        accountNumber: valeurs.accountNumber,
        mmOperator: valeurs.mmOperator || undefined,
        bankName: valeurs.bankName || undefined,
        bankAccountRef: valeurs.bankAccountRef || undefined,
        isDefault: valeurs.isDefault || undefined
      });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('treasury-accounts', tenantId) });
      message.success(t('Compte de trésorerie « {{label}} » créé.', { label: valeurs.label }));
      fermerModalCompte();
    } catch (err: any) {
      if (err?.errorFields) return; // Échec de validation du formulaire : déjà signalé par les champs.
      message.error(err?.response?.data?.message || t('La création du compte a échoué.'));
    } finally {
      setEnregistrementCompte(false);
    }
  };

  const ouvrirEditionCompte = (compte: TreasuryAccountDto) => {
    setCompteEnEdition(compte);
    formulaireEditionCompte.setFieldsValue({
      label: compte.label,
      bankName: compte.bankName ?? undefined,
      bankAccountRef: compte.bankAccountRef ?? undefined,
      isDefault: compte.isDefault,
      isActive: compte.isActive
    });
  };

  const fermerModalEditionCompte = () => {
    setCompteEnEdition(null);
    formulaireEditionCompte.resetFields();
  };

  const soumettreEditionCompte = async () => {
    if (!tenantId || !compteEnEdition) return;
    try {
      const valeurs = await formulaireEditionCompte.validateFields();
      setEnregistrementCompte(true);
      await updateTreasuryAccount(tenantId, compteEnEdition.id, {
        label: valeurs.label,
        bankName: valeurs.bankName || undefined,
        bankAccountRef: valeurs.bankAccountRef || undefined,
        isDefault: valeurs.isDefault,
        isActive: valeurs.isActive
      });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('treasury-accounts', tenantId) });
      message.success(t('Compte de trésorerie « {{label}} » modifié.', { label: valeurs.label }));
      fermerModalEditionCompte();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.message || t('La modification du compte a échoué.'));
    } finally {
      setEnregistrementCompte(false);
    }
  };

  const colonnesComptes: ColumnsType<TreasuryAccountDto> = [
    { title: t('Nature'), key: 'nature', render: (_, c) => KIND_LABEL[c.kind] },
    { title: t('Numéro'), key: 'numero', render: (_, c) => c.accountNumber },
    { title: t('Libellé'), key: 'libelle', render: (_, c) => c.label },
    {
      title: t('Détail'),
      key: 'detail',
      render: (_, c) =>
        c.kind === 'MOBILE_MONEY'
          ? c.mmOperator || '—'
          : c.kind === 'BANK'
            ? [c.bankName, c.bankAccountRef].filter(Boolean).join(' · ') || '—'
            : '—'
    },
    { title: t('Défaut'), key: 'defaut', render: (_, c) => (c.isDefault ? t('Oui') : t('Non')) },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, c) => (
        <StatusTag status={c.isActive ? 'ACTIVE' : 'INACTIVE'} tone={c.isActive ? 'success' : 'neutral'} />
      )
    },
    { title: t('Solde'), key: 'solde', align: 'end', render: (_, c) => <MoneyValue value={c.balance} /> },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, c) => (
        <Button type="link" onClick={() => ouvrirEditionCompte(c)}>
          {t('Modifier')}
        </Button>
      )
    }
  ];

  const ongletComptes = (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)'
        }}
      >
        <Text type="secondary">
          {t(
            'Numérotation SYSCOHADA : caisses 5711x, banques 5211x, Mobile Money 552x (5521 Wave, 5522 Orange Money, 5523 MTN), chèques à encaisser 513, cartes 515.'
          )}
        </Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={ouvrirCreationCompte}>
          {t('Nouveau compte')}
        </Button>
      </div>

      <DataView<TreasuryAccountDto>
        paginated={false}
        items={comptes}
        total={comptes.length}
        page={1}
        pageSize={Math.max(comptes.length, 1)}
        onPageChange={() => undefined}
        loading={comptesQuery.isPending}
        isReloading={comptesQuery.isFetching && !comptesQuery.isPending}
        error={comptesQuery.error ? t('Impossible de charger les comptes de trésorerie.') : null}
        onRetry={() => comptesQuery.refetch()}
        emptyDescription={t('Aucun compte de trésorerie.')}
        emptyAction={{ label: t('Nouveau compte'), onClick: ouvrirCreationCompte }}
        columns={colonnesComptes}
        rowKey={c => c.id}
        aria-label={t('Comptes de trésorerie')}
        renderCard={c => (
          <DataCard
            title={c.label}
            aria-label={c.label}
            subtitle={`${KIND_LABEL[c.kind]} · ${c.accountNumber}`}
            status={<StatusTag status={c.isActive ? 'ACTIVE' : 'INACTIVE'} tone={c.isActive ? 'success' : 'neutral'} />}
            highlight={<MoneyValue value={c.balance} />}
            fields={[{ label: t('Défaut'), value: c.isDefault ? t('Oui') : t('Non') }]}
            primaryAction={{ label: t('Modifier'), onClick: () => ouvrirEditionCompte(c) }}
          />
        )}
      />
    </>
  );

  // --- Virements internes --------------------------------------------------

  const ouvrirCreationVirement = () => {
    formulaireVirement.resetFields();
    setModalVirementOuvert(true);
  };

  const fermerModalVirement = () => {
    setModalVirementOuvert(false);
    formulaireVirement.resetFields();
  };

  const soumettreVirement = async () => {
    if (!tenantId) return;
    try {
      const valeurs = await formulaireVirement.validateFields();
      if (valeurs.fromTreasuryAccountId === valeurs.toTreasuryAccountId) {
        message.error(t('Les comptes de départ et d’arrivée doivent être différents.'));
        return;
      }
      setEnregistrementVirement(true);
      await createTreasuryTransfer(tenantId, {
        fromTreasuryAccountId: valeurs.fromTreasuryAccountId,
        toTreasuryAccountId: valeurs.toTreasuryAccountId,
        amount: valeurs.amount,
        transferredAt: valeurs.transferredAt.format('YYYY-MM-DD'),
        reference: valeurs.reference || undefined,
        notes: valeurs.notes || undefined
      });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('treasury-transfers', tenantId) });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('treasury-accounts', tenantId) });
      message.success(t('Virement enregistré.'));
      fermerModalVirement();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.message || t('L’enregistrement du virement a échoué.'));
    } finally {
      setEnregistrementVirement(false);
    }
  };

  const annulerVirement = async () => {
    if (!tenantId || !virementAAnnuler) return;
    if (motifAnnulationVirement.trim().length < 3) {
      message.error(t("Indiquez le motif de l'annulation."));
      return;
    }
    setAnnulationVirementEnCours(true);
    try {
      await voidTreasuryTransfer(tenantId, virementAAnnuler.id, { reason: motifAnnulationVirement.trim() });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('treasury-transfers', tenantId) });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('treasury-accounts', tenantId) });
      message.success(t('Virement {{number}} annulé.', { number: virementAAnnuler.number }));
      setVirementAAnnuler(null);
      setMotifAnnulationVirement('');
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'annulation du virement a échoué."));
    } finally {
      setAnnulationVirementEnCours(false);
    }
  };

  const virements = virementsQuery.data ?? [];

  const colonnesVirements: ColumnsType<TreasuryTransferDto> = [
    { title: t('Numéro'), key: 'numero', render: (_, v) => v.number },
    { title: t('De'), key: 'de', render: (_, v) => v.fromLabel },
    { title: t('Vers'), key: 'vers', render: (_, v) => v.toLabel },
    { title: t('Montant'), key: 'montant', align: 'end', render: (_, v) => <MoneyValue value={v.amount} /> },
    { title: t('Date'), key: 'date', render: (_, v) => dateJour(v.transferredAt) },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, v) => <StatusTag status={v.status} />
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, v) =>
        v.status === 'VALIDATED' ? (
          <Button type="link" danger onClick={() => setVirementAAnnuler(v)}>
            {t('Annuler')}
          </Button>
        ) : null
    }
  ];

  const ongletVirements = (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)'
        }}
      >
        <Text type="secondary">
          {t(
            'Un virement interne déplace des fonds d’un compte de trésorerie à un autre sans toucher le résultat — typiquement une remise de chèques en banque.'
          )}
        </Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={ouvrirCreationVirement}>
          {t('Nouveau virement')}
        </Button>
      </div>

      <DataView<TreasuryTransferDto>
        paginated={false}
        items={virements}
        total={virements.length}
        page={1}
        pageSize={Math.max(virements.length, 1)}
        onPageChange={() => undefined}
        loading={virementsQuery.isPending}
        isReloading={virementsQuery.isFetching && !virementsQuery.isPending}
        error={virementsQuery.error ? t('Impossible de charger les virements internes.') : null}
        onRetry={() => virementsQuery.refetch()}
        emptyDescription={t('Aucun virement interne.')}
        emptyAction={{ label: t('Nouveau virement'), onClick: ouvrirCreationVirement }}
        columns={colonnesVirements}
        rowKey={v => v.id}
        aria-label={t('Virements internes')}
        renderCard={v => (
          <DataCard
            title={v.number}
            aria-label={v.number}
            subtitle={`${v.fromLabel} → ${v.toLabel}`}
            status={<StatusTag status={v.status} />}
            highlight={<MoneyValue value={v.amount} />}
            fields={[{ label: t('Date'), value: dateJour(v.transferredAt) }]}
            primaryAction={
              v.status === 'VALIDATED' ? { label: t('Annuler'), onClick: () => setVirementAAnnuler(v) } : undefined
            }
          />
        )}
      />
    </>
  );

  // --- Retenue à la source --------------------------------------------------

  const retenue = retenueQuery.data ?? null;
  const versements = versementsQuery.data ?? [];

  const ouvrirCreationVersement = () => {
    formulaireVersement.resetFields();
    setModalVersementOuvert(true);
  };

  const fermerModalVersement = () => {
    setModalVersementOuvert(false);
    formulaireVersement.resetFields();
  };

  const soumettreVersement = async () => {
    if (!tenantId) return;
    try {
      const valeurs = await formulaireVersement.validateFields();
      setEnregistrementVersement(true);
      await createTaxRemittance(tenantId, {
        amount: valeurs.amount,
        paidAt: valeurs.paidAt.format('YYYY-MM-DD'),
        periodLabel: valeurs.periodLabel,
        treasuryAccountId: valeurs.treasuryAccountId,
        reference: valeurs.reference || undefined
      });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('tax-remittances', tenantId) });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('treasury-withholding', tenantId) });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('treasury-accounts', tenantId) });
      message.success(t('Versement à la DGI enregistré.'));
      fermerModalVersement();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.message || t('L’enregistrement du versement a échoué.'));
    } finally {
      setEnregistrementVersement(false);
    }
  };

  const annulerVersement = async () => {
    if (!tenantId || !versementAAnnuler) return;
    if (motifAnnulationVersement.trim().length < 3) {
      message.error(t("Indiquez le motif de l'annulation."));
      return;
    }
    setAnnulationVersementEnCours(true);
    try {
      await voidTaxRemittance(tenantId, versementAAnnuler.id, { reason: motifAnnulationVersement.trim() });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('tax-remittances', tenantId) });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('treasury-withholding', tenantId) });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('treasury-accounts', tenantId) });
      message.success(t('Versement {{number}} annulé.', { number: versementAAnnuler.number }));
      setVersementAAnnuler(null);
      setMotifAnnulationVersement('');
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'annulation du versement a échoué."));
    } finally {
      setAnnulationVersementEnCours(false);
    }
  };

  const colonnesVersements: ColumnsType<TaxRemittanceDto> = [
    { title: t('Numéro'), key: 'numero', render: (_, v) => v.number },
    { title: t('Période'), key: 'periode', render: (_, v) => v.periodLabel },
    { title: t('Montant'), key: 'montant', align: 'end', render: (_, v) => <MoneyValue value={v.amount} /> },
    { title: t('Date'), key: 'date', render: (_, v) => dateJour(v.paidAt) },
    { title: t('Compte'), key: 'compte', render: (_, v) => v.treasuryLabel },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, v) => <StatusTag status={v.status} />
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, v) =>
        v.status === 'VALIDATED' ? (
          <Button type="link" danger onClick={() => setVersementAAnnuler(v)}>
            {t('Annuler')}
          </Button>
        ) : null
    }
  ];

  const ongletRetenues = (
    <>
      {retenueQuery.error ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger la retenue à la source.')}
          actions={[{ label: t('Réessayer'), onClick: () => retenueQuery.refetch(), primary: true }]}
        />
      ) : retenueQuery.isPending ? (
        <StateBlock variant="loading" />
      ) : (
        <>
          <Space size="middle" wrap style={{ width: '100%', marginBottom: 'var(--space-4)' }}>
            <StatCard label={t('Collecté')} value={<MoneyValue value={retenue?.collected ?? 0} />} />
            <StatCard
              label={t('Reversé à la DGI')}
              value={<MoneyValue value={retenue?.remitted ?? 0} />}
              tone="positive"
            />
            <StatCard
              label={t('Dû')}
              value={<MoneyValue value={retenue?.due ?? 0} />}
              tone={retenue?.due ? 'danger' : 'neutral'}
            />
          </Space>

          {retenue && !retenue.enabled && (
            <Card style={{ marginBottom: 'var(--space-4)' }}>
              <Text type="secondary">
                {t(
                  "La retenue à la source est désactivée dans les paramètres financiers de l'agence. Aucun nouveau versement ne peut être enregistré tant qu'elle n'est pas réactivée."
                )}
              </Text>
            </Card>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)'
            }}
          >
            <Title level={5} style={{ margin: 0 }}>
              {t('Versements à la DGI')}
            </Title>
            {retenue?.enabled && (
              <Button type="primary" icon={<PlusOutlined />} onClick={ouvrirCreationVersement}>
                {t('Nouveau versement')}
              </Button>
            )}
          </div>

          <DataView<TaxRemittanceDto>
            paginated={false}
            items={versements}
            total={versements.length}
            page={1}
            pageSize={Math.max(versements.length, 1)}
            onPageChange={() => undefined}
            loading={versementsQuery.isPending}
            isReloading={versementsQuery.isFetching && !versementsQuery.isPending}
            error={versementsQuery.error ? t('Impossible de charger les versements à la DGI.') : null}
            onRetry={() => versementsQuery.refetch()}
            emptyDescription={t('Aucun versement à la DGI.')}
            emptyAction={
              retenue?.enabled ? { label: t('Nouveau versement'), onClick: ouvrirCreationVersement } : undefined
            }
            columns={colonnesVersements}
            rowKey={v => v.id}
            aria-label={t('Versements à la DGI')}
            renderCard={v => (
              <DataCard
                title={v.number}
                aria-label={v.number}
                subtitle={v.periodLabel}
                status={<StatusTag status={v.status} />}
                highlight={<MoneyValue value={v.amount} />}
                fields={[{ label: t('Date'), value: dateJour(v.paidAt) }]}
                primaryAction={
                  v.status === 'VALIDATED' ? { label: t('Annuler'), onClick: () => setVersementAAnnuler(v) } : undefined
                }
              />
            )}
          />
        </>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title={t('Trésorerie')}
        breadcrumbs={[{ label: 'Finance', to: `/tenant/${tenantId}/finance/comptabilite` }, { label: t('Trésorerie') }]}
      />

      <Tabs
        activeKey={onglet}
        onChange={valeur => setOnglet(valeur as Onglet)}
        items={[
          { key: 'comptes', label: t('Comptes'), children: ongletComptes },
          { key: 'virements', label: t('Virements internes'), children: ongletVirements },
          { key: 'retenues', label: t('Retenues à la source'), children: ongletRetenues }
        ]}
      />

      {/* Création d'un compte de trésorerie. */}
      <Modal
        title={t('Nouveau compte de trésorerie')}
        open={modalCompteOuvert}
        onCancel={fermerModalCompte}
        onOk={soumettreCompte}
        okText={t('Créer')}
        cancelText={t('Annuler')}
        confirmLoading={enregistrementCompte}
        destroyOnHidden
      >
        <Form form={formulaireCompte} layout="vertical" requiredMark={false}>
          <Form.Item
            name="kind"
            label={t('Nature')}
            rules={[{ required: true, message: t('La nature est obligatoire.') }]}
          >
            <Select
              options={OPTIONS_NATURE}
              placeholder={t('Choisir…')}
              onChange={valeur => setNatureChoisie(valeur as TreasuryAccountKind)}
            />
          </Form.Item>
          <Form.Item
            name="label"
            label={t('Libellé')}
            rules={[{ required: true, message: t('Le libellé est obligatoire.') }]}
          >
            <Input placeholder={t('Ex. Caisse agence Cocody')} />
          </Form.Item>
          <Form.Item
            name="accountNumber"
            label={t('Numéro de compte')}
            extra={t(
              'Numérotation SYSCOHADA : caisses 5711x, banques 5211x, Mobile Money 552x, chèques à encaisser 513, cartes 515.'
            )}
            rules={[{ required: true, message: t('Le numéro de compte est obligatoire.') }]}
          >
            <Input placeholder="5711" />
          </Form.Item>
          {natureChoisie === 'MOBILE_MONEY' && (
            <Form.Item
              name="mmOperator"
              label={t('Opérateur Mobile Money')}
              rules={[{ required: true, message: t("L'opérateur est obligatoire.") }]}
            >
              <Input placeholder={t('Ex. Wave, Orange Money, MTN')} />
            </Form.Item>
          )}
          {natureChoisie === 'BANK' && (
            <>
              <Form.Item name="bankName" label={t('Banque')}>
                <Input placeholder={t('Ex. Ecobank')} />
              </Form.Item>
              <Form.Item name="bankAccountRef" label={t('Référence du compte bancaire')}>
                <Input placeholder={t('IBAN, RIB…')} />
              </Form.Item>
            </>
          )}
          <Form.Item name="isDefault" label={t('Compte par défaut')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modification d'un compte de trésorerie. */}
      <Modal
        title={compteEnEdition ? t('Modifier {{label}}', { label: compteEnEdition.label }) : t('Modifier le compte')}
        open={Boolean(compteEnEdition)}
        onCancel={fermerModalEditionCompte}
        onOk={soumettreEditionCompte}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        confirmLoading={enregistrementCompte}
        destroyOnHidden
      >
        {compteEnEdition && (
          <Form form={formulaireEditionCompte} layout="vertical" requiredMark={false}>
            <Text type="secondary">
              {t('{{nature}} · Compte {{numero}} (non modifiables)', {
                nature: KIND_LABEL[compteEnEdition.kind],
                numero: compteEnEdition.accountNumber
              })}
            </Text>
            <Form.Item
              name="label"
              label={t('Libellé')}
              rules={[{ required: true, message: t('Le libellé est obligatoire.') }]}
              style={{ marginTop: 'var(--space-3)' }}
            >
              <Input />
            </Form.Item>
            {compteEnEdition.kind === 'BANK' && (
              <>
                <Form.Item name="bankName" label={t('Banque')}>
                  <Input />
                </Form.Item>
                <Form.Item name="bankAccountRef" label={t('Référence du compte bancaire')}>
                  <Input />
                </Form.Item>
              </>
            )}
            <Form.Item name="isDefault" label={t('Compte par défaut')} valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="isActive" label={t('Compte actif')} valuePropName="checked">
              <Switch />
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* Nouveau virement interne. */}
      <Modal
        title={t('Nouveau virement interne')}
        open={modalVirementOuvert}
        onCancel={fermerModalVirement}
        onOk={soumettreVirement}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        confirmLoading={enregistrementVirement}
        destroyOnHidden
      >
        <Form form={formulaireVirement} layout="vertical" requiredMark={false}>
          <Form.Item
            name="fromTreasuryAccountId"
            label={t('Compte de départ')}
            rules={[{ required: true, message: t('Le compte de départ est obligatoire.') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t('Choisir…')}
              options={comptesActifs.map(c => ({ value: c.id, label: `${c.label} (${c.accountNumber})` }))}
            />
          </Form.Item>
          <Form.Item
            name="toTreasuryAccountId"
            label={t("Compte d'arrivée")}
            rules={[{ required: true, message: t("Le compte d'arrivée est obligatoire.") }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t('Choisir…')}
              options={comptesActifs.map(c => ({ value: c.id, label: `${c.label} (${c.accountNumber})` }))}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label={t('Montant (FCFA)')}
            rules={[{ required: true, message: t('Le montant est obligatoire.') }]}
          >
            <InputNumber style={{ width: '100%' }} min={1} step={1000} {...montantSaisiProps} />
          </Form.Item>
          <Form.Item
            name="transferredAt"
            label={t('Date')}
            rules={[{ required: true, message: t('La date est obligatoire.') }]}
            initialValue={dayjs()}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="reference" label={t('Référence (facultatif)')}>
            <Input />
          </Form.Item>
          <Form.Item name="notes" label={t('Notes (facultatif)')}>
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Annulation d'un virement interne. */}
      <Modal
        title={t('Annuler le virement')}
        open={Boolean(virementAAnnuler)}
        onCancel={() => {
          setVirementAAnnuler(null);
          setMotifAnnulationVirement('');
        }}
        onOk={annulerVirement}
        okText={t('Annuler le virement')}
        okButtonProps={{ danger: true }}
        cancelText={t('Retour')}
        confirmLoading={annulationVirementEnCours}
        destroyOnHidden
      >
        {virementAAnnuler && (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Text>
              {t('Virement {{number}} : {{from}} → {{to}},', {
                number: virementAAnnuler.number,
                from: virementAAnnuler.fromLabel,
                to: virementAAnnuler.toLabel
              })}{' '}
              <MoneyValue value={virementAAnnuler.amount} />
            </Text>
            <div>
              <label htmlFor="virement-motif-annulation">{t("Motif de l'annulation")}</label>
              <TextArea
                id="virement-motif-annulation"
                rows={3}
                value={motifAnnulationVirement}
                onChange={event => setMotifAnnulationVirement(event.target.value)}
              />
            </div>
          </Space>
        )}
      </Modal>

      {/* Nouveau versement à la DGI. */}
      <Modal
        title={t('Nouveau versement à la DGI')}
        open={modalVersementOuvert}
        onCancel={fermerModalVersement}
        onOk={soumettreVersement}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        confirmLoading={enregistrementVersement}
        destroyOnHidden
      >
        <Form form={formulaireVersement} layout="vertical" requiredMark={false}>
          <Form.Item
            name="periodLabel"
            label={t('Période')}
            rules={[{ required: true, message: t('La période est obligatoire.') }]}
          >
            <Input placeholder={t('Ex. Septembre 2026')} />
          </Form.Item>
          <Form.Item
            name="amount"
            label={t('Montant (FCFA)')}
            rules={[{ required: true, message: t('Le montant est obligatoire.') }]}
          >
            <InputNumber style={{ width: '100%' }} min={1} step={1000} {...montantSaisiProps} />
          </Form.Item>
          <Form.Item
            name="paidAt"
            label={t('Date')}
            rules={[{ required: true, message: t('La date est obligatoire.') }]}
            initialValue={dayjs()}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item
            name="treasuryAccountId"
            label={t('Compte de trésorerie')}
            rules={[{ required: true, message: t('Le compte de trésorerie est obligatoire.') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t('Choisir…')}
              options={comptesActifs.map(c => ({ value: c.id, label: `${c.label} (${c.accountNumber})` }))}
            />
          </Form.Item>
          <Form.Item name="reference" label={t('Référence (facultatif)')}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* Annulation d'un versement à la DGI. */}
      <Modal
        title={t('Annuler le versement')}
        open={Boolean(versementAAnnuler)}
        onCancel={() => {
          setVersementAAnnuler(null);
          setMotifAnnulationVersement('');
        }}
        onOk={annulerVersement}
        okText={t('Annuler le versement')}
        okButtonProps={{ danger: true }}
        cancelText={t('Retour')}
        confirmLoading={annulationVersementEnCours}
        destroyOnHidden
      >
        {versementAAnnuler && (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Text>
              {t('Versement {{number}}, période {{periode}} :', {
                number: versementAAnnuler.number,
                periode: versementAAnnuler.periodLabel
              })}{' '}
              <MoneyValue value={versementAAnnuler.amount} />
            </Text>
            <div>
              <label htmlFor="versement-motif-annulation">{t("Motif de l'annulation")}</label>
              <TextArea
                id="versement-motif-annulation"
                rows={3}
                value={motifAnnulationVersement}
                onChange={event => setMotifAnnulationVersement(event.target.value)}
              />
            </div>
          </Space>
        )}
      </Modal>
    </>
  );
};

export default Tresorerie;
