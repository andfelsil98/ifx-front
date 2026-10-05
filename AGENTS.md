# Reglas de trabajo — IFX Frontend

## Arquitectura y carpetas

Angular 20, standalone, TypeScript estricto, SCSS y arquitectura por feature.
La composición global está en `src/app/app.config.ts` y `app.routes.ts`.

- `src/app/features/`: cada funcionalidad aprobada agrupa sus rutas, componentes,
  servicios, modelos y pruebas. Crear únicamente los archivos que necesite.
- `src/app/core/`: infraestructura global real, como configuración o middleware HTTP
  cuando se requieran. No contiene lógica de una feature.
- `src/app/shared/`: componentes, directivas y pipes sin dependencia de features,
  compartidos por usos reales. No trasladar código aquí por uso futuro.
- `src/styles/`: configuración del tema Material. `src/styles.scss` lo carga una vez.
- El componente raíz aloja el RouterOutlet; no concentra flujos ni estado de negocio.

Features no importan internals de otras features. Extraer un contrato compartido
solo si hay colaboración concreta. Preferir rutas lazy cuando exista una feature;
no crear rutas, páginas, servicios, stores o modelos ficticios.
No añadir capas de repositories, fachadas, clases base ni wrappers sin necesidad.

## Código, componentes y servicios

- Respetar tsconfig estricto y strictTemplates. No `any`, `@ts-ignore` ni aserciones
  para encubrir tipos; validar entradas externas en el límite que las recibe.
- Archivos kebab-case; clases PascalCase; variables y métodos camelCase. Mantener
  nombres Angular del scaffold (`app.ts`, `app.config.ts`, `app.routes.ts`). Dos
  espacios, comillas simples y punto y coma; imports de tipos con `import type`.
- Componentes standalone con imports explícitos y `OnPush`. Mantener templates
  declarativos, sin llamadas HTTP ni cálculos costosos. Usar inputs/outputs tipados,
  signals para estado local y control flow `@if`/`@for` con identidad estable.
- Servicios reciben colaboradores por DI de Angular mediante `inject()` o
  constructor. Usar `providedIn: 'root'` solo para servicios globales; providers de
  feature para instancias locales. No instanciar servicios con `new` en componentes.
- Componentes coordinan interacción y presentación; servicios resuelven acceso a
  datos y lógica del módulo. No crear un servicio por archivo o por función.
- Preferir async pipe, signals o `takeUntilDestroyed` a suscripciones que sobrevivan
  al componente. No usar suscripciones anidadas ni duplicar fuentes de estado.
- Extraer reutilización cuando existan usos reales. Una abstracción debe reducir
  complejidad actual; no aplicar patrones solo por su nombre.

## Estado y flujos asíncronos

- Estado local: signals o Reactive Forms según corresponda. El área autenticada
  mantiene VMs en signals de un servicio provisto por shell; AuthService conserva
  solo la sesión pública compartida en memoria.
- Compartir estado mediante servicios inyectados cuando deba coordinarse entre
  componentes o rutas. Documentar propietario, alcance y ciclo de vida; no duplicar
  la misma fuente de datos en componentes o servicios diferentes.
- Usar RxJS para HTTP, cancelación y coordinación asíncrona; mantener signals para
  el estado que consume la vista. Liberar suscripciones al terminar su propietario.
- No instalar librerías de estado ni crear stores, actions, reducers o effects por
  anticipación. Introducirlos solo si una necesidad aprobada no se resuelve de
  forma clara con los servicios, signals y RxJS existentes.
- No guardar passwords, JWTs o refresh tokens en estado compartido,
  localStorage/sessionStorage ni logs. No añadir DevTools ni persistencia automática
  por anticipación.

## Diseño, Material y accesibilidad

- Leer `DESIGN.md` antes de cambios visuales; actualizarlo si cambia una decisión.
- Angular Material es la biblioteca principal: importar solo componentes usados.
  No crear wrappers de botones, inputs o dialogs sin una necesidad concreta.
- Colores y tipografía del tema se configuran en `src/styles/_tokens.scss`;
  `src/styles/_theme.scss` aplica `mat.theme`. Usar variables semánticas Material.
- Customization mediante APIs públicas Sass de Material y sus mixins de overrides.
  No `::ng-deep`, selectores internos `.mat-mdc-*` ni estilos inline del scaffold.
- La línea base aprobada está en DESIGN.md y en los tokens del tema; ajustar sus
  decisiones junto con esa guía al revisar pantallas. No añadir fuentes remotas,
  logos o variantes sin requisitos.
- Controles con labels, foco visible y teclado; estados no dependen solo del color.
  Revisar responsive y accesibilidad cuando haya interfaces que puedan comprobarse.

## Errores y configuración

- Mapear fallos de servicios a mensajes útiles sin mostrar stacks, payloads internos
  ni datos sensibles. No silenciar errores ni mostrar mensajes originales del SDK.
- Mantener loading/error/empty/success diferenciados cuando se implemente un flujo;
  evitar capturas múltiples del mismo error y reintentos ilimitados.
- Registrar providers globales en app.config; configuración de despliegue pública
  debe centralizarse en core cuando sea necesaria. No crear environment files vacíos.
- Todo valor entregado al frontend es público. No copiar service accounts, secretos
  JWT ni configuración privada del backend. Integraciones solo dentro del alcance
  aprobado; no añadir HTTP interceptors o autenticación antes de necesitarlos.
- No alterar sanitización de Angular para renderizar datos externos sin revisar el
  caso concreto. Preferir bindings y evitar manipulación directa del DOM.

## Testing y calidad

- Karma/Jasmine y TestBed ya están configurados. Pruebas `.spec.ts` junto al código.
  Aislar servicios mediante providers de prueba; no llamar a servicios reales.
