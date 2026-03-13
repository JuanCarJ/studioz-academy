# Casos de prueba QA por vista y flujo de negocio

Fecha de consolidacion: 2026-03-10

Este documento define que debe probar QA en cada vista y en cada flujo de negocio principal de Studio Z Academy. Es la referencia unica de cobertura funcional.

## Alcance

Cubrir:

- sitio publico;
- autenticacion;
- catalogo y detalle de cursos;
- carrito, promociones y checkout;
- dashboard del alumno;
- compras, acceso y progreso;
- reseñas;
- operacion admin;
- integraciones de Wompi, Bunny y email;
- guardrails y regresiones criticas.

## 1. Sitio publico

### Home `/`

Validar:

- carga sin errores visibles;
- H1 principal correcto;
- accesos visibles a cursos, servicios o CTA principales;
- header y footer renderizan correctamente;
- en mobile visitante, el tab `Iniciar sesion` permanece visible y el drawer expone `Iniciar sesion` + `Registrarse`;
- el estado autenticado cambia la navegacion respecto a visitante.

### Servicios `/servicios`

Validar:

- render correcto del contenido;
- CTA y enlaces navegables;
- no hay bloques placeholder ni secciones vacias.

### Galeria `/galeria`

Validar:

- render de items de galeria;
- orden visible consistente;
- apertura correcta de lightbox o detalle si aplica;
- las imagenes recientes aparecen primero cuando corresponde.

### Noticias `/noticias`

Validar:

- listado solo de noticias publicadas;
- cada card navega al detalle correcto;
- slug y enlaces funcionales;
- no aparecen borradores.

### Detalle de noticia `/noticias/[slug]`

Validar:

- carga del H1 correcto;
- imagen de portada o galeria visible;
- contenido completo renderizado;
- si hay redireccion por slug antiguo, resuelve bien;
- noticias no publicadas no quedan accesibles publicamente.

### Eventos `/eventos`

Validar:

- listado de eventos publicos;
- render correcto de imagenes multiples si existen;
- eventos futuros y pasados se muestran segun la logica vigente;
- no aparecen items sin imagen cuando el admin no deberia poder dejarlos asi.

### Contacto `/contacto`

Validar:

- formulario visible;
- campos requeridos presentes;
- validaciones basicas de entrada;
- envio exitoso;
- persistencia del mensaje en DB.

### Instructores `/instructores/[slug]`

Validar:

- detalle del instructor carga correctamente;
- avatar visible o fallback si no existe;
- bio, especialidades y experiencia renderizan sin errores;
- enlaces desde cursos o player navegan a esta vista correctamente.

## 2. Autenticacion

### Login `/login`

Validar:

- login de alumno exitoso;
- login de admin exitoso;
- redireccion al destino esperado despues de autenticar;
- si el usuario venia de un flujo con `redirect` o `addToCart`, el contexto se conserva;
- errores de credenciales invalidas se muestran bien.

### Registro `/registro`

Validar:

- registro exitoso;
- creacion correcta del perfil;
- continuidad posterior al registro;
- validaciones de campos requeridos.

### Recuperacion de sesion

Validar:

- el alumno sigue autenticado al navegar dashboard, player y carrito tras degradacion de token;
- el admin sigue autenticado al navegar a edicion de instructor o curso tras degradacion de token;
- no hay logout silencioso inesperado durante navegacion normal.

## 3. Catalogo de cursos `/cursos`

Validar:

- listado solo de cursos publicados;
- filtros funcionan y arrojan resultados consistentes;
- cards muestran titulo, instructor, categoria y precio correctos;
- si hay descuento individual, la card muestra badge visible no intrusivo;
- si hay descuento individual, se ve precio lista tachado y precio actual;
- si el curso queda en `100% OFF`, el aviso visible es `100% OFF`;
- cursos gratis/promocionales no prometen Wompi ni precio incorrecto;
- la navegacion al detalle del curso funciona.

## 4. Detalle de curso `/cursos/[slug]`

Validar:

