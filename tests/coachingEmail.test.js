import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCoachingAttendanceEmail,coachingSheet} from '../supabase/functions/_shared/coaching-email.js';
import {deriveCoachingEmailToken} from '../supabase/functions/_shared/coaching-worker.js';

const ticketId='20000000-0000-4000-8000-000000000001';
const rows=[{registrationId:'30000000-0000-4000-8000-000000000001',childName:'Child <one>',sport:'Football',community:'Community & A',status:null,revision:0},{registrationId:'30000000-0000-4000-8000-000000000002',childName:'Child two',sport:'Basketball',community:'Community B',status:'absent',revision:2}];
const fixture={ticketId,recipientEmail:'admin@example.test',sessionDate:'2026-11-11',expiresAt:'2026-11-13T15:30:00Z',rows,token:deriveCoachingEmailToken('synthetic-coaching-signing-key-at-least-32',ticketId),actionUrl:'https://abcdefghijklmnopqrst.supabase.co/functions/v1/coaching-worker/attendance'};

test('attendance email has an AMP form with local bulk choices, per-child status/revision and explicit save',()=>{
  const mail=buildCoachingAttendanceEmail(fixture);
  assert.equal(mail.subject,'LetsAimIt: Attendance · 11 Nov 2026');
  assert.match(mail.amp,/<html amp4email/);assert.match(mail.amp,/amp-form-0\.1\.js/);assert.match(mail.amp,/amp-bind-0\.1\.js/);
  assert.match(mail.amp,/Mark all present/);assert.match(mail.amp,/No session for all/);assert.match(mail.amp,/Save attendance/);
  assert.equal([...mail.amp.matchAll(/name="status_/g)].length,2);assert.equal([...mail.amp.matchAll(/name="revision_/g)].length,2);
  assert.match(mail.amp,/<option value="" \[selected\]="[^"]+" selected>Not marked/);assert.match(mail.amp,/<option value="absent" \[selected\]="[^"]+" selected>Absent/);
  assert.match(mail.amp,/<input type="hidden" name="token"/);assert.match(mail.amp,/<input type="hidden" name="action" value="save"/);
  assert.match(mail.amp,/'present'/);assert.match(mail.amp,/'no_session'/);
  assert.match(mail.amp,/submit-success:AMP\.setState\(\{ticket:\{used:true\}\}\)/);
});

test('Load latest refreshes status and revision inside Gmail rather than navigating away',()=>{
  const {amp,html,text}=buildCoachingAttendanceEmail(fixture);
  assert.match(amp,/name="action" value="refresh"/);assert.match(amp,/Load latest/);
  assert.match(amp,/sheet:event\.response\.sheet,draft:\{bulk:null,overrides:null\},ticket:\{used:ticket\.used \|\| event\.response\.used\}/);
  assert.match(amp,/draft\.overrides\.row0/);assert.match(amp,/draft\.bulk \|\| sheet\.row0\.status/);assert.match(amp,/\[value\]="sheet\.row0\.revision"/);
  for(const body of [amp,html,text])assert.doesNotMatch(body,/href=|window\.location|AMP\.navigateTo|\/admin\/|\/parent\//);
  assert.doesNotMatch(html+text,RegExp(fixture.token));
  for(const url of [...amp.matchAll(/action-xhr="([^"]+)"/g)].map(match=>new URL(match[1])))assert.equal(url.search,'');
});

test('untrusted roster labels are escaped; AMP state contains only validated status and revision',()=>{
  const {amp,html}=buildCoachingAttendanceEmail(fixture);
  assert.match(amp,/Child &lt;one&gt;/);assert.match(html,/Community &amp; A/);assert.doesNotMatch(amp+html,/<one>/);
  assert.deepEqual(coachingSheet(rows),{row0:{status:'',revision:0},row1:{status:'absent',revision:2}});
  assert.deepEqual(coachingSheet([{...rows[0],status:'unmarked'}]),{row0:{status:'',revision:0}});
  const changed={...fixture,rows:[{...rows[0],childName:'</script><script>alert(1)</script>'}]};
  assert.doesNotMatch(buildCoachingAttendanceEmail(changed).amp,/<script>alert/);
  assert.throws(()=>buildCoachingAttendanceEmail({...fixture,rows:[{...rows[0],childName:'Name\r\nBcc: bad@example.test'}]}),/invalid_email_content/);
});

test('HTML and text fallback are honestly read-only with no pretend attendance buttons or payment data',()=>{
  const mail=buildCoachingAttendanceEmail(fixture);
  assert.match(mail.html,/Attendance controls are not available in this email/);assert.match(mail.text,/Contact your programme admin/);
  assert.doesNotMatch(mail.html,/<form|<button|<select|action-xhr/);
  assert.doesNotMatch(mail.html+mail.text,/6000|Razorpay|payment|parentName|parentEmail|phone/);
  assert.doesNotMatch(mail.subject,/uat|prod|preview|demo/i);
});

test('wrong routes, unsafe endpoint origins, duplicate rows and invalid status/revision fail closed',()=>{
  for(const actionUrl of ['http://abcdefghijklmnopqrst.supabase.co/functions/v1/coaching-worker/attendance','https://evil.example/attendance',`${fixture.actionUrl}?token=secret`,`${fixture.actionUrl}#fragment`,fixture.actionUrl.replace('/attendance','/worker'),'https://user:password@abcdefghijklmnopqrst.supabase.co/functions/v1/coaching-worker/attendance'])assert.throws(()=>buildCoachingAttendanceEmail({...fixture,actionUrl}),/invalid_action_url/);
  for(const invalidRows of [[],[rows[0],rows[0]],[{...rows[0],status:'late'}],[{...rows[0],revision:-1}],[{...rows[0],revision:'0'}],Array.from({length:101},()=>rows[0])])assert.throws(()=>buildCoachingAttendanceEmail({...fixture,rows:invalidRows}),/invalid_roster/);
  assert.throws(()=>buildCoachingAttendanceEmail({...fixture,sessionDate:'2026-02-30'}),/invalid_session_date/);
  assert.throws(()=>buildCoachingAttendanceEmail({...fixture,token:'bad-token'}),/invalid_email_ticket/);
});
