import type { HelpEntry } from '../../../types';

/** "Personnel" zone of the finance module (en): salaries and subcontractors. */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------- Salaries (list)
  {
    id: 'finance.salaires.page',
    kind: 'page',
    title: 'Wages',
    summary:
      "Here you find your agency's employees and what you owe them. Each employee has a record where you enter wage notes and record what you pay.",
    purpose:
      'This screen tracks the staff whose salaries go into your accounts and, if you specify it, into the cost of a site. It is not payroll software: no contributions, gross or net pay are calculated. The amount you enter is the amount that is paid.',
    steps: [
      { title: 'Find an employee', detail: 'Type a name or a role in the search field.' },
      {
        title: 'See former employees',
        detail: 'By default only active employees are listed. Turn on "Include former employees" to show the others.'
      },
      {
        title: 'See who is waiting for payment',
        detail: 'Turn on "Amount owed to them" to keep only the employees you owe money to.'
      },
      { title: 'Open a record', detail: 'Click "View the page" (on a phone, tap the employee card).' },
      {
        title: 'Register an employee',
        detail:
          'Click "New employee", enter the name (required) and the role (optional), then "Save the employee". The record opens straight away.'
      }
    ],
    consequences: [
      'An employee is not an application user: they have no access. Their tracking account (what you owe them) is opened as soon as they are registered.',
      'No amount is calculated on this screen: "What is owed to them" comes from the employee\'s approved wage notes and approved payments.',
      'The screen offers no way to edit or delete an employee.'
    ],
    faq: [
      {
        q: 'An employee is missing from the list. Why?',
        a: 'By default only active employees are shown. Turn on "Include former employees" to find the others.'
      },
      {
        q: 'Where are contributions calculated?',
        a: 'Nowhere: ImmoTopia calculates no gross pay, net pay or contributions. Enter the amount to be paid directly.'
      },
      {
        q: 'What does "Advance of … to withhold" mean?',
        a: 'You paid this employee more than you owed. Their next approved wage notes will reduce this advance.'
      },
      {
        q: 'Registering a new employee is refused. Why?',
        a: 'This action requires the "Configure the finance module" right. Ask your agency administrator for it.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Viewing the screen requires "View third-party accounts"; registering an employee requires "Configure the finance module".'
    },
    related: [
      { label: 'How to read the employee list', helpId: 'finance.salaires.liste' },
      { label: 'Subcontractors', to: '/tenant/:tenantId/finance/tacherons' }
    ],
    keywords: ['salary', 'salaries', 'payroll', 'employee', 'staff', 'worker', 'mason', 'labour', 'salary advance']
  },
  {
    id: 'finance.salaires.liste',
    kind: 'table',
    title: 'Employee list',
    summary: 'One employee per row, with their role, what you owe them and their status.',
    howToRead: {
      columns: [
        { key: 'nom', label: 'Employee', description: "The employee's name." },
        { key: 'role', label: 'Role', description: 'Their job (mason, guard…). A dash means none was entered.' },
        {
          key: 'solde',
          label: 'What is owed to them',
          description:
            'The amount in FCFA that you owe them. "Nothing to pay them": account settled. "Advance of … to withhold": you paid more than was due.'
        },
        { key: 'statut', label: 'Status', description: 'Active or Inactive.' },
        { key: 'actions', label: 'Actions', description: '"View the page" opens the employee record.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'Employee in post: shown in the list by default.' },
        {
          value: 'INACTIVE',
          label: 'Inactive',
          description: 'Former employee: visible only if you turn on "Include former employees".'
        }
      ],
      notes: [
        'The list shows 20 employees per page. The "Export" button exports the whole filtered list, not just the page shown.',
        'The "What is owed to them" figure comes from the server: it only changes when a note is approved (it goes up) or a payment is approved (it goes down).'
      ]
    },
    faq: [
      {
        q: 'How do I see only the employees to pay?',
        a: 'Turn on the "Amount owed to them" filter: it keeps employees whose account is positive.'
      },
      {
        q: 'Why does the amount not change after I enter something?',
        a: 'A draft note or payment does not count. The amount changes when you approve the document, from the employee record.'
      },
      {
        q: 'The search finds nothing.',
        a: 'It searches name and role. Also check that "Include former employees" is on if the employee has left.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "View third-party accounts".' },
    related: [{ label: 'Wages overview', helpId: 'finance.salaires.page' }],
    keywords: ['employee list', 'employee balance', 'owed', 'advance']
  },

  // ---------------------------------------------------------------- Employee record
  {
    id: 'finance.salarie.page',
    kind: 'page',
    title: 'Employee record',
    summary:
      'An employee record shows what you owe them, their wage notes and their payments. This is where you enter a note, approve it, then record the payment.',
    purpose:
      'The process has two steps. The wage note records what you owe the employee for a month; the payment records what you paid them. The difference is "What is owed to them". There is no gross, net or contribution: a single amount, the one that is paid.',
    steps: [
      {
        title: "Enter the month's note",
        detail:
          'On the "Wage notes" tab, in the "Enter a wage note" card: year, month, amount to pay, then "Enter the note". It stays a draft.'
      },
      {
        title: 'Choose a site if needed',
        detail: "If this salary must count in a site's cost, choose it: the cost line then becomes required."
      },
      {
        title: 'Approve the note',
        detail: 'Click "Approve" on the draft row, then "Confirm the approval".'
      },
      {
        title: 'Record the payment',
        detail:
          'On the "Payments" tab, in the "Record a payment" card: date, amount paid, treasury account, then "Save the payment".'
      },
      {
        title: 'Approve the payment',
        detail: 'Click "Approve" on the draft row and confirm: this is when the money leaves the treasury.'
      },
      { title: 'Check the balance', detail: 'Read "What is owed to them" at the top of the record.' }
    ],
    consequences: [
      'Approving is irreversible: the screen offers no way to edit or cancel an approved document.',
      "Approving a note records the expense in the accounts (staff costs against salaries due, accounts 661 and 422, dated the 1st day of the note's month) and increases what you owe the employee.",
      "If the note has a site, its amount is added to that site's actual cost, under the chosen cost line. A closed site refuses the allocation.",
      'Approving a payment takes the money out of the chosen treasury account (the cash desk by default) and reduces what you owe. An amount above what is due is accepted: the excess becomes an advance.'
    ],
    faq: [
      {
        q: 'Can I enter two notes for the same month?',
        a: 'No: one note per employee per month. If one already exists, the screen shows the refusal message.'
      },
      {
        q: 'How do I correct a note that is already approved?',
        a: 'This screen offers no edit or cancel. Before approving, check the month, the amount and the site carefully.'
      },
      {
        q: 'Is a payment linked to a specific note?',
        a: 'No: you pay an employee, not a note. The payment reduces the total you owe them.'
      },
      {
        q: 'Can I pay a salary advance?',
        a: 'Yes. A payment above what is due is accepted and flagged. The account then shows "Advance to withhold".'
      },
      {
        q: 'Where are deductions and contributions?',
        a: 'There are none: the record calculates no deduction or contribution.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Viewing the record requires "View third-party accounts"; entering a note or payment requires "Create financial documents"; approving requires "Validate financial documents".'
    },
    related: [
      { label: 'What is owed to them', helpId: 'finance.salarie.solde' },
      { label: 'Wage notes', helpId: 'finance.salarie.notes' },
      { label: 'Payments', helpId: 'finance.salarie.reglements' },
      { label: 'Employee list', to: '/tenant/:tenantId/finance/salaires' }
    ],
    keywords: ['employee record', 'wage note', 'payroll', 'payment', 'salary advance', 'approve']
  },
  {
    id: 'finance.salarie.solde',
    kind: 'section',
    title: 'What is owed to them',
    summary:
      'The figure at the top of the record tells you whether you owe the employee money or whether they received an advance.',
    howToRead: {
      notes: [
        'Positive amount, "What is owed to them": you owe them this sum.',
        '"Advance to withhold": you paid more than was due. Their next approved notes will reduce this advance.',
        'Account settled: nothing is owed.',
        'The amount covers all periods. It is not rebuilt from the rows shown in the tabs, which may be partial.',
        "Only approved documents count: a draft changes nothing. The second box simply shows the employee's role."
      ]
    },
    faq: [
      {
        q: 'Why does the figure not move after I enter something?',
        a: 'The note or payment is still a draft. Approve it so that it counts.'
      },
      {
        q: 'Why is the amount shown as an advance?',
        a: 'The total of approved payments exceeds that of approved notes. A future approved note will reduce this advance.'
      },
      {
        q: 'Is it the net pay?',
        a: 'It is the amount you owe them, as is. ImmoTopia calculates no contribution or deduction.'
      }
    ],
    related: [{ label: 'Record overview', helpId: 'finance.salarie.page' }],
    keywords: ['balance', 'advance', 'owed', 'remaining to pay']
  },
  {
    id: 'finance.salarie.notes',
    kind: 'table',
    title: 'Wage notes',
    summary: 'One note per month: what you owe the employee for the period, with its site and status.',
    howToRead: {
      columns: [
        { key: 'periode', label: 'Month', description: 'The month and year of the salary.' },
        { key: 'montant', label: 'Amount', description: 'The amount to pay, in FCFA.' },
        {
          key: 'chantier',
          label: 'Construction site',
          description: 'The site whose cost will receive this salary. "No site": the note counts in no site.'
        },
        {
          key: 'poste',
          label: 'Cost line',
          description: 'The site item that receives the expense. A dash if no site.'
        },
        { key: 'saisi', label: 'Entered by', description: 'The person who entered the note.' },
        { key: 'statut', label: 'Status', description: 'The state of the note.' },
        { key: 'actions', label: 'Actions', description: '"Approve" only appears on a draft note.' }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'Entered but not yet counted: no accounting entry, no effect on what is owed.'
        },
        {
          value: 'VALIDATED',
          label: 'Approved',
          description: 'Recorded in the accounts. It can no longer be changed.'
        },
        { value: 'VOIDED', label: 'Cancelled', description: 'Cancelled note. This screen cannot cancel a note.' }
      ],
      notes: ['Search by site, item or author, and filter by status or month. Export covers the whole filtered list.']
    },
    steps: [
      { title: 'Check the note', detail: 'Check the month, the amount and the site.' },
      { title: 'Approve', detail: 'Click "Approve" on the row, then "Confirm the approval".' }
    ],
    consequences: [
      'Approval is irreversible: the expense is recorded in the accounts and what you owe the employee goes up by the note amount.',
      'If a site is given, its actual cost goes up by the same amount. The note is refused if the site is closed.'
    ],
    faq: [
      {
        q: 'I cannot see "Approve".',
        a: 'The button only appears on a draft note, and approving requires the "Validate financial documents" right.'
      },
      {
        q: 'Approval is refused. Why?',
        a: 'A note already approved cannot be approved twice, and a closed site accepts no more expenses. The message shown gives the cause.'
      },
      {
        q: 'Why is the accounting date the 1st of the month?',
        a: "The note has no date of its own: the accounting entry is dated the first day of the note's month."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Approving requires "Validate financial documents".' },
    related: [
      { label: 'Enter a wage note', helpId: 'finance.salarie.saisir-note' },
      { label: 'Employee payments', helpId: 'finance.salarie.reglements' }
    ],
    keywords: ['wage note', 'month', 'approve', 'draft', 'site']
  },
  {
    id: 'finance.salarie.saisir-note',
    kind: 'section',
    title: 'Enter a wage note',
    summary: "This form creates a month's note for this employee. The amount entered is the amount that will be paid.",
    purpose:
      'A note records what you owe the employee for a month. It is created as a draft: it only counts once approved.',
    steps: [
      { title: 'Year and month', detail: 'They are prefilled with the current month. Change them for another period.' },
      { title: 'Amount to pay', detail: 'Enter the amount in FCFA, greater than zero.' },
      {
        title: 'Site (optional)',
        detail: 'Choose a site so this salary goes into its cost. Without a site, the note is allocated to no site.'
      },
      {
        title: 'Cost line',
        detail:
          'This field appears as soon as a site is chosen and it is required. The screen may suggest an item whose name looks like "main-d\'œuvre" (labour): check it.'
      },
      { title: 'Enter the note', detail: 'Click "Enter the note". It appears in the table as a draft.' }
    ],
    consequences: [
      'The draft produces no accounting entry and does not change what you owe.',
      'At approval, a closed site refuses the note: choose a site that is still open.',
      'No contribution is calculated: the amount entered is the amount that will be paid.'
    ],
    faq: [
      {
        q: 'Why does the "Cost line" field appear?',
        a: 'Because you chose a site: the item shows where the expense is classified in its cost. Without a site, the field disappears.'
      },
      {
        q: 'A note already exists for this month.',
        a: 'There is only one note per employee per month. The refusal message says so; look at the existing row in the table.'
      },
      {
        q: 'Can I enter a past month?',
        a: 'Yes, choose the relevant year and month before entering the note.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "Create financial documents".' },
    related: [{ label: 'Wage notes', helpId: 'finance.salarie.notes' }],
    keywords: ['enter a note', 'new note', 'cost line', 'site', 'labour']
  },
  {
    id: 'finance.salarie.reglements',
    kind: 'table',
    title: 'Employee payments',
    summary: 'The payments made to the employee: date, amount and status. A payment targets no particular note.',
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'The payment date.' },
        { key: 'montant', label: 'Amount', description: 'The sum paid, in FCFA.' },
        { key: 'saisi', label: 'Entered by', description: 'The person who recorded the payment.' },
        { key: 'statut', label: 'Status', description: 'The state of the payment.' },
        { key: 'actions', label: 'Actions', description: '"Approve" only appears on a draft payment.' }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'Recorded, but the money has not yet left the treasury in your accounts.'
        },
        {
          value: 'VALIDATED',
          label: 'Approved',
          description: 'Recorded in the accounts. It can no longer be changed.'
        },
        { value: 'VOIDED', label: 'Cancelled', description: 'Cancelled payment. This screen cannot cancel a payment.' }
      ],
      notes: [
        'This tab only loads the list when opened. Filter by status or date; export covers the whole filtered list.'
      ]
    },
    steps: [
      { title: 'Check the row', detail: 'Check the date and the amount.' },
      { title: 'Approve', detail: 'Click "Approve" then "Confirm the approval".' }
    ],
    consequences: [
      "Approval is irreversible: the money leaves the payment's treasury account and what you owe the employee goes down by the same amount.",
      'An amount above what is due is accepted: the difference becomes a salary advance.'
    ],
    faq: [
      {
        q: 'My payment is recorded but the balance does not change.',
        a: 'It is a draft. The balance only moves at approval.'
      },
      {
        q: 'Can I link a payment to a note?',
        a: 'No: the payment reduces the total owed to the employee, without targeting a note.'
      },
      {
        q: 'Can I delete an approved payment?',
        a: 'This screen does not allow it. Check the date, amount and account before approving.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Approving requires "Validate financial documents".' },
    related: [
      { label: 'Record a payment', helpId: 'finance.salarie.saisir-reglement' },
      { label: 'Wage notes', helpId: 'finance.salarie.notes' }
    ],
    keywords: ['payment', 'transfer', 'salary payment', 'advance', 'approve']
  },
  {
    id: 'finance.salarie.saisir-reglement',
    kind: 'section',
    title: 'Record a payment',
    summary:
      'This form records a payment made to the employee. It is created as a draft and leaves the treasury at approval.',
    purpose: 'You pay an employee, not a note: the payment reduces what you owe them, whatever the month.',
    steps: [
      { title: 'Payment date', detail: 'It is prefilled with today.' },
      { title: 'Amount paid', detail: 'Enter the sum in FCFA, greater than zero.' },
      {
        title: 'Treasury account',
        detail: 'Choose where the money comes from. With no choice, it is the cash desk ("Default: the cash desk").'
      },
      { title: 'Record', detail: 'Click "Save the payment": it appears as a draft in the table.' },
      { title: 'Approve', detail: 'Approve the row from the table so that the payment counts.' }
    ],
    consequences: [
      'The draft produces no accounting entry. At approval, the sum is recorded as an outflow from the chosen treasury account, against salaries due (account 422).',
      'If the amount exceeds what is due, a warning is shown: the difference becomes a salary advance, to be deducted from the next notes. Nothing blocks the entry.',
      'A approved payment can no longer be changed.'
    ],
    faq: [
      {
        q: 'The amount exceeds what is due: is that possible?',
        a: 'Yes, it is a salary advance. The screen warns you but accepts it.'
      },
      {
        q: 'Which account should I choose?',
        a: 'The one the money really left (cash, bank, mobile money depending on your treasury accounts). With no choice, the cash desk is used.'
      },
      {
        q: 'Do I need a note to record a payment?',
        a: "No, but it is clearer to approve the month's note first to see what is due."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "Create financial documents".' },
    related: [{ label: 'Employee payments', helpId: 'finance.salarie.reglements' }],
    keywords: ['pay an employee', 'pay out', 'advance', 'treasury account', 'cash']
  },

  // ---------------------------------------------------------------- Subcontractors (list)
  {
    id: 'finance.tacherons.page',
    kind: 'page',
    title: 'Subcontractors',
    summary:
      "Here you find your agency's subcontractors and what you owe them. A subcontractor does not invoice: you agree a contract with them, they submit progress claims, then you pay them.",
    purpose:
      'A subcontractor is a craftsman or company you entrust with work on a site. Each contract covers a site and an cost line; its approved progress claims go into the site cost.',
    steps: [
      { title: 'Find a subcontractor', detail: 'Type a name or a trade, or filter by "Trade".' },
      {
        title: 'Keep the active ones',
        detail: 'Turn on "Active subcontractors only". The filter is off by default so that no debt is hidden.'
      },
      { title: 'Open a record', detail: 'Click "View the page" to see their contracts, progress claims and payments.' },
      {
        title: 'Register a subcontractor',
        detail:
          'Click "New subcontractor", enter the name (required) and the trade (optional), then "Save the subcontractor".'
      },
      { title: 'Agree contracts', detail: 'From the record: contracts are not agreed on this list.' }
    ],
    consequences: [
      "Registering opens the subcontractor's account (what you owe them) and opens their record. No contract is created at that point.",
      'No amount is calculated on this screen: "What is owed to them" is "approved progress claims minus approved payments".',
      'The screen offers no way to edit or delete a subcontractor.'
    ],
    faq: [
      {
        q: 'How is this different from a supplier?',
        a: 'A supplier invoices. A subcontractor agrees a contract then submits progress claims: their amounts are followed on their own record.'
      },
      {
        q: 'What does a negative amount mean?',
        a: 'You already paid an advance: their next approved progress claims will absorb it.'
      },
      {
        q: 'Registering a subcontractor is refused.',
        a: 'This action requires the "Configure the finance module" right. Ask your agency administrator for it.'
      },
      {
        q: 'Where is the retention?',
        a: 'It is not applied on this list or on the record: use the "Retentions" screen on an approved progress claim.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Viewing the screen requires "View third-party accounts"; registering a subcontractor requires "Configure the finance module".'
    },
    related: [
      { label: 'How to read the subcontractor list', helpId: 'finance.tacherons.liste' },
      { label: 'Retentions screen', helpId: 'finance.retenues.page' },
      { label: 'Wages', to: '/tenant/:tenantId/finance/salaires' }
    ],
    keywords: ['subcontractor', 'contractor', 'craftsman', 'contract', 'progress claim', 'works company']
  },
  {
    id: 'finance.tacherons.liste',
    kind: 'table',
    title: 'Subcontractor list',
    summary: 'One subcontractor per row, with their trade, what you owe them and their status.',
    howToRead: {
      columns: [
        { key: 'nom', label: 'Subcontractor', description: "The subcontractor's name." },
        {
          key: 'metier',
          label: 'Trade',
          description: 'Their trade (masonry, plumbing…). "Not provided" if none was entered.'
        },
        {
          key: 'du',
          label: 'What is owed to them',
          description:
            'Approved progress claims minus approved payments, all contracts together. A negative amount is an advance already paid.'
        },
        { key: 'statut', label: 'Status', description: 'Active or Inactive.' },
        { key: 'actions', label: 'Actions', description: '"View the page" opens the subcontractor record.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'Subcontractor in activity.' },
        {
          value: 'INACTIVE',
          label: 'Inactive',
          description: 'Deactivated subcontractor: it stays in the default list, as it may still be owed money.'
        }
      ],
      notes: [
        '"What is owed to them" is not the contract balance: the contract balance, what is left to execute, is read on the record, contract by contract.',
        'The "Export" button exports the whole filtered list.'
      ]
    },
    faq: [
      {
        q: 'Why does an inactive subcontractor appear?',
        a: 'The "Active subcontractors only" filter is off by default: hiding a subcontractor automatically would make a debt disappear.'
      },
      {
        q: 'How do I filter by trade?',
        a: 'Use the "Trade" filter, which offers the trades present in your list.'
      },
      {
        q: 'Why does the amount not change after I enter something?',
        a: 'A draft progress claim or payment does not count. The amount changes at approval, on the record.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "View third-party accounts".' },
    related: [{ label: 'Subcontractors overview', helpId: 'finance.tacherons.page' }],
    keywords: ['subcontractor list', 'owed', 'advance', 'trade']
  },

  // ---------------------------------------------------------------- Subcontractor record
  {
    id: 'finance.tacheron.page',
    kind: 'page',
    title: 'Subcontractor record',
    summary:
      'A subcontractor record brings together their contracts, the progress claims and their payments. This is where you agree a contract, approve a progress claim and pay the subcontractor.',
    purpose:
      'The process: you agree a contract (site, item, amount), the subcontractor submits progress claims, you approve them, then you pay them. Two figures are read separately: the contract balance (to execute) and what you owe them (to pay).',
    steps: [
      {
        title: 'Agree a contract',
        detail:
          'On the "Contracts" tab, in the "Agree a contract" card: site, item, reference, amount, date, then "Agree the contract".'
      },
      {
        title: 'Enter a progress claim',
        detail:
          'Under the progress claims table: date, amount, description of the work, then "Enter the progress claim". It stays a draft.'
      },
      { title: 'Approve the progress claim', detail: 'Click "Approve" on the row, then "Confirm the approval".' },
      {
        title: 'Record a payment',
        detail: 'On the "Payments" tab, in the "Record a payment" card: date, amount, then "Save the payment".'
      },
      { title: 'Approve the payment', detail: 'Approve the row: the money then leaves the cash desk.' }
    ],
    consequences: [
      "Approving a progress claim is irreversible: it is recorded in the accounts (the contract item's expense against subcontractors, account 402), the site's actual cost goes up by the same amount and the subcontractor becomes a creditor for that sum.",
      'Approving a payment is irreversible: the money leaves the cash desk and reduces what you owe the subcontractor.',
      'A contract overrun or a payment above what is due are not blocked: they are flagged, the overrun is recorded and the excess payment becomes an advance.',
      'A closed site no longer accepts allocations: the progress claim is refused there.'
    ],
    faq: [
      {
        q: 'What is the difference between "Contract balance" and "What is owed to them"?',
        a: 'The contract balance is what is left to execute on a contract. What you owe them is what is left to pay the subcontractor, all contracts together.'
      },
      {
        q: 'Can I exceed the agreed amount?',
        a: 'Yes: a progress claim that exceeds the contract is accepted and the contract shows "Overrun".'
      },
      {
        q: 'Why is no progress claim shown?',
        a: 'Progress claims attach to a contract: agree a contract first, then enter progress claims on it.'
      },
      {
        q: 'Where do I apply a retention?',
        a: 'Not on this record: the "Retentions" screen applies it to an already approved progress claim.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Viewing the record requires "View third-party accounts"; agreeing a contract requires "Manage construction sites"; entering a progress claim or payment requires "Create financial documents"; approving requires "Validate financial documents".'
    },
    related: [
      { label: 'Two figures not to confuse', helpId: 'finance.tacheron.soldes' },
      { label: 'Subcontractor contracts', helpId: 'finance.tacheron.marches' },
      { label: 'Progress claims', helpId: 'finance.tacheron.situations' },
      { label: 'Retentions screen', helpId: 'finance.retenues.page' }
    ],
    keywords: [
      'subcontractor record',
      'contract',
      'progress claim',
      'progress claim',
      'payment',
      'down payment',
      'overrun'
    ],
    tour: {
      steps: [
        {
          target: 'tacheron-soldes',
          title: 'Two distinct figures',
          description:
            'The contract balance says what is left to execute; "What is owed to them" says what is left to pay.'
        },
        {
          target: 'tacheron-marches',
          title: 'Their contracts',
          description: 'Each row is a contract on a site: agreed amount, approved progress claims, contract balance.'
        },
        {
          target: 'tacheron-convenir',
          title: 'Agree a contract',
          description: 'Choose the site and the cost line, then the reference and the amount. The site is then fixed.'
        },
        {
          target: 'tacheron-situations',
          title: 'Approve a progress claim',
          description: '"Approve" records the work: the site cost goes up and you become indebted. It is irreversible.'
        },
        {
          target: 'tacheron-saisir-situation',
          title: 'Enter a progress claim',
          description: 'Give the date and the amount and describe the work: the description is required.'
        }
      ]
    }
  },
  {
    id: 'finance.tacheron.soldes',
    kind: 'section',
    title: 'Two figures not to confuse',
    summary: 'The contract balance and "What is owed to them" answer two different questions. Do not mix them up.',
    howToRead: {
      notes: [
        'Contract balance = agreed amount minus approved progress claims: what is left to execute, contract by contract.',
        'What you owe them = approved progress claims minus approved payments: what is left to pay, all contracts together.',
        'Example: a contract of 1 000 000 FCFA, approved progress claims 400 000 FCFA, payments 100 000 FCFA. Contract balance 600 000 FCFA; what you owe them 300 000 FCFA.',
        'A subcontractor may have finished their contract and still be owed money, or have executed nothing and already received an advance (negative amount).',
        '"Contracts in progress" counts this subcontractor\'s active contracts.'
      ]
    },
    faq: [
      {
        q: 'Why is "What is owed to them" negative?',
        a: 'You paid an advance. Their next approved progress claims will absorb it.'
      },
      {
        q: 'The contract is finished but I still owe money. Is that normal?',
        a: 'Yes: the contract balance is about execution, not payment. Record and approve the remaining payments.'
      },
      {
        q: 'Does the screen recalculate these amounts?',
        a: 'No, they come ready-made from the server and only change when a progress claim or payment is approved.'
      }
    ],
    related: [{ label: 'Record overview', helpId: 'finance.tacheron.page' }],
    keywords: ['contract balance', 'balance', 'owed', 'remaining to pay', 'remaining to execute']
  },
  {
    id: 'finance.tacheron.marches',
    kind: 'table',
    title: 'Subcontractor contracts',
    summary: 'Each contract links this subcontractor to a site and an cost line, for an agreed amount.',
    howToRead: {
      columns: [
        { key: 'reference', label: 'Reference', description: 'The contract reference, unique in your agency.' },
        { key: 'chantier', label: 'Construction site', description: 'The site concerned.' },
        {
          key: 'poste',
          label: 'Cost line',
          description: 'The site item that receives the progress claims in its cost.'
        },
        { key: 'signe', label: 'Signed on', description: 'The contract signature date.' },
        { key: 'convenu', label: 'Agreed amount', description: 'The contract amount, in FCFA.' },
        {
          key: 'situe',
          label: 'Approved progress claims',
          description: 'The total of approved progress claims on this contract.'
        },
        {
          key: 'restant',
          label: 'Contract balance',
          description:
            'Agreed amount minus approved progress claims: what is left to execute. Negative in case of overrun.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"View the progress claims" shows this contract\'s progress claims under the table.'
        }
      ],
      statuses: [
        {
          value: 'OVERRUN',
          label: 'Overrun',
          description: 'Approved progress claims exceed the agreed amount. This is information, not a block.'
        }
      ],
      notes: [
        'Contract balance is not "What is owed to them": one is about execution, the other about payment.',
        'Search by reference, site or item; filter by site or signature date.'
      ]
    },
    faq: [
      {
        q: 'How do I see the progress claims of another contract?',
        a: 'Click "View the progress claims" on its row. By default, the first contract is shown.'
      },
      {
        q: 'Can I edit a contract?',
        a: 'This screen offers no edit or delete. Check the information before agreeing the contract.'
      },
      {
        q: 'What does "Overrun" mean?',
        a: 'The total of approved progress claims is higher than the agreed amount. The overrun is recorded.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "View third-party accounts".' },
    related: [
      { label: 'Agree a contract', helpId: 'finance.tacheron.convenir-marche' },
      { label: 'Progress claims', helpId: 'finance.tacheron.situations' }
    ],
    keywords: ['contract', 'subcontract', 'site', 'agreed amount', 'overrun']
  },
  {
    id: 'finance.tacheron.convenir-marche',
    kind: 'section',
    title: 'Agree a contract',
    summary:
      'This form records a contract between this subcontractor and a site, with the cost line and the agreed amount.',
    purpose:
      'The contract fixes where the work will be allocated. Every progress claim inherits it: the site and the item are not chosen again.',
    steps: [
      { title: 'Site', detail: 'Choose the site. A closed site no longer accepts allocations.' },
      {
        title: 'Cost line',
        detail: 'Required, never guessed: choose an active item. It will receive the progress claims in the site cost.'
      },
      {
        title: 'Contract reference',
        detail: 'Enter a reference, for example MAR-2026-014. It must be unique in your agency.'
      },
      { title: 'Agreed amount', detail: 'In FCFA, greater than zero.' },
      { title: 'Signature date', detail: 'It is prefilled with today.' },
      { title: 'Submit the form', detail: 'Click "Agree the contract".' }
    ],
    consequences: [
      'Agreeing a contract writes nothing in the accounts and does not change the site cost: entries appear when progress claims are approved.',
      'If the reference already exists, the contract is refused; a deactivated item is also refused.',
      'This screen cannot edit or delete a contract.'
    ],
    faq: [
      {
        q: 'I cannot click "Agree the contract".',
        a: 'The button stays greyed out until the site, the item, the reference and an amount above zero are filled in.'
      },
      {
        q: 'The same reference already exists.',
        a: 'Each contract has a unique reference in the agency. Choose another one.'
      },
      {
        q: 'Why is an item missing from the list?',
        a: 'Only active cost lines are offered. A deactivated item cannot receive a new contract.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "Manage construction sites".' },
    related: [
      { label: 'Subcontractor contracts', helpId: 'finance.tacheron.marches' },
      { label: 'Sites', to: '/tenant/:tenantId/finance/chantiers' }
    ],
    keywords: ['new contract', 'subcontractor contract', 'reference', 'cost line', 'site']
  },
  {
    id: 'finance.tacheron.situations',
    kind: 'table',
    title: 'Progress claims',
    summary:
      'The progress claims of the contract shown: work done, dated and priced, which you approve to enter it in the site cost.',
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'The progress claim date.' },
        { key: 'description', label: 'Description', description: 'The work done, as entered.' },
        { key: 'montant', label: 'Amount', description: 'The progress claim amount, in FCFA.' },
        { key: 'saisie', label: 'Entered by', description: 'The person who entered the progress claim.' },
        { key: 'statut', label: 'Status', description: 'The state of the progress claim.' },
        { key: 'actions', label: 'Actions', description: '"Approve" only appears on a draft progress claim.' }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'Entered but not yet counted: no entry, no effect on the site cost.'
        },
        { value: 'VALIDATED', label: 'Approved', description: 'Recorded. It can no longer be changed.' },
        {
          value: 'VOIDED',
          label: 'Cancelled',
          description: 'Cancelled progress claim. This screen cannot cancel a progress claim.'
        }
      ],
      notes: [
        'The table shows the progress claims of one contract at a time: switch contract with "View the progress claims".',
        'The contract balance and any overrun are shown just above the table.'
      ]
    },
    steps: [
      { title: 'Check the progress claim', detail: 'Check the date, amount and description against actual progress.' },
      { title: 'Approve', detail: 'Click "Approve" then "Confirm the approval".' }
    ],
    consequences: [
      "Approval is irreversible: the progress claim is recorded, the site cost goes up by the same amount on the contract's item, and the subcontractor becomes a creditor for that sum.",
      'It is refused if the site is closed. A contract overrun does not prevent approval: it is recorded.',
      'Approving a progress claim does not pay the subcontractor: payment is made through a payment.'
    ],
    faq: [
      {
        q: 'Why did the site cost go up?',
        a: "Because you approved a progress claim: its amount is added to the actual cost, under the contract's item."
      },
      {
        q: 'Approval is refused.',
        a: 'A progress claim already approved cannot be approved again, and a closed site accepts no more expenses. The message gives the cause.'
      },
      {
        q: 'I cannot see "Approve".',
        a: 'It only appears on a draft progress claim, and requires the "Validate financial documents" right.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Approving requires "Validate financial documents".' },
    related: [
      { label: 'Enter a progress claim', helpId: 'finance.tacheron.saisir-situation' },
      { label: 'Subcontractor contracts', helpId: 'finance.tacheron.marches' }
    ],
    keywords: ['progress claim', 'progress', 'progress claim', 'approve', 'site cost']
  },
  {
    id: 'finance.tacheron.saisir-situation',
    kind: 'section',
    title: 'Enter a progress claim',
    summary:
      'This form records the progress of a contract: date, amount and description of the work. It is created as a draft.',
    purpose:
      'A progress claim attaches to the contract shown, never to the subcontractor alone. The site and the item are those of the contract.',
    steps: [
      {
        title: 'Choose the contract',
        detail: 'Check the contract shown; switch with "View the progress claims" in the contracts table.'
      },
      { title: 'Progress claim date', detail: 'It is prefilled with today.' },
      { title: 'Progress claim amount', detail: 'In FCFA, greater than zero.' },
      { title: 'Description of the work', detail: 'Required. For example: ground-floor walls raised, 60%.' },
      { title: 'Enter the progress claim', detail: 'Click "Enter the progress claim": it appears as a draft.' }
    ],
    consequences: [
      'The draft produces no accounting entry and changes neither the site cost nor what you owe.',
      'If the amount exceeds the contract balance, a warning is shown but entry remains possible: the contract will show an overrun.',
      'The description is required so that the amount can be justified later.'
    ],
    faq: [
      {
        q: 'The "Enter the progress claim" button is greyed out.',
        a: 'An amount above zero and a description are needed.'
      },
      {
        q: 'The amount exceeds the contract: is that blocked?',
        a: 'No. The screen warns, records the progress claim, and the contract will show an overrun.'
      },
      {
        q: 'How does the progress claim count in the cost?',
        a: 'Only after approval, in the progress claims table.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "Create financial documents".' },
    related: [{ label: 'Progress claims', helpId: 'finance.tacheron.situations' }],
    keywords: ['new progress claim', 'progress', 'description of work', 'draft']
  },
  {
    id: 'finance.tacheron.reglements',
    kind: 'table',
    title: 'Subcontractor payments',
    summary:
      'The sums paid to the subcontractor: date, amount and status. A payment targets no particular progress claim.',
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'The payment date.' },
        { key: 'montant', label: 'Amount', description: 'The sum paid, in FCFA.' },
        { key: 'saisi', label: 'Entered by', description: 'The person who recorded the payment.' },
        { key: 'statut', label: 'Status', description: 'The state of the payment.' },
        { key: 'actions', label: 'Actions', description: '"Approve" only appears on a draft payment.' }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'Recorded, but the cash desk is not yet touched in your accounts.'
        },
        { value: 'VALIDATED', label: 'Approved', description: 'Recorded. It can no longer be changed.' },
        { value: 'VOIDED', label: 'Cancelled', description: 'Cancelled payment. This screen cannot cancel a payment.' }
      ],
      notes: [
        'This tab only loads the list when opened. Filter by status, date or amount; export covers the whole filtered list.'
      ]
    },
    steps: [
      { title: 'Check the row', detail: 'Check the date and the amount.' },
      { title: 'Approve', detail: 'Click "Approve" then "Confirm the approval".' }
    ],
    consequences: [
      'Approval is irreversible: the money leaves the cash desk and reduces what you owe the subcontractor.',
      'A payment above what is due is accepted: it is a down payment, which their next approved progress claims will absorb.'
    ],
    faq: [
      {
        q: 'The payment is recorded but "What is owed to them" does not change.',
        a: 'The payment is still a draft: approve it.'
      },
      {
        q: 'Can I choose the treasury account?',
        a: 'Not on this screen: the sum is recorded as an outflow from the cash desk.'
      },
      {
        q: 'Can I link a payment to a progress claim?',
        a: 'No: you pay a subcontractor, not a progress claim.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Approving requires "Validate financial documents".' },
    related: [{ label: 'Record a payment', helpId: 'finance.tacheron.saisir-reglement' }],
    keywords: ['payment', 'subcontractor payment', 'down payment', 'advance', 'approve']
  },
  {
    id: 'finance.tacheron.saisir-reglement',
    kind: 'section',
    title: 'Record a payment',
    summary:
      'This form records a payment made to the subcontractor. It is created as a draft and leaves the cash desk at approval.',
    purpose:
      'You pay a subcontractor, not a progress claim: the payment reduces what you owe them, all contracts together.',
    steps: [
      { title: 'Payment date', detail: 'It is prefilled with today.' },
      { title: 'Payment amount', detail: 'In FCFA, greater than zero.' },
      { title: 'Record', detail: 'Click "Save the payment": it appears as a draft.' },
      { title: 'Approve', detail: 'Approve the row from the table so that the payment counts.' }
    ],
    consequences: [
      'The draft produces no accounting entry. At approval, the sum is recorded as an outflow from the cash desk against subcontractors (account 402).',
      'If the amount exceeds what you owe them, a warning is shown: the payment will be an advance, which their next approved progress claims will absorb. Nothing blocks the entry.'
    ],
    faq: [
      {
        q: 'Can I pay a down payment before any progress claim?',
        a: 'Yes. The payment is accepted and "What is owed to them" becomes negative until the next approved progress claim.'
      },
      {
        q: 'The button is greyed out.',
        a: 'An amount above zero is needed.'
      },
      {
        q: 'Is there a retention on this form?',
        a: 'No: it is handled in the "Retentions" screen.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "Create financial documents".' },
    related: [
      { label: 'Subcontractor payments', helpId: 'finance.tacheron.reglements' },
      { label: 'Retentions screen', helpId: 'finance.retenues.page' }
    ],
    keywords: ['pay a subcontractor', 'down payment', 'advance', 'payment', 'cash']
  }
];

export default entries;
