declare module 'react-big-calendar' {
  import { Component, CSSProperties } from 'react';
  import { Moment } from 'moment';

  export type View = 'month' | 'week' | 'work_week' | 'day' | 'agenda';
  export type Navigate = 'PREV' | 'NEXT' | 'TODAY' | 'DATE';

  export interface Event {
    title?: string;
    start?: Date;
    end?: Date;
    allDay?: boolean;
    resource?: any;
    [key: string]: any; // Allow additional properties
  }

  export interface CalendarProps<TEvent extends Event = Event> {
    localizer: any;
    events?: TEvent[];
    startAccessor?: string | ((event: TEvent) => Date);
    endAccessor?: string | ((event: TEvent) => Date);
    defaultDate?: Date;
    date?: Date;
    view?: View;
    onView?: (view: View) => void;
    onNavigate?: (date: Date, view: View, action: Navigate) => void;
    onSelectEvent?: (event: TEvent) => void;
    onSelectSlot?: (slotInfo: { start: Date; end: Date; slots: Date[]; action: 'select' | 'click' | 'doubleClick' }) => void;
    onEventDrop?: (args: { event: TEvent; start: Date; end: Date }) => void;
    onEventResize?: (args: { event: TEvent; start: Date; end: Date }) => void;
    eventPropGetter?: (event: TEvent, start: Date, end: Date, isSelected: boolean) => { style?: CSSProperties; className?: string };
    draggableAccessor?: (event: TEvent) => boolean;
    resizable?: boolean;
    defaultDate?: Date;
    messages?: {
      next?: string;
      previous?: string;
      today?: string;
      month?: string;
      week?: string;
      day?: string;
      agenda?: string;
      date?: string;
      time?: string;
      event?: string;
      noEventsInRange?: string;
    };
  }

  export class Calendar<TEvent extends Event = Event> extends Component<CalendarProps<TEvent>> {}

  export function momentLocalizer(moment: any): any;

  export default Calendar;
}

