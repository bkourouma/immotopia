import React from 'react';
import { Alert, Modal, Spin } from 'antd';
import { SignaturesPanel } from '../../signature/SignaturesPanel';
import { fetchSignatureContext } from '../../../services/signature-service';
import type { SignerInput } from '../../../types/signature-types';
import { t } from '../../../i18n/t';

interface InspectionSignaturesModalProps {
  open: boolean;
  inspectionId: string;
  type: 'ENTRY' | 'EXIT';
  /** Le locataire est sur place : son canal par défaut devient « Sur place » (dessin obligatoire). */
  tenantPresent: boolean;
  onClose: () => void;
}

/**
 * Signataires préremplis d'après l'API : l'agent est toujours à l'écran, le
 * locataire l'est quand l'état des lieux le dit ; ils signent sur place
 * (canal IN_PERSON, signature dessinée). Les autres reçoivent un lien par e-mail.
 */
export function toSignerInputs(
  signers: Array<{
    role: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
    contactId?: string | null;
  }>,
  tenantPresent: boolean
): SignerInput[] {
  return signers
    .filter(signer => Boolean(signer.fullName?.trim()))
    .map(signer => {
      const onSite = signer.role === 'AGENT' || (tenantPresent && signer.role === 'LOCATAIRE');
      return {
        role: signer.role,
        fullName: signer.fullName,
        channel: onSite ? 'IN_PERSON' : 'EMAIL',
        contact: onSite ? '' : (signer.email ?? ''),
        phoneKnown: Boolean(signer.phone?.trim()),
        ...(signer.contactId ? { contactId: signer.contactId } : {})
      };
    });
}

/** Fenêtre « Signatures » d'un état des lieux finalisé : envoi, signature sur place, suivi, PDF. */
export const InspectionSignaturesModal: React.FC<InspectionSignaturesModalProps> = ({
  open,
  inspectionId,
  type,
  tenantPresent,
  onClose
}) => {
  const [signers, setSigners] = React.useState<SignerInput[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return undefined;
    let canceled = false;
    setSigners(null);
    setError(null);
    fetchSignatureContext('LEASE_INSPECTION', inspectionId)
      .then(context => {
        if (!canceled) setSigners(toSignerInputs(context.signers ?? [], tenantPresent));
      })
      .catch((err: any) => {
        if (!canceled) {
          setError(err?.response?.data?.message || t('Impossible de charger les signataires de cet état des lieux'));
        }
      });
    return () => {
      canceled = true;
    };
  }, [open, inspectionId, tenantPresent]);

  return (
    <Modal
      open={open}
      title={t('Signatures de l’état des lieux')}
      onCancel={onClose}
      footer={null}
      width={820}
      destroyOnHidden
    >
      {tenantPresent && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('Le locataire est présent : faites-le signer sur place, directement sur cet écran.')}
          description={t('Chaque signataire présent dessine sa signature ; les absents reçoivent un lien par e-mail.')}
        />
      )}
      {error && <Alert type="error" showIcon message={error} />}
      {!signers && !error && <Spin />}
      {signers && (
        <SignaturesPanel
          kind="LEASE_INSPECTION"
          targetType="LeaseInspection"
          targetId={inspectionId}
          defaultSigners={signers}
          fileLabel={type === 'EXIT' ? 'etat-des-lieux-sortie' : 'etat-des-lieux-entree'}
        />
      )}
    </Modal>
  );
};

export default InspectionSignaturesModal;
