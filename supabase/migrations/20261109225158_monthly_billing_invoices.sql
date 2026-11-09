-- Monthly, explicitly paid hosted invoices. No card data or auto-debit mandate.
-- UAT activation is a separate operator step; existing approvals are not backfilled.
create table private.billing_settings (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  team_testing boolean not null default true,
  charge_amount_paise integer not null default 100 check(charge_amount_paise>0 and charge_amount_paise<=10000000),
  regular_amount_paise integer not null default 60000 check(regular_amount_paise>0),
  late_fee_paise integer not null default 10000 check(late_fee_paise>=0),
  late_fee_policy text not null default 'daily' check(late_fee_policy in ('pending','once','daily')),
  late_fees_enabled boolean not null default false,
  check(not team_testing or (charge_amount_paise=100 and not late_fees_enabled))
);
insert into private.billing_settings(id) values(true);

create function public.get_billing_terms()
returns jsonb language sql stable security definer set search_path='' as $$
  select terms||jsonb_build_object('version','billing-2026-11-10-'||encode(sha256(convert_to(terms::text,'UTF8')),'hex')) from (
    select jsonb_build_object('enabled',enabled,'team_testing',team_testing,'charge_amount_paise',charge_amount_paise,
      'regular_amount_paise',regular_amount_paise,'late_fee_paise',late_fee_paise,'late_fee_policy',late_fee_policy,
      'late_fees_enabled',late_fees_enabled,'due_day',5,'first_due_days',4) terms from private.billing_settings where id
  ) settings;
$$;
revoke all on function public.get_billing_terms() from public,anon,authenticated;
grant execute on function public.get_billing_terms() to anon,authenticated;

