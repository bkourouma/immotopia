import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, App, Button, Checkbox, Form, Input, Modal, Select, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listStockTakers, updateStockTaker } from '../../services/finance-stock-controle-service';
import type { StockPerson, StockTakerView, UpdateTakerRequest } from '../../types/finance-stock-controle-types';
import { STOCK_FIELD_CONTEXT_ENTITY, useStockFieldContext } from '../../hooks/useStockFieldContext';
import { StockTakerForm } from '../../components/finance/stock/StockTakerForm';
import { entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  DataCard,
  DataView,
  PageHeader,
  SkeletonList,
  StateBlock,
  StatusTag,
  useConfirmAction
} from '../../components/primitives';
import { ModuleNotIncluded } from '../../components/primitives/ModuleNotIncluded';
import { isModuleNotIncludedError } from '../../utils/module-not-included';
import { t } from '../../i18n/t';

const { Text } = Typography;

/**
 * E4 — Carnet des preneurs (lot 040, ecrans §9, spec B2).
 *
 * Les personnes qui emportent la marchandise : chefs d'équipe, tâcherons.
 * Le carnet ne garde que le nom, l'équipe et, si l'agence le souhaite, un
 * téléphone qu'on peut effacer (spec §10). Un preneur ne se supprime pas :
 * il se désactive, et ses sorties passées restent à son nom.
 *
 * Les gestes affichés viennent de `FieldContext.abilities` (une seule source,
 * ecrans §0.1 règle 3) : sans `canManageTakers`, la page se lit et ne
 * s'écrit pas, et la colonne « Téléphone » disparaît — le serveur rend
 * `phone = null` à cet appelant (spec B2-R6), afficher une colonne vide ferait
 * croire que personne n'a de numéro.
 */

const TAKERS_ENTITY = 'stock-takers';

interface ErreurServeur {
  status?: number;
  code?: string;
  message?: string;
  existingTakerId?: string;
}

function lireErreur(error: unknown): ErreurServeur {
  const response = (
    error as {
      response?: {
        status?: number;
        data?: { code?: unknown; message?: unknown; data?: { existingTakerId?: unknown } };
      };
    } | null
  )?.response;
  return {
    status: response?.status,
    code: typeof response?.data?.code === 'string' ? (response.data.code as string) : undefined,
    message: typeof response?.data?.message === 'string' ? (response.data.message as string) : undefined,
    existingTakerId:
      typeof response?.data?.data?.existingTakerId === 'string'
        ? (response.data.data.existingTakerId as string)
        : undefined
  };
}

/** Valeur d'option d'une personne liable : `EMPLOYEE:<id>` ou `CONTRACTOR:<id>`. */
function cleDePersonne(kind: StockPerson['kind'], id: string): string {
  return `${kind}:${id}`;
}

function clePersonneDuPreneur(taker: StockTakerView): string | undefined {
  if (taker.employeeId) return cleDePersonne('EMPLOYEE', taker.employeeId);
  if (taker.contractorId) return cleDePersonne('CONTRACTOR', taker.contractorId);
  return undefined;
}

// ---------------------------------------------------------------------------
// La correction d'un preneur
// ---------------------------------------------------------------------------

interface CorrectionValues {
  fullName: string;
  teamOrCompany?: string;
  phone?: string;
  person?: string;
}

