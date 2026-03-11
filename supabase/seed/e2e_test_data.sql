-- =============================================================================
-- Studio Z Academy — E2E Test Seed Data
-- =============================================================================
-- Idempotent script: safe to re-run (ON CONFLICT DO NOTHING / DO UPDATE).
-- Execute with service_role (bypasses RLS).
--
-- UUID prefix convention for seed data:
--   e0000000-  users        a0000000-  instructors    c0000000-  courses
--   10000000-  lessons      d0000000-  orders         d1000000-  order_items
--   b0000000-  enrollments  b1000000-  course_progress  b2000000-  lesson_progress
--   f0000000-  discount_rules  f1000000-  reviews     f2000000-  cart_items
--   f3000000-  gallery      f4000000-  posts          f5000000-  events
--   f6000000-  contact_messages  e1000000-  identities
-- =============================================================================

BEGIN;

-- =========================================================
-- 1. auth.users  (4 rows)
-- =========================================================
-- Trigger handle_new_user auto-creates profiles rows.

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at, is_sso_user, is_anonymous,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, email_change, phone_change,
  phone_change_token, reauthentication_token
) VALUES
  -- Admin: Carolina Restrepo
  (
    '00000000-0000-0000-0000-000000000000',
    'e0000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated',
    'admin@studioz-test.com',
    crypt('Admin2026!', gen_salt('bf')),
    NOW() - INTERVAL '60 days',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Carolina Restrepo"}'::jsonb,
    FALSE,
    NOW() - INTERVAL '60 days',
    NOW() - INTERVAL '60 days',
    FALSE, FALSE,
    '', '', '', '', '', '', '', ''
  ),
  -- User activa: Maria Garcia Lopez
  (
    '00000000-0000-0000-0000-000000000000',
    'e0000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated',
    'maria.activa@studioz-test.com',
    crypt('Test2026!', gen_salt('bf')),
    NOW() - INTERVAL '45 days',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Maria Garcia Lopez"}'::jsonb,
    FALSE,
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '45 days',
    FALSE, FALSE,
    '', '', '', '', '', '', '', ''
  ),
  -- User nuevo: Carlos Martinez Ruiz
  (
    '00000000-0000-0000-0000-000000000000',
    'e0000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated',
    'carlos.nuevo@studioz-test.com',
    crypt('Test2026!', gen_salt('bf')),
    NOW() - INTERVAL '5 days',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Carlos Martinez Ruiz"}'::jsonb,
    FALSE,
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days',
    FALSE, FALSE,
    '', '', '', '', '', '', '', ''
  ),
  -- User completo: Ana Rodriguez Perez
  (
    '00000000-0000-0000-0000-000000000000',
    'e0000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated',
    'ana.completo@studioz-test.com',
    crypt('Test2026!', gen_salt('bf')),
    NOW() - INTERVAL '30 days',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Ana Rodriguez Perez"}'::jsonb,
    FALSE,
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '30 days',
    FALSE, FALSE,
    '', '', '', '', '', '', '', ''
  )
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 2. auth.identities  (4 rows)
-- =========================================================

INSERT INTO auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES
  (
    'e1000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    jsonb_build_object('sub','e0000000-0000-0000-0000-000000000001','email','admin@studioz-test.com','email_verified',true,'phone_verified',false),
    'email',
    NOW() - INTERVAL '60 days',
    NOW() - INTERVAL '60 days',
    NOW() - INTERVAL '60 days'
  ),
  (
    'e1000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000002',
    jsonb_build_object('sub','e0000000-0000-0000-0000-000000000002','email','maria.activa@studioz-test.com','email_verified',true,'phone_verified',false),
    'email',
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '45 days'
  ),
  (
    'e1000000-0000-0000-0000-000000000003',
    'e0000000-0000-0000-0000-000000000003',
    'e0000000-0000-0000-0000-000000000003',
    jsonb_build_object('sub','e0000000-0000-0000-0000-000000000003','email','carlos.nuevo@studioz-test.com','email_verified',true,'phone_verified',false),
    'email',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days'
  ),
  (
    'e1000000-0000-0000-0000-000000000004',
    'e0000000-0000-0000-0000-000000000004',
    'e0000000-0000-0000-0000-000000000004',
    jsonb_build_object('sub','e0000000-0000-0000-0000-000000000004','email','ana.completo@studioz-test.com','email_verified',true,'phone_verified',false),
    'email',
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '30 days'
  )
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 3. UPDATE profiles  (set admin role, phones)
-- =========================================================
-- handle_new_user trigger created these rows; now enrich them.

INSERT INTO public.profiles (id, full_name, role, phone)
VALUES
  ('e0000000-0000-0000-0000-000000000001', 'Carolina Restrepo',  'admin', '+573001234501'),
  ('e0000000-0000-0000-0000-000000000002', 'Maria Garcia Lopez', 'user',  '+573001234502'),
  ('e0000000-0000-0000-0000-000000000003', 'Carlos Martinez Ruiz','user', '+573001234503'),
  ('e0000000-0000-0000-0000-000000000004', 'Ana Rodriguez Perez','user',  '+573001234504')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role      = EXCLUDED.role,
  phone     = EXCLUDED.phone,
  updated_at = NOW();