- informacion del curso renderiza completa;
- instructor visible y navegable;
- preview publica funciona si aplica;
- lecciones gratis se distinguen de pagas;
- precio lista y precio actual se muestran correctamente;
- badge de promo correcto: `% OFF`, ahorro fijo o `100% OFF`;
- microcopy comercial no induce a error sobre combos o gratuidad;
- CTA correcto segun estado del curso y del usuario.

### CTA segun escenario

Validar:

- visitante en curso pago ve `Agregar al carrito` o CTA equivalente;
- visitante en curso gratis/promo `100% OFF` ve flujo gratuito;
- alumno ya inscrito ve `Continuar`, `Comenzar` o equivalente;
- curso gratis nativo no intenta pasar por carrito;
- curso promocional `100% OFF` no intenta pasar por Wompi.

## 5. Carrito `/carrito`

Validar:

- se agregan cursos pagos disponibles;
- no se agregan cursos gratis o con precio efectivo `0`;
- no se duplican items;
- el carrito conserva el contexto luego de login;
- si un curso cambia de estado a gratis o a precio `0`, el carrito lo purga;
- si un precio cambia desde admin, el carrito refleja el precio nuevo.

### Calculo visual del carrito

Validar:

- cada item muestra precio lista;
- cada item muestra descuento por curso si aplica;
- cada item muestra descuento de combo si aplica;
- cada item muestra precio final;
- el resumen muestra subtotal lista;
- el resumen muestra descuentos por curso;
- el resumen muestra combos aplicados;
- el resumen muestra total descuento;
- el resumen muestra total a pagar;
- el bloque de explicacion del calculo es claro y consistente con los montos.

## 6. Promociones y combos

### Descuento individual por curso

Validar:

- porcentaje entre `1` y `100`;
- monto fijo mayor a `0` y no mayor al precio lista;
- si el curso es `is_free`, la promo se desactiva o limpia;
- el curso con promo muestra badge y precio correcto en catalogo y detalle;
- si la promo deja el curso en `0`, el curso se trata como `100% OFF`.

### Combo `threshold_discount`

Validar:

- requiere minimo 2 cursos;
- aplica solo a cursos elegibles segun categoria o regla global;
- calcula el descuento sobre el precio ya rebajado por promo individual;
- no toma cursos gratis ni items con precio efectivo `0`;
- el monto final coincide entre carrito y checkout.

### Combo `buy_x_get_y`

Validar:

- respeta `buy_quantity` y `free_quantity`;
- el curso gratis asignado coincide con la logica vigente del carrito;
- el descuento queda visible por item;
- si se elimina un curso, el combo se recalcula inmediatamente;
- si el total queda en `0`, el flujo termina interno sin Wompi.

### Convivencia promo de curso + combo

Validar:

- primero baja el descuento individual del curso;
- luego se calcula el combo;
- un mismo curso no recibe mas de un combo;
- si hay empate entre combos, se selecciona el escenario correcto;
- el detalle de descuento en UI coincide con el snapshot guardado.

## 7. Checkout y pagos

### Checkout con total mayor a cero

Validar:

- crea orden `pending`;
- redirige a Wompi Checkout Web;
- URL de checkout contiene parametros correctos;
- firma de integridad correcta;
- nombre, email y telefono se envian cuando aplique;
- el total enviado a Wompi coincide con el total del carrito.

### Checkout con total cero

Validar:

- no redirige a Wompi;
- crea orden `approved` interna;
- `payment_method` queda en `promo`;
- aplica matriculas;
- redirige a compras/dashboard;
- encola email de compra.

### Retorno y conciliacion

Validar:

- la pagina de retorno resuelve por `reference`;
- usa `transactionId` cuando esta disponible;
- refleja estados `pending`, `approved` y `declined`;
- pagos lentos se reconcilian;
- no se duplica aplicacion de eventos.

## 8. Compras del alumno `/dashboard/compras`

Validar:

- lista de compras visible;
- cada compra muestra referencia, fecha, estado y total;
- el detalle muestra subtotal lista, descuentos y total;
- ordenes con promo `100% OFF` aparecen como compra valida;
- ordenes historicas conservan snapshot aunque cambien reglas actuales.

