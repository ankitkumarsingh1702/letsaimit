-- Forward-only custom quotes. Legacy accounts, invoices and accepted prices remain unchanged.
alter table private.billing_settings add column pricing_model text not null default 'custom_quote' check(pricing_model='custom_quote');
update private.billing_settings set team_testing=false,charge_amount_paise=600000,regular_amount_paise=600000,
  late_fee_paise=10000,late_fee_policy='daily',late_fees_enabled=true where id;
alter table private.billing_accounts
  add column pricing_model text not null default 'legacy' check(pricing_model in ('legacy','custom_quote')),
  add column initial_amount_paise integer;
update private.billing_accounts set initial_amount_paise=charge_amount_paise;
alter table private.billing_accounts alter column initial_amount_paise set not null;
alter table private.billing_accounts add constraint billing_initial_amount_check check(initial_amount_paise between 100 and 10000000);

create table private.billing_approval_quotes (
  registration_id uuid primary key references public.registrations(id) on delete restrict,
  amount_paise integer not null check(amount_paise between 100 and 10000000),
  approved_by text not null,
  created_at timestamptz not null default now()
);
create table private.billing_price_changes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references private.billing_accounts(id) on delete restrict,
  effective_month date not null check(extract(day from effective_month)=1),
  old_amount_paise integer not null check(old_amount_paise between 100 and 10000000),
  new_amount_paise integer not null check(new_amount_paise between 100 and 10000000),
  previous_revision bigint not null,
  revision bigint not null,
  changed_by text not null,
  created_at timestamptz not null default now(),
  unique(account_id,revision)
);
create index billing_price_effective_idx on private.billing_price_changes(account_id,effective_month desc,revision desc);
create table private.billing_month_summaries (
  month date primary key check(extract(day from month)=1),
  generated_at timestamptz not null,
  summary jsonb not null check(jsonb_typeof(summary)='object')
);
alter table private.billing_approval_quotes enable row level security;
alter table private.billing_price_changes enable row level security;
alter table private.billing_month_summaries enable row level security;
revoke all on private.billing_approval_quotes,private.billing_price_changes,private.billing_month_summaries from public,anon,authenticated;

alter table private.billing_jobs alter column invoice_id drop not null;
alter table private.billing_jobs add column change_id uuid references private.billing_price_changes(id) on delete restrict,
  add column summary_month date references private.billing_month_summaries(month) on delete restrict,
  add column recipient_email text;
alter table private.billing_jobs drop constraint billing_jobs_kind_check;
alter table private.billing_jobs add constraint billing_jobs_kind_check check(kind in ('create_invoice','reconcile_invoice','send_invoice','send_reminder','send_receipt','send_refund','send_fee_change','send_month_summary'));
alter table private.billing_jobs add constraint billing_job_payload_check check(
  (kind='send_fee_change' and change_id is not null and invoice_id is null and summary_month is null and recipient_email is null)
  or (kind='send_month_summary' and summary_month is not null and recipient_email is not null and invoice_id is null and change_id is null)
  or (kind not in ('send_fee_change','send_month_summary') and invoice_id is not null and change_id is null and summary_month is null and recipient_email is null)
);
create index billing_jobs_change_idx on private.billing_jobs(change_id) where change_id is not null;
create index billing_jobs_summary_idx on private.billing_jobs(summary_month) where summary_month is not null;

create or replace function public.get_billing_terms()
returns jsonb language sql stable security definer set search_path='' as $$
  select terms||jsonb_build_object('version','billing-2026-11-10-'||encode(sha256(convert_to(terms::text,'UTF8')),'hex')) from (
    select jsonb_build_object('enabled',enabled,'pricing_model','custom_quote','default_amount_paise',regular_amount_paise,
      'late_fee_paise',late_fee_paise,'late_fee_policy',late_fee_policy,'late_fees_enabled',late_fees_enabled,
      'due_day',5,'first_due_days',0) terms from private.billing_settings where id
  ) settings;
