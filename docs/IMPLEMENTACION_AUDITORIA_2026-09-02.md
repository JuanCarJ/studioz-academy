# Implementación de auditoría — Studio Z Academy

Corte: 2026-09-02. Baseline: `2050a7f73c390c615e491f61a195b6c20e1d6d93`, rama `dev`.
Decisión del usuario: corregir los hallazgos en código, probar localmente con simulaciones y sustituir Wompi por Bold.
No se autorizó deploy, migración remota, cobro ni modificación de proveedores.

## Resultado y límites

Implementación local de seguridad, comercio, video, estudiante, soporte/admin y copy.
El nuevo checkout es exclusivamente Bold. Las columnas y consultas Wompi antiguas se conservan para no falsificar historial; su conciliación está apagada por defecto.
El resultado es un candidato de código, **no un GO de producción**.

No existe una DB de staging identificada/autorizada para esta tarea. El wrapper rechazó crear una migración al no encontrar identidad inequívoca de Supabase. Los archivos SQL son candidatos locales; no se aplicó ninguna migración ni se abrió una DB local. Sintaxis SQL y cuerpos PL/pgSQL se analizan sin servidor, pero eso no demuestra permisos, índices efectivos ni interleavings reales.

## Cambios trazables y aceptación

| Frontera | Implementación | Comprobación local / pendiente |
|---|---|---|
| Permisos y abuso | Privilegios por columna en perfiles; órdenes/matrículas solo mediante escritores controlados; rate limits compartidos atómicos, HMAC sin IP/correo almacenado y fail-closed | Tests de autorización, límites y contratos SQL; RLS efectiva pendiente |
| Cuentas | Recuperación durable de eliminación Auth con lease/CAS y bandeja administrativa; suspensión temporal, anonimización con actor activo y restricciones Storage; normalización de avatar con decodificación real; URLs de retorno seguras | Tests de avatar/redirect/SQL; proveedor Auth real pendiente |
| Checkout | RPC transaccional para orden, items y descuentos; clave idempotente, referencia criptográfica y precio histórico; revalida antes de reutilizar y firmar; total cero interno | Dobles de Supabase; fallo/duplicado/pending/importe y dueño |
| Bold | Botón hospedado, SHA-256 de referencia+importe exacto COP+moneda+secreto; HMAC sobre cuerpo original codificado base64; inbox durable y consulta voucher | Firmas válidas/alteradas, estados desconocidos, montos, límites, timeout; cuenta Bold no activada |
| Acceso y pagos | Aplicación atómica de estado+matrículas+carrito+outbox; duplicados no revierten soporte; suspensión conserva derecho sin permitir usarlo | Revisión de orden de locks y contratos; concurrencia real pendiente |
| Reembolsos | Admin registra reembolso/contracargo **ya confirmado externamente**, con evidencia; recalcula derechos de otras compras | No inicia devolución monetaria; pruebas de permisos y validación |
| Jobs y correos | Lease compartido, lotes limitados, SKIP LOCKED, versiones y tokens CAS, reintentos acotados, idempotency keys y logs sin PII | Dobles de Resend y Supabase; entrega real no demostrada |
| Video | Autorización antes de Bunny; estado CAS, no sobrescribir carga nueva; límites y timeouts; consulta manual admin | Dobles Bunny y PlayerJS; reproducción/token reales pendientes |
| Estudiante | Continuar última lección, novedades, activos/completados, paginación; errores recuperables, carga y respuestas obsoletas; reinicio confirmado | Componentes reales en navegador con acciones/iframe simulados |
| Progreso | Un RPC por guardado de posición/completitud y agregado; mismo bloqueo con reset; cálculo actual tras añadir lecciones | Tests y contratos SQL; sin fanout de todos los alumnos al editar temario |
| Catálogo | Búsqueda y filtros paginados por SQL; índices trigram; orden estable; estado de compra solo para página actual | Tests de normalización/escape/límites/fail-closed; EXPLAIN pendiente |
| Administración | Archivo/restauración de cursos sin destruir compras, bandeja de contacto, soporte con notas, suspensión, acceso y reset; revisión/moderación paginada y auditada | Operaciones+audit en transacción para nuevas acciones y moderación |
| Operación | Indicadores con periodo explícito Colombia, colas que requieren atención; errores no aparecen como métricas cero | Tests de summary/fechas/errores; no son métricas observadas de un ambiente |
| Comunicación | Contacto persistido con rate limit; avisos de cursos/lecciones con confirmación, consentimiento y audiencia por lotes | No se enviaron correos; bajas/anonimización eliminan destinos pendientes |
| UI/copy | Español, estados comprensibles, proveedor correcto, sin prometer métodos de pago habilitados; contraste de controles y errores visibles | Muestra visual escritorio/móvil + axe; no auditoría visual exhaustiva de todas las páginas |
| Framework | Next 16.3.4, React 19.2.8, Supabase SSR 0.12.5/JS 2.114.0, Resend 6.25.0, Sharp 0.35.4 y herramientas actualizadas | Compilación, lint, tipos y npm audit; ESLint 10 se difiere por incompatibilidad con plugins Next/React |