## 9. Dashboard del alumno `/dashboard`

Validar:

- cards de cursos matriculados visibles;
- `Mi Aprendizaje` y `Mis Compras` aparecen en header para autenticados;
- progreso por curso correcto;
- CTA `Continuar` o equivalente apunta a la leccion correcta;
- perfil editable y persistente.

## 10. Player del curso `/dashboard/cursos/[slug]`

Validar:

- acceso solo para alumnos inscritos;
- preview gratuita y acceso pago respetan reglas del curso;
- reanudacion del video desde `video_position`;
- `last_lesson_id` inconsistente no rompe la experiencia;
- marcar leccion completa/incompleta actualiza progreso;
- CTA contextual de siguiente leccion aparece y desaparece correctamente;
- si `bunny_video_id` es invalido o la media no esta lista, aparece fallback claro y nunca un iframe roto;
- en mobile, el panel de lecciones no emite warnings de accesibilidad y sigue cerrando correctamente al cambiar de leccion;
- en cursos de una sola leccion, el estado final se refleja correctamente.

## 11. Reseñas

### En pagina publica del curso

Validar:

- seccion de reseñas visible cuando aplica;
- solo se muestran reseñas visibles/publicadas;
- el agregado de rating y cantidad es consistente.

### Desde dashboard player

Validar:

- en mobile, el bloque de reseñas inicia colapsado y se puede expandir sin afectar el player;
- usuario con compra puede crear reseña;
- puede actualizarla;
- puede eliminarla;
- los cambios persisten en DB;
- la reseña aparece o desaparece en la pagina publica segun corresponda.

## 12. Admin dashboard `/admin`

Validar:

- acceso restringido a admin;
- metricas y accesos principales visibles;
- navegacion interna estable;
- no hay perdida de sesion al entrar a pantallas profundas.

## 13. Admin de cursos

### Listado `/admin/cursos`

Validar:

- lista carga correctamente;
- navegacion a editar funciona;
- cursos publicados y no publicados se distinguen.

### Crear curso `/admin/cursos/nuevo`

Validar:

- creacion exitosa;
- slug generado;
- validaciones obligatorias;
- precio requerido para curso pago;
- instructor requerido;
- thumbnail opcional funciona;
- configuracion de promo individual valida.

### Editar curso `/admin/cursos/[id]/editar`

Validar:

- edicion de datos base;
- cambio de precio;
- cambio de estado publicado/no publicado;
- cambio de gratis/pago;
- configuracion de promo individual;
- preview monetario correcto;
- si el curso pasa a gratis, la promo individual se limpia;
- si un curso en carrito pasa a gratis, el carrito del usuario se corrige;
- si cambia el precio, carrito y checkout reflejan el nuevo monto.

## 14. Admin de combos `/admin/combos`

Validar:

- crear combo `threshold_discount`;
- crear combo `buy_x_get_y`;
- editar combo;
- desactivar combo;
- eliminar combo;
- categoria especifica y global funcionan;
- el form bloquea configuraciones invalidas;
- no permite combos debajo del minimo requerido;
- copy de error claro;
- preview textual de la regla correcto;
- auditoria registra create/update/delete.

## 15. Admin de ventas `/admin/ventas`

Validar:

- listado de ordenes correcto;
- filtros operan correctamente;
- detalle de orden abre sin errores;
- el modal o vista de detalle muestra:
  - subtotal lista;
  - descuento por curso;
  - descuento por combo;
  - total;
  - lineas de descuento;
  - email de cuenta;
  - email pagador cuando aplique;
- reenvio de email funciona;
- renombrar o borrar un combo no rompe el historial de una orden vieja.

## 16. Admin de usuarios `/admin/usuarios`

Validar:

- listado de usuarios;
- acceso a detalle;
- visualizacion consistente de compras, cursos o tabs del usuario;
- no hay recursion o errores de permisos.

## 17. Admin de instructores

Validar:

- crear instructor con avatar;
- editar instructor;
- tabla muestra avatar o fallback;
- link a editar funciona;
- un ID inexistente redirige o maneja el error correctamente;
- el instructor creado aparece en curso y player donde corresponda.

