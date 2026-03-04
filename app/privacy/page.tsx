// app/privacy/page.tsx

export const metadata = {
  title: "Privacy Policy | Life CFO",
};

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 prose prose-neutral">
      <h1>Privacy Policy</h1>

      <p><strong>Effective Date:</strong> [04/03/2026]</p>

      <p>
        Life CFO ("we", "us", or "our") provides a financial decision-support
        application designed to help households manage financial information.
      </p>

      <h2>Financial Information (via Plaid)</h2>
      <p>
        If you choose to connect financial accounts, we use Plaid Inc. ("Plaid")
        to access certain financial data on your behalf.
      </p>
      <p>
        We do not collect or store your banking login credentials. Your
        credentials are entered directly into Plaid Link.
      </p>

      <h2>Data Security</h2>
      <p>
        All data is encrypted in transit using TLS 1.2 or higher. Data stored
        in our database is encrypted at rest by our infrastructure provider.
      </p>

      <h2>Contact</h2>
      <p>
        For questions about this Privacy Policy, contact:
        <br />
        admin@life-cfo.com
      </p>
    </main>
  );
}