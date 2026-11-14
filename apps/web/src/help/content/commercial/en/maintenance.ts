import type { HelpEntry } from '../../../types';

/** "Maintenance" area of the "commercial" module (en): list, creation, detail and editing of a maintenance ticket. */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------- Ticket list
  {
    id: 'commercial.maintenance.liste',
    kind: 'page',
    title: 'My maintenance tickets',
    summary:
      'Find the maintenance tickets here: a ticket reports an incident on a property (leak, breakdown, air conditioning...) and lets you follow how it is handled.',
    purpose:
      'Every reported incident becomes a ticket, sorted by creation date (most recent first). You can create one, search for it, open it to follow its progress, and edit or delete it while it is still "Reported".',
    steps: [
      {
        title: 'Report an incident',
        detail: '"New ticket" opens the creation form. When the list is empty, "Create a ticket" does the same.'
      },
      {
        title: 'Find a ticket',
        detail:
          'Type in "Search" or choose a Status or a Property. "More filters" adds priority, category and creation date.'
      },
      {
        title: 'Open the detail page',
        detail: "Click a ticket's card to see its description, history, attachments and comments."
      },
      {
        title: 'Edit or delete',
        detail: 'The "Edit" and "Delete" buttons are at the bottom of the card, depending on the ticket status.'
      }
    ],
    consequences: [
      'A new ticket always starts with the status "Reported".',
      '"Delete" permanently erases the ticket with its attachments, comments and history, after confirmation. This cannot be undone.',
      'Only a "Reported" ticket can be edited; only a "Reported" or "Cancelled" ticket can be deleted.'
    ],
    faq: [
      {
        q: 'Why is there no "Edit" button on some tickets?',
        a: 'A ticket can only be edited while it is "Reported". Once it is taken over, you can no longer edit it.'
      },
      {
        q: 'Who changes the status of a ticket?',
        a: 'Not this screen: the statuses "In progress", "Assigned" and "Resolved" are set by a manager from the agency tickets (Maintenance menu, "Agency tickets").'
      },
      {
        q: 'I cannot see the page or the menu.',
        a: 'You need the right "Create and view one\'s own maintenance tickets". Ask your agency administrator.'
      }
    ],
    permissions: {
      note: 'Required right: "Create and view one\'s own maintenance tickets". Managing all tickets and contractors requires the right "Manage every ticket and contractor".'
    },
    related: [
      { label: 'Search and filters', helpId: 'commercial.maintenance.liste.recherche' },
      { label: 'Ticket cards and their statuses', helpId: 'commercial.maintenance.liste.tickets' },
      { label: 'Create a ticket', helpId: 'commercial.maintenance.nouveau' }
    ],
    keywords: ['maintenance', 'ticket', 'incident', 'breakdown', 'repair', 'request', 'plumbing', 'electrical']
  },
  {
    id: 'commercial.maintenance.liste.recherche',
    kind: 'section',
    title: 'Ticket search and filters',
    summary: 'This bar filters the ticket cards shown below it. The number of results is displayed next to it.',
    howToRead: {
      notes: [
        '"Search": type a word from the title, description, location details, property or contractor.',
        'Status: Reported, In progress, Assigned, Resolved or Cancelled.',
        'Property: choose one of the agency properties (the list narrows as you type).',
        'Under "More filters": Priority (Low, Medium, High, Urgent), Category (Plumbing, Electrical, Air conditioning, Other) and "Created from / to" (creation period).',
        'The chosen filters stay in the page address: you can copy it to share it.'
      ]
    },
    steps: [
      { title: 'Type or choose', detail: 'Type in "Search" or choose a value in a filter.' },
      { title: 'Refine', detail: 'Open "More filters" for priority, category and date.' },
      { title: 'Start over', detail: 'If nothing matches, "Clear filters" removes every filter.' }
    ],
    consequences: ['Filtering does not change any ticket: it only changes what is displayed.'],
    faq: [
      {
        q: 'The filter does not find my ticket.',
        a: 'Check the chosen status: a "Cancelled" or "Resolved" ticket does not appear if you filter on another status. "Clear filters" resets everything.'
      },
      {
        q: 'What does the "Search" field look into?',
        a: 'The title, description, location details, property (title, address, reference) and contractor. Upper or lower case does not matter.'
      },
      {
        q: 'Can I find my search again later?',
        a: 'Yes: the filters stay in the page address. Bookmark it or send it to a colleague.'
      }
    ],
    related: [{ label: 'Tickets overview', helpId: 'commercial.maintenance.liste' }],
    keywords: ['filter', 'search', 'criteria', 'status', 'priority', 'category']
  },
  {
    id: 'commercial.maintenance.liste.tickets',
    kind: 'section',
    title: 'Ticket cards',
    summary:
      'A card summarizes a ticket: its title, status, category, priority, the property concerned and its creation date.',
    howToRead: {
      statuses: [
        {
          value: 'DECLARED',
          label: 'Reported',
          description: 'The incident has just been reported. This is the only status in which the ticket can be edited.'
        },
        {
          value: 'IN_PROGRESS',
          label: 'In progress',
          description: 'The ticket is being handled; it can no longer be edited from this screen.'
        },
        {
          value: 'ASSIGNED',
          label: 'Assigned',
          description: 'The work is entrusted to someone (for example a contractor).'
        },
        { value: 'RESOLVED', label: 'Resolved', description: 'The incident is dealt with. The ticket is closed.' },
        {
          value: 'CANCELED',
          label: 'Cancelled',
          description: 'The ticket is abandoned. It is closed and can be deleted.'
        }
      ],
      notes: [
        'The description text is cut off when it is long: open the detail page to read it in full.',
        'Beyond 20 tickets, page numbers appear below the list.'
      ]
    },
    steps: [
      { title: 'Open', detail: 'Click the card to display the ticket detail page.' },
      { title: 'Edit', detail: '"Edit" only appears on a "Reported" ticket.' },
      { title: 'Delete', detail: '"Delete" appears on a "Reported" or "Cancelled" ticket and asks for confirmation.' }
    ],
    consequences: [
      'Deletion is final: the ticket, its attachments, comments and history disappear.',
      'An "In progress", "Assigned" or "Resolved" ticket can be neither edited nor deleted.'
    ],
    faq: [
      {
        q: 'I deleted a ticket by mistake, can it be recovered?',
        a: 'No, deletion cannot be undone. You have to create the ticket again.'
      },
      {
        q: 'How do I abandon a ticket that is already in progress?',
        a: 'The "Cancel the ticket" button only exists on a "Reported" ticket. For a more advanced ticket, contact the agency manager.'
      }
    ],
    related: [
      { label: 'The detail page', helpId: 'commercial.maintenance.detail' },
      { label: 'Edit a ticket', helpId: 'commercial.maintenance.modifier' }
    ],
    keywords: ['card', 'status', 'delete', 'cancel', 'priority', 'category']
  },

  // ---------------------------------------------------------------- Creation
  {
    id: 'commercial.maintenance.nouveau',
    kind: 'page',
    title: 'Create a maintenance ticket',
    summary:
      'Fill in this form to report an incident on a property: choose the property, describe the problem and attach photos if you have any.',
    purpose:
      'The ticket lets the agency follow the incident from the report to its resolution. The more precise the description, the faster the handling.',
    steps: [
      {
        title: 'Choose the property',
        detail:
          'Type to search for a property (20 results at most) then select it. This choice is required and cannot be changed afterwards.'
      },
      { title: 'Give a title', detail: 'Between 3 and 200 characters, for example "Water leak in the bathroom".' },
      {
        title: 'Set the category and priority',
        detail: 'Category: Plumbing, Electrical, Air conditioning or Other. Priority: Low, Medium, High or Urgent.'
      },
      {
        title: 'Describe the problem',
        detail:
          'Description of 10 to 5,000 characters. "Location details (optional)" (500 characters at most) specifies the place.'
      },
      {
        title: 'Attach files',
        detail: 'Optional: up to 10 files of 5 MB at most (JPEG, PNG, WebP or PDF).'
      },
      {
        title: 'Confirm',
        detail:
          '"Create the ticket" saves the ticket then opens its detail page. "Cancel" goes back to the list without saving anything.'
      }
    ],
    consequences: [
      'The ticket starts with the status "Reported" and its first history line is created. If the property has a current lease, the ticket is linked to it.',
      'Depending on the email notifications enabled by the agency, a message goes to the agency administrators, an acknowledgement to the tenant (if they have an email address) and a notice to the owner.',
      'Attachments are sent one by one after the ticket is created. If one fails, the ticket is still created and a message lists the files that were not sent.'
    ],
    faq: [
      {
        q: 'I cannot find my property in the list.',
        a: "Type the property's reference or name: the list updates. Only your agency's properties are offered."
      },
      {
        q: 'An attachment failed, what should I do?',
        a: 'The ticket detail page does not allow adding an attachment afterwards. If a file is essential, describe it in a comment or create the ticket again.'
      },
      {
        q: 'Can I correct the ticket after creating it?',
        a: 'Yes, as long as it is "Reported": title, description, category, priority and location. The property cannot be changed.'
      }
    ],
    permissions: {
      note: 'Required right: "Create and view one\'s own maintenance tickets".'
    },
    related: [
      { label: 'Attach files', helpId: 'commercial.maintenance.nouveau.pieces-jointes' },
      { label: 'Back to the ticket list', helpId: 'commercial.maintenance.liste' }
    ],
    keywords: ['create', 'new ticket', 'report', 'incident', 'breakdown', 'leak', 'maintenance', 'declare'],
    tour: {
      steps: [
        {
          target: 'maintenance-bien',
          title: 'The property concerned',
          description: 'Search then choose the property. This field is required.'
        },
        {
          target: 'maintenance-titre',
          title: 'Title',
          description: 'Give a short title that sums up the incident.'
        },
        {
          target: 'maintenance-categorie',
          title: 'Category and priority',
          description: 'Choose the category, then the priority.'
        },
        {
          target: 'maintenance-description',
          title: 'Describe the problem',
          description: 'Explain the incident (at least 10 characters) and, if needed, specify the place.'
        },
        {
          target: 'maintenance-pieces-jointes',
          title: 'Photos and documents',
          description: 'Attach up to 10 files (JPEG, PNG, WebP or PDF, 5 MB each).'
        },
        {
          target: 'maintenance-creer',
          title: 'Create the ticket',
          description: 'This button saves the ticket and opens its detail page.'
        }
      ]
    }
  },
  {
    id: 'commercial.maintenance.nouveau.pieces-jointes',
    kind: 'section',
    title: 'Ticket attachments',
    summary:
      'Attach photos or documents that show the problem. They are sent at the same time as the ticket is created.',
    howToRead: {
      notes: [
        'Accepted types: JPEG, PNG, WebP and PDF.',
        'Maximum size: 5 MB per file. Maximum number: 10 files.',
        'A file that was already added (same name, same size, same date) is refused.',
        'The list shows the name and size of each file; "Delete" removes it before sending.'
      ]
    },
    steps: [
      { title: 'Choose the files', detail: 'Click "Select files"; you can choose several at once.' },
      { title: 'Check the list', detail: 'Remove a file added by mistake with "Delete".' },
      { title: 'Create the ticket', detail: 'The files are sent after "Create the ticket".' }
    ],
    consequences: [
      'Nothing is sent until you click "Create the ticket".',
      'If a file fails, the ticket is created and a message names the files that were not sent. The ticket detail page does not allow adding more afterwards.'
    ],
    faq: [
      {
        q: 'My file is refused.',
        a: 'Its type is not accepted (for example Word or video), it is over 5 MB, it was already added, or you have reached 10 files.'
      },
      {
        q: 'Can I attach a photo taken with my phone?',
        a: 'Yes, if it is in JPEG, PNG or WebP format and weighs less than 5 MB.'
      }
    ],
    related: [{ label: 'Create a ticket', helpId: 'commercial.maintenance.nouveau' }],
    keywords: ['photo', 'attachment', 'file', 'pdf', 'image', 'upload']
  },

  // ---------------------------------------------------------------- Ticket detail
  {
    id: 'commercial.maintenance.detail',
    kind: 'page',
    title: 'Maintenance ticket detail',
    summary:
      'This page brings together everything about an incident: description, status, history of changes, attachments and comments.',
    purpose:
      'This is where you follow the progress of a ticket and exchange about it. At the top are the title, creation date, status, category, priority and the property address.',
    steps: [
      {
        title: 'Read the ticket',
        detail: 'Check the status, category, priority, description and location details.'
      },
      {
        title: 'Follow the handling',
        detail: '"Status history" lists each change with its date and author.'
      },
      {
        title: 'View the attachments',
        detail: 'Click an image thumbnail to enlarge it, or click "Download".'
      },
      { title: 'Write a comment', detail: 'Type your message in "Add a comment…" then "Send".' },
      { title: 'Cancel if needed', detail: '"Cancel the ticket" appears as long as the ticket is "Reported".' }
    ],
    consequences: [
      'Cancelling the ticket sets its status to "Cancelled", after confirmation. A cancelled ticket cannot be reopened; it stays visible and can be deleted from the list.',
      'Cancelling and sending a comment do not send any email.'
    ],
    faq: [
      {
        q: 'Where is the button to edit the ticket?',
        a: 'It is in the list, on the card of a "Reported" ticket ("Edit" button).'
      },
      {
        q: 'My comment is refused.',
        a: 'A comment must be linked to a contact. If sending fails, ask the administrator to check that your email address exists as a contact of the agency.'
      },
      {
        q: 'Why does the status not change?',
        a: 'Handling is followed by an agency manager, who moves the status forward. Write a comment if the ticket seems forgotten.'
      }
    ],
    permissions: {
      note: 'Required right: "Create and view one\'s own maintenance tickets".'
    },
    related: [
      { label: 'Ticket status', helpId: 'commercial.maintenance.detail.statut' },
      { label: 'Status history', helpId: 'commercial.maintenance.detail.historique' },
      { label: 'Attachments', helpId: 'commercial.maintenance.detail.pieces-jointes' },
      { label: 'Comments', helpId: 'commercial.maintenance.detail.commentaires' }
    ],
    keywords: ['ticket', 'detail', 'follow-up', 'status', 'cancel', 'comment', 'history']
  },
  {
    id: 'commercial.maintenance.detail.statut',
    kind: 'section',
    title: 'Ticket status',
    summary:
      'The status shows where the handling of the incident stands. It moves forward in this order: Reported, In progress, Assigned, Resolved.',
    howToRead: {
      statuses: [
        {
          value: 'DECLARED',
          label: 'Reported',
          description: 'Incident reported, not yet taken over. You can still edit, cancel or delete it.'
        },
        { value: 'IN_PROGRESS', label: 'In progress', description: 'The ticket is being handled by the agency.' },
        { value: 'ASSIGNED', label: 'Assigned', description: 'The work is entrusted to someone.' },
        { value: 'RESOLVED', label: 'Resolved', description: 'The incident is dealt with. Final status.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'The ticket is abandoned. Final status.' }
      ],
      notes: [
        'A "Reported" ticket can move to "In progress" or "Cancelled"; "In progress" to "Assigned" or "Cancelled"; "Assigned" to "Resolved". Resolved and Cancelled are final.'
      ]
    },
    steps: [
      { title: 'Read the tag', detail: 'The coloured tag at the top right of the page gives the current status.' },
      { title: 'Cancel a reported ticket', detail: '"Cancel the ticket" then "Yes" in the confirmation.' }
    ],
    consequences: [
      'Cancellation cannot be undone: the ticket stays "Cancelled" for good.',
      'The change is recorded in the status history with a note saying the ticket was cancelled by the tenant.',
      'When a manager moves the status forward, the tenant and the owner may be notified by email, depending on the notifications enabled by the agency.'
    ],
    faq: [
      {
        q: 'Who changes the status?',
        a: 'The statuses "In progress", "Assigned" and "Resolved" are set by an agency manager, from the agency tickets. From this page, you can only cancel a "Reported" ticket.'
      },
      {
        q: 'The "Cancel the ticket" button has disappeared.',
        a: 'It is only offered while the ticket is "Reported".'
      }
    ],
    related: [{ label: 'Status history', helpId: 'commercial.maintenance.detail.historique' }],
    keywords: ['status', 'step', 'cancel', 'resolved', 'reported']
  },
  {
    id: 'commercial.maintenance.detail.historique',
    kind: 'section',
    title: 'Status history',
    summary:
      'The timeline lists each status change of the ticket, from oldest to most recent, with the date and the author.',
    howToRead: {
      notes: [
        'Each line shows the move from one status to another (for example Reported → In progress). The very first line only shows the starting status.',
        'A note may go with the line, for example for the creation of the ticket.',
        'Below the line are the date and time, followed by the name of the person. With no name, the mention "(System)" is displayed.',
        'The last line, in blue, is the current status.'
      ]
    },
    consequences: [
      'The history is read-only: it can be neither edited nor corrected. It disappears if the ticket is deleted.'
    ],
    faq: [
      {
        q: 'Why is "No history available" displayed?',
        a: 'The ticket has no history line. A ticket created from the application always has one.'
      },
      {
        q: 'What does "(System)" mean?',
        a: 'The change was not made by a known person, but automatically.'
      }
    ],
    related: [{ label: 'Ticket status', helpId: 'commercial.maintenance.detail.statut' }],
    keywords: ['history', 'timeline', 'log', 'change']
  },
  {
    id: 'commercial.maintenance.detail.pieces-jointes',
    kind: 'section',
    title: 'Detail page attachments',
    summary: 'This section lists the photos and documents sent with the ticket. You can view and download them.',
    howToRead: {
      notes: [
        'Each line shows the file name and its size. An image has a thumbnail, which you enlarge by clicking it.',
        '"Download" saves the file on your device.',
        '"No attachments" is displayed if nothing was sent.'
      ]
    },
    consequences: [
      'This screen allows neither adding nor deleting an attachment. Files only disappear with the ticket, if it is deleted.',
      'The files are private: they can only be read by authorised signed-in people.'
    ],
    faq: [
      {
        q: 'I want to add a photo afterwards.',
        a: 'It is not possible from the detail page. Add a comment to describe the item, or create the ticket again with the photo.'
      },
      {
        q: 'The thumbnail does not appear.',
        a: 'A file icon replaces it if the image could not be loaded. "Download" is still possible.'
      }
    ],
    related: [{ label: 'Attach files at creation', helpId: 'commercial.maintenance.nouveau.pieces-jointes' }],
    keywords: ['photo', 'file', 'download', 'attachment', 'document']
  },
  {
    id: 'commercial.maintenance.detail.commentaires',
    kind: 'section',
    title: 'Ticket comments',
    summary: 'The comment thread keeps the exchanges about the ticket. You can write a new message in it.',
    howToRead: {
      notes: [
        'Each comment shows the author, their type (Tenant, Manager or System), the message, the date and the time.',
        'The type "Tenant" is also displayed for a comment written from this screen.',
        '"No comment" is displayed as long as nobody has written.'
      ]
    },
    steps: [
      { title: 'Write', detail: 'Type your message in "Add a comment…".' },
      { title: 'Send', detail: 'Click "Send" (the button stays greyed out while the field is empty).' }
    ],
    consequences: [
      'The comment is saved right away and cannot be edited or deleted from this screen.',
      'No email is sent to the other people: look at the page again to see their replies.'
    ],
    faq: [
      {
        q: 'The comment is not sent.',
        a: 'It must be linked to a contact of the agency. Ask the administrator to check that your email address exists as a contact.'
      },
      {
        q: 'Can I correct a comment?',
        a: 'No. Write a new comment to clarify or correct.'
      }
    ],
    related: [{ label: 'Detail page overview', helpId: 'commercial.maintenance.detail' }],
    keywords: ['comment', 'message', 'exchange', 'discussion']
  },

  // ---------------------------------------------------------------- Editing
  {
    id: 'commercial.maintenance.modifier',
    kind: 'page',
    title: 'Edit a maintenance ticket',
    summary:
      'Correct the title, category, priority, description or location of a ticket. This screen is only available for a "Reported" ticket.',
    purpose:
      'Use it to clarify or correct a report before it is taken over. The property concerned and the lease cannot be changed.',
    steps: [
      { title: 'Open the edit form', detail: 'In the list, click "Edit" on the card of a "Reported" ticket.' },
      {
        title: 'Change the fields',
        detail: 'The form shows the title, category, priority, description and location details.'
      },
      {
        title: 'Save',
        detail: '"Save changes" confirms. "Cancel" goes back to the ticket detail page.'
      }
    ],
    consequences: [
      'Only the fields you changed are sent. If nothing changed, the message "Nothing to change" is displayed.',
      'If the ticket is no longer "Reported", the form is refused and you go back to the ticket detail page.',
      'Attachments are not managed here, and editing does not send any email.'
    ],
    faq: [
      {
        q: 'Why am I sent back to the ticket detail page?',
        a: 'The ticket has changed status: only "Reported" tickets can be edited.'
      },
      {
        q: 'Can I change the property concerned?',
        a: 'No. If the property is wrong, cancel or delete the ticket then create a new one.'
      }
    ],
    permissions: {
      note: 'Required right: "Create and view one\'s own maintenance tickets".'
    },
    related: [{ label: 'Ticket detail page', helpId: 'commercial.maintenance.detail' }],
    keywords: ['edit', 'correct', 'modify', 'ticket', 'priority', 'category']
  }
];

export default entries;