function texte(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * Le corps du PATCH : les SEULS champs modifiés (ecrans §9). Un champ vidé
 * part à `null` (le service le fait), un lien changé envoie les deux
 * identifiants, l'un des deux à `null` (exclusifs, contrat).
 */
function correctionPatch(taker: StockTakerView, values: CorrectionValues): UpdateTakerRequest {
  const patch: UpdateTakerRequest = {};
  if (texte(values.fullName) !== texte(taker.fullName)) patch.fullName = values.fullName;
  if (texte(values.teamOrCompany) !== texte(taker.teamOrCompany)) patch.teamOrCompany = values.teamOrCompany ?? null;
  if (texte(values.phone) !== texte(taker.phone)) patch.phone = values.phone ?? null;
  const avant = clePersonneDuPreneur(taker);
  if ((values.person ?? undefined) !== avant) {
    const [kind, id] = (values.person ?? '').split(':');
    patch.employeeId = kind === 'EMPLOYEE' ? id : null;
    patch.contractorId = kind === 'CONTRACTOR' ? id : null;
  }
  return patch;
}

interface CorrectionProps {
  tenantId: string;
  taker: StockTakerView;
  people: StockPerson[];
  onDone: (updated: StockTakerView) => void;
  onCancel: () => void;
}

const CorrectionPreneur: React.FC<CorrectionProps> = ({ tenantId, taker, people, onDone, onCancel }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<CorrectionValues>();
  const [saving, setSaving] = useState(false);
  const [doublon, setDoublon] = useState(false);

  const submit = async (values: CorrectionValues) => {
    const patch = correctionPatch(taker, values);
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    setSaving(true);
    setDoublon(false);
    try {
      onDone(await updateStockTaker(tenantId, taker.id, patch));
    } catch (error) {
      const erreur = lireErreur(error);
      if (erreur.code === 'STOCK_TAKER_DUPLICATE') {
        setDoublon(true);
      } else {
        message.error(erreur.message || t('Le preneur n’a pas pu être corrigé.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form<CorrectionValues>
      form={form}
      layout="vertical"
      requiredMark="optional"
      onFinish={submit}
      initialValues={{
        fullName: taker.fullName,
        teamOrCompany: taker.teamOrCompany ?? undefined,
        phone: taker.phone ?? undefined,
        person: clePersonneDuPreneur(taker)
      }}
    >
      <Text type="secondary" style={{ display: 'block', marginBlockEnd: 12 }}>
        {t('Le nom du preneur est imprimé sur les bons de sortie. Ne saisissez que ce qui sert à le reconnaître.')}
      </Text>
      <Form.Item
        name="fullName"
        label={t('Nom complet')}
        rules={[
          { required: true, whitespace: true, message: t('Indiquez le nom complet du preneur.') },
          { min: 2, max: 120, message: t('Le nom compte de 2 à 120 caractères.') }
        ]}
      >
        <Input maxLength={120} autoComplete="off" />
      </Form.Item>
      <Form.Item name="teamOrCompany" label={t('Équipe ou entreprise')} rules={[{ max: 120 }]}>
        <Input maxLength={120} autoComplete="off" />
      </Form.Item>
      <Form.Item name="phone" label={t('Téléphone')} rules={[{ max: 30 }]}>
        <Input maxLength={30} inputMode="tel" autoComplete="off" />
      </Form.Item>
      {people.length > 0 ? (
        <Form.Item name="person" label={t('Lier à un employé ou un tâcheron')}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            options={people.map(person => ({
              value: cleDePersonne(person.kind, person.id),
              label:
                person.kind === 'EMPLOYEE'
                  ? t('{{name}} (employé)', { name: person.fullName })
                  : t('{{name}} (tâcheron)', { name: person.fullName })
            }))}
          />
        </Form.Item>
      ) : null}
      {doublon ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBlockEnd: 12 }}
          title={t('Un preneur actif porte déjà ce nom dans cette équipe.')}
        />
      ) : null}
      <Space>
        <Button type="primary" htmlType="submit" loading={saving} style={{ minHeight: 44 }}>
          {t('Enregistrer la correction')}
        </Button>
        <Button onClick={onCancel} style={{ minHeight: 44 }}>
          {t('Annuler')}
        </Button>
      </Space>
    </Form>
  );
};

// ---------------------------------------------------------------------------
// L'écran
// ---------------------------------------------------------------------------

export function StockPreneurs(): React.ReactElement {
  const { tenantId = '' } = useParams<{ tenantId: string }>();
  const contexte = useStockFieldContext(tenantId);

  const entete = <PageHeader title={t('Preneurs')} subtitle={t('Les personnes qui emportent la marchandise')} />;

  if (contexte.isLoading) {
    return (
      <>
        {entete}
        <SkeletonList rows={5} aria-label={t('Carnet des preneurs en cours de chargement')} />
      </>
    );
  }
  if (contexte.error || !contexte.data) {
    return (
      <>
        {entete}
        <EtatContexte error={contexte.error} onRetry={() => void contexte.refetch()} />
      </>
    );
  }
  const champ = contexte.data.data;
  return (
    <>
      {entete}
      <CarnetDesPreneurs tenantId={tenantId} canManage={champ.abilities.canManageTakers} people={champ.people} />
    </>
  );
}

/** Le contexte terrain a échoué : refus du stock, module absent, ou panne (ecrans §3.3). */
const EtatContexte: React.FC<{ error: unknown; onRetry: () => void }> = ({ error, onRetry }) => {
  if (isModuleNotIncludedError(error)) return <ModuleNotIncluded />;
  const erreur = lireErreur(error);
  if (erreur.status === 403) {
    return (
      <StateBlock
        variant="forbidden"
        title={t('Le stock ne vous est pas ouvert')}
        description={t(
          "Votre rôle ne comprend pas la consultation du stock. Demandez à l'administrateur de l'agence de vous attribuer le rôle Magasinier ou un rôle qui la comprend."
        )}
      />
    );
  }
  return (
    <StateBlock
      variant="error"
      description={erreur.message || t('Le stock n’a pas pu être chargé.')}
      actions={[{ label: t('Réessayer'), onClick: onRetry, primary: true }]}
    />
  );
};

interface CarnetProps {
  tenantId: string;
  canManage: boolean;
  people: StockPerson[];
}

const CarnetDesPreneurs: React.FC<CarnetProps> = ({ tenantId, canManage, people }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const confirmer = useConfirmAction();

  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');
  const [avecDesactives, setAvecDesactives] = useState(false);
  /** Preneur mis en avant après un doublon refusé (« Voir ce preneur »). */
  const [focus, setFocus] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const [correction, setCorrection] = useState<StockTakerView | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const filtres = { onlyActive: avecDesactives ? false : undefined, search: recherche || undefined };
  const liste = useQuery({
    queryKey: queryKey(TAKERS_ENTITY, tenantId, filtres),
    queryFn: () => listStockTakers(tenantId, filtres),
    staleTime: STALE_TIME.list,
    placeholderData: previous => previous
  });

  const preneurs = useMemo(() => {
    const tous = liste.data ?? [];
    return focus ? tous.filter(taker => taker.id === focus) : tous;
  }, [liste.data, focus]);

  /** Après une écriture : le carnet ET le contexte terrain (qui porte les preneurs). */
  const recharger = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: entityKeyPrefix(TAKERS_ENTITY, tenantId) }),
      queryClient.invalidateQueries({ queryKey: entityKeyPrefix(STOCK_FIELD_CONTEXT_ENTITY, tenantId) })
    ]);
  };

  const corriger = async (taker: StockTakerView, patch: UpdateTakerRequest, succes: string) => {
    setEnCours(taker.id);
    try {
      await updateStockTaker(tenantId, taker.id, patch);
      message.success(succes);
      await recharger();
    } catch (error) {
      message.error(lireErreur(error).message || t('Le preneur n’a pas pu être corrigé.'));
    } finally {
      setEnCours(null);
    }
  };

  const desactiver = (taker: StockTakerView) =>
    confirmer({
      title: t('Désactiver {{nom}} ?', { nom: taker.fullName }),
      description: t('Il ne pourra plus être choisi pour une sortie. Ses sorties passées restent à son nom.'),
      okText: t('Désactiver'),
      cancelText: t('Annuler'),
      onConfirm: () => corriger(taker, { isActive: false }, t('{{nom}} est désactivé.', { nom: taker.fullName }))
    });

  const reactiver = (taker: StockTakerView) =>
    void corriger(taker, { isActive: true }, t('{{nom}} est réactivé.', { nom: taker.fullName }));

  const effacerTelephone = (taker: StockTakerView) =>
    confirmer({
      title: t('Effacer le téléphone de {{nom}} ?', { nom: taker.fullName }),
      description: t('Le numéro est retiré du carnet. Le preneur reste dans le carnet.'),
      okText: t('Effacer le téléphone'),
      cancelText: t('Annuler'),
      onConfirm: () => corriger(taker, { phone: null }, t('Téléphone effacé.'))
    });

  const actions = (taker: StockTakerView): Array<{ key: string; label: string; onClick: () => void }> => {
    const liste: Array<{ key: string; label: string; onClick: () => void }> = [
      { key: 'corriger', label: t('Corriger'), onClick: () => setCorrection(taker) },
      taker.isActive
        ? { key: 'desactiver', label: t('Désactiver'), onClick: () => desactiver(taker) }
        : { key: 'reactiver', label: t('Réactiver'), onClick: () => reactiver(taker) }
    ];
    if (taker.phone) {
      liste.push({ key: 'telephone', label: t('Effacer le téléphone'), onClick: () => effacerTelephone(taker) });
    }
    return liste;
  };

  const statut = (taker: StockTakerView) =>
    taker.isActive ? (
      <StatusTag status="ACTIVE" tone="success" label={t('Actif')} />
    ) : (
      <StatusTag status="INACTIVE" tone="neutral" label={t('Désactivé')} />
    );

  const columns: ColumnsType<StockTakerView> = [
    { key: 'nom', title: t('Nom'), render: (_, taker) => <Text strong>{taker.fullName}</Text> },
    { key: 'equipe', title: t('Équipe ou entreprise'), render: (_, taker) => taker.teamOrCompany ?? '' },
    ...(canManage
      ? [{ key: 'telephone', title: t('Téléphone'), render: (_: unknown, taker: StockTakerView) => taker.phone ?? '' }]
      : []),
    { key: 'lien', title: t('Lié à'), render: (_, taker) => taker.linkedPersonLabel ?? '' },
    { key: 'statut', title: t('Statut'), render: (_, taker) => statut(taker) },
    ...(canManage
      ? [
          {
            key: 'actions',
            title: t('Actions'),
            align: 'end' as const,
            render: (_: unknown, taker: StockTakerView) => (
              <Space wrap>
                {actions(taker).map(action => (
                  <Button key={action.key} size="small" onClick={action.onClick} loading={enCours === taker.id}>
                    {action.label}
                  </Button>
                ))}
              </Space>
            )
          }
        ]
      : [])
  ];

  const carte = (taker: StockTakerView) => {
    const [premiere, ...autres] = canManage ? actions(taker) : [];
    const secondaires: MenuProps['items'] = autres.map(action => ({
      key: action.key,
      label: action.label,
      onClick: action.onClick
    }));
    return (
      <DataCard
        title={taker.fullName}
        subtitle={taker.teamOrCompany ?? undefined}
        status={statut(taker)}
        fields={[
          ...(canManage ? [{ label: t('Téléphone'), value: taker.phone ?? '' }] : []),
          { label: t('Lié à'), value: taker.linkedPersonLabel ?? '' }
        ]}
        primaryAction={premiere ? { label: premiere.label, onClick: premiere.onClick } : undefined}
        secondaryActions={secondaires.length ? secondaires : undefined}
      />
    );
  };

  const filtre = Boolean(recherche) || avecDesactives || Boolean(focus);

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        title={t(
          'Les sorties et les transferts sont enregistrés au nom du preneur, et son nom est imprimé sur les bons. Informez les personnes concernées. Le carnet ne garde que le nom, l’équipe et, si vous le souhaitez, un téléphone, que vous pouvez effacer à tout moment.'
        )}
      />

      <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Input.Search
            allowClear
            value={saisie}
            onChange={event => {
              setSaisie(event.target.value);
              if (!event.target.value) setRecherche('');
            }}
            onSearch={value => {
              setFocus(null);
              setRecherche(value.trim());
            }}
            placeholder={t('Rechercher un nom ou une équipe')}
            aria-label={t('Rechercher un nom ou une équipe')}
            style={{ minWidth: 240 }}
          />
          <Checkbox checked={avecDesactives} onChange={event => setAvecDesactives(event.target.checked)}>
            {t('Afficher les preneurs désactivés')}
          </Checkbox>
          {focus ? (
            <Button type="link" onClick={() => setFocus(null)}>
              {t('Afficher tout le carnet')}
            </Button>
          ) : null}
        </Space>
        {canManage ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreation(true)} style={{ minHeight: 44 }}>
            {t('Ajouter un preneur')}
          </Button>
        ) : null}
      </Space>

      <DataView<StockTakerView>
        aria-label={t('Carnet des preneurs')}
        items={preneurs}
        total={preneurs.length}
        page={1}
        pageSize={Math.max(preneurs.length, 1)}
        paginated={false}
        onPageChange={() => undefined}
        loading={liste.isLoading}
        isReloading={liste.isFetching && !liste.isLoading}
        error={liste.error ? lireErreur(liste.error).message || t('Le carnet n’a pas pu être chargé.') : null}
        onRetry={() => void liste.refetch()}
        isFiltered={filtre}
        onClearFilters={() => {
          setSaisie('');
          setRecherche('');
          setAvecDesactives(false);
          setFocus(null);
        }}
        emptyDescription={t(
          'Le carnet est vide. Ajoutez les chefs d’équipe et les tâcherons qui viennent chercher la marchandise.'
        )}
        emptyAction={canManage ? { label: t('Ajouter un preneur'), onClick: () => setCreation(true) } : undefined}
        rowKey={taker => taker.id}
        columns={columns}
        renderCard={carte}
      />

      <Modal
        open={creation}
        title={t('Ajouter un preneur')}
        footer={null}
        destroyOnHidden
        onCancel={() => setCreation(false)}
      >
        <StockTakerForm
          tenantId={tenantId}
          people={people}
          onCreated={async taker => {
            setCreation(false);
            message.success(t('{{nom}} est ajouté au carnet.', { nom: taker.fullName }));
            await recharger();
          }}
          onDuplicate={existingTakerId => {
            // « Voir ce preneur » : le carnet se restreint au preneur existant.
            setCreation(false);
            setSaisie('');
            setRecherche('');
            setFocus(existingTakerId);
          }}
          onCancel={() => setCreation(false)}
        />
      </Modal>

      <Modal
        open={correction !== null}
        title={t('Corriger un preneur')}
        footer={null}
        destroyOnHidden
        onCancel={() => setCorrection(null)}
      >
        {correction ? (
          <CorrectionPreneur
            tenantId={tenantId}
            taker={correction}
            people={people}
            onCancel={() => setCorrection(null)}
            onDone={async updated => {
              setCorrection(null);
              message.success(t('{{nom}} est corrigé.', { nom: updated.fullName }));
              await recharger();
            }}
          />
        ) : null}
      </Modal>
    </Space>
  );
};

export default StockPreneurs;
