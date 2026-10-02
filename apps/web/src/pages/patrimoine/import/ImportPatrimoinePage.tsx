import React, { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Steps, Typography } from 'antd';
import { PageHeader, StateBlock } from '../../../components/primitives';
import { DESCRIPTEURS_PATRIMOINE } from '../../../lib/importation/natures-patrimoine';
import { EtapeFichier, EtapeNature } from './EtapeNatureFichier';
import { EtapeColonnes } from './EtapeColonnes';
import { EtapeApercu } from './EtapeApercu';
import { EtapeImport, EtapeRapport } from './EtapeImportRapport';
import { useImportPatrimoine } from './useImportPatrimoine';
import { t } from '../../../i18n/t';

function titresEtapes(): string[] {
  return [t('La nature'), t('Le fichier'), t('Les colonnes'), t('L’aperçu'), t('L’import'), t('Le rapport')];
}

/**
 * Import en masse du patrimoine (spec 038) : biens et valorisations depuis un
 * fichier Excel ou CSV. Le fichier est lu dans le navigateur et n'est jamais
 * envoyé ; seules les lignes validées partent, par les services existants.
 * L'état vit dans `useImportPatrimoine` ; ici, le rendu des six étapes.
 */
export const ImportPatrimoinePage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const s = useImportPatrimoine(tenantId);
  const { descripteur, feuille, etape } = s;
  const titreRef = useRef<HTMLElement>(null);

  // Le focus suit l'étape : un lecteur d'écran annonce le nouveau titre.
  useEffect(() => {
    titreRef.current?.focus();
  }, [etape]);

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const titres = titresEtapes();
  const avertirEncodage = feuille?.encodage === 'windows-1252';

  return (
    <div>
      <PageHeader
        title={t('Importer mon patrimoine')}
        subtitle={t('Reprendre votre parc depuis Excel ou CSV : les erreurs sont détectées avant toute écriture.')}
      />
      <Steps
        current={etape}
        size="small"
        style={{ marginBlockEnd: 'var(--space-6)' }}
        items={titres.map(title => ({ title }))}
      />
      <Typography.Title level={4} tabIndex={-1} ref={titreRef} style={{ outline: 'none' }}>
        {titres[etape]}
      </Typography.Title>

      {etape === 0 ? (
        <EtapeNature
          descripteurs={DESCRIPTEURS_PATRIMOINE}
          natureCle={s.natureCle}
          onChoisir={s.choisirNature}
          chargementEnCours={s.referentiel.isPending || s.referentiel.isFetching}
          erreurChargement={s.referentiel.isError}
          onReessayer={() => void s.referentiel.refetch()}
          onContinuer={() => s.setEtape(1)}
        />
      ) : null}

      {etape === 1 && descripteur ? (
        <EtapeFichier
          descripteur={descripteur}
          lectureEnCours={s.lectureEnCours || s.preparationEnCours}
          erreurLecture={s.erreurLecture}
          onFichier={fichier => void s.lireLeFichier(fichier)}
          onTelechargerGabarit={s.telechargerLeGabarit}
          onRevenir={() => s.setEtape(0)}
        />
      ) : null}

      {etape === 2 && descripteur && feuille ? (
        <EtapeColonnes
          descripteur={descripteur}
          feuille={feuille}
          nomFichier={s.nomFichier}
          exemplesIgnores={s.exemplesIgnores}
          rapprochement={s.rapprochement}
          onRapprocher={s.setRapprochement}
          preparationEnCours={s.preparationEnCours}
          avertirEncodage={avertirEncodage}
          onChangerFichier={() => s.setEtape(1)}
          onPrevisualiser={s.previsualiser}
        />
      ) : null}

      {etape === 3 && descripteur ? (
        <EtapeApercu
          descripteur={descripteur}
          lignes={s.lignes}
          cochees={s.cochees}
          horsQuota={new Set(s.horsQuota)}
          doublonsIgnores={new Set(s.ignoreesDoublons)}
          compteurs={s.compteurs}
          exemplesIgnores={s.exemplesIgnores}
          politique={s.politique}
          onPolitique={s.setPolitique}
          seulementErreurs={s.seulementErreurs}
          onSeulementErreurs={s.setSeulementErreurs}
          etatQuota={s.etatQuota}
          estimation={s.estimation}
          lectureSeule={s.lectureSeule}
          avertirEncodage={avertirEncodage}
          onModifier={s.modifierCellule}
          onBasculer={s.basculerLigne}
          onToutBasculer={s.toutBasculer}
          onRevenir={() => s.setEtape(2)}
          onImporter={s.lancerImport}
        />
      ) : null}

      {etape === 4 ? (
        <EtapeImport progression={s.progression} arretDemande={s.arretDemande} onArreter={s.arreter} />
      ) : null}

      {etape === 5 ? (
        <EtapeRapport
          lignes={s.rapport}
          compteRendu={s.compteRendu}
          nbARelancer={s.aRelancer.length}
          occupe={s.preparationEnCours}
          onTelecharger={s.telechargerRapport}
          onRelancer={s.relancer}
          onRevenir={() => void s.revenirALApercu()}
          onRecommencer={() => void s.recommencer()}
        />
      ) : null}
    </div>
  );
};

export default ImportPatrimoinePage;
