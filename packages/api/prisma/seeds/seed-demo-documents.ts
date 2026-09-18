/**
 * Complément du jeu de démonstration — portail propriétaire et documents.
 *
 * Quatre manques constatés après `seed-demo-locative` :
 *
 *   1. **Le portail propriétaire était vide.** Le compte propriétaire ne
 *      possédait qu'un bien sur quatre-vingts : l'écran Revenus n'avait rien à
 *      montrer, alors que c'est l'argument décisif pour une affaire familiale.
 *      Un bloc cohérent de biens lui est réaffecté — l'immeuble de Yopougon
 *      Niangon et les deux entrepôts.
 *
 *   2. **Les statuts mentaient sur l'occupation.** Les douze appartements
 *      arrivaient tous marqués « loué » quand trois seulement portent un bail,
 *      et `seed-comprehensive-data` en déclare sept autres « loués » sans bail.
 *      Le portail affichait « 15 biens, 6 loués, 0 disponibles » : les neuf
 *      autres ne tombaient dans aucune case. Le bail fait foi — les statuts de
 *      toute l'agence sont remis d'équerre dessus, pas seulement ceux du
 *      portefeuille du portail.
 *
 *   3. **Aucun relevé propriétaire.** Ils sont générés par la fonction du
 *      produit, sur les trois derniers mois.
 *
 *   4. **Aucun modèle de document.** Le segment « vous déposez votre contrat
 *      Word, il sort rempli » ne pouvait pas être joué. Deux modèles `.docx`
 *      sont fabriqués ici puis déposés par le même service que l'écran
 *      d'import, de sorte que les variables détectées le soient réellement par
 *      le produit et non écrites à la main en base.
 *
 * Les `.docx` sont construits à la main, en OOXML minimal. C'est volontaire :
 * ajouter une dépendance de génération Word pour deux fichiers de démonstration
 * coûterait plus cher que les quarante lignes de XML qu'ils contiennent.
 *
 * Idempotent : un modèle déjà présent n'est pas redéposé, un relevé déjà émis
 * n'est pas régénéré.
 */

process.env.EMAIL_SMTP_HOST = '127.0.0.1';
process.env.EMAIL_SMTP_PORT = '1';
delete process.env.SENDGRID_API_KEY;

import { PrismaClient, DocumentType, PropertyStatus, PropertyAvailability, RentalLeaseStatus } from '@prisma/client';
import PizZip from 'pizzip';

import { uploadTemplate, activateTemplate, setDefaultTemplate } from '../../src/services/document-template-service';
import { generateOwnerStatement } from '../../src/lib/patrimoine/queries';

const prisma = new PrismaClient({ log: [] });
const TENANT_ID = process.env.DEMO_TENANT_ID || '385a1e76-ac08-4db5-9802-8b2ddfb1672b';

/**
 * Propriétaire du portail de démonstration, désigné par son adresse.
 *
 * La recherche se faisait sur le seul `clientType: OWNER`, sans ordre : ce
 * `findFirst` renvoyait un client au hasard parmi les deux que porte l'agence.
 * Selon le tirage, la réaffectation ci-dessous déplaçait le portefeuille d'un
 * propriétaire à l'autre — deux exécutions de suite ne donnaient pas le même
 * jeu de démonstration. Le compte visé est celui du panneau « Comptes par
 * tenant » de l'écran de connexion, persona Propriétaire.
 */
const EMAIL_PROPRIETAIRE = process.env.DEMO_OWNER_EMAIL || 'mickael.andjui.21@gmail.com';

/* ------------------------------------------------------------------ DOCX */

/** Échappe le texte destiné au XML du document. */
function xml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

type Ligne = { texte: string; style?: 'titre' | 'soustitre' | 'gras' };

