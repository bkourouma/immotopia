import type { HelpEntry } from '../../../types';

/** « actifs » zone of the « patrimoine » module (en). */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------- Net worth
  {
    id: 'patrimoine.valeur-nette',
    kind: 'page',
    title: 'Net worth',
    summary:
      'This screen shows what you own, what you owe and what is left. It adds up the value of your assets, subtracts your debts and displays the result.',
    purpose:
      'Net worth is a snapshot of your wealth today: total assets minus total debts. Each asset counts for its latest recorded value, converted into FCFA if needed. The screen also shows the breakdown by asset class, the trend over the last 12 months, your personal debts and the items that are not counted.',
    steps: [
      {
        title: 'Add an asset',
        detail: 'Click "Add an asset". Once created, the asset appears in the totals as soon as it has a value.'
      },
      {
        title: 'Read the three indicators',
        detail: '"Total assets", "Total debts" and "Net worth" (assets minus debts).'
      },
      {
        title: 'Check what is not counted',
        detail: 'If a yellow banner appears, open the assets listed and add the missing value or exchange rate.'
      },
      {
        title: 'Record your personal debts',
        detail: 'In the "Personal debts" card, click "Add a debt".'
      },
      {
        title: 'Export',
        detail: '"Export to PDF" or "Export to Excel" produces your statement of assets and liabilities.'
      }
    ],
    consequences: [
      'Nothing you read here can be edited directly: to change a total, change the value of an asset or a debt.',
      'A debt added here immediately reduces net worth if its status is "Active".'
    ],
    faq: [
      {
        q: 'Why can my net worth be negative?',
        a: 'Because total debts exceed total assets. The negative amount is displayed as is, in red.'
      },
      {
        q: 'Why is an asset missing from the total?',
        a: 'An asset with no value, an asset in a foreign currency without an exchange rate, a disposed asset or an archived asset is not counted. The first two cases are flagged by the yellow banner.'
      },
      {
        q: 'What does "as of" under the net worth mean?',
        a: 'The date of the calculation, which is today.'
      },
      {
        q: 'I cannot see this screen. Why?',
        a: 'Wealth management is a separate feature. It must be included in your subscription and your account must have the right "View personal patrimony".'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Viewing, calculating and exporting require "View personal patrimony". Adding an asset or a debt requires "Edit personal patrimony".'
    },
    related: [
      { label: 'My assets', helpId: 'patrimoine.actifs', to: '/tenant/:tenantId/patrimoine/actifs' },
      { label: 'Projections', helpId: 'patrimoine.projections', to: '/tenant/:tenantId/patrimoine/projections' },
      { label: 'Reliability of values', helpId: 'patrimoine.valeur-nette.fiabilite' }
    ],
    keywords: ['wealth', 'net worth', 'patrimoine', 'total', 'assets', 'debts', 'balance sheet', 'statement']
  },
  {
    id: 'patrimoine.valeur-nette.total-actifs',
    kind: 'section',
    title: 'Total assets',
    summary:
      'Sum of the current values of all your counted assets, in FCFA. Each asset counts for its latest value recorded to date.',
    howToRead: {
      notes: [
        'An asset in a foreign currency is converted into FCFA using the exchange rate entered on its sheet.',
        'Not counted: archived assets, disposed assets, assets with no value and assets in a foreign currency with no exchange rate.'
      ]
    },
    keywords: ['total assets', 'what I own', 'gross wealth']
  },
  {
    id: 'patrimoine.valeur-nette.total-dettes',
    kind: 'section',
    title: 'Total debts',
    summary:
      'Sum of the remaining principal of your debts whose status is "Active", whether linked to an asset or personal.',
    howToRead: {
      notes: [
        'Debts that are "Closed" or "In default" are not added.',
        'A debt linked to an asset that is not counted is still counted: the debt still exists.',
        'A debt in a foreign currency without an exchange rate is not counted; the yellow banner flags it.'
      ]
    },
    keywords: ['total debts', 'loans', 'borrowings', 'what I owe']
  },
  {
    id: 'patrimoine.valeur-nette.resultat',
    kind: 'section',
    title: 'Net worth (result)',
    summary:
      'It is total assets minus total debts. The result is never floored at zero: if it is negative, it is shown as negative.',
    howToRead: {
      notes: ['The "as of" mention gives the date of the calculation.']
    },
    keywords: ['net worth', 'result', 'assets minus debts']
  },
  {
    id: 'patrimoine.valeur-nette.fiabilite',
    kind: 'section',
    title: 'Reliability of values',
    summary:
      'Each recorded value has a reliability level: High, Medium or Low. The message "x % of the value relies on low-reliability values" tells you what share of total assets is concerned.',
    purpose:
      'A value entered by hand without a supporting document does not carry the same weight as an expert appraisal. This level helps you see where to improve your information.',
    howToRead: {
      statuses: [
        {
          value: 'HIGH',
          label: 'High',
          description: 'Value from an appraisal or an entered balance, and recent enough.'
        },
        {
          value: 'MEDIUM',
          label: 'Medium',
          description: 'Value computed from the asset characteristics, or entered by hand with a source indicated.'
        },
        {
          value: 'LOW',
          label: 'Low',
          description:
            'Value entered by hand without a source, very old, or tied to a fragile legal status. A value with no recorded level is read as "Low".'
        }
      ],
      notes: [
        'A value older than the period set for its class loses one level, and two levels if it is more than twice that period old.',
        'For a property, a fragile legal status (allocation letter, village or customary certificate) limits reliability to "Low". An unspecified status limits it to "Medium".',
        'Hover over a reliability level to read its reasons.'
      ]
    },
    steps: [
      {
        title: 'Improve a value',
        detail: 'Open the asset from the "View assets" link, then add a value with a source, or an appraisal.'
      }
    ],
    faq: [
      {
        q: 'Does low reliability distort my total?',
        a: 'No, the value is counted normally. Reliability only indicates how much confidence to place in it.'
      },
      {
        q: 'What does "Outdated value" mean?',
        a: 'The asset latest value is older than the period set for its class. Periods: accounts and mobile money, stock: 3 months; savings, receivables, agriculture: 6 months; vehicles, businesses, other: 12 months; real estate, movable valuables: 24 months.'
      }
    ],
    related: [{ label: 'Values of an asset', helpId: 'patrimoine.actif.valeurs' }],
    keywords: ['reliability', 'confidence', 'stale value', 'old value', 'appraisal', 'source']
  },
  {
    id: 'patrimoine.valeur-nette.exclusions',
    kind: 'section',
    title: 'Items not counted',
    summary:
      'This yellow banner appears when an asset or a debt is left out because information is missing. Click the name of an asset to complete it.',
    howToRead: {
      statuses: [
        {
          value: 'NO_VALUATION',
          label: 'No value',
          description: 'The asset has no recorded value: add one in the "Values" tab.'
        },
        {
          value: 'MISSING_EXCHANGE_RATE',
          label: 'Missing exchange rate',
          description:
            'The asset or debt is in a foreign currency with no exchange rate to FCFA: enter the rate on the asset sheet.'
        }
      ],
      notes: [
        'A disposed or archived asset is not flagged here: its exit is intentional.',
        'An excluded debt is shown with the mention "A loan is excluded from total debts".'
      ]
    },
    keywords: ['excluded', 'not counted', 'no value', 'exchange rate', 'anomaly']
  },
  {
    id: 'patrimoine.valeur-nette.exports',
    kind: 'section',
    title: 'Export the statement of assets',
    summary:
      'The "Export to PDF" and "Export to Excel" buttons download a document of your wealth position as of today.',
    purpose: 'Useful for a bank file, a notary or your own tracking. The file uses the same figures as the screen.',
    steps: [
      { title: 'Choose the format', detail: 'Click "Export to PDF" or "Export to Excel".' },
      { title: 'Wait', detail: 'The button shows a loading state, then the file downloads.' }
    ],
    consequences: [
      'The document contains net worth, the breakdown by class, the list of assets, the list of debts, the assets not counted and the history.',
      'Beyond 500 lines for assets or debts, the file says so.',
      'If the export fails, an "Export failed" message (or the server one) is shown. Nothing is modified.'
    ],
    faq: [
      {
        q: 'Are the export amounts in FCFA?',
        a: 'Totals are in FCFA. For each asset, the value in its original currency is also given.'
      }
    ],
    permissions: { note: 'Requires "View personal patrimony".' },
    keywords: ['export', 'pdf', 'excel', 'download', 'statement', 'bank']
  },
  {
    id: 'patrimoine.valeur-nette.repartition',
    kind: 'section',
    title: 'Breakdown by class',
    summary: 'A bar and a table show the weight of each asset class (real estate, savings, vehicles…) in your total.',
    purpose: 'It helps you see whether your wealth is concentrated in a single class.',
    howToRead: {
      notes: [
        'Each bar colour matches a class; hover over it to see its share.',
        'Only classes that contain counted assets appear, from largest to smallest.'
      ]
    },
    related: [{ label: 'Breakdown table', helpId: 'patrimoine.valeur-nette.repartition.tableau' }],
    keywords: ['breakdown', 'classes', 'bar', 'diversification']
  },
  {
    id: 'patrimoine.valeur-nette.repartition.tableau',
    kind: 'table',
    title: 'Breakdown by class table',
    summary:
      'One row per asset class that holds at least one counted asset, with the number of assets, the total value and the share of the total.',
    howToRead: {
      columns: [
        { key: 'assetClass', label: 'Class', description: 'The asset class, with its colour in the bar.' },
        { key: 'count', label: 'Assets', description: 'Number of counted assets in this class.' },
        {
          key: 'value',
          label: 'Value',
          description: 'Sum of the current values of the assets in the class, in FCFA.'
        },
        { key: 'share', label: 'Share', description: 'Value of the class divided by total assets.' }
      ]
    },
    related: [{ label: 'Breakdown by class', helpId: 'patrimoine.valeur-nette.repartition' }],
    keywords: ['class', 'share', 'value', 'breakdown']
  },
  {
    id: 'patrimoine.valeur-nette.evolution',
    kind: 'section',
    title: 'Net worth trend',
    summary: 'The curve shows, month by month over the last 12 months, net worth, total assets and total debts.',
    howToRead: {
      notes: [
        'Each point uses the latest known value of each asset at that date.',
        "The debts shown are today's debts, at every date: the past may therefore underestimate the debt of the time. A sentence under the curve reminds you of this.",
        'Hover over the curve to read exact amounts.'
      ]
    },
    faq: [
      {
        q: 'Why is the curve flat?',
        a: 'It only moves if you add dated values to the history of your assets.'
      }
    ],
    keywords: ['curve', 'history', 'chart', '12 months', 'trend']
  },
  {
    id: 'patrimoine.valeur-nette.dettes',
    kind: 'section',
    title: 'Debts',
    summary:
      'This card lists your debts. On the Net worth screen they are your personal debts; on an asset sheet they are the debts backed by that asset.',
    purpose:
      'A debt reduces your net worth as long as its status is "Active". Keeping this list up to date keeps net worth accurate.',
    steps: [
      {
        title: 'Add a debt',
        detail: 'Click "Add a debt", then fill in the lender, amounts, rate, monthly payment, dates and status.'
      },
      { title: 'Edit', detail: 'Click "Edit" on the row.' },
      {
        title: 'Delete',
        detail: 'Click "Delete" then confirm. The debt is erased.'
      },
      {
        title: 'Find a debt',
        detail: 'Use the search (lender, status) and the Status, Outstanding principal and End date filters.'
      }
    ],
    consequences: [
      'Adding, editing or deleting a debt updates net worth, projections and the export.',
      'Deletion is final. To keep a trace of a repaid loan, set its status to "Closed" instead.',
      'Debts of an archived asset can no longer be modified.'
    ],
    faq: [
      {
        q: 'Does a "Closed" debt count in the total?',
        a: 'No. Only "Active" debts are added to total debts.'
      },
      {
        q: 'Why is the remaining principal rejected?',
        a: 'It cannot exceed the amount borrowed, and the end date cannot be before the start date.'
      },
      {
        q: 'In which currency should I enter a personal debt?',
        a: 'A personal debt is expressed in FCFA. A debt linked to an asset is entered in FCFA or in the currency of the asset.'
      }
    ],
    permissions: {
      note: 'Viewing requires "View personal patrimony"; adding, editing and deleting require "Edit personal patrimony".'
    },
    related: [
      { label: 'Debts table', helpId: 'patrimoine.valeur-nette.dettes.tableau' },
      { label: 'Debt form', helpId: 'patrimoine.valeur-nette.dette-formulaire' }
    ],
    keywords: ['debt', 'loan', 'borrowing', 'credit', 'monthly payment', 'lender', 'bank']
  },
  {
    id: 'patrimoine.valeur-nette.dettes.tableau',
    kind: 'table',
    title: 'Debts table',
    summary:
      'Each row is a debt: lender, remaining principal, monthly payment, end date and status. The export button downloads the list.',
    howToRead: {
      columns: [
        { key: 'lender', label: 'Lender', description: 'The bank, institution or person who lent the money.' },
        {
          key: 'remainingCapital',
          label: 'Outstanding principal',
          description: 'What remains to be repaid of the principal. This amount is what counts in total debts.'
        },
        { key: 'monthlyPayment', label: 'Monthly payment', description: 'The amount paid each month.' },
        { key: 'endDate', label: 'End', description: 'Planned date of the last monthly payment.' },
        { key: 'status', label: 'Status', description: 'The state of the debt (see statuses).' },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Edit" opens the form; "Delete" erases the debt after confirmation.'
        }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'Ongoing debt: counted in total debts.' },
        { value: 'CLOSED', label: 'Closed', description: 'Debt paid off: not counted.' },
        { value: 'DEFAULTED', label: 'In default', description: 'Debt in default: not counted in total debts.' }
      ]
    },
    consequences: ['Changing a filter or a search does not modify any debt: it only changes the list displayed.'],
    related: [{ label: 'Debts', helpId: 'patrimoine.valeur-nette.dettes' }],
    keywords: ['debts', 'remaining principal', 'monthly payment', 'status', 'export']
  },
  {
    id: 'patrimoine.valeur-nette.dette-formulaire',
    kind: 'section',
    title: 'Add or edit a debt',
    summary:
      'This form records a loan: lender, amount borrowed, remaining principal, rate, monthly payment, currency, dates and status.',
    steps: [
      { title: 'Lender', detail: 'Required.' },
      {
        title: 'Amounts',
        detail:
          'Amount borrowed, remaining principal, interest rate in percent and monthly payment: all required. The remaining amount does not exceed the amount borrowed.'
      },
      { title: 'Currency', detail: 'FCFA (XOF), euro or dollar. Personal debts are entered in FCFA.' },
      {
        title: 'Dates',
        detail: 'Start date and end date, the end not being before the start.'
      },
      { title: 'Status', detail: '"Active" by default; choose "Closed" or "In default" if needed.' },
      { title: 'Save', detail: 'Click "Add" (or "Save" when editing).' }
    ],
    consequences: [
      'Net worth is recalculated as soon as you save.',
      'Projections use the rate, the monthly payment and the end date to reduce the debt year after year.'
    ],
    related: [{ label: 'Debts', helpId: 'patrimoine.valeur-nette.dettes' }],
    keywords: ['form', 'debt', 'loan', 'rate', 'monthly payment']
  },

  // ---------------------------------------------------------------- My assets
  {
    id: 'patrimoine.actifs',
    kind: 'page',
    title: 'My assets',
    summary:
      'This list gathers everything that makes up your wealth: real estate, businesses, stock, vehicles, accounts, savings, receivables, agriculture, movable valuables and others.',
    purpose:
      'An asset is something you own that has a value. Each asset has a class, a currency and a history of values. Open one to track its values, debts, holders and information.',
    steps: [
      {
        title: 'Add an asset',
        detail: 'Click "Add an asset", choose the class, give a name and, if possible, a first value.'
      },
      {
        title: 'Search and filter',
        detail:
          'Type a name, a linked property, a reference or a note. Filter by Class, Status, Current value or "Value to update".'
      },
      { title: 'Open an asset', detail: 'Click its name, or double-click the row.' },
      { title: 'Export', detail: 'The export button downloads all assets matching your filters.' }
    ],
    consequences: [
      'On creation, you land directly on the sheet of the new asset.',
      'An asset with no value is not counted in net worth until you add a value.',
      'A free space is limited in number of assets: beyond it, adding is refused and a link offers to move to the paid tier. What you entered is kept.',
      'An agency cannot have more than 500 non-archived assets: archive some to add more.'
    ],
    faq: [
      {
        q: 'Where did an archived asset go?',
        a: 'The list does not show archived assets, unless you choose the status "Archived" in the filters.'
      },
      {
        q: 'Why does a real-estate asset ask for an existing property?',
        a: 'A real-estate asset is attached to a property already created in the Properties module. No property is created here, and a property can only be attached to one asset.'
      },
      {
        q: 'What does "Value to update" mean?',
        a: 'The latest value of the asset is older than the period set for its class. It is time to enter a new one.'
      },
      {
        q: 'I cannot see the "Add an asset" button.',
        a: 'You need the right "Edit personal patrimony". Ask the person who manages your space.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Viewing requires "View personal patrimony"; adding an asset requires "Edit personal patrimony".'
    },
    related: [
      { label: 'Assets table', helpId: 'patrimoine.actifs.tableau' },
      { label: 'Asset form', helpId: 'patrimoine.actifs.formulaire' },
      { label: 'Net worth', helpId: 'patrimoine.valeur-nette', to: '/tenant/:tenantId/patrimoine/valeur-nette' }
    ],
    keywords: ['asset', 'assets', 'wealth', 'property', 'real estate', 'savings', 'vehicle', 'add an asset'],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'actifs-ajouter',
          title: 'Add an asset',
          description:
            'This button opens the creation form. There you choose the asset class, its name and, if possible, its first value.'
        },
        {
          target: 'actifs-tableau',
          title: 'The list of your assets',
          description:
            'Search, filter, then click a name to open the sheet. The badge next to the value shows its reliability.'
        }
      ]
    }
  },
  {
    id: 'patrimoine.actifs.tableau',
    kind: 'table',
    title: 'Assets table',
    summary:
      'Each row is an asset, with its class, status, current value and reliability, the date of that value and the debt linked to it.',
    howToRead: {
      columns: [
        { key: 'name', label: 'Name', description: 'The name of the asset; click it to open its sheet.' },
        { key: 'assetClass', label: 'Class', description: 'The asset class (Real estate, Savings and investments…).' },
        { key: 'status', label: 'Status', description: 'The state of the asset (see statuses).' },
        {
          key: 'currentValue',
          label: 'Current value',
          description:
            'The latest recorded value, with its reliability level. "Outdated value" flags a value too old for the class; "No value" flags an asset never valued.'
        },
        { key: 'valuatedAt', label: 'Valuation date', description: 'The date of that latest value.' },
        {
          key: 'outstandingDebtXof',
          label: 'Outstanding debt',
          description: 'The remaining principal of the debts linked to the asset, in FCFA. A dash (—) means no debt.'
        }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'Asset held and counted in net worth (if it has a value).' },
        {
          value: 'DISPOSED',
          label: 'Disposed of',
          description: 'Asset sold or transferred: it leaves net worth on its disposal date.'
        },
        {
          value: 'ARCHIVED',
          label: 'Archived',
          description: 'Asset put away: no longer counted and can no longer be modified.'
        }
      ],
      notes: [
        'The filters are: Class, Status, Current value (in FCFA) and "Value to update". The search covers the name, the linked property, the reference and the notes.',
        'Archived assets only appear if you filter on the status "Archived".',
        'The export contains all assets matching your filters, not just the displayed page.'
      ]
    },
    faq: [
      {
        q: 'Why is a value marked "Outdated value"?',
        a: 'Its date exceeds the period set for the class (3 months for an account, 24 months for a property, for example). Add a recent value.'
      }
    ],
    related: [
      { label: 'My assets', helpId: 'patrimoine.actifs' },
      { label: 'Reliability of values', helpId: 'patrimoine.valeur-nette.fiabilite' }
    ],
    keywords: ['columns', 'status', 'current value', 'stale', 'remaining debt', 'export', 'filter']
  },
  {
    id: 'patrimoine.actifs.formulaire',
    kind: 'section',
    title: 'Add or edit an asset',
    summary:
      'This drawer records an asset of any class. The fields specific to the chosen class appear under the name.',
    steps: [
      { title: 'Class', detail: 'Choose the class. It can no longer be changed after creation.' },
      {
        title: 'Property',
        detail:
          'For a real-estate asset, choose an existing property (a property already attached to an asset is not offered).'
      },
      { title: 'Name', detail: 'Required.' },
      { title: 'Class fields', detail: 'Fill in those that concern your asset; marked fields are required.' },
      {
        title: 'Currency',
        detail: 'FCFA (XOF), euro or dollar. Outside FCFA, the exchange rate to FCFA is required.'
      },
      { title: 'Acquisition and notes', detail: 'Acquisition cost and date, and free notes, are optional.' },
      {
        title: 'First valuation',
        detail: 'Estimated value, date, method and source. Optional: without an amount, no value is created.'
      },
      { title: 'Save', detail: '"Create asset", or "Save" when editing.' }
    ],
    consequences: [
      'On creation, you are taken to the asset sheet.',
      'When editing, the class and the linked property do not change, and the first valuation is not offered (use the "Values" tab).',
      'The currency can no longer change once values or debts have been entered in another currency.',
      'An archived asset can no longer be modified.'
    ],
    faq: [
      {
        q: 'Why ask only for the last 4 digits of an account?',
        a: 'For your security: enter exactly 4 digits, never the full number.'
      },
      {
        q: 'Why is an appraisal without a source rejected?',
        a: 'An appraisal must name the expert or the document. Without this source, the value is not saved.'
      }
    ],
    related: [
      { label: 'Asset classes and specific fields', helpId: 'patrimoine.actifs.classes' },
      { label: 'First valuation', helpId: 'patrimoine.actifs.valorisation-initiale' }
    ],
    keywords: ['form', 'create an asset', 'edit an asset', 'currency', 'exchange rate'],
    tour: {
      steps: [
        {
          target: 'actifs-form-classe',
          title: 'Choose the class',
          description:
            'The class (real estate, vehicle, savings…) determines the fields that follow. It can no longer change after creation.'
        },
        {
          target: 'actifs-form-nom',
          title: 'Give a name',
          description: 'A name you will recognise in lists, for example "Bingerville plot".'
        },
        {
          target: 'actifs-form-valorisation',
          title: 'Enter a first value',
          description:
            'Optional, but without a value the asset is not counted in your net worth. An appraisal requires a source.'
        },
        {
          target: 'actifs-form-creer',
          title: 'Create the asset',
          description: 'You then land on the asset sheet, where you can complete its values.'
        }
      ]
    }
  },
  {
    id: 'patrimoine.actifs.classes',
    kind: 'section',
    title: 'Asset classes',
    summary:
      'The class files the asset and decides which fields to fill in and how its value can be calculated. There are ten.',
    howToRead: {
      notes: [
        'Real estate: an existing property, and a legal status (land title, final concession order, ownership certificate, allocation letter, village or customary certificate…).',
        'Businesses and company shares: company name, legal form, country, percentage held, and optionally company value or net income and multiple.',
        'Inventory and goods: designation, quantity, unit, unit cost, write-down.',
        'Vehicles and equipment: type, brand, year, useful life, residual value and depreciation method (straight-line or declining).',
        'Accounts and mobile money: institution, account type (bank, mobile money, cash) and last 4 digits.',
        'Savings and investments: type (investment, tontine, life insurance…), organisation, expected rate, principal.',
        'Receivables: debtor, principal, collectibility, due date, rate.',
        'Agriculture and livestock: plantation, livestock or harvest, crop, area, headcount, unit value.',
        'Valuable movable property: designation and category. Other: a label.'
      ]
    },
    faq: [
      {
        q: 'Which class should I choose if nothing fits?',
        a: 'Choose "Other" and give a label. You will enter values by hand.'
      },
      {
        q: 'Can the class be changed later?',
        a: 'No, it is fixed after creation. Create a new asset in the right class if needed.'
      }
    ],
    related: [{ label: 'Value calculation by class', helpId: 'patrimoine.actif.calcul' }],
    keywords: [
      'class',
      'asset types',
      'real estate',
      'business',
      'stock',
      'vehicle',
      'savings',
      'receivable',
      'agriculture',
      'movable'
    ]
  },
  {
    id: 'patrimoine.actifs.valorisation-initiale',
    kind: 'section',
    title: 'First valuation',
    summary: 'When creating an asset, you can enter its first value at the same time: amount, date, method and source.',
    howToRead: {
      notes: [
        'Methods offered: Manual entry, Market estimate, Expert appraisal.',
        'The value date is today by default.',
        'The source (expert, document, website…) is required for an appraisal.'
      ]
    },
    consequences: [
      'Without an amount, no value is recorded: the asset is created "No value" and is not counted in net worth.',
      'The reliability level of the value depends on the method, the source and its age.'
    ],
    related: [{ label: 'Reliability of values', helpId: 'patrimoine.valeur-nette.fiabilite' }],
    keywords: ['initial value', 'first value', 'estimate', 'appraisal', 'source']
  },

  // ---------------------------------------------------------------- Asset sheet
  {
    id: 'patrimoine.actif',
    kind: 'page',
    title: 'Asset sheet',
    summary:
      'The asset sheet gathers its current value, the history of its values, its debts, its holders and its information.',
    purpose:
      'This is where you keep an asset up to date: add a new value, declare a loan, indicate who holds it, edit it, dispose of it or archive it.',
    steps: [
      {
        title: 'Read the current value',
        detail:
          'It appears at the top, with its date, its reliability level and the "Outdated value" mention if it is old.'
      },
      {
        title: 'Switch tabs',
        detail: '"Values", "Debts", "Holders" (except for a property) and "Information".'
      },
      {
        title: 'Add a value',
        detail: '"Values" tab, "Add a value" button, or "Calculate a value" to get a proposal.'
      },
      {
        title: 'Edit or close',
        detail: '"Information" tab: "Edit", "Mark as disposed of" or "Archive".'
      }
    ],
    consequences: [
      'Each new value or debt updates net worth, the history and projections.',
      'An archived asset is frozen: no more values, debts or changes are possible.'
    ],
    faq: [
      {
        q: 'Where are the expenses and documents of a property?',
        a: 'On the property sheet, via the "Open the property page" link. The asset sheet only manages its value, debts and information.'
      },
      {
        q: 'What does the message about legal status say?',
        a: 'For a property, a missing or fragile legal status limits the reliability of the value. The "Edit asset" button lets you fill it in.'
      },
      {
        q: 'Why is the "Holders" tab missing?',
        a: 'For a property, shares are managed from the holding entities, not from the asset sheet.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Viewing requires "View personal patrimony"; adding or editing a value, a debt, a holder or the asset requires "Edit personal patrimony".'
    },
    related: [
      { label: 'My assets', helpId: 'patrimoine.actifs', to: '/tenant/:tenantId/patrimoine/actifs' },
      { label: 'Reliability of values', helpId: 'patrimoine.valeur-nette.fiabilite' }
    ],
    keywords: ['sheet', 'asset', 'current value', 'valuation', 'holder', 'dispose', 'archive']
  },
  {
    id: 'patrimoine.actif.valeur-courante',
    kind: 'section',
    title: 'Current value',
    summary:
      'The current value is the latest recorded value of the asset, with its date. It is the one that goes into net worth.',
    howToRead: {
      notes: [
        'The "High", "Medium" or "Low" badge gives reliability; hover over it to read its reasons.',
        '"Outdated value" appears when the latest value is older than the class period, for an asset with the status "Active".',
        '"No value" means no value is recorded: the asset is not counted.'
      ]
    },
    related: [{ label: 'Reliability of values', helpId: 'patrimoine.valeur-nette.fiabilite' }],
    keywords: ['current value', 'latest value', 'stale', 'reliability']
  },
  {
    id: 'patrimoine.actif.valeurs',
    kind: 'section',
    title: 'Value history',
    summary:
      'The "Values" tab keeps every dated value of the asset. The most recent one (as of today) becomes the current value.',
    purpose: 'Add a value each time you revalue the asset. The history feeds the net worth curve and reliability.',
    steps: [
      { title: 'Add a value', detail: '"Add a value" opens the form.' },
      {
        title: 'Calculate',
        detail: '"Calculate a value" proposes an amount for some classes; nothing is saved without your agreement.'
      },
      { title: 'Edit or delete', detail: '"Edit" and "Delete" links (with confirmation) on the row.' },
      {
        title: 'Search',
        detail: 'Search in notes, source or method; filter by method, date or reliability.'
      }
    ],
    consequences: [
      'Adding, editing or deleting a value updates net worth and the lists.',
      'Deleting a value is final.',
      'An archived asset no longer accepts changes. An asset cannot have more than 1,000 values.'
    ],
    faq: [
      {
        q: 'Does a more recent value overwrite the old ones?',
        a: 'No, the old ones stay in the history. Only the most recent one is used as the current value.'
      },
      {
        q: 'Why does my value show "Manual entry" although I calculated it?',
        a: 'If the saved amount does not match the calculation, the value is saved as a manual entry.'
      }
    ],
    related: [
      { label: 'Values table', helpId: 'patrimoine.actif.valeurs.tableau' },
      { label: 'Calculate a value', helpId: 'patrimoine.actif.calcul' }
    ],
    keywords: ['values', 'history', 'valuation', 'revalue', 'curve']
  },
  {
    id: 'patrimoine.actif.valeurs.tableau',
    kind: 'table',
    title: 'Values table',
    summary:
      'Each row is a dated value: date, amount, method, reliability and source. A curve appears above as soon as there are at least two values.',
    howToRead: {
      columns: [
        { key: 'valuatedAt', label: 'Date', description: 'The date at which the value is established.' },
        { key: 'estimatedValue', label: 'Value', description: 'The amount, in its currency.' },
        {
          key: 'method',
          label: 'Method',
          description: 'How the value was obtained: entry, market estimate, appraisal or a class calculation.'
        },
        {
          key: 'reliability',
          label: 'Reliability',
          description: 'High, Medium or Low; hover to read the reasons.'
        },
        {
          key: 'source',
          label: 'Source',
          description: 'The expert, document or reference. A dash (—) means no source.'
        },
        { key: 'actions', label: 'Actions', description: '"Edit" or "Delete" a value.' }
      ],
      notes: [
        'Possible methods: Manual entry, Market estimate, Expert appraisal, Straight-line depreciation or declining-balance depreciation, Share of the company, Quantity × unit cost, Balance, Accrued savings, Discounted receivable, Quantity × unit value.',
        'Rows are sorted from most recent to oldest.'
      ]
    },
    related: [{ label: 'Value history', helpId: 'patrimoine.actif.valeurs' }],
    keywords: ['columns', 'method', 'source', 'reliability', 'export']
  },
  {
    id: 'patrimoine.actif.calcul',
    kind: 'section',
    title: 'Calculate a value',
    summary:
      'The "Calculate a value" button proposes an amount from the asset information. It never saves it on its own.',
    howToRead: {
      notes: [
        'Vehicles and equipment: acquisition cost reduced each year (straight-line depreciation over the useful life, or declining), never going below the residual value.',
        'Businesses: percentage held × company value, or × net income × multiple.',
        'Inventory: quantity × unit cost, reduced by the write-down.',
        'Savings and investments: principal increased at the expected rate, year after year, from the latest value or the acquisition date.',
        'Receivables: principal × collectibility percentage.',
        'Agriculture: area × unit value for a plantation, headcount × unit value for livestock or a harvest.',
        'Accounts: the balance is entered directly. Real estate, movable property, other: manual entry or appraisal.'
      ]
    },
    steps: [
      { title: 'Calculate', detail: 'Click "Calculate a value".' },
      { title: 'Review', detail: 'The amount is shown with the method and assumptions used.' },
      {
        title: 'Decide',
        detail: '"Save this value" (with confirmation) or "Edit" to adjust the amount before saving.'
      }
    ],
    consequences: [
      'Nothing is written until you confirm.',
      'The saved value is dated the day of the calculation.',
      'If information is missing, the list of what is missing is shown, with a "Complete the asset\'s information" link.'
    ],
    faq: [
      {
        q: 'Why is the calculation refused?',
        a: 'Information is missing, the result is zero or out of range, or the acquisition date is in the future. The message states the cause.'
      }
    ],
    related: [{ label: 'Asset classes', helpId: 'patrimoine.actifs.classes' }],
    keywords: ['calculation', 'suggestion', 'depreciation', 'compounding', 'automatic estimate']
  },
  {
    id: 'patrimoine.actif.valeur-formulaire',
    kind: 'section',
    title: 'Add or edit a value',
    summary: 'This form records a dated value for the asset: date, amount, currency, method, source and notes.',
    steps: [
      { title: 'Date', detail: 'The date at which the value is established (today by default).' },
      { title: 'Estimated value', detail: 'An amount greater than 0.' },
      { title: 'Currency', detail: 'FCFA or the currency of the asset.' },
      { title: 'Method', detail: 'Choose how the value was obtained.' },
      { title: 'Source', detail: 'Required for an appraisal: indicate the expert or the document.' },
      { title: 'Save', detail: 'Click "Add" or "Save".' }
    ],
    consequences: [
      'If you choose a calculation method but the amount does not match, the value is saved as "Manual entry".',
      'Reliability is calculated on saving; you do not enter it.'
    ],
    related: [{ label: 'Value history', helpId: 'patrimoine.actif.valeurs' }],
    keywords: ['form', 'value', 'appraisal', 'source', 'method']
  },
  {
    id: 'patrimoine.actif.detenteurs',
    kind: 'section',
    title: 'Holders',
    summary:
      'The "Holders" tab indicates which entities own the asset and for what share. It only exists for non-real-estate assets.',
    purpose:
      'Useful when an asset belongs to a company, a family or several entities. Entities are created in the holding entities menu.',
    steps: [
      {
        title: 'Add a holder',
        detail:
          '"Add a holder": choose the entity, its share in percent and, if needed, the date since which it holds the asset.'
      },
      { title: 'Correct a share', detail: '"Edit" on the row (the entity does not change).' },
      { title: 'Remove', detail: '"Remove" then confirm.' }
    ],
    consequences: [
      'A share must be greater than 0 and at most 100 %. Saving is refused if the total of shares exceeds 100 %.',
      '"Remove" removes the entity share on this asset; the entity itself is not deleted.'
    ],
    faq: [
      {
        q: 'Must the total of shares be 100 %?',
        a: 'It cannot exceed 100 %. If it is lower, the rest is simply not allocated.'
      }
    ],
    related: [{ label: 'Holders table', helpId: 'patrimoine.actif.detenteurs.tableau' }],
    keywords: ['holder', 'owner', 'share', 'entity', 'co-ownership']
  },
  {
    id: 'patrimoine.actif.detenteurs.tableau',
    kind: 'table',
    title: 'Holders table',
    summary: 'Each row is an entity that holds a share of the asset.',
    howToRead: {
      columns: [
        { key: 'entityName', label: 'Entity', description: 'The name of the holding entity.' },
        { key: 'sharePercent', label: 'Share', description: 'Its share of the asset, in percent.' },
        {
          key: 'effectiveFrom',
          label: 'Since',
          description: 'The date since which it holds this share. A dash (—) means not specified.'
        },
        { key: 'actions', label: 'Actions', description: '"Edit" or "Remove" the share.' }
      ],
      notes: ['A warning banner appears if the declared shares exceed 100 %.']
    },
    related: [{ label: 'Holders', helpId: 'patrimoine.actif.detenteurs' }],
    keywords: ['entity', 'share', 'since']
  },
  {
    id: 'patrimoine.actif.informations',
    kind: 'section',
    title: 'Asset information',
    summary:
      'The "Information" tab summarises the asset: class, status, currency, acquisition, class-specific fields and notes. It also lets you edit it, dispose of it or archive it.',
    steps: [
      { title: 'Edit', detail: '"Edit" opens the form. The class and the linked property do not change.' },
      {
        title: 'Mark as disposed',
        detail: 'Enter the disposal date then "Confirm".'
      },
      { title: 'Archive', detail: '"Archive", then confirm.' }
    ],
    consequences: [
      '"Mark as disposed of": the asset leaves net worth on the disposal date, its history is kept. Only an "Active" asset can be disposed of.',
      '"Archive": the asset is no longer counted, no longer appears in the default list and can no longer be modified. No action on this screen can restore it.',
      'These buttons only appear for an asset with the status "Active".'
    ],
    faq: [
      {
        q: 'What is the difference between disposing and archiving?',
        a: 'Disposing indicates that you no longer own the asset (with a date). Archiving simply puts the asset away.'
      }
    ],
    permissions: { note: 'Requires "Edit personal patrimony".' },
    related: [{ label: 'Asset form', helpId: 'patrimoine.actifs.formulaire' }],
    keywords: ['information', 'dispose', 'sell', 'archive', 'edit an asset', 'disposal']
  }
];

export default entries;
