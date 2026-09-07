/**
 * Test simple : envoi d'un message WhatsApp via Twilio pour vérifier la configuration.
 *
 * Utilisation:
 *   cd packages/api
 *   npx ts-node scripts/test-twilio-whatsapp.ts [numéro]
 *
 * Exemple:
 *   npx ts-node scripts/test-twilio-whatsapp.ts +2250103754238
 *
 * Variables d'environnement requises (fichier .env ou export):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM  (ex: +14155238886 pour le Sandbox)
 */
import 'dotenv/config';

const DEFAULT_TO = '+2250103754238';
const TEST_MESSAGE = 'Test ImmoTopia – Votre configuration Twilio WhatsApp fonctionne correctement.';

function normalizePhone(phone: string): string {
  const p = String(phone).trim().replace(/\s/g, '');
  if (p.startsWith('+')) return p;
  if (p.startsWith('00')) return '+' + p.slice(2);
  return p.startsWith('0') ? '+225' + p.slice(1) : '+' + p;
}

async function main() {
  const toRaw = process.argv[2] || DEFAULT_TO;
  const to = normalizePhone(toRaw);

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim().replace(/^whatsapp:/, '');

  if (!accountSid || !authToken || !from) {
    console.error('Configuration manquante. Définissez dans .env ou en variable d\'environnement :');
    console.error('  TWILIO_ACCOUNT_SID');
    console.error('  TWILIO_AUTH_TOKEN');
    console.error('  TWILIO_WHATSAPP_FROM');
    process.exit(1);
  }

  console.log('Envoi WhatsApp test...');
  console.log('  De :', `whatsapp:${from}`);
  console.log('  Vers:', `whatsapp:${to}`);
  console.log('  Message:', TEST_MESSAGE);
  console.log('');

  const twilio = require('twilio') as (sid: string, token: string) => { messages: { create: (opts: any) => Promise<{ sid: string; status: string }> } };
  const client = twilio(accountSid, authToken);

  try {
    const result = await client.messages.create({
      from: `whatsapp:${from}`,
      to: `whatsapp:${to}`,
      body: TEST_MESSAGE
    });
    console.log('OK – Message envoyé.');
    console.log('  SID:', result.sid);
    console.log('  Status:', result.status);
  } catch (err: any) {
    console.error('Erreur Twilio:', err?.message || err);
    if (err?.code) console.error('  Code:', err.code);
    if (err?.moreInfo) console.error('  More info:', err.moreInfo);
    process.exit(1);
  }
}

main();
