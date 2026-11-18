-- One-off charges and replacements are separate invoice records. Original monthly
-- obligations still anchor the cycle, even after a correction or waiver.
alter table private.billing_invoices
  drop constraint billing_invoices_kind_check,
  add column description text not null default '' check (
    char_length(description)<=80 and description !~ '[[:cntrl:]<>]'
  ),
  add column replaces_invoice_id uuid unique references private.billing_invoices(id) on delete restrict;

do $$
declare old_kind_constraint name;
begin
  select conname into strict old_kind_constraint
  from pg_constraint where conrelid='private.billing_invoices'::regclass and contype='c'
    and pg_get_constraintdef(oid) like '%base_invoice_id%fee_date%';
  execute format('alter table private.billing_invoices drop constraint %I',old_kind_constraint);
end;
$$;

alter table private.billing_invoices add constraint billing_invoice_kind check (
  (kind in ('monthly','one_off') and base_invoice_id is null and fee_date is null and base_amount_paise>0 and late_fee_paise=0)
  or (kind='late_fee' and base_invoice_id is not null and fee_date is not null
    and base_amount_paise=0 and late_fee_paise>0 and replaces_invoice_id is null)
);
drop index private.billing_monthly_unique;
create unique index billing_monthly_unique on private.billing_invoices(account_id,period_start)
  where kind='monthly' and replaces_invoice_id is null;

