import React from 'react';
import { Button, Card, Col, Row, Space, Tag, Typography } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  getOwnerAccount,
  type OwnerMovement,
  type OwnerPayout,
  type PayoutMethod
} from '../../services/owner-portal-account-service';
import { DataCard, DataView, MoneyValue, SkeletonList, SkeletonStats, StateBlock } from '../../components/primitives';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

/**
 * « Mon compte » — le compte courant que l'agence tient pour ce propriétaire,
 * et les reversements qu'elle lui a faits (lot 3 de la gestion locative).
 *
 * Modelé sur `pages/finance/Releve.tsx` et son pendant portail
 * `pages/TenantPortal/Payments.tsx` (`MonReleve`) : `<DataView>` pour les deux
 * listes, tableau au-dessus de 992 px et cartes en dessous — le portail est
 * très consulté sur téléphone. Aucun identifiant de compte n'est demandé ni
 * transmis : `getOwnerAccount` résout seule le propriétaire depuis sa
 * session, comme `getMyStatement` côté locataire.
 *
 * Contrat : `scratchpad/lot3-contrat-api.md`, section 2. L'API n'existe pas
 * encore au moment où cet écran est écrit ; les tests le couvrent avec des
 * mocks du service.
 */
function dateCourte(iso: string): string {
  return dayjs(iso).format('DD/MM/YYYY');
}

const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  CASH: t('Espèces'),
  BANK_TRANSFER: t('Virement bancaire'),
  CHECK: t('Chèque'),
  MOBILE_MONEY: t('Mobile Money'),
  OTHER: t('Autre')
};

function methodLabel(method: PayoutMethod): string {
  return PAYOUT_METHOD_LABELS[method] ?? method;
}

/**
 * La phrase d'en-tête dépend du sens du solde (§ spec) : jamais un simple
 * nombre sans contexte, toujours l'une de ces trois phrases.
 */
function soldeLibelle(balance: number): string {
  if (balance > 0) return t("L'agence vous doit");
  if (balance < 0) return t("Vous devez à l'agence");
  return t('Votre compte est à jour');
}

/**
 * Montant signé d'un mouvement : `+` pour un crédit, `-` pour un débit — la
 * couleur (rouge au débit) vient déjà de `<MoneyValue signed>`.
 */
function MontantMouvement({ movement }: { movement: OwnerMovement }) {
  const montant = movement.credit > 0 ? movement.credit : -movement.debit;
  return (
    <>
      {montant > 0 ? '+' : ''}
      <MoneyValue value={montant} signed />
    </>
  );
}

/**
 * `undefined` et non `null` pour un reversement validé : `<DataCard>` ne
 * réserve un emplacement de statut que si on lui en passe un.
 */
function statutReversement(payout: OwnerPayout): React.ReactNode | undefined {
  return payout.status === 'VOIDED' ? <Tag color="error">{t('Annulé')}</Tag> : undefined;
}

