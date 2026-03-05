// app/privacy/page.tsx

export const metadata = {
  title: "Privacy Policy | Life CFO",
};

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 prose prose-neutral">
      <h1>Privacy Policy</h1>

      <p>
        <strong>Effective Date:</strong> 04 March 2026
      </p>

      <p>
        Life CFO ("Life CFO", "we", "us", or "our") provides a financial
        decision-support application designed to help households understand and
        manage financial information.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account information (optional):</strong> If you choose to
          connect accounts, we receive certain financial data via Plaid, such as
          account names, account type, balances, and transaction details
          (including merchant/description, amount, date, and category data where
          available).
        </li>
        <li>
          <strong>Information you provide:</strong> Details you enter in the app
          (for example, household names, notes, or decisions).
        </li>
        <li>
          <strong>Basic technical data:</strong> Limited technical information
          needed to run and secure the service (for example, log events related
          to authentication and error diagnostics).
        </li>
      </ul>

      <h2>Financial information (via Plaid)</h2>
      <p>
        If you choose to connect financial accounts, we use Plaid Inc. ("Plaid")
        to link your accounts and retrieve financial data on your behalf.
      </p>
      <p>
        We do <strong>not</strong> collect or store your banking login
        credentials. Your credentials are entered directly into Plaid Link and
        handled by Plaid.
      </p>

      <h2>How we use information</h2>
      <ul>
        <li>To provide app functionality, including displaying accounts and transactions.</li>
        <li>To improve reliability, prevent abuse, and troubleshoot issues.</li>
        <li>To communicate with you about important service or security updates.</li>
      </ul>

      <h2>How we share information</h2>
      <p>
        We do not sell your personal information. We share information only as
        needed to operate the service, including:
      </p>
      <ul>
        <li>
          <strong>Plaid</strong> (account connection and data retrieval).
        </li>
        <li>
          <strong>Infrastructure providers</strong> used to host and operate the
          service (for example, database and application hosting).
        </li>
        <li>
          <strong>Legal requirements</strong> where we must comply with law,
          regulation, or valid legal process.
        </li>
      </ul>

      <h2>Data retention and deletion</h2>
      <p>
        We retain information for as long as your account is active or as needed
        to provide the service. You can request deletion of your account and
        associated data by contacting us at the email below. If you disconnect a
        linked account, we will stop retrieving new data from that connection.
      </p>

      <h2>Security</h2>
      <p>
        All data is encrypted in transit using TLS 1.2 or higher. Data stored in
        our database is encrypted at rest by our infrastructure providers. Access
        to data is restricted using role-based controls and household-scoped
        permissions.
      </p>

      <h2>International processing</h2>
      <p>
        Our service providers may process data in countries other than your own.
        We take reasonable steps to ensure appropriate safeguards are in place.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>You can choose whether to connect accounts via Plaid.</li>
        <li>You can disconnect accounts at any time within the app.</li>
        <li>You can request access, correction, or deletion by contacting us.</li>
      </ul>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy from time to time. If we make material changes,
        we will update the effective date above and, where appropriate, notify you
        within the app.
      </p>

      <h2>Contact</h2>
      <p>
        For questions about this Privacy Policy, contact:
        <br />
        <a href="mailto:admin@life-cfo.com">admin@life-cfo.com</a>
      </p>
    </main>
  );
}