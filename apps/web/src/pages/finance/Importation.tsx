import React, { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Checkbox,
  DatePicker,
  Descriptions,
  Input,
  Progress,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
  Upload
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadProps } from 'antd/es/upload';
import { InboxOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { listConstructionSites } from '../../services/finance-lot2-service';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock } from '../../components/primitives';
import {
  champsObligatoiresManquants,
  chargerReferentiel,
  DESCRIPTEURS,
  evaluerLigne,
  executerImport,
  lireClasseur,
  marquerDoublons,
  proposerRapprochement,
  REFERENTIEL_VIDE,
  trouverDescripteur
} from '../../lib/importation';
import type {
  CompteRenduImport,
  ContexteImportation,
  DescripteurNature,
  FeuilleLue,
  LigneEvaluee
} from '../../lib/importation';
import { aTraduire, t } from '../../i18n/t';

const { Text, Paragraph } = Typography;

/**
 * Importation — reprendre un suivi Excel dans le module finance.
 *
 * ---------------------------------------------------------------------------
 * Ce que cet écran ne sait pas
 * ---------------------------------------------------------------------------
 *
 * **Il ne connaît aucune nature de document.** Pas un `if` sur « pièce de
 * caisse », pas un champ nommé `beneficiary`. Tout ce qu'il sait tient dans
 * le contrat de `lib/importation/types.ts` : une nature déclare des champs,
 * un champ se reconnaît dans un en-tête, une ligne s'évalue, une pièce
 * s'enregistre. Ajouter la huitième nature se fait en écrivant un
 * descripteur dans `lib/importation/natures.ts` — ce fichier ne bouge pas.
 *
 * **Il n'envoie jamais le fichier.** `exceljs`, déjà présent dans
 * `apps/web`, le lit dans le navigateur. Seules les lignes que la personne a
 * validées partent, en données propres, par les services existants. Aucun
 * point d'entrée d'écriture n'a été créé, aucun fichier n'est stocké.
 *
 * **Il ne valide rien.** Les pièces naissent BROUILLON et rejoignent
 * « Pièces à valider » là où leur nature y passe. Rien n'entre en
 * comptabilité sans un regard humain, et un import raté se jette sans
 * séquelle.
 *
 * ---------------------------------------------------------------------------
 * Le parcours
 * ---------------------------------------------------------------------------
 *
 * 1. la nature, le chantier quand elle l'exige, la date par défaut ;
 * 2. le fichier — première feuille, première ligne non vide en en-têtes ;
 * 3. le rapprochement colonne ↔ champ, proposé puis corrigé à la main ;
 * 4. l'aperçu : valeurs résolues, cellules modifiables, erreurs et doublons
 *    signalés, une case à cocher par ligne ;
 * 5. l'import, sa progression, et le compte rendu ligne par ligne.
 *
 * Le vocabulaire du module est tenu : on **saisit**, on **valide**, on
 * **impute**. Jamais « débit » ni « crédit ».
 */

/** Les cinq étapes, dans l'ordre. L'écran ne recule que par les boutons. */
const ETAPES = [
  aTraduire('Le document'),
  aTraduire('Le fichier'),
  aTraduire('Les colonnes'),
  aTraduire("L'aperçu"),
  aTraduire("L'import")
];

/** Une ligne telle que la personne la modifie : du texte, et rien d'autre. */
interface BrouillonLigne {
  numero: number;
  textes: Record<string, string>;
  selectionnee: boolean;
}