## 18. Admin editorial

### Noticias

Validar:

- crear noticia;
- editar noticia;
- publicar noticia;
- galeria de multiples imagenes;
- no permite dejar noticia publicada sin galeria cuando aplique;
- reflejo en sitio publico;
- slug redirects funcionales;
- auditoria registrada.

### Galeria

Validar:

- crear item de galeria;
- orden correcto de items;
- imagen visible en sitio publico;
- validaciones de carga de imagen.

### Eventos

Validar:

- crear evento;
- cargar varias imagenes;
- publicacion inmediata;
- no permite evento publicado sin imagenes requeridas;
- reflejo correcto en el sitio publico.

## 19. Emails transaccionales

Validar:

- orden aprobada normal genera outbox;
- orden `promo` o `100% OFF` genera outbox;
- email muestra items correctos;
- email muestra subtotal lista, descuentos y total;
- email usa snapshot historico y no recalculo vivo;
- el reenvio desde admin funciona.

## 20. Integracion Wompi

Validar:

- checkout web simple;
- checkout web con combo;
- tarjeta aprobada;
- tarjeta rechazada;
- tarjeta error;
- Nequi aprobado;
- Nequi rechazado;
- Nequi error;
- PSE aprobado;
- PSE rechazado;
- `PCOL` documentado como no habilitado si sigue igual en sandbox;
- `BANCOLOMBIA_QR` solo como observacion controlada, no gating;
- webhook firmado;
- conciliacion de pagos pendientes;
- carrito se limpia en compra aprobada;
- carrito se conserva en compra rechazada.

## 21. Integracion Bunny

Validar:

- upload real de preview de curso;
- reemplazo de preview manteniendo el activo hasta promocion;
- upload real de leccion;
- reemplazo de video de leccion manteniendo continuidad;
- borrado de curso limpia activos asociados;
- estados `processing`, `ready` y error visibles cuando corresponde;
- reconciliacion cron de Bunny funcional.

## 22. Casos manuales obligatorios de observacion

Validar manualmente cuando el release toque estos frentes:

- correo real recibido para compra normal;
- correo real recibido para compra `promo`;
- desglose visual de una orden con promo por curso y combo al mismo tiempo;
- detalle de una orden historica despues de cambiar la configuracion comercial actual;
- flujo visual de error PSE en la pasarela cuando se necesite revisar UX;
- comportamiento de `BANCOLOMBIA_QR` si se requiere evidencia del sandbox;
- cualquier cambio de media Bunny en ambiente real si hubo cambios de upload/reemplazo.

## 23. Criterio minimo de cierre QA

Para marcar una entrega como validada, QA debe cubrir al menos:

- vistas publicas afectadas;
- flujo de autenticacion afectado;
- catalogo, detalle, carrito y checkout si hubo cambios comerciales;
- compras y player si hubo cambios de acceso o progreso;
- admin afectado;
- email/Wompi/Bunny si hubo cambios de integracion;
- observaciones manuales obligatorias cuando aplique.

## Evidencia tecnica de soporte

La automatizacion actual que respalda estos flujos vive en:

- `e2e/public-smoke.spec.ts`
- `e2e/auth-smoke.spec.ts`
- `e2e/business-core.spec.ts`
- `e2e/commercial-guardrails.spec.ts`
- `e2e/promotions-pricing.spec.ts`
- `e2e/discount-logic.spec.ts`
- `e2e/course-progress.spec.ts`
- `e2e/video-resume.spec.ts`
- `e2e/free-preview-flow.spec.ts`
- `e2e/ux-header-reviews.spec.ts`
- `e2e/user-session-recovery.spec.ts`
- `e2e/admin-session-recovery.spec.ts`
- `e2e/editorial-media.spec.ts`
- `e2e/instructor-avatar.spec.ts`
- `e2e/wompi-checkout-web.spec.ts`
- `e2e/wompi-sandbox.spec.ts`
- `e2e/wompi-capabilities.spec.ts`
- `e2e/payment-progress.spec.ts`
- `e2e/bunny-integration.spec.ts`
