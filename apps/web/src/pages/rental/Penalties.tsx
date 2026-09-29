import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { App, Button, Modal, Drawer, Form, Input, InputNumber, Upload, Typography, Space, Dropdown } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, UploadOutlined, DownloadOutlined, MoreOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listPenalties,
  calculatePenalties,
  updatePenalty,
  deletePenalty,
  uploadPenaltyJustification,
  downloadPenaltyJustification,
  RentalPenalty
} from '../../services/rental-service';
import { saveBlob } from '../../utils/save-blob';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, MoneyValue, DataView, DataCard, useConfirmAction } from '../../components/primitives';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Text } = Typography;

/**
 * Pénalités de retard — troisième des six écrans hybrides (§9.7).
 *
 * C'était le plus mélangé des quatre écrans `rental` : deux boîtes de dialogue
 * entièrement faites à la main en Tailwind — `fixed inset-0 bg-black` — avec des
 * boutons venus de `components/ui/`, des icônes `lucide-react`, et un
 * `<textarea>` portant quinze classes utilitaires. Le tout à côté d'un `<Table>`
 * d'Ant Design. Les deux boîtes deviennent une `<Modal>` au-dessus de 992 px et
 * un `<Drawer>` pleine hauteur en dessous.
 *
 * **Une pagination qui n'existe pas.** Le front affichait un compteur bâti sur
 * `data.length` et une page unique. Vérification faite côté API :
 * `listPenaltiesHandler` **ignore `page` et `limit`** et renvoie toutes les
 * pénalités de l'agence. Le type `PenaltyListResponse` déclarait pourtant un
 * champ `pagination` qui n'arrive jamais. L'écran ne prétend plus paginer : il
 * affiche ce que l'API rend, et le dit. Une agence avec plusieurs années
 * d'historique recevra tout en une réponse — c'est une limite du endpoint, pas
 * de cet écran, et elle est consignée en errata.
 *
 * **Sept colonnes derrière `scroll={{ x: 'max-content' }}`** et trois boutons
 * pleins par ligne. Cinq colonnes désormais, une action explicite et le reste
 * derrière « ⋮ ».
 *
 * Le code mort du calcul automatique — une fonction jamais appelée, son
 * `useEffect` laissé en commentaire — est retiré.
 */

interface PenaltiesProps {
  /** Fourni quand l'écran est monté en onglet d'un bail. */
  leaseId?: string;
}

/**
 * La raison d'ajustement et le justificatif partagent un champ texte, où ils
 * sont sérialisés en JSON. Le champ peut aussi contenir du texte brut, écrit
 * avant que ce format n'existe : les deux lectures doivent survivre.
 */
function champRaison(penalite: RentalPenalty): string | null {
  return (penalite as { override_reason?: string | null }).override_reason || penalite.adjustment_reason || null;
}

function raisonAjustement(penalite: RentalPenalty): string | null {
  const brut = champRaison(penalite);
  if (!brut) return null;
  try {
    return JSON.parse(brut).reason || brut;
  } catch {
    return brut;
  }
}

type Justificatif = { fileUrl?: string; fileName?: string };

function justificatif(penalite: RentalPenalty): Justificatif | null {
  const brut = champRaison(penalite);
  if (!brut) return null;
  try {
    return JSON.parse(brut).justification || null;
  } catch {
    return null;
  }
}

/**
 * Montant réellement retenu : `amount` côté API (l'ajustement s'il existe, le
 * calcul sinon).
 */
function montantRetenu(penalite: RentalPenalty): number {
  return penalite.adjusted_amount ?? penalite.amount;
}

