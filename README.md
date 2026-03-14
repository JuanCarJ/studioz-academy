# Studio Z Academy

LMS y storefront para Studio Z Academy construido con Next.js App Router, Supabase, Wompi, Bunny Stream y Resend.

## Estado actual

La app ya cubre el flujo principal end to end:

- sitio publico con home, catalogo, detalle de curso, instructores, galeria, eventos, servicios y contacto;
- autenticacion y dashboard de alumno;
- carrito, checkout Wompi, retorno, webhook y conciliacion;
- cursos gratis, cursos comprados y cursos promocionales `100% OFF`;
- descuentos individuales por curso y combos de carrito;
- admin de cursos, combos, ventas, usuarios, instructores, galeria, eventos, reseñas y auditoria;
- media de video con Bunny y emails transaccionales via Resend.

Documentacion relacionada:

- [Auditoria Wompi y pruebas](./docs/wompi/WOMPI_AUDITORIA_Y_PRUEBAS_2026-03-09.md)
- [Hallazgos E2E y resolucion](./docs/qa/E2E_HALLAZGOS_Y_RESOLUCION_2026-03-09.md)

## Stack

- Next.js 16 + React 19
- TypeScript
- Supabase Auth, Postgres, Storage y RLS
- Wompi Checkout Web + webhooks
- Bunny Stream para preview y lecciones
- Resend para correos
- Playwright para E2E

## Cobertura funcional actual

### Publico

- home, servicios, galeria, eventos y contacto;
- catalogo de cursos y detalle de curso;
- listado y detalle de instructores;
- redirecciones legacy de `/noticias` y `/noticias/[slug]` hacia `/eventos`;
- terminos, privacidad y politica de reembolso.

### Alumno

- login, registro y continuidad post-login;
- carrito y checkout;
- dashboard, compras y perfil;
- acceso a cursos, progreso y reanudacion de video;
- reseñas sobre cursos comprados.

### Admin

- cursos e instructores;
- combos y promociones comerciales;
- ventas con detalle de orden y reenvio de email;
- galeria y eventos;
- usuarios, reseñas y auditoria.

## Comercio y promociones

El pricing actual tiene dos capas:

- descuento individual por curso;
- combo de carrito.

Reglas vigentes:

- `courses.price` es el precio lista;
- el curso puede tener descuento `percentage` o `fixed`;
- si el descuento deja el curso en `0`, la UI lo marca como `100% OFF` y ese curso no pasa por Wompi;
- los combos pueden ser `threshold_discount` o `buy_x_get_y`;
- los combos compiten entre si para evitar doble aplicacion sobre el mismo curso;
- el carrito calcula y muestra subtotal lista, descuentos por curso, combos y total final;
- al cerrar la orden se guardan snapshots completos en `orders`, `order_items` y `order_discount_lines`.

Convivencia actual:

- primero se aplica el descuento individual del curso;
- luego el combo se calcula sobre el precio ya rebajado;
- un curso no puede recibir mas de un combo;
- si el total final queda en `0`, la compra se resuelve internamente y no va a Wompi.

Migracion clave del estado actual:

- `supabase/migrations/20260310200000_add_course_promotions_and_pricing_snapshots.sql`

## Flujo de pagos

- si el total del carrito es mayor a `0`, se crea orden `pending` y se redirige a Wompi Checkout Web;
- si el total es `0`, la orden se aprueba internamente con `payment_method = "promo"` y se aplica la matricula sin pasar por Wompi;
- la pagina de retorno consulta por `reference` y `transactionId`;
- el webhook Wompi valida firma, monto, moneda y transiciones;
- hay cron de conciliacion de pagos pendientes cada 2 minutos.

## Requisitos de entorno

Variables obligatorias actualmente consumidas por la app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_WOMPI_PUBLIC_KEY`
- `WOMPI_PRIVATE_KEY`
- `WOMPI_EVENTS_SECRET`
- `WOMPI_INTEGRITY_KEY`
- `BUNNY_API_KEY`
- `BUNNY_LIBRARY_ID`
- `BUNNY_CDN_HOSTNAME`
- `BUNNY_TOKEN_AUTH_KEY`
- `BUNNY_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `NEXT_PUBLIC_APP_URL`
- `WHATSAPP_NUMBER`
- `CRON_SECRET`

Opcionales:

- `WOMPI_API_BASE_URL`
- `WOMPI_CHECKOUT_URL`
- `VERCEL_AUTOMATION_BYPASS_SECRET` o `VERCEL_PROTECTION_BYPASS_SECRET`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

## Desarrollo local

1. Instala dependencias:

```bash
npm install
```

2. Configura las variables de entorno requeridas.

3. Asegura la base al dia con las migraciones del directorio `supabase/migrations`.

4. Levanta la app:

```bash
npm run dev
```

## Scripts principales

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test:e2e
npm run test:wompi
npm run test:bunny
npm run qa:seed
npm run qa:reset
```

Atajos utiles:

- `npm run test:wompi:checkout`
- `npm run test:wompi:sandbox`
- `npm run test:wompi:capabilities`
- `npm run test:e2e:headed`
- `npm run test:e2e:ui`

## Jobs programados

Configurados en `vercel.json`:

- `/api/jobs/payments/reconcile` cada 2 minutos;
- `/api/jobs/email/outbox` cada 5 minutos;
- `/api/jobs/bunny/reconcile` cada 1 minuto.

## Estructura funcional

- `src/app`: rutas publicas, auth, dashboard, admin y APIs.
- `src/actions`: server actions de negocio.
- `src/lib`: integraciones, pricing, pagos, carrito, progreso y auth.
- `src/components`: UI publica, dashboard y admin.
- `src/emails`: plantillas transaccionales.
- `supabase/migrations`: modelo y cambios de DB.
- `e2e`: cobertura Playwright y utilidades QA.

## Notas operativas

- La rama `dev` no despliega automaticamente en Vercel; eso esta controlado en `vercel.json`.
- La orden historica nunca se recomputa desde reglas actuales: se lee desde snapshots.
- Los correos de compra salen desde `order_email_outbox`, no directamente desde el webhook.
- Los cursos gratuitos por promocion y los cursos nativamente gratis comparten acceso inmediato, pero no son el mismo caso comercial.
