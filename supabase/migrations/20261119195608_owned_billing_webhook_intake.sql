-- A signed provider event is not sufficient to identify its application target
-- when UAT and production share a merchant. Only a known local provider ID or
-- an already-created local billing UUID authorizes durable intake.
create function public.ingest_owned_billing_webhook(
  p_event_id text,p_invoice_id text,p_payment_id text,p_event_type text,p_payload_hash text,p_billing_id uuid
)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='500ms' as $$
declare
  existing private.billing_webhook_events%rowtype;
  invoice record;
  matched uuid;
  hinted uuid;
begin
  if p_event_id is null or char_length(p_event_id) not between 1 and 200 or p_event_id~'[[:cntrl:]]'
    or p_event_type is null or char_length(p_event_type) not between 1 and 100 or p_event_type~'[[:cntrl:]]'
    or coalesce(p_payload_hash,'')!~'^[0-9a-f]{64}$'
    or (nullif(p_invoice_id,'') is null and nullif(p_payment_id,'') is null)
    or (nullif(p_invoice_id,'') is not null and p_invoice_id!~'^inv_[A-Za-z0-9]+$')
    or (nullif(p_payment_id,'') is not null and p_payment_id!~'^pay_[A-Za-z0-9]+$') then
    raise exception using errcode='22023',message='Invalid provider event.';
  end if;

  -- Serialise each receipt without creating a placeholder foreign event row.
  -- No database lock is retained across the handler's provider lookup.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(p_event_id,20261119)) then
    raise exception using errcode='55P03',message='Webhook intake is busy. Retry.';
  end if;
  select * into existing from private.billing_webhook_events where event_id=p_event_id;
  if found then
    if existing.payload_hash<>p_payload_hash then
      raise exception using errcode='PT409',message='Provider event conflict.';
    end if;
    return jsonb_build_object('status','duplicate');
  end if;

  -- Keep provider binding stable during this short intake transaction. Historical
  -- and retired invoices remain eligible; enrolment activity is irrelevant here.
  for invoice in
    select i.id,i.provider_invoice_id,i.provider_payment_id
    from private.billing_invoices i
    where i.id=p_billing_id or i.provider_invoice_id=nullif(p_invoice_id,'')
      or i.provider_payment_id=nullif(p_payment_id,'')
    order by i.id for share
  loop
    if invoice.id=p_billing_id then hinted:=invoice.id; end if;
    if nullif(p_invoice_id,'') is not null and invoice.provider_invoice_id is not null
      and invoice.provider_invoice_id<>p_invoice_id then
      raise exception using errcode='PT409',message='Provider invoice ownership conflict.';
    end if;
    if invoice.provider_invoice_id=nullif(p_invoice_id,'')
      or invoice.provider_payment_id=nullif(p_payment_id,'') then
      if matched is not null and matched<>invoice.id then
        raise exception using errcode='PT409',message='Provider invoice ownership conflict.';
      end if;
      matched:=invoice.id;
    end if;
  end loop;

  if p_billing_id is not null then
    if hinted is null then
      if matched is not null then
        raise exception using errcode='PT409',message='Provider invoice ownership conflict.';
      end if;
      return jsonb_build_object('status','foreign');
    end if;
    if matched is not null and matched<>hinted then
      raise exception using errcode='PT409',message='Provider invoice ownership conflict.';
    end if;
  elsif matched is null then
    return jsonb_build_object('status','unresolved');
  end if;

  -- A UUID hint proves ownership, but it does not invent a provider binding.
  -- Retain NULL for an early event until the existing snapshot/recovery path
  -- attaches the real provider IDs and queues canonical reconciliation.
  insert into private.billing_webhook_events(event_id,provider_invoice_id,provider_payment_id,event_type,payload_hash,invoice_id)
    values(p_event_id,nullif(p_invoice_id,''),nullif(p_payment_id,''),p_event_type,p_payload_hash,matched);
  if matched is not null then
    insert into private.billing_jobs(invoice_id,kind,dedupe_key)
      values(matched,'reconcile_invoice','event:'||p_event_id) on conflict do nothing;
  end if;
  perform private.wake_billing_worker();
  return jsonb_build_object('status','accepted');
end;
$$;
revoke all on function public.ingest_owned_billing_webhook(text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.ingest_owned_billing_webhook(text,text,text,text,text,uuid) to service_role;

-- Preserve the existing five-argument caller contract without an overload. Old
-- workers can acknowledge known local events; unknown IDs must retry until the
-- ownership-aware handler supplies signed/provider receipt evidence.
create or replace function public.ingest_billing_webhook(
  p_event_id text,p_invoice_id text,p_payment_id text,p_event_type text,p_payload_hash text
)
returns boolean language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result:=public.ingest_owned_billing_webhook(p_event_id,p_invoice_id,p_payment_id,p_event_type,p_payload_hash,null);
  if result->>'status'='unresolved' then
    raise exception using errcode='PT503',message='Provider event ownership is not known. Retry.';
  end if;
  return result->>'status'='accepted';
end;
$$;
revoke all on function public.ingest_billing_webhook(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.ingest_billing_webhook(text,text,text,text,text) to service_role;
