/**
 * Shared data and HTML builders for payment declaration emails (Gmail-responsive).
 */

export interface PaymentDeclarationEmailData {
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  mobileOperator?: string | null;
  transactionPhone?: string | null;
  reference?: string | null;
  proofFileUrl?: string | null;
  notes?: string | null;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  BANK_TRANSFER: 'Virement bancaire',
  CHECK: 'Chèque',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'Carte bancaire'
};

const MOBILE_OPERATOR_LABELS: Record<string, string> = {
  ORANGE: 'Orange Money',
  MTN: 'MTN Mobile Money',
  MOOV: 'Moov Money',
  WAVE: 'Wave',
  OTHER: 'Autre'
};

export function getPaymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] || method;
}

export function getMobileOperatorLabel(op: string | null | undefined): string {
  if (!op) return '';
  return MOBILE_OPERATOR_LABELS[op] || op;
}

/**
 * Gmail-compatible: table-based layout, inline styles, max-width 600px.
 * Renders a row only when value is present.
 */
function row(label: string, value: string): string {
  if (!value) return '';
  return `
    <tr>
      <td style="padding:10px 14px; border-bottom:1px solid #e8e8e8; color:#666; font-size:14px; width:45%;">${escapeHtml(label)}</td>
      <td style="padding:10px 14px; border-bottom:1px solid #e8e8e8; color:#222; font-size:14px; font-weight:500;">${escapeHtml(value)}</td>
    </tr>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Build the payment details card HTML (amount, date, method + Mobile Money fields + reference, proof, notes).
 */
export function buildPaymentDetailsCard(data: PaymentDeclarationEmailData): string {
  const amountStr = new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(data.amount);
  const methodLabel = getPaymentMethodLabel(data.paymentMethod);
  const isMobileMoney = (data.paymentMethod || '').toUpperCase() === 'MOBILE_MONEY';

  const rows: string[] = [];
  rows.push(row('Montant', `${amountStr} FCFA`));
  rows.push(row('Date de paiement', data.paymentDate || ''));
  rows.push(row('Méthode de paiement', methodLabel));

  if (isMobileMoney) {
    const opLabel = getMobileOperatorLabel(data.mobileOperator || undefined);
    if (opLabel) rows.push(row('Opérateur mobile', opLabel));
    if (data.transactionPhone) rows.push(row('Numéro de téléphone (transaction)', data.transactionPhone));
  }

  if (data.reference) rows.push(row('Référence / Numéro de transaction', data.reference));
  if (data.notes) rows.push(row('Notes', data.notes));

  const tableRows = rows.filter(Boolean).join('');
  if (!tableRows) return '';

  return `
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:100%; border-collapse:collapse; border-radius:8px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.08); background:#fff;">
    <thead>
      <tr>
        <th colspan="2" style="padding:14px 14px; background:#2563eb; color:#fff; font-size:15px; font-weight:600; text-align:left;">
          Détails du paiement
        </th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>`;
}

/**
 * Wrapper for email body: responsive container (Gmail-safe).
 */
export function emailWrapper(content: string): string {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ImmoTopia</title>
</head>
<body style="margin:0; padding:0; background:#f4f4f5; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; font-size:15px; line-height:1.5; color:#333;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;">
    <tr>
      <td style="padding:24px 16px;" align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; margin:0 auto;">
          <tr>
            <td style="padding:28px 24px; background:#ffffff; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px; text-align:center; font-size:12px; color:#888;">
              ImmoTopia – Gestion locative
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
