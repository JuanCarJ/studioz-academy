# Harness local de recorridos

Renderiza los componentes reales de alumno (páginas, tarjetas, PlayerView y VideoPlayer)
y OperationForm con acciones explícitamente simuladas. No usa Next Auth, .env.local,
DB, Bunny, Bold ni otro proveedor. No se incluye en las rutas de la aplicación.

- Servidor: `npx vite --config tests/browser/vite.config.ts` (solo 127.0.0.1:4177).
- Suite aislada: `npx playwright test --config tests/browser/playwright.config.ts`.
- Capturas: `output/playwright/student-{desktop,mobile}-{courses,player,purchase,support}.png`.

Vite rechaza módulos de servidor reales, omite los archivos de entorno y usa CSP
de mismo origen. Playwright bloquea toda petición fuera del puerto local.
El iframe y el puente player.js son dobles; esto NO demuestra playback real,
autenticación, mutaciones SQL, RLS ni comportamiento del proveedor.

Escenarios: `/dashboard?scenario=courses-error`, `courses-empty`;
`/dashboard/cursos/baile?scenario=video-error`, `progress-error`,
`player-completed`, `reset-error`; `/dashboard/compras?scenario=payment-error`;
`/admin/soporte?scenario=admin-error`.

La suite recorre escritorio y móvil, comprueba errores accesibles con axe y guarda
una muestra visual por superficie. Los datos son ficticios e independientes por carga.
