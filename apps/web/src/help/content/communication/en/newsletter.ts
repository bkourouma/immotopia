import type { HelpEntry } from '../../../types';

/** « newsletter » zone of the « communication » module (en). */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------------------
  // Mailing lists
  // ---------------------------------------------------------------------------
  {
    id: 'communication.newsletter.listes',
    kind: 'page',
    title: 'Mailing lists',
    summary:
      'Create and manage the lists of people your agency sends its newsletter to. Click a list to see its subscribers, add some or export them.',
    purpose:
      'A mailing list is the group of recipients of a campaign. There are two kinds: "Manual" lists, which you fill in yourself, and derived lists ("Owners", "Tenants", "CRM contacts"), built automatically from the people in your agency who have given their consent.',
    steps: [
      { title: 'Create a list', detail: 'Click "New list", enter a name and choose the type.' },
      { title: 'Search', detail: 'Type a name in "Search" or filter by "Type".' },
      { title: 'Open a list', detail: 'Click its card to see its subscribers.' },
      { title: 'Edit a list', detail: 'Use the "Edit" button on the card to change the name.' },
      { title: 'Delete a list', detail: 'Use the "Delete" button on the card, then confirm.' },
      { title: 'Write to subscribers', detail: 'Then create a campaign on the "Newsletter campaigns" page.' }
    ],
    consequences: [
      'Creating, editing or filling a list sends no message: only campaign sends write to subscribers.',
      'The type of a list cannot be changed after it is created, and its name must remain unique within your agency.',
      'Deleting a list cannot be undone: its subscribers are erased, along with the campaigns sent to that list and their statistics.'
    ],
    faq: [
      {
        q: 'What is the difference between a manual list and a derived list?',
        a: 'In a manual list, you add the addresses yourself (import, CRM search, public form). A derived list keeps no subscribers: its recipients are recalculated at each send from your owners, tenants or contacts who have given their consent.'
      },
      {
        q: 'Why can I not add subscribers to an "Owners" list?',
        a: 'Derived lists are not filled in by hand: a person belongs to one as soon as they have agreed to receive the newsletter (email consent for a CRM contact).'
      },
      {
        q: 'I cannot see this page or some buttons. Why?',
        a: 'You need the "Access to the Communication module" right (or to be an agency administrator). Ask your agency administrator for it.'
      }
    ],
    permissions: {
      note: 'Viewing, creating, editing or deleting a list requires the "Access to the Communication module" right (or being an agency administrator). No particular plan is required.'
    },
    related: [
      { label: 'List cards', helpId: 'communication.newsletter.listes.cartes' },
      { label: 'Newsletter campaigns', helpId: 'communication.newsletter.campagnes' },
      { label: 'Newsletter templates', helpId: 'communication.newsletter.modeles' }
    ],
    keywords: [
      'newsletter',
      'list',
      'mailing lists',
      'subscribers',
      'mailing',
      'email',
      'recipients',
      'distribution',
      'double opt-in'
    ]
  },
  {
    id: 'communication.newsletter.listes.cartes',
    kind: 'section',
    title: 'List cards',
    summary: 'Each card is a mailing list, with its type and its figures. Click the card to open the list.',
    howToRead: {
      notes: [
        'Each card shows the name of the list, its type (Manual, Owners, Tenants or CRM contacts) and, if it is turned on, the "Double opt-in" tag.',
        'Total: all the addresses of the list, including those still waiting to confirm or that have unsubscribed.',
        'Active: the addresses that will receive the next campaign.',
        'Unsubscribed: the people who asked to stop receiving messages.',
        'For a derived list, Total and Active show the same number (the people who gave their consent) and Unsubscribed stays at 0.'
      ]
    },
    steps: [
      { title: 'Open the list', detail: 'Click anywhere on the card.' },
      { title: 'Rename the list', detail: 'Use the "Edit" button at the bottom of the card.' },
      {
        title: 'Delete the list',
        detail: 'Use the "Delete" button at the bottom of the card: you are asked to confirm.'
      }
    ],
    consequences: [
      'Deleting also erases all the subscribers of the list, the campaigns sent to that list and their statistics. It cannot be undone.'
    ],
    faq: [
      {
        q: 'Why is "Active" smaller than "Total"?',
        a: 'Total also counts people waiting for confirmation and those who have unsubscribed. Only active subscribers receive campaigns.'
      },
      {
        q: 'How do I find a list when there are many?',
        a: 'Use "Search" (list name) and the "Type" filter. The "Clear filters" button brings all the lists back.'
      },
      {
        q: 'What does the "Edit" button do on a derived list?',
        a: 'You can change its name. The "Double opt-in" switch is only offered for manual lists.'
      }
    ],
    related: [
      { label: 'Create or edit a list', helpId: 'communication.newsletter.listes.creation' },
      { label: 'List details', helpId: 'communication.newsletter.listes.abonnes' }
    ],
    keywords: ['card', 'figures', 'active', 'unsubscribed', 'delete a list']
  },
  {
    id: 'communication.newsletter.listes.creation',
    kind: 'section',
    title: 'Create or edit a list',
    summary:
      'The form asks for a name, a type and the "Double opt-in" setting. The type is chosen at creation and does not change afterwards.',
    purpose:
      'The type decides who will receive your campaigns: addresses that you manage (Manual) or the people in your agency who have given their consent.',
    steps: [
      { title: 'Open the form', detail: 'Use the "New list" button (or "Edit" on a card).' },
      { title: 'Enter the name', detail: 'It must be unique within your agency.' },
      {
        title: 'Choose the type',
        detail:
          '"Manual (import, manual entry)", "Owners (with newsletter consent)", "Tenants (with newsletter consent)" or "CRM contacts (email consent)".'
      },
      { title: 'Set "Double opt-in"', detail: 'Yes / No switch, on by default.' },
      { title: 'Confirm', detail: 'Use the "Create" button (or "Save" when editing).' }
    ],
    consequences: [
      'A "Manual" list automatically gets a public subscription link, shown in the open list ("Public subscription form"). The other types have none.',
      'If the name already exists in your agency, a message tells you so and nothing is created.',
      'When editing, you can change the name; the "Double opt-in" switch only appears for a manual list.'
    ],
    faq: [
      {
        q: 'Which type should I choose?',
        a: '"Manual" for addresses that you collect or import. "Owners", "Tenants" and "CRM contacts" write to the people in your agency who have given their consent, with nothing to enter.'
      },
      {
        q: 'What does the "Double opt-in" switch do?',
        a: 'It is saved with the list and shown on its card. People who subscribe through the public form must always confirm by email; those you add yourself (import, CRM search) are active right away.'
      },
      {
        q: 'Can I change the type later?',
        a: 'No. Create a new list of the type you want.'
      }
    ],
    related: [{ label: 'Mailing lists', helpId: 'communication.newsletter.listes' }],
    keywords: ['new list', 'create a list', 'list type', 'consent', 'agreement']
  },
  {
    id: 'communication.newsletter.listes.abonnes',
    kind: 'section',
    title: 'List details',
    summary:
      'An open list shows its subscribers and the actions to fill it. A derived list only shows the number of recipients and an export.',
    purpose:
      'From a manual list, you follow who is subscribed, add CRM contacts, import a file and share the public subscription form. A derived list has no stored subscribers: its recipients are calculated at the time of each send.',
    steps: [
      { title: 'Add from the CRM', detail: 'Use the "Add contacts (CRM search)" button.' },
      { title: 'Import a file', detail: 'Use the "Import CSV" button above the table.' },
      {
        title: 'Export the list',
        detail: 'Use the "Export CSV" button: the file contains all the subscribers of the list.'
      },
      { title: 'Go back to the lists', detail: 'Use the "Back to lists" button.' }
    ],
    consequences: [
      'For a derived list, the "Export CSV (current recipients)" button gives the addresses that would receive a campaign sent now; their status is "DESTINATAIRE" in the file.',
      "The subscribers of a derived list cannot be removed here: remove the person's consent in their record.",
      'For a derived list, the unsubscribe link of an email does not change the list.'
    ],
    faq: [
      {
        q: 'Why do I see no table for my "Tenants" list?',
        a: 'A derived list has no stored subscribers. You see the number of potential recipients, and the export gives their list.'
      },
      {
        q: 'Where is the public subscription form?',
        a: 'In a manual list, above the table, in the collapsed "Public subscription form" section.'
      },
      {
        q: 'What does the exported file contain?',
        a: 'The columns email, name, status and the sign-up, confirmation and unsubscribe dates for a manual list; only the current addresses for a derived list.'
      }
    ],
    related: [
      { label: 'Subscribers table', helpId: 'communication.newsletter.listes.abonnes.tableau' },
      { label: 'Import subscribers', helpId: 'communication.newsletter.listes.import' },
      { label: 'Public subscription form', helpId: 'communication.newsletter.listes.inscription' }
    ],
    keywords: ['subscribers', 'export', 'derived list', 'recipients']
  },
  {
    id: 'communication.newsletter.listes.abonnes.tableau',
    kind: 'table',
    title: 'Subscribers table',
    summary: 'Each row is an email address of the list, with its status. Only "Active" addresses receive campaigns.',
    howToRead: {
      columns: [
        { key: 'email', label: 'Email', description: "The subscriber's email address. A button lets you copy it." },
        {
          key: 'name',
          label: 'Name',
          description: 'The name entered at sign-up or in the file. A dash (—) means no name.'
        },
        { key: 'status', label: 'Status', description: "The subscriber's state (see the statuses below)." },
        { key: 'subscribedAt', label: 'Subscribed on', description: 'The sign-up date, in day/month/year format.' },
        { key: 'actions', label: 'Actions', description: 'The "Remove" button deletes the row from the list.' }
      ],
      statuses: [
        {
          value: 'PENDING_CONFIRMATION',
          label: 'Pending',
          description:
            'The person signed up through the public form but has not yet clicked the confirmation link. They receive no campaign.'
        },
        {
          value: 'ACTIVE',
          label: 'Active',
          description: 'Confirmed subscriber, or added by you (import, CRM search). They receive campaigns.'
        },
        {
          value: 'UNSUBSCRIBED',
          label: 'Unsubscribed',
          description: 'The person asked to stop receiving messages. They stay in the list but receive nothing more.'
        }
      ],
      notes: [
        'Search covers the email and the name; the "Status" filter narrows the list. The total is shown below the table.',
        'The table also has its own export (Excel, CSV, PDF): it covers all the subscribers matching your filters, not only the displayed page.',
        'When the list is empty, the table shows "No subscribers yet."'
      ]
    },
    steps: [
      { title: 'Find an address', detail: 'Type part of an email or name in "Search".' },
      { title: 'See sign-ups to confirm', detail: '"Status" filter, then "Pending".' },
      { title: 'Remove a subscriber', detail: 'Use the "Remove" button on their row.' }
    ],
    consequences: [
      '"Remove" erases the subscriber from the list right away, without asking for confirmation.',
      'An "Unsubscribed" subscriber is not deleted: if you re-import or add their address again, it is ignored because it is already there. They can re-subscribe themselves through the public form and will have to confirm.'
    ],
    faq: [
      {
        q: 'Why does a subscriber stay "Pending"?',
        a: 'They have not yet clicked the link in the confirmation email. Until they do, they receive nothing.'
      },
      {
        q: 'Can I reactivate an "Unsubscribed" subscriber?',
        a: 'Not from this screen. The person can re-subscribe through the public form; they then go back to "Pending" until they confirm.'
      },
      {
        q: 'How do I undo a "Remove" done by mistake?',
        a: 'It is not possible: add the address again (import or CRM search).'
      }
    ],
    related: [{ label: 'Import subscribers', helpId: 'communication.newsletter.listes.import' }],
    keywords: ['subscriber', 'remove', 'unsubscribed', 'confirmation', 'status']
  },
  {
    id: 'communication.newsletter.listes.import',
    kind: 'section',
    title: 'Import subscribers (CSV)',
    summary:
      'Add several addresses at once to a manual list from a CSV file. The result tells you how many addresses were accepted, rejected or ignored.',
    purpose: 'The file can come from a spreadsheet saved in CSV format. The first line contains the column titles.',
    steps: [
      {
        title: 'Prepare the file',
        detail: 'An "email" column (required) and a "name" column (optional), separated by commas.'
      },
      { title: 'Open the window', detail: 'Use the "Import CSV" button above the subscribers table.' },
      { title: 'Choose the file', detail: 'Click in the area or drag the CSV file into it.' },
      { title: 'Start', detail: 'Use the "Import" button, then read the result shown.' }
    ],
    howToRead: {
      notes: [
        'Accepted: addresses added to the list.',
        'Rejected: lines with no address or an invalid address; the first errors are listed.',
        'Duplicate(s): addresses already in the list, ignored (including those already unsubscribed).'
      ]
    },
    consequences: [
      'Imported addresses are "Active" right away: no confirmation email is sent to them and they will receive your next campaign.',
      'The import does not check the consent of the people: only import contacts who agree to receive your messages.',
      'The file size is limited to 2 MB. Only manual lists can be imported.'
    ],
    faq: [
      {
        q: 'My file is refused or all the lines are rejected. What should I do?',
        a: 'Check that it is a CSV file with commas, that the first line contains "email" and that the file is under 2 MB.'
      },
      {
        q: 'What if I have no "name" column?',
        a: 'The addresses are imported without a name. In your messages, "{{prenom}}" is then replaced by "Dear subscriber".'
      },
      {
        q: 'Are duplicate addresses created twice?',
        a: 'No: an address already in the list is counted as a duplicate and ignored.'
      }
    ],
    related: [{ label: 'Subscribers table', helpId: 'communication.newsletter.listes.abonnes.tableau' }],
    keywords: ['import', 'csv', 'file', 'excel', 'addresses']
  },
  {
    id: 'communication.newsletter.listes.inscription',
    kind: 'section',
    title: 'Public subscription form',
    summary:
      'Each manual list has a public link where anyone can subscribe. The subscription is only valid after confirmation by email.',
    purpose:
      'Share this link on your website, your social networks or by message so that your visitors join the list themselves.',
    steps: [
      { title: 'Open the section', detail: 'In a manual list, click "Public subscription form".' },
      { title: 'Copy the link', detail: 'The public link is shown at the top of the section.' },
      { title: 'Share', detail: 'The person enters their email (and name), then confirms.' },
      { title: 'Confirmation', detail: 'They receive an email and click the link to validate: they become "Active".' }
    ],
    consequences: [
      'The form shown in the section is the real form: using it actually subscribes the address entered and sends it the confirmation email.',
      'The confirmation link is valid for 7 days. Until it is used, the person stays "Pending" and receives no campaign.',
      'A person who is already subscribed or already pending gets a message saying so. An unsubscribed person who subscribes again goes back to "Pending" and receives a new confirmation email.'
    ],
    faq: [
      {
        q: 'Why is this section missing from my list?',
        a: 'It only exists for "Manual" lists. Derived lists have no public form.'
      },
      {
        q: 'What does the person who subscribes see?',
        a: 'A message asks them to check their mailbox and click the confirmation link.'
      },
      {
        q: 'Where do people who subscribed through this form appear?',
        a: 'In the list\'s subscribers table, with the status "Pending", then "Active" after confirmation.'
      }
    ],
    related: [{ label: 'Subscribers table', helpId: 'communication.newsletter.listes.abonnes.tableau' }],
    keywords: ['subscription', 'form', 'public link', 'confirmation', 'double opt-in']
  },
  {
    id: 'communication.newsletter.listes.ajout-crm',
    kind: 'section',
    title: 'Add contacts from the CRM',
    summary:
      'Find contacts from your CRM with the advanced search, tick the ones you want, then confirm: their addresses are added to the manual list.',
    steps: [
      { title: 'Open the search', detail: 'Use the "Add contacts (CRM search)" button.' },
      { title: 'Search', detail: 'Use the quick search or the advanced filters.' },
      { title: 'Tick the contacts', detail: 'The number of selected contacts is shown at the bottom.' },
      { title: 'Confirm', detail: 'Use the "Confirm the selection" button.' }
    ],
    consequences: [
      'The contacts are added as "Active" right away, with their email and name, without a confirmation email.',
      "The addition does not check the contact's consent: make sure they agree to receive your messages.",
      'A message tells you how many contacts were added and how many were ignored (invalid or already present address).'
    ],
    faq: [
      {
        q: 'What happens if the contact is already in the list?',
        a: 'They are ignored and counted among the contacts "ignored or already present".'
      },
      {
        q: "If I change a contact's email in the CRM, does the list change?",
        a: 'No: the address is copied at the time of the addition. To follow the CRM automatically, use a "CRM contacts" list.'
      },
      {
        q: 'Do the added contacts receive a message right away?',
        a: 'No. Adding them sends nothing: they will only receive your next campaigns.'
      }
    ],
    related: [{ label: 'List details', helpId: 'communication.newsletter.listes.abonnes' }],
    keywords: ['crm', 'contacts', 'advanced search', 'add subscribers']
  },

  // ---------------------------------------------------------------------------
  // Campaigns
  // ---------------------------------------------------------------------------
  {
    id: 'communication.newsletter.campagnes',
    kind: 'page',
    title: 'Newsletter campaigns',
    summary:
      'Prepare a message, send it right away or on a chosen date to a mailing list, then follow the results. All campaigns are found in a single table.',
    purpose:
      'A campaign is a message (subject and content) sent to a list. It starts as a "Draft": you can correct it, preview it, schedule it or send it.',
    steps: [
      {
        title: 'Create the campaign',
        detail: '"New campaign" button: list, optional template, subject and content.'
      },
      { title: 'Check', detail: 'Use the "Preview" button on the draft row.' },
      {
        title: 'Schedule or send',
        detail: '"Schedule" picks a date; "Send" goes out right away, after confirmation.'
      },
      { title: 'Follow the results', detail: '"Statistics" column: sent, opened, bounced.' }
    ],
    consequences: [
      'A send cannot be undone: recipients receive the message as soon as you confirm. Only a "Scheduled" campaign can still be cancelled.',
      'Each recipient receives a personalised email with their own unsubscribe link; the message must contain "{{lien_desinscription}}".',
      'If your agency has set up WhatsApp, a text version is also sent to recipients who have given their WhatsApp consent.'
    ],
    faq: [
      {
        q: 'Can I edit a campaign that is already sent or scheduled?',
        a: 'No, only "Draft" campaigns can be edited. A "Scheduled" campaign can be cancelled, but it does not go back to draft: create a new one.'
      },
      {
        q: 'How do I delete a campaign?',
        a: 'This screen does not offer campaign deletion. A campaign disappears only if the list it is linked to is deleted.'
      },
      {
        q: 'Who receives the campaign?',
        a: 'The "Active" subscribers of a manual list, or the people who gave their consent for a derived list. "Pending" and "Unsubscribed" subscribers receive nothing.'
      }
    ],
    permissions: {
      note: 'Creating, editing, scheduling, cancelling and sending require the "Access to the Communication module" right (or being an agency administrator). No particular plan is required.'
    },
    related: [
      { label: 'Campaigns table', helpId: 'communication.newsletter.campagnes.tableau' },
      { label: 'Create or edit a campaign', helpId: 'communication.newsletter.campagnes.formulaire' },
      { label: 'Mailing lists', helpId: 'communication.newsletter.listes' }
    ],
    keywords: ['campaign', 'newsletter', 'send', 'email', 'mailing', 'bulk send', 'schedule']
  },
  {
    id: 'communication.newsletter.campagnes.tableau',
    kind: 'table',
    title: 'Campaigns table',
    summary:
      'Each row is a campaign, from newest to oldest. The status, the send figures and the possible actions depend on its progress.',
    howToRead: {
      columns: [
        { key: 'subject', label: 'Subject', description: 'The subject of the message, followed by its status.' },
        { key: 'listName', label: 'List', description: 'The recipient mailing list.' },
        {
          key: 'stats',
          label: 'Statistics',
          description:
            'For a "Sent" or "In progress" campaign: "Sent:" (messages gone out), "Opened:" (messages opened) and "Bounced:" (addresses where sending failed, shown only if there are any). A dash (—) otherwise.'
        },
        {
          key: 'sentAt',
          label: 'Date',
          description:
            'The send date and time; "Scheduled:" and the planned date for a scheduled campaign; otherwise the creation date.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: 'Draft: "Edit", "Preview", "Schedule", "Send". Scheduled: "Cancel". Other statuses: no action.'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'Message being prepared. It can be edited, previewed, scheduled or sent.'
        },
        {
          value: 'SCHEDULED',
          label: 'Scheduled',
          description: 'Send programmed for a date and time. It goes out by itself; you can cancel it until then.'
        },
        { value: 'SENDING', label: 'In progress', description: 'The send is going out to the recipients.' },
        { value: 'SENT', label: 'Sent', description: 'At least one recipient received the message.' },
        {
          value: 'CANCELLED',
          label: 'Cancelled',
          description: 'The scheduled send was cancelled. The campaign can no longer be sent.'
        },
        {
          value: 'FAILED',
          label: 'Failed',
          description: 'No recipient could be reached, or the scheduled send failed.'
        }
      ],
      notes: [
        'Search by subject or list name, filter by "Status", by "Mailing list" or by creation period ("Created from / to").',
        'The table export covers all the campaigns matching your criteria.',
        'When there is no campaign, the table shows "No campaigns yet."'
      ]
    },
    steps: [
      { title: 'Find a campaign', detail: 'Use the search and the filters above the table.' },
      {
        title: 'Send a draft',
        detail: 'Use the "Send" button: a window asks you to confirm sending to all active subscribers.'
      },
      { title: 'Cancel a scheduled send', detail: 'Use the "Cancel" button, then confirm "Cancel campaign".' }
    ],
    consequences: [
      'Sending cannot be undone. The campaign goes "In progress", then "Sent" (or "Failed" if nobody received the message).',
      'Cancelling a scheduled campaign is final: it becomes "Cancelled" and can no longer be rescheduled or sent.'
    ],
    faq: [
      {
        q: 'What does "Opened" mean?',
        a: 'The number of recipients whose mailbox displayed the message. If the person does not load images, the opening may not be counted.'
      },
      {
        q: 'What does "Bounced" mean?',
        a: 'The addresses to which the message could not be sent, for example because the address is invalid or refused.'
      },
      {
        q: 'Why does my "Sent" campaign have no button?',
        a: 'Once sent, a campaign can no longer be edited or sent again. Create a new campaign for a new send.'
      }
    ],
    related: [
      { label: 'Schedule a send', helpId: 'communication.newsletter.campagnes.planification' },
      { label: 'Preview before sending', helpId: 'communication.newsletter.campagnes.apercu' }
    ],
    keywords: ['statistics', 'opened', 'bounced', 'status', 'draft', 'scheduled', 'cancel']
  },
  {
    id: 'communication.newsletter.campagnes.formulaire',
    kind: 'section',
    title: 'Create or edit a campaign',
    summary:
      'Choose the list, write the subject and content of the message, then save: the campaign is created as a draft and nothing is sent.',
    steps: [
      {
        title: 'Mailing list',
        detail: 'Choose the list; the number of active recipients is shown next to its name.'
      },
      { title: 'Template (optional)', detail: 'You can dress the message with an existing template.' },
      { title: 'Subject', detail: 'The subject of the email. It accepts "{{prenom}}" and the other variables.' },
      { title: 'Message body (HTML)', detail: 'The content. It must contain "{{lien_desinscription}}".' },
      {
        title: 'Save',
        detail: '"Create campaign"; when editing, "Save". The "Preview" button shows the rendering.'
      }
    ],
    howToRead: {
      notes: [
        'Message variables: {{prenom}}, {{nom}}, {{email}} and {{lien_desinscription}} (required). If the first name is unknown, {{prenom}} becomes "Dear subscriber".',
        'A warning "The unsubscribe link is required" is shown while {{lien_desinscription}} is missing; the save button then stays greyed out.'
      ]
    },
    consequences: [
      'The campaign is saved as a "Draft": no message is sent until you click "Send" or "Schedule".',
      'When saving, the message is cleaned: only common formatting tags (paragraphs, headings, lists, links, tables) are kept; images and scripts are removed.',
      'With a template, the content of the message replaces the {{contenu}} variable of the template at the time of preview and sending.',
      'The list cannot be changed after creation. Only the subject, the content and the template can be edited, while the campaign is a "Draft".'
    ],
    faq: [
      {
        q: 'Why is the "Create campaign" button greyed out?',
        a: 'The message does not contain {{lien_desinscription}}. Add it, for example in an "Unsubscribe" link.'
      },
      {
        q: 'Is my message also sent on WhatsApp?',
        a: 'If your agency has set up WhatsApp, a text version goes to recipients who have given their WhatsApp consent and whose number is known in the CRM.'
      },
      {
        q: 'Can I personalise the subject?',
        a: 'Yes, variables such as {{prenom}} are also replaced in the subject.'
      }
    ],
    related: [
      { label: 'Newsletter templates', helpId: 'communication.newsletter.modeles' },
      { label: 'Preview before sending', helpId: 'communication.newsletter.campagnes.apercu' }
    ],
    keywords: ['new campaign', 'write', 'subject', 'content', 'html', 'variables', 'unsubscribe']
  },
  {
    id: 'communication.newsletter.campagnes.apercu',
    kind: 'section',
    title: 'Preview before sending',
    summary:
      'The preview shows the subject and the message as a recipient would receive them, with sample values. Nothing is sent.',
    steps: [
      { title: 'Open', detail: 'Use the "Preview" button on a draft campaign, or in the edit form.' },
      { title: 'Read through', detail: 'Check the subject, the text, the template and the links.' },
      { title: 'Close', detail: 'Close the window, then correct or send.' }
    ],
    consequences: [
      'The preview uses sample values ("Prénom", "Nom", "exemple@test.com"); the unsubscribe link shown unsubscribes nobody.',
      'The preview does not count in the statistics. This screen offers no test send: the preview is the only check before sending.'
    ],
    faq: [
      {
        q: 'Why is the preview only available for a draft?',
        a: 'Scheduled or sent campaigns can no longer be edited, so the "Preview" button only appears on drafts.'
      },
      {
        q: "Will the rendering be identical in the recipient's mailbox?",
        a: 'Roughly: each mailbox displays emails in its own way, especially complex layouts.'
      },
      {
        q: 'Does the preview send an email?',
        a: 'No, it is only displayed on screen.'
      }
    ],
    related: [{ label: 'Create or edit a campaign', helpId: 'communication.newsletter.campagnes.formulaire' }],
    keywords: ['preview', 'test', 'proofread']
  },
  {
    id: 'communication.newsletter.campagnes.planification',
    kind: 'section',
    title: 'Schedule the send',
    summary: 'Choose the date and time at which the campaign should go out. It is then sent automatically.',
    steps: [
      { title: 'Open', detail: 'Use the "Schedule" button on a draft campaign.' },
      {
        title: 'Choose the date and time',
        detail: 'They must be in the future: otherwise the button stays greyed out.'
      },
      { title: 'Confirm', detail: 'Use the "Schedule" button. The campaign becomes "Scheduled".' }
    ],
    consequences: [
      'The application checks the scheduled campaigns every minute and sends those whose time has come.',
      'A "Scheduled" campaign can no longer be edited: only cancellation remains possible, and it is final.',
      'If the automatic send fails, the campaign becomes "Failed".',
      'A template used by a scheduled campaign cannot be deleted.'
    ],
    faq: [
      {
        q: 'How do I change the date or the content after scheduling?',
        a: 'Cancel the campaign and create a new one: a cancelled campaign does not go back to draft.'
      },
      {
        q: 'Can I send a scheduled campaign right away?',
        a: 'No, from this screen a scheduled campaign only has the "Cancel" button.'
      },
      {
        q: 'What happens at the planned time?',
        a: 'The campaign goes "In progress", then "Sent" (or "Failed" if nobody received the message).'
      }
    ],
    related: [{ label: 'Campaigns table', helpId: 'communication.newsletter.campagnes.tableau' }],
    keywords: ['schedule', 'programme', 'date', 'time', 'delayed send']
  },
  {
    id: 'communication.newsletter.campagnes.depuis-bien',
    kind: 'section',
    title: 'Campaign from a property',
    summary:
      'From a property, create in a few clicks a campaign already written from its record (type, price, address, description). It is saved as a draft and nothing is sent.',
    steps: [
      {
        title: 'Open the window',
        detail:
          'In the property list, row menu then "Send as a newsletter"; in a property record, "Create a newsletter campaign".'
      },
      { title: 'Choose the list', detail: '"Mailing list" field, required.' },
      { title: 'Read the message', detail: 'The subject and content are pre-filled: correct them if needed.' },
      { title: 'Confirm', detail: 'Use the "Create campaign" button.' }
    ],
    consequences: [
      'The campaign is created as a "Draft". To send or schedule it, go to "Newsletter campaigns".',
      'The message includes the title of the property, its type, its transaction modes, its features, its price (or "Price on request"), its address, its zone and its description.',
      'Property images inserted in the message are removed when saving: the message will go out without photos.',
      'The message must contain "{{lien_desinscription}}": it is already there, and the button stays greyed out if it disappears.'
    ],
    faq: [
      {
        q: 'I do not see this action on the property record.',
        a: 'It depends on your subscription plan (CRM) and on your rights. Ask your agency administrator for them.'
      },
      {
        q: 'Is the property promoted right away?',
        a: 'No. You only create a draft, which you then send from "Newsletter campaigns".'
      },
      {
        q: 'Can I change the message before creating the campaign?',
        a: 'Yes, the subject and content can be edited; you can also choose a template.'
      }
    ],
    related: [{ label: 'Newsletter campaigns', helpId: 'communication.newsletter.campagnes' }],
    keywords: ['property', 'listing', 'advert', 'promote', 'property newsletter']
  },

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------
  {
    id: 'communication.newsletter.modeles',
    kind: 'page',
    title: 'Newsletter templates',
    summary: 'A template is a reusable layout for your messages. You create it once, then choose it in your campaigns.',
    purpose:
      'The template holds the wrapping of the email (greeting, footer...) and the "{{contenu}}" variable, where the text of each campaign will be inserted.',
    steps: [
      { title: 'Create a template', detail: 'Use the "New template" button: name and HTML.' },
      { title: 'Search', detail: 'Type a name or a word of the content in the search.' },
      { title: 'Edit or delete', detail: 'Use the "Edit" and "Delete" buttons of the row.' },
      { title: 'Use it', detail: 'In a campaign, "Template (optional)" field.' }
    ],
    consequences: [
      'Editing a template also changes the preview and the sending of the unsent campaigns that use it: it is applied at the time of preview and sending.',
      'Deleting a template cannot be undone. It is refused if a scheduled campaign uses it. Otherwise, the campaigns that used it remain but lose this layout.',
      'The required unsubscribe link must be in the body of each campaign, even if your template contains one.'
    ],
    faq: [
      {
        q: 'Is a template required?',
        a: 'No, the "Template (optional)" field of a campaign can stay empty.'
      },
      {
        q: 'What is {{contenu}} for?',
        a: 'It is the place where the text of the campaign is inserted into the template.'
      },
      {
        q: 'I cannot delete a template. Why?',
        a: 'It is used by a "Scheduled" campaign. Cancel that campaign or wait for it to be sent.'
      }
    ],
    permissions: {
      note: 'Creating, editing and deleting require the "Access to the Communication module" right (or being an agency administrator). No particular plan is required.'
    },
    related: [
      { label: 'Templates table', helpId: 'communication.newsletter.modeles.tableau' },
      { label: 'Create or edit a template', helpId: 'communication.newsletter.modeles.formulaire' },
      { label: 'Newsletter campaigns', helpId: 'communication.newsletter.campagnes' }
    ],
    keywords: ['template', 'model', 'layout', 'wrapping', 'html', 'newsletter']
  },
  {
    id: 'communication.newsletter.modeles.tableau',
    kind: 'table',
    title: 'Templates table',
    summary: 'Each row is a template of your agency, with its name and the beginning of its text.',
    howToRead: {
      columns: [
        { key: 'name', label: 'Name', description: 'The name of the template, unique within your agency.' },
        {
          key: 'preview',
          label: 'Preview',
          description:
            'The beginning of the text of the template (about 80 characters), without formatting: it is not a visual rendering.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Edit" opens the form; "Delete" asks for confirmation.'
        }
      ],
      notes: [
        'Search covers the name and the content of the templates.',
        'The table export covers all the templates matching your search.',
        'When there is no template, the table invites you to create one.'
      ]
    },
    steps: [
      { title: 'Find a template', detail: 'Type a word in "Search".' },
      { title: 'Delete a template', detail: 'Use the "Delete" button, then confirm.' }
    ],
    consequences: ['Deletion is final. It is refused if a scheduled campaign uses the template.'],
    faq: [
      {
        q: 'Why does the "Preview" column not show the layout?',
        a: 'It only shows the beginning of the text. To see the rendering, use the preview of a campaign that uses this template.'
      },
      {
        q: 'How many templates can I create?',
        a: 'As many as you like, as long as each name is different.'
      },
      {
        q: 'How do I edit a template?',
        a: 'Click "Edit" on its row: the form opens with its name and HTML.'
      }
    ],
    related: [{ label: 'Create or edit a template', helpId: 'communication.newsletter.modeles.formulaire' }],
    keywords: ['template list', 'delete a template', 'search']
  },
  {
    id: 'communication.newsletter.modeles.formulaire',
    kind: 'section',
    title: 'Create or edit a template',
    summary:
      'Give the template a name and write its HTML with the "{{contenu}}" variable where the text of the campaign should appear.',
    steps: [
      { title: 'Open', detail: 'Use the "New template" button (or "Edit" on a row).' },
      { title: 'Name it', detail: 'The name is required and must be unique.' },
      { title: 'Write the HTML', detail: 'A starting model is offered at creation: adapt it.' },
      { title: 'Confirm', detail: 'Use the "OK" button of the window.' }
    ],
    howToRead: {
      notes: ['Available variables: {{contenu}}, {{prenom}}, {{nom}}, {{email}} and {{lien_desinscription}}.']
    },
    consequences: [
      'When saving, the HTML is cleaned: only common formatting tags (paragraphs, headings, lists, links, tables) are kept; images and scripts are removed.',
      'If the name already exists, a message says so and nothing is saved.'
    ],
    faq: [
      {
        q: 'Do I need to know HTML?',
        a: 'A little: start from the proposed model and only change the texts between the tags.'
      },
      {
        q: 'Where do I put the unsubscribe link?',
        a: 'In the body of each campaign, with "{{lien_desinscription}}". It can also be in the template, but that does not replace the one in the message.'
      },
      {
        q: 'Which variables can I use?',
        a: '{{contenu}}, {{prenom}}, {{nom}}, {{email}} and {{lien_desinscription}}.'
      }
    ],
    related: [{ label: 'Newsletter templates', helpId: 'communication.newsletter.modeles' }],
    keywords: ['html', 'variables', 'content', 'new template']
  }
];

export default entries;