/** Un paragraphe Word. `w:jc` centre les titres, `w:b` met en gras. */
function paragraphe({ texte, style }: Ligne): string {
  const taille = style === 'titre' ? 32 : style === 'soustitre' ? 24 : 22;
  const gras = style ? '<w:b/>' : '';
  const centre = style === 'titre' ? '<w:jc w:val="center"/>' : '';
  return (
    '<w:p><w:pPr>' +
    centre +
    `<w:spacing w:after="120"/></w:pPr>` +
    `<w:r><w:rPr>${gras}<w:sz w:val="${taille}"/></w:rPr>` +
    `<w:t xml:space="preserve">${xml(texte)}</w:t></w:r></w:p>`
  );
}

/**
 * Fabrique un `.docx` à partir d'une liste de lignes.
 *
 * Trois entrées suffisent à un document que Word ouvre : la table des types de
 * contenu, la relation racine, et le corps du document.
 */
function fabriquerDocx(lignes: Ligne[]): Buffer {
  const zip = new PizZip();

  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>'
  );

  zip
    .folder('_rels')!
    .file(
      '.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>'
    );

  zip
    .folder('word')!
    .file(
      'document.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        lignes.map(paragraphe).join('') +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
        '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>' +
        '</w:body></w:document>'
    );

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/* -------------------------------------------------------------- modèles */

/**
 * Contrat de bail d'habitation.
 *
 * Les variables reprennent exactement celles que le générateur sait remplir
 * (`document-context-builder`). Une variable inventée resterait telle quelle
 * dans le document sorti — la démonstration le montrerait au client.
 */
const CONTRAT: Ligne[] = [
  { texte: 'CONTRAT DE BAIL À USAGE D’HABITATION', style: 'titre' },
  { texte: 'Bail n° {{BAIL_NUMERO}}' },
  { texte: '' },
  { texte: 'ENTRE LES SOUSSIGNÉS', style: 'soustitre' },
  { texte: 'Le bailleur : {{BAILLEUR_NOM}}, demeurant à l’adresse connue de l’agence,' },
  { texte: 'joignable au {{BAILLEUR_TELEPHONE}} et à l’adresse {{BAILLEUR_EMAIL}},' },
  { texte: 'représenté par {{AGENCE_NOM}}, {{AGENCE_ADRESSE}}, {{AGENCE_TELEPHONE}}.' },
  { texte: '' },
  { texte: 'Le preneur : {{LOCATAIRE_NOM}}, joignable au {{LOCATAIRE_TELEPHONE}},' },
  { texte: 'adresse électronique {{LOCATAIRE_EMAIL}}.' },
  { texte: '' },
  { texte: 'ARTICLE 1 — DÉSIGNATION DU BIEN', style: 'soustitre' },
  { texte: 'Le bailleur donne à bail le bien suivant : {{BIEN_TYPE}}, sis {{BIEN_ADRESSE}},' },
  { texte: 'd’une superficie de {{BIEN_SURFACE}} m², comprenant {{BIEN_PIECES}} pièces' },
  { texte: 'dont {{BIEN_CHAMBRES}} chambres.' },
  { texte: '' },
  { texte: 'ARTICLE 2 — DURÉE', style: 'soustitre' },
  { texte: 'Le présent bail est consenti à compter du {{BAIL_DATE_DEBUT}}' },
  { texte: 'et prend fin le {{BAIL_DATE_FIN}}.' },
  { texte: '' },
  { texte: 'ARTICLE 3 — LOYER ET CHARGES', style: 'soustitre' },
  { texte: 'Le loyer est fixé à {{BAIL_LOYER_MENSUEL}}, auquel s’ajoutent des charges' },
  { texte: 'de {{BAIL_CHARGES}}. La facturation est {{BAIL_FREQUENCE}} et le règlement' },
  { texte: 'doit intervenir au plus tard le {{BAIL_JOUR_ECHEANCE}} de la période.' },
  { texte: '' },
  { texte: 'ARTICLE 4 — DÉPÔT DE GARANTIE', style: 'soustitre' },
  { texte: 'Le preneur verse un dépôt de garantie de {{BAIL_DEPOT_GARANTIE}}, restitué' },
  { texte: 'en fin de bail déduction faite des sommes dues et des réparations locatives.' },
  { texte: '' },
  { texte: 'ARTICLE 5 — RETARD DE PAIEMENT', style: 'soustitre' },
  { texte: 'Passé le délai de grâce convenu, toute somme impayée porte pénalité selon' },
  { texte: 'les modalités portées au bail et communiquées au preneur.' },
  { texte: '' },
  { texte: 'ARTICLE 6 — ÉTAT DES LIEUX', style: 'soustitre' },
  { texte: 'Un état des lieux contradictoire est dressé à l’entrée et à la sortie.' },
  { texte: '' },
  { texte: 'Fait à Abidjan, le {{DATE_SIGNATURE}}, en deux exemplaires originaux.' },
  { texte: '' },
  { texte: 'Le bailleur                                        Le preneur', style: 'gras' },
  { texte: '{{BAILLEUR_NOM}}                                   {{LOCATAIRE_NOM}}' },
  { texte: '' },
  { texte: 'Document généré le {{DATE_GENERATION}} par {{AGENCE_NOM}}.' }
];