## Migraciones nuevas, en orden

- `20260902000100_audit_security_data.sql`: permisos, RLS, límites e integridad.
- `20260902000150_entitlement_blocks.sql`: suspensión y revocaciones durables.
- `20260902000200_atomic_payments_bold.sql`: pagos neutrales/Bold, deduplicación, leases y outbox.
- `20260902000300_student_progress.sql`: progreso atómico y lectura paginada.
- `20260902000400_bunny_cleanup_queue.sql`: cola de limpieza diferida.
- `20260902000500_admin_operations.sql`: archivo, soporte, resumen e índices.
- `20260902000600_public_catalog_pagination.sql`: catálogo y búsqueda.
- `20260902000700_course_notification_outbox.sql`: anuncios y consentimiento.
- `20260902000800_admin_reviews_audit.sql`: moderación/historial paginados.
- `20260902000900_account_status_privileged_paths.sql`: RPC y Storage sin bypass de suspensión.
- `20260902001000_account_auth_cleanup.sql`: recuperación durable de eliminación Auth.

Las funciones que aceptan IDs de actor arbitrarios se restringen a service_role; los Server Actions validan actor y los escritores críticos vuelven a comprobarlo. No usar el cliente de servicio en navegador.

## Verificación reproducible sin DB

### Resultado ejecutado — macOS, 2026-09-02

- `npm run test:local`: 323 pruebas / 31 archivos aprobados; TypeScript y ESLint aprobados.
- `npm run test:bold`: 58 pruebas aprobadas (subconjunto del total).
- `npm run test:browser:local`: 8/8 aprobados, escritorio 1440 px y móvil 390 px; axe WCAG 2/2.1 AA sin infracciones en los estados analizados.
- `npm run build:local`: compilación Next 16.3.4 aprobada, 49 rutas generadas.
- `npm run test:next:local`: smoke de las 4 rutas y controles HTTP/CSP/CSRF descritos abajo aprobado.
- `npm run test:sql:syntax`: 38 migraciones, 689 sentencias y 66 cuerpos de función analizados; no ejecución SQL.
- `npm audit` completo y de producción: 0 vulnerabilidades reportadas.
- `git diff --check`: aprobado.
- Revisión visual de login compilado y muestras de estudiante/soporte; capturas ficticias, no UI conectada.

La revisión cruzada de checkout invalidado, worker antiguo, orden de locks, firma Wompi alterada y suspensión temporal quedó cerrada con 35 pruebas focales (subconjunto) y revisión de código. No demuestra ausencia de carreras en PostgreSQL real.

```sh
npm ci
npm run test:local
npm run test:bold
npm run test:sql:syntax
npm run build:local
npm run test:browser:local
# Otra terminal, solo loopback:
npm run start:local
npm run test:next:local
npm audit
git diff --check
```

