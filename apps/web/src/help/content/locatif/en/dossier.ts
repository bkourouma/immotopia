import type { HelpEntry } from '../../../types';

/** Help entries of the dossier zone, locatif module (en). */
const entries: HelpEntry[] = [
  {
    id: 'locatif.depots.onglet',
    kind: 'section',
    title: 'Lease security deposit',
    summary:
      'This tab tracks the money the tenant paid as a guarantee: how much is expected, how much is held, and everything that happened since. Each collection, hold or refund is recorded as a "movement".',
    purpose:
      'The security deposit covers unpaid rent and possible damage. The agency collects it at the start of the lease, then returns it (in full or in part) at the end. This tab keeps a record of every step.',
    steps: [
      {
        title: 'Check the deposit',
        detail: 'Read "Target amount", "Current balance" and "Status" at the top of the tab.'
      },
      {
        title: 'Collect the deposit',
        detail: 'Click "New movement", choose "Collection" and select the tenant payment that matches the deposit.'
      },
      {
        title: 'Record another operation',
        detail: 'Hold, release, refund, forfeiture or adjustment: see the "New movement" card.'
      },
      {
        title: 'Review the history',
        detail: 'The "Movement history" table lists all operations, from newest to oldest.'
      }
    ],
    consequences: [
      'A recorded movement cannot be edited or deleted from this screen. Check the type and amount before saving.',
      'The deposit appears by itself the first time the tab is opened, provided the lease has a security deposit amount. Otherwise the screen shows "No security deposit configured for this lease".'
    ],
    faq: [
      {
        q: 'I cannot see the "New movement" button. Why?',
        a: 'It only appears if the deposit exists and you have the "Edit security deposits" right. Ask your agency administrator for it.'
      },
      {
        q: 'Why does the tab say no deposit is configured?',
        a: 'The lease has no security deposit amount. Edit the lease to enter one, then reopen the tab.'
      },
      {
        q: 'Where can I see the deductions proposed after the exit inspection?',
        a: 'In the "Inspection reports" tab, in the "Deductions from the security deposit" block of the exit inspection. They do not create any movement here: you record them yourself.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing the tab requires "View security deposits". The "New movement" button requires "Edit security deposits".'
    },
    related: [
      {
        label: 'Deposit balance and status',
        helpId: 'locatif.depots.solde'
      },
      {
        label: 'Record a movement',
        helpId: 'locatif.depots.mouvement'
      },
      {
        label: 'Movement history',
        helpId: 'locatif.depots.historique'
      },
      {
        label: 'Deductions proposed at exit',
        helpId: 'locatif.edl.retenues'
      },
      {
        label: 'Lease page',
        helpId: 'locatif.baux.fiche'
      }
    ],
    keywords: ['security deposit', 'deposit', 'guarantee', 'refund', 'movement', 'tenant']
  },
  {
    id: 'locatif.depots.solde',
    kind: 'section',
    title: 'Target amount, balance and deposit status',
    summary:
      'These three figures sum up the deposit: what is expected, what the agency holds today and whether the deposit is complete.',
    howToRead: {
      statuses: [
        {
          value: 'COMPLETE',
          label: 'Full',
          description: 'The current balance is at least equal to the target amount.'
        },
        {
          value: 'PENDING',
          label: 'Pending',
          description:
            'The current balance is lower than the target amount, for example before collection or after a refund.'
        }
      ],
      notes: [
        'Target amount: The security deposit amount set in the lease, in FCFA.',
        'Current balance: What the agency holds: everything collected (and adjusted), minus refunds and forfeitures. A hold does not change this balance.',
        'After a full refund, the status goes back to "Pending": it only compares the balance with the target amount.',
        'A "Hold" sets part of the deposit aside (for example for repairs) without taking it out of the balance.'
      ]
    },
    faq: [
      {
        q: 'Why is the balance 0 FCFA?',
        a: 'The deposit has not been collected yet. Record a "Collection" with the tenant payment.'
      },
      {
        q: 'Does the balance go down when I hold an amount?',
        a: 'No. Only a refund and a forfeiture lower the current balance.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Visible with "View security deposits".'
    },
    related: [
      {
        label: 'Record a movement',
        helpId: 'locatif.depots.mouvement'
      }
    ],
    keywords: ['balance', 'target amount', 'complete', 'pending', 'deposit', 'solde']
  },
  {
    id: 'locatif.depots.mouvement',
    kind: 'section',
    title: 'Record a deposit movement',
    summary:
      'The "New movement" form records an operation on the deposit: collection, hold, release, refund, forfeiture or adjustment.',
    purpose:
      'For each operation, the agency picks a type and an amount. The balance is updated right away and the operation stays visible in the history.',
    howToRead: {
      statuses: [
        {
          value: 'COLLECT',
          label: 'Collection',
          description:
            'Collection of the deposit. Once per deposit, for exactly the target amount, with an already collected tenant payment that has not been used elsewhere.'
        },
        {
          value: 'HOLD',
          label: 'Hold',
          description:
            'Sets part of the deposit aside, for example before repairs. The amount cannot exceed what remains available, holds already placed included.'
        },
        {
          value: 'RELEASE',
          label: 'Release',
          description: 'Cancels all or part of a hold. The amount cannot exceed the amount currently held.'
        },
        {
          value: 'REFUND',
          label: 'Refund',
          description:
            'Gives money back to the tenant. Lowers the balance. You can choose the "Treasury account" that is debited.'
        },
        {
          value: 'FORFEIT',
          label: 'Forfeiture',
          description: 'The agency keeps part of the deposit, for example for damage. Lowers the balance.'
        },
        {
          value: 'ADJUSTMENT',
          label: 'Adjustment',
          description:
            'Adds the entered amount to the balance as a correction. The form does not accept a negative amount.'
        }
      ],
      notes: [
        'A refund or forfeiture cannot exceed the current balance: the screen then shows the available balance.',
        'The "Linked payment" field only appears for a collection. It only lists collected payments whose free amount covers the deposit.'
      ]
    },
    steps: [
      {
        title: 'Open the form',
        detail: 'Click "New movement".'
      },
      {
        title: 'Choose the type',
        detail: 'In "Movement type", select the operation to record.'
      },
      {
        title: 'Collection: choose the payment',
        detail: 'Select the "Linked payment". The amount fills in by itself with the target amount.'
      },
      {
        title: 'Enter the amount',
        detail: 'Enter an amount greater than 0 FCFA, except for a collection where it is fixed.'
      },
      {
        title: 'Refund: choose the account',
        detail: 'If needed, specify the "Treasury account" to debit. Otherwise the default cash account is used.'
      },
      {
        title: 'Add a note',
        detail: 'Optional: explain for example the reason for a hold or a forfeiture.'
      },
      {
        title: 'Save',
        detail: 'Click "Save". The form closes and the history updates.'
      }
    ],
    consequences: [
      'Irreversible from this screen: a recorded movement cannot be edited or deleted.',
      'The balance, the held amount and the deposit status are recalculated immediately.',
      'The tenant and the owner are notified by e-mail if this notification is enabled for your agency and their address is known. The tenant also receives a WhatsApp message if your agency has set it up. A sending failure does not cancel the movement.',
      'Collection: the payment used is recognised as a security deposit. If it had created an advance on the tenant account, that advance is removed: a deposit is never used to pay rent.',
      'For a lease under direct management, the collection, refund and forfeiture are also entered in the accounts automatically.',
      'No document is generated by this action.'
    ],
    faq: [
      {
        q: 'Why is the "Linked payment" field empty?',
        a: 'No collected payment of this lease has a free amount at least equal to the expected deposit. Record the payment first, or check that it is not already allocated to a rent.'
      },
      {
        q: 'Why can I collect the deposit only once?',
        a: 'A deposit accepts only one collection, for the exact target amount. To fix a difference, use an "Adjustment".'
      },
      {
        q: 'What happens if I refund more than the balance?',
        a: 'Saving is refused with a message showing the available balance and the requested amount.'
      },
      {
        q: 'Are the exit inspection deductions recorded here?',
        a: 'No. They are the basis for the final settlement calculation. To apply them to the deposit, record a "Forfeiture" or a "Refund" yourself.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Requires the "Edit security deposits" right; without it, the "New movement" button is hidden.'
    },
    related: [
      {
        label: 'Movement history',
        helpId: 'locatif.depots.historique'
      },
      {
        label: 'Exit inspection deductions',
        helpId: 'locatif.edl.retenues'
      }
    ],
    keywords: [
      'collection',
      'collect deposit',
      'refund',
      'return',
      'forfeit',
      'hold',
      'adjustment',
      'deposit retention'
    ]
  },
  {
    id: 'locatif.depots.historique',
    kind: 'table',
    title: 'Movement history of the deposit',
    summary:
      'Each row is an operation recorded on the deposit, newest first. The amount is preceded by "+" (green) when it increases the balance and by "-" (red) when it lowers it.',
    howToRead: {
      columns: [
        {
          key: 'created_at',
          label: 'Date',
          description: 'The day the movement was recorded.'
        },
        {
          key: 'type',
          label: 'Type',
          description: 'The nature of the operation, with a green arrow (money in) or a red one (money out).'
        },
        {
          key: 'amount',
          label: 'Amount',
          description:
            'The amount in FCFA. A collection and an adjustment count as "+". A hold, a release, a refund and a forfeiture are shown with "-".'
        },
        {
          key: 'note',
          label: 'Note',
          description: 'The comment entered when saving, or a dash if there is none.'
        }
      ],
      statuses: [
        {
          value: 'COLLECT',
          label: 'Collection',
          description: 'Collection of the deposit.'
        },
        {
          value: 'HOLD',
          label: 'Hold',
          description: 'Amount set aside.'
        },
        {
          value: 'RELEASE',
          label: 'Release',
          description: 'Hold lifted.'
        },
        {
          value: 'REFUND',
          label: 'Refund',
          description: 'Money given back to the tenant.'
        },
        {
          value: 'FORFEIT',
          label: 'Forfeiture',
          description: 'Amount kept by the agency.'
        },
        {
          value: 'ADJUSTMENT',
          label: 'Adjustment',
          description: 'Correction added to the balance.'
        }
      ],
      notes: [
        'A hold and a release are shown with "-" although they do not change the current balance: only the held amount moves.'
      ]
    },
    faq: [
      {
        q: 'Can I export the history?',
        a: 'Yes, with the table export button. The exported amount is a signed number that you can add up in Excel.'
      },
      {
        q: 'I cannot find a movement.',
        a: 'The table shows all movements of this lease deposit. Check that you are on the right lease.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Visible with "View security deposits".'
    },
    related: [
      {
        label: 'Record a movement',
        helpId: 'locatif.depots.mouvement'
      }
    ],
    keywords: ['movements', 'history', 'deposit', 'collection', 'refund', 'export']
  },
  {
    id: 'locatif.documents.liste',
    kind: 'section',
    title: 'Lease documents',
    summary:
      'This tab gathers the documents produced for the lease: contract, rent receipts, statements. You can generate new ones, download them and regenerate them.',
    purpose:
      'Each document is prepared from the lease data and a document template, then kept here to be downloaded in Word format. The tenant and the owner concerned also find the documents that are not cancelled in their own space.',
    steps: [
      {
        title: 'Search a document',
        detail: 'Type a number, a title or a lease number in "Search".'
      },
      {
        title: 'Filter',
        detail: 'Narrow the list by "Type", "Status" or "Issued on" date.'
      },
      {
        title: 'Generate',
        detail: 'Click "Generate a document": see the form card.'
      },
      {
        title: 'Download',
        detail: 'Click "Download": the file is saved in Word format (.docx).'
      },
      {
        title: 'Update',
        detail: '"⋮" menu then "Regenerate from the current data": the document is rebuilt with today\'s lease data.'
      }
    ],
    consequences: [
      'A document generated from this tab immediately gets the "Final" status.',
      'Generating or regenerating a lease contract cancels the signature requests still in progress on this lease.',
      'No e-mail or SMS is sent when you generate a document.'
    ],
    faq: [
      {
        q: 'Where can I find the second "Rent receipt" type in the list (the one meant for the monthly rent payment acknowledgement)?',
        a: 'The English interface shows two types called "Rent receipt": the first is the rent receipt, the second is the monthly rent payment acknowledgement. This form can only generate the first one; the second exists in the list and in the "Type" filter but cannot be generated here.'
      },
      {
        q: 'What does "Regenerate" do?',
        a: 'It keeps the same document number, replaces the file with a new version and sets it back to "Final". The previous version is lost.'
      },
      {
        q: 'Why are there no buttons to delete a document?',
        a: 'This screen offers no deletion or status change: only "Download" and "Regenerate" exist.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing and downloading require "View rental documents". Generating and regenerating require "Generate rental documents".'
    },
    related: [
      {
        label: 'Documents table',
        helpId: 'locatif.documents.tableau'
      },
      {
        label: 'Generate a document',
        helpId: 'locatif.documents.generer'
      },
      {
        label: 'Lease page',
        helpId: 'locatif.baux.fiche'
      }
    ],
    keywords: [
      'documents',
      'contract',
      'receipt',
      'payment acknowledgement',
      'statement',
      'download',
      'word',
      'generate',
      'regenerate'
    ]
  },
  {
    id: 'locatif.documents.tableau',
    kind: 'table',
    title: 'Documents table',
    summary:
      'Each row is a lease document, with its number, type, issue date and status. On a phone, each document is shown as a card.',
    howToRead: {
      columns: [
        {
          key: 'document',
          label: 'Document',
          description: 'The document number, with its title below if it has one.'
        },
        {
          key: 'type',
          label: 'Type',
          description: 'The nature of the document (see the types below).'
        },
        {
          key: 'emis',
          label: 'Issued on',
          description: 'The date the document was created.'
        },
        {
          key: 'statut',
          label: 'Status',
          description: 'The state of the document (see below).'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Download" gets the file. The "⋮" menu offers "Regenerate from the current data".'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'Document not finalised.'
        },
        {
          value: 'FINAL',
          label: 'Final',
          description: 'Generated and valid document. This is the status of every document created from this tab.'
        },
        {
          value: 'VOID',
          label: 'Cancelled',
          description: 'Cancelled document: it is no longer shown to the tenant or the owner.'
        }
      ],
      notes: [
        'Possible types: "Lease agreement", "Amendment", "Rent receipt" (first entry), "Rent receipt" (second entry), "Deposit receipt", "Statement" and "Other". Only "Lease agreement", "Rent receipt" (first entry) and "Statement" can be generated from this tab.',
        'The export button saves all the documents that match your filters, not just the displayed page.'
      ]
    },
    faq: [
      {
        q: 'Why does a contract number end with "-A2"?',
        a: 'The first contract carries the lease number. Each new contract generated for the same lease adds "-A2", "-A3", and so on.'
      },
      {
        q: 'The download gives a Word file, not a PDF. Is that normal?',
        a: 'Yes: documents are provided in Word format (.docx), which you can then print or convert.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Visible with "View rental documents".'
    },
    related: [
      {
        label: 'Generate a document',
        helpId: 'locatif.documents.generer'
      }
    ],
    keywords: ['document list', 'document number', 'status', 'type', 'export']
  },
  {
    id: 'locatif.documents.generer',
    kind: 'section',
    title: 'Generate a document',
    summary:
      'The "Generate a document" form prepares a lease contract, a rent receipt or a statement from the lease data and a template.',
    purpose: 'You choose the type, possibly a template, then the document is created right away and added to the list.',
    howToRead: {
      notes: [
        '"Lease agreement": the residential or commercial template is chosen from the property type (office, shop and warehouse give a commercial contract).',
        '"Rent receipt": it covers the latest collected payment of the lease. If there is no collected payment, generation is refused.',
        '"Statement": you must enter "Start of the period" and "End of the period"; the end cannot be before the start.',
        '"Template (optional)" lists the active templates of the chosen type, and the default template is preselected. If there is none, the agency default template is used.'
      ]
    },
    steps: [
      {
        title: 'Open the form',
        detail: 'Click "Generate a document".'
      },
      {
        title: 'Choose the type',
        detail: 'In "Document type": "Lease agreement", "Rent receipt" or "Statement".'
      },
      {
        title: 'Statement: give the period',
        detail: 'Fill in "Start of the period" and "End of the period".'
      },
      {
        title: 'Title and description',
        detail: 'Optional: they appear in the list and go with the document.'
      },
      {
        title: 'Model',
        detail: 'Keep the preselected template or choose another one in "Template (optional)".'
      },
      {
        title: 'Generate',
        detail: 'Click "Generate document". A message confirms and the list updates.'
      }
    ],
    consequences: [
      'The document is created immediately, with the "Final" status and an automatically assigned number.',
      'A generated contract makes the signature requests in progress on the lease obsolete: you will have to restart the signature.',
      'If essential information is missing (agency address, tenant contact...), generation stops with a message naming the missing fields.',
      'No e-mail or SMS is sent: the file is only available in the list, for download.'
    ],
    faq: [
      {
        q: 'What if the message mentions "Missing critical fields"?',
        a: 'Complete the information listed (in the lease, the tenant or the agency record), then run the generation again.'
      },
      {
        q: 'A contract already exists for this lease. What happens if I generate another?',
        a: 'A new document is created with a number suffixed "-A2", "-A3"... To update the existing contract without creating a new number, use "Regenerate" in the "⋮" menu.'
      },
      {
        q: 'Why is the second "Rent receipt" type (the monthly acknowledgement) not offered?',
        a: 'Only three types have a generation template: "Lease agreement", "Rent receipt" and "Statement".'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Requires the "Generate rental documents" right.'
    },
    related: [
      {
        label: 'Lease documents',
        helpId: 'locatif.documents.liste'
      },
      {
        label: 'Electronic signatures',
        helpId: 'locatif.signatures.liste'
      }
    ],
    keywords: ['generate', 'lease contract', 'rent receipt', 'statement', 'template', 'payment acknowledgement']
  },
  {
    id: 'locatif.edl.panneau',
    kind: 'section',
    title: 'Lease inspection reports',
    summary:
      'This tab manages the two reports of a lease: the entry inspection and the exit inspection. Each one starts as a draft, then is finalised.',
    purpose:
      'The inspection describes each room and each item of the property (condition, photos, meters, keys). Comparing entry and exit helps justify possible deductions from the security deposit.',
    howToRead: {
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'Report being filled in: it can still be edited or deleted. "Continue" button.'
        },
        {
          value: 'FINALIZED',
          label: 'Finalised',
          description: 'Report locked, with its finalisation date. "View" button.'
        }
      ],
      notes: [
        '"Not done" means no inspection of that type exists yet; the "Start" button creates it.',
        'A lease can only have one entry inspection and one exit inspection.',
        'The "Compare move-in and move-out" button appears when both exist.'
      ]
    },
    steps: [
      {
        title: 'Start',
        detail: 'On the right card, click "Start", choose the date, then confirm.'
      },
      {
        title: 'Fill in',
        detail: 'Complete the rooms, items, meters and keys, then click "Save".'
      },
      {
        title: 'Finalise',
        detail: 'When everything is evaluated, click "Finalise".'
      },
      {
        title: 'View and sign',
        detail: 'On a finalised inspection, "View" lets you print and have it signed.'
      },
      {
        title: 'Compare',
        detail: 'Once entry and exit exist, "Compare move-in and move-out" shows the differences.'
      }
    ],
    consequences: [
      'Finalisation is irreversible: the report can no longer be edited, deleted, or receive photos.',
      'No e-mail or message is sent when an inspection is started or finalised.',
      'A draft can be deleted: this deletion is permanent and also removes its photos.'
    ],
    faq: [
      {
        q: 'Can I redo an inspection that is already finalised?',
        a: 'No: it can no longer be edited or deleted, and a lease allows only one inspection per type.'
      },
      {
        q: 'I cannot see "Start". Why?',
        a: 'Either an inspection of that type already exists ("Continue" or "View" is shown), or the screen is read-only for you. Creating and editing require the "Edit leases" right.'
      },
      {
        q: 'Must the entry be done before the exit?',
        a: 'It is not mandatory, but if the entry exists, the exit reuses its rooms and allows the comparison.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing inspections requires "View leases". Creating, editing, finalising, deleting and adding photos require "Edit leases".'
    },
    related: [
      {
        label: 'Start an inspection',
        helpId: 'locatif.edl.demarrer'
      },
      {
        label: 'Fill in an inspection',
        helpId: 'locatif.edl.saisie'
      },
      {
        label: 'Compare entry and exit',
        helpId: 'locatif.edl.comparaison'
      },
      {
        label: 'Lease page',
        helpId: 'locatif.baux.fiche'
      }
    ],
    keywords: ['inspection', 'check-in', 'check-out', 'entry', 'exit', 'report', 'draft', 'finalise']
  },
  {
    id: 'locatif.edl.demarrer',
    kind: 'section',
    title: 'Start an inspection',
    summary:
      'This window asks for the date of the report and, for an entry, the starting template. The draft is created as soon as you click "Start".',
    howToRead: {
      notes: [
        '"Inspection date": today\'s date by default.',
        '"Starting template": "Building only" offers the rooms and items of the property; "Building, furniture and equipment" adds furniture and equipment, with quantities. The second one is preselected if the property is furnished or partially furnished.',
        'For an exit whose entry exists, the template choice disappears: the entry rooms are reused as they are to allow the comparison.'
      ]
    },
    steps: [
      {
        title: 'Choose the date',
        detail: 'Change "Inspection date" if the report is not done today.'
      },
      {
        title: 'Choose the template',
        detail: 'Entry only: "Building only" or "Building, furniture and equipment".'
      },
      {
        title: 'Approve',
        detail: 'Click "Start": the input form opens.'
      }
    ],
    consequences: [
      'The draft is saved right away. If you leave without entering anything, it stays available via "Continue".',
      'The date can still be changed during input.'
    ],
    faq: [
      {
        q: 'Can I change the template after starting?',
        a: 'Not directly, but you can add or remove rooms and items during input. You can also delete the draft and start again.'
      },
      {
        q: 'Why does the exit not offer a template?',
        a: 'Because the entry exists: the exit reuses its rooms and items so that the comparison is exact.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Requires the "Edit leases" right.'
    },
    related: [
      {
        label: 'Fill in an inspection',
        helpId: 'locatif.edl.saisie'
      }
    ],
    keywords: ['start', 'new inspection', 'template', 'furnished', 'date']
  },
  {
    id: 'locatif.edl.saisie',
    kind: 'section',
    title: 'Fill in and finalise an inspection',
    summary:
      'The form gathers the date, the rooms, the meters and keys, the observations and the signatory names. Nothing is sent to the server before "Save".',
    purpose:
      'This is the report itself, filled in during the property visit. On an exit, each item recalls the condition recorded at entry.',
    steps: [
      {
        title: 'Fill in the rooms',
        detail: 'See the "Rooms, items, conditions and photos" card.'
      },
      {
        title: 'Record meters and keys',
        detail: 'Note "Electrical", "Water", "Gas" and "Number of keys". On an exit, the entry value is recalled.'
      },
      {
        title: 'Remarks',
        detail: 'Add your remarks in "General remarks".'
      },
      {
        title: 'Signatures',
        detail:
          'Say whether "The tenant is present", give his or her name ("Name of the signing tenant") and "Agent\'s name". These names are required to finalise.'
      },
      {
        title: 'Save',
        detail: 'Click "Save" to save the draft on the server.'
      },
      {
        title: 'Finalise',
        detail: 'Click "Finalise" then confirm. If some items are not evaluated, they are listed and their rooms open.'
      },
      {
        title: 'Delete the draft',
        detail: '"Delete the draft" button, with confirmation.'
      }
    ],
    consequences: [
      'Local draft: on every change, your input is also kept in the browser of this device. If the page is closed or the connection drops, a message "An unsaved local entry was found" offers "Restore" or "Ignore". This copy disappears after "Save", "Finalise" or deletion.',
      'Photos are an exception: they are sent as soon as they are added, without waiting for "Save".',
      '"Finalise" saves first, then asks for confirmation. Once finalised, the report can no longer be edited or deleted: it is irreversible.',
      'Finalisation is refused if the agent name is missing, if the tenant name is missing while the tenant is present, or if an item is not evaluated.',
      'On an exit, the confirmation message points out missing items without a deduction, but does not block.',
      'No e-mail is sent on finalisation. The document to sign is then prepared from "View", "Signatures" button.'
    ],
    faq: [
      {
        q: 'I lost my connection during the visit. Did I lose everything?',
        a: 'No, if you reopen the same inspection from the same device: the unsaved input is offered for restoration. Remember to click "Save" as soon as possible.'
      },
      {
        q: 'What does "{{nombre}} items have not been assessed yet" mean?',
        a: 'Some items have no condition (or no quantity for a piece of furniture). Complete them: they are listed and outlined in orange.'
      },
      {
        q: 'Why is the tenant name greyed out?',
        a: 'It can only be filled in if the "The tenant is present" switch is on.'
      },
      {
        q: 'Does finalisation notify the tenant?',
        a: 'No. The tenant is only contacted if you send the inspection for signature.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Requires the "Edit leases" right.'
    },
    related: [
      {
        label: 'Rooms, items, conditions and photos',
        helpId: 'locatif.edl.pieces'
      },
      {
        label: 'Deductions from the security deposit',
        helpId: 'locatif.edl.retenues'
      },
      {
        label: 'Inspection signatures',
        helpId: 'locatif.edl.signatures'
      }
    ],
    keywords: ['fill in', 'finalise', 'draft', 'meters', 'keys', 'observations', 'save', 'restore']
  },
  {
    id: 'locatif.edl.pieces',
    kind: 'section',
    title: 'Rooms, items, conditions and photos',
    summary:
      'Rooms are arranged in an accordion. For each item (floor, walls, windows, furniture...) you choose a condition, a comment and photos.',
    howToRead: {
      statuses: [
        {
          value: 'NEW',
          label: 'New',
          description: 'Item in perfect condition, like new.'
        },
        {
          value: 'GOOD',
          label: 'Good',
          description: 'Good condition.'
        },
        {
          value: 'FAIR',
          label: 'Worn',
          description: 'Normal wear.'
        },
        {
          value: 'POOR',
          label: 'Poor',
          description: 'Poor condition.'
        },
        {
          value: 'BROKEN',
          label: 'Broken',
          description: 'Out of order.'
        },
        {
          value: 'MISSING',
          label: 'Missing',
          description: 'The item is not there. For furniture, the quantity goes to 0.'
        }
      ],
      notes: [
        'An item is "evaluated" when it has a condition. A piece of furniture also needs a quantity, unless it is "Missing".',
        'Furniture: enter the "Quantity" and the "Replacement value (FCFA, per unit)". On an exit, "Same as at move-in" reuses the entry quantity.',
        'On an exit, each item recalls "Move-in: …" and shows "Damaged", "Missing" or "Quantity decrease" when the condition is worse than at entry.',
        'Each room title shows "to assess" as long as items have no condition.'
      ]
    },
    steps: [
      {
        title: 'Open a room',
        detail: 'Click its name to unfold its items. Click the name to rename it.'
      },
      {
        title: 'Choose the condition',
        detail: 'Press the matching button: New, Good, Worn, Poor, Broken or Missing.'
      },
      {
        title: 'Complete',
        detail: 'Add a comment, and the quantity and value for a piece of furniture.'
      },
      {
        title: 'Take photos',
        detail: '"Photo" button: on a phone, it opens the camera. A red cross deletes a photo.'
      },
      {
        title: 'Add or remove',
        detail: '"New item" then "Add" ("Furniture (with quantity)" box for furniture); "New room" then "Add a room".'
      }
    ],
    consequences: [
      'Photos are saved immediately: JPEG, PNG or WebP, 10 MB maximum each. They can no longer be added or removed once the inspection is finalised.',
      'On an exit, an item taken from the entry cannot be deleted, nor can its room: use "Missing".',
      'In the PDF to sign, only JPEG and PNG photos are included.'
    ],
    faq: [
      {
        q: 'Why can I not delete an item on the exit?',
        a: 'It comes from the entry inspection. Choose "Missing" instead of removing it: the difference stays visible in the comparison.'
      },
      {
        q: 'What is the difference between "Broken" and "Missing"?',
        a: '"Broken" means the item is there but out of order. "Missing" means it is not there; it is counted separately.'
      },
      {
        q: 'My photo is refused.',
        a: 'Use a JPEG, PNG or WebP image under 10 MB.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Requires the "Edit leases" right.'
    },
    related: [
      {
        label: 'Fill in and finalise',
        helpId: 'locatif.edl.saisie'
      },
      {
        label: 'Compare entry and exit',
        helpId: 'locatif.edl.comparaison'
      }
    ],
    keywords: [
      'room',
      'item',
      'condition',
      'new',
      'good',
      'worn',
      'poor',
      'out of order',
      'missing',
      'photo',
      'furniture',
      'quantity'
    ]
  },
  {
    id: 'locatif.edl.retenues',
    kind: 'section',
    title: 'Deductions from the security deposit',
    summary:
      'This block, specific to the exit inspection, lists the amounts the agency plans to deduct from the deposit, with their total in FCFA.',
    purpose:
      'Each line has a label and an amount. You can enter them by hand or ask for suggestions based on the differences found between entry and exit.',
    howToRead: {
      notes: [
        '"Suggest from damage and missing items" adds lines: for a missing item or a reduced quantity, the replacement value multiplied by the missing quantity; for a damaged item, a line at 0 FCFA (no cost is known); for missing keys, a line at 0 FCFA.',
        'A suggested line keeps the suggested amount: if you change it, "Suggested: … FCFA" stays shown in grey. The total always uses the amount you entered.',
        '"Replacement value not provided: amount to be entered" flags a missing item whose value is unknown.',
        'Suggestions are never added twice for the same item, and there is only one keys line.'
      ]
    },
    steps: [
      {
        title: 'Suggest',
        detail: 'Click "Suggest from damage and missing items".'
      },
      {
        title: 'Adjust',
        detail: 'Edit the "Deduction label" and the "Deduction amount" of each line.'
      },
      {
        title: 'Add or remove',
        detail: '"Add a line" creates a free deduction; the bin removes a line.'
      },
      {
        title: 'Check the total',
        detail: 'The "Total" at the bottom sums up the deductions, in FCFA.'
      },
      {
        title: 'Save',
        detail: 'Click "Save": the lines are only kept at that moment.'
      }
    ],
    consequences: [
      'Nothing is added without your click, and each line stays editable until finalisation.',
      'These deductions do not create any movement in the "Security deposit" tab: they feed the lease final settlement calculation (deposit held, minus unpaid amounts, minus deductions).',
      'To actually apply a deduction to the deposit, then record a "Forfeiture" or a "Refund" in the "Security deposit" tab.',
      'Once the inspection is finalised, the deductions are read-only.'
    ],
    faq: [
      {
        q: 'Why is a suggested deduction at 0 FCFA?',
        a: 'For damage or missing keys, no value is known: you have to enter the amount.'
      },
      {
        q: 'The block does not appear on my entry inspection.',
        a: 'That is normal: deductions only exist for the exit.'
      },
      {
        q: 'Are deductions taken automatically from the deposit?',
        a: 'No. They are the basis for the final settlement; the deposit only changes if you record a movement.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Requires the "Edit leases" right.'
    },
    related: [
      {
        label: 'Security deposit movements',
        helpId: 'locatif.depots.mouvement'
      },
      {
        label: 'Compare entry and exit',
        helpId: 'locatif.edl.comparaison'
      }
    ],
    keywords: ['deduction', 'deductions', 'security deposit', 'damage', 'missing', 'final settlement', 'keys']
  },
  {
    id: 'locatif.edl.comparaison',
    kind: 'section',
    title: 'Compare entry and exit',
    summary:
      'This window puts the entry inspection and the exit inspection side by side: a summary in figures, then the detail item by item.',
    purpose:
      'It shows what changed during the lease. These are findings: the window does not say who is responsible for a difference.',
    howToRead: {
      notes: [
        '"Missing items": items absent at exit that were there at entry.',
        '"Quantity decreases": furniture whose quantity decreased.',
        '"Damaged": items in a worse condition than at entry.',
        '"Replacement value of missing items": sum of the replacement values of the missing items, in FCFA.',
        'The "Keys" block gives the number at entry and at exit, and flags missing keys.',
        'A meters table shows the entry and exit readings and their difference.',
        'The "Show differences only" switch hides the rows with no change.'
      ]
    },
    steps: [
      {
        title: 'Open',
        detail: 'Click "Compare move-in and move-out" (visible when both inspections exist).'
      },
      {
        title: 'Read the summary',
        detail: 'The four figures at the top sum up the differences.'
      },
      {
        title: 'Filter',
        detail: 'Turn on "Show differences only" to keep only the problem rows.'
      },
      {
        title: 'Export',
        detail: 'Use the table export button to keep the comparison.'
      }
    ],
    consequences: [
      'Read-only: this window changes nothing.',
      'The comparison works even if one of the two inspections is still a draft; it then reflects the latest saved version.'
    ],
    faq: [
      {
        q: 'Why is a row red or purple?',
        a: 'Red: the item is damaged. Purple: it is missing, reduced in quantity or absent from the exit.'
      },
      {
        q: 'What does "Absent at move-out" mean?',
        a: 'The item was in the entry inspection but no longer exists in the exit inspection.'
      },
      {
        q: 'Is an exit meter value lower than the entry an error?',
        a: 'The window flags it with "Move-out reading lower than at move-in": check both readings.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Visible with "View leases".'
    },
    related: [
      {
        label: 'Comparison table',
        helpId: 'locatif.edl.comparaison.tableau'
      },
      {
        label: 'Deductions from the security deposit',
        helpId: 'locatif.edl.retenues'
      }
    ],
    keywords: ['compare', 'comparison', 'entry', 'exit', 'differences', 'damaged', 'missing', 'meters']
  },
  {
    id: 'locatif.edl.comparaison.tableau',
    kind: 'table',
    title: 'Entry and exit comparison table',
    summary:
      'Each row is an item of the property, with its condition at entry and at exit and the value of what is missing.',
    howToRead: {
      columns: [
        {
          key: 'roomName',
          label: 'Attachment',
          description: 'The room where the item is.'
        },
        {
          key: 'label',
          label: 'Item',
          description: 'The name of the item.'
        },
        {
          key: 'entryCondition',
          label: 'Move-in condition',
          description: 'The condition recorded at entry (New, Good, Worn, Poor, Broken, Missing).'
        },
        {
          key: 'exitCondition',
          label: 'Move-out condition',
          description:
            'The condition recorded at exit, with tags "Missing", "Quantity decrease", "Damaged" or "Absent at move-out".'
        },
        {
          key: 'quantity',
          label: 'Quantity (move-in → move-out)',
          description: 'For furniture: quantity at entry then at exit. This column only appears if there is furniture.'
        },
        {
          key: 'missingValue',
          label: 'Value of missing items',
          description: 'Replacement value of the missing units, in FCFA.'
        }
      ],
      notes: ['A missing item is never counted as damaged: it is counted separately.']
    },
    faq: [
      {
        q: 'The value of a missing item is empty.',
        a: 'No replacement value was entered for this item. Enter it on the inspection or by hand in the deductions.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Visible with "View leases".'
    },
    related: [
      {
        label: 'Compare entry and exit',
        helpId: 'locatif.edl.comparaison'
      }
    ],
    keywords: ['table', 'comparison', 'room', 'item', 'condition', 'quantity', 'value']
  },
  {
    id: 'locatif.edl.consultation',
    kind: 'section',
    title: 'View a finalised inspection',
    summary: 'A finalised inspection opens in read-only mode. You can print it or send it for signature.',
    steps: [
      {
        title: 'Print',
        detail: 'Click "Print": only the report goes on paper, without the buttons.'
      },
      {
        title: 'Have it signed',
        detail: 'Click "Signatures": see the signatures card.'
      },
      {
        title: 'Revert',
        detail: 'Click "Back" to get back to the entry and exit cards.'
      }
    ],
    consequences: [
      'Nothing can be edited, added or deleted here anymore.',
      'On a furnished entry, the total replacement value of the inventory is shown under the rooms. On an exit, the values recorded at entry are recalled next to the meters and keys.'
    ],
    faq: [
      {
        q: 'How do I correct a mistake on a finalised inspection?',
        a: 'It is not possible from the screen: the report is locked. Write the clarifications in another document or contact your administrator.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Visible with "View leases".'
    },
    related: [
      {
        label: 'Inspection signatures',
        helpId: 'locatif.edl.signatures'
      }
    ],
    keywords: ['view', 'print', 'read-only', 'finalised']
  },
  {
    id: 'locatif.edl.signatures',
    kind: 'section',
    title: 'Inspection signatures',
    summary:
      'A finalised inspection can be signed: on site, on screen, or remotely through a link sent by e-mail. The "Signatures" button is in the view screen.',
    purpose:
      'In the input form, the "Signatures" block only keeps the tenant presence and the signatory names. The signature itself happens after finalisation.',
    howToRead: {
      notes: [
        'Signatories are prefilled: the agent, the tenant, the co-tenants and the owner.',
        'The agent always signs on site. The tenant too if marked present; the others receive a link by e-mail.',
        'An inspection that is already signed cannot be sent for signature again, but its requests and their PDFs remain available.'
      ]
    },
    steps: [
      {
        title: 'Open',
        detail: 'View the finalised inspection then click "Signatures".'
      },
      {
        title: 'Check the signatories',
        detail: 'Correct the names and signature modes if needed.'
      },
      {
        title: 'Sign',
        detail: 'People present draw their signature on screen; the others receive their link.'
      },
      {
        title: 'Follow up',
        detail: 'The window keeps the history of requests and their PDF.'
      }
    ],
    consequences: [
      'The document to sign is a PDF generated from the finalised inspection, with its JPEG and PNG photos.',
      'Remote signatories receive an e-mail with their link.',
      'A draft cannot be sent for signature: finalise it first.'
    ],
    faq: [
      {
        q: 'Why does the message say "This inspection report has already been signed"?',
        a: 'A signature request is already completed: sending is closed, but you can view the requests and their PDFs.'
      },
      {
        q: 'The tenant is not there, how do they sign?',
        a: 'Turn off "The tenant is present" before finalising: they will then receive a link by e-mail.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'The details of the signature process are described in the electronic signatures help.'
    },
    related: [
      {
        label: 'Electronic signatures',
        helpId: 'locatif.signatures.liste'
      }
    ],
    keywords: ['signature', 'sign', 'pdf', 'inspection', 'on site', 'e-mail']
  }
];

export default entries;
