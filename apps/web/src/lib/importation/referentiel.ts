import { t } from '../../i18n/t';
import { listConstructionSites, listCostCategories, listSuppliers } from '../../services/finance-lot2-service';
import { listEmployees } from '../../services/finance-salaries-service';
import { listContractorContracts, listContractors } from '../../services/finance-contractors-service';
import {
  listStockItems,
  listStockLocations,
  listSupplierInvoicesForReceipt
} from '../../services/finance-stock-mouvements-service';
import { listLandLeases } from '../../services/finance-lot4-service';
import { getAllCommunes } from '../../services/geographic-service';
import { listProperties } from '../../services/property-service';
import { METHODES_DE_VALORISATION, MODES_DE_TRANSACTION, TYPES_DE_BIEN } from './listes-patrimoine';
import type { BienExistant, CleReferentiel, EntreeReferentiel, Referentiel } from './types';
import { REFERENTIEL_VIDE } from './types';
import { indexerEntrees, type ReferentielIndexe } from './valeurs';

/**
 * Le chargement des listes de référence, et la façon d'y rapprocher un
 * libellé.
 *
 * ---------------------------------------------------------------------------
 * Aucun point d'entrée inventé
 * ---------------------------------------------------------------------------
 *
 * Chaque liste vient d'une fonction de service qui existait avant cet écran.
 * Une nature qui aurait besoin d'une liste que l'application n'offre pas ne
 * la fabrique pas : elle s'en passe et le dit.
 *
 * **La liste des factures fournisseur est la seule qui coûte cher.** Le
 * contrat ne propose aucune route « toutes les factures du tenant » : elle se
 * compose fournisseur par fournisseur, en parallèle. Seule la réception de
 * stock la demande — la seule nature dont une pièce doit s'adosser à une
 * facture validée. Les autres natures ne paient pas ce détour.
 */

/** Taille d'une page de biens, et garde-fou sur le nombre de pages lues. */
const BIENS_PAR_PAGE = 1000;
const PAGES_MAX = 100;

/**
 * Les biens de l'agence courante, toutes pages confondues.
 *
 * `GET /properties` renvoie aussi les annonces PUBLIC d'AUTRES agences : on ne
 * garde que les biens dont `tenantId` est celui de l'agence, faute de quoi un
 * import de valorisations pourrait se rattacher à un bien étranger.
 */
async function chargerBiens(tenantId: string): Promise<BienExistant[]> {
  const biens: BienExistant[] = [];
  for (let page = 1; page <= PAGES_MAX; page += 1) {
    const reponse = await listProperties(tenantId, { limit: BIENS_PAR_PAGE, page, ownershipType: 'TENANT' });
    for (const bien of reponse.properties ?? []) {
      if (bien.tenantId !== tenantId) continue;
      const reference = (bien.typeSpecificData as Record<string, unknown> | undefined)?.referenceImport;
      biens.push({
        id: bien.id,
        internalReference: bien.internalReference,
        title: bien.title,
        address: bien.address,
        tenantId: bien.tenantId ?? null,
        referenceExterne: typeof reference === 'string' && reference.trim() !== '' ? reference : null
      });
    }
    const totalPages = reponse.pagination?.totalPages ?? 1;
    if (page >= totalPages) return biens;
  }
  // Plus de pages que le garde-fou : tronquer en silence rattacherait mal des lignes.
  throw new Error(
    t('Trop de biens pour un import : plus de {{max}} biens. Contactez le support pour un import par lots.', {
      max: String(BIENS_PAR_PAGE * PAGES_MAX)
    })
  );
}

