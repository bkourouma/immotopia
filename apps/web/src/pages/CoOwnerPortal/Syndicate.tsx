import React, { useEffect, useMemo, useState } from 'react';
import { Card, Col, Descriptions, Row, Select, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { SkeletonList, StateBlock } from '../../components/primitives';
import { t } from '../../i18n/t';
import {
  fetchCoOwnerIssuerLogo,
  fetchCoOwnerSyndicateLogo,
  listMyLots,
  getCoOwnerSyndicate,
  type CoOwnerSyndicateSheet
} from '../../services/coowner-portal-service';
import { lotTypeLabel } from './labels';
import { portalErrorMessage } from './portal-error';

const { Title, Text } = Typography;

/**
 * Une image privée du portail : chargée en blob et jamais posée en
 * `<img src>` direct (la route exige la session, qu'une balise `<img>` ne
 * porte pas de façon fiable). L'URL d'objet est révoquée au démontage.
 */
function PortalImage({ loader, alt }: { loader: () => Promise<Blob>; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    loader()
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        // Logo absent ou inaccessible : rien à afficher, pas d'erreur bloquante.
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [loader]);

  if (!url) return null;
  return <img src={url} alt={alt} style={{ maxHeight: 72, maxWidth: 200, objectFit: 'contain' }} />;
}

/** La fiche, une fois la copropriété choisie et chargée. */
function SyndicateDetails({ data }: { data: CoOwnerSyndicateSheet }) {
  return (
    <>
      <Card
        title={data.name}
        extra={data.hasLogo ? <PortalImage loader={() => fetchCoOwnerSyndicateLogo(data.id)} alt={data.name} /> : null}
      >
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label={t('Adresse')}>{data.address}</Descriptions.Item>
          <Descriptions.Item label={t('Immatriculation')}>{data.registrationNo ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('Référence cadastrale')}>{data.cadastralReference ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('Nombre de lots')}>{data.lotCount}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={t('Mes lots dans cette copropriété')}>
        {data.myLots.length === 0 ? (
          <Text type="secondary">{t("Aucun de vos lots n'est ouvert dans cette copropriété.")}</Text>
        ) : (
          <Row gutter={[16, 16]}>
            {data.myLots.map(lot => (
              <Col key={lot.id} xs={24} sm={12} md={8}>
                <Card size="small">
                  <Text strong>{t('Lot {{lotNumber}}', { lotNumber: lot.lotNumber })}</Text>
                  <div>
                    <Text type="secondary">{lotTypeLabel(lot.lotType)}</Text>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card
            title={t('Émetteur des documents')}
            extra={
              data.hasIssuerLogo ? (
                <PortalImage loader={() => fetchCoOwnerIssuerLogo(data.id)} alt={data.issuer.name} />
              ) : null
            }
          >
            <Descriptions column={1} size="small">
              <Descriptions.Item label={t('Nom')}>{data.issuer.name}</Descriptions.Item>
              <Descriptions.Item label={t('Adresse')}>{data.issuer.address ?? '—'}</Descriptions.Item>
              <Descriptions.Item label={t('Téléphone')}>{data.issuer.phone ?? '—'}</Descriptions.Item>
              <Descriptions.Item label={t('E-mail')}>{data.issuer.email ?? '—'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={t('Gestionnaire de la copropriété')}>
            {data.syndicContact ? (
              <Descriptions column={1} size="small">
                <Descriptions.Item label={t('Nom')}>{data.syndicContact.name ?? '—'}</Descriptions.Item>
                <Descriptions.Item label={t('E-mail')}>{data.syndicContact.email ?? '—'}</Descriptions.Item>
              </Descriptions>
            ) : (
              <Text type="secondary">{t("Aucun gestionnaire n'est désigné pour l'instant.")}</Text>
            )}
          </Card>
        </Col>
      </Row>
    </>
  );
}

/**
 * « Ma copropriété » (lot S5, besoin 2) : identité de la copropriété,
 * mes lots, logos et coordonnées de l'émetteur des documents (mandant, sinon
 * agence) et du gestionnaire désigné. Un copropriétaire avec des lots dans
 * plusieurs copropriétés choisit laquelle regarder.
 */
export default function CoOwnerSyndicateSheet() {
  const [syndicId, setSyndicId] = useState<string | undefined>(undefined);

  const lots = useQuery({ queryKey: ['coowner-portal', 'lots'], queryFn: () => listMyLots() });

  const syndicateOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const lot of lots.data ?? []) {
      if (lot.syndicate && !seen.has(lot.syndicate.id)) seen.set(lot.syndicate.id, lot.syndicate.name);
    }
    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
  }, [lots.data]);

  useEffect(() => {
    if (!syndicId && syndicateOptions.length > 0) setSyndicId(syndicateOptions[0].value);
  }, [syndicId, syndicateOptions]);

  const syndicate = useQuery({
    queryKey: ['coowner-portal', 'syndicate', syndicId ?? null],
    queryFn: () => getCoOwnerSyndicate(syndicId as string),
    enabled: Boolean(syndicId)
  });

  if (lots.data && syndicateOptions.length === 0) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Title level={2}>{t('Ma copropriété')}</Title>
        <StateBlock variant="empty" description={t("Aucune copropriété n'est encore ouverte à votre compte.")} />
      </Space>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Ma copropriété')}</Title>
          <Text type="secondary">{t("Identité, mes lots et coordonnées de l'émetteur des documents.")}</Text>
        </div>
        {syndicateOptions.length > 1 ? (
          <Select
            style={{ minWidth: 240 }}
            options={syndicateOptions}
            value={syndicId}
            onChange={value => setSyndicId(value)}
            aria-label={t('Copropriété')}
          />
        ) : null}
      </div>

      {!syndicId || syndicate.isPending ? (
        <SkeletonList rows={3} />
      ) : syndicate.error ? (
        <StateBlock
          variant="error"
          description={portalErrorMessage(syndicate.error, t('Impossible de charger la fiche de la copropriété.'))}
          actions={[{ label: t('Réessayer'), onClick: () => void syndicate.refetch(), primary: true }]}
        />
      ) : syndicate.data ? (
        <SyndicateDetails data={syndicate.data} />
      ) : null}
    </Space>
  );
}