$$;
create or replace function private.normalized_registration(payload jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare normalized jsonb; terms jsonb;
begin
  normalized:=private.registration_fields_without_billing(payload); terms:=public.get_billing_terms();
  if normalized->'metadata'->>'formType'='enrol' and terms->'enabled'='true'::jsonb then
    if payload->'metadata'->>'billingPricingMode' is distinct from 'custom_quote'
      or payload->'metadata'->>'billingTermsVersion' is distinct from terms->>'version' then
      raise exception using errcode='PT412',message='Payment details changed. Reload and confirm the coaching fee policy.',detail='billingTermsVersion';
    end if;
    if payload->'metadata'->'billingConsent' is distinct from 'true'::jsonb then
      raise exception using errcode='22023',message='Please accept the coaching fee policy.',detail='billingConsent';
    end if;
    normalized:=jsonb_set(normalized,'{metadata}',normalized->'metadata'||jsonb_build_object('billingPricingMode','custom_quote',
      'billingConsent',true,'billingTermsVersion',terms->>'version','billingTerms',terms));
  end if;
  return normalized;
end;
$$;

create or replace function public.submit_registration(payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare normalized jsonb; saved public.registrations%rowtype; owner_id uuid; request_id uuid; expected_fingerprint text; duplicate boolean:=false;
begin
  owner_id:=private.require_google_user(); normalized:=private.registration_fields_without_billing(payload);
  request_id:=(normalized->'metadata'->>'submissionId')::uuid;
  select * into saved from public.registrations where submission_id=request_id;
  if found then
    if saved.parent_user_id is distinct from owner_id then raise exception using errcode='PT409',message='These details have changed. Start a new registration.'; end if;
    if saved.metadata->'billingConsent'='true'::jsonb then
      if payload->'metadata'->'billingConsent' is distinct from 'true'::jsonb
        or payload->'metadata'->>'billingTermsVersion' is distinct from saved.metadata->>'billingTermsVersion'
        or payload->'metadata'->>'billingPricingMode' is distinct from saved.metadata->>'billingPricingMode' then
        raise exception using errcode='PT409',message='These billing terms have changed. Start a new registration.';
      end if;
      normalized:=jsonb_set(normalized,'{metadata}',normalized->'metadata'||jsonb_build_object('billingConsent',true,'billingTermsVersion',saved.metadata->>'billingTermsVersion','billingTerms',saved.metadata->'billingTerms')
        ||case when saved.metadata?'billingPricingMode' then jsonb_build_object('billingPricingMode',saved.metadata->>'billingPricingMode') else '{}'::jsonb end);
    end if;
    if saved.fingerprint<>encode(sha256(convert_to(normalized::text,'UTF8')),'hex') then raise exception using errcode='PT409',message='These details have changed. Start a new registration.'; end if;
    return jsonb_build_object('ok',true,'submissionId',saved.submission_id,'savedAt',saved.created,'duplicate',true,'id',saved.id);
  end if;
  normalized:=private.normalized_registration(payload); expected_fingerprint:=encode(sha256(convert_to(normalized::text,'UTF8')),'hex');
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

create or replace function private.start_approved_billing()
returns trigger language plpgsql security definer set search_path='' as $$
declare account_id uuid; bill_id uuid; quote private.billing_approval_quotes%rowtype; settings private.billing_settings%rowtype;
begin
  select * into settings from private.billing_settings where id;
  select * into quote from private.billing_approval_quotes where registration_id=new.id;
  if not settings.enabled or quote.registration_id is null or new.metadata->>'formType'<>'enrol' or new.parent_user_id is null
    or new.metadata->>'billingPricingMode' is distinct from 'custom_quote' or new.metadata->'billingConsent' is distinct from 'true'::jsonb then return new; end if;
  insert into private.billing_accounts(registration_id,parent_user_id,start_month,created_at,team_testing,charge_amount_paise,initial_amount_paise,
    late_fee_paise,late_fee_policy,late_fees_enabled,billing_terms_version,pricing_model)
    values(new.id,new.parent_user_id,date_trunc('month',new.reviewed_at at time zone 'Asia/Kolkata')::date,new.reviewed_at,false,
      quote.amount_paise,quote.amount_paise,(new.metadata->'billingTerms'->>'late_fee_paise')::integer,
      new.metadata->'billingTerms'->>'late_fee_policy',(new.metadata->'billingTerms'->>'late_fees_enabled')::boolean,
      new.metadata->>'billingTermsVersion','custom_quote')
    on conflict(registration_id) do nothing returning id into account_id;
  if account_id is null then return new; end if;
  insert into private.billing_invoices(account_id,period_start,due_date,base_amount_paise)
    values(account_id,date_trunc('month',new.reviewed_at at time zone 'Asia/Kolkata')::date,new.reviewed_at,quote.amount_paise) returning id into bill_id;
  insert into private.billing_jobs(invoice_id,kind,dedupe_key) values(bill_id,'create_invoice','create:'||bill_id);
  perform private.wake_billing_worker();return new;
end;
$$;

create function public.review_registration(p_id uuid,p_decision text,p_expected_revision bigint,p_monthly_amount_paise integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.registrations%rowtype; quote_amount integer; billing_enabled boolean;
begin
  if not private.is_allowed_admin() then raise exception using errcode='42501',message='Admin access is required.'; end if;
  if p_decision is null or p_decision not in ('accepted','declined') or p_expected_revision is null or p_expected_revision<1 or p_expected_revision>9007199254740991 then
    raise exception using errcode='22023',message='Check the requested decision and saved revision.';
  end if;
  select * into saved from public.registrations where id=p_id for update;
  if not found then raise exception using errcode='P0002',message='This request is no longer available.'; end if;
  if saved.review_decision<>p_decision then
    if saved.review_decision<>'pending' or saved.revision<>p_expected_revision then raise exception using errcode='PT409',message='This request changed. Review its latest saved version.'; end if;
    select enabled into billing_enabled from private.billing_settings where id;
    if p_decision='accepted' and saved.metadata->>'formType'='enrol' and billing_enabled then
      if saved.metadata->>'billingPricingMode' is distinct from 'custom_quote' or saved.metadata->'billingConsent' is distinct from 'true'::jsonb then
        raise exception using errcode='PT412',message='Ask the parent to submit a new enrolment with the current fee policy.';
      end if;
      if p_monthly_amount_paise is null or p_monthly_amount_paise<100 or p_monthly_amount_paise>10000000 then
        raise exception using errcode='22023',message='Enter a monthly coaching fee from ₹1 to ₹100,000.',detail='monthlyAmount';
      end if;
      insert into private.billing_approval_quotes(registration_id,amount_paise,approved_by) values(saved.id,p_monthly_amount_paise,lower(auth.jwt()->>'email'));
    elsif p_monthly_amount_paise is not null then
      raise exception using errcode='22023',message='Only an enrolment approval can include a coaching fee.';
    end if;
    update public.registrations set review_decision=p_decision where id=p_id returning * into saved;
  end if;
  select amount_paise into quote_amount from private.billing_approval_quotes where registration_id=saved.id;
  if quote_amount is null then select charge_amount_paise into quote_amount from private.billing_accounts where registration_id=saved.id; end if;
  if p_decision='accepted' and p_monthly_amount_paise is not null and quote_amount is distinct from p_monthly_amount_paise then
    raise exception using errcode='PT409',message='The approved fee is already saved. Use next-month billing to change future fees.';
  end if;
  return (to_jsonb(saved)-'fingerprint'-'parent_user_id')||jsonb_build_object('approved_monthly_amount_paise',quote_amount);
end;
$$;
revoke all on function public.review_registration(uuid,text,bigint,integer) from public,anon,authenticated;
grant execute on function public.review_registration(uuid,text,bigint,integer) to authenticated;
create or replace function public.review_registration(p_id uuid,p_decision text,p_expected_revision bigint)
returns jsonb language sql security definer set search_path='' as $$select public.review_registration(p_id,p_decision,p_expected_revision,null);$$;

create function private.billing_amount_for_month(p_account uuid,p_month date)
returns integer language sql stable security definer set search_path='' as $$
  select coalesce((select c.new_amount_paise from private.billing_price_changes c where c.account_id=a.id and c.effective_month<=p_month order by c.effective_month desc,c.revision desc limit 1),a.initial_amount_paise)
  from private.billing_accounts a where a.id=p_account;
$$;
revoke all on function private.billing_amount_for_month(uuid,date) from public,anon,authenticated;
create function private.billing_account_dto(p_account uuid,p_at timestamptz)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',a.id,'registration_id',a.registration_id,'status',a.status,'revision',a.revision,'pricing_model',a.pricing_model,
    'parent_name',r.full_name,'child_name',r.metadata->>'childName','created_at',a.created_at,'cancelled_at',a.cancelled_at,
    'monthly_amount_paise',private.billing_amount_for_month(a.id,date_trunc('month',p_at at time zone 'Asia/Kolkata')::date),
    'next_month_amount_paise',private.billing_amount_for_month(a.id,(date_trunc('month',p_at at time zone 'Asia/Kolkata')+interval '1 month')::date),
    'next_effective_month',(date_trunc('month',p_at at time zone 'Asia/Kolkata')+interval '1 month')::date)
  from private.billing_accounts a join public.registrations r on r.id=a.registration_id where a.id=p_account;
$$;
revoke all on function private.billing_account_dto(uuid,timestamptz) from public,anon,authenticated;
create function public.set_monthly_coaching_fee(p_registration_id uuid,p_amount_paise integer,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare account private.billing_accounts%rowtype; old_fee integer; effective date; change_id uuid; previous private.billing_price_changes%rowtype;
begin
  if not private.is_allowed_admin() then raise exception using errcode='42501',message='Admin access is required.'; end if;
  if p_amount_paise is null or p_amount_paise<100 or p_amount_paise>10000000 then raise exception using errcode='22023',message='Enter a monthly coaching fee from ₹1 to ₹100,000.',detail='monthlyAmount'; end if;
  select * into account from private.billing_accounts where registration_id=p_registration_id for update;
  if not found then raise exception using errcode='P0002',message='No monthly billing account was found.'; end if;
  if account.pricing_model<>'custom_quote' then raise exception using errcode='PT412',message='New parent fee-policy consent is required before changing this legacy account.'; end if;
  if account.status<>'active' then raise exception using errcode='PT409',message='Monthly billing has stopped.'; end if;
  effective:=(date_trunc('month',now() at time zone 'Asia/Kolkata')+interval '1 month')::date;
  select * into previous from private.billing_price_changes where account_id=account.id and effective_month=effective order by revision desc limit 1;
  if p_expected_revision is null or account.revision<>p_expected_revision then
    if previous.previous_revision=p_expected_revision and previous.revision=account.revision and previous.new_amount_paise=p_amount_paise then return private.billing_account_dto(account.id,now()); end if;
    raise exception using errcode='PT409',message='Billing changed. Review its latest saved version.';
  end if;
  old_fee:=private.billing_amount_for_month(account.id,effective);
  if old_fee=p_amount_paise then return private.billing_account_dto(account.id,now()); end if;
  insert into private.billing_price_changes(account_id,effective_month,old_amount_paise,new_amount_paise,previous_revision,revision,changed_by)
    values(account.id,effective,old_fee,p_amount_paise,account.revision,account.revision+1,lower(auth.jwt()->>'email')) returning id into change_id;
  update private.billing_accounts set revision=revision+1 where id=account.id;
  insert into private.billing_jobs(kind,change_id,dedupe_key) values('send_fee_change',change_id,'fee-change:'||change_id);
  perform private.wake_billing_worker();
  return private.billing_account_dto(account.id,now());
end;
$$;
revoke all on function public.set_monthly_coaching_fee(uuid,integer,bigint) from public,anon,authenticated;
grant execute on function public.set_monthly_coaching_fee(uuid,integer,bigint) to authenticated;

create function private.billing_upcoming_month(p_month date,p_at timestamptz,p_owner uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('month',p_month,
    'children',coalesce((select jsonb_agg(jsonb_build_object('registration_id',a.registration_id,'child_name',r.metadata->>'childName',
      'parent_name',r.full_name,'monthly_fee_paise',private.billing_amount_for_month(a.id,p_month)) order by r.metadata->>'childName',a.id)
      from private.billing_accounts a join public.registrations r on r.id=a.registration_id
      where a.status='active' and a.parent_user_id is not null and (p_owner is null or a.parent_user_id=p_owner)),'[]'::jsonb),
    'total_paise',coalesce((select sum(private.billing_amount_for_month(a.id,p_month)) from private.billing_accounts a
      where a.status='active' and a.parent_user_id is not null and (p_owner is null or a.parent_user_id=p_owner)),0),
    'old_pending_paise',coalesce((select sum(greatest(i.amount_paise-i.paid_paise,0)) from private.billing_invoices i
      join private.billing_accounts a on a.id=i.account_id where i.period_start<p_month and i.status in ('creating','pending')
        and (i.kind<>'late_fee' or i.fee_date<=(p_at at time zone 'Asia/Kolkata')::date)
        and (p_owner is null or a.parent_user_id=p_owner)),0),
    'old_pending_count',(select count(*) from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id
      where i.period_start<p_month and i.status in ('creating','pending')
        and (i.kind<>'late_fee' or i.fee_date<=(p_at at time zone 'Asia/Kolkata')::date) and (p_owner is null or a.parent_user_id=p_owner)),
    'generated_at',p_at);
$$;
revoke all on function private.billing_upcoming_month(date,timestamptz,uuid) from public,anon,authenticated;
alter function private.billing_snapshot(uuid,boolean) rename to billing_snapshot_v1;
create function private.billing_snapshot(p_owner uuid,p_admin boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare value jsonb; accounts jsonb; invoice_rows jsonb; next_month date;
begin
  value:=private.billing_snapshot_v1(p_owner,p_admin);
  select coalesce(jsonb_agg(private.billing_account_dto(a.id,now()) order by a.created_at desc),'[]'::jsonb) into accounts
    from private.billing_accounts a where p_admin or a.parent_user_id=p_owner;
  select coalesce(jsonb_agg(row_data||jsonb_build_object('pricing_model',a.pricing_model,
    'initial_invoice',i.kind='monthly' and i.period_start=a.start_month)),'[]'::jsonb) into invoice_rows
    from jsonb_array_elements(value->'invoices') row_data join private.billing_invoices i on i.id=(row_data->>'id')::uuid
    join private.billing_accounts a on a.id=i.account_id;
  next_month:=(date_trunc('month',now() at time zone 'Asia/Kolkata')+interval '1 month')::date;
  return value||jsonb_build_object('accounts',accounts,'invoices',invoice_rows,
    'settings',(value->'settings')||jsonb_build_object('pricing_model','custom_quote','default_amount_paise',(select regular_amount_paise from private.billing_settings where id)),
    'upcoming_month',private.billing_upcoming_month(next_month,now(),case when p_admin then null else p_owner end));
end;
$$;
revoke all on function private.billing_snapshot(uuid,boolean),private.billing_snapshot_v1(uuid,boolean) from public,anon,authenticated;

create function private.billing_reminder_slot(p_at timestamptz)
returns text language sql immutable set search_path='' as $$
  select case when extract(hour from p_at at time zone 'Asia/Kolkata')>=18 then '18'
    when extract(hour from p_at at time zone 'Asia/Kolkata')>=15 then '15'
    when extract(hour from p_at at time zone 'Asia/Kolkata')>=12 then '12'
    when extract(hour from p_at at time zone 'Asia/Kolkata')>=9 then '09' else null end;
$$;
revoke all on function private.billing_reminder_slot(timestamptz) from public,anon,authenticated;

create function private.enqueue_billing_work_at(p_at timestamptz)
returns integer language plpgsql security definer set search_path='' as $$
declare settings private.billing_settings%rowtype; local_today date; month_start date; next_month date; slot text;
  n integer:=0; added integer; bill record; fee_start date; summary jsonb;
begin
  select * into settings from private.billing_settings where id and enabled for update;
  if not found then return 0; end if;
  local_today:=(p_at at time zone 'Asia/Kolkata')::date;month_start:=date_trunc('month',local_today)::date;
  next_month:=(month_start+interval '1 month')::date;slot:=private.billing_reminder_slot(p_at);
  with missing as (
    select a.id,cycle::date period from private.billing_accounts a
    cross join lateral generate_series(a.start_month+interval '1 month',month_start,interval '1 month') cycle
    where a.status='active' and a.parent_user_id is not null
      and not exists(select 1 from private.billing_invoices i where i.account_id=a.id and i.kind='monthly' and i.period_start=cycle::date)
    order by cycle,a.id limit 100
  ), inserted as (
    insert into private.billing_invoices(account_id,period_start,due_date,base_amount_paise,created_at)
      select id,period,(period+4+time '23:59:59') at time zone 'Asia/Kolkata',private.billing_amount_for_month(id,period),p_at from missing
      on conflict do nothing returning id
  ) insert into private.billing_jobs(invoice_id,kind,dedupe_key) select id,'create_invoice','create:'||id from inserted on conflict do nothing;
  get diagnostics added=row_count;n:=n+added;
  update private.billing_jobs set state='ambiguous',failure_code='creation_ambiguous',lease_token=null,lease_until=null
    where kind='create_invoice' and state='processing' and lease_until<=p_at;
  insert into private.billing_jobs(invoice_id,kind,dedupe_key)
    select i.id,'reconcile_invoice','reconcile:'||i.id||':'||date_bin(interval '5 minutes',p_at,timestamptz '1970-01-01')::text from private.billing_invoices i
    where (i.status='creating' and exists(select 1 from private.billing_jobs j where j.invoice_id=i.id and j.kind='create_invoice' and j.state='ambiguous'))
      or (i.provider_invoice_id is not null and (i.checked_at is null or i.checked_at<p_at-case when i.status in ('pending','creating') then interval '5 minutes' else interval '1 day' end))
    order by i.checked_at nulls first limit 100 on conflict do nothing;
  get diagnostics added=row_count;n:=n+added;
  update private.billing_webhook_events e set invoice_id=i.id from private.billing_invoices i where e.invoice_id is null
    and (e.provider_invoice_id=i.provider_invoice_id or e.provider_payment_id=i.provider_payment_id);
  insert into private.billing_jobs(invoice_id,kind,dedupe_key)
    select invoice_id,'reconcile_invoice','event:'||event_id from private.billing_webhook_events where invoice_id is not null and applied_at is null on conflict do nothing;
  get diagnostics added=row_count;n:=n+added;

  -- One current-slot job per verified parent, across every child and payable bill.
  if slot is not null then
    insert into private.billing_jobs(invoice_id,kind,dedupe_key,created_at)
      select anchor.id,'send_reminder','reminder:'||parents.parent_user_id||':'||local_today||':'||slot,p_at
      from (select distinct a.parent_user_id from private.billing_accounts a where a.parent_user_id is not null) parents
      cross join lateral (
        select i.id from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id
        where a.parent_user_id=parents.parent_user_id and i.status='pending' and i.paid_paise<i.amount_paise
          and i.provider_invoice_id is not null and i.payment_url<>'' order by i.created_at,i.id limit 1
      ) anchor on conflict do nothing;
    get diagnostics added=row_count;n:=n+added;
  end if;
  -- Legacy accounts retain their prior team/fee contract; only consented normal accounts accrue fees.
  for bill in select i.*,a.late_fee_policy,a.late_fee_paise account_fee_paise from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id
    where i.kind='monthly' and i.status='pending' and i.paid_paise=0 and i.provider_invoice_id is not null and a.status='active'
      and a.late_fees_enabled and not a.team_testing and a.late_fee_policy in ('once','daily') and a.late_fee_paise>0
      and local_today>(i.due_date at time zone 'Asia/Kolkata')::date order by i.due_date limit 100 loop
    fee_start:=(bill.due_date at time zone 'Asia/Kolkata')::date+1;
    if bill.late_fee_policy='daily' or not exists(select 1 from private.billing_invoices where base_invoice_id=bill.id and kind='late_fee') then
      with inserted as (
        insert into private.billing_invoices(account_id,kind,base_invoice_id,fee_date,period_start,due_date,base_amount_paise,late_fee_paise,created_at)
          select bill.account_id,'late_fee',bill.id,fee_day::date,bill.period_start,(local_today+time '23:59:59') at time zone 'Asia/Kolkata',0,bill.account_fee_paise,p_at
          from generate_series(fee_start,case when bill.late_fee_policy='once' then fee_start else local_today end,interval '1 day') fee_day
          where not exists(select 1 from private.billing_invoices prior where prior.base_invoice_id=bill.id and prior.fee_date=fee_day::date)
          order by fee_day limit 31 on conflict do nothing returning id
      ) insert into private.billing_jobs(invoice_id,kind,dedupe_key) select id,'create_invoice','create:'||id from inserted;
      get diagnostics added=row_count;n:=n+added;
    end if;
  end loop;
  -- Snapshot once on the last local calendar day, from 18:00. No empty daily email.
  if local_today=next_month-1 and extract(hour from p_at at time zone 'Asia/Kolkata')>=18 then
    summary:=private.billing_upcoming_month(next_month,p_at,null);
    insert into private.billing_month_summaries(month,generated_at,summary) values(next_month,p_at,summary) on conflict do nothing;
    insert into private.billing_jobs(kind,summary_month,recipient_email,dedupe_key,created_at)
      select 'send_month_summary',next_month,a.email,'month-summary:'||next_month||':'||a.email,p_at from public.allowed_admins a on conflict do nothing;
    get diagnostics added=row_count;n:=n+added;
  end if;
  return n;
end;
$$;
revoke all on function private.enqueue_billing_work_at(timestamptz) from public,anon,authenticated;
create or replace function public.enqueue_billing_work()
returns integer language sql security definer set search_path='' as $$select private.enqueue_billing_work_at(now());$$;

create function private.billing_invoice_dto(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',i.id,'registration_id',a.registration_id,'receipt','LAI'||replace(i.id::text,'-',''),
    'kind',i.kind,'pricing_model',a.pricing_model,'initial_invoice',i.kind='monthly' and i.period_start=a.start_month,
    'currency',i.currency,'amount_paise',i.amount_paise,'base_amount_paise',i.base_amount_paise,'late_fee_paise',i.late_fee_paise,
    'paid_paise',i.paid_paise,'refunded_paise',i.refunded_paise,'paid_at',i.paid_at,'created_at',i.created_at,'period_start',i.period_start,'due_date',i.due_date,
    'parent_name',r.full_name,'parent_email',r.email,'parent_phone',r.phone,'child_name',r.metadata->>'childName',
    'provider_invoice_id',i.provider_invoice_id,'provider_payment_id',i.provider_payment_id,'payment_url',i.payment_url,'invoice_url',i.invoice_url,
    'late_fees_enabled',a.late_fees_enabled,'late_fee_policy',a.late_fee_policy,'late_fee_rate_paise',a.late_fee_paise)
  from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id join public.registrations r on r.id=a.registration_id where i.id=p_id;
$$;
revoke all on function private.billing_invoice_dto(uuid) from public,anon,authenticated;
alter function public.prepare_billing_job(uuid,uuid) set schema private;
alter function private.prepare_billing_job(uuid,uuid) rename to prepare_billing_invoice_v1;
revoke all on function private.prepare_billing_invoice_v1(uuid,uuid) from public,anon,authenticated,service_role;
create function private.prepare_billing_job_at(p_id uuid,p_lease_token uuid,p_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.billing_jobs%rowtype; invoice private.billing_invoices%rowtype; account private.billing_accounts%rowtype;
  change private.billing_price_changes%rowtype; owner_id uuid; recipient text; name text; value jsonb; displayed jsonb; preflight jsonb;
  total bigint; invoice_count bigint; remaining bigint; expected_key text; latest_change uuid;
begin
  if not (select enabled from private.billing_settings where id) then return null; end if;
  select * into job from private.billing_jobs where id=p_id and state='processing' and lease_token=p_lease_token and lease_until>p_at for update;
  if not found then return null; end if;
  if job.kind='send_month_summary' then
    if not exists(select 1 from public.allowed_admins where email=job.recipient_email) then
      update private.billing_jobs set state='cancelled',finished_at=p_at where id=job.id;return null;
    end if;
    return jsonb_build_object('kind',job.kind,'recipient_email',job.recipient_email,'summary',(select summary from private.billing_month_summaries where month=job.summary_month));
  elsif job.kind='send_fee_change' then
    select * into change from private.billing_price_changes where id=job.change_id;
    select * into account from private.billing_accounts where id=change.account_id;
    select id into latest_change from private.billing_price_changes where account_id=account.id and effective_month=change.effective_month order by revision desc limit 1;
    select u.email into recipient from auth.users u where id=account.parent_user_id;
    if account.status<>'active' or latest_change is distinct from change.id or recipient is null then
      update private.billing_jobs set state='cancelled',finished_at=p_at where id=job.id;return null;
    end if;
    return jsonb_build_object('kind',job.kind,'team_testing',false,'invoice',jsonb_build_object('parent_name',(select full_name from public.registrations where id=account.registration_id),
      'parent_email',recipient,'child_name',(select metadata->>'childName' from public.registrations where id=account.registration_id),'amount_paise',change.new_amount_paise,
      'old_amount_paise',change.old_amount_paise,'currency','INR','effective_month',change.effective_month));
  elsif job.kind='send_reminder' then
    select a.parent_user_id into owner_id from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id where i.id=job.invoice_id;
    select u.email into recipient from auth.users u where u.id=owner_id;
    expected_key:='reminder:'||owner_id||':'||(p_at at time zone 'Asia/Kolkata')::date||':'||private.billing_reminder_slot(p_at);
    if owner_id is null or recipient is null or expected_key is null or job.dedupe_key<>expected_key then
      update private.billing_jobs set state='cancelled',finished_at=p_at where id=job.id;return null;
    end if;
    with payable as (
      select i.* from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id
      where a.parent_user_id=owner_id and i.status='pending' and i.paid_paise<i.amount_paise and i.provider_invoice_id is not null and i.payment_url<>''
    ) select coalesce(sum(amount_paise-paid_paise),0),count(*),count(*) filter(where checked_at is null or checked_at<greatest(job.created_at,created_at))
      into total,invoice_count,remaining from payable;
    if invoice_count=0 then update private.billing_jobs set state='cancelled',finished_at=p_at where id=job.id;return null;end if;
    select coalesce(jsonb_agg(private.billing_invoice_dto(id) order by created_at,id),'[]'::jsonb) into displayed from (
      select i.id,i.created_at from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id
      where a.parent_user_id=owner_id and i.status='pending' and i.paid_paise<i.amount_paise and i.provider_invoice_id is not null and i.payment_url<>'' order by i.created_at,i.id limit 100
    ) shown;
    select coalesce(jsonb_agg(private.billing_invoice_dto(id) order by created_at,id),'[]'::jsonb) into preflight from (
      select i.id,i.created_at from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id
      where a.parent_user_id=owner_id and i.status='pending' and i.paid_paise<i.amount_paise and i.provider_invoice_id is not null and i.payment_url<>''
        and (i.checked_at is null or i.checked_at<greatest(job.created_at,i.created_at)) order by i.created_at,i.id limit 20
    ) stale;
    select full_name into name from public.registrations where parent_user_id=owner_id order by created,id limit 1;
    return jsonb_build_object('kind',job.kind,'recipient_email',recipient,'parent_name',name,'invoices',displayed,'total_paise',total,'invoice_count',invoice_count,
      'invoices_truncated',invoice_count>100,'preflight_invoices',preflight,'preflight_remaining',remaining);
  end if;
  value:=private.prepare_billing_invoice_v1(p_id,p_lease_token);
  if value is null then return null; end if;
  select * into invoice from private.billing_invoices where id=job.invoice_id;
  select * into account from private.billing_accounts where id=invoice.account_id;
  return value||jsonb_build_object('invoice',(value->'invoice')||jsonb_build_object('pricing_model',account.pricing_model,
    'initial_invoice',invoice.kind='monthly' and invoice.period_start=account.start_month));
end;
$$;
revoke all on function private.prepare_billing_job_at(uuid,uuid,timestamptz) from public,anon,authenticated;
create function public.prepare_billing_job(p_id uuid,p_lease_token uuid)
returns jsonb language sql security definer set search_path='' as $$select private.prepare_billing_job_at(p_id,p_lease_token,now());$$;
revoke all on function public.prepare_billing_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_billing_job(uuid,uuid) to service_role;
