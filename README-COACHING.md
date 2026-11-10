# Parent and coaching tracker

`/parent/` is a standalone parent workspace. Dashboard retains saved requests and
fees; Tracker shows each child's recorded attendance and weekly feedback;
Account retains the existing deletion flow. `/coach-dashboard/` is the staff
workspace for attendance, manual feedback and admin-only coach assignments.

One verified Google identity can use parent, coach and admin capabilities.
Parents see only their current Auth UID's approved enrolments. Admins see the
approved roster; coaches see only children currently assigned to their Google
email after the assignment start date. Client navigation never grants access.

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

Authenticated RPCs:

| RPC | Result / permission |
| --- | --- |
| `list_my_tracker()` | Owned children, attendance, feedback and date range |
| `list_staff_tracker(p_date)` | Current scoped roster, selected-day attendance, feedback, admin/scheduling flags |
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

## Daily Gmail attendance

At **9 PM IST each day**, the minute scheduler queues one email for every
currently approved admin, including the owner. The roster includes approved
enrolments even without an assigned coach. There is no old-day email catch-up.
Roster capacity is 100; larger rosters fail explicitly rather than dropping rows.

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

Use the existing approved SMTP account and server-only SMTP settings. Do not
copy an app password into React, Git or a public example. New operator values:

- `COACHING_EMAIL_SIGNING_SECRET`: independent random secret of at least 32
  characters per target. Keep stable while issued tickets are valid.
- `COACHING_DYNAMIC_EMAIL_READY=false`: explicit AMP sender-readiness gate.

The function reuses the target's `NOTIFICATION_CRON_SECRET`, Supabase runtime
credentials and approved SMTP configuration. `private.wake_coaching_worker()`
derives its target URL from the existing notification-worker Vault URL. Cron job
`letsaimit-coaching-attendance` runs every minute; both the database's
`email_enabled` flag and the function's readiness gate must be enabled for
delivery. Keep them off while sender approval is pending. Preparation does not
send emails, create coaching marks or change billing.

Gmail-native controls require Google's per-sender approval and authenticated
mail. Gmail's registration requirements include an owned sender-domain website;
the currently configured personal Gmail SMTP identity is not evidence of this
approval. Gmail developer allowlisting is a recipient-specific test mechanism,
not a public rollout. Gmail tests require different sender/recipient addresses.
Do not silently substitute a sender, spoof an address, enable dispatch or claim
all four admins can interact until the actual provider setup is verified.

Sources: [Gmail sender registration](https://developers.google.com/workspace/gmail/ampemail/register),
[security](https://developers.google.com/workspace/gmail/ampemail/security-requirements),
[testing](https://developers.google.com/workspace/gmail/ampemail/testing-dynamic-email),
[AMP email CORS](https://amp.dev/documentation/guides-and-tutorials/email/learn/cors-in-email).

The same migration, function, configuration names and tests are staged for both
targets. Record actual cloud checks in `docs/RELEASE-PARITY.md`; source parity
does not prove production setup or Google approval. Production website promotion
remains explicitly gated.
