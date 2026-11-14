import type { HelpEntry } from '../../../types';

/** Zone « activites » du module « commercial » (en) : activités, calendrier, tableau de bord CRM. */
const entries: HelpEntry[] = [
  {
    id: 'commercial.activites.liste',
    kind: 'page',
    title: 'Activities',
    summary:
      'Here you will find every interaction your agency has had with its contacts: calls, e-mails, visits, notes, tasks. This is also where you record a new activity.',
    purpose:
      'An activity keeps a record of what happened with a contact (and, if you wish, about a deal): what was said, the outcome, and the next action to take. This history lets the whole team pick up a file without asking the client everything again.',
    steps: [
      {
        title: 'Record an activity',
        detail:
          'Click “New activity”, choose the contact and the type, write the content, then click “Create the activity”.'
      },
      {
        title: 'Search',
        detail: 'Type a word from the subject, content or outcome, or a contact or author name, in the search field.'
      },
      {
        title: 'Filter',
        detail:
          'Narrow the list with the criteria Activity type, Contact, Team member, Period, Direction and Next action.'
      },
      {
        title: 'Open the contact or the deal',
        detail: 'In an activity, click “Contact: …” or “Deal: …” to open the matching record.'
      },
      {
        title: 'Browse pages',
        detail: 'The list shows 50 activities per page, most recent first.'
      }
    ],
    consequences: [
      "You see all of the agency's activities, not only your own: the list is not limited to the author.",
      'From this screen, a recorded activity cannot be edited or deleted.',
      'Creating an activity sends no message to the contact: it is an internal record only.'
    ],
    faq: [
      {
        q: 'How do I schedule a follow-up?',
        a: 'In the form, fill in “Next action” with the date and time. The activity then appears in the calendar as a follow-up.'
      },
      {
        q: 'I cannot see the “New activity” button, or the page is refused. Why?',
        a: 'It depends on your rights: “View activities” to consult, “Create activities” to record one. Ask your agency administrator.'
      },
      {
        q: 'What does the “Correction” tag mean?',
        a: 'It marks an activity that corrects an earlier one. The form on this screen does not create them.'
      }
    ],
    permissions: {
      feature: 'CRM',
      note: 'Viewing the list requires “View activities”; recording an activity requires “Create activities”.'
    },
    related: [
      { label: 'How to read the timeline', helpId: 'commercial.activites.liste.chronologie' },
      { label: 'Fill in the activity form', helpId: 'commercial.activites.liste.formulaire' },
      { label: 'See follow-ups in the calendar', helpId: 'commercial.activites.calendrier' }
    ],
    keywords: [
      'activity',
      'activities',
      'call',
      'history',
      'interaction',
      'customer follow-up',
      'note',
      'task',
      'follow-up',
      'next action'
    ]
  },
  {
    id: 'commercial.activites.liste.chronologie',
    kind: 'section',
    title: 'Activity timeline',
    summary:
      'Each card is an activity, from the most recent to the oldest. It shows the type, date, content, contact, deal and author.',
    howToRead: {
      statuses: [
        { value: 'CALL', label: 'Call', description: 'A phone call.' },
        { value: 'EMAIL', label: 'Email', description: 'An exchange by e-mail.' },
        { value: 'SMS', label: 'SMS', description: 'An exchange by SMS.' },
        { value: 'WHATSAPP', label: 'WhatsApp', description: 'An exchange by WhatsApp.' },
        { value: 'VISIT', label: 'Viewing', description: 'A property visit.' },
        { value: 'MEETING', label: 'Meeting', description: 'A meeting or appointment.' },
        { value: 'NOTE', label: 'Note', description: 'An internal note, with no exchange with the contact.' },
        { value: 'TASK', label: 'Task', description: 'Something to do.' },
        {
          value: 'CORRECTION',
          label: 'Correction',
          description: 'An activity that corrects an earlier activity.'
        }
      ],
      notes: [
        'Under the type, a direction tag gives the sense of the exchange: “Outbound” (you contact the client), “Inbound” (the client contacts you) or “Internal” (between colleagues).',
        'The “Result:” line gives the outcome of the activity, if it was filled in.',
        'The “Next action” tag shows the planned action type and its date. With no type specified, it shows “Follow-up”.',
        '“By:” gives the name of the person who recorded the activity.'
      ]
    },
    faq: [
      {
        q: 'Why does an activity have no deal?',
        a: 'The deal is optional: an activity can concern a contact only.'
      },
      {
        q: 'Where is the activity date?',
        a: 'Next to the type: it is the “Occurrence date”, meaning when the exchange took place, not necessarily when it was recorded.'
      },
      {
        q: 'How do I delete or edit an activity?',
        a: 'This screen does not allow it. Record a new activity to complete the history.'
      }
    ],
    permissions: { feature: 'CRM', note: 'Requires “View activities”.' },
    related: [{ label: 'Record an activity', helpId: 'commercial.activites.liste.formulaire' }],
    keywords: ['history', 'timeline', 'call', 'visit', 'note', 'result', 'direction']
  },
  {
    id: 'commercial.activites.liste.formulaire',
    kind: 'section',
    title: 'Activity form',
    summary:
      'This form records an exchange with a contact: call, visit, note, task… The contact and the content are required.',
    steps: [
      { title: 'Choose the contact', detail: 'The “Contact” field is required: search by name or e-mail.' },
      {
        title: 'Link a deal (optional)',
        detail:
          "The “Deal (optional)” field offers that contact's deals. It stays greyed out until a contact is chosen, and changes if you change the contact."
      },
      {
        title: 'Set the type and direction',
        detail:
          '“Type” is “Call” by default; “Direction” is “Outbound”. Change them if needed: Call, Email, SMS, WhatsApp, Viewing, Meeting, Note or Task.'
      },
      { title: 'Write', detail: '“Subject” is optional; “Content” is required.' },
      {
        title: 'Date it',
        detail: '“Occurrence date” is prefilled with the current moment: change it if the exchange took place earlier.'
      },
      {
        title: 'Plan what comes next (optional)',
        detail:
          '“Next action” (date and time) and “Next action type” (free text, for example “Reminder” or “Send a quote”). “Result” notes the outcome of the exchange.'
      },
      { title: 'Confirm', detail: 'Click “Create the activity”.' }
    ],
    consequences: [
      'The activity is added at the top of the timeline, with your name as author.',
      'If you fill in “Next action”, a follow-up appears in the calendar on that date. It counts in “Overdue actions” on the dashboard once the date has passed.',
      "The contact's last interaction date is updated.",
      'No e-mail, SMS or WhatsApp message is sent to the contact: it is an internal record.',
      "The creation is noted in the agency's activity log."
    ],
    faq: [
      {
        q: 'The message “The contact is required” appears. What should I do?',
        a: 'Select a contact from the list. An activity is always linked to a contact.'
      },
      {
        q: 'I cannot find the deal I am looking for.',
        a: "The list only shows the chosen contact's deals. Check the contact."
      },
      {
        q: 'Will a reminder be sent on the next action date?',
        a: 'No, no automatic reminder is sent. The date only makes the follow-up appear in the calendar and in the work plan.'
      }
    ],
    permissions: { feature: 'CRM', note: 'Requires “Create activities”.' },
    related: [
      { label: 'See follow-ups in the calendar', helpId: 'commercial.activites.calendrier' },
      { label: 'The dashboard work plan', helpId: 'commercial.activites.tableau-de-bord.plan-de-travail' }
    ],
    keywords: ['new activity', 'create an activity', 'log a call', 'next action', 'follow-up']
  },
  {
    id: 'commercial.activites.calendrier',
    kind: 'page',
    title: 'Calendar',
    summary:
      'The calendar gathers your follow-ups (planned next actions) and property visits. You can read it as an agenda, a month, a week or a day.',
    purpose:
      'It is the everyday working tool: knowing who to call back, which visits are planned, and moving or completing a follow-up without leaving the screen.',
    steps: [
      {
        title: 'Choose the view',
        detail:
          '“Calendar”, “Month”, “Week” or “Day”. On a narrow screen the agenda is shown by default; on a large screen, it is the month.'
      },
      {
        title: 'Narrow down',
        detail: 'Tick “My calendar” to see only your items, or untick “Show follow-ups” to keep only visits.'
      },
      {
        title: 'Search or filter',
        detail:
          'The search covers the title, client, deal, place and action type. It only searches within the displayed period.'
      },
      {
        title: 'Open an event',
        detail: 'Click it: an “Event details” panel opens.'
      },
      {
        title: 'Move a follow-up',
        detail: 'In Month, Week or Day view, drag the follow-up to another slot.'
      },
      {
        title: 'Create a follow-up',
        detail: 'Click “New follow-up” and fill in the form.'
      },
      {
        title: 'Export',
        detail:
          'Header menu: “Export as CSV” or “Export to a spreadsheet”. The export contains the displayed events, after your filters.'
      }
    ],
    consequences: [
      'A follow-up is an activity with a dated “Next action”. It leaves the calendar when you mark it as done.',
      'Moving a follow-up changes its next action date, nothing else.',
      'Moving a property visit is not yet possible from the calendar: a message tells you so.',
      'No message is sent to the contact when you move or complete an event.'
    ],
    faq: [
      {
        q: "Why can't I see other team members' follow-ups with “My calendar”?",
        a: 'This box keeps only the follow-ups you created and the visits assigned to you. Untick it to see the whole agency.'
      },
      {
        q: 'A follow-up disappeared after a click. Why?',
        a: '“Mark as done” clears its next action date: it no longer appears in the calendar. The activity itself stays in the activity list.'
      },
      {
        q: '“Appointment” and “Viewing” give the same list. Is that normal?',
        a: 'Yes, today these two choices both show all property appointments and visits. Only “Follow-up” is different.'
      },
      {
        q: 'I search for a name and nothing appears.',
        a: 'The search only covers the displayed period. Change month, week or day.'
      }
    ],
    permissions: {
      feature: 'CRM',
      note: 'The server requires “View activities”; the “Calendar” menu entry depends on the “View appointments” right. Moving or completing a follow-up requires “Create activities”.'
    },
    related: [
      { label: 'Calendar views and filters', helpId: 'commercial.activites.calendrier.vues' },
      { label: 'Event details', helpId: 'commercial.activites.calendrier.evenement' },
      { label: 'Create a follow-up', helpId: 'commercial.activites.calendrier.relance' },
      { label: 'Activities', helpId: 'commercial.activites.liste' }
    ],
    keywords: ['agenda', 'appointment', 'follow-up', 'visit', 'schedule', 'call back', 'calendar'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'calendrier-nouvelle-relance',
          title: 'Create a follow-up',
          description: 'This button opens the form: the contact, the content and the date of the next action.'
        },
        {
          target: 'calendrier-vues',
          title: 'Choose the view',
          description: 'Switch between agenda, month, week and day depending on what you want to see.'
        },
        {
          target: 'calendrier-recherche',
          title: 'Search and filter',
          description: 'Filter by event type, team member or period. The search covers the displayed period.'
        },
        {
          target: 'calendrier-contenu',
          title: 'Your events',
          description: 'Click an event to see its details, mark it as done or open the contact.'
        }
      ]
    }
  },
  {
    id: 'commercial.activites.calendrier.vues',
    kind: 'section',
    title: 'Calendar views and filters',
    summary:
      'Choose how to display your events and which ones to keep: view, “My calendar”, follow-ups, search and filters.',
    howToRead: {
      notes: [
        '“Calendar”: a list by day (“Today”, “Tomorrow”, then the date). “Month”, “Week” and “Day”: grid.',
        '“My calendar”: only the follow-ups you created and the visits you are in charge of or collaborate on.',
        '“Show follow-ups”: when unticked, only property visits remain.',
        '“Event type” criterion: “Follow-up” for next actions; “Appointment” and “Viewing” both show property visits and appointments.',
        '“Team member” criterion: it filters the visits assigned to that person. Follow-ups have no assigned team member: they disappear when this criterion is used.',
        '“Custom period” criterion: the start date moves the calendar to that date.',
        'In the grid, visits are in the accent colour and follow-ups in green; a completed or cancelled event is greyed out.',
        'The loaded events cover the displayed period plus a margin on each side: change the period to see others.'
      ]
    },
    faq: [
      {
        q: 'The view changes when I switch to a phone. Why?',
        a: 'Below 992 pixels wide, the agenda is shown by default. Your explicit choice of view still takes priority.'
      },
      {
        q: "How do I get back to today's date?",
        a: 'In the header menu, choose “Back to today”.'
      }
    ],
    permissions: { feature: 'CRM', note: 'Requires “View activities”.' },
    related: [{ label: 'Calendar overview', helpId: 'commercial.activites.calendrier' }],
    keywords: ['view', 'agenda', 'month', 'week', 'day', 'my calendar', 'filter']
  },
  {
    id: 'commercial.activites.calendrier.evenement',
    kind: 'section',
    title: 'Event details',
    summary:
      'This panel shows a calendar event: title, tags, date, place. It lets you open the contact, the deal or the property, and mark the event as done.',
    steps: [
      { title: 'Read', detail: '“When” gives the date and time, “Venue” the address of a visit.' },
      {
        title: 'Open the linked record',
        detail: "“View” followed by the contact's name, then “View the deal” and “View the property” when they exist."
      },
      { title: 'Complete', detail: 'Click “Mark as done”.' }
    ],
    consequences: [
      'For a follow-up: its next action date is cleared. It disappears from the calendar and the work plan and no longer counts in “Overdue actions”. The activity stays in the list. There is no undo from the calendar.',
      'For a property visit: it becomes “Completed”. If it is linked to a contact, a “Viewing” activity (“Visite de propriété terminée …”) is added to their history.',
      'No message is sent to the contact.',
      'The button is greyed out when the visit is already done or cancelled.'
    ],
    faq: [
      {
        q: 'The “Mark as done” button fails for a visit. Why?',
        a: 'Completing a visit requires the right to schedule property visits. Ask your agency administrator.'
      },
      {
        q: 'How do I postpone a follow-up instead of completing it?',
        a: 'Close this panel and drag the follow-up to another slot, in Month, Week or Day view.'
      }
    ],
    permissions: {
      feature: 'CRM',
      note: 'Completing a follow-up requires “Create activities”; completing a visit requires the right to schedule property visits.'
    },
    related: [{ label: 'Calendar overview', helpId: 'commercial.activites.calendrier' }],
    keywords: ['complete', 'follow-up done', 'visit done', 'details', 'mark as done']
  },
  {
    id: 'commercial.activites.calendrier.relance',
    kind: 'section',
    title: 'New follow-up',
    summary:
      'This form creates a follow-up: a task linked to a contact, dated by “Next action”. It is the same form as the one for activities.',
    steps: [
      { title: 'Choose the contact', detail: 'The “Contact” field is required.' },
      { title: 'Write the content', detail: 'The “Content” field is required: what must be done or said.' },
      {
        title: 'Date the follow-up',
        detail: 'Fill in “Next action”. Without a date, the follow-up is placed at the moment of creation.'
      },
      {
        title: 'Specify (optional)',
        detail: '“Deal (optional)”, “Subject”, “Next action type”, “Result”.'
      },
      { title: 'Confirm', detail: 'Click “Create the activity”.' }
    ],
    consequences: [
      'Whatever “Type” is chosen in the form, the activity is recorded as a “Task”.',
      'It appears in the calendar on the next action date and in the activity list.',
      'No message is sent to the contact and no automatic reminder is scheduled.'
    ],
    faq: [
      {
        q: 'I chose “Call” but the activity is a “Task”. Why?',
        a: 'In the calendar, every follow-up you create is a task. To record a call, use the Activities page.'
      }
    ],
    permissions: { feature: 'CRM', note: 'Requires “Create activities”.' },
    related: [{ label: 'Detailed activity form', helpId: 'commercial.activites.liste.formulaire' }],
    keywords: ['new follow-up', 'create a follow-up', 'call back', 'task']
  },
  {
    id: 'commercial.activites.tableau-de-bord',
    kind: 'page',
    title: 'CRM dashboard',
    summary:
      'An overview of sales activity: prospects, deals, pipeline stages, conversion funnel, trends and actions to take.',
    purpose:
      'It helps the sales manager see where the agency stands and what needs action today. Click an indicator or a pipeline bar to open the matching list.',
    steps: [
      {
        title: 'Choose the period',
        detail: '“This month” and “30 derniers jours” buttons at the top right.'
      },
      {
        title: 'Read the indicators',
        detail: 'The cards at the top count prospects and deals, with the change compared with the previous period.'
      },
      {
        title: 'Look at the pipeline and the funnel',
        detail: 'They show where the deals are and how many move on from one stage to the next.'
      },
      {
        title: 'Handle the work plan',
        detail: "At the bottom, the list of overdue actions, today's and this week's; click a line to open the contact."
      }
    ],
    consequences: [
      'This dashboard is read-only: nothing changes when you view it.',
      'Currently, the server calculates the indicators and the curve over the last 7 days, whatever period is displayed at the top of the page, and without taking a chosen team member into account.',
      'The pipeline, the funnel, the work plan and “Overdue actions” cover the whole agency, with no period limit.'
    ],
    faq: [
      {
        q: 'The figures do not change when I click “30 derniers jours”. Why?',
        a: 'The displayed dates change, but the server currently calculates the indicators over the last 7 days. See the “Displayed period” sheet.'
      },
      {
        q: 'I cannot see the “Team performance” card.',
        a: 'It only appears if the server provides team data, which is not the case for now.'
      },
      {
        q: 'Clicking “Overdue actions” does not filter the list. Is that normal?',
        a: 'Yes: the click opens the activity list, with no automatic filter on overdue items. Use the calendar or the work plan to find them.'
      }
    ],
    permissions: {
      feature: 'CRM',
      note: 'The server requires “View contacts”; the menu entry depends on the rights on contacts and deals.'
    },
    related: [
      { label: 'Displayed period', helpId: 'commercial.activites.tableau-de-bord.periode' },
      { label: 'The indicators', helpId: 'commercial.activites.tableau-de-bord.indicateurs' },
      { label: 'The work plan', helpId: 'commercial.activites.tableau-de-bord.plan-de-travail' }
    ],
    keywords: ['dashboard', 'kpi', 'statistics', 'pipeline', 'funnel', 'performance', 'leads', 'indicators'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'dashboard-periode',
          title: 'The period',
          description:
            "These buttons change the displayed dates. How the indicators are calculated is described in this area's help."
        },
        {
          target: 'dashboard-indicateurs',
          title: 'The indicators',
          description: 'Prospects, deals created and won, overdue actions. Click a card to open the list.'
        },
        {
          target: 'dashboard-pipeline',
          title: 'The pipeline',
          description: 'Open deals, stage by stage. Click a bar to open the deals at that stage.'
        },
        {
          target: 'dashboard-plan-de-travail',
          title: 'The work plan',
          description: 'Actions to do now and those of the week. Click a line to open the contact.'
        }
      ]
    }
  },
  {
    id: 'commercial.activites.tableau-de-bord.periode',
    kind: 'section',
    title: 'Displayed period',
    summary:
      'The “This month” and “30 derniers jours” buttons set the dates shown under the title. The dates are also kept in the page address.',
    howToRead: {
      notes: [
        '“This month”: from the first to the last day of the current month. “30 derniers jours”: from 30 days ago to today (the starting setting).',
        'Currently, the server ignores these dates: it calculates the indicators and the curve over the last 7 days. This needs fixing in the application; the help will be updated afterwards.'
      ]
    },
    faq: [
      {
        q: 'Can I choose another period?',
        a: 'The screen only offers these two buttons.'
      },
      {
        q: 'Can I share my view with a colleague?',
        a: 'Yes: the dates are in the page address, which you can copy.'
      }
    ],
    permissions: { feature: 'CRM', note: 'Requires “View contacts”.' },
    related: [{ label: 'The indicators', helpId: 'commercial.activites.tableau-de-bord.indicateurs' }],
    keywords: ['period', 'this month', '30 days', 'dates']
  },
  {
    id: 'commercial.activites.tableau-de-bord.indicateurs',
    kind: 'section',
    title: 'Period indicators',
    summary: 'Four cards count prospects and deals: “New leads”, “Leads converted”, “Deals created” and “Deals won”.',
    howToRead: {
      notes: [
        '“New leads”: contacts with the “Lead” status created during the period.',
        '“Leads converted”: contacts with the “Active client” status whose record was modified during the period. The server does not keep the exact date of the switch to “Active client”.',
        '“Deals created”: deals created during the period.',
        '“Deals won”: deals at the “Won” stage whose last modification falls within the period.',
        'Under the figure, an arrow shows an increase, a decrease or stability, with the difference and the percentage compared with the previous period of the same length. A number above 1,000 is shown in short form (1.2k).',
        'Currently, the period actually calculated is the last 7 days, and the choice of a team member is not applied.'
      ]
    },
    consequences: [
      'Clicking a card opens the list of contacts (“Lead” or “Active client” status) or of deals (created, or at the “Won” stage).'
    ],
    faq: [
      {
        q: "Why doesn't “Leads converted” match my conversions?",
        a: 'It counts active clients modified in the period, not only those who have just moved from prospect to client.'
      },
      {
        q: 'Why is there no curve under the figures?',
        a: 'The small curve only appears if the server sends the history, which is not the case for now.'
      }
    ],
    permissions: { feature: 'CRM', note: 'Requires “View contacts”.' },
    related: [
      { label: 'Overdue actions', helpId: 'commercial.activites.tableau-de-bord.actions-en-retard' },
      { label: 'Displayed period', helpId: 'commercial.activites.tableau-de-bord.periode' }
    ],
    keywords: ['leads', 'prospects', 'deals won', 'deals created', 'conversion', 'kpi']
  },
  {
    id: 'commercial.activites.tableau-de-bord.actions-en-retard',
    kind: 'section',
    title: 'Overdue actions',
    summary:
      'This card counts the activities whose “Next action” date has passed and that have not been marked as done.',
    howToRead: {
      notes: [
        'The figure covers the whole agency and depends on neither the period nor a team member.',
        'An overdue action is an activity whose next action date has passed. If the work is done but the follow-up was not completed in the calendar, it is still counted.',
        'This card has no comparison with the previous period.'
      ]
    },
    steps: [
      {
        title: 'Find the overdue items',
        detail: 'Open the work plan (“To do now” tab) or the calendar.'
      },
      {
        title: 'Clear them',
        detail: 'In the calendar, open the follow-up and click “Mark as done”, or drag it to a new date.'
      }
    ],
    consequences: [
      'Clicking the card opens the activity list, with no automatic filter on overdue items.',
      'Completing or moving a follow-up in the calendar lowers this figure.'
    ],
    faq: [
      {
        q: 'Why is this figure larger than the work plan list?',
        a: 'The work plan only shows the 10 oldest overdue items, while the card counts them all.'
      }
    ],
    permissions: { feature: 'CRM', note: 'Requires “View contacts”.' },
    related: [
      { label: 'The work plan', helpId: 'commercial.activites.tableau-de-bord.plan-de-travail' },
      { label: 'The calendar', helpId: 'commercial.activites.calendrier' }
    ],
    keywords: ['overdue', 'late', 'follow-ups', 'to do', 'next action']
  },
  {
    id: 'commercial.activites.tableau-de-bord.pipeline',
    kind: 'section',
    title: 'Deal pipeline',
    summary: 'A histogram shows how many open deals are at each stage: New, Qualified, Visit, Negotiation.',
    howToRead: {
      statuses: [
        { value: 'NEW', label: 'New', description: 'A deal that has just been opened.' },
        { value: 'QUALIFIED', label: 'Qualified', description: "The client's need is qualified." },
        { value: 'VISIT', label: 'Visit', description: 'Visits are under way.' },
        { value: 'NEGOTIATION', label: 'Negotiation', description: 'The offer is being discussed.' }
      ],
      notes: [
        'Only open deals are counted: the “Won” and “Lost” stages do not appear.',
        'Hover over a bar: “Count”, “Value” (sum of the expected values of the deals, in FCFA) and “Average age” (days since the deals were created).',
        'The pipeline covers the whole agency, with no period limit.'
      ]
    },
    consequences: ['Clicking a bar opens the list of deals at that stage.'],
    faq: [
      {
        q: 'Why is the value 0 FCFA?',
        a: 'The value adds up the expected value entered on each deal. A deal with no expected value counts as 0.'
      },
      {
        q: 'Where are the won and lost deals?',
        a: 'They are counted in “Deals won” and in the funnel, but not in this histogram.'
      }
    ],
    permissions: { feature: 'CRM', note: 'Requires “View contacts”.' },
    related: [{ label: 'The conversion funnel', helpId: 'commercial.activites.tableau-de-bord.entonnoir' }],
    keywords: ['pipeline', 'stages', 'open deals', 'value', 'average age', 'histogram']
  },
  {
    id: 'commercial.activites.tableau-de-bord.entonnoir',
    kind: 'section',
    title: 'Conversion funnel',
    summary: 'This chart shows what share of contacts reaches each stage: Leads, Qualified, Visit, Negotiation, Won.',
    howToRead: {
      notes: [
        '“Leads”: all contacts with the “Lead” or “Active client” status. This is the base, at 100%.',
        'Each following stage counts the deals that reached that stage or a more advanced one (“Qualified” also counts deals in Visit, in Negotiation and won).',
        'The “Qualified” percentage is measured against the leads; that of the following stages, against the previous stage.',
        'Hover over a bar: “Count”, “Rate” and “Loss” (share of the previous stage that did not reach this one).',
        'The bars are sorted from the highest percentage to the lowest, not necessarily in the order of the stages.',
        'The funnel covers the whole agency, with no period limit. The bars are not clickable.'
      ]
    },
    faq: [
      {
        q: 'Why does a rate sometimes exceed 100%?',
        a: 'Deals and contacts are counted separately: one contact can have several deals, which can push the “Qualified” stage above 100%.'
      }
    ],
    permissions: { feature: 'CRM', note: 'Requires “View contacts”.' },
    related: [{ label: 'The pipeline', helpId: 'commercial.activites.tableau-de-bord.pipeline' }],
    keywords: ['funnel', 'conversion', 'rate', 'loss']
  },
  {
    id: 'commercial.activites.tableau-de-bord.evolution',
    kind: 'section',
    title: 'Trend over time',
    summary:
      'A curve follows three series: “Activities”, “New leads” and “Deals won”. You choose which ones to display.',
    howToRead: {
      notes: [
        '“Activities”: activities recorded by the whole agency. “New leads”: “Lead” contacts created. “Deals won”: deals at the “Won” stage that were modified.',
        'Each point groups the figures of a day or a week.',
        'Click a pill (“Activities”, “New leads”, “Deals won”) to show or hide the series.',
        'Hover over the curve to read the values; the bar under the chart lets you zoom in on part of the period.',
        'Currently, the period calculated is the last 7 days.'
      ]
    },
    faq: [
      {
        q: "Why doesn't the “Activities” series change when I choose a team member?",
        a: 'It counts the activities of the whole agency.'
      }
    ],
    permissions: { feature: 'CRM', note: 'Requires “View contacts”.' },
    related: [{ label: 'Displayed period', helpId: 'commercial.activites.tableau-de-bord.periode' }],
    keywords: ['trend', 'curve', 'chart', 'evolution', 'time']
  },
  {
    id: 'commercial.activites.tableau-de-bord.plan-de-travail',
    kind: 'section',
    title: 'Work plan',
    summary:
      "The list of actions to take: those overdue and today's (“To do now”), then those of the coming days (“This week”).",
    howToRead: {
      notes: [
        'A line is an activity with a dated “Next action”. It shows the action type (or “Action required”), the subject, the date and time, the contact and the deal.',
        "“To do now”: the 10 oldest overdue actions, then all of today's.",
        '“This week”: up to 10 actions from the next 7 days, after today.',
        'The work plan covers the whole agency: it is not limited to your actions.',
        'The small icons to the right of each line do nothing for now. To complete or move an action, use the calendar.'
      ]
    },
    steps: [
      { title: 'Choose the tab', detail: '“To do now” or “This week”.' },
      { title: 'Open the contact', detail: "Click a line: the contact's record opens." },
      {
        title: 'Clear it in the calendar',
        detail: 'Open the calendar to mark the action as done or move it.'
      }
    ],
    consequences: ['Viewing the work plan changes nothing.'],
    faq: [
      {
        q: 'My follow-up does not appear here.',
        a: 'It only appears if its date is overdue, today, or within the next 7 days. Beyond that, it stays visible in the calendar.'
      },
      {
        q: 'What do the messages “Everything is up to date.” and “Nothing this week” mean?',
        a: 'No action is overdue or planned for today, or none is planned in the next 7 days.'
      }
    ],
    permissions: { feature: 'CRM', note: 'Requires “View contacts”.' },
    related: [
      { label: 'Overdue actions', helpId: 'commercial.activites.tableau-de-bord.actions-en-retard' },
      { label: 'The calendar', helpId: 'commercial.activites.calendrier' }
    ],
    keywords: ['work plan', 'to do', 'follow-ups', 'this week', 'today', 'workbench']
  }
];

export default entries;
