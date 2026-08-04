-- Corrige un mélange de saisons dans list_reusable_payment_operations
-- (202608030003) : la fonction listait toutes les opérations mshtarakées
-- actives « sans restriction de dossier ni de saison » (voir son propre
-- commentaire d'origine), en violation de reprise.md §5.3 (« un écran ne
-- mélange jamais les saisons »).
--
-- PRÉPARÉE ET TESTÉE EN BEGIN...ROLLBACK UNIQUEMENT — NON APPLIQUÉE.
-- Voir RAPPORT-CHANTIER.md pour le contexte et la décision métier encore
-- ouverte avant tout déploiement réel.
--
-- Interprétation retenue ici, à confirmer par le commanditaire avant push :
-- une opération partagée reste proposée pour la saison active si elle n'a
-- encore AUCUNE allocation (opération neuve, sans saison propre) OU si AU
-- MOINS UNE de ses allocations appartient à un reçu de la saison active.
-- Une opération dont toutes les allocations appartiennent à d'autres
-- saisons disparaît de la liste. Alternative non retenue : exiger que
-- TOUTES les allocations soient de la saison active (plus strict, mais
-- masquerait une opération légitimement partagée entre dossiers de la
-- même saison dès qu'un dossier annulé d'une autre saison y aurait été
-- alloué par erreur passée).
--
-- Au contrôle du 2026-08-04, une seule saison existe en production et les
-- 4 opérations partagées existantes lui appartiennent toutes : le bug est
-- réel mais actuellement sans impact observable, faute d'une deuxième
-- saison pour révéler le mélange.

create or replace function public.list_reusable_payment_operations(
  p_payment_mode text default null,
  p_season_id uuid default null
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
    and (
      p_season_id is null
      or not exists (
        select 1
        from public.payment_allocations as any_item
        where any_item.payment_operation_id = operation.id
      )
      or exists (
        select 1
        from public.payment_allocations as season_item
        inner join public.receipt_payments as season_payment
          on season_payment.id = season_item.receipt_payment_id
        inner join public.billing_receipts as season_receipt
          on season_receipt.id = season_payment.receipt_id
        where season_item.payment_operation_id = operation.id
          and season_receipt.season_id = p_season_id
      )
    )
  order by operation.registered_at desc, operation.id desc;
end;
$$;

comment on function public.list_reusable_payment_operations(text, uuid) is
  'Lists complete shared cheque and transfer operations available to authenticated Facturation users. Allocated and remaining amounts include every allocation, including allocations of cancelled receipts. When p_season_id is provided, operations whose allocations all belong to other seasons are excluded; brand-new operations with zero allocations always remain visible.';

revoke execute on function public.list_reusable_payment_operations(text, uuid)
  from public, anon;

grant execute on function public.list_reusable_payment_operations(text, uuid)
  to authenticated;
