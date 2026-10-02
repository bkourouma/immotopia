import { useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { entityKeyPrefix, queryKey, STALE_TIME } from '../../../lib/query-keys';
import { getOwnEntitlements } from '../../../services/subscription-v2-service';
import { chargerReferentiel } from '../../../lib/importation/referentiel';
import {
  champsObligatoiresManquants,
  evaluerLigne,
  marquerDoublons,
  proposerRapprochement
} from '../../../lib/importation/rapprochement';
import { executerImport, motifDeLErreur } from '../../../lib/importation/execution';
import type { CompteRenduImport } from '../../../lib/importation/execution';
import { lireFichier, messageErreurFichier } from '../../../lib/importation/fichier';
import type { FichierLu } from '../../../lib/importation/fichier';
import { telechargerGabarit } from '../../../lib/importation/gabarits';
import { trouverDescripteurPatrimoine } from '../../../lib/importation/natures-patrimoine';
import { telechargerRapportCsv } from '../../../lib/importation/rapport';
import { REFERENTIEL_VIDE } from '../../../lib/importation/types';
import type { ContexteImportation, LigneEvaluee } from '../../../lib/importation/types';
import {
  appliquerPolitiqueDoublons,
  calculerCompteurs,
  construireLignesRapport,
  creerCacheEvaluation,
  evaluerAvecCache,
  exclureLignes,
  fusionnerComptesRendus,
  lignesARelancer,
  lignesPretes,
  modesDeLaLigne,
  numerosDejaTraites,
  retirerLignesExemple
} from './import-logic';
import type { PolitiqueDoublons } from './import-logic';
import { evaluerQuotaBiens } from './quota';
import type { EtatQuota } from './EtapeApercu';
import { t } from '../../../i18n/t';

export const CLE_BIENS = 'patrimoine-biens';

/** Les listes que l'import des biens et des valorisations rend périmées. */
const ENTITES_A_INVALIDER = [
  'properties',
  'properties-options',
  'properties-select',
  'patrimoine-apercu',
  'holding-entity-consolidation',
  'own-entitlements'
];

/** Une ligne telle que la personne la modifie : du texte, et rien d'autre. */
interface BrouillonLigne {
  numero: number;
  textes: Record<string, string>;
  selectionnee: boolean;
}

/** Ce qui a été figé au lancement : le rapport ne doit pas bouger quand les listes se rechargent. */
interface Instantane {
  lignes: LigneEvaluee[];
  ignoreesDoublons: number[];
  horsQuota: number[];
}

/**
 * L'état et les gestes de l'écran « Importer mon patrimoine » (spec 038).
 * Le composant ne garde que le rendu.
 */
export function useImportPatrimoine(tenantId: string | undefined) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const [etape, setEtape] = useState(0);
  const [natureCle, setNatureCle] = useState<string | null>(null);
  const [feuille, setFeuille] = useState<FichierLu | null>(null);
  const [nomFichier, setNomFichier] = useState('');
  const [exemplesIgnores, setExemplesIgnores] = useState(0);
  const [lectureEnCours, setLectureEnCours] = useState(false);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [rapprochement, setRapprochement] = useState<Array<string | null>>([]);
  const [brouillons, setBrouillons] = useState<BrouillonLigne[]>([]);
  const [empreintes, setEmpreintes] = useState<string[]>([]);
  const [preparationEnCours, setPreparationEnCours] = useState(false);
  const [politique, setPolitique] = useState<PolitiqueDoublons>('ignorer');
  const [seulementErreurs, setSeulementErreurs] = useState(false);
  const [progression, setProgression] = useState<{ traitees: number; total: number } | null>(null);
  const [arretDemande, setArretDemande] = useState(false);
  const [compteRendu, setCompteRendu] = useState<CompteRenduImport | null>(null);
  const [instantane, setInstantane] = useState<Instantane | null>(null);

  const interrompreRef = useRef(false);
  const monteeRef = useRef(true);
  const jetonRef = useRef(0);
  const cacheRef = useRef(creerCacheEvaluation());

  const descripteur = natureCle ? (trouverDescripteurPatrimoine(natureCle) ?? null) : null;
  const natureBiens = natureCle === CLE_BIENS;

  // Démontage : plus aucune écriture ne doit partir, la ligne en cours se termine.
  useEffect(() => {
    monteeRef.current = true;
    return () => {
      monteeRef.current = false;
      interrompreRef.current = true;
      jetonRef.current += 1;
    };
  }, []);

  // Tant que l'import tourne, quitter la page interromprait des écritures.
  useEffect(() => {
    if (etape !== 4) return undefined;
    const avertir = (evenement: BeforeUnloadEvent) => {
      evenement.preventDefault();
      evenement.returnValue = '';
    };
    window.addEventListener('beforeunload', avertir);
    return () => window.removeEventListener('beforeunload', avertir);
  }, [etape]);

  // -------------------------------------------------------------------------
  // Listes et abonnement
  // -------------------------------------------------------------------------

  const referentiel = useQuery({
    queryKey: queryKey('importation-referentiel', tenantId, { nature: natureCle }),
    queryFn: () => chargerReferentiel(tenantId as string, descripteur?.referentiels ?? []),
    enabled: Boolean(tenantId) && Boolean(descripteur),
    staleTime: STALE_TIME.list
  });

  const droits = useQuery({
    queryKey: queryKey('own-entitlements', tenantId),
    queryFn: () => getOwnEntitlements(tenantId as string),
    enabled: Boolean(tenantId) && natureBiens,
    staleTime: STALE_TIME.list
  });

  const contexte: ContexteImportation = useMemo(
    () => ({
      tenantId: tenantId ?? '',
      siteId: null,
      dateParDefaut: dayjs().format('YYYY-MM-DD'),
      referentiel: referentiel.data ?? REFERENTIEL_VIDE
    }),
    [tenantId, referentiel.data]
  );

  // -------------------------------------------------------------------------
  // Les lignes — seule la ligne modifiée est réévaluée à la frappe
  // -------------------------------------------------------------------------

  const evaluees: LigneEvaluee[] = useMemo(() => {
    if (!descripteur) return [];
    const lignes = evaluerAvecCache(cacheRef.current, [descripteur, contexte], brouillons, b =>
      evaluerLigne(descripteur, b.numero, b.textes, contexte, b.selectionnee)
    );
    return marquerDoublons(descripteur, lignes, contexte, empreintes);
  }, [descripteur, brouillons, contexte, empreintes]);

  const { lignes, ignoreesDoublons } = useMemo(
    () => appliquerPolitiqueDoublons(evaluees, politique),
    [evaluees, politique]
  );

  const estimation = useMemo(() => {
    if (!natureBiens || !droits.data) return null;
    const entree = lignesPretes(lignes).map(l => ({ numero: l.numero, modes: modesDeLaLigne(l) }));
    return evaluerQuotaBiens(droits.data, entree);
  }, [natureBiens, droits.data, lignes]);

  const horsQuota = useMemo(() => estimation?.horsQuota ?? [], [estimation]);
  const compteurs = calculerCompteurs(lignes, horsQuota);
  const cochees = useMemo(() => new Map(brouillons.map(b => [b.numero, b.selectionnee])), [brouillons]);

  let etatQuota: EtatQuota = 'sans';
  if (natureBiens) etatQuota = droits.isError ? 'erreur' : droits.data ? 'ok' : 'chargement';
  const lectureSeule = natureBiens && droits.data?.readOnly === true;

  const rapport = useMemo(
    () => (instantane ? construireLignesRapport({ ...instantane, compteRendu }) : []),
    [instantane, compteRendu]
  );
  const aRelancer = instantane && compteRendu ? lignesARelancer(instantane.lignes, compteRendu) : [];

  // -------------------------------------------------------------------------
  // Remises à zéro et rafraîchissement des listes
  // -------------------------------------------------------------------------

  const viderFichier = () => {
    jetonRef.current += 1;
    setLectureEnCours(false);
    setPreparationEnCours(false);
    setFeuille(null);
    setNomFichier('');
    setExemplesIgnores(0);
    setErreurLecture(null);
    setRapprochement([]);
    setBrouillons([]);
    setEmpreintes([]);
    setCompteRendu(null);
    setInstantane(null);
    setProgression(null);
    setSeulementErreurs(false);
  };

  const choisirNature = (cle: string) => {
    setNatureCle(cle);
    viderFichier();
  };

  /**
   * Relit les listes, PUIS recalcule les empreintes avec la liste FRAÎCHE (la
   * fermeture du rendu courant porte l'ancienne : un bien créé à l'instant n'y
   * figure pas, donc ne serait pas vu comme un doublon).
   */
  const rafraichirEmpreintes = async (): Promise<string[]> => {
    if (!descripteur) return [];
    if (natureBiens) void droits.refetch();
    const resultat = await referentiel.refetch();
    const donnees = resultat.data ?? referentiel.data ?? REFERENTIEL_VIDE;
    if (!descripteur.chargerEmpreintes) return [];
    try {
      return await descripteur.chargerEmpreintes({ ...contexte, referentiel: donnees });
    } catch {
      message.warning(t('Les éléments déjà enregistrés n’ont pas pu être lus : les doublons ne seront pas signalés.'));
      return [];
    }
  };

  const rafraichirEtRevenir = async (adecocher: Set<number>) => {
    setPreparationEnCours(true);
    try {
      const connues = await rafraichirEmpreintes();
      if (!monteeRef.current) return;
      setBrouillons(prec => prec.map(b => (adecocher.has(b.numero) ? { ...b, selectionnee: false } : b)));
      setEmpreintes(connues);
      setEtape(3);
    } finally {
      if (monteeRef.current) setPreparationEnCours(false);
    }
  };

  // Les lignes déjà créées, et celles dont l'état est incertain, ne repartent pas.
  const revenirALApercu = () => rafraichirEtRevenir(new Set(numerosDejaTraites(compteRendu)));

  const recommencer = async () => {
    viderFichier();
    setEtape(0);
    await Promise.all([referentiel.refetch(), natureBiens ? droits.refetch() : Promise.resolve()]);
  };

  // -------------------------------------------------------------------------
  // Étapes 2 → 4
  // -------------------------------------------------------------------------

  const preparerApercu = async (
    lue: FichierLu,
    choix: Array<string | null>,
    dejaTraitees: number[],
    jetonRecu?: number
  ) => {
    if (!descripteur) return;
    const jeton = jetonRecu ?? ++jetonRef.current;
    const traitees = new Set(dejaTraitees);
    setPreparationEnCours(true);
    try {
      setBrouillons(
        lue.lignes.map(ligne => {
          const textes: Record<string, string> = {};
          for (const champ of descripteur.champs) {
            const colonne = choix.indexOf(champ.cle);
            textes[champ.cle] = colonne === -1 ? '' : (ligne.cellules[colonne] ?? '');
          }
          return { numero: ligne.numero, textes, selectionnee: !traitees.has(ligne.numero) };
        })
      );
      let connues: string[] = [];
      if (descripteur.chargerEmpreintes) {
        try {
          connues = await descripteur.chargerEmpreintes(contexte);
        } catch {
          message.warning(
            t('Les éléments déjà enregistrés n’ont pas pu être lus : les doublons ne seront pas signalés.')
          );
        }
      }
      if (jeton !== jetonRef.current) return;
      setEmpreintes(connues);
      setEtape(3);
    } finally {
      if (monteeRef.current && jeton === jetonRef.current) setPreparationEnCours(false);
    }
  };

  const lireLeFichier = async (fichier: File) => {
    if (!descripteur) return;
    const jeton = ++jetonRef.current;
    setLectureEnCours(true);
    setErreurLecture(null);
    try {
      const lu = await lireFichier(fichier, fichier.name);
      if (jeton !== jetonRef.current) return; // lecture périmée : un autre geste a eu lieu depuis
      const { feuille: nette, retirees } = retirerLignesExemple(lu);
      if (nette.lignes.length === 0) {
        setErreurLecture(t('Ce fichier ne contient aucune ligne à importer (hors ligne d’exemple).'));
        return;
      }
      const choix = proposerRapprochement(nette.colonnes, descripteur.champs);
      setFeuille(nette);
      setNomFichier(fichier.name);
      setExemplesIgnores(retirees.length);
      setRapprochement(choix);
      setBrouillons([]);
      setCompteRendu(null);
      setInstantane(null);
      const toutReconnu = nette.colonnes.every((nom, i) => nom.trim() === '' || choix[i] !== null);
      if (toutReconnu && champsObligatoiresManquants(descripteur, choix).length === 0) {
        await preparerApercu(nette, choix, [], jeton);
      } else {
        setEtape(2);
      }
    } catch (erreur) {
      if (jeton === jetonRef.current) setErreurLecture(messageErreurFichier(erreur));
    } finally {
      if (monteeRef.current && jeton === jetonRef.current) setLectureEnCours(false);
    }
  };

  const modifierCellule = (numero: number, cle: string, valeur: string) =>
    setBrouillons(prec => prec.map(b => (b.numero === numero ? { ...b, textes: { ...b.textes, [cle]: valeur } } : b)));
  const basculerLigne = (numero: number, cochee: boolean) =>
    setBrouillons(prec => prec.map(b => (b.numero === numero ? { ...b, selectionnee: cochee } : b)));
  const toutBasculer = (cochee: boolean) => setBrouillons(prec => prec.map(b => ({ ...b, selectionnee: cochee })));

  // -------------------------------------------------------------------------
  // Étapes 5 et 6 — l'import et sa relance
  // -------------------------------------------------------------------------

  const invalider = () => {
    for (const entite of ENTITES_A_INVALIDER) {
      void queryClient.invalidateQueries({ queryKey: entityKeyPrefix(entite, tenantId) });
    }
  };

  const executer = async (aEnvoyer: LigneEvaluee[], envoyables: number, precedent: CompteRenduImport | null) => {
    if (!descripteur) return;
    interrompreRef.current = false;
    setArretDemande(false);
    setProgression({ traitees: 0, total: envoyables });
    setEtape(4);
    let rendu: CompteRenduImport;
    try {
      rendu = await executerImport({
        descripteur,
        lignes: aEnvoyer,
        contexte,
        surProgression: (traitees, total) => {
          if (monteeRef.current) setProgression({ traitees, total });
        },
        interrompre: () => interrompreRef.current
      });
    } catch (erreur) {
      // Une exception imprévue ne doit pas laisser l'écran bloqué à l'étape 5.
      if (!monteeRef.current) return;
      setProgression(null);
      message.error(
        t('L’import a rencontré une erreur imprévue : {{motif}}. Vérifiez les éléments déjà enregistrés.', {
          motif: motifDeLErreur(erreur)
        })
      );
      invalider();
      await rafraichirEtRevenir(new Set(numerosDejaTraites(precedent)));
      return;
    }
    invalider();
    if (!monteeRef.current) return;
    const final = precedent
      ? fusionnerComptesRendus(
          precedent,
          rendu,
          aEnvoyer.map(l => l.numero)
        )
      : rendu;
    setCompteRendu(final);
    setProgression(null);
    setEtape(5);
    if (rendu.echouees.length > 0) {
      message.warning(
        t('{{creees}} créée(s), {{echouees}} refusée(s) par le serveur.', {
          creees: rendu.creees,
          echouees: rendu.echouees.length
        })
      );
    }
  };

  // `compteRendu` : après un retour à l'aperçu, le rapport final couvre TOUTES les lignes.
  const lancerImport = () => {
    setInstantane({ lignes, ignoreesDoublons, horsQuota });
    void executer(exclureLignes(lignes, horsQuota), compteurs.pretes, compteRendu);
  };

  const relancer = () => {
    if (!compteRendu || aRelancer.length === 0) return;
    void executer(aRelancer, aRelancer.length, compteRendu);
  };

  const arreter = () => {
    interrompreRef.current = true;
    setArretDemande(true);
  };

  const telechargerRapport = () => {
    if (!descripteur) return;
    telechargerRapportCsv(
      rapport,
      descripteur.champs.map(champ => ({ cle: champ.cle, libelle: t(champ.libelle) })),
      nomFichier
    );
  };

  const telechargerLeGabarit = () => {
    if (!descripteur) return;
    telechargerGabarit(descripteur).catch(() => message.error(t('Le gabarit n’a pas pu être généré.')));
  };

  const previsualiser = () => {
    if (feuille) void preparerApercu(feuille, rapprochement, numerosDejaTraites(compteRendu));
  };

  return {
    etape,
    setEtape,
    descripteur,
    natureCle,
    referentiel,
    feuille,
    nomFichier,
    exemplesIgnores,
    lectureEnCours,
    preparationEnCours,
    erreurLecture,
    rapprochement,
    setRapprochement,
    politique,
    setPolitique,
    seulementErreurs,
    setSeulementErreurs,
    progression,
    arretDemande,
    compteRendu,
    rapport,
    aRelancer,
    lignes,
    cochees,
    horsQuota,
    ignoreesDoublons,
    compteurs,
    estimation,
    etatQuota,
    lectureSeule,
    choisirNature,
    lireLeFichier,
    previsualiser,
    modifierCellule,
    basculerLigne,
    toutBasculer,
    lancerImport,
    relancer,
    arreter,
    revenirALApercu,
    recommencer,
    telechargerRapport,
    telechargerLeGabarit
  };
}
