import { createProperty } from '../../services/property-service';
import { createValuation } from '../../services/patrimoine-service';
import { t } from '../../i18n/t';
import {
  PropertyOwnershipType,
  PropertyTransactionMode,
  PropertyType,
  type CreatePropertyRequest
} from '../../types/property-types';
import { ErreurAvantEnvoi, ErreurPartielle, motifDeLErreur } from './execution';
import { normaliserTexte } from './valeurs';
import type { ChampDocument, ContexteImportation, DescripteurNature, ValeursLigne } from './types';

/**
 * Les deux natures « patrimoine » : BIENS et VALORISATIONS.
 *
 * Elles ne sont PAS dans `DESCRIPTEURS` (`natures.ts`) : l'écran finance ne
 * doit pas les voir. L'écran du patrimoine les lit ici.
 *
 * Même contrat que les natures finance — descripteur, rapprochement,
 * exécution ligne à ligne par les services existants — avec deux
 * particularités :
 *
 *  - un bien est TOUJOURS un bien de l'agence (`ownershipType: TENANT`, ni
 *    propriétaire ni mandat) : la barrière « détenu en propre » du pack
 *    Patrimoine reste applicable, et ses refus 403 sont expliqués par le
 *    serveur — l'import ne les contourne pas ;
 *  - une écriture en deux temps (bien, puis valorisation d'acquisition) peut
 *    réussir à moitié : `ErreurPartielle`, ligne non relançable.
 */

// ---------------------------------------------------------------------------
// Petits lecteurs
// ---------------------------------------------------------------------------

function texte(valeurs: ValeursLigne, cle: string): string {
  const valeur = valeurs[cle];
  return typeof valeur === 'string' ? valeur : valeur === null || valeur === undefined ? '' : String(valeur);
}

function texteOuNul(valeurs: ValeursLigne, cle: string): string | null {
  const valeur = texte(valeurs, cle).trim();
  return valeur === '' ? null : valeur;
}

function nombreOuNul(valeurs: ValeursLigne, cle: string): number | null {
  const valeur = valeurs[cle];
  return typeof valeur === 'number' ? valeur : null;
}

const DATE_FUTURE = (champ: ChampDocument): string =>
  t('« {{champ}} » ne peut pas être dans le futur.', { champ: t(champ.libelle) });

// ---------------------------------------------------------------------------
// 1. Biens
// ---------------------------------------------------------------------------

const TITRE_MAX = 200;
const ADRESSE_MAX = 500;
/**
 * Surface plausible d'un bien, en m² (50 ha). Au-delà, la colonne est presque
 * sûrement un montant ou une unité erronée (BUG-2026-10-02-014) : on refuse
 * plutôt que d'enregistrer un bien de 1 000 000 m². La spec 038 ne fixe pas de
 * borne ; une surface plus grande se corrige à la main dans l'aperçu.
 */
const SURFACE_MAX = 500_000;

