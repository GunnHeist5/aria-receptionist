import { LegalDoc, type LegalSection } from '@/components/reachwell/legal';

export const metadata = {
  title: 'Privacy Policy — Reachwell',
  description: 'How Reachwell collects, uses, and protects information, including call recordings handled by our AI receptionist service.',
};

const sections: LegalSection[] = [
  { heading: 'Information we collect', body: [
    'We collect information you provide and information generated when our service answers calls on your behalf:',
    { list: [
      'Account & business information — your name, business name, email, phone number, hours, services, and other details you submit when signing up.',
      'Billing information — processed by our payment provider (Stripe). We do not store full card numbers on our servers.',
      'Call data — recordings, transcripts, summaries, caller phone numbers, and details captured during calls handled by your AI receptionist.',
      'Usage & technical data — IP address, browser and device information, log data, and cookies when you use our website and dashboard.',
    ] },
  ] },
  { heading: 'How we use information', body: [
    'We use information to provide, operate, and improve the service — including configuring and running your AI receptionist, booking and routing calls, sending you call summaries, processing payments, providing support, ensuring security, and complying with legal obligations.',
  ] },
  { heading: 'Call recording, transcription & AI disclosure', body: [
    'Our service records and transcribes calls to provide answering, booking, and summary features and for quality and reliability. Calls may be handled by an automated AI voice agent.',
    'Call-recording and AI-disclosure laws vary by jurisdiction. Several U.S. states (including California, Connecticut, Florida, Illinois, Maryland, Massachusetts, Montana, Nevada, New Hampshire, Pennsylvania, and Washington) require all parties to consent to recording, and some states require disclosure that a caller is interacting with AI.',
    'As the business customer, you are responsible for ensuring that calls answered on your behalf are recorded and handled in compliance with applicable laws, including providing or enabling any required notices and consents.',
  ] },
  { heading: 'How we share information', body: [
    'We do not sell your personal information. We share it only as needed to run the service:',
    { list: [
      'Service providers — telephony/voice infrastructure, payment processing (Stripe), cloud hosting, and analytics, under contractual confidentiality obligations.',
      'Legal & safety — when required by law, subpoena, or to protect rights, safety, and the integrity of the service.',
      'Business transfers — in connection with a merger, acquisition, financing, or sale of assets, your information may be transferred to the successor entity.',
    ] },
  ] },
  { heading: 'AI and your data', body: [
    'We use call and account data to operate and improve your service. We do not sell your data and do not use the content of your calls to train third-party foundation models. Where we use third-party AI providers to process calls, they act as our service providers under terms that restrict use of your data to providing the service.',
  ] },
  { heading: 'Data retention', body: [
    'We retain information for as long as your account is active and as needed to provide the service, then for a reasonable period to meet legal, accounting, security, and dispute-resolution needs. You may request deletion of call recordings and account data as described below.',
  ] },
  { heading: 'Data security', body: [
    'We use administrative, technical, and physical safeguards — including encryption in transit and access controls — to protect information. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.',
  ] },
  { heading: 'Your rights & choices', body: [
    'Depending on where you live (for example, under the CCPA/CPRA in California or the GDPR in the EU/UK), you may have rights to access, correct, delete, or port your personal information, and to object to or restrict certain processing. To exercise these rights, contact us at the email below. You may also opt out of marketing emails at any time.',
  ] },
  { heading: 'Cookies & tracking', body: [
    'Our website and dashboard use cookies and similar technologies for essential functionality, preferences, and basic analytics. You can control cookies through your browser settings; disabling some cookies may affect functionality.',
  ] },
  { heading: 'Children\u2019s privacy', body: [
    'The service is intended for businesses and is not directed to children. We do not knowingly collect personal information from anyone under 18.',
  ] },
  { heading: 'International users', body: [
    'We are based in the United States and process information there. If you access the service from outside the U.S., you consent to the transfer and processing of your information in the United States and other countries where we or our providers operate.',
  ] },
  { heading: 'Changes to this policy', body: [
    'We may update this Privacy Policy from time to time. When we do, we will revise the “Last updated” date above and, where appropriate, provide additional notice. Your continued use of the service after changes take effect constitutes acceptance.',
  ] },
  { heading: 'Contact us', body: [
    'Questions about this policy or your data? Email us at sales@reachwellhq.com.',
  ] },
];

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy Policy"
      updated="June 26, 2026"
      intro={<p>This Privacy Policy explains how Reachwell (“Reachwell,” “we,” “us”) collects, uses, shares, and protects information in connection with our AI receptionist service and website. By using Reachwell, you agree to the practices described here.</p>}
      sections={sections}
    />
  );
}