/**
 * Bail commercial — entrepôts, magasins, bureaux.
 *
 * Un contrat d'habitation appliqué à un entrepôt afficherait
 * « {{BIEN_CHAMBRES}} » : le générateur laisse volontairement la balise visible
 * quand la valeur est vide, pour signaler à l'agence ce qui manque. Un entrepôt
 * n'a pas de chambres — ce n'est pas une donnée manquante, c'est le mauvais
 * modèle. D'où celui-ci, qui ne parle que de surface et de destination.
 */
const BAIL_COMMERCIAL: Ligne[] = [
  { texte: 'CONTRAT DE BAIL À USAGE PROFESSIONNEL', style: 'titre' },
  { texte: 'Bail n° {{BAIL_NUMERO}}' },
  { texte: '' },
  { texte: 'ENTRE LES SOUSSIGNÉS', style: 'soustitre' },
  { texte: 'Le bailleur : {{BAILLEUR_NOM}}, joignable au {{BAILLEUR_TELEPHONE}},' },
  { texte: 'adresse électronique {{BAILLEUR_EMAIL}},' },
  { texte: 'représenté par {{AGENCE_NOM}}, {{AGENCE_ADRESSE}}, {{AGENCE_TELEPHONE}}.' },
  { texte: '' },
  { texte: 'Le preneur : {{LOCATAIRE_NOM}}, joignable au {{LOCATAIRE_TELEPHONE}},' },
  { texte: 'adresse électronique {{LOCATAIRE_EMAIL}}.' },
  { texte: '' },
  { texte: 'ARTICLE 1 — DÉSIGNATION DES LOCAUX', style: 'soustitre' },
  { texte: 'Le bailleur donne à bail les locaux suivants : {{BIEN_TYPE}},' },
  { texte: 'sis {{BIEN_ADRESSE}}, d’une superficie de {{BIEN_SURFACE}} m².' },
  { texte: '' },
  { texte: 'ARTICLE 2 — DESTINATION', style: 'soustitre' },
  { texte: 'Les locaux sont loués pour un usage exclusivement professionnel. Toute' },
  { texte: 'autre affectation requiert l’accord écrit et préalable du bailleur.' },
  { texte: '' },
  { texte: 'ARTICLE 3 — DURÉE', style: 'soustitre' },
  { texte: 'Le présent bail court du {{BAIL_DATE_DEBUT}} au {{BAIL_DATE_FIN}}.' },
  { texte: '' },
  { texte: 'ARTICLE 4 — LOYER ET CHARGES', style: 'soustitre' },
  { texte: 'Le loyer est fixé à {{BAIL_LOYER_MENSUEL}}, outre des charges de' },
  { texte: '{{BAIL_CHARGES}}. La facturation est {{BAIL_FREQUENCE}} et le règlement' },
  { texte: 'intervient au plus tard le {{BAIL_JOUR_ECHEANCE}} de la période.' },
  { texte: '' },
  { texte: 'ARTICLE 5 — DÉPÔT DE GARANTIE', style: 'soustitre' },
  { texte: 'Le preneur verse un dépôt de garantie de {{BAIL_DEPOT_GARANTIE}}.' },
  { texte: '' },
  { texte: 'ARTICLE 6 — ENTRETIEN ET RÉPARATIONS', style: 'soustitre' },
  { texte: 'Le preneur entretient les locaux et supporte les réparations locatives.' },
  { texte: 'Les grosses réparations demeurent à la charge du bailleur.' },
  { texte: '' },
  { texte: 'ARTICLE 7 — ASSURANCE', style: 'soustitre' },
  { texte: 'Le preneur justifie chaque année d’une police couvrant les risques locatifs.' },
  { texte: '' },
  { texte: 'Fait à Abidjan, le {{DATE_SIGNATURE}}, en deux exemplaires originaux.' },
  { texte: '' },
  { texte: 'Le bailleur                                        Le preneur', style: 'gras' },
  { texte: '{{BAILLEUR_NOM}}                                   {{LOCATAIRE_NOM}}' },
  { texte: '' },
  { texte: 'Document généré le {{DATE_GENERATION}} par {{AGENCE_NOM}}.' }
];

