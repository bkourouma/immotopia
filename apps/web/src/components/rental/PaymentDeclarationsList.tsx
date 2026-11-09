import React, { useState, useEffect, useRef } from 'react';
import { App, Button, Tag, Space, Alert, Modal, Image } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, CloseCircleOutlined, FileImageOutlined, PlusOutlined } from '@ant-design/icons';
import {
  listPaymentDeclarations,
  RentalPaymentDeclaration,
  PaymentDeclarationStatus,
  RentalPaymentMethod,
  fetchPaymentDeclarationProof
} from '../../services/rental-service';
import { saveBlob } from '../../utils/save-blob';
import { collectAllPages } from '../../utils/table-export/collect';
import { Table } from '../primitives';
import {
  nomDuBien,
  nomDeLaPersonne,
  ABSENT,
  libellePeriodeEcheance,
  formatMontantLocatif
} from '../../lib/rental-labels';
import { useListSearch } from '../../hooks/useListSearch';
import type { RentalPaymentDeclarationDto } from '../../types/rental-declared-payment';
import { getRentalDeclaration } from '../../services/rental-declared-payment-service';
import { DeclarationDrawer } from './declared-payment/DeclarationDrawer';
import { ApproveModal } from './declared-payment/ApproveModal';
import { RejectModal } from './declared-payment/RejectModal';
import { DeclareForThirdPartyModal } from './declared-payment/DeclareForThirdPartyModal';
import { formatPhone, operatorLabel } from './declared-payment/helpers';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';

/** Ligne legacy (snake_case) + clé additive `view` du nouveau contrat (spec 049). */
type DeclarationRow = RentalPaymentDeclaration & { view?: RentalPaymentDeclarationDto };

/**
 * L'API traite `status` absent comme PENDING : « Tous les statuts » doit envoyer `ALL`.
 * (Cast local : le type legacy ne connaît pas `ALL`.)
 */
const statusAll = (status: unknown): { status?: PaymentDeclarationStatus } =>
  status ? {} : { status: 'ALL' as unknown as PaymentDeclarationStatus };

/** Libellés vivants (lus à chaque rendu : ils suivent la langue). */
const METHOD_LABELS = (): Record<RentalPaymentMethod, string> => ({
  CASH: t('Espèces'),
  BANK_TRANSFER: t('Virement bancaire'),
  CHECK: t('Chèque'),
  MOBILE_MONEY: t('Mobile Money'),
  DIRECT_DEBIT: t('Prélèvement bancaire'),
  CARD: t('Carte bancaire'),
  OTHER: t('Autre')
});

interface PaymentDeclarationsListProps {
  tenantId: string;
  leaseId?: string;
  canReview?: boolean;
  /** Droit de déclarer pour un tiers (RENTAL_PAYMENTS_CREATE). */
  canCreate?: boolean;
  onApproveSuccess?: () => void;
  onRejectSuccess?: () => void;
  /** Après la création d'une déclaration pour un tiers. */
  onCreated?: () => void;
}

