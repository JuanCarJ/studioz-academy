# Studio Z Academy

Rige el contrato global DautIA instalado en el host. Este archivo solo fija
hechos y restricciones del producto.

## Fuentes de verdad

- `delivery.yaml` define repositorio, ramas, ambientes, checks y rollback.
- `docs/CURRENT.md` conserva el ultimo estado externo realmente verificado.
- `README.md`, codigo, migraciones y configuracion prueban comportamiento; la
  documentacion no demuestra por si sola un deploy o una mutacion remota.

## Implementacion y Git

- La rama de integracion es `dev`. Una implementacion expresa termina probada,
  documentada, comprometida y publicada en `origin/dev`.
- `staging` y `main` son promociones separadas. Deploy, migraciones remotas,
  Wompi, Bunny, Resend y produccion requieren autoridad para el target exacto.
- No cerrar trabajo en una rama efimera salvo que el usuario haya pedido un
  resultado local. Preservar cambios ajenos y usar `.worktrees/<tarea>` solo
  cuando exista aislamiento o paralelismo real.
- GitHub es transporte y trazabilidad; no ejecutar Actions salvo gate requerido
  o una necesidad que no pueda probarse localmente.

## Pruebas y proveedores

- Ejecutar pruebas focales y ampliar por riesgo hasta lint, build, integracion o
  E2E cuando la frontera afectada lo justifique.
- Toda prueba con DB usa un proyecto Supabase de staging cuya identidad haya
  sido verificada; no inferirla de `supabase/config.toml`, nombres de scripts o
  variables. Sin identidad segura, la prueba queda bloqueada.
- Usar `dautia-supabase run --environment <ambiente> -- <comando>` o el wrapper
  local equivalente. Nunca pedir nuevamente una password almacenada ni usar
  produccion como fallback.
- Pagos, webhooks, video y correo reales se prueban con un smoke focal solo si
  esa integracion cambio; el resto usa dobles deterministas.

Cerrar con alcance, rama, SHA, pruebas, documentacion, estado externo verificado
y residuales. No convertir una compilacion verde en afirmacion de deploy.
