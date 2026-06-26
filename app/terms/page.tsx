import { LegalDoc, type LegalSection } from '@/components/reachwell/legal';

export const metadata = {
  title: 'Terms of Service — Reachwell',
  description: 'The terms governing your use of the Reachwell AI receptionist service, including billing, customer responsibilities, and call-recording compliance.',
};

const sections: LegalSection[] = [
  { heading: 'The service', body: [
    'Reachwell provides an AI-powered phone receptionist that answers calls on behalf of your business, captures caller information, books appointments, routes calls, and sends you summaries. Features may change as we improve the service.',
  ] },
  { heading: 'Eligibility & accounts', body: [
    'You must be at least 18 and able to form a binding contract to use Reachwell, and you must use it for business purposes. You are responsible for the accuracy of the information you provide and for all activity under your account.',
  ] },
  { heading: 'Subscription, billing & cancellation', body: [
    { list: [
      'Reachwell is offered on a recurring subscription (currently $297/month) plus any applicable one-time setup fee, billed in advance through our payment processor.',
      'Subscriptions renew automatically each billing period until cancelled. You authorize us to charge your payment method on each renewal.',
      'You may cancel at any time; cancellation takes effect at the end of the current billing period. Except where required by law, fees already paid are non-refundable.',
      'We may change pricing on a prospective basis with reasonable notice before your next renewal.',
    ] },
  ] },
  { heading: 'Your responsibilities & compliance', body: [
    'You are solely responsible for using Reachwell lawfully. In particular, you are responsible for compliance with all laws that apply to calls answered on your behalf, including:',
    { list: [
      'Call-recording and wiretapping laws, including one-party and all-party (two-party) consent requirements that vary by state.',
      'Laws requiring disclosure that a caller is interacting with an automated or AI voice agent.',
      'Telemarketing, robocall, and consumer-protection laws (e.g., the TCPA) for any outbound or promotional use.',
      'Providing accurate business information and appropriate disclosures or consent language for your callers.',
    ] },
    'We provide configurable disclosure and consent tools, but you are responsible for enabling and maintaining the settings appropriate to your jurisdiction and use case.',
  ] },
  { heading: 'Acceptable use', body: [
    'You agree not to use Reachwell for unlawful, fraudulent, harassing, or abusive purposes; to violate others\u2019 rights; to send spam or unlawful robocalls; to attempt to disrupt or reverse-engineer the service; or to misrepresent your identity or authority. We may suspend or terminate accounts that violate these Terms.',
  ] },
  { heading: 'Call data & ownership', body: [
    'As between you and Reachwell, you own the business and caller data captured for your account. You grant us a limited license to process that data to provide, secure, and improve the service. We process call recordings and transcripts as described in our Privacy Policy.',
  ] },
  { heading: 'Third-party services', body: [
    'Reachwell relies on third-party providers (such as telephony/voice infrastructure, payment processing, and cloud hosting). Your use of the service may be subject to those providers\u2019 terms, and we are not responsible for their acts or omissions.',
  ] },
  { heading: 'Service availability', body: [
    'We work to keep the service reliable but do not guarantee uninterrupted or error-free operation. The service may be unavailable due to maintenance, provider outages, or factors outside our control, and AI systems may occasionally make mistakes or mishandle a call.',
  ] },
  { heading: 'Disclaimers', body: [
    'The service is provided “as is” and “as available,” without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, and non-infringement. Reachwell does not provide legal advice; nothing in the service or these Terms is a substitute for advice from your own counsel.',
  ] },
  { heading: 'Limitation of liability', body: [
    'To the maximum extent permitted by law, Reachwell will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for lost profits, revenue, data, or business, arising from your use of the service. Our total liability for any claim relating to the service will not exceed the amount you paid us in the three (3) months before the event giving rise to the claim.',
  ] },
  { heading: 'Indemnification', body: [
    'You agree to indemnify and hold harmless Reachwell and its affiliates from claims, damages, and expenses (including reasonable legal fees) arising from your use of the service, your content or calls, or your violation of these Terms or applicable law — including call-recording, consent, or telemarketing laws.',
  ] },
  { heading: 'Termination', body: [
    'You may stop using the service and cancel at any time. We may suspend or terminate your access if you violate these Terms, fail to pay, or create risk or legal exposure. Provisions that by their nature should survive termination will survive.',
  ] },
  { heading: 'Governing law & disputes', body: [
    'These Terms are governed by the laws of the Commonwealth of Pennsylvania, without regard to its conflict-of-laws rules. Any dispute will be resolved in the state or federal courts located in Pennsylvania, unless otherwise required by law, and you and Reachwell consent to that jurisdiction.',
  ] },
  { heading: 'Changes to these Terms', body: [
    'We may update these Terms from time to time. We will revise the “Last updated” date above and, where appropriate, provide additional notice. Continued use of the service after changes take effect constitutes acceptance of the updated Terms.',
  ] },
  { heading: 'Contact us', body: [
    'Questions about these Terms? Email us at sales@reachwellhq.com.',
  ] },
];

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of Service"
      updated="June 26, 2026"
      intro={<p>These Terms of Service (“Terms”) govern your access to and use of the Reachwell AI receptionist service and website (the “service”) provided by Reachwell (“Reachwell,” “we,” “us”). By using the service, you agree to these Terms. If you do not agree, do not use the service.</p>}
      sections={sections}
    />
  );
}