create table private.billing_admin_invoice_changes (
  account_id uuid not null references private.billing_accounts(id) on delete restrict,
  id uuid not null,
  invoice_id uuid not null references private.billing_invoices(id) on delete restrict,
  replacement_invoice_id uuid references private.billing_invoices(id) on delete restrict,
  type text not null check (type in ('invoice_created','outstanding_adjusted')),
  actor_email text not null check (actor_email<>''),
  amount_paise integer not null check (amount_paise=0 or amount_paise between 100 and 10000000),
  previous_amount_paise integer,
  reason text not null default '' check (char_length(reason)<=300 and reason !~ '[[:cntrl:]<>]'),
  status text not null check (status in ('pending','applied','payment_received','account_closed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (account_id,id),
  check ((status='pending')=(completed_at is null)),
  check ((type='invoice_created' and status='applied' and amount_paise>0 and previous_amount_paise is null)
    or (type='outstanding_adjusted' and previous_amount_paise>0 and reason<>''))
);
alter table private.billing_admin_invoice_changes enable row level security;
revoke all on private.billing_admin_invoice_changes from public,anon,authenticated,service_role;
create unique index billing_one_adjustment_per_invoice on private.billing_admin_invoice_changes(invoice_id)
  where type='outstanding_adjusted';

create function private.lock_student_payment_account(p_registration_id uuid)
returns private.billing_accounts language plpgsql security definer set search_path='' as $$
declare account private.billing_accounts%rowtype;
begin
  perform private.lock_google_registration_user();
  if not private.is_allowed_admin() then
    raise exception using errcode='42501',message='Admin access is required.';
  end if;
  perform 1 from public.registrations where id=p_registration_id and deleted_at is null for update;
  if not found or not private.coaching_student_registration(p_registration_id) then
    raise exception using errcode='P0002',message='This student is no longer available.';
  end if;
  select * into account from private.billing_accounts where registration_id=p_registration_id for update;
  if not found then
    raise exception using errcode='P0002',message='This student has no billing account.';
  end if;
  return account;
end;
$$;

create function private.require_student_invoice_writes(account private.billing_accounts)
returns void language plpgsql set search_path='' as $$
begin
  if account.status<>'active' or account.parent_user_id is null then
    raise exception using errcode='PT409',message='Billing has stopped for this student.';
  end if;
  if account.pricing_model<>'custom_quote' then
    raise exception using errcode='PT412',message='New parent fee-policy consent is required before changing this legacy account.';
  end if;
  if not (select enabled from private.billing_settings where id) then
    raise exception using errcode='PT409',message='Invoice creation is currently paused.';
  end if;
end;
$$;

create function private.billing_admin_invoice_change_dto(change private.billing_admin_invoice_changes)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',change.id,'status',change.status,'invoiceId',change.invoice_id,
    'replacementInvoiceId',change.replacement_invoice_id);
$$;

create function private.billing_invoice_can_adjust(p_invoice_id uuid)
returns boolean language sql stable set search_path='' as $$
  select i.kind in ('monthly','one_off') and i.paid_paise=0 and i.refunded_paise=0
    and not exists(select 1 from private.billing_admin_invoice_changes c
      where c.invoice_id=i.id and c.type='outstanding_adjusted')
    and (
      (i.status='pending' and i.provider_invoice_id is not null and i.provider_status='issued')
      or (i.status='creating' and i.provider_invoice_id is null and exists(
        select 1 from private.billing_jobs j
        where j.invoice_id=i.id and j.kind='create_invoice' and j.state='pending' and j.attempts=0
      ))
    )
  from private.billing_invoices i where i.id=p_invoice_id;
$$;

revoke all on function private.lock_student_payment_account(uuid),
  private.require_student_invoice_writes(private.billing_accounts),
  private.billing_admin_invoice_change_dto(private.billing_admin_invoice_changes),
  private.billing_invoice_can_adjust(uuid) from public,anon,authenticated,service_role;

create function public.create_student_payment_invoice(
  p_registration_id uuid,p_amount_paise integer,p_due_date date,p_description text,p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  account private.billing_accounts%rowtype:=private.lock_student_payment_account(p_registration_id);
  change private.billing_admin_invoice_changes%rowtype;
  invoice private.billing_invoices%rowtype;
  title text:=coalesce(nullif(regexp_replace(coalesce(p_description,''),'^[[:space:]]+|[[:space:]]+$','','g'),''),'One-off payment');
  actor text:=lower(auth.jwt()->>'email');
  today date:=(now() at time zone 'Asia/Kolkata')::date;
  due_at timestamptz;
begin
  if p_request_id is null or p_amount_paise is null or p_amount_paise not between 100 and 10000000
    or p_due_date is null or not isfinite(p_due_date) or char_length(title)>80 or title ~ '[[:cntrl:]<>]' then
    raise exception using errcode='22023',message='Enter an amount from ₹1 to ₹100,000, a due date, and a description of up to 80 characters.';
  end if;
  select * into change from private.billing_admin_invoice_changes where account_id=account.id and id=p_request_id;
  if found then
    select * into invoice from private.billing_invoices where id=change.invoice_id;
    if change.type='invoice_created' and change.actor_email=actor and change.amount_paise=p_amount_paise
      and invoice.description=title and (invoice.due_date at time zone 'Asia/Kolkata')::date=p_due_date then
      return private.billing_admin_invoice_change_dto(change);
    end if;
    raise exception using errcode='PT409',message='This invoice request already contains different details.';
  end if;
  perform private.require_student_invoice_writes(account);
  if p_due_date<today or p_due_date>today+interval '1 year' then
    raise exception using errcode='22023',message='Choose a due date between today and one year from today.';
  end if;
  due_at:=(p_due_date+time '23:59:59') at time zone 'Asia/Kolkata';
  insert into private.billing_invoices(account_id,kind,period_start,due_date,base_amount_paise,description)
    values(account.id,'one_off',date_trunc('month',p_due_date::timestamp)::date,due_at,p_amount_paise,title)
    returning * into invoice;
  insert into private.billing_admin_invoice_changes(
    account_id,id,invoice_id,type,actor_email,amount_paise,reason,status,completed_at
  ) values(account.id,p_request_id,invoice.id,'invoice_created',actor,p_amount_paise,title,'applied',now())
    returning * into change;
  insert into private.billing_jobs(invoice_id,kind,dedupe_key) values(invoice.id,'create_invoice','create:'||invoice.id);
  perform private.wake_billing_worker();
  return private.billing_admin_invoice_change_dto(change);
end;
$$;

-- The caller holds the account and original invoice locks. This completion
-- runs only after existing provider validation, or for a never-claimed create.
create function private.complete_billing_invoice_adjustment(p_invoice_id uuid)
returns void language plpgsql set search_path='' as $$
declare
  invoice private.billing_invoices%rowtype;
  change private.billing_admin_invoice_changes%rowtype;
  replacement_id uuid;
  completed_status text;
begin
  select * into change from private.billing_admin_invoice_changes
    where invoice_id=p_invoice_id and type='outstanding_adjusted' and status='pending' for update;
  if not found then return; end if;
  select * into invoice from private.billing_invoices where id=p_invoice_id;
  if invoice.paid_paise>0 then
    completed_status:='payment_received';
  elsif invoice.status in ('cancelled','expired') and (
    invoice.provider_status in ('cancelled','expired','deleted') or invoice.provider_invoice_id is null
  ) then
    if not exists(select 1 from private.billing_accounts a
      where a.id=invoice.account_id and a.status='active' and a.parent_user_id is not null) then
      completed_status:='account_closed';
    else
      completed_status:='applied';
      if change.amount_paise>0 then
        insert into private.billing_invoices(
          account_id,kind,period_start,due_date,base_amount_paise,description,replaces_invoice_id
        ) values(invoice.account_id,invoice.kind,invoice.period_start,invoice.due_date,
          change.amount_paise,invoice.description,invoice.id) returning id into replacement_id;
        insert into private.billing_jobs(invoice_id,kind,dedupe_key) values(replacement_id,'create_invoice','create:'||replacement_id);
      end if;
    end if;
  else
    return;
  end if;
  update private.billing_admin_invoice_changes set status=completed_status,completed_at=now(),replacement_invoice_id=replacement_id
  where account_id=change.account_id and id=change.id;
end;
$$;
revoke all on function private.complete_billing_invoice_adjustment(uuid) from public,anon,authenticated,service_role;

create function public.adjust_student_payment_invoice(
  p_registration_id uuid,p_invoice_id uuid,p_expected_amount_paise integer,p_amount_paise integer,p_reason text,p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  account private.billing_accounts%rowtype:=private.lock_student_payment_account(p_registration_id);
  change private.billing_admin_invoice_changes%rowtype;
  invoice private.billing_invoices%rowtype;
  reason text:=btrim(coalesce(p_reason,''));
  actor text:=lower(auth.jwt()->>'email');
begin
  if p_request_id is null or p_expected_amount_paise is null or p_amount_paise is null
    or not (p_amount_paise=0 or p_amount_paise between 100 and 10000000)
    or p_amount_paise=p_expected_amount_paise or char_length(reason) not between 1 and 300 or reason ~ '[[:cntrl:]<>]' then
    raise exception using errcode='22023',message='Enter a different amount or ₹0 to waive it, and a reason of up to 300 characters.';
  end if;
  select * into change from private.billing_admin_invoice_changes where account_id=account.id and id=p_request_id;
  if found then
    if change.type='outstanding_adjusted' and change.invoice_id=p_invoice_id
      and change.previous_amount_paise=p_expected_amount_paise and change.amount_paise=p_amount_paise and change.reason=reason then
      if change.status='pending' then
        update private.billing_jobs set state='pending',attempts=0,next_attempt_at=now(),
          finished_at=null,failure_code=''
        where invoice_id=change.invoice_id and dedupe_key='adjust-cancel:'||change.invoice_id and state='failed';
        if found then perform private.wake_billing_worker(); end if;
      end if;
      return private.billing_admin_invoice_change_dto(change);
    end if;
    raise exception using errcode='PT409',message='This invoice request already contains different details.';
  end if;
  perform private.require_student_invoice_writes(account);
  select * into invoice from private.billing_invoices where id=p_invoice_id and account_id=account.id for update;
  if not found or invoice.amount_paise<>p_expected_amount_paise or not private.billing_invoice_can_adjust(invoice.id) then
    raise exception using errcode='PT409',message='This invoice cannot be adjusted. Refresh to see its latest status.';
  end if;
  if invoice.provider_invoice_id is null then
    -- Claim and adjustment compete for this row. No existing or possible
    -- Razorpay invoice can be waived locally after the worker has claimed it.
    update private.billing_jobs set state='cancelled',finished_at=now()
      where invoice_id=invoice.id and kind='create_invoice' and state='pending' and attempts=0;
    if not found then
      raise exception using errcode='PT409',message='This invoice is being issued. Refresh its status before adjusting it.';
    end if;
    update private.billing_invoices set status='cancelled',updated_at=now() where id=invoice.id;
  end if;
  insert into private.billing_admin_invoice_changes(
    account_id,id,invoice_id,type,actor_email,amount_paise,previous_amount_paise,reason,status
  ) values(account.id,p_request_id,invoice.id,'outstanding_adjusted',actor,p_amount_paise,invoice.amount_paise,reason,'pending')
    returning * into change;
  if invoice.provider_invoice_id is null then
    perform private.complete_billing_invoice_adjustment(invoice.id);
    select * into change from private.billing_admin_invoice_changes where account_id=account.id and id=p_request_id;
  else
    update private.billing_jobs set state='cancelled',finished_at=now(),lease_token=null,lease_until=null
      where invoice_id=invoice.id and kind='send_invoice' and state in ('pending','processing');
    insert into private.billing_jobs(invoice_id,kind,dedupe_key) values(invoice.id,'cancel_invoice','adjust-cancel:'||invoice.id);
  end if;
  perform private.wake_billing_worker();
  return private.billing_admin_invoice_change_dto(change);
end;
$$;

revoke all on function public.create_student_payment_invoice(uuid,integer,date,text,uuid),
  public.adjust_student_payment_invoice(uuid,uuid,integer,integer,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_student_payment_invoice(uuid,integer,date,text,uuid),
  public.adjust_student_payment_invoice(uuid,uuid,integer,integer,text,uuid) to authenticated;

create function private.billing_invoice_collection_on_hold(p_invoice_id uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from private.billing_admin_invoice_changes c
    where c.invoice_id=p_invoice_id and c.type='outstanding_adjusted' and c.status='pending');
$$;
revoke all on function private.billing_invoice_collection_on_hold(uuid) from public,anon,authenticated,service_role;

alter function public.save_billing_provider_snapshot(uuid,jsonb) set schema private;
alter function private.save_billing_provider_snapshot(uuid,jsonb) rename to save_billing_snapshot_before_adjustments;
revoke all on function private.save_billing_snapshot_before_adjustments(uuid,jsonb) from public,anon,authenticated,service_role;

create function public.save_billing_provider_snapshot(p_invoice_id uuid,p_snapshot jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare saved boolean;
begin
  -- The account lock orders invoice inserts and snapshot writes against admin
  -- adjustments and account deletion. The old RPC validates the receipt and
  -- stores immutable capture/refund facts before we examine the outcome.
  perform 1 from private.billing_accounts a join private.billing_invoices i on i.account_id=a.id
    where i.id=p_invoice_id for update of a;
  saved:=private.save_billing_snapshot_before_adjustments(p_invoice_id,p_snapshot);
  if saved then
    perform private.complete_billing_invoice_adjustment(p_invoice_id);
  end if;
  return saved;
end;
$$;
revoke all on function public.save_billing_provider_snapshot(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_billing_provider_snapshot(uuid,jsonb) to service_role;

alter function private.prepare_billing_job_at(uuid,uuid,timestamptz) rename to prepare_billing_job_before_adjustments;
revoke all on function private.prepare_billing_job_before_adjustments(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;

create function private.prepare_billing_job_at(p_id uuid,p_lease_token uuid,p_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.billing_jobs%rowtype; invoice private.billing_invoices%rowtype; value jsonb;
begin
  select * into job from private.billing_jobs where id=p_id and state='processing'
    and lease_token=p_lease_token and lease_until>p_at for update;
  if not found then return null; end if;
  select * into invoice from private.billing_invoices where id=job.invoice_id;
  if job.kind='cancel_invoice' and job.dedupe_key='adjust-cancel:'||invoice.id
    and invoice.provider_invoice_id is not null and private.billing_invoice_collection_on_hold(invoice.id) then
    return jsonb_build_object('kind',job.kind,'invoice',private.billing_invoice_dto(invoice.id));
  end if;
  if job.kind='send_invoice' and private.billing_invoice_collection_on_hold(invoice.id) then
    update private.billing_jobs set state='cancelled',finished_at=p_at,lease_token=null,lease_until=null where id=job.id;
    return null;
  end if;
  value:=private.prepare_billing_job_before_adjustments(p_id,p_lease_token,p_at);
  if value ? 'invoice' and invoice.id is not null then
    value:=value||jsonb_build_object('invoice',value->'invoice'||jsonb_build_object(
      'description',invoice.description,'replaces_invoice_id',invoice.replaces_invoice_id,
      'initial_invoice',coalesce((value->'invoice'->>'initial_invoice')::boolean,false) and invoice.replaces_invoice_id is null));
  end if;
  return value;
end;
$$;
revoke all on function private.prepare_billing_job_at(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;

create or replace function private.billing_invoice_dto(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',i.id,'registration_id',a.registration_id,'receipt','LAI'||replace(i.id::text,'-',''),
    'kind',i.kind,'description',i.description,'replaces_invoice_id',i.replaces_invoice_id,'pricing_model',a.pricing_model,
    'initial_invoice',i.kind='monthly' and i.period_start=a.start_month and i.replaces_invoice_id is null,
    'currency',i.currency,'amount_paise',i.amount_paise,'base_amount_paise',i.base_amount_paise,'late_fee_paise',i.late_fee_paise,
    'paid_paise',i.paid_paise,'refunded_paise',i.refunded_paise,'paid_at',i.paid_at,'created_at',i.created_at,'period_start',i.period_start,'due_date',i.due_date,
    'parent_name',r.full_name,'parent_email',r.email,'parent_phone',r.phone,'child_name',r.metadata->>'childName',
    'provider_invoice_id',i.provider_invoice_id,'provider_payment_id',i.provider_payment_id,'payment_url',i.payment_url,'invoice_url',i.invoice_url,
    'late_fees_enabled',a.late_fees_enabled,'late_fee_policy',a.late_fee_policy,'late_fee_rate_paise',a.late_fee_paise)
  from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id join public.registrations r on r.id=a.registration_id where i.id=p_id;
$$;

-- General billing and guardian checkout share the same visible debts.
create or replace function private.billing_snapshot_v1(p_owner uuid,p_admin boolean)
returns jsonb language sql stable security definer set search_path='' as $$
  with visible as (
    select i.*,a.registration_id,a.status account_status,a.parent_user_id,r.full_name parent_name,r.email parent_email,
      r.metadata->>'childName' child_name,r.metadata->>'sport' sport,r.metadata->>'community' community,
      a.team_testing,adjustment.id is not null adjustment_pending,
      case when adjustment.id is not null then 'processing'
        when i.status='creating' and i.provider_invoice_id is null and exists(select 1 from private.billing_jobs j where j.invoice_id=i.id and j.kind='create_invoice' and j.state='failed') then 'failed'
        when i.status='pending' and i.due_date<now() then 'overdue' else i.status end display_status
    from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id join public.registrations r on r.id=a.registration_id
    left join private.billing_admin_invoice_changes adjustment on adjustment.invoice_id=i.id
      and adjustment.type='outstanding_adjusted' and adjustment.status='pending'
    where (p_admin or a.parent_user_id=p_owner)
      and (i.kind in ('monthly','one_off') or (p_admin and i.paid_paise>0))
  ) select jsonb_build_object(
    'invoices',coalesce((select jsonb_agg(row_data order by created_at desc,id desc) from (
      select i.id,i.created_at,jsonb_build_object('id',i.id,'registration_id',i.registration_id,'invoice_number',coalesce(i.provider_invoice_id,'LAI'||replace(i.id::text,'-','')),
        'period_start',i.period_start,'due_date',i.due_date,'child_name',i.child_name,'community',i.community,'sport',i.sport,
        'currency',i.currency,'amount_paise',i.amount_paise,'base_amount_paise',i.base_amount_paise,'late_fee_paise',i.late_fee_paise,
        'paid_paise',i.paid_paise,'refunded_paise',i.refunded_paise,'kind',i.kind,'base_invoice_id',i.base_invoice_id,
        'status',i.display_status,'description',i.description,'replaces_invoice_id',i.replaces_invoice_id,
        'adjustment_pending',i.adjustment_pending,'team_testing',i.team_testing,'provider_invoice_id',i.provider_invoice_id,
        'payment_url',case when i.kind in ('monthly','one_off') and not i.adjustment_pending then i.payment_url else '' end,
        'invoice_url',case when i.kind in ('monthly','one_off') and not i.adjustment_pending then i.invoice_url else '' end,
        'created_at',i.created_at,'updated_at',i.updated_at,'paid_at',i.paid_at,
        'late_fee_preview_paise',0)
        ||case when p_admin then jsonb_build_object('parent_name',i.parent_name,'parent_email',i.parent_email,'provider_payment_id',i.provider_payment_id) else '{}'::jsonb end row_data
      from visible i cross join private.billing_settings s order by i.created_at desc,i.id desc limit 1000
    ) listed),'[]'::jsonb),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'registration_id',a.registration_id,'status',a.status,'revision',a.revision,
      'parent_name',r.full_name,'child_name',r.metadata->>'childName','created_at',a.created_at,'cancelled_at',a.cancelled_at) order by a.created_at desc)
      from private.billing_accounts a join public.registrations r on r.id=a.registration_id where p_admin or a.parent_user_id=p_owner),'[]'::jsonb),
    'settings',(select jsonb_build_object('enabled',s.enabled,'team_testing',s.team_testing,'charge_amount_paise',s.charge_amount_paise,'regular_amount_paise',s.regular_amount_paise,
      'late_fee_paise',s.late_fee_paise,'late_fee_policy',s.late_fee_policy,'late_fees_enabled',s.late_fees_enabled,'due_day',5) from private.billing_settings s where id),
    'summary',(select jsonb_build_object('captured_paise',coalesce(sum(paid_paise),0),'refunded_paise',coalesce(sum(refunded_paise),0),
      'outstanding_paise',coalesce(sum(greatest(amount_paise-paid_paise,0)) filter(where kind in ('monthly','one_off') and status in ('pending','creating')),0),
      'paid_count',count(*) filter(where status in ('paid','partially_refunded','refunded')),
      'pending_count',count(*) filter(where kind in ('monthly','one_off') and display_status in ('creating','pending','processing')),
      'overdue_count',count(*) filter(where kind in ('monthly','one_off') and display_status='overdue'),
      'failed_count',count(*) filter(where kind in ('monthly','one_off') and display_status='failed')) from visible),
    'has_more',(select count(*)>1000 from visible)
  );
$$;

create or replace function private.billing_snapshot(p_owner uuid,p_admin boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare value jsonb; accounts jsonb; invoice_rows jsonb; next_month date;
begin
  value:=private.billing_snapshot_v1(p_owner,p_admin);
  select coalesce(jsonb_agg(private.billing_account_dto(a.id,now()) order by a.created_at desc),'[]'::jsonb) into accounts
    from private.billing_accounts a where p_admin or a.parent_user_id=p_owner;
  select coalesce(jsonb_agg(row_data||jsonb_build_object('pricing_model',a.pricing_model,
    'initial_invoice',i.kind='monthly' and i.period_start=a.start_month and i.replaces_invoice_id is null)),'[]'::jsonb) into invoice_rows
    from jsonb_array_elements(value->'invoices') row_data join private.billing_invoices i on i.id=(row_data->>'id')::uuid
    join private.billing_accounts a on a.id=i.account_id;
  next_month:=(date_trunc('month',now() at time zone 'Asia/Kolkata')+interval '1 month')::date;
  return value||jsonb_build_object('accounts',accounts,'invoices',invoice_rows,
    'settings',(value->'settings')||jsonb_build_object('pricing_model','custom_quote','default_amount_paise',(select regular_amount_paise from private.billing_settings where id)),
    'upcoming_month',private.billing_upcoming_month(next_month,now(),case when p_admin then null else p_owner end));
end;
$$;

create or replace function private.billing_upcoming_month(p_month date,p_at timestamptz,p_owner uuid default null)
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
        and i.kind in ('monthly','one_off')
        and (p_owner is null or a.parent_user_id=p_owner)),0),
    'old_pending_count',(select count(*) from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id
      where i.period_start<p_month and i.status in ('creating','pending')
        and i.kind in ('monthly','one_off') and (p_owner is null or a.parent_user_id=p_owner)),
    'generated_at',p_at,'old_pending_basis','collectible_invoices');
$$;

-- Use the existing verified-recipient reminders for collectible one-off and monthly balances.
create or replace function private.enqueue_billing_work_at(p_at timestamptz)
returns integer language plpgsql security definer set search_path='' as $$
declare settings private.billing_settings%rowtype; local_today date; month_start date; next_month date; slot text;
  n integer:=0; added integer; summary jsonb;
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
        where a.parent_user_id=parents.parent_user_id and i.kind in ('monthly','one_off') and i.status='pending'
        and not private.billing_invoice_collection_on_hold(i.id) and i.paid_paise<i.amount_paise
          and i.provider_invoice_id is not null and i.payment_url<>'' order by i.created_at,i.id limit 1
      ) anchor on conflict do nothing;
    get diagnostics added=row_count;n:=n+added;
  end if;
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

create or replace function private.prepare_billing_job_before_deletion(p_id uuid,p_lease_token uuid,p_at timestamptz)
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
    select summary into value from private.billing_month_summaries where month=job.summary_month;
    -- Existing queued snapshots retain their fee plan and recipient. Bring
    -- their unpaid balance into line with the current collection rules.
    if value->>'old_pending_basis' is distinct from 'collectible_invoices' then
      select value||jsonb_build_object('old_pending_paise',coalesce(sum(amount_paise-paid_paise),0),
        'old_pending_count',count(*),'old_pending_basis','collectible_invoices') into value
      from private.billing_invoices where kind in ('monthly','one_off') and period_start<job.summary_month and status in ('creating','pending');
    end if;
    return jsonb_build_object('kind',job.kind,'recipient_email',job.recipient_email,'summary',value);
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
      where a.parent_user_id=owner_id and i.kind in ('monthly','one_off') and i.status='pending'
        and not private.billing_invoice_collection_on_hold(i.id) and i.paid_paise<i.amount_paise and i.provider_invoice_id is not null and i.payment_url<>''
    ) select coalesce(sum(amount_paise-paid_paise),0),count(*),count(*) filter(where checked_at is null or checked_at<greatest(job.created_at,created_at))
      into total,invoice_count,remaining from payable;
    if invoice_count=0 then update private.billing_jobs set state='cancelled',finished_at=p_at where id=job.id;return null;end if;
    select coalesce(jsonb_agg(private.billing_invoice_dto(id) order by created_at,id),'[]'::jsonb) into displayed from (
      select i.id,i.created_at from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id
      where a.parent_user_id=owner_id and i.kind in ('monthly','one_off') and i.status='pending'
        and not private.billing_invoice_collection_on_hold(i.id) and i.paid_paise<i.amount_paise and i.provider_invoice_id is not null and i.payment_url<>'' order by i.created_at,i.id limit 100
    ) shown;
    select coalesce(jsonb_agg(private.billing_invoice_dto(id) order by created_at,id),'[]'::jsonb) into preflight from (
      select i.id,i.created_at from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id
      where a.parent_user_id=owner_id and i.kind in ('monthly','one_off') and i.status='pending'
        and not private.billing_invoice_collection_on_hold(i.id) and i.paid_paise<i.amount_paise and i.provider_invoice_id is not null and i.payment_url<>''
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

create or replace function private.coaching_student_billing(p_registration_id uuid)
returns jsonb language sql stable set search_path='' as $$
  with account as (
    select a.id,a.status,a.revision,a.pricing_model,
      a.status='active' and a.parent_user_id is not null and a.pricing_model='custom_quote'
        and (select enabled from private.billing_settings where id) as can_manage_invoices,
      date_trunc('month',now() at time zone 'Asia/Kolkata')::date as current_month,
      (date_trunc('month',now() at time zone 'Asia/Kolkata')+interval '1 month')::date as next_month
    from private.billing_accounts a where a.registration_id=p_registration_id
  ), invoices as (
    select i.*,adjustment.id is not null adjustment_pending,
      case
        when adjustment.id is not null then 'processing'
        when i.status='creating' and i.provider_invoice_id is null and exists(
          select 1 from private.billing_jobs j where j.invoice_id=i.id and j.kind='create_invoice' and j.state='failed'
        ) then 'failed'
        when i.status='pending' and i.due_date<now() then 'overdue'
        else i.status
      end as display_status
    from private.billing_invoices i join account a on a.id=i.account_id
    left join private.billing_admin_invoice_changes adjustment on adjustment.invoice_id=i.id
      and adjustment.type='outstanding_adjusted' and adjustment.status='pending'
    where i.kind in ('monthly','one_off') or i.paid_paise>0
  ), activity as (
    select c.id::text as id,c.type,c.actor_email,c.created_at as occurred_at,c.reason,c.amount_paise,c.previous_amount_paise,
      c.invoice_id,c.replacement_invoice_id,null::date as effective_month,
      case when c.status='pending' and exists(
        select 1 from private.billing_jobs j where j.invoice_id=c.invoice_id
          and j.dedupe_key='adjust-cancel:'||c.invoice_id and j.state='failed'
      ) then 'failed' else c.status end as status
    from private.billing_admin_invoice_changes c join account a on a.id=c.account_id
    union all
    select c.id::text,'monthly_fee_changed',c.changed_by,c.created_at,'',c.new_amount_paise,c.old_amount_paise,
      null,null,c.effective_month,'applied'
    from private.billing_price_changes c join account a on a.id=c.account_id
    union all
    select 'payment-'||l.id,case when l.kind='capture' then 'payment_captured' else 'refund_recorded' end,
      '',case when l.kind='capture' then coalesce(i.paid_at,l.created_at) else l.created_at end,'',
      l.amount_paise,null,l.invoice_id,null,null,'applied'
    from private.billing_ledger l join invoices i on i.id=l.invoice_id
  )
  select jsonb_build_object(
    'accountId',a.id,'accountStatus',a.status,'accountRevision',a.revision,'pricingModel',a.pricing_model,
    'canManageInvoices',a.can_manage_invoices,'currency','INR',
    'monthlyAmountPaise',private.billing_amount_for_month(a.id,a.current_month),
    'nextMonthAmountPaise',case when a.status='active' then private.billing_amount_for_month(a.id,a.next_month) end,
    'nextMonth',case when a.status='active' then a.next_month end,
    'outstandingPaise',coalesce((
      select sum(i.amount_paise-i.paid_paise) from invoices i
      where i.kind in ('monthly','one_off') and i.status in ('creating','pending')
    ),0),
    'nextDueAt',(
      select min(i.due_date) from invoices i
      where i.kind in ('monthly','one_off') and i.status in ('creating','pending') and i.paid_paise<i.amount_paise
    ),
    'invoices',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'kind',i.kind,'description',i.description,'periodStart',i.period_start,'dueAt',i.due_date,'paidAt',i.paid_at,
        'createdAt',i.created_at,'amountPaise',i.amount_paise,'paidPaise',i.paid_paise,'refundedPaise',i.refunded_paise,
        'status',i.display_status,'replacesInvoiceId',i.replaces_invoice_id,'adjustmentPending',i.adjustment_pending,
        'invoiceUrl',case when not i.adjustment_pending then i.invoice_url end,
        'paymentUrl',case when not i.adjustment_pending and i.status='pending' then i.payment_url end,
        'canAdjust',a.can_manage_invoices and private.billing_invoice_can_adjust(i.id)
      ) order by i.period_start desc,i.created_at desc,i.id desc)
      from invoices i
    ),'[]'::jsonb),
    'activity',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'type',c.type,'actorEmail',c.actor_email,'occurredAt',c.occurred_at,'reason',c.reason,
        'amountPaise',c.amount_paise,'previousAmountPaise',c.previous_amount_paise,'invoiceId',c.invoice_id,
        'replacementInvoiceId',c.replacement_invoice_id,'effectiveMonth',c.effective_month,'status',c.status
      ) order by c.occurred_at desc,c.id desc) from activity c
    ),'[]'::jsonb)
  ) from account a;
$$;

-- Marking attendance remains the attendance email trigger.
drop function public.queue_students_attendance_email(date,text,uuid);