-- Retain the existing form validator, and add only the explicitly accepted billing terms.
alter function private.normalized_registration(jsonb) rename to registration_fields_without_billing;
create function private.normalized_registration(payload jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare normalized jsonb; terms jsonb;
begin
  normalized:=private.registration_fields_without_billing(payload);
  terms:=public.get_billing_terms();
  if normalized->'metadata'->>'formType'='enrol' and terms->'enabled'='true'::jsonb then
    if payload->'metadata'->>'billingTermsVersion' is distinct from terms->>'version' then
      raise exception using errcode='PT412',message='Payment details changed. Reload and confirm them again.',detail='billingTermsVersion';
    end if;
    if payload->'metadata'->'billingConsent' is distinct from 'true'::jsonb then
      raise exception using errcode='22023',message='Please review and accept the current monthly billing terms.',detail='billingConsent';
    end if;
    normalized:=jsonb_set(normalized,'{metadata}',(normalized->'metadata')||jsonb_build_object('billingConsent',true,'billingTermsVersion',terms->>'version','billingTerms',terms));
  end if;
  return normalized;
end;
$$;
revoke all on function private.normalized_registration(jsonb),private.registration_fields_without_billing(jsonb) from public,anon,authenticated;

-- A saved receipt remains retryable after a terms/configuration change. Its saved
-- owner and canonical fields must still match; this does not grant new consent.
create or replace function public.submit_registration(payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare normalized jsonb; saved public.registrations%rowtype; owner_id uuid; request_id uuid; expected_fingerprint text; duplicate boolean:=false;
begin
  owner_id:=private.require_google_user();
  normalized:=private.registration_fields_without_billing(payload);
  request_id:=(normalized->'metadata'->>'submissionId')::uuid;
  select * into saved from public.registrations where submission_id=request_id;
  if found then
    if saved.parent_user_id is distinct from owner_id then raise exception using errcode='PT409',message='These details have changed. Start a new registration.'; end if;
    if saved.metadata->'billingConsent'='true'::jsonb then
      if payload->'metadata'->'billingConsent' is distinct from 'true'::jsonb or payload->'metadata'->>'billingTermsVersion' is distinct from saved.metadata->>'billingTermsVersion' then
        raise exception using errcode='PT409',message='These billing terms have changed. Start a new registration.';
      end if;
      normalized:=jsonb_set(normalized,'{metadata}',normalized->'metadata'||jsonb_build_object('billingConsent',true,'billingTermsVersion',saved.metadata->>'billingTermsVersion','billingTerms',saved.metadata->'billingTerms'));
    end if;
    if saved.fingerprint<>encode(sha256(convert_to(normalized::text,'UTF8')),'hex') then raise exception using errcode='PT409',message='These details have changed. Start a new registration.'; end if;
    return jsonb_build_object('ok',true,'submissionId',saved.submission_id,'savedAt',saved.created,'duplicate',true,'id',saved.id);
  end if;
  normalized:=private.normalized_registration(payload);
  expected_fingerprint:=encode(sha256(convert_to(normalized::text,'UTF8')),'hex');
  insert into public.registrations(full_name,email,phone,metadata) values(normalized->>'full_name',normalized->>'email',normalized->>'phone',normalized->'metadata')
    on conflict(submission_id) do nothing returning * into saved;
  if not found then
    select * into strict saved from public.registrations where submission_id=request_id;
    if saved.parent_user_id is distinct from owner_id or saved.fingerprint<>expected_fingerprint then raise exception using errcode='PT409',message='These details have changed. Start a new registration.'; end if;
    duplicate:=true;
  end if;
  return jsonb_build_object('ok',true,'submissionId',saved.submission_id,'savedAt',saved.created,'duplicate',duplicate,'id',saved.id);
end;
$$;
revoke all on function public.submit_registration(jsonb) from public,anon,authenticated;
grant execute on function public.submit_registration(jsonb) to authenticated;

create table private.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(id) on delete restrict,
  parent_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check(status in ('active','cancelled')),
  start_month date not null check(extract(day from start_month)=1),
  team_testing boolean not null,
  charge_amount_paise integer not null check(charge_amount_paise>0 and charge_amount_paise<=10000000),
  late_fee_paise integer not null check(late_fee_paise>=0),
  late_fee_policy text not null check(late_fee_policy in ('pending','once','daily')),
  late_fees_enabled boolean not null,
  billing_terms_version text not null,
  revision bigint not null default 1 check(revision between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by text not null default '',
  check((status='active' and cancelled_at is null and cancelled_by='') or (status='cancelled' and cancelled_at is not null and cancelled_by<>'')),
  check(not team_testing or (charge_amount_paise=100 and not late_fees_enabled))
);
create index billing_accounts_owner_idx on private.billing_accounts(parent_user_id,created_at desc);

create table private.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references private.billing_accounts(id) on delete restrict,
  kind text not null default 'monthly' check(kind in ('monthly','late_fee')),
  base_invoice_id uuid references private.billing_invoices(id) on delete restrict,
  fee_date date,
  period_start date not null check(extract(day from period_start)=1),
  due_date timestamptz not null,
  base_amount_paise integer not null check(base_amount_paise>=0),
  late_fee_paise integer not null default 0 check(late_fee_paise>=0),
  amount_paise integer generated always as (base_amount_paise+late_fee_paise) stored,
  currency text not null default 'INR' check(currency='INR'),
  status text not null default 'creating' check(status in ('creating','pending','paid','partially_refunded','refunded','cancelled','expired')),
  provider_invoice_id text unique check(provider_invoice_id is null or provider_invoice_id~'^inv_[A-Za-z0-9]+$'),
  provider_payment_id text unique check(provider_payment_id is null or provider_payment_id~'^pay_[A-Za-z0-9]+$'),
  provider_status text not null default '' check(provider_status in ('','draft','issued','partially_paid','paid','cancelled','expired','deleted')),
  payment_url text not null default '',
  invoice_url text not null default '',
  paid_paise integer not null default 0 check(paid_paise>=0),
  refunded_paise integer not null default 0 check(refunded_paise>=0 and refunded_paise<=paid_paise),
  paid_at timestamptz,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(base_amount_paise+late_fee_paise>0),
  check(paid_paise<=base_amount_paise+late_fee_paise),
  check((kind='monthly' and base_invoice_id is null and fee_date is null and base_amount_paise>0 and late_fee_paise=0)
    or (kind='late_fee' and base_invoice_id is not null and fee_date is not null and base_amount_paise=0 and late_fee_paise>0))
);
create unique index billing_monthly_unique on private.billing_invoices(account_id,period_start) where kind='monthly';
create unique index billing_fee_unique on private.billing_invoices(base_invoice_id,fee_date) where kind='late_fee';
create index billing_invoices_account_idx on private.billing_invoices(account_id,created_at desc);
create index billing_invoices_unpaid_idx on private.billing_invoices(due_date,checked_at) where status in ('creating','pending');

-- Append-only accounting movements. Only verified provider capture/refund deltas enter here.
create table private.billing_ledger (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references private.billing_invoices(id) on delete restrict,
  kind text not null check(kind in ('capture','refund')),
  amount_paise integer not null check(amount_paise>0),
  cumulative_paise integer not null check(cumulative_paise>0),
  created_at timestamptz not null default now(),
  unique(invoice_id,kind,cumulative_paise)
);

create table private.billing_jobs (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references private.billing_invoices(id) on delete restrict,
  kind text not null check(kind in ('create_invoice','reconcile_invoice','send_invoice','send_reminder','send_receipt','send_refund')),
  dedupe_key text not null unique,
  state text not null default 'pending' check(state in ('pending','processing','done','failed','cancelled','ambiguous')),
  attempts smallint not null default 0 check(attempts between 0 and 8),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  failure_code text not null default '' check(failure_code in ('','provider_unavailable','configuration_error','send_failure','invoice_missing','provider_mismatch','creation_ambiguous','lease_expired')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index billing_jobs_invoice_idx on private.billing_jobs(invoice_id);
create index billing_jobs_due_idx on private.billing_jobs(next_attempt_at,created_at) where state in ('pending','processing');

create table private.billing_webhook_events (
  event_id text primary key check(char_length(event_id) between 1 and 200),
  provider_invoice_id text,
  provider_payment_id text,
  event_type text not null check(char_length(event_type) between 1 and 100),
  payload_hash text not null check(payload_hash~'^[0-9a-f]{64}$'),
  invoice_id uuid references private.billing_invoices(id) on delete restrict,
  received_at timestamptz not null default now(),
  applied_at timestamptz
);
create index billing_events_unmatched_idx on private.billing_webhook_events(provider_invoice_id,provider_payment_id) where invoice_id is null;
create index billing_events_invoice_idx on private.billing_webhook_events(invoice_id);

alter table private.billing_settings enable row level security;
alter table private.billing_accounts enable row level security;
alter table private.billing_invoices enable row level security;
alter table private.billing_ledger enable row level security;
alter table private.billing_jobs enable row level security;
alter table private.billing_webhook_events enable row level security;
revoke all on private.billing_settings,private.billing_accounts,private.billing_invoices,private.billing_ledger,private.billing_jobs,private.billing_webhook_events from public,anon,authenticated;

create function private.wake_billing_worker()
returns void language plpgsql security definer set search_path='' as $$
declare worker_url text; worker_secret text;
begin
  if not (select enabled from private.billing_settings where id) or to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then return; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_url using 'letsaimit_billing_worker_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_secret using 'letsaimit_notification_worker_secret';
  if worker_url is null or worker_url!~'^https://[a-z0-9]+[.]supabase[.]co/functions/v1/billing-worker$' or char_length(coalesce(worker_secret,''))<32 then return; end if;
  perform net.http_post(url:=worker_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),body:='{}'::jsonb,timeout_milliseconds:=145000);
exception when others then return;
end;
$$;
revoke all on function private.wake_billing_worker() from public,anon,authenticated;

create function private.start_approved_billing()
returns trigger language plpgsql security definer set search_path='' as $$
declare account_id uuid; bill_id uuid; settings private.billing_settings%rowtype;
begin
  select * into settings from private.billing_settings where id;
  if not settings.enabled or new.metadata->>'formType'<>'enrol' or new.parent_user_id is null
    or new.metadata->'billingConsent' is distinct from 'true'::jsonb
    or new.metadata->>'billingTermsVersion' is distinct from public.get_billing_terms()->>'version' then return new; end if;
  insert into private.billing_accounts(registration_id,parent_user_id,start_month,created_at,team_testing,charge_amount_paise,late_fee_paise,late_fee_policy,late_fees_enabled,billing_terms_version)
    values(new.id,new.parent_user_id,date_trunc('month',new.reviewed_at at time zone 'Asia/Kolkata')::date,new.reviewed_at,
      settings.team_testing,settings.charge_amount_paise,settings.late_fee_paise,settings.late_fee_policy,settings.late_fees_enabled,new.metadata->>'billingTermsVersion')
    on conflict(registration_id) do nothing returning id into account_id;
  if account_id is null then return new; end if;
  insert into private.billing_invoices(account_id,period_start,due_date,base_amount_paise)
    values(account_id,date_trunc('month',new.reviewed_at at time zone 'Asia/Kolkata')::date,new.reviewed_at+interval '4 days',settings.charge_amount_paise)
    returning id into bill_id;
  insert into private.billing_jobs(invoice_id,kind,dedupe_key) values(bill_id,'create_invoice','create:'||bill_id);
  perform private.wake_billing_worker();
  return new;
end;
$$;
revoke all on function private.start_approved_billing() from public,anon,authenticated;
create trigger start_approved_billing after update on public.registrations
for each row when(old.review_decision='pending' and new.review_decision='accepted') execute function private.start_approved_billing();

create function public.cancel_billing_account(p_registration_id uuid,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare account private.billing_accounts%rowtype;
begin
  if not private.is_allowed_admin() then raise exception using errcode='42501',message='Admin access is required.'; end if;
  select * into account from private.billing_accounts where registration_id=p_registration_id for update;
  if not found then raise exception using errcode='P0002',message='Monthly billing is not active for this request.'; end if;
  if account.status='cancelled' then return to_jsonb(account)-'parent_user_id'; end if;
  if p_expected_revision is null or account.revision<>p_expected_revision then raise exception using errcode='PT409',message='Billing changed. Review its latest saved version.'; end if;
  update private.billing_accounts set status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=lower(auth.jwt()->>'email'),revision=revision+1
    where id=account.id returning * into account;
  return to_jsonb(account)-'parent_user_id';
end;
$$;
revoke all on function public.cancel_billing_account(uuid,bigint) from public,anon,authenticated;
grant execute on function public.cancel_billing_account(uuid,bigint) to authenticated;

create function private.billing_snapshot(p_owner uuid,p_admin boolean)
returns jsonb language sql stable security definer set search_path='' as $$
  with visible as (
    select i.*,a.registration_id,a.status account_status,a.parent_user_id,r.full_name parent_name,r.email parent_email,
      r.metadata->>'childName' child_name,r.metadata->>'sport' sport,r.metadata->>'community' community,
      a.team_testing,a.late_fee_paise account_late_fee_paise,a.late_fee_policy account_late_fee_policy,
      case when i.status='creating' and i.provider_invoice_id is null and exists(select 1 from private.billing_jobs j where j.invoice_id=i.id and j.kind='create_invoice' and j.state='failed') then 'failed'
        when i.status='pending' and i.due_date<now() then 'overdue' else i.status end display_status
    from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id join public.registrations r on r.id=a.registration_id
    where p_admin or a.parent_user_id=p_owner
  ) select jsonb_build_object(
    'invoices',coalesce((select jsonb_agg(row_data order by created_at desc,id desc) from (
      select i.id,i.created_at,jsonb_build_object('id',i.id,'registration_id',i.registration_id,'invoice_number',coalesce(i.provider_invoice_id,'LAI'||replace(i.id::text,'-','')),
        'period_start',i.period_start,'due_date',i.due_date,'child_name',i.child_name,'community',i.community,'sport',i.sport,
        'currency',i.currency,'amount_paise',i.amount_paise,'base_amount_paise',i.base_amount_paise,'late_fee_paise',i.late_fee_paise,
        'paid_paise',i.paid_paise,'refunded_paise',i.refunded_paise,'kind',i.kind,'base_invoice_id',i.base_invoice_id,
        'status',i.display_status,'team_testing',i.team_testing,'payment_url',i.payment_url,'invoice_url',i.invoice_url,'provider_invoice_id',i.provider_invoice_id,
        'created_at',i.created_at,'updated_at',i.updated_at,'paid_at',i.paid_at,
        'late_fee_preview_paise',case when i.kind='monthly' and i.paid_paise=0 and i.status='pending' and i.due_date<now()
          then (case when i.account_late_fee_policy='once' then 1 else greatest(0,((now() at time zone 'Asia/Kolkata')::date-(i.due_date at time zone 'Asia/Kolkata')::date)) end)*i.account_late_fee_paise else 0 end)
        ||case when p_admin then jsonb_build_object('parent_name',i.parent_name,'parent_email',i.parent_email,'provider_payment_id',i.provider_payment_id) else '{}'::jsonb end row_data
      from visible i cross join private.billing_settings s order by i.created_at desc,i.id desc limit 1000
    ) listed),'[]'::jsonb),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'registration_id',a.registration_id,'status',a.status,'revision',a.revision,
      'parent_name',r.full_name,'child_name',r.metadata->>'childName','created_at',a.created_at,'cancelled_at',a.cancelled_at) order by a.created_at desc)
      from private.billing_accounts a join public.registrations r on r.id=a.registration_id where p_admin or a.parent_user_id=p_owner),'[]'::jsonb),
    'settings',(select jsonb_build_object('enabled',s.enabled,'team_testing',s.team_testing,'charge_amount_paise',s.charge_amount_paise,'regular_amount_paise',s.regular_amount_paise,
      'late_fee_paise',s.late_fee_paise,'late_fee_policy',s.late_fee_policy,'late_fees_enabled',s.late_fees_enabled,'due_day',5) from private.billing_settings s where id),
    'summary',(select jsonb_build_object('captured_paise',coalesce(sum(paid_paise),0),'refunded_paise',coalesce(sum(refunded_paise),0),
      'outstanding_paise',coalesce(sum(greatest(amount_paise-paid_paise,0)) filter(where status in ('pending','creating')),0),
      'paid_count',count(*) filter(where status in ('paid','partially_refunded','refunded')),
      'pending_count',count(*) filter(where display_status in ('creating','pending')),'overdue_count',count(*) filter(where display_status='overdue'),
      'failed_count',count(*) filter(where display_status='failed')) from visible),
    'has_more',(select count(*)>1000 from visible)
  );