/** Montant calculé d'origine ; null quand un ajustement ancien l'a perdu. */
function montantCalcule(penalite: RentalPenalty): number | null {
  if (penalite.adjusted_amount == null) return penalite.amount;
  return penalite.calculated_amount ?? null;
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

export const Penalties: React.FC<PenaltiesProps> = ({ leaseId: propLeaseId }) => {
  const { message } = App.useApp();
  const { tenantId, leaseId: paramLeaseId } = useParams<{ tenantId: string; leaseId?: string }>();
  const leaseId = propLeaseId || paramLeaseId;
  const queryClient = useQueryClient();
  const confirmAction = useConfirmAction();
  const { isDesktop } = useBreakpoint();

  const [ajustePour, setAjustePour] = useState<RentalPenalty | null>(null);
  const [justifiePour, setJustifiePour] = useState<RentalPenalty | null>(null);
  const [calculEnCours, setCalculEnCours] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [form] = Form.useForm<{ montant: number; raison: string }>();

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('penalties', tenantId, { leaseId: leaseId ?? '' }),
    queryFn: () => listPenalties(tenantId as string, { leaseId }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const penalites = data?.data ?? [];

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['penalties', tenantId] });

  const handleCalculate = async () => {
    if (!tenantId) return;
    setCalculEnCours(true);
    try {
      await calculatePenalties(tenantId);
      await rafraichir();
      message.success(t('Pénalités calculées.'));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('Le calcul a échoué.'));
    } finally {
      setCalculEnCours(false);
    }
  };

  const ouvrirAjustement = (penalite: RentalPenalty) => {
    setAjustePour(penalite);
    form.setFieldsValue({
      montant: montantRetenu(penalite),
      raison: raisonAjustement(penalite) || ''
    });
  };

  const handleAdjust = async () => {
    if (!tenantId || !ajustePour) return;
    const valeurs = await form.validateFields();
    try {
      await updatePenalty(tenantId, ajustePour.id, valeurs.montant, valeurs.raison.trim());
      setAjustePour(null);
      form.resetFields();
      await rafraichir();
      message.success(t('Pénalité ajustée.'));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'ajustement a échoué."));
    }
  };

  const handleDelete = (penalite: RentalPenalty) => {
    if (!tenantId) return;
    confirmAction({
      title: t('Supprimer cette pénalité ?'),
      description: t('Pénalité de {{days_late}} jour{{value}} de retard. Cette action est irréversible.', {
        days_late: penalite.days_late,
        value: penalite.days_late > 1 ? 's' : ''
      }),
      okText: t('Supprimer'),
      danger: true,
      onConfirm: async () => {
        try {
          await deletePenalty(tenantId, penalite.id);
          await rafraichir();
          message.success(t('Pénalité supprimée.'));
        } catch (err: any) {
          message.error(err?.response?.data?.message || t('La suppression a échoué.'));
        }
      }
    });
  };

  const handleUpload = async (fichier: File) => {
    if (!tenantId || !justifiePour) return;
    setEnvoiEnCours(true);
    try {
      await uploadPenaltyJustification(tenantId, justifiePour.id, fichier);
      setJustifiePour(null);
      await rafraichir();
      message.success(t('Justificatif enregistré.'));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'envoi du justificatif a échoué."));
    } finally {
      setEnvoiEnCours(false);
    }
  };

  // Le justificatif n'est plus lu en statique (`/uploads/rental/penalties`
  // répond 404) : il se télécharge par la route authentifiée de la pénalité.
  const ouvrirJustificatif = async (penalite: RentalPenalty) => {
    const fichier = justificatif(penalite);
    if (!tenantId || !fichier?.fileUrl) return;
    try {
      const { blob, filename } = await downloadPenaltyJustification(
        tenantId,
        penalite.id,
        fichier.fileName || 'justificatif'
      );
      saveBlob(blob, filename);
    } catch {
      message.error(t('Téléchargement impossible.'));
    }
  };

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const actionsSecondaires = (p: RentalPenalty) => [
    {
      key: 'just',
      label: justificatif(p) ? t('Remplacer le justificatif') : t('Ajouter un justificatif'),
      onClick: () => setJustifiePour(p)
    },
    { type: 'divider' as const },
    { key: 'del', label: t('Supprimer'), danger: true, onClick: () => handleDelete(p) }
  ];

  const colonnes: ColumnsType<RentalPenalty> = [
    { title: t('Calculée le'), key: 'date', render: (_, p) => dateCourte(p.calculated_at) },
    {
      title: t('Retard'),
      key: 'retard',
      render: (_, p) => `${p.days_late} jour${p.days_late > 1 ? 's' : ''}`
    },
    {
      title: t('Montant calculé'),
      key: 'montant',
      align: 'end',
      render: (_, p) =>
        montantCalcule(p) == null ? '—' : <MoneyValue value={montantCalcule(p) as number} currency={p.currency} />
    },
    {
      title: t('Montant retenu'),
      key: 'retenu',
      align: 'end',
      render: (_, p) => (
        <>
          <MoneyValue value={montantRetenu(p)} currency={p.currency} />
          {/* La raison n'a plus sa colonne : elle tient sous le montant, là où
              elle se lit, et ne prend de place que lorsqu'elle existe. */}
          {p.adjusted_amount != null && raisonAjustement(p) && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>{raisonAjustement(p)}</div>
          )}
        </>
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, p) => {
        const fichier = justificatif(p);
        return (
          <Space>
            {fichier && (
              <Button type="link" icon={<DownloadOutlined />} onClick={() => ouvrirJustificatif(p)}>
                {t('Justificatif')}
              </Button>
            )}
            <Button onClick={() => ouvrirAjustement(p)}>{t('Ajuster')}</Button>
            {/* Le même menu qu'en carte : ajouter ou remplacer un justificatif,
                supprimer. Sans lui, ces deux actions n'existaient plus du tout
                au-dessus de 992 px. */}
            <Dropdown menu={{ items: actionsSecondaires(p) }} trigger={['click']} placement="bottomRight">
              <Button
                icon={<MoreOutlined />}
                aria-label={t('Autres actions pour la pénalité du {{value}}', { value: dateCourte(p.calculated_at) })}
              />
            </Dropdown>
          </Space>
        );
      }
    }
  ];

  const formulaireAjustement = (
    <Form form={form} layout="vertical" onFinish={handleAdjust}>
      {ajustePour && (
        <Text type="secondary">
          {t('Montant calculé :')}{' '}
          <MoneyValue value={montantCalcule(ajustePour) ?? ajustePour.amount} currency={ajustePour.currency} /> ·{' '}
          {ajustePour.days_late} jour{ajustePour.days_late > 1 ? 's' : ''} de retard
        </Text>
      )}
      <Form.Item
        label={t('Montant retenu')}
        name="montant"
        rules={[{ required: true, message: t('Indiquez le montant retenu.') }]}
        style={{ marginTop: 'var(--space-4)' }}
      >
        <InputNumber<number>
          min={0}
          style={{ width: '100%' }}
          inputMode="numeric"
          formatter={valeur => (valeur == null ? '' : String(valeur).replace(/\B(?=(\d{3})+(?!\d))/g, ' '))}
          parser={texte => Number((texte || '').replace(/\s/g, '')) as 0}
        />
      </Form.Item>
      <Form.Item
        label={t("Raison de l'ajustement")}
        name="raison"
        // La raison est exigée : un montant modifié sans justification écrite
        // est indéfendable devant le locataire comme devant le propriétaire.
        rules={[{ required: true, message: t('Indiquez pourquoi le montant est ajusté.') }]}
      >
        <Input.TextArea rows={4} placeholder={t('Geste commercial, erreur de date, accord amiable…')} />
      </Form.Item>
      <Form.Item style={{ marginBottom: 0, textAlign: 'end' }}>
        <Button onClick={() => setAjustePour(null)} style={{ marginInlineEnd: 'var(--space-2)' }}>
          {t('Annuler')}
        </Button>
        <Button type="primary" htmlType="submit">
          {t("Enregistrer l'ajustement")}
        </Button>
      </Form.Item>
    </Form>
  );

  const formulaireJustificatif = justifiePour && (
    <>
      {justificatif(justifiePour) && (
        <div
          style={{
            padding: 'var(--space-3)',
            background: 'var(--surface-sunken)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)'
          }}
        >
          <div style={{ marginBottom: 'var(--space-2)' }}>
            {t('Justificatif actuel :')} {justificatif(justifiePour)?.fileName || 'fichier'}
          </div>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => ouvrirJustificatif(justifiePour)}>
            {t('Ouvrir')}
          </Button>
          <div style={{ marginTop: 'var(--space-2)', color: 'var(--text-secondary)' }}>
            {t('Le nouveau fichier remplacera celui-ci.')}
          </div>
        </div>
      )}
      <Upload.Dragger
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        maxCount={1}
        showUploadList={false}
        disabled={envoiEnCours}
        // L'envoi est piloté ici et non par le composant : il passe par le
        // service, donc par `apiClient` et ses intercepteurs.
        beforeUpload={fichier => {
          void handleUpload(fichier as File);
          return false;
        }}
      >
        <p style={{ fontSize: 32, margin: 0 }}>
          <UploadOutlined aria-hidden="true" />
        </p>
        <p>{t('Déposez le fichier ici, ou touchez pour le choisir')}</p>
        <p style={{ color: 'var(--text-secondary)' }}>{t('PDF, Word ou image (JPEG, PNG)')}</p>
      </Upload.Dragger>
    </>
  );

  /**
   * Boîte de dialogue : modale au-dessus de 992 px, feuille pleine hauteur en
   * dessous. Le §10.1 impose une page pleine dès quatre champs sous 768 px ;
   * `<FormSheet>` du Lot 3 unifiera les deux formes.
   */
  const boite = (ouvert: boolean, titre: string, fermer: () => void, contenu: React.ReactNode, hauteur: string) =>
    isDesktop ? (
      <Modal open={ouvert} title={titre} onCancel={fermer} footer={null} width={600} destroyOnHidden>
        {contenu}
      </Modal>
    ) : (
      <Drawer open={ouvert} title={titre} onClose={fermer} placement="bottom" height={hauteur} destroyOnHidden>
        {contenu}
      </Drawer>
    );

  return (
    <>
      <PageHeader
        title={t('Pénalités')}
        subtitle={
          penalites.length > 0
            ? t('{{length}} pénalité{{value}}', { length: penalites.length, value: penalites.length > 1 ? 's' : '' })
            : undefined
        }
        primaryAction={{
          label: t('Calculer les pénalités'),
          icon: <ReloadOutlined />,
          onClick: handleCalculate,
          loading: calculEnCours
        }}
      />

      <DataView<RentalPenalty>
        items={penalites}
        // L'API ne pagine pas les pénalités : elle renvoie tout. Annoncer
        // `items.length` n'est donc pas un raccourci, c'est le total réel de ce
        // que le serveur a rendu. `paginated={false}` le dit explicitement —
        // avant, l'absence de barre tenait à l'égalité entre `total` et
        // `pageSize`, ce qui se défaisait au premier changement du composant.
        paginated={false}
        total={penalites.length}
        page={1}
        pageSize={Math.max(penalites.length, 1)}
        onPageChange={() => {}}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger les pénalités.') : null}
        onRetry={() => refetch()}
        emptyDescription={
          leaseId
            ? t('Aucune pénalité pour ce bail. Lancez le calcul si des échéances sont en retard.')
            : t('Aucune pénalité enregistrée.')
        }
        columns={colonnes}
        rowKey={p => p.id}
        aria-label={t('Pénalités de retard')}
        renderCard={p => {
          const fichier = justificatif(p);
          return (
            <DataCard
              title={`${p.days_late} jour${p.days_late > 1 ? 's' : ''} de retard`}
              aria-label={t('Pénalité du {{value}}', { value: dateCourte(p.calculated_at) })}
              subtitle={t('Calculée le {{value}}', { value: dateCourte(p.calculated_at) })}
              highlight={<MoneyValue value={montantRetenu(p)} currency={p.currency} />}
              fields={[
                ...(p.adjusted_amount != null
                  ? [
                      {
                        label: t('Montant calculé'),
                        value:
                          montantCalcule(p) == null ? (
                            '—'
                          ) : (
                            <MoneyValue value={montantCalcule(p) as number} currency={p.currency} />
                          )
                      },
                      { label: 'Raison', value: raisonAjustement(p) || '—' }
                    ]
                  : []),
                ...(fichier ? [{ label: 'Justificatif', value: fichier.fileName || 'fichier joint' }] : [])
              ]}
              primaryAction={{ label: 'Ajuster', onClick: () => ouvrirAjustement(p) }}
              secondaryActions={[
                ...(fichier
                  ? [{ key: 'open', label: t('Ouvrir le justificatif'), onClick: () => ouvrirJustificatif(p) }]
                  : []),
                ...actionsSecondaires(p)
              ]}
            />
          );
        }}
      />

      {boite(Boolean(ajustePour), t('Ajuster la pénalité'), () => setAjustePour(null), formulaireAjustement, '80%')}
      {boite(Boolean(justifiePour), t('Justificatif'), () => setJustifiePour(null), formulaireJustificatif, '70%')}
    </>
  );
};
