-- Extrait de 202608020004_correct_first_payment_method.sql.
--
-- list_reusable_payment_operations est une fonction de lecture pure, sans
-- rapport avec la non-conformité de correct_billing_receipt_first_payment_method
-- (fusion.md §4.2 : montant du premier versement encore immuable pour tous).
-- Elle est extraite ici pour être déployable seule, sans attendre la reprise
-- de cette dernière (prévue à l'étape 8 du plan d'exécution).

create function public.list_reusable_payment_operations(
  p_payment_mode text default null
)
returns table (
  payment_operation_id uuid,
  payment_mode text,
  operation_amount_dh integer,
  allocated_total_dh bigint,
  remaining_amount_dh bigint,
  instrument_reference text,
  bank_name text,
  instrument_date date,
  payer_name text,
  registered_at timestamptz,
  has_active_supporting_image boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform actor.slot_number
  from public.resolve_facturation_actor() as actor;

  if p_payment_mode is not null and
     p_payment_mode not in ('cheque', 'transfer') then
    raise exception 'Invalid payment mode';
  end if;

  return query
  select
    operation.id,
    operation.payment_mode,
    operation.operation_amount_dh,
    coalesce(allocation.allocated_total_dh, 0)::bigint,
    operation.operation_amount_dh::bigint -
      coalesce(allocation.allocated_total_dh, 0)::bigint,
    instrument.instrument_reference,
    instrument.bank_name,
    instrument.instrument_date,
    instrument.payer_name,
    operation.registered_at,
    exists(
      select 1
      from public.payment_supporting_images as image
      where image.payment_operation_id = operation.id
        and image.deleted_at is null
    )
  from public.payment_operations as operation
  inner join public.payment_instrument_details as instrument
    on instrument.payment_operation_id = operation.id
  left join lateral (
    select coalesce(pg_catalog.sum(payment.amount_dh), 0)::bigint
      as allocated_total_dh
    from public.payment_allocations as item
    inner join public.receipt_payments as payment
      on payment.id = item.receipt_payment_id
    where item.payment_operation_id = operation.id
  ) as allocation on true
  where operation.usage_kind = 'shared'
    and operation.payment_mode in ('cheque', 'transfer')
    and (
      p_payment_mode is null or
      operation.payment_mode = p_payment_mode
    )
  order by operation.registered_at desc, operation.id desc;
end;
$$;

comment on function public.list_reusable_payment_operations(text) is
  'Lists complete shared cheque and transfer operations available to authenticated Facturation users. Allocated and remaining amounts include every allocation, including allocations of cancelled receipts, without a dossier or season restriction.';

revoke execute on function public.list_reusable_payment_operations(text)
  from public, anon;

grant execute on function public.list_reusable_payment_operations(text)
  to authenticated;
