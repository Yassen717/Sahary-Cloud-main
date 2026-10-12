import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Sahary Cloud collects, uses and protects your personal information.",
};

const sections: LegalSection[] = [
  {
    id: "information-we-collect",
    title: "Information we collect",
    content: (
      <>
        <p>We collect the information needed to provide and secure the services:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <strong>Account information:</strong> name, email address, phone number (optional) and a
            hashed password.
          </li>
          <li>
            <strong>Billing information:</strong> invoices, payment status and amounts. Card details
            are handled by our payment processor and are not stored on our servers.
          </li>
          <li>
            <strong>Usage information:</strong> resource usage of your virtual machines (CPU, memory,
            storage, bandwidth) used for billing and capacity planning.
          </li>
          <li>
            <strong>Security information:</strong> sign-in times, IP addresses and device details used
            to protect your account and detect abuse.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How we use information",
    content: (
      <ul className="list-disc pl-6 space-y-1">
        <li>to create and operate your account and resources;</li>
        <li>to calculate usage, generate invoices and process payments;</li>
        <li>to send service emails such as verification, password reset and billing notices;</li>
        <li>to protect the platform against fraud, abuse and security threats;</li>
        <li>to measure and improve performance of our website and services.</li>
      </ul>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    content: (
      <p>
        We use strictly necessary, HTTP-only cookies to keep you signed in. Preferences such as the
        color theme may be stored in your browser&apos;s local storage. We do not use advertising
        cookies.
      </p>
    ),
  },
  {
    id: "sharing",
    title: "Sharing",
    content: (
      <p>
        We do not sell your personal information. We share it only with service providers that help
        us operate the platform (for example payment processing and email delivery), when required
        by law, or to protect the rights and safety of our users and infrastructure.
      </p>
    ),
  },
  {
    id: "retention",
    title: "Data retention",
    content: (
      <p>
        We keep account data while your account is active. Billing records are kept for as long as
        required by applicable accounting and tax rules. When you deactivate your account, data that
        is no longer needed is deleted or anonymized.
      </p>
    ),
  },
  {
    id: "security",
    title: "Security",
    content: (
      <p>
        Passwords are hashed, traffic is encrypted in transit and access to production systems is
        restricted. You can review and revoke your active sessions from your{" "}
        <Link href="/settings" className="text-primary hover:underline">
          account settings
        </Link>
        .
      </p>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights",
    content: (
      <p>
        You can view and update your profile at any time from your{" "}
        <Link href="/profile" className="text-primary hover:underline">
          profile page
        </Link>
        . To request a copy or deletion of your personal data, email{" "}
        <a href="mailto:support@saharycloud.com" className="text-primary hover:underline">
          support@saharycloud.com
        </a>
        .
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    content: (
      <p>
        We may update this policy from time to time. We will notify you of material changes by email
        or in the dashboard.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="Your privacy matters to us. This policy explains what we collect and why."
      lastUpdated="October 12, 2026"
      sections={sections}
    />
  );
}
