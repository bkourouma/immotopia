import type { HelpEntry } from '../../../types';

/** Zone « comptabilite » du module finance (en). */
const entries: HelpEntry[] = [
  {
    id: 'finance.journal.page',
    kind: 'page',
    title: 'Accounting journal',
    summary:
      'The journal lists, date by date, every accounting entry of your agency for the chosen period. Use it to check what has been recorded and to export for your accounting firm.',
    purpose:
      'Every operation recorded by the agency leaves an entry: an amount posted to the debit of one or more accounts and to the credit of one or more others, for the same total. This is the agency’s own accounting (rental management, suppliers, sites); co-owned buildings have their own accounting.\n\nThe Journal, General ledger, Trial balance and Principals tabs read the same entries, from the detail to the summary. This screen is read-only: nothing can be changed here.',
    steps: [
      {
        title: 'Choose the period',
        detail:
          'Above the table, enter two dates or use a shortcut: “Current month”, “Previous month”, “Current year”, “Previous year”.'
      },
      {
        title: 'Filter the entries',
        detail:
          'Type a label, a reference or a description in “Search”, pick a “Journal”, or enter an account number (or its beginning) in “Account”.'
      },
      {
        title: 'Read an entry',
        detail: 'Click “View lines” under the label: you see every account affected, with its debit or credit.'
      },
      {
        title: 'Check the totals',
        detail:
          'Under the table, “Total debit” and “Total credit” cover the whole period and all your filters, not only the page shown.'
      },
      {
        title: 'Refresh if needed',
        detail:
          'If a recent operation is missing, click “Refresh accounting entries”, then wait for the update to finish.'
      },
      {
        title: 'Export',
        detail: 'Click “Export to Excel” or “Export as CSV” to send the journal to your accounting firm.'
      }
    ],
    consequences: [
      'This screen does not change any entry. Rental management entries are updated automatically in the background.',
      'An export includes every entry of the period that matches your filters, not only the page shown. It waits for the entries update to finish before producing the file.',
      'If you choose nothing, the period runs from 1 January of the current year to today.'
    ],
    faq: [
      {
        q: 'Why does a recent operation not appear?',
        a: 'Rental management entries are updated in the background. Click “Refresh accounting entries” and wait until the message “Updating accounting entries…” disappears.'
      },
      {
        q: 'What does “Reversed” mean?',
        a: 'The entry has been cancelled by an opposite entry. It stays visible in the journal to keep a trace of what happened.'
      },
      {
        q: 'Are total debit and total credit always equal?',
        a: 'Yes, in principle: every entry posts as much to the debit as to the credit. If you notice a difference, report it to the vendor.'
      },
      {
        q: 'I cannot see the Accounting page. Why?',
        a: 'It requires the “View financial reports” permission. Ask your agency administrator for it.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View financial reports” permission.'
    },
    related: [
      {
        label: 'Period, refresh and exports',
        helpId: 'finance.comptabilite.periode'
      },
      {
        label: 'Read an entry',
        helpId: 'finance.journal.ecriture'
      },
      {
        label: 'General ledger',
        helpId: 'finance.grand-livre.page'
      },
      {
        label: 'Trial balance',
        helpId: 'finance.balance-generale.page'
      }
    ],
    keywords: [
      'accounting',
      'entry',
      'entries',
      'journal',
      'document',
      'debit',
      'credit',
      'accounting export',
      'accounting firm',
      'reversal'
    ],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'comptabilite-periode',
          title: 'Choose the period',
          description: 'All accounting views cover this period. By default: from 1 January to today.'
        },
        {
          target: 'comptabilite-synchro',
          title: 'Entries up to date',
          description: 'The time of the last update is shown here. “Refresh accounting entries” forces a new update.'
        },
        {
          target: 'journal-tableau',
          title: 'The entries',
          description: 'One line per entry. “View lines” shows the debited and credited accounts.'
        },
        {
          target: 'comptabilite-export',
          title: 'Export',
          description: 'Excel or CSV, with the period and filters of the screen, for your accounting firm.'
        }
      ]
    }
  },
  {
    id: 'finance.comptabilite.periode',
    kind: 'section',
    title: 'Period, refresh and exports',
    summary:
      'This bar, shared by the four accounting tabs, sets the period read, shows whether entries are up to date and lets you export.',
    purpose:
      'Rental management entries are produced in the background. The bar shows the time of the last update and lets you restart it.',
    howToRead: {
      notes: [
        'Period: two dates, start and end included. If you choose nothing, from 1 January of the current year to today (the financial year is the calendar year). The period is kept in the page address, so you can share it.',
        'Shortcuts: “Current month”, “Previous month”, “Current year”, “Previous year”.',
        '“Updated at 14:30”: time of the last successful update. If it failed, the message “The latest update of accounting entries failed.” is shown.',
        'Banner “Updating accounting entries…”: the screen refreshes itself every 3 seconds until the update is finished.',
        'Under the table, the note “All amounts are in FCFA” applies to every amount column.'
      ]
    },
    steps: [
      {
        title: 'Change the period',
        detail: 'Enter the dates or click a shortcut. The table goes back to the first page.'
      },
      {
        title: 'Refresh the entries',
        detail: 'Click “Refresh accounting entries”: the update is restarted, then the screen reloads.'
      },
      {
        title: 'Export',
        detail: 'Click “Export to Excel” or “Export as CSV”. The file is downloaded.'
      }
    ],
    consequences: [
      'The export uses the period and filters of the screen, over all pages. Only one format downloads at a time.',
      'If the download fails, the message “The download failed.” is shown: start the export again.',
      'Refreshing the entries deletes and changes nothing: the calculation can safely be restarted.'
    ],
    faq: [
      {
        q: 'Why does a month’s figure not match the year’s?',
        a: 'Each screen reads the chosen period. Check the dates at the top before comparing two reports.'
      },
      {
        q: 'Is the export slow?',
        a: 'It waits for the entries to be up to date before producing the file: expect a short delay if an update is in progress.'
      },
      {
        q: 'Are co-owned buildings’ entries included?',
        a: 'No. This screen covers the agency’s accounting; co-owned buildings have their own accounting.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View financial reports” permission.'
    },
    related: [
      {
        label: 'Accounting journal',
        helpId: 'finance.journal.page'
      },
      {
        label: 'General ledger',
        helpId: 'finance.grand-livre.page'
      }
    ],
    keywords: [
      'period',
      'financial year',
      'dates',
      'export',
      'excel',
      'csv',
      'refresh',
      'synchronization',
      'update',
      'accounting firm'
    ]
  },
  {
    id: 'finance.journal.tableau',
    kind: 'table',
    title: 'Journal table',
    summary: 'Each line is an accounting entry, sorted from oldest to newest. Expand it to see the accounts affected.',
    howToRead: {
      columns: [
        {
          key: 'date',
          label: 'Date',
          description: 'The date of the entry.'
        },
        {
          key: 'journal',
          label: 'Journal',
          description:
            'The code of the journal in which the entry is filed (the full name is shown in the “Journal” filter).'
        },
        {
          key: 'reference',
          label: 'Reference',
          description: 'The number of the document that gave rise to the entry. Use it to find the original document.'
        },
        {
          key: 'libelle',
          label: 'Label',
          description:
            'What the entry describes. “View lines” expands the detail; the orange “Reversed” tag marks an entry cancelled by an opposite entry.'
        },
        {
          key: 'debit',
          label: 'Debit',
          description: 'Total of the amounts posted to the debit in the entry.'
        },
        {
          key: 'credit',
          label: 'Credit',
          description: 'Total of the amounts posted to the credit. It equals the debit: the entry is balanced.'
        }
      ],
      notes: [
        'Under the table, “Total debit” and “Total credit” add up the whole period and all filters, not only the page shown.',
        'On a phone, each entry becomes a card with the same information.'
      ]
    },
    steps: [
      {
        title: 'Search for an entry',
        detail:
          'Use “Search” (label, document or description), “Journal” or “Account”. “Clear filters” resets everything.'
      },
      {
        title: 'Open an entry',
        detail: 'Click “View lines”; “Hide lines” closes it.'
      },
      {
        title: 'Change page',
        detail: 'Use the pagination under the table (50 entries per page by default, 100 at most).'
      }
    ],
    consequences: [
      'The table is read-only: no entry can be changed or deleted here.',
      'Expanding an entry has no effect on the data.'
    ],
    faq: [
      {
        q: 'How do I find all the entries of an account?',
        a: 'Enter the account number, or its beginning, in “Account”. All entries that touch this account are shown.'
      },
      {
        q: 'Why is my table empty?',
        a: 'No entry matches the period and the filters. Widen the period or click “Clear filters”.'
      },
      {
        q: 'Where can I read the full name of a journal?',
        a: 'In the “Journal” filter list, which shows the code followed by its label.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View financial reports” permission.'
    },
    related: [
      {
        label: 'Read an entry',
        helpId: 'finance.journal.ecriture'
      },
      {
        label: 'Period, refresh and exports',
        helpId: 'finance.comptabilite.periode'
      }
    ],
    keywords: ['entries', 'journal', 'reference', 'document', 'label', 'reversed', 'cancellation']
  },
  {
    id: 'finance.journal.ecriture',
    kind: 'section',
    title: 'Read an entry',
    summary:
      'The detail of an entry shows each account affected and the direction of the movement: debit or credit. Total debit always equals total credit.',
    purpose:
      'An entry tells an operation in two parts: where the money or the debt arrives (the debit) and where it comes from (the credit). The detail lets you check that a rent, a payout or an expense was posted to the right accounts.',
    howToRead: {
      columns: [
        {
          key: 'compte',
          label: 'Account',
          description: 'The number of the account in the agency’s chart of accounts.'
        },
        {
          key: 'intitule',
          label: 'Label',
          description: 'The name of the account.'
        },
        {
          key: 'libelle',
          label: 'Label',
          description: 'The text specific to this line.'
        },
        {
          key: 'tiers',
          label: 'Party',
          description:
            'The person concerned (owner, tenant, supplier…) when the line is linked to a third-party account; a dash otherwise.'
        },
        {
          key: 'nature',
          label: 'Nature',
          description:
            'For principals’ funds only: “Current account”, “Security deposit” or “To be allocated”. A dash otherwise.'
        },
        {
          key: 'debit',
          label: 'Debit',
          description: 'Amount posted to the debit of this account.'
        },
        {
          key: 'credit',
          label: 'Credit',
          description: 'Amount posted to the credit of this account.'
        }
      ],
      notes: [
        'Debit lines are listed first, as in a paper journal, then sorted by account number.',
        'In the entry header, the date, the journal and the reference (the document) place the operation.'
      ]
    },
    steps: [
      {
        title: 'Spot the entry',
        detail: 'Use the date, the reference or the label in the table.'
      },
      {
        title: 'Expand the lines',
        detail: 'Click “View lines” under the label.'
      },
      {
        title: 'Check the balance',
        detail: 'Add up the Debit column and the Credit column: both totals are identical.'
      }
    ],
    consequences: [
      'Read-only: expanding or collapsing saves nothing.',
      'An entry marked “Reversed” was cancelled by an opposite entry; both remain visible.'
    ],
    faq: [
      {
        q: 'What do debit and credit mean?',
        a: 'They are the two columns of an entry. Every operation is posted as many times to the debit as to the credit.'
      },
      {
        q: 'Where can I see all the movements of one account?',
        a: 'In the “General ledger” tab, by choosing this account.'
      },
      {
        q: 'Why does the Party column show a dash?',
        a: 'The line is not linked to any person: this is normal for most expense or income accounts.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View financial reports” permission.'
    },
    related: [
      {
        label: 'Journal table',
        helpId: 'finance.journal.tableau'
      },
      {
        label: 'General ledger',
        helpId: 'finance.grand-livre.page'
      }
    ],
    keywords: ['debit', 'credit', 'entry', 'entry line', 'account', 'party', 'document']
  },
  {
    id: 'finance.grand-livre.page',
    kind: 'page',
    title: 'General ledger',
    summary:
      'The general ledger groups entries account by account. For each account it shows where it starts, what happened and where it ends over the period.',
    purpose:
      'With no account chosen, the screen lists the accounts that moved during the period, with their opening and closing balances. Click an account to see its movements one by one, with a balance that changes line after line.\n\nThe period is set at the top of the screen, as in the journal.',
    steps: [
      {
        title: 'Set the period',
        detail: 'Dates or shortcuts above the table.'
      },
      {
        title: 'Find an account',
        detail: 'In the summary, type a number or a name in “Search”; or pick it directly in the “Account” list.'
      },
      {
        title: 'Open an account',
        detail:
          'Click its number, or choose it in “Choose an account”. The “Previous account” and “Next account” buttons walk you through the chart.'
      },
      {
        title: 'Refine',
        detail: 'Within an account, search for a label or a document, or limit to one “Journal”.'
      },
      {
        title: 'Export',
        detail: '“Export to Excel” or “Export as CSV” covers the displayed account, or all accounts if none is chosen.'
      }
    ],
    consequences: [
      'Read-only: no movement can be changed here.',
      'An account’s balance stays that of the whole account, even when you filter the lines; the “Filtered lines” totals show what the filters keep.'
    ],
    faq: [
      {
        q: 'Why does an account not appear in the summary?',
        a: 'Only accounts with movements in the chosen period are listed. Widen the period.'
      },
      {
        q: 'What does a negative balance mean?',
        a: 'The balance is calculated as debit minus credit: a negative balance (in red) is a credit balance, a positive balance is a debit balance.'
      },
      {
        q: 'What does “Account not found” mean?',
        a: 'The requested number does not exist in the agency’s chart of accounts. Go back to the summary with the button provided.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View financial reports” permission.'
    },
    related: [
      {
        label: 'Account summary',
        helpId: 'finance.grand-livre.recap'
      },
      {
        label: 'Account movements',
        helpId: 'finance.grand-livre.compte'
      },
      {
        label: 'Accounting journal',
        helpId: 'finance.journal.page'
      }
    ],
    keywords: ['general ledger', 'account', 'balance', 'movements', 'opening', 'closing', 'chart of accounts']
  },
  {
    id: 'finance.grand-livre.recap',
    kind: 'table',
    title: 'Account summary',
    summary:
      'One account per line: its opening balance, its movements for the period and its closing balance. Click a number to open the account.',
    howToRead: {
      columns: [
        {
          key: 'compte',
          label: 'Account',
          description: 'The account number. A click opens its movements.'
        },
        {
          key: 'intitule',
          label: 'Label',
          description: 'The name of the account.'
        },
        {
          key: 'ouverture',
          label: 'Opening',
          description:
            'The balance at the start of the period, that is everything that happened before. Red if negative.'
        },
        {
          key: 'debit',
          label: 'Debit',
          description: 'Total posted to the debit during the period.'
        },
        {
          key: 'credit',
          label: 'Credit',
          description: 'Total posted to the credit during the period.'
        },
        {
          key: 'cloture',
          label: 'Closure',
          description: 'The balance at the end of the period: opening + debit − credit.'
        }
      ],
      notes: [
        'Only accounts that moved during the period are listed (50 per page).',
        'Under the table, the “Total” line adds up debit, credit and closing balance of all accounts kept.'
      ]
    },
    steps: [
      {
        title: 'Search',
        detail: 'Type an account number or name.'
      },
      {
        title: 'Open',
        detail: 'Click the account number (or the card, on a phone).'
      }
    ],
    faq: [
      {
        q: 'How do I read Opening and Closing?',
        a: 'Opening + Debit − Credit = Closing. A red figure is a negative balance, hence a credit balance.'
      },
      {
        q: 'Where can I see the same thing in a single balanced view?',
        a: 'In the “Trial balance” tab, which shows debit and credit separately for each account.'
      },
      {
        q: 'Can I export this summary?',
        a: 'Yes: “Export to Excel” or “Export as CSV” covers the accounts of the period, with your search.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View financial reports” permission.'
    },
    related: [
      {
        label: 'Account movements',
        helpId: 'finance.grand-livre.compte'
      },
      {
        label: 'Trial balance',
        helpId: 'finance.balance-generale.page'
      }
    ],
    keywords: ['accounts with movements', 'opening balance', 'closing balance']
  },
  {
    id: 'finance.grand-livre.compte',
    kind: 'table',
    title: 'Account movements',
    summary: 'All the entry lines of the chosen account over the period, in order, with the balance after each line.',
    howToRead: {
      columns: [
        {
          key: 'date',
          label: 'Date',
          description: 'The date of the entry.'
        },
        {
          key: 'journal',
          label: 'Journal',
          description: 'The code of the entry’s journal.'
        },
        {
          key: 'piece',
          label: 'Attachment',
          description: 'The reference of the original document, to find the document.'
        },
        {
          key: 'libelle',
          label: 'Label',
          description: 'The text of the line.'
        },
        {
          key: 'tiers',
          label: 'Party',
          description: 'The person linked to the line, or a dash if there is none.'
        },
        {
          key: 'nature',
          label: 'Nature',
          description: 'For principals’ funds: current account, security deposit or to be allocated; a dash otherwise.'
        },
        {
          key: 'debit',
          label: 'Debit',
          description: 'Amount posted to the debit of this account.'
        },
        {
          key: 'credit',
          label: 'Credit',
          description: 'Amount posted to the credit of this account.'
        },
        {
          key: 'solde',
          label: 'Balance',
          description:
            'The balance of the account after this line, calculated as debit minus credit starting from the opening balance. Red if negative.'
        }
      ],
      notes: [
        '100 lines per page. The displayed balance stays that of the account, filters ignored.',
        'Under the table, “Filtered lines” gives the total debit and credit of the lines kept by your filters.'
      ]
    },
    steps: [
      {
        title: 'Choose the account',
        detail: 'Click an account in the summary, or select it in “Choose an account”.'
      },
      {
        title: 'Read the summary',
        detail: 'The four cards at the top give the opening balance, the totals and the closing balance.'
      },
      {
        title: 'Filter',
        detail: '“Search” (label or document) and “Journal” reduce the lines.'
      },
      {
        title: 'Change account',
        detail: '“Previous account” and “Next account”.'
      }
    ],
    faq: [
      {
        q: 'Why does the balance not move when I filter?',
        a: 'The balance is that of the whole account: the filter does not remove its movements. Only the “Filtered lines” totals change.'
      },
      {
        q: 'How do I go back to the list of all accounts?',
        a: 'Clear the “Account” selector with the cross, or, if the account is not found, use “Back to summary”.'
      },
      {
        q: 'What is the Attachment column for?',
        a: 'It repeats the entry reference: it lets you find the original document and the same entry in the journal.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View financial reports” permission.'
    },
    related: [
      {
        label: 'Account synthesis',
        helpId: 'finance.grand-livre.synthese'
      },
      {
        label: 'Read an entry',
        helpId: 'finance.journal.ecriture'
      }
    ],
    keywords: ['running balance', 'movements', 'document', 'account lines']
  },
  {
    id: 'finance.grand-livre.synthese',
    kind: 'section',
    title: 'Account synthesis',
    summary:
      'Four figures sum up the account over the period: where it starts, what came in and went out, where it ends.',
    howToRead: {
      notes: [
        'Opening balance: the balance on the first day of the period, everything before included.',
        'Total debit and Total credit: the movements of the period only.',
        'Closing balance: opening balance + total debit − total credit. It is the last balance in the table.',
        'A red figure is negative: the balance is then a credit balance.'
      ]
    },
    faq: [
      {
        q: 'Why does the opening balance change when I move the start date?',
        a: 'It takes into account everything that happened before the new start date.'
      },
      {
        q: 'Do filters change these figures?',
        a: 'No. The synthesis stays that of the whole account over the period.'
      },
      {
        q: 'Are these figures exported?',
        a: 'The exported file includes the account, its lines and its balances. Check the period before exporting.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View financial reports” permission.'
    },
    related: [
      {
        label: 'Account movements',
        helpId: 'finance.grand-livre.compte'
      }
    ],
    keywords: ['opening balance', 'closing balance', 'total debit', 'total credit']
  },
  {
    id: 'finance.balance-generale.page',
    kind: 'page',
    title: 'Trial balance',
    summary:
      'The trial balance shows all the agency’s accounts at a glance: opening balance, movements of the period and closing balance, each in debit and credit.',
    purpose:
      'It is the consistency check of the accounting: total debits must equal total credits. Accounting firms ask for it at the end of a period.\n\nA click on an account number opens its general ledger, over the same period.',
    steps: [
      {
        title: 'Set the period',
        detail: 'Dates or shortcuts above the table.'
      },
      {
        title: 'Filter',
        detail: '“Search” (number or name), “Class” (1 to 9) or “Hide settled accounts”.'
      },
      {
        title: 'Check the totals',
        detail: 'The “Total” line under the table must show the same amount in debit and in credit.'
      },
      {
        title: 'Consult an account',
        detail: 'Click its number to open the general ledger.'
      },
      {
        title: 'Export',
        detail: '“Export to Excel” or “Export as CSV”.'
      }
    ],
    consequences: [
      'Read-only: nothing can be changed here.',
      'If the trial balance were not balanced, a red banner would appear: “The trial balance is not balanced: please report this to the vendor.”'
    ],
    faq: [
      {
        q: 'What does Class mean?',
        a: 'It is the first digit of the account number: it groups accounts into the main families of the chart of accounts.'
      },
      {
        q: 'What does “Hide settled accounts” do?',
        a: 'It removes the accounts whose closing balance is zero, to keep only those that carry an amount.'
      },
      {
        q: 'Do the totals take my filters into account?',
        a: 'Yes. The list and its totals are those of the chosen search and class.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View financial reports” permission.'
    },
    related: [
      {
        label: 'Trial balance table',
        helpId: 'finance.balance-generale.tableau'
      },
      {
        label: 'General ledger',
        helpId: 'finance.grand-livre.page'
      }
    ],
    keywords: [
      'trial balance',
      'general trial balance',
      'account balance',
      'balance check',
      'class',
      'settled accounts'
    ]
  },
  {
    id: 'finance.balance-generale.tableau',
    kind: 'table',
    title: 'Trial balance table',
    summary:
      'One line per account, with three blocks: opening balance, movements of the period, closing balance. Each block has a debit column and a credit column.',
    howToRead: {
      columns: [
        {
          key: 'compte',
          label: 'Account',
          description: 'The account number. A click opens its general ledger over the same period.'
        },
        {
          key: 'intitule',
          label: 'Label',
          description: 'The name of the account.'
        },
        {
          key: 'ouvertureDebit',
          label: 'Opening balance, Debit',
          description: 'The balance at the start of the period, when it is a debit balance.'
        },
        {
          key: 'ouvertureCredit',
          label: 'Opening balance, Credit',
          description: 'The balance at the start of the period, when it is a credit balance.'
        },
        {
          key: 'mouvementsDebit',
          label: 'Period movements, Debit',
          description: 'Total posted to the debit during the period.'
        },
        {
          key: 'mouvementsCredit',
          label: 'Period movements, Credit',
          description: 'Total posted to the credit during the period.'
        },
        {
          key: 'clotureDebit',
          label: 'Closing balance, Debit',
          description: 'The balance at the end of the period, when it is a debit balance.'
        },
        {
          key: 'clotureCredit',
          label: 'Closing balance, Credit',
          description: 'The balance at the end of the period, when it is a credit balance.'
        }
      ],
      notes: [
        'An account has only one of the two opening balances, and only one of the two closing balances: the other column is zero.',
        '100 accounts per page. The “Total” line adds up all the accounts of your search, not only the page.',
        'On a phone, each account becomes a card with the three blocks.'
      ]
    },
    steps: [
      {
        title: 'Filter',
        detail: '“Search”, “Class”, “Hide settled accounts”.'
      },
      {
        title: 'Check',
        detail: 'Compare the Debit total and the Credit total of each block: they must be equal.'
      },
      {
        title: 'Go to the detail',
        detail: 'Click an account number.'
      }
    ],
    faq: [
      {
        q: 'Why does one account have only one filled column?',
        a: 'A balance is either a debit or a credit balance: it is shown in only one of the two columns.'
      },
      {
        q: 'An account I am looking for is missing. Why?',
        a: 'Check the “Class” filter and the “Hide settled accounts” box: they can remove it from the list.'
      },
      {
        q: 'Can I send the trial balance to the accounting firm?',
        a: 'Yes, with “Export to Excel” or “Export as CSV”: the file includes the period and your filters.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View financial reports” permission.'
    },
    related: [
      {
        label: 'General ledger',
        helpId: 'finance.grand-livre.page'
      },
      {
        label: 'Period, refresh and exports',
        helpId: 'finance.comptabilite.periode'
      }
    ],
    keywords: ['totals', 'debit', 'credit', 'opening balance', 'closing']
  },
  {
    id: 'finance.mandants.page',
    kind: 'page',
    title: 'Principals',
    summary:
      'A principal is an owner for whom the agency collects and holds money. This screen shows how much the agency holds for each one, and checks that this total matches the accounting.',
    purpose:
      "When you collect a rent for an owner, that money is not yours: you owe it to them. The owners’ funds account (4731 by default) gathers these amounts.\n\nTwo views, your choice: the “Principals' subsidiary ledger” (movements over the period) and the “Principals' subsidiary trial balance” (balances at a date). A positive balance is owed to the principal.",
    steps: [
      {
        title: 'Choose the view',
        detail: "Buttons “Principals' subsidiary ledger” or “Principals' subsidiary trial balance”."
      },
      {
        title: 'Search for a principal',
        detail: 'Type their name in “Search”.'
      },
      {
        title: 'Open a principal',
        detail:
          'In the subsidiary ledger, click their name to see their lines; “All principals” takes you back to the list.'
      },
      {
        title: 'Set a closing date',
        detail: 'In the subsidiary trial balance, choose the “Closing date”: by default, the end of the period.'
      },
      {
        title: 'Export',
        detail: '“Export to Excel” or “Export as CSV”.'
      }
    ],
    consequences: [
      'Read-only: no balance can be changed here.',
      'A red alert is shown if the total of the principals does not match the general balance of the funds account: see “Principals check”.',
      'The export uses the displayed view, with the period (or the closing date) and the principal chosen.'
    ],
    faq: [
      {
        q: 'What does “Not apportioned” mean?',
        a: 'These are lines of the funds account that are not linked to any owner. They deserve a close look.'
      },
      {
        q: 'What are “Current account”, “Security deposit” and “To be allocated”?',
        a: 'The current account is what will be paid out to the owner. The security deposit is held on their behalf. “To be allocated” is a collection received, not yet linked to an installment.'
      },
      {
        q: 'Where can I see an owner’s payouts?',
        a: 'This screen only shows the accounting view of the funds account. Choose a principal to see their lines, with their nature.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View financial reports” permission.'
    },
    related: [
      {
        label: 'Principals’ subsidiary ledger',
        helpId: 'finance.mandants.grand-livre'
      },
      {
        label: 'Principals’ subsidiary trial balance',
        helpId: 'finance.mandants.balance'
      },
      {
        label: 'Principals check',
        helpId: 'finance.mandants.controle'
      }
    ],
    keywords: [
      'principal',
      'principals',
      'owner',
      'owners’ funds',
      '4731',
      'security deposit',
      'current account',
      'to be allocated',
      'subsidiary trial balance'
    ]
  },
  {
    id: 'finance.mandants.grand-livre',
    kind: 'table',
    title: 'Principals’ subsidiary ledger',
    summary:
      'One line per owner: their opening balance, the movements of the period and their closing balance. Click a name to see the detail.',
    howToRead: {
      columns: [
        {
          key: 'mandant',
          label: 'Principal',
          description: 'The owner. A click opens their lines. “Not apportioned” groups the lines without an owner.'
        },
        {
          key: 'ouverture',
          label: 'Opening balance',
          description: 'What the agency held for them at the start of the period. Red if negative.'
        },
        {
          key: 'debit',
          label: 'Debit',
          description: 'Outflows of the period: what reduced the amount owed to the owner, for example a payout.'
        },
        {
          key: 'credit',
          label: 'Credit',
          description:
            'Inflows of the period: what increased the amount owed to the owner, for example a rent collected for them.'
        },
        {
          key: 'cloture',
          label: 'Closing balance',
          description: 'What the agency holds for them at the end of the period: opening + credit − debit.'
        }
      ],
      notes: [
        'Here the balance is read from the principal’s side: positive means an amount owed to the owner.',
        '50 principals per page. The “Total” line adds up the principals of the search.'
      ]
    },
    steps: [
      {
        title: 'Search for a principal',
        detail: 'Type part of their name.'
      },
      {
        title: 'Open the detail',
        detail: 'Click their name, or the card on a phone.'
      }
    ],
    faq: [
      {
        q: 'A principal I am looking for is missing. Why?',
        a: 'Only principals with a balance or movements appear. Widen the period.'
      },
      {
        q: 'Why does this balance not have the same direction as in the general ledger?',
        a: 'For principals’ funds, we count credit minus debit: the agency owes this money to the owners.'
      },
      {
        q: 'What should I do if there is a red alert above?',
        a: 'Read “Principals check”: it flags a difference with the general balance of the funds account.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View financial reports” permission.'
    },
    related: [
      {
        label: 'Principal detail',
        helpId: 'finance.mandants.detail'
      },
      {
        label: 'Principals check',
        helpId: 'finance.mandants.controle'
      }
    ],
    keywords: ['owners', 'balance owed', 'payout', 'principal']
  },
  {
    id: 'finance.mandants.detail',
    kind: 'table',
    title: 'Principal detail',
    summary:
      'The funds lines of an owner, with the balance after each line, and, at the top, an opening and closing card per nature of funds.',
    howToRead: {
      columns: [
        {
          key: 'date',
          label: 'Date',
          description: 'The date of the entry.'
        },
        {
          key: 'journal',
          label: 'Journal',
          description: 'The code of the entry’s journal.'
        },
        {
          key: 'piece',
          label: 'Attachment',
          description: 'The reference of the original document.'
        },
        {
          key: 'libelle',
          label: 'Label',
          description: 'The text of the line.'
        },
        {
          key: 'nature',
          label: 'Nature',
          description: '“Current account”, “Security deposit” or “To be allocated”.'
        },
        {
          key: 'debit',
          label: 'Debit',
          description: 'What reduces the amount owed to the owner.'
        },
        {
          key: 'credit',
          label: 'Credit',
          description: 'What increases the amount owed to the owner.'
        },
        {
          key: 'solde',
          label: 'Balance',
          description: 'The amount owed to the owner after this line (credit minus debit), red if negative.'
        }
      ],
      notes: [
        'The cards at the top give, for each nature of funds, the opening balance and the closing balance.',
        'The “Nature” filter restricts the lines; 100 lines per page.'
      ]
    },
    steps: [
      {
        title: 'Read the cards',
        detail: 'Each card carries the name of a nature of funds with its opening and closing balance.'
      },
      {
        title: 'Filter by nature',
        detail: 'Choose “Current account”, “Security deposit” or “To be allocated” in the “Nature” filter.'
      },
      {
        title: 'Back to the list',
        detail: 'Click “All principals”.'
      }
    ],
    faq: [
      {
        q: 'What does “Principal not found” mean?',
        a: 'This principal does not exist or does not belong to your agency. Go back to the list with “All principals”.'
      },
      {
        q: 'Where can I find the invoice or receipt linked to a line?',
        a: 'Use the reference in the “Attachment” column to find the entry in the journal.'
      },
      {
        q: 'Why does the sum of the cards differ from a line of the table?',
        a: 'The cards are balances per nature over the period; the table details the filtered lines. Remove the filter to reconcile them.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View financial reports” permission.'
    },
    related: [
      {
        label: 'Principals’ subsidiary ledger',
        helpId: 'finance.mandants.grand-livre'
      },
      {
        label: 'Read an entry',
        helpId: 'finance.journal.ecriture'
      }
    ],
    keywords: ['owner', 'nature of funds', 'security deposit', 'line']
  },
  {
    id: 'finance.mandants.balance',
    kind: 'table',
    title: 'Principals’ subsidiary trial balance',
    summary:
      'The balance of each owner at a closing date, split into current account, security deposit and amount to be allocated.',
    howToRead: {
      columns: [
        {
          key: 'mandant',
          label: 'Principal',
          description: 'The owner. “Not apportioned” groups the lines without an owner.'
        },
        {
          key: 'courant',
          label: 'Current account',
          description: 'What will be paid out to the owner.'
        },
        {
          key: 'depot',
          label: 'Security deposit',
          description: 'The security deposits held by the agency on their behalf.'
        },
        {
          key: 'affecter',
          label: 'To be allocated',
          description: 'Collections received, not yet linked to an installment.'
        },
        {
          key: 'total',
          label: 'Total',
          description:
            'The sum of the three previous columns: what the agency holds in total for this owner. Red if negative.'
        }
      ],
      notes: [
        'All balances are cut off at the “Closing date” (by default, the end of the period), that date included.',
        'A positive balance is owed to the owner. 50 principals per page; the “Total” line adds up the search.'
      ]
    },
    steps: [
      {
        title: 'Choose the closing date',
        detail: 'Use the “Closing date” field. All balances are recalculated at that date.'
      },
      {
        title: 'Search for a principal',
        detail: 'Type their name in “Search”.'
      },
      {
        title: 'Check the total',
        detail: 'If a red alert appears above the table, see “Principals check”.'
      },
      {
        title: 'Export',
        detail: '“Export to Excel” or “Export as CSV”: the file is cut off at the same date.'
      }
    ],
    faq: [
      {
        q: 'What is the difference with the subsidiary ledger?',
        a: 'The trial balance gives a balance at a date; the subsidiary ledger details the movements of a period.'
      },
      {
        q: 'What should I do with an amount “To be allocated”?',
        a: 'It is a collection received, not yet linked to an installment. As long as it is not linked, it stays in this column.'
      },
      {
        q: 'Why does the closing date change when I change the period?',
        a: 'By default it follows the end of the period. Choose a specific date so that it no longer moves.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View financial reports” permission.'
    },
    related: [
      {
        label: 'Principals check',
        helpId: 'finance.mandants.controle'
      },
      {
        label: 'Principals’ subsidiary ledger',
        helpId: 'finance.mandants.grand-livre'
      }
    ],
    keywords: ['balance at a date', 'cut-off', 'owners', 'funds held']
  },
  {
    id: 'finance.mandants.controle',
    kind: 'section',
    title: 'Principals check',
    summary:
      'The screen compares the total of all principals’ balances with the general balance of the owners’ funds account. The two must be identical.',
    purpose:
      'Money held for owners is tracked at two levels: owner by owner, and in a single account of the general accounting. If the two totals differ, a line is wrongly linked. As long as everything is consistent, the alert stays invisible.',
    howToRead: {
      notes: [
        'Subsidiary total: the sum of the principals’ balances.',
        'General balance of the account: the balance of the owners’ funds account in the accounting (4731 by default, or the account chosen in the agency settings).',
        'Difference: the gap between the two. It must be zero.'
      ]
    },
    steps: [
      {
        title: 'Read the alert',
        detail: 'Note the subsidiary total, the general balance of the account and the difference shown.'
      },
      {
        title: 'Look for “Not apportioned”',
        detail: 'A “Not apportioned” line in the list is the first place to look for the origin of the difference.'
      },
      {
        title: 'Report',
        detail: 'If the difference persists, report it to the vendor, giving the three amounts.'
      }
    ],
    consequences: [
      'The alert is purely informative: it blocks nothing and corrects nothing by itself.',
      'The check covers the account balance up to the end of the period (subsidiary ledger) or up to the closing date (subsidiary trial balance).'
    ],
    faq: [
      {
        q: 'I see no alert. Is that normal?',
        a: 'Yes: the alert only appears when there is a difference. No alert means the totals match.'
      },
      {
        q: 'What does the difference mean?',
        a: 'Part of the owners’ funds account is not found in the principals’ balances, or the reverse. The amount of the difference gives the order of magnitude to look for.'
      },
      {
        q: 'Can I fix the difference from this screen?',
        a: 'No. The screen is read-only: it is used to detect the problem.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View financial reports” permission.'
    },
    related: [
      {
        label: 'Principals’ subsidiary trial balance',
        helpId: 'finance.mandants.balance'
      },
      {
        label: 'Trial balance',
        helpId: 'finance.balance-generale.page'
      }
    ],
    keywords: ['difference', 'check', 'red alert', '4731', 'reconciliation']
  },
  {
    id: 'finance.releve.page',
    kind: 'page',
    title: 'Third-party account statement',
    summary:
      'The statement is the history of a third-party account (tenant, supplier, employee, subcontractor, landlord or partner): each movement with what was billed, what was paid and the balance after.',
    purpose:
      'You open a statement from a balance (customers, suppliers, payroll, subcontractors, ground leases, partnerships). It reads like a bank statement: one line per document, in date order.\n\nThe title is the name of the third party; above the table are the opening balance (start of the period) and the closing balance (end).',
    steps: [
      {
        title: 'Choose the period',
        detail: 'Use the “Period” filter. With no dates, the statement shows the whole history up to today.'
      },
      {
        title: 'Search for a movement',
        detail: 'Type part of the label in “Search”.'
      },
      {
        title: 'Read the balance',
        detail: 'The “Balance after” column gives the balance just after each line.'
      },
      {
        title: 'Print',
        detail: 'Click “Print”: the statement opens as a PDF in a new tab, with the chosen period and search.'
      },
      {
        title: 'Export',
        detail:
          'The “Export” button offers the available formats and includes all lines of the period, not only the page.'
      }
    ],
    consequences: [
      'The statement is read-only: no movement can be changed here.',
      'Movements dated after today are not shown.',
      'The “after” balance does not depend on your search: it stays that of the full series of movements.'
    ],
    faq: [
      {
        q: 'How do I read the balance?',
        a: 'Balance = total billed − total paid since the account began. A positive balance means some billed amount remains to be paid.'
      },
      {
        q: 'Why does the wording change from one third party to another?',
        a: 'A rent for a tenant becomes an “Invoice” for a supplier, a “Wage note” for an employee, etc. The figures read the same way.'
      },
      {
        q: 'I cannot see the screen. Why?',
        a: 'It requires the “View third-party accounts” permission. Ask your agency administrator for it.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View third-party accounts” permission.'
    },
    related: [
      {
        label: 'Statement movements',
        helpId: 'finance.releve.mouvements'
      }
    ],
    keywords: ['statement', 'third-party account', 'history', 'balance', 'billed', 'paid', 'print', 'account extract']
  },
  {
    id: 'finance.releve.mouvements',
    kind: 'table',
    title: 'Statement movements',
    summary: 'One line per movement of the account: what was billed, what was paid, and the balance after the line.',
    howToRead: {
      columns: [
        {
          key: 'date',
          label: 'Date',
          description: 'The date of the movement.'
        },
        {
          key: 'nature',
          label: 'Nature',
          description:
            'The type of movement (see the natures below). Its wording adapts to the third party: “Rent”, “Invoice”, “Wage note”…'
        },
        {
          key: 'libelle',
          label: 'Label',
          description: 'The text of the movement.'
        },
        {
          key: 'facture',
          label: 'Billed',
          description: 'The amount that increases what is owed. Empty if the movement is a payment.'
        },
        {
          key: 'regle',
          label: 'Paid',
          description: 'The amount paid, which reduces the balance.'
        },
        {
          key: 'solde',
          label: 'Balance after',
          description: 'The balance just after this movement: total billed − total paid since the start.'
        }
      ],
      statuses: [
        {
          value: 'INSTALLMENT',
          label: 'Rent',
          description:
            'A billed installment. It is called “Invoice” for a supplier, “Wage note” for an employee, “Progress statement” for a subcontractor, “Ground rent” for a landlord, “Share” for a partner.'
        },
        {
          value: 'PAYMENT',
          label: 'Payment',
          description: 'A payment received or made.'
        },
        {
          value: 'ADVANCE_RECEIVED',
          label: 'Advance received',
          description:
            'An amount paid in advance, outside an installment. For a supplier, subcontractor, landlord or partner: “Deposit paid”; for an employee: “Advance paid”.'
        },
        {
          value: 'ADVANCE_APPLIED',
          label: 'Advance offset',
          description: 'An advance used to settle an installment.'
        },
        {
          value: 'PENALTY',
          label: 'Penalty',
          description: 'A penalty added to the account.'
        },
        {
          value: 'WAIVER',
          label: 'Discount',
          description: 'An amount the third party is released from.'
        },
        {
          value: 'ADJUSTMENT',
          label: 'Adjustment',
          description: 'A correction of the balance.'
        },
        {
          value: 'OPENING_BALANCE',
          label: 'Initial balance',
          description: 'The balance carried over when the account was opened, before any other movement.'
        },
        {
          value: 'VOID',
          label: 'Cancellation',
          description: 'The cancellation of a previous movement.'
        }
      ],
      notes: [
        'Under the title, you read the opening balance and the closing balance of the period.',
        'When you search for a label, a “Filtered lines” line gives the billed and paid amounts of the lines kept; “Balance after” stays that of the full series.'
      ]
    },
    steps: [
      {
        title: 'Filter',
        detail: '“Search” (label) and “Period”.'
      },
      {
        title: 'Browse',
        detail: 'Use the pagination under the table.'
      },
      {
        title: 'Export',
        detail: 'The “Export” button reads the whole statement of the period, in slices, for a complete file.'
      }
    ],
    faq: [
      {
        q: 'How do I correct an amount?',
        a: 'No line can be changed from the statement, which is read-only. Contact your agency administrator to have a document corrected.'
      },
      {
        q: 'Why are there no Debit and Credit columns?',
        a: 'The statement uses everyday words: “Billed” and “Paid”. They are the same amounts.'
      },
      {
        q: 'Why is a recent movement missing?',
        a: 'Movements dated after today are not shown. Also check the chosen period.'
      }
    ],
    permissions: {
      roles: ['Administrator', 'Manager', 'Accountant'],
      note: 'Requires the “View third-party accounts” permission.'
    },
    related: [
      {
        label: 'Third-party account statement',
        helpId: 'finance.releve.page'
      }
    ],
    keywords: ['movements', 'billed', 'paid', 'balance after', 'advance', 'payment', 'penalty']
  }
];

export default entries;
