import type { HelpEntry } from '../../../types';

/** Help entries of the remises zone, locatif module (en). */
const entries: HelpEntry[] = [
  {
    id: 'locatif.prelevements.remises',
    kind: 'page',
    title: 'Direct debit batches',
    summary:
      "A batch groups the rents to be debited from tenants' accounts on the same date, for one creditor. This screen lists your batches, lets you prepare one and import the bank's return files.",
    purpose:
      'Each month you prepare a batch, validate it (tenants receive a notice), produce the file to load on your online banking, then record the result sent by the bank: settlements or rejections.',
    steps: [
      {
        title: 'Prepare a batch',
        detail: 'Click "Prepare a batch", then choose the creditor and the collection date.'
      },
      {
        title: 'Open a batch',
        detail: 'Click its reference in the table to see its lines and actions.'
      },
      {
        title: 'Search and filter',
        detail: 'Use the search box, then the Status, Creditor and Debit date filters.'
      },
      {
        title: 'Import the bank return',
        detail: 'Click "Import a bank return file" and drop the CSV file you received.'
      },
      {
        title: 'Review imported returns',
        detail: 'The history at the bottom of the page lists every imported file.'
      }
    ],
    consequences: [
      'Preparing a batch notifies nobody and touches no account: the batch stays a draft that you can refresh or cancel.',
      'Tenants are only notified (debit notice by e-mail) when the batch is validated, from its detail page.',
      'Importing a bank return creates payments and receipts (settlements) or cancels payments (late rejections): the screen asks for confirmation before applying.'
    ],
    faq: [
      {
        q: 'Why are some dates greyed out?',
        a: 'The date must be after today, and the debit notice must be able to go out in time: the number of business days in advance is set by the creditor.'
      },
      {
        q: 'Where are collection days and caps set?',
        a: 'On creditors and mandates, in the direct debit mandates screen. This screen does not change them.'
      },
      {
        q: 'I do not see "Prepare a batch". Why?',
        a: 'Viewing requires "View direct debits"; preparing, validating and importing require "Manage direct debits". Ask your agency administrator for this right.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      roles: ['Manager', 'Accountant'],
      note: 'Viewing requires "View direct debits"; preparing a batch or importing a return requires "Manage direct debits".'
    },
    related: [
      {
        label: 'How to read the batches table',
        helpId: 'locatif.prelevements.remises.tableau'
      },
      {
        label: 'Prepare a batch',
        helpId: 'locatif.prelevements.remises.preparer'
      },
      {
        label: 'Import a bank return',
        helpId: 'locatif.prelevements.retours.import'
      },
      {
        label: 'Direct debit mandates',
        helpId: 'locatif.prelevements.mandats'
      }
    ],
    keywords: ['batch', 'remittance', 'direct debit', 'bank debit', 'rent', 'bank', 'file', 'mandate'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'remises-preparer',
          title: 'Prepare a batch',
          description: 'This button creates a draft batch for a creditor and a collection date.'
        },
        {
          target: 'remises-import',
          title: 'Import a return',
          description: 'After the debit, drop the bank CSV file here to record settlements and rejections.'
        },
        {
          target: 'remises-tableau',
          title: 'Your batches',
          description: 'Click a reference to open the batch.'
        }
      ]
    }
  },
  {
    id: 'locatif.prelevements.remises.tableau',
    kind: 'table',
    title: 'Batches table',
    summary:
      'Each row is a direct debit batch of your agency, with its status, date, total and the deadline for notices.',
    howToRead: {
      columns: [
        {
          key: 'reference',
          label: 'Reference',
          description: 'The batch number. Click it to open its detail.'
        },
        {
          key: 'status',
          label: 'Status',
          description: 'How far the batch has progressed (see the statuses below).'
        },
        {
          key: 'creditor',
          label: 'Creditor',
          description: 'The agency account that receives the debited rents.'
        },
        {
          key: 'collectionDate',
          label: 'Debit date',
          description: 'The day the bank debits the tenants.'
        },
        {
          key: 'period',
          label: 'Period',
          description: 'The month of the debited rents, that of the collection date.'
        },
        {
          key: 'lineCount',
          label: 'Rows',
          description: 'The number of debits in the batch, one per selected mandate.'
        },
        {
          key: 'total',
          label: 'Total',
          description: 'The amount to be debited, in FCFA.'
        },
        {
          key: 'deadline',
          label: 'Direct debit notice no later than',
          description:
            "The deadline to notify tenants: the collection date minus the creditor's business days in advance."
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'Prepared and editable. Nobody has been notified yet.'
        },
        {
          value: 'VALIDATED',
          label: 'Approved',
          description: 'Debit notices have been sent. The file can be produced.'
        },
        {
          value: 'EXPORTED',
          label: 'File produced',
          description:
            'The file has been downloaded; it still has to be loaded on the bank, then the batch marked as submitted.'
        },
        {
          value: 'SUBMITTED',
          label: 'Submitted to the bank',
          description: 'You confirmed the submission to the bank. Returns can be recorded.'
        },
        {
          value: 'CANCELED',
          label: 'Cancelled',
          description: 'Abandoned: all its lines are canceled.'
        }
      ],
      notes: [
        'Under a filter, "No results" appears with a button to clear the criteria.',
        'Business days run from Monday to Friday; public holidays are not taken into account.'
      ]
    },
    faq: [
      {
        q: 'Is the total the amount finally collected?',
        a: 'No, it is the amount requested from the bank. Actual payments appear when you record the settlements.'
      },
      {
        q: 'Can I export the list?',
        a: 'Yes, with the table export button: all batches matching your filters are exported.'
      },
      {
        q: 'What should I filter to find batches to process?',
        a: 'Filter on "File produced" (to submit to the bank) or "Submitted to the bank" (returns to record).'
      }
    ],
    related: [
      {
        label: 'Batch detail',
        helpId: 'locatif.prelevements.remise'
      }
    ],
    keywords: ['batches', 'status', 'creditor', 'collection date', 'total']
  },
  {
    id: 'locatif.prelevements.remises.preparer',
    kind: 'section',
    title: 'Prepare a batch',
    summary:
      'This window creates a draft batch: you choose an active creditor, the collection date and, if you wish, a note. The system selects the mandates and installments to debit by itself.',
    purpose:
      "For each active mandate of the creditor, the system looks for the rent installment of the month of the chosen date. The amount debited is the remaining balance of that installment, limited to the mandate's cap if there is one.",
    steps: [
      {
        title: 'Choose the creditor',
        detail: 'Only active creditors are offered. If there is only one, it is already selected.'
      },
      {
        title: 'Choose the collection date',
        detail:
          "A date is suggested from the creditor's collection day. Dates too close to send the notice in time are greyed out."
      },
      {
        title: 'Add a note',
        detail: 'Optional, 2000 characters at most.'
      },
      {
        title: 'Click "Prepare"',
        detail: 'The batch opens as a draft, with the list of mandates not selected and the reason.'
      }
    ],
    consequences: [
      'Nothing is sent or debited at this stage: the batch is a draft.',
      "A mandate is not selected if: the mandate is not active (draft or suspended), the lease is not active, there is no installment for this month, the installment is paid or canceled, it is already in another batch, or the mandate's collection day falls later in the month.",
      'An installment can only be in one batch at a time: it becomes available again if the batch is canceled.'
    ],
    faq: [
      {
        q: 'Why is a tenant missing from the batch?',
        a: 'Look at "Mandates not included": each mandate left out is listed there with its reason.'
      },
      {
        q: "What happens if the rent exceeds the mandate's cap?",
        a: 'The line is limited to the cap and marked "Capped"; the rest of the amount is not debited.'
      },
      {
        q: 'No creditor is offered. What should I do?',
        a: 'Create or activate a creditor in the direct debit mandates screen.'
      }
    ],
    related: [
      {
        label: 'Batch detail',
        helpId: 'locatif.prelevements.remise'
      },
      {
        label: 'Direct debit mandates',
        helpId: 'locatif.prelevements.mandats'
      }
    ],
    keywords: ['prepare', 'new batch', 'date', 'creditor', 'cap', 'business days']
  },
  {
    id: 'locatif.prelevements.retours.import',
    kind: 'section',
    title: 'Import a bank return',
    summary:
      'Drop the bank return CSV file: the screen first shows a preview without changing anything, then you apply it to record settlements and rejections.',
    purpose:
      'After the collection date, the bank states which debits went through or were rejected. This import saves you from recording them one by one.',
    steps: [
      {
        title: 'Choose the file',
        detail:
          'Click "Choose a CSV file". Expected columns: reference_operation, statut, date, montant, code_rejet, motif.'
      },
      {
        title: 'Read the preview',
        detail:
          'The table matches each file row with a batch line. The counters give settlements, rejections, ignored rows and reading errors.'
      },
      {
        title: 'Check the discrepancies',
        detail:
          '"Reason for the difference" explains why a row is ignored: unknown reference, different amount, line already processed or canceled, date outside the allowed period.'
      },
      {
        title: 'Click "Apply"',
        detail: 'The button stays greyed out if there is no settlement or rejection to apply.'
      },
      {
        title: 'Confirm',
        detail: 'Click "Confirm and apply": the report shows the successful records and the failed ones.'
      }
    ],
    howToRead: {
      columns: [
        {
          key: 'row',
          label: 'File line',
          description: 'The row number in your file.'
        },
        {
          key: 'reference',
          label: 'Operation reference',
          description: 'The debit operation reference, found in the batch.'
        },
        {
          key: 'outcome',
          label: 'Bank return',
          description: 'Paid or Rejected, with the date given by the bank.'
        },
        {
          key: 'amount',
          label: 'Amount',
          description: 'The amount in the file, in FCFA. It must equal that of the line.'
        },
        {
          key: 'action',
          label: 'Action',
          description:
            '"Record the payment", "Record the rejection" or "Skipped". "Late rejection": the line was already settled.'
        },
        {
          key: 'skipReason',
          label: 'Reason for the difference',
          description: 'Why the row is ignored; a dash means it will be applied.'
        },
        {
          key: 'match',
          label: 'Matched line',
          description: 'The batch, tenant and amount found.'
        }
      ]
    },
    consequences: [
      'The preview changes nothing: records are only written at "Apply", after a confirmation.',
      'Each settlement creates a payment on the lease and issues its receipt.',
      'A late rejection (line already settled) cancels the recorded payment and its receipt; their number is repeated in the confirmation.',
      "A rejection may re-bill fees to the tenant and suspend the mandate after several consecutive rejections, depending on the creditor's settings. The tenant is notified of the rejection by e-mail if this notification is enabled for your agency.",
      'A file already imported is flagged with a warning showing the import date. Each import is kept in the history.'
    ],
    faq: [
      {
        q: 'My file is refused or unreadable. What should I do?',
        a: 'Check that it is a CSV with the expected columns. Unreadable rows are listed with their number.'
      },
      {
        q: 'Can I undo a settlement applied by mistake?',
        a: 'Only a late rejection on the line, from the batch detail, cancels the payment and the receipt.'
      },
      {
        q: 'Why are some rows ignored?',
        a: 'See the "Reason for the difference" column. For example, a batch whose file has not been produced cannot receive a return.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      roles: ['Manager', 'Accountant'],
      note: 'Requires "Manage direct debits".'
    },
    related: [
      {
        label: 'Record a settlement or rejection by hand',
        helpId: 'locatif.prelevements.retours.constats'
      },
      {
        label: 'Returns history',
        helpId: 'locatif.prelevements.retours.historique'
      }
    ],
    keywords: ['return', 'CSV file', 'rejection', 'settlement', 'import', 'bank', 'reconciliation']
  },
  {
    id: 'locatif.prelevements.retours.historique',
    kind: 'table',
    title: 'Bank returns history',
    summary: 'This list keeps a record of every return file imported: when, by whom and with what result.',
    howToRead: {
      columns: [
        {
          key: 'createdAt',
          label: 'Date',
          description: 'The import date.'
        },
        {
          key: 'fileName',
          label: 'File',
          description: 'The name of the imported file.'
        },
        {
          key: 'recordCount',
          label: 'Lines read',
          description: 'The number of usable rows in the file.'
        },
        {
          key: 'settledCount',
          label: 'Paid',
          description: 'The rows recorded as settled.'
        },
        {
          key: 'rejectedCount',
          label: 'Rejected',
          description: 'The rows recorded as rejected.'
        },
        {
          key: 'skippedCount',
          label: 'Skipped',
          description: 'The rows left aside (the reason is visible in the import preview).'
        },
        {
          key: 'errorCount',
          label: 'Errors',
          description: 'The unreadable rows of the file.'
        },
        {
          key: 'importedBy',
          label: 'Imported by',
          description: 'The person who applied the import.'
        }
      ],
      notes: ['Search by file name and by import period. Ten files per page.']
    },
    faq: [
      {
        q: 'Can I reopen a file from this list?',
        a: 'No, it is a read-only log.'
      },
      {
        q: 'Where can I see the detail of each line?',
        a: 'In the detail of the batch concerned: status, value or rejection date, payment.'
      },
      {
        q: 'Why is the list empty?',
        a: 'No return file has been imported by your agency yet.'
      }
    ],
    related: [
      {
        label: 'Import a bank return',
        helpId: 'locatif.prelevements.retours.import'
      }
    ],
    keywords: ['history', 'import', 'return file', 'log']
  },
  {
    id: 'locatif.prelevements.remise',
    kind: 'page',
    title: 'Direct debit batch detail',
    summary:
      'Follow a batch from start to finish here: its lines, the notices sent to tenants, the file for the bank and the result of the debits. The buttons offered change with the status.',
    purpose:
      'A batch always follows the same path: Draft, Approved, File produced, Submitted to the bank. At each step some actions are possible and others no longer are.',
    steps: [
      {
        title: 'Check the draft',
        detail: '"Refresh" recalculates the lines from today\'s installments and mandates. "Remove" removes a line.'
      },
      {
        title: 'Validate the batch',
        detail: '"Validate the batch" sends a debit notice by e-mail to the tenants.'
      },
      {
        title: 'Produce the file',
        detail: '"Produce the file" downloads the file to load on your online banking.'
      },
      {
        title: 'Submit to the bank',
        detail: 'Load the file on the bank, then click "Mark as submitted to the bank".'
      },
      {
        title: 'Record the returns',
        detail:
          '"Record the payment" or "Record the rejection" line by line, "Record all as paid", or import the bank file.'
      },
      {
        title: 'Cancel if needed',
        detail: '"Cancel the batch" is possible as long as it has not been submitted to the bank.'
      }
    ],
    consequences: [
      'Validating sends the notices by e-mail. "Resend the direct debit notices" targets those who did not receive them.',
      'Once the file is produced, a line can no longer be removed: only canceling the batch remains possible. The file contains full IBANs: keep it carefully.',
      'Canceling a batch is final. If the file is already at the bank, also cancel the batch there, otherwise the accounts will be debited.',
      'Recording a settlement creates a payment and its receipt; recording a rejection may re-bill fees and suspend the mandate.'
    ],
    faq: [
      {
        q: 'Why is "Validate the batch" greyed out?',
        a: 'The batch has no line with the status "To be debited".'
      },
      {
        q: 'Why can I not remove the last line?',
        a: 'The last line of a validated batch cannot be removed: cancel the batch instead.'
      },
      {
        q: 'I see no action button.',
        a: 'Actions require "Manage direct debits". A canceled batch no longer offers any.'
      },
      {
        q: 'Can the file be downloaded again?',
        a: 'Yes, with "Download the file again": a warning flags a mandate that became inactive but is still in the file.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      roles: ['Manager', 'Accountant'],
      note: 'Viewing requires "View direct debits"; all actions require "Manage direct debits".'
    },
    related: [
      {
        label: 'Batch information',
        helpId: 'locatif.prelevements.remise.synthese'
      },
      {
        label: 'Debit notices',
        helpId: 'locatif.prelevements.remise.avis'
      },
      {
        label: 'Batch lines',
        helpId: 'locatif.prelevements.remise.lignes'
      },
      {
        label: 'Record a settlement or rejection',
        helpId: 'locatif.prelevements.retours.constats'
      },
      {
        label: 'Cancel a batch',
        helpId: 'locatif.prelevements.remise.annulation'
      }
    ],
    keywords: ['batch', 'validate', 'file', 'bank', 'notice', 'direct debit', 'cancel', 'IBAN'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'remise-actions',
          title: 'The actions',
          description:
            'These buttons depend on the batch status: validate, produce the file, mark as submitted, record, cancel.'
        },
        {
          target: 'remise-lignes',
          title: 'The lines',
          description: 'One line per debited tenant, with its notice, status and actions.'
        }
      ]
    }
  },
  {
    id: 'locatif.prelevements.remise.synthese',
    kind: 'section',
    title: 'Batch information',
    summary: 'This block summarizes the batch: reference, creditor, dates, total and steps already completed.',
    howToRead: {
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'Prepared, not yet validated.'
        },
        {
          value: 'VALIDATED',
          label: 'Approved',
          description: 'Notices sent; file not produced.'
        },
        {
          value: 'EXPORTED',
          label: 'File produced',
          description: 'File downloaded, not yet declared submitted.'
        },
        {
          value: 'SUBMITTED',
          label: 'Submitted to the bank',
          description: 'Submission confirmed by you.'
        },
        {
          value: 'CANCELED',
          label: 'Cancelled',
          description: 'Abandoned; the cancellation reason is shown.'
        }
      ],
      notes: [
        '"Creditor identifier": the creditor\'s identifier with the bank, a dash if not filled in.',
        '"File format": the format of the file produced for the bank.',
        '"Validated on", "File produced on", "Submitted to the bank on" and "Canceled on" only appear once the step is done. "Last download" appears if the file was produced several times.'
      ]
    },
    faq: [
      {
        q: 'How is the "Direct debit notice no later than" date calculated?',
        a: "It is the collection date minus the creditor's business days in advance (Monday to Friday, no public holidays)."
      },
      {
        q: 'What is the period?',
        a: 'The month of the collection date.'
      },
      {
        q: 'What does "Total" mean?',
        a: 'The sum of the batch lines, in FCFA.'
      }
    ],
    related: [
      {
        label: 'Batch lines',
        helpId: 'locatif.prelevements.remise.lignes'
      }
    ],
    keywords: ['information', 'reference', 'creditor', 'date', 'file format', 'issuer']
  },
  {
    id: 'locatif.prelevements.remise.avis',
    kind: 'section',
    title: 'Debit notices',
    summary:
      'Before the debit, each tenant receives a notice by e-mail. This message shows how many were sent, are in progress or failed.',
    howToRead: {
      statuses: [
        {
          value: 'PENDING',
          label: 'Pending',
          description: 'The notice has not gone out yet; the page refreshes by itself for two minutes at most.'
        },
        {
          value: 'SENT',
          label: 'Sent',
          description: 'The notice has gone out.'
        },
        {
          value: 'NO_EMAIL',
          label: 'No email',
          description: 'The tenant has no e-mail address: notify them another way.'
        },
        {
          value: 'DISABLED',
          label: 'Disabled',
          description: 'Sending these notices is disabled for your agency.'
        },
        {
          value: 'FAILED',
          label: 'Failed',
          description: 'Sending failed; use "Resend the direct debit notices".'
        }
      ],
      notes: [
        "The notice goes to the tenant's portal account address if they have one, otherwise to their contact record address. The alert counts the addresses of each type.",
        'The alert is green only if all lines have received their notice.'
      ]
    },
    consequences: [
      'Notices are sent when the batch is validated. "Resend the direct debit notices" targets those who did not receive them.',
      'Before "Produce the file", the confirmation reminds you of the number of tenants without a notice.'
    ],
    faq: [
      {
        q: 'A tenant says they did not receive their notice.',
        a: 'Look at their line: "No email" or "Failed". Fix the address on their record, then "Resend the direct debit notices".'
      },
      {
        q: 'What happens if notices are missing when I produce the file?',
        a: 'The screen tells you the number of tenants without a notice before producing the file.'
      },
      {
        q: 'Where can I see the address used?',
        a: 'In the "Direct debit notice" column of the lines, partly masked.'
      }
    ],
    related: [
      {
        label: 'Batch lines',
        helpId: 'locatif.prelevements.remise.lignes'
      }
    ],
    keywords: ['notice', 'prenotification', 'e-mail', 'tenant', 'resend']
  },
  {
    id: 'locatif.prelevements.remise.lignes',
    kind: 'table',
    title: 'Batch lines',
    summary: "Each line is a debit on a tenant's account, linked to a mandate and a rent installment.",
    howToRead: {
      columns: [
        {
          key: 'reference',
          label: 'Operation reference',
          description: 'The unique operation reference: the bank sends it back in its return file.'
        },
        {
          key: 'debtor',
          label: 'Debtor',
          description: 'The debited tenant.'
        },
        {
          key: 'lease',
          label: 'Lease',
          description: 'The lease concerned; click to open its page.'
        },
        {
          key: 'mandate',
          label: 'Mandate',
          description:
            'The mandate reference and the masked IBAN. A tag flags a mandate that became suspended, revoked or not activated.'
        },
        {
          key: 'period',
          label: 'Period',
          description: 'The month of the debited installment.'
        },
        {
          key: 'remaining',
          label: 'Remaining due',
          description: 'What was left to pay on the installment at the time of selection.'
        },
        {
          key: 'amount',
          label: 'Amount debited',
          description: 'The amount requested, in FCFA. "Capped": limited to the mandate cap.'
        },
        {
          key: 'prenotification',
          label: 'Direct debit notice',
          description: 'The notice status, its date and the address used; "no address" if the tenant has none.'
        },
        {
          key: 'status',
          label: 'Status',
          description: 'The fate of the line (see below), with the removal reason or the rejection code and reason.'
        },
        {
          key: 'returnDate',
          label: 'Value or rejection date',
          description: 'The recorded date of the settlement or rejection.'
        },
        {
          key: 'rejectFee',
          label: 'Fees re-invoiced',
          description: 'The rejection fees re-billed to the tenant, in FCFA, or a dash.'
        },
        {
          key: 'payment',
          label: 'Payment',
          description: 'For a settled line: "View payment" opens the payment created.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            'Depending on the batch status: "Remove", "Record the payment", "Record the rejection" or "Record a late rejection".'
        }
      ],
      statuses: [
        {
          value: 'PENDING',
          label: 'To be debited',
          description: 'Waiting for the debit or its result.'
        },
        {
          value: 'SETTLED',
          label: 'Paid',
          description: 'The debit went through; a payment and its receipt were created.'
        },
        {
          value: 'REJECTED',
          label: 'Rejected',
          description: 'The bank refused the debit.'
        },
        {
          value: 'CANCELED',
          label: 'Cancelled',
          description: 'Removed from the batch or batch canceled; the line appears faded.'
        }
      ],
      notes: [
        'The "Value or rejection date", "Fees re-invoiced" and "Payment" columns only appear once the file is produced or a result is recorded.',
        'The search covers the reference, debtor, mandate and lease; you can also filter by status or amount.'
      ]
    },
    steps: [
      {
        title: 'Remove a line',
        detail: 'Before the file is produced: "Remove", optional reason, then confirm.'
      },
      {
        title: 'Record a result',
        detail: 'After the file is produced: "Record the payment" or "Record the rejection" on the line.'
      }
    ],
    consequences: [
      'Removing a line is final; if the batch is validated, the tenant already has their notice: let them know. The last line cannot be removed.',
      'A removed line frees its installment for another batch.',
      'A settlement creates a payment and its receipt; a late rejection on a settled line cancels them.'
    ],
    faq: [
      {
        q: 'What does "Capped" mean?',
        a: 'The balance due exceeded the mandate cap: only the cap is debited. Hover over the tag to see it.'
      },
      {
        q: 'Why does the mandate have an orange tag?',
        a: 'It has not been active since the preparation, but the file still contains this debit. Remove the line if that is still possible.'
      },
      {
        q: 'Where is the rejection code?',
        a: 'Under the "Rejected" status, with the reason entered.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Line actions require "Manage direct debits".'
    },
    related: [
      {
        label: 'Record a settlement or rejection',
        helpId: 'locatif.prelevements.retours.constats'
      },
      {
        label: 'Direct debit mandates',
        helpId: 'locatif.prelevements.mandats'
      }
    ],
    keywords: ['lines', 'debtor', 'tenant', 'mandate', 'capped', 'status', 'remove']
  },
  {
    id: 'locatif.prelevements.retours.constats',
    kind: 'section',
    title: 'Record a settlement or rejection',
    summary:
      'Once the file is produced, you record here the result of each debit by hand: settlement, rejection, late rejection or "Record all as paid".',
    purpose:
      'The "Bank return: …" message at the top of the batch gives the pending, settled and rejected lines with their amounts. The state moves from "Bank return awaited" to "Partial return" then "Complete return".',
    steps: [
      {
        title: 'Choose the line',
        detail: 'In the table, "Record the payment" or "Record the rejection".'
      },
      {
        title: 'Choose the date',
        detail:
          'Value date or rejection date: between the collection date and today. No record is possible before the collection date.'
      },
      {
        title: 'For a rejection: code and reason',
        detail:
          'At least one of the two is required. Code: letters, digits, dash, underscore, 20 characters at most; reason: 500 characters at most.'
      },
      {
        title: 'Approve',
        detail: 'Click the window button. "Record all as paid" applies the same date to all pending lines.'
      }
    ],
    consequences: [
      'Settlement: a payment is recorded on the lease and its receipt is issued. The line becomes "Paid".',
      'Rejection: the line becomes "Rejected". Rejection fees may be re-billed to the tenant and the mandate suspended after several consecutive rejections, depending on the creditor; the window announces the fees and the suspension. The tenant receives a rejection e-mail if this notification is enabled for your agency.',
      'Late rejection: on a line already settled, it cancels the payment and its receipt.',
      '"Record all as paid" can only be undone by late rejections, line by line. Lines that failed are listed in the report.'
    ],
    faq: [
      {
        q: 'Why is the confirmation button greyed out?',
        a: 'The date is out of bounds or, for a rejection, neither a code nor a reason is entered.'
      },
      {
        q: 'Can I correct a mistake?',
        a: 'A settlement is corrected by a late rejection. A rejection cannot be undone from this screen.'
      },
      {
        q: 'Do I have to enter everything by hand?',
        a: 'No, importing the bank file records everything at once.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      roles: ['Manager', 'Accountant'],
      note: 'Requires "Manage direct debits".'
    },
    related: [
      {
        label: 'Import a bank return',
        helpId: 'locatif.prelevements.retours.import'
      }
    ],
    keywords: ['record', 'settlement', 'rejection', 'late rejection', 'receipt', 'payment', 'rejection fees']
  },
  {
    id: 'locatif.prelevements.remise.annulation',
    kind: 'section',
    title: 'Cancel a batch',
    summary: 'Canceling abandons the batch and all its lines; it is final. A reason is required.',
    steps: [
      {
        title: 'Click "Cancel the batch"',
        detail: 'Possible in Draft, Approved or File produced.'
      },
      {
        title: 'Read the message',
        detail: 'It changes with progress: nothing has gone out, notices already sent, or file already produced.'
      },
      {
        title: 'Enter the reason',
        detail: '1 to 500 characters, required.'
      },
      {
        title: 'Tick the box if asked',
        detail:
          'If the file is produced, tick that you checked it has not been loaded on the bank, or that you canceled it there.'
      }
    ],
    consequences: [
      'Final: all lines are canceled.',
      'Draft: nothing has gone out, the installments become available again for another batch.',
      'Approved: tenants have already received a notice; tell them the debit will not take place.',
      'File produced: if the file was loaded on the bank, also cancel the batch there, otherwise the accounts will be debited and a new batch would debit a second time.'
    ],
    faq: [
      {
        q: 'Can I cancel after submission to the bank?',
        a: 'No: the button is no longer offered once the batch is "Submitted to the bank".'
      },
      {
        q: 'Can a canceled batch be reopened?',
        a: 'No. Prepare a new batch.'
      },
      {
        q: 'How do I leave out a single tenant?',
        a: 'Use "Remove" on their line, as long as the file has not been produced.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Requires "Manage direct debits".'
    },
    related: [
      {
        label: 'Batch lines',
        helpId: 'locatif.prelevements.remise.lignes'
      }
    ],
    keywords: ['cancel', 'cancellation', 'reason', 'canceled batch']
  }
];

export default entries;