/** Quittance de loyer — le document que le locataire réclame le plus. */
const QUITTANCE: Ligne[] = [
  { texte: 'QUITTANCE DE LOYER', style: 'titre' },
  { texte: 'Quittance n° {{PAIEMENT_NUMERO}} — Bail n° {{BAIL_NUMERO}}' },
  { texte: '' },
  { texte: '{{AGENCE_NOM}} — {{AGENCE_ADRESSE}}' },
  { texte: 'Téléphone {{AGENCE_TELEPHONE}} — {{AGENCE_EMAIL}}' },
  { texte: '' },
  { texte: 'Je soussigné, agissant pour le compte de {{BAILLEUR_NOM}}, reconnais avoir' },
  { texte: 'reçu de {{LOCATAIRE_NOM}} la somme de {{PAIEMENT_MONTANT}},' },
  { texte: 'réglée le {{PAIEMENT_DATE}} par {{PAIEMENT_METHODE}},' },
  { texte: 'au titre de la période du {{PERIODE_DEBUT}} au {{PERIODE_FIN}}.' },
  { texte: '' },
  { texte: 'DÉTAIL', style: 'soustitre' },
  { texte: 'Bien loué : {{BIEN_TYPE}}, {{BIEN_ADRESSE}}' },
  { texte: 'Loyer : {{BAIL_LOYER_MENSUEL}}     Charges : {{BAIL_CHARGES}}' },
  { texte: 'Total dû : {{TOTAL_DU}}     Total payé : {{TOTAL_PAYE}}     Solde : {{SOLDE}}' },
  { texte: '' },
  { texte: 'La présente quittance annule tout reçu antérieur portant sur la même période.' },
  { texte: 'Elle ne vaut pas preuve du paiement des périodes précédentes.' },
  { texte: '' },
  { texte: 'Fait à Abidjan, le {{DATE_GENERATION}}.' },
  { texte: 'Pour {{AGENCE_NOM}}', style: 'gras' }
];

/* ---------------------------------------------------------------- script */

/** Biens réaffectés au propriétaire du portail, pour qu'il ait un portefeuille. */
const A_REAFFECTER = ['Immeuble Yopougon Niangon', 'Magasin de stockage 500', 'Entrepôt 1 200'];

