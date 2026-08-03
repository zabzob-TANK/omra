create function public.create_complete_facturation_receipt(
  p_season_id uuid,
  p_program_id uuid,
  p_hotel_id uuid,
  p_flight_id uuid,
  p_room_id uuid,
  p_discount_amount_dh integer,
  p_existing_dossier_id uuid default null,
  p_new_dossier_reference text default null,
  p_new_dossier_label text default null,
  p_new_dossier_note text default null,
  p_existing_traveler_id uuid default null,
  p_new_traveler_first_name text default null,
  p_new_traveler_last_name text default null,
  p_new_traveler_phone text default null,
  p_rabatteur_id uuid default null,
  p_registration_note text default null,
  p_first_payment_amount_dh integer default null,
  p_payment_mode text default null,
  p_usage_kind text default null,
  p_existing_shared_operation_id uuid default null,
  p_operation_amount_dh integer default null,
  p_instrument_reference text default null,
  p_bank_name text default null,
  p_instrument_date date default null,
  p_payer_name text default null,
  p_confirm_over_allocation boolean default false
)
returns table (
  registration_id uuid,
  dossier_id uuid,
  traveler_id uuid,
  receipt_id uuid,
  receipt_number integer,
  season_id uuid,
  first_payment_id uuid,
  payment_operation_id uuid,
  over_allocation_confirmed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration record;
  v_receipt record;
begin
  -- Both existing RPCs execute inside this function's transaction. Any error
  -- raised while creating the receipt rolls back the registration, traveler
  -- and dossier rows that may have been created immediately beforehand.
  select registration.*
  into strict v_registration
  from public.create_facturation_traveler_registration(
    p_season_id,
    p_program_id,
    p_hotel_id,
    p_flight_id,
    p_room_id,
    p_discount_amount_dh,
    p_existing_dossier_id,
    p_new_dossier_reference,
    p_new_dossier_label,
    p_new_dossier_note,
    p_existing_traveler_id,
    p_new_traveler_first_name,
    p_new_traveler_last_name,
    p_new_traveler_phone,
    p_rabatteur_id,
    p_registration_note
  ) as registration;

  select receipt.*
  into strict v_receipt
  from public.create_billing_receipt_with_first_payment(
    v_registration.registration_id,
    p_first_payment_amount_dh,
    p_payment_mode,
    p_usage_kind,
    p_existing_shared_operation_id,
    p_operation_amount_dh,
    p_instrument_reference,
    p_bank_name,
    p_instrument_date,
    p_payer_name,
    p_confirm_over_allocation
  ) as receipt;

  return query
  select
    v_registration.registration_id::uuid,
    v_registration.dossier_id::uuid,
    v_registration.traveler_id::uuid,
    v_receipt.receipt_id::uuid,
    v_receipt.receipt_number::integer,
    v_receipt.season_id::uuid,
    v_receipt.first_payment_id::uuid,
    v_receipt.payment_operation_id::uuid,
    v_receipt.over_allocation_confirmed::boolean;
end;
$$;

comment on function public.create_complete_facturation_receipt(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  integer,
  text,
  text,
  uuid,
  integer,
  text,
  text,
  date,
  text,
  boolean
) is
  'Atomically creates a secure Facturation traveler registration and its seasonal receipt with mandatory first payment by composing the already validated RPCs. Actor identity remains resolved exclusively from auth.uid() by the composed functions.';

revoke execute on function public.create_complete_facturation_receipt(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  integer,
  text,
  text,
  uuid,
  integer,
  text,
  text,
  date,
  text,
  boolean
) from public, anon;

grant execute on function public.create_complete_facturation_receipt(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  integer,
  text,
  text,
  uuid,
  integer,
  text,
  text,
  date,
  text,
  boolean
) to authenticated;
