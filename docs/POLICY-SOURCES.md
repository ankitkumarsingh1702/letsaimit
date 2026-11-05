# Policy update — 5 November 2026

## Scope and owner instructions

The website policies cover football and basketball training, related fitness activities and match days. Basketball at Nambiar Ellegenza and Nambiar Bellezea and one free first session were confirmed by the owner. No separate prepaid-session product, public price, withdrawal deadline or discretionary refund window has been invented.

The owner's rule is firm: after payment and confirmed enrolment, voluntary withdrawal, personal absence or attending only one to three sessions does not create a refund. Provider-caused cancellation and mandatory legal remedies are separate. The existing site's credit for a provider-cancelled paid session is retained without requiring a particular payment cadence.

## Legal grounding

- [Consumer Protection Act, 2019 — Department of Consumer Affairs](https://consumeraffairs.gov.in/public/upload/files/CP%20Act%202019_1732700731.pdf): sections 2(11), 2(46), 2(47)(viii) and 39 support preserving remedies for deficient services and avoiding unreasonable contractual restrictions. Section 2(47)(viii) addresses refund timing for deficient services. A broad “no refund under any circumstances” statement would be inappropriate. The new text preserves applicable time limits rather than inventing a business processing promise.
- [National Consumer Helpline — Act overview](https://consumerhelpline.gov.in/public/knowledgebasedetails/Consumer%20Protection%20Act%202019): corroborates consumer rights, service deficiency and unfair-contract concepts.
- [DPDP Act commencement notification — MeitY](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf): the principal processing, consent and children's-data provisions commence in the later 18-month phase following the November 2025 notification. They are not all operative on this review date.
- [DPDP Rules, 2025 — MeitY](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf): rules 3 and 10 provide the later-stage notice and verifiable-parental-consent framework. A checkbox alone must not be described as proof of full compliance. Operational verification must be reviewed before the applicable commencement date.
- [MeitY clarification on the 2011 sensitive-data rules](https://www.meity.gov.in/writereaddata/files/PressNote_25811.pdf): relevant to any later collection of health or other sensitive information. Public enquiry forms should not solicit medical records or identity documents.

## Comparable sports providers

- [Barça Academy India — terms](https://india.barcaacademy.com/terms-and-conditions/) publishes a strict participation-fee non-refund approach, with an alternative programme if it cancels.
- [Sanrachana Academy — refund policy](https://www.sanrachanaacademyofficial.in/sa-refund-policy) states a non-refund rule for withdrawal and unused sessions and separately identifies operational cancellations and duplicate payments.

These demonstrate sector practice, not proof that every clause is enforceable. No competitor wording, fees, notice periods or timelines were copied into LetsAimIt's policies.

## Implementation notes

- Internal routes: `/privacy/`, `/terms/`, `/refunds/`; shared header and footer are supplied by the app.
- Privacy text truthfully describes a linked Google Form and optional WhatsApp handoff. It does not claim that a new Sheet integration or GA4 measurement is already active. Update the provider description only when the actual storage/analytics integration is verified.
- Use separate, unchecked consent for enquiry processing and any optional publicity permission. A school or society contact should not make a parent/guardian declaration.
- Protect response access and never place real parent/child enquiry rows in public assets, the source ZIP or analytics events.
- Privacy retention is purpose-based; the owner has not supplied a fixed schedule. The owner must carry out the stated review, deletion and access restrictions operationally.
- The site is not a substitute for a tailored legal review, especially before accepting paid enrolments or collecting sensitive information. The UI itself stays concise and avoids generic disclaimer clutter.
