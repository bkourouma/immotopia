import type { HelpEntry } from '../../../types';

/** « contacts » area of the « commercial » module (en). */
const entries: HelpEntry[] = [
  // ───────────────────────── Contact list ─────────────────────────
  {
    id: 'commercial.contacts.liste',
    kind: 'page',
    title: 'Contact list',
    summary:
      "Find all your agency's contacts here: leads, clients and archived contacts. This is the starting point to create, search, open, edit or delete a contact.",
    purpose:
      'A contact is a person or a company your agency follows: a potential buyer, a future tenant, an owner... A newly created contact is first a "Lead". It becomes an "Active client" when you give it a role (Owner, Tenant, Co-owner, Buyer). Each contact has its own record, with its tags, its roles and, if your plan includes the CRM, its deals and activities.',
    steps: [
      {
        title: 'Create a contact',
        detail:
          'Click "New contact". The form requires at least the type, first name, last name, "Personal email" and the district.'
      },
      {
        title: 'Search and filter',
        detail:
          'Type a name, a company name, an email or a phone number in the search field. Status, Tags and Team member are always visible; the other criteria are under "More filters". "Clear filters" resets the list.'
      },
      {
        title: 'Open a record',
        detail: 'Click the "View details" icon (the eye) on the row.'
      },
      {
        title: 'Edit a contact',
        detail: 'Click the "Edit" icon (the pencil): the form opens in a window.'
      },
      {
        title: 'Log an activity',
        detail: 'Click the "Add an activity" icon (the calendar) to open the activity form for this contact.'
      },
      {
        title: 'Manage the tags of several contacts',
        detail: 'Tick some rows: a bar appears with "Manage tags". You add or remove tags for all the ticked contacts.'
      },
      {
        title: 'Export',
        detail:
          '"Export" button: Excel, CSV or PDF. All contacts matching your criteria are exported, not only the displayed page.'
      },
      {
        title: 'Delete a contact',
        detail: 'Click the "Delete" icon (the bin), then confirm in the "Delete this contact?" bubble.'
      }
    ],
    consequences: [
      'A new contact is always created with the "Lead" status. The email address must be unique in your agency: a duplicate is refused.',
      'If WhatsApp is set up for your agency, the contact may receive an invitation to your WhatsApp group when created, provided they have given "WhatsApp consent".',
      'Deletion is permanent: it also erases the deals, activities, roles and tags attached to the contact. It is refused if the contact has an owner account, a third-party account or a financial history (for example a purchase offer).',
      'An export contains the contacts matching your criteria: clear the criteria to export everything.'
    ],
    faq: [
      {
        q: 'Why can\'t I see the "Next action" and "Deal in progress" columns?',
        a: 'They, as well as the "Deal in progress" and "Upcoming activity" filters, are part of the CRM plan. If your agency has not subscribed to it, they are hidden.'
      },
      {
        q: 'How do I turn a lead into a client?',
        a: 'Open its record and click "Convert", then choose at least one role. You can also add a role from the "Roles" card of the record.'
      },
      {
        q: 'Why is deletion refused?',
        a: 'The contact has an owner account, a third-party account or a financial history. These links are kept: the contact cannot be deleted.'
      },
      {
        q: 'My save is refused. Why?',
        a: 'First check the email (already used?) and the required fields. Otherwise you may be missing a right: "Create contacts" to create, "Edit contacts" to edit or delete.'
      },
      {
        q: 'How do I find a contact?',
        a: 'Type its name, company name, email or phone number in the search field. Then narrow it down with Status, Tags, Team member or "More filters".'
      }
    ],
    permissions: {
      note: 'Viewing the list requires "View contacts", creating requires "Create contacts"; editing, deleting, converting, managing roles and tags require "Edit contacts". The deal and activity columns, filters and cards belong to the CRM plan.'
    },
    related: [
      { label: 'How to read the contact table', helpId: 'commercial.contacts.liste.tableau' },
      { label: 'Create a contact', helpId: 'commercial.contacts.nouveau' },
      { label: 'A contact record', helpId: 'commercial.contacts.detail' },
      { label: 'Manage tags in bulk', helpId: 'commercial.contacts.liste.tags-en-masse' }
    ],
    keywords: [
      'contact',
      'contacts',
      'lead',
      'prospect',
      'client',
      'address book',
      'create a contact',
      'delete a contact',
      'search',
      'tag',
      'export'
    ],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'contacts-nouveau',
          title: 'Create a contact',
          description:
            'This button opens the creation form. First name, last name, personal email and district are required; the contact is created as a "Lead".'
        },
        {
          target: 'contacts-tableau',
          title: 'Check it does not already exist',
          description:
            'Before creating, search for the name, email or phone here: an email already used in your agency is refused.'
        },
        {
          target: 'contacts-actions',
          title: 'Continue from the row',
          description:
            'After creating, click the eye to open the record: you add tags, roles and, with the CRM plan, deals there.'
        }
      ]
    }
  },
  {
    id: 'commercial.contacts.liste.tableau',
    kind: 'table',
    title: 'Contact table',
    summary:
      'Each row is a contact of your agency, from the most recently created to the oldest. The table shows the name, contact details and, with the CRM plan, the next action and the deal in progress.',
    howToRead: {
      columns: [
        { key: 'name', label: 'Name', description: "The contact's name (the company name for a company)." },
        { key: 'email', label: 'Email', description: "The record's email address." },
        {
          key: 'phone',
          label: 'Phone',
          description: 'The main number. A dash (-) means no number is recorded.'
        },
        {
          key: 'nextAction',
          label: 'Next action',
          description:
            "The nearest planned action (type and date), taken from the contact's activities. A dash means no action is planned. CRM plan column."
        },
        {
          key: 'activeDeal',
          label: 'Deal in progress',
          description:
            'Type and stage of the most recently modified deal that is neither won nor lost. A dash means no deal is in progress. CRM plan column.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: 'Four icons: "Add an activity", "View details", "Edit" and "Delete" (with confirmation).'
        }
      ],
      notes: [
        'The search field covers the name, company name, email, phones and source. The Status (Leads, Clients, Archived), Tags (at least one of the chosen tags) and Team member criteria are always visible.',
        'Under "More filters": Creation date, Contact type (Individual, Company), Maturity (Cold, Warm, Hot), Lead source and, with the CRM plan, "Deal in progress" and "Upcoming activity".',
        'The box at the top of the column ticks the contacts of the displayed page. Ticked rows are used by "Manage tags".'
      ]
    },
    faq: [
      {
        q: 'Does the export contain all contacts?',
        a: 'Yes: the export includes all contacts matching your criteria, not only the displayed page.'
      },
      {
        q: 'Why does a contact appear without a next action?',
        a: 'None of its activities has a planned next action. You set one by logging an activity.'
      },
      {
        q: "Where can I see a contact's status (Lead, Active client)?",
        a: 'On its record, under its name, or by filtering the list with the Status criterion.'
      }
    ],
    related: [
      { label: 'List overview', helpId: 'commercial.contacts.liste' },
      { label: 'Manage tags in bulk', helpId: 'commercial.contacts.liste.tags-en-masse' }
    ],
    keywords: ['columns', 'next action', 'deal in progress', 'filter', 'search', 'export']
  },
  {
    id: 'commercial.contacts.liste.tags-en-masse',
    kind: 'section',
    title: 'Bulk tag management',
    summary: 'Add or remove tags for all the contacts ticked in the list, in a single confirmation.',
    purpose:
      'Tags are coloured labels specific to your agency (for example "VIP" or "To call back") used to sort and find your contacts. This window saves you from editing them record by record.',
    steps: [
      { title: 'Tick the contacts', detail: 'In the list, tick the rows you want.' },
      { title: 'Open the window', detail: 'Click "Manage tags" in the bar that appears.' },
      {
        title: 'Choose the tags',
        detail: 'Click the tags under "Tags to add" or "Tags to remove". The same tag cannot be in both.'
      },
      {
        title: 'Apply',
        detail: 'Read the "Summary of the changes", then click "Apply changes".'
      }
    ],
    consequences: [
      'Nothing is changed until you click "Apply changes".',
      'Changes are applied contact by contact. If some fail, a message gives the number of errors: some tags may then not have been changed.',
      'Removing a tag only detaches it from the ticked contacts: the tag itself is not deleted. This window does not create new tags; to create one, use "Manage tags" in a contact record.'
    ],
    faq: [
      {
        q: 'How many contacts are affected?',
        a: 'Only those you ticked; their number is shown at the top of the window.'
      },
      {
        q: 'What happens if a contact already has the tag to add?',
        a: 'Nothing changes for that contact: the tag is not added a second time.'
      },
      {
        q: 'I do not see any tag.',
        a: 'Your agency has none yet. Open a contact record, "Manage" in the Tags card, then "Create tag".'
      }
    ],
    permissions: { note: 'Requires the "Edit contacts" right.' },
    related: [{ label: "Manage a contact's tags", helpId: 'commercial.contacts.detail.gerer-tags' }],
    keywords: ['tags', 'labels', 'bulk', 'several contacts', 'selection']
  },

  // ───────────────────────── New contact ─────────────────────────
  {
    id: 'commercial.contacts.nouveau',
    kind: 'page',
    title: 'New contact',
    summary:
      'Create a contact (person or company) by filling in a form with six tabs. Only a few fields are required: the rest can be completed later.',
    purpose:
      'The same form is used to create and edit a contact. It opens as a full page ("New contact") or in a window from the contact list. A created contact is always a "Lead"; you convert it into a client from its record.',
    steps: [
      {
        title: 'Basique tab',
        detail:
          'Choose Individual or Company, then enter the first name, last name and "Personal email": all three are required.'
      },
      {
        title: 'Identity tab (company)',
        detail: 'For a company, the "Company name" is required. For an individual, this tab is optional.'
      },
      {
        title: 'Contact tab',
        detail: 'Choose the "District" (required at creation) by typing its name, then the address and neighbourhood.'
      },
      {
        title: 'Other tabs',
        detail: 'Professionnel, CRM and Consentements are optional. Complete them if you have the information.'
      },
      {
        title: 'Save',
        detail: 'Click "Create the contact". If needed, the form itself opens the tab of the first field to correct.'
      }
    ],
    consequences: [
      'The contact is created with the "Lead" status. No deal or activity is created automatically.',
      'The "Personal email" must be unique in your agency: if another contact already uses it, saving is refused and the error appears under the field.',
      "If you tick a consent, today's date is recorded with it.",
      'If WhatsApp is set up for your agency and "WhatsApp consent" is ticked, the contact may receive an invitation to your WhatsApp group.',
      'From the "New contact" page, you return to the contact list after saving. From the list window, it closes and the list updates.'
    ],
    faq: [
      {
        q: 'Which fields are required?',
        a: 'Contact type, first name, last name, "Personal email" and "District". For a company, the "Company name" is added.'
      },
      {
        q: 'Why is saving refused although everything is filled in?',
        a: 'Often because the email already exists in your agency. Look for it in the contact list.'
      },
      {
        q: 'Where do I choose the responsible team member, the tags or the roles?',
        a: 'Not in this form. Tags and roles are managed from the contact record, once created.'
      },
      {
        q: 'I cannot find my district.',
        a: 'Type the first letters of its name in the "District" field: the list filters as you type.'
      }
    ],
    permissions: { note: 'Requires the "Create contacts" right.' },
    related: [
      { label: 'Basique tab', helpId: 'commercial.contacts.nouveau.basique' },
      { label: 'Contact list', helpId: 'commercial.contacts.liste' },
      { label: 'Convert a lead into a client', helpId: 'commercial.contacts.detail.convertir' }
    ],
    keywords: ['create a contact', 'new lead', 'add a contact', 'form', 'company', 'person'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'contact-form-onglets',
          title: 'Six tabs',
          description:
            'The form is split into tabs. Only Basique and Contact (the district) have required fields for an individual.'
        },
        {
          target: 'contact-form-enregistrer',
          title: 'Save',
          description:
            'Click here once the required fields are filled in. If a field needs correcting, the relevant tab opens by itself.'
        }
      ]
    }
  },
  {
    id: 'commercial.contacts.nouveau.basique',
    kind: 'section',
    title: 'Basique tab',
    summary: 'The essential information: contact type, first name, last name, emails and phones.',
    steps: [
      { title: 'Contact type', detail: 'Individual or Company. This choice changes the fields of the Identity tab.' },
      { title: 'First name and Last name', detail: 'Required, even for a company (enter the representative).' },
      { title: 'Personal email', detail: 'Required and unique in the agency. The "Work email" is optional.' },
      {
        title: 'Phones',
        detail:
          'Choose the dialling code (+225 by default), then the number. Tick "WhatsApp" under the phone used on WhatsApp.'
      }
    ],
    consequences: [
      'The number ticked "WhatsApp" becomes the contact\'s WhatsApp number; if both are ticked, it is the main phone.',
      'The email is saved in lowercase.'
    ],
    faq: [
      {
        q: 'Can a contact be created without an email?',
        a: 'No, the "Personal email" is required to create or edit a contact.'
      },
      {
        q: 'What happens if I change the contact type?',
        a: 'The Identity tab shows the matching fields: those of an individual or those of a company.'
      },
      {
        q: 'How do I show that a number is reachable on WhatsApp?',
        a: 'Tick "WhatsApp" under the phone concerned.'
      }
    ],
    related: [{ label: 'Form overview', helpId: 'commercial.contacts.nouveau' }],
    keywords: ['first name', 'last name', 'email', 'phone', 'whatsapp', 'dialling code']
  },
  {
    id: 'commercial.contacts.nouveau.identite',
    kind: 'section',
    title: 'Identity tab',
    summary:
      "A person's civil status information, or a company's legal information, depending on the chosen contact type.",
    steps: [
      {
        title: 'For an individual',
        detail:
          'Title (Mr, Mrs, Ms, Dr, Prof), Date of birth, Nationality ("Ivoirienne" by default), identity document (Type, Number, Expiry date) and Profile picture.'
      },
      {
        title: 'For a company',
        detail:
          "Company name (required), Legal form, RCCM, Tax number, Representative's name and Representative's role."
      },
      {
        title: 'Profile picture',
        detail: 'An image under 2 MB. Only images are accepted.'
      }
    ],
    consequences: [
      'The fields shown in this tab depend on the contact type chosen in the Basique tab: change the type and the tab changes.'
    ],
    faq: [
      {
        q: 'Is the identity information required?',
        a: 'No, except the "Company name" of a company. Complete it when you have it.'
      },
      {
        q: 'Which identity documents are offered?',
        a: 'CNI, Passport, Driving licence or Other.'
      },
      {
        q: 'Which profile picture can I add?',
        a: 'An image under 2 MB: other file types are refused.'
      }
    ],
    related: [{ label: 'Form overview', helpId: 'commercial.contacts.nouveau' }],
    keywords: ['identity', 'cni', 'passport', 'company name', 'rccm', 'nationality', 'photo']
  },
  {
    id: 'commercial.contacts.nouveau.coordonnees',
    kind: 'section',
    title: 'Contact tab',
    summary: "The contact's address, district and communication preferences.",
    steps: [
      { title: 'Full address', detail: 'Optional: street, building, landmarks.' },
      {
        title: 'District',
        detail: 'Required at creation. Type the name of the district (example: Cocody) and choose it from the list.'
      },
      { title: 'Neighbourhood/Area', detail: "Optional: the contact's neighbourhood or area." },
      {
        title: 'Preferences',
        detail:
          'Preferred language (French, English, Other) and Preferred contact channel (Call, WhatsApp, Email, SMS).'
      }
    ],
    consequences: [
      'When editing an already saved contact, the district is no longer required: an old record without a district stays editable.'
    ],
    faq: [
      {
        q: 'Why is the district required?',
        a: 'It lets you sort and filter your contacts by district. It is only required for a new contact.'
      },
      {
        q: 'Does the preferred channel block the other channels?',
        a: 'No: it is information for your team, it prevents no contact.'
      }
    ],
    related: [{ label: 'Form overview', helpId: 'commercial.contacts.nouveau' }],
    keywords: ['address', 'district', 'neighbourhood', 'language', 'channel', 'cocody']
  },
  {
    id: 'commercial.contacts.nouveau.professionnel',
    kind: 'section',
    title: 'Professionnel tab',
    summary: "The contact's professional and financial situation: useful to qualify a buyer or a tenant.",
    steps: [
      { title: 'Job and employer', detail: 'Occupation / job title, Business sector (list) and Employer.' },
      {
        title: 'Income',
        detail: '"Minimum income (FCFA)" and "Maximum income (FCFA)": a range. "Salary": a single amount.'
      },
      {
        title: 'Situation',
        detail:
          'Job stability (CDI, CDD, Freelance, Informal, Retired, Student, Unemployed, Other) and Borrowing capacity (Yes, No, Unknown).'
      }
    ],
    consequences: [
      'This information is optional. It feeds the advanced search filters (income, borrowing capacity) and your own follow-up.'
    ],
    faq: [
      {
        q: 'What is the difference between income and salary?',
        a: 'Income is a range (minimum and maximum); salary is a single amount. Fill in the one you know.'
      }
    ],
    related: [{ label: 'Advanced contact search', helpId: 'commercial.contacts.recherche-avancee.filtres' }],
    keywords: ['profession', 'income', 'salary', 'employer', 'borrowing', 'cdi']
  },
  {
    id: 'commercial.contacts.nouveau.crm',
    kind: 'section',
    title: 'CRM tab',
    summary:
      'Sales follow-up of the contact: where they come from, how ready they are to act, what priority to give them.',
    howToRead: {
      statuses: [
        { value: 'COLD', label: 'Cold', description: 'Contact at an early stage of their project (default value).' },
        { value: 'WARM', label: 'Warm', description: 'Interested contact, project under consideration.' },
        { value: 'HOT', label: 'Hot', description: 'Contact ready to act quickly.' }
      ],
      notes: [
        'The maturity level is an assessment you enter: it is not calculated by the application.',
        'Lead source: Website, Social media, Recommendation, Campaign, Agency, Walk-in, Phone call, Other. "Source (legacy)" is an old free field.',
        'Priority: Low, Normal (default) or High. Score: a number from 0 to 100, entered by hand.'
      ]
    },
    consequences: [
      'These fields are optional. The maturity level and the lead source are used as criteria in the contact list.'
    ],
    faq: [
      {
        q: 'Is the score calculated automatically?',
        a: 'No, it is entered by hand in this form.'
      },
      {
        q: 'Where can I see my "Hot" contacts?',
        a: 'In the contact list, open "More filters" and choose Maturity.'
      }
    ],
    related: [{ label: 'Contact table', helpId: 'commercial.contacts.liste.tableau' }],
    keywords: ['maturity', 'hot', 'cold', 'warm', 'source', 'lead', 'priority', 'score']
  },
  {
    id: 'commercial.contacts.nouveau.consentements',
    kind: 'section',
    title: 'Consentements tab',
    summary:
      'The agreements given by the contact to be contacted, and your internal notes. Nothing is ticked by default.',
    steps: [
      {
        title: 'Tick the consents',
        detail: '"Marketing consent", "WhatsApp consent" and "Email consent": tick only what the contact has accepted.'
      },
      { title: 'Consent source', detail: 'Note how the agreement was obtained (at the agency, by phone...).' },
      { title: 'Internal notes', detail: 'Free text, reserved for your team.' }
    ],
    consequences: [
      'Without "WhatsApp consent", your agency\'s WhatsApp messages are not sent to this contact.',
      'Mailing lists built from contacts only keep those who have the "Email consent".',
      "As soon as a consent is ticked at creation, today's date is recorded."
    ],
    faq: [
      {
        q: 'Can I tick a consent on behalf of the contact?',
        a: 'No: only tick if the contact has given their agreement, and note how in "Consent source".'
      },
      {
        q: 'Are the internal notes visible to the contact?',
        a: 'They are meant for your team, in the contact record.'
      }
    ],
    related: [{ label: 'Form overview', helpId: 'commercial.contacts.nouveau' }],
    keywords: ['consent', 'gdpr', 'whatsapp', 'marketing', 'notes', 'agreement']
  },

  // ───────────────────────── Edit a contact ─────────────────────────
  {
    id: 'commercial.contacts.modifier',
    kind: 'page',
    title: 'Edit a contact',
    summary: "Correct or complete a contact's information with the same form as for creation.",
    purpose:
      'This page opens from the "Edit" button of the record; from the list, the form opens in a window. The fields, tabs and rules are those of the creation form.',
    steps: [
      { title: 'Open the form', detail: '"Edit" button of the record, or "Edit" icon of the list.' },
      { title: 'Correct the fields', detail: 'Change what is needed, in any tab.' },
      { title: 'Save', detail: 'Click "Update the contact". "Cancel" closes without changing anything.' }
    ],
    consequences: [
      'Changing the email is refused if it is already used by another contact of the agency.',
      'The status, roles and tags are not changed here: use the contact record.',
      'From this page, saving takes you back to the contact list; "Cancel" takes you back to the record.'
    ],
    faq: [
      {
        q: 'Why is the district empty on an old contact?',
        a: 'Old records did not always have one. It is only required at creation: you can save without filling it in.'
      },
      {
        q: 'How do I change the contact status?',
        a: 'It changes with the roles: see "Convert" and the "Roles" card in the record.'
      },
      {
        q: 'Can I edit a contact without leaving the list?',
        a: 'Yes: the "Edit" icon of the list opens the same form in a window. After saving, the window closes and the list updates.'
      },
      {
        q: 'What happens if I click "Cancel"?',
        a: 'Nothing is saved. From the edit page, you go back to the contact record.'
      },
      {
        q: "Can I change a contact's email?",
        a: 'Yes, as long as no other contact in your agency already uses that address. Otherwise saving is refused and the error appears under the field.'
      }
    ],
    permissions: { note: 'Requires the "Edit contacts" right.' },
    related: [
      { label: 'The form, tab by tab', helpId: 'commercial.contacts.nouveau' },
      { label: 'The contact record', helpId: 'commercial.contacts.detail' }
    ],
    keywords: ['edit', 'correct', 'update', 'contact']
  },

  // ───────────────────────── Contact record ─────────────────────────
  {
    id: 'commercial.contacts.detail',
    kind: 'page',
    title: 'Contact record',
    summary:
      'All the information about a contact: contact details, status, roles, tags and, with the CRM plan, its deals and activities.',
    purpose:
      'The record is where you move a contact forward: convert it into a client, give it roles, sort it with tags, attach deals to it and log your exchanges.',
    howToRead: {
      statuses: [
        { value: 'LEAD', label: 'Lead', description: 'Contact created, not yet a client: no active role.' },
        {
          value: 'ACTIVE_CLIENT',
          label: 'Active client',
          description: 'Contact with at least one active role (Owner, Tenant, Co-owner, Buyer).'
        },
        { value: 'ARCHIVED', label: 'Archived', description: 'Archived contact.' }
      ],
      notes: [
        'At the top: the name, the status, then the "Convert" (visible for a Lead, or an Active client with no active role) and "Edit" buttons.',
        'Below: Email, Phone, WhatsApp, Source and Last interaction (if filled in), Created on, Edited on. The "Last interaction" updates when an activity is logged for this contact.'
      ]
    },
    steps: [
      { title: 'Convert a lead', detail: '"Convert" button: choose the role(s) of the new client.' },
      { title: 'Manage roles', detail: '"Roles" card, "Add" button.' },
      { title: 'Sort with tags', detail: '"Tags" card, "Manage" button.' },
      { title: 'Add a deal', detail: '"Deals" card, "Add" button (CRM plan).' },
      { title: 'Log an activity', detail: '"Activity timeline" card, "Add" button (CRM plan).' },
      { title: 'Correct the information', detail: '"Edit" button.' }
    ],
    consequences: [
      'The status changes by itself with the roles: a first role turns a Lead into an Active client; removing the last role of an Active client turns it back into a Lead.',
      'An "Owner" role makes the contact selectable wherever an owner is designated (property, sale mandate).'
    ],
    faq: [
      {
        q: 'Why has the "Convert" button disappeared?',
        a: 'The contact is already an "Active client" with at least one active role. To change its roles, use the "Roles" card.'
      },
      {
        q: "Why can't I see the Deals and Activity timeline cards?",
        a: 'They are part of the CRM plan, not included in your plan.'
      },
      {
        q: 'How do I delete this contact?',
        a: 'From the contact list, with the "Delete" icon on its row.'
      }
    ],
    permissions: {
      note: 'Viewing the record requires "View contacts"; converting, editing, managing roles and tags require "Edit contacts".'
    },
    related: [
      { label: 'Convert a lead into a client', helpId: 'commercial.contacts.detail.convertir' },
      { label: "The contact's roles", helpId: 'commercial.contacts.detail.roles' },
      { label: "The contact's tags", helpId: 'commercial.contacts.detail.tags' },
      { label: 'Contact list', helpId: 'commercial.contacts.liste' }
    ],
    keywords: ['contact record', 'detail', 'lead', 'active client', 'convert', 'role', 'tag', 'history']
  },
  {
    id: 'commercial.contacts.detail.roles',
    kind: 'section',
    title: "Contact's roles",
    summary:
      'Roles say what the contact is for your agency: Owner, Tenant, Co-owner or Buyer. Each active role is shown with its start date.',
    steps: [
      { title: 'Add or remove roles', detail: '"Add" button: the "Manage roles" window opens.' },
      {
        title: 'Delete a role',
        detail: 'Bin icon on the role row, then "Yes" in the "Delete this role" bubble.'
      }
    ],
    consequences: [
      'Deleting a role erases it permanently.',
      'If it was the last role of an "Active client", the contact goes back to "Lead".',
      'The "Owner" role makes it selectable as the owner of a property or the seller of a mandate.'
    ],
    faq: [
      {
        q: 'Can a contact have several roles?',
        a: 'Yes: for example Owner and Tenant.'
      },
      {
        q: 'Why does the card say "No role assigned"?',
        a: 'The contact is a Lead. Click "Add" or "Convert" to give it one.'
      }
    ],
    permissions: { note: 'Requires the "Edit contacts" right.' },
    related: [{ label: 'Manage roles', helpId: 'commercial.contacts.detail.gerer-roles' }],
    keywords: ['role', 'owner', 'tenant', 'co-owner', 'buyer']
  },
  {
    id: 'commercial.contacts.detail.tags',
    kind: 'section',
    title: "Contact's tags",
    summary: "Tags are coloured labels specific to your agency. This card shows the contact's tags, with their number.",
    steps: [
      {
        title: 'Change the tags',
        detail: '"Manage" button (or "Add" if the card is empty): the "Manage tags" window opens.'
      }
    ],
    consequences: ['Tags are used to filter the contact list ("Tags" criterion) and the advanced search.'],
    faq: [
      {
        q: 'Are tags shared between colleagues?',
        a: 'Yes: a created tag exists for your whole agency.'
      },
      {
        q: 'How do I put a tag on many contacts?',
        a: 'In the list, tick the contacts then "Manage tags".'
      }
    ],
    permissions: { note: 'Requires the "Edit contacts" right.' },
    related: [{ label: "Manage the contact's tags", helpId: 'commercial.contacts.detail.gerer-tags' }],
    keywords: ['tag', 'label', 'sort']
  },
  {
    id: 'commercial.contacts.detail.affaires',
    kind: 'section',
    title: "Contact's deals",
    summary:
      'The deals attached to this contact (purchase, rental, sale, property management, mandate): the 10 most recent, with their stage and maximum budget.',
    howToRead: {
      statuses: [
        { value: 'NEW', label: 'New', description: 'A deal that has just been created.' },
        { value: 'QUALIFIED', label: 'Qualified', description: "The contact's need is clarified." },
        { value: 'VISIT', label: 'Viewing', description: 'Viewings in progress.' },
        { value: 'NEGOTIATION', label: 'Negotiation', description: 'Discussion about the terms.' },
        { value: 'WON', label: 'Won', description: 'Deal concluded.' },
        { value: 'LOST', label: 'Lost', description: 'Deal abandoned.' }
      ],
      notes: [
        "The amount shown on the right is the deal's maximum budget, when filled in. Click a deal to open its record."
      ]
    },
    steps: [{ title: 'Create a deal', detail: '"Add" button (or "Create" if the card is empty).' }],
    consequences: ['A new deal starts at the "New" stage.'],
    faq: [
      {
        q: 'Why is this card missing?',
        a: 'Deals belong to the CRM plan: without it, the card is not displayed.'
      },
      {
        q: "Where can I see all the contact's deals?",
        a: 'The card only shows 10. The deal list gathers them all.'
      }
    ],
    permissions: { feature: 'CRM' },
    related: [
      { label: 'Create a deal for this contact', helpId: 'commercial.contacts.detail.nouvelle-affaire' },
      { label: 'Deal list', helpId: 'commercial.affaires.liste' }
    ],
    keywords: ['deal', 'purchase', 'rental', 'sale', 'mandate', 'budget']
  },
  {
    id: 'commercial.contacts.detail.activites',
    kind: 'section',
    title: 'Activity timeline',
    summary:
      'The last 10 activities logged for this contact, from the most recent to the oldest: your history of exchanges.',
    steps: [
      {
        title: 'Add an activity',
        detail: '"Add" button (or "Create" if the card is empty): the "New activity" window opens.'
      }
    ],
    consequences: ['Logging an activity updates the contact\'s "Last interaction".'],
    faq: [
      {
        q: 'Why is this card missing?',
        a: 'Activities belong to the CRM plan: without it, the card is not displayed.'
      },
      {
        q: 'Where can I see older activities?',
        a: 'The card only shows 10. The activity list gathers them all.'
      }
    ],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Activity list', helpId: 'commercial.activites.liste' }],
    keywords: ['activity', 'history', 'call', 'exchange', 'follow-up', 'timeline']
  },
  {
    id: 'commercial.contacts.detail.convertir',
    kind: 'section',
    title: 'Convert a lead into a client',
    summary: 'Turns a contact from "Lead" into "Active client" by giving it one or more roles.',
    steps: [
      { title: 'Open the window', detail: '"Convert" button of the record.' },
      {
        title: 'Choose the roles',
        detail: 'Tick at least one role: Owner, Tenant, Co-owner or Buyer.'
      },
      { title: 'Confirm', detail: 'Click "Convert to client". "Cancel" closes without changing anything.' }
    ],
    consequences: [
      'The status becomes "Active client" and the ticked roles are created.',
      'With the "Owner" role, the contact becomes selectable as an owner. If no access account exists with their email, one is created; the contact may then receive on WhatsApp (if your agency has set it up and they have the "WhatsApp consent") a message with the link to choose their password.',
      'It is not a lock: by removing all its roles, the contact becomes a "Lead" again.'
    ],
    faq: [
      {
        q: 'The "Convert to client" button is greyed out.',
        a: 'You must tick at least one role.'
      },
      {
        q: 'Who can be converted?',
        a: 'A Lead, or an Active client who no longer has any active role.'
      }
    ],
    permissions: { note: 'Requires the "Edit contacts" right.' },
    related: [{ label: 'Manage roles', helpId: 'commercial.contacts.detail.gerer-roles' }],
    keywords: ['convert', 'lead', 'client', 'role', 'owner']
  },
  {
    id: 'commercial.contacts.detail.gerer-roles',
    kind: 'section',
    title: 'Manage roles',
    summary: 'Tick the roles the contact should have. Saving adds the new roles and removes the ones you untick.',
    steps: [
      {
        title: 'Tick the roles',
        detail: 'Owner, Renter, Co-owner, Buyer.'
      },
      { title: 'Save', detail: '"Save" button. "Cancel" closes without changing anything.' }
    ],
    consequences: [
      'An unticked role is permanently deleted.',
      'The status follows: at least one role turns a Lead into an Active client; no role turns an Active client back into a Lead.',
      'With the "Owner" role, an access account is created for the contact if they have none, with a possible WhatsApp message (if set up and if the contact has consented).'
    ],
    faq: [
      {
        q: 'Can I untick everything?',
        a: 'Yes: the contact becomes a "Lead" again if it was an "Active client".'
      }
    ],
    permissions: { note: 'Requires the "Edit contacts" right.' },
    related: [{ label: "Contact's roles", helpId: 'commercial.contacts.detail.roles' }],
    keywords: ['roles', 'tick', 'owner', 'tenant']
  },
  {
    id: 'commercial.contacts.detail.gerer-tags',
    kind: 'section',
    title: "Manage a contact's tags",
    summary:
      'Add or remove tags for this contact, or create a new one for your whole agency. Each click is saved immediately.',
    steps: [
      { title: 'Search', detail: '"Search for a tag…" field to filter the lists.' },
      {
        title: 'Create a tag',
        detail:
          'Choose a colour, enter the name (50 characters at most), then "Create tag". It is immediately assigned to the contact.'
      },
      { title: 'Add a tag', detail: 'Click a tag under "Available tags".' },
      { title: 'Remove a tag', detail: 'Click the cross of a tag under "Assigned tags".' },
      { title: 'Finish', detail: '"Close" button: there is no final save.' }
    ],
    consequences: [
      'Each addition or removal is saved immediately.',
      'A tag created here is available to the whole agency. A name already taken is refused.',
      'Removing a tag from the contact does not delete the tag.'
    ],
    faq: [
      {
        q: 'How do I permanently delete a tag?',
        a: 'This screen does not allow it: it only removes the tag from the contact.'
      },
      {
        q: 'Do I have to click a button to save?',
        a: 'No: each addition or removal is saved immediately. "Close" only closes the window.'
      },
      {
        q: 'Can I create two tags with the same name?',
        a: 'No: a name already taken is refused, with the message "A tag with this name already exists."'
      }
    ],
    permissions: { note: 'Requires the "Edit contacts" right, including to create a tag.' },
    related: [{ label: 'Bulk tag management', helpId: 'commercial.contacts.liste.tags-en-masse' }],
    keywords: ['tags', 'create a tag', 'colour', 'label']
  },
  {
    id: 'commercial.contacts.detail.nouvelle-affaire',
    kind: 'section',
    title: 'New deal for a contact',
    summary:
      'Creates a deal already attached to this contact: the contact is recalled at the top of the window ("For" followed by their name).',
    steps: [
      { title: 'Open the window', detail: '"Add" button of the "Deals" card.' },
      {
        title: 'Fill in the form',
        detail: 'General information, budget, property type, criteria and additional information.'
      },
      { title: 'Save', detail: 'Submit the form. The message "Deal created successfully" appears.' }
    ],
    consequences: [
      'The deal starts at the "New" stage and appears in the contact\'s "Deals" card and in the deal list.'
    ],
    faq: [
      {
        q: 'Where is each field of the form explained?',
        a: 'In the help for creating a deal (see "See also").'
      }
    ],
    permissions: { feature: 'CRM', note: 'Requires the "Create deals" right.' },
    related: [{ label: 'Create a deal', helpId: 'commercial.affaires.nouvelle' }],
    keywords: ['deal', 'new deal', 'budget']
  },
  {
    id: 'commercial.contacts.detail.avis-portail',
    kind: 'section',
    title: 'Portal account address',
    summary:
      "This note appears under the email when the contact has a client account whose address differs from the record's.",
    purpose:
      "Notices (direct debit, reminders) are sent to the address of the client's portal account, not the record's. The note warns you so you do not look for these messages in the wrong place.",
    consequences: [
      'The account address is shown masked: the full address is never displayed.',
      "Changing the contact record's email is not enough to change the address that receives the notices."
    ],
    faq: [
      {
        q: 'Why does this note appear?',
        a: "Because the client's portal account uses a different address from the record's email."
      },
      {
        q: 'It does not appear: is that normal?',
        a: 'Yes: with no linked account, or if both addresses are identical, the note does not appear.'
      }
    ],
    related: [{ label: 'Contact record', helpId: 'commercial.contacts.detail' }],
    keywords: ['portal account', 'notices', 'direct debit', 'different email']
  },

  // ───────────────────────── Advanced contact search ─────────────────────────
  {
    id: 'commercial.contacts.recherche-avancee',
    kind: 'section',
    title: 'Advanced contact search',
    summary:
      'Find contacts with precise criteria, save your searches and export the results. It opens notably when you add CRM contacts to a mailing list.',
    purpose:
      'In the newsletters, the "Advanced CRM contact search" window is used to choose CRM contacts to add to the selected mailing list.',
    steps: [
      { title: 'Search quickly', detail: 'Quick search field: name, email, phone.' },
      {
        title: 'Refine',
        detail:
          '"Advanced filters" button: see the "Advanced filters" help. Each active criterion appears as a chip; the cross removes it.'
      },
      { title: 'Reuse a search', detail: '"Saved searches" button.' },
      { title: 'Save the search', detail: '"Save" button (visible as soon as a criterion is active): give it a name.' },
      { title: 'Choose contacts', detail: 'Tick the rows; the number appears, then "Confirm the selection".' },
      { title: 'Export', detail: '"Export CSV" button.' }
    ],
    consequences: [
      'The confirmed contacts are added to the mailing list; those already present are ignored, and a message says how many were added.',
      'The CSV export includes all the results of the current search, up to 10,000 contacts.',
      'A saved search only keeps the criteria, not the list of contacts: results are recalculated each time it is used.'
    ],
    faq: [
      {
        q: 'Do the criteria add up?',
        a: 'Yes: a contact must meet all the criteria. For a single multiple-choice criterion, matching one of the choices is enough.'
      },
      {
        q: 'How many results are displayed?',
        a: 'In pages of 50 at first; you can change the page size.'
      }
    ],
    permissions: { note: 'Requires the "View contacts" right.' },
    related: [
      { label: 'Advanced filters', helpId: 'commercial.contacts.recherche-avancee.filtres' },
      { label: 'Saved searches', helpId: 'commercial.contacts.recherche-avancee.enregistrees' },
      { label: 'Results table', helpId: 'commercial.contacts.recherche-avancee.resultats' }
    ],
    keywords: ['advanced search', 'filters', 'mailing list', 'newsletter', 'contact selection']
  },
  {
    id: 'commercial.contacts.recherche-avancee.resultats',
    kind: 'table',
    title: 'Contact search results',
    summary: 'Each row is a contact that meets your criteria.',
    howToRead: {
      columns: [
        { key: 'name', label: 'Name', description: "The contact's name." },
        { key: 'email', label: 'Email', description: 'The email address; the icon next to it copies it.' },
        {
          key: 'phone',
          label: 'Phone',
          description: 'The main phone, or failing that the WhatsApp number. A dash (—) means none is recorded.'
        },
        { key: 'status', label: 'Status', description: 'Lead, Active client or Archived.' },
        { key: 'maturityLevel', label: 'Maturity', description: 'Cold, Warm or Hot; a dash if not filled in.' },
        { key: 'commune', label: 'District', description: "The contact's district." },
        { key: 'tags', label: 'Tags', description: "The contact's tags." }
      ],
      notes: [
        'When you choose contacts for a mailing list, tick boxes appear and the table export is removed; the "Export CSV" button remains available above.'
      ]
    },
    faq: [
      {
        q: 'Are my ticked boxes kept if I change page?',
        a: 'Yes: the selection accumulates from one page to the next until you confirm.'
      },
      {
        q: 'Why is a contact missing?',
        a: 'One of your criteria excludes it. Remove the filter chips one by one to see which.'
      },
      {
        q: 'What is the number below the table for?',
        a: 'It shows the total number of contacts meeting the criteria.'
      }
    ],
    related: [{ label: 'Advanced contact search', helpId: 'commercial.contacts.recherche-avancee' }],
    keywords: ['results', 'columns', 'selection']
  },
  {
    id: 'commercial.contacts.recherche-avancee.filtres',
    kind: 'section',
    title: 'Advanced filters',
    summary:
      'A window with seven panels to define precisely the contacts you are looking for. You confirm it with "Apply filters".',
    howToRead: {
      notes: [
        'Identity and contact details: first name, last name, email, phone.',
        'Location: districts, city, neighbourhood.',
        'Status and type: statuses (Lead, Active client, Archived), types (Individual, Company), maturity, CRM roles.',
        'Property project: deal types (Purchase, Rental, Sale, Management, Mandate), min and max budget in FCFA, target areas.',
        'Tags and assignment: tags (with the "Must have ALL the tags (otherwise at least one)" box), "Assigned to".',
        'Financial information: min and max income in FCFA, borrowing capacity.',
        'Consents: Email, WhatsApp, Marketing.'
      ]
    },
    steps: [
      { title: 'Fill in the useful panels', detail: 'Leave empty what does not matter.' },
      { title: 'Apply', detail: 'Click "Apply filters"; "Cancel" closes without changing anything.' }
    ],
    consequences: [
      'All the criteria filled in must be true at the same time for a contact to be kept.',
      'Warning: the "Include unassigned contacts" box keeps ONLY the contacts with no assigned team member; combined with "Assigned to", it gives no result.',
      'Ticked consent boxes only keep the contacts who have given that consent.'
    ],
    faq: [
      {
        q: 'How do I remove a filter?',
        a: 'Click the cross of its chip under the search bar, or reopen the window.'
      },
      {
        q: 'What is the difference between "at least one" and "ALL" for tags?',
        a: 'By default, a contact with any of the chosen tags is kept. With the box ticked, it must have them all.'
      },
      {
        q: 'Why do I get no result with "Assigned to" and "Include unassigned contacts"?',
        a: 'The "Include unassigned contacts" box keeps only contacts with no team member: combined with "Assigned to", no contact can meet both.'
      }
    ],
    related: [{ label: 'Advanced contact search', helpId: 'commercial.contacts.recherche-avancee' }],
    keywords: ['filters', 'criteria', 'budget', 'tags', 'consent', 'district']
  },
  {
    id: 'commercial.contacts.recherche-avancee.enregistrees',
    kind: 'section',
    title: 'Saved searches',
    summary: 'Find the searches you saved, as well as those shared with your team, and run them again in one click.',
    steps: [
      { title: 'Use a search', detail: '"Use" button: the search is run again and its criteria are applied.' },
      { title: 'Delete a search', detail: '"Delete" button: reserved for your own searches.' },
      { title: 'Find a search', detail: 'Beyond 10 searches, a search field appears above the list.' }
    ],
    consequences: [
      'Deletion is permanent and immediate.',
      'The searches you save are personal to you. You can only delete your own: the server refuses to delete a search created by someone else.'
    ],
    faq: [
      {
        q: 'What does "Used … times" mean?',
        a: 'The number of times the search was run again, with the date of last use.'
      },
      {
        q: 'How do I save a search?',
        a: 'Apply criteria, then "Save" (above the results) and give it a name.'
      }
    ],
    related: [{ label: 'Advanced contact search', helpId: 'commercial.contacts.recherche-avancee' }],
    keywords: ['saved search', 'save', 'reuse']
  }
];

export default entries;
