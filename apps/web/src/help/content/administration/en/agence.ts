import type { HelpEntry } from '../../../types';

/** "Agency" zone of the "administration" module (en): agency settings. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Agency settings
  {
    id: 'administration.agence.parametres',
    kind: 'page',
    title: 'Agency settings',
    summary:
      'Enter your agency identity here: logo, colour, signature, stamp, name, contact details and address. This information is reused in the documents the application generates.',
    purpose:
      'Lease contracts, receipts and other generated documents show your agency name, email, phone and address exactly as entered here. The "Owner portal" card also controls what your owners see in their space.',
    steps: [
      {
        title: 'Upload the logo',
        detail:
          '"Logo and brand colour" card, "Upload a logo" button. PNG, JPEG or WebP, 2 MB at most. The logo is saved immediately.'
      },
      {
        title: 'Choose the brand colour',
        detail: 'Enter a colour code in #RRGGBB format, for example #1677FF.'
      },
      {
        title: 'Add the signature and the stamp',
        detail: '"Signature and stamp for documents" card. Each image is saved as soon as it is sent.'
      },
      {
        title: 'Complete the agency information',
        detail:
          'Agency name (required), legal name, email, phone, address, city, country and website (an address starting with http:// or https://).'
      },
      {
        title: 'Save',
        detail:
          'Click "Save" at the bottom of the page. The logo, signature, stamp and owner portal settings do not wait for it: they are saved the moment you change them.'
      },
      {
        title: 'Set up the owner portal',
        detail: '"Owner portal" card: each switch is saved as soon as you flip it.'
      }
    ],
    consequences: [
      'The saved name, email, phone and address are automatically reused in generated documents (lease contracts, receipts, etc.). Make sure they are complete and up to date.',
      '"Remove" on the logo, or removing the signature or stamp, takes effect immediately: there is no confirmation.',
      'Owner portal settings immediately change what your owners see.'
    ],
    faq: [
      {
        q: 'Why can I not save?',
        a: 'The agency name is required, the email must be valid, the colour must be in #RRGGBB format and the website must start with http:// or https://. If the message mentions rights, ask your agency administrator for them.'
      },
      {
        q: 'My logo is rejected. What can I do?',
        a: 'Use a PNG, JPEG or WebP image of 2 MB at most. For the signature and stamp: PNG or JPEG, 2 MB at most, 3000 × 3000 pixels at most; large images are automatically reduced to 800 pixels.'
      },
      {
        q: 'What are the signature and stamp used for?',
        a: 'They are the default identity on the documents of a co-ownership that has no principal.'
      },
      {
        q: 'Where do I change fees, VAT or online payment?',
        a: 'In the financial settings, opened from the agency settings menu.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      note: 'Opening the page requires the right to view agency settings; saving requires the right to edit them.'
    },
    related: [
      { label: 'Financial settings', helpId: 'administration.agence.finance' },
      { label: 'Owner portal', helpId: 'administration.agence.parametres.portail-proprietaire' },
      { label: 'Financial settings (screen)', to: '/tenant/:tenantId/settings/finance' }
    ],
    keywords: ['agency', 'logo', 'identity', 'contact details', 'address', 'stamp', 'signature', 'colour', 'settings']
  },
  {
    id: 'administration.agence.parametres.portail-proprietaire',
    kind: 'section',
    title: 'Owner portal',
    summary:
      'Choose what your owners see in the "My patrimony" tab of their portal. Each switch is saved as soon as you flip it.',
    purpose:
      'The owner portal can show a patrimony view: valuation, yields, loans, works and documents. You can hide it entirely or section by section.',
    howToRead: {
      notes: [
        '"Show the patrimony view" is the main switch. When it is off, the other five are greyed out.',
        'The five sections are: "Valuation and capital gain", "Yields", "Loans", "Works" and "Documents".',
        'As long as nothing has been saved, everything is shown.'
      ]
    },
    steps: [
      { title: 'Turn the view on or off', detail: 'Flip "Show the patrimony view".' },
      { title: 'Choose the sections', detail: 'Flip the switches of the sections to show or hide.' },
      { title: 'Check the message', detail: 'The message "Setting updated" confirms each save.' }
    ],
    consequences: [
      'Hiding "Loans" also removes the net-net yield, which would reveal the monthly payments.',
      'The change is immediate: there is no "Save" button on this card.',
      'Without the right to edit settings, the card becomes read-only after the server refuses a change.'
    ],
    faq: [
      {
        q: 'Do my owners still see their rents if I turn off the patrimony view?',
        a: 'This setting only affects the "My patrimony" tab of their portal. The screen says nothing about the other tabs.'
      },
      {
        q: 'Why are the switches greyed out?',
        a: 'Either "Show the patrimony view" is off, or you do not have permission to edit these settings.'
      },
      {
        q: 'Can I undo a change?',
        a: 'Yes, flip the switch again: it is saved again right away.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      note: 'Editing these settings requires the right to edit agency settings.'
    },
    related: [{ label: 'Agency settings', helpId: 'administration.agence.parametres' }],
    keywords: ['owner portal', 'patrimony', 'hide', 'yield', 'loan', 'valuation']
  },
  {
    id: 'administration.agence.parametres.logo',
    kind: 'section',
    title: 'Logo and brand colour',
    summary:
      'Add your agency logo and brand colour. The logo is saved as soon as it is sent; the colour is saved with the page "Save" button.',
    purpose: 'These items give your agency a visual identity in the application.',
    steps: [
      { title: 'Upload a logo', detail: 'Click "Upload a logo" and choose an image.' },
      { title: 'Replace or remove', detail: 'Upload another image to replace the logo, or click "Remove".' },
      { title: 'Enter the colour', detail: '#RRGGBB format. A colour square shows the result.' },
      { title: 'Save the colour', detail: 'Click "Save" at the bottom of the page.' }
    ],
    consequences: [
      'The logo takes effect immediately; "Remove" deletes it without asking for confirmation.',
      'The colour only takes effect after "Save".'
    ],
    faq: [
      {
        q: 'Which formats and sizes?',
        a: 'PNG, JPEG or WebP, 2 MB at most. Any other format is refused with a message.'
      },
      {
        q: 'Which format for the colour?',
        a: 'A six-character code preceded by #, for example #1677FF. Otherwise the form shows "Invalid colour (#RRGGBB)".'
      },
      {
        q: 'Does the logo appear on documents right away?',
        a: 'The logo is saved as soon as it is sent. Its use on each type of document has not been checked here.'
      }
    ],
    related: [{ label: 'Agency settings', helpId: 'administration.agence.parametres' }],
    keywords: ['logo', 'colour', 'brand', 'image', 'visual identity']
  },
  {
    id: 'administration.agence.parametres.signature-cachet',
    kind: 'section',
    title: 'Signature and stamp for documents',
    summary:
      'Add the image of the agency signature and of its stamp. Each image is saved as soon as it is sent, without clicking "Save".',
    purpose:
      'These images are the default identity on the documents of a co-ownership that has no principal. They are private: the application displays them for you but never makes them public.',
    steps: [
      { title: 'Upload', detail: 'Under "Signature" or "Stamp", click "Upload" and choose an image.' },
      { title: 'Replace', detail: 'The button becomes "Replace" once an image exists.' },
      { title: 'Remove', detail: 'Click "Remove": the image is deleted immediately.' }
    ],
    consequences: [
      'Large images are automatically reduced to 800 pixels before sending.',
      'Removing an image is immediate and without confirmation.'
    ],
    faq: [
      {
        q: 'Which images are accepted?',
        a: 'PNG or JPEG, 2 MB at most, 3000 × 3000 pixels at most.'
      },
      {
        q: 'Do I need to click "Save"?',
        a: 'No, each image is saved as soon as it is sent; the page "Save" button only concerns the form.'
      },
      {
        q: 'Can everyone see these images?',
        a: 'No, they are private: the application loads them securely for the preview.'
      }
    ],
    related: [{ label: 'Agency settings', helpId: 'administration.agence.parametres' }],
    keywords: ['signature', 'stamp', 'seal', 'co-ownership', 'principal']
  },
  {
    id: 'administration.agence.parametres.informations',
    kind: 'section',
    title: 'General information',
    summary: 'Enter the name of your agency and, if you wish, its legal name. The name is required.',
    purpose: 'The name and legal name are reused in the documents generated by the application.',
    steps: [
      { title: 'Enter the agency name', detail: 'Required field.' },
      { title: 'Enter the legal name', detail: 'Optional field: the official name of your company.' },
      { title: 'Save', detail: 'Click "Save" at the bottom of the page.' }
    ],
    consequences: ['The information applies to documents generated after saving.'],
    faq: [
      {
        q: 'What happens if I leave the name empty?',
        a: 'The form shows "The name is required" and nothing is saved.'
      },
      {
        q: 'What is the difference between the name and the legal name?',
        a: 'The name is the one you use day to day; the legal name is the official name of the company, and is optional.'
      },
      {
        q: 'Where do I enter the agency website?',
        a: 'In the "Additional information" card, "Website" field. The address must start with http:// or https://.'
      }
    ],
    related: [{ label: 'Agency settings', helpId: 'administration.agence.parametres' }],
    keywords: ['name', 'agency', 'legal name', 'company name', 'website']
  },
  {
    id: 'administration.agence.parametres.contact',
    kind: 'section',
    title: 'Contact details',
    summary: 'Enter the email and phone number of your agency. They are reused in generated documents.',
    purpose:
      'Your tenants and owners find these contact details on the documents the application generates for your agency.',
    steps: [
      { title: 'Enter the contact email', detail: 'A valid email, for example contact@agence.com.' },
      { title: 'Enter the contact phone', detail: 'For example +225 XX XX XX XX XX.' },
      { title: 'Save', detail: 'Click "Save" at the bottom of the page.' }
    ],
    consequences: ['The email and phone are used in documents generated after saving.'],
    faq: [
      {
        q: 'Why "Invalid email"?',
        a: 'The address format is not recognised: check the @ and the domain name.'
      },
      {
        q: 'Are these fields required?',
        a: 'No, but they are used in documents: it is better to fill them in.'
      },
      {
        q: 'Is this email used to sign in?',
        a: 'No, it is the agency contact email shown on documents, not a sign-in identifier.'
      }
    ],
    related: [{ label: 'Agency settings', helpId: 'administration.agence.parametres' }],
    keywords: ['email', 'phone', 'contact', 'contact details']
  },
  {
    id: 'administration.agence.parametres.adresse',
    kind: 'section',
    title: 'Address',
    summary: 'Enter the full address, city and country of your agency. The address is reused in generated documents.',
    purpose: 'The address appears in the documents the application generates for your agency.',
    steps: [
      { title: 'Enter the full address', detail: 'Street, neighbourhood, landmark: as you want it on documents.' },
      { title: 'Enter the city and country', detail: 'Two free, optional fields.' },
      { title: 'Save', detail: 'Click "Save" at the bottom of the page.' }
    ],
    consequences: ['Documents generated after saving use the new address.'],
    faq: [
      {
        q: 'Are all fields required?',
        a: 'No, no field in this card is required.'
      },
      {
        q: 'We have moved. What should I do?',
        a: 'Change the address here then click "Save": the next documents will use it.'
      },
      {
        q: 'Do old documents change?',
        a: 'The screen does not say: to be safe, assume only new documents use the new address.'
      }
    ],
    related: [{ label: 'Agency settings', helpId: 'administration.agence.parametres' }],
    keywords: ['address', 'city', 'country', 'head office']
  },

  // ------------------------------------------------------------------ Financial settings
  {
    id: 'administration.agence.finance',
    kind: 'page',
    title: 'Financial settings',
    summary:
      'Set your agency tax, management fees, accounting accounts, penalties, withholding tax and online payment. Management statements rely on these settings.',
    purpose:
      'Each management statement calculation rereads these settings and freezes a copy: changing a rate here does not change a statement already produced. Some cards only appear if your subscription includes rental management.',
    steps: [
      {
        title: 'Check the banner',
        detail: 'If a yellow banner says the settings have never been saved, the values shown are suggestions.'
      },
      { title: 'Set the tax', detail: 'VAT, rate and taxpayer account number.' },
      { title: 'Set the management fees', detail: 'Percentage or flat fee per installment (rental management).' },
      { title: 'Check the accounting accounts', detail: 'To be validated by your accountant.' },
      { title: 'Choose what happens to penalties and withholding tax', detail: 'Rental management only.' },
      {
        title: 'Save',
        detail:
          'The form "Save" button covers these cards. The cards at the bottom (online payment, terms by owner, collaborator commission) have their own buttons.'
      }
    ],
    consequences: [
      'Collections already made keep the fees of the terms in force at the time.',
      'As long as the fee rate is not set, management statements deduct no fees.',
      'Without the right to edit agency settings, the form is read-only and the "Save" button does not appear.'
    ],
    faq: [
      {
        q: 'Why are some cards missing?',
        a: 'Fees, penalties and withholding tax only appear if your subscription includes rental management. Terms by owner and collaborator commission are also hidden with a Patrimoine pack alone.'
      },
      {
        q: 'Will a statement already produced change?',
        a: 'No: management statements keep a frozen copy.'
      },
      {
        q: 'Who can edit these settings?',
        a: 'You need the right to edit agency settings. Without it, you can only view.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      note: 'Viewing requires the right to view agency settings; saving requires the right to edit them.'
    },
    related: [
      { label: 'Management fees', helpId: 'administration.agence.finance.honoraires' },
      { label: 'Online payment', helpId: 'administration.agence.finance.paiement-en-ligne' },
      { label: 'Agency settings', helpId: 'administration.agence.parametres' }
    ],
    keywords: [
      'finance',
      'fees',
      'VAT',
      'accounts',
      'penalties',
      'withholding',
      'management statement',
      'financial settings'
    ]
  },
  {
    id: 'administration.agence.finance.fiscalite',
    kind: 'section',
    title: 'Tax',
    summary: 'Say whether your agency is VAT-registered, the rate applied and its taxpayer account number (NCC).',
    purpose: 'This information is used to calculate VAT on management fees.',
    steps: [
      { title: 'Turn VAT on', detail: 'Tick "The agency is VAT-registered" if it is subject to VAT.' },
      { title: 'Enter the rate', detail: '"VAT rate (%)": from 0 to 100. It stays greyed out until VAT is turned on.' },
      { title: 'Enter the NCC', detail: '"Taxpayer account number (NCC)": 30 characters at most.' },
      { title: 'Save', detail: '"Save" button at the bottom of the form.' }
    ],
    consequences: [
      'An agency under the synthetic tax regime does not charge VAT: leave the switch off.',
      'The default rate suggested is 18%.'
    ],
    faq: [
      { q: 'Why is the rate greyed out?', a: 'Because the agency is not declared VAT-registered.' },
      { q: 'Is the NCC required?', a: 'No, the field is optional.' },
      {
        q: 'Where can I see the effect of VAT?',
        a: 'In the "Management fees" card, a worked example shows the fees, the VAT and the net amount to the owner.'
      }
    ],
    related: [{ label: 'Management fees', helpId: 'administration.agence.finance.honoraires' }],
    keywords: ['VAT', 'NCC', 'synthetic tax', 'taxpayer', 'rate']
  },
  {
    id: 'administration.agence.finance.honoraires',
    kind: 'section',
    title: 'Management fees',
    summary:
      'Set what the agency takes from the rents collected: a percentage or a flat fee per installment. A worked example appears below the form.',
    purpose:
      'Management statements deduct these fees from the rent before paying the net amount to the owner. An owner or a lease can have specific terms, which take priority over these.',
    howToRead: {
      notes: [
        'Example: on a collected rent of 200 000 FCFA, the screen shows the fees, the VAT (if the agency is VAT-registered) and the net amount to the owner.',
        'Percentage: the rate applies either to the rent alone (excluding charges and penalties), or to everything collected.',
        'Flat fee per installment: due in full if the installment is fully paid, pro rata otherwise.'
      ]
    },
    steps: [
      { title: 'Choose the calculation mode', detail: '"Percentage" or "Flat fee per installment".' },
      {
        title: 'Enter the rate or the flat fee',
        detail:
          'In percentage mode, leave empty until the rate is decided. In flat fee mode, the amount must be greater than 0.'
      },
      {
        title: 'Choose the calculation base',
        detail: '"Rent only, excluding charges and penalties" or "Everything collected" (percentage mode only).'
      },
      { title: 'Check the worked example', detail: 'Check the net amount to the owner.' },
      { title: 'Save', detail: '"Save" button at the bottom of the form.' }
    ],
    consequences: [
      'Collections already made keep the fees of the terms in force at the time; the change only applies going forward.',
      'As long as the rate is not set, no fees are deducted on management statements.',
      'This card only appears if your subscription includes rental management.'
    ],
    faq: [
      {
        q: 'What does "Leave empty until the rate is decided" mean?',
        a: 'An empty rate is not a rate of zero: it means "not set yet".'
      },
      {
        q: 'Can fees be different for one owner?',
        a: 'Yes, in the "Terms by owner" card. A lease can also have specific terms; those take priority.'
      },
      {
        q: 'Is the flat fee reduced if the tenant pays only part?',
        a: 'Yes, it is due pro rata to what is paid; the example on screen assumes a fully paid installment.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Reserved for agencies whose subscription includes rental management.' },
    related: [
      { label: 'Terms by owner', helpId: 'administration.agence.finance.proprietaires' },
      { label: 'Tax', helpId: 'administration.agence.finance.fiscalite' }
    ],
    keywords: ['fees', 'commission', 'percentage', 'flat fee', 'rental management', 'rent', 'rate']
  },
  {
    id: 'administration.agence.finance.comptes',
    kind: 'section',
    title: 'Accounting accounts',
    summary:
      "Enter the SYSCOHADA account numbers that receive the agency's entries. Have your accountant validate them.",
    purpose:
      'With rental management, the card is called "Rental management accounts"; otherwise, "Cash accounting accounts", with only the cash differences.',
    howToRead: {
      notes: [
        '"Owners\' funds": third-party account "Principals", with one sub-account per owner. Suggested: 4731.',
        '"Management fees": income account "Rental management fees". Suggested: 70611.',
        '"VAT collected": account for the VAT on fees. Suggested: 4432.',
        '"Cash difference — shortage": expense account debited when a cash session reveals a shortage, after investigation. Example: 6588.',
        '"Cash difference — surplus": income account credited when a cash session reveals a surplus, after investigation. Example: 7588.'
      ]
    },
    steps: [
      { title: 'Reread the suggested numbers', detail: 'They are suggested as long as nothing has been saved.' },
      { title: 'Correct if needed', detail: 'A number contains digits only: 2 to 12.' },
      { title: 'Save', detail: '"Save" button at the bottom of the form.' }
    ],
    consequences: [
      'The number chosen applies to future entries.',
      'The first three accounts only appear with rental management.'
    ],
    faq: [
      {
        q: 'What should I enter if I do not know my accounts?',
        a: 'Keep the suggested numbers, then have your accountant validate them.'
      },
      {
        q: 'Why "An account number contains digits only (2 to 12)"?',
        a: 'The number contains a letter, a space, or has fewer than 2 or more than 12 digits.'
      },
      {
        q: 'Can I leave an account empty?',
        a: 'The fields are not required on screen. For penalties going to the agency, however, the income account is required.'
      }
    ],
    related: [{ label: 'Late payment penalties', helpId: 'administration.agence.finance.penalites' }],
    keywords: ['accounts', 'accounting', 'SYSCOHADA', 'cash', 'cash difference', 'mandants', 'VAT collected']
  },
  {
    id: 'administration.agence.finance.penalites',
    kind: 'section',
    title: 'Late payment penalties',
    summary:
      'Choose who receives the late payment penalties collected: the owner or the agency. If they go to the agency, enter the income account.',
    purpose: 'The choice decides who receives the penalties once the tenant has paid them.',
    steps: [
      { title: 'Choose the beneficiary', detail: '"The owner" or "The agency".' },
      {
        title: 'Enter the income account',
        detail: '"Penalty income account": required when the penalties go to the agency.'
      },
      { title: 'Save', detail: '"Save" button at the bottom of the form.' }
    ],
    consequences: [
      'The "Penalty income account" field only appears if the beneficiary is "The agency".',
      'This card only appears if your subscription includes rental management.'
    ],
    faq: [
      {
        q: 'What is the default choice?',
        a: 'As long as nothing is saved, "The owner" is suggested.'
      },
      {
        q: 'Why is the income account required?',
        a: 'Because penalties going to the agency are agency income: an account is needed to record them.'
      },
      {
        q: 'Where is the penalty itself set?',
        a: 'This setting only says who receives it. The screen sets neither its amount nor when it applies.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Reserved for agencies whose subscription includes rental management.' },
    related: [{ label: 'Accounting accounts', helpId: 'administration.agence.finance.comptes' }],
    keywords: ['penalties', 'late', 'beneficiary', 'unpaid']
  },
  {
    id: 'administration.agence.finance.retenue',
    kind: 'section',
    title: 'Withholding tax on rents',
    summary:
      'Turn on withholding tax on rents, only after confirmation from your firm. It is never applied to rents collected before the chosen date.',
    purpose:
      'The withholding is calculated from the tax status of each owner, which you set in "Terms by owner". It is off until you turn it on.',
    howToRead: {
      notes: [
        'Rates suggested by default: 12% for an individual, 15% for a company.',
        'Suggested withholding account: 4478.',
        'A banner reminds you: turn on only after confirmation from the firm (tax status of each owner, base and due dates).'
      ]
    },
    steps: [
      {
        title: 'Turn on the withholding',
        detail: '"Apply withholding tax on rents". The start date is filled in with today.'
      },
      {
        title: 'Choose the start date',
        detail: '"Apply to collections from": required when the withholding is turned on.'
      },
      { title: 'Check the rates', detail: '"Rate — individual (%)" and "Rate — company (%)".' },
      { title: 'Check the account', detail: '"Withholding tax account".' },
      { title: 'Set the tax status of the owners', detail: 'In the "Terms by owner" card.' },
      { title: 'Save', detail: '"Save" button at the bottom of the form.' }
    ],
    consequences: [
      'The withholding is never applied to rents already collected before the start date.',
      'Without a start date, saving is refused when the withholding is turned on.',
      'This card only appears if your subscription includes rental management.'
    ],
    faq: [
      {
        q: 'Should I turn it on?',
        a: 'Only after confirmation from your accounting firm: tax status of each owner, calculation base and due dates.'
      },
      {
        q: 'Why a start date?',
        a: 'So that the withholding is never retroactive: it only affects rents collected from that date.'
      },
      {
        q: 'Which rate is used for an exempt owner?',
        a: 'The screen does not say. To be confirmed with your firm before turning the withholding on.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Reserved for agencies whose subscription includes rental management.' },
    related: [{ label: 'Terms by owner', helpId: 'administration.agence.finance.proprietaires' }],
    keywords: ['withholding tax', 'tax', 'rents', 'owner', 'rate', 'DGI']
  },
  {
    id: 'administration.agence.finance.paiement-en-ligne',
    kind: 'section',
    title: 'Online payment',
    summary:
      'Let your tenants pay their installments from their portal, through the PaySecureHub payment page. Set here the mode, your credentials and the account that receives the money.',
    purpose:
      'The tenant pays on the payment provider hosted page; the collection goes to the treasury account you choose. The "Test the connection" button checks your credentials.',
    howToRead: {
      notes: [
        '"Simulator" is a trial mode, available only if your environment allows it; "Live" uses your PaySecureHub credentials.',
        'The saved API key is never shown again: only its last 4 characters are.',
        '"Notification address (IPN)": the address the payment provider calls to confirm a payment.',
        '"Last test": result and date of the last connection test.'
      ]
    },
    steps: [
      { title: 'Choose the mode', detail: '"Simulator" to try, "Live" for real payments.' },
      { title: 'Enter the merchant ID', detail: 'Required in live mode.' },
      {
        title: 'Enter the API key',
        detail: 'Click "Replace the key" to enter a new one. Left inactive, the saved key stays unchanged.'
      },
      {
        title: 'Choose the treasury account',
        detail:
          'Mobile Money and bank accounts only. If none is chosen, a collection account is created automatically on activation.'
      },
      { title: 'Choose who pays the fees', detail: '"The tenant" or "The agency".' },
      { title: 'Enable and save', detail: '"Enable online payment", then "Save".' },
      {
        title: 'Test the connection',
        detail: 'Click "Test the connection": the result is shown and "Last test" is updated.'
      }
    ],
    consequences: [
      'Enabling live mode requires the merchant ID and the API key; otherwise saving is refused.',
      'Changing the mode, the merchant ID or the key is refused while payments are waiting for confirmation.',
      'The connection test is kept in "Last test"; in live mode, it shows the merchant account balance.',
      'Without an encryption key on the server, no API key can be saved: a banner says so.'
    ],
    faq: [
      {
        q: 'What does "Test the connection" do?',
        a: 'It checks with PaySecureHub that the merchant ID and the key work. In simulator mode, the connection is always available.'
      },
      {
        q: 'Why is the simulator mode greyed out?',
        a: 'Your environment does not allow it: a banner says so.'
      },
      {
        q: 'Do I lose my API key if I click "Replace the key"?',
        a: 'No, the key is only replaced if you enter the new one and then save.'
      },
      {
        q: 'Can tenants pay right away?',
        a: 'To pay online, the configuration must be active and your subscription must include rental management.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      note: 'Saving and testing require the right to edit agency settings.'
    },
    related: [{ label: 'Financial settings', helpId: 'administration.agence.finance' }],
    keywords: [
      'online payment',
      'PaySecureHub',
      'gateway',
      'Mobile Money',
      'API key',
      'payment provider',
      'IPN',
      'merchant'
    ],
    tour: {
      steps: [
        {
          target: 'passerelle-identifiants',
          title: 'Mode and credentials',
          description:
            'Choose the mode, enter your merchant ID and API key, then the treasury account and who pays the fees.'
        },
        {
          target: 'passerelle-enregistrer',
          title: 'Save',
          description: 'Save your choices. Live mode requires the merchant ID and the API key.'
        },
        {
          target: 'passerelle-tester',
          title: 'Test the connection',
          description: 'Check that your credentials work: the result is kept in "Last test".'
        },
        {
          target: 'passerelle-ipn',
          title: 'Notification address',
          description: 'This is the address the payment provider calls to confirm payments: it can be copied.'
        }
      ]
    }
  },
  {
    id: 'administration.agence.finance.proprietaires',
    kind: 'section',
    title: 'Terms by owner',
    summary:
      "Give an owner fees different from the agency's, and enter their tax status for withholding tax. Without specific terms, they follow the agency.",
    purpose:
      'The rate applicable to a collection is resolved in this order: the lease, then the owner, then the agency.',
    steps: [
      { title: 'Find the owner', detail: 'Search by name or email, or filter by terms and tax status.' },
      {
        title: 'Edit',
        detail: 'Click "Edit": choose the mode, the rate or flat fee, the calculation base and the tax status.'
      },
      { title: 'Save', detail: '"Save" button of the window.' },
      {
        title: "Revert to the agency's terms",
        detail: '"Revert to the agency\'s terms" button, then "Revert" to confirm.'
      }
    ],
    consequences: [
      '"Revert to the agency\'s terms" deletes the owner specific terms.',
      "A lease's terms, if any, take priority over the owner's.",
      'This card only appears for rental management on behalf of third parties; with a Patrimoine pack alone, it is hidden.'
    ],
    faq: [
      {
        q: 'What does "Follows the agency" mean?',
        a: 'The owner has no specific terms: the agency fees apply.'
      },
      {
        q: 'What is the tax status for?',
        a: 'To determine the withholding tax rate applicable to this owner, once the withholding is turned on.'
      },
      {
        q: 'I see "Not included in your pack".',
        a: 'Your subscription does not include rental management: the card is then not available.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Editing requires the right to edit agency settings.' },
    related: [
      { label: 'Table of terms by owner', helpId: 'administration.agence.finance.proprietaires.tableau' },
      { label: 'Management fees', helpId: 'administration.agence.finance.honoraires' }
    ],
    keywords: ['owner', 'specific fees', 'specific terms', 'tax status', 'exempt']
  },
  {
    id: 'administration.agence.finance.proprietaires.tableau',
    kind: 'table',
    title: 'Table of terms by owner',
    summary:
      'One row per owner, with their fees and tax status. Owners without specific terms show "Follows the agency".',
    howToRead: {
      columns: [
        { key: 'ownerName', label: 'Owner', description: 'Name of the owner.' },
        { key: 'leaseCount', label: 'Leases', description: 'Number of leases concerning this owner.' },
        {
          key: 'terms',
          label: 'Terms',
          description:
            'Their fees: "Follows the agency", a percentage (of the rent alone or of everything collected), a flat fee, or "Rate not set".'
        },
        {
          key: 'ownerTaxStatus',
          label: 'Tax status (withholding)',
          description: 'Individual, Company, Exempt or Not provided.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Edit", and "Revert to the agency\'s terms" when specific terms exist.'
        }
      ],
      notes: ['Filters offered: "Terms" (Follows the agency, Percentage, Flat fee) and "Tax status".']
    },
    faq: [
      {
        q: 'How do I search for an owner?',
        a: 'Type their name or email in the search field.'
      },
      {
        q: 'What does "Rate not set" mean?',
        a: 'The owner has percentage terms, but no rate entered.'
      },
      {
        q: 'Can I export the table?',
        a: 'Yes, with the "Export" button; all owners matching your filters are exported.'
      }
    ],
    related: [{ label: 'Terms by owner', helpId: 'administration.agence.finance.proprietaires' }],
    keywords: ['owners', 'table', 'fees', 'tax status']
  },
  {
    id: 'administration.agence.finance.commissions',
    kind: 'section',
    title: 'Collaborator commission',
    summary:
      'Enter the share of fees paid to each team member on the leases they manage. The share is a percentage of the fees excluding tax.',
    purpose: 'The saved share is used to calculate a team member commission on the leases they manage.',
    steps: [
      { title: 'Find the team member', detail: 'Beyond 10 team members, a search field appears.' },
      { title: 'Enter the share', detail: '"Share (%)" column, from 0 to 100.' },
      {
        title: 'Save the row',
        detail: '"Save" button of the row: it only becomes active if the value has changed.'
      }
    ],
    consequences: [
      'Each row is saved separately: the page button does not cover them.',
      'A new share does not change the fees already frozen on a past collection.',
      'This card only appears for rental management on behalf of third parties; with a Patrimoine pack alone, it is hidden.'
    ],
    faq: [
      {
        q: 'Why is the "Save" button greyed out?',
        a: 'The value entered is the same as the one already saved.'
      },
      {
        q: 'What does the share apply to?',
        a: 'To the fees excluding tax on the leases the team member manages.'
      },
      {
        q: 'A team member with no share?',
        a: 'Leave the field empty: no share is saved for them.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Saving requires the right to edit agency settings.' },
    related: [{ label: 'Commission table', helpId: 'administration.agence.finance.commissions.tableau' }],
    keywords: ['commission', 'team member', 'negotiator', 'share', 'fees', 'manager']
  },
  {
    id: 'administration.agence.finance.commissions.tableau',
    kind: 'table',
    title: 'Commission table',
    summary: 'One row per team member, with their share as a percentage. Enter the share then save the row.',
    howToRead: {
      columns: [
        { key: 'fullName', label: 'Team member', description: 'Name of the team member.' },
        { key: 'email', label: 'Email', description: 'Email address of the team member.' },
        {
          key: 'sharePercent',
          label: 'Share (%)',
          description:
            'The share of fees excluding tax paid to them, from 0 to 100. The saved value appears in the export, not the one being typed.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '"Save" button of the row, active only if the share has changed.'
        }
      ]
    },
    faq: [
      {
        q: 'Do I lose my entries if I move to another row?',
        a: 'No, each row keeps its entry as long as you do not leave the page; but only "Save" keeps it.'
      },
      {
        q: 'How do I search?',
        a: 'The search field (name or email) appears beyond 10 team members.'
      },
      {
        q: 'Can I export?',
        a: 'Yes, with "Export": the "Share (%)" column contains the saved value.'
      }
    ],
    related: [{ label: 'Collaborator commission', helpId: 'administration.agence.finance.commissions' }],
    keywords: ['commission', 'team members', 'share', 'table']
  },

  // ------------------------------------------------------------------ Subscription
  {
    id: 'administration.agence.abonnement',
    kind: 'page',
    title: 'Subscription',
    summary:
      'View your agency plan, what you use and the modules opened, then send an extension request to the ImmoTopia team. Plan changes go through ImmoTopia.',
    purpose:
      'This page is view-only: you do not change the plan yourself. Invoices and online payment are on the "Billing" page.',
    howToRead: {
      statuses: [
        { value: 'NONE', label: 'No subscription', description: 'The agency has no subscription yet.' },
        { value: 'TRIAL', label: 'Trial', description: 'Trial period: the remaining days are shown.' },
        { value: 'ACTIVE', label: 'Active', description: 'Subscription in progress.' },
        {
          value: 'GRACE',
          label: 'Grace period',
          description: 'Grace period before read-only, after the end of a trial or of an unpaid due date.'
        },
        { value: 'READ_ONLY', label: 'Read-only', description: 'The account is read-only: a banner says so.' }
      ],
      notes: [
        'A "Read-only account" banner gives the reason decided by ImmoTopia, or sends you to billing to pay the pending invoice.'
      ]
    },
    steps: [
      { title: 'Read the plan', detail: '"Plan" card: status, billing cycle, packs and current period.' },
      { title: 'Follow usage', detail: '"Usage" card: each bar shows used / limit.' },
      { title: 'See the modules', detail: '"Modules" card: what your subscription opens.' },
      {
        title: 'Request an extension',
        detail: '"Request an extension" card: choose an offer, describe your need, send.'
      },
      { title: 'Follow your requests', detail: 'The "My requests" table appears from the first request.' }
    ],
    consequences: [
      'An extension request is recorded and emailed to ImmoTopia administrators; it does not change your subscription until ImmoTopia has handled it.',
      'A read-only account can still view this page and pay its invoices. Changes elsewhere in the application may be refused.'
    ],
    faq: [
      {
        q: 'How do I change pack?',
        a: 'Plan changes go through the ImmoTopia team: use "Request an extension" or contact them.'
      },
      {
        q: 'What should I do if the account is read-only?',
        a: 'Pay the pending invoice from the "Billing" page to regain full access. If the reason was decided by ImmoTopia, contact them.'
      },
      {
        q: 'Why do I see "Restricted access"?',
        a: 'The page is reserved for people authorised to view agency settings.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      note: 'Viewing requires the right to view agency settings; sending a request requires the right to edit them.'
    },
    related: [
      { label: 'Billing', helpId: 'administration.agence.facturation' },
      { label: '"Billing" page', to: '/tenant/:tenantId/settings/facturation' }
    ],
    keywords: ['subscription', 'pack', 'plan', 'extension', 'quota', 'trial', 'read-only', 'usage']
  },
  {
    id: 'administration.agence.abonnement.formule',
    kind: 'section',
    title: 'Plan',
    summary: 'See the status of your subscription, its billing cycle, your packs and the current period.',
    purpose: 'This card is a simple statement: you change nothing here.',
    howToRead: {
      statuses: [
        { value: 'NONE', label: 'No subscription', description: 'No subscription for the agency.' },
        { value: 'TRIAL', label: 'Trial', description: 'Trial period: "Trial days remaining" is shown.' },
        { value: 'ACTIVE', label: 'Active', description: 'Subscription in progress.' },
        { value: 'GRACE', label: 'Grace period', description: 'Grace period before read-only.' },
        { value: 'READ_ONLY', label: 'Read-only', description: 'Read-only account.' }
      ],
      notes: [
        '"Billing cycle": "Monthly" or "Annual (11 months billed)".',
        '"Packs": the packs held, among Agency, Co-ownership, Developer, Integrated operator, Patrimoine Essentiel, Patrimoine Pro, Individual Free and Individual Plus.',
        '"Current period": start and end dates.'
      ]
    },
    consequences: ['Nothing is changed by this card.'],
    faq: [
      {
        q: 'What does "Annual (11 months billed)" mean?',
        a: 'The annual cycle is billed as 11 months for 12.'
      },
      {
        q: 'What is the grace period?',
        a: 'After the end of a trial or of an unpaid due date, you keep a delay before switching to read-only.'
      },
      {
        q: 'Where do I pay a pending invoice?',
        a: 'On the "Billing" page, "Go to billing" link in the banner.'
      }
    ],
    related: [{ label: 'Billing', helpId: 'administration.agence.facturation' }],
    keywords: ['plan', 'packs', 'cycle', 'period', 'status', 'trial']
  },
  {
    id: 'administration.agence.abonnement.consommation',
    kind: 'section',
    title: 'Usage',
    summary:
      'One bar per capacity of your subscription, showing what you have used out of what you can use. It turns orange from 80% and red at 100%.',
    purpose: 'It warns you when you are approaching the limit of your plan.',
    howToRead: {
      notes: [
        'Possible capacities: "Units", "Co-ownerships", "Sites", "Owned properties", "Active", "Analysed stocktake photos (per month)" and "Electronic signatures (per month)".',
        'Only the capacities of your plan, or that an extension can open, are shown.',
        'The figure "12 / 100" reads: 12 used out of 100 available.'
      ]
    },
    steps: [
      { title: 'Read the bars', detail: 'Green below 80%, orange from 80%, red at 100%.' },
      { title: 'Ask for more', detail: 'Use "Request an extension" further down.' }
    ],
    consequences: [
      'This card changes nothing. What happens beyond a limit depends on your plan: ask the ImmoTopia team.'
    ],
    faq: [
      {
        q: 'Why is a capacity missing?',
        a: 'Only the capacities of your packs, or that extensions can open, are shown.'
      },
      {
        q: 'Are photos and signatures counted every month?',
        a: 'Yes, these two capacities are labelled "per month".'
      },
      {
        q: 'What should I do at 100%?',
        a: 'Send an extension request to the ImmoTopia team.'
      }
    ],
    related: [{ label: 'Request an extension', helpId: 'administration.agence.abonnement.extension' }],
    keywords: ['usage', 'quota', 'capacity', 'units', 'limit', 'photos', 'signatures']
  },
  {
    id: 'administration.agence.abonnement.modules',
    kind: 'section',
    title: 'Modules',
    summary: 'See the modules opened by your subscription: Agency, Co-ownership, Developer or Portfolio.',
    purpose:
      'Modules determine the available functions: Agency opens contacts, sales, rental and patrimony; Co-ownership, co-ownership management; Developer, contacts, sales, patrimony and construction sites; Portfolio, rental and patrimony.',
    howToRead: {
      notes: ['If no module is open, the card shows "No module open".']
    },
    consequences: ['A function that is not in your modules is shown as "Not included in your pack".'],
    faq: [
      {
        q: 'How do I open one more module?',
        a: 'Contact the ImmoTopia team or send an extension request.'
      },
      {
        q: 'Why is a menu missing?',
        a: 'The menu follows your modules: a function not included in the subscription is removed.'
      },
      {
        q: 'Can a module be read-only?',
        a: 'Yes, a module removed after having been held remains viewable in read-only.'
      }
    ],
    related: [{ label: 'Plan', helpId: 'administration.agence.abonnement.formule' }],
    keywords: ['modules', 'agency', 'co-ownership', 'developer', 'portfolio', 'functions']
  },
  {
    id: 'administration.agence.abonnement.extension',
    kind: 'section',
    title: 'Request an extension',
    summary:
      'Ask the ImmoTopia team for more capacity or an option. Choose an offer, enter the quantity and describe your request.',
    purpose:
      'The offers shown depend on your agency packs. With no suitable offer, choose "Other request" and describe your need.',
    steps: [
      {
        title: 'Choose an offer',
        detail:
          '"Desired offer": under the list, the description and the monthly price (excluding tax) or "Price to be confirmed".'
      },
      {
        title: 'Enter the quantity',
        detail: 'The "Quantity" field only appears for an offer that adds capacity.'
      },
      { title: 'Describe the request', detail: '"Your request": 3 characters at least, 2000 at most.' },
      {
        title: 'Send',
        detail: 'Click "Send the request": the message "Request sent to the ImmoTopia team" confirms.'
      }
    ],
    consequences: [
      'The request is recorded, appears in "My requests" and is emailed to ImmoTopia administrators.',
      'It does not change your subscription right away: ImmoTopia handles it afterwards.',
      'Reserved for the agency administrator: without the right to edit settings, the form is inactive.'
    ],
    faq: [
      {
        q: 'What does "Price to be confirmed" mean?',
        a: 'The offer has no set price: ImmoTopia handles it by hand.'
      },
      {
        q: 'Why are there no offers?',
        a: 'The message "No extension available for your packs, describe your need" is shown: write your need as free text.'
      },
      {
        q: 'Where do I follow my request?',
        a: 'In the "My requests" table, "Status" column.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      note: 'Sending a request requires the right to edit agency settings.'
    },
    related: [{ label: 'My requests', helpId: 'administration.agence.abonnement.extension.demandes' }],
    keywords: ['extension', 'request', 'option', 'quantity', 'offer', 'capacity']
  },
  {
    id: 'administration.agence.abonnement.extension.demandes',
    kind: 'table',
    title: 'My requests',
    summary:
      'The list of extension requests sent by your agency, with their status. It appears from the first request.',
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Date', description: 'Date the request was sent.' },
        { key: 'offer', label: 'Offer', description: 'The offer requested, or "Other request" with no offer.' },
        { key: 'quantity', label: 'Quantity', description: 'Quantity requested, or a dash if there is none.' },
        { key: 'message', label: 'Request', description: 'Your message.' },
        { key: 'status', label: 'Status', description: 'Where the request stands at ImmoTopia.' }
      ],
      statuses: [
        { value: 'OPEN', label: 'Pending', description: 'ImmoTopia has not handled the request yet.' },
        { value: 'HANDLED', label: 'Handled', description: 'ImmoTopia has handled the request.' },
        { value: 'DECLINED', label: 'Rejected', description: 'ImmoTopia did not follow up.' }
      ]
    },
    faq: [
      {
        q: 'Why is the table absent?',
        a: 'It only appears once you have sent at least one request.'
      },
      {
        q: 'Can I cancel a request?',
        a: 'The screen offers no cancellation: contact ImmoTopia.'
      },
      {
        q: 'Can I export the list?',
        a: 'Yes, with the "Export" button.'
      }
    ],
    related: [{ label: 'Request an extension', helpId: 'administration.agence.abonnement.extension' }],
    keywords: ['requests', 'extension', 'status', 'follow-up']
  },

  // ------------------------------------------------------------------ Billing
  {
    id: 'administration.agence.facturation',
    kind: 'page',
    title: 'Billing',
    summary:
      'Find your ImmoTopia invoices: view, download as PDF and pay online. This is where you pay the invoice that blocks a read-only account.',
    purpose:
      "These invoices are for your ImmoTopia subscription, not your tenants' invoices. This page stays open even if the account is read-only.",
    steps: [
      {
        title: 'Search for an invoice',
        detail: 'By number or payment reference; filters Status, Issue date, Nature and Total amount.'
      },
      { title: 'Download', detail: '"PDF" or "Arabic translation" buttons.' },
      {
        title: 'Pay',
        detail: '"Pay online" on an invoice to be paid: you are sent to the payment page.'
      },
      { title: 'Return from payment', detail: 'On return, the page follows the payment and shows the result.' }
    ],
    consequences: [
      'After a successful payment, the message "Payment received: the invoice is paid." is shown and the account can leave read-only.',
      'A "Read-only account" banner stays shown as long as the pending invoice is not paid, or if ImmoTopia decided on read-only.',
      'Online payment is only offered if it is available for your agency.'
    ],
    faq: [
      {
        q: 'I do not see the "Pay online" button.',
        a: 'It only appears for an "Issued", "Overdue" or "Failed" invoice with an amount above 0, if online payment is available. Without the right to edit settings, the text "Payment reserved for the agency administrator" replaces it.'
      },
      {
        q: 'My payment is "being confirmed".',
        a: 'The page checks the payment every 3 seconds for one minute. After that, "Payment being confirmed." stays shown: reload the page later.'
      },
      {
        q: 'What if the payment fails?',
        a: 'The invoice becomes "Failed" and stays payable: start again with "Pay online".'
      },
      {
        q: 'Why "Restricted access"?',
        a: 'The page is reserved for people authorised to view agency settings.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      note: 'Viewing requires the right to view agency settings; paying requires the right to edit them.'
    },
    related: [
      { label: 'Invoices table', helpId: 'administration.agence.facturation.factures' },
      { label: 'Subscription', helpId: 'administration.agence.abonnement' }
    ],
    keywords: ['invoice', 'billing', 'payment', 'subscription', 'PDF', 'ImmoTopia', 'read-only']
  },
  {
    id: 'administration.agence.facturation.factures',
    kind: 'table',
    title: 'Invoices',
    summary:
      'The list of your subscription invoices, most recent first by default sort. Download them as PDF or pay them online.',
    howToRead: {
      columns: [
        { key: 'number', label: 'Number', description: 'Invoice number.' },
        { key: 'nature', label: 'Nature', description: 'Period (subscription), Overrun or Credit note.' },
        { key: 'period', label: 'Period', description: 'Start and end dates covered by the invoice.' },
        { key: 'due', label: 'Due date', description: 'Payment deadline.' },
        { key: 'amount', label: 'Total amount', description: 'Amount including all taxes.' },
        { key: 'status', label: 'Status', description: 'Where the invoice stands.' },
        {
          key: 'actions',
          label: 'Actions',
          description: '"PDF", "Arabic translation" and "Pay online" when payment is possible.'
        }
      ],
      statuses: [
        { value: 'ISSUED', label: 'Issued', description: 'The invoice is to be paid.' },
        { value: 'OVERDUE', label: 'Overdue', description: 'The due date has passed; the invoice can still be paid.' },
        { value: 'PAID', label: 'Paid', description: 'The invoice is paid.' },
        { value: 'FAILED', label: 'Failed', description: 'A payment did not succeed; the invoice can still be paid.' },
        { value: 'CANCELED', label: 'Cancelled', description: 'The invoice is cancelled.' },
        { value: 'REFUNDED', label: 'Refunded', description: 'The invoice has been refunded.' }
      ],
      notes: [
        'Drafts are never visible to the agency.',
        'Nature: "Period" is the subscription invoice, "Overrun" concerns a capacity overrun, "Credit note" is a document that is deducted.'
      ]
    },
    steps: [
      {
        title: 'Filter',
        detail: 'Search, "Status", "Issue date", "Nature", "Total amount".'
      },
      {
        title: 'Download',
        detail: '"PDF" for the invoice, "Arabic translation" for its Arabic presentation.'
      },
      { title: 'Pay online', detail: 'Click "Pay online": the payment page opens.' },
      {
        title: 'Resume a payment',
        detail: 'If a payment is already in progress, "Resume the payment" takes you back to it.'
      },
      { title: 'Export', detail: '"Export" button: all invoices matching the filters.' }
    ],
    consequences: [
      '"Pay online" sends you to the payment page. On return, the page follows the payment and updates the invoice.',
      'A successful payment can restore full access to a read-only account.',
      'In demonstration mode, no real payment is made: a text says so.'
    ],
    faq: [
      {
        q: 'What does the "Arabic translation" contain?',
        a: 'An Arabic presentation of the same invoice, as a PDF.'
      },
      {
        q: 'Why is "Pay online" absent from an invoice?',
        a: 'The invoice is already paid or cancelled, its amount is zero, online payment is not available, or you do not have the right to edit settings.'
      },
      {
        q: 'What does "A payment is already in progress for this invoice" mean?',
        a: 'A payment was started and not finished: click "Resume the payment" to finish it.'
      },
      {
        q: 'The list is empty.',
        a: 'The message "No invoice" is shown as long as no invoice has been issued for your agency.'
      }
    ],
    related: [{ label: 'Billing', helpId: 'administration.agence.facturation' }],
    keywords: ['invoices', 'PDF', 'pay', 'online payment', 'credit note', 'overrun', 'due date']
  },

  // ------------------------------------------------------------------ Activity log
  {
    id: 'administration.agence.activite',
    kind: 'page',
    title: 'Activity log',
    summary: 'See who did what, and when, in your agency. Each row opens to show the detail of an action.',
    purpose:
      'The log is used to check a change, find who did something, or understand a refusal. It is read-only: you cannot change anything in it.',
    steps: [
      { title: 'Filter', detail: 'Free search, "Category", "Period", "Result" and "Action".' },
      { title: 'Read a row', detail: 'Date, actor, action, resource, result and category.' },
      { title: 'Open the detail', detail: 'Click a row or "View".' },
      { title: 'Load the rest', detail: '"Load more" button at the bottom of the list.' },
      { title: 'Export', detail: '"Export" button, with your filters.' }
    ],
    consequences: [
      "Opening the log is itself recorded in the platform log (not visible in the agency's).",
      'Actions by ImmoTopia support appear as "ImmoTopia support", without name or address.',
      'The export is limited to 10 000 rows.'
    ],
    faq: [
      {
        q: 'Who can see this log?',
        a: 'People who have the right to view the activity log, by default the agency administrator.'
      },
      {
        q: 'An action I am looking for is missing.',
        a: 'The log shows the events visible to the agency. Events reserved for the platform are not in it.'
      },
      {
        q: 'What does "Rejected" mean?',
        a: 'The action was refused, for example for lack of rights.'
      }
    ],
    permissions: {
      roles: ['Agency administrator'],
      note: 'Requires the right "View the activity log".'
    },
    related: [
      { label: 'Log table', helpId: 'administration.agence.activite.journal' },
      { label: 'Activity details', helpId: 'administration.agence.activite.detail' }
    ],
    keywords: ['log', 'audit', 'history', 'traceability', 'activity', 'who did what']
  },
  {
    id: 'administration.agence.activite.journal',
    kind: 'table',
    title: 'Activity log',
    summary: 'One row per event: date, actor, action, resource, result and category. Most recent first.',
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Date', description: 'Date and time of the event.' },
        {
          key: 'actor',
          label: 'Actor',
          description:
            'Who acted: name or email of the person, "ImmoTopia support", "System", "AI assistant" or "Portal".'
        },
        { key: 'action', label: 'Action', description: 'What was done, in plain words.' },
        {
          key: 'resource',
          label: 'Resource',
          description:
            'The object concerned (property, lease, contact, etc.). Hover over a shortened value to see the detail.'
        },
        { key: 'outcome', label: 'Result', description: 'Succeeded, Failed or Rejected.' },
        {
          key: 'category',
          label: 'Category',
          description: 'Authentication, Data, Administration, Security, Billing, Export, AI assistant or System.'
        }
      ],
      statuses: [
        { value: 'SUCCESS', label: 'Succeeded', description: 'The action went through.' },
        { value: 'FAILURE', label: 'Failed', description: 'The action ran into an error.' },
        { value: 'DENIED', label: 'Rejected', description: 'The action was refused, for example for lack of rights.' }
      ],
      notes: [
        'Free search: action (code), resource, identifier or actor.',
        'The list loads in pages: "Load more" adds the next rows.'
      ]
    },
    steps: [
      { title: 'Filter', detail: 'By category, period, result or action.' },
      { title: 'Open a row', detail: 'Click it or "View".' },
      { title: 'Load more', detail: 'To go back in time.' },
      { title: 'Export', detail: '"Export" button: up to 10 000 rows, with your filters.' }
    ],
    faq: [
      {
        q: 'Why is an actor "ImmoTopia support"?',
        a: 'The ImmoTopia team intervened. Their name and address are never shown.'
      },
      {
        q: 'Why "No activity recorded"?',
        a: 'No event matches your agency yet, or all are filtered out.'
      },
      {
        q: 'Can a row be edited or deleted?',
        a: 'No: the log is read-only.'
      }
    ],
    related: [{ label: 'Activity details', helpId: 'administration.agence.activite.detail' }],
    keywords: ['log', 'audit', 'actor', 'resource', 'result', 'category', 'history']
  },
  {
    id: 'administration.agence.activite.detail',
    kind: 'section',
    title: 'Activity details',
    summary: 'The window that opens on a log row: everything known about the event, including what changed.',
    purpose: 'It helps you understand exactly what happened, and who did it.',
    howToRead: {
      notes: [
        'Date, actor, action, resource, result and category, as in the table.',
        '"IP address" and "Browser" are not shown for an action by ImmoTopia support.',
        '"Request ID" helps support if you contact them.',
        '"Changes": for each field, the value before → the value after.',
        '"Details": additional information, shown as is.'
      ]
    },
    steps: [
      { title: 'Open', detail: 'Click a log row or "View".' },
      { title: 'Read', detail: 'Go through the fields, then "Changes" and "Details" if they exist.' },
      { title: 'Close', detail: '"Close" button.' }
    ],
    consequences: ['The window changes nothing.'],
    faq: [
      {
        q: 'Why no "Changes"?',
        a: 'Only events that change fields show this block.'
      },
      {
        q: 'What is the request ID for?',
        a: 'ImmoTopia support can use it to find the same action on their side.'
      },
      {
        q: 'Why is there no IP address?',
        a: 'For an action by ImmoTopia support, the address and browser are not provided.'
      }
    ],
    related: [{ label: 'Activity log', helpId: 'administration.agence.activite' }],
    keywords: ['details', 'changes', 'before after', 'IP address', 'browser']
  }
];

export default entries;
