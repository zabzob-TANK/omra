-- Corrige un mélange de saisons dans list_reusable_payment_operations
-- (202608030003) : la fonction listait toutes les opérations partagées
-- actives « sans restriction de dossier ni de saison » (voir son propre
-- commentaire d'origine), en violation de reprise.md §5.3 (« un écran ne
-- mélange jamais les saisons »).
--
-- Décision métier tranchée par le commanditaire (2026-08-06) : isolation
-- stricte entre saisons. Le reliquat d'un chèque ou virement partagé
-- appartient à la saison où il a été déposé ; en pratique, ce reliquat doit
-- être réclamé (remboursé ou non encaissé) dans cette même saison — le cas
-- d'un reliquat qui survivrait jusqu'à la saison suivante est explicitement
-- considéré comme rare/anormal, jamais rencontré en usage réel. Aucun pont
-- n'est donc maintenu entre saisons : une opération dont ne serait-ce
-- qu'UNE allocation appartient à une autre saison que la saison active
-- disparaît entièrement de la liste de la saison active, même s'il lui
-- reste un solde réel non alloué. Alternative envisagée puis explicitement
-- écartée : garder l'opération visible tant qu'au moins une de ses
-- allocations appartient à la saison active (aurait exposé ce reliquat
-- résiduel plutôt que de le rendre invisible) — écartée pour que
-- l'archivé reste définitivement archivé, sans lien avec le nouveau.
--
-- Une opération neuve, sans aucune allocation, reste toujours visible :
-- l'isolation ne s'applique qu'aux opérations déjà utilisées.
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
    -- Isolation stricte : aucune allocation de l'opération ne doit
    -- appartenir à une saison différente de la saison active. Vacuously
    -- vrai pour une opération neuve sans aucune allocation.
    and (
      p_season_id is null
      or not exists (
        select 1
        from public.payment_allocations as other_item
        inner join public.receipt_payments as other_payment
          on other_payment.id = other_item.receipt_payment_id
        inner join public.billing_receipts as other_receipt
          on other_receipt.id = other_payment.receipt_id
        where other_item.payment_operation_id = operation.id
          and other_receipt.season_id <> p_season_id
      )
    )
  order by operation.registered_at desc, operation.id desc;
end;
$$;

comment on function public.list_reusable_payment_operations(text, uuid) is
  'Lists complete shared cheque and transfer operations available to authenticated Facturation users. Allocated and remaining amounts include every allocation, including allocations of cancelled receipts. When p_season_id is provided, operations with any allocation outside that season are excluded entirely (strict season isolation); brand-new operations with zero allocations always remain visible.';

revoke execute on function public.list_reusable_payment_operations(text, uuid)
  from public, anon;

grant execute on function public.list_reusable_payment_operations(text, uuid)
  to authenticated;
