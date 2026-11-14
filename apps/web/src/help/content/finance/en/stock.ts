import type { HelpEntry } from '../../../types';

/** “stock” zone of the finance module (en). */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------------------
  // Stock screen
  // ---------------------------------------------------------------------------
  {
    id: 'finance.stock.page',
    kind: 'page',
    title: 'Stock',
    summary:
      'Track what is left of each item in each store or site, and record receipts, issues, scrap and returns. The journal keeps a trace of every movement.',
    purpose:
      'Site stock tracks purchased materials: how much is left, where, and what it is worth. Goods come in through a receipt linked to a validated supplier invoice. They leave for a site through an issue: that action, and only that one, brings the material cost into the cost of the site.\n\nThis screen is made for the office. On a phone, in the warehouse or on site, use the “Store” screen instead.',
    steps: [
      {
        title: 'Read the stock',
        detail: '“Stock position” tab: one line per item and per location, with the quantity left.'
      },
      {
        title: 'Record a receipt',
        detail: 'Button “Record a receipt”: choose the validated invoice, the location, the items and quantities.'
      },
      {
        title: 'Record an issue',
        detail:
          'Button “Record an issue”: choose the site, the location, the taker, then the items with their expense line.'
      },
      {
        title: 'Scrap or return',
        detail:
          '“Other movements” menu: “Scrap” for destroyed material, “Return to the supplier” to send back invoiced goods.'
      },
      {
        title: 'Find a movement',
        detail:
          '“Movement log” tab: filter by type, period, item, location or site, then open the linked slip or invoice.'
      }
    ],
    consequences: [
      'A receipt increases the stock but raises no site cost: the invoice has already carried the value, and no accounting entry is posted at receipt.',
      'An issue decreases the stock and charges the site at the average cost of the location at that moment. It also posts an accounting entry: the expense of the cost line is debited, the stock account is credited.',
      'A transfer between locations is done from the “Store” screen: it changes neither the total value nor site costs. A stocktake is done from “Stocktake” or from “Store”.',
      'No movement is deleted or edited: a mistake is corrected by an opposite movement or by a stocktake. The journal keeps everything.',
      'Buttons depend on your rights. Without the right to see values, amounts, costs and filters by person do not appear.'
    ],
    faq: [
      {
        q: 'Why does my site cost not move after a receipt?',
        a: 'Because a receipt only adds stock. The material enters the site cost when it leaves, through an issue to that site.'
      },
      {
        q: 'Why do I see no amounts?',
        a: 'Stock values require the right “See stock values”. Without it you see quantities and movements, but no costs or values.'
      },
      {
        q: 'Why does a quantity show “Count in progress”?',
        a: 'A stocktake is in progress at this location. To keep the count honest, the expected quantity is hidden until the count is closed, except for people who validate stocktakes.'
      }
    ],
    permissions: {
      roles: ['Storekeeper'],
      feature: 'CONSTRUCTION',
      note: 'Seeing the stock requires “View stock”. Receiving, issuing, “Scraps and returns” and “See stock values” are separate rights. Rights are granted by the agency administrator.'
    },
    related: [
      { label: 'Stock status', helpId: 'finance.stock.etat' },
      { label: 'Movements journal', helpId: 'finance.stock.journal' },
      { label: 'The Magasin screen (phone)', to: '/tenant/:tenantId/finance/stock/magasin' },
      { label: 'Items and locations', to: '/tenant/:tenantId/finance/stock/parametrage' }
    ],
    keywords: [
      'stock',
      'materials',
      'store',
      'warehouse',
      'receipt',
      'issue',
      'scrap',
      'supplier return',
      'movement',
      'average cost',
      'site costing'
    ],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'stock-imputation',
          title: 'Who charges the site?',
          description: 'Only the issue brings the material cost into the site. A receipt only changes quantities.'
        },
        {
          target: 'stock-actions',
          title: 'Stock actions',
          description:
            'Receipt, issue, and under “Other movements” scrap and supplier return. You only see those your rights allow.'
        },
        {
          target: 'stock-onglets',
          title: 'Status and journal',
          description: '“Stock position” says what is left; “Movement log” says how we got there.'
        }
      ]
    }
  },
  {
    id: 'finance.stock.etat',
    kind: 'section',
    title: 'Stock status',
    summary:
      'This tab shows, for each item and each location, the quantity left and, if you see values, what it is worth.',
    purpose:
      'It is a snapshot of the stock right now. The same item can be in stock in several stores or sites: each item and location pair has its own line and its own average cost.',
    steps: [
      {
        title: 'Search for an item',
        detail: 'Type a reference, a description or a location in “Search”.'
      },
      {
        title: 'Filter',
        detail: 'Filters “Venue” and “Item”. The “Hide zero lines” box hides exhausted items.'
      },
      {
        title: 'Export',
        detail: 'The table export button uses the same filters.'
      }
    ],
    consequences: [
      'Opening, searching or filtering changes nothing: these are reads.',
      'If no line appears when you expect stock, check the filters, then that a receipt was actually recorded.'
    ],
    faq: [
      {
        q: 'Why does the same item appear on several lines?',
        a: 'Because it is stored in several locations. Each location has its own quantity, average cost and value.'
      },
      {
        q: 'How do I read “0 sac — plus rien ici”?',
        a: 'The item was received at this location, but everything has left. The line stays to keep the history.'
      },
      {
        q: 'Why is the average cost different between two stores?',
        a: 'It depends on what was received in each location and at what price. It is never typed by hand: it is derived from value and quantity.'
      }
    ],
    permissions: {
      roles: ['Storekeeper'],
      feature: 'CONSTRUCTION',
      note: 'Requires “View stock”. Average cost and value require “See stock values”.'
    },
    related: [{ label: 'Stock status table', helpId: 'finance.stock.etat.tableau' }],
    keywords: ['balance', 'quantity in stock', 'available', 'stock status', 'current inventory']
  },
  {
    id: 'finance.stock.etat.tableau',
    kind: 'table',
    title: 'Stock status table',
    summary:
      'Each line is an item in a location. It gives the quantity in stock and, if you see values, the average cost and the value.',
    howToRead: {
      columns: [
        { key: 'article', label: 'Item', description: 'The item description, with its reference below.' },
        {
          key: 'lieu',
          label: 'Location',
          description:
            'The store or site location where this stock is. The mention “Count in progress” shows a stocktake in progress at this location.'
        },
        {
          key: 'quantite',
          label: 'Quantity',
          description:
            'The quantity in stock, in the item unit (bag, tonne, bar…). “Count in progress” replaces the figure when the location is being counted and you do not validate stocktakes.'
        },
        {
          key: 'cout-moyen',
          label: 'Average unit cost',
          description: 'The average price of one unit in this location, in FCFA. Shown only if you see values.'
        },
        {
          key: 'valeur',
          label: 'Value',
          description: 'What the quantity in stock is worth, in FCFA. Shown only if you see values.'
        }
      ],
      notes: [
        'On a phone, the table becomes a list of cards with the same information.',
        'The average cost is a weighted average cost: each receipt recalculates it, and each issue leaves at the average cost of the moment.'
      ]
    },
    steps: [
      { title: 'See the stock of a store', detail: 'Choose the location in the “Venue” filter.' },
      { title: 'See where an item is', detail: 'Choose the item in the “Item” filter: one line per location appears.' }
    ],
    consequences: ['The table is read-only: quantities change only by recording a movement or a stocktake.'],
    faq: [
      {
        q: 'Why are the value columns missing?',
        a: 'Your role does not have the right “See stock values”. A message at the top of the screen reminds you.'
      },
      {
        q: 'Is the stock up to date after I save?',
        a: 'Yes, the list is reloaded after each save. Otherwise, reload the page.'
      },
      {
        q: 'Can I correct a quantity here?',
        a: 'No. A quantity changes through a movement (receipt, issue, scrap, return, transfer) or a validated stocktake.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires “View stock”.' },
    related: [{ label: 'Movements journal', helpId: 'finance.stock.journal' }],
    keywords: ['balance', 'quantity', 'stock value', 'weighted average cost', 'item', 'location']
  },
  {
    id: 'finance.stock.journal',
    kind: 'section',
    title: 'Movements journal',
    summary:
      'Every receipt, issue, transfer, scrap, return or adjustment of the stock is recorded there, with its date, its author and, if any, its slip.',
    purpose:
      'The journal helps you understand why a quantity changed and find who took what, for which site. Nothing is erased: a mistake is corrected by a new movement, added afterwards.',
    steps: [
      {
        title: 'Filter',
        detail:
          'Filters “Nature”, “Period”, “Item”, “Venue”, “Construction site”; “Recipient” and “Entered by” if you see values.'
      },
      {
        title: 'Open a slip',
        detail: 'Click the number in the “Good” column: the slip opens on the right, with its lines and attachments.'
      },
      {
        title: 'See the invoice',
        detail: 'Click the reference in the “Attachment” column: the invoice receipts are displayed.'
      },
      { title: 'Export', detail: 'Button “Export (CSV)”: same filters as the list, 50,000 lines at most.' }
    ],
    consequences: [
      'Reading, filtering or exporting the journal changes nothing.',
      'The CSV export has no value columns if your role does not see values. Beyond 50,000 lines, reduce the period or add a filter.'
    ],
    faq: [
      {
        q: 'What does “+2 j” next to “Entered on” mean?',
        a: 'The movement was entered 2 days after the date given to it. From 3 days on, the tag turns to a warning. The real entry date is always kept.'
      },
      {
        q: 'Why does a transfer take two lines?',
        a: 'A transfer is written as two movements: an issue from the origin location (− sign) and a receipt in the destination location (+ sign).'
      },
      {
        q: 'How do I find what a site has consumed?',
        a: 'Filter the type on “Issue to a site” and the wanted site: the “Site charged” column also shows the expense line.'
      },
      {
        q: 'Where do I see more lines?',
        a: 'The journal is displayed in pages of 50 lines: button “Load more” at the bottom of the list.'
      }
    ],
    permissions: {
      roles: ['Storekeeper'],
      feature: 'CONSTRUCTION',
      note: 'Requires “View stock”. Filters by person and value columns require “See stock values”.'
    },
    related: [{ label: 'Journal table', helpId: 'finance.stock.journal.tableau' }],
    keywords: ['history', 'traceability', 'movements', 'who took', 'export', 'issue slip']
  },
  {
    id: 'finance.stock.journal.tableau',
    kind: 'table',
    title: 'Movements journal table',
    summary:
      'Each line is a movement of an item in a location. The sign before the quantity says whether the stock goes up (+) or down (−).',
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'The movement date, as declared at entry.' },
        {
          key: 'saisi-le',
          label: 'Entered on',
          description:
            'The real day and time of entry. “+N j” means the entry took place N days after the movement date.'
        },
        { key: 'nature', label: 'Type', description: 'The type of movement (see the types below).' },
        {
          key: 'bon',
          label: 'Slip',
          description:
            'The slip number (receipt, issue or stocktake). A click opens it. A dash means no slip is linked, for example for a transfer, scrap or return.'
        },
        { key: 'article', label: 'Item', description: 'The item description, with its reference.' },
        { key: 'lieu', label: 'Location', description: 'The store or site location affected by the movement.' },
        {
          key: 'quantite',
          label: 'Quantity',
          description: 'The quantity moved, preceded by + (stock goes up) or − (stock goes down).'
        },
        {
          key: 'reste',
          label: 'Remaining after',
          description:
            'The quantity in stock at this location just after the movement, and its value if you see values. “Hidden (count in progress)” if the location is being counted.'
        },
        {
          key: 'prix-unitaire',
          label: 'Unit price',
          description: 'The price of one unit used for this movement, in FCFA. Visible with the right to see values.'
        },
        {
          key: 'valeur',
          label: 'Movement value',
          description:
            'The value of the movement in FCFA. For a supplier return, the tooltip also gives the amount credited to the supplier.'
        },
        {
          key: 'chantier',
          label: 'Charged site',
          description:
            'The site and the expense line to which an issue was charged. “No allocation” for the other types.'
        },
        {
          key: 'preneur',
          label: 'Taker or requester',
          description:
            'The person who took the goods, as recorded that day. If the name has changed since, the current name is shown.'
        },
        {
          key: 'motif',
          label: 'Reason',
          description: 'The reason for the movement when required: scrap, return, transfer, stocktake difference.'
        },
        {
          key: 'piece',
          label: 'Document',
          description: 'The supplier invoice linked to a receipt or a return. A click opens its receipts.'
        },
        { key: 'auteur', label: 'Entered by', description: 'The user who recorded the movement.' },
        {
          key: 'pieces-jointes',
          label: 'Attachments',
          description: 'The number of photos and documents attached. A click opens them.'
        }
      ],
      statuses: [
        {
          value: 'RECEIPT',
          label: 'Reception',
          description: 'Goods delivered and linked to a validated invoice. Stock goes up; no site cost moves.'
        },
        {
          value: 'ISSUE',
          label: 'Sortie vers un chantier',
          description:
            'Goods handed to a taker for a site. Stock goes down and the site is charged at the average cost of the moment.'
        },
        {
          value: 'TRANSFER',
          label: 'Transfert entre lieux',
          description:
            'Goods moved from one location to another, on two lines. No charge to a site and no accounting entry.'
        },
        {
          value: 'ADJUSTMENT',
          label: 'Ajustement d’inventaire',
          description: 'Stock correction found by a stocktake (breakage, loss, surplus).'
        },
        {
          value: 'SUPPLIER_RETURN',
          label: 'Retour au fournisseur',
          description: 'Goods sent back to the supplier. Stock goes down, and so does the debt to that supplier.'
        },
        {
          value: 'SCRAP',
          label: 'Rebut',
          description: 'Destroyed or unusable material removed from stock. Never charged to a site.'
        }
      ],
      notes: [
        'The “Unit price” and “Value of the movement” columns only appear if you see values.',
        'On a phone, each movement becomes a card.'
      ]
    },
    steps: [
      { title: 'Find an issue', detail: '“Nature” filter on “Issue to a site”, then the site.' },
      { title: 'Find a specific day', detail: 'Use the “Period” filter.' }
    ],
    consequences: ['The journal is read-only: no line is edited or deleted there.'],
    faq: [
      {
        q: 'A line shows “No allocation”. Is it an error?',
        a: 'No. Only an issue to a site charges a site. Receipts, transfers, scrap, returns and adjustments do not.'
      },
      {
        q: 'What does “Cost line not provided” mean?',
        a: 'The issue is linked to a site but no expense line is recorded on this line.'
      },
      {
        q: 'The taker name has changed: which one is shown?',
        a: 'The name as it was on the day of the movement, followed by the current name in brackets.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires “View stock”.' },
    related: [{ label: 'Stock actions', helpId: 'finance.stock.page' }],
    keywords: ['movements', 'journal', 'traceability', 'type', 'charged site', 'remaining after']
  },
  {
    id: 'finance.stock.reception',
    kind: 'section',
    title: 'Record a receipt',
    summary:
      'A receipt adds the delivered goods to the stock, linking them to a validated supplier invoice. It produces a receipt slip.',
    purpose:
      'When the supplier delivers, the receipt says what quantity of which item arrived, in which location. It raises no site cost: the invoice has already carried the value, and the issue to a site will charge it later.',
    steps: [
      {
        title: 'Choose the invoice',
        detail: 'Only invoices validated by accounting are offered. A tag shows whether it has already been received.'
      },
      {
        title: 'Choose the location',
        detail:
          'The location of the invoice site is offered first if that site has stock. A closed site location is not offered.'
      },
      {
        title: 'Enter the date',
        detail: 'Not in the future, and not older than the limit set by your agency (7 days by default).'
      },
      {
        title: 'Enter the lines',
        detail:
          'For each line: the item, the quantity received and, if you wish, the matching invoice line. “Add a line” to add one.'
      },
      { title: 'Add photos', detail: 'Optional: the delivery note and the goods.' },
      {
        title: 'Save',
        detail: 'The receipt slip is created. You can download its PDF and photograph the signed slip.'
      }
    ],
    consequences: [
      'The location stock increases. No accounting entry is posted and no site is charged: the value is already in the invoice.',
      'The price used is that of the invoice line; otherwise the average cost of the location, then the last price received. It recalculates the average cost of the location. If you see values you can enter a price, otherwise nothing needs to be entered.',
      'The total received does not have to equal the invoice amount: a delivery in several parts is normal. A warning appears if this invoice was already received, if receipts exceed its amount, or if items are received with no known price.',
      'A deactivated item cannot be received.',
      'If the connection drops, try again: the operation is never recorded twice.'
    ],
    faq: [
      {
        q: 'Why is my invoice not in the list?',
        a: 'It is probably not yet validated by accounting. A receipt requires a validated invoice.'
      },
      {
        q: 'The invoice was already received. Can I receive again?',
        a: 'Yes, a delivery in several parts is normal. The screen lists the receipts already made to avoid a duplicate.'
      },
      {
        q: 'I got the quantity wrong. What do I do?',
        a: 'A receipt cannot be edited. Correct it with a stocktake, or with a supplier return if the goods are sent back.'
      },
      {
        q: 'Which date should I enter?',
        a: 'The delivery date. The real entry date is recorded alongside, and a gap of several days is visible in the journal.'
      }
    ],
    permissions: { roles: ['Storekeeper'], feature: 'CONSTRUCTION', note: 'Requires “Receive”.' },
    related: [
      { label: 'Receipts already made on an invoice', helpId: 'finance.stock.facture' },
      { label: 'The receipt slip', helpId: 'finance.stock.bon' }
    ],
    keywords: ['delivery', 'receive goods', 'receipt slip', 'supplier invoice', 'stock in']
  },
  {
    id: 'finance.stock.sortie',
    kind: 'section',
    title: 'Record an issue to a site',
    summary: 'An issue hands goods to a taker for a site. This action brings the material cost into the site cost.',
    purpose:
      'The issue says who took what, from which location, for which site and on which expense line. It produces an issue slip to be signed by the taker.',
    steps: [
      { title: 'Choose the site', detail: 'A closed site no longer accepts issues: it is not offered.' },
      { title: 'Choose the issue location', detail: 'The store or site location the goods leave from.' },
      {
        title: 'Enter the taker',
        detail:
          'Choose a person from the takers directory. If your agency does not require it, you can type a free name.'
      },
      {
        title: 'Enter the items',
        detail:
          'Item, quantity and expense line, line by line (up to 50). The screen shows the stock available in the location.'
      },
      { title: 'Enter the date', detail: 'Not in the future, and not beyond the limit set by your agency.' },
      {
        title: 'Save',
        detail: 'The issue slip is created: download the PDF, have it signed, then photograph it.'
      }
    ],
    consequences: [
      'The location stock goes down. An item cannot leave in a larger quantity than the stock available: the issue is refused.',
      'The value of the issue is calculated by the server at the average cost of the location at that moment. No price is entered. The screen only shows an indicative preview.',
      'The site is charged this value, on the chosen expense line: this is what increases its real cost.',
      'An accounting entry is posted for each line that has a value: the expense of the line (otherwise site expenses) is debited and the stock account is credited.',
      'If the slip value reaches the threshold set by your agency, a stock alert is created.',
      'The expense line is mandatory and never guessed: the line proposed by the item is only an editable suggestion.'
    ],
    faq: [
      {
        q: 'Why is my issue refused?',
        a: 'Most often because the quantity exceeds the available stock of the location, or the site is closed. The message shown states the cause.'
      },
      {
        q: 'Can I issue without naming the taker?',
        a: 'No: a taker from the directory or a name is required. If your agency requires it, only a taker from the directory is accepted.'
      },
      {
        q: 'Why does the form ask for no price?',
        a: 'The price comes from the average cost of the location at the time of issue. This avoids hand-typed prices.'
      },
      {
        q: 'How do I cancel an issue?',
        a: 'It cannot be cancelled. Put the goods back in stock with a receipt or a transfer, or regularise with a stocktake.'
      }
    ],
    permissions: { roles: ['Storekeeper'], feature: 'CONSTRUCTION', note: 'Requires “Issue”.' },
    related: [
      { label: 'Takers directory', helpId: 'finance.preneurs.page' },
      { label: 'The issue slip', helpId: 'finance.stock.bon' }
    ],
    keywords: ['stock issue', 'issue slip', 'site costing', 'site consumption', 'taker', 'expense line']
  },
  {
    id: 'finance.stock.rebut',
    kind: 'section',
    title: 'Record scrap',
    summary:
      'Scrap removes from stock a material that is destroyed or has become unusable. It is not charged to any site.',
    purpose:
      'Use it for broken or deteriorated material (humidity, expiry). The loss is recorded with its reason, instead of letting the stock show a quantity that no longer exists.',
    steps: [
      { title: 'Choose the location and the item', detail: 'The stock concerned.' },
      { title: 'Enter the quantity', detail: 'It cannot exceed the stock available in this location.' },
      {
        title: 'Choose the reason',
        detail: '“Breakage”, “Deterioration” or “Other”: with “Other”, a detail is mandatory.'
      },
      { title: 'Enter the date', detail: 'Not in the future, and within the limit set by your agency.' },
      { title: 'Save', detail: 'You can attach a photo of the goods before saving.' }
    ],
    consequences: [
      'The location stock goes down by the scrapped quantity, valued at the average cost of the location.',
      'An accounting entry is posted if the value is not zero: stock variation (account 603) is debited, the stock account (311) is credited.',
      'Scrap is never charged to a site.',
      'A stock alert may be created if the value reaches the threshold set by your agency.',
      'Scrap cannot be cancelled: it is final in the journal.'
    ],
    faq: [
      {
        q: 'Scrap or adjustment: which one?',
        a: 'Scrap declares a known loss (breakage, deterioration). An adjustment comes from a stocktake that finds a difference.'
      },
      {
        q: 'Why can I not scrap more than what is there?',
        a: 'Stock cannot become negative. Check the quantity and the location.'
      },
      {
        q: 'Can I cancel a scrap I have recorded?',
        a: 'No, a scrap is final in the movements journal. Before saving, check the location, the item and the quantity.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires “Scraps and returns” (“Other movements” menu).' },
    related: [{ label: 'Movements journal', helpId: 'finance.stock.journal' }],
    keywords: ['breakage', 'loss', 'deterioration', 'destroyed material', 'write-off']
  },
  {
    id: 'finance.stock.retour',
    kind: 'section',
    title: 'Return goods to the supplier',
    summary:
      'A return removes from stock goods sent back to the supplier and reduces what is owed to them. It is linked to a validated invoice.',
    purpose:
      'Use it for goods that are non-compliant, damaged on delivery or delivered in excess. A return can only cover what was received on the invoice and not yet returned.',
    steps: [
      { title: 'Choose the invoice', detail: 'A validated invoice on which items were received.' },
      {
        title: 'Choose the item',
        detail: 'The screen recalls what was received, already returned and still returnable.'
      },
      {
        title: 'Choose the invoice line',
        detail:
          'Required when the item was received without a price taken from the invoice: the price of this line sets the amount deducted from the supplier debt.'
      },
      {
        title: 'Choose the location and quantity',
        detail: 'The quantity exceeds neither the returnable amount nor the location stock.'
      },
      {
        title: 'Choose the reason',
        detail: '“Not as ordered”, “Damaged on delivery”, “Over-delivered” or “Other” with a detail.'
      },
      { title: 'Save', detail: 'Date within your agency limits; photo optional.' }
    ],
    consequences: [
      'The location stock goes down, valued at the average cost of the location.',
      'An accounting entry is posted: stock is credited, the supplier debt is debited at the invoice price, and any price difference goes to stock variation.',
      'The return does not change the outstanding amount shown on the invoice: reconcile the supplier credit note afterwards.',
      'A return cannot be cancelled.'
    ],
    faq: [
      {
        q: 'Why can I not return more?',
        a: 'The return is capped at the quantity received on the invoice minus what was already returned, and at the stock present in the location.'
      },
      {
        q: 'Does the supplier owe me a credit note?',
        a: 'The screen records the return and the drop in the debt. The credit note itself is reconciled afterwards on the supplier side.'
      },
      {
        q: 'Why is the item I am looking for not offered?',
        a: 'Only items received on the chosen invoice are offered, and the list stays inactive until you choose the invoice. Check that the item was actually received on that invoice.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires “Scraps and returns” (“Other movements” menu).' },
    related: [{ label: 'Receipts and returns of an invoice', helpId: 'finance.stock.facture' }],
    keywords: ['supplier return', 'credit note', 'non-compliant goods', 'send back', 'invoice']
  },
  {
    id: 'finance.stock.bon',
    kind: 'section',
    title: 'Stock slip',
    summary:
      'The slip groups the lines of a receipt, an issue or a stocktake, with its number, dates, PDF and attachments.',
    purpose:
      'The slip is the document that is signed and archived: “Goods received note”, “Issue slip” or “Stocktake report”. It recalls the location, site, taker or invoice concerned.',
    steps: [
      {
        title: 'Read the slip',
        detail:
          'Dates, location, site, taker or requester, invoice, then the items and quantities. The total value shows if you see values.'
      },
      { title: 'Download the PDF', detail: 'To have it signed or archive it.' },
      {
        title: 'Attach a document',
        detail: 'Photo of the signed slip, of the delivery note or of the goods, if your rights allow it.'
      },
      { title: 'See the movements', detail: '“View this slip’s movements” opens the journal filtered on this slip.' }
    ],
    consequences: [
      'Viewing a slip changes nothing.',
      'Adding an attachment is possible depending on the slip type: “Receive” for a receipt, “Issue” for an issue, “Approve stocktakes” for a stocktake report.',
      'The “Recorded” date is the server time, and cannot be changed.'
    ],
    faq: [
      {
        q: 'Why does a transfer or scrap have no slip?',
        a: 'Only receipts, issues and stocktakes produce a numbered slip.'
      },
      { q: 'Where do I find the signed slip?', a: 'In the slip attachments, if someone photographed it.' },
      {
        q: 'Why does the total value not appear on the slip?',
        a: 'It is shown only if your rights allow you to see values.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Reading a slip requires “View stock”.' },
    related: [{ label: 'Movements journal', helpId: 'finance.stock.journal' }],
    keywords: ['receipt slip', 'issue slip', 'attachment', 'pdf', 'signature']
  },
  {
    id: 'finance.stock.facture',
    kind: 'section',
    title: 'Receipts of an invoice',
    summary:
      'This panel shows, for a supplier invoice, what has already been received in stock and what has been returned.',
    purpose: 'It helps avoid a duplicate before a new receipt, and follow a delivery made in several parts.',
    steps: [
      {
        title: 'Read the amount',
        detail: 'The invoice amount, then the list of receipts with date, location and author.'
      },
      { title: 'Open a slip', detail: 'From a receipt, open its receipt slip.' },
      { title: 'See the returns', detail: 'The “Returns to the supplier” section lists what was sent back.' }
    ],
    consequences: ['This panel is read-only: it changes neither the invoice nor the stock.'],
    faq: [
      {
        q: 'Must the total received equal the invoice?',
        a: 'No. A difference is possible and visible here; it does not block the receipt.'
      },
      { q: 'Why does no receipt appear?', a: 'This invoice has not yet been received in stock.' },
      {
        q: 'Why is there no “Returns to the supplier” section?',
        a: 'It appears only if at least one return has been recorded on this invoice.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires “View stock”.' },
    related: [{ label: 'Record a receipt', helpId: 'finance.stock.reception' }],
    keywords: ['supplier invoice', 'receipts', 'partial delivery', 'returns']
  },

  // ---------------------------------------------------------------------------
  // Magasin (phone)
  // ---------------------------------------------------------------------------
  {
    id: 'finance.magasin.page',
    kind: 'page',
    title: 'Magasin',
    summary:
      'The Magasin screen is for the phone, in the warehouse or on site. It records a receipt, an issue, a transfer or a count in a few simple steps, with photos.',
    purpose:
      'It is designed for a small phone and a fragile network: one action per screen, large lists to pick from, and no amount shown or asked, even from someone who sees values. You always work on one location, which the screen remembers from one visit to the next on this browser.',
    steps: [
      {
        title: 'Choose the location',
        detail: 'On the first visit, choose your store or your site. “Change” lets you pick another one.'
      },
      {
        title: 'Choose an action',
        detail: '“Receive”, “Issue”, “Count”; “Transfer” is under “Other actions”.'
      },
      {
        title: 'Follow the screens',
        detail: 'Each screen asks a question. “Back” goes back without losing what you entered.'
      },
      {
        title: 'Check then save',
        detail: 'The last screen summarises the operation. The save button creates the slip.'
      },
      {
        title: 'Sign and photograph',
        detail: 'After an issue or a receipt, download the slip, have it signed and photograph it.'
      }
    ],
    consequences: [
      'The actions offered depend on your rights. With no write right at all, the screen says “No stock action is available to you”.',
      'Nothing is recorded until you press the save button. Leaving an entry in progress asks for confirmation.',
      'If the connection drops, your entries are kept and “Try again” does not create a duplicate. There is no offline mode: keep the screen open while sending.',
      'The effects are those of the Stock screen: an issue charges the site, a receipt does not, a transfer does neither.'
    ],
    faq: [
      {
        q: 'Why the message “Stock is not available to you”?',
        a: 'Your role does not include viewing the stock. Ask the agency administrator for the Storekeeper role, or a role that includes it.'
      },
      {
        q: 'Why no amounts on this screen?',
        a: 'It is intentional: in the warehouse we talk quantities. Prices and values are viewed on the Stock screen.'
      },
      {
        q: 'My location disappeared from the list. Why?',
        a: 'Only active locations are offered. If the remembered location is deactivated, the screen asks you to choose one again.'
      },
      {
        q: 'Where do I see what I did today?',
        a: 'In “Today at this location”, on the home screen: tap a slip to open it.'
      }
    ],
    permissions: {
      roles: ['Storekeeper'],
      feature: 'CONSTRUCTION',
      note: 'Requires “View stock”. Each action requires its own right: “Receive”, “Issue”, “Transfer”, “Count”.'
    },
    related: [
      { label: 'Magasin home', helpId: 'finance.magasin.accueil' },
      { label: 'Receive goods', helpId: 'finance.magasin.recevoir' },
      { label: 'Issue goods', helpId: 'finance.magasin.sortir' },
      { label: 'The Stock screen (office)', to: '/tenant/:tenantId/finance/stock' }
    ],
    keywords: ['storekeeper', 'mobile', 'phone', 'warehouse', 'field', 'receipt', 'issue', 'count', 'photo']
  },
  {
    id: 'finance.magasin.lieu',
    kind: 'section',
    title: 'Choose the location',
    summary: 'Choose the store or site location you are working on. The screen remembers it for next time.',
    purpose:
      'All actions start from this location or arrive in it: issue from this location, count of this location, transfer from this location.',
    steps: [
      { title: 'Search', detail: 'Type the name of the location or site to shorten the list.' },
      { title: 'Choose', detail: 'Tap the location: you arrive on the home screen.' },
      { title: 'Change it', detail: 'On the home screen, “Change” next to the location name.' }
    ],
    consequences: [
      'The choice is kept in this browser, for your agency. It changes nothing in the stock.',
      'Tags warn you: “Count in progress”, “Count closed” (differences to justify) and “Site closed” (the location no longer receives goods).'
    ],
    faq: [
      {
        q: 'Why is a location missing?',
        a: 'It is deactivated, or not one of your agency locations. The administrator manages locations in “Items and locations”.'
      },
      { q: 'Must I choose again every time?', a: 'No, the location is remembered on this browser.' },
      {
        q: 'Why am I asked to choose the location again?',
        a: 'The remembered location is no longer available or has been deactivated. Choose another one from the list.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires “View stock”.' },
    related: [{ label: 'Items and locations', to: '/tenant/:tenantId/finance/stock/parametrage' }],
    keywords: ['location', 'store', 'site', 'change location']
  },
  {
    id: 'finance.magasin.accueil',
    kind: 'section',
    title: 'Magasin home',
    summary:
      'The home screen offers the actions your rights allow, then lists what was recorded today at the location.',
    purpose:
      'Big buttons for the phone: “Receive” (delivered goods), “Issue” (hand over to a site), “Count” (stocktake of the location), and under “Other actions” “Transfer to another location”.',
    steps: [
      { title: 'Choose an action', detail: 'Tap the matching button.' },
      {
        title: 'Review the day',
        detail:
          '“Today at this location” shows up to 20 operations of the day, grouped by slip, with time, type and number of items.'
      },
      { title: 'Open a slip', detail: 'Tap a line that carries a slip number: it opens full screen.' }
    ],
    consequences: [
      'A line with no slip (transfer, scrap, return) is greyed out: it does not open.',
      'No amount is shown on this screen.'
    ],
    faq: [
      { q: 'I do not see “Transfer”.', a: 'It is under “Other actions” and requires the right “Transfer”.' },
      { q: 'I do not see “Count”.', a: 'It requires the right “Count”.' },
      {
        q: 'Why do I have no button on the home screen?',
        a: 'If “No stock action is available to you” is shown, your role allows you to view stock but not to record it. Ask your agency administrator to open the necessary rights for you.'
      }
    ],
    permissions: { roles: ['Storekeeper'], feature: 'CONSTRUCTION', note: 'Each button requires its own right.' },
    related: [{ label: 'The slip', helpId: 'finance.magasin.bon' }],
    keywords: ['home', 'actions', 'today', 'operations of the day']
  },
  {
    id: 'finance.magasin.recevoir',
    kind: 'section',
    title: 'Receive goods',
    summary: 'The “Receive” action records a delivery: invoice, location, items received, photos, then a receipt slip.',
    purpose:
      'In the field, it replaces the office form. It asks for no price: only what arrived matters. The receipt raises no site cost.',
    steps: [
      {
        title: 'Which invoice?',
        detail: 'Choose among validated invoices. “Search all invoices” widens the search.'
      },
      {
        title: 'Already received?',
        detail:
          'If the invoice was already received, the screen lists the receipts made. Continue only if it is another delivery.'
      },
      {
        title: 'Where do the goods arrive?',
        detail: 'The receiving location. The one of the invoice site is offered first.'
      },
      {
        title: 'What did you receive?',
        detail: 'Add each item with its quantity, and if you know it the invoice line.'
      },
      {
        title: 'Photos',
        detail: 'Optional: delivery note and goods. Tap “Skip” to take none.'
      },
      { title: 'Check', detail: 'Reread, change the date if needed, then “Save the receipt”.' }
    ],
    consequences: [
      'The location stock increases. No accounting entry, no site charge.',
      'The price is that of the invoice, otherwise the average cost of the location, otherwise the last price received. Nothing needs to be entered.',
      'A receipt slip is created with its number. You can download its PDF and photograph the signed slip.',
      'After saving, warnings may appear: invoice already received, receipts above the invoice amount, items with no known price. A manager checks afterwards.'
    ],
    faq: [
      {
        q: 'No invoice is displayed.',
        a: 'Only invoices validated by accounting are offered. Use “Search all invoices” or ask for validation.'
      },
      { q: 'The connection was lost.', a: 'Your entries are kept. “Try again” does not create a duplicate.' },
      {
        q: 'A photo failed.',
        a: 'The operation is saved; the screen flags the photos not sent so that you retake them.'
      }
    ],
    permissions: { roles: ['Storekeeper'], feature: 'CONSTRUCTION', note: 'Requires “Receive”.' },
    related: [{ label: 'Receipt on computer', helpId: 'finance.stock.reception' }],
    keywords: ['receipt', 'delivery', 'delivery note', 'invoice', 'photo']
  },
  {
    id: 'finance.magasin.sortir',
    kind: 'section',
    title: 'Issue goods',
    summary:
      'The “Issue” action hands goods to a taker for a site: site, taker, items, photo, then a slip to be signed.',
    purpose:
      'The issue leaves from the current location. It is what charges the site: the material cost then enters the site cost.',
    steps: [
      { title: 'For which site?', detail: 'Only open sites are offered.' },
      {
        title: 'Who takes the goods?',
        detail:
          'A taker from the directory. “Add a recipient” if you have that right; “Enter a name without adding it to the register” unless your agency requires the directory.'
      },
      {
        title: 'Which items?',
        detail: 'For each item: the quantity (the available stock is recalled) and the site expense line, mandatory.'
      },
      { title: 'Photo', detail: 'Optional: the goods handed over.' },
      { title: 'Check', detail: 'Reread, change the date if needed, then “Save the issue”.' },
      { title: 'Have it signed', detail: 'Download the slip, have the taker sign it, then photograph it.' }
    ],
    consequences: [
      'The location stock goes down; a quantity above what is available is refused, and the item concerned is flagged.',
      'The cost is calculated at the average cost of the location and charged to the site on the chosen expense line. An accounting entry is posted for each valued line.',
      'The taker name is printed on the slip.',
      'On a location being counted, the available stock is not shown; the server refuses an excess.'
    ],
    faq: [
      { q: 'No site appears.', a: 'No open site is available, or the sites are closed.' },
      {
        q: 'No taker in the list.',
        a: 'The directory is empty. Ask an authorised person to fill it from the “Recipients” screen, or add one yourself with the right.'
      },
      {
        q: 'Why is the site expense line required?',
        a: 'To know on which site expense the issue is charged. It is never guessed.'
      }
    ],
    permissions: { roles: ['Storekeeper'], feature: 'CONSTRUCTION', note: 'Requires “Issue”.' },
    related: [
      { label: 'Issue on computer', helpId: 'finance.stock.sortie' },
      { label: 'Takers directory', helpId: 'finance.preneurs.page' }
    ],
    keywords: ['issue', 'issue slip', 'taker', 'site', 'site costing']
  },
  {
    id: 'finance.magasin.transferer',
    kind: 'section',
    title: 'Transfer to another location',
    summary:
      'The “Transfer” action moves goods from the current location to another: destination, item, quantity, requester, reason.',
    purpose:
      'Use it to supply a site from the store, bring a remainder back to the store, clear a site or rebalance two locations. A transfer moves stock without consuming it.',
    steps: [
      {
        title: 'To which location?',
        detail: 'A closed site location no longer receives goods; it is flagged.'
      },
      { title: 'Which item?', detail: 'One item per transfer.' },
      { title: 'Which quantity?', detail: 'The available stock of the origin location is recalled.' },
      {
        title: 'Who requests or takes it?',
        detail: 'A taker from the directory, or a free name if your agency allows it.'
      },
      {
        title: 'Why?',
        detail:
          'Mandatory reason: “Supplying a site”, “Return to the store”, “Clearing a site”, “Rebalancing between locations” or “Other” with a detail.'
      },
      { title: 'Check and save', detail: 'Optional photo, date, then “Save the transfer”.' }
    ],
    consequences: [
      'Stock goes down in the origin location and up in the destination location by the same value: the average cost of the origin location is used.',
      'No site charge and no accounting entry: only the issue charges.',
      'The transfer appears on two journal lines and has no numbered slip.'
    ],
    faq: [
      {
        q: 'I want to transfer several items.',
        a: 'A transfer covers a single item: start again with “New transfer”.'
      },
      {
        q: 'The destination site is closed.',
        a: 'It no longer receives goods. However, its remainder can still be cleared to another location.'
      },
      {
        q: 'Why is my current location not offered as the destination?',
        a: 'Only the other active locations are offered. If there is none, the screen shows “No other active location.”'
      }
    ],
    permissions: { roles: ['Storekeeper'], feature: 'CONSTRUCTION', note: 'Requires “Transfer”.' },
    related: [{ label: 'Movements journal', helpId: 'finance.stock.journal' }],
    keywords: ['transfer', 'move', 'supply a site', 'return to store', 'clearing']
  },
  {
    id: 'finance.magasin.compter',
    kind: 'section',
    title: 'Count the stock',
    summary:
      'The “Count” action opens a stocktake of the location, enters the quantities found, closes the count then justifies the differences.',
    purpose:
      'The count is blind: while it is open, expected quantities are not shown, so that everyone counts without being influenced.',
    steps: [
      { title: 'Start the stocktake', detail: 'Available if no stocktake is in progress at the location.' },
      {
        title: 'Count each item',
        detail: 'Choose the item in “To count”, enter the quantity found, or “Nothing found (0)”.'
      },
      { title: 'Recount if needed', detail: 'A new quantity replaces the previous one.' },
      {
        title: 'Close the count',
        detail: 'After closing, quantities can no longer be changed and differences are shown.'
      },
      {
        title: 'Justify the differences',
        detail: 'For each difference, “Justify” and choose a reason. A photo can be added.'
      }
    ],
    consequences: [
      'Items in stock that nobody counted appear as “not counted”: an authorised person must set them aside or have them recounted.',
      'The stock does not change at closing. It changes when an authorised person validates the stocktake: differences then become adjustments.',
      'During the count, the location quantity is hidden from anyone who does not validate stocktakes.'
    ],
    faq: [
      {
        q: 'Where do I validate the stocktake?',
        a: 'A person with the right “Approve stocktakes” does it from the Inventaire screen.'
      },
      { q: 'Why do I not see the expected stock?', a: 'That is the principle of blind counting, until closing.' },
      {
        q: 'Why is “Close the count” greyed out?',
        a: 'The button stays greyed out until at least one item has been counted. Count at least one item, then try again.'
      }
    ],
    permissions: {
      roles: ['Storekeeper', 'Site manager'],
      feature: 'CONSTRUCTION',
      note: 'Counting requires “Count”. Validating or abandoning requires “Approve stocktakes”.'
    },
    related: [{ label: 'The Inventaire screen', to: '/tenant/:tenantId/finance/stock/inventaire' }],
    keywords: ['stocktake', 'count', 'difference', 'blind count']
  },
  {
    id: 'finance.magasin.bon',
    kind: 'section',
    title: 'Slip (Magasin)',
    summary:
      'The slip opens full screen: type and number, dates, location, site, taker, invoice and items, with the PDF and attachments.',
    purpose:
      'It is the document to have signed or to find again. The Magasin screen shows no value there, only quantities.',
    steps: [
      { title: 'Read the slip', detail: 'Items are listed with their quantity and unit.' },
      { title: 'Download the PDF', detail: 'To have it signed or send it.' },
      { title: 'Attach a document', detail: 'Photo of the signed slip, of the delivery note or of the goods.' }
    ],
    consequences: [
      'Adding an attachment requires the right linked to the slip: “Receive” for a receipt, “Issue” for an issue, “Approve stocktakes” for a report.',
      'The recording time is the server time.'
    ],
    faq: [
      {
        q: 'This slip cannot be found.',
        a: 'It no longer exists or does not belong to your agency. Go back to the home screen.'
      },
      {
        q: 'Why does this slip show no amount?',
        a: 'The Store screen never shows values, only quantities. Values can be read on a computer, in the stock slip, if your rights allow it.'
      },
      {
        q: 'How do I get this slip signed?',
        a: 'Tap “Download the slip (PDF)” and have it signed. If your rights allow it, then attach a photo of the signed slip in the attachments.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires “View stock”.' },
    related: [{ label: 'The slip on computer', helpId: 'finance.stock.bon' }],
    keywords: ['slip', 'pdf', 'attachment', 'signed']
  },

  // ---------------------------------------------------------------------------
  // Takers
  // ---------------------------------------------------------------------------
  {
    id: 'finance.preneurs.page',
    kind: 'page',
    title: 'Takers',
    summary:
      'The takers directory lists the people who take the goods: team leaders, subcontractors. Issues and transfers are recorded in their name.',
    purpose:
      'Knowing who took what is the basis of stock control. The directory only keeps the name, the team or company and, if you wish, a phone number that you can erase. A taker is not deleted: it is deactivated.',
    steps: [
      {
        title: 'Add a taker',
        detail:
          'Button “Add a recipient”: name, team or company, optional phone, optional link with an employee or a subcontractor.'
      },
      {
        title: 'Search',
        detail: 'Type a name, a team, a phone or a linked person. “Status” filter: Active or Deactivated.'
      },
      { title: 'Correct', detail: '“Correct” edits the name, team, phone or link.' },
      {
        title: 'Deactivate or reactivate',
        detail: '“Deactivate” removes the taker from issue choices; “Re-enable” puts them back.'
      },
      {
        title: 'Erase the phone',
        detail: '“Erase the phone number” removes the number, the taker stays in the directory.'
      }
    ],
    consequences: [
      'The taker name is printed on issue slips. Inform the people concerned.',
      'Deactivating a taker prevents them from being chosen for a new issue; their past issues stay in their name.',
      'An active taker cannot have the same name as another one in the same team.',
      'Your agency can require a taker from the directory for every issue and every transfer.'
    ],
    faq: [
      {
        q: 'Can a taker be deleted?',
        a: 'No: it is deactivated, so that the issue history keeps the name.'
      },
      {
        q: 'Why do I not see the “Phone” column?',
        a: 'It is reserved for people who maintain the directory: the server does not return numbers to others.'
      },
      { q: 'I see no action buttons.', a: 'You need the right “Keep the register of recipients”.' },
      {
        q: 'What is the link with an employee or subcontractor for?',
        a: 'To connect the taker to a person already known to the agency. It is optional.'
      }
    ],
    permissions: {
      roles: ['Storekeeper'],
      feature: 'CONSTRUCTION',
      note: 'Reading the directory requires “View stock”; maintaining it requires “Keep the register of recipients”.'
    },
    related: [
      { label: 'Directory table', helpId: 'finance.preneurs.tableau' },
      { label: 'Record an issue', helpId: 'finance.stock.sortie' }
    ],
    keywords: ['taker', 'team leader', 'subcontractor', 'directory', 'who takes', 'issue responsible']
  },
  {
    id: 'finance.preneurs.tableau',
    kind: 'table',
    title: 'Takers directory',
    summary:
      'Each line is a taker, active or deactivated. The line buttons let you correct them, deactivate them or erase their phone.',
    howToRead: {
      columns: [
        { key: 'nom', label: 'Name', description: 'The full name of the taker, as printed on the slips.' },
        {
          key: 'equipe',
          label: 'Team or company',
          description: 'Their team or company, useful to tell apart two people with the same name.'
        },
        {
          key: 'telephone',
          label: 'Phone',
          description: 'Their number, visible only to those who maintain the directory.'
        },
        { key: 'lien', label: 'Linked to', description: 'The employee or subcontractor they are linked to, if any.' },
        {
          key: 'statut',
          label: 'Status',
          description: 'Active: can be chosen for an issue. Deactivated: no longer offered.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '“Correct”, “Deactivate” or “Re-enable”, and “Erase the phone number” when a number exists.'
        }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The taker can be chosen for an issue or a transfer.' },
        {
          value: 'INACTIVE',
          label: 'Deactivated',
          description: 'The taker is no longer offered. Their past issues stay in their name.'
        }
      ],
      notes: [
        'On a phone, the table becomes a list of cards; the first action is a button, the others are in a menu.',
        'The whole directory is loaded: search and filter work on the full list.'
      ]
    },
    steps: [
      { title: 'Find a taker', detail: 'Type part of their name or team.' },
      { title: 'See deactivated ones', detail: '“Status” filter then “Deactivated”.' }
    ],
    consequences: [
      'Deactivating and erasing the phone ask for confirmation. None of these actions deletes the taker.',
      'When an addition is refused because the name already exists, “View this recipient” reduces the list to the person already there.'
    ],
    faq: [
      {
        q: 'Why is “Erase the phone number” missing?',
        a: 'It only appears for a taker whose number is filled in.'
      },
      { q: 'Can the directory be exported?', a: 'Yes, with the table export button.' },
      { q: 'Does a deactivated taker come back?', a: 'Yes: “Re-enable” puts them back in the choices.' }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: '“Phone” and “Actions” columns reserved for the right “Keep the register of recipients”.'
    },
    related: [{ label: 'Add or correct a taker', helpId: 'finance.preneurs.formulaire' }],
    keywords: ['taker', 'deactivate', 'phone', 'team']
  },
  {
    id: 'finance.preneurs.formulaire',
    kind: 'section',
    title: 'Add or correct a taker',
    summary: 'This form records a new taker, or corrects an existing one. Enter only what is needed to recognise them.',
    purpose: 'The name is printed on issue slips. The team or company helps tell apart two people with the same name.',
    steps: [
      { title: 'Full name', detail: 'Mandatory, from 2 to 120 characters.' },
      { title: 'Team or company', detail: 'Optional.' },
      { title: 'Phone', detail: 'Optional, and erasable at any time from the directory.' },
      {
        title: 'Link to a person',
        detail: 'Optional: choose an employee or subcontractor already recorded, if the list is offered.'
      },
      { title: 'Save', detail: '“Add the recipient” or “Save the correction”.' }
    ],
    consequences: [
      'If an active taker already has this name in the same team, saving is refused and you can view or choose the existing person.',
      'A correction only changes the modified fields. A field you empty is erased.',
      'Correcting a name does not rewrite old slips: the journal keeps the name of the day of the movement and recalls the current name.'
    ],
    faq: [
      {
        q: 'Why is there no list of employees?',
        a: 'The list is only offered to people who maintain the directory, and only if active employees or subcontractors exist.'
      },
      { q: 'Must I enter a phone?', a: 'No, it is optional.' },
      {
        q: 'What should I do if the name is refused when I save?',
        a: 'An active taker already has this name in the same team. Use “View this recipient” to find the existing person, or tell them apart by team or company.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires “Keep the register of recipients”.' },
    related: [{ label: 'Takers directory', helpId: 'finance.preneurs.page' }],
    keywords: ['new taker', 'correct a taker', 'name', 'team']
  },

  // ---------------------------------------------------------------------------
  // Items and locations
  // ---------------------------------------------------------------------------
  {
    id: 'finance.articles-lieux.page',
    kind: 'page',
    title: 'Items and locations',
    summary:
      'Stock settings hold the items (cement, steel, sand…), the storage locations (stores and site locations) and the valuation method.',
    purpose:
      'This is the reference data on which receipts, issues and stocktakes rely. What is recorded here is never deleted: an item or a location is deactivated, and then keeps its stock and history.',
    steps: [
      {
        title: '“Items” tab',
        detail: 'Record and correct items: reference, description, unit, family, line proposed at issue.'
      },
      { title: '“Storage locations” tab', detail: 'Create stores and site locations.' },
      {
        title: '“Valuation method” tab',
        detail: 'Read the method in force and record the decision, with its reason.'
      },
      {
        title: 'Deactivate',
        detail:
          '“Deactivate” removes an item or a location from entry choices without erasing its history; “Re-enable” puts it back.'
      }
    ],
    consequences: [
      'No deletion exists, neither for an item nor for a location.',
      'Some fields are final: the reference of an item, the nature of a location and its site can no longer be corrected after saving.',
      'Changing the unit of an item converts no quantity already recorded.',
      'Without the right to configure the finance module, screens can be read but no write button appears.'
    ],
    faq: [
      {
        q: 'How do I correct the reference of an item?',
        a: 'It cannot be corrected: it is what is read on slips already printed. Deactivate the item and create another if needed.'
      },
      {
        q: 'Can I delete an unused item?',
        a: 'No. Deactivate it: it stops being offered and its history stays.'
      },
      {
        q: 'Can a site have two locations?',
        a: 'No, only one: two locations would split its stock into two balances.'
      },
      { q: 'I do not see “New item”.', a: 'You need the right “Configure the finance module”.' }
    ],
    permissions: {
      roles: ['Administrator'],
      feature: 'CONSTRUCTION',
      note: 'Reading requires “View stock”; creating, correcting, deactivating and deciding the method require “Configure the finance module”.'
    },
    related: [
      { label: 'Items', helpId: 'finance.articles-lieux.articles' },
      { label: 'Storage locations', helpId: 'finance.articles-lieux.lieux' },
      { label: 'Valuation method', helpId: 'finance.articles-lieux.valorisation' }
    ],
    keywords: ['reference data', 'item', 'location', 'store', 'settings', 'unit', 'valuation']
  },
  {
    id: 'finance.articles-lieux.articles',
    kind: 'section',
    title: 'Items',
    summary: 'The list of items the agency stocks. Each item has a reference, a description and a unit.',
    purpose:
      'The proposed cost line on issue of an item is only a suggestion: it will be preselected at an issue, and stay editable. The issue decides the line, never the item. The unit is free text: bag, tonne, bar, m³.',
    steps: [
      {
        title: 'Create an item',
        detail: '“New item”: reference, description, unit, family and proposed line (the last two optional).'
      },
      {
        title: 'Search and filter',
        detail: 'Free search, filters “Status”, “Unit”, “Family” and “Cost line suggested on issue”.'
      },
      {
        title: 'Correct',
        detail: '“Correct” edits the description, unit, family and proposed line.'
      },
      { title: 'Deactivate', detail: '“Deactivate” then “Confirm the deactivation”.' }
    ],
    consequences: [
      'Deactivating is not deleting: the item keeps its stock and history, it only stops being offered. A deactivated item can no longer be received.',
      'The reference can no longer be corrected once the item is saved.',
      'Changing the unit requires confirmation and converts no quantity.'
    ],
    faq: [
      {
        q: 'Must there always be a proposed line?',
        a: 'No, leaving it empty is a normal case: the line will be chosen at each issue.'
      },
      {
        q: 'Which unit should I choose?',
        a: 'The one in which you count: all quantities of the item will be counted in this unit.'
      },
      {
        q: 'How do I find a deactivated item?',
        a: 'Use the “Status” filter and choose “Inactive”. The “Re-enable” button makes it available again.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Writing: “Configure the finance module”.' },
    related: [{ label: 'Items table', helpId: 'finance.articles-lieux.articles.tableau' }],
    keywords: ['item', 'reference', 'unit', 'family', 'proposed line']
  },
  {
    id: 'finance.articles-lieux.articles.tableau',
    kind: 'table',
    title: 'Items table',
    summary: 'Each line is a stock item, with its unit, family and the expense line proposed at issue.',
    howToRead: {
      columns: [
        {
          key: 'reference',
          label: 'Reference',
          description: 'The item code, printed on slips. It no longer changes after saving.'
        },
        {
          key: 'designation',
          label: 'Description',
          description: 'The usual name of the item, for example “Ciment CPJ 42,5”.'
        },
        { key: 'unite', label: 'Unit', description: 'The counting unit: bag, tonne, bar, m³…' },
        {
          key: 'famille',
          label: 'Family',
          description: 'A free grouping, for example “Gros œuvre”. “Not provided” if empty.'
        },
        {
          key: 'poste',
          label: 'Line proposed at issue',
          description: 'The expense line preselected at an issue. A simple proposal, editable at each issue.'
        },
        {
          key: 'statut',
          label: 'Status',
          description: 'Active: offered for entry. Inactive: no longer offered, history kept.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '“Correct” and “Deactivate” or “Re-enable”. Column visible only if you can configure.'
        }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Active',
          description: 'The item is offered in receipts, issues and transfers.'
        },
        {
          value: 'INACTIVE',
          label: 'Inactive',
          description: 'The item is no longer offered; its stock and history are kept.'
        }
      ],
      notes: ['On a phone, the table becomes cards: “Correct” is the main button and “Deactivate” is in the menu.']
    },
    steps: [{ title: 'Find an item', detail: 'Search by reference, description or family.' }],
    consequences: ['The table is read without changing anything. Changes go through the forms.'],
    faq: [
      { q: 'Where is the delete button?', a: 'It does not exist: no item is deleted. Deactivate it.' },
      { q: 'The list is long.', a: 'It is paginated; use search and filters.' },
      {
        q: 'Can I put a deactivated item back into service?',
        a: 'Yes, with “Re-enable” in the “Actions” column, if you can configure. The item is offered again at data entry.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: '“Actions” column: “Configure the finance module”.' },
    related: [{ label: 'New item, correction', helpId: 'finance.articles-lieux.article-formulaire' }],
    keywords: ['item list', 'reference', 'description', 'inactive']
  },
  {
    id: 'finance.articles-lieux.article-formulaire',
    kind: 'section',
    title: 'Create or correct an item',
    summary:
      'This form records a new item or corrects an existing one. The reference, however, can no longer be corrected.',
    purpose:
      'Choose the reference and the unit well at creation: one is read on slips, the other sets the unit of all quantities.',
    steps: [
      {
        title: 'Reference',
        detail: 'Mandatory at creation, for example “CIM-42”. It will no longer be correctable.'
      },
      { title: 'Description', detail: 'The usual name of the item.' },
      { title: 'Unit', detail: 'Free text: bag, tonne, bar, m³.' },
      { title: 'Family', detail: 'Optional. When correcting, emptying the field erases the family.' },
      {
        title: 'Line proposed at issue',
        detail: 'Optional. A simple proposal, editable at each issue.'
      },
      { title: 'Save', detail: '“Save the item” or “Save the correction”.' }
    ],
    consequences: [
      'If you change the unit of an item, a warning appears and an “I understand” box is mandatory: quantities already recorded are not converted and would change meaning. Do it only to repair an entry mistake.',
      'The reference is shown read-only during correction.',
      'A deactivated expense line is refused.'
    ],
    faq: [
      {
        q: 'I got the unit wrong.',
        a: 'You can correct it, but check afterwards with a stocktake, because past quantities are not converted.'
      },
      {
        q: 'I got the reference wrong.',
        a: 'It cannot be corrected. Deactivate the item and create a new one.'
      },
      {
        q: 'Why is saving the item refused?',
        a: 'The reference, the description and the unit are mandatory when creating an item. Fill in these three fields.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires “Configure the finance module”.' },
    related: [{ label: 'Items', helpId: 'finance.articles-lieux.articles' }],
    keywords: ['new item', 'correct item', 'unit', 'reference']
  },
  {
    id: 'finance.articles-lieux.lieux',
    kind: 'section',
    title: 'Storage locations',
    summary: 'Storage locations are the places where the stock is: agency stores and site locations.',
    purpose:
      'A store is an agency location. A site location is attached to a site, and a site has only one: two locations would split its stock into two balances, neither of which would tell the truth.',
    steps: [
      {
        title: 'Create a location',
        detail: '“New storage location”: nature, label and, for a site location, the site.'
      },
      { title: 'Search and filter', detail: 'Free search, filters “Nature” and “Status”.' },
      { title: 'Correct the label', detail: '“Correct the label”: only the label changes.' },
      { title: 'Deactivate', detail: '“Deactivate” then “Confirm the deactivation”.' }
    ],
    consequences: [
      'The nature and site of a location can no longer be corrected: a store that became a site location would carry a stock that was never there.',
      'Deactivating is not deleting: the location keeps its stock and history, it stops being offered.',
      'A location with a stocktake in progress or closed cannot be deactivated: finish or abandon the stocktake first.'
    ],
    faq: [
      {
        q: 'Can I turn a store into a site location?',
        a: 'No. Create a new location of the right nature.'
      },
      {
        q: 'Why is my site not offered?',
        a: 'It may already have a storage location, or no site is available.'
      },
      {
        q: 'Can I delete a location?',
        a: 'No, a location cannot be deleted. Deactivate it: it keeps its stock and its history.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Writing: “Configure the finance module”.' },
    related: [{ label: 'Locations table', helpId: 'finance.articles-lieux.lieux.tableau' }],
    keywords: ['store', 'site location', 'warehouse', 'depot']
  },
  {
    id: 'finance.articles-lieux.lieux.tableau',
    kind: 'table',
    title: 'Storage locations table',
    summary: 'Each line is a location: store or site location, with its status and any stocktake in progress.',
    howToRead: {
      columns: [
        {
          key: 'libelle',
          label: 'Label',
          description: 'The name of the location, for example “Magasin central d’Angré”.'
        },
        { key: 'nature', label: 'Nature', description: '“Store” or “Site location”.' },
        {
          key: 'chantier',
          label: 'Site',
          description: 'The site to which a site location is attached. A dash for a store.'
        },
        {
          key: 'statut',
          label: 'Status',
          description:
            'Active or Inactive, with a “Count in progress” or “Count closed” tag if a stocktake covers the location.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '“Correct the label” and “Deactivate” or “Re-enable”, if you can configure.'
        }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Active',
          description: 'The location is offered for receiving, issuing and counting.'
        },
        {
          value: 'INACTIVE',
          label: 'Inactive',
          description: 'The location is no longer offered; its stock and history remain.'
        }
      ],
      notes: ['Count tags are those of the stocktake: “Count in progress” or “Count closed”.']
    },
    steps: [{ title: 'See site locations', detail: '“Nature” filter then “Site location”.' }],
    consequences: ['Read-only: changes go through the forms and ask for confirmation.'],
    faq: [
      {
        q: 'Why is “Deactivate” refused?',
        a: 'The location has a stocktake in progress: finish or abandon it first. The server message says so.'
      },
      { q: 'Does a deactivated location keep its stock?', a: 'Yes, and its history too.' },
      { q: 'How do I see only the site locations?', a: 'Use the “Nature” filter and choose “Site location”.' }
    ],
    permissions: { feature: 'CONSTRUCTION', note: '“Actions” column: “Configure the finance module”.' },
    related: [{ label: 'New location, correction', helpId: 'finance.articles-lieux.lieu-formulaire' }],
    keywords: ['locations', 'stores', 'status', 'count in progress']
  },
  {
    id: 'finance.articles-lieux.lieu-formulaire',
    kind: 'section',
    title: 'Create or correct a location',
    summary: 'This form creates a storage location or corrects its label. The nature and the site are final.',
    purpose: 'Choose the nature before saving: it will no longer be correctable.',
    steps: [
      { title: 'Location nature', detail: '“Store” (store) or “Site location”.' },
      { title: 'Label', detail: 'The name of the location, for example “Magasin central d’Angré”.' },
      {
        title: 'Site',
        detail: 'Mandatory for a site location only. It will no longer be correctable.'
      },
      { title: 'Save', detail: '“Save the location” or “Save the label”.' }
    ],
    consequences: [
      'If the chosen site already has a storage location, saving is refused: a site has only one.',
      'When correcting, only the label changes. Neither the nature nor the site can be modified.'
    ],
    faq: [
      {
        q: 'The site selector does not appear.',
        a: 'It only exists for the nature “Site location”.'
      },
      { q: 'Can I rename a location?', a: 'Yes, with “Correct the label”.' },
      {
        q: 'Why is saving the location refused?',
        a: 'The label is mandatory, and so is the site for a site location. If that site already has a storage location, saving is refused: a site can only have one.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Requires “Configure the finance module”.' },
    related: [{ label: 'Storage locations', helpId: 'finance.articles-lieux.lieux' }],
    keywords: ['new location', 'correct location', 'nature', 'site']
  },
  {
    id: 'finance.articles-lieux.valorisation',
    kind: 'section',
    title: 'Valuation method',
    summary:
      'This tab shows how the stock is valued: the weighted average cost. It keeps the date and the reason of the decision.',
    purpose:
      'The weighted average cost is the only method available. Each receipt recalculates the average cost of the location, and each issue leaves at the average cost of the moment. This action records the decision, its date and its reason; it therefore does not change the method.',
    steps: [
      {
        title: 'Read the decision in force',
        detail:
          'The method, the date it was set and the reason. With no decision recorded, the weighted average cost applies by default.'
      },
      { title: 'Record the decision', detail: 'Write the “Reason for the decision”.' },
      {
        title: 'Save',
        detail: '“Save the decision”: the button stays greyed out while the reason is empty.'
      }
    ],
    consequences: [
      'The reason is mandatory: it will let people know later why the figures were read this way.',
      'Recording the decision changes neither the quantities nor the stock values.'
    ],
    faq: [
      {
        q: 'Can another method (FIFO, standard cost) be chosen?',
        a: 'No, only the weighted average cost exists today.'
      },
      {
        q: 'Why is this form absent?',
        a: 'It requires the right “Configure the finance module”.'
      },
      {
        q: 'Why is “Save the decision” greyed out?',
        a: 'The reason is mandatory: the button stays greyed out while “Reason for the decision” is empty.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Writing: “Configure the finance module”.' },
    related: [{ label: 'Stock status', helpId: 'finance.stock.etat' }],
    keywords: ['weighted average cost', 'valuation', 'decision', 'method', 'wac']
  }
];

export default entries;
