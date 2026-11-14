import type { HelpEntry } from '../../../types';

/** Zone « maintenance-gestion » du module « administration » (en) : tickets d'incident et prestataires, côté agence. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ File des tickets
  {
    id: 'administration.maintenance-gestion.tickets',
    kind: 'page',
    title: 'Maintenance ticket management',
    summary:
      "Find here every incident reported for your agency's properties (leak, power failure, air conditioning...). Open a ticket to handle it, assign it to a service provider and move it forward until it is resolved.",
    purpose:
      "A ticket is a request for intervention declared by a tenant, an owner or an agency staff member. This list is the manager's work queue: filter it, spot the urgent cases, then open the ticket to decide what happens next.",
    steps: [
      {
        title: 'Spot the tickets to handle',
        detail: 'Filter by "Status" (for example "Reported") or by "Priority" (for example "Urgent").'
      },
      {
        title: 'Refine the search',
        detail:
          'The other criteria are "Category", "Property", "Contractor" and "Created from / to". The "Search" box searches the title, the description, the property and the service provider.'
      },
      {
        title: 'Open a ticket',
        detail: 'Click its title or the eye icon in the "Action" column.'
      },
      {
        title: 'Export the list',
        detail: 'The table offers an export: it contains the tickets matching your filters.'
      }
    ],
    consequences: [
      'This list is read-only: nothing changes until you open a ticket and save your changes.',
      'When a ticket is created, the agency administrators receive an e-mail, if this notification is enabled for your agency.'
    ],
    faq: [
      {
        q: 'Where do tickets come from?',
        a: 'They are created by tenants and owners from their portal, or by an agency staff member. This screen does not let you create one.'
      },
      {
        q: 'I see no ticket, is that normal?',
        a: 'If no filter is active, no ticket has been declared yet. Otherwise, remove the filters: the message "No maintenance ticket" only appears without a filter.'
      },
      {
        q: 'What is the difference between "Reported" and "In progress"?',
        a: '"Reported" is a ticket nobody has taken charge of yet. The manager sets it to "In progress" when they start working on it.'
      },
      {
        q: 'Why can I not open this screen?',
        a: 'It requires the "Manage every ticket and contractor" right. Ask your agency administrator for it.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager'],
      note: 'Required right: "Manage every ticket and contractor". The roles that carry it depend on your agency configuration.'
    },
    related: [
      { label: 'Tickets table', helpId: 'administration.maintenance-gestion.tickets.tableau' },
      { label: 'Ticket details', helpId: 'administration.maintenance-gestion.ticket-detail' },
      { label: 'Service providers', helpId: 'administration.maintenance-gestion.prestataires' },
      { label: 'Service provider list (screen)', to: '/tenant/:tenantId/admin/maintenance/vendors' }
    ],
    keywords: ['incident', 'breakdown', 'repair', 'request', 'intervention', 'maintenance', 'ticket']
  },
  {
    id: 'administration.maintenance-gestion.tickets.tableau',
    kind: 'table',
    title: 'Tickets table',
    summary:
      'One row per agency ticket, according to the search applied. Use the filters above the table to narrow the list.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Title', description: 'Name of the incident. Click it to open the ticket.' },
        {
          key: 'property',
          label: 'Property',
          description: 'Address of the property concerned. "N/A" if the property has no address.'
        },
        {
          key: 'category',
          label: 'Category',
          description: 'Type of problem: Plumbing, Electrical, Air conditioning or Other.'
        },
        {
          key: 'priority',
          label: 'Priority',
          description: 'Urgency of the intervention: Low, Medium, High or Urgent.'
        },
        { key: 'status', label: 'Status', description: 'Current step of the ticket (see below).' },
        {
          key: 'assignedVendor',
          label: 'Contractor',
          description: 'Name of the service provider in charge of the intervention. A dash means none is assigned.'
        },
        { key: 'createdAt', label: 'Creation date', description: 'Day the ticket was declared.' },
        { key: 'action', label: 'Action', description: 'The eye icon opens the ticket.' }
      ],
      statuses: [
        {
          value: 'DECLARED',
          label: 'Reported',
          description: 'The ticket has just been reported, nobody has taken charge of it yet.'
        },
        { value: 'IN_PROGRESS', label: 'In progress', description: 'The agency has started handling the ticket.' },
        {
          value: 'ASSIGNED',
          label: 'Assigned',
          description: 'A service provider or a person in charge is designated to intervene.'
        },
        {
          value: 'RESOLVED',
          label: 'Resolved',
          description: 'The intervention is finished. The status no longer changes.'
        },
        { value: 'CANCELED', label: 'Cancelled', description: 'The ticket is abandoned. The status no longer changes.' }
      ],
      notes: [
        'The "Contractor" filter only offers service providers of your agency. Filters are kept in the page address: you can bookmark or share it.'
      ]
    },
    related: [{ label: 'Ticket details', helpId: 'administration.maintenance-gestion.ticket-detail' }],
    faq: [
      {
        q: 'How do I find a specific ticket?',
        a: 'Type a word in "Search": it looks in the title, the description, the property and the provider. You can also filter by "Status", "Priority", "Category", "Property", "Contractor" or "Created from / to".'
      },
      { q: 'How do I open a ticket?', a: 'Click its title, or the eye icon in the "Action" column.' },
      {
        q: 'Why is the table empty?',
        a: 'If filters are active, no ticket matches them: remove them to see the whole list again. With no filter, the message "No maintenance ticket" means the agency has no ticket yet.'
      }
    ],
    keywords: ['filter', 'search', 'export', 'status', 'priority']
  },

  // ------------------------------------------------------------------ Fiche d'un ticket
  {
    id: 'administration.maintenance-gestion.ticket-detail',
    kind: 'page',
    title: 'Maintenance ticket details',
    summary:
      'View the details of an incident, change its status and priority, assign a service provider and note the resolution. Comments and history keep a trace of each step.',
    purpose:
      'This is where the manager handles the incident: reads the description from the tenant or owner, chooses who intervenes, moves the ticket forward and closes it.',
    steps: [
      {
        title: 'Read the ticket',
        detail: 'Check the category, the property, the tenant, the description and the location details.'
      },
      {
        title: 'Set the ticket to "In progress"',
        detail: 'In the "Status" list, choose "In progress" then "Save changes".'
      },
      {
        title: 'Choose a service provider',
        detail: 'In "Contractor assigned", select an active service provider.'
      },
      {
        title: 'Set the ticket to "Assigned"',
        detail: 'This status is only accepted if a service provider is chosen. Save.'
      },
      {
        title: 'Close',
        detail: 'Once the work is done, choose "Resolved", complete the resolution notes and save.'
      }
    ],
    consequences: [
      'Changes in the form (status, priority, service provider, notes) are only saved when you click "Save changes".',
      '"Resolved" and "Cancelled" are final: the status can no longer be changed afterwards.',
      'When the status changes, the tenant is notified by e-mail and the property owner by e-mail, if these notifications are enabled for your agency; the tenant can also be notified by WhatsApp if your agency enabled it. Changing only the priority, the service provider or the notes sends no message.',
      'The application does not send any message to the service provider: contact them yourself.'
    ],
    faq: [
      {
        q: 'Why can I not choose "Assigned"?',
        a: 'You can only move forward one step at a time: "Reported" leads to "In progress", "In progress" leads to "Assigned", "Assigned" leads to "Resolved". "Assigned" also requires a chosen service provider.'
      },
      {
        q: 'Can I cancel a ticket?',
        a: 'Yes, from "Reported" or "In progress". An "Assigned" ticket can no longer be canceled: it ends with "Resolved".'
      },
      {
        q: 'A message says the status has changed, what should I do?',
        a: 'Someone modified the ticket while you were viewing it. The screen reloads: check the current state and make your change again.'
      },
      {
        q: 'My service provider is not in the list.',
        a: 'The list only shows the active service providers of your agency. Check that they exist and are "Active" on the service providers screen.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager'],
      note: 'Required right: "Manage every ticket and contractor".'
    },
    related: [
      {
        label: 'Status, priority and service provider',
        helpId: 'administration.maintenance-gestion.ticket-detail.assignation'
      },
      { label: 'Status history', helpId: 'administration.maintenance-gestion.ticket-detail.historique' },
      { label: 'Ticket list', to: '/tenant/:tenantId/admin/maintenance/tickets' }
    ],
    keywords: ['resolution', 'close', 'assign', 'intervention', 'status', 'priority']
  },
  {
    id: 'administration.maintenance-gestion.ticket-detail.informations',
    kind: 'section',
    title: 'Ticket information',
    summary:
      'Summarizes the ticket: category, property concerned, tenant and assigned service provider. These lines are read-only.',
    howToRead: {
      notes: [
        '"Property" gives the address of the property. "Tenant" only appears if a tenant is linked to the ticket.',
        '"Contractor assigned" only appears if a service provider is chosen; their phone number is shown in brackets if filled in.',
        'The current status is shown again at the top of the page, next to the title and the creation date.'
      ]
    },
    related: [
      {
        label: 'Status, priority and service provider',
        helpId: 'administration.maintenance-gestion.ticket-detail.assignation'
      }
    ],
    faq: [
      {
        q: 'Can I correct this information here?',
        a: 'No, these lines are read-only. In the ticket, only the status, the priority, the contractor and the resolution notes can be changed.'
      },
      { q: 'Why is there no "Tenant" line?', a: 'It only appears if a tenant is linked to the ticket.' },
      {
        q: 'Where do I see the creation date of the ticket?',
        a: 'At the top of the page, under the title, after "Created on".'
      }
    ],
    keywords: ['category', 'tenant', 'property', 'address']
  },
  {
    id: 'administration.maintenance-gestion.ticket-detail.assignation',
    kind: 'section',
    title: 'Status, priority and service provider',
    summary:
      'This form moves the ticket forward: status, priority, assigned service provider and resolution notes. Nothing is taken into account before "Save changes".',
    howToRead: {
      statuses: [
        { value: 'DECLARED', label: 'Reported', description: 'Possible next steps: "In progress" or "Cancelled".' },
        { value: 'IN_PROGRESS', label: 'In progress', description: 'Possible next steps: "Assigned" or "Cancelled".' },
        {
          value: 'ASSIGNED',
          label: 'Assigned',
          description: 'Possible next step: "Resolved". Requires a chosen service provider.'
        },
        { value: 'RESOLVED', label: 'Resolved', description: 'Final step: the "Status" list is greyed out.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'Final step: the "Status" list is greyed out.' }
      ],
      notes: [
        'Available priorities: Low, Medium, High, Urgent.',
        'The service provider is chosen among the active service providers of the agency; the cross in the list removes the assignment.'
      ]
    },
    steps: [
      { title: 'Choose the next status', detail: 'The list only offers the allowed steps.' },
      { title: 'Adjust the priority if needed' },
      { title: 'Choose the service provider', detail: 'Required before moving to "Assigned".' },
      { title: 'Enter the resolution notes', detail: 'Optional: describe what was done.' },
      { title: 'Save', detail: 'Click "Save changes".' }
    ],
    consequences: [
      'A status change is recorded in the history with your name and the date, and triggers the e-mails to the tenant and the owner if your agency enabled them.',
      '"Resolved" and "Cancelled" are irreversible.',
      'If saving is refused, the screen goes back to what is actually saved and shows the reason.'
    ],
    faq: [
      {
        q: 'Can I change the service provider after assigning?',
        a: 'Yes, as long as the ticket is not "Resolved" or "Cancelled": choose another service provider and save. Changing the service provider alone sends no message.'
      },
      {
        q: 'Is the service provider notified automatically?',
        a: 'No. The application sends them nothing: contact them using the number shown on the ticket.'
      },
      {
        q: 'What should I write in the resolution notes?',
        a: 'What was done, the date and anything useful for later. These notes stay on the ticket.'
      }
    ],
    related: [{ label: 'Status history', helpId: 'administration.maintenance-gestion.ticket-detail.historique' }],
    keywords: ['assign', 'service provider', 'status', 'priority', 'resolution']
  },
  {
    id: 'administration.maintenance-gestion.ticket-detail.historique',
    kind: 'section',
    title: 'Status history',
    summary:
      'Lists each status change of the ticket, with the date and the person who made it. The most recent line is in blue.',
    howToRead: {
      notes: [
        'Each line reads "old status → new status".',
        'If the change was not made by a person, "(System)" is shown instead of the name.',
        '"No history available" means no change has been recorded yet.'
      ]
    },
    faq: [
      {
        q: 'Why does the first line have no arrow?',
        a: 'It is the creation of the ticket: there was no status before, so only "Reported" is shown, with a creation note that is always written in French.'
      },
      {
        q: 'What does "(System)" mean?',
        a: 'The change is not linked to any person: the screen shows "(System)" instead of a name.'
      },
      {
        q: 'Where is the remark attached to a change?',
        a: 'When a note was saved with the change, it appears in grey under the status. The date and the person are shown below it.'
      }
    ],
    keywords: ['history', 'follow-up', 'log', 'who modified']
  },
  {
    id: 'administration.maintenance-gestion.ticket-detail.pieces-jointes',
    kind: 'section',
    title: 'Attachments',
    summary:
      'Shows the photos or documents attached to the ticket when it was declared. You can download them with the "Download" button.',
    howToRead: {
      notes: [
        'This screen does not let you add or delete an attachment.',
        '"No attachments" is shown if nothing was attached.'
      ]
    },
    faq: [
      {
        q: 'What does each line show?',
        a: 'The file name and its size, or "Unknown size" if it is not known. For an image, a thumbnail is shown and enlarges when you click it.'
      },
      { q: 'How do I get a file?', a: 'Click "Download" on the file line.' },
      {
        q: 'Can I add a photo afterwards?',
        a: 'Not from this screen: it does not let you add or delete an attachment.'
      }
    ],
    keywords: ['photo', 'document', 'file', 'download']
  },
  {
    id: 'administration.maintenance-gestion.ticket-detail.commentaires',
    kind: 'section',
    title: 'Comments',
    summary:
      'Exchange remarks on the ticket: comments already posted are listed, then you can add your own. The "Send" button becomes active as soon as you have written a message.',
    steps: [
      { title: 'Write the message', detail: 'In the "Add a comment…" box.' },
      { title: 'Send', detail: 'Click "Send". The comment appears in the list.' }
    ],
    consequences: [
      'A comment cannot be edited or deleted from this screen.',
      'Sending a comment does not trigger an e-mail from this service: notify the person concerned another way if it is urgent.'
    ],
    faq: [
      {
        q: 'Does the tenant see my comments?',
        a: 'To be confirmed: the screen does not state the visibility of a comment on the portal side. Avoid writing sensitive internal information there.'
      },
      {
        q: 'Why is the "Send" button greyed out?',
        a: 'The message is empty: write at least one character.'
      },
      {
        q: 'Where can I see who wrote a comment?',
        a: 'The author is shown on each comment; "System" designates an automatic message.'
      }
    ],
    keywords: ['message', 'remark', 'exchange', 'note']
  },

  // ------------------------------------------------------------------ Prestataires
  {
    id: 'administration.maintenance-gestion.prestataires',
    kind: 'page',
    title: 'Service provider management',
    summary:
      'Find here the craftsmen and companies working for your agency (plumber, electrician, air conditioning...). These are the ones you assign to maintenance tickets.',
    purpose:
      'A service provider must exist and be "Active" to appear in the assignment list of a ticket. Suppliers are shared with the co-ownership side (maintenance contracts).',
    steps: [
      {
        title: 'Search for a service provider',
        detail: '"Search" box: name, specialty, e-mail or phone. "Status" filter: Active or Inactive.'
      },
      {
        title: 'Delete a service provider',
        detail: 'Red icon in the "Actions" column, then "Yes, delete" after reading the warning.'
      }
    ],
    consequences: [
      'Deletion is final: the service provider disappears from the agency.',
      'It is refused as long as the service provider is assigned to at least one ticket, whatever its status, or linked to a co-ownership contract. Reassign the tickets first.',
      'Deleting a service provider does not change the past tickets of other service providers.'
    ],
    faq: [
      {
        q: 'How do I add a service provider?',
        a: 'The "New contractor" button is present, but at the moment (to be confirmed with the product team) the entry form does not appear on this screen. Service providers already recorded remain usable.'
      },
      {
        q: 'A service provider cannot be deleted, why?',
        a: 'It is still assigned to a ticket or linked to a contract. Assign another service provider to those tickets, then try again.'
      },
      {
        q: 'Can I only deactivate a service provider?',
        a: 'This screen only offers permanent deletion. The "Active" or "Inactive" status remains visible in the table.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Manager'],
      note: 'Required right: "Manage every ticket and contractor".'
    },
    related: [
      { label: 'Service providers table', helpId: 'administration.maintenance-gestion.prestataires.tableau' },
      { label: 'Ticket list', helpId: 'administration.maintenance-gestion.tickets' }
    ],
    keywords: ['supplier', 'craftsman', 'plumber', 'electrician', 'company', 'subcontractor']
  },
  {
    id: 'administration.maintenance-gestion.prestataires.tableau',
    kind: 'table',
    title: 'Service providers table',
    summary:
      'One row per service provider of the agency, sorted by name. Filter by "Status" to see only the active or the inactive ones.',
    howToRead: {
      columns: [
        { key: 'name', label: 'Name', description: 'Name of the service provider or their company.' },
        {
          key: 'phone',
          label: 'Phone',
          description: 'Number to call for the intervention. A dash if not filled in.'
        },
        {
          key: 'email',
          label: 'Email',
          description: 'E-mail address of the service provider. A dash if not filled in.'
        },
        { key: 'specialties', label: 'Specialities', description: 'Areas of expertise, shown as labels.' },
        {
          key: 'isActive',
          label: 'Status',
          description: '"Active": offered for tickets. "Inactive": no longer offered.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: 'The pencil edits, the bin deletes permanently after confirmation.'
        }
      ],
      statuses: [
        {
          value: 'true',
          label: 'Active',
          description: 'The service provider appears in the assignment list of a ticket.'
        },
        { value: 'false', label: 'Inactive', description: 'The service provider is no longer offered for new tickets.' }
      ],
      notes: ['The edit pencil is present, but the matching form does not currently appear (to be confirmed).']
    },
    consequences: [
      'Deletion with the bin is irreversible and refused if the service provider is linked to a ticket or to a co-ownership contract.'
    ],
    faq: [
      {
        q: 'How do I search for a service provider?',
        a: 'Type a name, a specialty, an e-mail or a phone number in "Search". The "Status" filter offers "Active" or "Inactive".'
      },
      {
        q: 'What does a dash in a column mean?',
        a: 'The phone number, the e-mail or the specialties are not filled in for this service provider.'
      },
      {
        q: 'What happens when I click the bin?',
        a: 'A box asks "Are you sure you want to permanently delete this contractor?". With "Yes, delete", the deletion cannot be undone; "Cancel" closes the box without changing anything.'
      }
    ],
    keywords: ['list', 'search', 'active', 'inactive', 'delete']
  }
];

export default entries;
