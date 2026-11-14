import type { HelpEntry } from '../../../types';

/** "fiche-bien" area of the "commercial" module (en): property detail page and its tabs. */
const entries: HelpEntry[] = [
  // ───────────────────────── Property page ─────────────────────────
  {
    id: 'commercial.biens.detail',
    kind: 'page',
    title: 'Property file',
    summary:
      'The file brings together what your agency knows about a property: description, owners, sale, documents, mandate, visits and maintenance. The price and key figures stay visible above the tabs.',
    purpose:
      "It is the property's folder. Each tab answers one question: what the property is, what it looks like, what it contains, what is happening, its paperwork. The tabs shown depend on the type of property, its owner and your agency's plan.",
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: 'File being prepared.' },
        { value: 'UNDER_REVIEW', label: 'Under review', description: 'File being checked.' },
        { value: 'AVAILABLE', label: 'Available', description: 'Property on offer and free.' },
        { value: 'RESERVED', label: 'Reserved', description: 'Set aside for a client.' },
        { value: 'UNDER_OFFER', label: 'Under offer', description: 'An offer is in progress.' },
        { value: 'RENTED', label: 'Rented', description: 'A lease puts it in this state.' },
        { value: 'SOLD', label: 'Sold', description: 'The property is sold.' },
        { value: 'ARCHIVED', label: 'Archived', description: 'Left the active portfolio.' }
      ],
      notes: [
        'Under the title: the status of the property (and "Published" if it is online), then its address. The banner shows the price, marketing and key figures.',
        '"Lots" exists only for a building. "Management mandate" applies to a client property or an agency property. "Visits" requires the CRM plan; "Patrimony", "Insurance and claims" and "Maintenance log" require the Patrimony plan.'
      ]
    },
    steps: [
      { title: 'Read the banner', detail: 'Title, status, address, price, key figures.' },
      { title: 'Open a tab', detail: 'Click its name: each has its own "?".' },
      { title: 'Edit the property', detail: 'The "Edit" button: the form also lets you change the status.' },
      {
        title: 'Other actions',
        detail:
          'Menu next to "Edit": "Generate a lease contract" (Rental plan), "Create a newsletter campaign" (CRM plan).'
      }
    ],
    consequences: [
      '"Generate a lease contract" opens the lease form with this property already chosen: nothing is created until you save. Each tab saves its own actions; there is no global save.'
    ],
    faq: [
      { q: 'Why do I not have the "Lots" tab?', a: 'It exists only for a property of type "Building".' },
      {
        q: 'Where are the photos, and how do I add some?',
        a: 'In the "Media" tab, read-only. To add or remove some, use "Edit".'
      },
      {
        q: 'How do I change the property status?',
        a: 'Click "Edit", then the "Status" field.'
      }
    ],
    permissions: {
      note: 'Viewing the file requires "View properties"; "Edit" and the tab actions require "Edit properties"; scheduling a visit requires "Schedule visits".'
    },
    related: [
      { label: 'Property list', helpId: 'commercial.biens.liste' },
      { label: 'Edit a property', helpId: 'commercial.biens.modifier' },
      { label: 'Visit calendar', helpId: 'commercial.biens.visites' }
    ],
    keywords: ['property', 'file', 'detail', 'building', 'tab', 'status', 'price', 'villa', 'apartment'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'fiche-bien-synthese',
          title: 'Price and key figures',
          description: 'This banner stays visible whichever tab is open.'
        },
        {
          target: 'fiche-bien-onglets',
          title: 'The tabs',
          description: 'Move from tab to tab: media, documents, mandate, visits.'
        },
        {
          target: 'fiche-bien-informations',
          title: 'Property information',
          description: 'Reference, type, owner, marketing and availability.'
        }
      ]
    }
  },

  // ───────────────────────── Overview ─────────────────────────
  {
    id: 'commercial.biens.detail.apercu',
    kind: 'section',
    title: 'Overview tab',
    summary:
      'The overview describes the property: description, characteristics, general information, owners, sale and location. It is the tab opened by default.',
    howToRead: {
      notes: [
        '"Characteristics" shows only the filled-in fields (surface, useful surface, land surface, rooms, bedrooms, bathrooms, furnishing): a missing line means it is empty.',
        '"Information": Reference, Property type, Owned by, Marketing (Sale, Rental, Short term) and Availability (Available, Unavailable, Available soon). For a plot of land, a "Land regularisation" link appears if your plan includes Patrimony.',
        '"Location": the address, the zone and, when known, the GPS coordinates.',
        'The "Co-ownership" and "Sale" cards are explained in their own help pages.'
      ]
    },
    faq: [
      {
        q: 'How do I correct a piece of information?',
        a: 'This tab is read-only: use the "Edit" button at the top of the file.'
      },
      {
        q: 'Is the price in this tab?',
        a: 'No, it is in the banner above the tabs. For a building without a price, the banner shows no price.'
      }
    ],
    related: [
      { label: 'Co-ownership and shares', helpId: 'commercial.biens.detail.indivision' },
      { label: 'Sale of the property', helpId: 'commercial.biens.detail.vente' }
    ],
    keywords: ['description', 'characteristics', 'surface', 'location', 'address', 'reference', 'property type']
  },

  // ───────────────────────── Co-ownership ─────────────────────────
  {
    id: 'commercial.biens.detail.indivision',
    kind: 'section',
    title: 'Co-ownership and shares',
    summary:
      'This card says who owns the property and in what proportion. Without shares, the property belongs entirely to the owner named on its leases.',
    purpose:
      "When a property belongs to several owners, you set each one's share (in %). The property's income and expenses are then split according to these shares.",
    steps: [
      {
        title: 'Open the co-ownership',
        detail: 'Click "Define co-ownership" (or "Edit" if shares already exist).'
      },
      { title: 'Add the owners', detail: '"Add an owner", then choose the owner from the list.' },
      {
        title: 'Enter the shares',
        detail: 'Type each owner\'s share in %, or click "Split equally".'
      },
      { title: 'Check the total', detail: 'The "Total" must be exactly 100 % (it turns green).' },
      { title: 'Save', detail: 'Click "Save".' }
    ],
    consequences: [
      "The property's rents, fees and expenses are split according to these shares in each owner's account and statement. Payouts already made do not change.",
      '"Delete co-ownership" (with confirmation) gives the property back entirely to the owner named on the leases.',
      'While the shares are empty, nothing changes compared with a single-owner property.'
    ],
    faq: [
      {
        q: 'Why is "Save" greyed out?',
        a: 'Each line needs an owner and a share above 0, no owner can appear twice, and the total must be 100 %.'
      },
      {
        q: 'An owner is missing from the list.',
        a: "The list offers your agency's client owners. An owner must first be registered as a client of the agency."
      },
      {
        q: 'How do I split between three without rounding?',
        a: '"Split equally" gives 33.3333 % to the first two and 33.3334 % to the last, to land exactly on 100 %.'
      }
    ],
    permissions: {
      note: 'Viewing the card requires "View properties"; saving or deleting requires "Edit properties". It is hidden on an account limited to its own properties.'
    },
    related: [{ label: 'Management mandate', helpId: 'commercial.biens.detail.mandats' }],
    keywords: ['co-ownership', 'share', 'shares', 'joint owners', 'percentage', 'owners']
  },

  // ───────────────────────── Sale ─────────────────────────
  {
    id: 'commercial.biens.detail.vente',
    kind: 'section',
    title: 'Sale of the property',
    summary:
      'This card summarises the sale of the property: its sale mandate, the asking price, the accepted offer or latest offer, and the preliminary agreement. It is read-only.',
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The sale mandate is in progress.' },
        { value: 'EXPIRED', label: 'Expired', description: "The mandate's end date has passed." },
        { value: 'REVOKED', label: 'Revoked', description: 'The mandate has been withdrawn.' },
        { value: 'COMPLETED', label: 'Sold', description: 'The sale is concluded.' }
      ],
      notes: [
        'The card shows the "Active" mandate of the property, otherwise the first in the list.',
        '"Accepted offer" appears when an offer is accepted; otherwise the line is called "Latest offer" and shows its status.',
        '"Preliminary agreement" shows the status of the agreement, or "No preliminary agreement".'
      ]
    },
    steps: [
      {
        title: 'Create a sale mandate',
        detail: 'With no mandate, click "Create a sale mandate": the sales form opens with this property.'
      },
      {
        title: 'Follow the sale',
        detail: 'With a mandate, "View mandate file" opens the sale mandate details.'
      }
    ],
    consequences: ['The card changes nothing: the mandate, offers and agreement are managed in the Sales module.'],
    faq: [
      {
        q: 'Why is this card missing?',
        a: "It is part of your agency's Sales plan; without that plan it is not displayed."
      },
      {
        q: 'Why is the mandate "Expired" when I have not touched it?',
        a: 'An "Active" mandate whose end date has passed is shown as "Expired".'
      }
    ],
    permissions: { feature: 'SALES' },
    related: [{ label: 'Property file', helpId: 'commercial.biens.detail' }],
    keywords: ['sale', 'sale mandate', 'offer', 'preliminary agreement', 'asking price', 'buyer']
  },

  // ───────────────────────── Media ─────────────────────────
  {
    id: 'commercial.biens.detail.medias',
    kind: 'section',
    title: 'Media tab',
    summary: 'The photos and videos of the property. The number of media items is shown on the tab.',
    howToRead: {
      notes: [
        'Photos scroll in a slideshow, the main photo first. Hover over a photo and click "View" to enlarge it.',
        'Videos play directly in the "Videos" card.',
        'With no media, the card shows "No photo for this property" or "No video for this property".'
      ]
    },
    faq: [
      {
        q: 'How do I add, remove or change the main photo?',
        a: 'This tab is read-only. Use the "Edit" button at the top of the file.'
      }
    ],
    related: [{ label: 'Edit a property', helpId: 'commercial.biens.modifier' }],
    keywords: ['photos', 'videos', 'images', 'gallery', 'media']
  },

  // ───────────────────────── Lots (building) ─────────────────────────
  {
    id: 'commercial.biens.detail.lots',
    kind: 'section',
    title: 'Lots tab (building)',
    summary:
      'For a building, this tab lists its apartments and lets you create several at once. Each apartment is a property in its own right, with its own file.',
    steps: [
      { title: 'See the apartments', detail: 'The "Apartments" title shows how many there are.' },
      {
        title: 'Search',
        detail: 'Type a title, reference or address, or filter by status, price (FCFA) and number of rooms.'
      },
      { title: 'Open an apartment', detail: 'Click "View" (or the card, on a phone).' },
      { title: 'Create apartments', detail: 'Click "Add an apartment" (see the creation help page).' }
    ],
    consequences: ['Each apartment created is saved as a property of type "Apartment" attached to the building.'],
    faq: [
      {
        q: 'Can I export the list?',
        a: 'Yes, from the table toolbar: the export includes the filtered apartments, not only the displayed page.'
      }
    ],
    related: [
      { label: 'Apartment table', helpId: 'commercial.biens.detail.lots.tableau' },
      { label: 'Create apartments', helpId: 'commercial.biens.detail.lots.creation' }
    ],
    keywords: ['building', 'lots', 'apartments', 'units', 'flats']
  },
  {
    id: 'commercial.biens.detail.lots.tableau',
    kind: 'table',
    title: 'Apartment table',
    summary:
      'Each row is an apartment of the building: title, surface, rooms, price and status. On a phone, the table becomes a list of cards.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Apartment', description: 'The title of the apartment.' },
        { key: 'surfaceArea', label: 'Surface', description: 'The surface in m².' },
        { key: 'rooms', label: 'Rooms', description: 'The number of rooms.' },
        { key: 'price', label: 'Price', description: 'The price in FCFA.' },
        { key: 'status', label: 'Status', description: 'The state of the apartment (see below).' },
        { key: 'actions', label: 'Actions', description: '"View" opens the file of this apartment.' }
      ],
      statuses: [
        { value: 'AVAILABLE', label: 'Available', description: 'Apartment free.' },
        { value: 'RESERVED', label: 'Reserved', description: 'Set aside for a client.' },
        { value: 'UNDER_OFFER', label: 'Under offer', description: 'An offer is in progress.' },
        { value: 'RENTED', label: 'Rented', description: 'Apartment rented.' },
        { value: 'SOLD', label: 'Sold', description: 'Apartment sold.' },
        { value: 'ARCHIVED', label: 'Archived', description: 'Left the active portfolio.' }
      ]
    },
    faq: [
      {
        q: 'Why is the table empty?',
        a: 'The building does not contain any apartment yet: click "Add an apartment".'
      }
    ],
    related: [{ label: 'Create apartments', helpId: 'commercial.biens.detail.lots.creation' }],
    keywords: ['apartments', 'lots', 'list', 'status', 'price']
  },
  {
    id: 'commercial.biens.detail.lots.creation',
    kind: 'section',
    title: 'Create apartments',
    summary:
      'This window creates up to 100 identical apartments per group in one go, and several groups in a row. Ideal for a new building.',
    purpose:
      'You describe a group (for example 12 apartments of 3 rooms at 50 000 000 FCFA) and the application creates one apartment per unit, numbered from the base title.',
    steps: [
      { title: 'Open the window', detail: 'Click "Add an apartment".' },
      {
        title: 'Describe the group',
        detail:
          'Fill in "Number of apartments" (1 to 100), "Base title" and "Number of rooms" (required), then, if you wish, surface, bathrooms, price, furnishing and status.'
      },
      {
        title: 'Add media',
        detail: 'Under "Photos and Videos", the files added are shared by all the apartments of the group.'
      },
      {
        title: 'Add other groups',
        detail: '"Add an apartment group" for another layout; "Delete" removes a group.'
      },
      { title: 'Confirm', detail: 'Confirm the window: the apartments are created.' }
    ],
    consequences: [
      'With several apartments, the title is followed by a number: "Apartment 1", "Apartment 2"...',
      'The number of bedrooms is calculated: rooms minus one (the living room).',
      'Each apartment takes the address, zone, coordinates, owner type and currency (FCFA by default) from the building. The status is "Available" by default and furnishing "Unfurnished".',
      'If some apartments could not be created, a message says how many succeeded and why the others failed; the others stay created.'
    ],
    faq: [
      {
        q: 'Can a bulk creation be undone?',
        a: 'Not from this window: each apartment becomes a separate property, which you then manage from its own file.'
      }
    ],
    permissions: { note: 'Requires the "Create properties" permission.' },
    related: [{ label: 'Apartment table', helpId: 'commercial.biens.detail.lots.tableau' }],
    keywords: ['create', 'apartments', 'bulk', 'new programme', 'lots', 'group']
  },

  // ───────────────────────── Maintenance ─────────────────────────
  {
    id: 'commercial.biens.detail.maintenance',
    kind: 'section',
    title: 'Maintenance tab',
    summary:
      'The history of maintenance tickets opened for this property. The tab is for consulting; each ticket opens on its own page.',
    steps: [
      {
        title: 'Search or filter',
        detail: 'By text (title, description, vendor) or by status, category, priority and creation date.'
      },
      { title: 'Open a ticket', detail: 'Click its title.' }
    ],
    faq: [
      {
        q: 'Why is this tab empty?',
        a: 'No maintenance ticket has been reported for this property yet: "No maintenance ticket for this property".'
      }
    ],
    related: [{ label: 'Ticket table', helpId: 'commercial.biens.detail.maintenance.tableau' }],
    keywords: ['maintenance', 'breakdown', 'ticket', 'repair', 'works', 'vendor']
  },
  {
    id: 'commercial.biens.detail.maintenance.tableau',
    kind: 'table',
    title: 'Maintenance history',
    summary:
      'Each row is a maintenance ticket of the property: title, category, priority, status, vendor and creation date.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Title', description: 'The title of the ticket; click it to open it.' },
        { key: 'category', label: 'Category', description: 'Plumbing, Electricity, Air conditioning or Other.' },
        { key: 'priority', label: 'Priority', description: 'Low, Medium, High or Urgent.' },
        { key: 'status', label: 'Status', description: 'The progress of the ticket (see below).' },
        {
          key: 'assignedVendor',
          label: 'Vendor',
          description: 'The vendor in charge of the work; a dash if there is none yet.'
        },
        { key: 'createdAt', label: 'Creation date', description: 'The day the ticket was created.' }
      ],
      statuses: [
        { value: 'DECLARED', label: 'Declared', description: 'The problem is reported.' },
        { value: 'ASSIGNED', label: 'Assigned', description: 'A vendor is appointed.' },
        { value: 'IN_PROGRESS', label: 'In progress', description: 'The work is under way.' },
        { value: 'RESOLVED', label: 'Resolved', description: 'The problem is fixed.' },
        { value: 'CANCELED', label: 'Canceled', description: 'The ticket is canceled.' }
      ]
    },
    related: [{ label: 'Maintenance tab', helpId: 'commercial.biens.detail.maintenance' }],
    keywords: ['tickets', 'maintenance', 'priority', 'status', 'vendor']
  },

  // ───────────────────────── Documents ─────────────────────────
  {
    id: 'commercial.biens.detail.documents',
    kind: 'section',
    title: 'Documents tab',
    summary:
      "The property's document vault: title deed, plans, diagnostics, insurance and other papers. You can add, download or delete them.",
    howToRead: {
      columns: [
        { key: 'fileName', label: 'File name', description: 'The name of the uploaded file.' },
        { key: 'documentType', label: 'Type', description: 'The document type chosen at upload.' },
        {
          key: 'expirationDate',
          label: 'Expiration',
          description:
            'The expiration date and its state: "Valid", "Expires in N d" (30 days or less), "Expired" or "No expiration".'
        },
        { key: 'createdAt', label: 'Added on', description: 'The date the document was added.' },
        { key: 'actions', label: 'Actions', description: '"Download" gets the file; "Delete" removes it.' }
      ],
      notes: ['The search field filters by name or type, and by expiration state.']
    },
    steps: [
      { title: 'Add', detail: 'Click "Add a document" (see the upload help page).' },
      { title: 'Download', detail: 'The "Download" button on the row.' },
      { title: 'Delete', detail: 'The "Delete" button, then confirm "Delete this document?".' }
    ],
    consequences: [
      'Deletion is irreversible: the file and its row are erased.',
      'Documents are never reachable through a plain link: downloading goes through your account and checks your permissions.'
    ],
    faq: [
      {
        q: 'Which files can I upload?',
        a: 'PDF, DOC, DOCX, JPEG, PNG and TIFF, up to 10 MB.'
      },
      {
        q: 'I do not see "Add a document" or "Delete".',
        a: 'These actions require the "Edit properties" permission; viewing and downloading require "View properties".'
      }
    ],
    permissions: {
      note: 'View and download: "View properties"; add and delete: "Edit properties".'
    },
    related: [{ label: 'Add a document', helpId: 'commercial.biens.detail.documents.ajout' }],
    keywords: ['documents', 'vault', 'title deed', 'plan', 'diagnostic', 'expiration', 'file', 'papers']
  },
  {
    id: 'commercial.biens.detail.documents.ajout',
    kind: 'section',
    title: 'Add a document',
    summary:
      'This form uploads a file to the property vault, with its type, an optional expiration date and the "required" flag.',
    steps: [
      { title: 'Choose the file', detail: '"Select a file" (PDF, DOC, DOCX, JPEG, PNG, TIFF, 10 MB at most).' },
      {
        title: 'Choose the type',
        detail: '"Document type": title deed, plan, notarial deed, insurance, diagnostic, mandate, other...'
      },
      {
        title: 'Set the expiration',
        detail: '"Expiration date (optional)" for an insurance or a diagnostic, for example.'
      },
      { title: 'Flag as required', detail: 'Tick "Required document" for a paper essential to the file.' },
      {
        title: 'Upload',
        detail: 'Click "Download the document": despite its name, this button uploads the file to the property.'
      }
    ],
    consequences: [
      'After the upload, the form closes and the document appears in the list, with the message "Document added.".'
    ],
    faq: [
      {
        q: 'The "Download the document" button stays greyed out.',
        a: 'You must first choose a file with "Select a file".'
      }
    ],
    permissions: { note: 'Requires the "Edit properties" permission.' },
    related: [{ label: 'Documents tab', helpId: 'commercial.biens.detail.documents' }],
    keywords: ['add', 'upload', 'document', 'required document', 'expiration']
  },

  // ───────────────────────── Management mandate ─────────────────────────
  {
    id: 'commercial.biens.detail.mandats',
    kind: 'section',
    title: 'Management mandate',
    summary:
      'The management mandate is the agreement by which a client owner entrusts a property to your agency. You create it, have it signed or terminate it here.',
    purpose:
      'A client property is managed by the agency only under a mandate. Only one active mandate is possible per property and per agency.',
    steps: [
      {
        title: 'Create the mandate',
        detail: '"Management mandate" tab: "Create a mandate" (in the Overview card: "Create a management mandate").'
      },
      {
        title: 'Fill in the form',
        detail:
          '"Start date" (required, today by default), "End date (optional)" which cannot be before the start, and "Notes (optional)".'
      },
      { title: 'Confirm', detail: 'Click "Create the mandate".' },
      {
        title: 'Have it signed',
        detail: 'The "Signatures" button on the row: the panel lets you send the mandate for signature.'
      },
      {
        title: 'Terminate',
        detail: '"Terminate" in the tab ("Revoke the mandate" in the Overview card), then confirm.'
      }
    ],
    consequences: [
      'Terminating ends the mandate: it no longer appears in the tab and no button lets you reactivate it. It is not erased. To resume management, create a new mandate.',
      'A terminated mandate can no longer be signed: its pending signature requests are canceled.',
      "Creation and termination are recorded in the agency's audit log."
    ],
    faq: [
      {
        q: '"An active mandate already exists for this agency and this property"',
        a: 'Only one active mandate is allowed. Terminate the current one before creating another.'
      },
      {
        q: '"Owner not found"',
        a: 'The property must have an owner who is a client of your agency. Check the property owner under "Edit".'
      },
      {
        q: 'I have no "Management mandate" tab.',
        a: 'It exists only for a client property or an agency property, and is hidden on an account limited to its own properties.'
      }
    ],
    permissions: { note: 'Creating and terminating require "Edit properties"; viewing requires "View properties".' },
    related: [
      { label: 'Management mandate table', helpId: 'commercial.biens.detail.mandats.tableau' },
      { label: 'Entrust a property to an owner', helpId: 'commercial.biens.detail.confier' }
    ],
    keywords: ['mandate', 'management', 'owner', 'terminate', 'revoke', 'signature', 'management contract']
  },
  {
    id: 'commercial.biens.detail.mandats.tableau',
    kind: 'table',
    title: 'Management mandate table',
    summary: "It lists the property's active management mandate: owner, dates, notes and signature.",
    howToRead: {
      columns: [
        { key: 'owner', label: 'Owner', description: 'The owner who entrusted the property.' },
        { key: 'startDate', label: 'Start', description: 'The start date of the mandate.' },
        { key: 'endDate', label: 'End', description: 'The end date; a dash if the mandate has no end.' },
        { key: 'notes', label: 'Notes', description: 'Your notes on the mandate.' },
        {
          key: 'signature',
          label: 'Signature',
          description: '"Signed on" followed by the date once the mandate is signed, otherwise a dash.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Signatures" opens the signature panel; "Terminate" ends the mandate.'
        }
      ],
      notes: ['Only the active mandate is listed: after a termination, the row disappears.']
    },
    faq: [
      {
        q: 'Where did my old mandate go?',
        a: 'A terminated mandate is no longer in this list. The agency keeps it but it can no longer be viewed here.'
      }
    ],
    related: [{ label: 'Management mandate', helpId: 'commercial.biens.detail.mandats' }],
    keywords: ['mandates', 'list', 'signature', 'termination']
  },
  {
    id: 'commercial.biens.detail.confier',
    kind: 'section',
    title: 'Entrust this property to an owner',
    summary:
      'A property that belongs to the agency can become a client property: choose the owner, then create their management mandate.',
    steps: [
      { title: 'Choose the owner', detail: '"Select an owner": the list shows your contacts with an active role.' },
      { title: 'Entrust', detail: 'Click "Entrust this property".' },
      {
        title: 'Create the mandate',
        detail: 'The file reloads: the "Management mandate" tab then offers "Create a mandate".'
      }
    ],
    consequences: [
      'The property no longer belongs to the agency but to the chosen client. The change is saved immediately, with the message "Property entrusted to the owner: you can now create the mandate.".'
    ],
    faq: [
      {
        q: 'The owner I am looking for is missing.',
        a: 'The list only shows contacts with an active role. First add a role in their contact file.'
      }
    ],
    permissions: { note: 'Requires the "Edit properties" permission.' },
    related: [{ label: 'Management mandate', helpId: 'commercial.biens.detail.mandats' }],
    keywords: ['entrust', 'owner', 'client property', 'agency', 'transfer']
  },

  // ───────────────────────── Visits ─────────────────────────
  {
    id: 'commercial.biens.detail.visites',
    kind: 'section',
    title: 'Visits tab',
    summary:
      'The upcoming and past visits of this property, with a form to schedule a new one. The tab is part of the CRM plan.',
    steps: [
      { title: 'See the visits', detail: 'The "Property visits" card lists the visits already scheduled.' },
      {
        title: 'Schedule',
        detail: 'Fill in the "Schedule a visit" card below (see its help page).'
      },
      {
        title: 'Update the status',
        detail: 'In the "Status" column, choose Scheduled, Confirmed, Absent or Canceled.'
      },
      {
        title: 'Close',
        detail: '"Close" button: enter a report (optional) then "Mark as done".'
      }
    ],
    consequences: [
      'Closing a visit sets it to "Done" and, if a contact is linked, creates a "Visit" activity in their contact file (with the report).',
      'A "Done" visit can no longer be edited here. A canceled or "Absent" visit can be put back to "Scheduled" or "Confirmed" if its slot is still free.'
    ],
    permissions: {
      feature: 'CRM',
      note: 'Viewing requires "View properties"; scheduling, changing the status and closing require "Schedule visits".'
    },
    related: [
      { label: 'Visit table', helpId: 'commercial.biens.detail.visites.tableau' },
      { label: 'Schedule a visit', helpId: 'commercial.biens.detail.planifier-visite' },
      { label: 'Visit calendar', helpId: 'commercial.biens.visites' }
    ],
    keywords: ['visits', 'appointments', 'schedule', 'visit', 'close', 'report']
  },
  {
    id: 'commercial.biens.detail.visites.tableau',
    kind: 'table',
    title: 'Property visit table',
    summary: 'Each row is a visit of this property: date, contact, goal, assignee, status and notes.',
    howToRead: {
      columns: [
        { key: 'scheduledAt', label: 'Date', description: 'The date and time of the visit.' },
        {
          key: 'contact',
          label: 'Contact',
          description: 'The visitor (first and last name of the contact); a dash if none.'
        },
        {
          key: 'goal',
          label: 'Goal',
          description: 'The purpose of the visit: making contact, evaluation, negotiation, contract signing...'
        },
        { key: 'assignedTo', label: 'Assigned to', description: 'The team member doing the visit.' },
        {
          key: 'status',
          label: 'Status',
          description: 'The state of the visit; it can be changed directly in the cell until the visit is done.'
        },
        { key: 'notes', label: 'Notes', description: 'The notes or report.' },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Close" ends the visit (absent for a done or canceled visit).'
        }
      ],
      statuses: [
        { value: 'SCHEDULED', label: 'Scheduled', description: 'The visit is planned and occupies its slot.' },
        { value: 'CONFIRMED', label: 'Confirmed', description: 'The visit is confirmed and occupies its slot.' },
        { value: 'DONE', label: 'Done', description: 'The visit took place.' },
        { value: 'NO_SHOW', label: 'Absent', description: 'The visitor did not show up; the slot is freed.' },
        { value: 'CANCELED', label: 'Canceled', description: 'The visit is canceled; the slot is freed.' }
      ]
    },
    faq: [
      {
        q: 'I cannot change the status.',
        a: 'You need the "Schedule visits" permission; a "Done" visit can no longer change status.'
      }
    ],
    related: [{ label: 'Visits tab', helpId: 'commercial.biens.detail.visites' }],
    keywords: ['visits', 'status', 'contact', 'goal', 'assigned']
  },
  {
    id: 'commercial.biens.detail.planifier-visite',
    kind: 'section',
    title: 'Schedule a visit',
    summary:
      'This form schedules a visit of the property for a contact, at a precise date and time, and assigns it to a team member.',
    steps: [
      { title: 'Choose the contact', detail: '"Contact" (required): search for the visitor among your contacts.' },
      {
        title: 'Choose the goal',
        detail:
          '"Goal" (required): making contact, introduction, evaluation, contract signing, follow-up, negotiation or other.'
      },
      { title: 'Link a deal', detail: '"Deal (optional)" appears once the contact is chosen and lists their deals.' },
      { title: 'Set the date and time', detail: '"Date" and "Time" (required) must be in the future.' },
      {
        title: 'Complete',
        detail:
          '"Place (optional)": the property address by default. "Assigned to (optional)": a team member. "Notes (optional)".'
      },
      { title: 'Confirm', detail: 'Click "Schedule the visit".' }
    ],
    consequences: [
      'The visit is created with the "Scheduled" status. A visit lasts 60 minutes: if another "Scheduled" or "Confirmed" visit of the same property overlaps this slot, scheduling is refused with the message "Slot already taken", and you choose another time.',
      'Since a contact is required, a "Call" activity is added to their file, with a next appointment of type "Visit" on the chosen date. No e-mail or SMS is sent to the visitor.',
      'After success, you are redirected to the visit calendar.'
    ],
    faq: [
      {
        q: 'Why is my date refused?',
        a: 'The date and time must be in the future, and the slot must not overlap another visit of the same property.'
      },
      {
        q: 'I do not see the form.',
        a: 'You need the CRM plan to see the tab, and the "Schedule visits" permission to schedule a visit.'
      }
    ],
    permissions: { feature: 'CRM', note: 'Requires the "Schedule visits" permission.' },
    related: [
      { label: 'Visit calendar', helpId: 'commercial.biens.visites' },
      { label: 'Visits tab', helpId: 'commercial.biens.detail.visites' }
    ],
    keywords: ['schedule', 'visit', 'appointment', 'slot', 'agenda', 'visitor']
  }
];

export default entries;