-- =========================================================
-- 4. instructor_specialty_options
-- =========================================================

INSERT INTO public.instructor_specialty_options (id, name, normalized_name, category)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Bachata', 'bachata', 'baile'),
  ('a1000000-0000-0000-0000-000000000002', 'Salsa', 'salsa', 'baile'),
  ('a1000000-0000-0000-0000-000000000003', 'Cumbia', 'cumbia', 'baile'),
  ('a1000000-0000-0000-0000-000000000004', 'Hip-Hop', 'hip-hop', 'baile'),
  ('a1000000-0000-0000-0000-000000000005', 'Reggaeton', 'reggaeton', 'baile'),
  ('a1000000-0000-0000-0000-000000000006', 'Contemporaneo', 'contemporaneo', 'baile'),
  ('a1000000-0000-0000-0000-000000000007', 'Realismo', 'realismo', 'tatuaje'),
  ('a1000000-0000-0000-0000-000000000008', 'Blackwork', 'blackwork', 'tatuaje'),
  ('a1000000-0000-0000-0000-000000000009', 'Retrato', 'retrato', 'tatuaje'),
  ('a1000000-0000-0000-0000-000000000010', 'Geometrico', 'geometrico', 'tatuaje'),
  ('a1000000-0000-0000-0000-000000000011', 'Fineline', 'fineline', 'tatuaje'),
  ('a1000000-0000-0000-0000-000000000012', 'Minimalista', 'minimalista', 'tatuaje')
ON CONFLICT (category, normalized_name) DO UPDATE SET
  name = EXCLUDED.name;

-- =========================================================
-- 5. instructors  (4 rows)
-- =========================================================

INSERT INTO public.instructors (id, slug, full_name, bio, avatar_url, specialties, is_active)
VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    'miguel-angel-torres',
    'Miguel Angel Torres',
    'Bailarin profesional con mas de 12 anos de experiencia en ritmos latinos. Ha competido internacionalmente en bachata y salsa, y su pasion es ensenar desde lo basico hasta lo avanzado.',
    'https://placehold.co/400x400/E85D04/FFFFFF?text=MT',
    ARRAY['Bachata','Salsa','Cumbia'],
    TRUE
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    'valentina-ospina',
    'Valentina Ospina',
    'Coreografa y bailarina urbana. Especialista en hip-hop, reggaeton y danza contemporanea. Ha trabajado con artistas reconocidos y dirige su propia crew de freestyle.',
    'https://placehold.co/400x400/7B2CBF/FFFFFF?text=VO',
    ARRAY['Hip-Hop','Reggaeton','Contemporaneo'],
    TRUE
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    'diego-hernandez-ink',
    'Diego Hernandez',
    'Tatuador profesional especializado en realismo y blackwork. Mas de 10 anos de experiencia y participante habitual de convenciones de tatuaje en Latinoamerica.',
    'https://placehold.co/400x400/1A1A2E/FFFFFF?text=DH',
    ARRAY['Realismo','Blackwork','Retrato'],
    TRUE
  ),
  (
    'a0000000-0000-0000-0000-000000000004',
    'camila-vargas-art',
    'Camila Vargas',
    'Artista del tatuaje con enfoque en diseno geometrico, fineline y minimalismo. Su trabajo fusiona matematicas y arte corporal en piezas unicas.',
    'https://placehold.co/400x400/16213E/FFFFFF?text=CV',
    ARRAY['Geometrico','Fineline','Minimalista'],
    TRUE
  )
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 6. courses  (7 rows)
-- =========================================================