/** Les listes que réclament plusieurs descripteurs, chargées une seule fois. */
export async function chargerReferentiel(tenantId: string, cles: CleReferentiel[]): Promise<Referentiel> {
  const demande = new Set(cles);
  // Les factures se composent depuis les fournisseurs : l'un implique l'autre.
  if (demande.has('facturesFournisseur')) demande.add('fournisseurs');

  const referentiel: Referentiel = { ...REFERENTIEL_VIDE };

  const travaux: Array<Promise<void>> = [];

  if (demande.has('postes')) {
    travaux.push(
      listCostCategories(tenantId).then(postes => {
        referentiel.postes = postes.filter(poste => poste.isActive);
      })
    );
  }
  if (demande.has('chantiers')) {
    travaux.push(
      listConstructionSites(tenantId).then(chantiers => {
        referentiel.chantiers = chantiers;
      })
    );
  }
  if (demande.has('salaries')) {
    travaux.push(
      listEmployees(tenantId, { onlyActive: true }).then(salaries => {
        referentiel.salaries = salaries;
      })
    );
  }
  if (demande.has('tacherons')) {
    travaux.push(
      listContractors(tenantId, { onlyActive: true }).then(tacherons => {
        referentiel.tacherons = tacherons;
      })
    );
  }
  if (demande.has('contrats')) {
    travaux.push(
      listContractorContracts(tenantId).then(contrats => {
        referentiel.contrats = contrats.filter(contrat => contrat.isActive);
      })
    );
  }
  if (demande.has('articles')) {
    travaux.push(
      listStockItems(tenantId, { onlyActive: true }).then(articles => {
        referentiel.articles = articles;
      })
    );
  }
  if (demande.has('lieux')) {
    travaux.push(
      listStockLocations(tenantId, { onlyActive: true }).then(lieux => {
        referentiel.lieux = lieux;
      })
    );
  }
  if (demande.has('baux')) {
    travaux.push(
      listLandLeases(tenantId).then(baux => {
        referentiel.baux = baux;
      })
    );
  }

  if (demande.has('communes')) {
    travaux.push(
      getAllCommunes().then(communes => {
        referentiel.communes = communes;
      })
    );
  }
  if (demande.has('biens')) {
    travaux.push(
      chargerBiens(tenantId).then(biens => {
        referentiel.biens = biens;
      })
    );
  }

  const fournisseurs = demande.has('fournisseurs')
    ? listSuppliers(tenantId).then(liste => {
        referentiel.fournisseurs = liste;
        return liste;
      })
    : Promise.resolve([]);
  travaux.push(fournisseurs.then(() => undefined));

  if (demande.has('facturesFournisseur')) {
    travaux.push(
      fournisseurs
        .then(liste =>
          Promise.all(
            liste.map(fournisseur => listSupplierInvoicesForReceipt(tenantId, fournisseur.id).catch(() => []))
          )
        )
        .then(paquets => {
          referentiel.facturesFournisseur = paquets.flat();
        })
    );
  }

  await Promise.all(travaux);
  return referentiel;
}

// ---------------------------------------------------------------------------
// Ce qu'une liste offre au rapprochement
// ---------------------------------------------------------------------------

/**
 * Les entrées rapprochables d'une liste.
 *
 * Les alias ne sont pas décoratifs : un fichier de stock désigne un article
 * par sa référence (« CIM-42 ») aussi souvent que par son libellé, et un
 * marché de tâcheron se cite par son numéro. Sans eux, la moitié d'un
 * fichier réel resterait « introuvable ».
 */