export const PaymentDeclarationsList: React.FC<PaymentDeclarationsListProps> = ({
  tenantId,
  leaseId,
  canReview = true,
  canCreate = false,
  onApproveSuccess,
  onRejectSuccess,
  onCreated
}) => {
  const { message } = App.useApp();

  const [declarations, setDeclarations] = useState<DeclarationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Recherche multicritères dans l'URL, préfixe `decl` : la page Paiements porte aussi sa propre barre.
  const search = useListSearch({
    paramPrefix: 'decl',
    ariaLabel: t('Rechercher dans les déclarations'),
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Référence, n° de bail, bien, déclarant…')
      },
      {
        key: 'status',
        type: 'select',
        label: t('Statut'),
        placeholder: t('Tous les statuts'),
        primary: true,
        options: [
          { value: PaymentDeclarationStatus.PENDING, label: t('En attente') },
          { value: PaymentDeclarationStatus.APPROVED, label: t('Approuvées') },
          { value: PaymentDeclarationStatus.REJECTED, label: t('Rejetées') },
          { value: PaymentDeclarationStatus.CANCELED, label: t('Annulées') }
        ]
      },
      {
        key: 'periode',
        type: 'dateRange',
        label: t('Période'),
        primary: true,
        api: ['startDate', 'endDate']
      },
      {
        key: 'method',
        type: 'select',
        label: t('Méthode'),
        placeholder: t('Toutes les méthodes'),
        options: (Object.keys(METHOD_LABELS()) as RentalPaymentMethod[]).map(value => ({
          value,
          label: METHOD_LABELS()[value]
        }))
      }
    ]
  });
  const [total, setTotal] = useState(0);
  const requestId = useRef(0);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<RentalPaymentDeclarationDto | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RentalPaymentDeclarationDto | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [proofImageVisible, setProofImageVisible] = useState(false);
  const [proofImageUrl, setProofImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (tenantId) {
      loadDeclarations();
    }
  }, [tenantId, search.apiParams, leaseId]);

  const loadDeclarations = async () => {
    if (!tenantId) return;
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const response = await listPaymentDeclarations(tenantId, {
        ...search.apiParams,
        ...statusAll(search.apiParams.status),
        ...(leaseId ? { leaseId } : {})
      });
      // Réponse d'une recherche déjà remplacée : ignorée.
      if (current !== requestId.current) return;
      if (response.success) {
        setDeclarations(response.data);
        setTotal(response.pagination?.total ?? 0);
      } else {
        setError(t('Erreur lors du chargement des déclarations'));
      }
    } catch (err: any) {
      if (current !== requestId.current) return;
      setError(err.response?.data?.message || t('Erreur lors du chargement des déclarations'));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  };

  // La vue du nouveau contrat est portée par la ligne ; à défaut (serveur plus ancien), on la lit.
  const resolveView = async (row: DeclarationRow): Promise<RentalPaymentDeclarationDto | null> => {
    if (row.view) return row.view;
    try {
      return await getRentalDeclaration(tenantId, row.id);
    } catch {
      message.error(t('Impossible de charger la déclaration'));
      return null;
    }
  };

  const handleApprove = async (row: DeclarationRow) => {
    const view = await resolveView(row);
    if (view) setApproveTarget(view);
  };

  const handleReject = async (row: DeclarationRow) => {
    const view = await resolveView(row);
    if (view) setRejectTarget(view);
  };

  // 409 « déjà traitée » : tout se ferme, la liste et le compteur se rechargent.
  const afterStale = async () => {
    setApproveTarget(null);
    setRejectTarget(null);
    setDrawerId(null);
    await loadDeclarations();
    onRejectSuccess?.();
  };

  const afterApproved = async () => {
    message.success(t('Déclaration approuvée avec succès'));
    setApproveTarget(null);
    setDrawerId(null);
    await loadDeclarations();
    onApproveSuccess?.();
  };

  const afterRejected = async () => {
    message.success(t('Déclaration rejetée'));
    setRejectTarget(null);
    setDrawerId(null);
    await loadDeclarations();
    onRejectSuccess?.();
  };

  const afterCreated = async () => {
    message.success(t('Déclaration enregistrée'));
    setCreateOpen(false);
    await loadDeclarations();
    onCreated?.();
  };

  // La preuve n'est plus lue en statique (`/uploads/portal/payments` répond
  // 404) : elle arrive en blob par la route authentifiée. Une image s'affiche
  // par une URL `blob:`, libérée quand elle change ou au démontage ; un autre
  // format (PDF) se télécharge.
  useEffect(() => {
    return () => {
      if (proofImageUrl) URL.revokeObjectURL(proofImageUrl);
    };
  }, [proofImageUrl]);

  const handleViewProof = async (declaration: DeclarationRow) => {
    if (!tenantId) return;
    try {
      const { blob, filename } = await fetchPaymentDeclarationProof(tenantId, declaration.id);
      if (blob.type.startsWith('image/')) {
        setProofImageUrl(URL.createObjectURL(blob));
        setProofImageVisible(true);
      } else {
        saveBlob(blob, filename);
      }
    } catch {
      message.error(t('Téléchargement impossible.'));
    }
  };

  const getStatusTag = (status: PaymentDeclarationStatus) => {
    const statusMap: Record<PaymentDeclarationStatus, { label: string; color: string }> = {
      PENDING: { label: t('En attente'), color: 'orange' },
      APPROVED: { label: t('Approuvée'), color: 'green' },
      REJECTED: { label: t('Rejetée'), color: 'red' },
      CANCELED: { label: t('Annulée'), color: 'default' }
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const getMethodLabel = (method: RentalPaymentMethod) => METHOD_LABELS()[method] || method;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(activeLocale(), {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Montant exact (BUG-2026-11-04-055) : deux décimales quand il y en a, jamais arrondi
  // à l'entier ; « FCFA » par l'utilitaire commun.
  const formatCurrency = (amount: number, currency: string = 'FCFA') => formatMontantLocatif(amount, currency);

  const columns: ColumnsType<DeclarationRow> = [
    {
      title: t('Date de déclaration'),
      key: 'created_at',
      // L'écran écrit la date en toutes lettres ; l'export confie la date au
      // module d'export, qui l'écrit comme les autres exports (04/11/2026) et
      // en fait une vraie date dans Excel (BUG-2026-11-04-062).
      exportValue: record => new Date(record.created_at),
      render: (_, record) => formatDate(record.created_at),
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    },
    {
      title: t('Date de paiement'),
      key: 'payment_date',
      exportValue: record => new Date(record.payment_date),
      render: (_, record) => formatDate(record.payment_date)
    },
    {
      title: t('Bail'),
      key: 'lease',
      width: 250,
      exportValue: record => `${record.lease?.lease_number || ABSENT} — ${nomDuBien(record.lease?.property)}`,
      render: (_, record) => (
        <>
          <div style={{ fontWeight: 600 }}>{record.lease?.lease_number || ABSENT}</div>
          {/* Le bien sous son numéro, comme sur les trois autres écrans du
              module : une déclaration doit se rattacher à un bail nommé, pas à
              une référence seule. */}
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {nomDuBien(record.lease?.property)}
          </div>
        </>
      )
    },
    {
      title: t('Locataire'),
      key: 'declarer',
      width: 170,
      render: (_, record) => nomDeLaPersonne(record.declarer?.user)
    },
    {
      title: t('Échéance'),
      key: 'installment',
      // Une échéance absente s'affiche « - » à l'écran mais s'exporte VIDE : le
      // tiret serait écrit « '- » par la neutralisation des formules
      // (BUG-2026-11-04-062).
      exportValue: record =>
        record.installment
          ? libellePeriodeEcheance(record.installment.period_month, record.installment.period_year)
          : null,
      render: (_, record) => {
        if (record.installment) {
          return libellePeriodeEcheance(record.installment.period_month, record.installment.period_year);
        }
        return '-';
      }
    },
    {
      title: t('Montant'),
      key: 'amount',
      exportValue: record => Number(record.amount),
      render: (_, record) => formatCurrency(Number(record.amount)),
      sorter: (a, b) => Number(a.amount) - Number(b.amount)
    },
    {
      title: t('Méthode'),
      key: 'payment_method',
      render: (_, record) => getMethodLabel(record.payment_method)
    },
    {
      title: t('Opérateur'),
      key: 'operator',
      exportValue: record => (record.view?.operator ? operatorLabel(record.view.operator) : null),
      render: (_, record) => (record.view?.operator ? operatorLabel(record.view.operator) : '-')
    },
    {
      title: t('N° de réception'),
      key: 'receiving_number',
      exportValue: record => record.view?.receivingNumber?.phone ?? null,
      render: (_, record) => (record.view?.receivingNumber ? formatPhone(record.view.receivingNumber.phone) : '-')
    },
    {
      title: t('Référence'),
      key: 'reference',
      // Vide à l'export quand il n'y a pas de référence (voir « Échéance »).
      exportValue: record => record.reference || null,
      render: (_, record) => record.reference || '-'
    },
    {
      title: t('Statut'),
      key: 'status',
      render: (_, record) => (
        <Space size={4} wrap>
          {getStatusTag(record.status)}
          {record.view?.duplicateSuspected && <Tag color="orange">{t('Doublon probable')}</Tag>}
          {!!record.view?.aiEditedFields?.length && <Tag color="gold">{t('Modifié après lecture IA')}</Tag>}
          {record.view?.overdue && <Tag color="red">{t('En retard')}</Tag>}
        </Space>
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      width: 260,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => setDrawerId(record.view?.id ?? record.id)}>
            {t('Détail')}
          </Button>
          {record.proof_file_url && (
            <Button
              type="text"
              icon={<FileImageOutlined />}
              onClick={() => handleViewProof(record)}
              aria-label={t('Voir la preuve de paiement')}
              title={t('Voir la preuve de paiement')}
            />
          )}
          {canReview && record.status === PaymentDeclarationStatus.PENDING && (
            <>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => handleApprove(record)} size="small">
                {t('Approuver')}
              </Button>
              <Button danger icon={<CloseCircleOutlined />} onClick={() => handleReject(record)} size="small">
                {t('Rejeter')}
              </Button>
            </>
          )}
        </Space>
      )
    }
  ];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {error && (
          <Alert
            message={t('Erreur')}
            description={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
          />
        )}

        {canCreate && (
          <div>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              {t('Déclarer pour un tiers')}
            </Button>
          </div>
        )}

        <Table
          exportFilename={t('Déclarations de paiement')}
          // Export de TOUTES les déclarations qui correspondent à la recherche affichée.
          exportFetchAll={() =>
            collectAllPages<DeclarationRow>(async (page, limit) => {
              const reponse = await listPaymentDeclarations(tenantId, {
                ...search.filterParams,
                ...statusAll(search.filterParams.status),
                ...(leaseId ? { leaseId } : {}),
                page,
                limit
              });
              return { items: reponse.data ?? [], total: reponse.pagination?.total ?? 0 };
            })
          }
          aria-label={t('Déclarations de paiement')}
          search={search.searchProps}
          dataSource={declarations}
          loading={loading}
          rowKey="id"
          scroll={{ x: 'max-content' }}
          columns={columns}
          pagination={{
            ...search.tablePagination(total),
            showTotal: count =>
              t('Total {{total}} déclaration{{value}}', { total: count, value: count !== 1 ? 's' : '' })
          }}
          // Sous critère, la Table affiche seule son bloc « Aucun résultat » et « Effacer les critères ».
          locale={search.isFiltered ? undefined : { emptyText: t('Aucune déclaration trouvée') }}
        />
      </Space>

      <DeclarationDrawer
        tenantId={tenantId}
        declarationId={drawerId}
        canReview={canReview}
        onClose={() => setDrawerId(null)}
        onApprove={declaration => setApproveTarget(declaration)}
        onReject={declaration => setRejectTarget(declaration)}
      />

      <ApproveModal
        tenantId={tenantId}
        declaration={approveTarget}
        onClose={() => setApproveTarget(null)}
        onApproved={() => void afterApproved()}
        onStale={() => void afterStale()}
      />

      <RejectModal
        tenantId={tenantId}
        declaration={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onRejected={() => void afterRejected()}
        onStale={() => void afterStale()}
      />

      {canCreate && (
        <DeclareForThirdPartyModal
          tenantId={tenantId}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => void afterCreated()}
        />
      )}

      {/* Proof Image Modal */}
      <Modal
        title={t('Preuve de paiement')}
        open={proofImageVisible}
        onCancel={() => {
          setProofImageVisible(false);
          setProofImageUrl(null);
        }}
        footer={null}
        width={800}
      >
        {proofImageUrl && (
          <Image src={proofImageUrl} alt={t('Preuve de paiement')} style={{ width: '100%' }} preview={false} />
        )}
      </Modal>
    </>
  );
};
