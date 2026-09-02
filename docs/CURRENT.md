# Estado operativo vigente

**Corte documental:** 2026-09-02.

## Candidato de implementación local

Remediación de auditoría y cambio de nuevas compras a Bold, con flags apagados por defecto.
Ver [implementación, pruebas y límites](IMPLEMENTACION_AUDITORIA_2026-09-02.md).
Se validaron código y simulaciones locales; no se desplegó ni migró una DB en esta tarea.
No interpretar el GO histórico de marzo como aceptación de este candidato.

Este archivo no inventa estado de proveedores. Debe actualizarse despues de un
release o una verificacion externa que identifique revision, ambiente y target.

## Verificado en Git

- `dev` es la rama de integracion y contiene el contrato portátil publicado;
  su SHA vigente se verifica en Git y no se fija aqui para evitar ciclos
  documentales sobre una rama mutable.
- Existen ramas remotas separadas `staging` y `main`.
- Vercel esta enlazado al proyecto `studioz-academy`; `vercel.json` evita el
  deploy automatico de `dev`.
- La integracion Git de `staging` fue observada el 2026-08-28: el commit
  documental `9cf7794137d0` completo correctamente el deployment Vercel
  `Fk6sPJUmw9R59SXkU3af1b2ivK6K`. Cada corte posterior se verifica por SHA y
  estado proveedor; este archivo no persigue cada commit documental.
- El repositorio contiene Next.js, Supabase, Bold, Bunny, Resend, Vitest y Playwright; Wompi queda solo para historial/conciliación antigua.

## Pendiente de verificacion externa

- Dominio/routing efectivo de `staging` y `main`; el estado verde del deployment
  no identifica por si solo el dominio de negocio servido.
- Identidad y finalidad del proyecto Supabase enlazado localmente; el archivo
  `supabase/config.toml` no basta para clasificarlo como staging o produccion.
- Estado vigente de Bold, Bunny, Resend y jobs programados; eventual drenaje de órdenes Wompi históricas.

Hasta completar ese preflight, ningun agente debe afirmar que un SHA esta
desplegado ni ejecutar pruebas con DB o cambios remotos por inferencia.