$$;
revoke all on function private.billing_snapshot(uuid,boolean) from public,anon,authenticated;
create function public.list_admin_billing()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_allowed_admin() then raise exception using errcode='42501',message='Admin access is required.'; end if;
  return private.billing_snapshot(null,true);
end;
$$;
create function public.list_my_billing()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin return private.billing_snapshot(private.require_google_user(),false); end;
$$;
revoke all on function public.list_admin_billing(),public.list_my_billing() from public,anon,authenticated;
grant execute on function public.list_admin_billing(),public.list_my_billing() to authenticated;

create function public.enqueue_billing_work()
returns integer language plpgsql security definer set search_path='' as $$
declare settings private.billing_settings%rowtype; local_today date; month_start date; n integer:=0; added integer; bill record; fee_start date;
begin
  select * into settings from private.billing_settings where id and enabled for update;
  if not found then return 0; end if;
  local_today:=(now() at time zone 'Asia/Kolkata')::date; month_start:=date_trunc('month',local_today)::date;
  -- Bounded catch-up creates each actually owed cycle once; never the pre-approval months.
  with missing as (
    select a.id,a.charge_amount_paise,cycle::date period from private.billing_accounts a
    cross join lateral generate_series(a.start_month+interval '1 month',month_start,interval '1 month') cycle
    where a.status='active' and a.parent_user_id is not null
      and not exists(select 1 from private.billing_invoices i where i.account_id=a.id and i.kind='monthly' and i.period_start=cycle::date)
    order by cycle,a.id limit 100
  ), inserted as (
    insert into private.billing_invoices(account_id,period_start,due_date,base_amount_paise)
    select id,period,(period+4+time '23:59:59') at time zone 'Asia/Kolkata',charge_amount_paise from missing
    on conflict do nothing returning id
  ) insert into private.billing_jobs(invoice_id,kind,dedupe_key) select id,'create_invoice','create:'||id from inserted on conflict do nothing;
  get diagnostics added=row_count; n:=n+added;
  -- Unknown create outcomes are reconciled by receipt, never blindly recreated.
  update private.billing_jobs set state='ambiguous',failure_code='creation_ambiguous',lease_token=null,lease_until=null
    where kind='create_invoice' and state='processing' and lease_until<=now();
  insert into private.billing_jobs(invoice_id,kind,dedupe_key)
    select i.id,'reconcile_invoice','reconcile:'||i.id||':'||date_bin(interval '5 minutes',now(),timestamptz '1970-01-01')::text
    from private.billing_invoices i
    where (i.status='creating' and exists(select 1 from private.billing_jobs j where j.invoice_id=i.id and j.kind='create_invoice' and j.state='ambiguous'))
      or (i.provider_invoice_id is not null and (i.checked_at is null or i.checked_at<now()-case when i.status in ('pending','creating') then interval '5 minutes' else interval '1 day' end))
    order by i.checked_at nulls first limit 100 on conflict do nothing;
  get diagnostics added=row_count; n:=n+added;
  -- Retain verified but initially unmatched webhooks until creation becomes visible.
  update private.billing_webhook_events e set invoice_id=i.id
    from private.billing_invoices i where e.invoice_id is null
      and (e.provider_invoice_id=i.provider_invoice_id or e.provider_payment_id=i.provider_payment_id);
  insert into private.billing_jobs(invoice_id,kind,dedupe_key)
    select invoice_id,'reconcile_invoice','event:'||event_id from private.billing_webhook_events where invoice_id is not null and applied_at is null
    on conflict do nothing;
  get diagnostics added=row_count; n:=n+added;
  -- One reminder for the current local day; recovery does not blast missed-day emails.
  if extract(hour from now() at time zone 'Asia/Kolkata')>=9 then
    insert into private.billing_jobs(invoice_id,kind,dedupe_key)
      select i.id,'send_reminder','reminder:'||i.id||':'||local_today from private.billing_invoices i
      join private.billing_accounts a on a.id=i.account_id
      where i.kind='monthly' and i.status='pending' and i.paid_paise=0 and a.status='active'
        and i.payment_url<>'' and local_today>(i.created_at at time zone 'Asia/Kolkata')::date
        and local_today<=(i.due_date at time zone 'Asia/Kolkata')::date
        and (extract(day from local_today)<=5 or i.period_start=a.start_month)
      on conflict do nothing;
    get diagnostics added=row_count; n:=n+added;
  end if;
  -- Team tests show the fee preview only. Real fees are separate immutable invoices.
  if not settings.team_testing then
    for bill in select i.*,a.late_fee_policy,a.late_fee_paise account_fee_paise from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id
      where i.kind='monthly' and i.status='pending' and i.paid_paise=0 and i.provider_invoice_id is not null and a.status='active'
        and a.late_fees_enabled and not a.team_testing and a.late_fee_policy in ('once','daily') and a.late_fee_paise>0
        and local_today>(i.due_date at time zone 'Asia/Kolkata')::date
      order by i.due_date limit 100 loop
      fee_start:=(bill.due_date at time zone 'Asia/Kolkata')::date+1;
      -- Missing overdue dates are accrued once, in bounded batches. Every fee
      -- still requires a fresh provider check before its own hosted invoice is issued.
      if bill.late_fee_policy='daily' or not exists(select 1 from private.billing_invoices where base_invoice_id=bill.id and kind='late_fee') then
        with inserted as (
          insert into private.billing_invoices(account_id,kind,base_invoice_id,fee_date,period_start,due_date,base_amount_paise,late_fee_paise)
            select bill.account_id,'late_fee',bill.id,fee_day::date,bill.period_start,
              (local_today+time '23:59:59') at time zone 'Asia/Kolkata',0,bill.account_fee_paise
            from generate_series(fee_start,case when bill.late_fee_policy='once' then fee_start else local_today end,interval '1 day') fee_day
            where not exists(select 1 from private.billing_invoices prior where prior.base_invoice_id=bill.id and prior.fee_date=fee_day::date)
            order by fee_day limit 31
            on conflict do nothing returning id
        ) insert into private.billing_jobs(invoice_id,kind,dedupe_key) select id,'create_invoice','create:'||id from inserted;
        get diagnostics added=row_count; n:=n+added;
      end if;
    end loop;
  end if;
  return n;
