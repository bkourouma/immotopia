import React, { useEffect, useState } from 'react';
import { Alert, Space, Spin } from 'antd';
import { fetchSignatureContext } from '../../services/signature-service';
import type { SignatureKind, SignerInput } from '../../types/signature-types';
import { SignaturesPanel } from './SignaturesPanel';
import { t } from '../../i18n/t';

interface MandateSignaturesProps {
  kind: Extract<SignatureKind, 'MANAGEMENT_MANDATE' | 'SALE_MANDATE'>;
  /** Identifiant du mandat (`PropertyMandate` ou `SaleMandate`). */
  mandateId: string;
  /** Nom de base des PDF téléchargés. */
  fileLabel: string;
}

const TARGET_TYPES = { MANAGEMENT_MANDATE: 'PropertyMandate', SALE_MANDATE: 'SaleMandate' } as const;

/**
 * Panneau « Signatures » d'un mandat (gestion ou vente) : les signataires
 * préremplis (mandant ou vendeur, co-vendeurs, agent) viennent de l'API
 * (`GET /signatures/targets/:kind/:targetId/context`), qui les calcule dans la
 * source du type de document. Sans contexte (mandat révoqué, droit refusé), le
 * panneau reste utilisable avec une liste vide : l'API refusera l'envoi.
 */
export const MandateSignatures: React.FC<MandateSignaturesProps> = ({ kind, mandateId, fileLabel }) => {
  const [signers, setSigners] = useState<SignerInput[] | null>(null);
  const [providerRequired, setProviderRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSigners(null);
    setError(null);
    fetchSignatureContext(kind, mandateId)
      .then(context => {
        if (!active) return;
        setProviderRequired(Boolean(context.providerRequired));
        setSigners(
          (context.signers ?? [])
            .filter(signer => Boolean(signer.fullName?.trim()))
            .map(signer => ({
              role: signer.role,
              fullName: signer.fullName.trim(),
              channel: 'EMAIL' as const,
              contact: signer.email ?? '',
              phoneKnown: Boolean(signer.phone?.trim()),
              ...(signer.contactId ? { contactId: signer.contactId } : {})
            }))
        );
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err?.response?.data?.message || t('Impossible de charger les signataires de ce mandat'));
        setSigners([]);
      });
    return () => {
      active = false;
    };
  }, [kind, mandateId]);

  if (signers === null) return <Spin />;
  // Sans contexte (mandat révoqué, droit refusé), l'envoi est coupé mais l'historique reste lisible.
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {error && <Alert type="error" showIcon message={error} />}
      <SignaturesPanel
        kind={kind}
        targetType={TARGET_TYPES[kind]}
        targetId={mandateId}
        defaultSigners={signers}
        fileLabel={fileLabel}
        providerRequired={providerRequired}
        sendDisabled={Boolean(error)}
      />
    </Space>
  );
};
