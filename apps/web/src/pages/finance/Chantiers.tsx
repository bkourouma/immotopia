import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Button, DatePicker, Input, Modal, Select, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import { createConstructionSite, listConstructionSites } from '../../services/finance-lot2-service';
import { SITE_STATUS_LABELS } from '../../types/finance-lot2-types';
import type { ConstructionSite } from '../../types/finance-lot2-types';
import { listProperties } from '../../services/property-service';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, MoneyValue, DataView, DataCard, StatusTag } from '../../components/primitives';
import { t } from '../../i18n/t';
import { localizedList } from '../../i18n/localized';
import { HelpSectionTitle } from '../../help';

import { activeLocale } from '../../i18n/format';
/**
 * Chantiers — récit B7 du lot 2 (specs/017-finance-fournisseurs-chantiers/spec.md,
 * User Story 7).
 *
 * L'écran qui débloque le cas de la cliente : un chantier se crée **sans bien
 * préexistant**, pour un terrain loué où rien au patrimoine ne pouvait encore
 * l'accueillir. `propertyId` reste facultatif à la création — le bien pourra
 * être posé à la clôture, hors périmètre de ce lot.
 *
 * Construit sur le même modèle que `Fournisseurs.tsx` : mêmes primitives, même
 * recherche multicritères portée par l'URL (`useLocalListSearch`), mêmes trois
 * états délégués à `<DataView>`. `listConstructionSites` rend tous les chantiers
 * de l'agence d'un bloc : champ libre, statut, bien et coût réel filtrent la
 * liste en local (aucun critère n'est envoyé au serveur), et l'export reprend
 * toute la liste filtrée. Le parc des biens est chargé pour la
 * seule option facultative du formulaire de création, exactement comme
 * `BalanceClients.tsx` le fait pour son filtre « Bien ».
 *
 * **Le contrat de création est celui de `finance-lot2-service.ts`, gelé.**
 * `createConstructionSite` n'accepte que `name`, `zone`, `propertyId`,
 * `startDate`, `plannedEndDate` — aucun champ « responsable » n'y figure,
 * contrairement à ce que `ConstructionSite.managerLabel` pourrait laisser
 * attendre côté lecture. Le formulaire n'invente donc pas de champ que la
 * frontière réseau n'accepterait pas : la colonne « Responsable » de la liste
 * affiche `managerLabel` tel que le serveur le renseigne, sans qu'un geste de
 * cet écran ne puisse encore le poser.
 *
 * **Vocabulaire (P-1).** On *impute*, jamais « débit » ni « crédit ».
 *
 * **Aucune saisie du coût réel (P-4).** `ConstructionSite.actualCost` est
 * calculé côté serveur ; ce formulaire de création ne le propose évidemment
 * pas, et aucun autre écran de ce module ne l'offre non plus.
 */

const OPTIONS_STATUT = localizedList(() =>
  Object.entries(SITE_STATUS_LABELS).map(([value, label]) => ({ value, label }))
);

// Champ libre : nom, zone, bien et responsable, tels qu'affichés dans le tableau.
const TEXTE_RECHERCHE = [
  (c: ConstructionSite) => c.name,
  (c: ConstructionSite) => c.zone,
  (c: ConstructionSite) => c.propertyLabel,
  (c: ConstructionSite) => c.managerLabel
];

// Valeur lue par les critères non textuels, par clé de critère.
const ACCESSEURS = {
  status: (c: ConstructionSite) => c.status,
  bien: (c: ConstructionSite) => c.propertyId,
  cout: (c: ConstructionSite) => c.actualCost
};

function dateCourte(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(activeLocale()) : '—';
}

