# Estado operativo vigente

**Corte documental:** 2026-08-28.

Este archivo no inventa estado de proveedores. Debe actualizarse despues de un
release o una verificacion externa que identifique revision, ambiente y target.

## Verificado en Git

- `dev` es la rama de integracion y al crear este contrato estaba sincronizada
  con `origin/dev` en `91818fb2d19b7f667e0e5c4c433cd861b639e105`.
- Existen ramas remotas separadas `staging` y `main`.
- Vercel esta enlazado al proyecto `studioz-academy`; `vercel.json` evita el
  deploy automatico de `dev`.
- El repositorio contiene Next.js, Supabase, Wompi, Bunny, Resend y Playwright.

## Pendiente de verificacion externa

- SHA actualmente servido por cada ambiente Vercel y sus dominios.
- Identidad y finalidad del proyecto Supabase enlazado localmente; el archivo
  `supabase/config.toml` no basta para clasificarlo como staging o produccion.
- Estado vigente de Wompi, Bunny, Resend y jobs programados.

Hasta completar ese preflight, ningun agente debe afirmar que un SHA esta
desplegado ni ejecutar pruebas con DB o cambios remotos por inferencia.
