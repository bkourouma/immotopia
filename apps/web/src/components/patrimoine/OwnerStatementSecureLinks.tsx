import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Input, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import {
  createOwnerStatementSecureLink,
  listOwnerStatementSecureLinks,
  revokeOwnerStatementSecureLink,
  sendOwnerMonthlyReport
} from '../../services/patrimoine-service';
import type { OwnerStatementSecureLink, SendMonthlyReportResult } from '../../types/patrimoine-types';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Paragraph } = Typography;

export interface OwnerStatementSecureLinksProps {
  tenantId: string;
  statementId: string;
}

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString(activeLocale()) : '-';
}

function errorText(e: any, fallback: string): string {
  return e?.response?.data?.error || e?.response?.data?.message || fallback;
}

/** Copie dans le presse-papiers ; `false` si ni l'API moderne ni le repli ne fonctionnent. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // repli ci-dessous
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.insetInlineStart = '-9999px';
    document.body.appendChild(area);
    area.select();
    const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function sendOutcome(result: SendMonthlyReportResult): { type: 'success' | 'warning'; text: string } {
  if (result.sent) {
    if (result.channel === 'WHATSAPP') return { type: 'success', text: t('Rapport envoyé par WhatsApp.') };
    if (result.channel === 'EMAIL') return { type: 'success', text: t('Rapport envoyé par e-mail.') };
    return { type: 'success', text: t('Rapport envoyé.') };
  }
  if (result.reason === 'NO_ELIGIBLE_CHANNEL') {
    return { type: 'warning', text: t('Aucun canal éligible : consentement ou coordonnées manquants.') };
  }
  if (result.reason === 'EVENT_DISABLED') {
    return { type: 'warning', text: t("Cet envoi est désactivé dans la configuration de l'agence.") };
  }
  if (result.reason === 'SEND_FAILED') {
    return {
      type: 'warning',
      text: t("L'envoi a échoué : réessayez plus tard ou vérifiez la configuration des fournisseurs.")
    };
  }
  if (result.reason === 'STATEMENT_NOT_FOUND') return { type: 'warning', text: t('Relevé introuvable.') };
  return { type: 'warning', text: t("Le rapport n'a pas été envoyé.") };
}

/** Section « Rapport mensuel et liens sécurisés » d'un relevé propriétaire. */
export const OwnerStatementSecureLinks: React.FC<OwnerStatementSecureLinksProps> = ({ tenantId, statementId }) => {
  const { message, modal } = App.useApp();
  const [links, setLinks] = useState<OwnerStatementSecureLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setLinks(await listOwnerStatementSecureLinks(tenantId, statementId));
    } catch (e: any) {
      setLoadError(errorText(e, t('Erreur de chargement des liens sécurisés')));
    } finally {
      setLoading(false);
    }
  }, [tenantId, statementId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSend = async () => {
    setSending(true);
    try {
      const outcome = sendOutcome(await sendOwnerMonthlyReport(tenantId, statementId));
      if (outcome.type === 'success') message.success(outcome.text);
      else message.warning(outcome.text);
      // Un envoi réussi a pu créer un lien actif : la liste doit le refléter.
      await reload();
    } catch (e: any) {
      message.error(errorText(e, t("Échec de l'envoi du rapport")));
    } finally {
      setSending(false);
    }
  };

  const handleCopyLink = async () => {
    setCreating(true);
    try {
      // L'url (jeton en clair) vit le temps de cette fonction : jamais en state, jamais journalisée.
      const created = await createOwnerStatementSecureLink(tenantId, statementId);
      if (await copyToClipboard(created.url)) {
        message.success(t('Lien sécurisé copié dans le presse-papiers.'));
      } else {
        modal.info({
          title: t('Copiez ce lien manuellement'),
          content: (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Paragraph>{t('Ce lien ne sera plus affiché après la fermeture de cette fenêtre.')}</Paragraph>
              <Input readOnly dir="ltr" defaultValue={created.url} onFocus={event => event.target.select()} />
            </Space>
          )
        });
      }
      await reload();
    } catch (e: any) {
      message.error(errorText(e, t('Échec de la création du lien sécurisé')));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (linkId: string) => {
    setRevokingId(linkId);
    try {
      await revokeOwnerStatementSecureLink(tenantId, statementId, linkId);
      message.success(t('Lien révoqué.'));
      await reload();
    } catch (e: any) {
      message.error(errorText(e, t('Échec de la révocation du lien')));
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Card title={t('Rapport mensuel et liens sécurisés')}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          {t(
            "Envoyez le rapport du mois au propriétaire, ou copiez un lien sécurisé à lui transmettre. Le lien n'est affiché qu'une seule fois, à sa création."
          )}
        </Paragraph>
        <Space wrap>
          <Button type="primary" loading={sending} onClick={() => void handleSend()}>
            {t('Envoyer le rapport du mois')}
          </Button>
          <Button loading={creating} onClick={() => void handleCopyLink()}>
            {t('Copier le lien sécurisé')}
          </Button>
        </Space>

        <Typography.Title level={5} style={{ margin: 0 }}>
          {t('Liens actifs')}
        </Typography.Title>
        {loadError ? (
          <Alert
            type="error"
            showIcon
            message={loadError}
            action={
              <Button size="small" onClick={() => void reload()}>
                {t('Réessayer')}
              </Button>
            }
          />
        ) : null}
        <Table
          scroll={{ x: 'max-content' }}
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={links}
          pagination={false}
          locale={{ emptyText: t('Aucun lien actif.') }}
          columns={[
            { title: t('Créé le'), dataIndex: 'createdAt', render: (v: string) => formatDateTime(v) },
            { title: t('Expire le'), dataIndex: 'expiresAt', render: (v: string) => formatDateTime(v) },
            {
              title: t('Consultations'),
              dataIndex: 'viewCount',
              align: 'end' as const,
              render: (v: number) => v.toLocaleString(activeLocale())
            },
            {
              title: t('Dernière consultation'),
              dataIndex: 'lastViewedAt',
              render: (v: string | null) => formatDateTime(v)
            },
            {
              title: t('Statut'),
              dataIndex: 'status',
              // L'API ne liste que les liens actifs.
              render: () => <Tag color="success">{t('Actif')}</Tag>
            },
            {
              title: '',
              key: 'actions',
              align: 'end' as const,
              render: (_: unknown, record: OwnerStatementSecureLink) => (
                <Popconfirm
                  title={t('Révoquer ce lien ?')}
                  description={t('Le propriétaire ne pourra plus ouvrir le rapport avec ce lien.')}
                  okText={t('Révoquer')}
                  cancelText={t('Annuler')}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleRevoke(record.id)}
                >
                  <Button size="small" danger loading={revokingId === record.id}>
                    {t('Révoquer')}
                  </Button>
                </Popconfirm>
              )
            }
          ]}
        />
      </Space>
    </Card>
  );
};
