# Auditoria Wompi y pruebas E2E

Fecha: 2026-03-09

## Objetivo

Dejar auditada la integracion con Wompi contra la documentacion oficial de Colombia, automatizar las pruebas que se pueden ejecutar de forma veridica en sandbox y documentar las limitaciones reales del comercio sandbox actual.

## Fuentes oficiales consultadas

- Inicio rapido: <https://docs.wompi.co/docs/colombia/inicio-rapido/>
- Checkout Web / Widget & Checkout Web: <https://docs.wompi.co/docs/colombia/checkout-web/>
- Tokens de aceptacion: <https://docs.wompi.co/docs/colombia/tokens-de-aceptacion/>
- Firma de integridad: <https://docs.wompi.co/docs/colombia/firma-de-integridad/>
- Validacion de eventos: <https://docs.wompi.co/docs/colombia/validacion-de-eventos/>
- Seguimiento de transacciones: <https://docs.wompi.co/docs/colombia/seguimiento-a-transacciones/>
- Datos de prueba en sandbox: <https://docs.wompi.co/docs/colombia/datos-de-prueba-en-sandbox/>

## Resumen ejecutivo

- La integracion productiva de Studio Z Academy usa Checkout Web hospedado por Wompi, webhook firmado, pagina de retorno con reconsulta y reconciliacion periodica.
- El cumplimiento funcional con la documentacion oficial es alto en los puntos criticos: URL de checkout, firma de integridad, validacion de webhook, conciliacion por estado, proteccion contra duplicados y seguimiento operativo de pagos demorados.
- Se corrigio la brecha de trazabilidad del retorno: ahora, si Wompi devuelve `id`, ese `transactionId` se usa y se persiste en la orden cuando coincide con referencia, monto y moneda.
- Se confirmo con evidencia real de DB que el email del pagador en Wompi no siempre coincide con el email interno de la cuenta. Eso no se debe tratar como error; el sistema ya separa ambos conceptos.
- Se automatizaron de forma deterministica los metodos que el sandbox actual del comercio resuelve con estado final: `CARD`, `NEQUI` y `PSE`.
- Se dejo `PCOL` como `capability probe` porque el comercio sandbox actual no tiene identidad de pago habilitada.
- `BANCOLOMBIA_QR` se mantiene documentado como comportamiento observado del sandbox, pero queda fuera del gating de la suite por decision operativa.

## Estado de cumplimiento

| Area | Requisito oficial | Estado | Evidencia |
| --- | --- | --- | --- |
| Checkout Web | Construir URL con `public-key`, `currency`, `amount-in-cents`, `reference`, `redirect-url` y `signature:integrity` | Cumple | `src/lib/wompi.ts`, `src/actions/checkout.ts`, `e2e/wompi-checkout-web.spec.ts` |
| Datos de cliente en checkout | Soportar `customer-data:*` cuando aplique | Cumple | Se envian `email`, `full-name` y telefono parseado desde `src/actions/checkout.ts` |
| Integridad | Firma SHA-256 usando `reference + amount + currency + integrity key` | Cumple | `src/lib/wompi.ts`, validado por `e2e/wompi-checkout-web.spec.ts` |
| Retorno | Permitir retorno al comercio y consultar estado real de la transaccion | Cumple | `src/app/(public)/pago/retorno/page.tsx`, `src/components/payment/PaymentReturnView.tsx`, `src/actions/payments.ts` |
| Seguimiento por `transactionId` | Usar el identificador de la transaccion cuando este disponible | Cumple con caveat | `src/actions/payments.ts` y `src/app/(public)/pago/retorno/page.tsx`; se mantiene fallback por referencia para ordenes sin `transactionId` persistido |
| Validacion de eventos | Verificar checksum con `properties + timestamp + events secret` | Cumple | `src/lib/wompi.ts`, `src/app/api/webhooks/wompi/route.ts` |
| Webhook seguro | No aplicar eventos con firma invalida, mismatch de monto o mismatch de moneda | Cumple | `src/app/api/webhooks/wompi/route.ts` |
| Idempotencia | No duplicar aplicacion de eventos | Cumple | `payment_events.payload_hash` en `src/app/api/webhooks/wompi/route.ts` |
| Conciliacion de estados | Mapear estados Wompi a estados internos validos y rechazar transiciones invalidas | Cumple | `src/lib/payments.ts`, `src/actions/payments.ts`, webhook route |
| Pagos demorados | Reconsultar si PSE o Nequi tardan en confirmar | Cumple | Retorno reconsulta a los `30s`, UI refresca cada `5s`, cron reconcilia cada `2 min` |
| Trazabilidad de pagador | No asumir que pagador y alumno son la misma persona | Cumple | `orders.customer_email_snapshot` conserva email de la cuenta; el email pagador se lee desde `payment_events.payload_json` y se muestra en admin |
| Debugger operativo | Poder revisar el estado absoluto cuando haya duda operacional | Parcial, por naturaleza operativa | Documentado como procedimiento manual de backoffice; no existe API publica automatizable para esto |
| Bancolombia QR sandbox | Automatizar resultado final estable | Observado, pero fuera de gating | La transaccion puede quedar `PENDING`; se documenta, pero no bloquea la aprobacion |
| PCOL sandbox | Automatizar resultado final estable | No habilitado en este comercio | Capability probe ejecutado: Wompi devuelve `No hay una identidad de pago...` |

