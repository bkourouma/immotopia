import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';
import type { CopilotToolName } from '../../types/copilot';
import { humanizeFieldName } from '../../utils/copilot-artifact';
import { statusLabel } from '../primitives/StatusTag';

/**
 * Libellés des énumérations affichées par les cartes du copilote. Mêmes textes
 * que les écrans biens et baux (`PropertyCard`, `LeaseDetailPage`) : un type ou
 * un statut ne doit pas s'appeler autrement selon l'écran. Valeur inconnue :
 * la valeur brute est affichée.
 */
export function propertyTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    APPARTEMENT: t('Appartement'),
    MAISON_VILLA: t('Maison / Villa'),
    STUDIO: t('Studio'),
    DUPLEX_TRIPLEX: t('Duplex / Triplex'),
    CHAMBRE_COLOCATION: t('Chambre / Colocation'),
    BUREAU: t('Bureau'),
    BOUTIQUE_COMMERCIAL: t('Boutique / Commercial'),
    ENTREPOT_INDUSTRIEL: t('Entrepôt / Industriel'),
    TERRAIN: t('Terrain'),
    IMMEUBLE: t('Immeuble'),
    PARKING_BOX: t('Parking / Box'),
    LOT_PROGRAMME_NEUF: t('Lot programme neuf')
  };
  return labels[value] ?? value;
}

export function propertyStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    DRAFT: t('Brouillon'),
    UNDER_REVIEW: t('En révision'),
    AVAILABLE: t('Disponible'),
    RESERVED: t('Réservé'),
    UNDER_OFFER: t('Sous offre'),
    RENTED: t('Loué'),
    SOLD: t('Vendu'),
    ARCHIVED: t('Archivé')
  };
  return labels[value] ?? value;
}

export function leaseStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    DRAFT: t('Brouillon'),
    ACTIVE: t('Actif'),
    SUSPENDED: t('Suspendu'),
    ENDED: t('Terminé'),
    CANCELED: t('Annulé')
  };
  return labels[value] ?? value;
}

/** Montant reçu du serveur sous forme de chaîne : séparateurs de milliers selon la langue active. */
export function formatCopilotAmount(amount: string | number | null): string {
  if (amount === null || amount === '') return '';
  const n = Number(amount);
  return Number.isFinite(n) ? n.toLocaleString(activeLocale()) : String(amount);
}

/**
 * Libellé d'état d'un outil du copilote (« en cours »). La passerelle générique
 * (`list_capabilities`, `call_read`) consulte n'importe quel écran en lecture :
 * le texte le dit, sans prétendre écrire quoi que ce soit.
 */
export function copilotToolLabel(tool: CopilotToolName): string {
  const labels: Record<CopilotToolName, string> = {
    search_properties: t('Recherche de biens'),
    search_leases: t('Recherche de baux'),
    list_lease_documents: t('Liste des documents du bail'),
    list_property_documents: t('Liste des documents du bien'),
    propose_rental_document: t('Préparation d’un document'),
    show_artifact: t('Affichage dans le panneau'),
    list_capabilities: t('Recherche dans les consultations disponibles'),
    call_read: t('Consultation d’une donnée')
  };
  return labels[tool];
}

const ENUM_CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

/**
 * Libellé d'une valeur d'énumération connue (type ou statut de bien, de bail, de
 * paiement…), réutilisant les textes des écrans. `null` si le texte n'est pas EXACTEMENT
 * un code connu : un nom, une référence ou une phrase ne sont jamais traduits.
 */
export function knownEnumLabel(value: string): string | null {
  if (!ENUM_CODE.test(value)) return null;
  const type = propertyTypeLabel(value);
  if (type !== value) return type;
  return statusLabel(value);
}

/**
 * Libellé lisible d'un champ d'écriture (nom de champ de l'API : `internalNotes`,
 * `first_name`, `address.city`…). La clé est normalisée (minuscules, sans séparateur) ;
 * un champ inconnu retombe sur `humanizeFieldName`. Le nom technique reste à
 * la charge de l'appelant (infobulle `title`).
 */
