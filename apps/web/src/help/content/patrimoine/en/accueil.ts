import type { HelpEntry } from '../../../types';

/** « accueil » area of the « patrimoine » module (en): overview, performance, works, cash plan, personal space. */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.accueil',
    kind: 'page',
    title: 'Assets: consolidated view',
    summary:
      'This screen summarises the real estate your agency owns itself: number of properties, occupancy rate, value, loans, expenses and rent. Below, you follow upcoming works programmes.',
    purpose:
      'It covers properties the agency owns, not those it manages for owners. Use it to see the state of the portfolio at a glance, then open the other Portfolio menu screens for details.',
    steps: [
      {
        title: 'Read the six indicators',
        detail: 'Each card gives one portfolio figure. Click its « ? » to read how it is calculated.'
      },
      {
        title: 'Follow upcoming works',
        detail:
          'Under the indicators, the « Works programmes » section lists planned or ongoing programmes. Use the pagination at the bottom to see the next ones.'
      },
      {
        title: 'Export',
        detail: '« Export » button: « PDF summary » or « Excel workbook ». The file is downloaded to your device.'
      },
      {
        title: 'Go further',
        detail: 'The « View properties » button opens your agency property list.'
      }
    ],
    consequences: [
      'This screen is for consulting: opening or exporting it changes no data.',
      'Figures are recalculated each time you open it, from the recorded properties, valuations, loans, expenses and leases.'
    ],
    faq: [
      {
        q: 'Why is one of my properties not counted?',
        a: 'Only properties owned by the agency count. For the number of properties and the occupancy rate, draft, sold and archived properties are also left out.'
      },
      {
        q: 'Why does an occupied property lower the rate?',
        a: 'It does not: a property is « occupied » if it has at least one current lease. The rate drops when counted properties have no current lease.'
      },
      {
        q: 'Where do I see completed or cancelled works?',
        a: 'This section only shows planned or ongoing programmes. The « Works » screen in the Portfolio menu lists all programmes.'
      },
      {
        q: 'Why do I not have this screen?',
        a: 'It is part of the Patrimoine pack and requires the « View properties » permission. Ask your agency administrator.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Viewing requires the « View properties » permission.'
    },
    related: [
      { label: 'How to read the indicators', helpId: 'patrimoine.accueil.indicateurs' },
      { label: 'Upcoming works programmes', helpId: 'patrimoine.accueil.travaux' },
      { label: 'Property performance', helpId: 'patrimoine.performance' },
      { label: 'Cash plan', helpId: 'patrimoine.tresorerie' }
    ],
    keywords: [
      'assets',
      'portfolio',
      'consolidated view',
      'occupancy rate',
      'estimated value',
      'loans',
      'annual rent',
      'dashboard',
      'export'
    ],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'patrimoine-indicateurs',
          title: 'Asset indicators',
          description:
            'These six cards summarise the properties your agency owns. The « ? » on each card explains the calculation.'
        },
        {
          target: 'patrimoine-travaux',
          title: 'Upcoming works',
          description:
            'This section lists planned or ongoing works programmes, nearest first, with the property, planned date and estimated cost.'
        },
        {
          target: 'patrimoine-export',
          title: 'Export your assets',
          description: 'Download a PDF summary or an Excel workbook of the agency assets.'
        }
      ]
    }
  },
  {
    id: 'patrimoine.accueil.indicateurs',
    kind: 'section',
    title: 'Asset indicators',
    summary:
      'Six figures summarise the properties your agency owns: number of properties, occupancy rate, estimated value, outstanding loans, expenses for the year and annual rent.',
    howToRead: {
      notes: [
        'Properties in portfolio: number of agency properties excluding drafts, sold and archived ones. Under the figure, « of which X occupied » counts properties with at least one current lease.',
        'Occupancy rate: occupied properties divided by properties in the portfolio. It is highlighted from 90% and flagged as a warning below 80%.',
        'Total estimated value: sum of the latest recorded valuation of each property. A property without a valuation counts for nothing.',
        'Outstanding loan balance: remaining capital of current loans attached to a property (finished loans do not count).',
        "Charges for the year: property expenses paid during the current calendar year. Expenses added to a property's cost basis (« capitalised », for example a major renovation) are not included.",
        'Annual rent: rent from current leases brought to 12 months according to each lease billing frequency (a quarterly rent is multiplied by 4).'
      ]
    },
    faq: [
      {
        q: 'Are the amounts in FCFA?',
        a: 'They are shown in the currency recorded in the data.'
      },
      {
        q: 'Why does annual rent differ from what I collected?',
        a: 'It is the rent planned by current leases over 12 months, not payments received. Collections are tracked in rental management.'
      },
      {
        q: 'Why does a figure look too low?',
        a: 'Check that your properties are declared as owned by the agency, that they have a valuation and that their leases are current.'
      }
    ],
    related: [{ label: 'Consolidated view', helpId: 'patrimoine.accueil' }],
    keywords: ['indicators', 'occupancy rate', 'value', 'outstanding', 'loan', 'expenses', 'rent']
  },
  {
    id: 'patrimoine.accueil.travaux',
    kind: 'section',
    title: 'Upcoming works programmes',
    summary:
      'This timeline lists your agency planned or ongoing works programmes, sorted by planned date. Each programme shows its title, property, date, estimated cost and status.',
    howToRead: {
      statuses: [
        {
          value: 'PLANNED',
          label: 'Planned',
          description: 'The works are scheduled for the date shown but have not started yet.'
        },
        {
          value: 'IN_PROGRESS',
          label: 'In progress',
          description: 'The works have started.'
        }
      ],
      notes: [
        'Under the title, the « date - amount » line gives the planned date and the estimated cost of the programme.',
        'The list is split into pages: use the pagination under the timeline to see the next programmes.'
      ]
    },
    steps: [
      {
        title: 'See all programmes',
        detail: 'Open the « Works » screen in the Portfolio menu, with search, filters and export.'
      },
      {
        title: 'Create or edit a programme',
        detail: 'Open a property sheet, « Portfolio » tab, « Works » section, then « Add » or « Edit ».'
      }
    ],
    consequences: ['This section is read-only: no programme can be edited from this screen.'],
    faq: [
      {
        q: 'Why has a completed programme disappeared?',
        a: 'Only planned or ongoing programmes are shown here. Completed or cancelled ones are in the « Works » screen.'
      },
      {
        q: 'What does a programme do in the cash plan?',
        a: 'A planned or ongoing programme is counted as an outflow in the cash plan.'
      }
    ],
    related: [
      { label: 'All works programmes', helpId: 'patrimoine.travaux' },
      { label: 'Cash plan', helpId: 'patrimoine.tresorerie' }
    ],
    keywords: ['works', 'construction site', 'renovation', 'timeline', 'schedule']
  },
  {
    id: 'patrimoine.performance',
    kind: 'page',
    title: 'Asset performance',
    summary:
      'Choose a property to see its gross, net and net-net yield, its latent capital gain, its bank ratios and its projection over several years. The projection assumptions can be changed.',
    purpose:
      'This screen helps judge whether a property earns enough: compare its yield with its expenses and loans, and prepare a financing file with the bank ratios. The calculation is made property by property.',
    steps: [
      {
        title: 'Choose a property',
        detail: 'Use the « Select a property » field; until a property is chosen, nothing is shown.'
      },
      {
        title: 'Read the yield',
        detail:
          'The « Yield » and « Projected yield » cards give the current percentages and those at the end of the period.'
      },
      {
        title: 'Read the bank ratios',
        detail: 'The « Banking ratios » card gives debt coverage, leverage, cash-on-cash and IRR.'
      },
      {
        title: 'Adjust the assumptions',
        detail: 'In « Projection assumptions », change the values then click « Recalculate ».'
      },
      {
        title: 'Follow the curve',
        detail: 'The « Yield projection » chart shows value, rent, expenses and result year by year.'
      }
    ],
    consequences: [
      'When you click « Recalculate », the assumptions are saved for this property and shared with agency colleagues and your other devices.',
      'If the server cannot be reached, a message says the assumptions are only kept on your device until the connection is back.',
      'Nothing else changes: the property figures (value, rent, loans) stay the same.'
    ],
    faq: [
      {
        q: 'Why do net-net and latent capital gain show « — »?',
        a: 'The purchase price of the property is not known. Enter it in a valuation of the property (« Portfolio » tab of its sheet) to get these two figures.'
      },
      {
        q: 'How do I enter the rates in the assumptions?',
        a: 'In decimal form: 0.03 means 3%. The « Years » field goes from 1 to 30.'
      },
      {
        q: 'What does a ratio shown as « — » mean?',
        a: 'It cannot be calculated. The reason is written below, for example « No active loan on this property » or « No valuation entered ».'
      },
      {
        q: 'What is the difference between gross and net?',
        a: 'Gross yield only considers rent; net also deducts the expenses paid over the last 12 months.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Viewing requires the « View properties » permission.'
    },
    related: [
      { label: 'Yield', helpId: 'patrimoine.performance.rendement' },
      { label: 'Bank ratios', helpId: 'patrimoine.performance.ratios' },
      { label: 'Projection assumptions', helpId: 'patrimoine.performance.hypotheses' }
    ],
    keywords: [
      'yield',
      'profitability',
      'gross',
      'net',
      'capital gain',
      'dscr',
      'ltv',
      'irr',
      'projection',
      'assumptions'
    ]
  },
  {
    id: 'patrimoine.performance.rendement',
    kind: 'section',
    title: 'Property yield',
    summary:
      'Four figures measure what the property earns today: gross yield, net yield, net-net yield and latent capital gain.',
    howToRead: {
      notes: [
        'Brut: annual rent from current leases divided by the current estimated value of the property.',
        'Net: annual rent minus the expenses of the last 12 months, divided by the estimated value. Expenses added to the cost basis are not deducted.',
        'Net-net: annual rent minus expenses minus loan instalments of the next 12 months, divided by the cost basis of the property.',
        'Plus-value latente: estimated value minus cost basis. It is « latent » as long as the property is not sold.',
        'The cost basis is the acquisition cost plus expenses added to the property cost. If it is not known, net-net and capital gain show « — ».'
      ]
    },
    faq: [
      {
        q: 'Why is gross yield 0?',
        a: 'The property has no current lease or no valuation: the calculation cannot give a yield.'
      },
      {
        q: 'Are the percentages annual rates?',
        a: 'Yes: they compare one year of rent and expenses with the value or cost of the property.'
      }
    ],
    related: [{ label: 'Projected yield', helpId: 'patrimoine.performance.projete' }],
    keywords: ['gross', 'net', 'net-net', 'latent capital gain', 'cost basis', 'purchase price']
  },
  {
    id: 'patrimoine.performance.projete',
    kind: 'section',
    title: 'Projected yield',
    summary:
      'The same four figures, estimated for the last year of the projection. The title recalls the number of years chosen.',
    howToRead: {
      notes: [
        'Projected gross, Projected net, Projected net-net and Projected unrealised gain follow the same definitions as the current yield.',
        'The projection applies your assumptions: growth of value, rent and expenses, and the vacancy rate.',
        'Instalments of each loan stop being deducted after its last due date.'
      ]
    },
    faq: [
      {
        q: 'Are these figures guaranteed?',
        a: 'No: they are estimates that depend on your assumptions. Change them in the « Projection assumptions » card.'
      },
      {
        q: 'Why « — »?',
        a: 'Without a known purchase price, net-net and capital gain cannot be calculated.'
      }
    ],
    related: [{ label: 'Projection assumptions', helpId: 'patrimoine.performance.hypotheses' }],
    keywords: ['projection', 'horizon', 'projected yield', 'in 10 years']
  },
  {
    id: 'patrimoine.performance.ratios',
    kind: 'section',
    title: 'Bank ratios',
    summary:
      'Four ratios banks use to judge a financed property: debt coverage (DSCR), leverage (LTV), cash-on-cash and IRR. Hovering the « i » icon next to each name gives its definition.',
    howToRead: {
      notes: [
        'DSCR: (effective annual rent, vacancy deducted, minus operating expenses) divided by the loan instalments of the next 12 months. Above 1, rent covers the debt.',
        'LTV: remaining capital divided by the estimated value of the property.',
        'Cash-on-cash: annual net cash flow after instalments, divided by the equity invested (cost basis minus borrowed capital).',
        'IRR (internal rate of return): return of the property over the whole projected period, before financing, counting the projected value of the property as the resale price at the end.',
        'A ratio that cannot be calculated shows « — » with its reason: no upcoming instalment, no active loan, no valuation, purchase price to enter, property 100% financed, or calculation impossible with these assumptions.'
      ]
    },
    faq: [
      {
        q: 'Why is the DSCR « — »?',
        a: 'Without an active loan on the property, or without an instalment in the next 12 months, there is no debt to cover.'
      },
      {
        q: 'Do the assumptions change the ratios?',
        a: 'Yes, the vacancy rate and the projection are part of the calculation. Change them then click « Recalculate ».'
      }
    ],
    related: [{ label: 'Projection assumptions', helpId: 'patrimoine.performance.hypotheses' }],
    keywords: ['dscr', 'ltv', 'cash-on-cash', 'irr', 'bank', 'financing', 'leverage']
  },
  {
    id: 'patrimoine.performance.hypotheses',
    kind: 'section',
    title: 'Projection assumptions',
    summary:
      'These five settings drive the projection and the ratios: duration, growth of value, rent and expenses, and vacancy. Click « Recalculate » to apply them.',
    howToRead: {
      notes: [
        'Years: duration of the projection, from 1 to 30.',
        'Value growth, Rent growth, Charge growth: expected yearly change, in decimal (0.03 = 3%), from -0.5 to 1.',
        'Rental vacancy: share of the year when the property earns no rent, in decimal from 0 to 1 (0.05 = 5%).',
        'Starting values: 10 years, value +3%, rent +2%, expenses +2.5%, vacancy 5%, as long as nothing is saved for the property.'
      ]
    },
    steps: [
      { title: 'Change a value', detail: 'Type the new value in the field.' },
      {
        title: 'Apply',
        detail: 'Click « Recalculate »: the projected yield, the ratios and the curve are updated.'
      }
    ],
    consequences: [
      'Assumptions are saved per property, shared between your devices and with agency colleagues. A banner confirms it.',
      'An orange banner means the server could not be reached: the assumptions then stay on this device only.'
    ],
    faq: [
      {
        q: 'Do my assumptions apply to all properties?',
        a: 'No, they are saved property by property. Another property starts from its own assumptions, or from the starting values.'
      },
      {
        q: 'Are my values limited?',
        a: 'Yes: years from 1 to 30, growth from -0.5 to 1, vacancy from 0 to 1. A value outside the limits is refused.'
      }
    ],
    related: [{ label: 'Bank ratios', helpId: 'patrimoine.performance.ratios' }],
    keywords: ['assumptions', 'growth', 'vacancy', 'recalculate', 'years']
  },
  {
    id: 'patrimoine.performance.projection',
    kind: 'section',
    title: 'Projection curve',
    summary:
      'This chart shows four curves year after year: estimated value, cumulative rent, cumulative expenses and net result.',
    howToRead: {
      notes: [
        'Estimated value: value of the property, changing with the chosen growth.',
        'Cumulative rent: total rent received since the start of the projection, vacancy deducted.',
        'Cumulative charges: total expenses since the start.',
        'Net result: rent minus expenses minus loan instalments, cumulated.',
        'Hover over the curve to read the amounts for each year.'
      ]
    },
    faq: [
      {
        q: 'Why is the chart empty?',
        a: 'No property is chosen, or the calculation is in progress.'
      },
      {
        q: 'Can I change the duration?',
        a: 'Yes, with the « Years » field of the projection assumptions.'
      }
    ],
    related: [{ label: 'Projection assumptions', helpId: 'patrimoine.performance.hypotheses' }],
    keywords: ['chart', 'curve', 'projection']
  },
  {
    id: 'patrimoine.travaux',
    kind: 'page',
    title: 'Works programmes',
    summary:
      'Here you find all works programmes of your agency properties: property concerned, programme, planned date and status. The list can be filtered and exported.',
    purpose:
      'A works programme is a set of works planned on a property (renovation, compliance, major maintenance). This screen gives the overall view to plan and follow projects.',
    steps: [
      { title: 'Search', detail: 'Type a programme, a property or a reference in the search field.' },
      {
        title: 'Filter',
        detail: 'Use the Status and Property filters, or add Planned date and Estimated cost (in FCFA).'
      },
      {
        title: 'Export',
        detail: 'The export button downloads all programmes matching your criteria, not only the displayed page.'
      },
      {
        title: 'Create or edit a programme',
        detail: 'From the property sheet: « Portfolio » tab, « Works » section, then « Add » or « Edit ».'
      }
    ],
    consequences: [
      'This screen is read-only: programmes are not created or edited here.',
      'A planned or ongoing programme enters the cash plan as an outflow.'
    ],
    faq: [
      {
        q: 'Where do I add a new programme?',
        a: 'On the sheet of the property concerned, in the « Portfolio » tab, « Works » section.'
      },
      {
        q: 'Is the estimated cost in the table?',
        a: 'No, it is used as a filter (from/to, in FCFA). You see it in the « Works » section of the property sheet.'
      },
      {
        q: 'The list is empty although I have works.',
        a: 'A filter may be active: clear the criteria. Otherwise check that the programmes are recorded on your agency properties.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Viewing requires the « View properties » permission.'
    },
    related: [
      { label: 'How to read the programmes table', helpId: 'patrimoine.travaux.tableau' },
      { label: 'Cash plan', helpId: 'patrimoine.tresorerie' }
    ],
    keywords: ['works', 'construction site', 'renovation', 'works programme', 'maintenance', 'upkeep']
  },
  {
    id: 'patrimoine.travaux.tableau',
    kind: 'table',
    title: 'Works programmes table',
    summary: 'Each row is a works programme: the property concerned, the programme, the planned date and the status.',
    howToRead: {
      columns: [
        {
          key: 'bien',
          label: 'Property',
          description: 'The property title, with its internal reference below.'
        },
        {
          key: 'titre',
          label: 'Programme',
          description: 'The name of the works programme.'
        },
        {
          key: 'date',
          label: 'Planned for',
          description: 'The planned date of the works. A dash (—) means no readable date.'
        },
        {
          key: 'statut',
          label: 'Status',
          description: 'The progress of the programme (see below).'
        }
      ],
      statuses: [
        { value: 'PLANNED', label: 'Planned', description: 'The works are scheduled but have not started.' },
        { value: 'IN_PROGRESS', label: 'In progress', description: 'The works have started.' },
        { value: 'COMPLETED', label: 'Completed', description: 'The works are finished.' },
        { value: 'CANCELLED', label: 'Cancelled', description: 'The programme is abandoned.' }
      ],
      notes: [
        'On a phone or small screen, the table becomes a list of cards with the same information.',
        'The export contains all programmes matching your criteria, not only the displayed page.'
      ]
    },
    steps: [
      { title: 'See ongoing works', detail: 'Choose the Status filter then « In progress ».' },
      { title: 'See the works of a property', detail: 'Choose the Property filter.' }
    ],
    consequences: [
      'Changing a filter or the search modifies no programme: it only changes the displayed and exported list.'
    ],
    faq: [
      {
        q: 'Can I sort by date?',
        a: 'The table has no column sorting: use the filters, in particular « Planned date ».'
      },
      {
        q: 'Why « Unknown property » on a card?',
        a: 'The programme is not linked to a readable property title.'
      }
    ],
    related: [{ label: 'Works programmes overview', helpId: 'patrimoine.travaux' }],
    keywords: ['columns', 'statuses', 'table', 'export', 'planned', 'in progress', 'completed', 'cancelled']
  },
  {
    id: 'patrimoine.tresorerie',
    kind: 'page',
    title: 'Cash plan',
    summary:
      'This plan estimates, month by month, the money that must come in and go out for the properties your agency owns, over 12 or 24 months. It flags months when the cumulative balance may drop below zero.',
    purpose:
      'It relies on rent to collect, loan instalments, planned works, periodic expenses and estimated property tax. It is an indicative estimate, with no guarantee it will happen.',
    steps: [
      { title: 'Choose the horizon', detail: '« 12 months » or « 24 months ».' },
      {
        title: 'Enter the opening balance',
        detail:
          'Type your current cash in « Opening balance (XOF) » (in FCFA), then leave the field or press Enter. Without a balance, the cumulative starts at zero.'
      },
      { title: 'Limit to one property', detail: 'The « Property » filter is on « All properties » by default.' },
      {
        title: 'Read the top message',
        detail:
          'It says either « No cash shortfall expected », or the first month the cumulative drops below zero, the lowest point and the deficit.'
      },
      { title: 'Detail a month', detail: 'In the table, click the expand sign of a row to see its flows.' },
      {
        title: 'Complete the sources',
        detail: 'At the bottom, the « Plan sources » card says what is missing; you save the property tax date there.'
      }
    ],
    consequences: [
      'The plan is calculated on opening: viewing, changing the horizon or the property modifies no data.',
      'The opening balance is not saved: you need to enter it again after reloading the page.',
      'Only the property tax due date is saved, for the whole agency.',
      'Amounts in a foreign currency are left out of the plan (a warning says so): they are neither converted nor added.',
      'Draft, sold, archived or sale-only properties are excluded from the plan.'
    ],
    faq: [
      {
        q: 'What does « Calculated without an opening balance » mean?',
        a: 'You have not entered a balance: the cumulative starts at zero and only shows the change from today.'
      },
      {
        q: 'What is a cash shortfall?',
        a: 'A month when the cumulative becomes negative: outflows exceed what you have. The message gives the month, the lowest point and the deficit.'
      },
      {
        q: 'What are « Overdue rents »?',
        a: 'Rents whose period has already passed and which are not settled. They are counted in the first month of the plan.'
      },
      {
        q: 'Why is property tax missing?',
        a: 'The due date is not filled in, the amount cannot be estimated for some properties, or the next due date is outside the period: switch to 24 months.'
      },
      {
        q: 'Why is a property missing?',
        a: 'It is excluded from the plan (draft, sold, archived or sale only). The « Plan sources » card lists the excluded properties.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Viewing requires the « View properties » permission; saving the property tax date requires « Edit properties ».'
    },
    related: [
      { label: 'Monthly table', helpId: 'patrimoine.tresorerie.tableau' },
      { label: 'Plan sources', helpId: 'patrimoine.tresorerie.sources' },
      { label: 'Works programmes', helpId: 'patrimoine.travaux' }
    ],
    keywords: ['cash', 'cash plan', 'forecast', 'balance', 'inflows', 'outflows', 'shortfall', 'cumulative']
  },
  {
    id: 'patrimoine.tresorerie.graphique',
    kind: 'section',
    title: 'Inflows, outflows and cumulative chart',
    summary:
      'Bars show the inflows and outflows of each month; the curve shows the cumulative cash. The same values are in the monthly table.',
    howToRead: {
      notes: [
        'Green bars: inflows of the month (rent and overdue rent).',
        'Orange bars: outflows of the month (loans, works, recurring expenses, property tax).',
        'Blue curve: the cumulative, i.e. the opening balance plus the result of each month.',
        'A grey line marks zero: when the curve goes below it, it is a cash shortfall.',
        'Hover over a month to read the amounts.'
      ]
    },
    faq: [
      {
        q: 'Why does the curve start at zero?',
        a: 'Without an opening balance, the cumulative starts at zero. Enter your current balance at the top of the screen.'
      },
      {
        q: 'Where are the detailed amounts?',
        a: 'In the monthly table just below, where each row expands into its flows.'
      }
    ],
    related: [{ label: 'Monthly table', helpId: 'patrimoine.tresorerie.tableau' }],
    keywords: ['chart', 'bars', 'curve', 'cumulative', 'inflows', 'outflows']
  },
  {
    id: 'patrimoine.tresorerie.tableau',
    kind: 'table',
    title: 'Monthly cash table',
    summary:
      'One row per month: inflows and outflows by type, the net of the month and the cumulative. Each row expands to show the flows that make it up.',
    howToRead: {
      columns: [
        {
          key: 'month',
          label: 'Month',
          description: 'The plan month, from the current month to the end of the horizon.'
        },
        { key: 'RENT', label: 'Rents', description: 'Inflows: rent to collect planned for that month.' },
        {
          key: 'RENT_ARREARS',
          label: 'Overdue rents',
          description: 'Inflows: rent of past periods not settled, brought to the first month.'
        },
        { key: 'LOAN', label: 'Loans', description: 'Outflows: instalments of current loans.' },
        { key: 'WORKS', label: 'Works', description: 'Outflows: cost of planned or ongoing works programmes.' },
        {
          key: 'RECURRING_EXPENSE',
          label: 'Recurring expenses',
          description: 'Outflows: monthly, quarterly or yearly expenses recorded on properties.'
        },
        {
          key: 'PROPERTY_TAX',
          label: 'Property tax',
          description: 'Outflows: estimated property tax, on the due date you entered.'
        },
        { key: 'net', label: 'Net', description: 'Inflows minus outflows of the month.' },
        {
          key: 'cumulative',
          label: 'Cumulative',
          description: 'Opening balance plus the nets of the months elapsed in the plan.'
        }
      ],
      notes: [
        'In the outflow columns, amounts are written without a minus sign; the sign appears in « Net » and « Cumulative ».',
        'A dash (—) means no amount that month.',
        'In the detail of a month, the « Indicative estimate » tag flags an amount calculated with unvalidated tax parameters.',
        'A note may specify, for example, « Date already passed: moved to the first month of the plan » for a works programme whose date has passed.'
      ]
    },
    steps: [
      {
        title: 'See the detail',
        detail: 'Click the expand sign of a month: category, property, source and amount of each flow.'
      },
      { title: 'Export', detail: 'Use the table export to keep the plan amounts.' }
    ],
    consequences: ['The table is read-only: expanding and exporting modify no data.'],
    faq: [
      {
        q: 'Why is the cumulative negative in some months?',
        a: 'Outflows exceed inflows and the opening balance: it is a cash shortfall, flagged at the top of the screen.'
      },
      {
        q: 'What does « No cash flow expected this month » mean?',
        a: 'No known movement falls in that month.'
      }
    ],
    related: [{ label: 'Plan sources', helpId: 'patrimoine.tresorerie.sources' }],
    keywords: ['monthly', 'net', 'cumulative', 'rent', 'loans', 'works', 'property tax', 'expenses']
  },
  {
    id: 'patrimoine.tresorerie.sources',
    kind: 'section',
    title: 'Plan sources',
    summary:
      'This card says which data feed the plan, which are missing and why, and which properties are excluded. It also lets you save the property tax date.',
    howToRead: {
      statuses: [
        { value: 'INCLUDED', label: 'Included', description: 'The source feeds the plan.' },
        { value: 'NO_DATA', label: 'No data', description: 'Nothing is recorded for this source.' },
        {
          value: 'NOT_CONFIGURED',
          label: 'Not configured',
          description: 'A setting is missing, for example the property tax date.'
        },
        {
          value: 'PARTIAL',
          label: 'Partial',
          description: 'Only part of the properties or items is taken into account.'
        }
      ],
      notes: [
        'The sources are: Rents, Loans, Works, Recurring expenses and Property tax.',
        'Under each source that is not included, a sentence gives the reason.',
        '« Properties excluded from the plan » lists the properties left out with their reason: For sale, Sold, Archived or Draft.'
      ]
    },
    faq: [
      {
        q: 'What should I do when a source is « No data »?',
        a: 'Nothing, if that is normal (for example no loan). Otherwise record the missing data on the properties: leases, loans, works or expenses.'
      },
      {
        q: 'Does a one-off expense enter the plan?',
        a: 'No: only monthly, quarterly or yearly expenses count.'
      }
    ],
    related: [{ label: 'Property tax date', helpId: 'patrimoine.tresorerie.taxe-fonciere' }],
    keywords: ['sources', 'missing data', 'excluded properties', 'scope']
  },
  {
    id: 'patrimoine.tresorerie.taxe-fonciere',
    kind: 'section',
    title: 'Property tax due date',
    summary:
      'Enter the month and day on which property tax is due each year. The plan then adds it among the outflows, estimating it property by property.',
    steps: [
      { title: 'Choose the month', detail: 'In the « Month » list.' },
      { title: 'Enter the day', detail: 'In « Day », from 1 to 31 depending on the month.' },
      { title: 'Save', detail: 'Click « Save the due date ».' },
      { title: 'Clear the date', detail: 'Empty both fields then save.' }
    ],
    consequences: [
      'The date is saved for the whole agency, not for a single property, and is used in the next plan calculations.',
      'The tax amount comes from the tax estimate of the properties; it is flagged « Indicative estimate » if the tax parameters are not all validated.',
      'A property that already has a periodic property tax expense is not counted twice.'
    ],
    faq: [
      {
        q: 'Why does a message ask for the month and the day?',
        a: 'The two fields go together: fill both, or empty both to clear the date.'
      },
      {
        q: 'Is 30 February accepted?',
        a: 'No: the day must exist in the chosen month (up to 29 for February).'
      }
    ],
    permissions: { note: 'Saving this date requires the « Edit properties » permission.' },
    related: [{ label: 'Tax parameters', helpId: 'patrimoine.fiscalite' }],
    keywords: ['property tax', 'land tax', 'due date', 'date', 'deadline']
  },
  {
    id: 'patrimoine.espace-personnel.creation',
    kind: 'section',
    title: 'Create my space',
    summary:
      'This form creates your personal space to track your own assets. It appears when your account is not attached to any space.',
    purpose:
      'A personal space is a space of your own, separate from any agency, to track your assets, debts and net worth. It starts on the free tier.',
    steps: [
      {
        title: 'Check the displayed name',
        detail: 'It is pre-filled with your account name; 120 characters at most.'
      },
      {
        title: 'Choose the country',
        detail:
          "Côte d'Ivoire, Senegal, Burkina Faso, Mali, Niger, Togo, Benin or Guinea-Bissau. The phone dial code follows the country."
      },
      {
        title: 'Enter a phone number (optional)',
        detail: 'In international format, for example +2250712345678. It will be required to pay.'
      },
      { title: 'Submit', detail: 'Click « Create my space ».' }
    ],
    consequences: [
      'Your space is created and you become its administrator; you then land on the « Net worth » screen of that space.',
      'The space starts on the free tier, with a limit on tracked assets.',
      'If you already have a space, no second space is created: you are taken to yours.',
      'In case of a network cut, you can try again: your information is kept and the space is created only once.'
    ],
    faq: [
      {
        q: 'I am asked to verify my e-mail address.',
        a: 'Confirm it with the message sent to you, then come back to create your space.'
      },
      {
        q: 'Is the phone number required?',
        a: 'Not to create the space. It is required to move to the paid tier.'
      },
      {
        q: 'The service is unavailable.',
        a: 'A message says creation is temporarily impossible: try again in a few moments.'
      }
    ],
    related: [
      { label: 'Space tier', helpId: 'patrimoine.espace-personnel.palier' },
      { label: 'Asset counter', helpId: 'patrimoine.espace-personnel.compteur' }
    ],
    keywords: ['personal space', 'individual', 'create my space', 'sign up', 'free']
  },
  {
    id: 'patrimoine.espace-personnel.palier',
    kind: 'section',
    title: 'Your space tier',
    summary:
      'This card, on the subscription screen of your personal space, shows your tier (free or paid) and the number of tracked assets, and lets you move to the paid tier.',
    howToRead: {
      notes: [
        'Current tier: « Free tier » or « Paid tier ».',
        'Tracked assets: number used out of the tier limit; the progress bar turns red at 100%.',
        'An asset counts as long as it is not archived: properties and other assets, including sold or disposed ones. Archiving frees a place.',
        'The monthly price of the paid tier is marked « Provisional price ».'
      ]
    },
    steps: [
      {
        title: 'Click « Upgrade to the paid tier »',
        detail: 'The button is only active for the space administrator.'
      },
      {
        title: 'Enter a phone number if asked',
        detail: 'A number is needed before paying: type it then click « Save and pay ».'
      },
      { title: 'Pay online', detail: 'You are sent to the payment page.' },
      { title: 'Come back to the screen', detail: 'The card waits for payment confirmation, up to one minute.' }
    ],
    consequences: [
      'The tier only changes once the server has confirmed the payment: coming back from the payment page is not enough.',
      'If a payment is already in progress, a message offers « Resume the payment ».',
      'The phone number you enter is saved as the contact of your space.',
      'This card does not appear for an agency.'
    ],
    faq: [
      {
        q: 'I cannot click the button.',
        a: 'Moving to the paid tier is reserved for the space administrator.'
      },
      {
        q: 'Online payment is unavailable.',
        a: 'A message says so: try again later.'
      },
      {
        q: 'I paid but I am still on the free tier.',
        a: 'Wait: confirmation can take up to one minute. Then reload the screen.'
      }
    ],
    permissions: { note: 'Moving to the paid tier requires the right to edit the space settings (administrator).' },
    related: [{ label: 'Asset counter', helpId: 'patrimoine.espace-personnel.compteur' }],
    keywords: ['tier', 'subscription', 'free', 'paid', 'move to paid tier', 'payment']
  },
  {
    id: 'patrimoine.espace-personnel.compteur',
    kind: 'section',
    title: 'Asset counter',
    summary:
      'The « X assets out of Y » banner on the asset screens of a personal space shows how many assets you track against your tier limit.',
    howToRead: {
      notes: [
        'Free tier: blue banner, which turns orange when the limit is reached, with the « Upgrade to the paid tier » link and the monthly price (provisional rate).',
        'Paid tier: a simple grey line « X assets out of Y ».',
        'An agency does not see this banner.'
      ]
    },
    consequences: [
      'Limit reached: you can no longer add an asset without moving to the paid tier or archiving an existing asset.'
    ],
    faq: [
      {
        q: 'What counts as an asset?',
        a: 'Non-archived assets and properties; a property linked to an asset counts only once.'
      }
    ],
    related: [{ label: 'Space tier', helpId: 'patrimoine.espace-personnel.palier' }],
    keywords: ['assets', 'limit', 'quota', 'free tier']
  }
];

export default entries;