## Cambios realizados

### 1. Checkout Web y trazabilidad

- Se agregaron `customer-data:email`, `customer-data:full-name` y telefono al checkout generado por `src/lib/wompi.ts`.
- Se mejoro `src/actions/checkout.ts` para registrar mejor contexto operativo del checkout y enviar metadata util a Wompi.
- Se fijo la continuidad del retorno para ambientes protegidos por Vercel usando bypass controlado.

### 2. Retorno y seguimiento de transacciones

- `src/app/(public)/pago/retorno/page.tsx` ahora acepta tanto `reference` como `id`.
- `src/actions/payments.ts` ahora:
  - consulta por `transactionId` cuando esta disponible,
  - persiste el `transactionId` en la orden si valida contra referencia, monto y moneda,
  - mantiene fallback por referencia cuando aun no hay `transactionId`,
  - reconsulta a Wompi luego de `30s` para metodos lentos.

### 3. Webhook y reconciliacion

- `src/app/api/webhooks/wompi/route.ts` valida:
  - firma,
  - referencia existente,
  - monto,
  - moneda,
  - transicion de estado.
- Eventos invalidos o no aplicables se persisten como evidencia en `payment_events`.
- `src/actions/payments.ts` conserva una reconciliacion secundaria para ordenes `pending`.

### 4. Pagos lentos y watcher

- La UI de retorno refresca cada `5s` mientras la orden sigue `pending`.
- El fallback server-side reconsulta a Wompi luego de `30s`.
- `vercel.json` ejecuta reconciliacion de pagos cada `2 min`.
- `src/app/api/jobs/payments/reconcile/route.ts` protege el job con `CRON_SECRET`.

### 5. Diferencia entre email de cuenta y email pagador

- El email de la cuenta se conserva en `orders.customer_email_snapshot`.
- El email real del pagador Wompi se expone desde `payment_events.payload_json.data.transaction.customer_email`.
- `src/components/admin/OrderDetailModal.tsx` ya muestra ambos valores por separado.
- Esto corrige la brecha de trazabilidad sin imponer la falsa regla de que quien paga debe ser el mismo usuario matriculado.

## Evidencia real en DB

### Compra sandbox manual aprobada

Referencia: `SZ-MMIFLXZT-RWDPLF`

Resultado observado:

- `orders.status = approved`
- `orders.payment_method = CARD`
- `orders.wompi_transaction_id = 12035049-1773015477-75815`
- `orders.customer_email_snapshot = juandcardenasji@gmail.com`
- `payment_events.last.payload_json.data.transaction.customer_email = juan.cardenas@dautia.com`

Interpretacion:

- La compra fue aprobada correctamente.
- El pagador Wompi uso un email diferente al email interno de la cuenta.
- La implementacion debe conservar ambos valores, no sobreescribir uno con el otro.

### Escenarios automatizados aprobados

Ejemplos confirmados en DB:

- `QA-WOMPI-CARD-APPROVED-MMIHRAJV`
- `QA-WOMPI-NEQUI-APPROVED-MMIHUGGZ`
- `QA-WOMPI-PSE-APPROVED-MMIHXJ2K`

Para todos ellos se confirmo:

- orden con estado final correcto,
- `payment_events` aplicado desde `webhook`,
- `wompi_transaction_id` persistido,
- `enrollments` creado cuando el estado fue `approved`,
- `order_email_outbox` creado cuando el estado fue `approved`,
- carrito limpiado en compras aprobadas.