INSERT INTO public.courses (
  id, title, slug, description, short_description, category,
  price, is_free, thumbnail_url, instructor_id,
  is_published, published_at, created_at
) VALUES
  -- 1. Bachata desde Cero
  (
    'c0000000-0000-0000-0000-000000000001',
    'Bachata desde Cero',
    'bachata-desde-cero',
    'Aprende los fundamentos de la bachata desde cero. En este curso cubriremos el paso basico, el ritmo, el movimiento de cadera, giros en pareja y una rutina completa para que puedas bailar con confianza en cualquier pista.',
    'Domina los pasos basicos de bachata y baila con confianza.',
    'baile',
    8990000, FALSE,
    'https://placehold.co/800x450/E85D04/FFFFFF?text=Bachata+desde+Cero',
    'a0000000-0000-0000-0000-000000000001',
    TRUE, NOW() - INTERVAL '60 days', NOW() - INTERVAL '65 days'
  ),
  -- 2. Salsa Intermedia
  (
    'c0000000-0000-0000-0000-000000000002',
    'Salsa Intermedia: Giros y Figuras',
    'salsa-intermedia',
    'Lleva tu salsa al siguiente nivel. Repasaremos fundamentos y avanzaremos hacia cross body leads, giros dobles, figuras en pareja y combinaciones que impresionaran en la pista de baile.',
    'Perfecciona tus giros y figuras de salsa.',
    'baile',
    12990000, FALSE,
    'https://placehold.co/800x450/D62828/FFFFFF?text=Salsa+Intermedia',
    'a0000000-0000-0000-0000-000000000001',
    TRUE, NOW() - INTERVAL '45 days', NOW() - INTERVAL '50 days'
  ),
  -- 3. Hip-Hop Freestyle (GRATIS)
  (
    'c0000000-0000-0000-0000-000000000003',
    'Hip-Hop Freestyle',
    'hip-hop-freestyle',
    'Curso gratuito de introduccion al freestyle en hip-hop. Aprende isolations, body control, groove, bounce y los basicos para tu primer battle. Ideal para principiantes que quieren explorar la danza urbana.',
    'Introduccion gratuita al freestyle urbano.',
    'baile',
    0, TRUE,
    'https://placehold.co/800x450/7B2CBF/FFFFFF?text=Hip-Hop+Freestyle',
    'a0000000-0000-0000-0000-000000000002',
    TRUE, NOW() - INTERVAL '30 days', NOW() - INTERVAL '35 days'
  ),
  -- 4. Tatuaje Realista
  (
    'c0000000-0000-0000-0000-000000000004',
    'Tatuaje Realista: Fundamentos',
    'tatuaje-realista',
    'Domina las bases del tatuaje realista. Desde materiales y equipo hasta tecnicas de sombreado, escala de grises y un proyecto final de retrato. Ideal para tatuadores que quieren especializarse en realismo.',
    'Aprende las tecnicas del tatuaje realista profesional.',
    'tatuaje',
    14990000, FALSE,
    'https://placehold.co/800x450/1A1A2E/FFFFFF?text=Tatuaje+Realista',
    'a0000000-0000-0000-0000-000000000003',
    TRUE, NOW() - INTERVAL '20 days', NOW() - INTERVAL '25 days'
  ),
  -- 5. Diseno Geometrico
  (
    'c0000000-0000-0000-0000-000000000005',
    'Diseno Geometrico para Tatuaje',
    'diseno-geometrico',
    'Explora el mundo del diseno geometrico aplicado al tatuaje. Aprende principios de simetria, patrones, mandalas y composicion en el cuerpo humano. Finaliza con un proyecto de diseno personalizado.',
    'Crea disenos geometricos unicos para tatuaje.',
    'tatuaje',
    9990000, FALSE,
    'https://placehold.co/800x450/16213E/FFFFFF?text=Diseno+Geometrico',
    'a0000000-0000-0000-0000-000000000004',
    TRUE, NOW() - INTERVAL '10 days', NOW() - INTERVAL '15 days'
  ),
  -- 6. Introduccion al Tatuaje (GRATIS)
  (
    'c0000000-0000-0000-0000-000000000006',
    'Introduccion al Tatuaje',
    'intro-tatuaje',
    'Curso gratuito para conocer el mundo del tatuaje. Recorre la historia, los estilos modernos, crea tu primer diseno, y aprende sobre higiene, seguridad y como funciona un estudio profesional.',
    'Conoce el mundo del tatuaje desde cero.',
    'tatuaje',
    0, TRUE,
    'https://placehold.co/800x450/0F3460/FFFFFF?text=Intro+Tatuaje',
    'a0000000-0000-0000-0000-000000000003',
    TRUE, NOW() - INTERVAL '5 days', NOW() - INTERVAL '8 days'
  ),
  -- 7. Reggaeton Intensivo (BORRADOR - no publicado)
  (
    'c0000000-0000-0000-0000-000000000007',
    'Reggaeton Intensivo',
    'reggaeton-intensivo',
    'Curso intensivo de reggaeton: perreo, ritmo, conteo, movimientos urbanos, coreografia grupal y un show final. Proximamente disponible.',
    'Domina el reggaeton con coreografias explosivas.',
    'baile',
    10990000, FALSE,
    'https://placehold.co/800x450/533483/FFFFFF?text=Reggaeton+Intensivo',
    'a0000000-0000-0000-0000-000000000002',
    FALSE, NULL, NOW() - INTERVAL '3 days'
  )
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 6. lessons  (35 rows — 5 per course)
-- =========================================================
-- UUID scheme: 10000000-0000-0000-000C-00000000000L
--   C = course number (1-7), L = lesson number (1-5)
-- bunny_library_id = '603019' (Studio Z library)
-- bunny_video_id = placeholder