export const Importation: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();

  const [etape, setEtape] = useState(0);
  const [natureCle, setNatureCle] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [dateParDefaut, setDateParDefaut] = useState<Dayjs>(dayjs());

  const [feuille, setFeuille] = useState<FeuilleLue | null>(null);
  const [nomFichier, setNomFichier] = useState<string>('');
  const [lectureEnCours, setLectureEnCours] = useState(false);
  const [rapprochement, setRapprochement] = useState<Array<string | null>>([]);

  const [brouillons, setBrouillons] = useState<BrouillonLigne[]>([]);
  const [empreintes, setEmpreintes] = useState<string[]>([]);
  const [preparationEnCours, setPreparationEnCours] = useState(false);

  const [progression, setProgression] = useState<{ traitees: number; total: number } | null>(null);
  const [compteRendu, setCompteRendu] = useState<CompteRenduImport | null>(null);

  const descripteur: DescripteurNature | null = trouverDescripteur(natureCle);

  // -------------------------------------------------------------------------
  // Les listes dont la nature a besoin
  // -------------------------------------------------------------------------

  const chantiers = useQuery({
    queryKey: queryKey('construction-sites', tenantId),
    queryFn: () => listConstructionSites(tenantId as string),
    // Tant qu'aucune nature n'est choisie, on ne sait pas si un chantier
    // servira : on ne charge rien. `descripteur?.chantier !== 'sans'` seul
    // était vrai avant le premier choix, et la liste partait pour rien.
    enabled: Boolean(tenantId) && descripteur !== null && descripteur.chantier !== 'sans',
    staleTime: STALE_TIME.list
  });

  const referentiel = useQuery({
    queryKey: queryKey('importation-referentiel', tenantId, { nature: natureCle }),
    queryFn: () => chargerReferentiel(tenantId as string, descripteur?.referentiels ?? []),
    enabled: Boolean(tenantId) && Boolean(descripteur),
    staleTime: STALE_TIME.list
  });

  const contexte: ContexteImportation = useMemo(
    () => ({
      tenantId: tenantId ?? '',
      siteId,
      dateParDefaut: dateParDefaut.format('YYYY-MM-DD'),
      referentiel: referentiel.data ?? REFERENTIEL_VIDE
    }),
    [tenantId, siteId, dateParDefaut, referentiel.data]
  );

  // -------------------------------------------------------------------------
  // Les lignes évaluées — recalculées à chaque frappe dans l'aperçu
  // -------------------------------------------------------------------------

  const lignes: LigneEvaluee[] = useMemo(() => {
    if (!descripteur) return [];
    const evaluees = brouillons.map(brouillon =>
      evaluerLigne(descripteur, brouillon.numero, brouillon.textes, contexte, brouillon.selectionnee)
    );
    return marquerDoublons(descripteur, evaluees, contexte, empreintes);
  }, [descripteur, brouillons, contexte, empreintes]);

  const enErreur = lignes.filter(ligne => ligne.erreurs.length > 0).length;
  const doublons = lignes.filter(ligne => ligne.doublon !== null).length;
  const aEnvoyer = lignes.filter(ligne => ligne.selectionnee && ligne.erreurs.length === 0).length;

  const manquants = descripteur ? champsObligatoiresManquants(descripteur, rapprochement) : [];

  // -------------------------------------------------------------------------
  // Étape 1 → 2
  // -------------------------------------------------------------------------

  const changerNature = (cle: string) => {
    setNatureCle(cle);
    setSiteId(null);
    setFeuille(null);
    setNomFichier('');
    setRapprochement([]);
    setBrouillons([]);
    setEmpreintes([]);
    setCompteRendu(null);
    setProgression(null);
  };

  const naturePrete =
    Boolean(descripteur) && (descripteur?.chantier !== 'exige' || Boolean(siteId)) && dateParDefaut.isValid();

  // -------------------------------------------------------------------------
  // Étape 2 — la lecture du classeur
  // -------------------------------------------------------------------------

  const lireLeFichier = useCallback(
    async (fichier: File) => {
      if (!descripteur) return;
      setLectureEnCours(true);
      try {
        const lue = await lireClasseur(fichier);
        setFeuille(lue);
        setNomFichier(fichier.name);
        setRapprochement(proposerRapprochement(lue.colonnes, descripteur.champs));
        setBrouillons([]);
        setCompteRendu(null);
        setEtape(2);
      } catch (erreur) {
        const code = erreur instanceof Error ? erreur.message : '';
        if (code === 'CLASSEUR_VIDE' || code === 'CLASSEUR_SANS_FEUILLE') {
          message.error(t('Ce classeur ne contient aucune ligne lisible.'));
        } else {
          message.error(t('Ce fichier n’a pas pu être lu. Attendu : un classeur Excel (.xlsx).'));
        }
      } finally {
        setLectureEnCours(false);
      }
    },
    [descripteur, message]
  );

  const proprietesDepot: UploadProps = {
    accept: '.xlsx,.xlsm',
    multiple: false,
    showUploadList: false,
    // `false` empêche tout envoi : le fichier reste dans le navigateur.
    beforeUpload: fichier => {
      void lireLeFichier(fichier as File);
      return false;
    }
  };

  // -------------------------------------------------------------------------
  // Étape 3 → 4 — l'aperçu
  // -------------------------------------------------------------------------

  const preparerApercu = useCallback(async () => {
    if (!descripteur || !feuille) return;
    setPreparationEnCours(true);
    try {
      const nouveaux: BrouillonLigne[] = feuille.lignes.map(ligne => {
        const textes: Record<string, string> = {};
        for (const champ of descripteur.champs) {
          const colonne = rapprochement.indexOf(champ.cle);
          textes[champ.cle] = colonne === -1 ? '' : (ligne.cellules[colonne] ?? '');
        }
        return { numero: ligne.numero, textes, selectionnee: true };
      });

      let connues: string[] = [];
      if (descripteur.chargerEmpreintes) {
        try {
          connues = await descripteur.chargerEmpreintes(contexte);
        } catch {
          // Une détection de doublon indisponible ne doit pas empêcher un
          // import : on le dit, et on continue sans elle.
          message.warning(t('Les pièces déjà saisies n’ont pas pu être lues : les doublons ne seront pas signalés.'));
        }
      }
      setEmpreintes(connues);
      setBrouillons(nouveaux);
      setEtape(3);
    } finally {
      setPreparationEnCours(false);
    }
  }, [descripteur, feuille, rapprochement, contexte, message]);

  const modifierCellule = (numero: number, cle: string, valeur: string) => {
    setBrouillons(precedents =>
      precedents.map(ligne =>
        ligne.numero === numero ? { ...ligne, textes: { ...ligne.textes, [cle]: valeur } } : ligne
      )
    );
  };

  const basculerLigne = (numero: number, cochee: boolean) => {
    setBrouillons(precedents =>
      precedents.map(ligne => (ligne.numero === numero ? { ...ligne, selectionnee: cochee } : ligne))
    );
  };

  const toutBasculer = (cochee: boolean) => {
    setBrouillons(precedents => precedents.map(ligne => ({ ...ligne, selectionnee: cochee })));
  };

  // -------------------------------------------------------------------------
  // Étape 5 — l'import
  // -------------------------------------------------------------------------

  const lancerImport = useCallback(async () => {
    if (!descripteur) return;
    setEtape(4);
    setCompteRendu(null);
    setProgression({ traitees: 0, total: aEnvoyer });
    const rendu = await executerImport({
      descripteur,
      lignes,
      contexte,
      surProgression: (traitees, total) => setProgression({ traitees, total })
    });
    setCompteRendu(rendu);
    setProgression(null);
    if (rendu.echouees.length === 0 && rendu.creees > 0) {
      message.success(t('{{creees}} pièce(s) saisie(s) en brouillon.', { creees: rendu.creees }));
    } else if (rendu.echouees.length > 0) {
      message.warning(
        t('{{creees}} créée(s), {{echouees}} refusée(s) par le serveur.', {
          creees: rendu.creees,
          echouees: rendu.echouees.length
        })
      );
    }
  }, [descripteur, lignes, contexte, aEnvoyer, message]);

  const recommencer = () => {
    setEtape(0);
    setFeuille(null);
    setNomFichier('');
    setRapprochement([]);
    setBrouillons([]);
    setEmpreintes([]);
    setCompteRendu(null);
    setProgression(null);
  };

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  // -------------------------------------------------------------------------
  // Les colonnes de l'aperçu
  // -------------------------------------------------------------------------

  const colonnesApercu: ColumnsType<LigneEvaluee> = descripteur
    ? [
        {
          title: (
            <Checkbox
              checked={brouillons.length > 0 && brouillons.every(ligne => ligne.selectionnee)}
              indeterminate={brouillons.some(l => l.selectionnee) && brouillons.some(l => !l.selectionnee)}
              onChange={evenement => toutBasculer(evenement.target.checked)}
              aria-label={t('Tout cocher')}
            />
          ),
          key: 'selection',
          width: 56,
          fixed: 'left',
          render: (_valeur, ligne) => (
            <Checkbox
              checked={ligne.selectionnee}
              onChange={evenement => basculerLigne(ligne.numero, evenement.target.checked)}
              aria-label={t('Importer la ligne {{numero}}', { numero: ligne.numero })}
            />
          )
        },
        {
          title: t('Ligne'),
          key: 'numero',
          width: 72,
          fixed: 'left',
          render: (_valeur, ligne) => <Text type="secondary">{ligne.numero}</Text>
        },
        ...descripteur.champs.map(champ => ({
          title: champ.obligatoire ? `${t(champ.libelle)} *` : t(champ.libelle),
          key: champ.cle,
          width: 220,
          render: (_valeur: unknown, ligne: LigneEvaluee) => {
            const cellule = ligne.cellules[champ.cle];
            return (
              <div>
                <Input
                  size="small"
                  status={cellule?.erreur ? 'error' : undefined}
                  value={cellule?.texte ?? ''}
                  onChange={evenement => modifierCellule(ligne.numero, champ.cle, evenement.target.value)}
                  aria-label={t('{{champ}}, ligne {{numero}}', { champ: t(champ.libelle), numero: ligne.numero })}
                />
                {cellule?.libelleResolu && cellule.libelleResolu !== cellule.texte ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {cellule.libelleResolu}
                  </Text>
                ) : null}
              </div>
            );
          }
        })),
        {
          title: t('État'),
          key: 'etat',
          width: 280,
          render: (_valeur, ligne) => {
            if (ligne.erreurs.length > 0) {
              return (
                <Space direction="vertical" size={2}>
                  {ligne.erreurs.map(motif => (
                    <Text key={motif} type="danger" style={{ fontSize: 12 }}>
                      {motif}
                    </Text>
                  ))}
                </Space>
              );
            }
            if (ligne.doublon) {
              return (
                <Space direction="vertical" size={2}>
                  <Tag color="warning">{t('Doublon probable')}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {ligne.doublon}
                  </Text>
                </Space>
              );
            }
            return <Tag color="success">{t('Prête')}</Tag>;
          }
        }
      ]
    : [];

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------

  return (
    <div>
      <PageHeader
        title={t('Importation')}
        subtitle={t('Reprendre un suivi Excel : les pièces sont saisies en brouillon, jamais validées.')}
      />

      <Steps
        current={etape}
        size="small"
        style={{ marginBlockEnd: 'var(--space-6)' }}
        items={ETAPES.map(libelle => ({ title: t(libelle) }))}
      />

      {/* ---------------------------------------------------------------- */}
      {/* Étape 1 — le document                                            */}
      {/* ---------------------------------------------------------------- */}
      {etape === 0 ? (
        <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 640 }}>
          <div>
            <Text strong>{t('Type de document')}</Text>
            <Select
              style={{ width: '100%', marginBlockStart: 'var(--space-1)' }}
              placeholder={t('Choisir ce que le fichier contient')}
              value={natureCle ?? undefined}
              onChange={changerNature}
              showSearch
              optionFilterProp="label"
              options={DESCRIPTEURS.map(nature => ({ value: nature.cle, label: t(nature.libelle) }))}
            />
          </div>

          {descripteur ? <Alert type="info" showIcon message={t(descripteur.description)} /> : null}

          {descripteur && descripteur.chantier !== 'sans' ? (
            <div>
              <Text strong>{descripteur.chantier === 'exige' ? t('Chantier') : t('Chantier (facultatif)')}</Text>
              <Select
                style={{ width: '100%', marginBlockStart: 'var(--space-1)' }}
                placeholder={t('Choisir un chantier')}
                value={siteId ?? undefined}
                onChange={valeur => setSiteId(valeur ?? null)}
                allowClear={descripteur.chantier === 'facultatif'}
                loading={chantiers.isPending}
                showSearch
                optionFilterProp="label"
                options={(chantiers.data ?? []).map(chantier => ({ value: chantier.id, label: chantier.name }))}
              />
            </div>
          ) : null}

          <div>
            <Text strong>{t('Date par défaut')}</Text>
            <DatePicker
              style={{ width: '100%', marginBlockStart: 'var(--space-1)' }}
              value={dateParDefaut}
              onChange={valeur => setDateParDefaut(valeur ?? dayjs())}
              allowClear={false}
              format="DD/MM/YYYY"
            />
            <Paragraph type="secondary" style={{ marginBlockStart: 'var(--space-1)', fontSize: 12 }}>
              {t('Elle sert aux lignes dont le fichier ne porte aucune date.')}
            </Paragraph>
          </div>

          {referentiel.isError ? (
            <Alert
              type="error"
              showIcon
              message={t('Les listes de référence n’ont pas pu être chargées.')}
              action={
                <Button size="small" onClick={() => void referentiel.refetch()}>
                  {t('Réessayer')}
                </Button>
              }
            />
          ) : null}

          <Button
            type="primary"
            disabled={!naturePrete || referentiel.isPending || referentiel.isError}
            loading={Boolean(descripteur) && referentiel.isPending}
            onClick={() => setEtape(1)}
          >
            {t('Continuer')}
          </Button>
        </Space>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Étape 2 — le fichier                                             */}
      {/* ---------------------------------------------------------------- */}
      {etape === 1 && descripteur ? (
        <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 640 }}>
          <Upload.Dragger {...proprietesDepot} disabled={lectureEnCours}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">{t('Déposer le fichier Excel, ou cliquer pour le choisir')}</p>
            <p className="ant-upload-hint">
              {t('Le fichier reste sur ce poste : il est lu ici et n’est jamais envoyé.')}
            </p>
          </Upload.Dragger>
          {lectureEnCours ? <Text type="secondary">{t('Lecture du classeur…')}</Text> : null}
          <Button onClick={() => setEtape(0)}>{t('Revenir au document')}</Button>
        </Space>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Étape 3 — les colonnes                                           */}
      {/* ---------------------------------------------------------------- */}
      {etape === 2 && descripteur && feuille ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label={t('Fichier')}>{nomFichier}</Descriptions.Item>
            <Descriptions.Item label={t('Feuille lue')}>{feuille.nomFeuille}</Descriptions.Item>
            <Descriptions.Item label={t('Lignes trouvées')}>{feuille.lignes.length}</Descriptions.Item>
          </Descriptions>

          {manquants.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              message={t('Champs obligatoires non rapprochés')}
              description={manquants.map(champ => t(champ.libelle)).join(' · ')}
            />
          ) : null}

          <Table
            size="small"
            pagination={false}
            rowKey={(_ligne, index) => String(index)}
            dataSource={feuille.colonnes.map((entete, index) => ({ entete, index }))}
            columns={[
              { title: t('Colonne du fichier'), dataIndex: 'entete', key: 'entete' },
              {
                title: t('Exemple'),
                key: 'exemple',
                render: (_valeur, ligne: { index: number }) => (
                  <Text type="secondary">{feuille.lignes[0]?.cellules[ligne.index] ?? ''}</Text>
                )
              },
              {
                title: t('Champ du document'),
                key: 'champ',
                render: (_valeur, ligne: { index: number }) => {
                  const choisi = rapprochement[ligne.index];
                  const champ = descripteur.champs.find(candidat => candidat.cle === choisi);
                  return (
                    <div>
                      <Select
                        style={{ width: '100%', minWidth: 220 }}
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder={t('Ne pas importer cette colonne')}
                        value={choisi ?? undefined}
                        onChange={valeur =>
                          setRapprochement(precedent =>
                            precedent.map((cle, index) => {
                              if (index === ligne.index) return valeur ?? null;
                              // Un champ ne peut servir qu'une fois : le
                              // reprendre ici le libère là où il était.
                              return valeur && cle === valeur ? null : cle;
                            })
                          )
                        }
                        options={descripteur.champs.map(candidat => ({
                          value: candidat.cle,
                          label: candidat.obligatoire ? `${t(candidat.libelle)} *` : t(candidat.libelle)
                        }))}
                      />
                      {champ?.aide ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {t(champ.aide)}
                        </Text>
                      ) : null}
                    </div>
                  );
                }
              }
            ]}
          />

          <Space>
            <Button onClick={() => setEtape(1)}>{t('Changer de fichier')}</Button>
            <Button
              type="primary"
              disabled={manquants.length > 0 || feuille.lignes.length === 0}
              loading={preparationEnCours}
              onClick={() => void preparerApercu()}
            >
              {t('Prévisualiser')}
            </Button>
          </Space>
        </Space>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Étape 4 — l'aperçu                                               */}
      {/* ---------------------------------------------------------------- */}
      {etape === 3 && descripteur ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message={t('Chaque cellule se corrige ici. Une ligne décochée n’est pas importée.')}
            description={t(
              '{{aEnvoyer}} ligne(s) prête(s), {{enErreur}} en erreur, {{doublons}} doublon(s) probable(s).',
              {
                aEnvoyer,
                enErreur,
                doublons
              }
            )}
          />

          {descripteur.doublonImpossible ? (
            <Alert type="warning" showIcon message={t(descripteur.doublonImpossible)} />
          ) : null}

          <Table
            size="small"
            rowKey={ligne => String(ligne.numero)}
            dataSource={lignes}
            columns={colonnesApercu}
            pagination={{ pageSize: 25, showSizeChanger: false }}
            scroll={{ x: 'max-content' }}
            rowClassName={ligne => (ligne.erreurs.length > 0 ? 'ligne-en-erreur' : '')}
          />

          <Space>
            <Button onClick={() => setEtape(2)}>{t('Revenir aux colonnes')}</Button>
            <Button type="primary" disabled={aEnvoyer === 0} onClick={() => void lancerImport()}>
              {t('Importer {{nombre}} ligne(s)', { nombre: aEnvoyer })}
            </Button>
          </Space>
        </Space>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Étape 5 — l'import et son compte rendu                           */}
      {/* ---------------------------------------------------------------- */}
      {etape === 4 ? (
        <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 720 }}>
          {progression ? (
            <div>
              <Text>
                {t('Saisie en cours : {{traitees}} sur {{total}}.', {
                  traitees: progression.traitees,
                  total: progression.total
                })}
              </Text>
              <Progress
                percent={progression.total === 0 ? 100 : Math.round((progression.traitees / progression.total) * 100)}
                status="active"
              />
            </div>
          ) : null}

          {compteRendu ? (
            <>
              <Descriptions size="small" column={1} bordered title={t('Compte rendu')}>
                <Descriptions.Item label={t('Pièces saisies en brouillon')}>{compteRendu.creees}</Descriptions.Item>
                <Descriptions.Item label={t('Lignes refusées par le serveur')}>
                  {compteRendu.echouees.length}
                </Descriptions.Item>
                <Descriptions.Item label={t('Lignes décochées')}>{compteRendu.decochees}</Descriptions.Item>
                <Descriptions.Item label={t('Lignes en erreur, non envoyées')}>
                  {compteRendu.enErreur}
                </Descriptions.Item>
              </Descriptions>

              {compteRendu.echouees.length > 0 ? (
                <Table
                  size="small"
                  rowKey={resultat => String(resultat.numero)}
                  dataSource={compteRendu.echouees}
                  pagination={false}
                  columns={[
                    { title: t('Ligne'), dataIndex: 'numero', key: 'numero', width: 90 },
                    { title: t('Motif rendu par le serveur'), dataIndex: 'motif', key: 'motif' }
                  ]}
                />
              ) : null}

              {compteRendu.creees > 0 ? (
                <Alert
                  type="success"
                  showIcon
                  message={t('Les pièces créées sont des brouillons.')}
                  description={t('Elles se valident depuis « Pièces à valider », là où leur nature y passe.')}
                />
              ) : null}

              <Space>
                <Button type="primary" onClick={recommencer}>
                  {t('Importer un autre fichier')}
                </Button>
                {compteRendu.echouees.length > 0 || compteRendu.enErreur > 0 ? (
                  <Button onClick={() => setEtape(3)}>{t('Revenir à l’aperçu')}</Button>
                ) : null}
              </Space>
            </>
          ) : null}
        </Space>
      ) : null}
    </div>
  );
};

export default Importation;
