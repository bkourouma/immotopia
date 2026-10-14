/**
 * Contenus des documents du complément PATRIMOINE (titres, actes, avis,
 * attestations, devis, factures, contrats, quittances…).
 *
 * Fonctions pures : chacune renvoie `{ title, lines }` que `writeDemoPdf` (PDF)
 * ou `buildDocx` (Word) met en page. Les numéros (titre foncier, police, acte…)
 * sont dérivés d'un hachage du texte : stables d'une exécution à l'autre.
 */
import { dateFr, monthFr, xof } from './patrimoine-extras-files';

export interface DocContent {
  title: string;
  lines: string[];
}

/** Entier stable dans [min, max] dérivé d'un texte. */
export function hnum(text: string, min: number, max: number): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return min + ((h >>> 0) % (max - min + 1));
}

export const NOTARIES = [
  'Étude de Maître Hortense Aka-Yao, notaire à Abidjan-Plateau',
  'Étude de Maître Brice Kouadio-Séka, notaire à Abidjan-Cocody',
  'Étude de Maître Nathalie Tiémoko, notaire à Abidjan-Marcory'
];
const SURVEYOR = 'Cabinet de géomètres-experts Kouamé & Associés';
const EXPERT = 'Cabinet Expertim CI — experts en évaluation immobilière';
const CONTROL = 'Bureau de contrôle Technibat CI';

export interface PropFacts {
  title: string;
  ref: string;
  type: string;
  address: string;
  zone: string;
  surface: number | null;
}

const header = (p: PropFacts): string[] => [
  `Bien : ${p.title}`,
  `Référence interne : ${p.ref}`,
  `Adresse : ${p.address}`,
  p.surface ? `Superficie : ${p.surface} m²` : 'Superficie : à préciser',
  ''
];

export function titleDeed(p: PropFacts, owner: string, issued: Date): DocContent {
  const n = hnum(p.ref, 100000, 999999);
  return {
    title: `Titre foncier n° ${n}`,
    lines: [
      "# République de Côte d'Ivoire — Direction de la conservation foncière",
      `Circonscription foncière de ${p.zone === 'Grand-Bassam' ? 'Grand-Bassam' : 'Abidjan'}`,
      '',
      ...header(p),
      '# Propriétaire',
      owner,
      '',
      '# Mentions',
      `Titre foncier n° ${n} délivré le ${dateFr(issued)}.`,
      `Immatriculation au livre foncier, volume ${hnum(p.ref, 10, 99)}, folio ${hnum(p.title, 100, 400)}.`,
      'Aucune hypothèque inscrite à la date de délivrance du certificat, sous réserve des inscriptions du prêt immobilier le cas échéant.',
      '',
      'Le Conservateur de la propriété foncière.'
    ]
  };
}

export function landConcession(p: PropFacts, owner: string, issued: Date): DocContent {
  const n = hnum(`acd${p.ref}`, 1000, 9999);
  return {
    title: `Arrêté de concession définitive n° ${issued.getFullYear()}-${n}/MCLU`,
    lines: [
      "# République de Côte d'Ivoire — Ministère de la Construction, du Logement et de l'Urbanisme",
      '',
      'Vu le dossier de demande de concession définitive, le procès-verbal de bornage contradictoire et le paiement des frais de dossier.',
      '',
      ...header(p),
      '# Article 1',
      `Il est accordé à ${owner} la concession définitive du terrain décrit ci-dessus.`,
      '# Article 2',
      "L'arrêté sera publié et transcrit à la conservation foncière en vue de l'établissement du titre foncier.",
      '',
      `Fait à Abidjan, le ${dateFr(issued)}.`
    ]
  };
}

export function notarialDeed(p: PropFacts, buyer: string, price: number, signed: Date, notary: string): DocContent {
  return {
    title: `Acte de vente n° ${hnum(p.ref, 1000, 9999)}`,
    lines: [
      `# ${notary}`,
      '',
      `Le ${dateFr(signed)}, par-devant le notaire soussigné, a comparu :`,
      `Acquéreur : ${buyer}.`,
      '',
      ...header(p),
      '# Prix',
      `La vente est consentie et acceptée moyennant le prix principal de ${xof(price)}, payé comptant en l'étude pour partie et par le concours d'un établissement bancaire pour le surplus.`,
      '# Origine de propriété',
      'Le vendeur justifie de son droit par le titre de propriété précédent, régulièrement publié.',
      '# Frais',
      "Les droits d'enregistrement, la taxe de publicité foncière et les émoluments du notaire sont à la charge de l'acquéreur.",
      '',
      'Dont acte, lu et signé par les parties et le notaire.'
    ]
  };
}

