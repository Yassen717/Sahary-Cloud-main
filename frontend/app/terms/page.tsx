import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Sahary Cloud services.",
};

const sections: LegalSection[] = [
  {
    id: "acceptance",
    title: "Acceptance of terms",
    content: (
      <p>
        By creating an account or using Sahary Cloud services (including virtual machines, managed
        hosting and related tools), you agree to these Terms of Service. If you use the services on
        behalf of an organization, you confirm that you are authorized to accept these terms for it.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "Accounts",
    content: (
      <>
        <p>
          You must provide accurate registration information, verify your email address and keep
          your credentials confidential. You are responsible for all activity under your account.
        </p>
        <p>
          Notify us immediately at{" "}
          <a href="mailto:support@saharycloud.com" className="text-primary hover:underline">
            support@saharycloud.com
          </a>{" "}
          if you suspect unauthorized access.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    content: (
      <>
        <p>You agree not to use the services to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>violate any applicable law or the rights of others;</li>
          <li>distribute malware, send spam or run phishing campaigns;</li>
          <li>attack, scan or disrupt other networks or systems without authorization;</li>
          <li>mine cryptocurrency or run workloads that degrade shared infrastructure;</li>
          <li>host content that is illegal or infringes intellectual property.</li>
        </ul>
        <p>We may suspend resources that violate this policy or threaten platform stability.</p>
      </>
    ),
  },
  {
    id: "billing",
    title: "Billing and payment",
    content: (
      <>
        <p>
          Virtual machines are billed by usage at the hourly rates shown when you create them.
          Invoices are generated monthly and are due by the date shown on each invoice. You can
          review usage and invoices at any time on the{" "}
          <Link href="/billing" className="text-primary hover:underline">
            billing page
          </Link>
          .
        </p>
        <p>
          Overdue invoices may lead to suspension of running resources until the balance is settled.
        </p>
      </>
    ),
  },
  {
    id: "availability",
    title: "Service availability",
    content: (
      <p>
        We work to keep the platform available around the clock using solar generation and battery
        storage. Planned maintenance is announced in advance where possible. Except where a separate
        service level agreement applies, the services are provided on an &quot;as is&quot; and
        &quot;as available&quot; basis.
      </p>
    ),
  },
  {
    id: "data",
    title: "Your data",
    content: (
      <p>
        You retain ownership of the data you store on Sahary Cloud. You are responsible for keeping
        your own backups of critical data. How we handle personal information is described in our{" "}
        <Link href="/privacy" className="text-primary hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    ),
  },
  {
    id: "termination",
    title: "Suspension and termination",
    content: (
      <p>
        You may deactivate your account at any time from your account settings. We may suspend or
        terminate accounts that breach these terms, after notice where reasonably possible. Data on
        terminated resources may be permanently deleted.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    content: (
      <p>
        To the maximum extent permitted by law, Sahary Cloud is not liable for indirect, incidental
        or consequential damages, or for loss of data or profits, arising from your use of the
        services. Our total liability is limited to the amount you paid for the services in the
        three months before the claim.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    content: (
      <p>
        We may update these terms from time to time. Material changes will be communicated by email
        or in the dashboard before they take effect. Continued use of the services after changes
        take effect means you accept the updated terms.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      description="Please read these terms carefully before using Sahary Cloud."
      lastUpdated="October 12, 2026"
      sections={sections}
    />
  );
}
