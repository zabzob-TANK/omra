create table public.account_slots (
  slot_number smallint primary key,
  slot_label text not null,
  login text,
  auth_user_id uuid unique references auth.users(id) on delete restrict,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_slots_number_check check (slot_number between 1 and 6),
  constraint account_slots_label_check check (
    (slot_number = 1 and slot_label = 'Administrateur') or
    (slot_number = 2 and slot_label = 'Employé 1') or
    (slot_number = 3 and slot_label = 'Employé 2') or
    (slot_number = 4 and slot_label = 'Employé 3') or
    (slot_number = 5 and slot_label = 'Employé 4') or
    (slot_number = 6 and slot_label = 'Employé 5')
  ),
  constraint account_slots_configuration_check check (
    (auth_user_id is null and login is null and active = false) or
    (auth_user_id is not null and login is not null)
  )
);

create unique index account_slots_login_unique
  on public.account_slots (lower(login))
  where login is not null;

insert into public.account_slots (slot_number, slot_label)
values
  (1, 'Administrateur'),
  (2, 'Employé 1'),
  (3, 'Employé 2'),
  (4, 'Employé 3'),
  (5, 'Employé 4'),
  (6, 'Employé 5');

create function public.set_account_slots_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_account_slots_updated_at
before update on public.account_slots
for each row execute function public.set_account_slots_updated_at();

create function public.protect_account_slots_structure()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    raise exception 'Account slots are fixed and cannot be added';
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Account slots are fixed and cannot be deleted';
  end if;

  if new.slot_number <> old.slot_number or new.slot_label <> old.slot_label then
    raise exception 'Account slot identity cannot be changed';
  end if;

  return new;
end;
$$;

create trigger protect_account_slots_structure
before insert or update or delete on public.account_slots
for each row execute function public.protect_account_slots_structure();

alter table public.account_slots enable row level security;

revoke all on table public.account_slots from anon, authenticated;
grant all on table public.account_slots to service_role;

revoke all on function public.set_account_slots_updated_at() from public;
revoke all on function public.protect_account_slots_structure() from public;
