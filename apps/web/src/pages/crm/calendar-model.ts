import type { Event as RBCEvent } from 'react-big-calendar';
import type { CalendarEvent, CalendarEventType } from '../../services/crm-service';

import { activeLocale } from '../../i18n/format';
/**
 * Modèle d'événement partagé entre la liste agenda et la grille.
 *
 * Ce fichier ne contient **que des types et des fonctions pures**. C'est
 * délibéré : la page l'importe statiquement, et tout ce qu'il tirerait
 * entrerait dans le chunk de la page — ce que la scission de
 * `react-big-calendar` cherche précisément à éviter. Le seul import de
 * `react-big-calendar` est un `import type`, effacé à la compilation.
 */

export interface EvenementAgenda extends RBCEvent {
  title: string;
  start: Date;
  end: Date;
  eventId: string;
  eventType: CalendarEventType;
  contactId: string;
  contactName: string;
  dealId: string | null;
  dealLabel: string | null;
  status?: string;
  badges: string[];
  canEdit: boolean;
  canDrag: boolean;
  nextActionType?: string;
  location?: string;
  assignedToUserId?: string | null;
  createdByUserId: string;
  propertyId?: string | null;
}

/**
 * Convertit un événement de l'API, en écartant ceux dont la date est illisible.
 *
 * Une date invalide produit un `Date` NaN, que `react-big-calendar` place
 * n'importe où dans la grille — ou fait planter selon la vue. L'événement est
 * écarté plutôt que rendu à une date fausse.
 */
export function versEvenementAgenda(event: CalendarEvent): EvenementAgenda | null {
  const debut = event.start ? new Date(event.start) : null;
  if (!debut || Number.isNaN(debut.getTime())) return null;

  const fin = event.end ? new Date(event.end) : null;

  return {
    eventId: event.eventId,
    eventType: event.eventType,
    title: event.title,
    start: debut,
    // Une relance est ponctuelle : sans fin valide, elle dure l'instant de son
    // début.
    end: fin && !Number.isNaN(fin.getTime()) ? fin : debut,
    contactId: event.contactId,
    contactName: event.contactName,
    dealId: event.dealId,
    dealLabel: event.dealLabel,
    status: event.status,
    badges: event.badges,
    canEdit: event.canEdit,
    canDrag: event.canDrag,
    nextActionType: event.nextActionType,
    location: event.location,
    assignedToUserId: event.assignedToUserId,
    createdByUserId: event.createdByUserId,
    propertyId: event.propertyId
  };
}

export interface FiltresAgenda {
  /** `FOLLOWUP`, `VISITE` ou `RDV`. */
  type?: string;
  assignedTo?: string;
  contactName?: string;
}

/**
 * Filtre les événements de la fenêtre chargée.
 *
 * Ce filtrage se fait **en mémoire**, et c'est assumé : contrairement aux
 * listes paginées du §8.4, l'agenda ne reçoit pas une page mais une **fenêtre
 * de dates complète**. Filtrer cette fenêtre ne cache donc aucun résultat qui
 * existerait ailleurs dans la même période.
 *
 * La limite subsiste et mérite d'être dite : chercher un nom ne cherche que
 * dans la période affichée. `CalendarFilters` n'accepte aujourd'hui que
 * `from`, `to`, `scope` et `types` — une recherche sur tout l'historique
 * demanderait un paramètre côté API.
 */
export function filtrerEvenements(evenements: EvenementAgenda[], filtres: FiltresAgenda): EvenementAgenda[] {
  let resultat = evenements;

  if (filtres.type) {
    resultat = resultat.filter(e =>
      filtres.type === 'FOLLOWUP' ? e.eventType === 'FOLLOWUP' : e.eventType === 'PROPERTY_VISIT'
    );
  }

  if (filtres.assignedTo) {
    resultat = resultat.filter(e => e.assignedToUserId === filtres.assignedTo);
  }

  if (filtres.contactName) {
    const terme = filtres.contactName.toLowerCase().trim();
    resultat = resultat.filter(e => e.contactName?.toLowerCase().includes(terme));
  }

  return resultat;
}

/** Regroupe les événements par jour, dans l'ordre chronologique. */
export function grouperParJour(evenements: EvenementAgenda[]): { jour: Date; evenements: EvenementAgenda[] }[] {
  const parJour = new Map<string, EvenementAgenda[]>();

  for (const evenement of [...evenements].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    // Clé locale (et non ISO) : un événement à 23 h heure locale appartient au
    // jour que l'utilisateur voit, pas au lendemain UTC.
    const cle = `${evenement.start.getFullYear()}-${evenement.start.getMonth()}-${evenement.start.getDate()}`;
    const existants = parJour.get(cle);
    if (existants) existants.push(evenement);
    else parJour.set(cle, [evenement]);
  }

  return [...parJour.values()].map(groupe => ({ jour: groupe[0].start, evenements: groupe }));
}

/** Lignes d'export, identiques pour le CSV et le tableur. */
export function lignesExport(evenements: EvenementAgenda[]): Record<string, string>[] {
  const dateHeure = (valeur: Date | undefined) =>
    valeur && !Number.isNaN(valeur.getTime()) ? valeur.toLocaleString(activeLocale()) : '';

  return evenements.map(e => ({
    Type: e.eventType === 'FOLLOWUP' ? 'Relance' : 'Visite',
    Titre: e.title,
    Contact: e.contactName,
    Affaire: e.dealLabel || '',
    'Date début': dateHeure(e.start),
    'Date fin': dateHeure(e.end),
    "Type d'action": e.nextActionType || '',
    Lieu: e.location || '',
    Statut: e.status || '',
    Badges: e.badges.join(', ')
  }));
}
