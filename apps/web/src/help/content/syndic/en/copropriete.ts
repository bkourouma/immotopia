import type { HelpEntry } from '../../../types';

/** Zone « copropriete » du module « syndic » (en) : co-ownerships, mandating agencies, units and unit account. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Co-ownership list
  {
    id: 'syndic.copropriete.liste',
    kind: 'page',
    title: 'Co-ownerships',
    summary:
      'This screen lists the co-ownerships you manage, as cards. Here you create a co-ownership, open its record or its units, or delete it while it is still empty.',
    purpose:
      'A co-ownership is the building you act as managing agent (syndic) for. Everything else in the module (units, service charge calls, meetings, accounting) is attached to it. Co-ownerships "In liquidation" are not shown here.',
    steps: [
      {
        title: 'Create a co-ownership',
        detail: 'Click "New co-ownership", fill in the name and address (required), then "Create".'
      },
      {
        title: 'Add the units',
        detail:
          'After creation you land on the unit list with the "Import units from properties" window already open. Close it if you prefer to create the units by hand.'
      },
      {
        title: 'Find a co-ownership',
        detail:
          'Type in "Search" (name, address, cadastral reference, mandating agency) or filter by "Status", "Mandating agency" and "Units".'
      },
      {
        title: 'Open a co-ownership',
        detail: '"Open the co-ownership" or "View the page" opens its record; "View the units" opens the unit list.'
      },
      {
        title: 'Delete',
        detail:
          'The "Delete" button on the card asks for confirmation. It is greyed out when the co-ownership already has units or other data.'
      }
    ],
    consequences: [
      'Deletion is final: the co-ownership disappears with its linked data. It is refused as soon as it has units, charge calls, budgets, meetings, documents, contracts, incidents, co-owner accounts or payments.',
      'To take a co-ownership out of day-to-day management without deleting it, set its status to "In liquidation" from its record.'
    ],
    faq: [
      {
        q: 'Where did a co-ownership "In liquidation" go?',
        a: 'It is deliberately hidden from this list. Its status is changed in its record, "Edit" button.'
      },
      {
        q: 'What does "Mandating agency: Agency identity" mean?',
        a: 'The co-ownership has no mandating agency: its documents carry your agency\'s identity. See "Mandating agencies".'
      },
      {
        q: 'Why is "Delete" greyed out?',
        a: 'The co-ownership has units or other linked data. Take it out of day-to-day management by setting it "In liquidation".'
      },
      {
        q: 'What is the "Reference total of shares"?',
        a: "An optional number, for example 10,000. It only warns you when the sum of the units' shares does not match it."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Co-ownership manager'],
      note: 'Viewing the list requires the right to view the Syndic module. Creating a co-ownership requires the right to create in the Syndic module; deleting requires the right to edit the Syndic module.'
    },
    related: [
      { label: 'Co-ownership cards', helpId: 'syndic.copropriete.liste.cartes' },
      { label: 'Create a co-ownership', helpId: 'syndic.copropriete.liste.creation' },
      { label: 'Mandating agencies', helpId: 'syndic.mandants.liste' },
      { label: 'Units of the co-ownership', helpId: 'syndic.lots.liste' }
    ],
    keywords: [
      'co-ownership',
      'condominium',
      'building',
      'syndic',
      'create',
      'new co-ownership',
      'delete',
      'liquidation'
    ]
  },
  {
    id: 'syndic.copropriete.liste.cartes',
    kind: 'section',
    title: 'Co-ownership cards',
    summary:
      'Each card summarises a co-ownership: its name, status, address, number of units and buildings, cadastral reference and mandating agency.',
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'Co-ownership in day-to-day management.' },
        {
          value: 'IN_DISPUTE',
          label: 'In dispute',
          description: 'Co-ownership flagged as in dispute; it stays in day-to-day management.'
        },
        {
          value: 'IN_LIQUIDATION',
          label: 'In liquidation',
          description: 'Taken out of day-to-day management: it is no longer shown in this list.'
        }
      ],
      notes: [
        '"Mandating agency": the agency on whose behalf the co-ownership is managed, or "Agency identity" if there is none.',
        'The "Units" search criterion separates co-ownerships "With units" from those "Without unit".'
      ]
    },
    steps: [
      { title: 'Open the record', detail: '"View the page" or "Open the co-ownership".' },
      { title: 'See the units', detail: '"View the units" opens the units tab directly.' },
      { title: 'Delete', detail: '"Delete", then confirm. Only possible if the co-ownership is empty.' }
    ],
    faq: [
      {
        q: 'How many co-ownerships per page?',
        a: 'Twelve. Pagination appears at the bottom when there are more.'
      },
      {
        q: 'How do I find a co-ownership by its mandating agency?',
        a: 'Use the "Mandating agency" filter, or type the agency name in "Search".'
      },
      {
        q: "How do I change a co-ownership's status?",
        a: 'Open its record and click "Edit": the "Status" field is there.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Deleting requires the right to edit the Syndic module.' },
    related: [{ label: 'Co-ownership record', helpId: 'syndic.copropriete.fiche' }],
    keywords: ['card', 'status', 'dispute', 'mandating agency', 'search']
  },
  {
    id: 'syndic.copropriete.liste.creation',
    kind: 'section',
    title: 'Create a co-ownership',
    summary:
      'This window creates a co-ownership from its name and address. Everything else is optional and can be completed or corrected later in the record.',
    howToRead: {
      notes: [
        '"Name" and "Address" are required.',
        '"Reference total of shares": optional. If the sum of the units\' shares is different, a warning is shown on the unit list; nothing is blocked.',
        '"Mandating agency": optional. The co-ownership\'s documents will carry the logo, signature and stamp of the chosen agency. With no choice, they carry your agency\'s identity.'
      ]
    },
    steps: [
      { title: 'Open', detail: 'Click "New co-ownership" (or "Create a co-ownership" if the list is empty).' },
      {
        title: 'Fill in',
        detail:
          'Enter "Name" and "Address". Add "Land registry reference", "Registration number" and "Mandating agency" if needed.'
      },
      { title: 'Confirm', detail: 'Click "Create".' },
      { title: 'Add the units', detail: 'You are taken to the unit list, with the property import already offered.' }
    ],
    consequences: [
      'The co-ownership is created with the "Active" status and appears in the list straight away.',
      'No e-mail or SMS is sent on creation.'
    ],
    faq: [
      {
        q: 'Can I change this information afterwards?',
        a: 'Yes, from the co-ownership record, "Edit" button.'
      },
      {
        q: 'Which mandating agency should I choose?',
        a: 'The one on whose behalf you manage the building. If it does not exist yet, create it in "Mandating agencies".'
      },
      {
        q: 'Why does "Create" do nothing?',
        a: 'The "Name" or "Address" field is empty: the form shows "The name is required" or "The address is required" under the field. Fill them in, then click "Create" again.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to create in the Syndic module.' },
    related: [
      { label: 'Mandating agencies', helpId: 'syndic.mandants.liste' },
      { label: 'Import properties as units', helpId: 'syndic.lots.import' }
    ],
    keywords: ['new co-ownership', 'create', 'name', 'address', 'shares', 'mandating agency']
  },

  // ------------------------------------------------------------------ Mandating agencies
  {
    id: 'syndic.mandants.liste',
    kind: 'page',
    title: 'Mandating agencies',
    summary:
      'This screen lists the agencies on whose behalf your firm manages co-ownerships. Each one has its contact details, logo, signature and stamp.',
    purpose:
      'When a firm manages buildings for several client agencies, a co-ownership\'s documents must carry the right agency\'s identity. You attach the agency to the co-ownership (creation or record) in the "Mandating agency" field.',
    steps: [
      {
        title: 'Create a mandating agency',
        detail: 'Click "New mandating agency", enter at least the "Name", then "Save".'
      },
      {
        title: 'Add the images',
        detail: 'Once saved, the drawer shows "Images for documents": logo, signature, stamp.'
      },
      { title: 'Attach a co-ownership', detail: 'In a co-ownership record, "Edit" button, "Mandating agency" field.' },
      { title: 'Edit', detail: '"Edit" on the row reopens the drawer.' },
      { title: 'Delete', detail: '"Delete", then confirm. Only possible if no co-ownership is attached.' }
    ],
    consequences: [
      'Deleting a mandating agency is final.',
      'It is impossible while a co-ownership is attached to it: the button is greyed out with the tooltip "Detach its co-ownerships first to be able to delete it".'
    ],
    faq: [
      {
        q: 'Can two mandating agencies have the same name?',
        a: 'No. Saving is refused with the message "A mandating agency already has this name".'
      },
      {
        q: "Why can't I upload the logo right away?",
        a: 'Images attach to an agency that is already saved. Save the contact details first: the drawer stays open and then offers the images.'
      },
      {
        q: 'What happens with no mandating agency?',
        a: 'The co-ownership\'s documents carry your agency\'s identity, shown as "Agency identity".'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Co-ownership manager'],
      note: 'Viewing the list requires the right to view the Syndic module; creating, the right to create in this module; editing, deleting or changing the logo, the right to edit it. Uploading or removing the signature and stamp additionally requires the right to edit the agency settings.'
    },
    related: [
      { label: 'Mandating agencies table', helpId: 'syndic.mandants.tableau' },
      { label: 'Create or edit a mandating agency', helpId: 'syndic.mandants.edition' },
      { label: 'Co-ownerships', helpId: 'syndic.copropriete.liste' }
    ],
    keywords: ['mandating agency', 'client agency', 'logo', 'signature', 'stamp', 'documents', 'letterhead']
  },
  {
    id: 'syndic.mandants.tableau',
    kind: 'table',
    title: 'Mandating agencies table',
    summary:
      'This table lists each mandating agency with its logo, contact details and the number of co-ownerships attached to it. Here you edit or delete an agency.',
    howToRead: {
      columns: [
        { key: 'logo', label: 'Logo', description: 'Logo thumbnail, or "—" if there is none.' },
        { key: 'name', label: 'Name', description: 'Name of the mandating agency.' },
        { key: 'contact', label: 'Contact details', description: 'Phone and e-mail, or "Not provided".' },
        {
          key: 'syndicateCount',
          label: 'Co-ownerships',
          description: 'Number of co-ownerships attached to this agency.'
        },
        { key: 'actions', label: 'Actions', description: '"Edit" and "Delete".' }
      ],
      notes: [
        'The "Managed condominiums" (With co-ownerships / Without co-ownership) and "Logo" (With logo / Without logo) filters help spot incomplete agencies.',
        'Search covers the name, legal name, address, e-mail, phone, RCCM and tax ID.'
      ]
    },
    steps: [
      { title: 'Edit', detail: 'Click "Edit": the drawer opens with the contact details and images.' },
      { title: 'Delete', detail: '"Delete" then confirmation. Greyed out if the agency has co-ownerships.' }
    ],
    consequences: ['Deletion is final and refused while a co-ownership is attached.'],
    faq: [
      {
        q: 'How do I detach a co-ownership from an agency?',
        a: 'Open its record, "Edit", clear the "Mandating agency" field and save.'
      },
      {
        q: 'Can the list be exported?',
        a: "Yes, with the table's export button: every row matching your search is exported."
      },
      {
        q: 'What does the "Co-ownerships" column count?',
        a: 'The co-ownerships currently attached to this agency.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Editing and deleting require the right to edit the Syndic module.' },
    related: [{ label: 'Create or edit a mandating agency', helpId: 'syndic.mandants.edition' }],
    keywords: ['mandating agencies', 'table', 'delete', 'attached co-ownerships']
  },
  {
    id: 'syndic.mandants.edition',
    kind: 'section',
    title: 'Create or edit a mandating agency',
    summary:
      "This drawer saves an agency's contact details, then, once saved, its logo, signature and stamp. These images are used on the documents of its co-ownerships.",
    howToRead: {
      notes: [
        'Only the "Name" is required. "Legal name", "Address", "Phone", "Email", "RCCM" and "Tax ID" are optional.',
        'The message "Save the contact details first…" is shown until the agency is created.',
        'Each image is uploaded or removed separately; the accepted image types are shown in the field.'
      ]
    },
    steps: [
      { title: 'Enter the contact details', detail: 'Fill in at least the "Name".' },
      { title: 'Save', detail: 'Click "Save": the drawer stays open and switches to edit mode.' },
      { title: 'Upload the images', detail: 'Under "Images for documents", add "Logo", "Signature" and "Stamp".' },
      { title: 'Close', detail: 'Click "Closed" when you are done.' }
    ],
    consequences: [
      'The documents of the co-ownerships attached to the agency (for example receipts and settlement receipts) now carry this logo, signature and stamp.',
      'An invalid e-mail is refused with "Invalid email address"; nothing is sent to the agency.'
    ],
    faq: [
      {
        q: 'I cannot upload the signature or stamp.',
        a: 'These two images commit the issuer: they require the right to edit the agency settings, in addition to the right to edit the Syndic module. The logo only requires the latter.'
      },
      {
        q: 'How do I replace a logo?',
        a: 'Remove the old one in the "Logo" field, then upload the new one.'
      },
      {
        q: 'Why is saving refused?',
        a: 'Another mandating agency already has this name, regardless of capital letters: the message "A mandating agency already has this name." appears. Choose another name, then click "Save" again.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Saving and managing the logo require the right to edit the Syndic module. Signature and stamp also require the right to edit the agency settings.'
    },
    related: [{ label: 'Mandating agencies', helpId: 'syndic.mandants.liste' }],
    keywords: ['logo', 'signature', 'stamp', 'RCCM', 'tax ID', 'legal name', 'images', 'documents']
  },

  // ------------------------------------------------------------------ Co-ownership record
  {
    id: 'syndic.copropriete.fiche',
    kind: 'page',
    title: 'Co-ownership record',
    summary:
      "The record gathers the co-ownership's identity, key figures, logo and four tabs: units, buildings, charge calls and rates by unit type.",
    purpose:
      "This is a co-ownership's entry point: you check its information, correct it, then move on to the other tabs at the top (Units, Providers, Charges, Meetings…).",
    steps: [
      {
        title: 'Read the key figures',
        detail:
          'The three cards "Units", "Buildings" and "Charge calls" open the matching tab at the bottom of the page.'
      },
      { title: 'Correct the information', detail: 'In "General information", "Edit" button.' },
      { title: 'Add the logo', detail: '"Condominium logo" card.' },
      {
        title: 'Browse the tabs',
        detail: '"Unit summary", "Building details", "Charge call details", "Rate schedule by unit type".'
      }
    ],
    consequences: [
      'Setting the status to "In liquidation" removes the co-ownership from the co-ownership list: it is an alternative to deletion, which is final.',
      "Changing the mandating agency changes the logo, signature and stamp on the co-ownership's documents."
    ],
    faq: [
      {
        q: 'Why does the record show only one building?',
        a: 'The "Building details" tab shows the building linked to the co-ownership, i.e. one row.'
      },
      {
        q: 'Where do I change the name or address?',
        a: 'In "General information", "Edit" button.'
      },
      {
        q: 'What does "Declared number of units" mean?',
        a: 'It is the number of units recorded for this co-ownership, the same as on the "Units" card.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Co-ownership manager'],
      note: 'Viewing the record requires the right to view the Syndic module. "Edit" and the rates require the right to edit it.'
    },
    related: [
      { label: 'General information', helpId: 'syndic.copropriete.fiche.informations' },
      { label: 'Edit the co-ownership', helpId: 'syndic.copropriete.fiche.edition' },
      { label: 'Rates by unit type', helpId: 'syndic.lots.bareme' },
      { label: 'Units of the co-ownership', helpId: 'syndic.lots.liste' }
    ],
    keywords: ['record', 'general information', 'status', 'liquidation', 'manager', 'fiscal year', 'buildings']
  },
  {
    id: 'syndic.copropriete.fiche.indicateurs',
    kind: 'section',
    title: 'Co-ownership key figures',
    summary:
      'Three cards give the number of units, buildings and charge calls. Clicking a card opens the matching tab.',
    howToRead: {
      notes: [
        '"Units": number of units in the co-ownership.',
        '"Buildings": declared number of buildings.',
        '"Charge calls": total number of charge calls; "—" if it could not be loaded.'
      ]
    },
    faq: [
      {
        q: 'The number of units is wrong.',
        a: 'It follows the recorded lots. Add, import or delete units in the "Units" tab.'
      },
      {
        q: 'Why "—" for charge calls?',
        a: 'The total could not be read for now. The "Charge call details" tab remains usable.'
      },
      { q: 'Are the cards clickable?', a: 'Yes, each opens the tab of the same name further down.' }
    ],
    permissions: { feature: 'SYNDIC' },
    keywords: ['indicators', 'counters', 'units', 'buildings', 'charge calls']
  },
  {
    id: 'syndic.copropriete.fiche.informations',
    kind: 'section',
    title: 'General information',
    summary:
      "This card summarises the co-ownership's identity: name, status, address, references, mandating agency and manager.",
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'Day-to-day management.' },
        {
          value: 'IN_DISPUTE',
          label: 'In dispute',
          description: 'Flagged as in dispute; stays in day-to-day management.'
        },
        { value: 'IN_LIQUIDATION', label: 'In liquidation', description: 'Removed from the co-ownership list.' }
      ],
      notes: [
        '"Manager" is chosen from your contacts. "Not provided" is shown if there is none.',
        '"Reference total of shares" only appears if it was entered.',
        '"Fiscal year" is a number from 1 to 12, 1 by default.'
      ]
    },
    steps: [{ title: 'Edit', detail: 'Click "Edit" at the top right of the card.' }],
    faq: [
      {
        q: 'Where do I see the mandating agency?',
        a: 'In the "Mandating agency" line, and under the co-ownership name ("Mandating agency").'
      },
      { q: 'How do I change the manager?', a: '"Edit", then the "Manager" field: it offers your contacts.' },
      { q: 'Can a field be left empty?', a: 'Yes, except the name, address and status.' }
    ],
    permissions: { feature: 'SYNDIC', note: '"Edit" requires the right to edit the Syndic module.' },
    related: [{ label: 'Edit the co-ownership', helpId: 'syndic.copropriete.fiche.edition' }],
    keywords: ['identity', 'address', 'registration', 'cadastral', 'manager', 'mandating agency']
  },
  {
    id: 'syndic.copropriete.fiche.edition',
    kind: 'section',
    title: 'Edit the co-ownership',
    summary: "This window corrects the co-ownership's information, status, manager and mandating agency.",
    howToRead: {
      notes: [
        '"Name", "Address" and "Status" are required.',
        '"Reference total of shares": optional, it warns you if the sum of the units\' shares differs.',
        '"Manager": a contact from your directory.',
        '"Mandating agency": documents will carry its logo, signature and stamp. Clear the field to go back to your agency\'s identity.'
      ]
    },
    steps: [
      { title: 'Open', detail: '"Edit" in "General information".' },
      { title: 'Correct', detail: 'Change the fields you want.' },
      { title: 'Save', detail: '"Save" closes the window and reloads the record.' }
    ],
    consequences: [
      '"In liquidation" removes the co-ownership from the co-ownership list (an alternative to deletion, which is final).',
      'If a field is refused, the error message appears under the field concerned and the window stays open.'
    ],
    faq: [
      { q: 'I want to remove the co-ownership without deleting it.', a: 'Set its "Status" to "In liquidation".' },
      {
        q: 'Can I go back?',
        a: 'Yes, by reopening the record (through its direct address) and setting "Active" again; it will not appear in the list in the meantime.'
      },
      {
        q: 'What happens to the total of shares if I clear it?',
        a: 'It is removed: no sum warning is displayed any more.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to edit the Syndic module.' },
    keywords: ['edit', 'status', 'liquidation', 'manager', 'mandating agency', 'shares']
  },
  {
    id: 'syndic.copropriete.fiche.logo',
    kind: 'section',
    title: 'Co-ownership logo',
    summary: "This card lets you upload, replace or remove the co-ownership's own logo.",
    howToRead: {
      notes: ['This is the co-ownership\'s logo. The mandating agency\'s logo is managed in "Mandating agencies".']
    },
    steps: [
      { title: 'Upload', detail: 'Choose an image in the "Logo" field.' },
      { title: 'Remove', detail: "Use the field's delete button." }
    ],
    faq: [
      { q: 'Which format should I choose?', a: 'A simple image (logo); the accepted formats are shown in the field.' },
      { q: 'Do I have to upload it for each co-ownership?', a: 'Yes, it is specific to each co-ownership.' },
      {
        q: 'What happens if I upload a very large image?',
        a: 'The image is first reduced automatically to 800 px, and only then is its size checked (PNG or JPEG, 2 MB maximum). A file in another format is rejected with a message.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to edit the Syndic module.' },
    keywords: ['logo', 'image', 'letterhead']
  },
  {
    id: 'syndic.copropriete.fiche.batiments',
    kind: 'table',
    title: 'Building details',
    summary: 'This table describes the building linked to the co-ownership: address, floors, units and parking spaces.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Building', description: 'Building name, or the co-ownership name by default.' },
        { key: 'address', label: 'Address', description: 'Building address.' },
        { key: 'floors', label: 'Floors', description: 'Number of floors, or "—" if not provided.' },
        { key: 'units', label: 'Units', description: 'Number of units, or "—".' },
        { key: 'parkingSpaces', label: 'Parking spaces', description: 'Number of spaces, or "—".' }
      ],
      notes: ['This data comes from the linked property (building) record; it cannot be edited here.']
    },
    faq: [
      {
        q: 'The table is empty.',
        a: 'No building is linked to the co-ownership: the message "No building recorded for this co-ownership" is shown.'
      },
      { q: 'How do I correct the number of floors?', a: 'In the matching property record, under "Properties".' },
      { q: 'Can I export?', a: "Yes, with the table's export button." }
    ],
    permissions: { feature: 'SYNDIC' },
    keywords: ['buildings', 'building', 'floors', 'parking', 'units']
  },

  // ------------------------------------------------------------------ Units
  {
    id: 'syndic.lots.liste',
    kind: 'page',
    title: 'Units of the co-ownership',
    summary:
      "This screen lists the co-ownership's units with their shares, owner, portal access, tenant and linked property. Here you create, import, edit or deactivate lots.",
    purpose:
      'A unit is a unit of the co-ownership (apartment, parking space, cellar, office, shop…). Its shares are used to split charges and count votes at meetings. This is where you link each unit to its owner.',
    steps: [
      {
        title: 'Import or create',
        detail: '"Import properties" takes existing properties; "New unit" creates a unit by hand.'
      },
      {
        title: 'Check the shares',
        detail: 'Compare "Total general shares" with the "Reference total of shares" if it is filled in.'
      },
      { title: 'Link the owner', detail: '"Edit" on a unit: "CRM owner" and "Owner since" fields.' },
      { title: 'Follow a unit', detail: '"Account" opens the unit account: balance, calls, payments, statement.' },
      {
        title: 'Open the portal',
        detail: '"Manage access" ("Portal" column) leads to "Profiles and incidents", where the co-owner is invited.'
      }
    ],
    consequences: [
      'A unit with 0 shares is "Inactive": it leaves the allocation key, votes and future charge calls, but its history remains.',
      'A unit can only be deleted if it has no movement. Otherwise, the screen offers to deactivate it.',
      "Depending on your subscription, creating or importing a unit may be refused when your plan's unit allowance is reached."
    ],
    faq: [
      {
        q: 'Why is a unit marked "Inactive"?',
        a: 'Its general shares are 0. Click "Re-enable" and enter its shares to put it back in service.'
      },
      {
        q: 'What does the warning about the sum of shares mean?',
        a: 'The sum over the units differs from the "Reference total of shares". Nothing is blocked; correct the shares or the total.'
      },
      {
        q: 'What does "Declared payment" mean?',
        a: 'A co-owner has declared a mobile money payment awaiting validation for this lot.'
      },
      { q: 'What do "Occupied" and "Unoccupied" mean?', a: 'A tenant is, or is not, attached to the lot.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Co-ownership manager'],
      note: 'Viewing requires the right to view the Syndic module. Creating or importing units requires the right to create in this module; editing, deactivating, deleting and managing tenants require the right to edit it.'
    },
    related: [
      { label: 'Unit table', helpId: 'syndic.lots.tableau' },
      { label: 'Create or edit a unit', helpId: 'syndic.lots.creation' },
      { label: 'Import properties as units', helpId: 'syndic.lots.import' },
      { label: 'Unit account', helpId: 'syndic.lots.compte' },
      { label: 'Rates by unit type', helpId: 'syndic.lots.bareme' }
    ],
    keywords: ['lots', 'shares', 'allocation key', 'owner', 'co-owner', 'apartment', 'parking'],
    tour: {
      steps: [
        {
          target: 'lots-nouveau',
          title: 'Create a unit',
          description: '"New unit" opens the form: linked property, owner, number, type and shares.'
        },
        {
          target: 'lots-importer',
          title: 'Import properties',
          description: '"Import properties" creates several units at once from existing properties.'
        },
        {
          target: 'lots-tableau',
          title: 'The unit table',
          description:
            'Each row is a lot. The buttons in the "Actions" column edit it, deactivate it or open its account.'
        }
      ]
    }
  },
  {
    id: 'syndic.lots.indicateurs',
    kind: 'section',
    title: 'Unit indicators',
    summary:
      'These cards count the units, add up the shares and show how many units have an owner, portal access and an active tenant.',
    howToRead: {
      notes: [
        '"Number of units": all units, active or not.',
        '"Total general shares": the sum of the general shares of all lots.',
        '"Reference total of shares": shown only if filled in on the record; a warning appears if the sum is different.',
        '"Units with an owner": units with an owner recorded.',
        '"Units with portal access": units whose access is "Active" or "Partial".',
        '"Units with an active tenant": units with a tenant assignment in progress.'
      ]
    },
    faq: [
      {
        q: 'The sum of shares does not match the reference total.',
        a: 'A warning banner flags it. Correct a share, or the total, in the co-ownership record.'
      },
      { q: 'Are inactive units counted?', a: 'Yes in "Number of units"; their shares count as 0 in the sum.' },
      {
        q: 'What does "Units with portal access" count?',
        a: 'Units whose co-owner portal is open, fully or partly (joint ownership).'
      }
    ],
    permissions: { feature: 'SYNDIC' },
    keywords: ['indicators', 'cumulative shares', 'portal', 'active tenant']
  },
  {
    id: 'syndic.lots.tableau',
    kind: 'table',
    title: 'Unit table',
    summary: 'This table lists the units with their type, shares, owner, portal access, tenant and linked property.',
    howToRead: {
      columns: [
        {
          key: 'lotNumber',
          label: 'Unit',
          description: 'Unit number, with the "Inactive" (0 shares) or "Declared payment" label when it applies.'
        },
        { key: 'lotType', label: 'Type', description: 'Apartment, Parking, Cellar, Office, Shop or Other.' },
        {
          key: 'generalShares',
          label: 'General shares',
          description: "The unit's share of general charges and votes."
        },
        {
          key: 'specialShares',
          label: 'Special shares',
          description: 'The unit\'s share of special charges (lift…); "-" if there are none.'
        },
        {
          key: 'ownerContactId',
          label: 'Owner',
          description: 'The current owner(s); in joint ownership, "Name 1 (50 %), Name 2 (50 %)".'
        },
        {
          key: 'portalAccess',
          label: 'Portal',
          description: 'State of access to the co-owner portal and the "Manage access" link.'
        },
        {
          key: 'tenant',
          label: 'Tenant',
          description: 'Tenant attached to the unit, with "End" to close the assignment.'
        },
        {
          key: 'propertyId',
          label: 'Linked property',
          description: 'The property (Properties record) the unit is attached to, or "Not linked".'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Edit", "Account", "Tenant", "Deactivate" or "Re-enable", "Delete".'
        }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: "Portal access is open for all the unit's owners." },
        { value: 'PARTIAL', label: 'Partial', description: 'Partial (x/y): only some joint owners have access.' },
        { value: 'INACTIVE', label: 'Inactive', description: 'The portal is not open.' },
        {
          value: 'NONE',
          label: 'No profile',
          description: 'No owner profile on this unit: create one in "Profiles and incidents".'
        }
      ],
      notes: [
        'Filters: "Type", "Portal", "Tenant" (Occupied / Not occupied) and "Unit status" (Active / Inactive).',
        'Search covers the number, owner, linked property and tenant.'
      ]
    },
    steps: [
      { title: 'Edit', detail: '"Edit" opens the unit form.' },
      {
        title: 'Deactivate',
        detail:
          '"Deactivate" sets the shares to 0 after confirmation. "Re-enable" reopens the form to re-enter the shares.'
      },
      {
        title: 'Delete',
        detail:
          '"Delete" then confirmation. Refused if the unit has calls, payments or receipts: the screen then offers "Deactivate the unit".'
      },
      { title: 'Open the account', detail: '"Account" opens the unit\'s balance and history.' }
    ],
    consequences: [
      'Deactivating a unit removes it from charge allocations and votes; its data is kept and you can reactivate it.',
      'Deleting a unit is final; it is only possible if the unit has no movement.',
      '"End" on a tenant assignment detaches the tenant from the unit; the history is kept.'
    ],
    faq: [
      {
        q: 'How do I invite a co-owner to the portal?',
        a: 'Click "Manage access": you land on "Profiles and incidents", where "Invite to portal" is.'
      },
      {
        q: 'Why does "Delete" fail?',
        a: 'The unit has movements (calls, payments, receipts, direct debit mandates…). Deactivate it instead.'
      },
      { q: 'Why is the owner empty?', a: 'No owner is linked. Open "Edit" and choose the "CRM owner".' },
      {
        q: 'How do I export the units?',
        a: "With the table's export button: every row matching your search is exported."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Editing, deactivating, deleting and ending a tenant require the right to edit the Syndic module.'
    },
    related: [
      { label: 'Create or edit a unit', helpId: 'syndic.lots.creation' },
      { label: 'Unit account', helpId: 'syndic.lots.compte' },
      { label: 'Invite to the co-owner portal', helpId: 'syndic.lots.invitation' }
    ],
    keywords: ['lot', 'deactivate', 'reactivate', 'shares', 'portal', 'tenant', 'joint ownership']
  },
  {
    id: 'syndic.lots.creation',
    kind: 'section',
    title: 'Create or edit a unit',
    summary:
      'This form creates a unit or corrects one: linked property, owner, number, type, shares and owner start date.',
    howToRead: {
      notes: [
        'Choose the "Linked property" first: it suggests the type, number and owner. Choosing it afterwards would overwrite those fields.',
        '"Unit number", "Unit type" and "General shares" are required. The number must be unique in the co-ownership.',
        '"General shares" at 0: the unit is inactive, left out of the allocation key and future calls.',
        '"Special shares": optional; with no value, the unit counts as 0 in a special-shares allocation.',
        '"CRM owner": a contact from your directory. "Owner since": this owner\'s start date.'
      ]
    },
    steps: [
      { title: 'Open', detail: '"New unit", or "Edit" on a unit\'s row.' },
      { title: 'Choose the property', detail: 'Optional: "Select an existing property".' },
      {
        title: 'Choose the owner',
        detail: '"CRM owner" field; filled in automatically if the property has a known owner.'
      },
      { title: 'Enter number, type, shares', detail: 'The three required fields.' },
      { title: 'Confirm', detail: '"Create the unit" or "Save".' }
    ],
    consequences: [
      "If the sum of shares does not match the co-ownership's reference total, a warning is shown; the unit is saved anyway.",
      'A number already used in the co-ownership is refused.',
      "Depending on your subscription, creation may be refused when your plan's unit allowance is reached."
    ],
    faq: [
      {
        q: 'How do I reactivate an inactive unit?',
        a: 'Click "Re-enable": the window opens with empty shares, enter them.'
      },
      {
        q: 'Can I link a whole building?',
        a: 'No, a unit is a unit (apartment, villa, office…). A parent building is not offered.'
      },
      { q: 'What does "Owner since" do?', a: "It dates the owner's start, for the unit's ownership history." },
      { q: 'What about input errors?', a: 'They are shown under the field concerned and the window stays open.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Creating requires the right to create in the Syndic module; editing requires the right to edit it.'
    },
    related: [{ label: 'Import properties as units', helpId: 'syndic.lots.import' }],
    keywords: ['new unit', 'unit number', 'unit type', 'general shares', 'special shares', 'owner']
  },
  {
    id: 'syndic.lots.import',
    kind: 'section',
    title: 'Import properties as units',
    summary:
      'This window creates several units at once from properties already recorded. For a building, its apartments or units become lots.',
    howToRead: {
      notes: [
        'If you choose a building, the imported units are its sub-properties. For a villa, office or shop, the unit is the property itself.',
        'Each unit created gets 1 general share. A parking space also gets 1 special share.',
        "The unit type is deduced from the property type; the unit number takes the property's internal reference.",
        "The owner is linked automatically when the property owner's e-mail matches a contact."
      ]
    },
    steps: [
      { title: 'Open', detail: '"Import properties" (or the window opens by itself after a co-ownership is created).' },
      {
        title: 'Choose the properties',
        detail: '"Properties to import": several choices possible, buildings, villas, offices… mixed.'
      },
      { title: 'Import', detail: 'Click "Import".' },
      { title: 'Adjust the shares', detail: 'Units are created with 1 share: edit each unit afterwards.' }
    ],
    consequences: [
      'A property already imported into this co-ownership, or linked to another, is skipped with its reason.',
      "A number already taken is skipped; a property refused by your plan's unit allowance is skipped too.",
      'The message states the number of units imported and the number skipped.'
    ],
    faq: [
      {
        q: 'Why do all my units have 1 share?',
        a: 'The import does not know the shares. Enter them unit by unit with "Edit".'
      },
      {
        q: 'A property is skipped, why?',
        a: "It is already linked to a unit, its number already exists, or the plan's unit allowance is reached. The reason is shown in the message."
      },
      { q: 'Can an import be undone?', a: 'No. Deactivate or delete the units concerned from the table.' }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to create in the Syndic module.' },
    related: [{ label: 'Create or edit a unit', helpId: 'syndic.lots.creation' }],
    keywords: ['import', 'properties', 'building', 'sub-properties', 'bulk units']
  },
  {
    id: 'syndic.lots.locataire',
    kind: 'section',
    title: 'Add a tenant to a unit',
    summary:
      "This window attaches a contact from your directory as a unit's tenant, with a start date and, if you know it, an end date.",
    howToRead: {
      notes: [
        '"Tenant contact" and "Start date" are required; the start date defaults to today.',
        '"Lease reference (optional)" and "Notes" are free text.',
        'This action is for when the tenant has not yet been attached through rental management.'
      ]
    },
    steps: [
      { title: 'Open', detail: '"Tenant" button in the unit\'s "Actions" column.' },
      { title: 'Choose the contact', detail: '"Select a CRM contact".' },
      { title: 'Enter the dates', detail: '"Start date", then "End date" if known.' },
      { title: 'Assign', detail: 'Click "Assign".' }
    ],
    consequences: [
      'The tenant appears in the unit\'s "Tenant" column and counts in "Units with an active tenant".',
      '"End" (in the table) detaches the tenant from the unit; the history is kept.'
    ],
    faq: [
      {
        q: 'Does the tenant receive anything?',
        a: 'Nothing is shown on screen about this: the action only attaches the contact to the lot.'
      },
      { q: 'How do I remove a tenant?', a: 'In the table, "End" next to their name, then "End" to confirm.' },
      { q: 'The contact is not in the list.', a: 'Create it first in the contacts.' }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to edit the Syndic module.' },
    keywords: ['tenant', 'assignment', 'lease', 'occupant']
  },
  {
    id: 'syndic.lots.bareme',
    kind: 'section',
    title: 'Rates by unit type',
    summary:
      'This card sets the amount charged PER LOT according to the unit type (apartment, parking space, cellar…). It is used when you split a charge call "By unit type".',
    howToRead: {
      columns: [
        { key: 'lotType', label: 'Type', description: 'Apartment, Parking, Cellar, Office, Shop or Other.' },
        { key: 'count', label: 'Number of units', description: 'Number of units of this type in the co-ownership.' },
        {
          key: 'rate',
          label: 'Amount per unit',
          description: 'Amount charged to each unit of this type, or "Not provided".'
        }
      ],
      notes: [
        'An amount of 0 means "type not called": those units pay nothing.',
        'A field left empty stays "Not provided": the type is not in the rate table.',
        'The yellow warnings flag "No rate table saved" or the unit types with no amount.'
      ]
    },
    steps: [
      { title: 'Open', detail: '"Rate schedule by unit type" tab of the record, "Edit the rate schedule" button.' },
      {
        title: 'Enter the amounts',
        detail: 'One amount per type (in FCFA), at least one. An amount cannot be negative.'
      },
      { title: 'Save', detail: 'Click "Save": "Rate schedule saved".' }
    ],
    consequences: [
      'The "By unit type" allocation mode becomes available to create a charge call or a schedule, with these amounts.',
      'The change does not affect calls already created.'
    ],
    faq: [
      {
        q: 'Why is "By unit type" unavailable?',
        a: 'No rate table is saved, or types present in the co-ownership are missing. Fill it in here.'
      },
      {
        q: 'Is the amount for the whole co-ownership?',
        a: 'No, it is set per unit: each unit of the type pays this amount.'
      },
      { q: 'I do not see "Edit the rate schedule".', a: 'It requires the right to edit the Syndic module.' }
    ],
    permissions: { feature: 'SYNDIC', note: 'Editing the rates requires the right to edit the Syndic module.' },
    related: [{ label: 'Charge calls', helpId: 'syndic.charges.liste' }],
    keywords: ['rates', 'prices', 'unit type', 'amount per unit', 'allocation by type']
  },
  {
    id: 'syndic.lots.paiement',
    kind: 'section',
    title: 'Record a payment on a unit',
    summary:
      'This window records a payment received for a lot. It allocates it to the open charge calls and shows the effect before you confirm.',
    howToRead: {
      columns: [
        { key: 'period', label: 'Period', description: 'Period of the charge call.' },
        { key: 'dueDate', label: 'Due date', description: 'Payment deadline of the call.' },
        { key: 'outstanding', label: 'Amount outstanding', description: 'Amount still to be paid on the call.' },
        { key: 'status', label: 'Status', description: 'State of the call (settled, partial, overdue…).' }
      ],
      notes: [
        'Payment methods offered: "Cash", "Bank transfer", "Cheque" and "Mobile money".',
        'With no box ticked, the payment first settles the oldest calls. Tick calls to choose the ones to cover.',
        'Any surplus becomes an advance, applied automatically to the following calls.',
        '"Preview" shows, before confirmation, the amount allocated to each call, its origin (Payment or Advance), its status afterwards and the remaining advance.'
      ]
    },
    steps: [
      { title: 'Choose the unit', detail: '"Choose a unit" (already filled in if you came from a call).' },
      { title: 'Enter the payment', detail: '"Amount", "Payment date", "Payment method", "Reference (optional)".' },
      { title: 'Choose the calls', detail: 'Tick the calls to cover, or leave empty.' },
      { title: 'Read the preview', detail: 'Check the allocation and the remaining advance.' },
      { title: 'Record', detail: 'Click "Save": a "Payment recorded" window lists the documents issued.' }
    ],
    consequences: [
      'The payment is recorded immediately and credits the unit account. It cannot be cancelled from this screen.',
      'A receipt is issued; a settlement receipt is issued for each call fully settled. Each can be downloaded, also as an Arabic translation.',
      'The documents are e-mailed to the co-owner, PDF attached, if their address is known and this notification is active; a sending failure does not cancel the payment.',
      'The accounting entry for the collection is posted with the payment; the amounts allocated also credit the funds linked to the calls.'
    ],
    faq: [
      {
        q: 'What happens if I confirm twice?',
        a: 'A double click or a retry does not create a second payment: recording is protected against replays.'
      },
      {
        q: 'The amount exceeds what is due.',
        a: 'The surplus becomes a unit advance, visible in "Available advance" and applied to the next calls.'
      },
      {
        q: 'Can I pay online here?',
        a: 'No: this window records a payment already received (cash, transfer, cheque, mobile money).'
      },
      {
        q: 'How do I correct a mistake?',
        a: 'The screen offers no way to cancel a recorded payment: check the amount before confirming.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Recording a payment requires the right to edit the Syndic module.' },
    related: [
      { label: 'Unit account', helpId: 'syndic.lots.compte' },
      { label: 'Charge calls', helpId: 'syndic.charges.liste' },
      { label: 'Settlement receipts', helpId: 'syndic.quittances.liste' }
    ],
    keywords: ['collect', 'payment', 'settlement', 'advance', 'receipt', 'settlement receipt', 'mobile money', 'cash']
  },
  {
    id: 'syndic.lots.invitation',
    kind: 'section',
    title: 'Invite to the co-owner portal',
    summary:
      'After "Invite to portal" on an owner profile, this window confirms the access opened and shows the link to pass on to the co-owner.',
    howToRead: {
      notes: [
        '"Portal access opened" shows the name, e-mail and the number of units that can be viewed read-only.',
        '"Invitation link": the co-owner chooses their password there, link valid for 7 days (the end date is shown).',
        '"Sign-in link" with the "Existing account" label: the contact already has an ImmoTopia account and logs in with their usual credentials.',
        'Under the link, "Invitation email sent" or a warning if the e-mail could not be sent.'
      ]
    },
    steps: [
      {
        title: 'Start the invitation',
        detail: 'In "Profiles and incidents", "Owner profiles" tab, "Invite to portal" button.'
      },
      { title: 'Copy the link', detail: '"Copy" button: useful if the e-mail is slow or lands in spam.' },
      { title: 'Pass it on', detail: 'Send the link yourself if the e-mail could not be sent (WhatsApp, in person).' },
      { title: 'Close', detail: '"Closed" button.' }
    ],
    consequences: [
      "All the contact's current units in the agency are opened to the portal, read-only.",
      'An invitation e-mail is sent to the contact if e-mail sending is configured; no SMS or WhatsApp is sent.',
      'A contact without a valid e-mail address cannot be invited: complete their record first.'
    ],
    faq: [
      {
        q: 'The link has expired.',
        a: 'Run "Invite to portal" again: a new link is issued as long as the account has never been used.'
      },
      {
        q: 'The co-owner already has an account.',
        a: 'The link shown is then a sign-in link, not an activation link. They can use "Forgot your password?".'
      },
      {
        q: 'Can access be removed?',
        a: 'Yes, from "Profiles and incidents": revocation closes all their units in the agency.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Inviting requires the right to edit the Syndic module.' },
    related: [{ label: 'Unit table', helpId: 'syndic.lots.tableau' }],
    keywords: ['portal', 'invitation', 'link', 'co-owner', 'access', 'password']
  },

  // ------------------------------------------------------------------ Unit account
  {
    id: 'syndic.lots.compte',
    kind: 'page',
    title: 'Unit account',
    summary:
      "This screen tracks a unit's account: balance, advance, movement history, receipts and quittances. You can download the statement and add an adjustment.",
    purpose:
      'The unit account says what the co-owner owes or has overpaid. Each charge call, payment, penalty or adjustment leaves a line in it.',
    steps: [
      {
        title: 'Read the balance',
        detail: '"Current balance" shows "Debtor" (owes), "Creditor" (has an advance) or "Settled".'
      },
      { title: 'Consult the history', detail: '"Transaction history" tab: filter by type and by period.' },
      { title: 'Find a document', detail: '"Receipts and statements" tab: "Download" or "Arabic translation".' },
      { title: 'Download the statement', detail: '"Download the statement" gives the account statement as a PDF.' },
      { title: 'Correct an amount', detail: '"Add adjustment" (debit or credit).' }
    ],
    consequences: [
      'An adjustment is final: the screen does not offer to cancel it. To correct, enter an adjustment in the opposite direction.',
      'The unit account is created on first view if it did not exist.'
    ],
    faq: [
      {
        q: 'What does "Debtor" mean?',
        a: 'The co-owner still owes this amount to the co-ownership. "Creditor" means they have an advance.'
      },
      {
        q: 'Where do I collect a payment on this unit?',
        a: 'Not from this screen: use "Record a payment" in the charge calls.'
      },
      { q: 'What is "Available advance"?', a: 'An overpayment, applied automatically to the next charge calls.' },
      {
        q: 'The statement will not download.',
        a: 'An error message explains the cause; try again, then contact your administrator.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Co-ownership manager', 'Accountant'],
      note: 'Viewing the account and downloading the statement require the right to view the Syndic module. Adding an adjustment requires the right to edit it.'
    },
    related: [
      { label: 'Account indicators', helpId: 'syndic.lots.compte.indicateurs' },
      { label: 'Transaction history', helpId: 'syndic.lots.compte.transactions' },
      { label: 'Receipts and settlement receipts', helpId: 'syndic.lots.compte.recus' },
      { label: 'Add an adjustment', helpId: 'syndic.lots.compte.ajustement' },
      { label: 'Record a payment on a unit', helpId: 'syndic.lots.paiement' }
    ],
    keywords: ['unit account', 'balance', 'statement', 'advance', 'debtor', 'creditor', 'co-owner']
  },
  {
    id: 'syndic.lots.compte.indicateurs',
    kind: 'section',
    title: 'Account indicators',
    summary: "Four cards give the unit's current balance, number of transactions, owner and available advance.",
    howToRead: {
      statuses: [
        { value: 'debtor', label: 'Debtor', description: 'The co-owner owes this amount.' },
        { value: 'creditor', label: 'Creditor', description: 'The co-owner has an advance.' },
        { value: 'settled', label: 'Settled', description: 'Account up to date.' }
      ],
      notes: [
        '"Current balance" is always shown as a positive value, together with "Debtor", "Creditor" or "Settled".',
        '"Transactions": total number of account lines, regardless of filters; "—" until the history is opened.',
        '"Available advance": overpayment applied automatically to the next calls.'
      ]
    },
    faq: [
      {
        q: 'Why does "Transactions" show "—"?',
        a: 'The account is counted when the "Transaction history" tab is opened.'
      },
      {
        q: 'Current balance and advance, what is the difference?',
        a: 'The balance is what the unit owes or has in credit on its account. The advance is the part of payments not yet allocated to a call.'
      },
      { q: 'The owner shown is wrong.', a: 'It comes from the unit account. Correct the owner in the unit table.' }
    ],
    permissions: { feature: 'SYNDIC' },
    keywords: ['current balance', 'advance', 'debtor', 'creditor']
  },
  {
    id: 'syndic.lots.compte.transactions',
    kind: 'table',
    title: 'Transaction history',
    summary:
      "This table lists all the unit account's movements: charge calls, payments, penalties, waivers, adjustments and fund transfers.",
    howToRead: {
      columns: [
        { key: 'transactionDate', label: 'Date', description: 'Date of the movement.' },
        { key: 'type', label: 'Type', description: 'Nature of the movement (see below).' },
        { key: 'label', label: 'Label', description: 'Description of the movement.' },
        { key: 'debit', label: 'Debit', description: 'Amount that increases what the co-owner owes.' },
        { key: 'credit', label: 'Credit', description: 'Amount that decreases what the co-owner owes.' },
        {
          key: 'balanceAfter',
          label: 'Balance',
          description: 'Balance after the movement, with "Debtor", "Creditor" or "Settled".'
        }
      ],
      statuses: [
        { value: 'CHARGE_CALL', label: 'Charge call', description: 'Debit: charges called to the lot.' },
        { value: 'PAYMENT', label: 'Payment', description: 'Credit: payment received.' },
        { value: 'PENALTY', label: 'Penalty', description: 'Debit: late-payment penalty.' },
        { value: 'WAIVER', label: 'Waiver', description: 'Credit: waiver granted.' },
        { value: 'ADJUSTMENT', label: 'Adjustment', description: 'Debit or credit entered by hand.' },
        { value: 'FUND_TRANSFER', label: 'Fund transfer', description: 'Movement linked to a co-ownership fund.' }
      ],
      notes: ['Filters: "Type" and "Period". Search covers the movement label.']
    },
    faq: [
      {
        q: 'Why this sign on the balance?',
        a: 'The balance is shown as a positive value with "Debtor" (the unit owes) or "Creditor" (the unit has an advance).'
      },
      {
        q: 'Can the history be exported?',
        a: 'Yes. Every row matching your filters is exported, with a signed balance (+ debtor, − creditor).'
      },
      {
        q: 'How do I cancel a movement?',
        a: 'With an adjustment in the opposite direction: the screen does not delete movements.'
      }
    ],
    permissions: { feature: 'SYNDIC' },
    related: [{ label: 'Add an adjustment', helpId: 'syndic.lots.compte.ajustement' }],
    keywords: ['history', 'movements', 'transactions', 'debit', 'credit', 'balance']
  },
  {
    id: 'syndic.lots.compte.recus',
    kind: 'table',
    title: 'Unit receipts and settlement receipts',
    summary:
      'This table lists the receipts and settlement receipts issued for this unit, with their number, type, date and amount. Each document can be downloaded.',
    howToRead: {
      columns: [
        { key: 'number', label: 'Number', description: 'Document number.' },
        {
          key: 'kind',
          label: 'Type',
          description: '"Receipt" (one payment) or "Settlement receipt" (a charge call settled).'
        },
        { key: 'issuedAt', label: 'Issued on', description: 'Issue date.' }
      ],
      statuses: [
        { value: 'RECEIPT', label: 'Receipt', description: 'Issued for each payment.' },
        { value: 'QUITTANCE', label: 'Settlement receipt', description: 'Issued when a charge call is fully paid.' }
      ],
      notes: [
        'The "Amount" column gives the document\'s sum; "Actions" offers "Download" and "Arabic translation".',
        'Filters: "Type", "Issued on" and "Caught up" (documents created after the fact).'
      ]
    },
    steps: [
      { title: 'Download', detail: '"Download" gives the document as a PDF.' },
      { title: 'Arabic version', detail: '"Arabic translation" gives a translated version of the same document.' }
    ],
    faq: [
      {
        q: 'The table is empty.',
        a: 'No receipt or settlement receipt for this unit: "No receipt or statement for this unit"'
      },
      { q: 'What does "Caught up" mean?', a: 'Documents issued after the fact for older payments or calls.' },
      {
        q: 'Does the co-owner receive them?',
        a: 'They are e-mailed to them when issued, if their address is known; you can also download them here.'
      }
    ],
    permissions: { feature: 'SYNDIC' },
    related: [{ label: 'Settlement receipts', helpId: 'syndic.quittances.liste' }],
    keywords: ['receipt', 'settlement receipt', 'pdf', 'arabic translation', 'download']
  },
  {
    id: 'syndic.lots.compte.ajustement',
    kind: 'section',
    title: 'Add an adjustment',
    summary: 'This window adds a manual line to the unit account, as a debit or a credit, to correct an amount.',
    howToRead: {
      notes: [
        '"Direction": "Debit" (the unit owes more) or "Credit" (the unit owes less).',
        '"Amount" and "Label" are required; "Reference (optional)" is free text.',
        'An amount is in FCFA, at least 1.'
      ]
    },
    steps: [
      { title: 'Open', detail: '"Add adjustment" at the top of the page.' },
      { title: 'Choose the direction', detail: '"Debit" or "Credit".' },
      { title: 'Enter', detail: '"Amount", "Label" and, if useful, "Reference (optional)".' },
      { title: 'Confirm', detail: 'Click "Save": "Adjustment saved".' }
    ],
    consequences: [
      "The adjustment is recorded at today's date and changes the balance straight away.",
      "A debit first uses up the unit's available advance.",
      'The screen offers no cancellation: correct with an adjustment in the opposite direction, with a clear label.'
    ],
    faq: [
      {
        q: 'When should I use an adjustment?',
        a: 'To correct an error or regularise an amount without a call or payment.'
      },
      {
        q: 'Adjustment or payment?',
        a: 'For a payment actually received, record a payment: it issues a receipt and feeds the funds.'
      },
      { q: 'Is the co-owner notified?', a: 'Nothing is sent when an adjustment is entered.' }
    ],
    permissions: { feature: 'SYNDIC', note: 'Requires the right to edit the Syndic module.' },
    keywords: ['adjustment', 'correction', 'debit', 'credit', 'regularisation']
  },

  // ------------------------------------------------------------------ Funds
  {
    id: 'syndic.fonds.mouvements',
    kind: 'table',
    title: 'Fund movements',
    summary:
      'This drawer lists the history of a co-ownership fund (reserve, works…): each credit or debit with the resulting balance.',
    purpose:
      'A fund is a reserve of money tracked separately. Its history keeps track of the opening, the shares of charges collected, expenses, adjustments and payments to providers.',
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Date', description: 'Date of the movement.' },
        {
          key: 'direction',
          label: 'Direction',
          description: '"Credit" (the fund increases) or "Debit" (it decreases).'
        },
        { key: 'amount', label: 'Amount', description: 'Amount of the movement in FCFA.' },
        {
          key: 'balanceAfter',
          label: 'Balance after',
          description: 'Fund balance after this movement; in red if negative.'
        },
        { key: 'label', label: 'Label', description: 'Description of the movement.' },
        { key: 'sourceType', label: 'Origin', description: 'Where the movement comes from (see below).' }
      ],
      statuses: [
        { value: 'OPENING', label: 'Opening balance', description: 'Starting balance of the fund.' },
        {
          value: 'CHARGE_PAYMENT',
          label: 'Charge payment',
          description: 'Share of a charge payment allocated to the fund.'
        },
        { value: 'MANUAL_EXPENSE', label: 'Expense', description: 'Expense paid by the fund, entered by hand.' },
        { value: 'MANUAL_ADJUSTMENT', label: 'Manual adjustment', description: 'Correction entered by hand.' },
        { value: 'PROVIDER_PAYMENT', label: 'Provider payment', description: 'Debit generated by a provider payment.' },
        {
          value: 'PROVIDER_PAYMENT_REVERSAL',
          label: 'Provider payment cancellation',
          description: 'Credit generated by the cancellation of that payment.'
        }
      ]
    },
    faq: [
      {
        q: 'The balance is in red.',
        a: 'The fund is negative after this movement. This is allowed; check the expenses or adjustments.'
      },
      { q: 'How do I adjust the balance?', a: 'From the treasury\'s fund details, "Adjust balance" button.' },
      { q: 'Can I export?', a: "Yes. All the fund's movements are exported, not only the page displayed." }
    ],
    permissions: { feature: 'SYNDIC' },
    related: [{ label: 'Fund details', helpId: 'syndic.tresorerie.fonds' }],
    keywords: ['fund', 'reserve', 'works fund', 'movements', 'history', 'balance']
  }
];

export default entries;