export default function Account() {
  const {
    data: compte,
    isPending,
    isFetching,
    error,
    refetch
  } = useQuery({
    queryKey: ['owner-portal-account'],
    queryFn: () => getOwnerAccount()
  });

  if (isPending) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <SkeletonStats rows={1} />
        <SkeletonStats rows={5} />
        <SkeletonList rows={3} />
      </Space>
    );
  }

  if (error || !compte) {
    return (
      <StateBlock
        variant="error"
        description={t('Impossible de charger votre compte.')}
        actions={[{ label: t('Réessayer'), onClick: () => void refetch(), primary: true }]}
      />
    );
  }

  const payoutColumns: ColumnsType<OwnerPayout> = [
    { title: t('Date'), key: 'date', render: (_, p) => dateCourte(p.paidAt) },
    { title: t('Numéro'), dataIndex: 'number', key: 'number' },
    { title: t('Mode'), key: 'mode', render: (_, p) => methodLabel(p.method) },
    { title: t('Référence'), key: 'reference', render: (_, p) => p.reference ?? '—' },
    {
      title: t('Montant'),
      key: 'montant',
      align: 'end',
      render: (_, p) => <MoneyValue value={p.amount} />
    },
    { title: t('Statut'), key: 'statut', render: (_, p) => statutReversement(p) }
  ];

  const movementColumns: ColumnsType<OwnerMovement> = [
    { title: t('Date'), key: 'date', render: (_, m) => dateCourte(m.date) },
    { title: t('Libellé'), dataIndex: 'label', key: 'libelle' },
    { title: t('Bien'), key: 'bien', render: (_, m) => m.propertyTitle ?? m.leaseNumber ?? '—' },
    {
      title: t('Montant'),
      key: 'montant',
      align: 'end',
      render: (_, m) => <MontantMouvement movement={m} />
    },
    {
      title: t('Solde après'),
      key: 'solde',
      align: 'end',
      render: (_, m) => (
        <strong>
          <MoneyValue value={m.balanceAfter} />
        </strong>
      )
    }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Mon compte')}</Title>
          <Text type="secondary">{t("Compte courant tenu par l'agence pour vos biens.")}</Text>
        </div>
        <Button
          icon={<SyncOutlined />}
          onClick={() => void refetch()}
          loading={isFetching}
          aria-label={t('Actualiser')}
        >
          {t('Actualiser')}
        </Button>
      </div>

      {/* En-tête : la phrase, jamais un nombre nu. */}
      <Card>
        <Space direction="vertical" size={4}>
          <Title level={3} style={{ margin: 0 }}>
            {soldeLibelle(compte.balance)}
          </Title>
          {compte.balance !== 0 && (
            <Text style={{ fontSize: 'var(--font-size-h2)', fontWeight: 600 }}>
              <MoneyValue value={Math.abs(compte.balance)} />
            </Text>
          )}
        </Space>
      </Card>

      {/* Cinq indicateurs (§ spec) : ce qui compose le solde. */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Text type="secondary">{t('Loyers encaissés')}</Text>
            <div style={{ marginTop: 4 }}>
              <MoneyValue value={compte.totals.rentCollected} />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Text type="secondary">{t('Honoraires de gestion')}</Text>
            <div style={{ marginTop: 4 }}>
              <MoneyValue value={compte.totals.fees} />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Text type="secondary">{t('TVA sur honoraires')}</Text>
            <div style={{ marginTop: 4 }}>
              <MoneyValue value={compte.totals.vat} />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Text type="secondary">{t('Dépenses')}</Text>
            <div style={{ marginTop: 4 }}>
              <MoneyValue value={compte.totals.expenses} />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Text type="secondary">{t('Reversements reçus')}</Text>
            <div style={{ marginTop: 4 }}>
              <MoneyValue value={compte.totals.payouts} />
            </div>
          </Card>
        </Col>
      </Row>

      <Card title={t('Reversements reçus')}>
        <DataView<OwnerPayout>
          paginated={false}
          items={compte.payouts}
          total={compte.payouts.length}
          page={1}
          pageSize={compte.payouts.length || 20}
          onPageChange={() => {}}
          rowKey={p => p.id}
          aria-label={t('Reversements reçus')}
          emptyDescription={t("Aucun reversement n'a encore été effectué.")}
          columns={payoutColumns}
          renderCard={p => (
            <DataCard
              title={p.number}
              subtitle={`${dateCourte(p.paidAt)} · ${methodLabel(p.method)}`}
              highlight={<MoneyValue value={p.amount} />}
              status={statutReversement(p)}
              fields={p.reference ? [{ label: t('Référence'), value: p.reference }] : undefined}
            />
          )}
        />
      </Card>

      <Card title={t('Détail des mouvements')}>
        <DataView<OwnerMovement>
          paginated={false}
          items={compte.movements}
          total={compte.movements.length}
          page={1}
          pageSize={compte.movements.length || 20}
          onPageChange={() => {}}
          rowKey={m => m.id}
          aria-label={t('Détail des mouvements')}
          emptyDescription={t('Aucun mouvement enregistré sur ce compte.')}
          columns={movementColumns}
          renderCard={m => (
            <DataCard
              title={m.label}
              subtitle={m.propertyTitle ? `${dateCourte(m.date)} · ${m.propertyTitle}` : dateCourte(m.date)}
              highlight={<MontantMouvement movement={m} />}
              fields={[{ label: t('Solde après'), value: <MoneyValue value={m.balanceAfter} /> }]}
            />
          )}
        />
      </Card>

      <Text type="secondary">
        {t(
          "Ce compte retrace les loyers encaissés pour vous, les honoraires et dépenses déduits, et les sommes que l'agence vous a reversées."
        )}
      </Text>
    </Space>
  );
}
