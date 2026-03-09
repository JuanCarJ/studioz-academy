# E2E Hallazgos y resolucion

Fecha: 2026-03-09

## Objetivo

Dejar trazado que se encontro durante la validacion E2E del LMS, que se corrigio, que se automatizo y que no debe seguir considerandose evidencia valida sin soporte ejecutable.

## Hallazgos principales

### 1. Sitio publico y editorial

Hallazgo:

- Varias rutas publicas estaban en placeholder o con implementacion insuficiente para una validacion real.

Resolucion:

- Se completaron las paginas publicas principales y su lectura desde DB:
  - home
  - servicios
  - galeria
  - noticias
  - detalle de noticia
  - eventos
  - contacto

Evidencia:

- `e2e/public-smoke.spec.ts`

### 2. Flujos de autenticacion y continuidad

Hallazgo:

- El flujo de continuidad despues de autenticacion no era consistente entre login estandar y proveedores externos.

Resolucion:

- Se corrigio la continuidad de `redirect`, `next` y `addToCart`.
- Se estabilizaron los tests de login user/admin.

Evidencia:

- `e2e/auth-smoke.spec.ts`
- `e2e/business-core.spec.ts`

### 3. Compra, descuentos y acceso

Hallazgo:

- Faltaba comprobar de forma medible que el usuario pudiera:
  - agregar al carrito,
  - conservar contexto post-login,
  - recibir descuentos,
  - acceder al curso comprado,
  - ver progreso real.

Resolucion:

- Se consolidaron pruebas de negocio con contraste en DB para:
  - carrito
  - combos
  - acceso a curso gratis
  - acceso a curso comprado
  - progreso
  - historial de compras

Evidencia:

- `e2e/business-core.spec.ts`
- `e2e/support/db.ts`

### 4. Reseñas

Hallazgo:

- No habia una prueba integral que verificara alta, edicion, reflejo publico y moderacion.

Resolucion:

- Se automatizo el flujo completo de reseñas con verificacion en DB y en la UI publica/admin.

Evidencia:

- `e2e/business-core.spec.ts`

### 5. Operacion admin

Hallazgo:

- Los flujos admin fuertes requerian prueba E2E real, no solo inspeccion visual.

Resolucion:

- Se validaron con contraste de DB:
  - dashboard
  - ficha de usuario
  - ventas
  - detalle de orden
  - reenvio de email
  - combos
  - noticias
  - moderacion de reseñas
  - instructores y cursos

Evidencia:

- `e2e/business-core.spec.ts`

### 6. Wompi

Hallazgo:

- La integracion necesitaba validacion completa contra la documentacion oficial, no solo contra flujos felices.
- Hacia falta distinguir:
  - escenarios deterministas de sandbox,
  - capacidades no disponibles o no estables del comercio sandbox.

Resolucion:

- Se implemento y documento:
  - Checkout Web con parametros y firma correctos
  - webhook firmado
  - retorno con seguimiento por `reference` e `id`
  - conciliacion para pagos lentos
  - separacion entre email de cuenta y email pagador
- Se crearon suites:
  - `e2e/wompi-checkout-web.spec.ts`
  - `e2e/wompi-sandbox.spec.ts`
  - `e2e/wompi-capabilities.spec.ts`
- `BANCOLOMBIA_QR` se documento, pero se saco del gating por decision operativa.

Evidencia:

- `docs/wompi/WOMPI_AUDITORIA_Y_PRUEBAS_2026-03-09.md`

## Correcciones de implementacion relevantes

- `src/actions/checkout.ts`
  - datos de cliente hacia Wompi
  - mejor trazabilidad del checkout
- `src/lib/wompi.ts`
  - firma de integridad
  - seguimiento por `transactionId`
  - enriquecimiento de parametros de checkout
- `src/actions/payments.ts`
  - fallback para pagos lentos
  - conciliacion segura
  - persistencia temprana de `transactionId` cuando el retorno lo trae
- `src/app/api/webhooks/wompi/route.ts`
  - validacion de firma, monto, moneda y transicion
- `src/components/admin/OrderDetailModal.tsx`
  - visibilidad separada de email de cuenta vs email pagador

## Resultados de ejecucion observados

Validaciones ejecutadas durante esta ronda:

- `npm run lint` PASS
- `npm run build` PASS
- `npm run test:wompi` PASS en la corrida validada previa a excluir QR del gating
- `npm run test:e2e`
  - `42 passed`
  - `24 skipped`
  - `1 failed`

Detalle del fallo:

- El unico rojo de la corrida completa fue `Bancolombia QR` en `e2e/wompi-capabilities.spec.ts`.
- Ese caso no representa un bug funcional del LMS; representa un comportamiento no estable del sandbox del comercio.
- Por instruccion operativa, QR dejo de ser criterio de bloqueo y quedo solo documentado.

## Que se considera resuelto

- Navegacion publica
- Auth user/admin
- Carrito y combos
- Cursos gratis y comprados
- Progreso y mi aprendizaje
- Reseñas y moderacion
- Admin ventas y detalle de orden
- Admin editorial
- Instructores y catalogo
- Integracion Wompi en Checkout Web, webhook, retorno y reconciliacion

## Que queda documentado pero fuera de gating

- `BANCOLOMBIA_QR` en sandbox del comercio
- `PCOL` no habilitado para el comercio sandbox
- Opcion visual de `PSE` que simula error, util para QA manual cuando se necesite validar UX de error en pasarela

## Regla final

Ningun modulo se debe volver a marcar como `PASS`, `COMPLETADO` o `E2E validado` si no existe:

- suite versionada o caso manual documentado,
- evidencia reproducible,
- entorno identificado,
- resultado esperado contra resultado real.
