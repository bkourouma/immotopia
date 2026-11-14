import type { HelpEntry } from '../../../types';

/** Zone « facturation » du module finance (en). */
const entries: HelpEntry[] = [
  // Monthly billing
  {
    id: 'finance.facturation.page',
    kind: 'page',
    title: 'Monthly billing',
    summary:
      'Run the billing for a month for all your active leases in one go, then read the report: what was billed, what was excluded and why.',
    purpose:
      "Every month the agency must create the rent installment of each lease. This screen does it for all leases at once instead of lease by lease. Each installment created immediately appears in the tenant's account (Client balance) and in the rental installments.",
    steps: [
      {
        title: 'Choose the period',
        detail:
          "Select the month and the year. A label is suggested (for example “Loyer d'octobre 2026”); you can change it."
      },
      {
        title: 'Run the campaign',
        detail:
          'Click “Start the run”, then confirm. If the period has already been billed, the button is called “Re-run the campaign”.'
      },
      {
        title: 'Read the report',
        detail:
          'Three tabs: “Leases billed”, “Leases excluded” (with the reason for each exclusion) and “Advances offset”.'
      },
      {
        title: 'Find an earlier campaign',
        detail: 'In “Run history”, click “View the report” to reopen the result of a past month.'
      }
    ],
    consequences: [
      "For each active lease concerned by the period, a rent installment is created with the lease's rent and charges. It is “To pay”, or “Overdue” if its due date has already passed.",
      "The billed amount is recorded in the tenant's account: it increases what the tenant owes and shows up in the Client balance.",
      'If the tenant has already paid in advance (a payment not yet assigned to an installment), it is applied automatically to the new installment, from the oldest payment to the most recent.',
      "If the property is attached to an association, each partner's share is calculated at the same time on the billed amount (see “Partnerships”).",
      'Running a period again creates no duplicates: leases already billed simply appear in “Leases excluded”. An installment prepared as a draft from the lease is issued (billed) instead of being excluded.',
      'The campaign sends no e-mail, no SMS and no document to tenants. This screen does not offer a way to cancel a campaign.'
    ],
    faq: [
      {
        q: 'Which leases are billed?',
        a: 'Only “Active” leases. A suspended, draft, ended or cancelled lease appears in “Leases excluded” with the reason “The lease is not active”.'
      },
      {
        q: 'Can I safely run a period that has already been billed?',
        a: 'Yes. No installment is created twice: leases already up to date are listed in the exclusions, and only leases that have become eligible since are billed.'
      },
      {
        q: 'Why is a quarterly or annual lease excluded?',
        a: 'A lease is billed only in the months of its rhythm (monthly, quarterly, half-yearly or annual), counted from its start. In other months it appears with the reason “The lease is not billed for this month”.'
      },
      {
        q: 'Which amount and which due date are used?',
        a: 'The rent and charges in force for that period (a rent revision does not apply to earlier months). The due date is the due day set on the lease, the 5th if none is set.'
      },
      {
        q: 'I cannot see this screen. Why?',
        a: 'It belongs to the Rental management pack. You also need the right “View financial reports” to view it, and “Create financial documents” to run a campaign.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'RENTAL',
      note: 'Viewing the history and reports requires “View financial reports”; running or re-running a campaign requires “Create financial documents”.'
    },
    related: [
      { label: 'Run the monthly billing', helpId: 'finance.facturation.lancer' },
      { label: 'Read the report', helpId: 'finance.facturation.compte-rendu' },
      { label: 'Client balance', helpId: 'finance.balance-clients.page' },
      { label: 'Rent installments', to: '/tenant/:tenantId/rental/installments' }
    ],
    keywords: ['billing', 'invoice rents', 'campaign', 'monthly rent', 'installments', 'rent call', 'active leases'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'facturation-periode',
          title: 'Choose the period',
          description:
            'Enter the month and year to bill. The label updates by itself as long as you have not edited it.'
        },
        {
          target: 'facturation-lancer',
          title: 'Run the campaign',
          description:
            'One click creates the installment of every active lease. Running an already billed period again creates no duplicates.'
        },
        {
          target: 'facturation-historique',
          title: 'Find past campaigns',
          description: 'Each billed month keeps its report: open it with “View the report”.'
        }
      ]
    }
  },
  {
    id: 'finance.facturation.lancer',
    kind: 'section',
    title: 'Run the monthly billing',
    summary:
      'Choose the month, year and label, then run the campaign. It creates the installment of each active lease concerned.',
    purpose:
      'Only one campaign exists per month and per agency: running the same month again resumes the same campaign.',
    steps: [
      {
        title: 'Month and year',
        detail: 'The current month and year are preselected. The year can be last year, this year or next year.'
      },
      {
        title: 'Label',
        detail:
          '“Loyer de septembre 2026” is suggested and follows your choice of period, as long as you have not edited it by hand.'
      },
      {
        title: 'Confirm',
        detail: 'The confirmation window recalls what is about to happen. Click “Run” (or “Re-run”).'
      }
    ],
    consequences: [
      'These are excluded, each with its reason: leases that are not active, those whose period is outside their term, those not billed that month, those already billed and those with no amount at all (no rent and no charges).',
      'At the end, a message gives the number of leases billed and excluded, and the report opens under the form.',
      'The campaign sends nothing to tenants.'
    ],
    faq: [
      {
        q: 'What happens to a campaign I run again?',
        a: 'The same campaign resumes: its label may be updated and its report is redone. Installments already created do not change.'
      },
      {
        q: 'Can I bill a future month?',
        a: 'The screen accepts next year. The installments are then created with an upcoming due date.'
      },
      {
        q: 'Is a lease with charges but no rent billed?',
        a: 'Yes: the exclusion “The lease carries no amount” only targets leases whose total (rent and charges) is zero.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'RENTAL',
      note: 'Running a campaign requires “Create financial documents”.'
    },
    related: [
      { label: 'Billing overview', helpId: 'finance.facturation.page' },
      { label: 'Read the report', helpId: 'finance.facturation.compte-rendu' }
    ],
    keywords: ['run', 're-run', 'campaign', 'month', 'label', 'period']
  },
  {
    id: 'finance.facturation.compte-rendu',
    kind: 'section',
    title: 'Campaign report',
    summary:
      'The result of a campaign: how many leases were billed, how many were excluded, how many advances were applied, with details in three tabs.',
    purpose:
      'The report is a record: the tenant and property names are kept as they were when the campaign ran, even if the lease has since been closed.',
    howToRead: {
      statuses: [
        {
          value: 'RUNNING',
          label: 'In progress',
          description: 'The campaign is running.'
        },
        {
          value: 'DONE',
          label: 'Run',
          description: 'The campaign is finished and its report is complete.'
        },
        {
          value: 'FAILED',
          label: 'Failed',
          description:
            'The campaign stopped before the end. Run the same period again: no lease already billed will be billed twice.'
        }
      ],
      notes: [
        '“Leases billed”: number of leases for which an installment was created or issued.',
        '“Leases excluded”: leases not billed, each with its reason.',
        '“Advances offset”: number of advance applications to the new installments (one tenant may have several).'
      ]
    },
    faq: [
      {
        q: 'How do I reopen the report of another month?',
        a: 'In “Run history”, click “View the report”: the page address keeps the campaign open, so you can share it.'
      },
      {
        q: 'Should an excluded lease worry me?',
        a: 'Not necessarily: a campaign with no exclusion is rare. Read the reason: suspended lease, outside its term, quarterly rhythm or already billed are normal cases.'
      },
      {
        q: 'Do the figures at the top change with the table search?',
        a: 'No. They count all the lines of the campaign; the search only filters the table displayed.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Requires “View financial reports”.'
    },
    related: [
      { label: 'Leases billed', helpId: 'finance.facturation.factures' },
      { label: 'Leases excluded', helpId: 'finance.facturation.exclus' },
      { label: 'Advances applied', helpId: 'finance.facturation.avances' }
    ],
    keywords: ['report', 'result', 'summary', 'indicators']
  },
  {
    id: 'finance.facturation.factures',
    kind: 'table',
    title: 'Leases billed',
    summary: 'The leases for which the campaign created (or issued) an installment, with the amount billed.',
    howToRead: {
      columns: [
        {
          key: 'bail',
          label: 'Lease',
          description: 'The tenant and the property, for example “Fatoumata Kouassi — Villa Angré 12”.'
        },
        {
          key: 'montant',
          label: 'Amount invoiced',
          description:
            'The rent plus the charges of the period, in FCFA. It does not take applied advances into account: these appear in the “Advances offset” tab.'
        }
      ],
      notes: ['You can search for a tenant or a property, filter by amount and export the list.']
    },
    faq: [
      {
        q: 'Why is a lease I expected not here?',
        a: 'Look at the “Leases excluded” tab: it gives the reason.'
      },
      {
        q: 'Where can I see whether the tenant has already paid?',
        a: 'In the Client balance or in the rental installments: this table only shows what was billed.'
      },
      {
        q: 'Can this table be exported?',
        a: "Yes, with the table's export button: the whole list is exported, not just the page displayed."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires “View financial reports”.' },
    related: [{ label: 'Campaign report', helpId: 'finance.facturation.compte-rendu' }],
    keywords: ['leases billed', 'installments created', 'amount billed']
  },
  {
    id: 'finance.facturation.exclus',
    kind: 'table',
    title: 'Leases excluded',
    summary:
      'The leases the campaign did not bill, with the reason for each exclusion. No lease is set aside without an explanation.',
    howToRead: {
      columns: [
        {
          key: 'bail',
          label: 'Lease',
          description: 'The tenant and property concerned.'
        },
        {
          key: 'motif',
          label: 'Reason',
          description: 'The reason why the lease was not billed that month.'
        }
      ],
      statuses: [
        {
          value: 'PERIOD_BEFORE_LEASE_START',
          label: 'The period is before the lease starts',
          description: "The chosen month is earlier than the lease's start month."
        },
        {
          value: 'PERIOD_AFTER_LEASE_END',
          label: 'The period is after the lease ends',
          description: "The month starts after the lease's end date, or fits only on the lease's last day."
        },
        {
          value: 'PERIOD_OFF_BILLING_CYCLE',
          label: 'The lease is not billed for this month',
          description: 'The lease is quarterly, half-yearly or annual and this month is not a billing month.'
        },
        {
          value: 'LEASE_NOT_ACTIVE',
          label: 'The lease is not active',
          description: 'The lease is a draft, suspended, ended or cancelled.'
        },
        {
          value: 'INSTALLMENT_ALREADY_EXISTS',
          label: 'An instalment already exists for this period',
          description: 'The lease has already been billed for this month, by a previous campaign or by hand.'
        },
        {
          value: 'LEASE_WITHOUT_AMOUNT',
          label: 'The lease carries no amount',
          description: 'Neither rent nor charges are entered on the lease for this period.'
        }
      ],
      notes: ['The “Reason” filter lets you see only one category of exclusions.']
    },
    faq: [
      {
        q: 'What should I do about a lease excluded because it is not active?',
        a: 'Nothing if that is intended. Otherwise, open the lease and fix its status, then run the period again: it will be billed.'
      },
      {
        q: 'What should I do about a lease “without amount”?',
        a: 'Enter the rent (or the charges) on the lease, then run the period again.'
      },
      {
        q: 'Why do I see many leases “already billed” after a re-run?',
        a: 'That is normal: the re-run recognises them and does not bill them again.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires “View financial reports”.' },
    related: [{ label: 'Run the monthly billing', helpId: 'finance.facturation.lancer' }],
    keywords: ['exclusion', 'reason', 'lease not billed', 'suspended lease', 'already billed']
  },
  {
    id: 'finance.facturation.avances',
    kind: 'table',
    title: 'Advances applied',
    summary: "Tenants' advance payments that were used to immediately settle the installments created by the campaign.",
    purpose:
      'A tenant may have paid before the billing. The campaign takes that payment, from the oldest to the most recent, and assigns it to the new installment, without you having to do anything.',
    howToRead: {
      columns: [
        { key: 'client', label: 'Client', description: 'The tenant whose advance was used.' },
        {
          key: 'montant',
          label: 'Amount allocated',
          description:
            'The part of the advance assigned to the installment. An advance larger than the installment is only partly used; the rest stays available for the next one.'
        }
      ],
      notes: [
        'A security deposit is never treated as an advance.',
        "Applying an advance does not change the tenant's balance: the money was already credited to the account. Only the statement shows that it settled this installment."
      ]
    },
    faq: [
      {
        q: 'Is the installment then paid?',
        a: 'Yes if the advance covers the whole amount, otherwise it is partly paid and the rest is still to be settled.'
      },
      {
        q: 'Why is this table empty?',
        a: 'No tenant concerned had an unassigned payment. This is the most common case.'
      },
      {
        q: 'Where can I see the detail for a tenant?',
        a: 'In their statement, reachable from the Client balance with “View the statement”.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires “View financial reports”.' },
    related: [{ label: 'Client balance', helpId: 'finance.balance-clients.page' }],
    keywords: ['advance', 'overpayment', 'prepayment', 'application']
  },
  {
    id: 'finance.facturation.historique',
    kind: 'table',
    title: 'Campaign history',
    summary: "The list of all the agency's campaigns, one per billed month. Open one to reread its report.",
    howToRead: {
      columns: [
        { key: 'periode', label: 'Period', description: 'The month and year billed.' },
        { key: 'libelle', label: 'Label', description: 'The name given to the campaign.' },
        { key: 'statut', label: 'Status', description: 'Where the campaign stands (see the statuses).' },
        {
          key: 'date',
          label: 'Run on',
          description: "The campaign's end date. A dash (—) means it is not finished."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '“View the report” shows the result above the table.'
        }
      ],
      statuses: [
        { value: 'RUNNING', label: 'In progress', description: 'The campaign is running.' },
        { value: 'DONE', label: 'Run', description: 'The campaign is finished.' },
        {
          value: 'FAILED',
          label: 'Failed',
          description: 'The campaign stopped before the end: run the period again.'
        }
      ],
      notes: ['Filters: status, year and execution date.']
    },
    faq: [
      {
        q: 'Why is there only one line per month?',
        a: 'A campaign is unique for a given month: running the same month again resumes the same line.'
      },
      {
        q: 'Did a “Failed” campaign bill anything?',
        a: 'Possibly in part. Run the period again: leases already billed will not be billed twice.'
      },
      {
        q: 'Can I delete a campaign?',
        a: 'No, the screen does not offer it: the history is a record.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires “View financial reports”.' },
    related: [{ label: 'Campaign report', helpId: 'finance.facturation.compte-rendu' }],
    keywords: ['history', 'past campaigns', 'billed months']
  },

  // Client balance
  {
    id: 'finance.balance-clients.page',
    kind: 'page',
    title: 'Client balance',
    summary:
      'One line per tenant: what was billed to them, what they paid and what they still owe. Nothing to enter here, everything is read-only.',
    purpose:
      "The client balance answers the question “how much do our tenants owe us?”. The figures come from each tenant's account, fed by the monthly billing and by their payments. To know since when they owe, use the Aged balance.",
    steps: [
      {
        title: 'Search',
        detail: "Type a tenant's name in the search field."
      },
      {
        title: 'Filter',
        detail: 'Limit the list to a “Period” or to a “Property”.'
      },
      {
        title: 'Open a statement',
        detail: "Click “View the statement” to read the detail of a tenant's movements."
      },
      {
        title: 'Export',
        detail: 'The “Export” button produces a CSV file of the list displayed.'
      }
    ],
    consequences: [
      'This screen changes nothing: it creates no invoice, chases nobody and sends no message.',
      'When you filter by period, “Invoiced” and “Paid” count only that period, and the balance is the one at the end of the period. A message reminds you.'
    ],
    faq: [
      {
        q: 'What does a positive balance mean? A negative one?',
        a: 'A positive balance is an amount the tenant owes. A negative balance (shown in red) means the tenant is ahead: they paid more than what was billed to them.'
      },
      {
        q: 'Why does a tenant not appear?',
        a: 'The list only shows accounts with movements in the chosen period and property. Remove the filters to see everyone.'
      },
      {
        q: 'Are the amounts recalculated when I filter?',
        a: 'The control total follows your filter: it adds up the balances of the tenants displayed.'
      },
      {
        q: 'Where can I see how long a tenant has owed?',
        a: 'In the Aged balance, which sorts unpaid amounts by age.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'RENTAL',
      note: 'Requires “View financial reports”.'
    },
    related: [
      { label: 'How to read the table', helpId: 'finance.balance-clients.tableau' },
      { label: 'Aged balance', helpId: 'finance.balance-agee.page' },
      { label: 'Monthly billing', helpId: 'finance.facturation.page' }
    ],
    keywords: ['balance', 'unpaid', 'receivables', 'tenants', 'what tenants owe']
  },
  {
    id: 'finance.balance-clients.tableau',
    kind: 'table',
    title: 'Client balance table',
    summary: 'Each line is a tenant, with their properties, what was billed to them, what they paid and their balance.',
    howToRead: {
      columns: [
        { key: 'locataire', label: 'Tenant', description: "The tenant's name (their account)." },
        {
          key: 'biens',
          label: 'Properties',
          description: 'The properties they rent, separated by a dot. A dash (—) means no property was found.'
        },
        {
          key: 'facture',
          label: 'Invoiced',
          description: 'The total of the installments billed to the tenant over the period displayed.'
        },
        {
          key: 'regle',
          label: 'Paid',
          description:
            'The total of their payments over the period. An advance taken to pay an installment is counted neither as billing nor as payment.'
        },
        {
          key: 'solde',
          label: 'Balance',
          description:
            'What the tenant owes at the end of the period (to date if no period is chosen). If negative, it is shown in red: the tenant is ahead.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: "“View the statement” opens the tenant's detailed statement."
        }
      ],
      notes: ['Rents whose due date is in the future do not count in the balance until their due date arrives.']
    },
    faq: [
      {
        q: 'Why does Invoiced minus Paid not always give the balance?',
        a: 'The balance takes into account the whole history of the account up to the end of the period, whereas Invoiced and Paid count only the filtered period.'
      },
      {
        q: 'Can the table be exported?',
        a: "Yes: the page's “Export” button produces a CSV, and the table also has its own export."
      },
      {
        q: 'How can I limit the balance to a period or a property?',
        a: 'Use the “Period” and “Property” filters above the table. The control total then follows the filtered list.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires “View financial reports”.' },
    related: [
      { label: 'Control total', helpId: 'finance.balance-clients.total' },
      { label: 'Aged balance', helpId: 'finance.balance-agee.tableau' }
    ],
    keywords: ['billed', 'paid', 'tenant balance', 'statement']
  },
  {
    id: 'finance.balance-clients.total',
    kind: 'section',
    title: 'Control total',
    summary:
      'The sum of the balances of the tenants displayed in the list, to check at a glance the total owed to the agency.',
    howToRead: {
      notes: [
        'The total follows your search and filters: it adds up the balances of the filtered list.',
        'Negative balances (tenants who are ahead) are deducted from positive balances.'
      ]
    },
    faq: [
      {
        q: 'Is this total the total of unpaid amounts?',
        a: "Not exactly: tenants' advances are deducted from it. For unpaid amounts by age, see the Aged balance."
      },
      {
        q: 'Why is this total missing?',
        a: 'It only appears when the list contains at least one tenant.'
      },
      {
        q: 'Can it be reconciled with the accounts?',
        a: 'The Aged balance also shows the gap with the accounts when there is one.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires “View financial reports”.' },
    related: [{ label: 'Aged balance', helpId: 'finance.balance-agee.page' }],
    keywords: ['total', 'control', 'sum of balances']
  },

  // Aged balance
  {
    id: 'finance.balance-agee.page',
    kind: 'page',
    title: 'Aged balance',
    summary:
      'The same list of tenants as the Client balance, but the amounts owed are sorted by how late they are: not yet due, under 30 days, 30 to 60, 60 to 90, over 90.',
    purpose:
      'It helps you chase at the right time: the older a debt, the harder it is to recover. The ranges are calculated as of today, on installments that are not fully paid.',
    steps: [
      {
        title: 'Spot the biggest delays',
        detail: 'Click the header of a range (for example “> 90 jours”) to sort the tenants.'
      },
      {
        title: 'Filter',
        detail: 'Search for a tenant, or limit the list to a “Period” or a “Property”.'
      },
      {
        title: 'Open a statement',
        detail: "“View the statement” shows the detail of the tenant's account."
      },
      {
        title: 'Export',
        detail: 'The “Export” button produces a CSV with all the ranges.'
      }
    ],
    consequences: [
      'This screen changes nothing and chases nobody: it is a reading tool.',
      "Lateness is counted in days between the installment's due date and today. An installment whose due date is today counts in “< 30 jours”."
    ],
    faq: [
      {
        q: 'What are the exact ranges?',
        a: '“Not yet due”: due date after today. Otherwise it is the delay in days: “< 30 jours” (0 to 29), “30 to 60 days” (30 to 59), “60 to 90 days” (60 to 89) and “> 90 jours” (90 and more).'
      },
      {
        q: 'What is placed in a range?',
        a: 'The amount left to pay on each unsettled installment, penalties included, after deducting what has already been paid on it.'
      },
      {
        q: 'What does “Difference with accounting” mean?',
        a: "Under the balance, this message appears when the tenant's accounting balance is not entirely explained by their unpaid installments (for example an adjustment). A zero gap is not displayed."
      },
      {
        q: 'Does an unused advance appear in the ranges?',
        a: "No. An overpayment is in no range: it can be read in the tenant's statement."
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'RENTAL',
      note: 'Requires “View financial reports”.'
    },
    related: [
      { label: 'How to read the table', helpId: 'finance.balance-agee.tableau' },
      { label: 'Client balance', helpId: 'finance.balance-clients.page' }
    ],
    keywords: ['aged balance', 'age of receivables', 'late payments', 'unpaid', 'chasing', '90 days']
  },
  {
    id: 'finance.balance-agee.tableau',
    kind: 'table',
    title: 'Aged balance table',
    summary: 'For each tenant, the balance and its split into five age ranges. The five range columns can be sorted.',
    howToRead: {
      columns: [
        { key: 'locataire', label: 'Tenant', description: "The tenant's name." },
        { key: 'biens', label: 'Properties', description: 'The properties they rent.' },
        {
          key: 'solde',
          label: 'Balance',
          description:
            'The sum of the five ranges, i.e. everything left to pay on their installments. Any gap with the accounts is noted below.'
        },
        {
          key: 'notYetDue',
          label: 'Not yet due',
          description: 'Installments whose due date has not yet arrived.'
        },
        {
          key: 'days0To30',
          label: '< 30 jours',
          description: 'Installments late for less than 30 days (0 to 29 days).'
        },
        {
          key: 'days30To60',
          label: '30 to 60 days',
          description: 'Installments late for 30 to 59 days.'
        },
        {
          key: 'days60To90',
          label: '60 to 90 days',
          description: 'Installments late for 60 to 89 days.'
        },
        {
          key: 'daysOver90',
          label: '> 90 jours',
          description: 'Installments late for 90 days or more.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: "“View the statement” opens the tenant's statement."
        }
      ],
      notes: [
        'The range columns can be sorted; the sort applies to the whole list, not just the page displayed.',
        "An installment still in draft is counted only if its billing is already recorded in the tenant's account."
      ]
    },
    faq: [
      {
        q: 'Why does the sum of the ranges differ from the Client balance?',
        a: 'The Client balance follows the accounting account; the Aged balance follows unpaid installments. Any gap is shown under the balance.'
      },
      {
        q: 'Does a tenant who is up to date appear?',
        a: 'Yes, with zero ranges, as long as they have movements within the filtered scope.'
      },
      {
        q: 'Can the aged balance be exported?',
        a: "Yes, with the page's “Export” button. The CSV contains the balance, the accounting gap and the five ranges."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires “View financial reports”.' },
    related: [
      { label: 'Control total and gap', helpId: 'finance.balance-agee.total' },
      { label: 'Client balance', helpId: 'finance.balance-clients.tableau' }
    ],
    keywords: ['ranges', '30 days', '60 days', '90 days', 'not yet due', 'late']
  },
  {
    id: 'finance.balance-agee.total',
    kind: 'section',
    title: 'Control total and gap',
    summary:
      'The sum of the balances (of the ranges) of the tenants displayed, with, if there is one, the gap between this total and the accounts.',
    howToRead: {
      notes: [
        'The total is the sum of the ranges of all the lines displayed: it is read together with the columns that make it up.',
        "“Difference with accounting” only appears if it is not zero. It compares the tenants' accounting balance with what their unpaid installments say.",
        'Payments already made on a not-yet-due installment and unused advances are taken into account in this calculation: they do not create a gap.'
      ]
    },
    faq: [
      {
        q: 'What should I do if a gap appears?',
        a: 'Open the statement of the tenants concerned: a gap comes from a movement that is not an installment (adjustment, correction). Have your accountant check it.'
      },
      {
        q: 'Is the gap an error?',
        a: 'Not necessarily. It is a signal to examine, not a proven anomaly.'
      },
      {
        q: 'Does this total follow my filters?',
        a: 'Yes, it adds up the lines of the list displayed.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires “View financial reports”.' },
    related: [{ label: 'Aged balance table', helpId: 'finance.balance-agee.tableau' }],
    keywords: ['accounting gap', 'total', 'reconciliation']
  },

  // Owner accounts
  {
    id: 'finance.comptes-proprietaires.page',
    kind: 'page',
    title: 'Owner accounts',
    summary:
      'The current account the agency keeps for each owner: what the agency owes them, their last movement and their last payout.',
    purpose:
      'The agency collects rents on behalf of owners. This account is calculated automatically from the rents collected, fees, VAT, expenses and payouts already made. Open an account to see the detail and pay out the money due.',
    steps: [
      {
        title: 'Spot those we owe',
        detail:
          'Turn on the “Non-zero amount due” filter, or read the “Balance owed” column: an amount in bold orange is a sum the agency owes the owner.'
      },
      {
        title: 'Search',
        detail: 'Type a name or an e-mail address.'
      },
      {
        title: 'Open the account',
        detail: 'Click “View account” to read the movements and record a payout.'
      }
    ],
    consequences: [
      'This screen is read-only. When it opens, the accounts are updated with the rents collected and fees that were not yet recorded.',
      "Payouts are recorded from the owner's page, not from this list."
    ],
    faq: [
      {
        q: 'Which owners are listed?',
        a: "The agency's owners: those registered as such, those named on a lease and those holding a share of a jointly owned property."
      },
      {
        q: 'What does a negative balance mean?',
        a: 'The owner owes money to the agency (for example expenses advanced by the agency). It is not deducted from the total owed to other owners.'
      },
      {
        q: 'Why is this screen missing from my menu?',
        a: 'It belongs to the Rental management pack and requires the right “View third-party accounts”. Agencies that only manage their own assets do not have it: it concerns third-party properties.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'RENTAL',
      note: 'Requires “View third-party accounts”. Not available to an agency limited to its own assets.'
    },
    related: [
      { label: 'Total owed to owners', helpId: 'finance.comptes-proprietaires.total' },
      { label: 'Owner accounts table', helpId: 'finance.comptes-proprietaires.tableau' },
      { label: "An owner's account", helpId: 'finance.compte-proprietaire.page' }
    ],
    keywords: ['owner', 'principal', 'payout', 'current account', 'balance due', 'rents to pay out']
  },
  {
    id: 'finance.comptes-proprietaires.total',
    kind: 'section',
    title: 'Total owed to owners',
    summary: 'The total amount the agency currently owes its owners, i.e. the sum of their positive balances.',
    howToRead: {
      notes: [
        'Only positive balances are added up. A negative balance (owner who owes the agency) is not deducted: each account stays separate.',
        'This total covers all owners, even if the list is filtered.'
      ]
    },
    faq: [
      {
        q: 'Is this amount available in cash?',
        a: 'Not necessarily: it is a debt of the agency towards its owners, not a cash balance.'
      },
      {
        q: "Why can't I find this total by adding up the column?",
        a: 'The negative balances in the column are not counted in the total.'
      },
      {
        q: 'How do I bring it down?',
        a: "By recording payouts from each owner's page."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires “View third-party accounts”.' },
    related: [{ label: 'Owner accounts table', helpId: 'finance.comptes-proprietaires.tableau' }],
    keywords: ['total owed', 'debt', 'to pay out']
  },
  {
    id: 'finance.comptes-proprietaires.tableau',
    kind: 'table',
    title: 'Owner accounts table',
    summary:
      'Each line is an owner, with what the agency owes them, the date of their last movement and their last payout.',
    howToRead: {
      columns: [
        { key: 'proprietaire', label: 'Owner', description: "The owner's name." },
        { key: 'email', label: 'Email', description: 'Their e-mail address, or a dash (—) if unknown.' },
        {
          key: 'solde',
          label: 'Balance owed',
          description:
            'What the agency owes the owner. In bold orange if positive; if negative (in red), the owner owes the agency.'
        },
        {
          key: 'dernier-mouvement',
          label: 'Last movement',
          description: "The date of the account's last entry (rent, fees, expense, payout…)."
        },
        {
          key: 'dernier-reversement',
          label: 'Last payout',
          description:
            'The number (REV-year-number), amount and date of the last validated payout. Cancelled payouts do not count.'
        },
        { key: 'actions', label: 'Actions', description: "“View account” opens the owner's page." }
      ],
      notes: ['Filters: “Non-zero amount due” and “Last movement” (date range).']
    },
    faq: [
      {
        q: 'Does an owner with no movement appear?',
        a: 'Yes, with a zero balance and dashes, as long as they are an owner of the agency.'
      },
      {
        q: 'Can the list be exported?',
        a: "Yes, with the table's export."
      },
      {
        q: 'How do I find the owners the agency owes money to?',
        a: 'Turn on the “Non-zero amount due” filter. It keeps the accounts whose balance is not zero, whether positive or negative.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires “View third-party accounts”.' },
    related: [{ label: "An owner's account", helpId: 'finance.compte-proprietaire.page' }],
    keywords: ['list of owners', 'last payout', 'balance due']
  },

  // An owner's account
  {
    id: 'finance.compte-proprietaire.page',
    kind: 'page',
    title: "An owner's account",
    summary:
      "The detail of an owner's account: what credited it (rents), what debited it (fees, VAT, expenses, payouts) and the balance the agency owes them. This is where a payout is recorded.",
    purpose:
      'The balance due is what is left to pay out: rents collected, minus management fees, VAT on those fees, expenses paid for the property, any withholdings and payouts already made. The account is updated each time it is viewed.',
    steps: [
      {
        title: 'Read the balance',
        detail: 'The “Balance owed” at the top of the page is the maximum amount you can pay out.'
      },
      {
        title: 'Check the movements',
        detail: 'In the “Account movements” tab, check the rents, fees and expenses.'
      },
      {
        title: 'Pay out',
        detail: 'Click “New payout”, check the amount, date and method, then “Save”.'
      },
      {
        title: 'Correct a mistake',
        detail: 'In the “Payouts” tab, click “Cancel” and give the reason, then enter a new payout.'
      }
    ],
    consequences: [
      'A payout is validated as soon as it is recorded: it cannot be edited or deleted. It gets a number of the form REV-2026-0001.',
      'It reduces the balance due and posts an accounting entry: the outflow is recorded in the chosen treasury account (cash, bank or mobile money).',
      'No message is sent to the owner when the payout is recorded.',
      'A cancellation creates a cancellation entry visible in the movements: the original payout stays displayed with its number, but its amount no longer counts and the balance due goes back up by the same amount.'
    ],
    faq: [
      {
        q: 'Can I pay out more than the balance due?',
        a: 'No, recording is refused if the amount exceeds the balance due to the owner.'
      },
      {
        q: 'Can I date a payout in the future?',
        a: 'No. The date cannot be later than today.'
      },
      {
        q: 'I do not see “New payout” or “Cancel”.',
        a: 'Recording requires “Create financial documents”; cancelling requires “Validate financial documents”. Ask the agency administrator for them.'
      },
      {
        q: 'Where can I find a document to give to the owner?',
        a: 'This screen prints no document. The payout number and reference serve as proof.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'RENTAL',
      note: 'Viewing the account requires “View third-party accounts”; paying out requires “Create financial documents”; cancelling requires “Validate financial documents”.'
    },
    related: [
      { label: 'Balance and indicators', helpId: 'finance.compte-proprietaire.solde' },
      { label: 'New payout', helpId: 'finance.compte-proprietaire.nouveau-reversement' },
      { label: 'Cancel a payout', helpId: 'finance.compte-proprietaire.annuler-reversement' },
      { label: 'Financial settings (fees, VAT, withholding)', to: '/tenant/:tenantId/settings/finance' }
    ],
    keywords: ['payout', 'pay the owner', 'rents collected', 'fees', 'withholdings', 'REV'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'reversement-solde',
          title: 'The balance due',
          description: 'This is what the agency owes the owner after fees, VAT, expenses and payouts already made.'
        },
        {
          target: 'reversement-nouveau',
          title: 'Record a payout',
          description:
            'The proposed amount is the balance due. A validated payout can no longer be edited: it is cancelled with a reason.'
        },
        {
          target: 'reversement-onglets',
          title: 'Movements and payouts',
          description:
            '“Account movements” explains the balance line by line; “Payouts” lists the payouts and lets you cancel them.'
        }
      ]
    }
  },
  {
    id: 'finance.compte-proprietaire.solde',
    kind: 'section',
    title: 'Balance due and indicators',
    summary:
      'The balance due to the owner, and five totals that explain it: rents collected, fees, VAT, expenses and payouts.',
    howToRead: {
      notes: [
        'Balance due = rents collected, minus fees, minus VAT on fees, minus expenses, minus payouts, minus any withholding tax, plus security deposits kept by the agency where applicable.',
        '“Rent collected”: rents actually paid by tenants for this owner (excluding penalties if they go to the agency, and excluding re-invoiced direct-debit rejection fees).',
        "“Fees”: the agency's management fees, calculated on each collection according to the terms of the lease, the owner or the agency (percentage or flat fee).",
        '“VAT”: VAT on those fees, if the agency is subject to it.',
        "“Expenses”: property expenses paid on the owner's behalf.",
        '“Payouts”: what has already been paid out, cancellations deducted.',
        'Withholding tax and the retained security deposit are not in these five cards: they are read in the account movements.',
        'A negative balance (in red) means the owner owes money to the agency.'
      ]
    },
    faq: [
      {
        q: "Why don't the cards exactly give the balance?",
        a: 'A withholding tax or a retained security deposit, absent from the five cards, can explain the difference: look for them in the movements.'
      },
      {
        q: 'Do fees change if I change the rate?',
        a: 'Not for rents already collected: fees are frozen at collection with the terms of the day.'
      },
      {
        q: 'Where do I set the fee rate, VAT and withholding?',
        a: "In the agency's Financial settings; fees can also be set per owner or per lease."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires “View third-party accounts”.' },
    related: [
      { label: 'Account movements', helpId: 'finance.compte-proprietaire.mouvements' },
      { label: 'Financial settings', to: '/tenant/:tenantId/settings/finance' }
    ],
    keywords: ['balance', 'net to owner', 'management fees', 'VAT', 'withholding tax', 'security deposit']
  },
  {
    id: 'finance.compte-proprietaire.mouvements',
    kind: 'table',
    title: 'Account movements',
    summary:
      "Each line is an entry in the owner's account, from oldest to most recent, with the balance due after that entry.",
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'The entry date (the collection day for a rent).' },
        { key: 'type', label: 'Type', description: 'The nature of the entry (see the types).' },
        { key: 'libelle', label: 'Label', description: 'A description, for example the month and lease number.' },
        {
          key: 'bien-bail',
          label: 'Property or lease',
          description: 'The property and lease number concerned, or a dash (—) if there is none.'
        },
        {
          key: 'debit',
          label: 'Debit',
          description: 'What reduces the sum owed to the owner (fees, expenses, payout…).'
        },
        {
          key: 'credit',
          label: 'Credit',
          description: 'What increases the sum owed to the owner (rent collected…).'
        },
        {
          key: 'solde',
          label: 'Balance owed after',
          description: 'The balance due after this line, recalculated in date order.'
        }
      ],
      statuses: [
        {
          value: 'RENT_COLLECTED',
          label: 'Rent collected',
          description: 'A rent paid by the tenant, credited to the owner.'
        },
        { value: 'MANAGEMENT_FEE', label: 'Fees', description: "The agency's management fees, debited." },
        { value: 'MANAGEMENT_FEE_VAT', label: 'VAT on fees', description: 'VAT on the fees, debited.' },
        { value: 'EXPENSE', label: 'Expense', description: 'An expense paid for the property, debited.' },
        { value: 'PAYOUT', label: 'Payout', description: 'A payout made to the owner, debited.' },
        {
          value: 'VOID',
          label: 'Cancellation',
          description: 'A cancellation entry, for example that of a cancelled payout.'
        },
        {
          value: 'WITHHOLDING_TAX',
          label: 'Withholding tax',
          description: "A withholding taken from rents on the owner's behalf, if the agency has enabled it."
        },
        {
          value: 'DEPOSIT_RETAINED',
          label: 'Security deposit retained',
          description: "A security deposit kept by the agency and added to the owner's account."
        }
      ],
      notes: [
        "A jointly owned property carries each owner's share, shown in the label.",
        'The “after” balance remains that of the whole account: a search or filter does not recalculate it.'
      ]
    },
    faq: [
      {
        q: 'Why is a rent recorded on the payment date and not the due date?',
        a: "The owner's account only receives rents actually collected."
      },
      {
        q: 'Does a cancelled rent disappear?',
        a: 'No, it appears with a cancellation entry. Nothing is erased.'
      },
      {
        q: 'How can I filter?',
        a: 'By text (label, property, lease), by type, by date and by debit or credit range.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires “View third-party accounts”.' },
    related: [{ label: 'Balance and indicators', helpId: 'finance.compte-proprietaire.solde' }],
    keywords: ['movements', 'entries', 'debit', 'credit', 'owner statement']
  },
  {
    id: 'finance.compte-proprietaire.reversements',
    kind: 'table',
    title: 'Payouts',
    summary:
      'The list of payouts made to this owner, from most recent to oldest, with their status. You can cancel one.',
    howToRead: {
      columns: [
        { key: 'numero', label: 'Number', description: 'The payout number, for example REV-2026-0001.' },
        { key: 'date', label: 'Date', description: 'The payout date.' },
        { key: 'mode', label: 'Method', description: 'Cash, transfer, cheque, Mobile Money or other.' },
        {
          key: 'reference',
          label: 'Reference',
          description: 'The reference entered (transfer or cheque number…), or a dash (—).'
        },
        {
          key: 'montant',
          label: 'Amount',
          description: 'The amount paid out, struck through if the payout is cancelled.'
        },
        { key: 'statut', label: 'Status', description: 'Validated or Cancelled; a cancelled payout shows its reason.' },
        {
          key: 'actions',
          label: 'Actions',
          description: '“Cancel” appears on a validated payout, if you have the right.'
        }
      ],
      statuses: [
        { value: 'VALIDATED', label: 'Approved', description: "The payout counts in the owner's balance." },
        { value: 'VOIDED', label: 'Cancelled', description: 'The payout is cancelled: its amount no longer counts.' }
      ]
    },
    faq: [
      {
        q: 'Can I edit a payout?',
        a: 'No. Cancel it with a reason, then enter a new one.'
      },
      {
        q: 'How do I cancel?',
        a: 'Click “Cancel” on the line, give the reason (at least 3 characters) and confirm.'
      },
      {
        q: 'I do not see the “Cancel” button.',
        a: 'It requires the right “Validate financial documents”.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing requires “View third-party accounts”; cancelling requires “Validate financial documents”.'
    },
    related: [
      { label: 'New payout', helpId: 'finance.compte-proprietaire.nouveau-reversement' },
      { label: 'Cancel a payout', helpId: 'finance.compte-proprietaire.annuler-reversement' }
    ],
    keywords: ['payouts', 'payments to the owner', 'REV', 'cancel']
  },
  {
    id: 'finance.compte-proprietaire.nouveau-reversement',
    kind: 'section',
    title: 'New payout',
    summary:
      'Record the money you hand over to the owner: amount, date, payment method, treasury account and reference.',
    steps: [
      {
        title: 'Amount',
        detail: 'The balance due is suggested if positive. You can pay out less, never more.'
      },
      {
        title: 'Date',
        detail: 'Today by default; a future date is refused.'
      },
      {
        title: 'Method',
        detail:
          'Cash, Bank transfer, Cheque, Mobile Money or Other. Changing the method clears the chosen treasury account.'
      },
      {
        title: 'Treasury account',
        detail: "Choose the account the money leaves from. If left empty, the method's default account is used."
      },
      {
        title: 'Reference and notes',
        detail: 'Enter for example the transfer or cheque number; notes are optional.'
      },
      {
        title: 'Save',
        detail: 'Click “Save”. A number is assigned.'
      }
    ],
    consequences: [
      'The payout is validated immediately and cannot be edited: in case of error, cancel it and enter a new one.',
      'The balance due goes down by the amount paid out, and an accounting entry takes the sum out of the treasury account.',
      'The amount is refused if it exceeds the balance due, if it is not greater than 0 or if it has more than two decimals.'
    ],
    faq: [
      {
        q: 'The balance due is negative: can I pay out?',
        a: 'No, there is nothing to pay out: the proposed amount is empty and any payout would be refused.'
      },
      {
        q: 'What happens if two people pay out at the same time?',
        a: 'The account is locked while saving: the second payout sees the balance already reduced and may be refused.'
      },
      {
        q: 'Is the owner notified?',
        a: 'No, recording sends no message.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires “Create financial documents”.' },
    related: [{ label: 'Payouts', helpId: 'finance.compte-proprietaire.reversements' }],
    keywords: ['pay out', 'pay the owner', 'transfer', 'cash', 'mobile money']
  },
  {
    id: 'finance.compte-proprietaire.annuler-reversement',
    kind: 'section',
    title: 'Cancel a payout',
    summary:
      'Cancel a validated payout by giving a reason. The payout stays visible, but no longer counts in the balance due.',
    steps: [
      {
        title: 'Open the cancellation',
        detail: 'In the “Payouts” tab, click “Cancel” on the line concerned.'
      },
      {
        title: 'Give the reason',
        detail: 'Enter an explanation (for example “Error in the amount”). It is mandatory.'
      },
      {
        title: 'Confirm',
        detail: 'Click “Confirm the cancellation”.'
      }
    ],
    consequences: [
      "A cancellation entry is created and the payout's accounting entry is reversed.",
      'The balance due goes back up by the cancelled amount: you must then enter a new, correct payout.',
      'A payout already cancelled cannot be cancelled a second time.'
    ],
    faq: [
      {
        q: 'Is the payout erased?',
        a: 'No: it stays in the list, struck through, with its cancellation reason.'
      },
      {
        q: 'How long must the reason be?',
        a: 'At least three characters.'
      },
      {
        q: 'Is the money returned to the agency?',
        a: 'The cancellation corrects the accounts. Getting back the money actually handed to the owner is handled outside this screen.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires “Validate financial documents”.' },
    related: [{ label: 'Payouts', helpId: 'finance.compte-proprietaire.reversements' }],
    keywords: ['cancellation', 'payout error', 'reversal']
  },

  // Associations
  {
    id: 'finance.associations.page',
    kind: 'page',
    title: 'Partnerships',
    summary:
      'An association groups partners who share the rents of one or more properties, each according to their percentage share. Whatever is not allocated stays with the agency.',
    purpose:
      'When a property belongs to several partners (for example a villa in joint ownership), you need to know who is entitled to each part of the rent. At each monthly billing, the rent of an attached property is split between the partners according to their shares.',
    steps: [
      {
        title: 'Create the association',
        detail: 'Click “New partnership” and give it a name. Partners are added afterwards, from its page.'
      },
      {
        title: 'Check the shares',
        detail:
          "The “Total of the shares” and “The agency's share” columns are read together: at 100%, nothing is left for the agency."
      },
      {
        title: 'Spot incomplete shares',
        detail: 'Turn on the “Incomplete shares” filter to see associations whose total is not 100%.'
      },
      {
        title: 'Open the page',
        detail: "“View the record” lets you add partners, attach properties and read a partner's statement."
      }
    ],
    consequences: [
      'Creating an association has no financial effect as long as it has no partner and no attached property.',
      'Partners and their shares are only used for the split made at future billings; nothing is recalculated for months already billed.'
    ],
    faq: [
      {
        q: "What does “The agency's share” mean?",
        a: "It is what remains of 100% once the partners' shares are removed. It is not a partner and has no account of its own."
      },
      {
        q: 'Can the total exceed 100%?',
        a: 'No. Adding a partner is refused if the total of shares would exceed 100%.'
      },
      {
        q: 'Why does this screen not appear?',
        a: 'It belongs to the Construction pack. It also requires the right “View third-party accounts”.'
      },
      {
        q: 'Can an association be deactivated?',
        a: 'The screen does not offer this: the status displayed is “Active” or “Inactive” according to the record.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'CONSTRUCTION',
      note: 'Viewing requires “View third-party accounts”; creating an association requires “Configure the finance module”.'
    },
    related: [
      { label: 'Associations table', helpId: 'finance.associations.tableau' },
      { label: 'New association', helpId: 'finance.associations.nouvelle' },
      { label: "An association's page", helpId: 'finance.association.page' }
    ],
    keywords: ['association', 'joint ownership', 'partners', 'share', 'rent sharing', 'co-owners of a property']
  },
  {
    id: 'finance.associations.tableau',
    kind: 'table',
    title: 'Associations table',
    summary:
      'Each line is an association, with its partners, the total of their shares, the share left to the agency and the attached properties.',
    howToRead: {
      columns: [
        { key: 'label', label: 'Partnership', description: "The association's name." },
        { key: 'associes', label: 'Partners', description: "The partners' names, or “No partner”." },
        { key: 'total-parts', label: 'Total of the shares', description: "The sum of the partners' percentages." },
        {
          key: 'part-agence',
          label: "The agency's share",
          description: '100% minus the total of shares: what is left to the agency.'
        },
        {
          key: 'biens',
          label: 'Linked properties',
          description: 'The properties whose rent is split, or “No linked property”.'
        },
        { key: 'statut', label: 'Status', description: 'Active or Inactive.' },
        { key: 'actions', label: 'Actions', description: '“View the record” opens the association.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The association is in service.' },
        { value: 'INACTIVE', label: 'Inactive', description: 'The association is deactivated.' }
      ],
      notes: ['Filters: status (Active or Inactive) and “Incomplete shares” (total different from 100%).']
    },
    faq: [
      {
        q: 'Are incomplete shares an error?',
        a: 'No, the missing share goes to the agency. It is only a point to check.'
      },
      {
        q: 'Can the list be exported?',
        a: "Yes, with the table's export."
      },
      {
        q: 'How do I find a partnership?',
        a: 'Type in the search box the name of the partnership, of a partner or of a linked property.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires “View third-party accounts”.' },
    related: [{ label: "An association's page", helpId: 'finance.association.page' }],
    keywords: ['associations', 'shares', 'agency share']
  },
  {
    id: 'finance.associations.nouvelle',
    kind: 'section',
    title: 'New association',
    summary:
      'Give the association a name. It is created empty: you then add its partners and properties from its page.',
    steps: [
      {
        title: 'Name',
        detail: 'Enter a clear name, for example “Villa Riviera — indivision Kouadio”. It is mandatory.'
      },
      {
        title: 'Save',
        detail: 'Click “Save the partnership”: its page opens.'
      }
    ],
    consequences: [
      'The association is created active, with no partner and no property.',
      'No split takes place until the page has a partner and a property is attached to it.'
    ],
    faq: [
      {
        q: 'Can I rename the association afterwards?',
        a: 'The screen does not offer renaming: choose a final name.'
      },
      {
        q: 'The “New partnership” button is missing.',
        a: 'Creating an association requires the right “Configure the finance module”.'
      },
      {
        q: 'Must the association be created before billing?',
        a: 'Yes: the split is made at the monthly billing, on the associations that exist at that time.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires “Configure the finance module”.' },
    related: [{ label: "An association's page", helpId: 'finance.association.page' }],
    keywords: ['create an association', 'new joint ownership']
  },

  // An association's page
  {
    id: 'finance.association.page',
    kind: 'page',
    title: "An association's page",
    summary:
      "Manage here the partners and their shares, the attached properties, and view each partner's share statement.",
    purpose:
      'At each monthly billing, the amount billed for an attached property (rent, charges and other fees) is split between the partners: each receives that amount multiplied by their share. This share is added to their account. The tenant still owes the whole rent.',
    steps: [
      {
        title: 'Check the shares',
        detail: "The two cards at the top show the total of shares and the agency's share."
      },
      {
        title: 'Add the partners',
        detail: 'In “Add a partner”, enter the name and share in %, then “Add the partner”.'
      },
      {
        title: 'Attach the properties',
        detail: 'In “Link an existing property”, choose the property then click “Link”.'
      },
      {
        title: "Read a partner's statement",
        detail: "Click “View the statement” on the partner's line."
      }
    ],
    consequences: [
      'The split is made at the monthly billing, for rents billed after the attachment. Months already billed are not recalculated.',
      'Removing a partner is irreversible. It is refused as soon as a split has already been recorded on their share.',
      'Detaching a property stops the split from the next billing; splits already made stay unchanged.',
      'Attaching to this association a property that belonged to another makes it change association: a property has only one.'
    ],
    faq: [
      {
        q: 'Is the split made on rent collected or billed?',
        a: "On the amount billed, at the time of the monthly billing. A partner's statement also shows what was collected, for information."
      },
      {
        q: 'What happens with three partners at 33.33%?',
        a: "Each gets 33.33% of the amount; the remaining 0.01% goes to the agency. The rounding remainder in francs is added to the first partner's share."
      },
      {
        q: 'How do I pay a partner?',
        a: 'This screen has no payment: it records what each is entitled to.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'CONSTRUCTION',
      note: "Viewing requires “View third-party accounts” (and “View financial reports” for a partner's statement); adding, removing, attaching or detaching requires “Configure the finance module”."
    },
    related: [
      { label: 'Agency share and total shares', helpId: 'finance.association.parts' },
      { label: 'Partners', helpId: 'finance.association.associes' },
      { label: 'Attached properties', helpId: 'finance.association.biens' },
      { label: 'Share statement', helpId: 'finance.association.releve' }
    ],
    keywords: ['association', 'partners', 'share', 'joint ownership', 'rent split']
  },
  {
    id: 'finance.association.parts',
    kind: 'section',
    title: 'Total shares and agency share',
    summary: "Two figures to read together: the sum of the partners' shares and what is left to the agency.",
    howToRead: {
      notes: [
        "“Total of the shares”: the sum of the partners' percentages, never above 100%.",
        "“The agency's share”: 100% minus this total.",
        "At 100%, the “The agency's share” card turns to a warning: the partners share the whole rent, nothing is left for the agency."
      ]
    },
    faq: [
      {
        q: 'Is the agency a partner?',
        a: 'No. Its share is only what is allocated to nobody: it has no account and cannot be entered.'
      },
      {
        q: 'Why 99.99% instead of 100%?',
        a: 'Three shares of 33.33% add up to 99.99%: the remaining hundredth goes to the agency.'
      },
      {
        q: "How do I increase the agency's share?",
        a: 'Remove a partner who has no split yet, or add partners with smaller shares.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires “View third-party accounts”.' },
    related: [{ label: 'Partners', helpId: 'finance.association.associes' }],
    keywords: ['agency share', '100%', 'share']
  },
  {
    id: 'finance.association.associes',
    kind: 'table',
    title: 'Association partners',
    summary: "The list of partners with their share. From each line, read the partner's statement or remove them.",
    howToRead: {
      columns: [
        { key: 'associe', label: 'Partner', description: "The partner's name." },
        { key: 'part', label: 'Share', description: 'Their percentage of the amount billed.' },
        {
          key: 'actions',
          label: 'Actions',
          description: '“View the statement” opens their share statement; “Remove” removes them from the association.'
        }
      ],
      notes: ['An account is created for each partner at the same time as their share.']
    },
    steps: [{ title: 'Remove a partner', detail: 'Click “Remove” then “Confirm the removal”.' }],
    consequences: [
      "Removal is irreversible and refused if a split has already been recorded on the partner's share: their history cannot disappear."
    ],
    faq: [
      {
        q: "Can I change a partner's share?",
        a: 'The screen does not allow it: you can only add or remove a partner.'
      },
      {
        q: 'Why is removal refused?',
        a: 'Because a split already exists for this partner: the agency already owes them money and the history must stay readable.'
      },
      {
        q: 'Where can I read what they are entitled to?',
        a: 'In “View the statement”: each month, the property, the amount billed, collected and their share.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Removing requires “Configure the finance module”.' },
    related: [
      { label: 'Add a partner', helpId: 'finance.association.ajout-associe' },
      { label: 'Share statement', helpId: 'finance.association.releve' }
    ],
    keywords: ['partners', 'remove a partner', 'share']
  },
  {
    id: 'finance.association.ajout-associe',
    kind: 'section',
    title: 'Add a partner',
    summary:
      "Enter the partner's name and their share as a percentage. An account is created for them with their share.",
    steps: [
      { title: 'Name', detail: "Enter the partner's name, for example “Fatoumata Kouassi”." },
      { title: 'Share', detail: 'Enter their percentage, from 0 to 100 (two decimals at most).' },
      { title: 'Confirm', detail: 'Click “Add the partner”.' }
    ],
    consequences: [
      'Adding is refused if the sum of shares would exceed 100%; the message says what is already allocated.',
      'The share must be greater than 0.',
      'The partner will take part in the split of future billings of the attached properties.'
    ],
    faq: [
      {
        q: 'Must the partner exist in the application?',
        a: 'No, only their name is requested: the partner is not a user.'
      },
      {
        q: 'Can I add a partner at 100%?',
        a: 'Yes if no other partner has a share; the agency then has nothing left.'
      },
      {
        q: 'The button stays greyed out.',
        a: 'The name and a share greater than 0 are mandatory.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires “Configure the finance module”.' },
    related: [{ label: 'Partners', helpId: 'finance.association.associes' }],
    keywords: ['add a partner', 'new share']
  },
  {
    id: 'finance.association.biens',
    kind: 'table',
    title: 'Attached properties',
    summary: 'The properties whose rent is split between the partners. Attach an existing property or detach one.',
    howToRead: {
      columns: [
        { key: 'bien', label: 'Property', description: 'The title of the attached property.' },
        { key: 'actions', label: 'Actions', description: '“Detach” removes the property from the association.' }
      ],
      notes: [
        "Under the table, “Link an existing property” offers the agency's properties; those already attached to this association are left out of the list."
      ]
    },
    steps: [
      { title: 'Attach', detail: 'Choose a property in the list then click “Link”.' },
      { title: 'Detach', detail: 'Click “Detach” then “Confirm the detachment”.' }
    ],
    consequences: [
      'From the next billing, the rents of an attached property are split between the partners.',
      'Detaching a property stops the split; splits already recorded stay unchanged.',
      'A property belongs to only one association: attaching a property already attached elsewhere moves it without error, recalculating nothing in the past.'
    ],
    faq: [
      {
        q: 'Are rents already billed split after attachment?',
        a: 'No, only rents billed afterwards are.'
      },
      {
        q: 'Is a property with no association concerned?',
        a: 'No. Most properties have no association and nothing is split.'
      },
      {
        q: 'What happens if the association has no partner?',
        a: "Nothing is split; the tenant's billing is not blocked."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Attaching or detaching requires “Configure the finance module”.' },
    related: [{ label: 'Page overview', helpId: 'finance.association.page' }],
    keywords: ['attach a property', 'detach', 'association properties']
  },
  {
    id: 'finance.association.releve',
    kind: 'section',
    title: "A partner's share statement",
    summary:
      'For a partner, month by month: the property, what was billed, what was collected and the share they are entitled to. Read-only.',
    howToRead: {
      columns: [
        { key: 'bien', label: 'Property', description: 'The property concerned.' },
        { key: 'periode', label: 'Period', description: 'The month and year of the rent.' },
        {
          key: 'facture',
          label: 'Invoiced',
          description: 'The amount billed for the property that month (rent, charges and other fees).'
        },
        { key: 'encaisse', label: 'Collected', description: 'What has been paid on this installment to date.' },
        {
          key: 'part',
          label: 'Their share',
          description: "The partner's share: their percentage of the amount billed."
        }
      ],
      notes: [
        '“Total of their share for the period” and “Already paid over” count only the chosen period (optional).',
        "“Still owed, all periods” is the balance of the partner's account over their whole history: it cannot be deduced from the other two figures."
      ]
    },
    steps: [
      { title: 'Open', detail: "Click “View the statement” on the partner's line." },
      { title: 'Choose the period', detail: 'Optional: select start and end dates.' }
    ],
    faq: [
      {
        q: 'Does the share depend on what was collected?',
        a: 'No, it is calculated on the amount billed. The “Collected” column is given for information.'
      },
      {
        q: 'Where does “Already paid over” come from?',
        a: "It is the sum of the payments recorded on the partner's account over the period. This screen does not let you enter any."
      },
      {
        q: 'The table is empty.',
        a: 'No rent was split for this partner over the period: check the attached properties and the period.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires “View financial reports”.' },
    related: [{ label: 'Partners', helpId: 'finance.association.associes' }],
    keywords: ['share statement', 'partner statement', 'amount paid out', 'balance due']
  },

  // Agent commissions
  {
    id: 'finance.commissions.page',
    kind: 'page',
    title: 'Agent commissions',
    summary:
      'The monthly statement of management fees collected by the agency, broken down by manager, with the commission due to each.',
    purpose:
      'Management fees are calculated on each rent collected. Each manager receives a share of these fees before tax, on the leases they manage. For a collection month, this screen gives the total per agent and the detail of each collection.',
    steps: [
      {
        title: 'Choose the month',
        detail: 'Use the “Period” selector: the current month is displayed by default.'
      },
      {
        title: 'Read the totals',
        detail: 'The four cards give fees before tax, VAT, commissions due and fees with no manager.'
      },
      {
        title: "See an agent's detail",
        detail: 'Expand their line to read each collection: date, lease, property, amount, fees and share.'
      }
    ],
    consequences: [
      'This screen is read-only: it does not pay commissions and sends nothing.',
      'Fees are frozen at collection: a change of rate or share does not alter a commission already calculated.'
    ],
    faq: [
      {
        q: 'Who is “No manager”?',
        a: 'The fees of leases for which no manager is assigned. Assign one on the lease page so that its fees are attributed to them.'
      },
      {
        q: "Where do I set each agent's share?",
        a: 'In the Financial settings, “Collaborator commission” card: it is the share of fees before tax paid to the staff member on their leases.'
      },
      {
        q: 'Are commissions marked as paid?',
        a: 'No. The screen has no payment status: it only shows what is due.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'RENTAL',
      note: 'Requires “View financial reports”.'
    },
    related: [
      { label: 'Totals for the month', helpId: 'finance.commissions.indicateurs' },
      { label: 'Commissions table', helpId: 'finance.commissions.tableau' },
      { label: 'Financial settings', to: '/tenant/:tenantId/settings/finance' }
    ],
    keywords: ['commission', 'management fees', 'manager', 'agent', 'staff share', 'pay']
  },
  {
    id: 'finance.commissions.indicateurs',
    kind: 'section',
    title: 'Totals for the month',
    summary:
      'Four totals for the chosen month: fees before tax, VAT, commissions due to agents and fees with no manager.',
    howToRead: {
      notes: [
        '“Fees excl. VAT”: management fees generated by rents collected in the month, before VAT.',
        '“VAT”: VAT on those fees, if the agency is subject to it.',
        '“Commissions owed to agents”: the sum of the shares due to managers.',
        '“Fees without a manager”: fees of leases with no manager assigned; no commission results from them.',
        "The month is that of the rent's collection date, not the due date."
      ]
    },
    faq: [
      {
        q: 'How is a commission calculated?',
        a: "Fees before tax of the collection multiplied by the manager's share as a percentage, rounded to the franc."
      },
      {
        q: 'Do fees come from a percentage or a flat fee?',
        a: 'Either, depending on the terms of the lease, the owner or the agency: the first level that is set applies.'
      },
      {
        q: 'Why is a month at zero?',
        a: 'No fees were collected over the period, or the fee terms are not set.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires “View financial reports”.' },
    related: [{ label: 'Commissions table', helpId: 'finance.commissions.tableau' }],
    keywords: ['total commissions', 'fees before tax', 'VAT', 'no manager']
  },
  {
    id: 'finance.commissions.tableau',
    kind: 'table',
    title: 'Commissions table by agent',
    summary:
      'One line per manager for the chosen month, with their share, number of collections, fees and commission due. Expand a line for the detail.',
    howToRead: {
      columns: [
        { key: 'agent', label: 'Agent', description: "The manager's name, or “No manager”." },
        {
          key: 'sharePercent',
          label: 'Share',
          description: 'The percentage of fees before tax due to them, or a dash (—) if no share is set.'
        },
        { key: 'feeCount', label: 'Collections', description: 'The number of collections that generated fees.' },
        { key: 'feesAmount', label: 'Fees excl. VAT', description: 'The total fees before tax on their leases.' },
        { key: 'shareAmount', label: 'Commission due', description: 'The total of their share of these fees.' }
      ],
      notes: [
        "Expanded, a line shows each collection: collection date, lease (link to its page), property, amount collected, fees and agent's share.",
        'The share shown in the “Share” column is the current share; the commission due uses the share of the day of each collection.',
        'Agents are sorted by decreasing commission; “No manager” is always last.'
      ]
    },
    faq: [
      {
        q: 'Why does the commission not match the current share?',
        a: 'The share is frozen at collection: if it has changed since, earlier collections keep the old one.'
      },
      {
        q: 'Why does the “Share” column show a dash?',
        a: 'No share is set for this staff member, so their commission is zero.'
      },
      {
        q: 'Can it be exported?',
        a: "Yes, with the table's export; the expanded detail is not exported separately."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Requires “View financial reports”.' },
    related: [{ label: 'Totals for the month', helpId: 'finance.commissions.indicateurs' }],
    keywords: ['commission by agent', 'collection detail', 'agent share']
  }
];

export default entries;