export const Chantiers: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // `loadOptions` et `resolveLabel` sont gelés au premier rendu par la barre : ils lisent
  // l'agence et le client de requêtes à jour par cette ref, jamais par fermeture.
  const contexteRef = useRef({ tenantId, queryClient });
  contexteRef.current = { tenantId, queryClient };

  const [modalOuvert, setModalOuvert] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [nom, setNom] = useState('');
  const [zone, setZone] = useState('');
  const [propertyId, setPropertyId] = useState<string | undefined>(undefined);
  // Sélecteur « Bien » à recherche distante : la saisie est temporisée, et le
  // libellé du bien choisi est gardé à part pour rester lisible quand il sort
  // des 20 résultats de la recherche courante.
  const [saisieBien, setSaisieBien] = useState('');
  const [rechercheBien, setRechercheBien] = useState('');
  const [bienChoisi, setBienChoisi] = useState<{ value: string; label: string } | undefined>(undefined);
  const [dateDebut, setDateDebut] = useState<Dayjs | null>(null);
  const [dateFinPrevue, setDateFinPrevue] = useState<Dayjs | null>(null);

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('construction-sites', tenantId),
    queryFn: () => listConstructionSites(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  useEffect(() => {
    const minuteur = setTimeout(() => setRechercheBien(saisieBien.trim()), 300);
    return () => clearTimeout(minuteur);
  }, [saisieBien]);

  // Options du bien, facultatif : recherche distante (20 résultats au plus),
  // lancée seulement quand le formulaire de création est ouvert. Il faut un
  // identifiant, et la liste des chantiers n'en porte pas dans ses libellés.
  const { data: parc, isFetching: rechercheBienEnCours } = useQuery({
    queryKey: queryKey('finance-parc', tenantId, { q: rechercheBien, limit: 20 }),
    queryFn: () => listProperties(tenantId as string, { q: rechercheBien, page: 1, limit: 20 }),
    enabled: Boolean(tenantId) && modalOuvert,
    staleTime: STALE_TIME.reference
  });

  const optionsBiens = useMemo(() => {
    const options = (parc?.properties ?? []).map(bien => ({ value: bien.id, label: bien.title }));
    if (bienChoisi && !options.some(o => o.value === bienChoisi.value)) options.unshift(bienChoisi);
    return options;
  }, [parc, bienChoisi]);

  const chantiers = data ?? [];

  // Déclarés dans le corps : les libellés se retraduisent au changement de langue.
  const criteres: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Nom, zone, bien, responsable…')
    },
    { key: 'status', type: 'select', label: t('Statut'), primary: true, options: OPTIONS_STATUT },
    {
      key: 'bien',
      type: 'select',
      label: t('Bien'),
      primary: true,
      placeholder: t('Tous les biens'),
      // Recherche distante : 20 biens au plus, jamais le parc entier.
      loadOptions: async terme => {
        const reponse = await listProperties(contexteRef.current.tenantId as string, { q: terme, page: 1, limit: 20 });
        return reponse.properties.map(bien => ({ value: bien.id, label: bien.title }));
      },
      // Libellé d'un bien venu de l'URL : celui que portent déjà les chantiers.
      resolveLabel: async id => {
        const { tenantId: agence, queryClient: client } = contexteRef.current;
        const liste = await client.fetchQuery({
          queryKey: queryKey('construction-sites', agence),
          queryFn: () => listConstructionSites(agence as string),
          staleTime: STALE_TIME.list
        });
        return liste.find(c => c.propertyId === id)?.propertyLabel ?? undefined;
      }
    },
    { key: 'cout', type: 'numberRange', label: t('Coût réel'), unit: 'FCFA' }
  ];
  const local = useLocalListSearch<ConstructionSite>(data, {
    criteria: criteres,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const reinitialiserFormulaire = () => {
    setNom('');
    setZone('');
    setPropertyId(undefined);
    setBienChoisi(undefined);
    setSaisieBien('');
    setRechercheBien('');
    setDateDebut(null);
    setDateFinPrevue(null);
  };

  const ouvrirCreation = () => {
    reinitialiserFormulaire();
    setModalOuvert(true);
  };

  const fermerCreation = () => {
    if (!creationEnCours) setModalOuvert(false);
  };

  const validerCreation = async () => {
    if (!nom.trim()) {
      message.error(t('Le nom du chantier est obligatoire.'));
      return;
    }
    setCreationEnCours(true);
    try {
      const chantier = await createConstructionSite(tenantId, {
        name: nom.trim(),
        zone: zone.trim() || undefined,
        propertyId,
        startDate: dateDebut ? dateDebut.format('YYYY-MM-DD') : undefined,
        plannedEndDate: dateFinPrevue ? dateFinPrevue.format('YYYY-MM-DD') : undefined
      });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('construction-sites', tenantId) });
      message.success(t('Chantier « {{name}} » créé.', { name: chantier.name }));
      setModalOuvert(false);
      navigate(`/tenant/${tenantId}/finance/chantiers/${chantier.id}`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La création du chantier a échoué.'));
    } finally {
      setCreationEnCours(false);
    }
  };

  const ouvrirDetail = (chantier: ConstructionSite) => navigate(`/tenant/${tenantId}/finance/chantiers/${chantier.id}`);

  const colonnes: ColumnsType<ConstructionSite> = [
    { title: t('Chantier'), key: 'nom', render: (_, c) => c.name },
    { title: t('Zone'), key: 'zone', render: (_, c) => c.zone || '—' },
    { title: t('Bien'), key: 'bien', render: (_, c) => c.propertyLabel ?? t('Sans bien (terrain loué)') },
    { title: t('Responsable'), key: 'responsable', render: (_, c) => c.managerLabel ?? '—' },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, c) => <StatusTag status={c.status} label={SITE_STATUS_LABELS[c.status]} />
    },
    {
      title: t('Coût réel'),
      key: 'cout',
      align: 'end',
      // Calculé côté serveur (P-4) : cette colonne se contente de l'afficher.
      exportValue: c => c.actualCost,
      render: (_, c) => <MoneyValue value={c.actualCost} />
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, c) => (
        <Button type="link" onClick={() => ouvrirDetail(c)}>
          {t('Voir le détail')}
        </Button>
      )
    }
  ];

  return (
    <>
      <PageHeader
        helpId="finance.chantiers.page"
        title={t('Chantiers')}
        subtitle={
          chantiers.length > 0
            ? t('{{nombre}} chantier{{s}}', { nombre: chantiers.length, s: chantiers.length > 1 ? 's' : '' })
            : undefined
        }
        primaryAction={{ label: t('Nouveau chantier'), icon: <PlusOutlined />, onClick: ouvrirCreation }}
      />

      <DataView<ConstructionSite>
        helpId="finance.chantiers.tableau"
        // Le contrat de `listConstructionSites` ne pagine pas : recherche et
        // pagination (20 par page) sont locales ; l'export reprend toute la
        // liste filtrée.
        scrollX={960}
        {...local.dataViewProps}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger les chantiers.') : null}
        errorCause={erreurRequete}
        onRetry={() => refetch()}
        emptyDescription={t("Aucun chantier n'est encore enregistré.")}
        emptyAction={{ label: t('Nouveau chantier'), onClick: ouvrirCreation }}
        columns={colonnes}
        rowKey={c => c.id}
        aria-label={t('Chantiers')}
        export={{ filename: t('Chantiers'), fetchAll: local.exportAll }}
        renderCard={c => (
          <DataCard
            title={c.name}
            aria-label={c.name}
            subtitle={[c.zone, c.propertyLabel ?? t('Sans bien (terrain loué)')].filter(Boolean).join(' · ')}
            status={<StatusTag status={c.status} label={SITE_STATUS_LABELS[c.status]} />}
            highlight={<MoneyValue value={c.actualCost} />}
            fields={[
              { label: t('Responsable'), value: c.managerLabel ?? '—' },
              { label: t('Début'), value: dateCourte(c.startDate) }
            ]}
            onOpen={() => ouvrirDetail(c)}
          />
        )}
      />

      <Modal
        title={<HelpSectionTitle title={t('Nouveau chantier')} helpId="finance.chantiers.nouveau" />}
        open={modalOuvert}
        onCancel={fermerCreation}
        confirmLoading={creationEnCours}
        onOk={validerCreation}
        okText={t('Créer le chantier')}
        cancelText={t('Annuler')}
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <label htmlFor="chantier-nom">{t('Nom du chantier')}</label>
            <Input
              id="chantier-nom"
              value={nom}
              onChange={event => setNom(event.target.value)}
              placeholder={t('Ex. Villa duplex — Angré Centre')}
            />
          </div>
          <div>
            <label htmlFor="chantier-zone">{t('Zone')}</label>
            <Input
              id="chantier-zone"
              value={zone}
              onChange={event => setZone(event.target.value)}
              placeholder={t('Ex. Angré, Cocody')}
            />
          </div>
          <div>
            <label htmlFor="chantier-bien">{t('Bien (facultatif)')}</label>
            <Select
              id="chantier-bien"
              style={{ width: '100%' }}
              allowClear
              showSearch
              filterOption={false}
              onSearch={setSaisieBien}
              loading={rechercheBienEnCours}
              placeholder={t('Aucun bien — pourra en recevoir un à la clôture')}
              value={propertyId}
              onChange={(valeur, option) => {
                setPropertyId(valeur);
                const libelle = (option as { label?: unknown } | undefined)?.label;
                setBienChoisi(valeur && typeof libelle === 'string' ? { value: valeur, label: libelle } : undefined);
              }}
              options={optionsBiens}
            />
          </div>
          <Space style={{ width: '100%' }} size="middle">
            <div style={{ flex: 1 }}>
              <label htmlFor="chantier-debut">{t('Début')}</label>
              <DatePicker
                id="chantier-debut"
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                value={dateDebut}
                onChange={setDateDebut}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="chantier-fin">{t('Fin prévue')}</label>
              <DatePicker
                id="chantier-fin"
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                value={dateFinPrevue}
                onChange={setDateFinPrevue}
                disabledDate={current => (dateDebut ? current.isBefore(dateDebut, 'day') : false)}
              />
            </div>
          </Space>
        </Space>
      </Modal>
    </>
  );
};

export default Chantiers;
