import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Modal, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listPurchaseOrders, setPurchaseOrderForSupplierInvoice } from '../../services/finance-lot3-service';
import type { SupplierInvoice } from '../../types/finance-lot2-types';
import type { PurchaseOrder, PurchaseOrderLine } from '../../types/finance-lot3-types';
import { INVOICING_STATE_LABELS } from '../../types/finance-lot3-types';
import { entityKeyPrefix, queryKey } from '../../lib/query-keys';
import { MoneyValue, StatCard, formatMoney } from '../primitives';
import { t } from '../../i18n/t';

const { Text } = Typography;

/**
 * Rapprocher une facture fournisseur d'un bon de commande
 * (BUG-2026-09-29-033 ; wiki « Rapprocher une facture fournisseur à un bon de
 * commande », scénario F.16 ; route
 * `POST .../supplier-invoices/:invoiceId/purchase-order`).
 *
 * **Règles du serveur, redites ici pour ne pas laisser deviner :**
 *   - la facture doit être en BROUILLON : une facture validée ne se rapproche
 *     plus (« ce qui est validé ne bouge plus ») ;
 *   - le bon doit être ÉMIS, du MÊME fournisseur et du MÊME chantier que la
 *     facture — l'écran ne propose donc que ceux-là ;
 *   - le rapprochement se défait tant que la facture n'est pas validée.
 *
 * **Le reste à facturer ne bouge qu'à la VALIDATION de la facture.** Le serveur
 * ne compte dans « Facturé » que les factures validées : rapprocher un
 * brouillon le rattache au bon sans changer l'engagé. L'écran le dit, plutôt
 * que de laisser croire à un effet immédiat.
 *
 * **Écart.** Différence entre le montant de la facture et le reste à facturer
 * du bon. Positive : la facture dépasse ce qu'il restait à facturer — le
 * serveur l'accepte (reste à facturer borné à zéro), mais l'écran l'avertit.
 * Rien n'est recalculé de l'engagé ici : tous les montants du bon viennent du
 * serveur.
 */

interface RapprochementBonDeCommandeProps {
  tenantId: string;
  /** La facture à rapprocher, ou `null` : la fenêtre est fermée. */
  facture: SupplierInvoice | null;
  onClose: () => void;
}

/**
 * La référence du bon rapproché d'une facture, pour la colonne « Bon de
 * commande » de la liste. Une seule requête (les bons du fournisseur) sert
 * toutes les lignes, la clé étant partagée.
 */
export const BonRapproche: React.FC<{ tenantId: string; supplierId: string; purchaseOrderId: string }> = ({
  tenantId,
  supplierId,
  purchaseOrderId
}) => {
  const { data: bons } = useQuery({
    queryKey: queryKey('purchase-orders', tenantId, { supplierId }),
    queryFn: () => listPurchaseOrders(tenantId, { supplierId }),
    staleTime: 30_000
  });
  const bon = (bons ?? []).find(b => b.id === purchaseOrderId);
  return <>{bon ? bon.reference : t('Bon rapproché')}</>;
};

