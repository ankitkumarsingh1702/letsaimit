-- Retire fee collection while retaining accepted terms, invoices and accounting records.
update private.billing_settings set late_fee_paise=0,late_fees_enabled=false where id;
alter table private.billing_settings alter column late_fee_paise set default 0;
alter table private.billing_settings add constraint billing_late_fees_retired check(late_fee_paise=0 and not late_fees_enabled);

create or replace function public.get_billing_terms()
returns jsonb language sql stable security definer set search_path='' as $$
  select terms||jsonb_build_object('version','billing-2026-11-18-'||encode(sha256(convert_to(terms::text,'UTF8')),'hex')) from (
    select jsonb_build_object('enabled',enabled,'pricing_model','custom_quote','default_amount_paise',regular_amount_paise,
      'late_fee_paise',late_fee_paise,'late_fee_policy',late_fee_policy,'late_fees_enabled',late_fees_enabled,
      'due_day',5,'first_due_days',0) terms from private.billing_settings where id
  ) settings;
$$;

-- The parent snapshot contains monthly invoices. Admin history also retains captured
-- late-fee invoices for accounting, with no link to collect them.
create or replace function private.billing_snapshot_v1(p_owner uuid,p_admin boolean)
returns jsonb language sql stable security definer set search_path='' as $$
  with visible as (
    select i.*,a.registration_id,a.status account_status,a.parent_user_id,r.full_name parent_name,r.email parent_email,
      r.metadata->>'childName' child_name,r.metadata->>'sport' sport,r.metadata->>'community' community,
      a.team_testing,
      case when i.status='creating' and i.provider_invoice_id is null and exists(select 1 from private.billing_jobs j where j.invoice_id=i.id and j.kind='create_invoice' and j.state='failed') then 'failed'
        when i.status='pending' and i.due_date<now() then 'overdue' else i.status end display_status
    from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id join public.registrations r on r.id=a.registration_id
    where (p_admin or a.parent_user_id=p_owner)
      and (i.kind='monthly' or (p_admin and i.paid_paise>0))
  ) select jsonb_build_object(
    'invoices',coalesce((select jsonb_agg(row_data order by created_at desc,id desc) from (
      select i.id,i.created_at,jsonb_build_object('id',i.id,'registration_id',i.registration_id,'invoice_number',coalesce(i.provider_invoice_id,'LAI'||replace(i.id::text,'-','')),
        'period_start',i.period_start,'due_date',i.due_date,'child_name',i.child_name,'community',i.community,'sport',i.sport,
        'currency',i.currency,'amount_paise',i.amount_paise,'base_amount_paise',i.base_amount_paise,'late_fee_paise',i.late_fee_paise,
        'paid_paise',i.paid_paise,'refunded_paise',i.refunded_paise,'kind',i.kind,'base_invoice_id',i.base_invoice_id,
        'status',i.display_status,'team_testing',i.team_testing,'provider_invoice_id',i.provider_invoice_id,
        'payment_url',case when i.kind='monthly' then i.payment_url else '' end,
        'invoice_url',case when i.kind='monthly' then i.invoice_url else '' end,
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
      'outstanding_paise',coalesce(sum(greatest(amount_paise-paid_paise,0)) filter(where kind='monthly' and status in ('pending','creating')),0),
      'paid_count',count(*) filter(where status in ('paid','partially_refunded','refunded')),
      'pending_count',count(*) filter(where kind='monthly' and display_status in ('creating','pending')),
      'overdue_count',count(*) filter(where kind='monthly' and display_status='overdue'),
      'failed_count',count(*) filter(where kind='monthly' and display_status='failed')) from visible),
    'has_more',(select count(*)>1000 from visible)
  );
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
        and i.kind='monthly'
        and (p_owner is null or a.parent_user_id=p_owner)),0),
    'old_pending_count',(select count(*) from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id
      where i.period_start<p_month and i.status in ('creating','pending')
        and i.kind='monthly' and (p_owner is null or a.parent_user_id=p_owner)),
    'generated_at',p_at,'old_pending_basis','monthly');
