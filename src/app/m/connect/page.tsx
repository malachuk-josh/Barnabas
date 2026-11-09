import { BlockView } from "@/components/site/Blocks";
import { ContactForm, PrayerForm } from "@/components/site/PublicForms";
import { memberContext } from "../member-context";

export const dynamic = "force-dynamic";

/** Plan a visit (the guest card), a prayer request (to Shepherding) and a contact form. */
export default async function MemberConnect() {
  const { render } = await memberContext();
  return (
    <>
      <BlockView block={{ id: "app-visit", type: "visit", heading: "Plan a visit", showForm: true }} ctx={render} />
      <section className="cs-card" aria-labelledby="pray-h">
        <h2 id="pray-h">Prayer request</h2>
        <p className="cs-muted">Your request goes to our shepherding team.</p>
        <PrayerForm />
      </section>
      <section className="cs-card" aria-labelledby="contact-h">
        <h2 id="contact-h">Contact us</h2>
        <ContactForm page="app" />
      </section>
    </>
  );
}
