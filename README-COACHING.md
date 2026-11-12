# Parent and coaching tracker

`/parent/` is a standalone parent workspace. Dashboard retains saved requests and
fees; Tracker shows each child's recorded attendance and weekly feedback;
Account retains the existing deletion flow. Admins open Attendance, Weekly
feedback and Coach access from `/admin/?view=attendance`. `/coach-dashboard/`
is the coach workspace for attendance and feedback on assigned children.

One verified Google identity can use parent, coach and admin capabilities.
Parents see only their current Auth UID's approved enrolments. Admins see the
approved roster; coaches see only children currently assigned to their Google
email after the assignment start date. Trials and pending or declined
enrolments stay in the Register. Client navigation never grants access.

## Saved records and interface

Migration `20261110212805_coaching_tracker.sql` adds five private RLS tables:

- `coaching_assignments`: registration ID, coach email, start date, revision.
- `coaching_attendance`: registration ID, session date, status, marker, revision.
- `coaching_feedback`: registration ID, Monday week start, summary, next step,
  author and revision.
- `coaching_settings`: daily email scheduling, disabled by default.
- `coaching_email_tickets`: one expiring recipient/date roster capability and
  delivery outbox record, containing IDs and a token hash rather than raw tokens.

No attendance row means **Not marked**, not Absent. Explicit **No session** is
excluded from the attendance percentage. Parents can filter children/months and
open full weekly feedback in a side dialog. Attendance history covers the last
365 days; feedback covers 52 weeks, with the returned date range displayed.
Visible pages reconcile every five seconds and on focus without reloading the
document. Private snapshots and drafts clear on account/access boundaries.

Forward migration `20261110220027_coaching_tracker_write_identity_lock.sql`
serializes authenticated tracker writes with account deletion through the
existing Auth identity lock. Parent/staff reads remain stable and read-only.

Migration `20261112215334_default_coaching_assignment.sql` adds the private
`coaching_settings.default_coach_email` setting. Configure it per target with
Dhiraj’s Google sign-in address. New enrolments get a Register assignee and a
tracker assignment when submitted. The tracker exposes the child only after
approval. Existing rows and trial requests keep their assignments. Deleting the
default coach’s account clears this setting along with existing assignments.

Authenticated RPCs:

| RPC | Result / permission |
| --- | --- |
| `list_my_tracker()` | Owned children, attendance, feedback and date range |
| `list_staff_tracker(p_date,p_scope)` | `admin` returns all eligible enrolments to verified admins. `coach` returns assigned eligible enrolments. The one-argument overload remains available to older clients. |
| `set_coaching_assignment(...)` | Admin-only assignment receipt with new revision |
| `save_coaching_attendance(p_session_date,p_rows)` | Atomic revision-checked rows; `{ok,attendance}` |
| `save_coaching_feedback(...)` | Manual saved weekly feedback receipt |

Client records use `registrationId`, `sessionDate`, `weekStart`, `coachName` and
`revision`. Mutations bind to the displayed identity, exact dates and saved
revision. Conflicts require an explicit **Load latest**; no automatic overwrite.
Changing child/week/view protects unsaved editor drafts and active saves.

Deletion revokes outstanding email tickets and coach assignments, removes the
deleted parent's child tracker content and anonymizes deleted coach presentation.
The existing financial archive/ledger remains unchanged. Re-signup never joins
an old child's records by email or phone.

## Attendance email

When scheduled email is enabled, the minute scheduler queues one email at **9 PM IST** for every
currently approved admin, including the owner. The roster includes approved
enrolments even without an assigned coach. There is no old-day email catch-up.
Roster capacity is 100; larger rosters fail explicitly rather than dropping rows.

An admin can open **Attendance → Send attendance email** to queue today's
sheet immediately. `send_coaching_attendance_now()` takes no recipient, roster
or date from the browser. It checks the current Google actor and admin access,
then wakes the same worker after commit. The daily recipient/date key prevents
duplicates at 9 PM or on repeated clicks. With manual send enabled and interactive
mail paused, the worker uses the existing Gmail SMTP account. The email links
to `/admin/?view=attendance&date=YYYY-MM-DD`, where admins sign in and record attendance.
`get_coaching_attendance_email_status()` reports manual availability, scheduled
availability, the email format and today's aggregate counts to admins. A sent
count means the mail transport accepted the message.

