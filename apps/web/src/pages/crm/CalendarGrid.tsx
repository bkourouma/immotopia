import React from 'react';
import { Calendar as BigCalendar, dayjsLocalizer, View } from 'react-big-calendar';
import dayjs from 'dayjs';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './Calendar.css';
import type { EvenementAgenda } from './calendar-model';

/**
 * Grille mensuelle, hebdomadaire ou journalière — le module lourd.
 *
 * Il est isolé ici pour une raison mesurée : `react-big-calendar` et sa feuille
 * de style pèsent **191 795 o bruts et 11 828 o de CSS**, et
 * `REFONTE_UI_UX.md` §8.1 le dit explicitement — « l'écran par défaut sous
 * 992 px est la vue agenda, qui n'en a pas besoin → import dynamique à
 * l'intérieur de la page ».
 *
 * Un collaborateur en tournée, sur un téléphone et un réseau dégradé, ne
 * télécharge donc rien de tout cela : il obtient la liste. La grille n'arrive
 * que si quelqu'un la demande.
 *
 * Les imports de CSS vivent dans ce fichier et non dans la page : placés là-bas,
 * ils seraient entrés dans le chunk de la page et la scission n'aurait rien
 * économisé.
 */

dayjs.locale('fr');
const localizer = dayjsLocalizer(dayjs);

export interface CalendarGridProps {
  events: EvenementAgenda[];
  view: View;
  onView: (view: View) => void;
  date: Date;
  onNavigate: (date: Date) => void;
  onSelectEvent: (event: EvenementAgenda) => void;
  onEventDrop: (args: { event: EvenementAgenda; start: Date; end: Date }) => void;
  onEventResize: (args: { event: EvenementAgenda; start: Date; end: Date }) => void;
}

/**
 * Couleurs des événements, tirées des tokens.
 *
 * L'ancienne version posait `#10b981`, `#3b82f6` et `#9ca3af` en dur — trois
 * valeurs littérales que le §10.1 interdit et qu'aucun contrôle de contraste
 * ne couvrait. Les rôles sont lus une fois au rendu, depuis la même source que
 * le reste de l'application.
 */
function couleurEvenement(event: EvenementAgenda): React.CSSProperties {
  const termine = event.status === 'DONE' || event.status === 'CANCELED';
  const racine = getComputedStyle(document.documentElement);
  const fond = termine
    ? racine.getPropertyValue('--text-tertiary').trim()
    : event.eventType === 'PROPERTY_VISIT'
      ? racine.getPropertyValue('--color-primary').trim()
      : racine.getPropertyValue('--color-success-text').trim();

  return {
    backgroundColor: fond,
    borderColor: fond,
    color: racine.getPropertyValue('--text-on-inverse').trim() || '#fff',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    opacity: termine ? 0.65 : 1,
    fontSize: 'var(--font-size-sm)',
    padding: '2px 4px',
    lineHeight: 1.2
  };
}

const MESSAGES = {
  next: 'Suivant',
  previous: 'Précédent',
  today: "Aujourd'hui",
  month: 'Mois',
  week: 'Semaine',
  day: 'Jour',
  agenda: 'Agenda',
  date: 'Date',
  time: 'Heure',
  event: 'Événement',
  noEventsInRange: 'Aucun événement sur cette période'
};

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  events,
  view,
  onView,
  date,
  onNavigate,
  onSelectEvent,
  onEventDrop,
  onEventResize
}) => (
  <div style={{ height: 600, minHeight: 400 }} className="calendar-container">
    <BigCalendar<EvenementAgenda>
      localizer={localizer}
      events={events}
      startAccessor="start"
      endAccessor="end"
      view={view}
      onView={onView}
      date={date}
      onNavigate={onNavigate}
      onSelectEvent={onSelectEvent}
      onEventDrop={onEventDrop}
      onEventResize={onEventResize}
      eventPropGetter={event => ({ style: couleurEvenement(event), className: 'rbc-event-small' })}
      draggableAccessor={event => event.canDrag}
      resizable
      messages={MESSAGES}
    />
  </div>
);

export default CalendarGrid;
