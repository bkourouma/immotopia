import type { HelpEntry } from '../../../types';

/** « sales » zone of the « commercial » module (en): dashboard, mandates, offers, agreements, commissions. */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------------------
  // Sales dashboard
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.ventes.tableau-de-bord',
    kind: 'page',
    title: 'Sales (dashboard)',
    summary:
      "This screen summarizes your agency's sales activity: mandates, offers, agreements and commissions. Below it, the list of active sale mandates.",
    purpose:
      'A sale follows a path: a mandate is signed with the seller, buyers make offers, an accepted offer becomes an agreement, then the deed is signed and the commission becomes due. This screen shows where each step stands.',
    steps: [
      {
        title: 'Create a mandate',
        detail: 'Click "New mandate": the creation form opens on the "Sale mandates" screen.'
      },
      {
        title: 'Read the indicators',
        detail: 'The seven cards at the top count the mandates, offers, agreements and commissions of the whole agency.'
      },
      {
        title: 'Look for an active mandate',
        detail: 'Use the search field and the criteria above the list, then click the number to open the mandate.'
      },
      {
        title: 'See all mandates or commissions',
        detail: 'The "All mandates" and "Sale commissions" buttons open the two other sales screens.'
      }
    ],
    consequences: [
      'This screen is read-only: nothing here changes the state of a mandate, an offer or an agreement. Actions are done on the mandate or agreement page.',
      'The figures are recalculated each time the screen opens; after a deed is signed or a payment is collected, they update as soon as you come back here.'
    ],
    faq: [
      {
        q: 'Why is an "Expired" mandate listed among active mandates?',
        a: 'A mandate whose due date has passed stays "Active" until someone revokes it: it shows as "Expired" in the list and counts in "Expired mandates".'
      },
      {
        q: 'Where are revoked or sold mandates?',
        a: 'They only appear in "All mandates", where you can filter by status.'
      },
      {
        q: 'I cannot see the sales screen or the "New mandate" button.',
        a: 'The screen requires the "View deals" permission and the Sales pack of your subscription. Creating a mandate also requires "Edit deals".'
      }
    ],
    permissions: {
      feature: 'SALES',
      note: 'View: "View deals". Create a mandate or act on an offer or agreement: "Edit deals".'
    },
    related: [
      { label: 'The dashboard indicators', helpId: 'commercial.ventes.tableau-de-bord.indicateurs' },
      { label: 'The list of active mandates', helpId: 'commercial.ventes.tableau-de-bord.mandats' },
      { label: 'All sale mandates', helpId: 'commercial.ventes.mandats' },
      { label: 'Sale commissions', helpId: 'commercial.ventes.commissions' }
    ],
    keywords: ['sale', 'sales', 'mandate', 'offer', 'agreement', 'commission', 'dashboard', 'pipeline', 'transaction']
  },
  {
    id: 'commercial.ventes.tableau-de-bord.indicateurs',
    kind: 'section',
    title: 'Sales indicators',
    summary:
      'Seven cards count what is under way in your agency. They do not depend on the search made in the list below.',
    howToRead: {
      notes: [
        'Active mandates: number of mandates with the "Active" status, with the sum of their asking prices below. Mandates past their due date but not yet revoked are counted.',
        'Expired mandates: among active mandates, those past their due date.',
        'Open offers: offers that are "Submitted" or in "Counter-offer" whose validity date has not passed (or that have no validity date).',
        'Signed agreements: agreements with the "Signed" status, meaning the deed is not signed yet, with the sum of their agreed prices.',
        'Sales this month: agreements with the "Deed signed" status whose deed date falls in the current month, with the sum of their agreed prices.',
        'Commissions due: what is still to be collected (incl. tax) on commissions "To collect" or "Partially collected", excluding voided payments.',
        'Commissions collected this month: total of recorded commission payments (not voided) whose date falls in the current month.'
      ]
    },
    consequences: ['The cards are not clickable: to act, open the "All mandates" or "Sale commissions" screens.'],
    faq: [
      {
        q: 'A dash (—) is shown instead of the figure.',
        a: 'The figures are loading. If an error message appears instead of the cards, click "Retry".'
      },
      {
        q: 'Why does "Active mandates" count expired mandates?',
        a: 'Because a mandate stays "Active" until it is revoked or sold. "Expired mandates" tells you how many of them are past their due date.'
      }
    ],
    related: [{ label: 'Sale commissions', helpId: 'commercial.ventes.commissions' }],
    keywords: ['indicator', 'figures', 'counter', 'active mandates', 'open offers', 'commissions due', 'monthly sales']
  },
  {
    id: 'commercial.ventes.tableau-de-bord.mandats',
    kind: 'table',
    title: 'Active sale mandates',
    summary:
      'Each row is a sale mandate with the "Active" status, with its property, seller, asking price and number of offers.',
    howToRead: {
      columns: [
        {
          key: 'numero',
          label: 'Number',
          description: 'The mandate number (MV-year-number). Click it to open the mandate page.'
        },
        { key: 'bien', label: 'Property', description: 'The reference and title of the property for sale.' },
        { key: 'vendeur', label: 'Seller', description: 'The owner who gave the mandate.' },
        {
          key: 'prix',
          label: 'Asking price',
          description: 'The desired sale price, in FCFA. The confidential floor price is not shown here.'
        },
        { key: 'type', label: 'Type', description: '"Simple" or "Exclusive".' },
        {
          key: 'echeance',
          label: 'Due date',
          description: 'The end date of the mandate. A dash (—) means no end date is recorded.'
        },
        {
          key: 'offres',
          label: 'Offers',
          description: 'The total number of offers received on this mandate, whatever their status.'
        },
        { key: 'statut', label: 'Status', description: '"Active", or "Expired" when the due date has passed.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The mandate is in progress: offers can be recorded.' },
        {
          value: 'EXPIRED',
          label: 'Expired',
          description:
            'The mandate is active but its due date has passed. This is not a stored status: it disappears if the due date changes.'
        }
      ],
      notes: [
        'Search: type a number, a property, a seller or a listing agent. Criteria: Mandate type, Due date, then under "More filters" Mandate start, Asking price (FCFA) and Overdue.',
        'The export button (Excel, CSV or PDF) exports all active mandates matching your criteria, not only the displayed page. On a phone, each mandate is shown as a card.'
      ]
    },
    faq: [
      {
        q: 'Why does the Status column only show "Active" or "Expired"?',
        a: 'This list only contains active mandates. Revoked or sold mandates are in "All mandates".'
      },
      {
        q: 'How do I create a mandate?',
        a: 'With the "New mandate" button at the top of the page: it opens the form on the "Sale mandates" screen.'
      }
    ],
    related: [
      { label: 'Create a sale mandate', helpId: 'commercial.ventes.mandats.nouveau' },
      { label: 'A mandate page', helpId: 'commercial.ventes.mandat' }
    ],
    keywords: ['mandate', 'active mandates', 'asking price', 'seller', 'exclusive', 'simple', 'due date', 'export']
  },

  // ---------------------------------------------------------------------------
  // Sale mandates (list)
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.ventes.mandats',
    kind: 'page',
    title: 'Sale mandates',
    summary:
      "Here you find all your agency's sale mandates, whatever their status. This is also where you create a new mandate.",
    purpose:
      "A sale mandate is the agreement by which an owner entrusts your agency with selling a property, at an asking price and with agreed fees. Each mandate has its own page, where you record buyers' offers.",
    steps: [
      {
        title: 'Create a mandate',
        detail: 'Click "New mandate", fill in the form, then "Create the mandate".'
      },
      {
        title: 'Search',
        detail: 'Type a number, a property, a seller or a listing agent in the search field.'
      },
      {
        title: 'Filter',
        detail:
          'Narrow the list with Status and Mandate type; "More filters" adds Due date, Mandate start, Asking price and Overdue.'
      },
      {
        title: 'Open a mandate',
        detail: 'Click its number (or its card, on a phone) to see its offers, agreements and signatures.'
      },
      {
        title: 'Export',
        detail: 'The export button (Excel, CSV or PDF) exports all mandates matching your criteria.'
      }
    ],
    consequences: [
      'Creating a mandate does not change the property status: the property changes status later, when an offer is accepted.',
      'A property can only have one "Active" mandate at a time: a second mandate is refused until the first one is revoked or sold.',
      'No e-mail or message is sent to the seller on creation. To have the seller sign the mandate, use the "Signatures" tab of the mandate page.'
    ],
    faq: [
      {
        q: 'Where is the "Sold" status in the filters?',
        a: 'In the Status criterion it is called "Completed"; in the table, the same status is shown as "Sold".'
      },
      {
        q: 'How do I find mandates past their due date?',
        a: 'Open "More filters" and turn on "Overdue": the list keeps only active mandates whose end date has passed.'
      },
      {
        q: 'I cannot create a mandate.',
        a: 'You need the "Edit deals" permission. If your pack is limited to your own properties, creating a mandate may also be refused.'
      }
    ],
    permissions: {
      feature: 'SALES',
      note: 'View: "View deals". Create a mandate: "Edit deals".'
    },
    related: [
      { label: 'How to read the mandates table', helpId: 'commercial.ventes.mandats.tableau' },
      { label: 'Create a sale mandate', helpId: 'commercial.ventes.mandats.nouveau' }
    ],
    keywords: ['sale mandate', 'mandates', 'sell a property', 'owner', 'fees', 'exclusive', 'create a mandate'],
    tour: {
      steps: [
        {
          target: 'mandats-nouveau',
          title: 'Create a mandate',
          description: 'This button opens the form: property, seller, asking price, fees and period.'
        },
        {
          target: 'mandats-tableau',
          title: 'The mandates list',
          description: 'One row per mandate. Click the number to open the page and manage offers.'
        }
      ]
    }
  },
  {
    id: 'commercial.ventes.mandats.tableau',
    kind: 'table',
    title: 'Sale mandates table',
    summary:
      'Each row is a sale mandate of your agency: property, seller, asking price, type, number of offers and status.',
    howToRead: {
      columns: [
        {
          key: 'numero',
          label: 'Number',
          description: 'The mandate number (MV-year-number). Click it to open the page.'
        },
        { key: 'bien', label: 'Property', description: 'The reference and title of the property.' },
        { key: 'vendeur', label: 'Seller', description: 'The owner who gave the mandate.' },
        { key: 'prix', label: 'Asking price', description: 'The desired sale price, in FCFA.' },
        { key: 'type', label: 'Type', description: '"Simple" or "Exclusive".' },
        { key: 'offres', label: 'Offers', description: 'The total number of offers received, all statuses included.' },
        { key: 'statut', label: 'Status', description: 'The state of the mandate (see the statuses below).' }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Active',
          description: 'The mandate is in progress: offers can be recorded and decided.'
        },
        {
          value: 'EXPIRED',
          label: 'Expired',
          description: 'The mandate is still active but its due date has passed. Revoke it or follow it up.'
        },
        {
          value: 'REVOKED',
          label: 'Revoked',
          description: 'The mandate was stopped with a reason. It no longer receives offers.'
        },
        {
          value: 'COMPLETED',
          label: 'Sold',
          description:
            'A sale deed has been signed: the mandate is finished. The search criterion calls it "Completed".'
        }
      ],
      notes: [
        'Inline criteria: Status and Mandate type. Under "More filters": Due date, Mandate start, Asking price (FCFA) and Overdue.',
        'The export (Excel, CSV or PDF) covers all mandates matching your criteria. On a phone, each mandate is shown as a card with its status.'
      ]
    },
    faq: [
      {
        q: 'Can an "Expired" mandate still receive offers?',
        a: 'Yes, as long as it is not revoked: only the due date has passed, its stored status remains "Active".'
      },
      {
        q: 'How do I make a mandate disappear from the list?',
        a: 'A mandate cannot be deleted. Revoke it from its page, then filter on the "Active" status to stop seeing it.'
      }
    ],
    related: [{ label: 'A mandate page', helpId: 'commercial.ventes.mandat' }],
    keywords: ['mandate', 'mandate status', 'revoked', 'sold', 'expired', 'asking price', 'export']
  },
  {
    id: 'commercial.ventes.mandats.nouveau',
    kind: 'section',
    title: 'New sale mandate',
    summary:
      'This form records the mandate given by an owner: property, seller, asking price, fees, listing agent and period.',
    steps: [
      {
        title: 'Choose the property and the seller',
        detail: "The seller is chosen among your agency's owners; the property is searched by reference or title."
      },
      { title: 'Choose the mandate type', detail: '"Simple" (default) or "Exclusive".' },
      {
        title: 'Enter the prices',
        detail:
          '"Asking price" is required. "Floor price (confidential)" is optional and cannot exceed the asking price.'
      },
      {
        title: 'Set the fees',
        detail:
          'Choose "Percentage" (rate above 0 and at most 20 %) or "Flat fee" (amount in FCFA), then who pays: "Seller" or "Buyer".'
      },
      {
        title: 'Assign a listing agent',
        detail: 'Optional: an active agency member and their share, from 0 to 100 %.'
      },
      {
        title: 'Set the period',
        detail: 'The start date is required (today by default); the end date is optional and cannot precede the start.'
      },
      { title: 'Create', detail: 'Click "Create the mandate": the new mandate\'s page opens.' }
    ],
    consequences: [
      'The mandate gets a number (MV-year-number) and the "Active" status. The property status does not change.',
      'Creation is refused if the property already has an active sale mandate.',
      "The fees and the agent's share are used later to calculate the commission, when the sale deed is signed. The floor price, the notes and the agent's share do not appear in the mandate PDF sent for signature."
    ],
    faq: [
      {
        q: 'I cannot find my seller in the list.',
        a: 'The list only contains agency clients with the Owner role. First convert the contact into an owner from the CRM.'
      },
      {
        q: 'Why is the fee rate refused?',
        a: 'The rate must be above 0 and not exceed 20 %. Beyond that, use a "Flat fee".'
      },
      {
        q: 'Can the mandate be edited after creation?',
        a: 'Not from this screen: the mandate page shows its information but has no edit button. If there is a mistake, revoke the mandate and create a new one.'
      }
    ],
    permissions: { feature: 'SALES', note: 'Requires the "Edit deals" permission.' },
    related: [{ label: 'A mandate page', helpId: 'commercial.ventes.mandat' }],
    keywords: [
      'create a mandate',
      'new mandate',
      'fees',
      'floor price',
      'listing agent',
      'percentage',
      'flat fee',
      'seller'
    ]
  },

  // ---------------------------------------------------------------------------
  // Mandate page
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.ventes.mandat',
    kind: 'page',
    title: 'Sale mandate page',
    summary:
      "This page gathers the terms of the mandate and tracks the sale: buyers' offers, agreement, signatures and history.",
    purpose:
      'This is where you record each offer, reply with a counter-offer, accept or decline, then create the agreement from the accepted offer. The top of the page recalls the property, seller, prices, fees and dates.',
    steps: [
      {
        title: 'Read the terms',
        detail:
          'The top frame shows the property, seller, asking price, floor price, fees, listing agent, signature and period.'
      },
      { title: 'Record an offer', detail: '"Offers" tab, "New offer" button.' },
      { title: 'Reply to an offer', detail: 'On the offer\'s row: "Counter-offer", "Accept" or "Decline".' },
      {
        title: 'Create the agreement',
        detail: 'On an "Accepted" offer, click "Create the agreement"; the agreement page opens.'
      },
      { title: 'Have the mandate signed', detail: '"Signatures" tab, "Send for signature" button.' },
      { title: 'Stop the mandate', detail: 'Header actions menu, "Revoke the mandate", with a reason.' }
    ],
    consequences: [
      'Accepting an offer sets the property to "Reserved". A signed agreement sets it to "Under offer", and the signed deed to "Sold".',
      'When the deed is signed, the mandate becomes "Sold" and offers still pending become "Declined".',
      'A "Sold" or "Revoked" mandate is closed: no offer is decided on it and none is added.'
    ],
    faq: [
      {
        q: 'Why is "New offer" greyed out?',
        a: 'The mandate is no longer "Active": it is sold or revoked. Offers can only be added to an active mandate.'
      },
      {
        q: 'Why is there no "Revoke the mandate" button?',
        a: 'It only appears on an "Active" mandate with no agreement in the "Signed" status.'
      },
      {
        q: 'Where do I change the mandate price?',
        a: 'This page does not allow it. To change the terms, revoke the mandate and create a new one.'
      }
    ],
    permissions: {
      feature: 'SALES',
      note: 'View: "View deals". Offers, agreements, signatures and revocation: "Edit deals".'
    },
    related: [
      { label: 'The mandate terms', helpId: 'commercial.ventes.mandat.fiche' },
      { label: 'Offers received', helpId: 'commercial.ventes.mandat.offres' },
      { label: 'The sale agreement', helpId: 'commercial.ventes.compromis' },
      { label: 'Revoke the mandate', helpId: 'commercial.ventes.mandat.revoquer' }
    ],
    keywords: ['mandate', 'offer', 'buyer', 'counter-offer', 'revoke', 'agreement', 'seller', 'floor price'],
    tour: {
      steps: [
        {
          target: 'mandat-fiche',
          title: 'The mandate terms',
          description: 'Property, seller, prices, fees, listing agent and dates. The floor price is visible here only.'
        },
        {
          target: 'mandat-nouvelle-offre',
          title: 'Record an offer',
          description: 'Enter the buyer, the amount and the financing of an offer you received.'
        },
        {
          target: 'mandat-offres',
          title: 'Reply to offers',
          description:
            "Counter-offer, acceptance or refusal are done on the offer's row. An accepted offer lets you create the agreement."
        },
        {
          target: 'mandat-onglets',
          title: 'Agreement, signatures, history',
          description: 'Switch tabs to follow the agreement, send the mandate for signature or see its key dates.'
        }
      ]
    }
  },
  {
    id: 'commercial.ventes.mandat.fiche',
    kind: 'section',
    title: 'Mandate terms',
    summary:
      'The frame at the top of the page recaps the mandate: property, seller, type, status, prices, fees, listing agent, signature and dates.',
    howToRead: {
      notes: [
        'Asking price and Floor price: the floor price is confidential, it is not printed in the mandate PDF. A dash (—) means it is not filled in.',
        'Fees: "5 % (Seller)" means a percentage of the agreed price paid by the seller; "Flat fee … (Buyer)" a fixed amount paid by the buyer.',
        'Signature: "Signed on …" once the mandate has been signed electronically; otherwise "Not signed".',
        'Status: "Active", "Expired" (due date passed), "Revoked" or "Sold".',
        'Co-sellers (joint ownership): when the property has several owners, a table below lists each co-owner with their share in %.'
      ]
    },
    faq: [
      {
        q: 'Who sees the floor price?',
        a: 'Anyone in the agency who can open the page. It appears neither in the mandate PDF nor in the lists.'
      },
      {
        q: 'Why is the status "Expired" when I did nothing?',
        a: 'The due date has passed. The mandate stays active until you revoke it.'
      }
    ],
    related: [{ label: 'Revoke the mandate', helpId: 'commercial.ventes.mandat.revoquer' }],
    keywords: ['terms', 'fees', 'floor price', 'co-sellers', 'joint ownership', 'listing agent', 'mandate signature']
  },
  {
    id: 'commercial.ventes.mandat.offres',
    kind: 'table',
    title: 'Offers received on the mandate',
    summary: "Each row is a buyer's offer on this mandate. You reply with a counter-offer, an acceptance or a refusal.",
    howToRead: {
      columns: [
        { key: 'numero', label: 'Number', description: 'The offer number (OA-year-number).' },
        { key: 'acquereur', label: 'Buyer', description: 'The CRM contact making the offer.' },
        { key: 'montant', label: 'Amount', description: 'The proposed amount, in FCFA.' },
        {
          key: 'contre-offre',
          label: 'Counter-offer',
          description: 'The amount you proposed in return, or a dash (—) if there is none.'
        },
        { key: 'financement', label: 'Financing', description: '"Cash", "Credit" or "Mixed".' },
        { key: 'statut', label: 'Status', description: 'The state of the offer (see the statuses below).' },
        {
          key: 'actions',
          label: 'Actions',
          description:
            'The possible replies depending on the status; "View the agreement" when the offer already has an agreement.'
        }
      ],
      statuses: [
        { value: 'SUBMITTED', label: 'Submitted', description: 'The offer is waiting for your reply.' },
        {
          value: 'COUNTERED',
          label: 'Counter-offer',
          description:
            'You proposed another amount. The offer can still be accepted, declined or receive a new counter-offer.'
        },
        {
          value: 'ACCEPTED',
          label: 'Accepted',
          description:
            'The offer is retained and the property is "Reserved". The agreed price is the counter-offer amount if there is one, otherwise the offer amount.'
        },
        {
          value: 'REJECTED',
          label: 'Declined',
          description: 'Declined with a reason, or closed automatically when the mandate is sold or revoked.'
        },
        {
          value: 'WITHDRAWN',
          label: 'Withdrawn',
          description:
            'The offer was withdrawn with a reason. Withdrawal is only possible on an accepted offer with no agreement in progress.'
        },
        {
          value: 'EXPIRED',
          label: 'Expired',
          description:
            'Status displayed when the "Valid until" date has passed on a "Submitted" or "Counter-offer" offer. It is not a stored status.'
        }
      ],
      notes: [
        'With more than 10 offers, a search bar (number, buyer, financing) and Status, Financing and Amount criteria appear above the table.',
        'Reply buttons only show on an "Active" mandate.'
      ]
    },
    steps: [
      { title: 'Record the offer', detail: '"New offer" at the top of the tab.' },
      {
        title: 'Reply',
        detail:
          '"Counter-offer" asks for an amount; "Decline" asks for a reason of at least 3 characters; "Accept" asks for confirmation.'
      },
      { title: 'Move to the agreement', detail: 'On an "Accepted" offer, "Create the agreement".' }
    ],
    consequences: [
      '"Accept" sets the property to "Reserved". Only one accepted offer is possible at a time on a mandate, unless the first one\'s agreement is cancelled.',
      '"Remove" (accepted offer with no agreement in progress) sets the property back to "Available" and requires a reason.',
      'No e-mail or message is sent to the buyer: inform them yourself.'
    ],
    faq: [
      {
        q: 'I cannot see the reply buttons.',
        a: 'They only appear on an "Active" mandate and on an offer that is "Submitted", in "Counter-offer" or "Accepted". They also require the "Edit deals" permission.'
      },
      {
        q: 'What happens to an offer whose agreement is cancelled?',
        a: 'It stays "Accepted" but its agreement is cancelled: you can then accept another offer on the mandate.'
      },
      {
        q: 'Can I correct the amount of an offer?',
        a: 'No. Make a counter-offer, or decline the offer and record a new one.'
      }
    ],
    related: [
      { label: 'Record an offer', helpId: 'commercial.ventes.mandat.nouvelle-offre' },
      { label: 'Reply to an offer', helpId: 'commercial.ventes.mandat.decision' },
      { label: 'Create the agreement', helpId: 'commercial.ventes.mandat.creer-compromis' }
    ],
    keywords: ['offer', 'offers', 'buyer', 'counter-offer', 'accept', 'decline', 'remove', 'financing', 'reserved']
  },
  {
    id: 'commercial.ventes.mandat.nouvelle-offre',
    kind: 'section',
    title: 'New offer',
    summary: 'This form records a buyer\'s offer on the mandate. The offer starts with the "Submitted" status.',
    steps: [
      { title: 'Choose the buyer', detail: 'Required: a contact from your CRM, searched by name.' },
      {
        title: 'Link a deal',
        detail: 'Optional: "Originating CRM deal" offers the buyer\'s deals that are still open.'
      },
      { title: 'Enter the amount', detail: 'Amount in FCFA, above 0.' },
      { title: 'Choose the financing', detail: '"Cash" (default), "Credit" or "Mixed".' },
      { title: 'Specify validity and terms', detail: '"Valid until" and "Terms" are optional.' },
      { title: 'Save', detail: 'Click "Save".' }
    ],
    consequences: [
      'The offer gets a number (OA-year-number) and the "Submitted" status. It counts in "Open offers" on the dashboard as long as its validity date has not passed.',
      'The property status does not change and no message is sent to the buyer.',
      'If you link a CRM deal, it moves to the "Won" stage when the sale deed is signed.'
    ],
    faq: [
      {
        q: 'Why is the buyer not in the list?',
        a: 'They must first exist as a contact in your CRM. Create them, then come back to record the offer.'
      },
      {
        q: 'What is "Valid until" for?',
        a: 'After this date, the offer shows as "Expired" and is no longer counted in "Open offers".'
      }
    ],
    permissions: { feature: 'SALES', note: 'Requires the "Edit deals" permission.' },
    related: [{ label: 'Offers received on the mandate', helpId: 'commercial.ventes.mandat.offres' }],
    keywords: ['new offer', 'buyer', 'amount', 'financing', 'cash', 'credit', 'validity']
  },
  {
    id: 'commercial.ventes.mandat.decision',
    kind: 'section',
    title: 'Reply to an offer',
    summary: 'This window records your reply to an offer: counter-offer, acceptance, refusal or withdrawal.',
    steps: [
      { title: 'Counter-offer', detail: 'Enter the amount you propose in return, then "Confirm".' },
      { title: 'Accept', detail: 'Confirm: the offer is retained and the property becomes "Reserved".' },
      { title: 'Decline or Remove', detail: 'Enter a reason of at least 3 characters, then "Confirm".' }
    ],
    consequences: [
      'A counter-offer sets the offer to "Counter-offer"; if you accept it afterwards, the agreed price is the counter-offer amount.',
      'A refusal is final: the offer becomes "Declined" and is not reopened. A withdrawal sets the offer to "Withdrawn" and the property back to "Available".',
      'No message is sent to the buyer. Each decision keeps its date, author and reason.'
    ],
    faq: [
      {
        q: 'Why is "Remove" only offered on an accepted offer?',
        a: 'Pending offers are handled with "Decline". "Remove" is used to undo an acceptance, as long as the agreement is not created.'
      },
      {
        q: 'Can I undo a refusal made by mistake?',
        a: "No. Record a new offer in the buyer's name."
      }
    ],
    permissions: { feature: 'SALES', note: 'Requires the "Edit deals" permission.' },
    related: [{ label: 'Offers received on the mandate', helpId: 'commercial.ventes.mandat.offres' }],
    keywords: ['counter-offer', 'accept', 'decline', 'remove', 'decision', 'reserved']
  },
  {
    id: 'commercial.ventes.mandat.creer-compromis',
    kind: 'section',
    title: 'Create the agreement',
    summary:
      'This window creates the sale agreement from an accepted offer, with the agreed price, the deposit, the notary and the expected deed date.',
    steps: [
      {
        title: 'Check the agreed price',
        detail: 'It is prefilled with the counter-offer amount, otherwise the offer amount.'
      },
      {
        title: 'Fill in the deposit',
        detail: 'The "Buyer\'s deposit" is optional; "Deposit held by" offers "Notary" (default) or "Seller".'
      },
      { title: 'Add the notary and the date', detail: '"Notary" and "Expected deed date" are optional.' },
      { title: 'Create', detail: 'Click "Create": the agreement page opens.' }
    ],
    consequences: [
      'The agreement starts as "Draft" (number CV-year-number). The property status does not change yet: it becomes "Under offer" when the agreement is signed.',
      'Only one agreement is possible per offer. What is entered here stays editable from the agreement page, until the deed is signed or the agreement is cancelled.'
    ],
    faq: [
      {
        q: 'Why is there no "Create the agreement" button?',
        a: 'It only appears on an "Accepted" offer that has no agreement yet, on an "Active" mandate.'
      }
    ],
    permissions: { feature: 'SALES', note: 'Requires the "Edit deals" permission.' },
    related: [{ label: 'The agreement page', helpId: 'commercial.ventes.compromis' }],
    keywords: ['agreement', 'create the agreement', 'agreed price', 'deposit', 'notary', 'accepted offer']
  },
  {
    id: 'commercial.ventes.mandat.compromis',
    kind: 'section',
    title: 'Mandate Agreement tab',
    summary:
      "This tab lists the sale agreements arising from this mandate's offers, with their price, buyer and status.",
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: 'Agreement created, not yet signed.' },
        { value: 'SIGNED', label: 'Signed', description: 'Agreement signed; the deed is not yet completed.' },
        {
          value: 'COMPLETED',
          label: 'Deed signed',
          description: 'The authentic deed is signed: the property is sold.'
        },
        { value: 'CANCELLED', label: 'Cancelled', description: 'Agreement cancelled with a reason.' }
      ]
    },
    steps: [{ title: 'Open an agreement', detail: 'Click "Open" at the right of the row.' }],
    consequences: [
      'If no agreement exists, the tab explains that it is created from the "Offers" tab, once an offer is accepted.'
    ],
    related: [{ label: 'The agreement page', helpId: 'commercial.ventes.compromis' }],
    keywords: ['agreement', 'sale promise', 'agreement tab']
  },
  {
    id: 'commercial.ventes.mandat.signatures',
    kind: 'section',
    title: 'Mandate signatures',
    summary:
      'This tab sends the sale mandate for electronic signature to the seller, co-sellers and listing agent, and keeps track of the requests.',
    steps: [
      {
        title: 'Send for signature',
        detail: 'Click "Send for signature", check the proposed signers (seller, co-sellers, listing agent), then send.'
      },
      {
        title: 'Follow the request',
        detail: 'Each request shows its signers. You can "Send reminder", "Cancel the request" or "Sign in person".'
      },
      {
        title: 'Download',
        detail: '"Source PDF" gives the document sent; "Signed PDF" is offered once signing is complete.'
      }
    ],
    consequences: [
      "Each signer is invited through the channel chosen when sending (e-mail by default). The PDF is produced on the fly from the mandate data; the floor price, the notes and the agent's share never appear in it.",
      'Once signing is complete, the page shows "Signed on …" on the "Signature" line. A signed mandate cannot be sent for signature again.',
      'Only an "Active" mandate can be sent for signature, and one request can be open at a time.'
    ],
    faq: [
      {
        q: 'The "Send for signature" button is greyed out.',
        a: 'A request is already open (remind or cancel it), or the mandate is no longer active, or you do not have the "Edit deals" permission.'
      },
      {
        q: 'Where do I see the signed document?',
        a: 'In the request, with the "Signed PDF" button, available when all signers have signed.'
      }
    ],
    permissions: { feature: 'SALES', note: 'Sending and cancelling: "Edit deals".' },
    related: [{ label: 'The mandate page', helpId: 'commercial.ventes.mandat' }],
    keywords: ['signature', 'sign the mandate', 'electronic signature', 'seller', 'co-seller', 'signed pdf']
  },
  {
    id: 'commercial.ventes.mandat.revoquer',
    kind: 'section',
    title: 'Revoke the mandate',
    summary: 'This window stops an active sale mandate. It requires a reason of at least 3 characters.',
    steps: [
      { title: 'Open the window', detail: 'In the page header, choose "Revoke the mandate".' },
      { title: 'Enter the reason', detail: 'At least 3 characters.' },
      { title: 'Confirm', detail: 'Click "Revoke".' }
    ],
    consequences: [
      'The action is final: the mandate becomes "Revoked" and is not reopened. It remains viewable with its reason, in the "History" tab.',
      'Offers still pending become "Declined" (reason "Mandat révoqué") and open signature requests are cancelled.',
      'Revocation is refused if an accepted offer is still in progress (remove it first) or if an agreement is "Signed".'
    ],
    faq: [
      {
        q: 'Why does "Revoke the mandate" not appear?',
        a: 'The mandate is no longer "Active", or an agreement is already signed. In the latter case, cancel the agreement first.'
      },
      {
        q: 'Is the seller notified?',
        a: 'No, no message is sent. Inform them yourself.'
      }
    ],
    permissions: { feature: 'SALES', note: 'Requires the "Edit deals" permission.' },
    related: [{ label: 'The mandate page', helpId: 'commercial.ventes.mandat' }],
    keywords: ['revoke', 'revocation', 'stop a mandate', 'cancel a mandate', 'reason']
  },

  // ---------------------------------------------------------------------------
  // Agreement page
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.ventes.compromis',
    kind: 'page',
    title: 'Sale agreement page',
    summary:
      "This page follows the agreement from start to finish: price, deposit, notary, conditions precedent, buyer's payment schedule, signatures, deed and commission.",
    purpose:
      'The agreement sets the terms of the sale between seller and buyer before the deed at the notary\'s. It goes from "Draft" to "Signed", then to "Deed signed" when the sale is concluded.',
    steps: [
      {
        title: 'Complete the agreement',
        detail: 'Fill in price, deposit, notary and expected deed date, then "Save".'
      },
      {
        title: 'List the conditions precedent',
        detail: 'Add them in draft with "Add" (e.g. obtaining the bank loan).'
      },
      { title: 'Plan the payments', detail: 'Enter the buyer\'s payment schedule, then "Save the schedule".' },
      {
        title: 'Have it signed',
        detail:
          'Send the agreement for electronic signature, or click "Sign the agreement" to record a signature already obtained.'
      },
      {
        title: 'Complete the deed',
        detail: 'Once the conditions are met or waived, "Complete the deed" with the date of the authentic deed.'
      }
    ],
    consequences: [
      'Signing the agreement sets the property to "Under offer". Cancelling the agreement (draft or signed) sets the property back to "Available".',
      'Completing the deed concludes the sale: the property becomes "Sold", the mandate "Sold", offers still pending "Declined", the CRM deal linked to the offer "Won", and the commission is created.',
      'These operations cannot be undone from the screen. No e-mail or message is sent to the seller or buyer by these buttons.'
    ],
    faq: [
      {
        q: 'Why is "Complete the deed" greyed out?',
        a: 'A condition precedent is still "Pending" or "Failed". All must be "Met" or "Waived".'
      },
      {
        q: 'Why is "Sign the agreement" greyed out?',
        a: 'An electronic signature request is open: cancel it first, otherwise let it run its course.'
      },
      {
        q: 'What happens to the commission if I cancel?',
        a: 'It does not exist yet: the commission is only created when the deed is completed. A cancelled agreement generates none.'
      },
      {
        q: 'Can a signed agreement be modified?',
        a: 'Yes, until the deed: price, deposit, notary, date and schedule remain editable. After "Deed signed" or "Cancelled", the page is locked.'
      }
    ],
    permissions: {
      feature: 'SALES',
      note: 'View: "View deals". All actions: "Edit deals".'
    },
    related: [
      { label: 'Price, deposit and notary', helpId: 'commercial.ventes.compromis.prix-depot' },
      { label: 'Conditions precedent', helpId: 'commercial.ventes.compromis.conditions' },
      { label: "Buyer's payment schedule", helpId: 'commercial.ventes.compromis.echeancier' },
      { label: 'Sign, complete the deed, cancel', helpId: 'commercial.ventes.compromis.etapes' },
      { label: 'The commission', helpId: 'commercial.ventes.compromis.commission' }
    ],
    keywords: [
      'agreement',
      'sale promise',
      'authentic deed',
      'notary',
      'conditions precedent',
      'payment schedule',
      'sign',
      'cancel'
    ],
    tour: {
      steps: [
        {
          target: 'compromis-etapes',
          title: 'Where the sale stands',
          description:
            'The progress bar shows Draft, Signed then Deed with dates. A cancelled agreement shows a red banner instead.'
        },
        {
          target: 'compromis-conditions',
          title: 'The conditions precedent',
          description: 'Each condition must be "Met" or "Waived" before completing the deed.'
        },
        {
          target: 'compromis-echeancier',
          title: "The buyer's payment schedule",
          description: 'Enter the planned payments, then save the schedule.'
        },
        {
          target: 'compromis-actions',
          title: 'Sign or complete the deed',
          description: '"Sign the agreement" in draft; "Complete the deed" once signed and the conditions are settled.'
        },
        {
          target: 'compromis-commission',
          title: 'The commission',
          description: 'It appears here after the deed is signed.'
        }
      ]
    }
  },
  {
    id: 'commercial.ventes.compromis.prix-depot',
    kind: 'section',
    title: 'Price, deposit and notary',
    summary:
      "This form sets the agreement terms: agreed price, buyer's deposit, who holds it, notary and expected deed date.",
    howToRead: {
      notes: [
        'Agreed price: the sale price, in FCFA. It is the basis of the commission calculation.',
        'Buyer\'s deposit: the sum paid at signing, optional. "Deposit held by": "Notary" or "Seller".',
        'Expected deed date: a forecast that blocks nothing; the actual date is entered when completing the deed.'
      ]
    },
    steps: [{ title: 'Edit', detail: 'Change the fields then click "Save".' }],
    consequences: [
      'The form is editable while the agreement is "Draft" or "Signed"; it is locked after "Deed signed" or "Cancelled".',
      'If the agreement was sent for signature and you change price, deposit, notary or expected date, the open signature request is cancelled: send it again.'
    ],
    faq: [
      {
        q: 'The fields are greyed out.',
        a: 'The agreement is "Deed signed" or "Cancelled": it can no longer be modified.'
      },
      {
        q: 'Does changing the price change the commission?',
        a: 'Yes, if you do it before the deed: the commission is calculated on the agreed price at the time the deed is completed.'
      }
    ],
    permissions: { feature: 'SALES', note: 'Requires the "Edit deals" permission.' },
    related: [{ label: 'The commission', helpId: 'commercial.ventes.compromis.commission' }],
    keywords: ['agreed price', 'deposit', 'down payment', 'notary', 'deed date']
  },
  {
    id: 'commercial.ventes.compromis.signatures',
    kind: 'section',
    title: 'Agreement signatures',
    summary:
      'This card sends the agreement for electronic signature to the seller, buyer and listing agent, and keeps track of the requests.',
    steps: [
      {
        title: 'Send for signature',
        detail: 'Available while the agreement is "Draft": "Send for signature", check the signers, then send.'
      },
      {
        title: 'Follow up',
        detail: '"Send reminder", "Cancel the request" or "Sign in person" depending on each signer\'s state.'
      },
      { title: 'Download', detail: '"Source PDF" and, once signed, "Signed PDF".' }
    ],
    consequences: [
      'When everyone has signed, the agreement becomes "Signed" by itself and the property "Under offer", as with "Sign the agreement".',
      'Any change to a printed field (price, deposit, notary, expected date, conditions, schedule) after sending cancels the open request.',
      'If your agency requires a qualified signature provider, a warning says so and sending is disabled: in that case, use "Sign the agreement" after a paper signature.'
    ],
    faq: [
      {
        q: 'Why is sending disabled?',
        a: 'The agreement is no longer "Draft", a request is already open, or a qualified provider is required (warning shown in the card).'
      },
      {
        q: 'Where are the signatures of a signed or completed agreement?',
        a: 'In this same card, the request history stays displayed; it only disappears if the agreement is cancelled.'
      }
    ],
    permissions: { feature: 'SALES', note: 'Sending and cancelling: "Edit deals".' },
    related: [{ label: 'Sign, complete the deed, cancel', helpId: 'commercial.ventes.compromis.etapes' }],
    keywords: ['electronic signature', 'sign the agreement', 'signed pdf', 'reminder', 'signers']
  },
  {
    id: 'commercial.ventes.compromis.conditions',
    kind: 'table',
    title: 'Conditions precedent',
    summary:
      'Conditions precedent are what must happen for the sale to go through, for example obtaining the bank loan.',
    howToRead: {
      columns: [
        { key: 'label', label: 'Condition', description: 'The text of the condition.' },
        { key: 'echeance', label: 'Due date', description: 'The planned deadline, or a dash (—) if none.' },
        {
          key: 'statut',
          label: 'Status',
          description: 'A menu to change the state while the agreement is editable; otherwise the state as text.'
        },
        { key: 'actions', label: 'Actions', description: '"Delete", only possible while the agreement is "Draft".' }
      ],
      statuses: [
        {
          value: 'PENDING',
          label: 'Pending',
          description: 'The condition is not settled yet. It blocks completing the deed.'
        },
        { value: 'MET', label: 'Met', description: 'The condition is fulfilled. It no longer blocks.' },
        {
          value: 'FAILED',
          label: 'Failed',
          description: 'The condition was not fulfilled. It blocks completing the deed.'
        },
        { value: 'WAIVED', label: 'Waived', description: 'The condition is given up. It no longer blocks.' }
      ]
    },
    steps: [
      { title: 'Add', detail: 'In draft, "Add" opens a window: label required, due date optional.' },
      { title: 'Update', detail: "Change the status in the row's menu." }
    ],
    consequences: [
      'The deed can only be completed if all conditions are "Met" or "Waived".',
      'Adding or deleting a condition, or changing its label or due date, cancels the open signature request; changing only its status does not.',
      'A condition can only be deleted while the agreement is "Draft".'
    ],
    faq: [
      {
        q: 'I have no "Add" button.',
        a: 'It is only offered in "Draft". After signing, you can only change the status of existing conditions.'
      },
      {
        q: 'A condition is "Failed": what should I do?',
        a: 'Completing the deed stays blocked. Set it to "Waived" if the parties give it up, or cancel the agreement.'
      }
    ],
    related: [{ label: 'Sign, complete the deed, cancel', helpId: 'commercial.ventes.compromis.etapes' }],
    keywords: ['condition precedent', 'bank loan', 'loan approval', 'waived', 'met', 'blocks the deed']
  },
  {
    id: 'commercial.ventes.compromis.echeancier',
    kind: 'section',
    title: "Buyer's payment schedule",
    summary: 'This card lists the payments the buyer must make (deposit, balance...) with their date and amount.',
    howToRead: {
      columns: [
        { key: 'label', label: 'Label', description: 'The name of the payment, for example "Balance at the deed".' },
        { key: 'dueDate', label: 'Due date', description: 'The planned payment date.' },
        { key: 'amount', label: 'Amount', description: 'The payment amount, in FCFA.' },
        { key: 'paidAt', label: 'Paid on', description: 'The date the buyer paid, to be filled in by hand.' }
      ],
      notes: [
        'The total of the lines is shown next to the buttons. A warning appears if this total exceeds the agreed price.'
      ]
    },
    steps: [
      { title: 'Add', detail: '"Add a milestone" creates an empty row to fill in.' },
      { title: 'Delete a row', detail: 'The red button at the right of the row removes it.' },
      { title: 'Save', detail: '"Save the schedule" sends the whole list at once.' }
    ],
    consequences: [
      'Nothing is saved until you click "Save the schedule". Saving replaces the whole list; a row without a label or without an amount above 0 is refused.',
      'The schedule is a tracking tool: it collects nothing and creates no accounting entry.',
      'Changing the label, due date or amount of a row cancels the open signature request; the "Paid on" date is not printed.'
    ],
    faq: [
      {
        q: 'The total exceeds the price, can I still save?',
        a: 'Yes, the warning is not blocking: do check your amounts though.'
      },
      {
        q: 'Is the schedule taken into account in the commission?',
        a: 'No. The commission is calculated on the agreed price, not on the schedule.'
      }
    ],
    permissions: { feature: 'SALES', note: 'Requires the "Edit deals" permission.' },
    related: [{ label: 'The commission', helpId: 'commercial.ventes.compromis.commission' }],
    keywords: ['payment schedule', 'payments', 'buyer', 'balance', 'down payment', 'milestone']
  },
  {
    id: 'commercial.ventes.compromis.commission',
    kind: 'section',
    title: 'Agreement commission',
    summary: "This card shows the agency's commission on this sale, created automatically when the deed is signed.",
    howToRead: {
      notes: [
        'Amount excl. tax: with a mandate in "Percentage", the agreed price multiplied by the mandate rate; with a "Flat fee", the mandate\'s flat fee. The result is rounded to the unit in FCFA.',
        'VAT: applied only if your agency is registered for VAT in its financial settings, at the rate of that setting; otherwise it is 0.',
        'Amount incl. tax: amount excl. tax plus VAT. "Balance due": incl. tax amount minus recorded payments.',
        "Agent's share: the part of the fees excl. tax going to the listing agent, in proportion to what has been collected (the percentage is the mandate's).",
        'Status: see the statuses of the "Sale commissions" screen.'
      ]
    },
    consequences: [
      'Before the deed, the card states that the commission will be created when the authentic deed is signed.',
      "The amounts are fixed at creation, based on the mandate, the agreement price and the agency's VAT at that moment.",
      'To collect, open "View sale commissions".'
    ],
    related: [{ label: 'Sale commissions', helpId: 'commercial.ventes.commissions' }],
    keywords: ['commission', 'fees', 'vat', 'amount incl. tax', 'balance due', "agent's share"]
  },
  {
    id: 'commercial.ventes.compromis.etapes',
    kind: 'section',
    title: 'Sign, complete the deed, cancel',
    summary:
      'These three windows move the agreement forward: "Sign the agreement", "Complete the deed" and "Cancel the agreement".',
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: 'Agreement created, not yet signed.' },
        { value: 'SIGNED', label: 'Signed', description: 'Agreement signed; the deed remains to be completed.' },
        { value: 'COMPLETED', label: 'Deed signed', description: 'The sale is concluded; the page is locked.' },
        {
          value: 'CANCELLED',
          label: 'Cancelled',
          description: 'The agreement is cancelled with a reason; the page is locked.'
        }
      ]
    },
    steps: [
      { title: 'Sign the agreement', detail: 'Available in "Draft": choose the signing date, then "Sign".' },
      {
        title: 'Complete the deed',
        detail: 'Available in "Signed": choose the date of the authentic deed, then "Confirm".'
      },
      {
        title: 'Cancel the agreement',
        detail:
          'Available in "Draft" or "Signed": enter a reason of at least 3 characters, then "Cancel the agreement".'
      }
    ],
    consequences: [
      'Sign: the agreement becomes "Signed" and the property "Under offer". An electronic signature request still open is cancelled.',
      'Complete the deed: irreversible. The agreement becomes "Deed signed", the property "Sold" and unavailable, the mandate "Sold"; pending offers become "Declined" (reason "Bien vendu"); the CRM deal linked to the offer becomes "Won"; the commission is created.',
      'Cancel: irreversible. The agreement becomes "Cancelled" and the property goes back to "Available". The mandate stays "Active" and the offer stays "Accepted": you can accept another one.',
      'No e-mail or message is sent to the parties by these actions.'
    ],
    faq: [
      {
        q: 'Can I go back after "Complete the deed"?',
        a: 'No, not from the screen: the agreement is locked and the commission created. Check the date and the conditions before confirming.'
      },
      {
        q: 'What is the difference between "Sign the agreement" and electronic signature sending?',
        a: '"Sign the agreement" records a signature already obtained (paper). Electronic sending has people sign online and marks the agreement "Signed" at the end.'
      }
    ],
    permissions: { feature: 'SALES', note: 'Requires the "Edit deals" permission.' },
    related: [
      { label: 'Conditions precedent', helpId: 'commercial.ventes.compromis.conditions' },
      { label: 'The commission', helpId: 'commercial.ventes.compromis.commission' }
    ],
    keywords: ['sign', 'complete the deed', 'authentic deed', 'cancel the agreement', 'sold', 'signing date']
  },

  // ---------------------------------------------------------------------------
  // Sale commissions
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.ventes.commissions',
    kind: 'page',
    title: 'Sale commissions',
    summary:
      "Here you find your agency's commissions on concluded sales, what has been collected and what remains due. This is also where you record a payment.",
    purpose:
      'A commission is created automatically when the sale deed is signed. The payer (seller or buyer) pays it in one or several instalments; each payment is recorded in the accounts.',
    steps: [
      {
        title: 'Read the totals',
        detail:
          'The three cards at the top (Total incl. tax, Collected, Balance due) cover all commissions matching your criteria.'
      },
      {
        title: 'Search and filter',
        detail:
          'Search a number, an agreement, a property, a payer or a listing agent. Criteria: Status, Issue date, Amount incl. tax, Payer, With an outstanding balance.'
      },
      { title: 'Collect', detail: 'Click "Collect" on the row, fill in the window, then "Collect".' },
      { title: 'See the payments', detail: 'Expand the row with the arrow on the left to list its payments.' },
      {
        title: 'Correct',
        detail: 'In the expanded payments, "Cancel" (with a reason) removes a payment recorded by mistake.'
      }
    ],
    consequences: [
      'Each collection creates an accounting entry: debit of the chosen treasury account, credit of transaction fees (account 70612) and, if your agency is VAT-registered, of collected VAT.',
      'Voiding a payment posts the entry in the opposite direction and recalculates the commission status.',
      'No e-mail or receipt is sent to the payer from this screen.'
    ],
    faq: [
      {
        q: "Why does a sale's commission not appear?",
        a: 'It only exists after "Complete the deed" on the agreement. A "Draft", "Signed" or "Cancelled" agreement has none.'
      },
      {
        q: 'Can I collect more than the balance due?',
        a: 'No: the amount of a payment cannot exceed the balance due.'
      },
      {
        q: 'I cannot see "Collect" or "Cancel".',
        a: '"Collect" requires the "Create financial documents" permission and voiding a payment "Validate financial documents". "Collect" disappears when nothing is due any more.'
      }
    ],
    permissions: {
      feature: 'SALES',
      note: 'View: "View third-party accounts" or "View deals". Collect: "Create financial documents". Void a payment: "Validate financial documents".'
    },
    related: [
      { label: 'The totals', helpId: 'commercial.ventes.commissions.indicateurs' },
      { label: 'The commissions table', helpId: 'commercial.ventes.commissions.tableau' },
      { label: 'Collect a commission', helpId: 'commercial.ventes.commissions.encaisser' },
      { label: 'Void a payment', helpId: 'commercial.ventes.commissions.annuler-reglement' }
    ],
    keywords: ['commission', 'fees', 'collect', 'payment', 'balance due', 'vat', 'listing agent', 'accounting']
  },
  {
    id: 'commercial.ventes.commissions.indicateurs',
    kind: 'section',
    title: 'Commission totals',
    summary: 'Three cards total the commissions matching your search and criteria, all pages included.',
    howToRead: {
      notes: [
        'Total incl. tax: sum of the incl. tax amounts of the commissions shown by your criteria.',
        'Collected: sum of their recorded payments (voided payments do not count).',
        'Balance due: Total incl. tax minus Collected.'
      ]
    },
    faq: [
      {
        q: 'Why do the totals change when I filter?',
        a: 'They follow your criteria: to get the agency total, remove all criteria.'
      }
    ],
    related: [{ label: 'The commissions table', helpId: 'commercial.ventes.commissions.tableau' }],
    keywords: ['total', 'collected', 'balance due', 'total incl. tax']
  },
  {
    id: 'commercial.ventes.commissions.tableau',
    kind: 'table',
    title: 'Sale commissions table',
    summary:
      'Each row is the commission of a concluded sale: amount incl. tax, collected, balance due, listing agent and status.',
    howToRead: {
      columns: [
        { key: 'numero', label: 'Number', description: 'The commission number (HT-year-number).' },
        {
          key: 'compromis',
          label: 'Agreement',
          description: 'The agreement the commission comes from; click to open it.'
        },
        { key: 'bien', label: 'Property', description: 'The property sold.' },
        {
          key: 'payeur',
          label: 'Payer',
          description: 'Who must pay the commission: the seller or the buyer, according to the mandate.'
        },
        {
          key: 'ttc',
          label: 'Amount incl. tax',
          description: 'The total due, VAT included (VAT is 0 if the agency is not registered for it), in FCFA.'
        },
        { key: 'paye', label: 'Collected', description: 'What has already been collected, voided payments excluded.' },
        { key: 'reste', label: 'Balance due', description: 'The incl. tax amount minus what is collected.' },
        {
          key: 'negociateur',
          label: 'Listing agent',
          description: 'The member assigned on the mandate, or a dash (—).'
        },
        {
          key: 'part-negociateur',
          label: "Agent's share",
          description: "The listing agent's share of commission excl. tax, calculated on what is already collected."
        },
        { key: 'statut', label: 'Status', description: 'The state of the commission (see the statuses below).' },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Collect", as long as an amount is due and the commission is not cancelled.'
        }
      ],
      statuses: [
        {
          value: 'DUE',
          label: 'To collect',
          description: 'Nothing has been collected yet (or all payments were voided).'
        },
        {
          value: 'PARTIALLY_PAID',
          label: 'Partially collected',
          description: 'Part has been collected; a balance remains. The search criterion calls it "Partially paid".'
        },
        {
          value: 'PAID',
          label: 'Collected',
          description: 'The incl. tax amount is fully collected. The search criterion calls it "Paid".'
        },
        {
          value: 'CANCELLED',
          label: 'Cancelled',
          description:
            'Commission cancelled: it no longer receives payments. No action on the screen produces this status today.'
        }
      ],
      notes: [
        'Expand a row to see its payments: number (RC-year-number), date, amount, method, account, reference and status "Recorded" or "Cancelled" (with its reason).',
        'The export (Excel, CSV or PDF) covers all commissions matching your criteria.'
      ]
    },
    faq: [
      {
        q: 'How is the Amount incl. tax calculated?',
        a: 'Agreement agreed price multiplied by the mandate rate (or the mandate flat fee), rounded, plus VAT if the agency is registered for it. It is fixed when the deed is signed.'
      },
      {
        q: "What is the Agent's share?",
        a: "The listing agent's share of the fees excl. tax already collected. It grows with each payment; it is not a payment made to the agent."
      }
    ],
    related: [
      { label: 'Collect a commission', helpId: 'commercial.ventes.commissions.encaisser' },
      { label: 'Void a payment', helpId: 'commercial.ventes.commissions.annuler-reglement' }
    ],
    keywords: [
      'commission',
      'amount incl. tax',
      'collected',
      'balance due',
      'listing agent',
      'payer',
      'status',
      'export'
    ]
  },
  {
    id: 'commercial.ventes.commissions.encaisser',
    kind: 'section',
    title: 'Collect a commission',
    summary: 'This window records a payment received for a commission, in full or in part.',
    steps: [
      { title: 'Check the amount', detail: 'It is prefilled with the balance due; reduce it for a partial payment.' },
      {
        title: 'Enter the date and the payment method',
        detail: 'Methods offered: Cash, Bank transfer, Mobile Money, Cheque, Card or Other.'
      },
      {
        title: 'Choose the treasury account',
        detail: 'The account that receives the money; the list depends on the chosen payment method.'
      },
      { title: 'Add a reference', detail: 'Optional: transfer number, cheque number, etc.' },
      { title: 'Collect', detail: 'Click "Collect".' }
    ],
    consequences: [
      'The payment gets a number (RC-year-number) and an accounting entry is posted: debit of the treasury account, credit of transaction fees (account 70612) and of VAT for its part.',
      'The commission status becomes "Partially collected" or "Collected" depending on the total collected.',
      'The payment is refused if it exceeds the balance due. It can be voided afterwards, with a reason.'
    ],
    faq: [
      {
        q: 'The treasury account I am looking for is missing.',
        a: 'The list only offers accounts usable with the chosen payment method. Change the method or check your treasury accounts.'
      },
      {
        q: 'Is a receipt sent to the payer?',
        a: 'No, this screen sends no document.'
      }
    ],
    permissions: { feature: 'SALES', note: 'Requires the "Create financial documents" permission.' },
    related: [{ label: 'Void a payment', helpId: 'commercial.ventes.commissions.annuler-reglement' }],
    keywords: ['collect', 'payment', 'mobile money', 'bank transfer', 'treasury', 'balance due']
  },
  {
    id: 'commercial.ventes.commissions.annuler-reglement',
    kind: 'section',
    title: 'Void a payment',
    summary:
      'This window voids a commission payment recorded by mistake. It requires a reason of at least 3 characters.',
    steps: [
      { title: 'Expand the commission', detail: 'Click the arrow at the left of the row to see its payments.' },
      { title: 'Cancel', detail: 'On the "Recorded" payment, click "Cancel".' },
      { title: 'Enter the reason and confirm', detail: 'At least 3 characters, then "Void the payment".' }
    ],
    consequences: [
      "The payment's accounting entry is reversed: an opposite entry is created, the original is not erased.",
      'The payment stays listed with the "Cancelled" status and its reason; it no longer counts in "Collected". The commission status is recalculated.',
      'A voided payment cannot be restored: record a new one with "Collect".'
    ],
    faq: [
      {
        q: 'I do not see the "Cancel" button.',
        a: 'It only appears on a "Recorded" payment and requires the "Validate financial documents" permission.'
      }
    ],
    permissions: { feature: 'SALES', note: 'Requires the "Validate financial documents" permission.' },
    related: [{ label: 'Collect a commission', helpId: 'commercial.ventes.commissions.encaisser' }],
    keywords: ['void a payment', 'collection error', 'reversal', 'reason']
  }
];

export default entries;