end;
$$;
revoke all on function public.enqueue_billing_work() from public,anon,authenticated;
grant execute on function public.enqueue_billing_work() to service_role;

create function public.claim_billing_job()
returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.billing_jobs%rowtype;
begin
  if not (select enabled from private.billing_settings where id) then return null; end if;
  update private.billing_jobs set state='ambiguous',failure_code='creation_ambiguous',lease_token=null,lease_until=null
    where kind='create_invoice' and state='processing' and lease_until<=now();
  update private.billing_jobs set state='failed',failure_code='lease_expired',lease_token=null,lease_until=null
    where kind<>'create_invoice' and state='processing' and lease_until<=now() and attempts>=8;
  select * into job from private.billing_jobs where attempts<8 and
    ((state='pending' and next_attempt_at<=now()) or (kind<>'create_invoice' and state='processing' and lease_until<=now()))
    order by next_attempt_at,created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update private.billing_jobs set state='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    where id=job.id returning * into job;
  return jsonb_build_object('id',job.id,'leaseToken',job.lease_token,'kind',job.kind,'attempt',job.attempts);
end;
$$;
revoke all on function public.claim_billing_job() from public,anon,authenticated;
grant execute on function public.claim_billing_job() to service_role;

create function public.prepare_billing_job(p_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.billing_jobs%rowtype; invoice private.billing_invoices%rowtype; account private.billing_accounts%rowtype; parent public.registrations%rowtype; base private.billing_invoices%rowtype;
begin
  if not (select enabled from private.billing_settings where id) then return null; end if;
  select * into job from private.billing_jobs where id=p_id and state='processing' and lease_token=p_lease_token and lease_until>now() for update;
  if not found then return null; end if;
  select * into invoice from private.billing_invoices where id=job.invoice_id;
  select * into account from private.billing_accounts where id=invoice.account_id;
  select * into parent from public.registrations where id=account.registration_id;
  if parent.id is null or account.parent_user_id is null then
    update private.billing_jobs set state='cancelled',finished_at=now() where id=job.id; return null;
  end if;
  if invoice.base_invoice_id is not null then select * into base from private.billing_invoices where id=invoice.base_invoice_id; end if;
  if (job.kind='create_invoice' and invoice.provider_invoice_id is not null)
    or (job.kind in ('send_invoice','send_reminder') and (invoice.status<>'pending' or invoice.paid_paise>0 or invoice.payment_url=''))
    or (job.kind='send_reminder' and account.status<>'active')
    or (job.kind='send_reminder' and (job.dedupe_key<>'reminder:'||invoice.id||':'||(now() at time zone 'Asia/Kolkata')::date
      or (now() at time zone 'Asia/Kolkata')::date>(invoice.due_date at time zone 'Asia/Kolkata')::date))
    or (job.kind='send_receipt' and invoice.paid_paise=0)
    or (job.kind='send_refund' and invoice.refunded_paise=0)
    or (job.kind='create_invoice' and invoice.kind='late_fee' and (base.status<>'pending' or base.paid_paise>0 or account.status<>'active'
      or not account.late_fees_enabled or account.team_testing or (select team_testing from private.billing_settings where id))) then
    update private.billing_jobs set state='cancelled',finished_at=now() where id=job.id;
    if job.kind='create_invoice' and invoice.kind='late_fee' and invoice.provider_invoice_id is null then
      update private.billing_invoices set status='cancelled',updated_at=now() where id=invoice.id;
    end if;
    return null;
  end if;
  return jsonb_build_object('kind',job.kind,'team_testing',account.team_testing,
    'invoice',jsonb_build_object('id',invoice.id,'registration_id',account.registration_id,'receipt','LAI'||replace(invoice.id::text,'-',''),
      'kind',invoice.kind,'base_invoice_id',invoice.base_invoice_id,'base_provider_invoice_id',base.provider_invoice_id,
      'base_invoice',case when base.id is not null then jsonb_build_object('id',base.id,'receipt','LAI'||replace(base.id::text,'-',''),
        'currency',base.currency,'amount_paise',base.amount_paise,'provider_invoice_id',base.provider_invoice_id,'provider_payment_id',base.provider_payment_id,
        'created_at',base.created_at) else null end,
      'currency',invoice.currency,'amount_paise',invoice.amount_paise,'base_amount_paise',invoice.base_amount_paise,'late_fee_paise',invoice.late_fee_paise,
      'late_fees_enabled',account.late_fees_enabled,'late_fee_policy',account.late_fee_policy,'late_fee_rate_paise',account.late_fee_paise,
      'paid_paise',invoice.paid_paise,'refunded_paise',invoice.refunded_paise,'paid_at',invoice.paid_at,'created_at',invoice.created_at,'period_start',invoice.period_start,'due_date',invoice.due_date,
      'parent_name',parent.full_name,'parent_email',parent.email,'parent_phone',parent.phone,'child_name',parent.metadata->>'childName',
      'provider_invoice_id',invoice.provider_invoice_id,'provider_payment_id',invoice.provider_payment_id,'payment_url',invoice.payment_url,'invoice_url',invoice.invoice_url));
end;
$$;
revoke all on function public.prepare_billing_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_billing_job(uuid,uuid) to service_role;

create function public.finish_billing_job(p_id uuid,p_lease_token uuid,p_outcome text,p_failure_code text default '')
returns boolean language plpgsql security definer set search_path='' as $$
declare job private.billing_jobs%rowtype;
begin
  if p_outcome is null or p_outcome not in ('done','retry','ambiguous','cancelled','failed') or p_failure_code is null
    or p_failure_code not in ('','provider_unavailable','configuration_error','send_failure','invoice_missing','provider_mismatch','creation_ambiguous') then raise exception using errcode='22023',message='Invalid billing job outcome.'; end if;
  select * into job from private.billing_jobs where id=p_id and state='processing' and lease_token=p_lease_token and lease_until>now() for update;
  if not found then return false; end if;
  update private.billing_jobs set state=case when p_outcome='ambiguous' then 'ambiguous' when p_outcome='retry' and attempts<8 then 'pending' when p_outcome='retry' then 'failed' else p_outcome end,
    failure_code=p_failure_code,lease_token=null,lease_until=null,
    next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,attempts-1)::integer)),
    finished_at=case when p_outcome in ('done','cancelled','ambiguous','failed') or attempts>=8 then now() else null end
    where id=job.id;
  if p_outcome='done' and job.kind='reconcile_invoice' and job.dedupe_key like 'event:%' then
    update private.billing_webhook_events set applied_at=now() where event_id=substring(job.dedupe_key from 7) and invoice_id=job.invoice_id;
  end if;
  return true;
