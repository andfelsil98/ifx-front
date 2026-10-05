# VMS Manager — Guía de diseño

Consola de infraestructura clara y precisa. Login y dashboard aplican esta guía;
actualizar decisiones y tokens juntos al revisar pantallas reales.

## Design principles

Priorizar identificación de VMs, comparación de recursos y acciones previsibles.
Evitar gradientes decorativos añadidos, glassmorphism, tarjetas gigantes y animación
continua. Los backgrounds de marca proporcionados son una excepción autorizada.
La identidad se expresa con marca, tipografía, jerarquía y detalles útiles.

## Theme

Material 3, density 0; temas claro y oscuro mediante system overrides públicos.
`src/styles/_tokens.scss` centraliza valores y `_theme.scss` los aplica.
Preferencia inicial del sistema; selector guarda únicamente `vms-theme` en
localStorage. No guardar credenciales. Azure completa roles no personalizados.

## Color palette

| Rol | Claro | Oscuro |
| --- | --- | --- |
| Background | #F8FAFC | #0B1220 |
| Surface | #FFFFFF | #111C2E |
| Texto principal | #0F172A | #F1F5F9 |
| Texto secundario | #475569 | #CBD5E1 |
| Primary | #2563EB | #93C5FD |
| On-primary | #FFFFFF | #172554 |
| Contorno funcional | #64748B | #94A3B8 |
| Borde decorativo | #E2E8F0 | #334155 |

Marca: primary dark #1D4ED8, secondary #14B8A6, accent #0EA5E9, success
#10B981, warning #F59E0B y error #EF4444. Usar estos tonos como acentos;
roles Material de texto/controles usan pares de contraste accesibles, sin imponer
blanco sobre colores claros. No comunicar estados únicamente mediante color.

## Typography

Sora Variable self-hosted para interfaz y marca; JetBrains Mono Variable para cifras
técnicas. Fontsource empaqueta fuentes locales, sin Google Fonts ni otro CDN.
Display 40–48 px en escritorio, H1 32 px, H2 24 px, H3 20 px; títulos compactos
de panel pueden usar 18 px. Cuerpo 14–16 px, labels 13–14 px, caption 12 px.
Pesos: regular 400, labels 500, H2/H3 600, H1/display 700. Usar cifras tabulares.

## Spacing

Escala 4, 8, 12, 16, 24 y 32 px en rem mediante `--ifx-space-1` a `-6`.
Material conserva espaciado interno. Grupos y secciones deben mantener ritmo
consistente; evitar utilitarios nuevos para cada valor.

## Borders / radius

Controles/botones 8 px; diálogos 12 px, mediante overrides públicos Material.
Paneles 12 px; login 16 px. Divisores 1 px, sin usar borde decorativo como única
señal de un control interactivo. No modificar DOM ni clases internas Material.

## Elevation

Superficies de página planas. Sombras reservadas para overlays de Material y una sombra sutil de cabecera al hacer scroll.
No añadir elevación a cada panel por decoración.

## Component guidelines

Material para botones, fields, selects, dialogs y snackbars; HTML semántico para
cards y layout. Compartir feedback, confirmación y skeleton cuando hay usos reales.
Sin wrappers innecesarios, `::ng-deep` o selectores `.mat-mdc-*`.

## Forms

Un diálogo compartido para crear/editar: name, cores, ram, disk, os, status.
Reactive Forms tipados, labels visibles en español, números positivos, cores entero
entre 1 y 999, RAM/disco decimales positivos hasta 999 y unidades GB.
Inputs numéricos de texto, sin signos ni exponentes; admiten coma/punto decimal
y se convierten a números JSON al enviar. Nombre/SO: máximo 100 caracteres. Normalizar espacios y capitalizar cada palabra de nombre/SO al salir del campo y al enviar (resto en minúsculas). Campos con altura uniforme y 24 px entre filas. PUT envía
los seis campos completos. Errores junto al campo; backend conserva la validación
efectiva. Desktop dos columnas; móvil una columna.

## Buttons

Una acción principal por contexto, secundarios de menor peso. ADMINISTRADOR dispone
de mutaciones; CLIENTE consulta. Confirmación antes de eliminar. Nombre accesible
en acciones de VM. Botones que envían peticiones muestran spinner y texto de
progreso, sin sustituir el label ni permitir doble envío. Bloquear operación repetida en una VM pendiente.

## Feedback states

RUNNING: En ejecución, verde; STOPPED: Detenida, rojo con roles error-container/on-error-container; SUSPENDED: Suspendida,
ámbar. El label distingue el estado detenido de un error de petición. Barras claras: cores #2563EB, RAM #0F766E, disco #0369A1 para contraste
de objetos gráficos; oscuras #60A5FA/#2DD4BF/#38BDF8. Claro: verde #065F46/#D1FAE5; ámbar
#92400E/#FEF3C7. Oscuro: verde #A7F3D0/#064E3B; ámbar #FDE68A/#451A03.
Skeletons reproducen el layout de cada vista: Dashboard conserva cuatro tarjetas de
resumen y tres paneles de recursos con área de gráfico de 140 px; inventario
conserva filtros y grid de tarjetas. Compartir el bloque decorativo, sin datos
ficticios ni controles enfocables; una señal accesible de carga por vista.
Empty state real, error con retry y MatSnackBar compartido
para éxito/fallo. Operaciones optimistas cambian tarjetas inmediatamente y
revierten solo la VM afectada ante fallo; aviso accesible Guardando cambios.

