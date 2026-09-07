function getFormFieldAsString(
  formData: FormData,
  key: string,
): string | null {
  const value: FormDataEntryValue | null = formData.get(key);
  return typeof value === 'string' ? value : null;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildTwiMLMessage(message: string): string {
  const escaped: string = escapeXml(message);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escaped}</Message>
</Response>`;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const formData: FormData = await request.formData();

    const from: string | null = getFormFieldAsString(formData, 'From');
    const body: string | null = getFormFieldAsString(formData, 'Body');
    const messageSid: string | null = getFormFieldAsString(formData, 'MessageSid');

    console.log('[Twilio WhatsApp webhook] From:', from ?? '(missing)');
    console.log('[Twilio WhatsApp webhook] Body:', body ?? '(missing)');
    console.log('[Twilio WhatsApp webhook] MessageSid:', messageSid ?? '(missing)');

    const confirmationMessage: string =
      'Merci pour votre message ! Un conseiller ImmoTopia vous répondra bientôt.';
    const twiml: string = buildTwiMLMessage(confirmationMessage);

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
    });
  } catch (error: unknown) {
    console.error('[Twilio WhatsApp webhook] Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

