-- Migration: Sync active app_users without auth_user_id to Supabase Auth (auth.users and auth.identities)
-- Keeps existing bcrypt password hashes untouched.

do $$
declare
  u record;
  existing_auth_id uuid;
  assigned_email text;
begin
  for u in
    select id, display_name, role, password_hash
    from public.app_users
    where is_active = true
      and (auth_user_id is null or auth_email is null)
      and password_hash is not null
  loop
    assigned_email := lower(regexp_replace(u.display_name, '[^a-zA-Z0-9]', '', 'g')) || '@rebu.app';

    select id into existing_auth_id
    from auth.users
    where email = assigned_email;

    if existing_auth_id is null then
      existing_auth_id := gen_random_uuid();
      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_sso_user,
        is_anonymous,
        created_at,
        updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000'::uuid,
        existing_auth_id,
        'authenticated',
        'authenticated',
        assigned_email,
        u.password_hash,
        now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        jsonb_build_object('display_name', u.display_name, 'email_verified', true),
        false,
        false,
        now(),
        now()
      );
    else
      update auth.users
      set encrypted_password = u.password_hash,
          updated_at = now()
      where id = existing_auth_id;
    end if;

    insert into auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      existing_auth_id::text,
      existing_auth_id,
      jsonb_build_object('sub', existing_auth_id::text, 'email', assigned_email, 'email_verified', true),
      'email',
      now(),
      now(),
      now()
    )
    on conflict (provider_id, provider) do update
    set identity_data = excluded.identity_data,
        updated_at = now();

    update public.app_users
    set auth_user_id = existing_auth_id,
        auth_email = assigned_email,
        updated_at = now()
    where id = u.id;

    raise notice 'Linked user % (%) to auth.users with email % and id %', u.display_name, u.id, assigned_email, existing_auth_id;
  end loop;
end;
$$;

-- Reload PostgREST schema cache so RPCs immediately pick up changes
notify pgrst, 'reload schema';