end;
$$;
revoke all on function public.finish_billing_job(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_billing_job(uuid,uuid,text,text) to service_role;

create function public.save_billing_provider_snapshot(p_invoice_id uuid,p_snapshot jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare invoice private.billing_invoices%rowtype; provider_id text; payment_id text; paid integer; refunded integer; total integer; state text; url text; snapshot_paid_at timestamptz;
begin
  if jsonb_typeof(p_snapshot) is distinct from 'object' or octet_length(p_snapshot::text)>12000 then raise exception using errcode='22023',message='Invalid provider snapshot.'; end if;
  select * into invoice from private.billing_invoices where id=p_invoice_id for update;
  if not found then raise exception using errcode='P0002',message='Invoice is unavailable.'; end if;
  provider_id:=p_snapshot->>'provider_invoice_id'; payment_id:=nullif(p_snapshot->>'provider_payment_id',''); state:=p_snapshot->>'provider_status';
  if provider_id is null or provider_id!~'^inv_[A-Za-z0-9]+$' or (invoice.provider_invoice_id is not null and invoice.provider_invoice_id<>provider_id)
    or p_snapshot->>'receipt' is distinct from 'LAI'||replace(invoice.id::text,'-','') or p_snapshot->>'currency' is distinct from 'INR'
    or state is null or state not in ('draft','issued','partially_paid','paid','cancelled','expired','deleted')
    or (payment_id is not null and payment_id!~'^pay_[A-Za-z0-9]+$')
    or (invoice.provider_payment_id is not null and payment_id is not null and invoice.provider_payment_id<>payment_id)
    or coalesce(p_snapshot->>'amount_paise','')!~'^[0-9]{1,10}$' or coalesce(p_snapshot->>'paid_paise','')!~'^[0-9]{1,10}$'
    or coalesce(p_snapshot->>'refunded_paise','')!~'^[0-9]{1,10}$' then raise exception using errcode='22023',message='Provider invoice does not match.'; end if;
  total:=(p_snapshot->>'amount_paise')::integer; paid:=(p_snapshot->>'paid_paise')::integer; refunded:=(p_snapshot->>'refunded_paise')::integer;
  if total<>invoice.amount_paise or paid not in (0,total) or refunded>paid or (paid>0 and (p_snapshot->'captured' is distinct from 'true'::jsonb or payment_id is null)) then
    raise exception using errcode='22023',message='Provider amount or capture does not match.';
  end if;
  url:=coalesce(p_snapshot->>'payment_url','');
  if url<>'' and url!~'^https://([a-zA-Z0-9-]+\.)*(razorpay\.com|rzp\.io)(/[^[:space:]<>]*)?$' then raise exception using errcode='22023',message='Invalid hosted invoice URL.'; end if;
  if coalesce(p_snapshot->>'invoice_url','')<>'' and p_snapshot->>'invoice_url' is distinct from url then raise exception using errcode='22023',message='Invoice URL does not match.'; end if;
  if paid>0 then
    snapshot_paid_at:=(p_snapshot->>'paid_at')::timestamptz;
    if snapshot_paid_at is null or snapshot_paid_at>now()+interval '5 minutes' then raise exception using errcode='22023',message='Invalid capture time.'; end if;
  end if;
  if paid>invoice.paid_paise then
    insert into private.billing_ledger(invoice_id,kind,amount_paise,cumulative_paise) values(invoice.id,'capture',paid-invoice.paid_paise,paid);
  end if;
  if refunded>invoice.refunded_paise then
    insert into private.billing_ledger(invoice_id,kind,amount_paise,cumulative_paise) values(invoice.id,'refund',refunded-invoice.refunded_paise,refunded);
  end if;
  update private.billing_invoices set provider_invoice_id=provider_id,provider_payment_id=coalesce(payment_id,provider_payment_id),provider_status=state,
    payment_url=case when url<>'' then url else payment_url end,invoice_url=case when url<>'' then url else invoice_url end,
    paid_paise=greatest(paid,paid_paise),refunded_paise=greatest(refunded,refunded_paise),
    paid_at=coalesce(paid_at,snapshot_paid_at),checked_at=now(),updated_at=now(),
    status=case when greatest(refunded,refunded_paise)=amount_paise then 'refunded' when greatest(refunded,refunded_paise)>0 then 'partially_refunded'
      when greatest(paid,paid_paise)=amount_paise then 'paid' when status in ('cancelled','expired') then status
      when state in ('cancelled','deleted') then 'cancelled' when state='expired' then 'expired' when state='draft' then 'creating' else 'pending' end
    where id=invoice.id;
  if state not in ('cancelled','deleted','expired','draft') and paid=0 and url<>'' then
    insert into private.billing_jobs(invoice_id,kind,dedupe_key) values(invoice.id,'send_invoice','invoice-email:'||invoice.id) on conflict do nothing;
  end if;
  if paid>invoice.paid_paise then insert into private.billing_jobs(invoice_id,kind,dedupe_key) values(invoice.id,'send_receipt','receipt:'||invoice.id) on conflict do nothing; end if;
  if refunded>invoice.refunded_paise then insert into private.billing_jobs(invoice_id,kind,dedupe_key) values(invoice.id,'send_refund','refund:'||invoice.id||':'||refunded) on conflict do nothing; end if;
  update private.billing_webhook_events set invoice_id=invoice.id
    where (provider_invoice_id=provider_id or (payment_id is not null and provider_payment_id=payment_id)) and applied_at is null;
  -- A recovered create is complete even when the worker lost its original lease.
  update private.billing_jobs j set state='done',lease_token=null,lease_until=null,finished_at=now(),failure_code=''
    where j.invoice_id=invoice.id and j.kind='create_invoice' and j.state in ('pending','ambiguous');
  return true;
end;
$$;
revoke all on function public.save_billing_provider_snapshot(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_billing_provider_snapshot(uuid,jsonb) to service_role;

create function public.ingest_billing_webhook(p_event_id text,p_invoice_id text,p_payment_id text,p_event_type text,p_payload_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare existing private.billing_webhook_events%rowtype; matched uuid;
begin
  if p_event_id is null or char_length(p_event_id) not between 1 and 200 or p_event_id~'[[:cntrl:]]'
    or p_event_type is null or char_length(p_event_type) not between 1 and 100 or p_event_type~'[[:cntrl:]]'
    or coalesce(p_payload_hash,'')!~'^[0-9a-f]{64}$'
    or (nullif(p_invoice_id,'') is not null and p_invoice_id!~'^inv_[A-Za-z0-9]+$')
    or (nullif(p_payment_id,'') is not null and p_payment_id!~'^pay_[A-Za-z0-9]+$') then raise exception using errcode='22023',message='Invalid provider event.'; end if;
  select id into matched from private.billing_invoices where provider_invoice_id=nullif(p_invoice_id,'') or provider_payment_id=nullif(p_payment_id,'') limit 1;
  insert into private.billing_webhook_events(event_id,provider_invoice_id,provider_payment_id,event_type,payload_hash,invoice_id)
    values(p_event_id,nullif(p_invoice_id,''),nullif(p_payment_id,''),p_event_type,p_payload_hash,matched) on conflict(event_id) do nothing;
  if not found then
    select * into existing from private.billing_webhook_events where event_id=p_event_id;
    if existing.payload_hash<>p_payload_hash then raise exception using errcode='PT409',message='Provider event conflict.'; end if;
    return false;
  end if;
  if matched is not null then insert into private.billing_jobs(invoice_id,kind,dedupe_key) values(matched,'reconcile_invoice','event:'||p_event_id) on conflict do nothing; end if;
  perform private.wake_billing_worker();
  return true;
end;
$$;
revoke all on function public.ingest_billing_webhook(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.ingest_billing_webhook(text,text,text,text,text) to service_role;

do $$ begin
  if to_regnamespace('cron') is not null then
    if not exists(select 1 from cron.job where jobname='letsaimit-billing-worker') then
      perform cron.schedule('letsaimit-billing-worker','* * * * *','select private.wake_billing_worker();');
    end if;
  end if;
end; $$;
