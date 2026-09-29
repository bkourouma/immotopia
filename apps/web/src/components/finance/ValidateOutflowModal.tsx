import React, { useEffect, useState } from 'react';
import { Modal, Select, Typography } from 'antd';
import { TreasuryAccountSelector } from './TreasuryAccountSelector';
import type { OutflowMethod, OutflowPayerChoice } from '../../types/finance-outflow-types';
import { t } from '../../i18n/t';

const { Text } = Typography;

/**
 * Validation d'un décaissement de chantier (règlement de salaire, de tâcheron,
 * paiement de bail de terrain) : la personne qui valide dit D'OÙ sort l'argent.
 *
 * Recette du 29 septembre 2026 (BUG-2026-09-29-032) : ces règlements étaient
 * prélevés sur la caisse par défaut, sans choix ni contrôle de solde. Le mode
 * de règlement (espèces par défaut, comme avant) filtre les comptes proposés,
 * et le compte laissé vide veut dire « celui par défaut du mode » — virement,
 * chèque ou carte : banque ; espèces : caisse ; mobile money : portefeuille.
 * Le serveur refuse ensuite (400) si le solde du compte ne couvre pas le
 * montant ; l'appelant garde alors la fenêtre ouverte (`onConfirm` rend `false`)
 * pour qu'on puisse choisir un autre compte.
 *
 * Pas de colonne « compte » sur ces pièces (schéma gelé) : le choix se fait ici,
 * à la validation, et non à la saisie du brouillon.
 */

/** Les modes acceptés par le serveur pour un décaissement (jamais « Autre »). */
export function outflowMethodOptions(): Array<{ value: OutflowMethod; label: string }> {
  return [
    { value: 'CASH', label: t('Espèces') },
    { value: 'BANK_TRANSFER', label: t('Virement bancaire') },
    { value: 'CHECK', label: t('Chèque') },
    { value: 'MOBILE_MONEY', label: t('Mobile Money') },
    { value: 'CARD', label: t('Carte bancaire') }
  ];
}

interface ValidateOutflowModalProps {
  open: boolean;
  tenantId: string;
  title: string;
  description?: React.ReactNode;
  /** Rend `true` si la validation a réussi (la fenêtre se ferme côté appelant). */
  onConfirm: (payer: OutflowPayerChoice) => Promise<boolean>;
  onCancel: () => void;
}

export const ValidateOutflowModal: React.FC<ValidateOutflowModalProps> = ({
  open,
  tenantId,
  title,
  description,
  onConfirm,
  onCancel
}) => {
  const [method, setMethod] = useState<OutflowMethod>('CASH');
  const [treasuryAccountId, setTreasuryAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Chaque ouverture repart des espèces et du compte par défaut.
  useEffect(() => {
    if (open) {
      setMethod('CASH');
      setTreasuryAccountId(null);
    }
  }, [open]);

  const confirmer = async () => {
    setBusy(true);
    try {
      await onConfirm({ method, treasuryAccountId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      okText={t('Confirmer la validation')}
      cancelText={t('Annuler')}
      confirmLoading={busy}
      onOk={confirmer}
      onCancel={onCancel}
      destroyOnHidden
    >
      {description && <Text type="secondary">{description}</Text>}
      <div style={{ marginTop: 'var(--space-4)' }}>
        <div>
          <label htmlFor="decaissement-mode">{t('Mode de règlement')}</label>
        </div>
        <Select
          id="decaissement-mode"
          aria-label={t('Mode de règlement')}
          style={{ width: '100%' }}
          value={method}
          onChange={valeur => {
            setMethod(valeur);
            // Le compte choisi peut ne plus convenir au nouveau mode.
            setTreasuryAccountId(null);
          }}
          options={outflowMethodOptions()}
        />
      </div>
      <div style={{ marginTop: 'var(--space-3)' }}>
        <div>
          <label htmlFor="decaissement-compte">{t('Compte de trésorerie payeur')}</label>
        </div>
        <TreasuryAccountSelector
          id="decaissement-compte"
          tenantId={tenantId}
          paymentMethod={method}
          direction="out"
          value={treasuryAccountId}
          onChange={setTreasuryAccountId}
          placeholder={t('Compte par défaut du mode')}
        />
      </div>
    </Modal>
  );
};

export default ValidateOutflowModal;