const CHAMPS_BIENS: ChampDocument[] = [
  {
    cle: 'reference',
    libelle: 'Référence interne',
    obligatoire: false,
    type: 'texte',
    entetes: ['réf', 'référence', 'code', 'n°', 'numéro', 'réf. interne'],
    exemple: 'BIEN-001'
  },
  {
    cle: 'title',
    libelle: 'Titre',
    obligatoire: true,
    type: 'texte',
    entetes: ['intitulé', 'nom du bien', 'désignation', 'libellé', 'bien'],
    exemple: 'Villa des Lilas (fictive)'
  },
  {
    cle: 'propertyType',
    libelle: 'Type de bien',
    obligatoire: true,
    type: 'reference',
    referentiel: 'typesBien',
    entetes: ['type', 'nature du bien', 'catégorie', 'nature'],
    aide: 'Appartement, Maison / Villa, Studio, Duplex / Triplex, Bureau, Boutique / Commercial, Entrepôt / Industriel, Terrain, Immeuble, Parking / Box.',
    exemple: 'Maison / Villa'
  },
  {
    cle: 'address',
    libelle: 'Adresse',
    obligatoire: false,
    type: 'texte',
    entetes: ['adresse du bien', 'localisation', 'situation', 'rue'],
    exemple: 'Rue des Jardins (fictive)'
  },
  {
    cle: 'commune',
    libelle: 'Ville / commune',
    obligatoire: true,
    type: 'reference',
    referentiel: 'communes',
    correspondanceExacte: true,
    entetes: ['ville', 'commune', 'localité'],
    aide: 'Nom exact d’une commune du référentiel géographique ; le nom de la région peut aider : Cocody Abidjan.',
    exemple: 'Cocody'
  },
  {
    cle: 'locationZone',
    libelle: 'Quartier / zone',
    obligatoire: false,
    type: 'texte',
    entetes: ['quartier', 'zone', 'secteur'],
    exemple: 'Les Lilas'
  },
  {
    cle: 'surfaceArea',
    libelle: 'Surface (m²)',
    obligatoire: false,
    type: 'quantite',
    entetes: ['surface', 'superficie', 'm²', 'm2', 'surface m2'],
    exemple: '250'
  },
  {
    cle: 'rooms',
    libelle: 'Nombre de pièces',
    obligatoire: false,
    type: 'entier',
    entetes: ['pièces', 'nb pièces', 'nombre de pièces', 'nb de pièces'],
    exemple: '5'
  },
  {
    cle: 'transactionMode',
    libelle: 'Mode de transaction',
    obligatoire: true,
    type: 'reference',
    referentiel: 'modesTransaction',
    entetes: ['mode', 'transaction', 'type de transaction', 'vocation'],
    aide: 'Vente, Location ou Location courte durée.',
    exemple: 'Vente'
  },
  {
    cle: 'acquisitionPrice',
    libelle: 'Prix d’acquisition',
    obligatoire: false,
    type: 'montant',
    entetes: ['valeur d’acquisition', 'prix d’achat', 'coût d’acquisition', 'valeur d’achat', 'prix acquisition'],
    exemple: '85 000 000'
  },
  {
    cle: 'acquisitionDate',
    libelle: 'Date d’acquisition',
    obligatoire: false,
    type: 'date',
    entetes: ['date d’achat', 'acquis le', 'date acquisition'],
    exemple: '15/03/2022'
  }
];

function libelleDuChamp(champs: ChampDocument[], cle: string): ChampDocument {
  const champ = champs.find(candidat => candidat.cle === cle);
  if (!champ) throw new Error(t('Champ inconnu : {{cle}}', { cle: cle }));
  return champ;
}

function validerBien(valeurs: ValeursLigne, contexte: ContexteImportation): string[] {
  // Les formules (« = », « @ ») sont refusées en amont, pour tout champ, par `evaluerCellule`.
  const motifs: string[] = [];

  const titre = texte(valeurs, 'title');
  if (titre.length > TITRE_MAX) {
    motifs.push(t('« {{champ}} » ne peut pas dépasser {{max}} caractères.', { champ: t('Titre'), max: TITRE_MAX }));
  }
  const adresse = texte(valeurs, 'address');
  if (adresse.length > ADRESSE_MAX) {
    motifs.push(t('« {{champ}} » ne peut pas dépasser {{max}} caractères.', { champ: t('Adresse'), max: ADRESSE_MAX }));
  }

  const surface = nombreOuNul(valeurs, 'surfaceArea');
  if (valeurs.propertyType === PropertyType.TERRAIN && surface === null) {
    motifs.push(t('La surface est obligatoire pour un terrain.'));
  }

  if (surface !== null && surface > SURFACE_MAX) {
    motifs.push(
      t('« {{champ}} » : {{valeur}} m² dépasse le maximum plausible ({{max}} m²). Vérifiez la colonne et l’unité.', {
        champ: t('Surface (m²)'),
        valeur: surface.toLocaleString('fr-FR'),
        max: SURFACE_MAX.toLocaleString('fr-FR')
      })
    );
  }

  const pieces = nombreOuNul(valeurs, 'rooms');
  if (pieces !== null && pieces < 0) {
    motifs.push(t('« {{champ}} » ne peut pas être négatif.', { champ: t('Nombre de pièces') }));
  }

  const prix = nombreOuNul(valeurs, 'acquisitionPrice');
  const dateAcquisition = texteOuNul(valeurs, 'acquisitionDate');
  if (prix !== null && prix === 0) {
    motifs.push(t('« {{champ}} » ne peut pas être nul.', { champ: t('Prix d’acquisition') }));
  }
  if (dateAcquisition !== null && prix === null) {
    motifs.push(t('Une date d’acquisition exige un prix d’acquisition.'));
  }
  if (dateAcquisition !== null && dateAcquisition > contexte.dateParDefaut) {
    motifs.push(DATE_FUTURE(libelleDuChamp(CHAMPS_BIENS, 'acquisitionDate')));
  }
  return motifs;
}

