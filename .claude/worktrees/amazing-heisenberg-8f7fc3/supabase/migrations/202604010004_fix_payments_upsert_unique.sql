begin;

-- Remove duplicate rows for the intended payment idempotency key before enforcing uniqueness.
with ranked as (
  select
    id,
    row_number() over (
      partition by org_id, source_payment_key, registration_id
      order by created_at asc, id asc
    ) as row_num
  from commerce.payments
  where source_payment_key is not null
    and registration_id is not null
)
delete from commerce.payments payment
using ranked
where payment.id = ranked.id
  and ranked.row_num > 1;

drop index if exists commerce.payments_org_source_registration_uidx;

create unique index if not exists payments_org_source_registration_key
  on commerce.payments (org_id, source_payment_key, registration_id);

commit;