export const RapprochementBonDeCommande: React.FC<RapprochementBonDeCommandeProps> = ({
  tenantId,
  facture,
  onClose
}) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [bonChoisi, setBonChoisi] = useState<string | undefined>(undefined);
  const [enCours, setEnCours] = useState(false);

  const ouvert = Boolean(facture);
  const bonActuel = facture?.purchaseOrderId ?? undefined;

  useEffect(() => {
    setBonChoisi(facture?.purchaseOrderId ?? undefined);
  }, [facture?.id, facture?.purchaseOrderId]);

  // Les bons du même fournisseur ET du même chantier : le serveur refuse tout autre.
  const { data: bons, isPending } = useQuery({
    queryKey: queryKey('purchase-orders', tenantId, {
      supplierId: facture?.supplierId,
      siteId: facture?.siteId ?? undefined,
      usage: 'rapprochement'
    }),
    queryFn: () =>
      listPurchaseOrders(tenantId, {
        supplierId: facture?.supplierId,
        siteId: facture?.siteId ?? undefined
      }),
    enabled: ouvert && Boolean(facture?.siteId)
  });

  const bonsEmis = (bons ?? []).filter(bon => bon.status === 'ISSUED');
  const bonSelectionne: PurchaseOrder | undefined = (bons ?? []).find(bon => bon.id === bonChoisi);
  const bonRapproche = (bons ?? []).find(bon => bon.id === bonActuel);

  const relire = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: entityKeyPrefix('purchase-orders', tenantId) }),
      queryClient.invalidateQueries({ queryKey: entityKeyPrefix('supplier-invoices', tenantId) }),
      queryClient.invalidateQueries({ queryKey: entityKeyPrefix('site-engagement', tenantId) }),
      queryClient.invalidateQueries({ queryKey: entityKeyPrefix('sites-dashboard', tenantId) })
    ]);

  const appliquer = async (purchaseOrderId: string | null) => {
    if (!facture) return;
    setEnCours(true);
    try {
      await setPurchaseOrderForSupplierInvoice(tenantId, facture.id, purchaseOrderId);
      await relire();
      message.success(
        purchaseOrderId
          ? t('Facture {{reference}} rapprochée du bon.', { reference: facture.reference })
          : t('Rapprochement de la facture {{reference}} défait.', { reference: facture.reference })
      );
      onClose();
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('Le rapprochement a échoué.'));
    } finally {
      setEnCours(false);
    }
  };

  const colonnesLignes: ColumnsType<PurchaseOrderLine> = [
    { title: t('Ligne'), key: 'ligne', render: (_, l) => l.label },
    { title: t('Poste'), key: 'poste', render: (_, l) => l.costCategoryLabel },
    { title: t('Montant'), key: 'montant', align: 'end', render: (_, l) => <MoneyValue value={l.amount} /> }
  ];

  // Écart entre la facture et ce qu'il reste à facturer sur le bon.
  const ecart = bonSelectionne && facture ? facture.amount - bonSelectionne.remainingAmount : null;
  const dejaRapprocheACeBon = Boolean(bonChoisi) && bonChoisi === bonActuel;

  return (
    <Modal
      title={facture ? t('Rapprocher la facture {{reference}} d’un bon', { reference: facture.reference }) : ''}
      open={ouvert}
      onCancel={onClose}
      width={720}
      destroyOnHidden
      footer={
        <Space wrap>
          <Button onClick={onClose}>{t('Fermer')}</Button>
          {bonActuel && (
            <Button danger loading={enCours} onClick={() => appliquer(null)}>
              {t('Défaire le rapprochement')}
            </Button>
          )}
          <Button
            type="primary"
            loading={enCours}
            disabled={!bonChoisi || dejaRapprocheACeBon}
            onClick={() => appliquer(bonChoisi ?? null)}
          >
            {t('Rapprocher')}
          </Button>
        </Space>
      }
    >
      {facture && !facture.siteId ? (
        <Alert
          type="warning"
          showIcon
          message={t(
            "Cette facture n'est imputée à aucun chantier : un bon ne se rapproche que d'une facture du même chantier."
          )}
        />
      ) : (
        <>
          <Text type="secondary" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
            {t(
              "Seuls les bons émis du même fournisseur et du même chantier sont proposés. Le reste à facturer du bon ne diminue qu'à la validation de la facture."
            )}
          </Text>

          {bonRapproche && (
            <Text style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
              {t('Bon actuellement rapproché : {{reference}}', { reference: bonRapproche.reference })}
            </Text>
          )}

          <label htmlFor="rapprochement-bon">{t('Bon de commande')}</label>
          <Select
            id="rapprochement-bon"
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            placeholder={t('Choisir un bon émis')}
            loading={isPending && ouvert}
            value={bonChoisi}
            onChange={valeur => setBonChoisi(valeur)}
            notFoundContent={t('Aucun bon émis pour ce fournisseur sur ce chantier.')}
            options={bonsEmis.map(bon => ({
              value: bon.id,
              label: `${bon.reference} — ${INVOICING_STATE_LABELS[bon.invoicingState]}`
            }))}
          />

          {bonSelectionne && facture && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: 'var(--space-3)',
                  marginBottom: 'var(--space-3)'
                }}
              >
                <StatCard
                  label={t('Engagé (montant du bon)')}
                  value={<MoneyValue value={bonSelectionne.totalAmount} />}
                />
                <StatCard label={t('Facturé')} value={<MoneyValue value={bonSelectionne.invoicedAmount} />} />
                <StatCard label={t('Reste à facturer')} value={<MoneyValue value={bonSelectionne.remainingAmount} />} />
                <StatCard label={t('Montant de la facture')} value={<MoneyValue value={facture.amount} />} />
              </div>

              {ecart !== null && ecart > 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 'var(--space-3)' }}
                  message={t('La facture dépasse de {{montant}} le reste à facturer du bon.', {
                    montant: formatMoney(ecart)
                  })}
                />
              ) : (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 'var(--space-3)' }}
                  message={t('Une fois la facture validée, il resterait {{montant}} à facturer sur ce bon.', {
                    montant: formatMoney(Math.max(bonSelectionne.remainingAmount - facture.amount, 0))
                  })}
                />
              )}

              <Table<PurchaseOrderLine>
                size="small"
                pagination={false}
                dataSource={bonSelectionne.lines}
                columns={colonnesLignes}
                rowKey={l => l.id}
                aria-label={t('Lignes du bon de commande')}
              />
            </div>
          )}
        </>
      )}
    </Modal>
  );
};

export default RapprochementBonDeCommande;
