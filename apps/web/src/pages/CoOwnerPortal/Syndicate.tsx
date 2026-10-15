import React, { useEffect, useMemo, useState } from 'react';
import { BankOutlined, EnvironmentOutlined, HomeOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons';
import { Card, Col, Divider, Row, Select, Space, Typography } from 'antd';
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

/** Une pastille d'icône, couleur d'accent du portail. */
function IconBadge({ icon, size = 44 }: { icon: React.ReactNode; size?: number }) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
        color: '#1d4ed8',
        fontSize: size / 2
      }}
    >
      {icon}
    </div>
  );
}

/** Un chiffre clé du bandeau d'identité. */
function KeyFact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ minWidth: 120 }}>
      <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
        {label}
      </Text>
      <Text strong style={{ fontSize: 16 }}>
        {value}
      </Text>
    </div>
  );
}

/** Une ligne de coordonnée : icône discrète, valeur, lien si utile. */
function ContactRow({ icon, value, href }: { icon: React.ReactNode; value: string | null | undefined; href?: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ color: '#8c8c8c', marginTop: 2 }}>{icon}</span>
      {value ? href ? <a href={href}>{value}</a> : <Text>{value}</Text> : <Text type="secondary">—</Text>}
    </div>
  );
}

/** La fiche, une fois la copropriété choisie et chargée. */
function SyndicateDetails({ data }: { data: CoOwnerSyndicateSheet }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card styles={{ body: { padding: 24 } }}>
        <div
          style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
        >
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', minWidth: 0 }}>
            <IconBadge icon={<BankOutlined />} size={56} />
            <div style={{ minWidth: 0 }}>
              <Title level={3} style={{ margin: 0 }}>
                {data.name}
              </Title>
              <Text type="secondary">
                <EnvironmentOutlined /> {data.address}
              </Text>
            </div>
          </div>
          {data.hasLogo ? <PortalImage loader={() => fetchCoOwnerSyndicateLogo(data.id)} alt={data.name} /> : null}
        </div>
        <Divider style={{ marginBlock: 20 }} />
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <KeyFact label={t('Nombre de lots')} value={data.lotCount} />
          <KeyFact label={t('Mes lots')} value={data.myLots.length} />
          <KeyFact label={t('Immatriculation')} value={data.registrationNo ?? '—'} />
          <KeyFact label={t('Référence cadastrale')} value={data.cadastralReference ?? '—'} />
        </div>
      </Card>

      <Card title={t('Mes lots dans cette copropriété')}>
        {data.myLots.length === 0 ? (
          <Text type="secondary">{t("Aucun de vos lots n'est ouvert dans cette copropriété.")}</Text>
        ) : (
          <Row gutter={[16, 16]}>
            {data.myLots.map(lot => (
              <Col key={lot.id} xs={24} sm={12} lg={8}>
                <Card size="small" styles={{ body: { display: 'flex', gap: 12, alignItems: 'center' } }}>
                  <IconBadge icon={<HomeOutlined />} size={40} />
                  <div>
                    <Text strong>{t('Lot {{lotNumber}}', { lotNumber: lot.lotNumber })}</Text>
                    <div>
                      <Text type="secondary">{lotTypeLabel(lot.lotType)}</Text>
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      <Row gutter={[16, 16]} style={{ alignItems: 'stretch' }}>
        <Col xs={24} md={12} style={{ display: 'flex' }}>
          <Card
            style={{ width: '100%' }}
            title={t('Émetteur des documents')}
            extra={
              data.hasIssuerLogo ? (
                <PortalImage loader={() => fetchCoOwnerIssuerLogo(data.id)} alt={data.issuer.name} />
              ) : null
            }
          >
            <Space direction="vertical" size={10}>
              <Text strong>{data.issuer.name}</Text>
              <ContactRow icon={<EnvironmentOutlined />} value={data.issuer.address} />
              <ContactRow
                icon={<PhoneOutlined />}
                value={data.issuer.phone}
                href={data.issuer.phone ? `tel:${data.issuer.phone}` : undefined}
              />
              <ContactRow
                icon={<MailOutlined />}
                value={data.issuer.email}
                href={data.issuer.email ? `mailto:${data.issuer.email}` : undefined}
              />
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={12} style={{ display: 'flex' }}>
          <Card style={{ width: '100%' }} title={t('Gestionnaire de la copropriété')}>
            {data.syndicContact ? (
              <Space direction="vertical" size={10}>
                <Text strong>{data.syndicContact.name ?? '—'}</Text>
                <ContactRow
                  icon={<MailOutlined />}
                  value={data.syndicContact.email}
                  href={data.syndicContact.email ? `mailto:${data.syndicContact.email}` : undefined}
                />
              </Space>
            ) : (
              <Text type="secondary">{t("Aucun gestionnaire n'est désigné pour l'instant.")}</Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
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
