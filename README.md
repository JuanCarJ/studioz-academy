# Studio Z Academy

Plataforma de cursos y sitio público de Studio Z. Next.js App Router, React, Supabase Auth/Postgres/Storage, **Bold**, Bunny Stream y Resend.

## Estado

La implementación en `dev` incluye catálogo, carrito, checkout Bold, acceso/progreso, compras, perfiles, soporte y administración. **No equivale a un ambiente desplegado o una DB migrada.**
Consulta [estado vigente](docs/CURRENT.md) y [resultado de implementación y pruebas](docs/IMPLEMENTACION_AUDITORIA_2026-09-02.md).

- Bold sustituye a Wompi para todas las compras nuevas. Creación y conciliación exigen flags explícitos.
- Wompi solo se conserva para historial y conciliación antigua, desactivada por defecto.
- Cursos gratis nativos dan acceso sin orden; promociones a cero crean orden interna, sin pasarela.
- Primero descuento por curso, después combo; no se aplica más de un combo por curso. Los importes históricos son snapshots.
- Admin archiva cursos sin destruir compras, gestiona mensajes/notas/suspensión/acceso/progreso, modera reseñas y revisa pagos y videos.
- Una devolución registrada por admin documenta un movimiento confirmado por el proveedor; no envía dinero.

## Stack probado

Next 16.3.4 · React 19.2.8 · TypeScript 5 · Tailwind 4 · Supabase SSR 0.12.5/JS 2.114.0 · Resend 6.25.0 · Sharp 0.35.4 · Playwright 1.62.1 · Vitest 4.1.11.

## Desarrollo y QA local sin proveedores

```sh
npm ci
npm run test:local
npm run test:bold
npm run test:sql:syntax
npm run build:local
npm run test:browser:local
```

El harness usa Chrome instalado; puede instalarse el navegador de pruebas en el host antes de correrlo. Los dobles no prueban integración real.

Para revisar las rutas del build con claves ficticias y red de proveedores bloqueada:

```sh
npm run start:local
# En otra terminal:
npm run test:next:local
```

Para trabajar con servicios configurados, `npm run dev`. Variables en [.env.example](.env.example). Nunca conectar una DB local/producción para QA: usar staging verificado y autorizado. No ejecutar `qa:seed`/`qa:reset` por rutina.

## Entrega

`delivery.yaml` define `dev -> staging -> main`. `dev` no despliega automáticamente.
Las migraciones nuevas requieren preflight/autoridad de DB; los archivos SQL no prueban aplicación.
No hay nuevo checkout Wompi. [Auditoría Wompi de marzo](docs/wompi/WOMPI_AUDITORIA_Y_PRUEBAS_2026-03-09.md) es histórica.
