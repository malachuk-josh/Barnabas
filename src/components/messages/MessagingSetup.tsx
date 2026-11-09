export type ChannelStatus = { configured: boolean; missing: string[]; from?: string };

const APP = "https://barnabas-three.vercel.app";

/**
 * The "not configured" state for text and email: what's missing (variable names only, never values) and
 * the exact steps to turn each on.
 */
export function MessagingSetup({ sms, email, focus }: { sms: ChannelStatus; email: ChannelStatus; focus?: "sms" | "email" }) {
  const show = (c: "sms" | "email") => !focus || focus === c;
  return (
    <section className="card stack setup-card" aria-labelledby="msg-setup-title" data-no-pull>
      <div>
        <span className="eyebrow">Setup</span>
        <h2 id="msg-setup-title" style={{ fontSize: "1.25rem" }}>
          {sms.configured || email.configured ? "Finish setting up delivery" : "Text and email delivery aren't set up yet"}
        </h2>
        <p className="small muted">Drafts stay here until delivery is set up. Nothing is sent without someone tapping Send on that draft.</p>
      </div>
      <div className="setup-grid">
        {show("sms") && (
          <div className="stack" style={{ gap: 8 }}>
            <h3 className="setup-h">
              Text messages (Twilio) <span className={`badge${sms.configured ? " badge-ok" : " badge-warn"}`}>{sms.configured ? `Ready${sms.from ? ` · ${sms.from}` : ""}` : "Not set up"}</span>
            </h3>
            {!sms.configured && (
              <ol className="setup-steps small">
                <li>
                  Create a Twilio account at <a href="https://www.twilio.com/try-twilio">twilio.com/try-twilio</a> and buy a local number with SMS (Phone Numbers → Buy a number).
                </li>
                <li>
                  For US texting, register the church for A2P 10DLC (Messaging → Regulatory compliance → A2P 10DLC): a brand (the church, with its EIN) and a campaign (use case &ldquo;Charity/non-profit&rdquo; or &ldquo;Mixed&rdquo;, with sample reminder texts and how people opt in). Carriers block unregistered texts. See{" "}
                  <a href="https://www.twilio.com/docs/messaging/compliance/a2p-10dlc">Twilio&apos;s A2P 10DLC guide</a>.
                </li>
                <li>Put the number in a Messaging Service (Messaging → Services) linked to the campaign, or use the number directly.</li>
                <li>
                  In Vercel, set{" "}
                  {sms.missing.map((m, i) => (
                    <span key={m}>
                      {i > 0 && ", "}
                      <code>{m}</code>
                    </span>
                  ))}{" "}
                  (from the Twilio Console home page), and <code>APP_URL={APP}</code>, then redeploy.
                </li>
                <li>
                  On the number (or Messaging Service), set &ldquo;A message comes in&rdquo; to <code>{APP}/api/messages/twilio/inbound</code> (HTTP POST) so STOP replies reach Barnabas. Delivery status comes back on its own.
                </li>
              </ol>
            )}
          </div>
        )}
        {show("email") && (
          <div className="stack" style={{ gap: 8 }}>
            <h3 className="setup-h">
              Email (Resend) <span className={`badge${email.configured ? " badge-ok" : " badge-warn"}`}>{email.configured ? `Ready${email.from ? ` · ${email.from}` : ""}` : "Not set up"}</span>
            </h3>
            {!email.configured && (
              <ol className="setup-steps small">
                <li>
                  Create a Resend account at <a href="https://resend.com/signup">resend.com</a> and add the church&apos;s domain (Domains → Add domain). Add the DNS records it shows (SPF, DKIM) where the domain is hosted and wait for &ldquo;Verified&rdquo;. See{" "}
                  <a href="https://resend.com/docs/dashboard/domains/introduction">Resend&apos;s domain guide</a>.
                </li>
                <li>Create an API key with &ldquo;Sending access&rdquo; (API Keys → Create).</li>
                <li>
                  In Vercel, set{" "}
                  {email.missing.map((m, i) => (
                    <span key={m}>
                      {i > 0 && ", "}
                      <code>{m}</code>
                    </span>
                  ))}{" "}
                  (for example <code>RESEND_FROM=Mount Greylock Baptist Church &lt;office@yourdomain.org&gt;</code>), then redeploy.
                </li>
                <li>
                  For delivery status, add a webhook (Webhooks → Add endpoint) at <code>{APP}/api/messages/resend</code> with the email events, and set its signing secret as <code>RESEND_WEBHOOK_SECRET</code>.
                </li>
              </ol>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export const DRAFT_TABS = [
  { href: "/drafts", label: "Waiting for you", exact: true },
  { href: "/drafts/log", label: "Send log" },
];
