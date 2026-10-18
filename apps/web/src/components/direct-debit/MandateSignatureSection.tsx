import React, { useEffect, useState } from 'react';
import { Alert, Card, Space, Typography } from 'antd';
import { listSignatureRequests } from '../../services/signature-service';
import type { SignatureKind, SignerChannel } from '../../types/signature-types';
import { MandateSignatures } from '../signature/MandateSignatures';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Text } = Typography;

/** Un mandat de prélèvement se signe par e-mail, SMS ou WhatsApp : le code est obligatoire, jamais « sur place ». */
const ALLOWED_CHANNELS: SignerChannel[] = ['EMAIL', 'SMS', 'WHATSAPP'];
/** Cible des deux types de document (locatif et copropriété) côté API. */
const TARGET_TYPE = 'DIRECT_DEBIT_MANDATE';
/** Relecture du suivi pendant qu'une demande est ouverte (signature faite hors de la page). */
const POLL_MS = 20000;

export interface MandateSignatureSectionProps {
  kind: Extract<SignatureKind, 'DIRECT_DEBIT_MANDATE' | 'SYNDIC_DIRECT_DEBIT_MANDATE'>;
  mandateId: string;
  /** Statut du mandat : la section ne concerne que le brouillon. */
  status: string;
  /** Un scan (papier ou électronique) est déjà déposé. */
  hasSignedScan: boolean;
  /** Date de signature du mandat (reprise de la signature électronique), le cas échéant. */
  signedAt?: string | null;
  /** Référence du mandat (MDT-AAAA-NNNN) : nom de base des PDF téléchargés. */
  reference?: string;
  /** Appelé quand une demande change d'état (signature, annulation) : le parent relit le mandat. */
  onChanged?: () => void;
}

function dateLabel(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(activeLocale());
}

/**
 * Section « Signature électronique (facultatif) » d'un mandat de prélèvement
 * (spec 042 §10.6), pour les mandats locatifs comme pour ceux de copropriété.
 * Visible sur un brouillon sans scan : envoi, suivi, relance, annulation.
 * Une fois signé, le PDF scellé tient lieu de scan : la mention le dit et
 * l'activation (geste de l'agence) reprend la date de signature.
 */
export const MandateSignatureSection: React.FC<MandateSignatureSectionProps> = ({
  kind,
  mandateId,
  status,
  hasSignedScan,
  signedAt,
  reference,
  onChanged
}) => {
  // Le scan est-il issu d'une signature électronique ? (une demande terminée existe pour ce mandat)
  const [electronic, setElectronic] = useState(false);
  const isDraft = status === 'DRAFT';

  useEffect(() => {
    setElectronic(false);
    if (!isDraft || !hasSignedScan) return undefined;
    let active = true;
    listSignatureRequests({ targetType: TARGET_TYPE, targetId: mandateId })
      .then(requests => {
        if (active) setElectronic(requests.some(request => request.status === 'COMPLETED'));
      })
      .catch(() => {
        // Sans le suivi, la mention est simplement omise : le scan reste disponible.
      });
    return () => {
      active = false;
    };
  }, [isDraft, hasSignedScan, mandateId]);

  if (!isDraft) return null;

  if (hasSignedScan) {
    if (!electronic) return null;
    return (
      <Alert
        type="success"
        showIcon
        data-testid="mandate-signed-electronically"
        message={t('Scan signé (signature électronique)')}
        description={
          <Space direction="vertical" size={2}>
            {signedAt && <Text>{t('Signé le {{date}}', { date: dateLabel(signedAt) })}</Text>}
            <Text type="secondary">{t('Vous pouvez maintenant activer le mandat.')}</Text>
          </Space>
        }
      />
    );
  }

  return (
    <Card size="small" title={t('Signature électronique (facultatif)')} data-testid="mandate-signature-section">
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Text type="secondary">
          {t(
            "Le débiteur reçoit un lien et un code à usage unique pour signer l'autorisation en ligne. Vous pouvez aussi déposer un scan papier signé : il annule alors toute demande en cours."
          )}
        </Text>
        <MandateSignatures
          kind={kind}
          mandateId={mandateId}
          fileLabel={reference ?? 'autorisation-prelevement'}
          allowedChannels={ALLOWED_CHANNELS}
          sendLabel={t('Envoyer pour signature électronique')}
          pollMs={POLL_MS}
          onChanged={onChanged}
        />
      </Space>
    </Card>
  );
};