async function enregistrerBien(valeurs: ValeursLigne, contexte: ContexteImportation): Promise<string> {
  const communeId = texte(valeurs, 'commune');
  const commune = contexte.referentiel.communes.find(candidate => candidate.communeId === communeId);
  if (!commune) {
    throw new ErreurAvantEnvoi(t('La commune n’existe plus dans le référentiel géographique : rechargez la page.'));
  }

  const propertyType = texte(valeurs, 'propertyType') as PropertyType;
  const reference = texteOuNul(valeurs, 'reference');
  const surface = nombreOuNul(valeurs, 'surfaceArea');
  const pieces = nombreOuNul(valeurs, 'rooms');
  const adresse = texteOuNul(valeurs, 'address');
  const zone = texteOuNul(valeurs, 'locationZone');
  const estTerrain = propertyType === PropertyType.TERRAIN;

  const typeSpecificData: Record<string, unknown> = {
    country: commune.country,
    countryId: commune.countryId,
    region: commune.region,
    regionId: commune.regionId,
    commune: commune.commune,
    communeId: commune.communeId
  };
  if (reference) typeSpecificData.referenceImport = reference;
  if (estTerrain && surface !== null) typeSpecificData.land_area = surface;

  // Un bien de l'AGENCE, jamais d'un tiers : ni ownerUserId, ni ownerEmail.
  const demande: CreatePropertyRequest = {
    propertyType,
    ownershipType: PropertyOwnershipType.TENANT,
    title: texte(valeurs, 'title'),
    description: '',
    transactionModes: [texte(valeurs, 'transactionMode') as PropertyTransactionMode],
    currency: 'CFA',
    typeSpecificData
  };
  if (adresse) demande.address = adresse;
  if (zone) demande.locationZone = zone;
  if (surface !== null) demande.surfaceArea = surface;
  if (estTerrain && surface !== null) demande.surfaceTerrain = surface;
  if (pieces !== null) demande.rooms = pieces;

  const bien = await createProperty(contexte.tenantId, demande);

  const prix = nombreOuNul(valeurs, 'acquisitionPrice');
  if (prix !== null) {
    const dateAcquisition = texteOuNul(valeurs, 'acquisitionDate');
    const valorisation: Record<string, unknown> = {
      valuatedAt: dateAcquisition ?? contexte.dateParDefaut,
      estimatedValue: prix,
      acquisitionCost: prix,
      method: 'MANUAL',
      notes: t("Valeur d'acquisition importée")
    };
    if (dateAcquisition) valorisation.acquisitionDate = dateAcquisition;
    try {
      await createValuation(contexte.tenantId, bien.id, valorisation);
    } catch (erreur) {
      const code = (erreur as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
      throw new ErreurPartielle(
        t(
          'Bien créé (réf. {{ref}}) ; sa valorisation d’acquisition a été refusée : {{motif}}. Ne relancez pas cette ligne : ajoutez la valorisation par l’import « Valorisations ».',
          { ref: bien.internalReference, motif: motifDeLErreur(erreur) }
        ),
        typeof code === 'string' ? code : undefined,
        bien.internalReference,
        (erreur as { response?: { status?: number } })?.response?.status
      );
    }
  }

  return bien.internalReference;
}

const PREFIXE_REFERENCE = 'ref:';
const PREFIXE_TITRE = 'titre:';

function empreinteTitre(titre: string, adresse: string): string {
  return `${PREFIXE_TITRE}${normaliserTexte(titre)}|${normaliserTexte(adresse)}`;
}

export const BIENS: DescripteurNature = {
  cle: 'patrimoine-biens',
  libelle: 'Biens',
  description:
    'Crée des biens détenus par l’agence, un par ligne, avec leur valeur d’acquisition facultative. Les baux et les locataires ne s’importent pas ici.',
  chantier: 'sans',
  referentiels: ['communes', 'biens', 'typesBien', 'modesTransaction'],
  champs: CHAMPS_BIENS,
  valider: validerBien,
  enregistrer: enregistrerBien,
  empreinte: valeurs => {
    const empreintes: string[] = [];
    const reference = normaliserTexte(texte(valeurs, 'reference'));
    if (reference !== '') empreintes.push(PREFIXE_REFERENCE + reference);
    const titre = normaliserTexte(texte(valeurs, 'title'));
    if (titre !== '') empreintes.push(empreinteTitre(texte(valeurs, 'title'), texte(valeurs, 'address')));
    return empreintes.length > 0 ? empreintes : null;
  },
  // Aucun appel réseau : le référentiel des biens est déjà chargé.
  chargerEmpreintes: async contexte => {
    const empreintes: string[] = [];
    for (const bien of contexte.referentiel.biens) {
      const reference = normaliserTexte(bien.internalReference);
      if (reference !== '') empreintes.push(PREFIXE_REFERENCE + reference);
      const externe = normaliserTexte(bien.referenceExterne ?? '');
      if (externe !== '') empreintes.push(PREFIXE_REFERENCE + externe);
      empreintes.push(empreinteTitre(bien.title, bien.address));
    }
    return empreintes;
  },
  motifDoublon: (empreinte, ligneDuFichier) => {
    if (ligneDuFichier !== undefined) {
      return t('Identique à la ligne {{ligne}} de ce fichier.', { ligne: ligneDuFichier });
    }
    return empreinte.startsWith(PREFIXE_REFERENCE)
      ? t('Cette référence est déjà utilisée par un bien de l’agence.')
      : t('Un bien du même titre et de la même adresse existe déjà.');
  }
};

// ---------------------------------------------------------------------------
// 2. Valorisations
// ---------------------------------------------------------------------------

const CHAMPS_VALORISATIONS: ChampDocument[] = [
  {
    cle: 'bien',
    libelle: 'Bien (référence ou titre)',
    obligatoire: true,
    type: 'reference',
    referentiel: 'biens',
    correspondanceExacte: true,
    entetes: ['bien', 'référence', 'réf', 'titre', 'propriété'],
    aide: 'La référence attribuée par ImmoTopia, ou le titre exact du bien.',
    exemple: 'Villa des Lilas (fictive)'
  },
  {
    cle: 'valuatedAt',
    libelle: 'Date de la valorisation',
    obligatoire: true,
    type: 'date',
    entetes: ['date', 'date de valorisation', 'date d’évaluation', 'valorisé le'],
    exemple: '30/06/2026'
  },
  {
    cle: 'estimatedValue',
    libelle: 'Valeur estimée',
    obligatoire: true,
    type: 'montant',
    entetes: ['valeur', 'estimation', 'valeur vénale', 'montant'],
    exemple: '95 000 000'
  },
  {
    cle: 'acquisitionCost',
    libelle: 'Coût d’acquisition',
    obligatoire: false,
    type: 'montant',
    entetes: ['prix d’achat', 'prix d’acquisition', 'valeur d’acquisition', 'coût d’achat'],
    exemple: '85 000 000'
  },
  {
    cle: 'acquisitionDate',
    libelle: 'Date d’acquisition',
    obligatoire: false,
    type: 'date',
    entetes: ['date d’achat', 'acquis le', 'date acquisition'],
    exemple: '15/03/2022'
  },
  {
    cle: 'method',
    libelle: 'Méthode',
    obligatoire: false,
    type: 'reference',
    referentiel: 'methodesValorisation',
    entetes: ['méthode d’évaluation', 'méthode de valorisation', 'type d’évaluation'],
    aide: 'Manuelle (par défaut), Estimation de marché ou Expertise.',
    exemple: 'Estimation de marché'
  },
  {
    cle: 'source',
    libelle: 'Source',
    obligatoire: false,
    type: 'texte',
    entetes: ['origine', 'expert', 'commentaire', 'note', 'notes'],
    exemple: 'Cabinet d’expertise (fictif)'
  }
];

function validerValorisation(valeurs: ValeursLigne, contexte: ContexteImportation): string[] {
  const motifs: string[] = [];

  const date = texteOuNul(valeurs, 'valuatedAt');
  if (date !== null && date > contexte.dateParDefaut) {
    motifs.push(DATE_FUTURE(libelleDuChamp(CHAMPS_VALORISATIONS, 'valuatedAt')));
  }
  const dateAcquisition = texteOuNul(valeurs, 'acquisitionDate');
  if (dateAcquisition !== null && dateAcquisition > contexte.dateParDefaut) {
    motifs.push(
      t('« {{champ}} » doit être une date passée ou du jour.', {
        champ: t(libelleDuChamp(CHAMPS_VALORISATIONS, 'acquisitionDate').libelle)
      })
    );
  }
  if (nombreOuNul(valeurs, 'estimatedValue') === 0) {
    motifs.push(t('« {{champ}} » doit être supérieure à zéro.', { champ: t('Valeur estimée') }));
  }
  if (nombreOuNul(valeurs, 'acquisitionCost') === 0) {
    motifs.push(t('« {{champ}} » doit être supérieur à zéro.', { champ: t('Coût d’acquisition') }));
  }
  return motifs;
}

async function enregistrerValorisation(valeurs: ValeursLigne, contexte: ContexteImportation): Promise<void> {
  const charge: Record<string, unknown> = {
    valuatedAt: texte(valeurs, 'valuatedAt'),
    estimatedValue: nombreOuNul(valeurs, 'estimatedValue'),
    method: texteOuNul(valeurs, 'method') ?? 'MANUAL'
  };
  const cout = nombreOuNul(valeurs, 'acquisitionCost');
  if (cout !== null) charge.acquisitionCost = cout;
  const dateAcquisition = texteOuNul(valeurs, 'acquisitionDate');
  if (dateAcquisition) charge.acquisitionDate = dateAcquisition;
  const source = texteOuNul(valeurs, 'source');
  if (source) charge.notes = t('Source : {{source}}', { source: source });

  await createValuation(contexte.tenantId, texte(valeurs, 'bien'), charge);
}

export const VALORISATIONS: DescripteurNature = {
  cle: 'patrimoine-valorisations',
  libelle: 'Valorisations',
  description:
    'Ajoute des valorisations à des biens existants, rattachés par leur référence ou leur titre exact ; plusieurs valorisations par bien sont permises.',
  chantier: 'sans',
  referentiels: ['biens', 'methodesValorisation'],
  champs: CHAMPS_VALORISATIONS,
  valider: validerValorisation,
  enregistrer: enregistrerValorisation,
  // Doublons INTERNES au fichier seulement : aucune liste globale des valorisations.
  empreinte: valeurs => {
    const bien = texte(valeurs, 'bien');
    const date = texte(valeurs, 'valuatedAt');
    const valeur = nombreOuNul(valeurs, 'estimatedValue');
    if (bien === '' || date === '' || valeur === null) return null;
    return [`val:${bien}|${date}|${valeur}`];
  },
  motifDoublon: (_empreinte, ligneDuFichier) =>
    ligneDuFichier !== undefined
      ? t('Identique à la ligne {{ligne}} de ce fichier.', { ligne: ligneDuFichier })
      : t('Une valorisation identique existe déjà.'),
  doublonImpossible:
    'Les valorisations déjà enregistrées ne se lisent que bien par bien : seuls les doublons à l’intérieur du fichier sont signalés.'
};

// ---------------------------------------------------------------------------
// Registre
// ---------------------------------------------------------------------------

export const DESCRIPTEURS_PATRIMOINE: DescripteurNature[] = [BIENS, VALORISATIONS];

export function trouverDescripteurPatrimoine(cle: string): DescripteurNature | undefined {
  return DESCRIPTEURS_PATRIMOINE.find(descripteur => descripteur.cle === cle);
}