### Escenarios automatizados rechazados o error

Ejemplos confirmados en DB:

- `QA-WOMPI-CARD-DECLINED-MMIHSJJ4`
- `QA-WOMPI-CARD-ERROR-MMIHTEOQ`
- `QA-WOMPI-NEQUI-DECLINED-MMIHVMUJ`
- `QA-WOMPI-NEQUI-ERROR-MMIHWO99`
- `QA-WOMPI-PSE-DECLINED-MMIHYGEC`

Para todos ellos se confirmo:

- orden en `declined`,
- `payment_events` persistido,
- sin `enrollments`,
- sin email de compra,
- carrito retenido para reintento.

### Capability probes

`BANCOLOMBIA_QR`

- Referencia observada: `QA-WOMPI-BANCOLOMBIA-QR-APPROVED-MMIHO8IJ`
- Resultado: `orders.status = pending`
- `payment_events = 0`
- Conclusión: el sandbox del comercio deja la transaccion viva en `PENDING` sin webhook final dentro de la ventana observada.
- Decisión operativa: queda fuera del gating automatizado. Se conserva como evidencia documental, no como criterio de aprobación.

`PCOL`

- Resultado observado por API sandbox: comercio sin identidad de pago habilitada para PCOL.
- Conclusión: no es una falla de Studio Z Academy; es una restriccion del comercio sandbox actual.

## Suite automatizada

### Comandos

```bash
npm run test:wompi
npm run test:wompi:checkout
npm run test:wompi:sandbox
npm run test:wompi:capabilities
```

### Resultado ejecutado

Corrida validada antes de sacar `BANCOLOMBIA_QR` del gating:

```text
npm run test:wompi
11 passed (8.9m)
```

Desglose:

- `e2e/wompi-checkout-web.spec.ts`
  - valida la URL de Checkout Web y la orden `pending`
- `e2e/wompi-sandbox.spec.ts`
  - corre `CARD`, `NEQUI` y `PSE` en estados `approved`, `declined` y `error/declined` segun corresponda
- `e2e/wompi-capabilities.spec.ts`
  - deja evidencia controlada de `PCOL`
  - `BANCOLOMBIA_QR` queda documentado fuera del gating

### Nota sobre PSE en checkout manual

En el Checkout Web sandbox de Wompi, la UI de PSE expone tres bancos de prueba:

- `Banco que aprueba`
- `Banco que declina`
- `Banco que simula un error`

En la automatizacion por API quedaron validados los escenarios equivalentes a aprobacion y rechazo. La opcion visual de `error` queda documentada como comportamiento del checkout sandbox y se puede usar en QA manual cuando se requiera confirmar el flujo visual de error desde la pasarela.

## Modo Debugger de Wompi

Cuando exista incertidumbre operacional sobre el estado de una transaccion, usar el Debugger del panel de Wompi como fuente de contraste manual junto con:

- `transactionId`
- `reference`
- estado de `orders`
- ultima fila de `payment_events`

Uso recomendado:

1. buscar la transaccion por `transactionId` o `reference` en Wompi,
2. contrastar el estado reportado por Wompi con `orders.status`,
3. validar si el webhook llego y fue aplicado,
4. si el metodo fue PSE/Nequi y sigue `PENDING`, esperar el watcher de retorno o el cron de reconciliacion.

Nota:

- El Debugger es una capacidad operativa del dashboard, no una API publica versionada para automatizacion. Por eso queda documentado como procedimiento manual, no como prueba automatizada.

## Conclusiones

- La integracion actual cumple con los requisitos tecnicos criticos de Wompi para Checkout Web, integridad, eventos y seguimiento operativo.
- La compra real en sandbox y la suite automatizada confirman que la implementacion procesa correctamente aprobaciones, rechazos, errores y pagos demorados compatibles con el comercio sandbox.
- La principal limitacion restante no esta en el codigo del LMS sino en la capacidad del comercio sandbox para ciertos metodos:
  - `BANCOLOMBIA_QR` no converge automaticamente en la ventana observada y no se usa como criterio de bloqueo,
  - `PCOL` no esta habilitado.
- Para salida controlada, el monitoreo operativo debe seguir apoyandose en:
  - webhook firmado,
  - pagina de retorno con reconsulta,
  - cron de reconciliacion en Vercel,
  - trazabilidad dual de email de cuenta y email pagador,
  - Debugger de Wompi cuando se requiera certeza absoluta.