export function taxNotice(p: PropFacts, owner: string, year: number, amount: number, due: Date): DocContent {
  return {
    title: `Avis d'imposition — taxe foncière ${year}`,
    lines: [
      "# Direction générale des impôts — République de Côte d'Ivoire",
      `Avis n° ${year}-${hnum(`${p.ref}${year}`, 100000, 999999)}`,
      '',
      `Contribuable : ${owner}`,
      ...header(p),
      '# Liquidation',
      `Montant de la taxe foncière ${year} : ${xof(amount)}`,
      `Date limite de paiement : ${dateFr(due)}`,
      'Mode de règlement : virement bancaire ou paiement mobile via le portail de télédéclaration.',
      '',
      'Toute somme non payée à la date limite est majorée de 10 %.'
    ]
  };
}

export function insuranceCertificate(
  p: PropFacts,
  owner: string,
  insurer: string,
  policyNumber: string,
  coverage: string,
  start: Date,
  stop: Date,
  premium: number
): DocContent {
  return {
    title: `Attestation d'assurance — police ${policyNumber}`,
    lines: [
      `# ${insurer}`,
      '',
      `Nous attestons que ${owner} est couvert(e) au titre du contrat ${policyNumber} (${coverage}) pour le bien suivant.`,
      '',
      ...header(p),
      '# Période de garantie',
      `Du ${dateFr(start)} au ${dateFr(stop)}.`,
      `Prime annuelle toutes taxes comprises : ${xof(premium)}.`,
      '# Garanties',
      'Incendie et explosion, dégâts des eaux, événements climatiques, vol et vandalisme, responsabilité civile propriétaire.',
      '',
      `Délivrée à Abidjan, le ${dateFr(start)}.`
    ]
  };
}

export function diagnostic(p: PropFacts, performed: Date, valid: Date): DocContent {
  return {
    title: 'Rapport de diagnostic technique du bâtiment',
    lines: [
      `# ${CONTROL}`,
      '',
      ...header(p),
      `Visite réalisée le ${dateFr(performed)}.`,
      '# Constats',
      'Structure : aucune fissure évolutive constatée. Toiture et étanchéité : état correct, joints à surveiller.',
      'Installation électrique : conforme, protection différentielle présente. Plomberie : sans fuite apparente.',
      'Assainissement : fosse et regards accessibles et entretenus.',
      '# Recommandations',
      "Entretien annuel de la toiture-terrasse et contrôle de l'installation électrique avant le renouvellement du bail.",
      '',
      `Validité du rapport : jusqu'au ${dateFr(valid)}.`
    ]
  };
}

export function buildingPermit(p: PropFacts, owner: string, issued: Date): DocContent {
  return {
    title: `Permis de construire n° ${issued.getFullYear()}-${hnum(`pc${p.ref}`, 100, 999)}`,
    lines: [
      "# Mairie — Direction de l'urbanisme et des services techniques",
      '',
      `Bénéficiaire : ${owner}`,
      ...header(p),
      '# Décision',
      'Le permis de construire est accordé pour la construction conformément aux plans annexés, sous réserve du respect des règles de sécurité et de salubrité.',
      '',
      `Délivré le ${dateFr(issued)}.`
    ]
  };
}

export function floorPlan(p: PropFacts, drawn: Date): DocContent {
  return {
    title: `Plan du bien — ${p.title}`,
    lines: [
      `# ${SURVEYOR}`,
      `Plan établi le ${dateFr(drawn)}, échelle 1/100.`,
      '',
      ...header(p),
      '# Distribution',
      p.type === 'TERRAIN'
        ? 'Parcelle rectangulaire, façade sur voie bitumée, bornes implantées aux quatre angles.'
        : 'Plan de masse et plans de niveaux : pièces principales, circulations, sanitaires, accès et place de stationnement.',
      '',
      'Les cotes sont exprimées en mètres.'
    ]
  };
}

