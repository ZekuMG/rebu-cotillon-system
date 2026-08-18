\set ON_ERROR_STOP on
\pset tuples_only on

select auth_user_id::text as auth_user_id
from public.app_users
where is_active = true
  and lower(role) in ('system', 'sistema')
limit 1
\gset

select encode(
  extensions.digest(
    convert_to('diagnostic-device-token-0123456789-abcdef', 'UTF8'),
    'sha256'
  ),
  'hex'
) as token_hash
\gset

begin;
select set_config('request.jwt.claim.sub', :'auth_user_id', true);
set local role authenticated;

select (
  public.request_whatsapp_device_access(
    '00000000-0000-4000-8000-000000000111'::uuid,
    :'token_hash',
    'REBU-DIAGNOSTIC',
    'Windows diagnostic'
  ) ->> 'id'
) as request_id
\gset

select case
  when public.review_whatsapp_device_access(:'request_id'::uuid, 'approved') ->> 'status' = 'approved'
    then 'APPROVAL_OK'
  else 'APPROVAL_FAILED'
end;

select case
  when coalesce((public.authorize_whatsapp_device_access(
    '00000000-0000-4000-8000-000000000111'::uuid,
    'diagnostic-device-token-0123456789-abcdef'
  ) ->> 'allowed')::boolean, false)
    then 'AUTHORIZATION_OK'
  else 'AUTHORIZATION_FAILED'
end;

rollback;