export function planFieldLabel(field: string): string {
  // Chemin imbriqué (`address.city`, `items[0].name`) : libellé du dernier segment.
  const segments = field.split('.').filter(s => s !== '');
  const leaf = (segments[segments.length - 1] ?? field).replace(/\[\d+\]$/, '') || field;
  switch (leaf.toLowerCase().replace(/[^a-z0-9]/g, '')) {
    case 'ownershiptype':
      return t('Type de détention');
    case 'propertytype':
      return t('Type de bien');
    case 'transactionmode':
    case 'transactionmodes':
      return t('Mode de transaction');
    case 'locationzone':
      return t('Zone');
    case 'containerparentid':
      return t('Bien parent');
    case 'owneruserid':
      return t('Propriétaire');
    case 'internalnotes':
      return t('Notes internes');
    case 'notes':
      return t('Notes');
    case 'note':
      return t('Note');
    case 'name':
      return t('Nom');
    case 'firstname':
      return t('Prénom');
    case 'lastname':
      return t('Nom de famille');
    case 'fullname':
      return t('Nom complet');
    case 'legalname':
      return t('Raison sociale');
    case 'civility':
      return t('Civilité');
    case 'color':
      return t('Couleur');
    case 'email':
      return t('E-mail');
    case 'emailsecondary':
      return t('E-mail secondaire');
    case 'phone':
    case 'phoneprimary':
      return t('Téléphone');
    case 'phonesecondary':
      return t('Téléphone secondaire');
    case 'whatsappnumber':
      return t('Numéro WhatsApp');
    case 'status':
      return t('Statut');
    case 'role':
      return t('Rôle');
    case 'roles':
      return t('Rôles');
    case 'title':
      return t('Titre');
    case 'subject':
      return t('Objet');
    case 'description':
      return t('Description');
    case 'content':
    case 'body':
      return t('Contenu');
    case 'label':
      return t('Libellé');
    case 'code':
      return t('Code');
    case 'reason':
      return t('Motif');
    case 'amount':
      return t('Montant');
    case 'totalamount':
      return t('Montant total');
    case 'rentamount':
    case 'monthlyrent':
      return t('Loyer');
    case 'depositamount':
    case 'securitydepositamount':
      return t('Dépôt de garantie');
    case 'price':
      return t('Prix');
    case 'currency':
      return t('Devise');
    case 'budgetmin':
      return t('Budget minimum');
    case 'budgetmax':
      return t('Budget maximum');
    case 'quantity':
      return t('Quantité');
    case 'startdate':
      return t('Date de début');
    case 'enddate':
      return t('Date de fin');
    case 'duedate':
      return t('Date d’échéance');
    case 'paidat':
      return t('Date de paiement');
    case 'nextactionat':
      return t('Prochaine action le');
    case 'address':
      return t('Adresse');
    case 'city':
      return t('Ville');
    case 'country':
      return t('Pays');
    case 'district':
      return t('Quartier');
    case 'surface':
      return t('Surface');
    case 'bedrooms':
      return t('Chambres');
    case 'bathrooms':
      return t('Salles de bain');
    case 'reference':
      return t('Référence');
    case 'type':
      return t('Type');
    case 'kind':
      return t('Nature');
    case 'category':
      return t('Catégorie');
    case 'priority':
      return t('Priorité');
    case 'stage':
      return t('Étape');
    case 'source':
      return t('Source');
    case 'tags':
      return t('Étiquettes');
    case 'isactive':
      return t('Actif');
    case 'assignedtouserid':
      return t('Responsable');
    case 'contactid':
      return t('Contact');
    case 'propertyid':
      return t('Bien');
    case 'leaseid':
      return t('Bail');
    case 'siteid':
      return t('Site');
    case 'position':
      return t('Position');
    default:
      return humanizeFieldName(leaf);
  }
}