export function surveyReport(p: PropFacts, performed: Date): DocContent {
  return {
    title: 'Procès-verbal de bornage contradictoire',
    lines: [
      `# ${SURVEYOR}`,
      '',
      ...header(p),
      `Bornage contradictoire effectué le ${dateFr(performed)} en présence des propriétaires riverains.`,
      '# Résultat',
      'Quatre bornes ont été implantées ; les riverains ont signé le procès-verbal sans réserve.',
      '',
      'Le géomètre-expert.'
    ]
  };
}

export function villageAttestation(p: PropFacts, owner: string, issued: Date): DocContent {
  return {
    title: 'Attestation villageoise de cession',
    lines: [
      '# Chefferie du village — sous-préfecture',
      '',
      `Nous, chef du village, attestons que la parcelle ci-dessous a été cédée à ${owner} par la famille cédante, en présence des témoins soussignés.`,
      '',
      ...header(p),
      `Fait au village, le ${dateFr(issued)}.`
    ]
  };
}

export function genericRecord(
  title: string,
  issuer: string,
  p: PropFacts | null,
  body: string[],
  when: Date
): DocContent {
  return {
    title,
    lines: [`# ${issuer}`, `Document établi le ${dateFr(when)}.`, '', ...(p ? header(p) : []), ...body]
  };
}

// ------------------------------------------------------------------ sinistres

export function claimQuote(p: PropFacts, supplier: string, label: string, amount: number, when: Date): DocContent {
  return {
    title: `Devis de réparation — ${label}`,
    lines: [
      `# ${supplier}`,
      `Devis établi le ${dateFr(when)}, valable 30 jours.`,
      '',
      ...header(p),
      '# Détail',
      `${label} : fourniture et main-d'œuvre.`,
      `Total TTC : ${xof(amount)}.`,
      '',
      'Bon pour accord : le propriétaire.'
    ]
  };
}

export function expertReport(p: PropFacts, cause: string, claimed: number, retained: number, when: Date): DocContent {
  return {
    title: "Rapport d'expertise après sinistre",
    lines: [
      `# ${EXPERT}`,
      `Expertise du ${dateFr(when)} diligentée par la compagnie d'assurance.`,
      '',
      ...header(p),
      '# Causes et circonstances',
      cause,
      '# Évaluation',
      `Dommages déclarés : ${xof(claimed)}.`,
      `Dommages retenus par l'expert : ${xof(retained)}.`,
      '',
      "L'expert certifie que les constatations ci-dessus sont exactes."
    ]
  };
}

export function insurerLetter(
  insurer: string,
  p: PropFacts,
  policyNumber: string,
  outcome: { kind: 'SETTLED'; indemnified: number; deductible: number } | { kind: 'REJECTED'; reason: string },
  when: Date
): DocContent {
  return {
    title: outcome.kind === 'SETTLED' ? "Lettre d'indemnisation" : 'Lettre de refus de prise en charge',
    lines: [
      `# ${insurer}`,
      `Abidjan, le ${dateFr(when)} — contrat ${policyNumber}`,
      '',
      ...header(p),
      outcome.kind === 'SETTLED'
        ? `Après examen du dossier, nous vous informons que votre sinistre est pris en charge. Une indemnité de ${xof(outcome.indemnified)} vous sera versée par virement (franchise de ${xof(outcome.deductible)} déduite).`
        : `Après examen du dossier, nous ne pouvons donner une suite favorable à votre demande : ${outcome.reason}`,
      '',
      'Nous restons à votre disposition pour toute précision.'
    ]
  };
}

export function repairInvoice(p: PropFacts, supplier: string, label: string, amount: number, when: Date): DocContent {
  return {
    title: `Facture n° ${hnum(`${supplier}${label}${when.getTime()}`, 1000, 9999)}`,
    lines: [
      `# ${supplier}`,
      `Facture du ${dateFr(when)}`,
      '',
      ...header(p),
      '# Prestation',
      label,
      `Montant TTC : ${xof(amount)} — réglé par virement ou paiement mobile.`,
      '',
      'Merci de votre confiance.'
    ]
  };
}

// ------------------------------------------------------------------ actifs non immobiliers

