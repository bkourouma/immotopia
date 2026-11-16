import type { HelpEntry } from '../../../types';

/** Zone « caisse » du module finance (en). */
const entries: HelpEntry[] = [
  {
    id: 'finance.caisse.page',
    kind: 'page',
    title: 'Cash session',
    summary:
      'Open your cash session, follow what comes in and goes out during the day, then close it by counting the money. Another manager then approves the cash session.',
    purpose:
      'Each cashier runs their own cash session, starting with an opening float. The "My cash session" tab is your cash for the day; the "History" tab gathers every cash session of the agency, with their discrepancies.\n\nThis screen is not where you enter a collection: a rent paid in cash is recorded in rental management, then shows up here by itself in the transactions of your cash session.',
    steps: [
      {
        title: 'Open your cash session',
        detail:
          'In "My cash session", choose the cash desk, enter the "Opening float (FCFA)", then click "Open the cash session".'
      },
      {
        title: 'Follow the day',
        detail:
          'Rents collected, owner payouts and cash vouchers are added to the "Expected amount". Click "Refresh" to see the latest movements.'
      },
      {
        title: 'Close',
        detail:
          'Click "Close the cash session", count the money, explain the discrepancy if there is one, then click "Close".'
      },
      {
        title: 'Have it approved',
        detail: 'Another manager opens the "History" tab, clicks "View details" then "Approve".'
      }
    ],
    consequences: [
      'You can only have one cash session open at a time: until it is closed, opening a new one is refused.',
      'The expected amount is never typed in: it is calculated (opening float + collections − disbursements) and frozen at closing.',
      'Once closed, the cash session moves to "To validate". The screen does not let you reopen it.',
      'At approval, if the count differs from the expected amount, the discrepancy is recorded in the accounts: a shortage as an expense, a surplus as income.'
    ],
    faq: [
      {
        q: 'Why does a rent I collected not appear in my cash session?',
        a: 'Only rents paid in cash and recorded by you while your cash session is open are counted. Also check that the payment is linked to the same cash desk as yours, then click "Refresh".'
      },
      {
        q: 'My count does not match the expected amount. What should I do?',
        a: 'Close anyway, giving the reason for the discrepancy (at least 3 characters): without a reason, closing is impossible. The discrepancy is posted to the accounts at approval.'
      },
      {
        q: 'I do not see the "My cash session" tab.',
        a: 'It requires the "Create financial documents" permission. Without it, the screen opens directly on "History".'
      }
    ],
    permissions: {
      note: '"My cash session" requires "Create financial documents". "History" requires "View third-party accounts". Approving a cash session requires "Validate financial documents".'
    },
    related: [
      {
        label: 'Cash session history',
        helpId: 'finance.caisse.historique'
      },
      {
        label: 'Close the cash session',
        helpId: 'finance.caisse.cloture'
      },
      {
        label: 'Treasury accounts',
        to: '/tenant/:tenantId/finance/tresorerie'
      }
    ],
    keywords: [
      'cash',
      'cash desk',
      'opening float',
      'cash count',
      'cash closing',
      'cashier',
      'cash discrepancy',
      'collection',
      'counting'
    ],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'caisse-onglets',
          title: 'Two tabs',
          description:
            '"My cash session" is your cash for the day. "History" lists every cash session of the agency, to review or approve.'
        },
        {
          target: 'caisse-ouvrir',
          title: 'Open your cash session',
          description:
            'Choose the cash desk, enter the opening float (the money already there), then open it. This block disappears once your cash session is open.'
        },
        {
          target: 'caisse-montant-attendu',
          title: 'The expected amount',
          description: 'It calculates itself: opening float, plus collections, minus cash going out.'
        },
        {
          target: 'caisse-operations',
          title: 'The cash session transactions',
          description: 'Every rent collected in cash, owner payout or cash voucher appears here, with its amount.'
        },
        {
          target: 'caisse-cloturer',
          title: 'Close at the end of the day',
          description:
            'Count the money, note any discrepancy, then close. Another manager will approve your cash session.'
        }
      ]
    }
  },
  {
    id: 'finance.caisse.ouverture',
    kind: 'section',
    title: 'Open my cash session',
    summary: 'This form opens your cash session for the day. It shows as long as you have no open cash session.',
    purpose:
      'The opening float is the money already in the cash desk when you open. It is the starting point of the expected amount.',
    steps: [
      {
        title: 'Choose the cash desk',
        detail:
          'The "Cash session" list offers the accounts of nature "Cash session" that are still active. Left empty, the agency\'s default account is used.'
      },
      {
        title: 'Enter the opening float',
        detail: 'Type the amount in FCFA. Zero is accepted; a negative amount is refused.'
      },
      {
        title: 'Add a note',
        detail: 'Optional: a few words to remember the context of the opening.'
      },
      {
        title: 'Open',
        detail: 'Click "Open the cash session". Your cash session gets a number of the form CAI-year-sequence number.'
      }
    ],
    consequences: [
      'Opening records no accounting entry.',
      'The cash session stays open in your name until it is closed; you only have one at a time.'
    ],
    faq: [
      {
        q: 'I cannot find any cash desk in the list.',
        a: 'Only active accounts of nature "Cash session" are offered. They are managed in the Treasury screen.'
      },
      {
        q: 'Can I open a cash session with no money at the start?',
        a: 'Yes: enter 0. The field must still be filled in.'
      },
      {
        q: 'What happens if I leave the cash desk empty?',
        a: "The agency's default cash account is used."
      }
    ],
    permissions: {
      note: 'Opening a cash session requires "Create financial documents".'
    },
    related: [
      {
        label: 'Cash desk overview',
        helpId: 'finance.caisse.page'
      }
    ],
    keywords: ['open the cash desk', 'opening float', 'cash opening', 'cashier']
  },
  {
    id: 'finance.caisse.session',
    kind: 'section',
    title: 'My open cash session',
    summary:
      'This card shows your current cash session: its number, the opening time, the expected amount and the transactions already made.',
    purpose: 'This is where you follow your cash session during the day and start the closing.',
    steps: [
      {
        title: 'Read the header',
        detail: 'The cash session number, the opening time and the name of the physical cash desk.'
      },
      {
        title: 'Refresh',
        detail: 'Click "Refresh" to reload the transactions and the expected amount.'
      },
      {
        title: 'Check the indicators',
        detail: 'Opening float, Collections, Disbursements and Expected amount.'
      },
      {
        title: 'Close',
        detail: 'The "Close the cash session" button opens the counting window.'
      }
    ],
    consequences: [
      'The content updates when you click "Refresh" or reload the screen.',
      'Closing is final for you: see "Close the cash session".'
    ],
    faq: [
      {
        q: 'Why did the expected amount change?',
        a: 'A cash transaction was recorded since your last refresh: the amount is recalculated on each load.'
      },
      {
        q: 'Can I change the opening float after opening?',
        a: 'The screen does not allow it.'
      },
      {
        q: 'Where can I see the details of the transactions?',
        a: 'In the transactions table, below the indicators.'
      }
    ],
    permissions: {
      note: 'Requires "Create financial documents". Only the cashier can close their own cash session.'
    },
    related: [
      {
        label: 'The expected amount',
        helpId: 'finance.caisse.montant-attendu'
      },
      {
        label: 'Cash session transactions',
        helpId: 'finance.caisse.operations'
      },
      {
        label: 'Close the cash session',
        helpId: 'finance.caisse.cloture'
      }
    ],
    keywords: ['open cash session', 'cash session', 'refresh', 'follow the cash desk']
  },
  {
    id: 'finance.caisse.montant-attendu',
    kind: 'section',
    title: 'The expected amount',
    summary:
      'The expected amount is what your cash desk should contain: the opening float, plus collections, minus cash going out.',
    purpose:
      'It is the reference for the closing count. You never type it: it is deduced from the cash transactions of your cash session.',
    howToRead: {
      notes: [
        'Opening float: the amount entered at opening.',
        'Collections: the sum of rents paid in cash that you recorded during the session.',
        'Disbursements: the sum of cash owner payouts and cash vouchers that you approved during the session.',
        'Expected amount = Opening float + Collections − Disbursements.'
      ]
    },
    consequences: [
      'At closing, the server recalculates the expected amount and freezes it: it is the one used to calculate the discrepancy.',
      'A cancelled cash voucher no longer counts as money going out.'
    ],
    faq: [
      {
        q: 'Which payments are counted?',
        a: 'Rents paid in cash, recorded by you and linked to your cash desk, while the session is open.'
      },
      {
        q: 'Does a cash voucher I issued but did not approve count?',
        a: 'No. It counts once approved, and for the person who approved it.'
      },
      {
        q: 'Is the amount at closing different from the one displayed?',
        a: 'It can be if a transaction was recorded in the meantime: it is recalculated at closing.'
      }
    ],
    related: [
      {
        label: 'Cash session transactions',
        helpId: 'finance.caisse.operations'
      }
    ],
    keywords: ['expected amount', 'expected', 'opening float', 'collections', 'disbursements', 'cash balance']
  },
  {
    id: 'finance.caisse.operations',
    kind: 'table',
    title: 'Cash session transactions',
    summary: 'This table lists the cash movements that make up the expected amount of the cash session.',
    howToRead: {
      columns: [
        {
          key: 'at',
          label: 'Date and time',
          description: 'The moment the transaction was recorded.'
        },
        {
          key: 'kind',
          label: 'Type',
          description:
            'Rent collected, Owner payout or Cash voucher. This column appears in the details of a cash session.'
        },
        {
          key: 'label',
          label: 'Label',
          description: 'The lease, payout or voucher number, with the payee for a cash voucher.'
        },
        {
          key: 'amount',
          label: 'Amount',
          description: 'Positive for cash coming in, negative for cash going out.'
        }
      ],
      notes: [
        'Twenty lines per page. The search, the "Type" filter and the "Amount" filter apply to the whole list; the export also covers the whole filtered list.'
      ]
    },
    faq: [
      {
        q: 'Why are some amounts negative?',
        a: 'They are cash going out: a payout to an owner or a cash voucher.'
      },
      {
        q: 'Can I correct a transaction here?',
        a: 'No, this table is read-only. The correction is made in the screen where the transaction was recorded.'
      },
      {
        q: 'How do I find a specific transaction?',
        a: 'Type part of the label in the search, or filter by type and amount.'
      }
    ],
    related: [
      {
        label: 'The expected amount',
        helpId: 'finance.caisse.montant-attendu'
      }
    ],
    keywords: ['transactions', 'rent collected', 'payout', 'cash voucher', 'cash movements']
  },
  {
    id: 'finance.caisse.cloture',
    kind: 'section',
    title: 'Close the cash session',
    summary:
      'This window is used to count the money in your cash desk and close it. The difference between the count and the expected amount is calculated before your eyes.',
    purpose:
      "Closing ends your cash session: it freezes the expected amount and the count, then waits for a manager's approval.",
    steps: [
      {
        title: 'Choose the counting mode',
        detail:
          'By default, you count note by note and coin by coin. Turn on "Enter the total without a cash count" to type only the "Counted amount".'
      },
      {
        title: 'Count',
        detail:
          'Enter the number of notes and coins of each value: 10,000, 5,000, 2,000, 1,000, 500, 250, 200, 100, 50, 25, 10 and 5 FCFA. The subtotal of each line is displayed.'
      },
      {
        title: 'Read the discrepancy',
        detail:
          'The grey box shows the "Total counted", the "Expected" and the "Variance": "No discrepancy", "Missing" or "Surplus".'
      },
      {
        title: 'Explain the discrepancy',
        detail:
          'If there is one, fill in "Reason for the discrepancy" (at least 3 characters). Without a reason, the button stays greyed out.'
      },
      {
        title: 'Close',
        detail: 'Click "Close".'
      }
    ],
    consequences: [
      'The cash session moves to "To validate" and can no longer be changed from this screen.',
      'The expected amount is recalculated by the server at that moment; the final discrepancy is calculated with it.',
      'No accounting entry is posted at closing: the discrepancy is recorded at approval by another manager.',
      'If you entered a cash count, it is kept and can be viewed in the details of the cash session.'
    ],
    faq: [
      {
        q: 'What do "Missing" and "Surplus" mean?',
        a: '"Missing": you counted less than the expected amount. "Surplus": you counted more.'
      },
      {
        q: 'Why is the "Close" button greyed out?',
        a: 'There is a discrepancy and the reason is shorter than 3 characters. Explain the discrepancy to enable the button.'
      },
      {
        q: 'Do I have to do the cash count?',
        a: 'No. Turn on "Enter the total without a cash count" to type only the counted amount.'
      },
      {
        q: 'Can I correct after clicking "Close"?',
        a: 'The screen does not let you reopen the cash session. The manager who approves sees your reason and can add a comment.'
      }
    ],
    permissions: {
      note: 'Requires "Create financial documents". Only the cashier can close their cash session.'
    },
    related: [
      {
        label: 'Cash session history',
        helpId: 'finance.caisse.historique'
      },
      {
        label: 'Cash session details',
        helpId: 'finance.caisse.detail'
      }
    ],
    keywords: ['closing', 'cash count', 'count the cash', 'discrepancy', 'missing', 'surplus', 'close the cash desk']
  },
  {
    id: 'finance.caisse.historique',
    kind: 'table',
    title: 'Cash session history',
    summary:
      'This tab lists every cash session of the agency, open, to validate or approved, with their discrepancy. This is where a manager approves a closed cash session.',
    purpose: 'It lets you review past cash sessions, spot discrepancies and have closed cash sessions approved.',
    howToRead: {
      columns: [
        {
          key: 'number',
          label: 'Number',
          description: 'The cash session number, of the form CAI-year-sequence number.'
        },
        {
          key: 'treasury',
          label: 'Cash session',
          description: 'The physical cash desk held during the session.'
        },
        {
          key: 'cashier',
          label: 'Cashier',
          description: 'The person who opened and held the cash session.'
        },
        {
          key: 'openedAt',
          label: 'Opening',
          description: 'The opening date and time.'
        },
        {
          key: 'closedAt',
          label: 'Closure',
          description: 'The closing date and time. A dash (—) means the cash session is still open.'
        },
        {
          key: 'expected',
          label: 'Expected',
          description: 'The expected amount: opening float + collections − disbursements.'
        },
        {
          key: 'counted',
          label: 'Counted',
          description: 'The amount counted at closing.'
        },
        {
          key: 'difference',
          label: 'Variance',
          description: 'Counted minus expected. Green: no discrepancy. Red: money is missing. Orange: surplus.'
        },
        {
          key: 'status',
          label: 'Status',
          description: 'The state of the cash session (see the statuses below).'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"View details" opens the cash session page.'
        }
      ],
      statuses: [
        {
          value: 'OPEN',
          label: 'Open',
          description: 'The cashier is still running their cash session.'
        },
        {
          value: 'CLOSED',
          label: 'To validate',
          description: "The cash session is closed and waits for a manager's approval."
        },
        {
          value: 'VALIDATED',
          label: 'Approved',
          description: 'A manager has approved the cash session. Any discrepancy is posted to the accounts.'
        }
      ],
      notes: [
        'Filters: search (number, cash desk, cashier), "Status", opening period, "Cashier", "Cash session" and "Non-zero discrepancy". The export covers all cash sessions that match your filters.'
      ]
    },
    steps: [
      {
        title: 'Filter',
        detail: 'For example, choose "Status" = "To validate" to see the cash sessions waiting for a check.'
      },
      {
        title: 'Open a cash session',
        detail: 'Click "View details".'
      },
      {
        title: 'Approve',
        detail: 'In the details, add a comment if needed, then click "Approve".'
      }
    ],
    faq: [
      {
        q: 'How do I spot cash sessions with a discrepancy?',
        a: 'Turn on the "Non-zero discrepancy" filter.'
      },
      {
        q: 'Why can I not approve my own cash session?',
        a: 'Approval is done by someone other than the cashier, so that a second pair of eyes checks the count.'
      },
      {
        q: "I do not see the other cashiers' cash sessions.",
        a: 'The list requires the "View third-party accounts" permission.'
      }
    ],
    permissions: {
      note: 'The list requires "View third-party accounts". Approving requires "Validate financial documents".'
    },
    related: [
      {
        label: 'Cash session details',
        helpId: 'finance.caisse.detail'
      },
      {
        label: 'Cash desk overview',
        helpId: 'finance.caisse.page'
      }
    ],
    keywords: ['history', 'past cash sessions', 'approve a cash session', 'discrepancy', 'cash check']
  },
  {
    id: 'finance.caisse.detail',
    kind: 'section',
    title: 'Cash session details',
    summary:
      'This window shows everything about a cash session: who held it, the amounts, the transactions, the cash count and, for a manager, the approval button.',
    purpose: 'It is used to check the count of a closed cash session before approving it.',
    steps: [
      {
        title: 'Read the information',
        detail:
          'Cashier, cash desk, opening, closing, opening float, expected, counted, variance and reason for the discrepancy.'
      },
      {
        title: 'Check the transactions',
        detail: 'The "Transactions" table details the cash coming in and going out.'
      },
      {
        title: 'Look at the cash count',
        detail: 'If it was entered, the "Cash count" table shows the number of notes and coins counted.'
      },
      {
        title: 'Approve',
        detail: 'On a cash session "To validate", add a "Comment (optional)" then click "Approve".'
      }
    ],
    consequences: [
      'Approval is done by someone other than the cashier: if you held the cash session yourself, the screen reminds you.',
      'If the cash session has a discrepancy, approval records an accounting entry: a shortage as an expense, a surplus as income, against the cash desk account.',
      'An approved cash session no longer changes status; the window then shows who approved it and when.'
    ],
    faq: [
      {
        q: 'I do not see the "Approve" button.',
        a: 'The cash session must be "To validate", you must have the "Validate financial documents" permission and not be the cashier.'
      },
      {
        q: 'What happens to my approval comment?',
        a: 'It is kept with the cash session and displayed in this window.'
      },
      {
        q: 'Why is there no cash count?',
        a: 'The cashier closed by entering only the counted total.'
      }
    ],
    permissions: {
      note: 'Viewing a cash session requires "View third-party accounts" (or being its cashier). Approving requires "Validate financial documents".'
    },
    related: [
      {
        label: 'Cash session history',
        helpId: 'finance.caisse.historique'
      },
      {
        label: 'Cash count',
        helpId: 'finance.caisse.billetage'
      }
    ],
    keywords: ['cash session details', 'approve the cash session', 'approval comment', 'check']
  },
  {
    id: 'finance.caisse.billetage',
    kind: 'table',
    title: 'Cash count',
    summary: 'This table shows how many notes and coins of each value the cashier counted at closing.',
    howToRead: {
      columns: [
        {
          key: 'valeur',
          label: 'Value',
          description: 'The value of the note or coin, in FCFA.'
        },
        {
          key: 'nombre',
          label: 'Count',
          description: 'How many units of this value were counted.'
        },
        {
          key: 'sous-total',
          label: 'Subtotal',
          description: 'The value multiplied by the count.'
        }
      ],
      notes: [
        'Only values counted at least once are listed. The total of the subtotals is the "Counted" amount of the cash session.'
      ]
    },
    faq: [
      {
        q: 'Why is this table missing?',
        a: 'It only exists if the cash session was closed with a cash count.'
      },
      {
        q: 'What is it for?',
        a: 'It lets the manager check the details of the count before approving.'
      },
      {
        q: 'Can it be edited?',
        a: 'No, it is frozen at closing.'
      }
    ],
    related: [
      {
        label: 'Close the cash session',
        helpId: 'finance.caisse.cloture'
      }
    ],
    keywords: ['cash count', 'notes', 'coins', 'counting', 'denominations']
  },
  {
    id: 'finance.pieces-de-caisse.page',
    kind: 'page',
    title: 'Cash voucher',
    summary:
      'Issue a cash voucher for a construction site expense paid in cash, then approve it and print the slip. As long as the voucher is not approved, it remains a draft.',
    purpose:
      'A cash voucher is the supporting document for an expense paid in cash on a construction site: payee, amount, date, cost line and reason. Once approved, it takes the money out of the cash desk and adds to the cost of the site.\n\nThe process has two steps: the person who enters issues the voucher, and the person who has the right to approve approves it.',
    steps: [
      {
        title: 'Fill in the form',
        detail:
          'Choose the "Construction site" and the "Cost line", then enter the "Payee", the "Amount (FCFA)", the "Date" and the "Reason". All these fields are required.'
      },
      {
        title: 'Issue the voucher',
        detail: 'Click "Issue the document": the voucher is created as a draft, without a number.'
      },
      {
        title: 'Approve',
        detail: 'Click "Approve the document" and confirm. The voucher then receives its number.'
      },
      {
        title: 'Print',
        detail: 'Click "Print the order": the slip opens in a new tab.'
      },
      {
        title: 'Correct',
        detail:
          'Draft: "Delete the draft". Approved voucher: "Cancel the voucher". Or "Duplicate" to start from a similar voucher.'
      }
    ],
    consequences: [
      'A draft has no number, no accounting entry and no effect on the cost of the site: deleting it leaves no trace.',
      'Approval is irreversible: the voucher can no longer be changed. It receives its number, records the expense in the accounts (cost account of the line, against the cash desk) and adds to the cost of the site.',
      'A closed construction site no longer accepts expenses: approval is refused there.',
      "The amount leaves the cash desk: if the person who approved the voucher runs the agency's default cash desk, it appears as a disbursement in their open cash session."
    ],
    faq: [
      {
        q: 'Why does my voucher have no number?',
        a: 'The number is assigned at approval. A voucher still in draft has none, which avoids gaps in the numbering.'
      },
      {
        q: 'Why does my construction site not appear in the list?',
        a: 'Closed construction sites are left out: their cost is frozen and no longer accepts expenses.'
      },
      {
        q: 'How do I correct a voucher that is already approved?',
        a: 'Cancel it with "Cancel the voucher", then issue a new one (the "Duplicate" button pre-fills the form).'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Issuing and deleting a draft require "Create financial documents". Approving or cancelling a voucher requires "Validate financial documents".'
    },
    related: [
      {
        label: 'Issue a voucher',
        helpId: 'finance.pieces-de-caisse.formulaire'
      },
      {
        label: 'The issued voucher',
        helpId: 'finance.pieces-de-caisse.piece'
      },
      {
        label: 'Documents to approve',
        to: '/tenant/:tenantId/finance/validation'
      }
    ],
    keywords: ['cash voucher', 'petty cash', 'cash expense', 'site expense', 'payment slip', 'supporting document']
  },
  {
    id: 'finance.pieces-de-caisse.formulaire',
    kind: 'section',
    title: 'Issue a voucher',
    summary:
      'This short form records a cash expense on a construction site. Issuing creates a draft: nothing is posted to the accounts yet.',
    purpose:
      'It gathers what is needed to justify the expense: where it took place, which cost line it is charged to, who is paid, how much, when and why.',
    steps: [
      {
        title: 'Construction site',
        detail: 'Choose the construction site concerned. Only sites that are not closed are offered.'
      },
      {
        title: 'Cost line',
        detail: 'Choose the line the expense is charged to. Only active lines are offered.'
      },
      {
        title: 'Payee and amount',
        detail: 'Enter who receives the money and the amount in FCFA (at least 1).'
      },
      {
        title: 'Date and reason',
        detail: "Today's date is suggested. The reason explains the expense."
      },
      {
        title: 'Issue',
        detail: 'Click "Issue the document". The form locks and the voucher appears below.'
      }
    ],
    consequences: [
      'Issuing creates a draft: no number, no entry, no effect on the cost of the site.',
      'The form stays locked while the voucher is displayed: use "Issue a new document" to start from scratch, or "Duplicate" to start from this voucher.'
    ],
    faq: [
      {
        q: 'Which error message appears if a field is missing?',
        a: 'You must fill in the construction site, the cost line, the payee, a positive amount and the reason.'
      },
      {
        q: 'The construction site is already chosen when I arrive on the screen.',
        a: "You came from a site's page: it is pre-selected. If it was closed in the meantime, the field is emptied and a warning is shown."
      },
      {
        q: 'Can I edit the voucher after issuing it?',
        a: 'No, the form is locked. Delete the draft and issue a new one.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Requires "Create financial documents".'
    },
    related: [
      {
        label: 'The issued voucher',
        helpId: 'finance.pieces-de-caisse.piece'
      }
    ],
    keywords: ['issue a voucher', 'construction site', 'cost line', 'payee', 'reason']
  },
  {
    id: 'finance.pieces-de-caisse.piece',
    kind: 'section',
    title: 'The issued voucher',
    summary:
      'This card presents the voucher you have just issued, its status and the possible actions: approve, delete, cancel or print.',
    purpose:
      'It guides you from issuing to approval: while the voucher is a draft, you can approve or delete it; once approved, you can only cancel or print it.',
    howToRead: {
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'The voucher is issued but not approved. It has no number and is not posted to the accounts.'
        },
        {
          value: 'VALIDATED',
          label: 'Approved',
          description:
            'The voucher has a number and the expense is posted to the accounts. It can no longer be changed.'
        },
        {
          value: 'VOIDED',
          label: 'Cancelled',
          description:
            'The voucher was cancelled by a linked cancellation voucher. Its amount no longer counts in the cost of the site.'
        }
      ],
      notes: ['The title shows the voucher number, or "Document to approve" followed by the payee while it has none.']
    },
    steps: [
      {
        title: 'Approve the voucher',
        detail: 'Draft: click "Approve the document", read the warning and confirm.'
      },
      {
        title: 'Delete the draft',
        detail: 'Draft: "Delete the draft", then confirm. No trace is kept.'
      },
      {
        title: 'Cancel the voucher',
        detail: 'Approved voucher: "Cancel the voucher", then enter the reason in the window.'
      },
      {
        title: 'Print the slip',
        detail: 'Available at any time: the slip opens in a new tab.'
      }
    ],
    consequences: [
      'Approving is irreversible: the voucher can no longer be changed and receives its number.',
      'Deleting only applies to a draft: nothing had been posted. An approved voucher is not deleted, it is cancelled.',
      'Approving or cancelling a voucher requires the "Validate financial documents" permission.'
    ],
    faq: [
      {
        q: 'What is the difference between deleting and cancelling?',
        a: 'Deleting erases a draft without leaving a trace. Cancelling applies to an approved voucher: it is kept with its number, and a linked cancellation voucher cancels its effects.'
      },
      {
        q: 'I cannot approve the voucher.',
        a: 'The "Validate financial documents" permission is required. Approval is also refused if the construction site is closed.'
      },
      {
        q: 'Is the printed slip available for a draft?',
        a: 'The "Print the order" button is offered whatever the status of the voucher.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Deleting a draft requires "Create financial documents". Approving and cancelling require "Validate financial documents".'
    },
    related: [
      {
        label: 'Cancel a cash voucher',
        helpId: 'finance.pieces-de-caisse.annulation'
      },
      {
        label: 'Documents to approve',
        to: '/tenant/:tenantId/finance/validation'
      }
    ],
    keywords: ['approve a voucher', 'delete a draft', 'print the slip', 'voucher status']
  },
  {
    id: 'finance.pieces-de-caisse.annulation',
    kind: 'section',
    title: 'Cancel a cash voucher',
    summary: 'This window cancels an already approved voucher, keeping a trace. A reason is required.',
    purpose:
      'An approved voucher is never edited: it is cancelled by a linked voucher, and the history shows both. The cost of the site corrects itself.',
    steps: [
      {
        title: 'Open the window',
        detail: 'On an "Approved" voucher, click "Cancel the voucher".'
      },
      {
        title: 'Enter the reason',
        detail:
          'Explain the reason in "Reason for the cancellation" (for example: error on the payee). The button stays greyed out while the reason is empty.'
      },
      {
        title: 'Confirm',
        detail: 'Click "Confirm the cancellation", or "Give up" to close without doing anything.'
      }
    ],
    consequences: [
      'A linked cancellation voucher is created: the original voucher is kept with its number.',
      "The voucher's accounting entry is reversed and its amount no longer counts in the cost of the site.",
      'A cancelled voucher no longer counts as money going out in the expected amount of a cash session.'
    ],
    faq: [
      {
        q: 'Can I cancel a voucher that is still a draft?',
        a: 'No: a draft is deleted. Cancelling only applies to approved vouchers.'
      },
      {
        q: 'Can I "un-cancel" a voucher?',
        a: 'No. Issue a new voucher, for example with "Duplicate".'
      },
      {
        q: 'Who can cancel?',
        a: 'A person with the "Validate financial documents" permission: cancelling is the same responsibility as approving.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Requires "Validate financial documents".'
    },
    related: [
      {
        label: 'The issued voucher',
        helpId: 'finance.pieces-de-caisse.piece'
      }
    ],
    keywords: ['cancel a voucher', 'cancellation', 'reason', 'reversal', 'entry error']
  },
  {
    id: 'finance.tresorerie.page',
    kind: 'page',
    title: 'Treasury',
    summary:
      "Follow the accounts where the agency's money is held (cash desks, banks, Mobile Money…), move funds from one to another and manage the withholding tax payments to the DGI.",
    purpose:
      'The screen has three tabs. "Accounts" lists your treasury accounts with their balance. "Internal transfers" records money moving between two of your accounts, for example a deposit of cheques at the bank. "Withholding taxes" tracks what was withheld on rents and what was paid over to the DGI.\n\nThis screen does not offer reconciliation with the bank statement: balances come from the agency\'s accounting entries.',
    steps: [
      {
        title: 'Create an account',
        detail: '"Accounts" tab, "New account": choose the nature, the label and the account number.'
      },
      {
        title: 'Move funds',
        detail: '"Internal transfers" tab, "New transfer": source account, destination account, amount and date.'
      },
      {
        title: 'Pay over to the DGI',
        detail: '"Withholding taxes" tab, "New remittance": period, amount, date and the paying account.'
      },
      {
        title: 'Correct',
        detail: '"Cancel" on an approved transfer or remittance, with a reason. An account is corrected with "Edit".'
      }
    ],
    consequences: [
      'A transfer and a remittance to the DGI are recorded immediately, with their accounting entry; there is no draft.',
      'Money going out is refused if the source account does not have a sufficient balance: no account can become negative.',
      'Cancelling a transfer or a remittance posts the reverse entry; the document stays visible with the status "Cancelled".'
    ],
    faq: [
      {
        q: "Where does an account's balance come from?",
        a: "It is calculated from the account's accounting entries: total in minus total out."
      },
      {
        q: 'Where do I record the deposit of cheques at the bank?',
        a: 'In "Internal transfers": source "Checks to cash", destination your "Bank" account.'
      },
      {
        q: 'Why is my transfer refused?',
        a: 'Most often the balance of the source account is insufficient, or the two accounts are identical or inactive.'
      }
    ],
    permissions: {
      note: 'Viewing the screen requires "View third-party accounts". Creating a transfer or a remittance requires "Create financial documents"; cancelling them requires "Validate financial documents". Creating or editing an account requires "Configure the finance module".'
    },
    related: [
      {
        label: 'Treasury accounts',
        helpId: 'finance.tresorerie.comptes'
      },
      {
        label: 'Internal transfers',
        helpId: 'finance.tresorerie.virements'
      },
      {
        label: 'Withholding tax',
        helpId: 'finance.tresorerie.retenue'
      },
      {
        label: 'Cash session',
        to: '/tenant/:tenantId/finance/caisse'
      }
    ],
    keywords: [
      'treasury',
      'bank account',
      'bank',
      'Mobile Money',
      'balance',
      'transfer',
      'cheque deposit',
      'DGI',
      'withholding'
    ],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'tresorerie-onglets',
          title: 'Three tabs',
          description:
            '"Accounts" to see your balances, "Internal transfers" to move money (a deposit of cheques at the bank, for example), "Withholding taxes" for the payments to the DGI.'
        },
        {
          target: 'tresorerie-comptes',
          title: 'Your accounts and their balance',
          description:
            'Each line is an account: cash desk, bank, Mobile Money… The "Balance" column comes from the agency\'s entries.'
        },
        {
          target: 'tresorerie-nouveau-compte',
          title: 'Create an account',
          description:
            'Choose the nature and the account number. The number and the nature can no longer be changed afterwards.'
        },
        {
          target: 'tresorerie-numerotation',
          title: 'The account number',
          description:
            'The number must start with the prefix of the chosen nature (cash desks 571, banks 52, Mobile Money 55, cheques 513, cards 515).'
        }
      ]
    }
  },
  {
    id: 'finance.tresorerie.comptes',
    kind: 'table',
    title: 'Treasury accounts',
    summary: "This table lists the accounts where the agency's money is held, with their nature, number and balance.",
    purpose:
      'Each account matches a real place: a cash desk, a bank account, a Mobile Money wallet, or cheques and card payments waiting to be cashed. The collection and payment forms offer these accounts.',
    howToRead: {
      columns: [
        {
          key: 'nature',
          label: 'Nature',
          description: 'Cash, Bank, Mobile Money, Checks to cash or Card payments to cash.'
        },
        {
          key: 'numero',
          label: 'Number',
          description: 'The account number in the chart of accounts.'
        },
        {
          key: 'libelle',
          label: 'Label',
          description: 'The name given to the account, for example "Cocody branch cash desk".'
        },
        {
          key: 'detail',
          label: 'Detail',
          description:
            'For a Mobile Money account, the operator; for a bank, the bank name and the account reference. A dash (—) otherwise.'
        },
        {
          key: 'defaut',
          label: 'Default',
          description: '"Yes" if it is the account offered first for this nature.'
        },
        {
          key: 'statut',
          label: 'Status',
          description: 'Active or Inactive. An inactive account is no longer offered in the forms.'
        },
        {
          key: 'solde',
          label: 'Balance',
          description: "The account's money in minus money out, in FCFA."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Edit" opens the account.'
        }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Active',
          description: 'The account can be used.'
        },
        {
          value: 'INACTIVE',
          label: 'Inactive',
          description: 'The account is no longer offered for new transactions; its history remains visible.'
        }
      ],
      notes: [
        'Filters: search (label, number, bank, operator), "Nature", "Status" and "Default account". The export covers the filtered list.'
      ]
    },
    steps: [
      {
        title: 'Create an account',
        detail: 'Click "New account".'
      },
      {
        title: 'Edit an account',
        detail: 'Click "Edit" on the account\'s line.'
      },
      {
        title: 'Search',
        detail: 'Use the search or the filters above the table.'
      }
    ],
    faq: [
      {
        q: 'How do I deactivate an account?',
        a: 'Click "Edit" and untick "Active account". The last active account of a nature cannot be deactivated.'
      },
      {
        q: 'What does "Default" mean?',
        a: 'It is the account used when no account is chosen, for example for the cash desk. There is only one per nature (and per operator for Mobile Money).'
      },
      {
        q: "Why is an account's balance zero?",
        a: 'No entry has touched this account yet.'
      }
    ],
    permissions: {
      note: 'Viewing requires "View third-party accounts". Creating and editing require "Configure the finance module".'
    },
    related: [
      {
        label: 'Create a treasury account',
        helpId: 'finance.tresorerie.compte-nouveau'
      },
      {
        label: 'Edit an account',
        helpId: 'finance.tresorerie.compte-modification'
      }
    ],
    keywords: ['accounts', 'balance', 'bank', 'cash desk', 'Mobile Money', 'Wave', 'Orange Money', 'MTN', 'Moov']
  },
  {
    id: 'finance.tresorerie.compte-nouveau',
    kind: 'section',
    title: 'New treasury account',
    summary:
      'This form creates an account where the agency receives or keeps money: cash desk, bank, Mobile Money, cheques or cards to be cashed.',
    purpose:
      'An account is linked to a number in the chart of accounts. It then appears in the collection, payment, transfer and cash session opening forms.',
    steps: [
      {
        title: 'Nature',
        detail: 'Choose Cash, Bank, Mobile Money, Checks to cash or Card payments to cash.'
      },
      {
        title: 'Label',
        detail: 'Give a clear name, for example "Cocody branch cash desk".'
      },
      {
        title: 'Account number',
        detail:
          'Digits only. It must start with 571 for a cash desk, 52 for a bank, 55 for Mobile Money, 513 for cheques and 515 for cards. An example is shown according to the chosen nature.'
      },
      {
        title: 'Details',
        detail:
          'Mobile Money: choose the operator (Orange Money, MTN MoMo, Moov Money, Wave, Other). Bank: enter the bank and the account reference, if you wish.'
      },
      {
        title: 'Default account',
        detail: 'Turn it on so that this account becomes the one offered first for its nature.'
      },
      {
        title: 'Create',
        detail: 'Click "Create".'
      }
    ],
    consequences: [
      'The number and the nature can no longer be changed.',
      'Two accounts cannot have the same number.',
      'If you make it the default, the previous default account of the same nature (and the same operator for Mobile Money) loses that status.',
      'Creation posts no entry: the balance starts at zero.'
    ],
    faq: [
      {
        q: 'The number is refused, why?',
        a: 'It does not match the chosen nature, or another account already has this number.'
      },
      {
        q: 'Can I correct a number entered by mistake?',
        a: 'No. Create a new account with the right number and deactivate the old one.'
      },
      {
        q: 'What are "Checks to cash" and "Card payments to cash" for?',
        a: 'They receive cheques and card payments before they reach the bank. An internal transfer then moves them to the "Bank" account.'
      }
    ],
    permissions: {
      note: 'Requires "Configure the finance module".'
    },
    related: [
      {
        label: 'Edit an account',
        helpId: 'finance.tresorerie.compte-modification'
      }
    ],
    keywords: ['new account', 'create an account', 'account number', 'SYSCOHADA', 'operator']
  },
  {
    id: 'finance.tresorerie.compte-modification',
    kind: 'section',
    title: 'Edit a treasury account',
    summary: "This window changes an account's label, its bank details, its default status or its activation.",
    purpose: 'The number and the nature of an account are displayed but frozen: they define its place in the accounts.',
    steps: [
      {
        title: 'Label',
        detail: 'Rename the account if needed.'
      },
      {
        title: 'Bank',
        detail: 'For a bank account: the bank and the account reference.'
      },
      {
        title: 'Default account',
        detail: 'Turn on to make it the account offered first for its nature.'
      },
      {
        title: 'Active account',
        detail: 'Untick to stop offering it in the forms.'
      },
      {
        title: 'Save',
        detail: 'Click "Save".'
      }
    ],
    consequences: [
      'Deactivating an account deletes neither its balance nor its history; it is simply no longer offered.',
      'The last active account of a nature cannot be deactivated.',
      'Making an account the default removes that status from the previous default account of the same nature.'
    ],
    faq: [
      {
        q: 'Why can I not deactivate this account?',
        a: 'It is the last active account of its nature: activate another one first.'
      },
      {
        q: "Can I change an account's nature?",
        a: 'No, the nature and the number cannot be changed.'
      },
      {
        q: 'What happens to an inactive account?',
        a: 'It stays in the list (filter "Status") with its balance, but is no longer offered for new transactions.'
      }
    ],
    permissions: {
      note: 'Requires "Configure the finance module".'
    },
    related: [
      {
        label: 'Treasury accounts',
        helpId: 'finance.tresorerie.comptes'
      }
    ],
    keywords: ['edit an account', 'deactivate', 'default account', 'rename']
  },
  {
    id: 'finance.tresorerie.virements',
    kind: 'table',
    title: 'Internal transfers',
    summary:
      'This table lists the movements of money between two accounts of the agency. An internal transfer does not change the result: the money stays within the agency.',
    purpose:
      'It is typically used to deposit cheques at the bank, pay the cash desk into the bank or top up a Mobile Money wallet.',
    howToRead: {
      columns: [
        {
          key: 'numero',
          label: 'Number',
          description: 'The transfer number, of the form VIR-year-sequence number.'
        },
        {
          key: 'de',
          label: 'From',
          description: 'The source account, where the money leaves.'
        },
        {
          key: 'vers',
          label: 'To',
          description: 'The destination account, where the money arrives.'
        },
        {
          key: 'montant',
          label: 'Amount',
          description: 'The amount moved, in FCFA.'
        },
        {
          key: 'date',
          label: 'Date',
          description: 'The date of the transfer.'
        },
        {
          key: 'statut',
          label: 'Status',
          description: 'Approved, or Cancelled.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Cancel" is offered on approved transfers.'
        }
      ],
      statuses: [
        {
          value: 'VALIDATED',
          label: 'Approved',
          description: 'The transfer is recorded and posted to the accounts.'
        },
        {
          value: 'VOIDED',
          label: 'Cancelled',
          description: 'The transfer was cancelled: the reverse entry has been posted. It stays visible.'
        }
      ],
      notes: [
        'Filters: search (reference, notes), "Status", "Date", "Account" (from or to) and "Amount". The export covers the filtered list.'
      ]
    },
    steps: [
      {
        title: 'New transfer',
        detail: 'Click "New transfer" (see the form\'s help).'
      },
      {
        title: 'Cancel',
        detail:
          'Click "Cancel" on the line, enter the reason (at least 3 characters) then confirm with "Cancel transfer".'
      }
    ],
    consequences: [
      'A transfer is posted as soon as it is created: the destination account goes up, the source account goes down.',
      'Cancelling posts the reverse entry, without erasing the transfer. It requires the "Validate financial documents" permission and a reason.'
    ],
    faq: [
      {
        q: 'Why is there no draft?',
        a: 'The transfer is recorded directly. In case of error, cancel it and redo it.'
      },
      {
        q: 'I do not see "Cancel".',
        a: 'Only approved transfers can be cancelled, and the "Validate financial documents" permission is needed.'
      },
      {
        q: 'How do I find all the transfers of an account?',
        a: 'Use the "Account" filter: it keeps the transfers leaving this account or arriving in it.'
      }
    ],
    permissions: {
      note: 'Viewing requires "View third-party accounts". Creating requires "Create financial documents". Cancelling requires "Validate financial documents".'
    },
    related: [
      {
        label: 'New internal transfer',
        helpId: 'finance.tresorerie.virement-nouveau'
      }
    ],
    keywords: ['transfer', 'cheque deposit', 'bank deposit', 'move money', 'top up']
  },
  {
    id: 'finance.tresorerie.virement-nouveau',
    kind: 'section',
    title: 'New internal transfer',
    summary: "This form moves money from one of the agency's accounts to another. The transfer is posted immediately.",
    purpose:
      'Use it to deposit cheques at the bank, pay cash from the cash desk into the bank or top up a Mobile Money account.',
    steps: [
      {
        title: 'Source account',
        detail: 'The account the money leaves. Only active accounts are offered.'
      },
      {
        title: 'Destination account',
        detail: 'The account that receives the money. It must be different from the source account.'
      },
      {
        title: 'Amount',
        detail: 'In FCFA, at least 1.'
      },
      {
        title: 'Date',
        detail: "Today's date is suggested."
      },
      {
        title: 'Reference and notes',
        detail: 'Optional: for example the number of the deposit slip.'
      },
      {
        title: 'Save',
        detail: 'Click "Save".'
      }
    ],
    consequences: [
      'The transfer receives a number of the form VIR-year-sequence number and its accounting entry is posted immediately.',
      'It is refused if the balance of the source account does not cover the amount.',
      'To correct it, you must cancel it, then enter a new one.'
    ],
    faq: [
      {
        q: '"Insufficient balance": what should I do?',
        a: 'First top up the source account (collection or transfer), or choose another account.'
      },
      {
        q: 'The same account as source and destination?',
        a: 'It is refused: the two accounts must be different.'
      },
      {
        q: 'Does an internal transfer change my result?',
        a: 'No: money moves from one account to another, with no income or expense.'
      }
    ],
    permissions: {
      note: 'Requires "Create financial documents".'
    },
    related: [
      {
        label: 'Internal transfers',
        helpId: 'finance.tresorerie.virements'
      }
    ],
    keywords: ['new transfer', 'source account', 'destination account', 'cheque deposit']
  },
  {
    id: 'finance.tresorerie.retenue',
    kind: 'section',
    title: 'Withholding tax',
    summary:
      'These three indicators show what was withheld at source on rents, what has already been paid over to the DGI and what remains to be paid over.',
    purpose:
      'When it is turned on for the agency, withholding tax is taken from the rents collected. The agency must then pay it over to the DGI.',
    howToRead: {
      notes: [
        'Collected: the total of the withholding taxes taken from rents.',
        'Remitted to the DGI: the total of approved remittances (cancelled remittances do not count).',
        'Due: Collected minus Remitted, never negative. It shows in red as long as something remains to be paid over.'
      ]
    },
    consequences: [
      "If withholding tax is turned off in the agency's financial settings, a message says so and no new remittance can be recorded."
    ],
    faq: [
      {
        q: 'Why is "Due" at zero?',
        a: 'Everything that was withheld has already been paid over, or nothing was withheld.'
      },
      {
        q: 'Where do I turn on withholding tax?',
        a: "In the agency's financial settings. This screen does not allow changing it."
      },
      {
        q: 'What happens to the "Remitted" amount if I cancel a remittance?',
        a: 'It goes down by the amount of the cancelled remittance, and the "Due" goes up by as much.'
      }
    ],
    permissions: {
      note: 'Requires "View third-party accounts".'
    },
    related: [
      {
        label: 'Remittances to the DGI',
        helpId: 'finance.tresorerie.versements'
      }
    ],
    keywords: ['withholding tax', 'DGI', 'tax', 'collected', 'remitted', 'due']
  },
  {
    id: 'finance.tresorerie.versements',
    kind: 'table',
    title: 'Remittances to the DGI',
    summary: 'This table lists the payments made to the DGI to pay over withholding taxes.',
    howToRead: {
      columns: [
        {
          key: 'numero',
          label: 'Number',
          description: 'The remittance number, of the form DGI-year-sequence number.'
        },
        {
          key: 'periode',
          label: 'Period',
          description: 'The period concerned, as you entered it (for example "September 2026").'
        },
        {
          key: 'montant',
          label: 'Amount',
          description: 'The amount paid, in FCFA.'
        },
        {
          key: 'date',
          label: 'Date',
          description: 'The date of the remittance.'
        },
        {
          key: 'compte',
          label: 'Account',
          description: 'The treasury account that paid.'
        },
        {
          key: 'statut',
          label: 'Status',
          description: 'Approved, or Cancelled.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Cancel" is offered on approved remittances.'
        }
      ],
      statuses: [
        {
          value: 'VALIDATED',
          label: 'Approved',
          description: 'The remittance is recorded and posted to the accounts.'
        },
        {
          value: 'VOIDED',
          label: 'Cancelled',
          description: 'The remittance was cancelled: the reverse entry has been posted.'
        }
      ],
      notes: ['Filters: search (number, period, account, reference), "Status", "Date" and "Account".']
    },
    steps: [
      {
        title: 'New remittance',
        detail:
          'Click "New remittance" (see the form\'s help). The button only appears if withholding tax is turned on.'
      },
      {
        title: 'Cancel',
        detail: 'Click "Cancel", enter the reason (at least 3 characters) then confirm with "Cancel remittance".'
      }
    ],
    consequences: [
      'A recorded remittance reduces the "Due" and the treasury of the paying account, with its accounting entry.',
      'Cancelling posts the reverse entry: the "Due" goes back up.'
    ],
    faq: [
      {
        q: 'I do not see "New remittance".',
        a: 'The button is only offered if withholding tax is turned on, and the "Create financial documents" permission is needed.'
      },
      {
        q: 'Can I pay more than the amount due?',
        a: 'No: a remittance that exceeds the "Due" is refused.'
      },
      {
        q: 'Why is the period free text?',
        a: 'It serves as a marker (for example "September 2026"); it is not checked.'
      }
    ],
    permissions: {
      note: 'Viewing requires "View third-party accounts". Creating requires "Create financial documents". Cancelling requires "Validate financial documents".'
    },
    related: [
      {
        label: 'Withholding tax',
        helpId: 'finance.tresorerie.retenue'
      },
      {
        label: 'New remittance to the DGI',
        helpId: 'finance.tresorerie.versement-nouveau'
      }
    ],
    keywords: ['DGI remittance', 'tax', 'withholding tax', 'pay over', 'return']
  },
  {
    id: 'finance.tresorerie.versement-nouveau',
    kind: 'section',
    title: 'New remittance to the DGI',
    summary: 'This form records the payment to the DGI of part or all of the withholding taxes collected.',
    purpose: 'It is used to record that the agency has paid the DGI, and to bring down the amount due.',
    steps: [
      {
        title: 'Period',
        detail: 'Enter the period concerned, for example "September 2026".'
      },
      {
        title: 'Amount',
        detail: 'In FCFA. It cannot exceed the "Due" amount.'
      },
      {
        title: 'Date',
        detail: "Today's date is suggested."
      },
      {
        title: 'Treasury account',
        detail: 'Choose the paying account (cash desk, bank, Mobile Money…).'
      },
      {
        title: 'Reference',
        detail: 'Optional: the reference of the receipt or transfer.'
      },
      {
        title: 'Save',
        detail: 'Click "Save".'
      }
    ],
    consequences: [
      'The remittance receives a number of the form DGI-year-sequence number. Its accounting entry is posted immediately: the amount due to the DGI goes down and the money leaves the paying account.',
      'It is refused if the amount exceeds the "Due" or if the balance of the chosen account does not cover it.',
      'To correct it, you must cancel it then enter a new one.'
    ],
    faq: [
      {
        q: '"The remittance exceeds the amount due": what should I do?',
        a: 'Reduce the amount: it cannot exceed what the "Due" indicator shows.'
      },
      {
        q: 'Which account should I choose?',
        a: 'The one the agency actually used to pay the DGI: bank, cash desk or Mobile Money.'
      },
      {
        q: 'Can I pay in several instalments?',
        a: 'Yes, as long as the total of approved remittances does not exceed the amount collected.'
      }
    ],
    permissions: {
      note: 'Requires "Create financial documents". Only available if withholding tax is turned on.'
    },
    related: [
      {
        label: 'Remittances to the DGI',
        helpId: 'finance.tresorerie.versements'
      }
    ],
    keywords: ['new remittance', 'pay the DGI', 'pay over the withholding', 'period']
  },
  {
    id: 'finance.validation.page',
    kind: 'page',
    title: 'Documents to approve',
    summary:
      'Find here every document that has been entered but not yet approved: supplier invoices, supplier payments and cash vouchers. You approve them one by one or in a batch.',
    purpose:
      'In the agency, one person enters and another approves: entering and approving are two separate steps. This screen is the one used by the person who approves. Each line shows who entered the document, so that you can filter by who entered it.\n\nAn empty queue is good news: everything is up to date.',
    steps: [
      {
        title: 'Filter',
        detail:
          'Use "Entered by" to see only one person\'s documents, "Nature" for one type of document, as well as the search, the amount and the entry date.'
      },
      {
        title: 'Approve a document',
        detail: 'Click "Approve" on the line, read the warning and confirm.'
      },
      {
        title: 'Approve several documents',
        detail: 'Tick the documents, then click "Approve the selection" and confirm.'
      },
      {
        title: 'Delete a draft',
        detail: 'For a cash voucher only: "Delete", then confirm.'
      }
    ],
    consequences: [
      'Approving is final: once approved, a document can no longer be changed. To correct it, it must be cancelled by a linked document.',
      'Approving a cash voucher numbers it, records the expense in the accounts and adds it to the cost of the construction site.',
      'Batch approval runs the approval of each document separately: some can succeed and others fail. A report details both.',
      'Deleting only applies to a cash voucher draft: it has no number and no entry, and leaves no trace.'
    ],
    faq: [
      {
        q: 'Why does a document stay in the queue after an attempt?',
        a: 'Its approval was refused, for example because the construction site is closed. The report or the error message gives the reason.'
      },
      {
        q: 'Why can I delete a cash voucher but not an invoice?',
        a: 'Only cash vouchers can be deleted from this screen.'
      },
      {
        q: 'Does the selection cover all the pages?',
        a: 'No, only the page displayed. It is cleared when you change page or filter.'
      },
      {
        q: 'The queue is empty, is that normal?',
        a: 'Yes: no document is waiting for approval.'
      }
    ],
    permissions: {
      note: 'Requires "Validate financial documents". Deleting a cash voucher draft requires "Create financial documents".'
    },
    related: [
      {
        label: 'Table of documents to approve',
        helpId: 'finance.validation.tableau'
      },
      {
        label: 'Batch approval',
        helpId: 'finance.validation.lot'
      },
      {
        label: 'Cash voucher',
        to: '/tenant/:tenantId/finance/pieces-de-caisse'
      },
      {
        label: 'Import',
        to: '/tenant/:tenantId/finance/importation'
      }
    ],
    keywords: [
      'approve',
      'validate',
      'validation',
      'approval queue',
      'pending documents',
      'draft',
      'supplier invoice',
      'supplier payment',
      'cash voucher'
    ]
  },
  {
    id: 'finance.validation.indicateurs',
    kind: 'section',
    title: 'Pending documents by nature',
    summary:
      'These three counters show how many documents are waiting for approval: supplier invoices, supplier payments and cash vouchers.',
    howToRead: {
      notes: [
        'The counters follow the "Entered by" filter: if you choose a person, they count that person\'s documents only.',
        'They do not follow the "Nature" filter: choosing a nature does not set them to zero.',
        'They only appear if at least one document is still pending.'
      ]
    },
    faq: [
      {
        q: 'What does each counter mean?',
        a: 'The number of documents of this nature that are still waiting for approval.'
      },
      {
        q: 'Why did these counters disappear?',
        a: 'The queue is empty: everything is approved.'
      },
      {
        q: 'Are the counters clickable?',
        a: 'No. Use the "Nature" filter to narrow the list.'
      }
    ],
    related: [
      {
        label: 'Table of documents to approve',
        helpId: 'finance.validation.tableau'
      }
    ],
    keywords: ['counters', 'pending documents', 'invoices', 'payments', 'cash vouchers']
  },
  {
    id: 'finance.validation.tableau',
    kind: 'table',
    title: 'Table of documents to approve',
    summary:
      'Each line is an entered document waiting for approval, with its nature, its amount and the person who entered it.',
    howToRead: {
      columns: [
        {
          key: 'selection',
          label: 'Selection',
          description: 'The tick box is used to approve several documents at once. The header box ticks the whole page.'
        },
        {
          key: 'nature',
          label: 'Nature',
          description: 'Supplier invoice, Supplier payment or Cash voucher.'
        },
        {
          key: 'piece',
          label: 'Document',
          description: 'The label of the document: invoice or voucher, with the supplier or the payee.'
        },
        {
          key: 'montant',
          label: 'Amount',
          description: 'The amount of the document, in FCFA.'
        },
        {
          key: 'date',
          label: 'Entered on',
          description: 'The date the document was entered.'
        },
        {
          key: 'saisisseur',
          label: 'Entered by',
          description: 'The person who entered the document.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Approve", and "Delete" for a cash voucher.'
        }
      ],
      notes: [
        'Filters: search (document, who entered it), "Entered by", "Nature", "Amount" and "Entered from… to…". The list is split into pages of 20.'
      ]
    },
    steps: [
      {
        title: 'Approve a document',
        detail: 'Click "Approve", then confirm.'
      },
      {
        title: 'Delete',
        detail: 'For a cash voucher only: click "Delete" and confirm.'
      }
    ],
    consequences: [
      'Approval is irreversible: the document can no longer be changed.',
      'Deleting leaves no trace: the draft had no number and no entry.'
    ],
    faq: [
      {
        q: "How do I see a specific person's documents?",
        a: 'Choose them in the "Entered by" filter.'
      },
      {
        q: 'Where do I edit a document before approving it?',
        a: 'This screen does not let you edit a document: you can only approve it or, for a cash voucher, delete it.'
      },
      {
        q: 'What happens if approval fails?',
        a: 'A message gives the reason and the document stays in the queue.'
      }
    ],
    permissions: {
      note: 'Requires "Validate financial documents".'
    },
    related: [
      {
        label: 'Batch approval',
        helpId: 'finance.validation.lot'
      }
    ],
    keywords: ['approve', 'entered by', 'drafts', 'pending documents']
  },
  {
    id: 'finance.validation.lot',
    kind: 'section',
    title: 'Batch approval',
    summary:
      'As soon as you tick at least one document, this banner shows how many and the "Approve the selection" button.',
    purpose:
      'Batch approval is a shortcut: it runs, document by document, the same approval as the "Approve" button of a line.',
    steps: [
      {
        title: 'Tick',
        detail: 'Tick the documents you want, or use the header box for the whole page.'
      },
      {
        title: 'Approve the selection',
        detail: 'Click "Approve the selection".'
      },
      {
        title: 'Confirm',
        detail: 'Read the irreversibility warning and confirm.'
      },
      {
        title: 'Read the report',
        detail: 'It lists the approved documents and those that failed, with the reason.'
      }
    ],
    consequences: [
      'Each document is approved separately: a failure does not prevent the others.',
      'Approved documents can no longer be changed; to correct them, they must be cancelled one by one.'
    ],
    faq: [
      {
        q: 'Why did the banner disappear?',
        a: 'The selection is cleared as soon as you change page, page size or filter.'
      },
      {
        q: 'Can I select documents across several pages?',
        a: 'No: the selection applies to the page displayed.'
      },
      {
        q: 'What should I do with the documents that failed?',
        a: 'Read the reason in the report, fix the cause, then approve them again.'
      }
    ],
    permissions: {
      note: 'Requires "Validate financial documents".'
    },
    related: [
      {
        label: 'Bulk approval report',
        helpId: 'finance.validation.compte-rendu'
      }
    ],
    keywords: ['approve the selection', 'bulk approval', 'tick', 'several documents']
  },
  {
    id: 'finance.validation.compte-rendu',
    kind: 'section',
    title: 'Bulk approval report',
    summary:
      'After a batch approval, this box says how many documents were approved, which ones, and why the others failed.',
    steps: [
      {
        title: 'Read the summary',
        detail: 'The number of approved documents and, if any, the number of failures.'
      },
      {
        title: 'Check the failures',
        detail: 'Each failed document is listed in red with the reason given by the server.'
      },
      {
        title: 'Close',
        detail: 'Click "Close" when you have taken note.'
      }
    ],
    consequences: [
      'The documents listed as approved are final and have left the queue.',
      'The documents that failed stay in the queue, unchanged.'
    ],
    faq: [
      {
        q: 'Does the report disappear by itself?',
        a: 'No, it stays until you click "Close" or leave the screen.'
      },
      {
        q: 'Does a failure mean nothing was recorded for that document?',
        a: 'The document stays in the queue, so it is not approved.'
      },
      {
        q: 'Can I find this report again later?',
        a: 'No, note the failures before closing it.'
      }
    ],
    related: [
      {
        label: 'Batch approval',
        helpId: 'finance.validation.lot'
      }
    ],
    keywords: ['report', 'failure', 'bulk approval', 'summary']
  },
  {
    id: 'finance.importation.page',
    kind: 'page',
    title: 'Import',
    summary:
      'Take over a follow-up kept in Excel by importing it into the Finance module, in five steps. Documents are entered as drafts, never approved.',
    purpose:
      'Importing saves you from retyping an Excel workbook by hand: cash vouchers, supplier invoices, purchase orders, wage notes, subcontractor positions, stock receipts and issues, land lease rent accruals.\n\nThe file is read on your computer and is never sent: only the lines you confirm go through, one by one.',
    steps: [
      {
        title: 'The document',
        detail: 'Choose the "Document type", the construction site if asked, and the "Default date", then "Continue".'
      },
      {
        title: 'The file',
        detail: 'Drop the Excel workbook (.xlsx or .xlsm) or click to choose it.'
      },
      {
        title: 'The columns',
        detail: 'For each column of the file, say which document field it fills, then click "Preview".'
      },
      {
        title: 'The preview',
        detail: 'Correct the cells, untick the lines not to import, then click "Import N line(s)".'
      },
      {
        title: 'The import',
        detail: 'Follow the progress, then read the report: lines entered, refused, unticked or in error.'
      }
    ],
    consequences: [
      'Documents are entered as drafts, never approved: they are then approved from "Documents to approve" when their nature goes through it. Stock receipts and issues and land lease rent accruals are recorded as from their usual screen.',
      'Lines in error are not sent. Neither is an unticked line.',
      'A probable duplicate is not blocked: if it stays ticked, it is imported.',
      'A refusal by the server on one line does not stop the following lines.'
    ],
    faq: [
      {
        q: 'Is my file sent over the Internet?',
        a: 'No. It is read in your browser; only the confirmed lines are recorded.'
      },
      {
        q: 'Which file format is accepted?',
        a: 'An Excel workbook (.xlsx or .xlsm). Another format is not read.'
      },
      {
        q: 'What should I do if a line is refused?',
        a: 'Read the reason in the report, then go back to the preview, correct the line and run it again. First untick the lines already entered.'
      },
      {
        q: 'How do I avoid duplicates?',
        a: 'The preview flags lines that look like documents already entered. For the cash voucher, this check is not possible: check yourself.'
      }
    ],
    permissions: {
      note: 'Importing documents requires the "Create financial documents" permission.'
    },
    related: [
      {
        label: 'Choose the document',
        helpId: 'finance.importation.document'
      },
      {
        label: 'Documents to approve',
        to: '/tenant/:tenantId/finance/validation'
      }
    ],
    keywords: ['import', 'Excel', 'workbook', 'xlsx', 'data migration', 'file'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'importation-etapes',
          title: 'Five steps',
          description:
            'The document, the file, the columns, the preview, then the import. You can go back before importing.'
        },
        {
          target: 'importation-type',
          title: 'What does your file contain?',
          description:
            'Choose the document type. A description is shown, and the construction site is asked for when needed.'
        },
        {
          target: 'importation-continuer',
          title: 'Continue',
          description: 'The button turns on when the document, the construction site if any and the date are ready.'
        }
      ]
    }
  },
  {
    id: 'finance.importation.document',
    kind: 'section',
    title: 'Step 1: the document',
    summary:
      'This first step says what your file contains: the document type, the construction site and the date to use when a line has none.',
    purpose: 'The document type decides which fields to recognise in your file and what will be created at import.',
    steps: [
      {
        title: 'Document type',
        detail:
          'Choose from: Cash voucher, Supplier invoice, Purchase order, Wage note, Subcontractor position, Stock receipt, Stock issue, Land lease rent accrual. A description is shown.'
      },
      {
        title: 'Construction site',
        detail:
          'Required for a cash voucher, a supplier invoice, a purchase order or a stock issue; optional for a wage note; not shown for the other types.'
      },
      {
        title: 'Default date',
        detail: 'It is used for lines whose file has no date. Today by default.'
      },
      {
        title: 'Continue',
        detail: 'The "Continue" button turns on when everything is ready.'
      }
    ],
    consequences: [
      'Changing the document type clears the file, the columns and the preview already prepared.',
      'The reference lists (construction sites, cost lines, suppliers…) are loaded as soon as you choose the type; if that fails, a "Try again" button appears.'
    ],
    faq: [
      {
        q: 'Why is "Continue" greyed out?',
        a: 'No type is chosen, or a required construction site is missing, or the reference lists are still loading.'
      },
      {
        q: 'What is the default date for?',
        a: 'To date the lines that have no date in your file.'
      },
      {
        q: 'Where do I find my document type?',
        a: 'Type a few letters in the list: it is searchable.'
      }
    ],
    related: [
      {
        label: 'Import overview',
        helpId: 'finance.importation.page'
      }
    ],
    keywords: ['document type', 'construction site', 'default date', 'nature', 'step 1']
  },
  {
    id: 'finance.importation.fichier',
    kind: 'section',
    title: 'Step 2: the file',
    summary: 'Drop here the Excel workbook to import. It is read on your computer and is never sent.',
    steps: [
      {
        title: 'Drop the file',
        detail: 'Drag the workbook into the area, or click it to choose. Formats: .xlsx and .xlsm.'
      },
      {
        title: 'Wait for reading',
        detail: '"Reading the workbook…" is displayed, then you move on to the columns step.'
      },
      {
        title: 'Change your mind',
        detail: '"Back to the document" takes you back to the first step.'
      }
    ],
    consequences: [
      'The file stays on your computer: it is read in the browser.',
      'A workbook with no readable line, or an unreadable file, is refused with a message.'
    ],
    faq: [
      {
        q: 'My file is refused.',
        a: 'It must be an Excel workbook (.xlsx) with at least one data line under a header line.'
      },
      {
        q: 'Which sheet is read?',
        a: 'The next step shows the name of the sheet read and the number of lines found.'
      },
      {
        q: 'Can I drop another file afterwards?',
        a: 'Yes: "Change the file" at the columns step.'
      }
    ],
    related: [
      {
        label: 'Step 3: the columns',
        helpId: 'finance.importation.colonnes'
      }
    ],
    keywords: ['drop', 'excel file', 'xlsx', 'step 2']
  },
  {
    id: 'finance.importation.colonnes',
    kind: 'table',
    title: 'Step 3: the columns',
    summary:
      'This table matches each column of your file to a document field. The screen already suggests a choice based on the headers; check it.',
    howToRead: {
      columns: [
        {
          key: 'entete',
          label: 'File column',
          description: 'The column header, as it appears in your file.'
        },
        {
          key: 'exemple',
          label: 'Example',
          description: 'The value of the first data line, to recognise the column.'
        },
        {
          key: 'champ',
          label: 'Document field',
          description: 'The field filled by this column. An asterisk (*) marks a required field.'
        }
      ],
      notes: [
        'At the top: the file name, the sheet read and the number of lines found.',
        'A field can only be used once: choosing it elsewhere frees it from its previous column.'
      ]
    },
    steps: [
      {
        title: 'Check the suggestions',
        detail: 'Correct the wrong ones with the list on each line.'
      },
      {
        title: 'Ignore a column',
        detail: 'Choose "Do not import this column".'
      },
      {
        title: 'Preview',
        detail: 'Click "Preview". The button stays greyed out as long as a required field is not matched.'
      }
    ],
    consequences: ['Nothing is recorded at this step.', 'Required fields not matched are listed in a yellow warning.'],
    faq: [
      {
        q: 'Why is "Preview" greyed out?',
        a: 'A required field (*) is not matched to any column, or the file has no line.'
      },
      {
        q: 'A column was not recognised.',
        a: "Choose its field yourself in the line's list."
      },
      {
        q: 'Can I change the file?',
        a: 'Yes: "Change the file".'
      }
    ],
    related: [
      {
        label: 'Step 4: the preview',
        helpId: 'finance.importation.apercu'
      }
    ],
    keywords: ['columns', 'column matching', 'fields', 'headers', 'step 3']
  },
  {
    id: 'finance.importation.apercu',
    kind: 'table',
    title: 'Step 4: the preview',
    summary:
      'The preview shows each line as it will be imported. Correct the cells in error, untick what you do not want to import, then start the import.',
    howToRead: {
      columns: [
        {
          key: 'selection',
          label: 'Selection',
          description: 'When ticked, the line is imported. The header box ticks or unticks everything.'
        },
        {
          key: 'numero',
          label: 'Line',
          description: 'The line number in your file.'
        },
        {
          key: 'etat',
          label: 'Status',
          description: 'The line\'s errors, "Possible duplicate", or "Ready".'
        }
      ],
      notes: [
        'Possible statuses: "Ready" (the line will be imported if ticked), "Possible duplicate" (a similar document already exists; the line is still sent if it stays ticked) or the error reason written in red (the line is not sent until corrected).',
        'The other columns are the document fields (required ones marked with a *); each cell is a field you can correct. 25 lines per page.',
        'The message at the top sums up: lines ready, in error and probable duplicates.'
      ]
    },
    steps: [
      {
        title: 'Correct',
        detail: 'Edit the cells in error directly: the status updates at each keystroke.'
      },
      {
        title: 'Untick',
        detail: 'Untick the lines not to import.'
      },
      {
        title: 'Import',
        detail: 'Click "Import N line(s)". The button is greyed out if there is no line to send.'
      },
      {
        title: 'Go back',
        detail: '"Back to the columns" to change the matching.'
      }
    ],
    consequences: [
      'Nothing is recorded before you click "Import".',
      'Lines in error are not sent; unticked lines are not either.',
      'For the cash voucher, duplicates cannot be flagged: a warning says so.',
      'If the list of documents already entered could not be read, a warning states that duplicates will not be flagged.'
    ],
    faq: [
      {
        q: 'What should I do with a possible duplicate?',
        a: 'Check: if the document already exists, untick the line. Two identical expenses on the same day also exist: in that case leave it ticked.'
      },
      {
        q: 'Why is "Import" greyed out?',
        a: 'No ticked line without error is left to send.'
      },
      {
        q: 'Is my correction kept if I go back to the columns?',
        a: 'Going back to the columns then previewing again rebuilds the preview from the file: redo your corrections then.'
      }
    ],
    related: [
      {
        label: 'Step 5: report',
        helpId: 'finance.importation.compte-rendu'
      }
    ],
    keywords: ['preview', 'duplicate', 'error', 'correct', 'step 4']
  },
  {
    id: 'finance.importation.compte-rendu',
    kind: 'section',
    title: 'Step 5: the report',
    summary: 'After the import, this summary says how many lines were entered, refused, unticked or left in error.',
    howToRead: {
      notes: [
        'Documents entered as drafts: the number of lines recorded.',
        'Lines refused by the server: those that recording rejected; they are detailed in the next table.',
        'Unticked lines: those you chose not to import.',
        'Lines in error, not sent: those that stayed in error in the preview.'
      ]
    },
    steps: [
      {
        title: 'Follow the progress',
        detail: 'A bar shows "Entry in progress: N of total".'
      },
      {
        title: 'Read the summary',
        detail: 'The four counters above.'
      },
      {
        title: 'Approve the documents',
        detail:
          'Documents created as drafts are approved from "Documents to approve", where their nature goes through it.'
      },
      {
        title: 'Start again',
        detail: '"Import another file", or "Back to the preview" if some lines were refused or in error.'
      }
    ],
    consequences: [
      'The entered lines are recorded: running the import again with the same lines ticked may create duplicates.',
      'Before going back to the preview to rerun refused lines, untick the lines already entered.'
    ],
    faq: [
      {
        q: 'The total does not match the number of lines in my file.',
        a: 'Unticked lines and lines in error are not sent. If the import stopped before the end, check what was recorded before running it again.'
      },
      {
        q: 'Where do I find my imported documents?',
        a: 'Financial documents entered as drafts are in "Documents to approve".'
      },
      {
        q: 'Is a refused line lost?',
        a: 'No: it stays in the preview. Correct it, untick the others, then run it again.'
      }
    ],
    related: [
      {
        label: 'Refused lines',
        helpId: 'finance.importation.refus'
      },
      {
        label: 'Documents to approve',
        to: '/tenant/:tenantId/finance/validation'
      }
    ],
    keywords: ['report', 'import result', 'lines entered', 'draft', 'step 5']
  },
  {
    id: 'finance.importation.refus',
    kind: 'table',
    title: 'Lines refused by the server',
    summary:
      'This table only appears if some lines were refused at recording. It gives, for each one, the reason stated.',
    howToRead: {
      columns: [
        {
          key: 'numero',
          label: 'Line',
          description: 'The line number in your file.'
        },
        {
          key: 'motif',
          label: 'Reason given by the server',
          description: 'The reason for the refusal: an invalid field, a business rule, a missing permission…'
        }
      ]
    },
    steps: [
      {
        title: 'Read the reason',
        detail: 'Understand the cause: incorrect data, unknown item, closed construction site…'
      },
      {
        title: 'Correct',
        detail: '"Back to the preview", correct the line and untick the lines already entered.'
      },
      {
        title: 'Run again',
        detail: 'Click "Import N line(s)" again.'
      }
    ],
    faq: [
      {
        q: 'Was a refused line created anyway?',
        a: "Normally no, the refusal means recording did not take place. If the message says the server's reply did not arrive, check before running it again."
      },
      {
        q: 'Can I fix the cause outside the import?',
        a: 'Yes, for example by creating the missing item, then resuming the import.'
      },
      {
        q: 'Why do several lines have the same reason?',
        a: 'They probably have the same data to correct.'
      }
    ],
    related: [
      {
        label: 'The report',
        helpId: 'finance.importation.compte-rendu'
      }
    ],
    keywords: ['refused lines', 'reason', 'server error', 'refusal']
  }
];

export default entries;