export function entreesReferentiel(cle: CleReferentiel, referentiel: Referentiel): EntreeReferentiel[] {
  switch (cle) {
    case 'postes':
      return referentiel.postes.map(poste => ({ id: poste.id, libelle: poste.label }));
    case 'fournisseurs':
      return referentiel.fournisseurs.map(fournisseur => ({ id: fournisseur.id, libelle: fournisseur.name }));
    case 'chantiers':
      return referentiel.chantiers.map(chantier => ({
        id: chantier.id,
        libelle: chantier.name,
        alias: chantier.zone ? [chantier.zone] : undefined
      }));
    case 'salaries':
      return referentiel.salaries.map(salarie => ({ id: salarie.id, libelle: salarie.fullName }));
    case 'tacherons':
      return referentiel.tacherons.map(tacheron => ({ id: tacheron.id, libelle: tacheron.fullName }));
    case 'contrats':
      return referentiel.contrats.map(contrat => ({
        id: contrat.id,
        libelle: contrat.reference,
        alias: [`${contrat.contractorLabel} ${contrat.reference}`, `${contrat.contractorLabel} ${contrat.siteLabel}`]
      }));
    case 'articles':
      return referentiel.articles.map(article => ({
        id: article.id,
        libelle: article.label,
        alias: [article.reference]
      }));
    case 'lieux':
      return referentiel.lieux.map(lieu => ({
        id: lieu.id,
        libelle: lieu.label,
        alias: lieu.siteLabel ? [lieu.siteLabel] : undefined
      }));
    case 'baux':
      return referentiel.baux.map(bail => ({
        id: bail.id,
        libelle: bail.landLabel,
        alias: [bail.landlordName]
      }));
    case 'facturesFournisseur':
      return referentiel.facturesFournisseur.map(facture => ({
        id: facture.id,
        libelle: facture.reference,
        alias: [`${facture.supplierLabel} ${facture.reference}`]
      }));
    case 'communes':
      return referentiel.communes.map(commune => ({
        id: commune.communeId,
        libelle: commune.commune,
        alias: [commune.displayName, `${commune.commune} ${commune.region}`, `${commune.commune} ${commune.country}`]
      }));
    case 'biens':
      return referentiel.biens.map(bien => ({
        id: bien.id,
        // Le libellé affiché dans l'aperçu porte la référence ET le titre ; le
        // rapprochement exact reste possible sur l'une, l'autre ou la référence du fichier.
        libelle: `${bien.internalReference} — ${bien.title}`,
        alias: [bien.internalReference, bien.title, ...(bien.referenceExterne ? [bien.referenceExterne] : [])]
      }));
    case 'typesBien':
      return TYPES_DE_BIEN.map(type => ({ id: type.code, libelle: type.libelle, alias: type.alias }));
    case 'modesTransaction':
      return MODES_DE_TRANSACTION.map(mode => ({ id: mode.code, libelle: mode.libelle, alias: mode.alias }));
    case 'methodesValorisation':
      return METHODES_DE_VALORISATION.map(methode => ({
        id: methode.code,
        libelle: methode.libelle,
        alias: methode.alias
      }));
    default:
      return [];
  }
}

/** Le libellé d'une entrée, pour l'afficher à la place de son identifiant. */
export function libelleEntree(cle: CleReferentiel, referentiel: Referentiel, id: string): string | null {
  const entree = entreesReferentiel(cle, referentiel).find(candidat => candidat.id === id);
  return entree ? entree.libelle : null;
}

// ---------------------------------------------------------------------------
// Index mis en cache
// ---------------------------------------------------------------------------

interface EntreeDeCache {
  /** La liste source au moment de l'indexation : si elle est remplacée, l'index est refait. */
  source: unknown;
  index: ReferentielIndexe;
}

const CACHE_INDEX = new WeakMap<Referentiel, Map<CleReferentiel, EntreeDeCache>>();

/**
 * Les entrées d'une liste avec leurs libellés déjà normalisés, mémorisées par
 * objet `Referentiel` : l'aperçu réévalue des centaines de lignes à chaque
 * frappe, et chaque cellule « référence » reconstruirait sinon la liste.
 *
 * Le cache suppose la liste d'un référentiel immuable une fois chargée (elle
 * est remplacée, jamais modifiée en place) ; remplacer la propriété suffit à
 * l'invalider.
 */
export function entreesIndexees(cle: CleReferentiel, referentiel: Referentiel): ReferentielIndexe {
  let parCle = CACHE_INDEX.get(referentiel);
  if (!parCle) {
    parCle = new Map();
    CACHE_INDEX.set(referentiel, parCle);
  }
  const source = cle in referentiel ? (referentiel as unknown as Record<string, unknown>)[cle] : null;
  const present = parCle.get(cle);
  if (present && present.source === source) return present.index;
  const index = indexerEntrees(entreesReferentiel(cle, referentiel));
  parCle.set(cle, { source, index });
  return index;
}
