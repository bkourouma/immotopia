import type { HelpEntry } from '../../../types';

/** Zone « comptabilite » du module « syndic » (en) : prélèvements bancaires et comptabilité de la copropriété. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Direct debits
  {
    id: 'syndic.prelevements.liste',
    kind: 'page',
    title: 'Service charge direct debits',
    summary:
      'This screen organizes the direct debit of service charge calls: the condominium account, the mandates signed by the co-owners and the batches sent to the bank. It is split into three tabs.',
    purpose:
      'Instead of paying by hand, a co-owner authorizes their bank to debit their due service charge calls. The money is collected on the condominium bank account, not on the agency account.',
    steps: [
      {
        title: 'Set up the account',
        detail:
          'On the "Condominium\'s direct debit account" tab, use the "Set up the account" button. Without an active account, you cannot create a mandate or prepare a batch.'
      },
      {
        title: 'Create the mandates',
        detail:
          'On the "Direct debit mandates" tab, click "New mandate": download the authorization, have it signed, upload the signed scan, then activate the mandate.'
      },
      {
        title: 'Prepare a batch',
        detail:
          'On the "Batches" tab, click "Prepare a batch" and choose the debit date. The batch picks up the due service charge calls of the units whose mandate is active.'
      },
      {
        title: 'Validate, then produce the file',
        detail:
          'Open the batch: "Validate the batch" sends a notice to the co-owners, then "Produce the file" gives you the file to upload to your online banking.'
      },
      {
        title: 'Follow the outcome',
        detail:
          'After the file is submitted to the bank, record the payments and rejections line by line, or import the return file from the bank.'
      }
    ],
    consequences: [
      "Recording a payment creates the collection on the unit's service charge calls, with its receipt. A payment recorded by mistake cannot be canceled from this screen.",
      'In a condominium, no rejection fee is billed back to the co-owner.',
      'Late payment penalties are never debited.'
    ],
    faq: [
      {
        q: 'Why are "New mandate" or "Prepare a batch" greyed out?',
        a: "The condominium's direct debit account must first be set up and active. These buttons only appear if you have the right to manage direct debits."
      },
      {
        q: 'How many direct debit accounts per condominium?',
        a: 'Only one: the condominium bank account. You can deactivate it and then reactivate it.'
      },
      {
        q: 'What happens when a direct debit is rejected?',
        a: 'The line is marked "Rejected" and the co-owner receives a notice by e-mail if they have an address. After the number of consecutive rejections set in the account ("Suspension threshold"), their mandate is suspended.'
      },
      {
        q: 'Where can I see the details of a batch?',
        a: 'On the "Batches" tab, click the batch reference (or its row).'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Condominium manager', 'Accountant'],
      note: 'Viewing requires "Condominium direct debits: view". Creating or editing the account, the mandates and the batches requires "Condominium direct debits: manage, full IBAN".'
    },
    related: [
      { label: "Condominium's direct debit account", helpId: 'syndic.prelevements.compte' },
      { label: 'Direct debit mandates', helpId: 'syndic.prelevements.mandats' },
      { label: 'Batches', helpId: 'syndic.prelevements.remises' },
      { label: 'Batch details', helpId: 'syndic.prelevements.remise' }
    ],
    keywords: [
      'direct debit',
      'bank direct debit',
      'mandate',
      'batch',
      'domiciliation',
      'bank',
      'service charges',
      'service charge call'
    ]
  },
  {
    id: 'syndic.prelevements.compte',
    kind: 'section',
    title: "Condominium's direct debit account",
    summary:
      'This card describes the condominium bank account on which direct debits are collected, and the collection rules. There is only one per condominium.',
    purpose:
      'Service charge direct debits are collected on the condominium bank account, not on the agency account. The creditor identifier is assigned by the bank once the agreement is signed.',
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The account can receive mandates and batches.' },
        {
          value: 'INACTIVE',
          label: 'Inactive',
          description: 'No new mandate or batch until the account is reactivated.'
        }
      ],
      notes: [
        '"Label": the name of the account. "Bank" and "Condominium\'s account": simple display references, they are neither the IBAN nor the bank details.',
        '"Creditor identifier": given by the bank. As long as it is empty, the "Agreement not signed" tag is shown.',
        '"Collection day": day of the month, from 1 to 28, on which debits are presented (5 by default).',
        '"Pre-notification (business days)": minimum delay between the notice to the co-owner and the debit (5 by default).',
        '"Suspension threshold": number of consecutive rejections after which a mandate is suspended (2 by default).',
        '"Open mandates": number of mandates of the account that are open.'
      ]
    },
    steps: [
      { title: 'Set up', detail: 'Click "Set up the account", fill in the label and the three settings, then "Save".' },
      { title: 'Edit', detail: '"Edit" button: change the label, the bank, the creditor identifier or the settings.' },
      {
        title: 'Deactivate or activate',
        detail: '"Deactivate" and "Enable" buttons to suspend or reopen the use of the account.'
      }
    ],
    consequences: [
      'Deactivating the account deletes nothing: the mandates still exist, but you can no longer create a mandate or prepare a batch.',
      'Leave the creditor identifier empty until the agreement with the bank is signed.'
    ],
    faq: [
      {
        q: 'Do I need to enter the condominium IBAN?',
        a: 'No. The "Condominium\'s account" field is a short display reference, not the IBAN or the bank details.'
      },
      {
        q: 'Which collection day should I choose?',
        a: 'A day between 1 and 28. It applies to all mandates, unless a mandate has its own collection day.'
      },
      {
        q: 'I do not see the "Edit" and "Enable" buttons.',
        a: 'They require the right "Condominium direct debits: manage, full IBAN".'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Editing the account requires "Condominium direct debits: manage, full IBAN".'
    },
    related: [{ label: 'Direct debit mandates', helpId: 'syndic.prelevements.mandats' }],
    keywords: ['bank account', 'creditor', 'creditor identifier', 'collection day', 'agreement']
  },
  {
    id: 'syndic.prelevements.mandats',
    kind: 'table',
    title: 'Direct debit mandates',
    summary:
      'This table lists the mandates by unit: the authorization given by a co-owner to debit their service charge calls from their account. You create, activate, suspend or revoke mandates here.',
    purpose: 'A mandate links a unit, a co-owner and a bank account. Only active mandates are included in a batch.',
    howToRead: {
      columns: [
        { key: 'reference', label: 'Reference', description: 'Number of the mandate.' },
        { key: 'status', label: 'Status', description: 'State of the mandate (see the statuses below).' },
        { key: 'lot', label: 'Unit', description: 'The unit whose service charge calls are debited.' },
        { key: 'debtor', label: 'Co-owner', description: 'The person debited.' },
        { key: 'iban', label: 'IBAN', description: 'Masked IBAN: only the last digits are visible.' },
        { key: 'maxAmount', label: 'Ceiling', description: 'Maximum amount of one debit. Empty: no ceiling.' },
        { key: 'day', label: 'Collection day', description: 'Day of the month on which this mandate is debited.' },
        { key: 'actions', label: 'Actions', description: 'Possible actions depending on the status and your rights.' }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'The mandate is created but not yet activated: the signed scan of the authorization is required.'
        },
        { value: 'ACTIVE', label: 'Active', description: 'The mandate is debited in the batches.' },
        {
          value: 'SUSPENDED',
          label: 'Suspended',
          description:
            'No more debits until it is reactivated. It is also suspended after too many consecutive rejections.'
        },
        { value: 'REVOKED', label: 'Revoked', description: 'Final: to debit again, create a new mandate.' }
      ],
      notes: [
        'Filter by status or by unit, or search by account holder, unit, co-owner, reference or the end of the IBAN.'
      ]
    },
    steps: [
      { title: 'Create a mandate', detail: 'Click "New mandate" (reserved for direct debit managers).' },
      {
        title: 'Download the authorization',
        detail: '"Download the authorization (PDF)" button on the row: have the co-owner sign it.'
      },
      {
        title: 'Upload the signed scan',
        detail:
          '"Upload the signed scan" button (PDF, JPEG or PNG, 10 MB at most). The "Electronic signature" is also offered while the mandate is a draft.'
      },
      {
        title: 'Activate',
        detail: '"Enable" button: it can only be used once the scan is uploaded; you confirm the signature date.'
      },
      {
        title: 'Suspend, reactivate, revoke, edit',
        detail: 'Buttons on the row. A reason is requested to suspend or revoke.'
      }
    ],
    consequences: [
      'Revocation is final. The IBAN cannot be edited: to change accounts, revoke the mandate and then create a new one.',
      'A suspended or draft mandate is not included in any batch.'
    ],
    faq: [
      {
        q: 'Why can I not activate the mandate?',
        a: 'First upload the signed scan of the authorization (or start the electronic signature).'
      },
      {
        q: 'Can the IBAN of a mandate be corrected?',
        a: 'No. Revoke the mandate and create a new one with the right account.'
      },
      {
        q: 'Why did a mandate become "Suspended" by itself?',
        a: 'The number of consecutive rejections reached the "Suspension threshold" of the account. You can reactivate it from the row.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Viewing the mandates requires "Condominium direct debits: view"; the "Actions" column and "New mandate" require "Condominium direct debits: manage, full IBAN".'
    },
    related: [
      { label: 'New mandate', helpId: 'syndic.prelevements.mandat-nouveau' },
      { label: "Condominium's direct debit account", helpId: 'syndic.prelevements.compte' }
    ],
    keywords: ['mandate', 'direct debit authorization', 'IBAN', 'signed scan', 'activate', 'suspend', 'revoke']
  },
  {
    id: 'syndic.prelevements.mandat-nouveau',
    kind: 'section',
    title: 'New direct debit mandate',
    summary:
      'This form creates a mandate for a unit and a co-owner. The mandate starts as a draft: it will only be debited after the signed scan is uploaded and it is activated.',
    steps: [
      { title: 'Choose the unit', detail: '"Unit" field.' },
      {
        title: 'Choose the co-owner',
        detail:
          '"Co-owner to debit" field, available once the unit is chosen. A warning is shown if the person has no e-mail address.'
      },
      {
        title: 'Enter the IBAN or bank details',
        detail: 'The screen checks the account while you type and shows the IBAN and the bank code it recognized.'
      },
      { title: 'Fill in the account holder', detail: '"Account holder" field.' },
      {
        title: 'Optional',
        detail: '"Ceiling per debit (FCFA)", "Collection day (1 to 28)" specific to this mandate, and "Notes".'
      },
      {
        title: 'Create',
        detail: '"Create the direct debit mandate" button, then download the authorization from the mandate row.'
      }
    ],
    consequences: [
      'Without an e-mail address, the co-owner will not receive the debit notice: add their address to their record.',
      'The mandate is created as a draft: download the authorization, have it signed, upload the scan and activate the mandate.'
    ],
    faq: [
      {
        q: 'Why does no co-owner appear?',
        a: 'The list depends on the chosen unit: choose the unit first. "No co-owner for this unit" means the unit has no co-owner attached.'
      },
      { q: 'What is the ceiling for?', a: 'A debit never exceeds this amount, even if the remaining due is higher.' },
      {
        q: 'Is the mandate debited as soon as it is created?',
        a: 'No, it starts as a draft: it is only debited once the signed scan has been uploaded and the mandate activated.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires "Condominium direct debits: manage, full IBAN".' },
    related: [{ label: 'Direct debit mandates', helpId: 'syndic.prelevements.mandats' }],
    keywords: ['create a mandate', 'IBAN', 'bank details', 'ceiling']
  },
  {
    id: 'syndic.prelevements.remises',
    kind: 'table',
    title: 'Direct debit batches',
    summary:
      'This table lists the batches: the sets of direct debits to send to the bank for a given date. Click a batch to open it.',
    purpose:
      'For one debit date, a batch groups the due service charge calls of the units whose mandate is active. It is prepared, validated, sent to the bank, then its lines are recorded as paid or rejected.',
    howToRead: {
      columns: [
        { key: 'reference', label: 'Reference', description: 'Number of the batch (PRL-…). Click to open.' },
        { key: 'status', label: 'Status', description: 'Progress of the batch.' },
        { key: 'collectionDate', label: 'Debit date', description: 'Day on which the bank debits.' },
        { key: 'lineCount', label: 'Rows', description: 'Number of units debited.' },
        { key: 'total', label: 'Total', description: 'Sum of the amounts of the lines.' },
        {
          key: 'deadline',
          label: 'Direct debit notice no later than',
          description: 'Last day to notify the co-owners, according to the pre-notification delay of the account.'
        }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: 'Prepared and editable, nothing has been sent.' },
        {
          value: 'VALIDATED',
          label: 'Approved',
          description: 'The direct debit notices have been sent to the co-owners.'
        },
        { value: 'EXPORTED', label: 'File produced', description: 'The file for the bank has been produced.' },
        {
          value: 'SUBMITTED',
          label: 'Submitted to the bank',
          description: 'You confirmed that the file was uploaded to your online banking.'
        },
        { value: 'CANCELED', label: 'Cancelled', description: 'All lines are cancelled, permanently.' }
      ],
      notes: ['Filter by status or by debit date, or search for a batch reference.']
    },
    steps: [
      { title: 'Prepare a batch', detail: '"Prepare a batch" button. You land directly on the batch details.' },
      {
        title: 'Import a bank return file',
        detail: '"Import a bank return file" button: upload the CSV file, check the preview, then "Apply".'
      },
      { title: 'Find an import', detail: 'Below the table, the history lists the return files already imported.' }
    ],
    consequences: [
      'Importing the bank return file changes nothing until you click "Apply". Payments create collections and receipts.',
      'In a condominium, the rejection of a debit already recorded as paid is not handled: correct it in the condominium accounting.'
    ],
    faq: [
      {
        q: 'Which columns must the return file contain?',
        a: 'reference_operation, statut, date, montant, code_rejet and motif, in CSV format.'
      },
      { q: 'Can the same file be imported twice?', a: 'The screen warns you when a file has already been imported.' },
      {
        q: 'What does the "Submitted to the bank" status mean?',
        a: 'You have confirmed that you uploaded the file to your online banking.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Viewing the batches requires "Condominium direct debits: view"; preparing or importing requires "Condominium direct debits: manage, full IBAN".'
    },
    related: [
      { label: 'Prepare a batch', helpId: 'syndic.prelevements.remise-preparer' },
      { label: 'Batch details', helpId: 'syndic.prelevements.remise' }
    ],
    keywords: ['batch', 'direct debit file', 'bank return', 'import']
  },
  {
    id: 'syndic.prelevements.remise-preparer',
    kind: 'section',
    title: 'Prepare a batch',
    summary:
      'This window creates a batch for a debit date. The lines are computed from the due service charge calls of the units whose mandate is active.',
    steps: [
      {
        title: 'Choose the date',
        detail:
          '"Debit date" field: the screen suggests the first possible date according to the collection day and the notice delay of the account. Dates that are too close are greyed out.'
      },
      { title: 'Add notes', detail: '"Notes" field, optional.' },
      { title: 'Prepare', detail: '"Prepare" button. The batch opens with the "Draft" status.' }
    ],
    consequences: [
      'For each unit, the amount is the remaining due on the calls due at the chosen date, limited to the mandate ceiling. A unit with nothing to pay, or whose calls are already in a batch, is left out.',
      'Nothing is sent to the co-owners until the batch is validated.'
    ],
    faq: [
      {
        q: 'Why is a unit missing from the batch?',
        a: 'Its mandate is not active, it has nothing to pay on this date, or its calls are already in another batch.'
      },
      {
        q: 'Why is this date greyed out?',
        a: 'The notice delay (business days) set in the direct debit account must be respected.'
      },
      {
        q: 'Are co-owners notified when I prepare a batch?',
        a: 'No, nothing is sent to co-owners until the batch is approved. It opens with the "Draft" status.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Requires "Condominium direct debits: manage, full IBAN" and an active direct debit account.'
    },
    related: [{ label: 'Batch details', helpId: 'syndic.prelevements.remise' }],
    keywords: ['prepare', 'debit date', 'new batch']
  },
  {
    id: 'syndic.prelevements.remise',
    kind: 'page',
    title: 'Direct debit batch details',
    summary:
      'This screen follows a batch from start to finish: validation, notices to the co-owners, file for the bank, then payment or rejection of each line.',
    purpose:
      'Each line corresponds to a debited unit. The buttons offered change with the status of the batch: draft, approved, file produced, submitted to the bank or cancelled.',
    howToRead: {
      columns: [
        {
          key: 'reference',
          label: 'Operation reference',
          description: 'Identifier of the line, to be found in the bank return file.'
        },
        { key: 'debtor', label: 'Debtor', description: 'The co-owner debited.' },
        { key: 'lot', label: 'Unit', description: 'The unit concerned.' },
        { key: 'mandate', label: 'Mandate', description: 'The mandate used.' },
        {
          key: 'chargeCalls',
          label: 'Service charge calls covered',
          description: 'The service charge calls, from the oldest to the most recent, that this line settles.'
        },
        { key: 'remaining', label: 'Remaining due', description: 'What was left to pay on these calls.' },
        {
          key: 'amount',
          label: 'Amount debited',
          description: 'The remaining due, limited to the mandate ceiling ("Capped" tag).'
        },
        {
          key: 'prenotification',
          label: 'Direct debit notice',
          description: 'State of the e-mail notice sent to the co-owner.'
        },
        { key: 'status', label: 'Status', description: 'State of the line.' },
        { key: 'actions', label: 'Actions', description: 'Record a payment or a rejection, or remove the line.' }
      ],
      statuses: [
        { value: 'PENDING', label: 'To be debited', description: 'Not recorded yet.' },
        { value: 'SETTLED', label: 'Paid', description: 'The debit succeeded: a collection is recorded.' },
        { value: 'REJECTED', label: 'Rejected', description: 'The bank refused the debit.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'Line removed or batch cancelled.' }
      ],
      notes: [
        'Direct debit notice: "Pending", "Sent", "No email" (the co-owner has no address), "Disabled" (sending is turned off for the agency), "Failed".',
        'The header shows the reference, the status, the account, the condominium, the debit date, the total and the dates of each step.'
      ]
    },
    steps: [
      {
        title: 'Refresh (draft)',
        detail: '"Refresh" recomputes the lines from the service charge calls and mandates of today.'
      },
      {
        title: 'Validate the batch',
        detail:
          'The co-owners receive a direct debit notice by e-mail. The button is greyed out if there is no line to debit.'
      },
      {
        title: 'Produce the file',
        detail:
          'The file contains the full IBANs: keep it carefully. "Download the file again" remains possible afterwards.'
      },
      {
        title: 'Upload to the bank',
        detail: 'Upload the file to your online banking, then "Mark as submitted to the bank".'
      },
      {
        title: 'Record the results',
        detail:
          'Per line: "Record the payment" or "Record the rejection". "Record all as paid" settles all the remaining lines.'
      },
      {
        title: 'Resend the notices',
        detail: '"Resend the direct debit notices" reminds the co-owners who did not receive them.'
      }
    ],
    consequences: [
      'Validating sends an e-mail to each co-owner who has an address. Recording a payment creates the collection on their service charge calls, with a receipt; it cannot be canceled from this screen.',
      'A rejection sends a notice to the co-owner (if e-mail is enabled) and may suspend the mandate. No rejection fee is billed back.',
      'Canceling the batch is final and cancels all its lines. If the file has already been uploaded to the bank, also cancel the batch there, otherwise the accounts will be debited.',
      'Removing a line is possible while the batch is a draft or approved; the last line of an approved batch cannot be removed: cancel the batch.'
    ],
    faq: [
      { q: 'The debit date has passed, what should I do?', a: 'Cancel the batch and prepare a new one.' },
      {
        q: 'A co-owner did not receive the notice, what should I do?',
        a: 'Check their e-mail address on their record, then "Resend the direct debit notices".'
      },
      {
        q: 'Can a payment recorded by mistake be corrected?',
        a: 'Not from this screen. Correct it in the condominium accounting.'
      },
      {
        q: 'Why are some buttons missing?',
        a: 'They depend on the status of the batch and on the right "Condominium direct debits: manage, full IBAN".'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Viewing requires "Condominium direct debits: view"; all actions require "Condominium direct debits: manage, full IBAN".'
    },
    related: [
      { label: 'Direct debit batches', helpId: 'syndic.prelevements.remises' },
      { label: 'Service charge direct debits', helpId: 'syndic.prelevements.liste' }
    ],
    keywords: ['batch', 'validate', 'batch file', 'record', 'rejection', 'payment', 'submitted to the bank']
  },

  // ------------------------------------------------------------------ Accounting
  {
    id: 'syndic.comptabilite.liste',
    kind: 'page',
    title: 'Condominium accounting',
    summary:
      'This screen brings together the condominium accounting: chart of accounts, journals, entries, general ledger and trial balance. It follows the SYSCOHADA chart.',
    purpose:
      'You keep the condominium accounts here and check that the entries are balanced. The general ledger details one account; the trial balance gives the total of each account.',
    howToRead: {
      notes: [
        'The two counters at the top show the number of "Accounts" and "Journals" of the condominium.',
        'Five tabs: "Ledger entries", "General ledger", "Trial balance", "Chart of accounts" and "Accounting journals".'
      ]
    },
    steps: [
      {
        title: 'Load the chart',
        detail:
          'If the chart of accounts is empty, "Load the SYSCOHADA chart of accounts" adds the standard accounts. "New account" creates one by hand.'
      },
      {
        title: 'Create a journal',
        detail: '"New journal": code, financial year, label and type (General, Bank, Cash, Charges).'
      },
      {
        title: 'Enter an entry',
        detail:
          '"New entry": at least two accounts and a journal are required. The total of the debits must equal that of the credits.'
      },
      { title: 'Lock', detail: 'On the "Ledger entries" tab, "Lock" freezes an entry.' },
      { title: 'Check', detail: '"Trial balance" then the "General ledger" of an account, keeping the same period.' }
    ],
    consequences: [
      'An entry whose debits and credits are not equal is refused.',
      'Locking an entry is final: no button lets you reopen it.'
    ],
    faq: [
      {
        q: 'Why is "New entry" greyed out?',
        a: 'At least two accounts and a journal are required: load the SYSCOHADA chart and create a journal.'
      },
      {
        q: 'Does reloading the SYSCOHADA chart overwrite my accounts?',
        a: 'No. Only the missing accounts are added, existing accounts are not modified.'
      },
      { q: 'Can a locked entry be edited?', a: 'The screen does not allow it.' },
      {
        q: 'How do I go from the trial balance to the general ledger?',
        a: 'Click "General ledger" at the end of the account row: the period of the trial balance is carried over.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Accountant', 'Condominium manager'],
      note: 'Viewing the accounting requires the right to view the Syndic module; creating accounts, journals or entries and locking require the right to edit it.'
    },
    related: [
      { label: 'Ledger entries', helpId: 'syndic.comptabilite.ecritures' },
      { label: 'General ledger', helpId: 'syndic.comptabilite.grand-livre' },
      { label: 'Trial balance', helpId: 'syndic.comptabilite.balance' },
      { label: 'Chart of accounts', helpId: 'syndic.comptabilite.plan' },
      { label: 'Accounting journals', helpId: 'syndic.comptabilite.journaux' }
    ],
    keywords: ['accounting', 'SYSCOHADA', 'entry', 'journal', 'general ledger', 'balance', 'chart of accounts']
  },
  {
    id: 'syndic.comptabilite.ecritures',
    kind: 'table',
    title: 'Ledger entries',
    summary:
      'This table is the journal of the condominium entries. Open an entry with the arrow on its row to see its debit and credit lines.',
    howToRead: {
      columns: [
        { key: 'entryDate', label: 'Date', description: 'Date of the entry.' },
        { key: 'reference', label: 'Reference', description: 'Reference of the document.' },
        { key: 'description', label: 'Description', description: 'Label of the entry.' }
      ],
      statuses: [
        { value: 'open', label: 'Open', description: 'The entry can still be locked.' },
        { value: 'locked', label: 'Locked', description: 'Frozen entry.' }
      ],
      notes: [
        'The "Journal", "Status" and "Action" columns complete the table. In the details of an entry: "Account", "Unit", "Label", "Debit" and "Credit".',
        'Filters: search, account, period, journal and status.'
      ]
    },
    steps: [
      { title: 'Search', detail: 'Type a reference, a description or a line label.' },
      { title: 'Filter', detail: 'Choose an account, a period, a journal or a status.' },
      { title: 'Lock', detail: '"Lock" button on an "Open" entry.' }
    ],
    consequences: ['A locked entry can no longer be reopened from the screen.'],
    faq: [
      { q: 'How do I enter an entry?', a: 'With "New entry", at the top of the page.' },
      { q: 'Why does an entry have no button?', a: 'It is already locked.' },
      { q: 'Can I export?', a: 'Yes, the table offers an export of the entries matching your filters.' }
    ],
    permissions: { feature: 'SYNDIC', note: 'Locking requires the right to edit the Syndic module.' },
    related: [{ label: 'New ledger entry', helpId: 'syndic.comptabilite.ecriture-nouvelle' }],
    keywords: ['entries', 'journal of entries', 'lock']
  },
  {
    id: 'syndic.comptabilite.ecriture-nouvelle',
    kind: 'section',
    title: 'New ledger entry',
    summary: 'This window records an entry: a journal, a date, a reference and at least two debit and credit lines.',
    steps: [
      { title: 'Choose the journal', detail: '"Journal" field.' },
      {
        title: 'Give the date and the reference',
        detail: '"Entry date" and "Reference" fields, then the description.'
      },
      { title: 'Choose the source', detail: 'Manual, charge payment, penalty or funds.' },
      { title: 'Enter the lines', detail: 'For each line: account, unit (optional), label, debit or credit.' },
      { title: 'Create', detail: '"Create entry" button.' }
    ],
    consequences: [
      'The total of the debits must equal the total of the credits: otherwise the entry is refused.',
      'The entry is created open; you can then lock it.'
    ],
    faq: [
      { q: 'Why does saving fail?', a: 'Most often, the debits and credits are not equal.' },
      {
        q: 'What is the unit for on a line?',
        a: 'To attach the line to a unit; it then appears in the details and in the general ledger.'
      },
      {
        q: 'How many lines do I need to enter?',
        a: 'At least two lines, debit and credit, and the total of the debits must equal the total of the credits.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to edit the Syndic module.' },
    related: [{ label: 'Ledger entries', helpId: 'syndic.comptabilite.ecritures' }],
    keywords: ['enter an entry', 'debit', 'credit']
  },
  {
    id: 'syndic.comptabilite.grand-livre',
    kind: 'table',
    title: 'General ledger',
    summary:
      'The general ledger details, line by line, all the movements of a single account, with its running balance. First choose an account.',
    howToRead: {
      columns: [
        { key: 'entryDate', label: 'Date', description: 'Date of the entry.' },
        { key: 'reference', label: 'Document', description: 'Reference of the entry.' },
        { key: 'journalCode', label: 'Journal', description: 'Code of the journal.' },
        { key: 'lotNumber', label: 'Unit', description: 'Unit attached to the line, if any.' },
        { key: 'debit', label: 'Debit', description: 'Amount on the debit side.' },
        { key: 'credit', label: 'Credit', description: 'Amount on the credit side.' },
        { key: 'runningBalance', label: 'Running balance', description: 'Balance of the account after this line.' }
      ],
      notes: [
        'Four indicators: "Opening balance", "Total debit", "Total credit" and "Closing balance" of the period.',
        'The arrows next to the selector move to the previous or next account of the chart of accounts.'
      ]
    },
    steps: [
      { title: 'Choose an account', detail: '"Choose an account" selector: without an account, there is no result.' },
      { title: 'Filter', detail: 'Search for a document or a label, or limit to a period.' },
      { title: 'Browse', detail: '"Previous account" and "Next account" buttons.' }
    ],
    faq: [
      { q: 'Why is the table empty?', a: 'No account is chosen, or the account has no movement over the period.' },
      { q: 'How do I get here from the trial balance?', a: '"General ledger" button on the account row.' },
      { q: 'What is the running balance?', a: 'The balance of the account after each line, in date order.' }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to view the Syndic module.' },
    related: [{ label: 'Trial balance', helpId: 'syndic.comptabilite.balance' }],
    keywords: ['general ledger', 'account', 'running balance']
  },
  {
    id: 'syndic.comptabilite.balance',
    kind: 'table',
    title: 'Trial balance',
    summary:
      'The trial balance gives, for each account, the total of the debits, of the credits and the balance. The "Balance is even" indicator tells whether the whole is consistent.',
    howToRead: {
      columns: [
        { key: 'totalDebit', label: 'Debit', description: 'Total of the debits of the account.' },
        { key: 'totalCredit', label: 'Credit', description: 'Total of the credits of the account.' },
        { key: 'balance', label: 'Balance', description: 'Difference between debit and credit.' }
      ],
      notes: [
        '"Balance is even": "Yes" when the total of the debits equals that of the credits, "No" otherwise.',
        'The "Total" row recomputes the amounts according to your filters.',
        'Filters: search (number or label), account classes, period, "Hide settled accounts".'
      ]
    },
    steps: [
      { title: 'Choose the period', detail: '"Period" filter.' },
      { title: 'Filter', detail: 'By account class, or hide the settled accounts.' },
      {
        title: 'Open an account',
        detail: '"General ledger" on the row opens the details of the account, with the same period.'
      }
    ],
    faq: [
      {
        q: 'What should I do if the balance is not even?',
        a: 'Look for the entry at fault in the general ledger of the accounts concerned.'
      },
      {
        q: 'The totals change when I filter: is that normal?',
        a: 'Yes, the "Total" row follows your filters, while the "Balance is even" indicator covers the whole.'
      },
      {
        q: 'How do I open the detail of an account from the trial balance?',
        a: 'Click "General ledger" on the account row: the detail opens over the same period.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to view the Syndic module.' },
    related: [{ label: 'General ledger', helpId: 'syndic.comptabilite.grand-livre' }],
    keywords: ['balance', 'even', 'totals']
  },
  {
    id: 'syndic.comptabilite.plan',
    kind: 'table',
    title: 'Chart of accounts',
    summary:
      'The chart of accounts lists the accounts usable in the condominium entries, according to the SYSCOHADA chart. You can create others.',
    howToRead: {
      columns: [
        { key: 'accountNumber', label: 'Number', description: 'Number of the account.' },
        { key: 'accountName', label: 'Label', description: 'Name of the account.' },
        { key: 'accountClass', label: 'Class', description: 'Class of the account, from 1 to 9.' },
        {
          key: 'accountType',
          label: 'Type',
          description: 'Asset (balance sheet), Liability, Equity, Income or Expense.'
        }
      ],
      notes: [
        'The last column shows whether the account is "Active" or "Inactive". Filters: class, type and active/inactive.'
      ]
    },
    steps: [
      { title: 'Load the chart', detail: 'Empty chart: "Load the SYSCOHADA chart of accounts".' },
      { title: 'Add an account', detail: '"New account": number, class, label and type.' }
    ],
    consequences: ['Loading only adds the missing accounts.'],
    faq: [
      { q: 'The chart is empty, what should I do?', a: 'Click "Load the SYSCOHADA chart of accounts" to get started.' },
      { q: 'Which account types exist?', a: 'Asset (balance sheet), Liability, Equity, Income and Expense.' },
      {
        q: 'Does loading the SYSCOHADA chart of accounts replace my accounts?',
        a: 'No, loading only adds the missing accounts.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Creating an account or loading the chart requires the right to edit the Syndic module.'
    },
    related: [{ label: 'Accounting journals', helpId: 'syndic.comptabilite.journaux' }],
    keywords: ['chart of accounts', 'SYSCOHADA', 'account', 'class']
  },
  {
    id: 'syndic.comptabilite.journaux',
    kind: 'table',
    title: 'Accounting journals',
    summary:
      'This list shows the condominium journals, one per type of operation and per financial year. Each entry is recorded in a journal.',
    howToRead: {
      columns: [
        { key: 'code', label: 'Code', description: 'Short code of the journal.' },
        { key: 'label', label: 'Label', description: 'Name of the journal.' },
        { key: 'journalType', label: 'Type', description: 'General, Bank, Cash or Charges.' },
        { key: 'fiscalYear', label: 'Financial year', description: 'Year of the financial year.' },
        { key: 'createdAt', label: 'Created on', description: 'Creation date.' }
      ],
      notes: ['Filters: search (code or label), type and financial year.']
    },
    steps: [{ title: 'Create a journal', detail: '"New journal": code, financial year, label, type.' }],
    faq: [
      { q: 'Why do I need a journal?', a: 'At least one is required to enter an entry.' },
      {
        q: 'Can I have several journals of the same type?',
        a: 'Yes, each journal has its own code and financial year.'
      },
      { q: 'Can a journal be deleted?', a: 'The screen does not offer deletion.' }
    ],
    permissions: { feature: 'SYNDIC', note: 'Creating a journal requires the right to edit the Syndic module.' },
    related: [{ label: 'Ledger entries', helpId: 'syndic.comptabilite.ecritures' }],
    keywords: ['journal', 'financial year', 'bank', 'cash']
  }
];

export default entries;
