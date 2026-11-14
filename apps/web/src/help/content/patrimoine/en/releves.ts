import type { HelpEntry } from '../../../types';

/** Zone « releves » du module « patrimoine » (en). */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.releves',
    kind: 'page',
    title: 'Management statements',
    summary:
      'Generate, track and send the management statements of your owners. A statement sums up, for one month, the rent collected, your fees, the expenses and the net amount to pay back.',
    purpose:
      'When your agency manages properties on behalf of an owner, it reports to them every month: what was collected, what the agency kept and what is due to the owner. This screen produces that report and keeps the history.',
    steps: [
      {
        title: 'Generate a statement',
        detail:
          'In the "Generate a management statement" card, choose the owner, enter the month (YYYY-MM, for example 2026-03), tick the properties, then click "Generate statement".'
      },
      {
        title: 'Find a statement',
        detail: 'In the history, use the search or the Status, Period and Owner filters.'
      },
      {
        title: 'Open the details',
        detail: '"Details" button: you see every amount, the statement lines and the sharing with the owner.'
      },
      {
        title: 'Send to the owner',
        detail: '"Send" button on the statement row: the owner receives it by e-mail.'
      },
      {
        title: 'Recalculate an old statement',
        detail: 'If a statement carries the "Old calculation" tag, click "Recalculate" before any sending.'
      }
    ],
    consequences: [
      'A generated statement is a "Draft" (draft). It has not been sent to the owner yet.',
      'There is only one statement per owner and per month. Generating the same month again replaces the lines of the draft and recalculates it; this is refused if the statement is already "Sent" (up-to-date calculation) or "Paid".',
      '"Send" sends the statement to the owner by e-mail and, if WhatsApp is set up for your agency, by WhatsApp too. The statement then becomes "Sent" (a "Paid" statement keeps its status).',
      'Sending is refused or does not go out if the owner has no valid e-mail, has not agreed to receive e-mails, or if this notification is switched off in the agency settings.',
      'A statement becomes "Paid" only when the payment to the owner is recorded, not by a manual change.'
    ],
    faq: [
      {
        q: 'I cannot find my owner in the list. What should I do?',
        a: 'Only contacts with the "Owner" role appear. The owner must also be linked to an owner account of the agency, otherwise generation is refused with a message telling you so.'
      },
      {
        q: 'Why is the property list empty?',
        a: "It only shows this owner's properties that the agency can include in a statement. Choose the owner first."
      },
      {
        q: 'What does "Old calculation" mean?',
        a: 'The statement was made with the old method: the contract rent appears as collected rent and no fee is deducted. It cannot be sent until it is recalculated.'
      },
      {
        q: 'The owner received nothing. Why?',
        a: 'A warning message appears after you click "Send": missing or invalid e-mail, no e-mail consent, or sending switched off for this type of notification.'
      },
      {
        q: 'I do not see this screen in my menu.',
        a: 'Management statements concern properties of third-party owners. They belong to the Rental pack and are not included in a Patrimoine-only pack.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: "Viewing statements requires the right to view owners' management statements; generating, recalculating, sending and sharing require the right to create, recalculate and send management statements."
    },
    related: [
      { label: 'Generate a statement', helpId: 'patrimoine.releves.generer' },
      { label: 'Statement history', helpId: 'patrimoine.releves.historique' },
      { label: 'Statement details', helpId: 'patrimoine.releve' }
    ],
    keywords: [
      'management statement',
      'owner statement',
      'management report',
      'payout',
      'fees',
      'net to pay back',
      'send to owner'
    ]
  },
  {
    id: 'patrimoine.releves.generer',
    kind: 'section',
    title: 'Generate a management statement',
    summary: "This form produces an owner's statement for one month and for the properties you choose.",
    purpose:
      'The statement calculates, property by property, what was collected in the month, the agency fees, the expenses and the net amount to pay back to the owner.',
    steps: [
      {
        title: 'Owner',
        detail: 'Type a name to search among your owner contacts, then choose one.'
      },
      {
        title: 'Period',
        detail: 'Enter the month in YYYY-MM format, for example 2026-03. Any other format is refused.'
      },
      {
        title: 'Properties',
        detail: 'Tick one or more properties. The list fills in after the owner is chosen.'
      },
      {
        title: 'Generate',
        detail:
          'Click "Generate statement". The message "Statement generated" confirms it, and the statement appears in the history.'
      }
    ],
    consequences: [
      'The "collected" amount counts the successful payments dated within the month, even if they settle the rent of another month.',
      'Net to pay back = rent collected, minus fees and their VAT, minus expenses, minus withholding tax, plus security deposits kept.',
      'The statement is created as a "Draft": nothing is sent to the owner at this stage.'
    ],
    faq: [
      {
        q: 'Can I redo a statement for the same month?',
        a: 'Yes while it is a draft: it is recalculated. If it is already sent (up-to-date calculation) or paid, generation is refused.'
      },
      {
        q: 'What is the difference between "due" and "collected"?',
        a: '"Due" is what tenants owed for the month; "collected" is what they actually paid during the month.'
      },
      {
        q: 'Why is no fee deducted?',
        a: 'Fees are those recorded when payments were collected in the month. If the agency rate was not set, none was taken: set it, then recalculate the draft.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Requires the right to create, recalculate and send management statements.'
    },
    related: [
      { label: 'Statement history', helpId: 'patrimoine.releves.historique' },
      { label: 'Statement details', helpId: 'patrimoine.releve' }
    ],
    keywords: ['generate a statement', 'new statement', 'period', 'YYYY-MM', "owner's properties"]
  },
  {
    id: 'patrimoine.releves.historique',
    kind: 'table',
    title: 'Statement history',
    summary:
      'Each row is a management statement: the month, the owner, the key amounts, the status and the available actions.',
    howToRead: {
      columns: [
        { key: 'period', label: 'Period', description: 'The month covered by the statement, in YYYY-MM format.' },
        { key: 'owner', label: 'Owner', description: 'The owner concerned; if there is no name, their e-mail.' },
        { key: 'totalRevenue', label: 'Rent collected', description: 'What tenants paid during the month, in FCFA.' },
        { key: 'fees', label: 'Fees and VAT', description: 'The agency fees and their VAT, added together.' },
        { key: 'totalExpenses', label: 'Expenses', description: "The expenses deducted from the owner's income." },
        {
          key: 'netAmount',
          label: 'Net payable to owner',
          description:
            'What is due to the owner. A negative amount appears if fees and expenses exceed the rent collected.'
        },
        {
          key: 'status',
          label: 'Status',
          description: 'The progress of the statement, with the "Old calculation" tag when relevant.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            '"Details" opens the statement. "Recalculate" (old statements) or "Send" (up-to-date statements) appears as appropriate.'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'Generated but not yet sent to the owner. It can be recalculated.'
        },
        {
          value: 'SENT',
          label: 'Sent',
          description: 'Sent to the owner by e-mail (and WhatsApp if set up).'
        },
        {
          value: 'PAID',
          label: 'Paid',
          description: 'The payment to the owner is recorded. The statement can no longer be recalculated.'
        }
      ],
      notes: [
        'A yellow banner at the top of the page tells you how many unpaid statements were calculated with the old method.',
        'The export contains all statements matching your filters, not only the page shown.'
      ]
    },
    steps: [
      {
        title: 'Filter',
        detail: 'Search for an owner, a period or a property, or filter by status, period and owner.'
      },
      {
        title: 'Send',
        detail: 'Click "Send": a message tells you whether the statement went out by e-mail only or also by WhatsApp.'
      }
    ],
    consequences: [
      '"Send" turns a draft into "Sent" and records the sending date. Sending a "Paid" statement again does not change its status.',
      '"Recalculate" redoes the statement with the same owner, month and properties; it goes back to "Draft". Check it before sending it again.'
    ],
    faq: [
      {
        q: 'Why did the "Send" button disappear?',
        a: 'It is replaced by "Recalculate" on old-calculation statements. Recalculate, check, then send.'
      },
      {
        q: 'Why is "Recalculate" missing on a paid statement?',
        a: 'A paid statement is frozen. Any difference is settled on the next statement.'
      },
      {
        q: 'What does a negative net mean?',
        a: 'Fees and expenses exceed the rent collected in the month.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: '"Send" and "Recalculate" require the right to create, recalculate and send management statements.'
    },
    related: [
      { label: 'Generate a statement', helpId: 'patrimoine.releves.generer' },
      { label: 'Statement details', helpId: 'patrimoine.releve' }
    ],
    keywords: ['history', 'statement list', 'status', 'old calculation', 'recalculate', 'send']
  },
  {
    id: 'patrimoine.releve',
    kind: 'page',
    title: 'Statement details',
    summary:
      'Find every amount of a management statement, its lines property by property and, once the statement is sent, the sharing with the owner through a secure link.',
    purpose:
      'These details let you check a statement before or after sending, and explain to the owner where the net amount comes from.',
    howToRead: {
      notes: [
        'Rent billed: what tenants owed for the month. Rent collected: what they paid during the month. Still owed by tenants: unpaid amounts at the end of the month.',
        'Management fees and VAT on fees: the rate applied is shown in brackets when there is a single one.',
        'Withholding tax and security deposit retained: the first is deducted from the net, the second is added to it.',
        'Net payable to owner: the amount due to the owner. "Sent on" stays empty until the statement has been sent.',
        'An old-calculation statement only shows the contract rent and the expenses, with a warning banner.'
      ]
    },
    steps: [
      {
        title: 'Check the amounts',
        detail: 'Read the summary at the top, then the statement lines.'
      },
      {
        title: 'Recalculate if needed',
        detail:
          'The "Recalculate" button in the banner redoes the statement: for an unpaid old calculation, or for a draft generated without a fee rate.'
      },
      {
        title: 'Share',
        detail:
          'At the bottom of the page, send the monthly report or copy a secure link, once the statement has been sent to the owner.'
      },
      {
        title: 'Back to the list',
        detail: '"Back" button.'
      }
    ],
    consequences: [
      'Recalculating puts the statement back to "Draft": it will have to be sent to the owner again.',
      'A statement already "Paid" can no longer be recalculated, even if it carries the "Old calculation" tag.'
    ],
    faq: [
      {
        q: 'Why does the banner say the fee rate was not set?',
        a: 'When the calculation was made, the agency had no rate and no fee was deducted. Use the "Set the fee rate" link, then recalculate the draft.'
      },
      {
        q: 'Where can I see the withholding and the deposit kept?',
        a: 'In the summary, and in the statement lines with the type "Other".'
      },
      {
        q: 'Why can I not use the secure links?',
        a: 'Sharing is refused while the statement is a draft or an old calculation.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing requires the right to view management statements; recalculating and sharing require the right to create, recalculate and send.'
    },
    related: [
      { label: 'Statement lines', helpId: 'patrimoine.releve.lignes' },
      { label: 'Monthly report and secure links', helpId: 'patrimoine.releve.liens' },
      { label: 'Back to statements', helpId: 'patrimoine.releves' }
    ],
    keywords: ['statement details', 'net to pay back', 'rent due', 'outstanding', 'withholding tax', 'security deposit']
  },
  {
    id: 'patrimoine.releve.lignes',
    kind: 'table',
    title: 'Statement lines',
    summary:
      'The table details each amount of the statement, property by property: rent collected, fees, VAT, expenses and other lines.',
    howToRead: {
      columns: [
        {
          key: 'property',
          label: 'Property',
          description: 'The property concerned: its title, or its reference if none.'
        },
        { key: 'label', label: 'Label', description: 'The text of the line, for example the detail of an expense.' },
        { key: 'type', label: 'Type', description: 'The nature of the line (see below).' },
        { key: 'amount', label: 'Amount', description: 'The amount of the line in FCFA.' }
      ],
      statuses: [
        {
          value: 'RENT_COLLECTED',
          label: 'Rent collected',
          description: 'A rent paid by the tenant during the month.'
        },
        {
          value: 'EXPENSE_DEDUCTED',
          label: 'Deductible expense',
          description: "An expense taken off the owner's income."
        },
        { value: 'MANAGEMENT_FEE', label: 'Management fees', description: 'The agency commission.' },
        { value: 'MANAGEMENT_FEE_VAT', label: 'VAT on fees', description: 'The VAT applied to these fees.' },
        { value: 'ADVANCE', label: 'Advance', description: 'An advance paid to the owner.' },
        {
          value: 'OTHER',
          label: 'Other',
          description: 'Notably the withholding tax (deducted) and the security deposit kept (added).'
        }
      ],
      notes: ['The export contains the lines of the statement shown.']
    },
    faq: [
      {
        q: 'Why is a line of type "Other"?',
        a: 'That is the type of the withholding tax and kept security deposit lines.'
      },
      {
        q: 'How do I correct a line?',
        a: 'Lines come from the calculation: correct the source (payment, expense, fee rate), then recalculate if the statement allows it.'
      },
      {
        q: "Are the lines in the owner's report?",
        a: 'Yes: their secure link shows the lines grouped by property, with the net of each property.'
      }
    ],
    permissions: { feature: 'RENTAL' },
    related: [{ label: 'Statement details', helpId: 'patrimoine.releve' }],
    keywords: ['lines', 'amount details', 'fees', 'VAT', 'expenses', 'other']
  },
  {
    id: 'patrimoine.releve.liens',
    kind: 'section',
    title: 'Monthly report and secure links',
    summary:
      'Send the owner the monthly report, or copy a secure link to pass on yourself. The link gives read-only access to the statement.',
    purpose:
      "The owner views their statement without an account, through a time-limited link. They see the month's amounts and their breakdown by property, without your contact details or their own.",
    steps: [
      {
        title: 'Send the monthly report',
        detail:
          'Click "Send this month\'s report": ImmoTopia picks the best channel (WhatsApp or e-mail) according to the owner\'s contact details and consent.'
      },
      {
        title: 'Or copy a link',
        detail: 'Click "Copy the secure link", then paste it into your own message.'
      },
      {
        title: 'Monitor',
        detail: 'The "Active links" table shows the expiry, the number of views and the last view.'
      },
      {
        title: 'Revoke',
        detail: '"Revoke" button on the row, then confirm: the link stops working.'
      }
    ],
    consequences: [
      'Sharing is only possible after the statement has been sent to the owner ("Send" button in the list): a draft or an old-calculation statement is refused.',
      'The message goes out on a single channel, and an active link is created. If sending fails on every channel, the created link is cancelled. Clicking again sends the report again: this manual sending has no duplicate block.',
      '"Copy the secure link" creates a new link on each click. The link is shown only once: if automatic copying fails, a window shows it, and it cannot be read again after the window is closed.',
      'A revocation is final: the owner can no longer open the report with that link. To give access back, create a new one.',
      'Each successful opening of the link is counted in "Views".'
    ],
    faq: [
      {
        q: 'Why "No eligible channel"?',
        a: 'The owner has neither contact details nor consent for WhatsApp or e-mail. Complete their contact record.'
      },
      {
        q: 'Can I find a copied link again?',
        a: 'No. The link is only shown when it is created; create a new one if needed.'
      },
      {
        q: 'How long does the link stay valid?',
        a: 'Until the date in the "Expires on" column. After that date, the owner can no longer open it.'
      },
      {
        q: 'Can the owner change the statement?',
        a: 'No, the link is read-only.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Sending, copying and revoking require the right to create, recalculate and send management statements; the list of links requires the right to view them.'
    },
    related: [
      { label: 'Active links', helpId: 'patrimoine.releve.liens-actifs' },
      { label: 'Back to statements', helpId: 'patrimoine.releves' }
    ],
    keywords: ['secure link', 'monthly report', 'WhatsApp', 'share', 'revoke', 'read-only']
  },
  {
    id: 'patrimoine.releve.liens-actifs',
    kind: 'table',
    title: 'Active links',
    summary: 'The secure links still valid for this statement, with their expiry date and number of views.',
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Created on', description: 'The date and time the link was created.' },
        { key: 'expiresAt', label: 'Expires on', description: 'After this date, the link no longer opens.' },
        { key: 'viewCount', label: 'Views', description: 'The number of times the link was opened successfully.' },
        {
          key: 'lastViewedAt',
          label: 'Last viewed',
          description: 'The date of the last opening; a dash if the link was never opened.'
        },
        { key: 'status', label: 'Status', description: 'Always "Active": only active links are listed.' },
        { key: 'actions', label: 'Actions', description: '"Revoke" deactivates the link after confirmation.' }
      ],
      statuses: [{ value: 'ACTIVE', label: 'Active', description: 'The owner can still open the link.' }],
      notes: ['A revoked or expired link disappears from the list.']
    },
    faq: [
      {
        q: 'Where did a revoked link go?',
        a: 'It is no longer listed: only active links appear.'
      },
      {
        q: 'Why "No active link"?',
        a: 'No link was created, or they have all expired or been revoked.'
      },
      {
        q: 'Does the number of views prove the owner read the statement?',
        a: 'It shows the link was opened, not by whom.'
      }
    ],
    permissions: { feature: 'RENTAL' },
    related: [{ label: 'Monthly report and secure links', helpId: 'patrimoine.releve.liens' }],
    keywords: ['active links', 'views', 'expiry', 'revocation']
  }
];

export default entries;
