import type { HelpEntry } from '../../../types';

/** Zone « signatures » du module « locatif » (en). */
const entries: HelpEntry[] = [
  {
    id: 'locatif.signatures.liste',
    kind: 'page',
    title: 'Signatures',
    summary:
      "Follow all of your agency's electronic signature requests here: who has signed, who still has to sign, and until when. You can send reminders, cancel a request or download the document.",
    purpose:
      'A signature request sends a document (lease contract, mandate, inspection report, sale agreement, direct debit authorisation) to one or more people, who sign it online from a personal link. This screen gathers the requests for all these documents; sending is done from the document itself, for example the "Signatures" tab of a lease.',
    howToRead: {
      notes: [
        'The row of buttons under the title counts requests by status: "All", then one button per status. Clicking a button filters the table; the counts follow the search, type and period filters, but not the status you picked.',
        'You only see the document types your rights allow you to read (leases, management mandates, sales).'
      ]
    },
    steps: [
      {
        title: 'Spot the requests to follow',
        detail: 'Click "Sent" or "Partially signed" to see only requests that are still in progress.'
      },
      {
        title: 'Search',
        detail: 'Type a document title or a signer name, then narrow down by status, type or creation period.'
      },
      {
        title: 'Open the details',
        detail: 'Click the document title to see the signers and the history.'
      },
      {
        title: 'Remind or cancel',
        detail:
          'On a request in progress, "Re-run" sends the link again to signers who are waiting; "Cancel" closes the request after confirmation.'
      },
      {
        title: 'Download',
        detail:
          'The "Download" button gives the signed PDF when the request is "Signed", otherwise the PDF that was sent for signing.'
      }
    ],
    consequences: [
      'This screen does not create requests: to send a document for signature, open the document (lease, mandate, inspection report...) and use its send button.',
      'Cancelling is final: nobody can sign with the links already sent. You can then create a new request for the same document.',
      'When everyone has signed, a signed PDF is produced, with a signatures page and a "Signature certificate" page. The person who sent the request is notified by e-mail; they are also notified if a signer declines or if the request expires.'
    ],
    faq: [
      {
        q: 'Why can I not see some requests?',
        a: 'The list is limited to the document types you are allowed to view. Without access to deals, for example, you do not see sale agreements.'
      },
      {
        q: 'Why do I not have the "Re-run" and "Cancel" buttons?',
        a: 'They only appear on a request in progress ("Sent" or "Partially signed") and if you may edit the document concerned, for example "Edit leases" for a lease.'
      },
      {
        q: 'What happens when the due date has passed?',
        a: 'The request becomes "Expired" (updated automatically) and the links stop working. You then need to create a new request from the document.'
      },
      {
        q: 'A signer lost their link. What can I do?',
        a: 'Use "Re-run": a new link is sent to the signers who have not signed yet. Two reminders must be at least 10 minutes apart.'
      }
    ],
    permissions: {
      note: 'The "Signatures" menu appears if you have at least one of these rights: "View leases", "View properties" or "View deals". Each request is only visible if you can read its document type; reminding and cancelling require the right to edit the document ("Edit leases" for a lease). The screen itself is not tied to a plan, but each document type follows the plan of its module.'
    },
    related: [
      { label: 'How to read the requests table', helpId: 'locatif.signatures.liste.tableau' },
      { label: 'Details of a request', helpId: 'locatif.signatures.detail' },
      { label: 'Send a lease for signature', helpId: 'locatif.signatures.bail' },
      { label: 'The list of leases', helpId: 'locatif.baux.liste' }
    ],
    keywords: [
      'signature',
      'electronic signature',
      'sign',
      'get signed',
      'contract',
      'remind',
      'reminder',
      'cancel',
      'signed pdf',
      'signer',
      'expired'
    ]
  },
  {
    id: 'locatif.signatures.liste.tableau',
    kind: 'table',
    title: 'Signature requests table',
    summary:
      'Each row is a signature request of your agency, with its type, its status and how many signers have signed.',
    howToRead: {
      columns: [
        {
          key: 'title',
          label: 'Document',
          description: 'The title of the document to sign. Click it to open the details. Sortable column.'
        },
        {
          key: 'kind',
          label: 'Type',
          description:
            'The kind of document: lease contract, management mandate, sale mandate, inspection report, sale agreement or direct debit authorisation.'
        },
        {
          key: 'status',
          label: 'Status',
          description: 'Where the request stands (see the statuses below). Sortable column.'
        },
        {
          key: 'signers',
          label: 'Signers',
          description: 'The number of people who have signed out of the total, for example "1/2 signed".'
        },
        {
          key: 'createdAt',
          label: 'Created on',
          description: 'The date the request was sent. Sortable column; the most recent come first by default.'
        },
        {
          key: 'expiresAt',
          label: 'Due date',
          description:
            'The deadline to sign. After this date, a request in progress becomes "Expired". Sortable column.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            '"Download" is always offered. "Re-run" and "Cancel" only appear on a request in progress, if you have the right to edit.'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Draft',
          description: 'Request created but not yet sent to the signers.'
        },
        {
          value: 'SENT',
          label: 'Sent',
          description: 'The signers have received their link; nobody has signed yet.'
        },
        {
          value: 'PARTIALLY_SIGNED',
          label: 'Partially signed',
          description: 'Some of the signers have signed, the others are awaited.'
        },
        {
          value: 'COMPLETED',
          label: 'Signed',
          description: 'Everyone has signed. The signed PDF can be downloaded.'
        },
        {
          value: 'DECLINED',
          label: 'Rejected',
          description: 'A signer declined to sign; the request is closed.'
        },
        {
          value: 'EXPIRED',
          label: 'Expired',
          description: 'The due date passed before everyone had signed.'
        },
        {
          value: 'CANCELED',
          label: 'Cancelled',
          description: 'The request was cancelled, by the agency or automatically by the system.'
        }
      ],
      notes: [
        'The filters are: "Search" (document title or signer name), "Status", "Document type" and "Creation period".',
        'Only "Sent" and "Partially signed" are requests in progress: you can then remind or cancel.'
      ]
    },
    related: [
      { label: 'Overview of the screen', helpId: 'locatif.signatures.liste' },
      { label: 'Details of a request', helpId: 'locatif.signatures.detail' }
    ],
    keywords: ['signature status', 'signed', 'due date', 'download', 'pdf', 'declined', 'expired']
  },
  {
    id: 'locatif.signatures.detail',
    kind: 'section',
    title: 'Signature request details',
    summary:
      'The drawer shows the type, status and dates of the request, each signer with their state, then the history of events.',
    purpose:
      'Use it to know exactly who opened the document, who signed or declined, and what was done (sending, reminder, sealing). It keeps a record of how the signature went.',
    howToRead: {
      statuses: [
        {
          value: 'PENDING',
          label: 'Pending',
          description: 'The signer has not opened the document yet.'
        },
        {
          value: 'OPENED',
          label: 'Document opened',
          description: 'The signer opened their link but has not signed yet.'
        },
        {
          value: 'SIGNED',
          label: 'Signed',
          description: 'The signer has signed.'
        },
        {
          value: 'DECLINED',
          label: 'Declined',
          description: 'The signer declined to sign.'
        }
      ],
      notes: [
        'For each signer: their name, their role (Tenant, Co-tenant, Landlord, Agent, Principal, Seller...), the channel used (Email, WhatsApp, SMS or In person) and their partly hidden contact.',
        '"Completed on" only appears for a signed request. "Open the document" leads to the lease, sale agreement or sale mandate concerned; for an inspection report or a management mandate there is no link.',
        'The history lists events in order: request created, invitation sent or sending failed, document opened, verification code sent, wrong or locked, signature applied or declined, document sealed, reminder sent (manual or automatic), request cancelled or expired.',
        'The green "Audit trail intact" tag confirms the history has not been altered; the red "Audit trail tampered with" tag flags an anomaly to report to support.'
      ]
    },
    consequences: ['This drawer is read-only: nothing in it changes the request. To remind or cancel, use the table.'],
    faq: [
      {
        q: 'What is "Audit trail intact" for?',
        a: 'Each event of the signature is recorded after the previous ones. If the tag is green, the history is complete and has not been modified afterwards.'
      },
      {
        q: "Why is the signer's contact partly hidden?",
        a: 'To protect their details: you can recognise the address or number without it being shown in full.'
      },
      {
        q: 'A signer is still "Pending". What can I do?',
        a: 'Send a reminder from the table. If "Sign in the order of the list" is enabled, only the signer whose turn it is receives the reminder.'
      }
    ],
    permissions: {
      note: 'It opens for requests whose document type you can read (for example "View leases" for a lease contract).'
    },
    related: [
      { label: 'Overview of the screen', helpId: 'locatif.signatures.liste' },
      { label: 'Requests table', helpId: 'locatif.signatures.liste.tableau' }
    ],
    keywords: ['history', 'proof', 'log', 'signer', 'audit', 'certificate']
  },
  {
    id: 'locatif.signatures.bail',
    kind: 'section',
    title: 'Lease signatures',
    summary:
      'This tab of a lease sends the lease contract for online signature and shows where each signer stands. It keeps the history of the lease requests.',
    purpose:
      'The contract is sent as a PDF to the tenant, co-tenants and the landlord. Each one signs from their phone or computer, without an account. Only one request can be in progress at a time for a lease.',
    howToRead: {
      statuses: [
        { value: 'SENT', label: 'Sent', description: 'Links sent, nobody has signed yet.' },
        {
          value: 'PARTIALLY_SIGNED',
          label: 'Partially signed',
          description: 'Some of the signers have signed.'
        },
        { value: 'COMPLETED', label: 'Signed', description: 'Everyone has signed: the "Signed PDF" is available.' },
        { value: 'DECLINED', label: 'Rejected', description: 'A signer declined; the request is closed.' },
        { value: 'EXPIRED', label: 'Expired', description: 'The due date has passed.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'The request was cancelled.' }
      ],
      notes: [
        'Each request is a card: its status, the sending date and, while it is in progress, the expiry date. Below, each signer with their role, channel and state (Pending, Document opened, Signed, Declined), and the signing date.',
        '"Source PDF" downloads the contract that was sent; "Signed PDF" appears when the request is "Signed".'
      ]
    },
    steps: [
      {
        title: 'Send',
        detail:
          'Click "Send for signature": the sending window opens with the tenant, co-tenants and landlord already suggested.'
      },
      {
        title: 'Complete the signers',
        detail: 'For a co-tenant, enter their name and contact. See the help of the sending window.'
      },
      {
        title: 'Follow',
        detail:
          'The request card updates as signatures come in; all requests can also be followed in the "Signatures" menu.'
      },
      {
        title: 'Remind or cancel',
        detail:
          '"Re-run" sends the link again to signers who have not signed; "Cancel the request" closes the request after confirmation.'
      },
      {
        title: 'Sign in person',
        detail:
          'For a signer on the "In person" channel, the "Sign in person" button opens the signature on your screen, in front of them.'
      },
      {
        title: 'Get the signed contract',
        detail: 'When the request is "Signed", click "Signed PDF".'
      }
    ],
    consequences: [
      "Sending uses one signature from your subscription's monthly quota. If the quota is reached, sending is refused and a message suggests adding the signatures extension.",
      'The send button is disabled while a request is in progress: cancel it first to create another.',
      'The signer receives a personal link (by e-mail, SMS or WhatsApp) then a one-time code to confirm their identity, except for in-person signing. Once everyone has signed, a sealed PDF with a signatures page and a "Signature certificate" is produced.',
      'Cancelling is final for that request; the links already sent stop working.'
    ],
    faq: [
      {
        q: 'Why is the "Send for signature" button greyed out?',
        a: 'Either a request is already in progress for this lease (cancel it or wait for it to finish), or electronic signature is not available for this document.'
      },
      {
        q: 'I do not see the send button or "Re-run". Why?',
        a: 'These actions require the "Edit leases" right. Without it you can only view the history and the PDFs.'
      },
      {
        q: 'Does the signature have legal value?',
        a: 'It is a simple electronic signature: personal link, one-time code, consent, date, network address and document fingerprint are recorded. Its exact scope depends on the applicable law; ask a lawyer for a specific case.'
      },
      {
        q: 'The contract changed after sending. What should I do?',
        a: 'Cancel the request in progress, then send a new one with the updated contract: a signer signs the document as it was sent.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Viewing the tab requires "View leases"; sending, reminding, cancelling and signing in person require "Edit leases".'
    },
    related: [
      { label: 'The send-for-signature window', helpId: 'locatif.signatures.envoi' },
      { label: 'Follow all signatures', helpId: 'locatif.signatures.liste' },
      { label: 'The lease page', helpId: 'locatif.baux.fiche' }
    ],
    keywords: [
      'sign the lease',
      'lease contract',
      'electronic signature',
      'signed pdf',
      'send for signature',
      'in person',
      'reminder'
    ]
  },
  {
    id: 'locatif.signatures.envoi',
    kind: 'section',
    title: 'Send for signature',
    summary:
      'This window prepares the list of signers and how to reach them, then sends the document to sign. The document sent is the one of the screen you are on (for example the lease contract).',
    purpose:
      'You choose who must sign, with which role, through which channel, in which order and for how long. There is no document to pick: the PDF is produced automatically from the lease, mandate or sale agreement that is open.',
    howToRead: {
      notes: [
        'Role: Tenant, Co-tenant, Landlord, Agent, Principal, Seller, Co-seller or Buyer.',
        'Channel: "Email", "WhatsApp", "SMS" or "In person". Depending on the document type, some channels are not offered (never "In person" for a direct debit authorisation).',
        'WhatsApp and SMS are only offered for a signer linked to a CRM contact; WhatsApp also requires that this contact has accepted WhatsApp, and SMS requires SMS to be enabled on the platform.',
        '"Sign in the order of the list": each signer receives their link only once the previous one has signed.',
        '"Valid for": validity in days, from 1 to 30, 14 by default.'
      ]
    },
    steps: [
      {
        title: 'Check the signers',
        detail: 'Known people are pre-filled; correct the name or contact if needed.'
      },
      {
        title: 'Choose the role and channel',
        detail: 'For each row, choose the role then the sending channel.'
      },
      {
        title: 'Enter the contact',
        detail:
          'Email address, phone number or WhatsApp number depending on the channel. No contact is asked for "In person".'
      },
      {
        title: 'Add or remove',
        detail: '"Add a signer" adds a row; the bin icon removes one (at least one is required).'
      },
      {
        title: 'Set the order and duration',
        detail: 'Turn on "Sign in the order of the list" if needed and set the validity period.'
      },
      {
        title: 'Send',
        detail: 'The "Send" button stays greyed out while a name or contact is missing.'
      }
    ],
    consequences: [
      'Each signer (except "In person") receives a message with a personal link to the signing page, valid until the due date.',
      'Before signing, the person receives a 6-digit code on the same contact; it is valid for a few minutes and the number of attempts is limited. They then choose to type their name or draw their signature, and may also decline with an optional reason.',
      'For "In person", no message is sent: the signature opens right away on your screen for the first signer concerned, without a code. This channel is not allowed for every document.',
      "Sending counts as one signature in the agency's monthly quota. If no link could be sent, the request is cancelled.",
      'Automatic reminders may go out before the due date (by default 3 days then 1 day before, depending on the platform configuration); you can also remind manually.'
    ],
    faq: [
      {
        q: 'Why are WhatsApp or SMS greyed out for a signer?',
        a: 'These channels require a CRM contact with a known number: link the signer to a contact, otherwise use e-mail. SMS may also be disabled on the platform.'
      },
      {
        q: 'Can two requests be sent for the same document?',
        a: 'No, only one request in progress at a time. Cancel the current request before sending a new one.'
      },
      {
        q: 'What happens if the signature quota is reached?',
        a: 'Sending is refused with a message suggesting you add the "Electronic signatures — block of 50" extension from your subscription.'
      },
      {
        q: 'When should I use "In person"?',
        a: 'When the signer is in front of you: they sign on your screen, without a link or code. Their identity is therefore not checked by a code.'
      }
    ],
    permissions: {
      note: 'Sending requires the right to edit the document concerned (for example "Edit leases") and an available signature quota.'
    },
    related: [
      { label: 'Lease signatures', helpId: 'locatif.signatures.bail' },
      { label: 'Follow all signatures', helpId: 'locatif.signatures.liste' }
    ],
    keywords: ['send for signature', 'signer', 'channel', 'whatsapp', 'sms', 'code', 'order', 'validity', 'in person']
  }
];

export default entries;