$$;

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
        where a.parent_user_id=parents.parent_user_id and i.kind='monthly' and i.status='pending' and i.paid_paise<i.amount_paise
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
    -- A summary queued before retirement keeps its frozen fees and recipient.
    -- For unsent copies, its past-due balance uses only current monthly bills.
    if value->>'old_pending_basis' is distinct from 'monthly' then
      select value||jsonb_build_object('old_pending_paise',coalesce(sum(amount_paise-paid_paise),0),
        'old_pending_count',count(*),'old_pending_basis','monthly') into value
      from private.billing_invoices where kind='monthly' and period_start<job.summary_month and status in ('creating','pending');
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
      where a.parent_user_id=owner_id and i.kind='monthly' and i.status='pending' and i.paid_paise<i.amount_paise and i.provider_invoice_id is not null and i.payment_url<>''
    ) select coalesce(sum(amount_paise-paid_paise),0),count(*),count(*) filter(where checked_at is null or checked_at<greatest(job.created_at,created_at))
      into total,invoice_count,remaining from payable;
    if invoice_count=0 then update private.billing_jobs set state='cancelled',finished_at=p_at where id=job.id;return null;end if;
    select coalesce(jsonb_agg(private.billing_invoice_dto(id) order by created_at,id),'[]'::jsonb) into displayed from (
      select i.id,i.created_at from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id
      where a.parent_user_id=owner_id and i.kind='monthly' and i.status='pending' and i.paid_paise<i.amount_paise and i.provider_invoice_id is not null and i.payment_url<>'' order by i.created_at,i.id limit 100
    ) shown;
    select coalesce(jsonb_agg(private.billing_invoice_dto(id) order by created_at,id),'[]'::jsonb) into preflight from (
      select i.id,i.created_at from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id
      where a.parent_user_id=owner_id and i.kind='monthly' and i.status='pending' and i.paid_paise<i.amount_paise and i.provider_invoice_id is not null and i.payment_url<>''
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

create or replace function private.prepare_billing_job_at(p_id uuid,p_lease_token uuid,p_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.billing_jobs%rowtype; invoice private.billing_invoices%rowtype; archived boolean;
begin
  select * into job from private.billing_jobs
    where id=p_id and state='processing' and lease_token=p_lease_token and lease_until>p_at for update;
  if not found then return null;end if;
  select * into invoice from private.billing_invoices where id=job.invoice_id;
  select r.deleted_at is not null into archived from private.billing_accounts a
    join public.registrations r on r.id=a.registration_id where a.id=invoice.account_id;

  if invoice.kind='late_fee' then
    if job.kind='reconcile_invoice' then
      return jsonb_build_object('kind',job.kind,'invoice',private.billing_invoice_dto(job.invoice_id));
    end if;
    if job.kind='cancel_invoice' and job.dedupe_key='retired-late-fee-cancel:'||invoice.id
      and invoice.status in ('creating','pending') and invoice.paid_paise=0 then
      return jsonb_build_object('kind',job.kind,'invoice',private.billing_invoice_dto(job.invoice_id));
    end if;
    if job.kind in ('create_invoice','send_invoice') then
      update private.billing_jobs set state=case when job.kind='create_invoice' and invoice.provider_invoice_id is null then 'ambiguous' else 'cancelled' end,
        failure_code=case when job.kind='create_invoice' and invoice.provider_invoice_id is null then 'creation_ambiguous' else '' end,
        finished_at=p_at,lease_token=null,lease_until=null where id=job.id;
      return null;
    end if;
  end if;
  if archived and job.kind in ('cancel_invoice','reconcile_invoice') then
    return jsonb_build_object('kind',job.kind,'invoice',private.billing_invoice_dto(job.invoice_id));
  end if;
  if job.kind='cancel_invoice' or archived then
    update private.billing_jobs set state='cancelled',finished_at=p_at,lease_token=null,lease_until=null where id=job.id;
    return null;
  end if;
  return private.prepare_billing_job_before_deletion(p_id,p_lease_token,p_at);
end;
$$;

create or replace function public.save_billing_provider_snapshot(p_invoice_id uuid,p_snapshot jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare saved boolean; invoice private.billing_invoices%rowtype; archived boolean;
begin
  saved:=private.save_billing_provider_snapshot_before_deletion(p_invoice_id,p_snapshot);
  select * into invoice from private.billing_invoices where id=p_invoice_id;
  select r.deleted_at is not null into archived from private.billing_accounts a
    join public.registrations r on r.id=a.registration_id where a.id=invoice.account_id;
  if archived or invoice.kind='late_fee' then
    update private.billing_jobs set state='cancelled',finished_at=now(),lease_token=null,lease_until=null
      where invoice_id=p_invoice_id and state in ('pending','processing')
        and (kind='send_invoice' or (archived and kind in ('send_reminder','send_receipt','send_refund')));
    if invoice.paid_paise=0 and invoice.provider_invoice_id is not null and invoice.status in ('creating','pending')
      and not exists(select 1 from private.billing_jobs where invoice_id=invoice.id and kind='cancel_invoice' and state in ('pending','processing')) then
      insert into private.billing_jobs(invoice_id,kind,dedupe_key) values(invoice.id,'cancel_invoice',
        case when invoice.kind='late_fee' then 'retired-late-fee-cancel:' else 'delete-cancel:' end||invoice.id)
      on conflict (dedupe_key) do nothing;
    end if;
  end if;
  return saved;
end;
$$;

-- Reuse the scheduled worker even when new invoice creation is disabled.
create or replace function private.wake_billing_worker()
returns void language plpgsql security definer set search_path='' as $$
declare worker_url text;worker_secret text;
begin
  if not (select enabled from private.billing_settings where id) then perform private.enqueue_archived_billing_work(now());end if;
  if not (select enabled from private.billing_settings where id) and not exists(
    select 1 from private.billing_jobs j join private.billing_invoices i on i.id=j.invoice_id
      join private.billing_accounts a on a.id=i.account_id join public.registrations r on r.id=a.registration_id
    where j.state in ('pending','processing')
      and (j.kind='cancel_invoice' or (r.deleted_at is not null and j.kind='reconcile_invoice'))
  ) then return;end if;
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then return;end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_url using 'letsaimit_billing_worker_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_secret using 'letsaimit_notification_worker_secret';
  if worker_url is null or worker_url!~'^https://[a-z0-9]+[.]supabase[.]co/functions/v1/billing-worker$' or char_length(coalesce(worker_secret,''))<32 then return;end if;
  perform net.http_post(url:=worker_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),body:='{}'::jsonb,timeout_milliseconds:=145000);
exception when others then return;
end;
$$;

-- Invalidate active creation leases before classifying which unpaid rows might
-- already have a hosted invoice. The provider snapshot RPC handles late responses.
update private.billing_jobs j set
  state=case when j.kind='create_invoice' and i.provider_invoice_id is null and (j.attempts>0 or j.state='processing')
    then 'ambiguous' else 'cancelled' end,
  failure_code=case when j.kind='create_invoice' and i.provider_invoice_id is null and (j.attempts>0 or j.state='processing')
    then 'creation_ambiguous' else '' end,
  finished_at=now(),lease_token=null,lease_until=null
from private.billing_invoices i where j.invoice_id=i.id and i.kind='late_fee'
  and j.kind in ('create_invoice','send_invoice') and j.state in ('pending','processing');

insert into private.billing_jobs(invoice_id,kind,dedupe_key)
  select i.id,'cancel_invoice','retired-late-fee-cancel:'||i.id
  from private.billing_invoices i
  where i.kind='late_fee' and i.paid_paise=0 and i.status in ('creating','pending')
    and (i.provider_invoice_id is not null or exists(
      select 1 from private.billing_jobs j where j.invoice_id=i.id and j.kind='create_invoice'
        and (j.attempts>0 or j.state='ambiguous')))
    and not exists(select 1 from private.billing_jobs j where j.invoice_id=i.id
      and j.kind='cancel_invoice' and j.state in ('pending','processing'))
  on conflict do nothing;

update private.billing_invoices i set status='cancelled',updated_at=now()
  where i.kind='late_fee' and i.paid_paise=0 and i.status in ('creating','pending') and i.provider_invoice_id is null
    and not exists(select 1 from private.billing_jobs j where j.invoice_id=i.id and j.kind='create_invoice'
      and (j.attempts>0 or j.state='ambiguous'));
