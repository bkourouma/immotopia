import type { HelpEntry } from '../../../types';

/** Zone « chantiers » du module finance (en). */
const entries: HelpEntry[] = [
  {
    id: 'finance.chantiers.page',
    kind: 'page',
    title: 'Site list',
    summary:
      "This is where you find all your agency's construction sites, with their area, property, status and actual cost. It is the starting point to create a site and open its page.",
    purpose:
      'A site gathers all the expenses of a building operation: supplier invoices, cash vouchers, salaries, subcontractor statements, stock issues and land rent. It can be created without a property, for example on a leased plot.',
    steps: [
      {
        title: 'Create a site',
        detail: 'Click "New site", fill in the form, then "Create the site".'
      },
      {
        title: 'Search',
        detail: 'Type a name, an area, a property or a manager in the search field.'
      },
      {
        title: 'Filter',
        detail: 'Narrow the list with the Status, Property and Actual cost filters.'
      },
      {
        title: 'Open a site',
        detail: 'Click "View details" (or the card, on a phone) to open its page.'
      },
      {
        title: 'Export',
        detail: 'The "Export" button exports every site matching your filters, not only the page shown.'
      }
    ],
    consequences: [
      'Creating a site posts no accounting entry and notifies nobody. The site starts as "Scheduled", with an actual cost of 0 FCFA.',
      'Depending on your subscription, the number of open sites may be limited: creation is then refused with a message.',
      "A site's budget, stock and closing are managed on their own screens afterwards."
    ],
    faq: [
      {
        q: 'Why is my site "No property (leased plot)"?',
        a: 'The property is optional at creation: a site can start on a leased plot where no property exists yet in the portfolio.'
      },
      {
        q: 'How do I change the actual cost?',
        a: 'It cannot be typed in: it is the sum of the validated expenses allocated to the site. To change it, validate or correct the source document.'
      },
      {
        q: "Where can I see a site's budget?",
        a: 'From the site dashboard, with the "View the budget" button on the site\'s row.'
      },
      {
        q: 'I cannot see "New site". Why?',
        a: 'This action requires the "Manage construction sites" right. Ask your agency administrator.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing requires "View third-party accounts"; creating a site requires "Manage construction sites".'
    },
    related: [
      {
        label: 'How to read the site table',
        helpId: 'finance.chantiers.tableau'
      },
      {
        label: 'Site dashboard',
        helpId: 'finance.tableau-de-bord-chantiers.page'
      }
    ],
    keywords: ['site', 'sites', 'construction', 'project', 'works', 'leased plot', 'actual cost', 'new site']
  },
  {
    id: 'finance.chantiers.tableau',
    kind: 'table',
    title: 'Site table',
    summary:
      "Each row is one of your agency's sites. The table shows its area, property, manager, status and actual cost.",
    howToRead: {
      columns: [
        {
          key: 'nom',
          label: 'Site',
          description: "The site's name."
        },
        {
          key: 'zone',
          label: 'Area',
          description: 'The neighbourhood or area entered at creation. A dash (—) means no area is recorded.'
        },
        {
          key: 'bien',
          label: 'Property',
          description: 'The property linked to the site. "No property (leased plot)" means none is linked.'
        },
        {
          key: 'responsable',
          label: 'Person responsible',
          description:
            'The person in charge of the site. This screen cannot set it: a dash (—) means no manager is recorded.'
        },
        {
          key: 'statut',
          label: 'Status',
          description: "The site's state (see the statuses below)."
        },
        {
          key: 'cout',
          label: 'Actual cost',
          description:
            'The sum of the validated, non-cancelled expenses allocated to the site, in FCFA. It is calculated by the application, never typed in.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"View details" opens the site page.'
        }
      ],
      statuses: [
        {
          value: 'PLANNED',
          label: 'Scheduled',
          description: 'The status of a site that has just been created.'
        },
        {
          value: 'IN_PROGRESS',
          label: 'In progress',
          description: 'An active site. A site reopened after closing goes back to "In progress".'
        },
        {
          value: 'SUSPENDED',
          label: 'Suspended',
          description: 'A site put on hold. It still receives its share of the rent of the plot it is linked to.'
        },
        {
          value: 'CLOSED',
          label: 'Closed',
          description: 'A closed site: its cost is frozen and it accepts no further expense.'
        }
      ],
      notes: [
        'The search covers name, area, property and manager. The filters are Status, Property and Actual cost (minimum and maximum, in FCFA).',
        'All statuses are listed, closed sites included: use the Status filter to hide them.'
      ]
    },
    steps: [
      {
        title: 'Open a site',
        detail: 'Click "View details" at the right of the row.'
      }
    ],
    faq: [
      {
        q: 'What does the actual cost contain?',
        a: "The site's validated allocations: supplier invoices, cash vouchers, salary notes, subcontractor statements, stock issues and land rent."
      },
      {
        q: 'Why did the actual cost not move after my invoice?',
        a: 'A draft document does not count: the actual cost only changes when the document is validated.'
      },
      {
        q: 'Does a closed site stay in the list?',
        a: 'Yes. Its actual cost is then frozen.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing this screen requires the "View third-party accounts" right.'
    },
    related: [
      {
        label: 'Site page',
        helpId: 'finance.chantier.page'
      }
    ],
    keywords: ['actual cost', 'status', 'area', 'manager', 'site list']
  },
  {
    id: 'finance.chantiers.nouveau',
    kind: 'section',
    title: 'New site',
    summary: 'This form creates a site. Only the name is required: the area, property and dates are optional.',
    steps: [
      {
        title: 'Site name',
        detail: 'Required. For example "Duplex villa — Angré Centre".'
      },
      {
        title: 'Area',
        detail: 'Optional. The neighbourhood or town, for example "Angré, Cocody".'
      },
      {
        title: 'Property',
        detail: 'Optional. Type the title of a property to search for it; leave empty for a site on a leased plot.'
      },
      {
        title: 'Start and Planned end',
        detail: 'Optional. The planned end date cannot be before the start date.'
      },
      {
        title: 'Create',
        detail: 'Click "Create the site": you land on the new site\'s page.'
      }
    ],
    consequences: [
      'The site is created as "Scheduled". If you leave the start date empty, today\'s date is used.',
      'No accounting entry is posted and nobody is notified.',
      'The person responsible cannot be chosen in this form.',
      'If your subscription limits the number of open sites and the limit is reached, creation is refused with a message.'
    ],
    faq: [
      {
        q: 'Can I create a site without a property?',
        a: 'Yes. This is the case of a site on a leased plot: leave the "Property" field empty.'
      },
      {
        q: 'Why does "Create the site" show an error?',
        a: "The site name is required. Another message may come from your subscription's limit."
      },
      {
        q: 'Where do I enter the budget?',
        a: 'Not here: the budget is set on its own screen, reached from the site dashboard.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'CONSTRUCTION',
      note: 'Creating a site requires the "Manage construction sites" right.'
    },
    related: [
      {
        label: 'Site list',
        helpId: 'finance.chantiers.page'
      }
    ],
    keywords: ['create a site', 'new site', 'add a site', 'leased plot']
  },
  {
    id: 'finance.chantier.page',
    kind: 'page',
    title: 'Site page',
    summary:
      "The page brings together the site's actual cost, its progress and every expense allocated to it, by cost line and then document by document. No amount is typed in here.",
    purpose:
      'Every validated supplier invoice, validated cash voucher, salary note, subcontractor statement, stock issue or land rent is allocated to a cost line of the site. The page adds up these allocations: that is the actual cost.',
    steps: [
      {
        title: 'Read the figures',
        detail: 'The four cards at the top give the actual cost, progress, start and planned end (or closing date).'
      },
      {
        title: 'See the cost lines',
        detail: 'The "Subtotals by cost line" tab adds up expenses line by line.'
      },
      {
        title: 'See the documents',
        detail: 'The "Cost allocations" tab lists each expense with its date, cost line, nature and source document.'
      },
      {
        title: 'Enter a cash expense',
        detail: '"New cash voucher" opens the cash desk with this site already chosen.'
      },
      {
        title: 'Go further',
        detail: 'The "Units and closing" and "Site stock" actions open the matching screens.'
      }
    ],
    consequences: [
      'The page is read-only: nothing is changed here.',
      'A closed site accepts no further expense: "New cash voucher" is then greyed out, and you must reopen the site first.'
    ],
    faq: [
      {
        q: 'Why does my invoice not appear?',
        a: 'Only validated, non-cancelled expenses are allocated. A draft invoice does not appear.'
      },
      {
        q: 'How do I correct the actual cost?',
        a: 'It cannot be corrected by hand: act on the source document, then the cost updates.'
      },
      {
        q: "Where is this site's budget?",
        a: 'In the site dashboard, with the "View the budget" button.'
      },
      {
        q: 'What does "Moved to stock on …" mean?',
        a: 'Since that date, material invoices no longer enter the cost directly: see the "Site stock" screen.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing this screen requires the "View third-party accounts" right.'
    },
    related: [
      {
        label: "The site's figures",
        helpId: 'finance.chantier.indicateurs'
      },
      {
        label: 'Site units and closing',
        helpId: 'finance.cloture-chantier.page'
      },
      {
        label: 'Site stock',
        helpId: 'finance.stock-chantier.page'
      }
    ],
    keywords: ['site', 'site page', 'actual cost', 'allocation', 'site expenses', 'progress']
  },
  {
    id: 'finance.chantier.indicateurs',
    kind: 'section',
    title: "The site's figures",
    summary:
      'Four cards summarise the site: actual cost, progress, start, and planned end (or closing date). None can be typed in.',
    howToRead: {
      notes: [
        'Actual cost: the sum of the expenses allocated to the site, validated and not cancelled. A draft or cancelled document does not enter it. It is the same figure as in the site list.',
        'Progress: the percentage of the latest progress entry recorded for the site (0% if there is none). This screen cannot record one.',
        'Start: the start date of the site. Planned end: the date given at creation, or a dash (—) if empty.',
        'On a closed site, the last card becomes "Closed on" and gives the closing date.'
      ]
    },
    faq: [
      {
        q: 'Why does progress not change?',
        a: 'It takes the latest progress entry recorded. This screen does not modify it.'
      },
      {
        q: 'Does the actual cost include what is ordered but not yet invoiced?',
        a: 'No. The actual cost only counts validated expenses. Issued purchase orders appear in the budget\'s "Committed".'
      },
      {
        q: 'Does the actual cost change if the site moves to stock?',
        a: 'Going forward yes: material invoices no longer enter it directly; the stock issue does.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing this screen requires the "View third-party accounts" right.'
    },
    related: [
      {
        label: 'Site cost allocations',
        helpId: 'finance.chantier.imputations'
      },
      {
        label: 'Subtotals by cost line',
        helpId: 'finance.chantier.postes'
      }
    ],
    keywords: ['actual cost', 'progress', 'planned end', 'indicators']
  },
  {
    id: 'finance.chantier.postes',
    kind: 'table',
    title: 'Subtotals by cost line',
    summary:
      "This table adds up the site's expenses cost line by cost line (masonry, electrics, etc.). The total of these subtotals is the actual cost.",
    howToRead: {
      columns: [
        {
          key: 'poste',
          label: 'Cost line',
          description: 'The cost line to which the documents are allocated.'
        },
        {
          key: 'montant',
          label: 'Subtotal',
          description: 'The sum of the validated, non-cancelled allocations of this cost line, in FCFA.'
        }
      ],
      notes: [
        'A cost line only appears if it has at least one allocation. Cost lines follow the order set in your cost-line plan.',
        'To compare a cost line with its budget, also read the "Budget lines" tab of the Budget screen: planned amounts are by cost line there too. The committed amount is only calculated for the whole site.'
      ]
    },
    faq: [
      {
        q: 'Why is a cost line missing?',
        a: 'No validated expense is allocated to it yet.'
      },
      {
        q: 'Can the table be exported?',
        a: 'Yes, with the "Export" button.'
      },
      {
        q: 'How do I see the detail of a cost line?',
        a: 'Open the "Cost allocations" tab and filter on the cost line.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing this screen requires the "View third-party accounts" right.'
    },
    related: [
      {
        label: 'Site cost allocations',
        helpId: 'finance.chantier.imputations'
      },
      {
        label: 'Site budget',
        helpId: 'finance.budget-chantier.page'
      }
    ],
    keywords: ['cost line', 'subtotal', 'by cost line', 'expense breakdown']
  },
  {
    id: 'finance.chantier.imputations',
    kind: 'table',
    title: 'Site cost allocations',
    summary:
      'Each row is a validated expense allocated to the site, with its date, cost line, nature and the document it comes from.',
    howToRead: {
      columns: [
        {
          key: 'date',
          label: 'Date',
          description: 'The date of the source document (for example the invoice date, or the month of the land rent).'
        },
        {
          key: 'poste',
          label: 'Cost line',
          description: 'The cost line the expense is allocated to.'
        },
        {
          key: 'nature',
          label: 'Nature',
          description:
            'The type of document: Supplier invoice, Supplier payment, Cash voucher, Salary note, Subcontractor statement, Stock issue or Ground rent.'
        },
        {
          key: 'piece',
          label: 'Source document',
          description:
            'A readable label of the document (supplier, reference, month and plot…), not a technical number.'
        },
        {
          key: 'montant',
          label: 'Amount',
          description: 'The amount allocated to the site, in FCFA.'
        }
      ],
      notes: [
        'Only validated, non-cancelled allocations are listed: a draft or cancelled document does not appear.',
        'Filters: free text (cost line, nature, document), Nature, Cost line, Date and Amount. The export covers all filtered rows.'
      ]
    },
    faq: [
      {
        q: 'Why does an expense not appear?',
        a: 'Its document may still be a draft, or cancelled.'
      },
      {
        q: 'What does "Ground rent" mean?',
        a: "The share of a leased plot's rent posted each month and allocated to the sites linked to the lease."
      },
      {
        q: 'Can the same amount be counted twice?',
        a: 'The actual cost adds each allocation only once. An invoice matched to a purchase order is only counted when it is validated.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing this screen requires the "View third-party accounts" right.'
    },
    related: [
      {
        label: 'Subtotals by cost line',
        helpId: 'finance.chantier.postes'
      }
    ],
    keywords: ['allocation', 'expense', 'document', 'nature', 'invoice', 'cash voucher']
  },
  {
    id: 'finance.budget-chantier.page',
    kind: 'page',
    title: 'Site budget',
    summary:
      "Set the site's planned budget here by cost line, approve it, then change it through variations. The Actual and Committed cards let you compare it with spending.",
    purpose:
      'The budget sets the planned envelope for each cost line. Once approved, it takes no new line: any change goes through a variation, which adds or removes an amount on a cost line. It is reached from the site dashboard ("View the budget").',
    steps: [
      {
        title: 'Set the budget',
        detail:
          'With no budget yet, give it a name, add one line per cost line (cost line, label, amount), then "Create the budget". It is created as a draft.'
      },
      {
        title: 'Approve the budget',
        detail: 'Check the lines, then "Approve the budget" and confirm.'
      },
      {
        title: 'Follow the figures',
        detail: 'The cards give the initial budget, the revised budget, the actual and the committed amounts.'
      },
      {
        title: 'Change it through a variation',
        detail:
          '"Variations" tab: "New variation" (reason, cost line, increase or decrease), then "Approve" the variation.'
      }
    ],
    consequences: [
      'Approving a budget cannot be undone: it takes no further line, and a site has only one approved budget.',
      'Approving a variation cannot be undone: its amount is added to the revised budget. A draft variation does not count.',
      'The budget and variations are forecasts: they post no accounting entry and notify nobody.',
      'Once the budget is created, its lines can no longer be edited from this screen.'
    ],
    faq: [
      {
        q: 'How do I compare the budget with spending, cost line by cost line?',
        a: 'The budget has amounts per cost line ("Budget lines" tab); the site page has the actual per cost line ("Subtotals by cost line"). The committed amount is only calculated for the whole site.'
      },
      {
        q: 'Why is a variation refused?',
        a: 'Only an approved budget can receive a variation: approve the budget first.'
      },
      {
        q: 'What if a budget line is wrong?',
        a: 'If the budget is approved, correct it with a variation (a positive or negative amount on the cost line).'
      },
      {
        q: 'Why does the site show "No budget" on the dashboard?',
        a: 'The dashboard only reads the approved budget: a draft budget does not count there.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing requires "View third-party accounts"; creating a budget and entering a variation require "Manage construction sites"; approving a budget or a variation requires "Validate financial documents".'
    },
    related: [
      {
        label: 'Initial and revised budget',
        helpId: 'finance.budget-chantier.budget-revise'
      },
      {
        label: 'Committed and actual',
        helpId: 'finance.budget-chantier.engage-realise'
      },
      {
        label: 'Site dashboard',
        helpId: 'finance.tableau-de-bord-chantiers.page'
      }
    ],
    keywords: ['budget', 'site budget', 'variation', 'forecast', 'cost line', 'envelope', 'overrun']
  },
  {
    id: 'finance.budget-chantier.budget-revise',
    kind: 'section',
    title: 'Initial and revised budget',
    summary:
      'The initial budget is the total of the budget lines. The revised budget adds the approved variations to it; it is the one that counts once a variation has been approved.',
    howToRead: {
      notes: [
        'Initial budget = sum of the planned amounts of all budget lines.',
        'Revised budget = initial budget + sum of the amounts (increase or decrease) of approved variations only. Draft variations do not count. With no approved variation, the two are equal.',
        'The site dashboard measures the variance against the revised budget, never the initial one.',
        'Amounts are in FCFA. They are calculated by the application, never typed into these cards.'
      ]
    },
    faq: [
      {
        q: 'Why did the revised budget not change after my variation?',
        a: 'A variation only counts once approved. Approve it from the "Variations" tab.'
      },
      {
        q: 'Can the revised budget go down?',
        a: 'Yes: a variation can carry a negative amount, for example to remove part of an envelope.'
      },
      {
        q: 'Does the initial budget change with variations?',
        a: 'No. It stays the total of the lines set at creation.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing this screen requires the "View third-party accounts" right.'
    },
    related: [
      {
        label: 'Budget lines',
        helpId: 'finance.budget-chantier.lignes'
      },
      {
        label: 'Budget variations',
        helpId: 'finance.budget-chantier.avenants'
      }
    ],
    keywords: ['initial budget', 'revised budget', 'variation', 'envelope']
  },
  {
    id: 'finance.budget-chantier.engage-realise',
    kind: 'section',
    title: 'Committed and actual',
    summary:
      'The actual is what has been spent and validated. The committed amount adds what is ordered but not yet invoiced.',
    howToRead: {
      notes: [
        'Actual = sum of the expenses allocated to the site, validated and not cancelled (supplier invoices, cash vouchers, salaries, subcontractor statements, stock issues, land rent). It is the "Actual cost" on the site page.',
        'Committed = actual + remaining to invoice on issued purchase orders. The remaining to invoice of an order is its total amount minus the validated invoices linked to that order, never below zero.',
        'A draft or cancelled purchase order commits nothing. An invoice matched to an order is therefore not counted twice: it leaves the remaining to invoice and enters the actual.',
        'Committed is always greater than or equal to actual. Both figures cover the whole site: no screen gives them per cost line.',
        'These cards only appear when the figure could be read.'
      ]
    },
    faq: [
      {
        q: 'Why is the committed amount higher than the actual?',
        a: 'Issued purchase orders are not yet, or not fully, invoiced: their remaining to invoice is already counted.'
      },
      {
        q: 'When is a threshold alert evaluated?',
        a: 'When a supplier invoice or a cash voucher is validated, and when a purchase order is issued. It compares the committed amount with the revised budget.'
      },
      {
        q: 'Is the budget exceeded when the actual exceeds the budget?',
        a: 'The dashboard compares the committed amount (not the actual alone) with the revised budget: the variance is the revised budget minus the committed amount.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing this screen requires the "View third-party accounts" right.'
    },
    related: [
      {
        label: 'Subtotals by cost line',
        helpId: 'finance.chantier.postes'
      },
      {
        label: 'How to read the dashboard',
        helpId: 'finance.tableau-de-bord-chantiers.tableau'
      }
    ],
    keywords: ['committed', 'actual', 'purchase order', 'remaining to invoice', 'expense', 'actual cost']
  },
  {
    id: 'finance.budget-chantier.creation',
    kind: 'section',
    title: 'Setting the budget',
    summary:
      'When the site has no budget, this form lets you build it line by line. It is the only time lines are added.',
    steps: [
      {
        title: 'Budget name',
        detail: 'Required, for example "Initial budget 2026".'
      },
      {
        title: 'Cost line',
        detail: 'Choose a cost line among the active ones.'
      },
      {
        title: 'Label',
        detail: 'Describe the line. It is required.'
      },
      {
        title: 'Amount',
        detail:
          'Enter the "Planned amount", or fill in "Quantity" and "Unit price": the planned amount then becomes their product and can no longer be typed.'
      },
      {
        title: 'Add or remove',
        detail: '"Add a line" for another cost line; the bin removes a line (at least one is needed).'
      },
      {
        title: 'Create',
        detail: '"Create the budget" is enabled when every line has a cost line, a label and an amount above zero.'
      }
    ],
    consequences: [
      'The budget is created as a draft: it does not yet count on the dashboard, you must approve it.',
      'A cost line can only carry one line in a budget: the application refuses otherwise.',
      'Once the budget is created, no line can be added or edited from this screen.',
      'No accounting entry is posted.'
    ],
    faq: [
      {
        q: 'Must I fill in quantity and unit price?',
        a: 'No. For a miscellaneous-costs envelope, enter the planned amount directly.'
      },
      {
        q: 'Why is "Create the budget" greyed out?',
        a: 'The budget name is empty, or a line has no cost line, label or positive amount.'
      },
      {
        q: 'Can I correct an amount after creation?',
        a: 'Not from this screen. Once approved, a correction goes through a variation.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'CONSTRUCTION',
      note: 'Creating a budget requires the "Manage construction sites" right.'
    },
    related: [
      {
        label: 'Approve the budget',
        helpId: 'finance.budget-chantier.validation'
      }
    ],
    keywords: ['create a budget', 'budget line', 'cost line', 'planned amount', 'quantity', 'unit price']
  },
  {
    id: 'finance.budget-chantier.validation',
    kind: 'section',
    title: 'Approve the budget',
    summary:
      'Approving the budget makes it final: it takes no further line. Only a variation can change it afterwards.',
    steps: [
      {
        title: 'Check',
        detail: 'Re-read the "Budget lines" tab: cost lines, labels, amounts.'
      },
      {
        title: 'Approve',
        detail: 'Click "Approve the budget", read the warning, then "Confirm the approval".'
      }
    ],
    consequences: [
      'Approval cannot be undone: the budget takes no new line.',
      'A site has only one approved budget: it is not replaced, it is amended.',
      'After approval, the screen shows "Approved by … on …" and the budget counts on the site dashboard.',
      'No accounting entry is posted and nobody is notified.'
    ],
    faq: [
      {
        q: 'Can I undo an approval?',
        a: 'No. To change the budget, enter then approve a variation.'
      },
      {
        q: 'Who can approve?',
        a: 'A user with the "Validate financial documents" right, usually the agency administrator.'
      },
      {
        q: 'What about alerts?',
        a: 'An overrun alert can only exist on an approved budget: it is evaluated afterwards, when an expense is validated or a purchase order is issued.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'CONSTRUCTION',
      note: 'Approving a budget requires the "Validate financial documents" right.'
    },
    related: [
      {
        label: 'Budget variations',
        helpId: 'finance.budget-chantier.avenants'
      }
    ],
    keywords: ['approve the budget', 'approval', 'irreversible', 'approved budget']
  },
  {
    id: 'finance.budget-chantier.lignes',
    kind: 'table',
    title: 'Budget lines',
    summary: 'Each line is an amount planned for a cost line. Their total is the initial budget.',
    howToRead: {
      columns: [
        {
          key: 'poste',
          label: 'Cost line',
          description: 'The cost line the budget line relates to.'
        },
        {
          key: 'libelle',
          label: 'Label',
          description: 'The description of the line.'
        },
        {
          key: 'quantite',
          label: 'Quantity',
          description: 'The planned quantity. An empty cell means the line was entered directly as an amount.'
        },
        {
          key: 'prix-unitaire',
          label: 'Unit price',
          description: 'The price of one unit, in FCFA. Empty if the line was entered directly as an amount.'
        },
        {
          key: 'montant',
          label: 'Planned amount',
          description: 'The planned amount in FCFA. When quantity and unit price are filled in, it is their product.'
        }
      ],
      notes: [
        'Filters: free text (cost line, label) and Cost line.',
        'Lines no longer change once the budget is created: only variations change it, and they do not add a line here.'
      ]
    },
    faq: [
      {
        q: 'Why are quantity and unit price empty?',
        a: 'The line was entered as a direct amount, for example for a miscellaneous-costs envelope.'
      },
      {
        q: 'Do variations change this table?',
        a: 'No. Their amounts appear in the "Variations" tab and in the revised budget.'
      },
      {
        q: 'How do I compare a line with actual spending?',
        a: 'See the subtotal of the same cost line on the site page, "Subtotals by cost line" tab.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing this screen requires the "View third-party accounts" right.'
    },
    related: [
      {
        label: 'Subtotals by cost line',
        helpId: 'finance.chantier.postes'
      }
    ],
    keywords: ['budget lines', 'planned amount', 'cost line', 'quantity', 'unit price']
  },
  {
    id: 'finance.budget-chantier.avenants',
    kind: 'table',
    title: 'Budget variations',
    summary:
      'Each row is a variation: a change to the approved budget, with its reason and its total amount (increase or decrease).',
    howToRead: {
      columns: [
        {
          key: 'date',
          label: 'Date',
          description: "The variation's date."
        },
        {
          key: 'motif',
          label: 'Reason',
          description: 'The reason for the variation, for example "Rise in the price of cement".'
        },
        {
          key: 'saisi',
          label: 'Entered by',
          description: 'The person who entered the variation.'
        },
        {
          key: 'ecart',
          label: 'Variance',
          description: "The total of the variation's lines, signed: + for a budget increase, − for a decrease."
        },
        {
          key: 'statut',
          label: 'Status',
          description: 'Draft or Approved.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Approve" appears on a draft variation.'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description:
            'A variation entered but not yet approved: it does not count in the revised budget and can still be approved.'
        },
        {
          value: 'VALIDATED',
          label: 'Approved',
          description: 'An approved variation: final, its amount is included in the revised budget.'
        }
      ],
      notes: ['Filters: free text (reason, entered by), Status and Date.']
    },
    steps: [
      {
        title: 'Approve a variation',
        detail: 'Click "Approve" on its row, read the warning, then "Confirm the approval".'
      }
    ],
    consequences: [
      "Approving a variation cannot be undone: it can no longer be edited and its amount is added to the site's revised budget.",
      'No accounting entry is posted and nobody is notified.'
    ],
    faq: [
      {
        q: 'Why does my variation not change the revised budget?',
        a: 'It is still a draft: approve it.'
      },
      {
        q: 'Can I delete a draft variation?',
        a: 'This screen offers neither deletion nor editing: only approval is possible.'
      },
      {
        q: 'Can the amount be negative?',
        a: 'Yes, a variation can reduce an envelope.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing requires "View third-party accounts"; creating a budget and entering a variation require "Manage construction sites"; approving a budget or a variation requires "Validate financial documents".'
    },
    related: [
      {
        label: 'New variation',
        helpId: 'finance.budget-chantier.nouvel-avenant'
      },
      {
        label: 'Initial and revised budget',
        helpId: 'finance.budget-chantier.budget-revise'
      }
    ],
    keywords: ['variation', 'variations', 'budget change', 'variance', 'approve a variation']
  },
  {
    id: 'finance.budget-chantier.nouvel-avenant',
    kind: 'section',
    title: 'New variation',
    summary:
      'This form records a change to the approved budget: a reason, then one or more lines with an increase or decrease on a cost line.',
    steps: [
      {
        title: 'Date',
        detail: "The variation's date. It is pre-filled with today's date."
      },
      {
        title: 'Reason',
        detail: 'Required, for example "Rise in the price of cement".'
      },
      {
        title: 'Cost line',
        detail: 'Choose the cost line concerned for each line.'
      },
      {
        title: 'Variance',
        detail: 'Enter the amount in FCFA, positive to increase, negative to reduce. A zero amount is refused.'
      },
      {
        title: 'Quantity and unit price',
        detail:
          'Optional: with a quantity (always positive) and a unit price (positive or negative), the amount becomes their product. The sign is carried by the unit price.'
      },
      {
        title: 'Save',
        detail: '"Save the variation" creates it as a draft; it still has to be approved in the table above.'
      }
    ],
    consequences: [
      'The variation is created as a draft: it does not change the revised budget yet.',
      'Only an approved budget can receive a variation: on a draft budget, the application refuses the save.',
      'No accounting entry is posted and nobody is notified.'
    ],
    faq: [
      {
        q: 'How do I reduce an envelope?',
        a: 'Enter a negative amount, for example −500,000, with no quantity or unit price.'
      },
      {
        q: 'Why is "Save the variation" greyed out?',
        a: 'The reason is missing, or a line has no cost line or a zero amount.'
      },
      {
        q: 'Can I add a cost line that is not in the budget?',
        a: "The form offers your agency's active cost lines. The application's reply can tell you if this choice is not accepted."
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'CONSTRUCTION',
      note: 'Entering a variation requires the "Manage construction sites" right.'
    },
    related: [
      {
        label: 'Budget variations',
        helpId: 'finance.budget-chantier.avenants'
      }
    ],
    keywords: ['new variation', 'enter a variation', 'variance', 'price rise', 'reduce the budget']
  },
  {
    id: 'finance.stock-chantier.page',
    kind: 'page',
    title: 'Site stock',
    summary:
      'This screen says whether the site has moved to stock, and reconciles what was purchased, consumed and what remains on the site. All figures are calculated by the application.',
    purpose:
      "A site that has moved to stock receives its goods at a storage location: it is no longer the materials invoice that brings the expense into the site's cost, but the warehouse issue. The screen helps you see where the invoiced goods went.",
    steps: [
      {
        title: 'Read the state',
        detail: 'The banner at the top says whether the site is "Moved to stock" or "Not in stock mode".'
      },
      {
        title: 'Move the site to stock',
        detail: '"Move this site to stock", then "Confirm the move to stock" (irreversible, read the banner).'
      },
      {
        title: 'Do the opening stocktake',
        detail: 'After the switch, "Do the opening stocktake" records what is already on site.'
      },
      {
        title: 'Read the figures',
        detail: 'The six cards and the "Item by item" table reconcile invoiced, received, consumed and remaining.'
      }
    ],
    consequences: [
      'Moving to stock cannot be undone, even by an administrator. An agency that switches a site by mistake has only one recourse: stop using it.',
      "From the day of the switch, this site's material invoices (by their date) no longer enter its cost: the goods enter stock and the warehouse issue brings their cost in. Earlier invoices stay allocated.",
      'A storage location is created for the site if it had none. The switch itself posts no accounting entry.'
    ],
    faq: [
      {
        q: 'Can I choose the switch date?',
        a: 'No. It takes effect at the moment of confirmation: a chosen date would allow already-allocated invoices to be reclassified.'
      },
      {
        q: 'Why are the figures at zero before the switch?',
        a: 'Without moving to stock there is no period to compare: the invoiced amount and the variance are not calculated.'
      },
      {
        q: 'Can I undo the switch?',
        a: 'No, no function goes back.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing requires "View third-party accounts"; moving a site to stock requires "Configure the finance module".'
    },
    related: [
      {
        label: 'Moving the site to stock',
        helpId: 'finance.stock-chantier.bascule'
      },
      {
        label: 'Purchased, consumed, remaining',
        helpId: 'finance.stock-chantier.indicateurs'
      },
      {
        label: 'Item by item',
        helpId: 'finance.stock-chantier.articles'
      }
    ],
    keywords: ['stock', 'site stock', 'switch', 'stocktake', 'warehouse', 'materials', 'consumed']
  },
  {
    id: 'finance.stock-chantier.bascule',
    kind: 'section',
    title: 'Moving the site to stock',
    summary:
      'This banner says whether the site has moved to stock and, if not, lets you move it. The action cannot be undone.',
    steps: [
      {
        title: 'Read the banner',
        detail: 'Orange warning: the site is not in stock mode. Green banner: it has moved, with the date.'
      },
      {
        title: 'Switch',
        detail: '"Move this site to stock" opens a confirmation recalling the consequences.'
      },
      {
        title: 'Confirm',
        detail: '"Confirm the move to stock": the switch takes effect immediately.'
      },
      {
        title: 'Do the opening stocktake',
        detail:
          'If the screen offers it, "Do the opening stocktake": the quantities found enter stock without value, because their invoices were already allocated to the site.'
      }
    ],
    consequences: [
      'Irreversible: no route goes back, not even for an administrator.',
      "Before the switch, material invoices enter the site's cost directly when validated. After it, the invoiced goods enter stock and the warehouse issue allocates them to the site.",
      'The criterion is the invoice date: an invoice dated before the day of the switch is allocated as before, even if entered later.',
      'A storage location is created for the site if it had none, and its receipts land there.'
    ],
    faq: [
      {
        q: 'Why move a site to stock?',
        a: 'To track the goods: what is received, issued, and what remains, rather than counting everything as an expense at invoice.'
      },
      {
        q: 'What if the switch was a mistake?',
        a: 'It cannot be undone. The only recourse is to stop using the site.'
      },
      {
        q: 'Why is an opening stocktake suggested?',
        a: 'To record what is already on site at the time of the switch.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'CONSTRUCTION',
      note: 'Moving a site to stock requires the "Configure the finance module" right.'
    },
    related: [
      {
        label: 'Site stock',
        helpId: 'finance.stock-chantier.page'
      }
    ],
    keywords: ['switch', 'move to stock', 'irreversible', 'opening stocktake']
  },
  {
    id: 'finance.stock-chantier.indicateurs',
    kind: 'section',
    title: 'Purchased, consumed, remaining',
    summary:
      'Six cards reconcile what suppliers invoiced to the site, what entered stock, what was consumed and what remains.',
    howToRead: {
      notes: [
        'Invoiced to the site: validated invoices linked to the site since it moved to stock. Zero if the site has not moved to stock.',
        "Received from an invoice: value of the goods received at the site's location when a supplier invoice is received. It is the only receipt compared with the invoiced amount.",
        'Transferred in from another location: deliveries received from a warehouse or another site of the agency. They do not count in the variance.',
        'Consumed: issues allocated to this site, from any location. It is the part of its cost that comes from stock.',
        "Remaining on the site: what is at the site's location at this moment. A dash means the value is not available.",
        'Variance between invoiced and received: invoiced minus received from an invoice. It may come from transport or handling costs carried by the invoice, or from a quantity invoiced but never delivered: the application shows the figure without saying which is true. It is 0 as long as the site has not moved to stock, which does not mean the figures agree.'
      ]
    },
    faq: [
      {
        q: 'Why is the variance not zero?',
        a: 'It compares the invoiced amount with what actually entered stock from an invoice. It is up to you to establish the cause: costs carried by the invoice, or goods not delivered.'
      },
      {
        q: 'Are transfers between locations counted in the variance?',
        a: 'No: those goods were paid elsewhere, or never were.'
      },
      {
        q: 'Are values in FCFA?',
        a: 'Yes, amounts are in FCFA; quantities are in the unit of each item.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing this screen requires the "View third-party accounts" right.'
    },
    related: [
      {
        label: 'Item by item',
        helpId: 'finance.stock-chantier.articles'
      }
    ],
    keywords: ['invoiced', 'consumed', 'remaining', 'variance', 'reconciliation', 'stock']
  },
  {
    id: 'finance.stock-chantier.articles',
    kind: 'table',
    title: 'Item by item',
    summary:
      'Each row is a stock item involved with the site, with its received, consumed and remaining quantities. Under each quantity, the value is repeated in FCFA.',
    howToRead: {
      columns: [
        {
          key: 'reference',
          label: 'Reference',
          description: "The item's reference."
        },
        {
          key: 'designation',
          label: 'Description',
          description: "The item's name."
        },
        {
          key: 'recu',
          label: 'Received from an invoice',
          description: "Quantity received at the site's location when a supplier invoice is received."
        },
        {
          key: 'transfere',
          label: 'Transferred in from another location',
          description: 'Quantity delivered from a warehouse or another site.'
        },
        {
          key: 'consomme',
          label: 'Consumed',
          description: 'Quantity issued and allocated to this site, from any location.'
        },
        {
          key: 'retourne',
          label: 'Returned to the supplier',
          description: 'Quantity sent back to the supplier.'
        },
        {
          key: 'rebut',
          label: 'Scrapped',
          description: 'Quantity scrapped.'
        },
        {
          key: 'restant',
          label: 'Remaining',
          description: "Quantity at the site's location at this moment."
        }
      ],
      notes: [
        "These columns do not subtract from one another: consumed counts issues to this site from any location, whereas received, transferred in and remaining relate only to the site's own location.",
        'Filters: free text (reference, description) and "Non-zero remaining amount". The export covers all filtered rows, with quantity and value for each column.'
      ]
    },
    faq: [
      {
        q: 'Why does received minus consumed not give the remaining?',
        a: "Because consumed includes issues made from locations other than the site's."
      },
      {
        q: 'Why is the table empty?',
        a: 'No stock movement concerns this site yet.'
      },
      {
        q: 'In which unit are quantities?',
        a: 'In the unit of each item, shown next to the quantity.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing this screen requires the "View third-party accounts" right.'
    },
    related: [
      {
        label: 'Purchased, consumed, remaining',
        helpId: 'finance.stock-chantier.indicateurs'
      }
    ],
    keywords: ['item', 'quantity', 'consumed', 'remaining', 'scrap', 'supplier return']
  },
  {
    id: 'finance.cloture-chantier.page',
    kind: 'page',
    title: 'Site units and closing',
    summary:
      'Split the site into units, apportion its cost among them to get their cost price, then close the site to freeze that cost. Each unit can then be transferred to the portfolio.',
    purpose:
      "On an open site, a unit's cost price is an estimate: a validated invoice tomorrow will move it. After closing, it is final. Do not set any selling price on an estimate.",
    steps: [
      {
        title: 'Read the banner',
        detail: 'It says whether cost prices are an estimate (open site) or final (closed site).'
      },
      {
        title: 'Add the units',
        detail: '"Add a unit": name, floor area, share depending on the chosen key.'
      },
      {
        title: 'Set the key',
        detail: 'Choose the apportionment key then "Apply the key".'
      },
      {
        title: 'Clear the blockers',
        detail:
          'If any remain, the list says what to do (approve or cancel a draft, do the closing stocktake, transfer the remaining stock).'
      },
      {
        title: 'Close',
        detail: '"Close the site", then "Confirm the closing".'
      },
      {
        title: 'Transfer to the portfolio',
        detail: 'On each unit, "Transfer to the portfolio" creates the matching property.'
      }
    ],
    consequences: [
      "Closing freezes the site's cost at its current value and the site accepts no further expense. It posts no accounting entry.",
      'It can be undone with "Reopen the site", as long as no unit has been transferred to the portfolio.',
      "Transferring a unit is irreversible: it creates a real property, with the unit's frozen cost price as its acquisition value, and happens only once per unit."
    ],
    faq: [
      {
        q: 'Why is "Close the site" greyed out?',
        a: 'Reasons prevent the closing: the list under "Site closing" details them and offers the useful link.'
      },
      {
        q: 'Can I reopen a closed site?',
        a: 'Yes, as long as no unit has been transferred to the portfolio.'
      },
      {
        q: 'What does "Not apportioned" mean?',
        a: 'The part of the cost that no unit carries yet, for lack of a unit or an applicable key.'
      },
      {
        q: 'Can I still add a unit after closing?',
        a: 'No: reopen the site if the split has to change.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing requires "View third-party accounts"; adding, correcting, deleting a unit and setting the key require "Configure the finance module"; closing, reopening and transferring a unit to the portfolio require "Validate financial documents".'
    },
    related: [
      {
        label: 'Closing the site',
        helpId: 'finance.cloture-chantier.cloture'
      },
      {
        label: 'Site units',
        helpId: 'finance.cloture-chantier.lots'
      },
      {
        label: 'Apportionment key',
        helpId: 'finance.cloture-chantier.cle'
      }
    ],
    keywords: ['closing', 'close', 'unit', 'cost price', 'portfolio', 'transfer', 'freeze the cost', 'reopen'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'cloture-bandeau',
          title: 'Estimate or final',
          description: 'This banner is the most important: orange, cost prices are an estimate; green, they are final.'
        },
        {
          target: 'cloture-lots',
          title: 'The units',
          description:
            "Each row is a unit with its share and cost price. Depending on the site's state, you can correct it, delete it or transfer it to the portfolio."
        },
        {
          target: 'cloture-cle',
          title: 'The apportionment key',
          description: "It decides each unit's share. The application refuses a key the units cannot support."
        },
        {
          target: 'cloture-zone',
          title: 'The closing',
          description:
            'Read here what blocks, then close: the cost is frozen. You can reopen as long as no unit has been transferred.'
        }
      ]
    }
  },
  {
    id: 'finance.cloture-chantier.indicateurs',
    kind: 'section',
    title: 'Apportioned, not apportioned and key',
    summary: 'Three cards say what cost is apportioned among the units, what part has no unit, and which key is set.',
    howToRead: {
      notes: [
        'Cost apportioned across the units: the site cost to be apportioned. On an open site, it is the actual cost at the moment of reading; on a closed site, it is the cost frozen at closing.',
        "Not apportioned: the total cost minus the sum of the units' cost prices. It is above zero when the site has no unit, or when no key yet applies to these units.",
        'Apportionment key: "Pro rata by floor area", "Equal shares" or "Shares entered". As long as no key is set, each unit\'s share is zero and no cost price is apportioned.',
        'Nothing is typed in these cards.'
      ]
    },
    faq: [
      {
        q: 'Why is "Not apportioned" equal to the total cost?',
        a: 'No key is set, or no unit exists: the cost is not yet carried by any unit.'
      },
      {
        q: 'Does the apportioned cost change after closing?',
        a: 'No: it is frozen at the value of the closing.'
      },
      {
        q: 'Are amounts in FCFA?',
        a: 'Yes.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing this screen requires the "View third-party accounts" right.'
    },
    related: [
      {
        label: 'Apportionment key',
        helpId: 'finance.cloture-chantier.cle'
      }
    ],
    keywords: ['apportioned cost', 'not apportioned', 'apportionment key']
  },
  {
    id: 'finance.cloture-chantier.lots',
    kind: 'table',
    title: 'Site units',
    summary:
      "Each row is a unit produced by the site, with its share of the cost and its cost price. Depending on the site's state, it can be corrected, deleted or transferred to the portfolio.",
    howToRead: {
      columns: [
        {
          key: 'lot',
          label: 'Unit',
          description: 'The unit\'s name, for example "Villa A3".'
        },
        {
          key: 'surface',
          label: 'Floor area',
          description: "The unit's area in m². A dash (—) means it is not filled in."
        },
        {
          key: 'quotePart',
          label: 'Share entered',
          description: 'The share typed in by hand, as a percentage. It is only used with the "Shares entered" key.'
        },
        {
          key: 'part',
          label: 'Share',
          description:
            'The share of the cost the unit carries, derived from the key set (calculated by the application).'
        },
        {
          key: 'cout',
          label: 'Cost price',
          description:
            "The part of the site's cost carried by the unit, in FCFA. An estimate while the site is open, a final amount after closing."
        },
        {
          key: 'patrimoine',
          label: 'To the portfolio',
          description:
            'The property created for this unit after the transfer. A dash (—) means the unit has not been transferred.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            '"Correct" and "Delete" (open site), "Transfer to the portfolio" (closed site), or a note when the action is impossible.'
        }
      ],
      notes: [
        "The cost price is the share of the total cost. The rounding remainder goes to the first unit created, so that the sum of cost prices is exactly the site's cost.",
        'As soon as one unit has been transferred, all the others are frozen: "Frozen: a unit of this site has been transferred". You can then neither correct nor delete a unit, nor change the key.',
        'Filters: free text (unit name) and "To the portfolio".'
      ]
    },
    steps: [
      {
        title: 'Correct a unit',
        detail:
          '"Correct": change the name, floor area or share. A field left empty clears the saved value; every unit\'s cost price is recalculated.'
      },
      {
        title: 'Delete a unit',
        detail: '"Delete", then "Confirm the deletion": the other units\' cost prices are recalculated.'
      },
      {
        title: 'Transfer to the portfolio',
        detail: 'On a closed site, "Transfer to the portfolio" opens the property creation form.'
      }
    ],
    faq: [
      {
        q: 'Why have "Correct" and "Delete" disappeared?',
        a: 'The site is closed, or a unit has already been transferred to the portfolio.'
      },
      {
        q: 'Why is the share 0%?',
        a: 'No key is set, or the key set does not apply to these units.'
      },
      {
        q: 'Do the displayed shares always total 100%?',
        a: 'No: three units in equal shares each display 33.33%. It is the cost that comes out exact to the franc.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing requires "View third-party accounts"; adding, correcting, deleting a unit and setting the key require "Configure the finance module"; closing, reopening and transferring a unit to the portfolio require "Validate financial documents".'
    },
    related: [
      {
        label: 'Apportionment key',
        helpId: 'finance.cloture-chantier.cle'
      },
      {
        label: 'Add a unit',
        helpId: 'finance.cloture-chantier.ajout-lot'
      }
    ],
    keywords: ['unit', 'cost price', 'floor area', 'share', 'portfolio', 'correct a unit', 'delete a unit']
  },
  {
    id: 'finance.cloture-chantier.cle',
    kind: 'section',
    title: 'Apportionment key',
    summary:
      "The key decides each unit's share, and therefore its cost price. The application refuses a key the units cannot support.",
    howToRead: {
      notes: [
        'Pro rata by floor area: every unit must have a floor area above zero; its share is its area divided by the total area.',
        'Equal shares: nothing to enter; every unit carries the same share.',
        "Shares entered: the units' shares must total exactly 100%. While typing, the screen shows the sum and what is missing or in excess.",
        'When the key is "Shares entered", the displayed sum blocks nothing: you can enter one unit alone to reconfigure. The total of one hundred is only required when the key is set.'
      ]
    },
    steps: [
      {
        title: 'Choose',
        detail: 'Open the "Apportionment key" list and choose a key: its requirement is recalled below.'
      },
      {
        title: 'Apply',
        detail: '"Apply the key": if the units cannot support it, a message explains why and the key is not set.'
      }
    ],
    consequences: [
      "Changing the key recalculates every unit's share and cost price.",
      'The key can no longer be changed when the site is closed or when a unit has been transferred to the portfolio: the list is then greyed out.'
    ],
    faq: [
      {
        q: 'Why is "Apply the key" refused?',
        a: 'A unit has no floor area ("Pro rata by floor area" key), or the shares do not total 100% ("Shares entered" key).'
      },
      {
        q: 'What happens with no key?',
        a: 'Each unit\'s share is zero: all the cost stays "Not apportioned".'
      },
      {
        q: 'Can I change the key after closing?',
        a: 'No: the apportionment is frozen at closing.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'CONSTRUCTION',
      note: 'Setting the key requires the "Configure the finance module" right.'
    },
    related: [
      {
        label: 'Site units',
        helpId: 'finance.cloture-chantier.lots'
      }
    ],
    keywords: ['apportionment key', 'pro rata', 'floor area', 'equal shares', 'share']
  },
  {
    id: 'finance.cloture-chantier.ajout-lot',
    kind: 'section',
    title: 'Add a unit',
    summary:
      'This form adds a unit to the site. Only the name is required; floor area and share depend on the chosen key.',
    steps: [
      {
        title: 'Unit name',
        detail: 'Required, for example "Villa A3". Two units of the site cannot have the same name.'
      },
      {
        title: 'Floor area (m²)',
        detail: 'Required by the "Pro rata by floor area" key.'
      },
      {
        title: 'Share (%)',
        detail: 'Required by the "Shares entered" key; between 0 and 100, and the units\' total cannot exceed 100%.'
      },
      {
        title: 'Add',
        detail: '"Add the unit": fields left empty are not sent.'
      }
    ],
    consequences: [
      'If a key is already set, the new unit must provide what it requires: otherwise the addition is refused.',
      "Adding recalculates every unit's share and cost price.",
      'This form disappears when the site is closed or when a unit has been transferred to the portfolio.'
    ],
    faq: [
      {
        q: 'Why is my addition refused?',
        a: 'The name is already taken, or the key set requires a floor area or share you did not fill in.'
      },
      {
        q: 'Can I add a unit after closing?',
        a: 'No: splitting after the fact what was declared finished would reopen the question of cost price. Reopen the site.'
      },
      {
        q: 'Is the floor area required?',
        a: 'Only with the "Pro rata by floor area" key.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'CONSTRUCTION',
      note: 'Adding a unit requires the "Configure the finance module" right.'
    },
    related: [
      {
        label: 'Site units',
        helpId: 'finance.cloture-chantier.lots'
      }
    ],
    keywords: ['add a unit', 'new unit', 'floor area', 'share']
  },
  {
    id: 'finance.cloture-chantier.cloture',
    kind: 'section',
    title: 'Site closing',
    summary:
      'Closing freezes the site\'s cost. It is blocked as long as draft documents or stock remain on the site; it is undone with "Reopen the site" as long as no unit has been transferred.',
    howToRead: {
      notes: [
        "What blocks closing: draft supplier invoices, unapproved cash vouchers, draft salary notes, draft progress statements. On the stock side: a stocktake in progress at the site's location, stock still present, or no closing stocktake validated since the last goods receipt.",
        'A draft budget or purchase order does not block closing.',
        'The screen lists the blockers with the application\'s message and, for stock, a link: "Open the stocktake", "Do the closing stocktake", "Transfer the rest to a store". These are the checks the application will apply at closing.',
        'Stock path: first the closing stocktake of the location, then transfer the remainder to a store.'
      ]
    },
    steps: [
      {
        title: 'Clear the blockers',
        detail: 'Approve or cancel the drafts, then follow the stock links.'
      },
      {
        title: 'Close',
        detail: '"Close the site", read the warning, then "Confirm the closing".'
      },
      {
        title: 'Reopen if needed',
        detail:
          '"Reopen the site" then "Confirm the reopening": the frozen cost is erased and becomes calculated again.'
      }
    ],
    consequences: [
      "After closing, the cost is frozen at its current value and the site accepts no further allocation: invoice, cash voucher, salary note, progress statement. Units' cost prices become final.",
      'Closing posts no accounting entry and notifies nobody.',
      'It is not irreversible: "Reopen the site" is possible as long as no unit has been transferred to the portfolio. Depending on your subscription, reopening may be refused if the limit of open sites is reached.',
      'As soon as one unit has been transferred, "Reopen the site" is greyed out: a property exists, with an acquisition value drawn from the frozen cost.'
    ],
    faq: [
      {
        q: 'A draft invoice blocks the closing: what should I do?',
        a: 'Approve or cancel it: cancelling a draft takes it out of the closing without an entry.'
      },
      {
        q: 'Can the cost still move after closing?',
        a: 'No, as long as the site stays closed.'
      },
      {
        q: 'Why can I not reopen the site?',
        a: 'A unit has already been transferred to the portfolio.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'CONSTRUCTION',
      note: 'Closing and reopening require the "Validate financial documents" right.'
    },
    related: [
      {
        label: 'Site units and closing',
        helpId: 'finance.cloture-chantier.page'
      },
      {
        label: 'Transferring a unit to the portfolio',
        helpId: 'finance.cloture-chantier.bascule'
      }
    ],
    keywords: ['close', 'closing', 'blocker', 'reopen', 'freeze', 'closing stocktake']
  },
  {
    id: 'finance.cloture-chantier.bascule',
    kind: 'section',
    title: 'Transferring a unit to the portfolio',
    summary:
      'This form creates in the portfolio the property matching a unit of a closed site. It is irreversible and happens only once per unit.',
    steps: [
      {
        title: "Property's internal reference",
        detail: 'Required. It must be unique in your agency.'
      },
      {
        title: 'Property title',
        detail: 'Required, for example "Villa A3 — Riviera".'
      },
      {
        title: 'Property type and Ownership arrangement',
        detail: 'Required. Nothing is preselected: choose from the list.'
      },
      {
        title: 'Property address',
        detail: 'Required. A site has an area, not a postal address.'
      },
      {
        title: 'Description and Acquisition date',
        detail: "The description is optional; the acquisition date is pre-filled with today's date."
      },
      {
        title: 'Create',
        detail: '"Create the property in the portfolio", then "Confirm the creation of the property".'
      }
    ],
    consequences: [
      "Irreversible. The property is created in the portfolio with the unit's frozen cost price as its acquisition value. That value cannot be typed in.",
      'No unit of the site can then be corrected or deleted, the key can no longer change and the site can no longer be reopened.',
      'The transfer posts no accounting entry.'
    ],
    faq: [
      {
        q: 'Why is nothing pre-filled from the site?',
        a: 'A villa is not bare land, and the site has no postal address: these are the details of the property that will be created.'
      },
      {
        q: 'Why is the button greyed out?',
        a: 'The reference, title, address, property type, ownership arrangement or date is missing.'
      },
      {
        q: 'Can I transfer a unit of an open site?',
        a: 'No: the site must be closed first so that the cost price is final.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'CONSTRUCTION',
      note: 'Transferring a unit to the portfolio requires the "Validate financial documents" right.'
    },
    related: [
      {
        label: 'Site units',
        helpId: 'finance.cloture-chantier.lots'
      }
    ],
    keywords: ['transfer to the portfolio', 'create a property', 'acquisition value', 'unit']
  },
  {
    id: 'finance.tableau-de-bord-chantiers.page',
    kind: 'page',
    title: 'Site dashboard',
    summary:
      'One row per site compares its budget, what is committed and what is actual, and flags overruns and alerts. It is the steering screen for sites.',
    purpose:
      "Every figure is calculated by the application in one pass for all the agency's sites. The variance is measured against the revised budget: revised budget minus committed. A site without an approved budget has neither variance nor alert.",
    steps: [
      {
        title: 'Spot overruns',
        detail: 'Tick "Overrunning sites only" to see only sites whose committed amount exceeds the revised budget.'
      },
      {
        title: 'Filter',
        detail: 'Use the search (site, area), the Status filter and the Variance filter (in FCFA).'
      },
      {
        title: 'Open the budget',
        detail: '"View the budget" opens the site\'s budget, with its lines and variations.'
      },
      {
        title: 'Handle an alert',
        detail: '"Acknowledge the alert" removes it from the row once you have taken note of it.'
      }
    ],
    consequences: [
      'Acknowledging an alert is immediate: the screen asks for no confirmation. An alert informs, it forbids nothing.',
      'An alert only arises if a threshold is set for the site and a budget is approved. This screen cannot set the threshold.',
      'A site can be "In the budget" and still have an alert: the alert threshold is often below 100%.'
    ],
    faq: [
      {
        q: 'Why is a site "No budget"?',
        a: 'It has no approved budget. A draft budget is not read here.'
      },
      {
        q: 'Why do I see no alert?',
        a: 'No alert threshold is set, or no threshold has been crossed since the last evaluation.'
      },
      {
        q: 'Is the variance calculated against the initial budget?',
        a: 'No, against the revised budget: initial plus approved variations.'
      },
      {
        q: 'Does the table show closed sites?',
        a: 'Yes, all statuses, unless you filter.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing requires "View financial reports"; acknowledging an alert requires "Validate financial documents".'
    },
    related: [
      {
        label: 'How to read the dashboard',
        helpId: 'finance.tableau-de-bord-chantiers.tableau'
      },
      {
        label: 'Site budget',
        helpId: 'finance.budget-chantier.page'
      }
    ],
    keywords: ['dashboard', 'steering', 'overrun', 'variance', 'alert', 'revised budget', 'committed', 'actual']
  },
  {
    id: 'finance.tableau-de-bord-chantiers.tableau',
    kind: 'table',
    title: 'How to read the dashboard',
    summary: 'Each row is a site, from the most recent to the oldest. Here is the exact definition of each column.',
    howToRead: {
      columns: [
        {
          key: 'chantier',
          label: 'Site',
          description: "The site's name."
        },
        {
          key: 'zone',
          label: 'Area',
          description: "The site's area; a dash (—) if not filled in."
        },
        {
          key: 'statut',
          label: 'Status',
          description: "The site's state (see below)."
        },
        {
          key: 'avancement',
          label: 'Progress',
          description: 'The percentage of the latest progress entry recorded (0% if there is none).'
        },
        {
          key: 'budget-initial',
          label: 'Initial budget',
          description: "The total of the lines of the site's approved budget. Empty if the site has no approved budget."
        },
        {
          key: 'budget-revise',
          label: 'Revised budget',
          description:
            'Initial budget plus the sum of the amounts of approved variations. Empty without an approved budget.'
        },
        {
          key: 'engage',
          label: 'Committed',
          description:
            'Actual plus the remaining to invoice on issued purchase orders. A draft or cancelled order commits nothing.'
        },
        {
          key: 'realise',
          label: 'Actual',
          description:
            'The sum of the expenses allocated to the site, validated and not cancelled: it is the actual cost.'
        },
        {
          key: 'ecart',
          label: 'Variance',
          description:
            'Revised budget minus committed, in FCFA, with a label: "In the budget" if the variance is positive or zero, "Overrun" if negative, "No budget" without an approved budget.'
        },
        {
          key: 'alerte',
          label: 'Alert',
          description:
            'Shown when a threshold alert is open. The tooltip gives the threshold crossed and the share of the budget used at the moment the alert arose.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"View the budget", and "Acknowledge the alert" when an alert is open.'
        }
      ],
      statuses: [
        {
          value: 'PLANNED',
          label: 'Scheduled',
          description: 'A created site, starting status.'
        },
        {
          value: 'IN_PROGRESS',
          label: 'In progress',
          description: 'An active site.'
        },
        {
          value: 'SUSPENDED',
          label: 'Suspended',
          description: 'A site put on hold.'
        },
        {
          value: 'CLOSED',
          label: 'Closed',
          description: 'A closed site: its cost is frozen.'
        }
      ],
      notes: [
        'A positive variance is a margin: revised budget minus committed. A negative variance is an overrun.',
        'The alert compares the committed amount with the revised budget: it triggers when this share reaches the threshold set for the site (exactly at the threshold, it is raised). It is evaluated when a supplier invoice or a cash voucher is validated, and when a purchase order is issued. Only one alert is open at a time per site.',
        'Acknowledging the alert removes it from the row; if the threshold is still crossed, a new alert may appear at the next evaluation.',
        'Filters: Status and "Overrunning sites only" are handled by the application; the search (site, area) and Variance (minimum and maximum in FCFA) filter the rows received. The export covers all filtered rows.'
      ]
    },
    steps: [
      {
        title: 'Go to the budget',
        detail: 'Click "View the budget" at the right of the row.'
      }
    ],
    faq: [
      {
        q: 'Why is the variance "In the budget" while I have an alert?',
        a: 'The alert triggers at a threshold, often below 100% of the budget; an overrun only exists beyond 100%.'
      },
      {
        q: 'Why are the budgets empty?',
        a: 'The site has no approved budget: set then approve a budget.'
      },
      {
        q: 'Why is committed larger than actual?',
        a: 'It adds the remaining to invoice on issued purchase orders.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing requires "View financial reports"; acknowledging an alert requires "Validate financial documents".'
    },
    related: [
      {
        label: 'Committed and actual',
        helpId: 'finance.budget-chantier.engage-realise'
      },
      {
        label: 'Initial and revised budget',
        helpId: 'finance.budget-chantier.budget-revise'
      }
    ],
    keywords: ['variance', 'overrun', 'committed', 'actual', 'revised budget', 'alert', 'progress']
  },
  {
    id: 'finance.baux-terrain.page',
    kind: 'page',
    title: 'Ground leases',
    summary:
      'This is where you find the leases of the plots your agency rents for its sites, with the annual rent, the monthly amount and what remains to be consumed of the advance paid. It is the starting point to record a lease.',
    purpose:
      "The landlord is usually paid once a year, in advance. To keep a site's cost readable, the rent is then posted one twelfth per month and allocated to the sites linked to the lease. The detail is followed on each lease's page.",
    steps: [
      {
        title: 'Record a lease',
        detail: 'Click "New lease", fill in the form, then "Save the lease".'
      },
      {
        title: 'Search',
        detail: 'Type a landlord, a plot, a cost line or a site in the search field.'
      },
      {
        title: 'Filter',
        detail: 'Filter by Status (Active or Completed) and by Cost line.'
      },
      {
        title: 'Open a lease',
        detail: '"View the lease" opens its page: linked sites, payments, postings.'
      },
      {
        title: 'Export',
        detail: 'The "Export" button: every lease matching your filters.'
      }
    ],
    consequences: [
      "Recording a lease posts no accounting entry and notifies nobody: it only opens an account in the landlord's name, at zero.",
      "The rent costs a site nothing as long as the lease is not linked to that site, from the lease's page.",
      'Entries arise later: when an annual payment is approved, then at each monthly posting.'
    ],
    faq: [
      {
        q: 'What does "Left to consume" mean?',
        a: 'The part of the advance paid to the landlord that has not yet become an expense: approved payments minus months posted.'
      },
      {
        q: 'Why is the cost line required?',
        a: 'It is the cost line that receives the rent in the cost of the linked sites.'
      },
      {
        q: 'What happens without an end date?',
        a: 'The lease is automatically renewed.'
      },
      {
        q: 'I cannot see "New lease". Why?',
        a: 'This action requires the "Manage construction sites" right.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing requires "View third-party accounts"; creating a lease and linking a site require "Manage construction sites"; entering a payment requires "Create financial documents"; approving a payment and posting a month require "Validate financial documents".'
    },
    related: [
      {
        label: 'How to read the lease table',
        helpId: 'finance.baux-terrain.tableau'
      },
      {
        label: 'Ground lease page',
        helpId: 'finance.bail-terrain.page'
      }
    ],
    keywords: ['ground lease', 'leased plot', 'landlord', 'rent', 'annual rent', 'monthly payment', 'site']
  },
  {
    id: 'finance.baux-terrain.tableau',
    kind: 'table',
    title: 'Ground lease table',
    summary:
      'Each row is a ground lease: the landlord, the plot, the rent and what remains to be consumed of the advance paid.',
    howToRead: {
      columns: [
        {
          key: 'bailleur',
          label: 'Landlord',
          description: 'The person or company you rent the plot from.'
        },
        {
          key: 'terrain',
          label: 'Plot',
          description: 'The leased plot, as entered at creation.'
        },
        {
          key: 'poste',
          label: 'Cost line',
          description: 'The cost line that receives the rent in the cost of the linked sites.'
        },
        {
          key: 'annuel',
          label: 'Annual rent',
          description: 'The rent over twelve months, in FCFA.'
        },
        {
          key: 'mensuel',
          label: 'Monthly payment',
          description:
            'One twelfth of the annual rent, rounded, in FCFA. The twelfth month of the cycle absorbs the rounding remainder, so that twelve months make exactly one year.'
        },
        {
          key: 'reste',
          label: 'Left to consume',
          description:
            'The advance paid to the landlord that has not yet become an expense: approved payments minus months posted. A negative amount means the posted months exceed the approved payments.'
        },
        {
          key: 'chantiers',
          label: 'Linked sites',
          description: 'The sites that receive a share of the rent, or "No linked site".'
        },
        {
          key: 'statut',
          label: 'Status',
          description: 'Active or Inactive (the filter calls it "Completed").'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"View the lease" opens the lease page.'
        }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Active',
          description: 'A lease being followed: its rent is posted every month by the scheduled job.'
        },
        {
          value: 'INACTIVE',
          label: 'Inactive',
          description:
            'A completed lease: it is no longer posted every month. This screen cannot make a lease inactive.'
        }
      ],
      notes: [
        'Filters: free search (landlord, plot, cost line, site), Status (Active or Completed) and Cost line. The export covers the whole filtered list.'
      ]
    },
    steps: [
      {
        title: 'Open a lease',
        detail: 'Click "View the lease" at the right of the row.'
      }
    ],
    faq: [
      {
        q: 'Why is "Left to consume" zero?',
        a: 'No payment is approved, or every month paid has been posted.'
      },
      {
        q: 'Why is no site linked?',
        a: "Linking is done from the lease's page: as long as it is missing, the posted rent is allocated to no site."
      },
      {
        q: 'Can a lease be deleted?',
        a: 'This screen offers no deletion.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing this screen requires the "View third-party accounts" right.'
    },
    related: [
      {
        label: 'Paid, consumed, left to consume',
        helpId: 'finance.bail-terrain.indicateurs'
      }
    ],
    keywords: ['lease', 'annual rent', 'monthly payment', 'left to consume', 'advance', 'landlord']
  },
  {
    id: 'finance.baux-terrain.nouveau',
    kind: 'section',
    title: 'New ground lease',
    summary:
      'This form records a lease. The landlord, the plot, the annual rent, the cost line and the start date are required.',
    steps: [
      {
        title: 'Landlord',
        detail: 'The name of the person or company, for example "Mamadou Kouadio".'
      },
      {
        title: 'Leased plot',
        detail: 'Describe the plot, for example "Riviera plot, 800 m²".'
      },
      {
        title: 'Annual rent (FCFA)',
        detail: 'The rent over twelve months; it must be above zero.'
      },
      {
        title: 'Cost line',
        detail: "Choose the cost line (among the active ones) that will receive the rent in the sites' cost."
      },
      {
        title: 'Start and End',
        detail:
          'The start date is required. The end is optional: without it, the lease is automatically renewed. The end must be after the start.'
      },
      {
        title: 'Save',
        detail: '"Save the lease": you land on the lease page.'
      }
    ],
    consequences: [
      'The lease is created "Active" and a third-party account in the landlord\'s name is opened, at zero. No accounting entry is posted, nobody is notified.',
      'The lease start sets the twelve-month cycle: the first month posted is the start month.',
      "No site is linked: do it from the lease's page."
    ],
    faq: [
      {
        q: 'Can I change the rent afterwards?',
        a: 'This screen offers no editing: check before saving.'
      },
      {
        q: 'Why does "Save the lease" show an error?',
        a: 'A required field is missing, the end is not after the start, or the chosen cost line is disabled.'
      },
      {
        q: 'Must I pay before recording the lease?',
        a: "No: the annual payment is entered afterwards, on the lease's page."
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'CONSTRUCTION',
      note: 'Creating a lease requires the "Manage construction sites" right.'
    },
    related: [
      {
        label: 'Ground leases',
        helpId: 'finance.baux-terrain.page'
      }
    ],
    keywords: ['new lease', 'create a ground lease', 'landlord', 'annual rent', 'automatic renewal']
  },
  {
    id: 'finance.bail-terrain.page',
    kind: 'page',
    title: 'Ground lease page',
    summary:
      "The page shows a lease's rent, what has been paid to the landlord, what has already been consumed month by month, and the sites that bear this rent.",
    purpose:
      'The landlord is paid once a year, in advance, but the expense is spread over twelve months. Each month, one twelfth of the rent is "posted" and allocated to the linked sites: that is what adds it to their actual cost.',
    steps: [
      {
        title: 'Link the sites',
        detail: '"Linked sites" tab: choose a site then "Attach".'
      },
      {
        title: 'Enter the annual payment',
        detail: '"Annual payments" tab: "New annual payment", then "Save payment".'
      },
      {
        title: 'Approve the payment',
        detail: 'Click "Approve" on the payment row and confirm.'
      },
      {
        title: 'Follow the months',
        detail: '"Monthly postings" tab: one month per row, with the sites allocated.'
      }
    ],
    consequences: [
      'Approving a payment cannot be undone: it can no longer be edited and posts an accounting entry (the amount leaves the cash desk and becomes a prepaid expense).',
      'Each monthly posting posts an entry (the rent expense arises, the advance decreases) and counts in the actual cost of the linked sites.',
      'Nothing is sent to the landlord: the application sends no message or receipt.'
    ],
    faq: [
      {
        q: 'Why do the figures at the top not match the payment I entered?',
        a: 'Only approved payments count in "Paid to date"; a draft does not.'
      },
      {
        q: 'When are months posted?',
        a: 'Automatically at the start of each month (on the 2nd, for the month just ended); you can catch one up by hand.'
      },
      {
        q: 'What becomes of the rent of a month with no linked site?',
        a: 'It is posted but without allocation: "expense posted without allocation".'
      },
      {
        q: 'Can I detach a site?',
        a: 'Yes: it will no longer receive rent from the next posting; past months do not change.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing requires "View third-party accounts"; creating a lease and linking a site require "Manage construction sites"; entering a payment requires "Create financial documents"; approving a payment and posting a month require "Validate financial documents".'
    },
    related: [
      {
        label: 'Paid, consumed, left to consume',
        helpId: 'finance.bail-terrain.indicateurs'
      },
      {
        label: 'Annual payments',
        helpId: 'finance.bail-terrain.paiements'
      },
      {
        label: 'Monthly postings',
        helpId: 'finance.bail-terrain.constatations'
      }
    ],
    keywords: ['ground lease', 'rent', 'annual payment', 'posting', 'schedule', 'advance', 'landlord', 'linked sites']
  },
  {
    id: 'finance.bail-terrain.indicateurs',
    kind: 'section',
    title: 'Paid, consumed, left to consume',
    summary:
      'These cards make the advance mechanism readable: what was paid, what has already become an expense, and what remains.',
    howToRead: {
      notes: [
        'Paid to date: sum of the approved annual payments of this lease. A draft payment is not counted.',
        'Consumed to date: sum of all the monthly postings of the lease.',
        "Left to consume: the advance paid that has not yet become an expense, given by the landlord's account. It is in principle paid minus consumed. If this amount is negative, the posted months exceed the approved payments.",
        'Annual rent: the rent over twelve months. Monthly payment: its rounded twelfth; the twelfth month of the cycle absorbs the rounding remainder, so that twelve postings make exactly the annual rent.',
        'Below, the screen recalls the lease start date (and its end, or "automatic renewal") and the cost line that receives the rent.'
      ]
    },
    faq: [
      {
        q: 'Why is "Left to consume" not equal to paid minus consumed?',
        a: "It comes from the landlord's account; a recent payment or posting may not yet be reloaded: refresh the screen."
      },
      {
        q: 'What is the cost line for?',
        a: 'It is the cost line to which the rent is allocated in the cost of the linked sites.'
      },
      {
        q: 'Are amounts in FCFA?',
        a: 'Yes.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing this screen requires the "View third-party accounts" right.'
    },
    related: [
      {
        label: 'Annual payments',
        helpId: 'finance.bail-terrain.paiements'
      },
      {
        label: 'Monthly postings',
        helpId: 'finance.bail-terrain.constatations'
      }
    ],
    keywords: ['paid to date', 'consumed', 'left to consume', 'advance', 'monthly payment']
  },
  {
    id: 'finance.bail-terrain.chantiers',
    kind: 'table',
    title: 'Linked sites',
    summary:
      'This table lists the sites bearing the rent of this plot. Below, the "Link an existing site" block adds one.',
    howToRead: {
      columns: [
        {
          key: 'chantier',
          label: 'Site',
          description: 'The name of the site linked to the lease.'
        },
        {
          key: 'statut',
          label: 'Status',
          description: "The site's state."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Detach" removes the site from the lease, after confirmation.'
        }
      ],
      statuses: [
        {
          value: 'PLANNED',
          label: 'Scheduled',
          description: 'A created site: it receives its share of the rent.'
        },
        {
          value: 'IN_PROGRESS',
          label: 'In progress',
          description: 'An active site: it receives its share of the rent.'
        },
        {
          value: 'SUSPENDED',
          label: 'Suspended',
          description: 'A site on hold: it still receives its share of the rent.'
        },
        {
          value: 'CLOSED',
          label: 'Closed',
          description: 'A closed site: it no longer receives a share of the rent, which is split among the other sites.'
        }
      ]
    },
    steps: [
      {
        title: 'Attach',
        detail: 'In "Link an existing site", choose a site then "Attach".'
      },
      {
        title: 'Detach',
        detail: '"Detach" on the row, then "Confirm the detachment".'
      }
    ],
    consequences: [
      'The rent posted each month is split in equal parts among the linked sites that are not closed; the rounding remainder goes to the oldest site.',
      'Linking or detaching only acts on the next postings: months already posted do not change.',
      'A site is linked to only one lease at a time: linking it to this one removes it from its previous lease.',
      'With no linked site, the rent is posted but allocated to no site.'
    ],
    faq: [
      {
        q: 'Why is a site not offered in the list?',
        a: "It is already linked to this lease, or the agency's site list has not loaded it yet."
      },
      {
        q: 'Does detaching erase past allocations?',
        a: 'No: months already posted keep their allocations.'
      },
      {
        q: 'Who can link?',
        a: 'A user with the "Manage construction sites" right.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'CONSTRUCTION',
      note: 'Linking and detaching a site require the "Manage construction sites" right.'
    },
    related: [
      {
        label: 'Monthly postings',
        helpId: 'finance.bail-terrain.constatations'
      }
    ],
    keywords: ['link a site', 'detach', 'linked sites', 'rent split']
  },
  {
    id: 'finance.bail-terrain.paiements',
    kind: 'table',
    title: 'Annual payments',
    summary:
      'Each row is a payment made to the landlord, with the period it covers. A draft payment must be approved to count.',
    howToRead: {
      columns: [
        {
          key: 'date',
          label: 'Payment date',
          description: 'The date you paid the landlord.'
        },
        {
          key: 'periode',
          label: 'Period covered',
          description: 'From the first to the last day covered by this payment.'
        },
        {
          key: 'montant',
          label: 'Amount',
          description: 'The amount paid, in FCFA.'
        },
        {
          key: 'saisi',
          label: 'Entered by',
          description: 'The person who entered the payment.'
        },
        {
          key: 'statut',
          label: 'Status',
          description: 'Draft or Approved.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Approve" appears on a draft payment.'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'A payment entered, not yet approved: it does not count in "Paid to date" and posts no entry.'
        },
        {
          value: 'VALIDATED',
          label: 'Approved',
          description: 'A final payment: it counts in "Paid to date" and its entry is posted.'
        }
      ],
      notes: [
        "The period covered is a reference: the rent is posted month by month from the lease's annual rent, not from this period.",
        'Filters: search (entered by, period), Status, Payment date and Amount.'
      ]
    },
    steps: [
      {
        title: 'Approve a payment',
        detail: '"Approve" on the row, read the warning, then "Confirm the approval".'
      }
    ],
    consequences: [
      "Approving cannot be undone: the payment can no longer be edited. It posts an accounting entry: the amount leaves the cash desk and is booked as a prepaid expense. The landlord's account records the advance paid.",
      'Approval generates no receipt and sends no message to the landlord.'
    ],
    faq: [
      {
        q: 'Can I correct an approved payment?',
        a: 'No. This screen offers no correction of an approved payment.'
      },
      {
        q: 'Can I edit or delete a draft?',
        a: 'This screen only offers approval of a draft.'
      },
      {
        q: 'Who can approve?',
        a: 'A user with the "Validate financial documents" right; entering requires "Create financial documents".'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing requires "View third-party accounts"; creating a lease and linking a site require "Manage construction sites"; entering a payment requires "Create financial documents"; approving a payment and posting a month require "Validate financial documents".'
    },
    related: [
      {
        label: 'New annual payment',
        helpId: 'finance.bail-terrain.nouveau-paiement'
      },
      {
        label: 'Paid, consumed, left to consume',
        helpId: 'finance.bail-terrain.indicateurs'
      }
    ],
    keywords: ['annual payment', 'approve a payment', 'period covered', 'advance', 'rent paid']
  },
  {
    id: 'finance.bail-terrain.nouveau-paiement',
    kind: 'section',
    title: 'New annual payment',
    summary:
      'This form records as a draft a payment made to the landlord. It only counts and posts an entry once approved.',
    steps: [
      {
        title: 'Payment date',
        detail: "Pre-filled with today's date: correct it if needed."
      },
      {
        title: 'Amount',
        detail: 'The amount paid, above zero, in FCFA.'
      },
      {
        title: 'Period covered',
        detail: 'Start and end of the period covered, required; the end must be after the start.'
      },
      {
        title: 'Save',
        detail: '"Save payment": it appears in the table as a draft, to be approved.'
      }
    ],
    consequences: [
      'The payment is created as a draft: no accounting entry is posted yet.',
      'The form resets after saving.'
    ],
    faq: [
      {
        q: 'Why is "Save payment" greyed out?',
        a: 'A positive amount, or the start or end of the period covered, is missing.'
      },
      {
        q: 'Where do I approve it?',
        a: 'In the payments table, with the "Approve" button on its row.'
      },
      {
        q: 'Can I enter several payments?',
        a: 'Yes, one per row; only approved payments count.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Entering a payment requires the "Create financial documents" right.'
    },
    related: [
      {
        label: 'Annual payments',
        helpId: 'finance.bail-terrain.paiements'
      }
    ],
    keywords: ['new payment', 'enter a payment', 'annual rent', 'period covered']
  },
  {
    id: 'finance.bail-terrain.constatations',
    kind: 'table',
    title: 'Monthly postings',
    summary:
      'Each row is a month of rent posted: one twelfth of the annual rent, booked as an expense and allocated to the linked sites.',
    howToRead: {
      columns: [
        {
          key: 'periode',
          label: 'Period',
          description: 'The month posted.'
        },
        {
          key: 'montant',
          label: 'Amount posted',
          description:
            'One twelfth of the annual rent, in FCFA. The twelfth month of the cycle carries the rounding remainder.'
        },
        {
          key: 'imputations',
          label: 'Cost allocations',
          description:
            'The sites that received a share of this month, with their amount. With no site: "expense posted without allocation".'
        }
      ],
      notes: [
        'The twelve-month cycle is counted from the lease start date, not from January.',
        'The scheduled job posts the month just ended at the start of each month (on the 2nd). Replaying a month already posted doubles nothing.',
        'Filters: search (period, allocated site) and Period.'
      ]
    },
    consequences: [
      'Each posting posts an accounting entry: the rent expense is recognised and the advance paid decreases by the same amount.',
      'It is allocated in equal parts to the sites linked to the lease that are Scheduled, In progress or Suspended at that moment; the rounding remainder goes to the oldest site. This share adds to their actual cost, under the "Ground rent" nature.',
      'The allocations shown are those actually produced: linking or detaching a site later does not change a past month.'
    ],
    faq: [
      {
        q: 'Why is a month "without allocation"?',
        a: 'No open site was linked to the lease that month: the rent is posted but carried by no site.'
      },
      {
        q: 'Why is the last month of the cycle different?',
        a: 'It absorbs the rounding remainder so that twelve months make exactly the annual rent.'
      },
      {
        q: 'Can a posted month be corrected?',
        a: 'This screen offers neither correction nor deletion of a posting.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager', 'Accountant'],
      feature: 'CONSTRUCTION',
      note: 'Viewing this screen requires the "View third-party accounts" right.'
    },
    related: [
      {
        label: 'Post a month manually',
        helpId: 'finance.bail-terrain.constater'
      },
      {
        label: 'Linked sites',
        helpId: 'finance.bail-terrain.chantiers'
      }
    ],
    keywords: ['posting', 'month', 'twelfth', 'allocation', 'land rent', 'schedule']
  },
  {
    id: 'finance.bail-terrain.constater',
    kind: 'section',
    title: 'Post a month manually',
    summary:
      'Use only if the scheduled job at the start of the month did not run. Replaying a month already posted doubles nothing.',
    steps: [
      {
        title: 'Year',
        detail: 'The year of the month to post (between 2000 and 2100).'
      },
      {
        title: 'Month',
        detail: 'Choose the month from the list.'
      },
      {
        title: 'Post',
        detail: '"Post this month": the month appears in the postings table.'
      }
    ],
    consequences: [
      'The posting is immediate and final: it posts the accounting entry, allocates the share of the rent to the linked sites (not closed) and increases their actual cost.',
      'A month before the lease start date is refused.',
      'Post a month that has ended: this screen offers no way to cancel a posting.'
    ],
    faq: [
      {
        q: 'When should I use it?',
        a: 'If a month is missing from the postings table when it should be there.'
      },
      {
        q: 'Can I post the same month twice?',
        a: 'The application creates no duplicate: a month already posted is simply returned as it is.'
      },
      {
        q: 'Who can do it?',
        a: 'A user with the "Validate financial documents" right.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      feature: 'CONSTRUCTION',
      note: 'Posting a month requires the "Validate financial documents" right.'
    },
    related: [
      {
        label: 'Monthly postings',
        helpId: 'finance.bail-terrain.constatations'
      }
    ],
    keywords: ['post a month', 'catch-up', 'manual posting']
  }
];

export default entries;
