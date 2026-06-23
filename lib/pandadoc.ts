// PandaDoc API helper — creates and sends a contractor agreement from a template.
//
// Required env vars:
//   PANDADOC_API_KEY        — from PandaDoc Settings → API
//   PANDADOC_TEMPLATE_ID    — UUID of the contractor agreement template
//   PANDADOC_RECIPIENT_ROLE — role label inside the template (default: "Contractor")
//
// If either key is missing the function returns { sent: false } so callers can
// fall back to instructing the owner to send manually.

export interface ContractResult {
  sent: boolean;
  docId?: string;
  error?: string;
}

export async function sendContractorAgreement(params: {
  contractorId: string;
  name: string;
  email: string;
}): Promise<ContractResult> {
  const apiKey     = process.env.PANDADOC_API_KEY?.trim();
  const templateId = process.env.PANDADOC_TEMPLATE_ID?.trim();
  const role       = process.env.PANDADOC_RECIPIENT_ROLE?.trim() || 'Client';

  if (!apiKey || !templateId) {
    return { sent: false, error: 'PANDADOC_API_KEY or PANDADOC_TEMPLATE_ID not configured' };
  }

  const [firstName, ...rest] = params.name.trim().split(' ');
  const lastName = rest.join(' ') || '-';

  // Telegram deep link goes in the signing email so the rep connects without
  // the owner forwarding anything. Onboarding still waits for owner approval.
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim();
  const deepLink = botUsername
    ? `\n\nAfter signing, tap here to connect with our team on Telegram so we can get you set up:\nhttps://t.me/${botUsername}?start=ctr_${params.contractorId}`
    : '';

  // Step 1 — create document from template
  const createRes = await fetch('https://api.pandadoc.com/public/v1/documents', {
    method: 'POST',
    headers: { 'Authorization': `API-Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Reachwell Contractor Agreement — ${params.name}`,
      template_uuid: templateId,
      recipients: [{ email: params.email, first_name: firstName, last_name: lastName, role }],
      metadata: { contractor_id: params.contractorId },
      // These tokens populate merge fields inside the template if you've added them.
      // Add/remove based on what merge fields your template actually uses.
      tokens: [
        { name: 'Contractor.Name',  value: params.name },
        { name: 'Contractor.Email', value: params.email },
      ],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    console.error('[pandadoc] create failed:', err);
    return { sent: false, error: `Create failed: ${err.slice(0, 200)}` };
  }

  const doc = await createRes.json();
  const docId: string = doc.uuid ?? doc.id;
  if (!docId) return { sent: false, error: 'No document ID in response' };

  // PandaDoc needs ~2s to process the document before it can be sent
  await new Promise(r => setTimeout(r, 2000));

  // Step 2 — send for signing
  const sendRes = await fetch(`https://api.pandadoc.com/public/v1/documents/${docId}/send`, {
    method: 'POST',
    headers: { 'Authorization': `API-Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Hi ${firstName}, please sign your Reachwell contractor agreement to get started.${deepLink}`,
      silent: false,
    }),
  });

  if (!sendRes.ok) {
    const err = await sendRes.text();
    console.error('[pandadoc] send failed:', err);
    return { sent: false, error: `Send failed: ${err.slice(0, 200)}` };
  }

  return { sent: true, docId };
}
