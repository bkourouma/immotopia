import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ImportPatrimoinePage } from '../../../pages/patrimoine/import/ImportPatrimoinePage';

// Ces parcours (lecture et analyse de classeurs) sont lourds : sous la charge de la CI, l'attente par défaut
// d'une seconde de `findBy*` / `waitFor` expire avant la fin du rendu.
configure({ asyncUtilTimeout: 15000 });

/**
 * Import en masse du patrimoine (spec 038) — rendu de la page de bout en bout.
 *
 * Le mock se pose à la frontière réseau (`utils/api-client`) : les vrais
 * services, descripteurs, moteur et composants tournent par-dessus. Les
 * fichiers déposés sont de vrais `File` (CSV en texte, xlsx par exceljs) ; seul
 * le téléchargement (`saveBlob`) est intercepté.
 */

const TENANT = 'agence-1';
const URL_BIENS = `/tenants/${TENANT}/properties`;

const get = vi.fn();
const post = vi.fn();
const saveBlob = vi.fn();

vi.mock('../../../utils/api-client', () => ({
  default: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a)
  }
}));

vi.mock('../../../utils/save-blob', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../utils/save-blob')>()),
  saveBlob: (...a: unknown[]) => saveBlob(...a)
}));

// Permet de simuler une exception imprévue dans le moteur d'écriture.
const forcerErreurMoteur = { actif: false };
vi.mock('../../../lib/importation/execution', async importOriginal => {
  const original = await importOriginal<typeof import('../../../lib/importation/execution')>();
  return {
    ...original,
    executerImport: (...a: Parameters<typeof original.executerImport>) =>
      forcerErreurMoteur.actif ? Promise.reject(new Error('panne du moteur')) : original.executerImport(...a)
  };
});

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: TENANT } })
}));

vi.mock('../../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

// ---------------------------------------------------------------------------
// Données simulées
// ---------------------------------------------------------------------------

type Corps = Record<string, unknown>;

const COMMUNES = [
  {
    id: 'g1',
    country: 'Côte d’Ivoire',
    countryId: 'ci',
    region: 'Abidjan',
    regionId: 'r-abj',
    commune: 'Cocody',
    communeId: 'c-cocody',
    displayName: 'Cocody, Abidjan',
    searchText: 'cocody abidjan'
  },
  {
    id: 'g2',
    country: 'Côte d’Ivoire',
    countryId: 'ci',
    region: 'Abidjan',
    regionId: 'r-abj',
    commune: 'Yopougon',
    communeId: 'c-yopougon',
    displayName: 'Yopougon, Abidjan',
    searchText: 'yopougon abidjan'
  }
];

function bienApi(id: string, ref: string, title: string, address: string, extra: Corps = {}, tenantId = TENANT) {
  return { id, internalReference: ref, title, address, tenantId, ...extra };
}

const BIENS_API = [
  bienApi('b1', 'IMM-0001', 'Villa Existante', 'Rue 1'),
  bienApi('b2', 'IMM-0002', 'Résidence Alpha', 'Rue 2', { typeSpecificData: { referenceImport: 'EXT-77' } }),
  bienApi('b3', 'IMM-0003', 'Résidence Jumelle', 'Rue 3'),
  bienApi('b4', 'IMM-0004', 'Résidence Jumelle', 'Rue 4'),
  // Une annonce d'une AUTRE agence : ne doit jamais servir.
  bienApi('x1', 'IMM-9999', 'Bien Étranger', 'Rue Étrangère', {}, 'autre-agence')
];

function capacite(limit: number, used: number) {
  return { included: limit, extensions: 0, overrides: 0, limit, used, remaining: Math.max(0, limit - used), overBy: 0 };
}

function droits(surcharge: Corps = {}) {
  return {
    tenantId: TENANT,
    subscriptionId: 'sub-1',
    status: 'ACTIVE',
    phase: 'ACTIVE',
    readOnly: false,
    readOnlyReason: null,
    manualReadOnlyAt: null,
    manualReadOnlyReason: null,
    trialEndsAt: null,
    graceEndsAt: null,
    billingCycle: 'MONTHLY',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    packs: ['PATRIMOINE'],
    modules: [],
    moduleAccess: {},
    features: [],
    ownAssetsOnly: true,
    capacities: { BIENS_DETENUS: capacite(100, 10), LOTS: capacite(100, 0) },
    quotaPolicy: 'BLOCK',
    enforcement: 'enforce',
    computedAt: '2026-10-01T08:00:00.000Z',
    ...surcharge
  };
}

const enveloppe = (data: unknown) => ({ data: { success: true, data } });

function erreurHttp(status: number, data: Corps) {
  return Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } });
}

let etat: {
  droits: ReturnType<typeof droits>;
  biens: unknown[];
  post: (url: string, corps: Corps) => Promise<unknown>;
};
let compteurBiens = 0;

async function postParDefaut(url: string, corps: Corps): Promise<unknown> {
  void corps;
  if (url === URL_BIENS) {
    compteurBiens += 1;
    return enveloppe({ id: `new-${compteurBiens}`, internalReference: `IMM-${1000 + compteurBiens}` });
  }
  if (/\/properties\/[^/]+\/valuations$/.test(url)) return enveloppe({ id: 'val-1' });
  throw new Error(`POST inattendu : ${url}`);
}

// ---------------------------------------------------------------------------
// Fichiers
// ---------------------------------------------------------------------------

const ENTETES_BIENS = [
  'Référence interne',
  'Titre',
  'Type de bien',
  'Adresse',
  'Ville / commune',
  'Quartier / zone',
  'Surface (m²)',
  'Nombre de pièces',
  'Mode de transaction',
  'Prix d’acquisition',
  'Date d’acquisition'
];

const ENTETES_VALORISATIONS = [
  'Bien (référence ou titre)',
  'Date de la valorisation',
  'Valeur estimée',
  'Coût d’acquisition',
  'Date d’acquisition',
  'Méthode',
  'Source'
];

interface ParamsBien {
  ref?: string;
  titre?: string;
  type?: string;
  adresse?: string;
  commune?: string;
  zone?: string;
  surface?: string;
  pieces?: string;
  mode?: string;
  prix?: string;
  date?: string;
}

function ligneBien(p: ParamsBien = {}): string[] {
  return [
    p.ref ?? '',
    p.titre ?? 'Villa X',
    p.type ?? 'Maison / Villa',
    p.adresse ?? 'Rue A',
    p.commune ?? 'Cocody',
    p.zone ?? '',
    p.surface ?? '100',
    p.pieces ?? '4',
    p.mode ?? 'Vente',
    p.prix ?? '',
    p.date ?? ''
  ];
}

