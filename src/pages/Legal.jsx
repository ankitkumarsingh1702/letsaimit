import "../styles/legal.css";

const POLICY_UPDATED = "10 November 2026";
const POLICY_LINKS = [
  { key: "privacy", label: "Privacy", href: "/privacy/" },
  { key: "terms", label: "Terms", href: "/terms/" },
  { key: "refunds", label: "Fees & cancellations", href: "/refunds/" },
];

function PolicySection({ title, children }) {
  return (
    <section className="legal-section">
      <h2>{title}</h2>
      <div className="legal-section-copy">{children}</div>
    </section>
  );
}

function PolicyContact() {
  return (
    <aside className="legal-contact" aria-labelledby="legal-contact-heading">
      <h2 id="legal-contact-heading">Talk to us.</h2>
      <p>For a policy question, payment issue or privacy request.</p>
      <address>
        <span>LetsAimIt · Nambiar Ellegenza, Bengaluru</span>
        <a href="mailto:dhirajkmishra184@gmail.com">dhirajkmishra184@gmail.com</a>
        <a href="tel:+918868886074">+91 88688 86074</a>
      </address>
    </aside>
  );
}

function PolicyLayout({ page, title, intro, summary, children }) {
  const updated = page === "privacy" ? { label: "10 November 2026", date: "2026-11-10" } :
    { label: POLICY_UPDATED, date: "2026-11-10" };
  return (
    <div className="legal-page wrap">
      <header className="legal-hero">
        <p className="legal-eyebrow">Good to know</p>
        <h1 className="display">{title}</h1>
        <p className="legal-intro">{intro}</p>
        <p className="legal-updated">
          Updated <time dateTime={updated.date}>{updated.label}</time>
        </p>
      </header>
      <nav className="legal-nav" aria-label="Policies">
        {POLICY_LINKS.map((link) => (
          <a
            key={link.key}
            href={link.href}
            aria-current={page === link.key ? "page" : undefined}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <div className="legal-summary">{summary}</div>
      <article className="legal-body" aria-label={`${title} Policy details`}>
        {children}
      </article>
      <PolicyContact />
    </div>
  );
}

function Privacy() {
  return (
    <PolicyLayout
      page="privacy"
      title="Your privacy."
      intro="Clear choices. Private details."
      summary={
        <p>
          We use your details to answer your enquiry and organise the programme.
          We do not sell your personal information.
        </p>
      }
    >
      <PolicySection title="What you share">
        <p>
          Trial requests include the parent or guardian’s name, email address,
          phone number and country code, community, chosen sport and the child’s
          age group. Child registration also asks for the child’s name, address
          and an optional note for the coach. School and society enquiries ask
          about your organisation, role and requirements. We keep the details,
          messages and consent choices you submit with your request.
        </p>
        <p>
          Please do not put medical records, identity documents or payment-card
          details in these forms or in your note for the coach. If further
          information is needed for participation, we explain this before asking.
        </p>
      </PolicySection>
      <PolicySection title="Why we need it">
        <p>
          We use the information to reply, arrange a trial, manage enrolment and
          send relevant session updates. Information about a child is used for
          their participation and care, not for advertising profiles.
        </p>
      </PolicySection>
      <PolicySection title="Parents decide">
        <p>
          A parent or legal guardian must submit a child’s details. Our trial
          and registration forms ask for consent to use those details and
          contact you about the request. School and society enquiries use the
          adult contact’s consent.
        </p>
        <p>
          Permission for public photos or videos is separate and optional.
          Joining the programme does not mean agreeing to publicity.
        </p>
      </PolicySection>
      <PolicySection title="Forms and messages">
        <p>
          Trial requests and child registrations are completed inside LetsAimIt
          and saved to a private register hosted by Supabase. The website shows
          confirmation only after it receives a saved receipt.
        </p>
        <p>
          Parents and invited staff sign in with Google. We receive their Google account ID
          and, where available, their name, email address and profile photo. We
          use these details to link a parent to their own submitted requests,
          check staff access and display the signed-in account. One account can
          be used as both a parent and an approved team member. This sign-in does not give us access to Gmail messages or
          mailboxes. Parent registration responses stay in the private Supabase
          register; they are not stored in Google Forms or Sheets by this sign-in.
        </p>
        <p>Approved admins receive email alerts with the details needed to review
          a new trial or enrolment request, and activity summaries. Review links
          require admin sign-in before a decision is saved. An accepted request
          does not mean a payment has been made.</p>
        <p>
          For approved paid enrolments, we share the parent’s name, contact email,
          phone number and invoice amount with Razorpay to prepare a secure payment
          link. We keep invoice references, payment status and refund status in
          our private register, and email invoices, receipts and unpaid reminders.
          Card details and payment authentication stay with Razorpay.
        </p>
        <p>
          WhatsApp is an optional next step after a saved parent request. School
          and society enquiries may use a prepared WhatsApp message. Opening
          WhatsApp does not send a message: you choose whether to press Send.
          WhatsApp and staff sign-in services have their own privacy terms.
        </p>
        <p>
          We do not publish form responses. Access is limited to the people and
          service providers who need it to handle your enquiry or programme,
          or where disclosure is required by law.
        </p>
      </PolicySection>
      <PolicySection title="Website analytics">
        <p>
          Usage analytics are off until configured. Where offered, they run only
          after you choose to allow them. Enquiry text, names, email addresses,
          phone numbers, addresses, notes and children’s details are excluded
          from our analytics events. You can
          decline analytics and still use every form.
        </p>
      </PolicySection>
      <PolicySection title="Keeping it safe">
        <p>
          We use restricted access and reasonable safeguards for records in our
          control. We keep information only as long as needed for your enquiry,
          participation, necessary business records or legal obligations. We
          remove or anonymise information when it is no longer needed.
        </p>
      </PolicySection>
      <PolicySection title="Your choices">
        <p>
          Contact us to request access, a correction or deletion, withdraw your
          consent, or stop non-essential contact. We may need to verify the
          request. Some records must be kept to meet legal obligations; we will
          explain if that applies.
        </p>
        <p>
          Withdrawing information needed to arrange or run a session may mean
          we cannot provide that service. Your consumer rights remain unchanged.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}

function Terms() {
  return (
    <PolicyLayout
      page="terms"
      title="Before you join."
      intro="A few clear terms."
      summary={
        <p>
          Your child’s first session is free. Paid enrolment begins when you
          choose to join and we confirm the place.
        </p>
      }
    >
      <PolicySection title="Our programme">
        <p>
          These terms cover LetsAimIt football and basketball training, related
          fitness activities and match days. Community sessions are for children
          aged 5–14 at Nambiar Ellegenza and Nambiar Bellezea, Bengaluru.
        </p>
        <p>
          School consultancy and society partnerships follow the scope and
          terms agreed with that organisation.
        </p>
      </PolicySection>
      <PolicySection title="Try a session">
        <p>
          Request a free first session before choosing paid enrolment. We
          confirm the suitable group, location and time before you attend.
          Sending an enquiry does not reserve a place or start paid enrolment.
        </p>
      </PolicySection>
      <PolicySection title="Joining and payment">
        <p>
          A parent or legal guardian completes enrolment. We share the agreed
          programme period, fee and schedule before payment. Your child’s place
          is confirmed after payment and our confirmation.
        </p>
        <p>
          Monthly invoices are issued on the 1st and are due by the 5th. Your
          first invoice is due four days after approval. You pay each invoice
          through Razorpay; this does not authorise an automatic debit. The form
          shows the actual monthly amount before you agree. A ₹1 team payment
          does not become a ₹600 payment without new consent.
        </p>
        <p>
          Where enabled in your agreed payment details, a ₹100 late fee applies
          for each overdue day after the due date. Late fees appear separately.
          They are previews only during ₹1 team testing. Free trials have no fee.
        </p>
        <p>
          Once paid enrolment is confirmed, fees are non-refundable for personal
          absence, a change of mind or withdrawal. This includes leaving after
          one, two or three sessions. See the{" "}
          <a href="/refunds/">fees and cancellation policy</a> for provider
          cancellations, payment errors and your statutory rights.
        </p>
      </PolicySection>
      <PolicySection title="Safe participation">
        <p>
          Children must follow the coach’s instructions, use suitable equipment
          and treat others with care. Tell the coach privately about a safety
          need before participation. Sport involves physical activity and a
          risk of injury; this does not remove our duty of care or your legal
          rights.
        </p>
      </PolicySection>
      <PolicySection title="Session changes">
        <p>
          Weather, unsafe ground conditions or other safety concerns may require
          a session to change or be cancelled. We will inform parents and apply
          the <a href="/refunds/">cancellation policy</a>. Event listings marked
          “Planned” are provisional until the venue and time are confirmed.
        </p>
      </PolicySection>
      <PolicySection title="Privacy and photos">
        <p>
          The <a href="/privacy/">privacy policy</a> explains how we use your
          information. Public use of a child’s photo or video requires separate,
          optional permission from their parent or legal guardian.
        </p>
      </PolicySection>
      <PolicySection title="Your rights">
        <p>
          Indian law applies. These terms do not exclude rights or remedies
          available under applicable consumer law. Changes apply going forward
          and do not remove rights attached to an existing booking.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}

function Refunds() {
  return (
    <PolicyLayout
      page="refunds"
      title="Fees & refunds."
      intro="Know where you stand."
      summary={
        <p>
          Once you pay and join, fees are non-refundable for missed sessions or
          withdrawal—even after one session. Statutory rights still apply.
        </p>
      }
    >
      <PolicySection title="Try before joining">
        <p>
          Your child’s first session is free. Use it to experience the programme
          before choosing paid enrolment.
        </p>
      </PolicySection>
      <PolicySection title="If you leave">
        <p>
          Fees for your agreed programme period are non-refundable once payment
          and enrolment are confirmed. There is no refund for a change of mind,
          personal absence, missed sessions or voluntary withdrawal, including
          after attending only one, two or three sessions.
        </p>
        <p>
          Unused sessions do not become a refund or cash balance. Please tell
          us if your child stops attending so we can update our records; notice
          does not make already-paid fees refundable.
        </p>
      </PolicySection>
      <PolicySection title="If we cancel">
        <p>
          If LetsAimIt cancels a paid session, including for unsafe weather or
          ground conditions, we credit that session against the next programme
          payment. We will tell you about the cancellation and credit.
        </p>
        <p>
          If we cannot provide the agreed paid service, or the service is
          deficient, we will provide the remedy required by applicable law,
          including a refund where required. The no-refund rule for personal
          withdrawal does not remove these rights.
        </p>
      </PolicySection>
      <PolicySection title="Payment mistakes">
        <p>
          Verified duplicate or excess payments are returned. Contact us with
          the payment reference, date and amount. Do not send card details,
          passwords or one-time codes.
        </p>
      </PolicySection>
      <PolicySection title="How we resolve it">
        <p>
          For a payment error or a legally required refund, we review the
          records and confirm the outcome and processing details. We follow
          applicable legal time limits and return funds through the original
          payment method where possible.
        </p>
        <p>
          Nothing in this policy limits your right to raise a consumer complaint
          or seek a remedy under applicable law.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}

export { Privacy, Terms, Refunds };