## Responsive behavior

Cabecera compacta adaptable, paneles de recursos pasan de tres columnas a una.
Ancho mínimo soportado: 280 px. Cabecera compacta en dos filas (marca/cuenta y navegación); filtros en una fila con scroll horizontal. Acciones de crear/editar en una sola fila, incluso a 280 px.
Formularios en una columna móvil; cards de VMs en dos columnas y una en móvil,
sin scroll horizontal de página. Conservar identidad, estado y acciones. Revisar zoom 200%.

## Accessibility

Objetivo WCAG 2.2 AA: texto normal 4.5:1, reconocimiento de controles 3:1 cuando
aplique. Labels, foco visible, teclado, landmarks y encabezados. Contrastes se
comprueban en ambos temas. Canvas con nombre accesible y datos equivalentes en
totales/cards. Skeleton respeta prefers-reduced-motion; gráficos sin animación.
Cargar las fuentes locales del canvas antes del primer dibujo: JetBrains Mono para
ejes técnicos y Sora para tooltip. Ante fallo usar fallback explícito y estable,
sin esperar interacción del usuario para ajustar tipografía.

## Layout conventions

Raíz main/RouterOutlet; `/login` y shell protegido con children lazy `/dashboard` y
`/vms`. Dashboard es la entrada postlogin: resumen global, estados y tres gráficos de
recursos de VMs RUNNING. El menú lleva a Dashboard o Máquinas virtuales. Cabecera sticky sin saltos de layout,
sombra con transición al hacer scroll. Footer mínimo: únicamente logo completo.
El shell provee un único VmsService: navegar entre vistas conserva datos y
operaciones; abandonar el área autenticada los descarta.

Inventario en cards: nombre y SO, estado con label, cores, RAM y disco asignados.
Dos columnas desktop, una móvil. ADMINISTRADOR crea/edita/elimina; CLIENTE consulta.
No inventar CPU%, uptime, IP, host o capacidad de la referencia adjunta.
Gráficos separados por unidad: una barra de total global RUNNING por recurso;
páginas y filtros no alteran el resumen. Filtro de estado únicamente, aplicado por
el servidor; páginas fijas de 10 con Anterior / Página N / Siguiente. No inventar
un número total de páginas a partir de cursores; no mover el foco en eventos remotos.
Usuario y logout dentro de MatMenu; cambio de tema como icono con nombre accesible.

## Login y movimiento

Login mínimo: formulario sobre superficie opaca a izquierda de backgrounds de
marca, logo completo dentro del formulario; sin símbolo+nombre improvisado.
`background-light.png` y `backgroung-dark.png` se superponen con fade de 320 ms;
variantes de logo 240 ms. Superficies/textos cambian en 240 ms; entradas de vistas
180 ms con desplazamiento de 6 px. Desactivar transiciones/animaciones con
prefers-reduced-motion. No alterar el foco ni retrasar el feedback.
Login sin subtítulo promocional ni leyenda de acceso seguro. Ojo accesible para
mostrar/ocultar contraseña sin cambiar el valor. Login rechazado conserva ambos campos y muestra Usuario o contraseña incorrectos.
Restaurar o cerrar sesión cubre el cambio con pantalla opaca de logo y spinner,
con mensaje accesible; no mostrar inventario en ceros antes de redirigir.
Crear/editar conserva formulario durante petición, bloquea cierre y muestra spinner;
el fallo mantiene los datos y revierte la mutación optimista.

## Brand assets

`public/resources/full-logo-dark.png` sobre fondo claro y `full-logo-white.png`
sobre fondo oscuro, tanto en login como en cabecera. Favicon y manifest en
`public/favicon/`. Assets actuales RGBA transparentes, conservados sin editar.
Usar logo completo también en cabecera, respetando proporciones y legibilidad.

## Revisión y evolución

Frontend revisa DI/APIs/mantenibilidad, Diseñador revisa identidad y accesibilidad,
QA revisa comportamiento y evidencia. Registrar decisiones y actualizar tema/guía
juntos. Detenerse en checkpoint hasta aprobación del usuario.

## Actualizaciones en tiempo real

Una conexión por vista, resumen global en Dashboard y ventana paginada en inventario.
Marcar cambios remotos con borde/tono primary y etiqueta temporal Actualizada;
animación breve, sin bucles ni desplazamientos. Con movimiento reducido conservar
la etiqueta y señal estática. Anuncio accesible agrupado, sin live region por tarjeta.
Mostrar reconexión y acción Reconectar ante fallo definitivo. Las tarjetas son
optimistas; los gráficos reflejan los totales confirmados por servidor, sin doble conteo.
