import React, { useState } from 'react';
import { Button, Tag, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Table } from '../primitives';
import { SyndicateDocument } from '../../types/syndic-types';
import { downloadSyndicDocument, updateSyndicDocument } from '../../services/syndic-service';
import { ConfirmAction } from '../primitives/ConfirmAction';
import { feedback } from '../../lib/feedback';
import { saveBlob } from '../../utils/save-blob';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { t } from '../../i18n/t';

const { Link, Text } = Typography;

interface DocumentVaultProps {
  documents: SyndicateDocument[];
  /** Agence et copropriété : le fichier se télécharge par la route de gestion. */
  tenantId: string;
  syndicId: string;
  loading?: boolean;
  /** Droit `SYNDIC_EDIT` : sans lui, l'action de visibilité est masquée (l'API répondrait 403). */
  canEdit?: boolean;
  /** Appelé après un changement de visibilité réussi : le parent recharge la liste. */
  onChanged?: () => void;
}

function isExternalUrl(fileUrl: string | null | undefined): fileUrl is string {
  return Boolean(fileUrl && /^https?:\/\//i.test(fileUrl));
}

/** Libellés affichés, construits au rendu : `t()` doit être appelé après le chargement de la langue. */
function documentTypeLabels(): Record<SyndicateDocument['type'], string> {
  return {
    REGULATION: t('Règlement de copropriété'),
    GENERAL_MEETING_MINUTES: t("Procès-verbal d'AG"),
    DIAGNOSTIC: t('Diagnostic'),
    INSURANCE: t('Assurance'),
    BUDGET: t('Budget'),
    OTHER: t('Autre')
  };
}

/** Nom du fichier déposé ou du lien saisi : dernier segment de `fileUrl`, sans paramètres. */
function fileNameOf(document: SyndicateDocument): string {
  const last = (document.fileUrl ?? '').split(/[?#]/)[0].split('/').pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

// Accesseurs stables (hors du composant) : le filtrage reste mémoïsé. Le libellé du type est lu à
// l'appel, pour suivre la langue.
const TEXTE_RECHERCHE = [
  (document: SyndicateDocument) => document.title,
  fileNameOf,
  (document: SyndicateDocument) => documentTypeLabels()[document.type]
];
const ACCESSEURS = {
  type: (document: SyndicateDocument) => document.type,
  portal: (document: SyndicateDocument) => Boolean(document.visibleToCoOwners),
  added: (document: SyndicateDocument) => document.createdAt,
  expires: (document: SyndicateDocument) => document.expiresAt
};

/**
 * Coffre documentaire d'une copropriété.
 *
 * La liste arrive en entier (bornée par la copropriété) : recherche et
 * pagination LOCALES.
 *
 * Un fichier déposé ne s'ouvre plus par un lien direct vers
 * `/uploads/syndics/...` : le service statique le refuse (document privé,
 * AGENTS.md). « Télécharger » passe par la route authentifiée
 * `GET .../documents/:documentId/fichier`, qui vérifie l'agence. Un lien
 * externe saisi par le gestionnaire s'ouvre tel quel.
 */
export const DocumentVault: React.FC<DocumentVaultProps> = ({
  documents,
  tenantId,
  syndicId,
  loading = false,
  canEdit = false,
  onChanged
}) => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = async (document: SyndicateDocument) => {
    setDownloadingId(document.id);
    try {
      const { blob, filename } = await downloadSyndicDocument(tenantId, syndicId, document.id, document.title);
      saveBlob(blob, filename);
    } catch {
      feedback.error(t('Téléchargement impossible.'));
    } finally {
      setDownloadingId(null);
    }
  };

  const toggleVisibility = async (document: SyndicateDocument) => {
    try {
      await updateSyndicDocument(tenantId, syndicId, document.id, { visibleToCoOwners: !document.visibleToCoOwners });
      feedback.success(
        document.visibleToCoOwners
          ? t('Document retiré du portail des copropriétaires.')
          : t('Document visible des copropriétaires.')
      );
      onChanged?.();
    } catch {
      feedback.error(t('Modification de la visibilité impossible.'));
    }
  };

  const typeLabels = documentTypeLabels();
  const criteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Titre, nom du fichier, type…') },
    {
      key: 'type',
      type: 'multiSelect',
      label: t('Type'),
      primary: true,
      options: Object.entries(typeLabels).map(([value, label]) => ({ value, label }))
    },
    {
      key: 'portal',
      type: 'boolean',
      label: t('Visible au portail'),
      primary: true,
      tristate: true,
      trueLabel: t('Visible au portail'),
      falseLabel: t('Interne')
    },
    { key: 'added', type: 'dateRange', label: t("Date d'ajout") },
    { key: 'expires', type: 'dateRange', label: t('Expiration') }
  ];
  const local = useLocalListSearch<SyndicateDocument>(documents, {
    ariaLabel: t('Rechercher dans les documents'),
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });
  const columns: ColumnsType<SyndicateDocument> = [
    { title: t('Titre'), dataIndex: 'title', key: 'title', render: (value: string) => <Text strong>{value}</Text> },
    {
      title: t('Type'),
      dataIndex: 'type',
      key: 'type',
      render: (value: SyndicateDocument['type']) => <Tag>{typeLabels[value] ?? value}</Tag>
    },
    {
      title: t('Expiration'),
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (value?: string | null) => {
        if (!value) return t('Sans expiration');
        const expired = dayjs(value).isBefore(dayjs(), 'day');
        return <Text type={expired ? 'danger' : undefined}>{dayjs(value).format('DD/MM/YYYY')}</Text>;
      }
    },
    {
      title: t('Visible au portail'),
      dataIndex: 'visibleToCoOwners',
      key: 'visibleToCoOwners',
      render: (value?: boolean) => <Tag color={value ? 'green' : undefined}>{value ? t('Oui') : t('Non')}</Tag>
    },
    {
      title: t('Document'),
      key: 'fileUrl',
      // Bouton « Ouvrir » / « Télécharger » : rien à exporter.
      exportable: false,
      render: (_: unknown, item: SyndicateDocument) =>
        isExternalUrl(item.fileUrl) ? (
          <Link href={item.fileUrl} target="_blank" rel="noopener noreferrer">
            {t('Ouvrir')}
          </Link>
        ) : (
          <Button
            size="small"
            icon={<DownloadOutlined />}
            loading={downloadingId === item.id}
            onClick={() => void download(item)}
          >
            {t('Télécharger')}
          </Button>
        )
    },
    ...(canEdit
      ? [
          {
            title: t('Portail'),
            key: 'visibility',
            // Bouton d'action : rien à exporter.
            exportable: false,
            render: (_: unknown, item: SyndicateDocument) => (
              <ConfirmAction
                title={
                  item.visibleToCoOwners
                    ? t('Retirer ce document du portail des copropriétaires ?')
                    : t('Rendre ce document visible des copropriétaires ?')
                }
                okText={t('Confirmer')}
                cancelText={t('Annuler')}
                onConfirm={() => toggleVisibility(item)}
              >
                <Button size="small">{item.visibleToCoOwners ? t('Retirer du portail') : t('Rendre visible')}</Button>
              </ConfirmAction>
            )
          }
        ]
      : [])
  ];

  return (
    <Table
      helpId="syndic.documents.tableau"
      {...local.tableProps}
      aria-label={t('Documents')}
      exportFilename={t('Documents')}
      exportFetchAll={local.exportAll}
      scroll={{ x: 'max-content' }}
      rowKey="id"
      columns={columns}
      loading={loading}
      locale={local.isFiltered ? undefined : { emptyText: t('Aucun document disponible') }}
    />
  );
};
