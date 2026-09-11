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
  RentalPenalty
} from '../../services/rental-service';
import { API_URL } from '../../config/api';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, MoneyValue, DataView, DataCard, useConfirmAction } from '../../components/primitives';

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

/** Montant réellement retenu : l'ajustement s'il existe, le calcul sinon. */
function montantRetenu(penalite: RentalPenalty): number {
  return penalite.adjusted_amount ?? penalite.amount;
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
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
      message.success('Pénalités calculées.');
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Le calcul a échoué.');
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
      message.success('Pénalité ajustée.');
    } catch (err: any) {
      message.error(err?.response?.data?.message || "L'ajustement a échoué.");
    }
  };

  const handleDelete = (penalite: RentalPenalty) => {
    if (!tenantId) return;
    confirmAction({
      title: 'Supprimer cette pénalité ?',
      description: `Pénalité de ${penalite.days_late} jour${penalite.days_late > 1 ? 's' : ''} de retard. Cette action est irréversible.`,
      okText: 'Supprimer',
      danger: true,
      onConfirm: async () => {
        try {
          await deletePenalty(tenantId, penalite.id);
          await rafraichir();
          message.success('Pénalité supprimée.');
        } catch (err: any) {
          message.error(err?.response?.data?.message || 'La suppression a échoué.');
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
      message.success('Justificatif enregistré.');
    } catch (err: any) {
      message.error(err?.response?.data?.message || "L'envoi du justificatif a échoué.");
    } finally {
      setEnvoiEnCours(false);
    }
  };

  const ouvrirJustificatif = (fichier: Justificatif | null) => {
    if (!fichier?.fileUrl) return;
    window.open(`${API_URL.replace(/\/api$/, '')}${fichier.fileUrl}`, '_blank', 'noopener,noreferrer');
  };

  if (!tenantId) {
    return <StateBlock variant="empty" title="Aucune agence sélectionnée" />;
  }

  const actionsSecondaires = (p: RentalPenalty) => [
    {
      key: 'just',
      label: justificatif(p) ? 'Remplacer le justificatif' : 'Ajouter un justificatif',
      onClick: () => setJustifiePour(p)
    },
    { type: 'divider' as const },
    { key: 'del', label: 'Supprimer', danger: true, onClick: () => handleDelete(p) }
  ];

  const colonnes: ColumnsType<RentalPenalty> = [
    { title: 'Calculée le', key: 'date', render: (_, p) => dateCourte(p.calculated_at) },
    {
      title: 'Retard',
      key: 'retard',
      render: (_, p) => `${p.days_late} jour${p.days_late > 1 ? 's' : ''}`
    },
    {
      title: 'Montant calculé',
      key: 'montant',
      align: 'right',
      render: (_, p) => <MoneyValue value={p.amount} currency={p.currency} />
    },
    {
      title: 'Montant retenu',
      key: 'retenu',
      align: 'right',
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
      title: 'Actions',
      key: 'actions',
      align: 'right',
      render: (_, p) => {
        const fichier = justificatif(p);
        return (
          <Space>
            {fichier && (
              <Button type="link" icon={<DownloadOutlined />} onClick={() => ouvrirJustificatif(fichier)}>
                Justificatif
              </Button>
            )}
            <Button onClick={() => ouvrirAjustement(p)}>Ajuster</Button>
            {/* Le même menu qu'en carte : ajouter ou remplacer un justificatif,
                supprimer. Sans lui, ces deux actions n'existaient plus du tout
                au-dessus de 992 px. */}
            <Dropdown menu={{ items: actionsSecondaires(p) }} trigger={['click']} placement="bottomRight">
              <Button
                icon={<MoreOutlined />}
                aria-label={`Autres actions pour la pénalité du ${dateCourte(p.calculated_at)}`}
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
          Montant calculé : <MoneyValue value={ajustePour.amount} currency={ajustePour.currency} /> ·{' '}
          {ajustePour.days_late} jour{ajustePour.days_late > 1 ? 's' : ''} de retard
        </Text>
      )}
      <Form.Item
        label="Montant retenu"
        name="montant"
        rules={[{ required: true, message: 'Indiquez le montant retenu.' }]}
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
        label="Raison de l'ajustement"
        name="raison"
        // La raison est exigée : un montant modifié sans justification écrite
        // est indéfendable devant le locataire comme devant le propriétaire.
        rules={[{ required: true, message: 'Indiquez pourquoi le montant est ajusté.' }]}
      >
        <Input.TextArea rows={4} placeholder="Geste commercial, erreur de date, accord amiable…" />
      </Form.Item>
      <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
        <Button onClick={() => setAjustePour(null)} style={{ marginRight: 'var(--space-2)' }}>
          Annuler
        </Button>
        <Button type="primary" htmlType="submit">
          Enregistrer l'ajustement
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
            Justificatif actuel : {justificatif(justifiePour)?.fileName || 'fichier'}
          </div>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => ouvrirJustificatif(justificatif(justifiePour))}
          >
            Ouvrir
          </Button>
          <div style={{ marginTop: 'var(--space-2)', color: 'var(--text-secondary)' }}>
            Le nouveau fichier remplacera celui-ci.
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
        <p>Déposez le fichier ici, ou touchez pour le choisir</p>
        <p style={{ color: 'var(--text-secondary)' }}>PDF, Word ou image (JPEG, PNG)</p>
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
        title="Pénalités"
        subtitle={penalites.length > 0 ? `${penalites.length} pénalité${penalites.length > 1 ? 's' : ''}` : undefined}
        primaryAction={{
          label: 'Calculer les pénalités',
          icon: <ReloadOutlined />,
          onClick: handleCalculate,
          loading: calculEnCours
        }}
      />

      <DataView<RentalPenalty>
        items={penalites}
        // L'API ne pagine pas les pénalités : elle renvoie tout. Annoncer
        // `items.length` n'est donc pas un raccourci, c'est le total réel de ce
        // que le serveur a rendu. Aucune pagination ne s'affiche, parce qu'il
        // n'y en a pas à offrir.
        total={penalites.length}
        page={1}
        pageSize={Math.max(penalites.length, 1)}
        onPageChange={() => {}}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? 'Impossible de charger les pénalités.' : null}
        onRetry={() => refetch()}
        emptyDescription={
          leaseId
            ? 'Aucune pénalité pour ce bail. Lancez le calcul si des échéances sont en retard.'
            : 'Aucune pénalité enregistrée.'
        }
        columns={colonnes}
        rowKey={p => p.id}
        aria-label="Pénalités de retard"
        renderCard={p => {
          const fichier = justificatif(p);
          return (
            <DataCard
              title={`${p.days_late} jour${p.days_late > 1 ? 's' : ''} de retard`}
              aria-label={`Pénalité du ${dateCourte(p.calculated_at)}`}
              subtitle={`Calculée le ${dateCourte(p.calculated_at)}`}
              highlight={<MoneyValue value={montantRetenu(p)} currency={p.currency} />}
              fields={[
                ...(p.adjusted_amount != null
                  ? [
                      { label: 'Montant calculé', value: <MoneyValue value={p.amount} currency={p.currency} /> },
                      { label: 'Raison', value: raisonAjustement(p) || '—' }
                    ]
                  : []),
                ...(fichier ? [{ label: 'Justificatif', value: fichier.fileName || 'fichier joint' }] : [])
              ]}
              primaryAction={{ label: 'Ajuster', onClick: () => ouvrirAjustement(p) }}
              secondaryActions={[
                ...(fichier
                  ? [{ key: 'open', label: 'Ouvrir le justificatif', onClick: () => ouvrirJustificatif(fichier) }]
                  : []),
                ...actionsSecondaires(p)
              ]}
            />
          );
        }}
      />

      {boite(Boolean(ajustePour), 'Ajuster la pénalité', () => setAjustePour(null), formulaireAjustement, '80%')}
      {boite(Boolean(justifiePour), 'Justificatif', () => setJustifiePour(null), formulaireJustificatif, '70%')}
    </>
  );
};