INSERT INTO public.lessons (
  id, course_id, title, description, bunny_video_id, bunny_library_id,
  duration_seconds, sort_order, is_free
) VALUES
  -- Course 1: Bachata desde Cero
  ('10000000-0000-0000-0001-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Que es la Bachata',           'Historia y origenes de la bachata como genero musical y danza.',           'seed-video-0101', '603019', 180,  1, TRUE),
  ('10000000-0000-0000-0001-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Paso basico y ritmo',         'Aprende el paso basico de bachata y como sentir el ritmo.',               'seed-video-0102', '603019', 420,  2, FALSE),
  ('10000000-0000-0000-0001-000000000003', 'c0000000-0000-0000-0000-000000000001', 'Movimiento de cadera',        'Tecnica para el movimiento de cadera caracteristico de la bachata.',      'seed-video-0103', '603019', 360,  3, FALSE),
  ('10000000-0000-0000-0001-000000000004', 'c0000000-0000-0000-0000-000000000001', 'Giro basico en pareja',       'Como ejecutar el giro basico bailando en pareja.',                        'seed-video-0104', '603019', 480,  4, FALSE),
  ('10000000-0000-0000-0001-000000000005', 'c0000000-0000-0000-0000-000000000001', 'Rutina completa principiante', 'Rutina completa combinando todos los movimientos aprendidos.',            'seed-video-0105', '603019', 600,  5, FALSE),

  -- Course 2: Salsa Intermedia
  ('10000000-0000-0000-0002-000000000001', 'c0000000-0000-0000-0000-000000000002', 'Repaso de fundamentos',       'Repaso rapido de los pasos basicos de salsa antes de avanzar.',            'seed-video-0201', '603019', 300,  1, TRUE),
  ('10000000-0000-0000-0002-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Cross body lead',             'Aprende la tecnica del cross body lead y sus variaciones.',               'seed-video-0202', '603019', 420,  2, FALSE),
  ('10000000-0000-0000-0002-000000000003', 'c0000000-0000-0000-0000-000000000002', 'Giros dobles',                'Tecnica para ejecutar giros dobles con control y elegancia.',             'seed-video-0203', '603019', 480,  3, FALSE),
  ('10000000-0000-0000-0002-000000000004', 'c0000000-0000-0000-0000-000000000002', 'Figuras en pareja',           'Figuras intermedias para bailar salsa en pareja con fluidez.',            'seed-video-0204', '603019', 540,  4, FALSE),
  ('10000000-0000-0000-0002-000000000005', 'c0000000-0000-0000-0000-000000000002', 'Combinacion final',           'Combinacion de todos los movimientos en una secuencia de baile.',         'seed-video-0205', '603019', 600,  5, FALSE),

  -- Course 3: Hip-Hop Freestyle
  ('10000000-0000-0000-0003-000000000001', 'c0000000-0000-0000-0000-000000000003', 'Intro al Freestyle',          'Que es el freestyle y por que es la base del hip-hop.',                   'seed-video-0301', '603019', 240,  1, TRUE),
  ('10000000-0000-0000-0003-000000000002', 'c0000000-0000-0000-0000-000000000003', 'Isolations y body control',   'Ejercicios de aislamiento y control corporal para freestyle.',            'seed-video-0302', '603019', 360,  2, FALSE),
  ('10000000-0000-0000-0003-000000000003', 'c0000000-0000-0000-0000-000000000003', 'Groove y bounce',             'Encuentra tu groove y aprende diferentes tipos de bounce.',               'seed-video-0303', '603019', 300,  3, FALSE),
  ('10000000-0000-0000-0003-000000000004', 'c0000000-0000-0000-0000-000000000003', 'Tu primer freestyle',         'Pon en practica todo lo aprendido en tu primera sesion de freestyle.',     'seed-video-0304', '603019', 420,  4, FALSE),
  ('10000000-0000-0000-0003-000000000005', 'c0000000-0000-0000-0000-000000000003', 'Battle basics',               'Conceptos basicos para participar en battles de freestyle.',              'seed-video-0305', '603019', 480,  5, FALSE),

  -- Course 4: Tatuaje Realista
  ('10000000-0000-0000-0004-000000000001', 'c0000000-0000-0000-0000-000000000004', 'Materiales y equipo',         'Conoce las maquinas, agujas, tintas y materiales para tatuaje realista.', 'seed-video-0401', '603019', 300,  1, TRUE),
  ('10000000-0000-0000-0004-000000000002', 'c0000000-0000-0000-0000-000000000004', 'Anatomia y proporciones',     'Estudio de anatomia y proporciones para retratos realistas.',             'seed-video-0402', '603019', 480,  2, FALSE),
  ('10000000-0000-0000-0004-000000000003', 'c0000000-0000-0000-0000-000000000004', 'Tecnica de sombreado',        'Tecnicas de sombreado suave y degradado para realismo.',                  'seed-video-0403', '603019', 540,  3, FALSE),
  ('10000000-0000-0000-0004-000000000004', 'c0000000-0000-0000-0000-000000000004', 'Escala de grises',            'Domina la escala de grises para dar profundidad al tatuaje.',             'seed-video-0404', '603019', 600,  4, FALSE),
  ('10000000-0000-0000-0004-000000000005', 'c0000000-0000-0000-0000-000000000004', 'Proyecto final: retrato',     'Aplica todo lo aprendido en un proyecto de retrato realista.',            'seed-video-0405', '603019', 720,  5, FALSE),

  -- Course 5: Diseno Geometrico
  ('10000000-0000-0000-0005-000000000001', 'c0000000-0000-0000-0000-000000000005', 'Principios del diseno geometrico', 'Fundamentos matematicos y esteticos del diseno geometrico.',        'seed-video-0501', '603019', 360,  1, TRUE),
  ('10000000-0000-0000-0005-000000000002', 'c0000000-0000-0000-0000-000000000005', 'Simetria y patrones',              'Tipos de simetria y como crear patrones repetitivos.',              'seed-video-0502', '603019', 420,  2, FALSE),
  ('10000000-0000-0000-0005-000000000003', 'c0000000-0000-0000-0000-000000000005', 'Mandala basico',                   'Paso a paso para dibujar un mandala desde cero.',                  'seed-video-0503', '603019', 480,  3, FALSE),
  ('10000000-0000-0000-0005-000000000004', 'c0000000-0000-0000-0000-000000000005', 'Composicion en el cuerpo',         'Como adaptar disenos geometricos a la anatomia del cuerpo.',        'seed-video-0504', '603019', 360,  4, FALSE),
  ('10000000-0000-0000-0005-000000000005', 'c0000000-0000-0000-0000-000000000005', 'Proyecto: diseno personalizado',   'Crea tu propio diseno geometrico listo para tatuar.',              'seed-video-0505', '603019', 540,  5, FALSE),

  -- Course 6: Introduccion al Tatuaje
  ('10000000-0000-0000-0006-000000000001', 'c0000000-0000-0000-0000-000000000006', 'Historia del tatuaje',        'Recorrido por la historia del tatuaje desde las culturas ancestrales.',   'seed-video-0601', '603019', 300,  1, TRUE),
  ('10000000-0000-0000-0006-000000000002', 'c0000000-0000-0000-0000-000000000006', 'Estilos modernos',            'Panorama de los estilos de tatuaje mas populares hoy en dia.',           'seed-video-0602', '603019', 360,  2, FALSE),
  ('10000000-0000-0000-0006-000000000003', 'c0000000-0000-0000-0000-000000000006', 'Tu primer diseno',            'Guia paso a paso para crear tu primer diseno de tatuaje.',               'seed-video-0603', '603019', 420,  3, FALSE),
  ('10000000-0000-0000-0006-000000000004', 'c0000000-0000-0000-0000-000000000006', 'Higiene y seguridad',         'Normas de higiene y seguridad esenciales en el tatuaje.',                'seed-video-0604', '603019', 300,  4, FALSE),
  ('10000000-0000-0000-0006-000000000005', 'c0000000-0000-0000-0000-000000000006', 'El estudio de tatuaje',       'Como funciona un estudio de tatuaje profesional.',                       'seed-video-0605', '603019', 360,  5, FALSE),

  -- Course 7: Reggaeton Intensivo (borrador)
  ('10000000-0000-0000-0007-000000000001', 'c0000000-0000-0000-0000-000000000007', 'Fundamentos del perreo',      'Bases del movimiento de perreo con control y ritmo.',                    'seed-video-0701', '603019', 240,  1, TRUE),
  ('10000000-0000-0000-0007-000000000002', 'c0000000-0000-0000-0000-000000000007', 'Ritmo y conteo',              'Como contar el ritmo del reggaeton para bailar en tiempo.',              'seed-video-0702', '603019', 300,  2, FALSE),
  ('10000000-0000-0000-0007-000000000003', 'c0000000-0000-0000-0000-000000000007', 'Movimientos urbanos',         'Movimientos urbanos esenciales para el reggaeton.',                      'seed-video-0703', '603019', 360,  3, FALSE),
  ('10000000-0000-0000-0007-000000000004', 'c0000000-0000-0000-0000-000000000007', 'Coreografia grupal',          'Aprende una coreografia grupal paso a paso.',                            'seed-video-0704', '603019', 480,  4, FALSE),
  ('10000000-0000-0000-0007-000000000005', 'c0000000-0000-0000-0000-000000000007', 'Show final',                  'Presentacion final con la coreografia completa.',                        'seed-video-0705', '603019', 420,  5, FALSE)
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 7. discount_rules  (2 rows)
-- =========================================================