async function main() {
  const membre = await prisma.membership.findFirst({ where: { tenantId: TENANT_ID }, select: { userId: true } });
  if (!membre) throw new Error('Aucun collaborateur sur cette agence');
  const acteur = membre.userId;

  const clientProprietaire = await prisma.tenantClient.findFirst({
    where: { tenantId: TENANT_ID, clientType: 'OWNER', user: { email: EMAIL_PROPRIETAIRE } },
    select: { userId: true, user: { select: { email: true, fullName: true } } }
  });
  if (!clientProprietaire?.userId) {
    throw new Error(
      `Aucun compte portail propriétaire « ${EMAIL_PROPRIETAIRE} » sur cette agence. ` +
        'Ajustez DEMO_OWNER_EMAIL si le jeu de comptes a changé.'
    );
  }

  const contactProprietaire = await prisma.crmContact.findFirst({
    where: { tenantId: TENANT_ID, email: clientProprietaire.user!.email },
    select: { id: true, firstName: true, lastName: true }
  });
  if (!contactProprietaire) throw new Error('Le compte portail propriétaire n’a pas de contact CRM correspondant');

  console.log(
    `Propriétaire du portail : ${contactProprietaire.firstName} ${contactProprietaire.lastName} <${clientProprietaire.user!.email}>\n`
  );

  // ------------------------------------------------------- réaffectation
  let reaffectes = 0;
  for (const motif of A_REAFFECTER) {
    const r = await prisma.property.updateMany({
      where: { tenantId: TENANT_ID, title: { contains: motif }, ownerUserId: { not: clientProprietaire.userId } },
      data: { ownerUserId: clientProprietaire.userId }
    });
    if (r.count > 0) console.log(`  ${r.count} bien(s) réaffecté(s) — « ${motif} »`);
    reaffectes += r.count;
  }
  console.log(`Réaffectation : ${reaffectes} bien(s).\n`);

  // --------------------------------------------- remise d'equerre des statuts
  //
  // Un bien est loue s'il porte un bail actif, pas si une colonne le dit. Le jeu
  // de demonstration violait la regle de deux cotes :
  //
  //   - les douze appartements de l'immeuble arrivent tous `status = RENTED`
  //     quand `seed-demo-locative` n'en loue que trois ;
  //   - `seed-comprehensive-data` declare sept biens `RENTED` sans jamais leur
  //     creer de bail.
  //
  // Le portail affichait alors « 15 biens, 6 loues, 0 disponibles » : les neuf
  // autres ne tombaient dans aucune case, « loue » se comptant sur le bail et
  // « disponible » exigeant `status === AVAILABLE`. Les ecrans agence mentaient
  // de la meme facon sur les sept autres.
  //
  // Le redressement porte donc sur toute l'agence et non sur le seul
  // portefeuille du portail : les biens fautifs appartiennent aussi a des
  // collaborateurs, et un compteur faux reste faux sur l'ecran d'a cote.
  //
  // Un bien sans bail actif mais marque loue repasse disponible ; l'inverse — un
  // bien loue reste disponible — est redresse de la meme facon, sinon le prochain
  // jeu de baux le laisserait derriere. Les statuts qui ne parlent pas
  // d'occupation (brouillon, en revision, reserve, sous offre, vendu, archive) ne
  // sont pas touches : ils portent une information que le bail n'a pas.
  const STATUTS_D_OCCUPATION: PropertyStatus[] = [PropertyStatus.RENTED, PropertyStatus.AVAILABLE];

  const deLAgence = await prisma.property.findMany({
    where: { tenantId: TENANT_ID },
    select: {
      id: true,
      title: true,
      status: true,
      rentalLeases: {
        where: { tenant_id: TENANT_ID, status: RentalLeaseStatus.ACTIVE },
        select: { id: true },
        take: 1
      }
    }
  });

  let redresses = 0;
  for (const bien of deLAgence) {
    if (!STATUTS_D_OCCUPATION.includes(bien.status)) continue;

    const loue = bien.rentalLeases.length > 0;
    const attendu = loue ? PropertyStatus.RENTED : PropertyStatus.AVAILABLE;
    if (bien.status === attendu) continue;

    await prisma.property.update({
      where: { id: bien.id },
      data: {
        status: attendu,
        availability: loue ? PropertyAvailability.UNAVAILABLE : PropertyAvailability.AVAILABLE
      }
    });
    console.log(`  ~ ${bien.title.slice(0, 52).padEnd(52)} ${bien.status} -> ${attendu}`);
    redresses++;
  }
  console.log(`Statuts remis d'equerre sur le bail : ${redresses} bien(s) sur ${deLAgence.length}.\n`);

  const sesBiens = await prisma.property.findMany({
    where: { tenantId: TENANT_ID, ownerUserId: clientProprietaire.userId },
    select: { id: true, title: true }
  });
  console.log(`Portefeuille du propriétaire : ${sesBiens.length} biens.`);

  // ------------------------------------------------------------- relevés
  // Trois mois : un relevé unique n'a pas d'historique à montrer.
  let releves = 0;
  const maintenant = new Date();
  for (let i = 1; i <= 3; i++) {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
    const periode = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const deja = await prisma.ownerStatement.findFirst({
      where: { tenantId: TENANT_ID, ownerContactId: contactProprietaire.id, period: periode }
    });
    if (deja) {
      console.log(`  = relevé ${periode} déjà émis`);
      continue;
    }

    try {
      const rel = await generateOwnerStatement(TENANT_ID, {
        ownerContactId: contactProprietaire.id,
        period: periode,
        propertyIds: sesBiens.map(b => b.id)
      });
      const net = Number((rel as { netAmount?: unknown }).netAmount ?? 0);
      console.log(`  + relevé ${periode} — net ${net.toLocaleString('fr-FR')} XOF`);
      releves++;
    } catch (e) {
      console.log(`  ⨯ relevé ${periode} : ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Relevés : ${releves} créé(s).\n`);

  // ------------------------------------------------------------- modèles
  const modeles: { type: DocumentType; nom: string; fichier: string; lignes: Ligne[] }[] = [
    {
      type: DocumentType.LEASE_HABITATION,
      nom: 'Contrat de bail — habitation',
      fichier: 'contrat-bail-habitation.docx',
      lignes: CONTRAT
    },
    {
      type: DocumentType.LEASE_COMMERCIAL,
      nom: 'Contrat de bail — professionnel',
      fichier: 'contrat-bail-professionnel.docx',
      lignes: BAIL_COMMERCIAL
    },
    { type: DocumentType.RENT_RECEIPT, nom: 'Quittance de loyer', fichier: 'quittance-loyer.docx', lignes: QUITTANCE }
  ];

  for (const m of modeles) {
    const deja = await prisma.documentTemplate.findFirst({
      where: { tenant_id: TENANT_ID, doc_type: m.type, status: { not: 'DELETED' } }
    });
    if (deja) {
      console.log(`  = modèle ${m.type} déjà présent : « ${deja.name} »`);
      continue;
    }

    const buffer = fabriquerDocx(m.lignes);
    const modele = await uploadTemplate(TENANT_ID, m.type, buffer, m.fichier, m.nom, acteur);
    await activateTemplate(TENANT_ID, modele.id, acteur);
    await setDefaultTemplate(TENANT_ID, modele.id, acteur);

    const vars = (modele.placeholders as unknown as string[]) || [];
    console.log(`  + ${m.nom} — ${Math.round(buffer.length / 1024)} Ko, ${vars.length} variables détectées`);
    console.log(`      ${vars.slice(0, 8).join(', ')}${vars.length > 8 ? '…' : ''}`);
  }

  // --------------------------------------------------------------- bilan
  const [nbModeles, nbReleves, nbBiensProp] = await Promise.all([
    prisma.documentTemplate.count({ where: { tenant_id: TENANT_ID, status: { not: 'DELETED' } } }),
    prisma.ownerStatement.count({ where: { tenantId: TENANT_ID } }),
    prisma.property.count({ where: { tenantId: TENANT_ID, ownerUserId: clientProprietaire.userId } })
  ]);
  console.log('\n──────────── BILAN ────────────');
  console.log(`Biens du propriétaire du portail : ${nbBiensProp}`);
  console.log(`Relevés propriétaire             : ${nbReleves}`);
  console.log(`Modèles de documents             : ${nbModeles}`);
}

main()
  .catch(e => {
    console.error('ÉCHEC :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // `utils/database` enregistre un `beforeExit` asynchrone qui refait de
    // l'I/O : sans sortie explicite, l'événement se redéclenche sans fin.
    process.exit(process.exitCode ?? 0);
  });
