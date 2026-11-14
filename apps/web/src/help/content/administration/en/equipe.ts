import type { HelpEntry } from '../../../types';

/** « equipe » zone of the « administration » module (en): team members, invitations and personal profile. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Team members list
  {
    id: 'administration.equipe.collaborateurs',
    kind: 'page',
    title: 'Team members',
    summary:
      'Find here everyone who works in your agency, with their roles and status. You can invite new people, open a record, and deactivate or reactivate an account.',
    purpose:
      'This list shows who has access to your agency and with which rights. A team member appears in the list once they have accepted their invitation.',
    steps: [
      {
        title: 'Find a team member',
        detail: 'Type a name or an e-mail address in "Search", or filter by "Status" and by "Role".'
      },
      {
        title: 'Open a record',
        detail: 'Click the "eye" icon ("View details") to change their roles or act on their account.'
      },
      {
        title: 'Deactivate or activate an account',
        detail: 'Use the "Deactivate" or "Activate" icon at the end of the row, then confirm with "Yes".'
      },
      {
        title: 'Invite a new team member',
        detail: 'Click "Invite a team member" at the top of the page.'
      }
    ],
    consequences: [
      'Deactivating a team member removes their access to the agency and signs them out. They can be reactivated later.',
      'Pending invitations they had sent are cancelled at the same time.'
    ],
    faq: [
      {
        q: 'I just invited someone: why are they not in the list?',
        a: 'They appear as soon as they have accepted their invitation. Until then, find them on the "Invitations" screen.'
      },
      {
        q: 'Can I deactivate myself?',
        a: 'No, the application refuses. It also refuses to deactivate the last active administrator of the agency.'
      },
      {
        q: 'What does "Never" mean in "Last sign-in"?',
        a: 'The person has never signed in with this account.'
      },
      {
        q: 'Which rights are needed?',
        a: 'Opening the list requires "View team members". Deactivating requires "Deactivate team members", and activating requires "Edit team members".'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Agency manager'],
      note: 'Right required to see the list: "View team members".'
    },
    related: [
      { label: 'Team members table', helpId: 'administration.equipe.collaborateurs.tableau' },
      { label: 'Invite a team member', helpId: 'administration.equipe.inviter' },
      { label: 'Pending invitations', helpId: 'administration.equipe.invitations' }
    ],
    keywords: ['team', 'users', 'employees', 'staff', 'access', 'accounts', 'members']
  },
  {
    id: 'administration.equipe.collaborateurs.tableau',
    kind: 'table',
    title: 'Team members table',
    summary: 'Each row is a team member of your agency. The table shows their name, roles, status and last sign-in.',
    howToRead: {
      columns: [
        {
          key: 'user',
          label: 'User',
          description:
            'The full name and, below it, the e-mail address. With no name on file, only the e-mail address is shown.'
        },
        { key: 'roles', label: 'Roles', description: 'The roles given in the agency, one badge per role.' },
        { key: 'status', label: 'Status', description: "The account's state in the agency (see the statuses below)." },
        {
          key: 'lastLogin',
          label: 'Last sign-in',
          description: 'Date of the last sign-in, or "Never".'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"View details", then "Deactivate" (active account) or "Activate" (other statuses).'
        }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'The team member can sign in and work in the agency.' },
        {
          value: 'PENDING_INVITE',
          label: 'Invitation pending',
          description:
            'The account is planned but not activated yet, for example the administrator of a newly created agency.'
        },
        {
          value: 'DISABLED',
          label: 'Deactivated',
          description: 'Access to the agency is cut off. The account can be reactivated.'
        }
      ],
      notes: [
        'The search bar filters by text (name or e-mail), by status and by role. Filters stay in the page address.',
        'The export button uses the same criteria as the list on screen.'
      ]
    },
    steps: [
      { title: 'Filter the list', detail: 'Use "Search", "Status" and "Role".' },
      { title: 'Open a record', detail: 'The "eye" icon at the end of the row.' },
      { title: 'Deactivate or activate', detail: 'The icon at the end of the row, then "Yes" to confirm.' }
    ],
    consequences: [
      '"Deactivate" cuts access, signs the person out and cancels the pending invitations they had sent.',
      '"Activate" gives access back with the roles the person had. They are not notified by e-mail.'
    ],
    faq: [
      {
        q: 'Why does "Activate" appear for a pending invitation?',
        a: 'The button is shown for every status other than "Active".'
      },
      {
        q: 'Does a deactivated team member lose their roles?',
        a: 'The roles are kept: when reactivated, the person gets their previous roles back.'
      },
      {
        q: 'Why does a refusal message appear?',
        a: 'For example because you are trying to deactivate yourself, or to touch an administrator without being one. The message shown gives the reason.'
      }
    ],
    permissions: {
      note: '"Deactivate team members" to deactivate, "Edit team members" to activate.'
    },
    related: [{ label: 'Team members', helpId: 'administration.equipe.collaborateurs' }],
    keywords: ['status', 'deactivate', 'activate', 'role', 'last sign-in', 'export']
  },

  // ------------------------------------------------------------------ Team member record
  {
    id: 'administration.equipe.collaborateur-detail',
    kind: 'page',
    title: 'Team member record',
    summary: "View a team member's information, change their roles, reset their password or end their open sessions.",
    purpose:
      'This record is used to adjust the rights of a person on the team and to react to access problems (forgotten password, lost device).',
    steps: [
      {
        title: 'Check the information',
        detail: '"Team member details" card: e-mail, name, status, last sign-in.'
      },
      {
        title: 'Tick the roles',
        detail: 'Tick or untick the roles offered, then click "Save roles".'
      },
      {
        title: 'Act on the account',
        detail: 'Under "Actions": "Reset the password" or "Revoke the sessions", with a confirmation.'
      }
    ],
    consequences: [
      "Saving the roles replaces all of the person's roles with your selection.",
      '"Reset the password" sends a link by e-mail and signs the person out.',
      '"Revoke the sessions" signs the person out of all their devices.'
    ],
    faq: [
      {
        q: 'Can I change my own roles?',
        a: 'No, the application refuses: nobody changes their own roles.'
      },
      {
        q: 'Where do I deactivate or reactivate the account?',
        a: 'From the team members list, with the "Deactivate" and "Activate" icons of the row.'
      },
      {
        q: 'Why is the status shown in English for a deactivated team member?',
        a: 'This is a known display flaw of this screen: the word "DISABLED" in capitals may appear instead of "Deactivated".'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Agency manager'],
      note: 'Opening the record requires "View team members"; changing roles, resetting the password and revoking sessions require "Edit team members".'
    },
    related: [
      { label: "Team member's roles", helpId: 'administration.equipe.collaborateur-detail.roles' },
      { label: 'Actions on the account', helpId: 'administration.equipe.collaborateur-detail.actions' },
      { label: 'Team members', to: '/tenant/:tenantId/collaborators' }
    ],
    keywords: ['record', 'detail', 'roles', 'password', 'sessions', 'rights', 'permissions']
  },
  {
    id: 'administration.equipe.collaborateur-detail.informations',
    kind: 'section',
    title: 'Team member information',
    summary: "This card shows the person's e-mail, full name, status and last sign-in. It is read-only.",
    howToRead: {
      notes: [
        'Status: "Active", "Invitation pending" or "Deactivated".',
        'Last sign-in: date and time, or "Never".',
        'The name and e-mail cannot be changed here.'
      ]
    },
    faq: [
      {
        q: "How do I correct a team member's name or e-mail?",
        a: 'This screen does not allow it.'
      },
      {
        q: 'What does "—" mean in "Full name"?',
        a: 'No name is on file for this account.'
      },
      {
        q: 'Why "Never" for the last sign-in?',
        a: 'The person has not signed in with this account yet.'
      }
    ],
    permissions: { note: 'Requires "View team members".' },
    related: [{ label: 'Team member record', helpId: 'administration.equipe.collaborateur-detail' }],
    keywords: ['information', 'e-mail', 'name', 'status']
  },
  {
    id: 'administration.equipe.collaborateur-detail.roles',
    kind: 'section',
    title: "Team member's roles",
    summary: 'A role gives the person a set of rights in the agency. Tick the roles you want, then click "Save roles".',
    purpose:
      'The roles offered are those provided for agencies. Under each name, a sentence describes what the role allows.',
    howToRead: {
      notes: [
        'Agency administrator: full management (settings, team members, CRM, properties, rentals, billing). The screen may add the word "tenant" to this name.',
        'Agency manager: management rights without changing billing. The screen may add the word "tenant" to this name.',
        'Agent: limited rights, properties and visits, contacts and deals. The screen may add the word "tenant" to this name.',
        'Accountant: billing and accounting information. The screen may add the word "tenant" to this name.',
        'Storekeeper: receives, issues, transfers and counts stock, without seeing values or accounting.',
        'Site manager: counts the stock of their sites, notably by WhatsApp, without validating the inventory or seeing values.'
      ]
    },
    steps: [
      { title: 'Tick the roles', detail: 'A person can have several roles.' },
      {
        title: 'Save',
        detail: 'Click "Save roles". The message "Roles updated" confirms it.'
      }
    ],
    consequences: [
      'The previous roles are replaced by your selection: whatever is unticked is removed.',
      'The new rights apply to the person right away.',
      'Giving or removing the administrator role is reserved for an administrator of the agency.',
      'The agency always keeps at least one active administrator: removing the role from the last one is refused.',
      "The change is recorded in the agency's activity log."
    ],
    faq: [
      {
        q: 'Why does the roles list show "Loading roles…"?',
        a: 'Roles load when the record opens. If the list stays empty, reload the page.'
      },
      {
        q: 'Can I change my own role?',
        a: 'No, it is refused. Ask another administrator.'
      },
      {
        q: 'Can a manager give the administrator role?',
        a: 'No. This action is reserved for administrators of the agency.'
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Agency manager'],
      note: 'Requires "Edit team members".'
    },
    related: [{ label: 'Team member record', helpId: 'administration.equipe.collaborateur-detail' }],
    keywords: ['role', 'rights', 'permissions', 'administrator', 'accountant', 'agent', 'storekeeper']
  },
  {
    id: 'administration.equipe.collaborateur-detail.actions',
    kind: 'section',
    title: 'Actions on the account',
    summary:
      'Two buttons help fix a team member\'s access: "Reset the password" and "Revoke the sessions". Each one asks for confirmation.',
    purpose: 'Use them when someone has forgotten their password, or when a device is lost or no longer safe.',
    steps: [
      {
        title: 'Choose the action',
        detail: 'Click "Reset the password" or "Revoke the sessions".'
      },
      { title: 'Confirm', detail: 'Validate in the window: "Reset" or "Revoke".' }
    ],
    consequences: [
      'Reset the password: an e-mail with a single-use link, valid for 24 hours, is sent to the person. They choose their new password themselves.',
      'As soon as the reset is done, their open sessions are closed. For an account shared with other agencies or the platform, their current password is not changed: only the link is sent.',
      'Revoke the sessions: the person is signed out of all their devices and must sign in again. Their password does not change.',
      'Neither action can be undone. Both are recorded in the activity log.'
    ],
    faq: [
      {
        q: 'The person did not receive the e-mail, what should I do?',
        a: 'If sending fails, the application does not show it on screen. Check the address, then run the action again.'
      },
      {
        q: 'Can a deactivated account be reset?',
        a: 'No. Only an active member can have their password reset: reactivate them first.'
      },
      {
        q: 'Can I sign an administrator out?',
        a: "Only an administrator of the agency can. A super-administrator's sessions cannot be revoked from an agency."
      }
    ],
    permissions: {
      roles: ['Agency administrator', 'Agency manager'],
      note: 'Requires "Edit team members".'
    },
    related: [{ label: 'Team member record', helpId: 'administration.equipe.collaborateur-detail' }],
    keywords: ['forgotten password', 'sign out', 'sessions', 'reset', 'security']
  },

  // ------------------------------------------------------------------ Invite a team member
  {
    id: 'administration.equipe.inviter',
    kind: 'page',
    title: 'Invite a team member',
    summary: "Enter the person's e-mail address and choose their roles. They receive a link to join your agency.",
    purpose:
      'This is how you add someone to the team. The person chooses their own password when accepting the invitation.',
    steps: [
      { title: 'Enter the e-mail', detail: '"Email" field: a valid address, required.' },
      {
        title: 'Choose the roles',
        detail: 'Click a role card to tick it. At least one role is required.'
      },
      {
        title: 'Send',
        detail: 'Click "Send the invitation". You then land on the "Invitations" screen.'
      }
    ],
    consequences: [
      'An e-mail is sent with an acceptance link. It states the agency, the roles and the deadline.',
      'If the address matches a contact of your agency with a phone number and WhatsApp consent, the link may also be sent to them by WhatsApp.',
      'The invitation is valid for 7 days.',
      'If the e-mail could not be sent, the invitation is still created: a warning is shown, use "Resend" on the "Invitations" screen.',
      'On acceptance, the person receives the chosen roles; a new account asks for a password.'
    ],
    faq: [
      {
        q: 'Why is the invitation refused?',
        a: 'Either a pending invitation already exists for this address, or the person is already a member, or your agency is no longer active. The message shown gives the reason.'
      },
      {
        q: 'The person is deactivated: can I invite them again?',
        a: 'No. Reactivate them from the team members list.'
      },
      {
        q: 'Who can invite an administrator?',
        a: 'Only administrators of the agency. A manager cannot give this role.'
      },
      {
        q: 'The person already has an ImmoTopia account, what happens?',
        a: 'They must be signed in with that account to accept. Their password is not changed.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      note: 'Requires "Create team members".'
    },
    related: [
      { label: 'Roles', helpId: 'administration.equipe.inviter.roles' },
      { label: 'Pending invitations', helpId: 'administration.equipe.invitations' }
    ],
    keywords: ['invite', 'add', 'new employee', 'invite by e-mail', 'team'],
    tour: {
      steps: [
        {
          target: 'inviter-email',
          title: 'The e-mail address',
          description: "Enter the person's address: this is where the invitation link will be sent."
        },
        {
          target: 'inviter-roles',
          title: 'The roles',
          description: "Click a card to tick it. The person's rights depend on the roles chosen."
        },
        {
          target: 'inviter-envoyer',
          title: 'Send the invitation',
          description: 'The button stays greyed out until a role is ticked.'
        }
      ]
    }
  },
  {
    id: 'administration.equipe.inviter.roles',
    kind: 'section',
    title: 'Roles of the invited person',
    summary:
      'Each card is a role, with a short description of its rights. Tick one or more roles: at least one is required.',
    howToRead: {
      notes: [
        'Common roles: Agency administrator, Agency manager, Agent, Accountant, Storekeeper, Site manager.',
        'The screen still shows some names with the word "tenant" (for example "Agency manager tenant"): it is the same role.',
        'A ticked card is outlined in blue.'
      ]
    },
    steps: [
      { title: 'Read the description', detail: 'It sums up what the role allows.' },
      { title: 'Tick', detail: 'Click the card or the checkbox.' }
    ],
    consequences: [
      'The roles are given to the person when they accept the invitation, not before.',
      'The roles can be changed afterwards from their record.'
    ],
    faq: [
      {
        q: 'The list is empty or in error, what should I do?',
        a: 'Use the "Try again" or "Reload" button shown under the message.'
      },
      {
        q: 'Which role for an accountant?',
        a: '"Accountant": billing and accounting information of the agency.'
      },
      {
        q: 'Can I tick several roles?',
        a: 'Yes, the rights add up.'
      }
    ],
    permissions: { note: 'Giving the administrator role is reserved for administrators of the agency.' },
    related: [{ label: 'Invite a team member', helpId: 'administration.equipe.inviter' }],
    keywords: ['role', 'rights', 'administrator', 'agent', 'accountant']
  },

  // ------------------------------------------------------------------ Pending invitations
  {
    id: 'administration.equipe.invitations',
    kind: 'page',
    title: 'Invitations',
    summary:
      'Follow the invitations sent to your future team members: pending, accepted, revoked or expired. You can resend or revoke a pending invitation.',
    purpose: 'This screen is used to remind someone who has not replied, or to cancel an invitation sent by mistake.',
    steps: [
      {
        title: 'Find an invitation',
        detail: '"Search" by e-mail address, "Status" filter, "Invitation date" filter.'
      },
      { title: 'Resend', detail: '"Resend" icon on a pending invitation, then "Yes".' },
      { title: 'Revoke', detail: '"Revoke" icon, then "Yes".' },
      { title: 'Invite someone else', detail: '"New invitation" button.' }
    ],
    consequences: [
      'Resending sends a new e-mail with a new link, valid for 7 days from that moment. The old link stops working once the new e-mail has gone out.',
      'Revoking cancels the invitation: the link stops working. No e-mail is sent to the person and the action cannot be undone. You will need to create a new invitation.'
    ],
    faq: [
      {
        q: 'The invitation has expired, how do I send it again?',
        a: 'The buttons no longer exist for an expired invitation. Create a new invitation with "New invitation".'
      },
      {
        q: 'Why are there no actions on some rows?',
        a: 'Only "Pending" invitations whose date has not passed can be resent or revoked.'
      },
      {
        q: 'Where do I see the person once the invitation is accepted?',
        a: 'On the "Team members" screen.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      note: 'Viewing the list requires "View team members"; resending requires "Create team members"; revoking requires "Edit team members".'
    },
    related: [
      { label: 'Invitations table', helpId: 'administration.equipe.invitations.tableau' },
      { label: 'Invite a team member', helpId: 'administration.equipe.inviter' }
    ],
    keywords: ['invitation', 'resend', 'revoke', 'cancel', 'link', 'remind']
  },
  {
    id: 'administration.equipe.invitations.tableau',
    kind: 'table',
    title: 'Invitations table',
    summary:
      'Each row is an invitation sent. The table shows the e-mail, the status, the sending date and the expiry date.',
    howToRead: {
      columns: [
        { key: 'email', label: 'Email', description: 'The address of the invited person.' },
        { key: 'status', label: 'Status', description: 'Where the invitation stands (see the statuses below).' },
        { key: 'invitedAt', label: 'Invitation date', description: 'The day the invitation was created.' },
        {
          key: 'expiresAt',
          label: 'Expiry',
          description: 'The last day the link is valid. A resend pushes this date back by 7 days.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Resend" and "Revoke", only for an invitation that is pending and still valid.'
        }
      ],
      statuses: [
        {
          value: 'PENDING',
          label: 'Pending',
          description: 'The person has not accepted yet and the link is valid.'
        },
        { value: 'ACCEPTED', label: 'Accepted', description: 'The person has joined the agency.' },
        { value: 'REVOKED', label: 'Revoked', description: 'The invitation was cancelled: the link no longer works.' },
        {
          value: 'EXPIRED',
          label: 'Expired',
          description:
            'The deadline passed without acceptance. A pending invitation whose date has passed is shown as "Expired".'
        }
      ],
      notes: ['The "Invitation date" filter applies to the "Invitation date" column.']
    },
    steps: [
      { title: 'Filter', detail: 'By e-mail, status or date.' },
      { title: 'Act', detail: '"Resend" or "Revoke" icons at the end of the row, then "Yes".' }
    ],
    consequences: [
      '"Resend" sends a fresh e-mail and extends validity by 7 days.',
      '"Revoke" is final: create a new invitation to invite the person again.',
      'If the team member who invited is deactivated, their pending invitations become "Revoked".'
    ],
    faq: [
      {
        q: 'What happens if the resend fails?',
        a: 'The application shows an error and the old link stays valid.'
      },
      {
        q: 'Do accepted invitations stay in the list?',
        a: 'Yes, with the status "Accepted".'
      },
      {
        q: 'Can I export the list?',
        a: "Yes, with the table's export button."
      }
    ],
    permissions: {
      note: '"Create team members" to resend, "Edit team members" to revoke.'
    },
    related: [{ label: 'Invitations', helpId: 'administration.equipe.invitations' }],
    keywords: ['status', 'expiry', 'resend', 'revoke', 'export']
  },

  // ------------------------------------------------------------------ My profile
  {
    id: 'administration.equipe.profil',
    kind: 'page',
    title: 'My profile',
    summary:
      'This page recalls your account information and lets you choose the application language. A link also takes you to the password change.',
    purpose: 'It is personal: everyone sees their own account, whichever agency they belong to.',
    steps: [
      {
        title: 'Check the account',
        detail: '"Account information" card: e-mail, full name, creation date and last update.'
      },
      { title: 'Choose the language', detail: '"Language" section: Français, English or العربية.' },
      {
        title: 'Change the password',
        detail: 'Click "Change password": you land on the forgotten-password page.'
      }
    ],
    consequences: [
      'The chosen language applies to the interface and to the e-mails sent to you. It follows you from one device to another.',
      'The password change goes through a link received by e-mail.'
    ],
    faq: [
      {
        q: 'Can I change my name or e-mail here?',
        a: 'No, this information is read-only.'
      },
      {
        q: 'What does the "Email verified" mention mean?',
        a: 'It appears when your e-mail address has been verified.'
      },
      {
        q: 'Why am I "User" when I run my agency?',
        a: 'The "Administrator" mention is reserved for platform administrators. Your rights in the agency depend on your roles.'
      }
    ],
    permissions: { note: 'Any signed-in user can open their profile page.' },
    related: [
      { label: 'Account information', helpId: 'administration.equipe.profil.informations' },
      { label: 'Language', helpId: 'administration.equipe.profil.langue' }
    ],
    keywords: ['profile', 'account', 'language', 'password', 'e-mail', 'avatar']
  },
  {
    id: 'administration.equipe.profil.informations',
    kind: 'section',
    title: 'Account information',
    summary:
      'This card shows your e-mail, your full name, the date your account was created and the date of its last update.',
    howToRead: {
      notes: [
        'At the top, a badge shows "Administrator" (platform administrator) or "User".',
        'The "Email verified" badge appears when your address has been verified.',
        'Dates are written out in full, in the chosen language.'
      ]
    },
    faq: [
      {
        q: 'Why can I only read this information?',
        a: 'This screen offers no editing.'
      },
      {
        q: 'What does "—" next to "Full name" mean?',
        a: 'No name is on file for your account.'
      },
      {
        q: 'What is "Last updated" for?',
        a: 'It is the date of the last change to your account.'
      }
    ],
    related: [{ label: 'My profile', helpId: 'administration.equipe.profil' }],
    keywords: ['account', 'e-mail', 'name', 'creation date']
  },
  {
    id: 'administration.equipe.profil.langue',
    kind: 'section',
    title: 'Language',
    summary: 'Choose the application language: Français, English or العربية. The choice applies right away.',
    purpose:
      'The language applies to the interface and to the e-mails the application sends you. It is saved on your account and follows you from one device to another.',
    steps: [
      { title: 'Open the list', detail: 'Click the "Change language" list.' },
      { title: 'Choose', detail: 'Each language is written in its own language.' }
    ],
    consequences: [
      'With Arabic, the whole layout is mirrored, right to left.',
      'The choice is personal: it changes nothing for other team members.'
    ],
    faq: [
      {
        q: 'The language does not change, what should I do?',
        a: 'Wait for the loading shown in the list to finish, then reload the page if needed.'
      },
      {
        q: "Do my agency's documents change language?",
        a: 'The screen does not say: it only mentions the interface and your e-mails.'
      },
      {
        q: 'Can I go back to French?',
        a: 'Yes, at any time, with the same list.'
      }
    ],
    related: [{ label: 'My profile', helpId: 'administration.equipe.profil' }],
    keywords: ['language', 'French', 'English', 'Arabic', 'translation']
  }
];

export default entries;
