# Frontend — Notificaciones ANM

Panel web para seguir las notificaciones que la Agencia Nacional de Minería publica sobre los títulos mineros registrados. React 19 + Vite + React Router, sin librerías de UI: el sistema de diseño es propio.

```bash
npm install
npm run dev      # http://localhost:5173 (espera el backend en http://127.0.0.1:8000)
npm run lint     # debe quedar en cero
npm run build    # genera dist/, que el backend sirve en producción
```

## Estructura

```
src/
├── main.jsx              Arranque: router, fuente y estilos
├── App.jsx               Sesión y rutas
├── servicios/api.js      Cliente HTTP único (axios + cookie de sesión + 401)
├── contexto/             Estado global
│   ├── datos.js            contexto + hook useDatos()
│   ├── ProveedorDatos.jsx  carga clientes y notificaciones
│   ├── avisos.js           contextos + hooks useAvisos() / useConfirmar()
│   └── ProveedorAvisos.jsx toasts y diálogo de confirmación
├── hooks/                Lógica reutilizable sin interfaz
│   ├── useConsulta.js      carga de datos con carga/error/recarga
│   ├── useIntervalo.js     sondeo periódico
│   ├── usePantallaAncha.js media query como estado
│   ├── usePreferencia.js   useState recordado en localStorage
│   └── useTema.js          tema claro/oscuro/sistema compartido
├── utilidades/           Funciones puras (sin React)
│   ├── fechas.js · formato.js · dominio.js · logs.js · diagnostico.js · topografia.js
│   └── index.js            punto de entrada: import { … } from '../utilidades'
├── componentes/          Piezas del dominio (insignias, detalle, consola…)
│   └── ui/                 Sistema de diseño: Boton, Tarjeta, Cargando, EstadoVacio,
│                           MensajeError, Modal, Cajon, SelectorTema, Contornos
├── layout/Marco.jsx      Barra lateral + navegación móvil + <Outlet/>
├── paginas/              Una carpeta/archivo por ruta (admin/ agrupa el monitoreo)
└── estilos/              CSS modular
    ├── tokens.css          colores (light-dark), escalas de texto y espacio, movimiento
    ├── base.css · layout.css · <componente>.css
    └── paginas/<página>.css
```

## Reglas de la casa

1. **Las páginas no llaman `useEffect` para cargar datos**: usan `useConsulta(clave, fn)`. Si la clave cambia, vuelve a consultar; las respuestas viejas se descartan.
2. **Si un valor se puede calcular, no se guarda en estado.** Ejemplos: el deployment elegido en Railway, `cargando` en `useConsulta`, la página de la bandeja.
3. **Un archivo `.jsx` solo exporta componentes.** Contextos, hooks y funciones van en `.js` (así funciona el Fast Refresh de Vite).
4. **Ningún color se escribe a mano fuera de `tokens.css`.** Cada mineral tiene un significado: verdín = acción, óxido = urgente/vencido, ocre = por vencer, malaquita = respondida, cuarzo = coactivo/IA.
5. **El CSS sigue la cascada** tokens → base → layout → componentes → páginas.
6. **Cargar, vaciar y fallar se dicen con componentes**: `<Cargando>`, `<EstadoVacio>` (con `tono="error"`) y `<MensajeError>`. Nunca un `<div>` suelto con texto.
7. **Nada de `style={{…}}` salvo valores que vienen de datos** (posiciones calculadas, variables CSS por elemento). Para componer: `.pila`, `.hilera`, `.empujar`, `.estirar`.
8. **Tamaños y espacios salen de la escala** (`--texto-*`, `--espacio-*`). Si un diseño pide otro valor, se ajusta el diseño.

La **Guía de diseño** (Monitoreo del sistema → Guía de diseño) muestra todos los tokens y componentes en vivo. Si algo no aparece ahí, no es parte del sistema.
