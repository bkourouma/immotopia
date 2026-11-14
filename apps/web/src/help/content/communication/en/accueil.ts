import type { HelpEntry } from '../../../types';

/** "accueil" zone of the "communication" module (en): the home dashboard. */
const entries: HelpEntry[] = [
  {
    id: 'communication.accueil.tableau-de-bord',
    kind: 'page',
    title: 'Dashboard',
    summary:
      "The dashboard sums up your agency's activity: key figures, what needs handling today, charts and the latest news. Every card leads to the screen that holds the detail.",
    purpose:
      'This is the home page for agency staff. It only shows the modules included in your subscription and that your rights allow you to see.\n\nA dash "—" in place of a figure means the module is not accessible to you, not that the result is zero.',
    howToRead: {
      notes: [
        'Tiles at the top: "Arrears", "To collect within 7 days" and the month\'s "Collected" (rental management), then "Properties", "Contacts" and "Open tickets".',
        'Shortened amounts: "85 k" for 85 000 FCFA, "12.4 M" for 12.4 million FCFA.'
      ]
    },
    steps: [
      { title: 'Look at the tiles', detail: 'Click a tile to open the list that produces that figure.' },
      { title: "Work through today's list", detail: 'Click a line of "To handle today".' },
      { title: 'Browse the charts', detail: "Click a slice, a bar or the card's link." }
    ],
    consequences: [
      'This screen is read-only: nothing here changes your data and no message is sent.',
      'The figures refresh when you reopen the page, or come back to the tab after about thirty seconds.'
    ],
    faq: [
      {
        q: 'Why is there a dash "—" in place of a figure?',
        a: 'You are not allowed to view that module (the tile says "Module not accessible"). Ask your agency administrator for it.'
      },
      {
        q: 'Why are some tiles or cards missing?',
        a: "A card only appears if the module is included in your agency's pack (rental management, CRM, co-ownership, portfolio) and you have the matching right."
      },
      {
        q: 'I am an owner, tenant or co-owner: where is my dashboard?',
        a: 'This dashboard is for agency staff. A client account is sent to its own portal; a personal space, to the net worth screen.'
      }
    ],
    permissions: {
      roles: ['Agency team member'],
      note: 'Each block depends on your viewing rights (properties, contacts, deals, leases, instalments, payments, tickets, co-ownerships).'
    },
    related: [
      { label: 'The "To handle today" list', helpId: 'communication.accueil.tableau-de-bord.a-traiter' },
      { label: 'The "Collected" tile', helpId: 'communication.accueil.tableau-de-bord.encaisse' }
    ],
    keywords: [
      'home',
      'home page',
      'dashboard',
      'indicators',
      'figures',
      'statistics',
      'charts',
      'overview',
      'arrears',
      'to do'
    ],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'accueil-indicateurs',
          title: 'Your key figures',
          description:
            'Click a tile to open the list that produces that figure. A dash means the module is not accessible.'
        },
        {
          target: 'accueil-a-traiter',
          title: 'To handle today',
          description: 'The most serious lines first: arrears, payments to approve, urgent tickets.'
        },
        {
          target: 'accueil-graphiques',
          title: 'The charts',
          description: 'Click a slice or a bar to open the filtered list.'
        },
        {
          target: 'accueil-activite',
          title: 'Recent activity',
          description: 'The latest properties added, contacts recorded and payments collected.'
        }
      ]
    }
  },
  {
    id: 'communication.accueil.tableau-de-bord.impayes',
    kind: 'section',
    title: '"Arrears" tile',
    summary: 'The amount still to be paid on overdue rent instalments, with their number.',
    purpose: 'It tells you how much the agency has to chase. Click it to open the list of "Overdue" instalments.',
    howToRead: {
      notes: [
        'The amount is what remains to be paid: rent, services, other fees and penalties, minus what has already been paid.',
        'An instalment counts as overdue if its status is "Overdue", or if it is still "Draft" or "Not yet due" although its date has passed.',
        'The amount is shortened ("85 k", "1.2 M"). It needs rental management and the "View instalments" right; otherwise a dash is shown.'
      ]
    },
    related: [{ label: 'The "To handle today" list', helpId: 'communication.accueil.tableau-de-bord.a-traiter' }],
    keywords: ['arrears', 'late', 'unpaid rent', 'reminder', 'overdue']
  },
  {
    id: 'communication.accueil.tableau-de-bord.a-encaisser',
    kind: 'section',
    title: '"To collect within 7 days" tile',
    summary: 'The amount still to be paid on rent instalments falling due in the next 7 days.',
    purpose: 'It helps you prepare the week\'s collections. Click it to open the "Not yet due" instalments.',
    howToRead: {
      notes: [
        'Counted are the "Not yet due" or "Partial" instalments whose date falls between today and the following 7 days.',
        'The amount is what remains to be paid (rent, services, other fees and penalties, minus what is already paid).',
        'It needs rental management and the "View instalments" right.'
      ]
    },
    keywords: ['instalments', 'week', 'upcoming', 'rent to collect']
  },
  {
    id: 'communication.accueil.tableau-de-bord.encaisse',
    kind: 'section',
    title: 'Month\'s "Collected" tile',
    summary: 'The total of successful payments for the current month, compared with the previous month.',
    purpose:
      "This is the figure highlighted on the screen (a coloured line marks the tile's edge). Click it to open the list of payments.",
    howToRead: {
      notes: [
        'Added together are the payments with the "Successful" status whose success date falls in the month shown in the tile title.',
        'The text below gives the change as a percentage against the previous month (for example "+12%").',
        "If the previous month collected nothing, that percentage would be meaningless: the tile then shows the target for the month instead, meaning the total of the month's instalments (rent, services, other fees and penalties, cancelled instalments excluded), whether already paid or not.",
        'It needs rental management and the "View payments" right. Without the "View instalments" right, the target is 0.'
      ]
    },
    related: [{ label: 'Cash flow over 12 months', helpId: 'communication.accueil.tableau-de-bord.tresorerie' }],
    keywords: ['collected', 'collection', 'income', 'payments this month', 'figure of the month']
  },
  {
    id: 'communication.accueil.tableau-de-bord.biens',
    kind: 'section',
    title: '"Properties" tile',
    summary: 'The number of properties of the agency, with the occupied share and the number of published properties.',
    purpose: 'Click it to open the list of properties.',
    howToRead: {
      notes: [
        'The number counts every property of the agency, whatever its status (drafts and archived ones included).',
        '"Occupied" = the properties that are "Let" or "Sold", as a percentage of the total.',
        '"Published" = the properties you have published. With no property at all, the tile shows "0 published".',
        'It needs the "View properties" right. Without rental management, this is the tile that is highlighted.'
      ]
    },
    keywords: ['properties', 'portfolio', 'assets', 'occupancy rate', 'published']
  },
  {
    id: 'communication.accueil.tableau-de-bord.contacts',
    kind: 'section',
    title: '"Contacts" tile',
    summary: 'The number of contacts of the agency, with the number of deals and leases tracked.',
    purpose: 'Click it to open the list of contacts.',
    howToRead: {
      notes: [
        'The number counts leads, clients and archived contacts.',
        'The text below ("tracked transactions") adds the CRM deals and the rental-management leases you are allowed to see. It only appears if the CRM is included in your pack.',
        'It needs the "View contacts" right.'
      ]
    },
    keywords: ['contacts', 'clients', 'leads', 'transactions']
  },
  {
    id: 'communication.accueil.tableau-de-bord.tickets',
    kind: 'section',
    title: '"Open tickets" tile',
    summary: 'The number of maintenance tickets being handled, with the declared payments to approve.',
    purpose: 'Click it to open the list of tickets.',
    howToRead: {
      notes: [
        'Counted are the tickets that are reported, assigned or in progress. Resolved or cancelled tickets are no longer counted.',
        'The text below gives the number of payment declarations made by tenants and waiting for your approval. If there are none, it shows "No urgent item pending": this text does not check urgent tickets, look at "To handle today".',
        'It needs the "Manage every ticket and contractor" right.'
      ]
    },
    keywords: ['tickets', 'maintenance', 'breakdowns', 'repairs', 'declarations']
  },
  {
    id: 'communication.accueil.tableau-de-bord.a-traiter',
    kind: 'section',
    title: '"To handle today" list',
    summary:
      'The list of what needs action: overdue instalments, declared payments to approve, urgent tickets and stock alerts. The most serious are at the top.',
    purpose:
      'Each line is clickable as a whole and opens the record concerned. The number in brackets is the number of lines shown.',
    howToRead: {
      statuses: [
        { value: 'danger', label: 'Urgent', description: 'Overdue instalment, or ticket with "Urgent" priority.' },
        {
          value: 'warning',
          label: 'Worth watching',
          description: 'Declared payment to approve, or ticket with "High" priority.'
        },
        { value: 'info', label: 'Information', description: 'Simple information, no urgency.' }
      ],
      notes: [
        'Overdue instalments: up to 4, the oldest first, with the lease, the property, the days late and the amount left to pay.',
        'Declared payments: up to 4 tenant declarations waiting, with the payment method and the amount. Rental management and the "View payments" right required.',
        'Tickets: up to 4 open tickets with "Urgent" or "High" priority. The "Manage every ticket and contractor" right is required.',
        'Stock alerts: up to 4, if your pack includes the worksites and you have the "Stock alerts" right and the right to see stock values.',
        'Lines are sorted by seriousness then by age, and limited to 8. The "See all" link opens the instalments.'
      ]
    },
    consequences: ['Clicking a line opens the screen concerned: nothing is changed until you act there.'],
    related: [{ label: 'The "Arrears" tile', helpId: 'communication.accueil.tableau-de-bord.impayes' }],
    keywords: ['to do', 'tasks', 'emergencies', 'reminders', 'alerts', 'work queue']
  },
  {
    id: 'communication.accueil.tableau-de-bord.tresorerie',
    kind: 'section',
    title: 'Cash flow over 12 months',
    summary: 'A curve comparing, month by month, what was collected and what was expected.',
    purpose:
      'It shows whether collections keep up with the rent due. Clicking the curve or "View payments" opens the payments.',
    howToRead: {
      notes: [
        '"Collected": the payments with "Successful" status, grouped by month of success.',
        '"Expected": the instalments excluding cancelled ones, grouped by due month (rent, services, other fees and penalties), paid or not.',
        'The legend gives the total over the 12 months (the current month and the 11 before); its links open the payments and the instalments.',
        '"Nothing to plot" is shown when both totals are 0. The card needs rental management and the "View payments" right; without "View instalments", "Expected" stays at 0.'
      ]
    },
    related: [{ label: 'The "Collected" tile', helpId: 'communication.accueil.tableau-de-bord.encaisse' }],
    keywords: ['cash flow', 'collections', 'curve', 'expected rent', '12 months']
  },
  {
    id: 'communication.accueil.tableau-de-bord.echeances',
    kind: 'section',
    title: 'Instalments by status',
    summary: 'Bars showing, for each status, the amount still to be collected on rent instalments.',
    purpose: 'They show where the money to recover is. The "Collect" link opens the instalments.',
    howToRead: {
      statuses: [
        { value: 'OVERDUE', label: 'Overdue', description: 'Instalments past their date and not settled.' },
        { value: 'PARTIAL', label: 'Partial', description: 'Instalments partly paid.' },
        { value: 'DUE', label: 'Not yet due', description: 'Upcoming instalments.' },
        {
          value: 'PAID',
          label: 'Paid',
          description: 'Settled instalments: their bar is empty, only their number counts.'
        }
      ],
      notes: [
        "A bar's length is the amount still to collect in FCFA; the tooltip gives the number of instalments, then the amount.",
        'Cancelled instalments are not counted. "Draft" or "Not yet due" instalments past their date are classed as "Overdue".',
        'Requires rental management.'
      ]
    },
    keywords: ['instalments', 'statuses', 'amount to collect', 'arrears']
  },
  {
    id: 'communication.accueil.tableau-de-bord.moyens-paiement',
    kind: 'section',
    title: 'Payment methods',
    summary: 'A pie chart splitting the rent collected over 12 months by payment method.',
    purpose: 'It shows how your tenants pay. The "View payments" link opens the payments.',
    howToRead: {
      notes: [
        'Counted are the payments with "Successful" status since the start of the 12-month period, by method: Cash, Bank transfer, Cheque, Mobile money, Direct debit, Bank card or Other.',
        'The total collected is written in the centre; the legend gives the amount of each method, from largest to smallest.',
        'Requires rental management and the "View payments" right.'
      ]
    },
    keywords: ['payment methods', 'mobile money', 'cash', 'transfer', 'breakdown']
  },
  {
    id: 'communication.accueil.tableau-de-bord.parc-statut',
    kind: 'section',
    title: 'Portfolio by status',
    summary: "A pie chart splitting the agency's properties by status.",
    purpose:
      'It gives the share of the portfolio that is occupied or sold. A slice or a legend line opens the list of properties with that status.',
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: 'Property record not yet finalised.' },
        { value: 'UNDER_REVIEW', label: 'Under review', description: 'Property being checked.' },
        { value: 'AVAILABLE', label: 'Available', description: 'Property free.' },
        { value: 'RESERVED', label: 'Reserved', description: 'Property reserved.' },
        { value: 'UNDER_OFFER', label: 'Under offer', description: 'An offer is under way on this property.' },
        { value: 'RENTED', label: 'Let', description: 'Property occupied by a tenant.' },
        { value: 'SOLD', label: 'Sold', description: 'Property sold.' },
        { value: 'ARCHIVED', label: 'Archived', description: 'Property removed from day-to-day management.' }
      ],
      notes: [
        'The subtitle gives the share of "Let" plus "Sold" in the portfolio. The number of properties is written in the centre.',
        'At most 5 statuses are shown; the rest are grouped under "Others" (no link). The "View properties" right is needed.'
      ]
    },
    keywords: ['portfolio', 'properties', 'statuses', 'occupancy', 'let', 'available']
  },
  {
    id: 'communication.accueil.tableau-de-bord.types-biens',
    kind: 'section',
    title: 'Property types',
    summary: 'Bars counting properties by type: flat, house, studio, office…',
    purpose: 'They show the make-up of your portfolio. A bar opens the list of properties of that type.',
    howToRead: {
      notes: [
        'The 6 most numerous types are shown; the others are grouped under "Others" (no link).',
        'A bar\'s length is the number of properties. The "View properties" right is needed.'
      ]
    },
    keywords: ['property types', 'flat', 'house', 'portfolio']
  },
  {
    id: 'communication.accueil.tableau-de-bord.entonnoir',
    kind: 'section',
    title: 'Sales funnel',
    summary: 'Bars counting deals by stage, from first contact to the won sale.',
    purpose: 'They show where your deals stall. The "View deals" link opens the list of deals.',
    howToRead: {
      statuses: [
        { value: 'NEW', label: 'New', description: 'First stage of the funnel.' },
        { value: 'QUALIFIED', label: 'Qualified', description: 'Qualified deal.' },
        { value: 'VISIT', label: 'Viewing', description: 'Viewing stage.' },
        { value: 'NEGOTIATION', label: 'Negotiation', description: 'Negotiation stage.' },
        { value: 'WON', label: 'Won', description: 'Deal won (green bar).' }
      ],
      notes: [
        '"Lost" deals are not in the funnel: their number is given in the subtitle.',
        "A bar's tooltip gives the number of deals and, if there is one, the sum of their expected value.",
        'Requires the CRM in your pack and the "View deals" right.'
      ]
    },
    keywords: ['funnel', 'deals', 'pipeline', 'sales', 'negotiation']
  },
  {
    id: 'communication.accueil.tableau-de-bord.repartition-contacts',
    kind: 'section',
    title: 'Contacts by status',
    summary: 'A pie chart splitting your contacts into leads, clients and archived.',
    purpose:
      'It appears as soon as the agency has at least one contact. The "View contacts" link opens the list of contacts.',
    howToRead: {
      statuses: [
        { value: 'LEAD', label: 'Lead', description: 'Contact who is not yet a client.' },
        { value: 'ACTIVE_CLIENT', label: 'Client', description: 'Contact converted into a client.' },
        { value: 'ARCHIVED', label: 'Archived', description: 'Contact set aside.' }
      ],
      notes: ['The total number of contacts is written in the centre. The "View contacts" right is needed.']
    },
    keywords: ['contacts', 'leads', 'clients', 'breakdown']
  },
  {
    id: 'communication.accueil.tableau-de-bord.tickets-priorite',
    kind: 'section',
    title: 'Open tickets by priority',
    summary: 'Bars counting the maintenance tickets in progress by priority.',
    purpose: 'They show what is pressing. The "View tickets" link opens the list of tickets.',
    howToRead: {
      statuses: [
        { value: 'URGENT', label: 'Urgent', description: 'Highest priority (red bar).' },
        { value: 'HIGH', label: 'High', description: 'Elevated priority.' },
        { value: 'MEDIUM', label: 'Medium', description: 'Normal priority.' },
        { value: 'LOW', label: 'Low', description: 'Lowest priority.' }
      ],
      notes: [
        'Only tickets that are reported, assigned or in progress are counted. "No open ticket." is shown if there are none.',
        'The "Manage every ticket and contractor" right is needed.'
      ]
    },
    keywords: ['tickets', 'maintenance', 'priority', 'urgent']
  },
  {
    id: 'communication.accueil.tableau-de-bord.appels-charges',
    kind: 'section',
    title: 'Charge calls',
    summary: 'Bars showing, by status, the amount of the charge calls of your co-ownerships.',
    purpose: 'They help you follow recovery. The "View co-ownerships" link opens the list of co-ownerships.',
    howToRead: {
      statuses: [
        { value: 'PENDING', label: 'Pending', description: 'Call issued, not yet paid and not yet past its date.' },
        { value: 'PARTIAL', label: 'Partial', description: 'Call partly paid, not yet past its date.' },
        { value: 'PAID', label: 'Paid', description: 'Call settled.' },
        { value: 'OVERDUE', label: 'Overdue', description: 'A "Pending" or "Partial" call whose due date has passed.' }
      ],
      notes: [
        "A bar's length is the amount in FCFA; the tooltip gives the number of calls, then the amount.",
        'The subtitle gives the recovery rate: paid calls plus payments already received on partial calls, as a share of the total called. With no rate, it gives the number of co-ownerships and lots.',
        'If co-owners have declared a mobile money payment, the number to check is written above the bars.',
        'The card needs co-ownership management in your pack, the right to view co-ownerships, and at least one co-ownership.'
      ]
    },
    keywords: ['charge calls', 'co-ownership', 'recovery', 'service charges']
  },
  {
    id: 'communication.accueil.tableau-de-bord.travaux',
    kind: 'section',
    title: 'Works programmes',
    summary: 'Bars showing, by status, the estimated cost of the works programmes.',
    purpose: 'They help you follow committed works. The "View works" link opens the programmes.',
    howToRead: {
      statuses: [
        { value: 'PLANNED', label: 'Scheduled', description: 'Programme planned, not yet started.' },
        { value: 'IN_PROGRESS', label: 'In progress', description: 'Works under way.' },
        { value: 'COMPLETED', label: 'Completed', description: 'Works finished.' },
        { value: 'CANCELLED', label: 'Cancelled', description: 'Programme abandoned.' }
      ],
      notes: [
        "A bar's length is the estimated cost in FCFA.",
        'The subtitle gives the sum of the "Scheduled" and "In progress" programmes: what remains committed.',
        'The card needs the Portfolio module in your pack, the "View properties" right and at least one programme.'
      ]
    },
    keywords: ['works', 'programmes', 'assets', 'cost', 'renovation']
  },
  {
    id: 'communication.accueil.tableau-de-bord.activite',
    kind: 'section',
    title: 'Recent activity',
    summary: "The log of the agency's last 8 events: properties added, contacts recorded, payments collected.",
    purpose: 'It lets you see at a glance what has happened. Each line leads to the record concerned.',
    howToRead: {
      notes: [
        'Events come from three sources: properties ("View properties" right), contacts ("View contacts" right) and successful payments (rental management and "View payments" right).',
        'The most recent are at the top. The time is written as a relative duration; hover over it to see the exact date.',
        'A payment shows its amount and the lease number.'
      ]
    },
    keywords: ['activity', 'log', 'history', 'news', 'latest events']
  }
];

export default entries;