export function assetRecord(title: string, issuer: string, lines: string[], when: Date): DocContent {
  return { title, lines: [`# ${issuer}`, `Document du ${dateFr(when)}.`, '', ...lines] };
}

// ------------------------------------------------------------------ bail

export interface LeaseFacts {
  number: string;
  property: PropFacts;
  renter: string;
  landlord: string;
  rent: number;
  service: number;
  deposit: number;
  start: Date;
  end: Date | null;
  commercial: boolean;
}

export function leaseContract(l: LeaseFacts): DocContent {
  return {
    title: `Contrat de bail ${l.commercial ? 'commercial' : "à usage d'habitation"} n° ${l.number}`,
    lines: [
      '# Entre les soussignés',
      `Le bailleur : ${l.landlord}`,
      `Le preneur : ${l.renter}`,
      '',
      '# Objet',
      `Le bailleur donne à bail le bien suivant : ${l.property.title}, ${l.property.address}.`,
      '# Durée',
      `Le bail prend effet le ${dateFr(l.start)}${l.end ? ` et prend fin le ${dateFr(l.end)}` : ' pour une durée indéterminée, renouvelable par tacite reconduction'}.`,
      '# Loyer et charges',
      `Loyer mensuel : ${xof(l.rent)}. Provision pour charges : ${xof(l.service)}. Échéance le 5 de chaque mois.`,
      `Dépôt de garantie : ${xof(l.deposit)} (deux mois de loyer).`,
      '# Obligations',
      'Le preneur use paisiblement des lieux, les entretient et souscrit une assurance locative. Le bailleur délivre un logement décent et assure les grosses réparations.',
      '# Résiliation',
      'Chaque partie peut résilier le bail moyennant un préavis de trois mois par écrit.',
      '',
      `Fait à Abidjan, le ${dateFr(l.start)}, en deux exemplaires.`
    ]
  };
}

export function rentQuittance(l: LeaseFacts, month: Date, paidAt: Date, amount: number, method: string): DocContent {
  return {
    title: `Quittance de loyer — ${monthFr(month)}`,
    lines: [
      `Bail ${l.number} — ${l.property.title}`,
      `Locataire : ${l.renter}`,
      `Bailleur : ${l.landlord}`,
      '',
      `Je soussigné, ${l.landlord}, reconnais avoir reçu de ${l.renter} la somme de ${xof(amount)} au titre du loyer et des charges de ${monthFr(month)}.`,
      `Paiement du ${dateFr(paidAt)} par ${method}.`,
      `Détail : loyer ${xof(l.rent)} — charges ${xof(l.service)}.`,
      '',
      'Cette quittance annule tous les reçus qui auraient pu être établis précédemment pour la même période.'
    ]
  };
}

export function depositReceipt(l: LeaseFacts): DocContent {
  return {
    title: 'Reçu de dépôt de garantie',
    lines: [
      `Bail ${l.number} — ${l.property.title}`,
      '',
      `${l.landlord} reconnaît avoir reçu de ${l.renter}, le ${dateFr(l.start)}, la somme de ${xof(l.deposit)} à titre de dépôt de garantie.`,
      'Cette somme sera restituée à la fin du bail, déduction faite des éventuelles réparations locatives et des loyers impayés.'
    ]
  };
}

export function leaseAddendum(l: LeaseFacts, effective: Date, subject: string): DocContent {
  return {
    title: `Avenant au bail ${l.number}`,
    lines: [
      `Entre ${l.landlord} (bailleur) et ${l.renter} (preneur).`,
      '',
      `Objet : ${subject}.`,
      `Effet : ${dateFr(effective)}.`,
      'Les autres clauses du bail demeurent inchangées.'
    ]
  };
}

export function rentStatement(l: LeaseFacts, balance: number, asOf: Date): DocContent {
  return {
    title: `Relevé de compte locataire au ${dateFr(asOf)}`,
    lines: [
      `Bail ${l.number} — ${l.property.title}`,
      `Locataire : ${l.renter}`,
      '',
      `Loyer mensuel : ${xof(l.rent + l.service)} (charges comprises).`,
      `Solde restant dû à ce jour : ${xof(balance)}.`,
      "Merci de régulariser votre situation avant la prochaine échéance ou de nous contacter pour convenir d'un échéancier."
    ]
  };
}
