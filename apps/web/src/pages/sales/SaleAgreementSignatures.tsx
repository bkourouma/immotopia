import React, { useEffect, useState } from 'react';
import { Alert, Card, Spin } from 'antd';
import { SignaturesPanel } from '../../components/signature/SignaturesPanel';
import { fetchSignatureContext } from '../../services/signature-service';
import type { DefaultSignerDto, SignerInput } from '../../types/signature-types';
import { t } from '../../i18n/t';

/** Signataire proposé par l'API -> ligne préremplie de l'écran d'envoi (e-mail par défaut). */
export function toSignerInputs(signers: DefaultSignerDto[]): SignerInput[] {
  return signers
    .filter(signer => Boolean(signer.fullName?.trim()))
    .map(signer => ({
      role: signer.role,
      fullName: signer.fullName.trim(),
      channel: 'EMAIL',
      contact: signer.email ?? '',
      phoneKnown: Boolean(signer.phone?.trim()),
      ...(signer.contactId ? { contactId: signer.contactId } : {})
    }));
}

interface SaleAgreementSignaturesProps {
  agreementId: string;
  /** Numéro du compromis, pour le nom des PDF téléchargés. */
  number: string;
  /** Seul un compromis en brouillon peut être envoyé en signature. */
  canSend: boolean;
  /** Une demande a évolué (envoi, annulation, scellement) : rafraîchir le compromis. */
  onChanged?: () => void;
  /** Une demande de signature est-elle ouverte ? */
  onOpenChange?: (hasOpen: boolean) => void;
}

/**
 * Carte « Signatures » de la fiche compromis : signataires préremplis par
 * l'API (vendeur, acquéreur, agent) et, si le type de document exige un
 * prestataire qualifié (SG-R1), envoi désactivé avec un avertissement.
 */
export const SaleAgreementSignatures: React.FC<SaleAgreementSignaturesProps> = ({
  agreementId,
  number,
  canSend,
  onChanged,
  onOpenChange
}) => {
  const [signers, setSigners] = useState<SignerInput[] | null>(null);
  const [providerRequired, setProviderRequired] = useState(false);
  const [externalProvider, setExternalProvider] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    setError(null);
    // La cible n'est servie (contexte) que tant que le compromis peut être envoyé ; sinon, seul l'historique s'affiche.
    if (!canSend) {
      setProviderRequired(false);
      setExternalProvider(false);
      setSigners([]);
      return undefined;
    }
    setSigners(null);
    fetchSignatureContext('SALE_AGREEMENT', agreementId)
      .then(context => {
        if (canceled) return;
        setProviderRequired(Boolean(context.providerRequired));
        setExternalProvider(Boolean(context.externalProvider));
        setSigners(toSignerInputs(context.signers ?? []));
      })
      .catch((err: any) => {
        if (!canceled) {
          setError(err?.response?.data?.message || t('Impossible de charger les signataires de ce compromis'));
        }
      });
    return () => {
      canceled = true;
    };
  }, [agreementId, canSend]);

  return (
    <Card title={t('Signatures')} style={{ marginBottom: 'var(--space-6)' }} data-testid="sale-agreement-signatures">
      {error && <Alert type="error" showIcon message={error} />}
      {!signers && !error && <Spin />}
      {signers && (
        <SignaturesPanel
          kind="SALE_AGREEMENT"
          targetType="SaleAgreement"
          targetId={agreementId}
          defaultSigners={signers}
          fileLabel={`compromis-${number}`}
          providerRequired={providerRequired}
          externalProvider={externalProvider}
          sendDisabled={!canSend}
          onChanged={onChanged}
          onOpenChange={onOpenChange}
        />
      )}
    </Card>
  );
};
