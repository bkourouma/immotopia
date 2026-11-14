import type { HelpEntry } from '../../../types';

/** Zone « charges » du module « syndic » (en): budgets, charge calls, scheduling, monthly tracking, receipts. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Budgets
  {
    id: 'syndic.budgets.liste',
    kind: 'page',
    title: 'Budgets and call campaigns',
    summary:
      'This screen prepares the condominium\'s forecast budget, splits it between the units, then generates the matching charge calls. It has three tabs: "Budgets", "Unit apportionment" and "Charge call campaigns".',
    purpose:
      "The budget sets what the condominium plans to spend over a financial year, item by item. Once approved, it is the basis for each unit's charge calls.",
    steps: [
      { title: 'Create the budget', detail: 'Button "New budget": year, label, distribution key and items.' },
      {
        title: 'Approve',
        detail: 'In the budget row, "Approve". A budget must be approved before calls can be generated.'
      },
      { title: 'Split', detail: '"Apportion" calculates each unit\'s share, shown in the "Unit apportionment" tab.' },
      {
        title: 'Generate the calls',
        detail:
          '"Generate charge calls" issues one call per unit and creates a campaign in the "Charge call campaigns" tab.'
      },
      { title: 'Close', detail: 'At year end, "Closed" locks the budget for good.' }
    ],
    consequences: [
      'Generating the calls debits each unit\'s account and notifies the co-owners: see the sheet "Generate calls from a budget".',
      'Closing a budget is final.',
      'The "New campaign" button only creates an empty campaign record: it issues no charge call.'
    ],
    faq: [
      {
        q: 'Why is "Generate charge calls" refused?',
        a: 'The budget must have the status "Approved". A draft, revised or closed budget cannot generate calls.'
      },
      {
        q: 'Does approval go through the general assembly?',
        a: 'On this screen, the "Approve" button simply changes the status: it does not ask for an assembly resolution. Hold the vote at the assembly before approving.'
      },
      {
        q: 'How do I change an approved budget?',
        a: 'Click "Revise": it moves to the status "Revised", then you can approve it again.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Condominium manager', 'Accountant'],
      note: 'Viewing requires the condominium viewing right. Creating, approving, revising, closing, splitting and generating calls require the condominium editing right.'
    },
    related: [
      { label: 'Budgets', helpId: 'syndic.budgets.liste.tableau' },
      { label: 'Generate calls from a budget', helpId: 'syndic.budgets.liste.generation' },
      { label: 'Charge calls', helpId: 'syndic.charges.liste' },
      { label: 'Scheduling', helpId: 'syndic.programmation.liste' }
    ],
    keywords: ['budget', 'forecast budget', 'financial year', 'charges', 'campaign', 'distribution key', 'shares']
  },
  {
    id: 'syndic.budgets.liste.tableau',
    kind: 'table',
    title: 'Budgets',
    summary:
      "This table lists the condominium's budgets, one per year or version. Each row carries the actions to approve, split, generate calls from or close the budget.",
    howToRead: {
      columns: [
        { key: 'fiscalYear', label: 'Financial year', description: 'The budget year.' },
        { key: 'label', label: 'Label', description: 'The name given to the budget.' },
        { key: 'totalAmount', label: 'Amount', description: 'Total of the planned items, in FCFA.' },
        {
          key: 'allocations',
          label: 'Allocations',
          description: 'Number of units with a saved split. 0: not split yet.'
        },
        { key: 'status', label: 'Status', description: 'Progress of the budget (see below).' },
        {
          key: 'actions',
          label: 'Actions',
          description:
            'Possible actions depending on the status: "Approve", "Revise", "Closed", "Apportion", "Items and funds", "View allocations", "Generate charge calls".'
        }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: 'Budget being prepared, not yet approved.' },
        { value: 'APPROVED', label: 'Approved', description: 'Budget validated: it can generate charge calls.' },
        {
          value: 'REVISED',
          label: 'Revised',
          description: 'Budget put back under revision after approval. It can be approved again.'
        },
        { value: 'CLOSED', label: 'Closed', description: 'Year finished: nothing can be changed any more.' }
      ],
      notes: [
        'Possible moves: Draft to Approved; Approved to Revised or Closed; Revised to Approved or Closed.',
        '"View allocations" is greyed out until the budget has been split.'
      ]
    },
    steps: [
      { title: 'Approve', detail: '"Approve" is offered for draft or revised budgets.' },
      {
        title: 'Split',
        detail: '"Apportion" recalculates each unit\'s share from the items and their distribution key.'
      },
      {
        title: 'Review the items',
        detail: '"Items and funds" shows each item with its budgeted amount, actual amount and gap.'
      },
      {
        title: 'Generate the calls',
        detail: '"Generate charge calls" opens the generation window (approved budgets only).'
      },
      {
        title: 'Close',
        detail:
          '"Closed" (approved or revised budgets) shows the budgeted, actual and gap before asking for confirmation.'
      }
    ],
    consequences: [
      '"Closed" is final: the budget, its items and its split can no longer be changed.',
      'A budget cannot be closed while an active call schedule uses it: pause it or finish it first.',
      '"Apportion" replaces the split previously saved for this budget.'
    ],
    faq: [
      {
        q: 'What is "Apportion" for?',
        a: 'To calculate what each unit owes for the year, using each item\'s distribution key. The result appears in the "Unit apportionment" tab.'
      },
      {
        q: 'Why is "Apportion" greyed out?',
        a: 'The budget is closed: no further change is possible.'
      },
      {
        q: 'What does an incomplete actual amount mean?',
        a: 'Some invoices or allocations of the year are not linked to any budget item. A warning shows how many and the amount.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'The actions in this table require the condominium editing right.' },
    related: [
      { label: 'Create a budget', helpId: 'syndic.budgets.liste.nouveau' },
      { label: 'Items and funds', helpId: 'syndic.budgets.liste.postes' },
      { label: 'Generate calls from a budget', helpId: 'syndic.budgets.liste.generation' }
    ],
    keywords: ['approve a budget', 'closing', 'revision', 'financial year', 'split', 'budget status']
  },
  {
    id: 'syndic.budgets.liste.nouveau',
    kind: 'section',
    title: 'Create a budget',
    summary:
      'This window saves a forecast budget: a year, a distribution key and the list of items with their planned amount. The budget total is the sum of the items.',
    howToRead: {
      notes: [
        '"Apportionment key": "General shares", "Special shares", "Equal apportionment" or "Manual". It applies to all items of the budget.',
        '"Budget line items": for each item, a "Category", a "Description" and a "Planned amount" above 0.',
        '"Fund credited by this item (optional)" only appears if the condominium has at least one fund.'
      ]
    },
    steps: [
      { title: 'Choose the year and label', detail: 'The year is the budget year (the current year by default).' },
      { title: 'Choose the distribution key', detail: 'By default "General shares".' },
      {
        title: 'Add the items',
        detail: '"Add a line item" for each planned expense; "Remove line item" to remove one.'
      },
      { title: 'Check the total', detail: 'The "Budget total" is calculated by itself at the bottom of the window.' },
      { title: 'Create', detail: 'Click "Create budget": it starts with the status "Draft".' }
    ],
    consequences: [
      'The created budget has the status "Draft": no call is issued and nobody is notified.',
      'From this screen, you can no longer change the item amounts after creation; only each item\'s funded fund can be changed, through "Items and funds".'
    ],
    faq: [
      {
        q: 'Can an item feed a fund?',
        a: "Yes, if a fund exists: the fund receives that item's share of each charge payment recorded afterwards."
      },
      {
        q: 'Why is creation refused?',
        a: 'Each item needs a category, a description and a planned amount above 0, and the label is required.'
      },
      {
        q: 'Does the "Manual" key ask for an entry per unit?',
        a: 'No, not on this screen: the key is saved as is on the items. For the real split, check the result with "Apportion".'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Creating a budget requires the condominium editing right.' },
    related: [{ label: 'Budgets', helpId: 'syndic.budgets.liste.tableau' }],
    keywords: ['new budget', 'items', 'planned amount', 'distribution key', 'shares']
  },
  {
    id: 'syndic.budgets.liste.postes',
    kind: 'table',
    title: 'Items and funds',
    summary:
      "This table details a budget's items: what was planned, what is actual, the gap and the fund possibly fed. You can link an item to a fund as long as the budget is not closed.",
    howToRead: {
      columns: [
        { key: 'category', label: 'Category', description: 'The type of expense of the item.' },
        { key: 'description', label: 'Description', description: 'The detail of the item.' },
        { key: 'amountForecast', label: 'Budgeted', description: 'The planned amount.' },
        {
          key: 'amountActual',
          label: 'Actual',
          description: 'What was really spent: invoices and incidents linked to the item.'
        },
        {
          key: 'ecart',
          label: 'Variance',
          description: 'Budgeted minus actual. A negative gap (in red) shows an overrun.'
        },
        {
          key: 'fonds',
          label: 'Fund credited',
          description: "The fund that receives this item's share of each charge payment."
        }
      ],
      notes: [
        'The "Total" row adds up the items.',
        'A yellow warning shows invoices or allocations of the year not linked to an item: the actual amount is then incomplete.'
      ]
    },
    steps: [
      { title: 'Open', detail: 'In the budget row, click "Items and funds".' },
      {
        title: 'Choose a fund',
        detail: 'In the "Fund credited" column, select the item\'s fund; clear the choice to remove the link.'
      }
    ],
    consequences: [
      'The link is saved as soon as you choose the fund.',
      'An item linked to a fund pays it its share of each charge payment recorded afterwards, in proportion to the unit split. Payments already received are not taken back.',
      'Closed budget: read only.'
    ],
    faq: [
      {
        q: 'Why is the fund list empty?',
        a: "There is no fund yet. Create one first in the condominium's treasury."
      },
      {
        q: 'Do past payments feed the fund?',
        a: 'No. Only payments recorded after the link do.'
      },
      {
        q: 'What does a red variance mean?',
        a: 'The "Variance" column is "Budgeted" minus "Actual": a negative variance, shown in red, means the item has gone over its planned amount.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Choosing a fund requires the condominium editing right.' },
    related: [{ label: 'Budgets', helpId: 'syndic.budgets.liste.tableau' }],
    keywords: ['items', 'funds', 'budgeted', 'actual', 'gap', 'overrun']
  },
  {
    id: 'syndic.budgets.liste.generation',
    kind: 'section',
    title: 'Generate calls from a budget',
    summary:
      'This window issues the charge calls of an approved budget: one call per unit, grouped in a campaign. You choose the period, the due date and how the year is split.',
    howToRead: {
      notes: [
        '"Campaign label" and "Period": suggested automatically (for example "2026" or "2026-T1"); you can change them.',
        '"Campaign type": "Regular" (current charges) or "Exceptional".',
        '"Split over": "1 period (annual)", "2 periods (biannual)", "4 periods (quarterly)" or "12 periods (monthly)". Each unit\'s annual amount is divided into equal parts; the last period of the year absorbs the rounding.',
        '"Period no.": the part to issue now, from 1 to the chosen number of periods.'
      ]
    },
    steps: [
      { title: 'Open', detail: 'In the row of an approved budget, click "Generate charge calls".' },
      { title: 'Name the campaign', detail: 'Check the label and the period.' },
      {
        title: 'Set the due date',
        detail:
          'Choose the "Due date". A past date is accepted: the calls will be late straight away (a warning is shown).'
      },
      { title: 'Choose the split', detail: '"Split over" then "Period no." to issue the part you want.' },
      { title: 'Generate', detail: 'Click "Generate".' }
    ],
    consequences: [
      'It cannot be undone from this screen: the campaign and the calls are created, and nothing cancels or deletes them.',
      "Each unit gets a call for its share (budget split, or the period's part). A unit whose share is zero is not called.",
      "Each unit's account is debited with the called amount. If the unit has an advance, it is applied straight away; a call settled this way receives its receipt.",
      'Co-owners are notified by e-mail and WhatsApp, with no attachment, if their contact detail exists and the "Charge call issued" notification is on. The call is created even if sending fails.',
      'Only one "Regular" campaign is possible per condominium and period: a second one is refused.'
    ],
    faq: [
      {
        q: 'Can I generate the same budget several times?',
        a: 'Yes for different periods (for example quarter 1 then 2). A "Regular" campaign exists at most once per period.'
      },
      {
        q: 'Why the message "budget must be approved"?',
        a: 'Only a budget with the status "Approved" can generate calls. Approve it first.'
      },
      {
        q: 'A co-owner received nothing. Why?',
        a: 'Their unit may have no co-owner, e-mail or WhatsApp number, or the notification is off. The call exists anyway: download the notice from "Charge calls".'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Generating the calls requires the condominium editing right.' },
    related: [
      { label: 'Campaigns', helpId: 'syndic.budgets.liste.campagnes' },
      { label: 'Charge calls', helpId: 'syndic.charges.liste' },
      { label: 'Scheduling', helpId: 'syndic.programmation.liste' }
    ],
    keywords: ['generate calls', 'call for funds', 'campaign', 'quarterly', 'half-yearly', 'monthly', 'issuing']
  },
  {
    id: 'syndic.budgets.liste.repartition',
    kind: 'table',
    title: 'Unit split',
    summary:
      'This table shows, for a budget, what each unit owes for the year and the detail per item. It fills with "Apportion" or "View allocations".',
    howToRead: {
      columns: [
        { key: 'lot', label: 'Unit', description: 'The unit concerned.' },
        {
          key: 'totalAllocated',
          label: 'Total allocated',
          description: "The unit's annual share, all items together."
        },
        { key: 'breakdown', label: 'Line details', description: "The unit's share for each item category." }
      ],
      notes: [
        'The title above the table shows which budget is displayed.',
        'Empty table: click "Apportion" or "View allocations" in the "Budgets" tab.',
        'A unit with no shares is not part of the split by shares.'
      ]
    },
    consequences: [
      'This tab is for viewing: nothing is issued or sent.',
      'The amounts are the basis for the calls generated from the budget.'
    ],
    faq: [
      {
        q: 'Why is my table empty?',
        a: 'No budget has been displayed yet. Go back to the "Budgets" tab and click "Apportion" or "View allocations".'
      },
      {
        q: 'Why is a unit missing?',
        a: "A unit with no shares is not called in the split by shares. Check its shares in the unit's record."
      },
      {
        q: 'What do the "Total allocated" and "Line details" columns show?',
        a: '"Total allocated" is the unit\'s annual share across all budget items; "Line details" gives its share for each item category.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Viewing requires the condominium viewing right.' },
    related: [{ label: 'Budgets', helpId: 'syndic.budgets.liste.tableau' }],
    keywords: ['split', 'share', 'allocation', 'shares', 'lots']
  },
  {
    id: 'syndic.budgets.liste.campagnes',
    kind: 'table',
    title: 'Call campaigns',
    summary:
      "This table lists the condominium's call campaigns: each generation of calls from a budget creates a campaign that groups the units' calls.",
    howToRead: {
      columns: [
        { key: 'label', label: 'Label', description: 'The name of the campaign.' },
        { key: 'period', label: 'Period', description: 'The period covered.' },
        { key: 'batchType', label: 'Type', description: '"Regular" (current charges) or "Exceptional".' },
        { key: 'dueDate', label: 'Due date', description: "The payment deadline of the campaign's calls." },
        { key: 'totalAmount', label: 'Amount', description: 'The total called across all lots.' },
        { key: 'charges', label: 'Charges', description: 'Number of charge calls attached to the campaign.' },
        { key: 'status', label: 'Status', description: '"Draft", "Sent" or "Closed".' }
      ],
      notes: [
        'A campaign created by "Generate charge calls" is "Sent" and holds as many calls as units called.',
        '"New campaign" only creates a record (label, period, due date, total amount, type): the "Charges" counter stays at 0 and no call is issued.'
      ]
    },
    consequences: ['"New campaign" issues no call and notifies nobody: it is a simple record.'],
    faq: [
      {
        q: "Where do I see each unit's calls?",
        a: 'In the "Charge calls" screen: one row per unit and per period.'
      },
      {
        q: 'What is the difference between "Regular" and "Exceptional"?',
        a: '"Regular" is for current charges (only one per period); "Exceptional" is a one-off call, for example for works.'
      },
      {
        q: 'Why does a campaign show 0 under "Charges"?',
        a: 'It was created with "New campaign", which only records a campaign card and issues no calls. A campaign created by "Generate charge calls" holds as many calls as there are units called.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Creating a campaign requires the condominium editing right.' },
    related: [{ label: 'Generate calls from a budget', helpId: 'syndic.budgets.liste.generation' }],
    keywords: ['campaign', 'call batch', 'regular', 'exceptional', 'issuing']
  },

  // ------------------------------------------------------------------ Appels de charges
  {
    id: 'syndic.charges.liste',
    kind: 'page',
    title: 'Charge calls',
    summary:
      "This screen lists the condominium's charge calls, unit by unit, with what is paid and what is still due. You issue a new call and record payments here.",
    purpose:
      'A charge call is the amount asked from a co-owner for a period, with a due date. The cards at the top show the amount called, the pending files and the late ones.',
    steps: [
      {
        title: 'Issue a call',
        detail: 'Click "New charge call", choose the target, period, amount and due date, then "Create".'
      },
      { title: 'Follow up', detail: 'Find each call in the list; filter by status or unit with the search bar.' },
      { title: 'Download a notice', detail: 'On the row: "Call notice (PDF)" or "Call notice (Word)".' },
      {
        title: 'Collect',
        detail: '"Record a payment" (at the top or on the row) opens the entry of the unit\'s payment.'
      }
    ],
    consequences: [
      "Issuing a call debits the unit's account and notifies the co-owner. There is no deletion or cancellation from this screen.",
      'The details of the calculation are in the sheet "Create a charge call".'
    ],
    faq: [
      {
        q: 'How do I correct a call issued by mistake?',
        a: 'This screen cannot edit or delete it. So check the amount, target and due date before clicking "Create".'
      },
      {
        q: 'Why is "New charge call" greyed out?',
        a: 'The condominium has no unit yet: create the units first.'
      },
      {
        q: 'What does "Declared payment" mean?',
        a: 'A co-owner declared a mobile money payment that is waiting for your validation. A banner at the top of the list links to the payments to validate.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Condominium manager', 'Accountant'],
      note: 'Viewing requires the condominium viewing right. Creating a call requires the creation right; linking it to a fund, or entering a payment, requires the editing right.'
    },
    related: [
      { label: 'Create a charge call', helpId: 'syndic.charges.liste.creation' },
      { label: 'List of calls', helpId: 'syndic.charges.liste.tableau' },
      { label: 'Scheduling', helpId: 'syndic.programmation.liste' },
      { label: 'Receipts', helpId: 'syndic.quittances.liste' }
    ],
    keywords: ['call for funds', 'charge call', 'charges', 'unpaid', 'due date', 'issuing', 'call notice'],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'charges-nouvel-appel',
          title: 'Issue a call',
          description:
            "This button opens the form: target (one unit, several or all), period, amount, split, due date. On creation, each unit's account is debited and the co-owners are notified."
        },
        {
          target: 'charges-synthese',
          title: 'Key figures',
          description: 'Amount called, pending files and late files update after each issue or payment.'
        },
        {
          target: 'charges-tableau',
          title: 'One call per unit',
          description:
            'After issuing, each unit has its row with its due date, what is paid and what is still due. You download the call notice there.'
        },
        {
          target: 'charges-paiement',
          title: 'Collect',
          description:
            'When a co-owner pays, record the payment here: it settles the oldest calls first, and any excess becomes an advance.'
        }
      ]
    }
  },
  {
    id: 'syndic.charges.liste.synthese',
    kind: 'section',
    title: 'Charge call figures',
    summary:
      'These three cards summarise the calls matching the current search: the amount called, the pending files and the late ones.',
    howToRead: {
      notes: [
        '"Amount called": total amount of the calls shown by the search.',
        '"Pending cases": number of unsettled calls whose due date has not passed.',
        '"Overdue cases": number of unsettled calls whose due date has passed. The card turns red if there are any.',
        'The figures follow the list filters: with no filter, they cover the whole condominium.'
      ]
    },
    consequences: ['These cards are for viewing: nothing is sent.'],
    faq: [
      {
        q: 'Why do the figures change when I filter?',
        a: 'They are calculated on the calls matching your search, not on all calls.'
      },
      {
        q: 'What makes a file late?',
        a: 'A passed due date while something is still unpaid, even if a partial payment was made.'
      },
      {
        q: 'What does "Pending cases" count?',
        a: 'The number of unsettled calls whose due date has not passed. Once the due date has passed, the call moves to "Overdue cases".'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Viewing requires the condominium viewing right.' },
    related: [{ label: 'List of calls', helpId: 'syndic.charges.liste.tableau' }],
    keywords: ['amount called', 'pending', 'late', 'unpaid', 'summary']
  },
  {
    id: 'syndic.charges.liste.tableau',
    kind: 'table',
    title: 'List of charge calls',
    summary:
      'This table lists the charge calls, one per unit and period, with the paid amount, the amount still due and the status. The buttons on each row let you collect, download the notice or link the call to a fund.',
    howToRead: {
      columns: [
        { key: 'period', label: 'Period', description: 'The period called (for example "2026-T1").' },
        { key: 'lotNumber', label: 'Unit', description: 'The unit concerned.' },
        { key: 'amount', label: 'Amount', description: 'The amount called to this lot.' },
        {
          key: 'dueDate',
          label: 'Due date',
          description: 'The deadline. In red when it has passed and the call is not paid.'
        },
        {
          key: 'isRecurring',
          label: 'Recurring charge',
          description: '"No", or "Yes" with the frequency and number of occurrences.'
        },
        { key: 'paid', label: 'Paid', description: 'What has already been paid on this call.' },
        { key: 'outstanding', label: 'Outstanding', description: 'What is left to pay.' },
        {
          key: 'status',
          label: 'Status',
          description:
            'Progress of the call. The "Declared payment" label is added if a mobile money payment awaits validation.'
        },
        {
          key: 'fund',
          label: 'Fund',
          description: 'The fund that receives in full whatever is paid on this call, if any.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            '"Record a payment", "Call notice (PDF)", "Call notice (Word)", "Assign to a fund" and "Payment link".'
        }
      ],
      statuses: [
        { value: 'PENDING', label: 'Pending', description: 'Nothing is paid and the due date has not passed.' },
        { value: 'PARTIAL', label: 'Partial', description: 'Part is paid, a balance remains.' },
        { value: 'PAID', label: 'Paid', description: 'The call is fully settled.' },
        { value: 'OVERDUE', label: 'Overdue', description: 'The due date has passed and something is still unpaid.' }
      ],
      notes: [
        'A partial payment stays "Partial"; it becomes "Overdue" once the due date has passed.',
        'The "Fund" column only appears if the condominium has funds.',
        '"Payment link" only appears if online payment is usable and the call is in FCFA with an amount due.'
      ]
    },
    steps: [
      { title: 'Search', detail: 'The bar above the table filters by text, status or lot.' },
      { title: 'Download a notice', detail: '"Call notice (PDF)" or "Call notice (Word)" on the row.' },
      {
        title: 'Collect',
        detail: '"Record a payment" (greyed out if the call is already paid) opens the entry for this lot.'
      },
      {
        title: 'Link to a fund',
        detail: '"Assign to a fund" chooses the fund that will receive this call\'s payments.'
      },
      {
        title: 'Export',
        detail: 'The table export menu includes all calls matching the search, not only the displayed page.'
      }
    ],
    consequences: [
      'Linking a call to a fund only applies to payments recorded afterwards: payments already received are not taken back.',
      'Downloading a notice notifies nobody.'
    ],
    faq: [
      {
        q: "How do I see a single unit's calls?",
        a: 'Use the "Unit" criterion in the search bar.'
      },
      {
        q: 'Why is "Record a payment" greyed out on a row?',
        a: 'The call already has the status "Paid".'
      },
      {
        q: 'Where do I see the receipt of a settled call?',
        a: 'In the "Settlement receipts" screen.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Viewing requires the condominium viewing right. Linking to a fund and entering a payment require the editing right.'
    },
    related: [
      { label: 'Create a charge call', helpId: 'syndic.charges.liste.creation' },
      { label: 'Receipts', helpId: 'syndic.quittances.liste' }
    ],
    keywords: ['charge call', 'unpaid', 'amount due', 'call notice', 'fund', 'partial payment', 'status']
  },
  {
    id: 'syndic.charges.liste.creation',
    kind: 'section',
    title: 'Create a charge call',
    summary:
      'This form issues a charge call for one unit, several units or all lots. For several units, you give a total and choose how to split it.',
    howToRead: {
      notes: [
        '"Target": "One unit", "Several units" or "All units" (units with no shares are left out).',
        '"Period label": required, unless you fill in both the start and end dates, which then make up the label.',
        '"Amount": for a single unit, it is that unit\'s amount. For several units, "Total amount to allocate".',
        '"Due date": a past date is accepted; the call will be late straight away (a warning is shown).',
        '"Fund credited (optional)" appears if funds exist.',
        '"Recurring charge": "Yes" asks for a "Frequency" ("Monthly", "Quarterly", "Yearly") and "Occurrences" (1 to 24).'
      ]
    },
    steps: [
      { title: 'Choose the target', detail: 'One unit, several units or all lots.' },
      { title: 'Give the period', detail: 'A label (for example 2026-Q1) or both dates.' },
      { title: 'Enter the amount', detail: 'For several units, also choose the split and check the preview per lot.' },
      { title: 'Set the due date', detail: 'The payment deadline.' },
      { title: 'Options', detail: 'The fund fed and the recurring charge, if needed.' },
      { title: 'Create', detail: 'Click "Create": the window closes and the list updates.' }
    ],
    consequences: [
      'Irreversible from this screen: an issued call can be neither edited nor deleted. Read the preview before creating.',
      'Amount per unit: for one unit, the amount entered. For several units, the total is split by the chosen method; the sum of the shares always equals the total.',
      'Each unit\'s account is debited. The unit\'s advance, if any, is applied straight away: a fully covered call becomes "Paid", receives its receipt and is not notified as "to pay".',
      'For calls still due, the co-owner is notified by e-mail and WhatsApp, with no attachment, if their contact details exist and the "Charge call issued" notification is on. A unit with no co-owner is not notified. The call is created even if sending fails.',
      'Recurring charge: all occurrences are created at once, with their due dates shifted, and all notified straight away. For automatic issuing at each period, use "Schedule".'
    ],
    faq: [
      {
        q: 'Which split should I choose?',
        a: 'See the sheet "Allocation among units". "By shares" is the most common.'
      },
      {
        q: 'Does the co-owner get the notice as an attachment?',
        a: 'Not on a manual creation: the message is sent with no attachment. Download the notice from the row and pass it on if needed.'
      },
      {
        q: 'Can I enter an old arrears amount?',
        a: 'Yes: a past due date is allowed. The call starts "Overdue".'
      },
      {
        q: 'Why is the fund link refused?',
        a: 'Choosing a fund requires the condominium editing right, in addition to the creation right.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Creating a call requires the condominium creation right; choosing a fund also requires the editing right.'
    },
    related: [
      { label: 'Split between units', helpId: 'syndic.charges.liste.repartition' },
      { label: 'Scheduling', helpId: 'syndic.programmation.liste' },
      { label: 'Generate calls from a budget', helpId: 'syndic.budgets.liste.generation' }
    ],
    keywords: ['issue a call', 'call for funds', 'new call', 'arrears', 'recurring', 'notification']
  },
  {
    id: 'syndic.charges.liste.repartition',
    kind: 'section',
    title: 'Split between units',
    summary:
      "When the call targets several units or all units, this choice decides how the total is shared. The preview under the amount shows each unit's share before creating.",
    howToRead: {
      statuses: [
        {
          value: 'SHARES',
          label: 'By shares',
          description: "The total is split in proportion to each unit's general shares."
        },
        {
          value: 'BY_LOT_TYPE',
          label: 'By unit type',
          description:
            "Each unit pays the amount of the condominium's rate table for its type (apartment, parking…). Nothing to enter."
        },
        {
          value: 'EQUAL',
          label: 'Equally',
          description: 'The total is divided into equal parts between the units, whatever their shares.'
        }
      ],
      notes: [
        'The preview lists the unit, its type and its amount, then the total.',
        'With "By unit type", the rate table must be filled in: the link "Set up the co-ownership’s rate schedule" leads there.'
      ]
    },
    consequences: [
      'The preview is a simulation: nothing is issued until you click "Create".',
      'An amount that cannot be split (for example a missing rate for a unit type) blocks creation with a message.'
    ],
    faq: [
      {
        q: 'Why is there no choice for a single unit?',
        a: "For a single unit, the amount entered is the unit's amount: there is nothing to split."
      },
      {
        q: 'A unit is missing from the preview.',
        a: 'With "All units", units with no shares are not called.'
      },
      {
        q: 'Where do I set the rates by unit type?',
        a: 'In the condominium\'s record, through the link "Set up the co-ownership’s rate schedule".'
      }
    ],
    permissions: { feature: 'SYNDIC' },
    related: [{ label: 'Create a charge call', helpId: 'syndic.charges.liste.creation' }],
    keywords: ['split', 'shares', 'rate table', 'unit type', 'equal parts', 'distribution key']
  },

  // ------------------------------------------------------------------ Programmation
  {
    id: 'syndic.programmation.liste',
    kind: 'page',
    title: 'Charge call scheduling',
    summary:
      'This screen automates recurring charge calls: a schedule issues a call by itself at each period, applies advances and notifies the co-owners.',
    purpose:
      'Instead of creating a call by hand every quarter or month, you describe the frequency, issue day and amount once. The condominium then issues each period, with no omission.',
    steps: [
      {
        title: 'Create',
        detail: 'Button "New schedule": label, frequency, issue day, delay before due date, amount source, dates.'
      },
      {
        title: 'Check the preview',
        detail: 'Open the schedule then the "Preview" tab to see the coming periods and the amounts per lot.'
      },
      {
        title: 'Let it run',
        detail: 'Every day at 6 am, active schedules whose issue date has come issue their period.'
      },
      { title: 'Issue on demand', detail: '"Execute now" issues the due or current period straight away.' },
      { title: 'Follow up', detail: 'The "History" tab lists the runs, their notices and their errors.' }
    ],
    consequences: [
      'A period is never issued twice: a second run is "Skipped (already processed)".',
      'A run creates one call per unit, debits the accounts, applies advances, and sends the PDF call notice as an attachment to the co-owners who still have something to pay.',
      'Two active schedules of the same condominium cannot cover the same period.'
    ],
    faq: [
      {
        q: 'What happens if the server was stopped?',
        a: 'Missed periods are caught up in order, up to 12 per schedule and per pass.'
      },
      {
        q: 'Does resuming a paused schedule catch up the past periods?',
        a: 'No: periods that fell during the pause are not caught up.'
      },
      {
        q: 'A due date already passed at issue time?',
        a: 'It is shifted: actual issue date plus the delay before due date. The shifted date is shown in the result.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Condominium manager', 'Accountant'],
      note: 'Viewing requires the condominium viewing right. Creating, editing, pausing, running, resending notices or deleting require the editing right.'
    },
    related: [
      { label: 'Schedules', helpId: 'syndic.programmation.liste.tableau' },
      { label: 'Schedule settings', helpId: 'syndic.programmation.liste.formulaire' },
      { label: 'Charge calls', helpId: 'syndic.charges.liste' }
    ],
    keywords: ['recurring calls', 'automatic', 'scheduling', 'automatic issuing', 'quarterly', 'monthly']
  },
  {
    id: 'syndic.programmation.liste.tableau',
    kind: 'table',
    title: 'Schedules',
    summary:
      "This table lists the condominium's call schedules with their next issue, their state and their last run. Each row lets you open it, run it, pause it or delete it.",
    howToRead: {
      columns: [
        { key: 'label', label: 'Label', description: 'The name of the schedule and its frequency.' },
        {
          key: 'source',
          label: 'Source and amount',
          description:
            '"Budget approved" (with the budget) or "Fixed amount" (with the amount or rate table, and the split mode).'
        },
        {
          key: 'next',
          label: 'Next issue',
          description: 'The next period, its issue date and due date. "None" when the end is reached.'
        },
        { key: 'status', label: 'Status', description: '"Active" or "Paused".' },
        {
          key: 'lastRun',
          label: 'Last execution',
          description: 'The last period processed and its result, with the number of notices sent or not.'
        },
        { key: 'actions', label: 'Actions', description: '"Open", "Execute now", "Pause" or "Resume", "Delete".' }
      ],
      statuses: [
        { value: 'SUCCESS', label: 'Succeeded', description: 'The period was issued.' },
        {
          value: 'FAILED',
          label: 'Failed',
          description: 'Issuing failed; the period will be retried. The error is shown under the status.'
        },
        {
          value: 'SKIPPED',
          label: 'Skipped (already processed)',
          description: 'The period had already been issued: nothing was recreated.'
        }
      ],
      notes: [
        '"Resend unsent notices" appears when some notices could not go out; it retries e-mail and WhatsApp for the calls still due with no notice sent.',
        'A line "Due date moved to…" shows a due date pushed back because it had already passed.'
      ]
    },
    steps: [
      { title: 'Open', detail: '"Open" shows the settings, the preview and the history.' },
      { title: 'Run now', detail: 'Available only if the schedule is active.' },
      { title: 'Pause', detail: '"Pause" stops issuing while keeping the history; "Resume" restarts it.' },
      { title: 'Delete', detail: '"Delete" asks for confirmation.' }
    ],
    consequences: [
      '"Execute now" really issues the period\'s calls, debits the accounts and sends the notices: it cannot be undone from this screen.',
      '"Delete": if calls have already been issued, the schedule is deactivated instead of deleted; otherwise it disappears with its history. Calls already issued remain.',
      '"Resume" is refused if another active schedule covers the same period.'
    ],
    faq: [
      {
        q: 'Does a paused schedule still issue?',
        a: 'No. It keeps its history but generates nothing until you click "Resume".'
      },
      {
        q: 'A notice did not go out. What should I do?',
        a: 'Read the reason under "Last execution" (unit with no co-owner, missing e-mail, notification off…), fix it, then "Resend unsent notices".'
      },
      {
        q: 'Why is "Execute now" greyed out?',
        a: 'The schedule is paused.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'The actions in this table require the condominium editing right.' },
    related: [
      { label: 'Schedule settings', helpId: 'syndic.programmation.liste.formulaire' },
      { label: 'Runs', helpId: 'syndic.programmation.liste.executions' }
    ],
    keywords: ['run now', 'pause', 'resume', 'delete', 'unsent notices', 'last run']
  },
  {
    id: 'syndic.programmation.liste.formulaire',
    kind: 'section',
    title: 'Schedule settings',
    summary:
      'This panel creates or edits a schedule: its frequency, its calendar, the amount source and its validity period.',
    howToRead: {
      notes: [
        '"Frequency": "Monthly", "Quarterly", "Biannual" or "Yearly". It can no longer change once periods have been issued.',
        '"Issue day": day of the first month of each period, from 1 to 28.',
        '"Delay before due date (days)": number of days between issue and due date, from 0 to 365.',
        '"Amount source": "Budget approved" (only approved budgets are offered; each run takes the voted budget divided by the number of periods) or "Fixed amount".',
        'Fixed amount: "Allocation among units" ("By shares", "By unit type", "Equally"), "Total amount per period" and, by shares, "Include annex units (parking spaces, cellars, premises…)".',
        '"Start date" (frozen after the first issue), "End date (optional)", and "Active" or "Paused".'
      ]
    },
    steps: [
      { title: 'Name it', detail: 'A clear label, for example "Quarterly current charges".' },
      { title: 'Set the calendar', detail: 'Frequency, issue day and delay before due date.' },
      {
        title: 'Choose the source',
        detail: 'An approved budget, or a fixed amount with its split; the preview per unit is shown.'
      },
      { title: 'Set the dates', detail: 'Start date, and end date if the schedule must stop.' },
      { title: 'Save', detail: '"Create" or "Save" in the panel header.' }
    ],
    consequences: [
      'Saving creates no call right away: the first period will be issued on its date, or by "Execute now".',
      'Once periods have been issued, the frequency and the start date can no longer change.',
      'A schedule on "Budget approved" requires an approved budget to exist.'
    ],
    faq: [
      {
        q: 'Why 28 at most for the issue day?',
        a: 'So that the day exists every month, February included.'
      },
      {
        q: 'Are annex units called?',
        a: 'By shares, only if "Include annex units (parking spaces, cellars, premises…)" is on; otherwise only apartments, offices and shops are.'
      },
      {
        q: 'No budget appears.',
        a: 'Only approved budgets are offered. Approve one in "Budgets".'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Creating or editing requires the condominium editing right.' },
    related: [
      { label: 'Preview', helpId: 'syndic.programmation.liste.apercu' },
      { label: 'Split between units', helpId: 'syndic.charges.liste.repartition' }
    ],
    keywords: ['frequency', 'issue day', 'delay', 'fixed amount', 'approved budget', 'annex units']
  },
  {
    id: 'syndic.programmation.liste.apercu',
    kind: 'section',
    title: 'Preview of coming periods',
    summary:
      "This tab simulates the schedule's next periods: issue and due dates, total amount and each unit's share. Nothing is issued.",
    howToRead: {
      notes: [
        '"Outcome" and "Due date": the planned dates of the period.',
        '"Allocation": the split mode, for a fixed amount.',
        '"Total amount": the total of the period. A calculation error is shown there in red.',
        'A warning says when the due date would already have passed at issue time: it is then shifted.'
      ]
    },
    consequences: ['The preview is a simulation: no call is created and nobody is notified.'],
    faq: [
      {
        q: 'Why is the "Preview" tab greyed out?',
        a: 'It opens once the schedule is created: open it from the table.'
      },
      {
        q: 'Why "No upcoming period for this schedule."?',
        a: 'The end date is reached: there is nothing left to issue.'
      },
      {
        q: 'Does the preview create real charge calls?',
        a: 'No, it is a simulation: no call is created and nobody is notified.'
      }
    ],
    permissions: { feature: 'SYNDIC' },
    related: [{ label: 'Schedule settings', helpId: 'syndic.programmation.liste.formulaire' }],
    keywords: ['preview', 'simulation', 'coming periods']
  },
  {
    id: 'syndic.programmation.liste.executions',
    kind: 'table',
    title: 'Schedule runs',
    summary:
      'This tab lists each pass of the schedule: period processed, result, number of calls created and notices sent, possible errors.',
    howToRead: {
      columns: [
        { key: 'periodLabel', label: 'Period', description: 'The period processed.' },
        { key: 'status', label: 'Status', description: '"Succeeded", "Failed" or "Skipped (already processed)".' },
        { key: 'trigger', label: 'Trigger', description: '"Automatic" (daily pass) or "Manual" ("Execute now").' },
        { key: 'callsCreated', label: 'Calls created', description: 'Number of charge calls issued.' },
        {
          key: 'callsCovered',
          label: 'Covered',
          description: "Calls immediately settled by the unit's advance: they receive a receipt and no notice."
        },
        {
          key: 'notices',
          label: 'Notices',
          description: 'Notices sent and not sent, with the reason for each failure.'
        },
        { key: 'createdAt', label: 'Date', description: 'The day of the run.' },
        { key: 'error', label: 'Error', description: 'The cause of a failure.' }
      ],
      statuses: [
        { value: 'SUCCESS', label: 'Succeeded', description: 'The period was issued.' },
        { value: 'FAILED', label: 'Failed', description: 'Issuing failed; it will be retried.' },
        { value: 'SKIPPED', label: 'Skipped (already processed)', description: 'The period had already been issued.' }
      ],
      notes: [
        'Two frequent errors: suspended agency, or subscription without the Syndic module or read only. Fix it then replay the period with "Execute now".'
      ]
    },
    consequences: [
      '"Resend unsent notices" retries e-mail and WhatsApp, after confirmation, for the run\'s calls still due with no notice already sent. A resend too close to the previous one is refused.'
    ],
    faq: [
      {
        q: 'What does "Covered" mean?',
        a: 'The unit had an advance that settled the call as soon as it was issued. The co-owner receives a receipt, not a notice to pay.'
      },
      {
        q: 'Is a failed period lost?',
        a: 'No, it is retried at the next pass, or by hand with "Execute now".'
      },
      {
        q: 'What is "Resend unsent notices" for?',
        a: 'It retries the email and WhatsApp notices, after confirmation, for the calls of that run that are still due and have no notice already sent. A resend too soon after the previous one is refused.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Resending notices requires the condominium editing right.' },
    related: [{ label: 'Schedules', helpId: 'syndic.programmation.liste.tableau' }],
    keywords: ['history', 'runs', 'unsent notices', 'failure', 'resend']
  },

  // ------------------------------------------------------------------ Suivi mensuel
  {
    id: 'syndic.suivi.liste',
    kind: 'page',
    title: 'Monthly tracking',
    summary:
      'This screen shows, for each unit, the state of the charges month by month over a year: settled, partial, due or late. It lets you see at a glance who is up to date.',
    purpose:
      'Charge calls often cover several months. Monthly tracking spreads each call over its months and shows, for each, what is paid.',
    steps: [
      {
        title: 'Choose the year',
        detail: 'The "Financial year" selector offers the current year, the three before and the next.'
      },
      {
        title: 'Search for a unit',
        detail: 'The search bar accepts a unit number or a co-owner, and the status over at least one month.'
      },
      { title: 'Read the grid', detail: 'Hover over a cell to see the amount due and paid for the month.' }
    ],
    consequences: ['View-only screen: no action changes the calls or sends a message.'],
    faq: [
      {
        q: 'How does a quarterly call appear?',
        a: 'It is spread in equal parts over its three months; the last month absorbs the rounding.'
      },
      {
        q: 'A partial payment on a quarter?',
        a: 'The payment fills the months in order: a half-paid quarter shows the first month settled, not three partial months.'
      },
      {
        q: 'The cell is empty with a dash.',
        a: 'No call covers this month for this lot.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Viewing requires the condominium viewing right.' },
    related: [
      { label: 'Monthly grid', helpId: 'syndic.suivi.liste.grille' },
      { label: 'Charge calls', helpId: 'syndic.charges.liste' }
    ],
    keywords: ['monthly tracking', 'month by month', 'unpaid', 'late', 'grid', 'advance']
  },
  {
    id: 'syndic.suivi.liste.grille',
    kind: 'section',
    title: 'Monthly grid of units',
    summary:
      "Each row is a unit, each column a month of the year. The colour and text of the cell give the month's state; the last column shows the unit's advance.",
    howToRead: {
      columns: [
        { key: 'lot', label: 'Unit', description: 'The unit number.' },
        { key: 'owner', label: 'Co-owner', description: 'The unit\'s co-owner, or "No co-owner".' },
        {
          key: 'months',
          label: 'Jan. to Dec.',
          description: 'One state per month. Hover over the cell: the "due" and "paid" amounts of the month are shown.'
        },
        {
          key: 'advance',
          label: 'Advance',
          description: 'Sum paid by the unit on top of what was called, waiting to be applied.'
        }
      ],
      statuses: [
        { value: 'PAID', label: 'Paid', description: 'The month is fully paid.' },
        { value: 'PARTIAL', label: 'Partial', description: 'Part of the month is paid, the due date has not passed.' },
        { value: 'DUE', label: 'Due', description: 'Nothing is paid and the due date has not passed.' },
        {
          value: 'OVERDUE',
          label: 'Overdue',
          description: 'An unsettled part of a call whose due date has passed. A partial payment past due is late.'
        },
        { value: 'NONE', label: '—', description: 'No call covers this month.' }
      ],
      notes: [
        'A call with no period dates is placed in the month of its due date.',
        'The criterion "Status for at least one month" keeps the units with at least one month in the chosen statuses.'
      ]
    },
    consequences: ['View only: nothing is sent or changed.'],
    faq: [
      {
        q: 'Why does a unit have an advance?',
        a: 'It paid more than what was called. The advance will be applied automatically to its next calls, oldest first.'
      },
      {
        q: 'Why a month "Overdue" when part is paid?',
        a: 'A partial payment whose due date has passed is considered late.'
      },
      {
        q: 'What does "—" mean in a cell?',
        a: 'No call covers that month for that unit.'
      }
    ],
    permissions: { feature: 'SYNDIC' },
    related: [{ label: 'List of calls', helpId: 'syndic.charges.liste.tableau' }],
    keywords: ['grid', 'settled', 'partial', 'due', 'late', 'advance', 'legend']
  },

  // ------------------------------------------------------------------ Settlement receipts
  {
    id: 'syndic.quittances.liste',
    kind: 'page',
    title: 'Receipts',
    summary:
      "This screen keeps the condominium's payment receipts and charge receipts. You can download them, resend them by e-mail, generate the missing ones and print in bulk.",
    purpose:
      'Each charge payment produces a document for the co-owner: a settlement receipt when a call is settled, a receipt when the payment is partial or leaves an advance.',
    steps: [
      { title: 'Search', detail: 'The bar filters by number, type, period, unit, co-owner or "Backfilled".' },
      { title: 'Download', detail: 'On the row: "Download" (PDF), "Arabic translation" or "Download (Word)".' },
      { title: 'Resend', detail: '"Resend" sends the document again by e-mail to the co-owner.' },
      {
        title: 'Catch up',
        detail: '"Generate missing receipts" creates the settlement receipts of settled calls that have none.'
      },
      { title: 'Print', detail: '"Print receipts" prepares a bulk PDF over a period.' }
    ],
    consequences: [
      'Documents are created by payments: a recorded payment produces its receipt or settlement receipts and sends them to the co-owner by e-mail, with the PDF attached.',
      '"Generate missing receipts" sends no e-mail.',
      '"Resend" really sends an e-mail to the co-owner.'
    ],
    faq: [
      {
        q: 'Receipt or settlement receipt?',
        a: 'A receipt (number starting R-) is issued for a partial payment or one that leaves an advance. A payment that settles its calls exactly only gets their settlement receipts (number starting Q-).'
      },
      {
        q: 'Why is "Resend" refused?',
        a: "The document was just sent (wait two minutes), the unit has no e-mail address, or a caught-up document names a co-owner who is no longer the unit's."
      },
      {
        q: 'What does "Backfilled" mean?',
        a: 'The document was created afterwards by "Generate missing receipts", not at payment time.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Condominium manager', 'Accountant'],
      note: 'Viewing, downloading and printing require the condominium viewing right. Resending by e-mail and generating missing settlement receipts require the editing right.'
    },
    related: [
      { label: 'List of receipts', helpId: 'syndic.quittances.liste.tableau' },
      { label: 'Print the settlement receipts', helpId: 'syndic.quittances.liste.impression' },
      { label: 'Charge calls', helpId: 'syndic.charges.liste' }
    ],
    keywords: ['settlement receipt', 'receipt', 'proof of payment', 'printing', 'resend', 'e-mail']
  },
  {
    id: 'syndic.quittances.liste.tableau',
    kind: 'table',
    title: 'Receipts and settlement receipts',
    summary:
      'This table lists the receipts and settlement receipts, with their unit, amount and e-mail sending state. Each row can be downloaded or resent.',
    howToRead: {
      columns: [
        { key: 'number', label: 'Number', description: 'The number of the document.' },
        { key: 'kind', label: 'Type', description: '"Settlement receipt" or "Receipt".' },
        { key: 'lotNumber', label: 'Unit', description: 'The unit concerned.' },
        { key: 'coownerName', label: 'Co-owner', description: 'The recipient, or "No co-owner".' },
        { key: 'period', label: 'Period', description: 'The period covered.' },
        { key: 'amount', label: 'Amount', description: 'The amount of the document.' },
        { key: 'issuedAt', label: 'Issued on', description: 'The issue date.' },
        {
          key: 'email',
          label: 'Email',
          description: 'The sending date (green), "Not sent", or "Error" with the cause.'
        },
        {
          key: 'backfilled',
          label: 'Backfilled',
          description: 'The "Backfilled" tag marks a document created afterwards.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Download", "Arabic translation", "Download (Word)" and "Resend".'
        }
      ],
      statuses: [
        { value: 'QUITTANCE', label: 'Settlement receipt', description: 'Issued when a call is fully settled.' },
        {
          value: 'RECEIPT',
          label: 'Receipt',
          description: 'Issued for a partial payment or one that leaves an advance.'
        }
      ],
      notes: ['"Arabic translation" downloads the PDF in Arabic.']
    },
    steps: [
      {
        title: 'Filter',
        detail:
          'Criteria: "Type", "Period" (documents whose period overlaps the range), "Unit", "Co-owner", "Backfilled".'
      },
      { title: 'Download', detail: 'One click on "Download", "Arabic translation" or "Download (Word)".' },
      { title: 'Resend', detail: '"Resend" sends the document again by e-mail to the unit\'s co-owner.' }
    ],
    consequences: [
      '"Resend" sends an e-mail: a second resend within two minutes is refused, and the number of resends is limited.',
      'Downloading notifies nobody.'
    ],
    faq: [
      {
        q: 'The "Email" column shows an error.',
        a: 'Sending failed (the mail server refused the e-mail or did not answer). Correct the co-owner\'s address then click "Resend".'
      },
      {
        q: 'Can the list be exported?',
        a: 'Yes, the export menu includes all documents matching the search.'
      },
      {
        q: 'What is the difference between "Settlement receipt" and "Receipt"?',
        a: 'A "Settlement receipt" is issued when a call is fully settled; a "Receipt" is issued for a partial payment or one that leaves an advance.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Resending requires the condominium editing right.' },
    related: [{ label: 'Print the settlement receipts', helpId: 'syndic.quittances.liste.impression' }],
    keywords: ['settlement receipt', 'receipt', 'resend by e-mail', 'Arabic translation', 'Word', 'caught up']
  },
  {
    id: 'syndic.quittances.liste.impression',
    kind: 'section',
    title: 'Print the settlement receipts',
    summary:
      'This window prepares a bulk PDF of the receipts and settlement receipts of a period, laid out on A4 sheets (1 to 3 columns, 1 to 4 rows). You can preview it before downloading.',
    howToRead: {
      notes: [
        '"Period": required; shortcuts "Current month", "Current quarter", "Current year".',
        '"Document type": "Settlement receipts", "Receipts" or "All".',
        '"Scope": "All co-owners" or "A co-owner or a unit" (choose the unit).',
        '"A4 layout": "Columns" (1 to 3) and "Rows" (1 to 4), with a small diagram of the sheet.'
      ]
    },
    steps: [
      { title: 'Choose the period', detail: 'The two dates, or a shortcut.' },
      { title: 'Choose the type and scope', detail: 'All co-owners, or one lot.' },
      { title: 'Set the layout', detail: 'Columns and rows per sheet.' },
      { title: 'Preview', detail: 'Shows the PDF in the window.' },
      { title: 'Download', detail: 'Saves the bulk PDF.' }
    ],
    consequences: [
      'Printing changes no document and sends no e-mail.',
      'Limits: at most 500 documents and 250 sheets per print; a message asks you to shorten the period or increase the number of settlement receipts per sheet.',
      'Printing is rate-limited: beyond that, wait a minute; only one print at a time.'
    ],
    faq: [
      {
        q: 'Why are "Preview" and "Download" greyed out?',
        a: 'A period is needed, and a unit if you choose "A co-owner or a unit".'
      },
      {
        q: '"No document matches this period and these filters."?',
        a: 'No receipt or settlement receipt exists for this period and type. Widen the period or generate the missing quittances.'
      },
      {
        q: 'How many receipts can be printed at once?',
        a: 'Up to 500 documents and 250 sheets per print. Beyond that, shorten the period or increase the number of receipts per sheet.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Printing requires the condominium viewing right.' },
    related: [{ label: 'Receipts and settlement receipts', helpId: 'syndic.quittances.liste.tableau' }],
    keywords: ['print', 'bulk printing', 'A4', 'grid', 'PDF', 'settlement receipts']
  }
];

export default entries;
