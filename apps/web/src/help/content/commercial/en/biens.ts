import type { HelpEntry } from '../../../types';

/** “biens” area of the “commercial” module (en): list, creation, editing, viewing calendar. */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------------------
  // Property list
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.biens.liste',
    kind: 'page',
    title: 'Properties',
    summary:
      'Here you will find every property of your agency, shown as cards with their photo, status and price. This is the starting point to add, open, edit or delete a property.',
    purpose:
      'A property is the basic record of the agency: it is used for sales, rentals, viewings and deals. Each card opens the full property page, where you find its details, documents and viewings.',
    steps: [
      {
        title: 'Add a property',
        detail: 'Click “Add a property” to start the multi-step creation assistant.'
      },
      {
        title: 'Search',
        detail: 'Type a title, an address or a reference in the “Search” field.'
      },
      {
        title: 'Filter',
        detail:
          'Choose a “Property type” or a “Transaction”, or click “More filters” for the status, district, price and bedrooms.'
      },
      {
        title: 'Open a property',
        detail: 'Click the card, or “View the page” in the “⋮” menu.'
      },
      {
        title: 'Edit a property',
        detail: 'Click “Edit” at the bottom of the card.'
      },
      {
        title: 'Export',
        detail: '“Export” button: Excel, CSV or PDF, with the same filters as the list on screen.'
      }
    ],
    consequences: [
      'Deletion cannot be undone. It is refused if the property is linked to a lease, unpaid instalments, an active management mandate, a co-ownership, maintenance tickets, a sale, an active deal or an active loan.',
      'When deletion is refused, the screen offers “Archive this property”: the property then leaves the list and its data is not erased.',
      '“Send as a newsletter” opens the preparation of a newsletter campaign for the chosen property.'
    ],
    faq: [
      {
        q: 'Where did an archived property go?',
        a: 'Archived properties no longer appear in this list, which has no filter to find them again.'
      },
      {
        q: 'Why does the “District” filter not find my property?',
        a: 'This filter looks for the district name in the property’s address and neighbourhood. Fill them in when creating or editing the property.'
      },
      {
        q: 'I cannot see “Add a property”, or I cannot edit a property. Why?',
        a: 'These actions depend on your rights: “Create properties” to add, “Edit properties” to edit. Ask your agency administrator for them.'
      }
    ],
    permissions: {
      note: 'Viewing the list requires “View properties”, adding requires “Create properties”. Editing, deleting and archiving require “Edit properties”.'
    },
    related: [
      { label: 'How to read the property cards', helpId: 'commercial.biens.liste.cartes' },
      { label: 'Create a new property', helpId: 'commercial.biens.nouveau' },
      { label: 'Viewing calendar', helpId: 'commercial.biens.visites' },
      { label: 'Open the property list', to: '/tenant/:tenantId/properties' }
    ],
    keywords: [
      'property',
      'properties',
      'building',
      'flat',
      'house',
      'villa',
      'plot',
      'portfolio',
      'listing',
      'real estate'
    ]
  },
  {
    id: 'commercial.biens.liste.cartes',
    kind: 'table',
    title: 'Property cards',
    summary:
      'Each card is a property of your agency, from the newest to the oldest. It shows the photo, title, place, status, price and a few features.',
    howToRead: {
      statuses: [
        {
          value: 'AVAILABLE',
          label: 'Available',
          description: 'The property is on offer. It can be published to the public portal.'
        },
        {
          value: 'RESERVED',
          label: 'Reserved',
          description: 'The property is reserved. It can still be published.'
        },
        {
          value: 'UNDER_OFFER',
          label: 'Under offer',
          description: 'An offer is in progress on the property. It can still be published.'
        },
        {
          value: 'RENTED',
          label: 'Let',
          description: 'The property is let. It cannot be published in this state.'
        },
        {
          value: 'SOLD',
          label: 'Sold',
          description: 'The property is sold. It cannot be published in this state.'
        },
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'The property is still being entered. It cannot be published in this state.'
        },
        {
          value: 'UNDER_REVIEW',
          label: 'Under review',
          description: 'The property is being checked. It cannot be published in this state.'
        }
      ],
      notes: [
        'Photo: the property’s main photo; otherwise the first photo; with no photo, a house icon.',
        'Price: the sale price, or the monthly rent for a property to let, in FCFA. It is not shown for a building.',
        'Under the title: the address and the neighbourhood. At the bottom of the card: the type, the transaction (Sale, Rental) and the floor area, with the number of rooms and bedrooms.',
        'A click on the card opens the property page. “Edit” opens the edit form. The “⋮” menu offers “View the page”, “Send as a newsletter” and “Delete”.',
        'The “Status” can only be filtered on “Available” and “Let”. “Archived” properties are not shown.'
      ]
    },
    consequences: [
      '“Delete” asks for confirmation and erases the property: this cannot be undone. If it is refused, “Archive this property” removes it from the list without erasing its data.'
    ],
    faq: [
      {
        q: 'Are the filters kept?',
        a: 'Yes. They are part of the page address: copy the link to share a search, or go back from a property page to find the same list again.'
      },
      {
        q: 'What does the exported file contain?',
        a: 'Every property that matches your filters, not only the page on screen: reference, title, type, transaction, status, address, area, price, floor area, rooms and bedrooms.'
      },
      {
        q: 'Why does a property appear without a photo?',
        a: 'No photo has been added yet. Open “Edit”, then the “Photos and videos” section.'
      }
    ],
    related: [
      { label: 'Overview of the property list', helpId: 'commercial.biens.liste' },
      { label: 'Add photos to a property', helpId: 'commercial.biens.modifier.medias' }
    ],
    keywords: ['card', 'photo', 'status', 'price', 'rent', 'export', 'search', 'filter', 'delete', 'archive']
  },

  // ---------------------------------------------------------------------------
  // Creating a property
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.biens.nouveau',
    kind: 'page',
    title: 'New property',
    summary:
      'This assistant creates a property step by step: type and title, location, features, price, specifics, then photos and videos. Only a few fields are required, the rest can be completed later.',
    purpose:
      'Create the property with the essentials, then enrich it by editing before publishing it. A property is then used for viewings, deals, sales and rentals.',
    steps: [
      {
        title: 'Type and identification',
        detail: 'Choose the type, enter the title and say who owns the property.'
      },
      {
        title: 'Location',
        detail: 'Search for the district. The neighbourhood and the address are optional.'
      },
      {
        title: 'General features',
        detail: 'Floor area, year, condition, standing, rooms. This step does not appear for a plot or a parking space.'
      },
      {
        title: 'Price and terms',
        detail: 'Choose “Sale” or “Rental”, then enter the price or the rent.'
      },
      {
        title: 'Specifics',
        detail: 'Details specific to the property type. For a building, you also enter its flats.'
      },
      {
        title: 'Media',
        detail: 'Add photos and videos. The property is saved when you reach this step.'
      },
      {
        title: 'Finish',
        detail: 'Click “Finish” on the last step: the property page opens.'
      }
    ],
    consequences: [
      'The property is created with the status “Available” and gets an automatic internal reference.',
      'The property is saved as soon as you reach the “Media” step: if you then leave without clicking “Finish”, it already exists in the property list.',
      'The property is not published automatically: publication is done afterwards from “Edit”.',
      'If your subscription limits the number of properties, creation may be refused; a message then sends you to the subscription.'
    ],
    faq: [
      {
        q: 'Which fields are required?',
        a: 'The property type, the title, the location (country, region, district) and the transaction type. For a client’s property, the owner is required too. At the “Specifics” step, fields marked with a red star are also required.'
      },
      {
        q: 'Why does the “General features” step not appear?',
        a: 'A plot and a parking space (“Parking / Garage”) have nothing to fill in there: the step is skipped.'
      },
      {
        q: 'How do I create a building with its flats?',
        a: 'Choose “Building”, then at the “Specifics” step enter the “Total number of flats”: one row per flat appears (200 at most). The flats are created when you click “Finish”.'
      }
    ],
    permissions: {
      note: 'Creating a property requires “Create properties”. Adding photos and videos requires “Edit properties”.'
    },
    related: [
      { label: 'Publish a property', helpId: 'commercial.biens.modifier.publication' },
      { label: 'Back to the property list', helpId: 'commercial.biens.liste' }
    ],
    keywords: [
      'create a property',
      'add a property',
      'new property',
      'assistant',
      'building',
      'flat',
      'owner',
      'mandate'
    ],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'biens-etapes',
          title: 'The steps',
          description:
            'The process runs step by step. You can only open steps you have already reached, and “Next” stays greyed out until the current step is correctly filled in.'
        },
        {
          target: 'biens-type',
          title: 'The property type',
          description:
            'Choose the type first. It determines the steps and fields that follow: a plot or a parking space has no “General features” step.'
        },
        {
          target: 'biens-titre',
          title: 'The title',
          description:
            'Give a clear title, for example “Three-room flat in Cocody”. The title and the type are required.'
        },
        {
          target: 'biens-proprietaire',
          title: 'The owner',
          description:
            '“The agency” for an agency property; “A client” for a property managed for its owner: a management mandate is then created with the property.'
        },
        {
          target: 'biens-navigation',
          title: 'Move on and finish',
          description:
            '“Next” goes to the following step. On the last step, “Finish” opens the property page; the property has already been saved since the “Media” step.'
        }
      ]
    }
  },
  {
    id: 'commercial.biens.nouveau.identification',
    kind: 'section',
    title: 'Type and identification',
    summary:
      'Choose the property type, give it a title and say who owns it. The type and the title are required, as is the owner for a client’s property.',
    steps: [
      {
        title: 'Property type',
        detail:
          'Click a tile: Flat, House / Villa, Studio, Duplex / Triplex, Office, Shop / Retail, Warehouse/Industrial, Plot, Building or Parking / Garage.'
      },
      {
        title: 'Title',
        detail: 'A short, clear title, for example “Three-room flat in Cocody”.'
      },
      {
        title: 'Owner',
        detail: 'Choose “The agency”, or “A client” and then select the owner in the list.'
      },
      {
        title: 'Description',
        detail: 'Optional here, but required to publish the property.'
      }
    ],
    consequences: [
      'With “A client”, the owner must be a client of the agency with the Owner role (converted contacts are included). A management mandate is created together with the property.',
      'With “The agency”, the property has no separate owner.'
    ],
    faq: [
      {
        q: 'Can I change the property type later?',
        a: 'No. The edit screen no longer offers the choice of type: choose it carefully here.'
      },
      {
        q: 'I cannot see the owner choice. Why?',
        a: 'Depending on how your account is set up, this choice may be hidden: the property then stays with the agency.'
      },
      {
        q: 'The owner I am looking for is missing from the list.',
        a: 'The list only contains the agency’s clients with the Owner role. First convert the contact concerned from their page.'
      }
    ],
    related: [{ label: 'Overview of the creation', helpId: 'commercial.biens.nouveau' }],
    keywords: ['property type', 'title', 'owner', 'client', 'agency', 'management mandate']
  },
  {
    id: 'commercial.biens.nouveau.localisation',
    kind: 'section',
    title: 'Location',
    summary:
      'Say where the property is. Only the location (country, region, district) is required; the neighbourhood and the address are optional.',
    steps: [
      {
        title: 'Location',
        detail: 'Type the name of a district, for example Cocody, then choose it in the list.'
      },
      {
        title: 'Neighbourhood / area',
        detail: 'For example Angré or Riviera. Optional.'
      },
      {
        title: 'Address',
        detail: 'Full address. Optional.'
      }
    ],
    consequences: [
      'This assistant does not ask for the coordinates (latitude and longitude). They are required to publish: you enter them when editing.',
      'The address is visible to the public if the property is published.'
    ],
    faq: [
      {
        q: 'How do I fill in the property’s coordinates?',
        a: 'Open “Edit”: the “Exact address (optional)” field fills in the address, the neighbourhood and the coordinates automatically.'
      },
      {
        q: 'What is the neighbourhood for?',
        a: 'Together with the address, it lets you find the property with the “District” filter of the property list.'
      },
      {
        q: 'What happens if I leave the address empty?',
        a: 'The property is created without an address. It cannot be published until an address is entered.'
      }
    ],
    related: [{ label: 'Edit the location', helpId: 'commercial.biens.modifier.localisation' }],
    keywords: ['district', 'neighbourhood', 'address', 'country', 'region', 'gps', 'coordinates']
  },
  {
    id: 'commercial.biens.nouveau.caracteristiques',
    kind: 'section',
    title: 'General features',
    summary:
      'Fill in the floor area, year, condition, standing and number of rooms. No field is required, and the fields offered depend on the property type.',
    howToRead: {
      notes: [
        'Main floor area (m²): offered for every type except plot, parking and building.',
        'Year built and Overall condition (New, Good, In need of renovation, Under construction): for every type except plot and parking.',
        'Standing (Budget, Standard, High-end, Luxury): for a home, an office or a building.',
        'Number of rooms, bedrooms and bathrooms: for a home (flat, studio, duplex, house).',
        'Plot area (m²): for a house / villa only.',
        'Furnishing status (Unfurnished, Furnished, Partly furnished): for a flat, a studio or a duplex.'
      ]
    },
    consequences: ['This step does not exist for a plot or a parking space: the assistant goes straight to the price.'],
    faq: [
      {
        q: 'Why are some fields missing?',
        a: 'The assistant only asks the questions that make sense for the chosen type. A “Main floor area” is for instance not asked for a building, whose area comes from its flats.'
      },
      {
        q: 'Can I complete this information later?',
        a: 'Yes, from “Edit”, in the sections “3. General features” and “5. Physical features”.'
      },
      {
        q: 'Can I skip this step without filling anything in?',
        a: 'Yes: no field of this step is required, just click “Next”.'
      }
    ],
    related: [{ label: 'Features when editing', helpId: 'commercial.biens.modifier.caracteristiques' }],
    keywords: ['floor area', 'rooms', 'bedrooms', 'standing', 'furnished', 'year built', 'condition']
  },
  {
    id: 'commercial.biens.nouveau.prix',
    kind: 'section',
    title: 'Price and terms',
    summary:
      'Choose whether the property is for “Sale” or “Rental”, then enter the price or the rent in FCFA. The transaction type is required, the amounts are not.',
    steps: [
      {
        title: 'Transaction type',
        detail: '“Sale” or “Rental”. A property is either for sale or to let, not both.'
      },
      {
        title: 'Sale price or Monthly rent',
        detail: 'The label follows your choice. Enter the amount in FCFA.'
      },
      {
        title: 'Charges',
        detail: '“Co-ownership charges” for a sale, “Charges (monthly provision)” for a rental.'
      },
      {
        title: 'Security deposit',
        detail: 'Offered for a rental only.'
      }
    ],
    consequences: [
      'The price is required to publish the property: without it, publication is refused.',
      'For a building to let, neither rent nor charges are asked: the rent is entered on each flat, at the “Specifics” step.'
    ],
    faq: [
      {
        q: 'Why is there no choice of currency?',
        a: 'Amounts are in FCFA: the choice of currency has been removed.'
      },
      {
        q: 'Where do I enter the agency’s commission?',
        a: 'Not on this screen: the agency’s remuneration is not managed from a property page.'
      },
      {
        q: 'Do I have to enter the price now?',
        a: 'No, no amount is required here. It only becomes required to publish the property.'
      }
    ],
    related: [{ label: 'Price when editing', helpId: 'commercial.biens.modifier.prix' }],
    keywords: ['price', 'rent', 'sale', 'rental', 'charges', 'security deposit', 'fcfa']
  },
  {
    id: 'commercial.biens.nouveau.specificites',
    kind: 'section',
    title: 'Type-specific features',
    summary:
      'This step asks for the details specific to the property type. For a building, you also enter the list of its flats here.',
    steps: [
      {
        title: 'Fill in the fields',
        detail: 'The fields depend on the chosen type. Those with a red star are required.'
      },
      {
        title: 'Building: number of flats',
        detail: 'Enter the “Total number of flats” (from 1 to 200): that many rows appear in “Flats”.'
      },
      {
        title: 'Building: describe each flat',
        detail:
          'For each row: title, floor area, rooms, bedrooms, bathrooms (Bath) and price (for a sale) or rent (for a rental).'
      }
    ],
    consequences: [
      'The flats are only created when you click “Finish”, once the building is saved. Only those with a title are created; each one gets the status “Available”.',
      'If some flats cannot be created, a message tells you how many were: add the others from the building’s page.'
    ],
    faq: [
      {
        q: 'I changed the number of flats: do I lose my rows?',
        a: 'No. If the number goes up, rows are added; if it goes down, only the last ones disappear.'
      },
      {
        q: 'What should I do for a building with more than 200 flats?',
        a: 'Create the first 200 here, then add the others one by one from the building’s page.'
      },
      {
        q: 'An “is required” message appears under a field.',
        a: 'That field has a red star: fill it in to be able to continue.'
      }
    ],
    related: [{ label: 'Price and terms', helpId: 'commercial.biens.nouveau.prix' }],
    keywords: ['building', 'flats', 'units', 'total number of flats', 'specific features']
  },
  {
    id: 'commercial.biens.nouveau.medias',
    kind: 'section',
    title: 'Media',
    summary:
      'Add the property’s photos and videos. The property is saved when you reach this step, which makes it possible to upload the files.',
    steps: [
      {
        title: 'Add photos or videos',
        detail: 'Drag your files into the area or click “Select files”.'
      },
      {
        title: 'Choose the main photo',
        detail: 'In the gallery, click the star on a photo: it gets the “Main” badge.'
      },
      {
        title: 'Reorder',
        detail: 'Drag a photo to its new place.'
      },
      {
        title: 'Finish',
        detail: 'Click “Finish”: the property page opens.'
      }
    ],
    howToRead: {
      notes: [
        'Photos: JPEG, PNG or WebP. Videos: MP4, WebM or QuickTime. 50 MB maximum, as shown under the drop area.',
        'Only a photo can be “Main”; a video cannot.'
      ]
    },
    consequences: [
      'Adding photos does not automatically make one of them the main photo. A main photo is nevertheless required to publish the property.',
      'Deleting a file asks for confirmation and erases the file: this cannot be undone.'
    ],
    faq: [
      {
        q: 'A file is refused. Why?',
        a: 'Its format is not accepted for this kind of media: a photo must be JPEG, PNG or WebP, a video MP4, WebM or QuickTime.'
      },
      {
        q: 'This step stays on “Preparing the media area…”.',
        a: 'The property could not be saved, for example because your subscription limits the number of properties. Click “Finish” to try saving again.'
      },
      {
        q: 'I cannot upload files.',
        a: 'Adding media requires the right “Edit properties”, in addition to “Create properties”.'
      }
    ],
    related: [{ label: 'Photos and videos when editing', helpId: 'commercial.biens.modifier.medias' }],
    keywords: ['photo', 'video', 'image', 'gallery', 'main photo', 'upload']
  },

  // ---------------------------------------------------------------------------
  // Editing a property
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.biens.modifier',
    kind: 'page',
    title: 'Edit the property',
    summary:
      'This screen brings together the property’s publication, its full form (six sections) and its photos and videos. The form is saved with “Update”; publication and media take effect immediately.',
    purpose:
      'Complete or correct an existing property: title, status, location, price, features, photos. This is also where you publish it to the public portal or remove it from there.',
    steps: [
      {
        title: 'Publish or remove',
        detail:
          'At the top, the “Publication” block says whether the property is published and offers the right button.'
      },
      {
        title: 'Edit the form',
        detail: 'Go through sections 1 to 6 and correct what needs correcting.'
      },
      {
        title: 'Save',
        detail: 'Click “Update”: the property page opens. “Cancel” goes back to the page without saving anything.'
      },
      {
        title: 'Manage the media',
        detail: 'In “Photos and videos”, add, sort or delete the files.'
      }
    ],
    consequences: [
      '“Update” saves the whole form at once; publication and media, however, take effect immediately, without waiting for this button.',
      'Every status change made with this form is recorded in the property’s history.',
      'The property type and the internal reference cannot be changed.'
    ],
    faq: [
      {
        q: 'I changed a field then clicked “Cancel”: is it lost?',
        a: 'Yes, unsaved form changes are lost. Photos added or deleted, on the other hand, have already been taken into account.'
      },
      {
        q: 'Why is the status change refused?',
        a: 'Some changes are not allowed: a “Let” or “Sold” property can only go back to “Available” or be “Archived”.'
      },
      {
        q: 'Where do I schedule a viewing?',
        a: 'From the property page. Scheduled viewings then appear in the viewing calendar.'
      }
    ],
    permissions: {
      note: 'Editing requires “Edit properties”. Publishing and removing from the portal require “Publish / unpublish properties”.'
    },
    related: [
      { label: 'Publish a property', helpId: 'commercial.biens.modifier.publication' },
      { label: 'Photos and videos', helpId: 'commercial.biens.modifier.medias' },
      { label: 'Back to the property list', helpId: 'commercial.biens.liste' }
    ],
    keywords: ['edit a property', 'correct', 'update', 'status', 'publish', 'photos']
  },
  {
    id: 'commercial.biens.modifier.publication',
    kind: 'section',
    title: 'Publication',
    summary:
      'This block says whether the property is visible on the public portal, and lets you publish it or remove it. A property can only be published if several conditions are met.',
    howToRead: {
      notes: [
        '“Published”: the property is visible on the public portal, with its publication date. “Not published”: it is not.',
        'Publication requirements: a title, a description, an address, a main photo, the latitude and longitude, a price, and a status of “Available”, “Reserved” or “Under offer”.',
        'When a requirement is missing, a “Publication requirements not met” box lists them all.'
      ]
    },
    steps: [
      {
        title: 'Check the requirements',
        detail: 'Complete the form and the photos: description, address, coordinates, price, main photo.'
      },
      {
        title: 'Publish',
        detail: 'Click “Publish to the public portal”.'
      },
      {
        title: 'Remove',
        detail: 'Click “Remove from the public portal”, then confirm with “Yes”.'
      }
    ],
    consequences: [
      'Once published, the property becomes visible to the public: title, description, address, neighbourhood, coordinates, price, charges, areas, rooms and photos. The owner, the internal reference and the documents are not shown.',
      'Removing the property from the portal makes it invisible and erases its publication date; you can publish it again.',
      'If your agency has set up WhatsApp broadcasting, a notice about the property may be sent to its group when you publish.'
    ],
    faq: [
      {
        q: 'Why is publication refused although the property has photos?',
        a: 'A “Main” photo is needed. Adding a photo does not set it as main: click the star on the photo you want in the gallery.'
      },
      {
        q: 'Where do I enter the latitude and longitude?',
        a: 'In the section “2. Location”: the “Exact address (optional)” field fills them in automatically, or enter them by hand.'
      },
      {
        q: 'I cannot see the publish button.',
        a: 'It depends on the right “Publish / unpublish properties”. Ask your agency administrator for it.'
      }
    ],
    permissions: {
      note: 'Requires “Publish / unpublish properties”.'
    },
    related: [
      { label: 'Add a main photo', helpId: 'commercial.biens.modifier.medias' },
      { label: 'Location and coordinates', helpId: 'commercial.biens.modifier.localisation' }
    ],
    keywords: ['publish', 'unpublish', 'public portal', 'listing', 'go online', 'visible']
  },
  {
    id: 'commercial.biens.modifier.identification',
    kind: 'section',
    title: '1. Identification',
    summary:
      'Title, owner, description, status and availability of the property. The title, the status and the availability are required; the owner is required for a property that does not belong to the agency.',
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Draft', description: 'Property still being entered, cannot be published.' },
        { value: 'AVAILABLE', label: 'Available', description: 'Property on offer, can be published.' },
        { value: 'RESERVED', label: 'Reserved', description: 'Reserved property, can still be published.' },
        { value: 'UNDER_OFFER', label: 'Under offer', description: 'Offer in progress, can still be published.' },
        { value: 'SOLD', label: 'Sold', description: 'Sold property, cannot be published.' },
        { value: 'RENTED', label: 'Let', description: 'Let property, cannot be published.' },
        { value: 'ARCHIVED', label: 'Archived', description: 'Property removed from the property list.' }
      ],
      notes: [
        'Availability: “Immediate”, “Available soon” (an “Available from” date is then asked for) or “Unavailable”.',
        'The internal reference is shown and cannot be changed.'
      ]
    },
    consequences: [
      'Every status change is recorded in the property’s history.',
      'Some changes are refused: a “Let” or “Sold” property can only become “Available” or “Archived”.'
    ],
    faq: [
      {
        q: 'Why can I not change the property type?',
        a: 'The type is chosen at creation and can no longer be changed from this screen.'
      },
      {
        q: 'What happens if I choose “Archived”?',
        a: 'The property disappears from the property list.'
      },
      {
        q: 'What is the difference between “Status” and “Availability”?',
        a: 'The status says where the property stands (Available, Let, Sold…). The availability says whether it can be occupied right away, soon or not.'
      }
    ],
    related: [{ label: 'Publication', helpId: 'commercial.biens.modifier.publication' }],
    keywords: ['title', 'status', 'availability', 'owner', 'description', 'reference']
  },
  {
    id: 'commercial.biens.modifier.localisation',
    kind: 'section',
    title: '2. Location',
    summary:
      'District, address, neighbourhood and coordinates of the property. The exact address fills in the rest automatically.',
    steps: [
      {
        title: 'Location (country > region > district)',
        detail: 'Search for the district.'
      },
      {
        title: 'Exact address',
        detail:
          'Type a street, a neighbourhood or a place and choose a suggestion: the address, the neighbourhood, the latitude and the longitude are filled in.'
      },
      {
        title: 'Check and correct',
        detail:
          'Adjust the address, the neighbourhood, the latitude, the longitude and the points of interest by hand if needed.'
      }
    ],
    consequences: [
      'The address, the neighbourhood and the coordinates are visible to the public once the property is published.',
      'The address, the latitude and the longitude are required to publish.'
    ],
    faq: [
      {
        q: 'Where do the address suggestions come from?',
        a: 'From a free service, Photon / OpenStreetMap. Check the suggestion before saving it.'
      },
      {
        q: 'The address suggestion is wrong: what should I do?',
        a: 'Correct the address, the latitude and the longitude by hand in the fields below.'
      },
      {
        q: 'Why is the address important?',
        a: 'Together with the latitude and longitude, it is required to publish the property.'
      }
    ],
    related: [{ label: 'Publication', helpId: 'commercial.biens.modifier.publication' }],
    keywords: ['address', 'coordinates', 'latitude', 'longitude', 'neighbourhood', 'district', 'gps']
  },
  {
    id: 'commercial.biens.modifier.caracteristiques',
    kind: 'section',
    title: 'Property features',
    summary:
      'Sections 3 (general), 5 (physical) and 6 (specific) describe the property: areas, year, condition, standing, rooms, furnishing and details specific to its type. None of these fields is required, except those marked with a red star in section 6.',
    howToRead: {
      notes: [
        '3. General features: Main floor area, Usable area, Year built, Overall condition (New, Good, In need of renovation, Under construction), Standing (Budget, Standard, High-end, Luxury). Depending on the property type, some fields do not appear.',
        '5. Physical features: Number of rooms, Bedrooms, Bathrooms / WC, and depending on the type Plot area and Furnished. This section only appears for a home.',
        '6. Type-specific features: the details specific to the property type. For a building, the “Total number of flats” field is found there.'
      ]
    },
    faq: [
      {
        q: 'A section is missing. Why?',
        a: 'Sections 5 and 6 depend on the property type: they only appear when they make sense for it.'
      },
      {
        q: 'Where do I edit a building’s flats?',
        a: 'From the building’s page.'
      },
      {
        q: 'What if I do not know a value?',
        a: 'Leave the field empty: only the fields marked with a red star are required.'
      }
    ],
    related: [{ label: 'Price and terms', helpId: 'commercial.biens.modifier.prix' }],
    keywords: ['floor area', 'rooms', 'bedrooms', 'standing', 'furnished', 'year', 'condition', 'features']
  },
  {
    id: 'commercial.biens.modifier.prix',
    kind: 'section',
    title: '4. Price and terms',
    summary:
      'Transaction type, price or rent, charges and security deposit, in FCFA. The transaction type is required.',
    steps: [
      {
        title: 'Transaction type',
        detail: '“Sale” or “Rental”, never both.'
      },
      {
        title: 'Sale price or Monthly rent',
        detail: 'The label follows the transaction type.'
      },
      {
        title: 'Charges and security deposit',
        detail: '“Co-ownership charges” for a sale; “Charges (monthly provision)” and “Security deposit” for a rental.'
      }
    ],
    consequences: [
      'The price is required to publish the property.',
      'For a building to let, neither rent nor charges are asked: the rent is managed flat by flat.'
    ],
    faq: [
      {
        q: 'Can I switch a property from sale to rental?',
        a: 'Yes, by changing the transaction type then re-entering the amount: the same field holds the sale price or the rent.'
      },
      {
        q: 'Is the price required?',
        a: 'Only the transaction type is. The price becomes necessary to publish the property.'
      },
      {
        q: 'Where is the security deposit?',
        a: 'It only appears for a property for “Rental”.'
      }
    ],
    related: [{ label: 'Publication', helpId: 'commercial.biens.modifier.publication' }],
    keywords: ['price', 'rent', 'charges', 'security deposit', 'sale', 'rental', 'fcfa']
  },
  {
    id: 'commercial.biens.modifier.medias',
    kind: 'section',
    title: 'Photos and videos',
    summary:
      'Add, sort and delete the property’s photos and videos. These actions take effect immediately, without going through “Update”.',
    steps: [
      {
        title: 'Add',
        detail: 'Drag your files into the area or click “Select files”.'
      },
      {
        title: 'Set the main photo',
        detail: 'Hover over a photo and click the star: it gets the “Main” badge.'
      },
      {
        title: 'Reorder',
        detail: 'Drag a photo or a video to its new place.'
      },
      {
        title: 'Delete',
        detail: 'Hover over the file, click the bin then confirm with “Delete”.'
      }
    ],
    howToRead: {
      notes: [
        'Photos: JPEG, PNG or WebP. Videos: MP4, WebM or QuickTime. 50 MB maximum, as shown under the drop area.',
        'Only a photo can be “Main”. It serves as the cover on the property’s card.'
      ]
    },
    consequences: [
      'An added photo is not main by default. Without a main photo, the property cannot be published.',
      'Deleting a file erases it permanently.'
    ],
    faq: [
      {
        q: 'Which photo appears on the card in the list?',
        a: 'The main photo; otherwise the first photo in display order.'
      },
      {
        q: 'Why is my file refused?',
        a: 'Its format is not accepted, or its content is not a valid photo or video.'
      },
      {
        q: 'Can a video be the main photo?',
        a: 'No, only a photo can be “Main”.'
      }
    ],
    permissions: {
      note: 'Requires “Edit properties”.'
    },
    related: [{ label: 'Publication', helpId: 'commercial.biens.modifier.publication' }],
    keywords: ['photo', 'video', 'gallery', 'main photo', 'image', 'upload']
  },

  // ---------------------------------------------------------------------------
  // Viewing calendar
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.biens.visites',
    kind: 'page',
    title: 'Viewing calendar',
    summary:
      'Here you will find every property viewing scheduled by your agency, day by day. The screen is for consulting: you do not schedule a viewing from this page.',
    purpose:
      'The calendar gives the overview of upcoming viewings: at what time, for which property, with which contact and which team member. Viewings are scheduled from the property page.',
    steps: [
      {
        title: 'Browse the days',
        detail: 'Viewings are grouped by date, with the day written out in full.'
      },
      {
        title: 'Filter by team member',
        detail:
          'Choose a team member in “Filter by team member” to see only their viewings. Clear the field to see everything again.'
      },
      {
        title: 'Open the property',
        detail: 'Click the property’s title to open its page.'
      }
    ],
    consequences: [
      'The calendar covers the period that starts now and lasts 30 days. It cannot be changed on this screen, and past viewings do not appear.',
      'Cancelled or completed viewings are shown too, with their status.'
    ],
    faq: [
      {
        q: 'Why do I see no viewing?',
        a: '“No viewing scheduled” is displayed when nothing is planned in the next 30 days, or when the chosen team member has no viewing.'
      },
      {
        q: 'How do I schedule a viewing or change its status?',
        a: 'From the page of the property concerned. The calendar is updated afterwards.'
      },
      {
        q: 'Why has a past viewing disappeared?',
        a: 'The calendar only shows upcoming viewings, over 30 days.'
      }
    ],
    permissions: {
      note: 'Consulting the calendar requires “View properties”; scheduling a viewing requires “Schedule viewings”.'
    },
    related: [
      { label: 'How to read a viewing', helpId: 'commercial.biens.visites.calendrier' },
      { label: 'Property list', helpId: 'commercial.biens.liste' }
    ],
    keywords: ['viewing', 'viewings', 'appointment', 'diary', 'calendar', 'team member']
  },
  {
    id: 'commercial.biens.visites.calendrier',
    kind: 'section',
    title: 'Scheduled viewings',
    summary:
      'Each card is a viewing: time, duration, status, property, place, team member, contact, deal type and notes. The team member filter narrows the list.',
    howToRead: {
      statuses: [
        { value: 'SCHEDULED', label: 'Scheduled', description: 'The viewing is planned.' },
        { value: 'CONFIRMED', label: 'Confirmed', description: 'The viewing is confirmed.' },
        { value: 'DONE', label: 'Completed', description: 'The viewing took place.' },
        { value: 'NO_SHOW', label: 'Absent', description: 'The visitor did not turn up.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'The viewing is cancelled.' }
      ],
      notes: [
        'At the top of each viewing: the time, the duration in minutes when known, and the status.',
        'Below: the property’s title (or its address), the meeting place, “Assigned to” with the team member, the contact’s name, the type of the linked deal and the notes.'
      ]
    },
    related: [{ label: 'Overview of the calendar', helpId: 'commercial.biens.visites' }],
    keywords: ['viewing', 'status', 'confirmed', 'cancelled', 'absent', 'completed']
  }
];

export default entries;