- Probar comportamiento, estados, errores y límites afectados. Material Harnesses
  cuando existan componentes Material reales. No snapshots o tests que solo repitan
  cada línea; no crear features ficticias para probar infraestructura.
- Antes del checkpoint: `npm run typecheck`, `npm run build` y
  `npm run test:ci`. Para cambios visuales, controles de diseño y accesibilidad
  aplicables. Informar límites concretos; compilación no sustituye pruebas.
- No hay lint configurado. Si se introduce, justificarlo y dejar un script ejecutable;
  no declarar lint como aprobado cuando no existe.
- Dependencias deben resolver una necesidad aprobada actual, ser compatibles con
  Angular 20 y quedar en package.json/lockfile. No upgrades ajenos ni instalar
  librerías de estado, utilitarios o UI por usos hipotéticos.
- Cambios acotados, sin código muerto ni regresiones; preservar cambios locales del
  usuario. No hacer commits ni desplegar automáticamente.

## Agentes y flujo de trabajo

Roles persistentes registrados en `.codex/config.toml`, con instrucciones en:

- `.codex/agents/senior_frontend_engineer.toml`: Senior Frontend Engineer analiza
  arquitectura, implementa Angular/componentes/servicios/estado cuando se le delegue,
  revisa DI, mantenibilidad y calidad del cambio final.
- `.codex/agents/senior_web_designer.toml`: Senior Web Designer revisa UX/UI,
  consistencia con DESIGN.md, Material, responsive y accesibilidad aplicables.
- `.codex/agents/senior_qa_engineer.toml`: Senior QA Engineer revisa comportamiento,
  regresiones, componentes y estados, suficiencia de tests y resultados finales.

Los tres deben intervenir mediante agentes separados. Reutilizar instancias cuando
existan; crearlas con sus definiciones al empezar otra sesión. Diseñador y QA trabajan
solo en lectura y solicitan al coordinador validaciones que escriban artefactos.
No fijar modelos; los roles heredan la sesión. Versionar AGENTS, DESIGN y `.codex`
juntos. La configuración de proyecto requiere un cliente compatible y confianza
local del usuario; clonar no inicia agentes ni revisiones automáticamente.
Si no se pueden crear agentes, informar esa limitación sin simular sus revisiones.

Flujo para cambios importantes:

```text
Análisis → Implementación → Frontend Review → Design Review → QA Review
→ Tests y validaciones → Checkpoint → Aprobación del usuario
```

Leer AGENTS y el código afectado antes de editar. Definir alcance con Frontend;
consultar DESIGN con Diseñador si hay decisiones visuales. Corregir hallazgos y
volver a revisar lo afectado antes de cerrar. QA verifica evidencia de los checks.
El checkpoint informa cambios, validaciones y decisiones pendientes. Después,
detenerse hasta aprobación explícita; no avanzar a otra etapa automáticamente.

## Contratos actuales

- API_BASE_URL centraliza URL pública. Cookies credentials solo para ese API.
  Guard restaura mediante refresh; no existe /me. Un retry tras 401, sin bucles.
- Cambios exitosos de login/logout se anuncian entre pestañas mediante
  SESSION_EVENTS: BroadcastChannel y fallback storage efímero, únicamente
  version/action/nonce validados. No publicar identidad, passwords o tokens;
  refresh no publica eventos. Invalidar epoch/sesión ante eventos remotos y salir
  del shell antes de restaurar mediante cookies; respuestas viejas no repueblan
  estado ni finalizan la renovación actual. Logout fallido no anuncia éxito.
- Login/refresh/logout comparten Web Lock cuando disponible; conservar fallback
  single-flight por instancia y probar coordinación por DI. No leer JWTs.
- VmsService pertenece al shell protegido y se comparte entre Dashboard y VMs. Mutaciones optimistas con rollback local de la
  VM afectada; no restaurar snapshots globales. Bloquear doble operación de una VM
  y descartar respuestas de otra sesión. PUT envía los seis campos completos.
- Gráficos usan el resumen global de RUNNING; nunca suman la página visible.
  Separar unidades y mantener equivalente textual.
  Skeleton, empty states y feedback deben conservar los elementos compartidos.
- Temas mediante APIs Material públicas; persistir solo preferencia visual. Fuentes
  Sora/JetBrains Mono self-hosted y assets originales conservados.

- Nombre/SO de VMs: máximo 100 caracteres; cores entero de 1 a 999, RAM/disco
  positivos hasta 999. Inputs de texto validados; convertir a números JSON antes
  de enviar, sin coerciones permisivas ni truncamientos. API también valida límites.
- Cubrir restauración/cierre de sesión con FullScreenLoading compartido hasta
  completar la navegación o recuperar los datos ante fallo; contenido inferior inert.

- Listado de VMs: página fija de 10, cursores del servidor y filtro por estado.
  Cambiar filtro reinicia la página; no filtrar por nombre/SO sólo las filas locales.
- VmsService conserva una sola suscripción SSE por vista: Dashboard escucha el resumen;
  VMs escucha resumen y ventana paginada. Cerrarla al cambiar vista, consulta o
  sesión y al destruir el shell. No acceder directamente a Firestore desde cliente.
- Resumen autoritativo con revisión monotónica; páginas ordenadas por readVersion
  del snapshot. Descartar respuestas anteriores y las de otra sesión/consulta.
  Overlays optimistas afectan sólo tarjetas; un rollback revela el último snapshot,
  sin revertir estadísticas ni otras máquinas. Confirmar con lectura posterior al write.
- Actualizaciones remotas señalan tarjetas temporalmente y respetan movimiento
  reducido. Reconexión automática acotada y botón explícito si el stream falla.
