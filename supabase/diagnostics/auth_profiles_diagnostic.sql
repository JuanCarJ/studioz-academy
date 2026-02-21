-- Diagnostico de sincronizacion auth.users <-> public.profiles
-- Fecha: 2026-02-21
-- Uso: ejecutar en Supabase SQL Editor con rol postgres/service_role.
--
-- Objetivo:
-- 1) Confirmar si hay usuarios autenticados sin profile (causa comun de navbar "anonimo").
-- 2) Confirmar si hay profiles huerfanos.
-- 3) Verificar trigger/function de creacion automatica de profile.
-- 4) (Opcional) backfill seguro de profiles faltantes.

-- ============================================================================
-- 1) Resumen general
-- ============================================================================
SELECT
  (SELECT COUNT(*) FROM auth.users) AS auth_users_total,
  (SELECT COUNT(*) FROM public.profiles) AS profiles_total,
  (
    SELECT COUNT(*)
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  ) AS users_without_profile,
  (
    SELECT COUNT(*)
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE u.id IS NULL
  ) AS orphan_profiles;

-- ============================================================================
-- 2) Detalle de usuarios sin profile (mas recientes primero)
-- ============================================================================
SELECT
  u.id,
  u.email,
  u.created_at,
  u.last_sign_in_at,
  providers.providers,
  u.raw_user_meta_data ->> 'full_name' AS metadata_full_name
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN LATERAL (
  SELECT string_agg(DISTINCT i.provider, ', ' ORDER BY i.provider) AS providers
  FROM auth.identities i
  WHERE i.user_id = u.id
) providers ON TRUE
WHERE p.id IS NULL
ORDER BY u.created_at DESC
LIMIT 200;

-- ============================================================================
-- 3) Foco: usuarios Google OAuth sin profile
-- ============================================================================
SELECT
  u.id,
  u.email,
  u.created_at,
  u.last_sign_in_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
  AND EXISTS (
    SELECT 1
    FROM auth.identities i
    WHERE i.user_id = u.id
      AND i.provider = 'google'
  )
ORDER BY u.created_at DESC;

-- ============================================================================
-- 4) Verificacion de trigger on_auth_user_created
-- ============================================================================
SELECT
  t.tgname,
  t.tgenabled,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'auth'
  AND c.relname = 'users'
  AND t.tgname = 'on_auth_user_created'
  AND NOT t.tgisinternal;

-- ============================================================================
-- 5) Verificacion de funcion public.handle_new_user()
-- ============================================================================
SELECT pg_get_functiondef(to_regprocedure('public.handle_new_user()'));

-- ============================================================================
-- 6) Remediacion opcional: backfill de profiles faltantes
-- ============================================================================
-- PREVIEW (NO escribe):
SELECT
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data ->> 'full_name',
    split_part(u.email, '@', 1)
  ) AS full_name,
  u.raw_user_meta_data ->> 'phone' AS phone,
  u.raw_user_meta_data ->> 'avatar_url' AS avatar_url
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ORDER BY u.created_at DESC;

-- EJECUCION (DESCOMENTAR SI QUIERES APLICAR):
-- BEGIN;
-- INSERT INTO public.profiles (id, full_name, phone, avatar_url, role)
-- SELECT
--   u.id,
--   COALESCE(
--     u.raw_user_meta_data ->> 'full_name',
--     split_part(u.email, '@', 1)
--   ) AS full_name,
--   u.raw_user_meta_data ->> 'phone' AS phone,
--   u.raw_user_meta_data ->> 'avatar_url' AS avatar_url,
--   'user'::text AS role
-- FROM auth.users u
-- LEFT JOIN public.profiles p ON p.id = u.id
-- WHERE p.id IS NULL
-- ON CONFLICT (id) DO NOTHING;
-- COMMIT;

-- ============================================================================
-- 7) Post-check (re-ejecutar despues del backfill)
-- ============================================================================
SELECT
  (
    SELECT COUNT(*)
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  ) AS users_without_profile_after,
  (
    SELECT COUNT(*)
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE u.id IS NULL
  ) AS orphan_profiles_after;

-- ============================================================================
-- RESULTADOS DE EJECUCION
-- Fecha: 2026-02-21
-- Ejecutado via Supabase MCP (service_role)
-- ============================================================================

-- 1) Resumen general
-- ┌──────────────────┬─────────────────┬───────────────────────┬─────────────────┐
-- │ auth_users_total │ profiles_total  │ users_without_profile │ orphan_profiles │
-- ├──────────────────┼─────────────────┼───────────────────────┼─────────────────┤
-- │ 3                │ 3               │ 0                     │ 0               │
-- └──────────────────┴─────────────────┴───────────────────────┴─────────────────┘

-- 2) Detalle de usuarios sin profile
-- (vacio — ningun usuario sin profile)

-- 3) Foco: usuarios Google OAuth sin profile
-- (vacio — ningun usuario Google sin profile)

-- 4) Verificacion de trigger on_auth_user_created
-- ┌─────────────────────────┬───────────┬──────────────────────────────────────────────────────────────────────┐
-- │ tgname                  │ tgenabled │ trigger_definition                                                   │
-- ├─────────────────────────┼───────────┼──────────────────────────────────────────────────────────────────────┤
-- │ on_auth_user_created    │ O         │ CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users       │
-- │                         │           │ FOR EACH ROW EXECUTE FUNCTION handle_new_user()                      │
-- └─────────────────────────┴───────────┴──────────────────────────────────────────────────────────────────────┘

-- 5) Verificacion de funcion public.handle_new_user()
-- CREATE OR REPLACE FUNCTION public.handle_new_user()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO ''
-- AS $function$
-- BEGIN
--   INSERT INTO public.profiles (id, full_name)
--   VALUES (
--     NEW.id,
--     COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
--   );
--   RETURN NEW;
-- END;
-- $function$

-- 6) Remediacion opcional: backfill preview
-- (vacio — no hay usuarios sin profile, no se requiere backfill)

-- 7) Post-check
-- ┌──────────────────────────────┬───────────────────────┐
-- │ users_without_profile_after  │ orphan_profiles_after │
-- ├──────────────────────────────┼───────────────────────┤
-- │ 0                            │ 0                     │
-- └──────────────────────────────┴───────────────────────┘

-- CONCLUSION:
-- Sincronizacion auth.users <-> public.profiles: OK (3/3).
-- Trigger on_auth_user_created: ACTIVO (tgenabled = 'O').
-- Funcion handle_new_user(): PRESENTE y correcta (SECURITY DEFINER, search_path vacio).
-- Backfill: NO REQUERIDO.
