export default function PrivacyPage() {
  return (
    <div className="page-bg min-h-screen">
      <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-foreground">
        <h1 className="mb-2 text-2xl font-bold">Privacy Policy</h1>
        <p className="mb-8 text-muted-foreground">Last updated: November 2026</p>

        <section className="mb-6">
          <h2 className="mb-2 text-base font-semibold">What we collect</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">FPL email and password</span> — sent over HTTPS to our
              server transiently during authentication. We forward them to Fantasy Premier League's identity platform
              and discard them immediately. They are never logged or stored.
            </li>
            <li>
              <span className="font-medium text-foreground">FPL session tokens</span> — the access token is stored in
              your browser's localStorage; the refresh token is stored in an HttpOnly cookie scoped to the
              authentication endpoint. Both expire automatically.
            </li>
            <li>
              <span className="font-medium text-foreground">FPL Entry ID</span> — stored in your browser's localStorage.
              Never sent to us independently of a squad data request.
            </li>
            <li>
              <span className="font-medium text-foreground">Squad and player data</span> — fetched from Fantasy Premier
              League on your behalf and cached in server memory for a short period (seconds to hours depending on data
              type). Not persisted to any database.
            </li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-base font-semibold">What we don't collect</h2>
          <p className="text-muted-foreground">
            We have no database. No personal data is stored server-side after your authentication request completes. We
            do not use analytics, advertising, or tracking scripts.
          </p>
          <p className="mt-2 text-muted-foreground">
            For security, our server logs each sign-in, session refresh and sign-out: the time, whether it succeeded,
            and an anonymous ID that links events from the same connection until the server restarts. These logs never
            contain your email, password, session tokens or IP address.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-base font-semibold">Lawful basis</h2>
          <p className="text-muted-foreground">
            We process your credentials and squad data on the basis of{" "}
            <span className="text-foreground">performance of contract</span> — you provide your credentials in order to
            receive live squad analysis, which is the service you have requested.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-base font-semibold">Third-party services</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              Authentication is performed via Fantasy Premier League's identity platform (account.premierleague.com).
              Your use of FPL is governed by the{" "}
              <a
                href="https://fantasy.premierleague.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                FPL Privacy Policy
              </a>
              .
            </li>
            <li>
              If Premier League standings are shown, we query football-data.org using an API key. See the{" "}
              <a
                href="https://www.football-data.org/pages/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                football-data.org terms
              </a>
              .
            </li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-base font-semibold">Your rights</h2>
          <p className="text-muted-foreground">
            Since we store nothing server-side, there is no personal data for us to delete or export on your behalf. To
            remove your local data, clear your browser's localStorage and cookies. To disconnect your FPL account, use
            the Disconnect button in Settings.
          </p>
          <p className="mt-2 text-muted-foreground">
            For any data protection queries, contact:{" "}
            <a href="mailto:privacy@eoinhasty.dev" className="underline hover:text-foreground">
              privacy@eoinhasty.dev
            </a>
          </p>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-base font-semibold">Age requirement</h2>
          <p className="text-muted-foreground">
            This service is intended for users aged 16 and over (or the age of digital consent in your jurisdiction). By
            using this app, you confirm you meet this requirement.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-base font-semibold">Disclaimer</h2>
          <p className="text-muted-foreground">
            FPL Helper is not affiliated with or endorsed by Fantasy Premier League or the Premier League. All FPL data
            and player images remain the property of their respective owners.
          </p>
        </section>

        <a href="/" className="text-xs text-muted-foreground underline hover:text-foreground">
          ← Back to FPL Helper
        </a>
      </div>
    </div>
  );
}