- Vitest: transporte bloqueado por defecto; cada caso declara sus dobles.
- Build: claves ficticias y bloqueo de red a proveedores, excepto descarga de fuentes públicas de Google.
- Harness: páginas/componentes reales, acciones simuladas, iframe local y bloqueo de cualquier origen no loopback. No introduce una puerta de acceso en la aplicación.
- Next smoke: servidor compilado real, CSP/nonce e hidratación, login/registro/contacto/retorno incompleto, redirección protegida, inicialización CSRF, jobs sin credencial y webhook Bold deshabilitado.
- Capturas locales ignoradas por Git: `output/playwright/`. No contienen datos reales.
- Suites Wompi históricas se excluyen de la suite activa; permanecen para consulta. Las suites staging antiguas NO son evidencia de este candidato.
- Helpers E2E/seed/reset rechazan DB sin `APP_ENVIRONMENT=staging`, autorización explícita de fixtures y ref exacta previamente verificada. Es una barrera de configuración, no una prueba de identidad del proveedor.

## Activación futura de Bold

1. Identificar staging real, respaldos, historia de migraciones y alcance autorizado. Aplicar SQL en orden y regenerar tipos desde esa DB; ejecutar pruebas RLS/concurrencia/EXPLAIN con fixtures aislados.
2. Configurar `BOLD_IDENTITY_KEY`, `BOLD_SECRET_KEY`, `BOLD_ENVIRONMENT=sandbox`, URL HTTPS y webhook `/api/webhooks/bold`. No copiar secretos a Git.
3. Activar primero `BOLD_SETTLEMENT_ENABLED` tras validar firma/ambiente y después `BOLD_CHECKOUT_ENABLED`; probar una compra autorizada y su repetición/retorno. La configuración de clave vacía sandbox es excepcional, explícita y está prohibida en producción.
4. Validar Bunny/Resend y cron, incluido remitente y dominio, sin confundir entrega mock con entrega real.
5. Promover únicamente SHA probado por `dev -> staging -> main`, con autorización para cada destino.

La consulta Bold tiene una ventana limitada: referencias con más de 23 horas no ofrecen repetir el pago a ciegas. Soporte debe comprobar el movimiento antes de resolver el caso.

Rollback: desactivar creación Bold mantiene la posibilidad de conciliar pagos ya iniciados. No convertir órdenes históricas ni borrar columnas nuevas. Rollback de app debe considerar que los permisos DB anteriores ya no permiten escrituras directas; requiere candidato compatible o corrección hacia adelante.

## Residuales explícitos

- DB real, RLS, constraints sobre datos existentes, query plans, tiempos/carga y concurrencia necesitan staging. No hay cifra de capacidad prometida.
- Player V2 es opt-in; no se fuerza sin comprobar configuración/token de la biblioteca. PlayerJS queda fijado.
- Limpieza Bunny queda **diferida y visible**, sin borrados automáticos irreversibles.
- Reembolsos monetarios se realizan en el proveedor: el botón admin registra evidencia, no devuelve dinero.
- Auditoría de nuevas operaciones y moderación es atómica. CRUD editorial/combos histórico conserva escritura y log separados; un fallo del log ahora se reporta, pero no se afirma atomicidad.
- ESLint 9.39.5 compatible permanece temporalmente: versión 10 rompió plugins upstream. Override de brace-expansion corrige la dependencia vulnerable; no se ocultaron avisos con force.
- Documentos de marzo y pruebas Wompi anteriores son evidencia histórica, no estado operativo actual.

Referencias de contrato consultadas: [Bold: botón personalizado](https://developers.bold.co/pagos-en-linea/boton-de-pagos/integracion-manual/integracion-personalizada), [webhooks](https://developers.bold.co/webhook), [consulta de transacciones](https://developers.bold.co/pagos-en-linea/consulta-de-transacciones).