const echapperCsv = (valeur: string) => (/[;"\r\n]/.test(valeur) ? `"${valeur.replace(/"/g, '""')}"` : valeur);

/** `null` : une ligne blanche, qui garde son numéro dans le fichier. */
function csv(lignes: Array<string[] | null>, nom = 'biens.csv'): File {
  const texte = lignes.map(ligne => (ligne === null ? '' : ligne.map(echapperCsv).join(';'))).join('\r\n');
  return new File([texte], nom, { type: 'text/csv' });
}

async function xlsx(lignes: unknown[][], nom = 'patrimoine.xlsx'): Promise<File> {
  const ExcelJS = await import('exceljs');
  const classeur = new ExcelJS.Workbook();
  const feuille = classeur.addWorksheet('Patrimoine');
  lignes.forEach(ligne => feuille.addRow(ligne));
  const tampon = await classeur.xlsx.writeBuffer();
  return new File([tampon as ArrayBuffer], nom);
}

function lireOctets(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(new Uint8Array(lecteur.result as ArrayBuffer));
    lecteur.onerror = () => reject(lecteur.error);
    lecteur.readAsArrayBuffer(blob);
  });
}

// ---------------------------------------------------------------------------
// Pilotage de la page
// ---------------------------------------------------------------------------

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[`/tenant/${TENANT}/patrimoine/importation`]}>
          <Routes>
            <Route path="/tenant/:tenantId/patrimoine/importation" element={<ImportPatrimoinePage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

type Utilisateur = ReturnType<typeof userEvent.setup>;

// `applyAccept: false` : on dépose aussi des fichiers que le sélecteur refuserait
// (.xlsm), pour vérifier que la page les refuse elle-même.
const nouvelUtilisateur = (): Utilisateur => userEvent.setup({ delay: null, applyAccept: false });

const titreEtape = (nom: string) => screen.findByRole('heading', { name: nom }, { timeout: 30000 });

async function choisirNature(user: Utilisateur, nature: 'Biens' | 'Valorisations') {
  await user.click(await screen.findByRole('radio', { name: new RegExp(`^${nature}`) }));
  // Pendant le chargement des listes, le bouton porte son icône : « loading Continuer ».
  await waitFor(() => expect(screen.getByRole('button', { name: /Continuer/ })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: /Continuer/ }));
  await titreEtape('Le fichier');
}

async function deposer(user: Utilisateur, fichier: File) {
  const champ = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(champ, fichier);
}

async function ouvrirApercu(user: Utilisateur, nature: 'Biens' | 'Valorisations', fichier: File) {
  await choisirNature(user, nature);
  await deposer(user, fichier);
  await titreEtape('L’aperçu');
}

const boutonImporter = (nombre?: number) =>
  screen.findByRole('button', {
    name: nombre === undefined ? /^Importer \d+ ligne\(s\)$/ : `Importer ${nombre} ligne(s)`
  });

async function lancerImport(user: Utilisateur) {
  await user.click(await boutonImporter());
  await titreEtape('Le rapport');
}

/** La ligne de l'aperçu dont le premier champ porte ce numéro de ligne. */
function ligneApercu(libelleChamp: string, numero: number): HTMLElement {
  return screen.getByLabelText(`${libelleChamp}, ligne ${numero}`).closest('tr') as HTMLElement;
}

function valeurRapport(libelle: string): string {
  const etiquette = screen
    .getAllByText(libelle)
    .map(element => element.closest('.ant-descriptions-item-label'))
    .find(Boolean) as HTMLElement | undefined;
  if (!etiquette) throw new Error(`Compteur de rapport introuvable : ${libelle}`);
  return (etiquette.nextElementSibling?.textContent ?? '').trim();
}

const postsBiens = (): Corps[] => post.mock.calls.filter(c => c[0] === URL_BIENS).map(c => c[1] as Corps);
const postsValorisations = () =>
  post.mock.calls
    .filter(c => /\/valuations$/.test(String(c[0])))
    .map(c => ({ url: String(c[0]), corps: c[1] as Corps }));

/** Le CSV du dernier téléchargement : lignes décodées, et vrai si le BOM y est. */
async function dernierCsv(): Promise<{ nom: string; lignes: string[]; bom: boolean }> {
  const [blob, nom] = saveBlob.mock.calls[saveBlob.mock.calls.length - 1] as [Blob, string];
  const octets = await lireOctets(blob);
  const bom = octets[0] === 0xef && octets[1] === 0xbb && octets[2] === 0xbf;
  const texte = new TextDecoder('utf-8', { ignoreBOM: true }).decode(octets);
  return { nom, lignes: texte.slice(texte.charCodeAt(0) === 0xfeff ? 1 : 0).split('\r\n'), bom };
}

beforeEach(() => {
  vi.clearAllMocks();
  compteurBiens = 0;
  forcerErreurMoteur.actif = false;
  etat = { droits: droits(), biens: BIENS_API, post: postParDefaut };

  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = vi.fn(() => 'blob:test');
  if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = vi.fn();

  get.mockImplementation(async (url: string) => {
    const cible = String(url);
    if (cible === '/geographic/communes') return enveloppe(COMMUNES);
    if (cible.startsWith(`${URL_BIENS}?`)) {
      return {
        data: {
          success: true,
          data: etat.biens,
          pagination: { page: 1, limit: 1000, total: etat.biens.length, totalPages: 1 }
        }
      };
    }
    if (cible === `/tenants/${TENANT}/entitlements`) return enveloppe(etat.droits);
    throw new Error(`GET inattendu : ${cible}`);
  });
  post.mockImplementation((url: string, corps: Corps) => etat.post(url, corps));
});

// ---------------------------------------------------------------------------

describe('Importer mon patrimoine — la page', () => {
  // Le parcours nominal était un seul test de ~13 s à vide sous charge parallèle (4 coeurs saturés), donc au-delà
  // de 30 s sur un runner de CI partagé. Il est scindé en deux tests de même portée, chacun deux fois plus court :
  // le gabarit d'une part, l'aperçu / l'import / le rapport d'autre part.
  it('(1) gabarit Biens : un classeur .xlsx part au téléchargement', async () => {
    const user = nouvelUtilisateur();
    monter();
    await choisirNature(user, 'Biens');

    // Gabarit : un .xlsx part au téléchargement.
    await user.click(screen.getByRole('button', { name: /Télécharger le gabarit Excel/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    const [gabarit, nomGabarit] = saveBlob.mock.calls[0] as [Blob, string];
    expect(nomGabarit).toMatch(/\.xlsx$/);
    expect(gabarit.type).toContain('spreadsheetml');
    const signature = await lireOctets(gabarit);
    expect([signature[0], signature[1]]).toEqual([0x50, 0x4b]);
  });

  it('(1 bis) parcours nominal Biens : aperçu, import, corps des requêtes et rapport', async () => {
    const user = nouvelUtilisateur();
    monter();
    await choisirNature(user, 'Biens');

    // Un CSV de 3 lignes valides, en-têtes du gabarit : l'étape colonnes est sautée.
    await deposer(
      user,
      csv([
        ENTETES_BIENS,
        ligneBien({
          ref: 'BIEN-A',
          titre: 'Villa Soleil',
          adresse: 'Rue des Palmiers',
          zone: 'Riviera',
          surface: '250',
          pieces: '5',
          prix: '85 000 000',
          date: '15/03/2022'
        }),
        ligneBien({
          titre: 'Studio Lagune',
          type: 'Studio',
          commune: 'Yopougon',
          surface: '30',
          pieces: '1',
          mode: 'Location'
        }),
        ligneBien({ titre: 'Terrain Nord', type: 'Terrain', adresse: '', surface: '1200', pieces: '', mode: 'Vente' })
      ])
    );
    await titreEtape('L’aperçu');
    expect(
      await screen.findByText(/3 prête\(s\), 0 en erreur, 0 doublon\(s\) probable\(s\), 0 ignorée\(s\), 0 hors quota/)
    ).toBeInTheDocument();
    expect(screen.queryByText('En erreur')).not.toBeInTheDocument();
    // Rien n'est écrit avant le clic.
    expect(post).not.toHaveBeenCalled();

    await lancerImport(user);

    const corps = postsBiens();
    expect(corps).toHaveLength(3);
    expect(corps.map(c => c.title)).toEqual(['Villa Soleil', 'Studio Lagune', 'Terrain Nord']);
    for (const c of corps) {
      expect(c.ownershipType).toBe('TENANT');
      expect(c).not.toHaveProperty('ownerUserId');
      expect(c).not.toHaveProperty('ownerEmail');
      expect(c).not.toHaveProperty('ownerContactId');
      expect(c.currency).toBe('CFA');
    }
    expect(corps[0]).toMatchObject({
      propertyType: 'MAISON_VILLA',
      address: 'Rue des Palmiers',
      locationZone: 'Riviera',
      surfaceArea: 250,
      rooms: 5,
      transactionModes: ['SALE'],
      typeSpecificData: {
        commune: 'Cocody',
        communeId: 'c-cocody',
        region: 'Abidjan',
        regionId: 'r-abj',
        country: 'Côte d’Ivoire',
        referenceImport: 'BIEN-A'
      }
    });
    expect(corps[1]).toMatchObject({
      propertyType: 'STUDIO',
      transactionModes: ['RENTAL'],
      typeSpecificData: { communeId: 'c-yopougon' }
    });
    expect(corps[2]).toMatchObject({ propertyType: 'TERRAIN', surfaceTerrain: 1200 });
    expect((corps[2].typeSpecificData as Corps).land_area).toBe(1200);

    // Seule la première ligne porte un prix : une valorisation d'acquisition, rattachée au bien créé.
    const valorisations = postsValorisations();
    expect(valorisations).toHaveLength(1);
    expect(valorisations[0].url).toBe(`${URL_BIENS}/new-1/valuations`);
    expect(valorisations[0].corps).toMatchObject({
      valuatedAt: '2022-03-15',
      acquisitionDate: '2022-03-15',
      estimatedValue: 85000000,
      acquisitionCost: 85000000,
      method: 'MANUAL'
    });

    expect(await screen.findByText('3 ligne(s) importée(s).')).toBeInTheDocument();
    expect(valeurRapport('Importées')).toBe('3');
    expect(valeurRapport('En erreur')).toBe('0');
  });

  it('(2) rapproche les colonnes à la main quand les en-têtes ne sont pas reconnus', async () => {
    const user = nouvelUtilisateur();
    monter();
    await choisirNature(user, 'Biens');
    await deposer(
      user,
      csv([
        ['Dénomination', 'Genre', 'Emplacement', 'Opération'],
        ['Villa Mapping', 'Maison', 'Cocody', 'Vente']
      ])
    );

    // L'étape colonnes s'affiche, l'aperçu est bloqué et dit ce qui manque.
    await titreEtape('Les colonnes');
    const manque = (await screen.findByText('Champs obligatoires non rapprochés')).closest('.ant-alert') as HTMLElement;
    for (const champ of ['Titre', 'Type de bien', 'Ville / commune', 'Mode de transaction']) {
      expect(manque).toHaveTextContent(champ);
    }
    const previsualiser = screen.getByRole('button', { name: 'Prévisualiser' });
    expect(previsualiser).toBeDisabled();
    expect(post).not.toHaveBeenCalled();

    const affecter = async (colonne: string, libelleChamp: string) => {
      fireEvent.mouseDown(screen.getByRole('combobox', { name: `Champ pour la colonne ${colonne}` }));
      const option = await waitFor(() => {
        // Les listes déroulantes déjà refermées restent dans le DOM : la plus récente est la dernière.
        const trouvees = document.querySelectorAll(`.ant-select-item-option[title="${libelleChamp}"]`);
        if (trouvees.length === 0) throw new Error(`option absente : ${libelleChamp}`);
        return trouvees[trouvees.length - 1] as HTMLElement;
      });
      fireEvent.click(option);
    };
    await affecter('Dénomination', 'Titre *');
    await affecter('Genre', 'Type de bien *');
    await affecter('Emplacement', 'Ville / commune *');
    await affecter('Opération', 'Mode de transaction *');

    await waitFor(() => expect(previsualiser).toBeEnabled());
    await user.click(previsualiser);
    await titreEtape('L’aperçu');
    expect(await screen.findByText(/1 prête\(s\), 0 en erreur/)).toBeInTheDocument();

    await lancerImport(user);
    expect(postsBiens()).toHaveLength(1);
    expect(postsBiens()[0]).toMatchObject({
      title: 'Villa Mapping',
      propertyType: 'MAISON_VILLA',
      transactionModes: ['SALE'],
      typeSpecificData: { communeId: 'c-cocody' }
    });
  }, 40000);

  it('(2 bis) affiche l’étape colonnes dès qu’une colonne du fichier n’est pas reconnue', async () => {
    const user = nouvelUtilisateur();
    monter();
    await choisirNature(user, 'Biens');
    await deposer(
      user,
      csv([
        [...ENTETES_BIENS, 'Observation du gestionnaire'],
        [...ligneBien({ titre: 'Villa Colonne' }), 'à voir']
      ])
    );

    await titreEtape('Les colonnes');
    // Les champs obligatoires sont rapprochés : rien ne manque, on peut prévisualiser.
    expect(screen.queryByText('Champs obligatoires non rapprochés')).not.toBeInTheDocument();
    const previsualiser = screen.getByRole('button', { name: 'Prévisualiser' });
    expect(previsualiser).toBeEnabled();
    await user.click(previsualiser);
    await titreEtape('L’aperçu');
    expect(await screen.findByText(/1 prête\(s\), 0 en erreur/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  }, 30000);

  it('(3) refuse un fichier vide, un .xlsm et un fichier de plus de 1 000 lignes, sans écriture', async () => {
    const user = nouvelUtilisateur();
    monter();
    await choisirNature(user, 'Biens');

    await deposer(user, new File([], 'vide.csv'));
    expect(await screen.findByText('Ce fichier est vide.')).toBeInTheDocument();

    await deposer(user, new File(['contenu'], 'classeur.xlsm'));
    expect(await screen.findByText(/Les classeurs à macros .* sont refusés/)).toBeInTheDocument();
    expect(screen.queryByText('Ce fichier est vide.')).not.toBeInTheDocument();

    const trop = [
      ENTETES_BIENS,
      ...Array.from({ length: 1001 }, (_, i) => ligneBien({ titre: `Bien ${i}`, adresse: `Rue ${i}` }))
    ];
    await deposer(user, csv(trop, 'gros.csv'));
    expect(
      await screen.findByText(/Ce fichier compte (plus de 1.000 lignes|1.001 lignes, le maximum est 1.000)\./)
    ).toBeInTheDocument();

    // Toujours à l'étape du fichier : aucun aperçu, aucune écriture.
    expect(await screen.findByRole('heading', { name: 'Le fichier' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'L’aperçu' })).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  }, 30000);

  it('(4) signale chaque erreur à l’aperçu avec son numéro de ligne, et n’envoie que les lignes valides après le clic', async () => {
    const user = nouvelUtilisateur();
    monter();
    await ouvrirApercu(
      user,
      'Biens',
      csv([
        ENTETES_BIENS, // ligne 1
        ligneBien({ titre: 'Villa Valide' }), // 2
        null, // 3 : ligne blanche, son numéro compte quand même
        ligneBien({ titre: 'Bien Igloo', type: 'Igloo', adresse: 'Rue 4' }), // 4
        ligneBien({ titre: 'Bien Inconnu', commune: 'Villeinconnue', adresse: 'Rue 5' }), // 5
        ligneBien({ titre: 'Bien Négatif', surface: '-50', adresse: 'Rue 6' }) // 6
      ])
    );

    expect(await screen.findByText(/1 prête\(s\), 3 en erreur/)).toBeInTheDocument();
    expect(
      within(ligneApercu('Titre', 4)).getByText(/« Type de bien » : « Igloo » est introuvable dans la liste\./)
    ).toBeInTheDocument();
    expect(
      within(ligneApercu('Titre', 5)).getByText(
        /« Ville \/ commune » : « Villeinconnue » est introuvable dans la liste\./
      )
    ).toBeInTheDocument();
    expect(
      within(ligneApercu('Titre', 6)).getByText(/« Surface \(m²\) » ne peut pas être négatif\./)
    ).toBeInTheDocument();
    expect(within(ligneApercu('Titre', 4)).getByText('4')).toBeInTheDocument();
    expect(within(ligneApercu('Titre', 2)).getByText('Prête')).toBeInTheDocument();

    // Le bouton est limité aux lignes valides ; aucune écriture avant le clic.
    expect(await boutonImporter(1)).toBeEnabled();
    expect(post).not.toHaveBeenCalled();

    // Une correction sur place réévalue la ligne entière.
    const type = screen.getByLabelText('Type de bien, ligne 4');
    await user.clear(type);
    await user.type(type, 'Studio');
    expect(await boutonImporter(2)).toBeEnabled();
    expect(post).not.toHaveBeenCalled();

    await lancerImport(user);
    expect(postsBiens().map(c => c.title)).toEqual(['Villa Valide', 'Bien Igloo']);
    expect(valeurRapport('Importées')).toBe('2');
    expect(valeurRapport('En erreur')).toBe('2');
  }, 40000);

  it('(5) doublons par référence et par titre + adresse : ignorés par défaut, puis refusés', async () => {
    const user = nouvelUtilisateur();
    monter();
    await ouvrirApercu(
      user,
      'Biens',
      csv([
        ENTETES_BIENS,
        ligneBien({ ref: 'IMM-0001', titre: 'Autre titre', adresse: 'Rue 10' }), // 2 : référence ImmoTopia existante
        ligneBien({ titre: 'Villa Existante', adresse: 'Rue 1' }), // 3 : titre + adresse existants
        ligneBien({ ref: 'EXT-77', titre: 'Titre libre', adresse: 'Rue 11' }), // 4 : référence d'import existante
        ligneBien({ ref: 'BIEN-N', titre: 'Bien Neuf', adresse: 'Rue 12' }), // 5 : nouveau
        ligneBien({ ref: 'BIEN-N', titre: 'Bien Neuf Bis', adresse: 'Rue 13' }), // 6 : même référence que la ligne 5
        ligneBien({ ref: 'IMM-9999', titre: 'Bien Neuf Deux', adresse: 'Rue 14' }) // 7 : référence d'une AUTRE agence : pas un doublon
      ])
    );

    // « Ignorer » est le choix par défaut : les doublons ne partent pas.
    expect(screen.getByRole('radio', { name: 'Ignorer les doublons' })).toBeChecked();
    expect(
      await screen.findByText(/2 prête\(s\), 0 en erreur, 4 doublon\(s\) probable\(s\), 4 ignorée\(s\)/)
    ).toBeInTheDocument();
    expect(within(ligneApercu('Titre', 2)).getByText('Doublon ignoré')).toBeInTheDocument();
    expect(
      within(ligneApercu('Titre', 2)).getByText('Cette référence est déjà utilisée par un bien de l’agence.')
    ).toBeInTheDocument();
    expect(
      within(ligneApercu('Titre', 3)).getByText('Un bien du même titre et de la même adresse existe déjà.')
    ).toBeInTheDocument();
    expect(within(ligneApercu('Titre', 6)).getByText('Identique à la ligne 5 de ce fichier.')).toBeInTheDocument();
    expect(within(ligneApercu('Titre', 7)).getByText('Prête')).toBeInTheDocument();

    // « Refuser » : les mêmes lignes passent en erreur.
    await user.click(screen.getByRole('radio', { name: /^Les refuser/ }));
    expect(
      await screen.findByText(/2 prête\(s\), 4 en erreur, 4 doublon\(s\) probable\(s\), 0 ignorée\(s\)/)
    ).toBeInTheDocument();
    expect(within(ligneApercu('Titre', 3)).getByText(/^Doublon refusé : Un bien du même titre/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    // De retour sur « ignorer », seules les deux lignes neuves partent.
    await user.click(screen.getByRole('radio', { name: 'Ignorer les doublons' }));
    expect(await screen.findByText(/4 ignorée\(s\)/)).toBeInTheDocument();
    await lancerImport(user);
    expect(postsBiens().map(c => c.title)).toEqual(['Bien Neuf', 'Bien Neuf Deux']);
    expect(valeurRapport('Importées')).toBe('2');
    expect(valeurRapport('Ignorées')).toBe('4');
  }, 40000);

  it('(6) annonce l’estimation de quota avant validation : les lignes hors quota ne partent pas et figurent au rapport', async () => {
    etat.droits = droits({ capacities: { BIENS_DETENUS: capacite(5, 3), LOTS: capacite(100, 0) } });
    const user = nouvelUtilisateur();
    monter();
    await ouvrirApercu(
      user,
      'Biens',
      csv([
        ENTETES_BIENS,
        ligneBien({ titre: 'Bien 1', adresse: 'Rue 1' }),
        ligneBien({ titre: 'Bien 2', adresse: 'Rue 2' }),
        ligneBien({ titre: 'Bien 3', adresse: 'Rue 3' }),
        ligneBien({ titre: 'Bien 4', adresse: 'Rue 4' })
      ])
    );

    // L'estimation s'affiche AVANT validation.
    expect(
      await screen.findByText(/4 ligne\(s\) comptent dans vos biens détenus ; place restante : 2\./)
    ).toBeInTheDocument();
    expect(screen.getByText(/2 ligne\(s\) ne seront pas envoyées : capacité atteinte\./)).toBeInTheDocument();
    expect(
      await screen.findByText(/2 prête\(s\), 0 en erreur, 0 doublon\(s\) probable\(s\), 0 ignorée\(s\), 2 hors quota/)
    ).toBeInTheDocument();
    expect(screen.getAllByText('Hors quota (estimation)')).toHaveLength(2);
    expect(await boutonImporter(2)).toBeEnabled();
    expect(post).not.toHaveBeenCalled();

    await lancerImport(user);
    expect(postsBiens().map(c => c.title)).toEqual(['Bien 1', 'Bien 2']);
    expect(valeurRapport('Importées')).toBe('2');
    expect(valeurRapport('Hors quota')).toBe('2');

    // Le rapport CSV liste les lignes hors quota.
    await user.click(screen.getByRole('button', { name: 'Télécharger le rapport (CSV)' }));
    const { lignes } = await dernierCsv();
    expect(lignes.find(l => l.startsWith('4;'))).toMatch(/^4;Hors quota;/);
    expect(lignes.find(l => l.startsWith('5;'))).toMatch(/^5;Hors quota;/);
  }, 40000);

  it('(7) un refus 409 ou 500 n’empêche pas les lignes suivantes, et « Relancer » ne rejoue que les lignes refusées', async () => {
    etat.post = async (url, corps) => {
      if (url === URL_BIENS && corps.title === 'Bien Quota') {
        throw erreurHttp(409, { code: 'QUOTA_EXCEEDED', message: 'Quota de biens détenus atteint pour votre pack.' });
      }
      if (url === URL_BIENS && corps.title === 'Bien Panne') {
        throw erreurHttp(500, { message: 'Erreur interne simulée.' });
      }
      return postParDefaut(url, corps);
    };
    const user = nouvelUtilisateur();
    monter();
    await ouvrirApercu(
      user,
      'Biens',
      csv([
        ENTETES_BIENS,
        ligneBien({ titre: 'Bien Quota', adresse: 'Rue 1' }), // 2 → 409
        ligneBien({ titre: 'Bien Bon 1', adresse: 'Rue 2' }), // 3
        ligneBien({ titre: 'Bien Panne', adresse: 'Rue 3' }), // 4 → 500
        ligneBien({ titre: 'Bien Bon 2', adresse: 'Rue 4' }) // 5
      ])
    );
    await lancerImport(user);

    // Les quatre lignes ont été tentées, dans l'ordre : le refus de la première n'a rien bloqué.
    expect(postsBiens().map(c => c.title)).toEqual(['Bien Quota', 'Bien Bon 1', 'Bien Panne', 'Bien Bon 2']);
    expect(valeurRapport('Importées')).toBe('2');
    expect(valeurRapport('Refusées par le serveur')).toBe('2');
    const ligne2 = (await screen.findByText('Quota de biens détenus atteint pour votre pack.')).closest(
      'tr'
    ) as HTMLElement;
    expect(within(ligne2).getByText('2')).toBeInTheDocument();
    expect(within(ligne2).getByText('Refusée par le serveur')).toBeInTheDocument();
    const ligne4 = screen.getByText('Erreur interne simulée.').closest('tr') as HTMLElement;
    expect(within(ligne4).getByText('4')).toBeInTheDocument();

    // Le serveur accepte désormais : « Relancer » ne rejoue QUE les deux lignes en échec.
    etat.post = postParDefaut;
    await user.click(screen.getByRole('button', { name: 'Relancer les lignes refusées (2)' }));
    await waitFor(() => expect(valeurRapport('Importées')).toBe('4'));
    expect(postsBiens()).toHaveLength(6);
    expect(
      postsBiens()
        .slice(4)
        .map(c => c.title)
    ).toEqual(['Bien Quota', 'Bien Panne']);
    expect(valeurRapport('Refusées par le serveur')).toBe('0');
    expect(screen.queryByRole('button', { name: /^Relancer/ })).not.toBeInTheDocument();
  }, 40000);

  it('(8) refuse une formule, n’envoie jamais la cellule, et rend le HTML d’une cellule comme du texte', async () => {
    const alerte = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const user = nouvelUtilisateur();
    monter();
    const injection = '<img src=x onerror=alert(1)>';
    await ouvrirApercu(
      user,
      'Biens',
      await xlsx([
        ENTETES_BIENS,
        ligneBien({ titre: '=HYPERLINK("http://x")', adresse: 'Rue 1' }), // 2 : formule refusée
        ligneBien({ titre: injection, adresse: 'Rue 2' }), // 3 : titre valide, texte brut
        ligneBien({ titre: 'Bien Type HTML', type: injection, adresse: 'Rue 3' }), // 4 : le motif cite le HTML
        ligneBien({ titre: 'Bien Arobase', adresse: '@cmd' }) // 5 : formule refusée
      ])
    );

    expect(await screen.findByText(/1 prête\(s\), 3 en erreur/)).toBeInTheDocument();
    expect(
      within(ligneApercu('Titre', 2)).getByText('« Titre » ne peut pas commencer par « = » ou « @ » (formule refusée).')
    ).toBeInTheDocument();
    expect(
      within(ligneApercu('Titre', 5)).getByText(
        '« Adresse » ne peut pas commencer par « = » ou « @ » (formule refusée).'
      )
    ).toBeInTheDocument();

    // Le HTML est du TEXTE : dans un champ, et dans le motif d'erreur.
    expect(screen.getByLabelText('Titre, ligne 3')).toHaveValue(injection);
    expect(within(ligneApercu('Titre', 4)).getByText(/onerror=alert\(1\)/)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('[onerror]')).toBeNull();

    await lancerImport(user);
    expect(document.querySelector('img')).toBeNull();
    expect(postsBiens().map(c => c.title)).toEqual([injection]);
    expect(JSON.stringify(post.mock.calls)).not.toContain('HYPERLINK');
    expect(alerte).not.toHaveBeenCalled();
    alerte.mockRestore();
  }, 40000);

  it('(9) Valorisations : rattachement par référence ou titre exact, refus des cas ambigus, introuvables, futurs ou négatifs', async () => {
    const user = nouvelUtilisateur();
    monter();
    await ouvrirApercu(
      user,
      'Valorisations',
      await xlsx([
        ENTETES_VALORISATIONS,
        ['IMM-0001', '30/06/2025', '95 000 000', '', '', 'Expertise', 'Cabinet X'], // 2 : référence ImmoTopia
        ['Résidence Alpha', '30/06/2025', 100000000, '', '', '', ''], // 3 : titre exact
        ['EXT-77', '31/12/2025', 110000000, '', '', '', ''], // 4 : référence d'import, même bien que la ligne 3
        ['Résidence Jumelle', '30/06/2025', '90 000 000', '', '', '', ''], // 5 : titre ambigu
        ['Bien Inconnu', '30/06/2025', '90 000 000', '', '', '', ''], // 6 : introuvable
        ['Bien Étranger', '30/06/2025', '90 000 000', '', '', '', ''], // 7 : bien d'une autre agence
        ['IMM-9999', '30/06/2025', '90 000 000', '', '', '', ''], // 8 : référence d'une autre agence
        ['IMM-0001', '01/01/2099', '80 000 000', '', '', '', ''], // 9 : date future
        ['IMM-0001', '30/06/2024', -5, '', '', '', ''], // 10 : valeur négative
        ['IMM-0001', '', '70 000 000', '', '', '', ''], // 11 : date absente
        ['IMM-0001', '30/06/2023', 0, '', '', '', ''] // 12 : valeur nulle
      ])
    );

    expect(await screen.findByText(/3 prête\(s\), 8 en erreur/)).toBeInTheDocument();
    const champ = 'Bien (référence ou titre)';
    expect(within(ligneApercu(champ, 5)).getByText(/correspond à plusieurs entrées\. Précisez\./)).toBeInTheDocument();
    expect(
      within(ligneApercu(champ, 6)).getByText(/« Bien Inconnu » est introuvable dans la liste\./)
    ).toBeInTheDocument();
    expect(
      within(ligneApercu(champ, 7)).getByText(/« Bien Étranger » est introuvable dans la liste\./)
    ).toBeInTheDocument();
    expect(within(ligneApercu(champ, 8)).getByText(/« IMM-9999 » est introuvable dans la liste\./)).toBeInTheDocument();
    expect(
      within(ligneApercu(champ, 9)).getByText('« Date de la valorisation » ne peut pas être dans le futur.')
    ).toBeInTheDocument();
    expect(within(ligneApercu(champ, 10)).getByText(/« Valeur estimée » ne peut pas être négati/)).toBeInTheDocument();
    expect(within(ligneApercu(champ, 11)).getByText('« Date de la valorisation » est vide.')).toBeInTheDocument();
    expect(
      within(ligneApercu(champ, 12)).getByText('« Valeur estimée » doit être supérieure à zéro.')
    ).toBeInTheDocument();
    // La référence résolue s'affiche sous le titre saisi.
    expect(within(ligneApercu(champ, 3)).getByText('IMM-0002 — Résidence Alpha')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await lancerImport(user);
    const valorisations = postsValorisations();
    expect(valorisations.map(v => v.url)).toEqual([
      `${URL_BIENS}/b1/valuations`,
      `${URL_BIENS}/b2/valuations`,
      `${URL_BIENS}/b2/valuations` // deux valorisations pour un même bien : permis
    ]);
    expect(valorisations[0].corps).toMatchObject({
      valuatedAt: '2025-06-30',
      estimatedValue: 95000000,
      method: 'EXPERT_APPRAISAL',
      notes: 'Source : Cabinet X'
    });
    expect(valorisations[1].corps).toMatchObject({
      valuatedAt: '2025-06-30',
      estimatedValue: 100000000,
      method: 'MANUAL'
    });
    expect(valorisations[2].corps).toMatchObject({ valuatedAt: '2025-12-31', estimatedValue: 110000000 });
    // Aucune requête n'a visé le bien d'une autre agence, ni créé de bien.
    expect(post.mock.calls.some(c => String(c[0]).includes('x1'))).toBe(false);
    expect(postsBiens()).toHaveLength(0);
    expect(valeurRapport('Importées')).toBe('3');
    expect(valeurRapport('En erreur')).toBe('8');
  }, 40000);

  it('(10) bloque l’import quand l’abonnement est en lecture seule, avec une explication', async () => {
    etat.droits = droits({ readOnly: true, readOnlyReason: 'Impayé' });
    const user = nouvelUtilisateur();
    monter();
    await ouvrirApercu(user, 'Biens', csv([ENTETES_BIENS, ligneBien({ titre: 'Bien Bloqué' })]));

    expect(
      await screen.findByText(
        'Votre abonnement est en lecture seule : l’import est impossible tant qu’il n’est pas régularisé.'
      )
    ).toBeInTheDocument();
    const importer = screen.getByRole('button', { name: /^Importer \d+ ligne\(s\)$/ });
    expect(importer).toBeDisabled();
    await user.click(importer);
    expect(screen.getByRole('heading', { name: 'L’aperçu' })).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  }, 30000);

  it('(11) le rapport CSV : BOM, séparateur « ; », une ligne par ligne du fichier, formules neutralisées', async () => {
    const user = nouvelUtilisateur();
    monter();
    await ouvrirApercu(
      user,
      'Biens',
      csv(
        [
          ENTETES_BIENS,
          ligneBien({ titre: 'Villa ; Spéciale', adresse: 'Rue 1' }), // 2 : contient le séparateur
          ligneBien({ titre: '-Tiret', adresse: 'Rue 2' }), // 3 : « - » est admis, neutralisé à l'export
          ligneBien({ titre: '=SUM(A1)', adresse: 'Rue 3' }), // 4 : refusée
          ligneBien({ titre: '+225 Résidence', adresse: 'Rue 4' }) // 5 : « + » admis, neutralisé à l'export
        ],
        'mon parc.csv'
      )
    );
    await lancerImport(user);

    await user.click(screen.getByRole('button', { name: 'Télécharger le rapport (CSV)' }));
    const { nom, lignes, bom } = await dernierCsv();
    expect(nom).toMatch(/^rapport-import-mon-parc-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(bom).toBe(true);
    expect(lignes[0]).toMatch(/^Ligne;Statut;Motif;Détail;Référence interne;Titre;Type de bien;/);
    expect(lignes).toHaveLength(5); // en-tête + 4 lignes du fichier

    const parNumero = (n: number) => lignes.find(l => l.startsWith(`${n};`)) as string;
    expect(parNumero(2)).toMatch(/^2;Importée;Créée\.;IMM-1001;/);
    expect(parNumero(2)).toContain(';"Villa ; Spéciale";');
    expect(parNumero(3)).toMatch(/^3;Importée;Créée\.;IMM-1002;/);
    expect(parNumero(3)).toContain(";'-Tiret;");
    expect(parNumero(4)).toMatch(/^4;En erreur;/);
    expect(parNumero(4)).toContain(";'=SUM(A1);");
    expect(parNumero(5)).toContain(";'+225 Résidence;");
    // Aucune cellule ne commence par une formule non neutralisée.
    for (const ligne of lignes.slice(1)) {
      expect(ligne).not.toMatch(/(^|;)[=+@-]/);
    }
  }, 40000);

  it('(12) écarte d’office la ligne d’exemple [EXEMPLE] du gabarit téléchargé', async () => {
    const user = nouvelUtilisateur();
    monter();
    await choisirNature(user, 'Biens');

    // Le gabarit réel, rendu tel quel : il ne contient que la ligne d'exemple.
    await user.click(screen.getByRole('button', { name: /Télécharger le gabarit Excel/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    const [gabarit, nom] = saveBlob.mock.calls[0] as [Blob, string];
    await deposer(user, new File([gabarit], nom));
    expect(
      await screen.findByText('Ce fichier ne contient aucune ligne à importer (hors ligne d’exemple).')
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Le fichier' })).toBeInTheDocument();

    // L'exemple oublié à côté d'une vraie ligne : l'exemple est ignoré, la vraie part.
    await deposer(
      user,
      csv([
        ENTETES_BIENS,
        [
          '[EXEMPLE] BIEN-001',
          'Villa des Lilas (fictive)',
          'Maison / Villa',
          'Rue des Jardins (fictive)',
          'Cocody',
          'Les Lilas',
          '250',
          '5',
          'Vente',
          '85 000 000',
          '15/03/2022'
        ],
        ligneBien({ titre: 'Vrai Bien' })
      ])
    );
    await titreEtape('L’aperçu');
    expect(await screen.findByText(/1 prête\(s\), 0 en erreur/)).toBeInTheDocument();
    expect(screen.getByText(/Ligne d’exemple ignorée : 1/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await lancerImport(user);
    expect(postsBiens().map(c => c.title)).toEqual(['Vrai Bien']);
    expect(postsValorisations()).toHaveLength(0);
    expect(JSON.stringify(post.mock.calls)).not.toContain('fictive');
  }, 40000);

  it('(13) « Revenir à l’aperçu » ne renvoie jamais une ligne déjà créée ; le rapport final couvre toutes les lignes', async () => {
    etat.post = async (url, corps) => {
      if (url === URL_BIENS && corps.title === 'Bien Quota') {
        throw erreurHttp(409, { code: 'QUOTA_EXCEEDED', message: 'Quota de biens détenus atteint pour votre pack.' });
      }
      return postParDefaut(url, corps);
    };
    const user = nouvelUtilisateur();
    monter();
    await ouvrirApercu(
      user,
      'Biens',
      csv([
        ENTETES_BIENS,
        ligneBien({ titre: 'Bien Bon 1', adresse: 'Rue 1' }),
        ligneBien({ titre: 'Bien Quota', adresse: 'Rue 2' }),
        ligneBien({ titre: 'Bien Bon 2', adresse: 'Rue 3' })
      ])
    );
    await lancerImport(user);
    expect(postsBiens()).toHaveLength(3);
    expect(valeurRapport('Importées')).toBe('2');

    // Retour à l'aperçu (la liste du serveur ne contient pas encore les biens créés) :
    // les deux lignes créées sont décochées d'office, seule la refusée reste.
    etat.post = postParDefaut;
    await user.click(screen.getByRole('button', { name: 'Revenir à l’aperçu' }));
    await titreEtape('L’aperçu');
    expect(
      await screen.findByText(/1 prête\(s\), 0 en erreur, 0 doublon\(s\) probable\(s\), 2 ignorée\(s\)/)
    ).toBeInTheDocument();
    expect(within(ligneApercu('Titre', 2)).getByText('Décochée')).toBeInTheDocument();
    expect(within(ligneApercu('Titre', 4)).getByText('Décochée')).toBeInTheDocument();

    await lancerImport(user);
    // Un seul POST de plus : « Bien Quota ». Aucun doublon créé.
    expect(postsBiens().map(c => c.title)).toEqual(['Bien Bon 1', 'Bien Quota', 'Bien Bon 2', 'Bien Quota']);
    expect(valeurRapport('Importées')).toBe('3');
    expect(valeurRapport('Refusées par le serveur')).toBe('0');
  }, 60000);

  it('(13 bis) revenir à l’aperçu puis ré-importer sans rien corriger : aucun POST de plus', async () => {
    const user = nouvelUtilisateur();
    monter();
    await ouvrirApercu(
      user,
      'Biens',
      csv([
        ENTETES_BIENS,
        ligneBien({ titre: 'Bien A', adresse: 'Rue 1' }),
        ligneBien({ titre: 'Bien B', adresse: 'Rue 2' })
      ])
    );
    await lancerImport(user);
    expect(postsBiens()).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Revenir à l’aperçu' }));
    await titreEtape('L’aperçu');
    expect(
      await screen.findByText(/0 prête\(s\), 0 en erreur, 0 doublon\(s\) probable\(s\), 2 ignorée\(s\)/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Importer 0 ligne\(s\)$/ })).toBeDisabled();
    expect(postsBiens()).toHaveLength(2);
  }, 40000);

  it('(14) une écriture partielle est une ligne « partielle » (référence du bien), non relançable, et ne repart pas', async () => {
    etat.post = async (url, corps) => {
      if (/\/valuations$/.test(url)) throw erreurHttp(422, { message: 'Valorisation refusée par le serveur.' });
      return postParDefaut(url, corps);
    };
    const user = nouvelUtilisateur();
    monter();
    await ouvrirApercu(
      user,
      'Biens',
      csv([
        ENTETES_BIENS,
        ligneBien({ titre: 'Bien Partiel', adresse: 'Rue 1', prix: '50 000 000', date: '01/01/2020' })
      ])
    );
    await lancerImport(user);

    expect(valeurRapport('Partielles')).toBe('1');
    expect(valeurRapport('Refusées par le serveur')).toBe('0');
    expect(valeurRapport('Importées')).toBe('0');
    const ligne = (await screen.findByText(/Valorisation refusée par le serveur\./)).closest('tr') as HTMLElement;
    expect(within(ligne).getByText('Partielle : bien créé, valorisation à ajouter')).toBeInTheDocument();
    expect(within(ligne).getAllByText(/IMM-1001/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Relancer/ })).not.toBeInTheDocument();

    // Revenir à l'aperçu : la ligne partielle (le bien existe) est décochée.
    await user.click(screen.getByRole('button', { name: 'Revenir à l’aperçu' }));
    await titreEtape('L’aperçu');
    expect(await screen.findByText(/0 prête\(s\)/)).toBeInTheDocument();
    expect(postsBiens()).toHaveLength(1);
  }, 40000);

  it('(14 bis) une réponse non reçue (504) reste « refusée par le serveur », sans relance ni nouvel envoi', async () => {
    etat.post = async (url, corps) => {
      if (url === URL_BIENS && corps.title === 'Bien Incertain') throw erreurHttp(504, {});
      return postParDefaut(url, corps);
    };
    const user = nouvelUtilisateur();
    monter();
    await ouvrirApercu(user, 'Biens', csv([ENTETES_BIENS, ligneBien({ titre: 'Bien Incertain', adresse: 'Rue 1' })]));
    await lancerImport(user);

    expect(valeurRapport('Refusées par le serveur')).toBe('1');
    expect(valeurRapport('Partielles')).toBe('0');
    expect(screen.getByText(/a peut-être été créé/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Relancer/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Revenir à l’aperçu' }));
    await titreEtape('L’aperçu');
    expect(await screen.findByText(/0 prête\(s\)/)).toBeInTheDocument();
    expect(postsBiens()).toHaveLength(1);
  }, 40000);

  it('(15) FR-010 : un CSV lu en Windows-1252 affiche l’avertissement aux étapes colonnes et aperçu', async () => {
    const user = nouvelUtilisateur();
    monter();
    await choisirNature(user, 'Biens');

    const texte = [
      [...ENTETES_BIENS, 'Observation'].join(';'),
      [...ligneBien({ titre: 'Villa Éléphant', adresse: 'Rue du Lagon' }), 'à voir'].join(';')
    ].join('\r\n');
    // Windows-1252 : un octet par caractère (’ vaut 0x92) — un UTF-8 invalide.
    const octets = Uint8Array.from(Array.from(texte), c => (c === '’' ? 0x92 : c.charCodeAt(0)));
    await deposer(user, new File([octets], 'ancien.csv', { type: 'text/csv' }));

    const alerte = 'Ce fichier n’est pas en UTF-8 : il a été lu en Windows-1252. Vérifiez les accents dans l’aperçu.';
    await titreEtape('Les colonnes');
    expect(screen.getByText(alerte)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Prévisualiser' }));
    await titreEtape('L’aperçu');
    expect(screen.getByText(alerte)).toBeInTheDocument();
    expect(screen.getByLabelText('Titre, ligne 2')).toHaveValue('Villa Éléphant');
    expect(post).not.toHaveBeenCalled();
  }, 40000);

  it('(15 bis) un CSV en UTF-8 n’affiche aucun avertissement d’encodage', async () => {
    const user = nouvelUtilisateur();
    monter();
    await ouvrirApercu(user, 'Biens', csv([ENTETES_BIENS, ligneBien({ titre: 'Villa Éléphant' })]));
    expect(screen.queryByText(/lu en Windows-1252/)).not.toBeInTheDocument();
  }, 30000);

  it('(16) démonter la page pendant l’import : plus aucun POST après le démontage', async () => {
    let liberer: () => void = () => undefined;
    const attente = new Promise<void>(resolve => {
      liberer = resolve;
    });
    etat.post = async (url, corps) => {
      if (url === URL_BIENS && corps.title === 'Bien 1') await attente;
      return postParDefaut(url, corps);
    };
    const user = nouvelUtilisateur();
    const { unmount } = monter();
    await ouvrirApercu(
      user,
      'Biens',
      csv([
        ENTETES_BIENS,
        ligneBien({ titre: 'Bien 1', adresse: 'Rue 1' }),
        ligneBien({ titre: 'Bien 2', adresse: 'Rue 2' }),
        ligneBien({ titre: 'Bien 3', adresse: 'Rue 3' })
      ])
    );
    await user.click(await boutonImporter());
    await waitFor(() => expect(postsBiens()).toHaveLength(1));

    unmount();
    liberer();
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(postsBiens()).toHaveLength(1);
  }, 40000);

  it('(17) une exception imprévue du moteur ne bloque pas l’écran : message d’erreur et retour à l’aperçu', async () => {
    const user = nouvelUtilisateur();
    monter();
    await ouvrirApercu(user, 'Biens', csv([ENTETES_BIENS, ligneBien({ titre: 'Bien Panne' })]));
    forcerErreurMoteur.actif = true;
    await user.click(await boutonImporter());

    expect(await screen.findByText(/L’import a rencontré une erreur imprévue : panne du moteur/)).toBeInTheDocument();
    await titreEtape('L’aperçu');
    expect(screen.queryByText('Import en cours : 0 sur 1.')).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  }, 40000);

  it('(18) montre sous la cellule la valeur réellement lue (montant, date) quand elle diffère du texte', async () => {
    const user = nouvelUtilisateur();
    monter();
    await ouvrirApercu(
      user,
      'Biens',
      csv([
        ENTETES_BIENS,
        ligneBien({ titre: 'Bien Lu', adresse: 'Rue 1', prix: '10 000 FCFA', date: '2022-03-15' }),
        ligneBien({ titre: 'Bien Net', adresse: 'Rue 2', prix: '85 000 000', date: '15/03/2022' })
      ])
    );
    const lue = ligneApercu('Titre', 2);
    expect(within(lue).getByText(/^Lu : 10\s000$/)).toBeInTheDocument();
    expect(within(lue).getByText('Lu : 15/03/2022')).toBeInTheDocument();
    // Texte identique à la valeur lue : rien n'est ajouté.
    expect(within(ligneApercu('Titre', 3)).queryByText(/^Lu :/)).not.toBeInTheDocument();

    // La valeur lue suit la frappe.
    const prix = screen.getByLabelText('Prix d’acquisition, ligne 3');
    await user.clear(prix);
    await user.type(prix, '2 500,5 F');
    expect(await within(ligneApercu('Titre', 3)).findByText(/^Lu : 2\s500,5$/)).toBeInTheDocument();
  }, 40000);

  it('(19) « n’afficher que les lignes en erreur » : la ligne en cours d’édition reste visible jusqu’à la sortie du champ', async () => {
    const user = nouvelUtilisateur();
    monter();
    await ouvrirApercu(
      user,
      'Biens',
      csv([
        ENTETES_BIENS,
        ligneBien({ titre: 'Villa Valide', adresse: 'Rue 1' }),
        ligneBien({ titre: 'Bien Igloo', type: 'Igloo', adresse: 'Rue 2' })
      ])
    );
    await user.click(screen.getByRole('checkbox', { name: 'N’afficher que les lignes en erreur' }));
    expect(screen.queryByLabelText('Titre, ligne 2')).not.toBeInTheDocument();

    const type = screen.getByLabelText('Type de bien, ligne 3');
    await user.clear(type);
    await user.type(type, 'Studio');
    // Devenue valide, la ligne ne disparaît pas sous les doigts.
    expect(screen.getByLabelText('Type de bien, ligne 3')).toHaveValue('Studio');
    expect(within(ligneApercu('Titre', 3)).getByText('Prête')).toBeInTheDocument();

    // Le focus quitte la ligne (un Tab irait à la cellule voisine, donc resterait dans la ligne).
    await user.click(screen.getByRole('heading', { name: 'L’aperçu' }));
    await waitFor(() => expect(screen.queryByLabelText('Titre, ligne 3')).not.toBeInTheDocument());
  }, 40000);

  it('(20) « Importer » reste désactivé tant que l’estimation de quota charge', async () => {
    let liberer: () => void = () => undefined;
    const attente = new Promise<void>(resolve => {
      liberer = resolve;
    });
    const base = get.getMockImplementation() as (url: string) => Promise<unknown>;
    get.mockImplementation(async (url: string) => {
      if (String(url) === `/tenants/${TENANT}/entitlements`) await attente;
      return base(url);
    });
    const user = nouvelUtilisateur();
    monter();
    await ouvrirApercu(user, 'Biens', csv([ENTETES_BIENS, ligneBien({ titre: 'Bien Quota Lent' })]));

    expect(screen.getByRole('button', { name: /^Importer \d+ ligne\(s\)$/ })).toBeDisabled();
    liberer();
    await waitFor(async () => expect(await boutonImporter(1)).toBeEnabled());
  }, 40000);

  it('(21) pendant la lecture du fichier, « Revenir à la nature » est désactivé', async () => {
    let liberer: () => void = () => undefined;
    const attente = new Promise<void>(resolve => {
      liberer = resolve;
    });
    const fichier = csv([ENTETES_BIENS, ligneBien({ titre: 'Bien Lent' })]);
    const reel = fichier.arrayBuffer.bind(fichier);
    Object.defineProperty(fichier, 'arrayBuffer', { value: () => attente.then(() => reel()) });

    const user = nouvelUtilisateur();
    monter();
    await choisirNature(user, 'Biens');
    await deposer(user, fichier);

    expect(await screen.findByText('Lecture du fichier…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revenir à la nature' })).toBeDisabled();
    liberer();
    await titreEtape('L’aperçu');
  }, 40000);
});
