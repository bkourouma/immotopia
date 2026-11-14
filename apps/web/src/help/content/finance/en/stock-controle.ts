import type { HelpEntry } from '../../../types';

/** Zone « stock-controle » du module finance (en). */
const entries: HelpEntry[] = [
  // ===========================================================================
  // Transfers and stocktake
  // ===========================================================================
  {
    id: 'finance.inventaire.page',
    kind: 'page',
    title: 'Transfers and stocktake',
    summary:
      'Use this screen to move material from one location to another and to count what is there. A stocktake compares the quantity the system announces with the quantity actually counted.',
    purpose:
      'Stock in the store and on each site is kept up to date through receipts, issues and transfers. A stocktake checks these quantities on the spot and corrects the differences in a traceable way: one reason per difference, approval by another person and a report.',
    steps: [
      {
        title: 'Choose the tab',
        detail:
          '"Transfer between locations" (if you have the right to transfer) or "Physical stocktake". Without the right to transfer, only the stocktake is shown.'
      },
      {
        title: 'Open a stocktake',
        detail: '"Physical stocktake" tab, "Open a stocktake" button, then choose the location to count.'
      },
      {
        title: 'Count blind',
        detail:
          'Enter the counted quantity, item by item. The screen does not show the expected quantity during the count.'
      },
      { title: 'Close the count', detail: 'The differences then appear, line by line.' },
      { title: 'Justify the differences', detail: 'Each difference gets a reason chosen from a list.' },
      {
        title: 'Get it approved',
        detail: 'Another authorised person approves the stocktake. The differences become stock adjustments.'
      }
    ],
    consequences: [
      'Nothing changes in the stock until the stocktake is approved.',
      'Approval is irreversible: it turns each difference into a stock adjustment and, when the difference has a value, into an accounting entry. A mistake is corrected with a new stocktake of the same location.',
      'A transfer moves material from one location to another without charging it to a site: it is not an expense. Only a stock issue charges a site.'
    ],
    faq: [
      {
        q: 'Why is the expected quantity not shown?',
        a: 'A count is done blind, so that nobody counts "what they are supposed to find". The expected quantity and the differences appear only once the count is closed.'
      },
      {
        q: 'I cannot see the "Transfer between locations" tab.',
        a: 'It requires the "Transfer" right. Without it, the screen opens directly on the physical stocktake.'
      },
      {
        q: 'How do I find a stocktake done through WhatsApp?',
        a: 'It is in the list like the others, with the "Opened via WhatsApp" badge in its header. The "Open the stocktake" link on the "Field counts" screen also leads to it.'
      },
      {
        q: 'Why are some FCFA values missing?',
        a: 'Stock values are only shown with the "See stock values" right. A message at the top of the screen reminds you.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      roles: ['Storekeeper (count, transfer)', 'Stock manager (approve)'],
      note: 'Seeing the screen requires "View stock". Opening, counting and closing require "Count". Approving or abandoning requires "Approve stocktakes". Transferring requires "Transfer".'
    },
    related: [
      { label: 'The agency’s stocktakes', helpId: 'finance.inventaire.liste' },
      { label: 'Approve a stocktake', helpId: 'finance.inventaire.validation' },
      { label: 'Stock control: alerts and thresholds', helpId: 'finance.controle-stock.page' },
      { label: 'Field counts', helpId: 'finance.comptages-terrain.page' }
    ],
    keywords: [
      'stocktake',
      'inventory',
      'count',
      'difference',
      'variance',
      'transfer',
      'adjustment',
      'report',
      'store',
      'site'
    ],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'inventaire-onglets',
          title: 'Two tabs',
          description: '"Transfer between locations" moves material; "Physical stocktake" counts what is on a location.'
        },
        {
          target: 'inventaire-ouvrir',
          title: 'Open a stocktake',
          description: 'Choose the location to count. Only one count in progress is possible per location.'
        },
        {
          target: 'inventaire-liste',
          title: 'The list of stocktakes',
          description:
            'The button in the last column resumes the stocktake where it stands: counting, differences or viewing.'
        },
        {
          target: 'inventaire-validation',
          title: 'Approve',
          description:
            'Once the differences are justified, another authorised person approves. This step appears when a closed stocktake is open.'
        }
      ]
    }
  },
  {
    id: 'finance.inventaire.transfert',
    kind: 'section',
    title: 'Transfer between locations',
    summary:
      'Move a quantity of an item from one location (store or site) to another. A transfer charges nothing: it is not an expense.',
    purpose:
      'Delivering cement from the store to a site looks like an expense, but the material remains an asset of the agency, simply elsewhere. The site cost does not change: only a stock issue charges a site.',
    steps: [
      {
        title: 'Origin and destination locations',
        detail: 'Two different locations. A closed site cannot receive.'
      },
      { title: 'Item transferred', detail: 'Choose the item.' },
      {
        title: 'Quantity',
        detail:
          'The screen shows what is left at the origin location, unless that location is being counted. A quantity above the stock is refused.'
      },
      {
        title: 'Transfer date',
        detail: 'Today by default. A date that is too old is refused (limit set in "Control settings").'
      },
      {
        title: 'Who requests or takes it',
        detail:
          'A recipient from the register. If your agency does not require a recipient from the register, a name typed by hand is enough.'
      },
      {
        title: 'Reason for the transfer',
        detail:
          'Supplying a site, return to the store, clearing a site, rebalancing between locations or other (details required).'
      },
      { title: 'Save the transfer', detail: 'A summary of the last transfer appears below.' }
    ],
    consequences: [
      'Stock at the origin location goes down and stock at the destination goes up by the same quantity: two lines in the movement journal (an issue and a receipt).',
      'The value moved is calculated at the average cost of the origin location and is only shown with the "See stock values" right. No site is charged.',
      'Once the transfer is saved, you can attach a photo of the goods transferred.',
      'If the connection drops while sending, the screen offers to retry without creating two transfers: a message "This transfer was already saved" confirms it.'
    ],
    faq: [
      {
        q: 'Does a transfer reduce the site budget?',
        a: 'No. A site is only affected by a stock issue to that site, not by a transfer.'
      },
      {
        q: 'Why does the server refuse my quantity?',
        a: 'It exceeds what is left at the origin location. Check the quantity or save the missing receipt first.'
      },
      {
        q: 'Why is the available quantity not shown?',
        a: 'The origin location is being counted: its quantity stays hidden until the count is closed.'
      },
      {
        q: 'How do I cancel a transfer?',
        a: 'A transfer cannot be cancelled: to go back, save a transfer in the opposite direction.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', roles: ['Storekeeper'], note: 'Requires the "Transfer" right.' },
    related: [
      { label: 'Stock control: settings', helpId: 'finance.controle-stock.reglages' },
      { label: 'Stock management', to: '/tenant/:tenantId/finance/stock' }
    ],
    keywords: ['transfer', 'move', 'site delivery', 'store', 'cement', 'location', 'issue']
  },
  {
    id: 'finance.inventaire.physique',
    kind: 'section',
    title: 'Physical stocktake',
    summary:
      'Find the agency’s stocktakes and open a new one. A stocktake is counted blind, closed, justified, then approved by someone other than the person who counted.',
    howToRead: {
      statuses: [
        {
          value: 'DRAFT',
          label: 'Count in progress',
          description: 'Quantities are being entered. The expected quantity is hidden. The stocktake can be abandoned.'
        },
        {
          value: 'COUNTED',
          label: 'Count closed',
          description:
            'Quantities are frozen and differences appear. Each difference must still be justified, then approved.'
        },
        {
          value: 'VALIDATED',
          label: 'Approved',
          description: 'The differences have become stock adjustments. The stocktake can no longer be cancelled.'
        },
        {
          value: 'CANCELLED',
          label: 'Abandoned',
          description: 'The stocktake was not adjusted: the stock did not change. The location can be counted again.'
        }
      ],
      notes: [
        'Three kinds of stocktake: "Regular stocktake", "Opening stocktake" (records what is already on a location, surplus without value) and "Closing stocktake" (for sites, to close a site that still holds stock).',
        'Only one count in progress per location: until it is approved or abandoned, the location cannot be counted again.'
      ]
    },
    steps: [
      { title: 'Open a stocktake', detail: '"Open a stocktake" button ("Count" right).' },
      { title: 'Search', detail: 'By location, status, kind or count date, using the filter bar.' },
      { title: 'Resume a stocktake', detail: 'The button in the last column opens the detail below the list.' }
    ],
    faq: [
      {
        q: 'Why can I not open a stocktake on a location?',
        a: 'A stocktake is already in progress on this location: it shows "stocktake in progress" in the list of locations. Finish or abandon it first.'
      },
      {
        q: 'Where is the detail of a stocktake?',
        a: 'Below the list, after clicking the button on the row. "Close this stocktake" closes it again.'
      },
      {
        q: 'I cannot see the "Open a stocktake" button.',
        a: 'It requires the "Count" right.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      roles: ['Storekeeper', 'Site manager (count only)'],
      note: 'Opening and counting require "Count".'
    },
    related: [
      { label: 'Table of stocktakes', helpId: 'finance.inventaire.liste' },
      { label: 'Open a stocktake', helpId: 'finance.inventaire.ouverture' }
    ],
    keywords: ['stocktake', 'status', 'count in progress', 'draft', 'abandoned', 'kind']
  },
  {
    id: 'finance.inventaire.liste',
    kind: 'table',
    title: 'Table of stocktakes',
    summary:
      'Each row is a stocktake of the agency: the location, its kind, its date, its status, the number of lines and of differences.',
    howToRead: {
      columns: [
        { key: 'lieu', label: 'Place', description: 'The location counted (store or site location).' },
        {
          key: 'nature',
          label: 'Kind',
          description: 'Regular, opening or closing stocktake.'
        },
        { key: 'date', label: 'Counted on', description: 'The count date, chosen when the stocktake was opened.' },
        {
          key: 'etat',
          label: 'Status',
          description:
            'Where the stocktake stands. "Approved without a second look" means it was approved by the person who counted.'
        },
        { key: 'lignes', label: 'Lines', description: 'Number of items in the stocktake.' },
        {
          key: 'ecarts',
          label: 'Lines showing a variance',
          description: '"Hidden" while the count is in progress: differences are not visible.'
        },
        {
          key: 'valeur',
          label: 'Value of the variance',
          description:
            'Net difference in FCFA. "estimated" while the count is closed and not approved; frozen at approval. Visible with the "See stock values" right.'
        },
        { key: 'auteur', label: 'Opened by', description: 'The person who opened the stocktake.' },
        {
          key: 'validateur',
          label: 'Approved by',
          description: 'The person who approved, or a dash if not yet approved.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            '"Continue the count", "Justify the differences" or "View" depending on the status of the stocktake.'
        }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Count in progress', description: 'Quantities are being entered.' },
        { value: 'COUNTED', label: 'Count closed', description: 'Differences to justify, then approval.' },
        { value: 'VALIDATED', label: 'Approved', description: 'Differences applied to the stock.' },
        { value: 'CANCELLED', label: 'Abandoned', description: 'No adjustment.' }
      ]
    },
    faq: [
      {
        q: 'What does the export contain?',
        a: 'All stocktakes matching your filters, not just the page displayed.'
      },
      {
        q: 'Why "Hidden" in the differences column?',
        a: 'The stocktake is being counted: the screen shows neither the expected quantity nor differences before closing.'
      },
      {
        q: 'The "Value of the variance" column is missing.',
        a: 'It only appears with the "See stock values" right.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "View stock".' },
    related: [{ label: 'Approve a stocktake', helpId: 'finance.inventaire.validation' }],
    keywords: ['list of stocktakes', 'difference', 'status', 'approved', 'abandoned', 'export']
  },
  {
    id: 'finance.inventaire.ouverture',
    kind: 'section',
    title: 'Open a stocktake',
    summary: 'Choose the location to count, the kind of stocktake and the count date. The count is done blind.',
    steps: [
      {
        title: 'Location to count',
        detail: 'A location already being counted is greyed out ("stocktake in progress").'
      },
      {
        title: 'Kind',
        detail:
          '"Regular stocktake" by default. "Opening stocktake" is offered when the location suggests it, "Closing stocktake" for a site location.'
      },
      { title: 'Count date', detail: 'Today by default. A date that is too old is refused.' },
      { title: 'Open the stocktake', detail: 'The detail of the stocktake opens below the list.' }
    ],
    consequences: [
      'Only one draft count per location: two simultaneous counts would produce two truths, and the second one approved would overwrite the first.',
      'From the opening, the expected quantity of the location is hidden from everyone during the count (balances, transfers, issues).',
      'Opening stocktake: it records what is already on the location; a surplus enters without value, because the material has already been paid for by the site invoices.',
      'Closing stocktake: it must count every item present on the location; it makes it possible to close a site that still holds stock.'
    ],
    faq: [
      {
        q: 'What is "To recount since the last stocktake" for?',
        a: 'The screen lists the items set aside during the last stocktake and not recounted since. Remember to count them.'
      },
      {
        q: 'Why is a kind missing from the choice?',
        a: 'The opening stocktake is only offered for a location that needs one, and the closing stocktake only for a site location.'
      },
      {
        q: 'Can I date a stocktake last week?',
        a: 'Yes, within the limit set in "Control settings" (7 days to start with). Beyond that, the date is refused.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires the "Count" right.' },
    related: [{ label: 'Enter the counts', helpId: 'finance.inventaire.saisie' }],
    keywords: ['open a stocktake', 'opening stocktake', 'closing stocktake', 'kind', 'location to count']
  },
  {
    id: 'finance.inventaire.saisie',
    kind: 'section',
    title: 'Enter the count of an item',
    summary:
      'During the count, enter the quantity actually seen, item by item. Nothing is adjusted until the stocktake is approved.',
    steps: [
      { title: 'Item counted', detail: 'Choose the item in the list.' },
      {
        title: 'Quantity counted',
        detail: 'Zero is a valid result: "I looked, there is nothing".'
      },
      { title: 'Save the count', detail: 'The line appears in the table of count lines.' },
      {
        title: 'Correct a line',
        detail:
          '"Resume" puts the item back in the entry form; entering the same item a second time replaces its count.'
      },
      {
        title: 'Remove a line',
        detail: '"Remove" deletes the line from the count, after confirmation. The stock is not affected.'
      },
      {
        title: 'Close the count',
        detail: 'When everything is counted, "Close the count" (at least one line).'
      }
    ],
    consequences: [
      'On closing, items that have stock on the location and that nobody counted appear as "not counted": an authorised person must set them aside before approval.',
      'After closing, quantities can no longer be changed and differences are displayed.',
      'An opening or closing stocktake must count every item present on the location, otherwise closing is refused and the screen lists what is missing.',
      'If you can also approve stocktakes, you see the stock of the location: your lines are then marked "counted without blind" on the report.',
      '"Abandon the stocktake" requires a reason; it is reported to the stock managers if it already had lines.'
    ],
    faq: [
      {
        q: 'Where do I give the reason for a difference?',
        a: 'After closing, not during the count: entry only covers the item and the quantity.'
      },
      {
        q: 'Can several people count?',
        a: 'Yes. The table shows who counted each line, and the "Meters" card lists the people involved.'
      },
      {
        q: 'What happens if I close the screen during a count?',
        a: 'The saved lines are kept. Reopen the stocktake with "Continue the count".'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      roles: ['Storekeeper', 'Site manager'],
      note: 'Entering, removing a line and closing require "Count". Abandoning requires "Approve stocktakes".'
    },
    related: [{ label: 'The lines of the count', helpId: 'finance.inventaire.lignes' }],
    keywords: ['enter', 'quantity counted', 'count', 'blind', 'close', 'abandon']
  },
  {
    id: 'finance.inventaire.lignes',
    kind: 'table',
    title: 'Count lines',
    summary:
      'One line per item counted. Columns change with the status: during the count, no expected quantity or difference; after closing, everything appears.',
    howToRead: {
      columns: [
        {
          key: 'article',
          label: 'Item',
          description:
            'Reference and name. The "Not counted", "Set aside" or "WhatsApp" badges qualify the line; "View the photo" opens the proof of a WhatsApp count.'
        },
        {
          key: 'attendu',
          label: 'What the system said',
          description: 'The expected quantity, frozen when the count was taken. Absent while the count is in progress.'
        },
        {
          key: 'compte',
          label: 'Counted',
          description: 'The quantity counted. "not counted" if nobody counted the item.'
        },
        {
          key: 'ecart',
          label: 'Variance',
          description:
            'Counted minus expected: negative = missing, positive = surplus. Never in red; in orange while the difference is not justified.'
        },
        {
          key: 'valeur',
          label: 'Value of the variance',
          description: 'The difference in FCFA, at average cost. Visible with the "See stock values" right.'
        },
        { key: 'par', label: 'Counted by', description: 'The person who entered the line.' },
        { key: 'saisi', label: 'Entered at', description: 'Date and time of entry, recorded by the server.' },
        {
          key: 'motif',
          label: 'Reason',
          description:
            '"Difference to justify", the reason chosen, "No discrepancy", "Not counted" or "Set aside" with its reason.'
        },
        { key: 'pieces', label: 'Attachments', description: 'Number of photos or documents attached to the line.' },
        {
          key: 'depuis',
          label: 'Movements since the count',
          description: 'After approval: number of stock movements recorded on the item since the count.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: 'Resume or remove during the count; justify or set aside after closing.'
        }
      ],
      statuses: [
        {
          value: 'NOT_COUNTED',
          label: 'Not counted',
          description: 'The item has stock on the location but was not counted. To be set aside before approval.'
        },
        {
          value: 'SET_ASIDE',
          label: 'Set aside',
          description:
            'The line will not be adjusted and will appear on the report. To be recounted in a new stocktake.'
        }
      ],
      notes: ['"Set the line aside" does not erase its difference: it is still counted in the stocktake control.']
    },
    steps: [
      {
        title: 'Search',
        detail: 'By item, reason or person; the "Discrepant" option only keeps lines with a difference (after closing).'
      },
      {
        title: 'Justify a difference',
        detail: '"Justify" or "Change the reason" opens the reason window (after closing).'
      },
      {
        title: 'Set a line aside',
        detail: '"Set the line aside" requires a reason of 3 to 500 characters ("Approve stocktakes" right).'
      },
      {
        title: 'Set aside everything not counted',
        detail: '"Set aside all uncounted items" applies in one go, with a common reason.'
      }
    ],
    consequences: [
      'A line set aside is not adjusted at approval; it is reported to the stock managers.',
      'A reason describes what you observe: it does not blame anyone and no deduction follows from it.'
    ],
    faq: [
      {
        q: 'Why can I not change a quantity after closing?',
        a: 'Quantities are frozen at closing. To recount an item, set the line aside then recount it in a new stocktake.'
      },
      {
        q: 'What does "Counted by a person who could see the stock" mean?',
        a: 'The person who counted also had the right to approve and therefore saw the expected quantity. The mention appears on the approved stocktake.'
      },
      {
        q: 'What does the export contain?',
        a: 'The lines of this table, with the reason in plain text, according to your filters.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Justifying requires "Count" or "Approve stocktakes". Setting aside requires "Approve stocktakes".'
    },
    related: [
      { label: 'Justify a difference', helpId: 'finance.inventaire.justification' },
      { label: 'Approve the stocktake', helpId: 'finance.inventaire.validation' }
    ],
    keywords: ['lines', 'difference', 'missing', 'surplus', 'not counted', 'set aside', 'expected']
  },
  {
    id: 'finance.inventaire.indicateurs-clos',
    kind: 'section',
    title: 'Indicators of a closed stocktake',
    summary:
      'These cards summarise the closed stocktake: items counted, lines with a difference, differences to justify, items not counted and estimated value of the difference.',
    howToRead: {
      notes: [
        '"Lines showing a variance": lines where the counted quantity differs from the expected one. The card turns orange if there are any.',
        '"Differences to justify": differences without a reason. As long as any remain, approval is impossible.',
        '"Not counted": items that have stock on the location and that nobody counted. They must be set aside before approval.',
        '"Estimated value of the difference": estimated at the current average cost, frozen at approval. Visible with the "See stock values" right.'
      ]
    },
    faq: [
      {
        q: 'Why is the value of the difference "estimated"?',
        a: 'Until the stocktake is approved, it uses the average cost of the moment. It is frozen at approval.'
      },
      {
        q: 'What does "Differences to justify" count?',
        a: 'Lines with a difference and no reason, excluding lines set aside. A surplus in an opening stocktake needs no reason.'
      },
      {
        q: 'The value cards are missing.',
        a: 'They require the "See stock values" right.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: 'Count lines', helpId: 'finance.inventaire.lignes' }],
    keywords: ['indicators', 'differences to justify', 'not counted', 'estimated value']
  },
  {
    id: 'finance.inventaire.justification',
    kind: 'section',
    title: 'Justify a difference',
    summary:
      'Choose what best describes what you observe for a line with a difference. Each difference must have a reason before approval.',
    steps: [
      {
        title: 'Reread the figures',
        detail: 'The window recalls "Expected", "Counted" and "Variance".'
      },
      {
        title: 'Choose a reason',
        detail:
          'Breakage, deterioration, error in the previous count, entry error on a movement, unit confusion, unrecorded issue, unrecorded receipt, unexplained disappearance, or other (details required).'
      },
      {
        title: 'Add a photo (optional)',
        detail: 'Photo of the goods or another document.'
      },
      { title: 'Save the reason', detail: 'The line is no longer flagged "to justify".' }
    ],
    consequences: [
      'A reason describes a fact. It does not name anyone and no deduction follows from it.',
      '"Unexplained disappearance" is an observation: it is accepted as a reason.',
      'The reason can still be changed until the stocktake is approved ("Change the reason").'
    ],
    faq: [
      {
        q: 'What should I choose when I do not know?',
        a: '"Unexplained disappearance" says exactly that. Avoid choosing a reason that is not true.'
      },
      {
        q: 'Why are details requested?',
        a: 'The "Other" reason requires free text to be accepted.'
      },
      {
        q: 'Must a surplus in an opening stocktake be justified?',
        a: 'No, it is justified automatically by the system (opening stock).'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "Count" or "Approve stocktakes".' },
    related: [{ label: 'Approve the stocktake', helpId: 'finance.inventaire.validation' }],
    keywords: ['reason', 'justify', 'difference', 'breakage', 'disappearance']
  },
  {
    id: 'finance.inventaire.validation',
    kind: 'section',
    title: 'Approve the stocktake',
    summary:
      'Approval applies the justified differences to the stock of the location. It is done by someone other than the person who counted and cannot be cancelled.',
    purpose:
      'This is the "four eyes" control: the person who counts does not approve their own count, except in the special case reported below.',
    steps: [
      {
        title: 'Justify all differences',
        detail:
          'As long as a difference has no reason, the button stays greyed out and the screen lists the lines concerned.'
      },
      {
        title: 'Set aside the items not counted',
        detail: 'An item not counted must be set aside (line by line or all at once) before approval.'
      },
      {
        title: 'Click "Approve the stocktake"',
        detail: 'A confirmation recalls the consequences. Confirm with "Confirm the approval".'
      },
      {
        title: 'If you counted yourself',
        detail:
          'Another authorised person of the agency must approve. If you are the only authorised person, the "Approve without a second look" window asks why (10 to 500 characters).'
      }
    ],
    consequences: [
      'Each justified difference becomes a stock adjustment, applied to the current stock of the location: movements recorded since the count are kept.',
      'When an adjustment has a value, an accounting entry is posted at the count date: for a shortage, debit of account "Variations des stocks de biens achetés" (603) and credit of account "Stocks de matières et fournitures" (311); for a surplus, the reverse. Surpluses in an opening stocktake enter without value, hence without an entry.',
      'A stocktake report is generated, with its number; you can download it and attach the signed report.',
      'Values are frozen: counted value, gross difference, net difference, difference on lines set aside.',
      'Alerts may be raised: difference above the threshold, lines set aside, approval by the person who counted (see "Stock control"). No site is charged.',
      'Irreversible: the stocktake cannot be cancelled. A mistake is corrected by a second count of the same location.',
      'If issues recorded since the count lowered the stock more than the quantity counted, approval is refused: set the line aside and recount (for an opening or closing stocktake, abandon it and recount the location).'
    ],
    faq: [
      {
        q: 'Why is the "Approve the stocktake" button greyed out?',
        a: 'Differences remain without a reason, items not counted have not been set aside, or you counted this stocktake and another person can approve it.'
      },
      {
        q: 'What does "Approved without a second look" mean?',
        a: 'A person approved a stocktake they had also counted, for lack of another approver in the agency. The reason is recorded in the report, the activity log and an alert.'
      },
      {
        q: 'How do I correct a stocktake that is already approved?',
        a: 'It cannot be cancelled. Open a new stocktake on the same location and recount: the new difference will be adjusted in turn.'
      },
      {
        q: 'Who sees this block?',
        a: 'People who have the "Approve stocktakes" right.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      roles: ['Stock manager'],
      note: 'Requires the "Approve stocktakes" right.'
    },
    related: [
      { label: 'Alerts triggered by a stocktake', helpId: 'finance.controle-stock.alertes' },
      { label: 'Report', helpId: 'finance.inventaire.proces-verbal' }
    ],
    keywords: [
      'approve',
      'approval',
      'four eyes',
      'adjustment',
      'accounting entry',
      'without a second look',
      'irreversible'
    ]
  },
  {
    id: 'finance.inventaire.indicateurs-valide',
    kind: 'section',
    title: 'Indicators of an approved stocktake',
    summary:
      'These cards freeze the result of the stocktake at approval: number of lines, differences, counted value and valued differences.',
    howToRead: {
      notes: [
        '"Counted value": value of the quantities counted, frozen at approval.',
        '"Gross difference": sum of the differences, shortages and surpluses combined.',
        '"Net difference": shortages and surpluses offset each other.',
        '"Difference on lines set aside": difference of the lines set aside, not adjusted.',
        'A stocktake approved before value tracking was introduced shows "Not frozen".'
      ]
    },
    faq: [
      {
        q: 'What is the difference between gross and net difference?',
        a: 'The gross difference adds all differences regardless of sign; the net difference offsets shortages with surpluses.'
      },
      {
        q: 'Why "Not frozen"?',
        a: 'The stocktake was approved before these values were recorded: they cannot be reconstructed.'
      },
      {
        q: 'Why are these cards missing?',
        a: 'Value cards require the "See stock values" right.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: 'Lines set aside and not counted', helpId: 'finance.inventaire.lignes-ecartees' }],
    keywords: ['counted value', 'gross difference', 'net difference', 'approved stocktake']
  },
  {
    id: 'finance.inventaire.lignes-ecartees',
    kind: 'table',
    title: 'Lines set aside and not counted',
    summary:
      'Below an approved stocktake, these lists gather the lines that were not adjusted: those set aside and the items not counted.',
    howToRead: {
      columns: [
        { key: 'article', label: 'Item', description: 'Reference and name of the item.' },
        {
          key: 'attendu',
          label: 'What the system said',
          description: 'The expected quantity when the count was taken.'
        },
        { key: 'compte', label: 'Counted', description: 'The quantity counted, or "not counted".' },
        { key: 'ecart', label: 'Variance', description: 'The difference observed. It was not applied to the stock.' },
        { key: 'motif', label: 'Reason', description: 'The reason it was set aside.' }
      ],
      notes: ['These lines appear on the report. Have them recounted in a new stocktake.']
    },
    faq: [
      {
        q: 'Why are these lines not adjusted?',
        a: 'They were set aside before approval: the stock of these items did not change.'
      },
      {
        q: 'How do I regularise them?',
        a: 'Open a new stocktake on the same location and recount these items.'
      },
      {
        q: 'Can setting aside be undone?',
        a: 'Not after approval. Only a new stocktake can correct it.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: 'Count lines', helpId: 'finance.inventaire.lignes' }],
    keywords: ['set aside', 'not counted', 'report']
  },
  {
    id: 'finance.inventaire.proces-verbal',
    kind: 'section',
    title: 'Signed report',
    summary:
      'Attach here the stocktake report signed by those present. The button to download the generated report is above the table.',
    steps: [
      {
        title: 'Download the report',
        detail: 'Button above the table of lines, with its number.'
      },
      { title: 'Have it signed', detail: 'Print it and have it signed on site.' },
      { title: 'Attach the signed file', detail: 'Add it in this section.' }
    ],
    consequences: [
      'The report is generated at approval. The signed file is added to the stocktake and remains available.'
    ],
    faq: [
      {
        q: 'Who can add the signed file?',
        a: 'People who have the "Approve stocktakes" right.'
      },
      {
        q: 'Where is the report of a stocktake not yet approved?',
        a: 'It only exists after approval.'
      },
      {
        q: 'Can the report number change?',
        a: 'No, it is assigned at approval.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Adding the file requires "Approve stocktakes".' },
    related: [{ label: 'Approve the stocktake', helpId: 'finance.inventaire.validation' }],
    keywords: ['report', 'signed', 'attachment']
  },

  // ===========================================================================
  // Stock control
  // ===========================================================================
  {
    id: 'finance.controle-stock.page',
    kind: 'page',
    title: 'Stock control',
    summary:
      'Follow the alerts, indicators and settings of stock control. An alert reports a fact above a threshold: it does not name anyone.',
    purpose:
      'This screen helps managers spot what deserves a look: a large stocktake difference, a large issue, a large scrap, a doubtful receipt, cash purchases of materials. It is up to you to look and to qualify.',
    steps: [
      {
        title: 'Alerts',
        detail: 'Handle the alerts to handle, filter by kind, site, location or period.'
      },
      { title: 'Indicators', detail: 'Read the figures of the month, by month and by location.' },
      {
        title: 'Control settings',
        detail: 'Adjust alert thresholds, the age limit of dates and whether a recipient is required.'
      }
    ],
    consequences: [
      'Marking an alert as handled removes it from the "To handle" queue; it remains viewable.',
      'Changing a threshold affects future alerts, not those already raised.'
    ],
    faq: [
      {
        q: 'Why is a tab missing?',
        a: '"Alerts" requires the "Stock alerts" right. "Indicators" and "Control settings" require the "See stock values" right.'
      },
      {
        q: 'What should I do with an alert?',
        a: 'Open the object concerned through its link, take a look, then mark the alert as handled with a note if useful.'
      },
      {
        q: 'Does an alert mean there was a theft?',
        a: 'No. It only reports that an amount or a rate went above a threshold. No deduction follows.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      roles: ['Stock manager', 'Agency administrator'],
      note: 'Without any of the alert or value rights, the screen is reserved: field actions are done from the Store screen.'
    },
    related: [
      { label: 'Stock alerts', helpId: 'finance.controle-stock.alertes' },
      { label: 'Control settings', helpId: 'finance.controle-stock.reglages' },
      { label: 'Store screen', to: '/tenant/:tenantId/finance/stock/magasin' }
    ],
    keywords: ['control', 'alerts', 'indicators', 'threshold', 'difference', 'theft', 'stock']
  },
  {
    id: 'finance.controle-stock.alertes',
    kind: 'section',
    title: 'Stock alerts',
    summary:
      'Alerts are raised automatically when a fact exceeds a threshold. Each one points to the object concerned: slip, stocktake, movement, invoice or cash voucher.',
    howToRead: {
      notes: [
        'Amount alerts are raised at the thresholds of the "Control settings" tab (by default 500 000 FCFA for a large issue; 100 000 FCFA or 5% of the counted value for a stocktake difference; 100 000 FCFA for cash purchases of materials).',
        '"Stocktake difference above the threshold" is raised at approval, when the difference reaches the amount or the percentage set. "Stocktake lines set aside", "Stocktake abandoned" (with at least one line) and "Stocktake approved by its counter" are information.',
        '"Large issue": an issue slip reaches the threshold. "Large scrap": a scrap reaches the threshold, or the total scrap of a location over the calendar month (a "Monthly total" alert).',
        '"Invoice already received", "Value received above the invoice" and "Receipt with no known price" flag a doubtful receipt.',
        '"Cash purchase of materials": a "materials" cash voucher reaches the threshold, or the monthly total of a site ("Monthly total"), which prevents bypassing the alert by splitting.',
        '"Site stocktake closed via WhatsApp": a site manager closed their count; the alert is "To review" if the gross difference reaches one of the stocktake thresholds, otherwise "Information".'
      ]
    },
    steps: [
      {
        title: 'Open the "Alerts" tab',
        detail: 'By default, only "To handle" alerts are listed.'
      },
      { title: 'Filter', detail: 'Status, kind, site, location, period, or free search.' },
      {
        title: 'Open the object',
        detail: 'Click the link in the "Subject" column to see the slip, stocktake, movement or invoice.'
      },
      { title: 'Mark as handled', detail: 'Add a note if useful, then confirm.' }
    ],
    faq: [
      {
        q: 'How do I find an alert already handled?',
        a: 'Choose the status "Handled" or "All" in the filter bar.'
      },
      {
        q: 'Is an alert sent by message?',
        a: 'The screen does not say so: check this tab to see them.'
      },
      {
        q: 'Why does an alert say "Monthly total"?',
        a: 'Several small amounts, all under the threshold, together exceed the threshold within the month: a single alert is raised for the month.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires the "Stock alerts" right.' },
    related: [
      { label: 'Table of alerts', helpId: 'finance.controle-stock.alertes-tableau' },
      { label: 'Set the thresholds', helpId: 'finance.controle-stock.reglages' }
    ],
    keywords: ['alert', 'threshold', 'large issue', 'scrap', 'stocktake difference', 'cash']
  },
  {
    id: 'finance.controle-stock.alertes-tableau',
    kind: 'table',
    title: 'Table of alerts',
    summary:
      'Each row is an alert: its severity, its message, the amount and threshold, the location, the object concerned, the date and the status.',
    howToRead: {
      columns: [
        {
          key: 'gravite',
          label: 'Severity',
          description: '"To review" or "Information".'
        },
        {
          key: 'alerte',
          label: 'Alert',
          description: 'Title and message; "Monthly total" flags a cumulative alert.'
        },
        {
          key: 'montant',
          label: 'Amount · threshold',
          description:
            'The amount observed and the threshold crossed, in FCFA. Visible with the "See stock values" right.'
        },
        { key: 'ou', label: 'Where', description: 'The site and location concerned.' },
        {
          key: 'objet',
          label: 'Subject',
          description: 'Link to the slip, stocktake, movement, supplier invoice or the site of the cash voucher.'
        },
        { key: 'levee', label: 'Raised on', description: 'Date on which the alert was triggered.' },
        {
          key: 'statut',
          label: 'Status',
          description: '"To handle", or the date, person and note of handling.'
        },
        { key: 'action', label: 'Action', description: '"Mark as handled" (alerts to handle).' }
      ],
      statuses: [
        { value: 'OPEN', label: 'To handle', description: 'In the queue to handle.' },
        {
          value: 'ACKNOWLEDGED',
          label: 'Handled',
          description: 'Marked as handled by a person, with an optional note.'
        },
        { value: 'WARNING', label: 'To review', description: 'A threshold is crossed.' },
        { value: 'INFO', label: 'Information', description: 'A fact to know, no threshold crossed.' }
      ]
    },
    steps: [
      {
        title: 'Click "Mark as handled"',
        detail: 'A window asks for an optional note (1 000 characters at most).'
      },
      { title: 'Confirm', detail: 'The alert leaves the "To handle" queue and remains viewable.' }
    ],
    consequences: ['Marking as handled cancels nothing: it keeps a record that someone has looked.'],
    faq: [
      {
        q: 'Why is an alert already handled?',
        a: 'Another person marked it in the meantime: the screen says so and the row becomes "Handled".'
      },
      {
        q: 'What does the export contain?',
        a: 'All alerts matching your filters (up to the export limit).'
      },
      {
        q: 'An alert cannot be found.',
        a: 'If you arrive through a link, the screen widens the status to "All"; if it no longer exists, it says so.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires the "Stock alerts" right.' },
    related: [{ label: 'Stock alerts', helpId: 'finance.controle-stock.alertes' }],
    keywords: ['alerts', 'handle', 'severity', 'status', 'subject']
  },
  {
    id: 'finance.controle-stock.indicateurs',
    kind: 'section',
    title: 'Indicators',
    summary:
      'Monthly figures to steer the stock: difference rate, stocktakes approved by another person, issues with a recipient, entry delay. They concern locations and months, never people.',
    steps: [
      {
        title: 'Choose the period',
        detail: 'Start month and end month, 24 months at most (6 months by default).'
      },
      { title: 'Show', detail: 'The "Show" button loads the figures.' },
      { title: 'Read the last month', detail: 'The four cards at the top concern the last month of the period.' },
      {
        title: 'Detail',
        detail: 'The "By month" and "By location and by month" tables give the detail.'
      }
    ],
    faq: [
      {
        q: 'Why is the difference rate "—"?',
        a: 'No stocktake approved that month, or values not frozen (stocktakes approved before tracking), or counted value of zero.'
      },
      {
        q: 'Do the figures name people?',
        a: 'No. They concern locations and months only.'
      },
      {
        q: 'Why are my old stocktakes not included?',
        a: 'Stocktakes approved before this control was introduced have no frozen values: they are not counted in the difference rate, and the screen gives their number.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires the "See stock values" right.' },
    related: [
      { label: 'Cards of the last month', helpId: 'finance.controle-stock.indicateurs-cartes' },
      { label: 'Indicators by month', helpId: 'finance.controle-stock.par-mois' }
    ],
    keywords: ['indicators', 'difference rate', 'entry delay', 'recipient']
  },
  {
    id: 'finance.controle-stock.indicateurs-cartes',
    kind: 'section',
    title: 'Cards of the last month',
    summary: 'Four figures for the last month of the chosen period.',
    howToRead: {
      notes: [
        '"Difference rate": differences of approved stocktakes relative to the counted value. Surpluses of an opening stocktake are not included.',
        '"Issues with an identified recipient": share of issues whose recipient comes from the register.',
        '"Stocktakes approved by another person": share of stocktakes approved by someone who did not count.',
        '"Average entry delay": average gap between the declared date of a movement and the day of entry; the tooltip gives the share entered the same day.'
      ]
    },
    faq: [
      {
        q: 'What should I do about a high difference rate?',
        a: 'Open the stocktakes of the month and look at the reasons. The figure reports a fact, it does not judge anyone.'
      },
      {
        q: 'Why 0% of issues with a recipient?',
        a: 'No issue of the month named a recipient from the register. You can require it in "Control settings".'
      },
      {
        q: 'Is a high entry delay serious?',
        a: 'It reports late entries compared with the declared date. It is up to you to understand why.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: 'Control settings', helpId: 'finance.controle-stock.reglages' }],
    keywords: ['difference rate', 'recipient', 'entry delay', 'indicators']
  },
  {
    id: 'finance.controle-stock.par-mois',
    kind: 'table',
    title: 'Indicators by month',
    summary: 'The same indicators for the whole agency, one month per row.',
    howToRead: {
      columns: [
        { key: 'mois', label: 'Month', description: 'The month concerned.' },
        {
          key: 'ecart',
          label: 'Difference rate',
          description:
            'Difference of approved stocktakes relative to counted value; under the rate, the share due to lines set aside.'
        },
        {
          key: 'non-comptees',
          label: 'Uncounted lines',
          description: 'Number of lines not counted in the month’s stocktakes.'
        },
        {
          key: 'aveugle',
          label: 'Lines counted blind',
          description: 'Share of lines counted by someone who could not see the expected quantity.'
        },
        {
          key: 'valides',
          label: 'Approved stocktakes',
          description:
            'Number of stocktakes approved, including those approved by someone other than the person who counted.'
        },
        {
          key: 'sorties',
          label: 'Issues',
          description: 'Number of issues, including those with a recipient from the register.'
        },
        { key: 'rebuts', label: 'Scrap', description: 'Value of scrap in FCFA, and its share of issues.' },
        {
          key: 'delai',
          label: 'Average entry delay',
          description: 'Average gap, in days, between the declared date and entry.'
        },
        {
          key: 'jour-meme',
          label: 'Same-day entries',
          description: 'Share of movements entered on the declared day.'
        }
      ]
    },
    faq: [
      { q: 'What does the export contain?', a: 'The rows of the table for the chosen period.' },
      {
        q: 'Why "No movement or stocktake in the period"?',
        a: 'Nothing was entered in these months. Widen the period.'
      },
      {
        q: 'Where can I see the detail by location?',
        a: 'In the "By location and by month" table, just below.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "See stock values".' },
    related: [{ label: 'By location and by month', helpId: 'finance.controle-stock.par-lieu' }],
    keywords: ['by month', 'indicators', 'scrap', 'issues']
  },
  {
    id: 'finance.controle-stock.par-lieu',
    kind: 'table',
    title: 'Indicators by location and by month',
    summary:
      'The same indicators, location by location and month by month. The "Venue" filter narrows the table to one location.',
    howToRead: {
      columns: [
        { key: 'lieu', label: 'Place', description: 'The store or site location concerned.' },
        { key: 'mois', label: 'Month', description: 'The month concerned.' },
        {
          key: 'ecart',
          label: 'Difference rate',
          description: 'Difference of the location’s approved stocktakes relative to their counted value.'
        },
        { key: 'non-comptees', label: 'Uncounted lines', description: 'Lines not counted on this location.' },
        {
          key: 'aveugle',
          label: 'Lines counted blind',
          description: 'Share of lines counted without seeing the expected quantity.'
        },
        {
          key: 'valides',
          label: 'Approved stocktakes',
          description: 'Stocktakes approved, including by another person.'
        },
        { key: 'sorties', label: 'Issues', description: 'Issues from the location, including with a recipient.' },
        { key: 'rebuts', label: 'Scrap', description: 'Value of the location’s scrap and its share.' },
        {
          key: 'delai',
          label: 'Average entry delay',
          description: 'Average delay between declared date and entry.'
        },
        { key: 'jour-meme', label: 'Same-day entries', description: 'Share entered on the declared day.' }
      ]
    },
    faq: [
      {
        q: 'How do I see a single location?',
        a: 'Choose it in the "Venue" field above the table; "All locations" returns to the full view.'
      },
      { q: 'What does the export contain?', a: 'The rows displayed, so according to the location chosen.' },
      { q: 'A row is missing for a month.', a: 'No movement or stocktake on this location that month.' }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "See stock values".' },
    related: [{ label: 'Indicators by month', helpId: 'finance.controle-stock.par-mois' }],
    keywords: ['by location', 'indicators', 'site', 'store']
  },
  {
    id: 'finance.controle-stock.reglages',
    kind: 'section',
    title: 'Control settings',
    summary:
      'Set the alert thresholds, the maximum age of dates and whether a recipient from the register is required. The proposed thresholds are starting points.',
    howToRead: {
      notes: [
        '"Maximum age of a movement date": a receipt, issue, transfer or stocktake cannot be dated further back (7 days to start with, 365 at most). To import a history, raise the limit during the import, then put it back.',
        '"Require a recipient from the register": when on, each issue and each transfer must name a recipient from the register; when off, a name typed by hand is enough.',
        '"Large issue": alert when an issue slip or a scrap reaches this amount (500 000 FCFA to start with).',
        '"Stocktake difference — amount" and "— rate": alert when the difference of an approved stocktake reaches the amount (100 000 FCFA to start with) or the percentage of the counted value (5% to start with).',
        '"Cash purchases of materials": alert when a materials cash voucher, or their monthly total on a site, reaches this amount (100 000 FCFA to start with).',
        '"Materials" cost categories: the cost categories used for the cash purchase alert. If none is chosen, those proposed by your items are used.'
      ]
    },
    steps: [
      {
        title: 'Change a setting',
        detail: 'Enter the value; each threshold must be greater than zero.'
      },
      {
        title: 'Disable an alert',
        detail: 'Tick "Disable this alert" or leave the threshold empty.'
      },
      {
        title: 'Save',
        detail: '"Save the settings"; "Discard changes" restores the saved values.'
      }
    ],
    consequences: [
      'New thresholds apply to future alerts. Alerts already raised do not change.',
      'The setting is traced: the screen shows who changed it and when.',
      'A threshold of zero is refused: it would trigger the alert on every operation.'
    ],
    faq: [
      {
        q: 'Why are the fields greyed out?',
        a: 'Only a person who can configure the agency’s finance changes these settings. You can read them.'
      },
      {
        q: 'How do I disable an alert?',
        a: 'Tick "Disable this alert" next to its threshold, then save.'
      },
      {
        q: 'Which thresholds should I choose?',
        a: 'The proposed values are starting points: adapt them to the size of your sites.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Reading requires "See stock values". Changing requires "Configure the finance module".'
    },
    related: [{ label: 'Stock alerts', helpId: 'finance.controle-stock.alertes' }],
    keywords: ['threshold', 'settings', 'age limit', 'recipient', 'alert', 'FCFA', 'materials']
  },

  // ===========================================================================
  // Field counts
  // ===========================================================================
  {
    id: 'finance.comptages-terrain.page',
    kind: 'page',
    title: 'Field counts',
    summary:
      'See, location by location and item by item, the book stock and the last physical count, whether it came from the office or from a site manager through WhatsApp.',
    purpose:
      'Counts made through WhatsApp go into the stocktake of the location. The stock only changes when the stocktake is approved, by someone other than the person who counted.',
    steps: [
      {
        title: 'Filter',
        detail: 'By site, location, item or source of the last count (WhatsApp or Web).'
      },
      { title: 'Read the row', detail: 'Compare "Book stock" and "Last count".' },
      {
        title: 'See the proof',
        detail: '"View the photo" opens the photo, its analysis and what the site manager did.'
      },
      {
        title: 'Open the stocktake',
        detail: '"Open the stocktake" leads to the stocktake that holds this count.'
      }
    ],
    consequences: [
      'When a site manager closes their count through WhatsApp, a "not counted" line is created for each item of the location that they did not photograph. The approver can set them aside in one go from the stocktake.',
      'This screen changes nothing in the stock: it is read-only.'
    ],
    faq: [
      {
        q: 'Why "Count in progress" instead of a quantity?',
        a: 'A stocktake is in progress on the location: quantities stay hidden until the count is closed.'
      },
      {
        q: 'Why is no count displayed?',
        a: 'No count matches the filters, or no site manager is registered. If you can register them, the "Register a site manager" button takes you to the WhatsApp screen.'
      },
      {
        q: 'The "Value" column is missing.',
        a: 'It requires the "See stock values" right.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      roles: ['Storekeeper', 'Stock manager'],
      note: 'Requires "View stock". The registration button requires "Configure the finance module".'
    },
    related: [
      { label: 'Table of field counts', helpId: 'finance.comptages-terrain.tableau' },
      { label: 'Stocktake by WhatsApp', helpId: 'finance.whatsapp.page' },
      { label: 'Stocktakes', helpId: 'finance.inventaire.page' }
    ],
    keywords: ['field count', 'photo', 'WhatsApp', 'last count', 'book stock']
  },
  {
    id: 'finance.comptages-terrain.tableau',
    kind: 'table',
    title: 'Table of field counts',
    summary:
      'One row per item and per location, with the book stock, the last count, its author, its source and the stocktake concerned.',
    howToRead: {
      columns: [
        { key: 'location', label: 'Place', description: 'The location, with the site below.' },
        { key: 'item', label: 'Item', description: 'The name and reference of the item.' },
        {
          key: 'theoretical',
          label: 'Book stock',
          description: 'What the system announces. "Count in progress" when the location is being counted.'
        },
        {
          key: 'value',
          label: 'Value',
          description: 'The value of the book stock in FCFA, with the "See stock values" right.'
        },
        { key: 'last', label: 'Last count', description: 'The last quantity counted, or "Not counted".' },
        { key: 'at', label: 'Date and time', description: 'Server date and time.' },
        { key: 'by', label: 'Counted by', description: 'The person who counted.' },
        {
          key: 'source',
          label: 'Source',
          description: '"WhatsApp" or "Web"; "corrected" if the site manager corrected the proposal.'
        },
        {
          key: 'count',
          label: 'Stocktake',
          description: 'The status of the stocktake and the "Open the stocktake" link.'
        },
        { key: 'photo', label: 'Photo', description: '"View the photo", or "Photo removed".' }
      ],
      statuses: [
        { value: 'WHATSAPP', label: 'WhatsApp', description: 'Count made by a site manager by photo.' },
        { value: 'WEB', label: 'Web', description: 'Count entered in ImmoTopia.' },
        { value: 'DRAFT', label: 'Count in progress', description: 'The stocktake is not closed.' },
        { value: 'COUNTED', label: 'Count closed', description: 'Differences to justify, then approval.' },
        { value: 'VALIDATED', label: 'Approved', description: 'Differences applied to the stock.' },
        { value: 'CANCELLED', label: 'Abandoned', description: 'Stocktake without adjustment.' }
      ],
      notes: ['No difference column here: differences are read in the stocktake, after it is closed.']
    },
    faq: [
      {
        q: 'How do I read "Not counted"?',
        a: 'The stocktake contains the item, but nobody counted it: it will be set aside or recounted.'
      },
      {
        q: 'Why "Load more"?',
        a: 'The list loads in batches of 50 rows: the button shows the rest.'
      },
      {
        q: 'What does the export contain?',
        a: 'All rows matching your filters, beyond the page displayed.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "View stock".' },
    related: [{ label: 'View the proof photo', helpId: 'finance.whatsapp.photo-preuve' }],
    keywords: ['count', 'last count', 'source', 'photo', 'stocktake']
  },

  // ===========================================================================
  // Stocktake by WhatsApp
  // ===========================================================================
  {
    id: 'finance.whatsapp.page',
    kind: 'page',
    title: 'Stocktake by WhatsApp',
    summary:
      'Register your site managers so that they count the stock by sending a photo through WhatsApp. This screen also tracks the month’s quota, the state of the gateway and the metrics.',
    purpose:
      'The site manager sends a photo of an item, the analysis proposes a total, they confirm or correct it, and the count goes into the site stocktake. The stock only changes when the stocktake is approved at the office.',
    steps: [
      {
        title: 'Check the state',
        detail:
          'The three cards at the top say whether the gateway is ready, where the month’s quota stands and whether photo analysis is active.'
      },
      {
        title: 'Register a site manager',
        detail: '"Site managers" tab: WhatsApp number and sites (1 to 10).'
      },
      {
        title: 'Give the code',
        detail: 'The 6-digit code is shown only once: the site manager sends it to the bot number.'
      },
      {
        title: 'Follow up',
        detail: 'Check the conversations, the proof photos ("Field counts" screen) and the "Metrics" tab.'
      }
    ],
    consequences: [
      'At the end of the count (FIN message, site change or 30 minutes without reply), the site stocktake is closed and sent to the office, which checks and approves it.',
      'A WhatsApp count approves nothing and adjusts no stock.',
      'Everything depends on WhatsApp being put into service: if your agency has activated it, the "Gateway" card says so.'
    ],
    faq: [
      {
        q: 'Why does the screen say "Reserved for stock administrators"?',
        a: 'Registering site managers requires the "Configure the finance module" right.'
      },
      {
        q: 'My site manager gets no reply from the bot.',
        a: 'Check the "Gateway" card (connected or not), the status of the registration (code sent?), and the month’s quota.'
      },
      {
        q: 'Do site managers need an ImmoTopia account?',
        a: 'Yes: they must be members of the agency with the "Site manager" role to be registered.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      roles: ['Agency administrator'],
      note: 'Requires "Configure the finance module". Stocktake by WhatsApp is a paid option: without it, the bot refuses photos.'
    },
    related: [
      { label: 'Site managers and registrations', helpId: 'finance.whatsapp.chefs' },
      { label: 'Gateway, quota and analysis', helpId: 'finance.whatsapp.etat' },
      { label: 'Field counts', helpId: 'finance.comptages-terrain.page' }
    ],
    keywords: ['whatsapp', 'photo stocktake', 'site manager', 'bot', 'quota', 'photo'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'whatsapp-etat',
          title: 'The state of the service',
          description: 'Gateway, photos analysed this month and analysis: read these cards before registering anyone.'
        },
        {
          target: 'whatsapp-onglets',
          title: 'The tabs',
          description:
            '"Site managers" for registrations, "Simulator" (test mode only) and "Metrics" to follow quality.'
        },
        {
          target: 'whatsapp-inscrire',
          title: 'Register a site manager',
          description:
            'Choose the site manager, their WhatsApp number and their sites. An activation code is shown only once.'
        },
        {
          target: 'whatsapp-chefs',
          title: 'The registrations',
          description: 'The "⋮" menu of a row lets you edit sites, regenerate the code, view conversations or revoke.'
        }
      ]
    }
  },
  {
    id: 'finance.whatsapp.etat',
    kind: 'section',
    title: 'Gateway, quota and analysis',
    summary:
      'Three cards say whether the service can work: the WhatsApp gateway, the month’s quota of analysed photos and photo analysis.',
    howToRead: {
      notes: [
        'Gateway: "Connected to WhatsApp" when commissioning is complete; "Incomplete configuration" when it is not; "Disabled on this server" when it is not activated; "Test mode: no message is sent, use the simulator" for trials. The bot number to give to site managers is shown when known.',
        'Photos analysed this month: photos already analysed out of the allowed total. A photo only counts if its analysis succeeded; it is returned to the quota if analysis fails. The bar turns orange from 80%.',
        'Under the quota: the number of 500-photo blocks subscribed, or "Option not subscribed. The bot refuses photos", or a provisional quota while set-up is under way.',
        'Analysis: the provider and model when active; otherwise analysis is disabled and the bot replies that it cannot analyse photos.'
      ]
    },
    consequences: [
      'Quota reached or option not subscribed: the bot refuses new photos and tells the site manager to contact the administrator. The office can enter the count in ImmoTopia.',
      'The "View subscription" link appears when the option is not subscribed.'
    ],
    faq: [
      {
        q: 'What if the gateway is "Disabled on this server"?',
        a: 'The service is not yet in operation for your installation. Contact the ImmoTopia team: there is no point registering site managers before.'
      },
      {
        q: 'How many photos can I analyse per month?',
        a: 'The total is the one shown on the card, according to the 500-photo blocks of your option.'
      },
      {
        q: 'The quota is used up: what can I do?',
        a: 'Contact ImmoTopia to add a block, or have the counts entered at the office.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "Configure the finance module".' },
    related: [{ label: 'Stocktake by WhatsApp', helpId: 'finance.whatsapp.page' }],
    keywords: ['gateway', 'quota', 'photos analysed', '500 block', 'analysis', 'bot number']
  },
  {
    id: 'finance.whatsapp.chefs',
    kind: 'section',
    title: 'Site managers',
    summary:
      'Register the site managers who count through WhatsApp. Their number is only used to recognise them; they activate their registration with a code.',
    purpose:
      'Full circuit: you register the site manager, they send the code to the bot number from their phone, then send one photo per item. The bot proposes a total; the site manager confirms, corrects or cancels. They type FIN when finished.',
    steps: [
      {
        title: 'Register',
        detail: '"Register a site manager": choose the site manager, enter their WhatsApp number, choose their sites.'
      },
      { title: 'Give the code', detail: 'Note or copy the instructions shown only once.' },
      {
        title: 'The site manager activates',
        detail: 'They send the 6-digit code, from their number, to the bot number.'
      },
      {
        title: 'They count',
        detail: 'One photo per item, from the front, in full. The bot replies; the site manager types 1, a number or 0.'
      },
      {
        title: 'They finish',
        detail: 'FIN ends; CHANTIER changes site; AIDE recalls the instructions.'
      }
    ],
    consequences: [
      'Photos received are analysed by an artificial intelligence service and kept as proof of the stocktake: inform your site managers before registering them.',
      'The site manager never sees the expected quantity: the bot does not mention differences or alerts.',
      'With no reply from the site manager for 10 minutes, the bot sends a reminder; at 30 minutes without reply, the session ends, a pending photo is not saved and the count is sent on.',
      'A site manager can have several sites (10 at most); the bot asks which one they are on.'
    ],
    faq: [
      {
        q: 'Why does a member not appear in the list?',
        a: 'They must be an active member of the agency with the "Site manager" role. Assign it in Collaborators.'
      },
      {
        q: 'Can a number be registered twice?',
        a: 'No: a number only has one non-revoked registration. If the number is refused, it is already used or invalid.'
      },
      {
        q: 'What does the bot do when the site manager corrects the quantity?',
        a: 'The site manager types the exact number; the line is saved as "Corrected by the site manager".'
      },
      {
        q: 'What if the item already has a line?',
        a: 'The bot asks whether to add, replace or cancel.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      roles: ['Agency administrator'],
      note: 'Registering requires "Configure the finance module". The site manager only holds the "Count" right.'
    },
    related: [
      { label: 'Table of registrations', helpId: 'finance.whatsapp.inscriptions' },
      { label: 'Register a site manager', helpId: 'finance.whatsapp.inscrire' }
    ],
    keywords: ['site manager', 'registration', 'FIN', 'AIDE', 'CHANTIER', 'photo', 'bot']
  },
  {
    id: 'finance.whatsapp.inscriptions',
    kind: 'table',
    title: 'Registered site managers',
    summary:
      'Each row is the registration of a site manager: their masked number, their sites, their status, their access and their last message.',
    howToRead: {
      columns: [
        { key: 'chef', label: 'Site manager', description: 'The registered site manager.' },
        { key: 'phone', label: 'Phone', description: 'The WhatsApp number, partly masked.' },
        {
          key: 'sites',
          label: 'Sites',
          description:
            'The site manager’s sites. A struck-through site is no longer eligible (tooltip: closed, not switched to stock or inactive location).'
        },
        {
          key: 'status',
          label: 'Status',
          description: 'Awaiting the code (with the deadline), active or revoked.'
        },
        {
          key: 'access',
          label: 'Access',
          description:
            'Empty when all is well. Otherwise the reason: agency suspended, membership inactive, account disabled, Site manager role removed, option not subscribed.'
        },
        {
          key: 'last',
          label: 'Last message',
          description: 'Date and time of the last message received from this site manager.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"⋮" menu: edit sites, regenerate the code, view conversations, revoke.'
        }
      ],
      statuses: [
        {
          value: 'PENDING_ACTIVATION',
          label: 'Awaiting the code',
          description: 'The site manager has not yet sent their code, valid until the date shown.'
        },
        { value: 'ACTIVE', label: 'Active', description: 'The site manager sent the right code: they can count.' },
        { value: 'REVOKED', label: 'Revoked', description: 'Access is withdrawn; the bot refuses their messages.' }
      ]
    },
    steps: [
      { title: 'Edit sites', detail: '"⋮" menu, "Edit sites" (non-revoked registration).' },
      {
        title: 'Regenerate the code',
        detail: '"⋮" menu, "Regenerate the code" (registration awaiting the code).'
      },
      { title: 'View conversations', detail: '"⋮" menu, "View conversations".' },
      { title: 'Revoke', detail: '"⋮" menu, "Revoke" (non-revoked registration).' }
    ],
    faq: [
      {
        q: 'What does the export contain?',
        a: 'The registered site managers according to your filters, without the full number.'
      },
      {
        q: 'Why is the "Access" column filled in?',
        a: 'The site manager is registered but can no longer count for the reason shown. Fix the cause (role, account, option) or revoke.'
      },
      {
        q: 'Where can I see what the site manager sent?',
        a: 'In "View conversations", then on the "Field counts" screen for photos.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "Configure the finance module".' },
    related: [
      { label: 'Activation code', helpId: 'finance.whatsapp.code-activation' },
      { label: 'Revoke access', helpId: 'finance.whatsapp.revocation' }
    ],
    keywords: ['registrations', 'site managers', 'number', 'status', 'access', 'revoked']
  },
  {
    id: 'finance.whatsapp.inscrire',
    kind: 'section',
    title: 'Register a site manager',
    summary:
      'Choose a site manager, their WhatsApp number and their sites. They will receive an activation code to send to the bot number.',
    steps: [
      {
        title: 'Site manager',
        detail: 'Only members with the "Site manager" role are offered; those already registered are greyed out.'
      },
      {
        title: 'WhatsApp number',
        detail: 'Ivorian format (07 12 34 56 78) or international (+225…).'
      },
      {
        title: 'Sites',
        detail: 'At least one, ten at most. Only open sites switched to stock are offered.'
      },
      { title: 'Register', detail: 'The activation code is then shown in a window.' }
    ],
    consequences: [
      'The registration stays "Awaiting the code" until the site manager sends the code from their number.',
      'That message proves the site manager really uses this number and counts as their agreement to receive the bot’s replies.',
      'A number can only have one non-revoked registration.'
    ],
    faq: [
      {
        q: 'No member is offered.',
        a: 'No member has the "Site manager" role. Assign it in Collaborators; a link takes you there.'
      },
      {
        q: 'My site is greyed out or refused.',
        a: 'It must be open, switched to stock and have an active location.'
      },
      {
        q: 'My number is refused.',
        a: 'It is invalid, or already used by a non-revoked registration.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "Configure the finance module".' },
    related: [{ label: 'Activation code', helpId: 'finance.whatsapp.code-activation' }],
    keywords: ['register', 'WhatsApp number', 'sites', '+225', 'site manager']
  },
  {
    id: 'finance.whatsapp.code-activation',
    kind: 'section',
    title: 'Activation code',
    summary:
      'This 6-digit code links the site manager’s number to ImmoTopia. It is shown only once: note it or copy the instructions before closing.',
    steps: [
      { title: 'Read the code', detail: 'It is shown in two groups of three digits, with the bot number.' },
      {
        title: 'Copy the instructions',
        detail: '"Copy the instructions" prepares the sentence to send to the site manager.'
      },
      {
        title: 'Pass it to the site manager',
        detail: 'They open WhatsApp, write to the bot number and send the code.'
      },
      { title: 'Close', detail: 'The window cannot be reopened with the code.' }
    ],
    consequences: [
      'Valid for 72 hours and 5 attempts. After that delay or after 5 wrong attempts, the code no longer works: regenerate one.',
      'The code is not kept in clear: once the window is closed, it cannot be read again.',
      'The site manager becomes "Active" as soon as they send the right code.'
    ],
    faq: [
      {
        q: 'I closed the window without noting the code.',
        a: 'In the "⋮" menu of the registration, choose "Regenerate the code": a new code replaces the old one.'
      },
      {
        q: 'The site manager used up their attempts.',
        a: 'Regenerate the code to give them a new one.'
      },
      {
        q: 'What should the site manager write?',
        a: 'The 6-digit code, alone or in a sentence: only the digits count.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "Configure the finance module".' },
    related: [{ label: 'Table of registrations', helpId: 'finance.whatsapp.inscriptions' }],
    keywords: ['code', 'activation', '72 hours', 'regenerate', 'attempts']
  },
  {
    id: 'finance.whatsapp.chantiers',
    kind: 'section',
    title: 'Edit sites',
    summary: 'Replace the list of sites of a registered site manager. The site manager will only count on these sites.',
    steps: [
      { title: 'Open the window', detail: '"⋮" menu of the registration, "Edit sites".' },
      { title: 'Choose', detail: 'One to ten open sites switched to stock.' },
      { title: 'Save', detail: 'The list replaces the old one.' }
    ],
    consequences: ['A site that has become ineligible stays visible, struck through, so that you can remove it.'],
    faq: [
      { q: 'Why is a site struck through?', a: 'It is closed, not switched to stock or its location is inactive.' },
      { q: 'How many sites at most?', a: 'Ten.' },
      { q: 'Can I edit a revoked registration?', a: 'No. The action is not offered.' }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "Configure the finance module".' },
    related: [{ label: 'Registered site managers', helpId: 'finance.whatsapp.inscriptions' }],
    keywords: ['sites', 'edit', 'assign']
  },
  {
    id: 'finance.whatsapp.revocation',
    kind: 'section',
    title: 'Revoke access',
    summary: 'Withdraw a site manager’s access to stocktake by WhatsApp. The bot will refuse their next messages.',
    steps: [
      { title: 'Open the window', detail: '"⋮" menu of the registration, "Revoke".' },
      { title: 'Reason', detail: 'Optional, 500 characters at most.' },
      { title: 'Revoke', detail: 'Confirm with the "Revoke" button.' }
    ],
    consequences: [
      'The bot refuses the next messages from this number.',
      'A photo awaiting a reply is abandoned.',
      'Revocation is final for this registration: to restore access, register the site manager again.'
    ],
    faq: [
      { q: 'Are counts already made deleted?', a: 'No. The lines and the proof photos remain.' },
      { q: 'Is the reason mandatory?', a: 'No, it is optional.' },
      {
        q: 'Is the site manager notified?',
        a: 'The screen does not announce it; they will only see the bot’s refusals on their next messages.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "Configure the finance module".' },
    related: [{ label: 'Registered site managers', helpId: 'finance.whatsapp.inscriptions' }],
    keywords: ['revoke', 'withdraw access', 'site manager', 'block']
  },
  {
    id: 'finance.whatsapp.conversations',
    kind: 'section',
    title: 'A site manager’s conversations',
    summary:
      'Reread a site manager’s count sessions: time, site, session status and the thread of messages exchanged with the bot.',
    howToRead: {
      statuses: [
        {
          value: 'AWAITING_SITE',
          label: 'Choice of site',
          description: 'The bot is waiting for the site manager to choose their site.'
        },
        {
          value: 'ANALYZING',
          label: 'Analysing the photo',
          description: 'A photo is being analysed.'
        },
        {
          value: 'AWAITING_ITEM',
          label: 'Choice of item',
          description: 'The bot is waiting for the site manager to state the item.'
        },
        {
          value: 'AWAITING_CONFIRMATION',
          label: 'Awaiting confirmation',
          description: 'The site manager must confirm, correct or cancel the proposed total.'
        },
        {
          value: 'AWAITING_MERGE',
          label: 'Awaiting the choice to add or replace',
          description: 'The item already has a line in the stocktake.'
        },
        { value: 'READY', label: 'Ready for a photo', description: 'The bot is waiting for the next photo.' },
        {
          value: 'CLOSED',
          label: 'Closed',
          description: 'Session ended: FIN, site change, no reply, access lost, registration revoked or no open site.'
        }
      ]
    },
    steps: [
      { title: 'Open', detail: '"⋮" menu of the registration, "View conversations".' },
      {
        title: 'Expand a session',
        detail: 'Click a session to read the thread. A photo is not loaded here: the thread only says it was received.'
      }
    ],
    consequences: ['Reading a conversation is reserved for people who configure finance or approve stocktakes.'],
    faq: [
      { q: 'Where can I see the photo?', a: 'On the "Field counts" screen, with "View the photo".' },
      { q: 'Why "No conversation"?', a: 'This site manager has not sent any message yet.' },
      {
        q: 'Who can read the conversations?',
        a: 'People who have the "Configure the finance module" or "Approve stocktakes" right.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Requires "Configure the finance module" or "Approve stocktakes".'
    },
    related: [{ label: 'Proof photo', helpId: 'finance.whatsapp.photo-preuve' }],
    keywords: ['conversation', 'messages', 'session', 'thread']
  },
  {
    id: 'finance.whatsapp.simulateur',
    kind: 'section',
    title: 'Simulator',
    summary: 'Play a conversation with the bot without WhatsApp, for test trials. Messages are not sent on WhatsApp.',
    purpose:
      'The tab only exists when the service is in test mode. It is used to check a site manager’s journey: activation, site choice, photo, confirmation, FIN.',
    steps: [
      {
        title: 'Choose the sender',
        detail: 'A registered site manager (masked number and status) or "Unknown number".'
      },
      {
        title: 'Write a message',
        detail: 'Free text, 1 000 characters at most; the bot’s reply buttons can be clicked in the thread.'
      },
      {
        title: 'Send a photo',
        detail: 'JPEG, PNG or WebP, 10 MB at most; a legend is possible.'
      },
      {
        title: 'Move time forward',
        detail:
          'During a session, "Move forward 10 minutes" or "30 minutes" simulates the reminder and the end without reply.'
      }
    ],
    consequences: [
      'The counts obtained are really saved in the site stocktake; the source is noted "simulator (testing)" on the proof.',
      'For a revoked site manager, the bot must reply that access is withdrawn.'
    ],
    faq: [
      {
        q: 'Why does the "Simulator" tab not appear?',
        a: 'It is only offered if the service is in test mode. Otherwise, use a real phone.'
      },
      {
        q: 'What is the "Legend" field for?',
        a: 'For trials with the test analysis provider, which reads instructions in the legend to force a result.'
      },
      {
        q: 'Do the messages reach the site manager?',
        a: 'No: "messages are not sent on WhatsApp".'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "Configure the finance module".' },
    related: [{ label: 'Site managers', helpId: 'finance.whatsapp.chefs' }],
    keywords: ['simulator', 'test', 'trial', 'photo', 'legend']
  },
  {
    id: 'finance.whatsapp.mesures',
    kind: 'section',
    title: 'Metrics',
    summary:
      'Follow, month by month, the quality of stocktake by WhatsApp for the whole agency: photos analysed, speed, rate of confirmation without correction.',
    howToRead: {
      notes: [
        '"Analysed photos": number of photos analysed in the month.',
        '"Median time to confirmation": typical time between the photo and the site manager’s reply. Target: under 45 s.',
        '"Counts confirmed without correction": share of proposals the site manager confirmed as they were. Target: 88% and above.',
        '"Lines with a proof photo": share of WhatsApp lines that still carry their photo. Target: 100%.',
        '"Unreadable photos", "Items not recognised", "Failed analyses": share of analysed photos concerned.'
      ]
    },
    steps: [{ title: 'Choose the month', detail: 'The month selector changes all the figures.' }],
    faq: [
      {
        q: 'Do the metrics name people?',
        a: 'No: "Metrics for the whole agency. No metric per person."'
      },
      { q: 'Why dashes "—"?', a: 'No data that month for this figure.' },
      {
        q: 'What if many photos are unreadable?',
        a: 'Remind site managers to photograph from the front, in full, with the flash if needed.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires "Configure the finance module".' },
    related: [{ label: 'Stocktake by WhatsApp', helpId: 'finance.whatsapp.page' }],
    keywords: ['metrics', 'quality', 'rate', 'delay', 'unreadable photos']
  },
  {
    id: 'finance.whatsapp.photo-preuve',
    kind: 'section',
    title: 'Count by photo',
    summary:
      'This panel shows the proof of a count made through WhatsApp: the photo, its fingerprint, the analysis proposed and what the site manager did with it.',
    howToRead: {
      statuses: [
        {
          value: 'ACCEPTED',
          label: 'Confirmed as is',
          description: 'The site manager accepted the proposal.'
        },
        {
          value: 'CORRECTED',
          label: 'Corrected by the site manager',
          description: 'The site manager typed another quantity.'
        },
        {
          value: 'CANCELLED',
          label: 'Cancelled',
          description: 'The site manager cancelled: nothing is saved.'
        },
        {
          value: 'EXPIRED',
          label: 'Abandoned (no reply)',
          description: 'The site manager did not reply in time.'
        },
        {
          value: 'UNREADABLE',
          label: 'Unreadable photo',
          description: 'Photo too dark, blurred or with no visible material.'
        },
        {
          value: 'UNRECOGNIZED',
          label: 'Item not recognised',
          description: 'The item could not be identified.'
        },
        {
          value: 'FAILED',
          label: 'Analysis failed',
          description: 'Timeout, service unavailable, unreadable response or analysis disabled.'
        },
        {
          value: 'PENDING',
          label: 'Awaiting the site manager’s reply',
          description: 'The proposal is waiting for their reply.'
        },
        {
          value: 'RECEIVED',
          label: 'Photo received, analysis in progress',
          description: 'Analysis is not finished.'
        }
      ],
      notes: [
        '"Proof": server date and time, file fingerprint (any change would be detectable), channel, site manager, site.',
        '"Analysis": counting method (stacked sacks, bundle of bars or tubes, blocks on a pallet, other), proposed total, confidence and photo quality.',
        '"What the site manager did": outcome, quantity retained, addition to or replacement of an existing count, link to the stocktake.'
      ]
    },
    steps: [
      {
        title: 'Open',
        detail: '"View the photo" from "Field counts", or the photo link of a stocktake line.'
      },
      { title: 'Read the conversation', detail: '"View the conversation" (for authorised people).' },
      {
        title: 'Remove the photo',
        detail: '"Remove the photo", with a reason of 3 to 500 characters.'
      }
    ],
    consequences: [
      'Removing the photo erases the file: the count and the fingerprint remain. Do it for example if the photo shows a person.',
      'The removal is traced (who, when, why) and irreversible.'
    ],
    faq: [
      { q: 'Who can remove a photo?', a: 'People who have the "Scraps and returns" right.' },
      {
        q: 'Does the photo disappear from the count?',
        a: 'Only the file is erased; the line and its fingerprint remain.'
      },
      {
        q: 'Why "The photo could not be loaded"?',
        a: 'The file is temporarily unavailable: try again later.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Reading requires "View stock". Removing the photo requires "Scraps and returns".'
    },
    related: [{ label: 'Field counts', helpId: 'finance.comptages-terrain.page' }],
    keywords: ['photo', 'proof', 'fingerprint', 'analysis', 'confidence', 'remove']
  }
];

export default entries;