INSERT INTO public.discount_rules (id, name, category, min_courses, discount_type, discount_value, is_active)
VALUES
  ('f0000000-0000-0000-0000-000000000001', 'Combo Baile x2',   'baile',   2, 'percentage', 10, TRUE),
  ('f0000000-0000-0000-0000-000000000002', 'Combo Tatuaje x2', 'tatuaje', 2, 'percentage', 15, TRUE)
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 8. orders  (3 rows)
-- =========================================================

INSERT INTO public.orders (
  id, user_id, customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot,
  reference, subtotal, discount_amount, total, status,
  wompi_transaction_id, payment_method, currency,
  created_at, approved_at
) VALUES
  -- Order 1: Maria — Bachata + Salsa (approved, NEQUI)
  (
    'd0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000002',
    'Maria Garcia Lopez', 'maria.activa@studioz-test.com', '+573001234502',
    'SEED-ORD-001', 21980000, 0, 21980000, 'approved',
    'seed-wompi-txn-001', 'NEQUI', 'COP',
    NOW() - INTERVAL '40 days', NOW() - INTERVAL '40 days'
  ),
  -- Order 2: Ana — Tatuaje Realista (approved, PSE)
  (
    'd0000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000004',
    'Ana Rodriguez Perez', 'ana.completo@studioz-test.com', '+573001234504',
    'SEED-ORD-002', 14990000, 0, 14990000, 'approved',
    'seed-wompi-txn-002', 'PSE', 'COP',
    NOW() - INTERVAL '25 days', NOW() - INTERVAL '25 days'
  ),
  -- Order 3: Carlos — Diseno Geometrico (pending)
  (
    'd0000000-0000-0000-0000-000000000003',
    'e0000000-0000-0000-0000-000000000003',
    'Carlos Martinez Ruiz', 'carlos.nuevo@studioz-test.com', '+573001234503',
    'SEED-ORD-003', 9990000, 0, 9990000, 'pending',
    NULL, NULL, 'COP',
    NOW() - INTERVAL '3 days', NULL
  )
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 9. order_items  (4 rows)
-- =========================================================