The AMP email provides individual Present/Absent/No session choices, local
**Mark all present** / **No session** controls and an explicit **Save**. **Load
latest** reads current values inside Gmail after a multi-admin conflict. All
actions POST to `coaching-worker/attendance`; opening an email/GET never writes.
No attendance action redirects to a browser. Non-AMP HTML/text alternatives
are read-only and say that attendance controls are unavailable.

Tickets expire after 48 hours and recheck current admin membership and every
child's availability on each read/write. All roster updates are atomic. Repeated
identical saves return the confirmed receipt; changed writes after a used ticket
are denied. Different administrators cannot silently overwrite each other.
Raw ticket credentials travel only in POST bodies, never action URLs or logs.

## Backend configuration and activation

[Automation configuration](deployment/automations.json) lists the
attendance worker, its schedule, sender settings and both delivery gates.

Manual link emails use `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_FROM_EMAIL`
and `SMTP_PASSWORD`, shared with registration and billing, plus
`ADMIN_DASHBOARD_ORIGIN` for the target's signed-in attendance link. Enable
`private.coaching_settings.manual_email_enabled` after deploying the worker
and confirming SMTP settings for that target. Interactive attendance uses
its own authenticated `@letsaimit.com` sender and the following server-only values:

- `COACHING_FROM_EMAIL`: the exact sender reviewed by Google, distinct from all
  recipient addresses.
- `COACHING_SMTP_HOST`, `COACHING_SMTP_PORT`, `COACHING_SMTP_USER`,
  `COACHING_SMTP_PASSWORD`: credentials for the selected SMTP provider. Use
  certificate-verified TLS on port 465 or required STARTTLS on port 587. If the
  mailbox provider requires OAuth, use its supported relay or implement the
  provider's scoped OAuth transport; do not disable tenant security settings.
- `COACHING_EMAIL_SIGNING_SECRET`: independent random secret of at least 32
  characters per target. Keep stable while issued tickets are valid.
- `COACHING_DYNAMIC_EMAIL_READY=false`: explicit AMP sender-readiness gate.

The function reuses the target's `NOTIFICATION_CRON_SECRET` and Supabase runtime
credentials. `private.wake_coaching_worker()`
derives its target URL from the existing notification-worker Vault URL. Cron job
`letsaimit-coaching-attendance` runs every minute and picks up retries for
manual deliveries. Daily interactive sends require both the database's
`email_enabled` flag and the function's readiness gate. Keep the daily gates
off until sender approval is complete.

Gmail-native controls require Google's per-sender approval and authenticated
mail. LetsAimIt cannot satisfy the owned sender-domain website requirement with
its personal Gmail address. Gmail also requires different From and To addresses
for AMP delivery. Developer allowlisting is a recipient-specific test mechanism,
not a public rollout.
Do not silently substitute a sender, spoof an address, enable dispatch or claim
all four admins can interact until the actual provider setup is verified.

Sources: [Gmail sender registration](https://developers.google.com/workspace/gmail/ampemail/register),
[security](https://developers.google.com/workspace/gmail/ampemail/security-requirements),
[testing](https://developers.google.com/workspace/gmail/ampemail/testing-dynamic-email),
[AMP email CORS](https://amp.dev/documentation/guides-and-tutorials/email/learn/cors-in-email).

For the [Google registration form](https://forms.gle/fDqLE1gh4wMB6BeQ6), use
**LetsAimIt**, `https://letsaimit.com`, `https://letsaimit.com/privacy/`, and the
actual authenticated domain sender. Use case: “Approved LetsAimIt staff receive
their daily coaching roster and record Present, Absent or No session from Gmail.
Responses apply only to that date and approved roster.” Google requires a
production-quality AMP message from that sender before submission. Use a
separate non-sensitive verification roster and capability that cannot access
actual children or grant the reviewer staff access. Verify SPF, aligned DKIM,
DMARC and From/To separation from a delivered message; wait for approval before
activating dispatch. A provider submission and approval are separate evidence.

The same migration, function, configuration names and tests are staged for both
targets. Record actual cloud checks in `docs/RELEASE-PARITY.md`; source parity
does not prove production setup or Google approval. Production website promotion
remains explicitly gated.