INSERT INTO public.order_items (id, order_id, course_id, course_title_snapshot, price_at_purchase)
VALUES
  ('d1000000-0000-0000-0001-000000000001', 'd0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Bachata desde Cero',               8990000),
  ('d1000000-0000-0000-0001-000000000002', 'd0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'Salsa Intermedia: Giros y Figuras', 12990000),
  ('d1000000-0000-0000-0002-000000000001', 'd0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 'Tatuaje Realista: Fundamentos',     14990000),
  ('d1000000-0000-0000-0003-000000000001', 'd0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000005', 'Diseno Geometrico para Tatuaje',    9990000)
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 10. enrollments  (6 rows)
-- =========================================================

INSERT INTO public.enrollments (id, user_id, course_id, source, order_id, enrolled_at)
VALUES
  -- Maria: 2 purchased + 1 free
  ('b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'purchase', 'd0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '40 days'),
  ('b0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'purchase', 'd0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '40 days'),
  ('b0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', 'free',     NULL,                                   NOW() - INTERVAL '35 days'),
  -- Ana: 1 purchased + 1 free
  ('b0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', 'purchase', 'd0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '25 days'),
  ('b0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000006', 'free',     NULL,                                   NOW() - INTERVAL '20 days'),
  -- Carlos: 1 free
  ('b0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'free',     NULL,                                   NOW() - INTERVAL '4 days')
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 11. course_progress  (6 rows)
-- =========================================================

INSERT INTO public.course_progress (id, user_id, course_id, last_lesson_id, completed_lessons, is_completed, last_accessed_at)
VALUES
  -- Maria: Bachata 3/5
  ('b1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0001-000000000003', 3, FALSE, NOW() - INTERVAL '10 days'),
  -- Maria: Salsa 1/5
  ('b1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0002-000000000001', 1, FALSE, NOW() - INTERVAL '20 days'),
  -- Maria: Hip-Hop 5/5 COMPLETED
  ('b1000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0003-000000000005', 5, TRUE,  NOW() - INTERVAL '15 days'),
  -- Ana: Tatuaje Realista 5/5 COMPLETED
  ('b1000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0004-000000000005', 5, TRUE,  NOW() - INTERVAL '8 days'),
  -- Ana: Intro Tatuaje 3/5
  ('b1000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000006', '10000000-0000-0000-0006-000000000003', 3, FALSE, NOW() - INTERVAL '5 days'),
  -- Carlos: Hip-Hop 0/5 (recien inscrito)
  ('b1000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', NULL,                                   0, FALSE, NOW() - INTERVAL '4 days')
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 12. lesson_progress  (17 rows)
-- =========================================================

INSERT INTO public.lesson_progress (id, user_id, lesson_id, completed, completed_at, video_position)
VALUES
  -- Maria — Bachata: lessons 1,2,3 completed
  ('b2000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0001-000000000001', TRUE,  NOW() - INTERVAL '38 days', 180),
  ('b2000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0001-000000000002', TRUE,  NOW() - INTERVAL '35 days', 420),
  ('b2000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0001-000000000003', TRUE,  NOW() - INTERVAL '30 days', 360),

  -- Maria — Salsa: lesson 1 completed
  ('b2000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0002-000000000001', TRUE,  NOW() - INTERVAL '20 days', 300),

  -- Maria — Hip-Hop: all 5 completed
  ('b2000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0003-000000000001', TRUE,  NOW() - INTERVAL '32 days', 240),
  ('b2000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0003-000000000002', TRUE,  NOW() - INTERVAL '28 days', 360),
  ('b2000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0003-000000000003', TRUE,  NOW() - INTERVAL '25 days', 300),
  ('b2000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0003-000000000004', TRUE,  NOW() - INTERVAL '20 days', 420),
  ('b2000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0003-000000000005', TRUE,  NOW() - INTERVAL '15 days', 480),

  -- Ana — Tatuaje Realista: all 5 completed
  ('b2000000-0000-0000-0000-000000000010', 'e0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0004-000000000001', TRUE,  NOW() - INTERVAL '22 days', 300),
  ('b2000000-0000-0000-0000-000000000011', 'e0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0004-000000000002', TRUE,  NOW() - INTERVAL '19 days', 480),
  ('b2000000-0000-0000-0000-000000000012', 'e0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0004-000000000003', TRUE,  NOW() - INTERVAL '16 days', 540),
  ('b2000000-0000-0000-0000-000000000013', 'e0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0004-000000000004', TRUE,  NOW() - INTERVAL '13 days', 600),
  ('b2000000-0000-0000-0000-000000000014', 'e0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0004-000000000005', TRUE,  NOW() - INTERVAL '10 days', 720),

  -- Ana — Intro Tatuaje: lessons 1,2,3 completed
  ('b2000000-0000-0000-0000-000000000015', 'e0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0006-000000000001', TRUE,  NOW() - INTERVAL '15 days', 300),
  ('b2000000-0000-0000-0000-000000000016', 'e0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0006-000000000002', TRUE,  NOW() - INTERVAL '12 days', 360),
  ('b2000000-0000-0000-0000-000000000017', 'e0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0006-000000000003', TRUE,  NOW() - INTERVAL '8 days',  420)
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 13. reviews  (6 rows)
-- =========================================================
-- Trigger refresh_course_rating_stats auto-updates courses.rating_avg/reviews_count.

INSERT INTO public.reviews (id, user_id, course_id, rating, text, is_visible, created_at)
VALUES
  ('f1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 5, 'Excelente curso! Miguel explica muy bien los pasos basicos. Lo recomiendo.',                     TRUE, NOW() - INTERVAL '25 days'),
  ('f1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', 5, 'Super divertido, Valentina tiene mucha energia. Ideal para empezar.',                              TRUE, NOW() - INTERVAL '14 days'),
  ('f1000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 4, 'Muy bueno, aunque algunos videos podrian ser mas largos.',                                         TRUE, NOW() - INTERVAL '18 days'),
  ('f1000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', 5, 'Diego es un crack. Las tecnicas de sombreado son increibles.',                                      TRUE, NOW() - INTERVAL '7 days'),
  ('f1000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000006', 4, 'Buen panorama general del mundo del tatuaje.',                                                      TRUE, NOW() - INTERVAL '4 days'),
  ('f1000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 4, 'Buen curso gratis para arrancar. Facil de seguir.',                                                 TRUE, NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 14. cart_items  (1 row)
-- =========================================================

INSERT INTO public.cart_items (id, user_id, course_id)
VALUES
  ('f2000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 15. gallery_items  (6 rows)
-- =========================================================

INSERT INTO public.gallery_items (id, image_url, caption, category, sort_order)
VALUES
  ('f3000000-0000-0000-0000-000000000001', 'https://placehold.co/800x600/E85D04/FFFFFF?text=Salsa+Night',      'Noche de salsa en Studio Z',       'baile',   1),
  ('f3000000-0000-0000-0000-000000000002', 'https://placehold.co/800x600/D62828/FFFFFF?text=Bachata+Class',    'Clase grupal de bachata',           'baile',   2),
  ('f3000000-0000-0000-0000-000000000003', 'https://placehold.co/800x600/7B2CBF/FFFFFF?text=Hip-Hop+Show',     'Show de hip-hop en vivo',           'baile',   3),
  ('f3000000-0000-0000-0000-000000000004', 'https://placehold.co/800x600/1A1A2E/FFFFFF?text=Realistic+Tattoo', 'Tatuaje realista en progreso',      'tatuaje', 4),
  ('f3000000-0000-0000-0000-000000000005', 'https://placehold.co/800x600/16213E/FFFFFF?text=Geometric+Design', 'Diseno geometrico finalizado',      'tatuaje', 5),
  ('f3000000-0000-0000-0000-000000000006', 'https://placehold.co/800x600/0F3460/FFFFFF?text=Watercolor+Ink',   'Sesion de tatuaje acuarela',        'tatuaje', 6)
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 16. posts  (3 rows)
-- =========================================================

INSERT INTO public.posts (id, title, slug, content, excerpt, cover_image_url, is_published, published_at, created_at)
VALUES
  (
    'f4000000-0000-0000-0000-000000000001',
    'Studio Z abre sus puertas',
    'apertura-studio-z',
    'Estamos emocionados de anunciar la apertura oficial de Studio Z Academy, un espacio dedicado al arte del baile y el tatuaje en Cali, Colombia. Nuestro estudio combina la pasion por los ritmos latinos con el arte corporal, ofreciendo cursos online para que aprendas a tu ritmo desde cualquier lugar. Bienvenidos a la familia Studio Z!',
    'Studio Z Academy abre sus puertas en Cali con cursos de baile y tatuaje.',
    'https://placehold.co/1200x630/E85D04/FFFFFF?text=Apertura+Studio+Z',
    TRUE, NOW() - INTERVAL '20 days', NOW() - INTERVAL '22 days'
  ),
  (
    'f4000000-0000-0000-0000-000000000002',
    'Nuevos cursos disponibles para 2026',
    'nuevos-cursos-2026',
    'Arrancamos el 2026 con nuevos cursos para todos los niveles. En baile tenemos Bachata desde Cero, Salsa Intermedia y Hip-Hop Freestyle. En tatuaje, Fundamentos de Tatuaje Realista y Diseno Geometrico. Ademas, dos cursos completamente gratuitos para que empieces sin compromiso. Revisa nuestro catalogo y encuentra el curso perfecto para ti.',
    'Nuevos cursos de baile y tatuaje disponibles en la plataforma.',
    'https://placehold.co/1200x630/7B2CBF/FFFFFF?text=Nuevos+Cursos+2026',
    TRUE, NOW() - INTERVAL '10 days', NOW() - INTERVAL '12 days'
  ),
  (
    'f4000000-0000-0000-0000-000000000003',
    'Convencion de Tatuaje Colombia 2026',
    'convencion-tatuaje-borrador',
    'Proximamente participaremos en la Convencion Nacional de Tatuaje Colombia 2026. Mas detalles pronto.',
    'Studio Z estara presente en la convencion de tatuaje mas grande del pais.',
    'https://placehold.co/1200x630/1A1A2E/FFFFFF?text=Convencion+Tatuaje',
    FALSE, NULL, NOW() - INTERVAL '2 days'
  )
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 17. events  (2 rows)
-- =========================================================

INSERT INTO public.events (id, title, description, image_url, event_date, location, is_published, created_at)
VALUES
  (
    'f5000000-0000-0000-0000-000000000001',
    'Noche de Salsa Gratis',
    'Ven a disfrutar una noche de salsa en vivo con clase gratuita para principiantes. Musica en vivo, instructores profesionales y mucho sabor. No necesitas experiencia previa, solo ganas de bailar!',
    'https://placehold.co/800x450/E85D04/FFFFFF?text=Noche+de+Salsa',
    '2026-03-15 20:00:00-05',
    'Studio Z, Cali',
    TRUE,
    NOW() - INTERVAL '15 days'
  ),
  (
    'f5000000-0000-0000-0000-000000000002',
    'Workshop de Blackwork',
    'Workshop intensivo de tatuaje estilo blackwork con Diego Hernandez. Aprende tecnicas avanzadas de lineas gruesas, rellenos solidos y composicion en un solo dia. Cupos limitados.',
    'https://placehold.co/800x450/1A1A2E/FFFFFF?text=Workshop+Blackwork',
    '2026-01-10 14:00:00-05',
    'Studio Z, Cali',
    TRUE,
    NOW() - INTERVAL '50 days'
  )
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 18. contact_messages  (2 rows)
-- =========================================================

INSERT INTO public.contact_messages (id, name, email, subject, message, is_read, created_at)
VALUES
  (
    'f6000000-0000-0000-0000-000000000001',
    'Pedro Alvarez',
    'pedro.alvarez@example.com',
    'Consulta sobre horarios de clases',
    'Hola, me gustaria saber si tienen clases presenciales ademas de los cursos online. Tambien quiero saber los horarios disponibles. Gracias!',
    FALSE,
    NOW() - INTERVAL '2 days'
  ),
  (
    'f6000000-0000-0000-0000-000000000002',
    'Ana Maria Jimenez',
    'anamaria.jimenez@example.com',
    'Felicitaciones por el estudio',
    'Quiero felicitarlos por el excelente trabajo que hacen en Studio Z. Tome el curso de bachata y quede encantada. Sigan asi!',
    TRUE,
    NOW() - INTERVAL '7 days'
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- =============================================================================
-- TEARDOWN (uncomment to remove all seed data)
-- =============================================================================
-- BEGIN;
-- DELETE FROM public.contact_messages  WHERE id LIKE 'f6000000-%';
-- DELETE FROM public.events            WHERE id LIKE 'f5000000-%';
-- DELETE FROM public.posts             WHERE id LIKE 'f4000000-%';
-- DELETE FROM public.gallery_items     WHERE id LIKE 'f3000000-%';
-- DELETE FROM public.cart_items        WHERE id LIKE 'f2000000-%';
-- DELETE FROM public.reviews           WHERE id LIKE 'f1000000-%';
-- DELETE FROM public.lesson_progress   WHERE id LIKE 'b2000000-%';
-- DELETE FROM public.course_progress   WHERE id LIKE 'b1000000-%';
-- DELETE FROM public.enrollments       WHERE id LIKE 'b0000000-%';
-- DELETE FROM public.order_items       WHERE id LIKE 'd1000000-%';
-- DELETE FROM public.orders            WHERE id LIKE 'd0000000-%';
-- DELETE FROM public.discount_rules    WHERE id LIKE 'f0000000-%';
-- DELETE FROM public.lessons           WHERE id LIKE '10000000-%';
-- DELETE FROM public.courses           WHERE id LIKE 'c0000000-%';
-- DELETE FROM public.instructors       WHERE id LIKE 'a0000000-%';
-- DELETE FROM public.profiles          WHERE id LIKE 'e0000000-%';
-- DELETE FROM auth.identities          WHERE id LIKE 'e1000000-%';
-- DELETE FROM auth.users               WHERE id LIKE 'e0000000-%';
-- COMMIT;
