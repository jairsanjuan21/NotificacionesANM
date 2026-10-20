# NotificacionesANM

Sistema de monitoreo de notificaciones de la **Agencia Nacional de Minería (ANM)** para títulos mineros (placas).

Revisa automáticamente el portal de la ANM, encuentra el acto exacto de cada placa, lo archiva, lo analiza,
calcula su fecha límite estimada y avisa por correo (y opcionalmente por Telegram).

## Qué hace

- **Fuentes**: notificaciones por aviso (incluye avisos, estados, edictos y liberación de áreas) y avisos de
  cobro coactivo (por placa y, si se registra, por NIT).
- **Análisis del PDF**: tipo de acto, número, término mencionado ("treinta (30) días") y urgencia por palabras clave
  (caducidad, multa, sanción, requerimiento…). Resumen opcional con IA gratuita (Gemini).
- **Plazos**: fecha estimada en que queda notificado y fecha límite, en días hábiles con festivos de Colombia.
  Recordatorios a 5, 3, 1 y 0 días hábiles hasta que se marque como *Respondida*.
- **Archivo**: copia de cada PDF, por si la ANM lo retira del portal.
- **Monitoreo**: historial de barridos, alerta si un barrido falla, si el portal cambia su estructura o si pasan
  varios días sin un barrido exitoso.
- **Gestión**: estado (nueva / revisada / en trámite / respondida) y notas por notificación; importación de placas
  desde Excel o CSV; copia opcional al correo del titular.

## Panel

- **Bandeja**: todas las notificaciones ordenadas por prioridad (urgentes y por vencer primero), con filtros, búsqueda
  y un panel de detalle con el resumen, el plazo, la gestión, las notas y el PDF incrustado.
- **Vencimientos**: agenda de fechas límite agrupada por semana.
- **Títulos mineros**: lista de placas con sus pendientes, historial, edición e importación desde Excel.
- **Monitoreo del sistema** (solo administrador): estado general, métricas y gráficos de barridos, historial de
  barridos, logs de la aplicación en vivo, logs de Railway (servidor y build) y verificación de la configuración.

## Tareas programadas (hora de Colombia)

| Tarea | Cuándo |
|---|---|
| Barrido ANM | Lunes a viernes 8:30 AM y 5:30 PM; domingos 6:00 PM |
| Recordatorios de vencimiento | Todos los días 7:20 AM |
| Vigilante de salud | Todos los días 9:10 AM |

## Bots de Telegram

Dos bots independientes, cada uno con su lista blanca de chats. Reciben mensajes por webhook
(`/api/telegram/cliente` y `/api/telegram/admin`), que se registra solo al arrancar en Railway.
Si alguien no autorizado escribe, el bot le muestra su chat ID y avisa al administrador.

**Bot del cliente** — avisos de notificaciones nuevas y recordatorios de vencimiento (con botón de PDF), y:
`/placa HAN-111` (o la placa sola), `/vencimientos`, `/ultimas`.

**Bot del administrador** — resumen al terminar cada barrido, aviso al arrancar el servidor,
resumen de errores del log cada 15 minutos, y: `/estado`, `/barridos`, `/errores`, `/logs [n]`,
`/buscar texto`, `/auditoria`, `/barrer`.

## Variables de entorno (Railway → Variables)

### Obligatorias

| Variable | Descripción |
|---|---|
| `BREVO_API_KEY` | Clave API de Brevo (Railway bloquea el SMTP de Gmail). En Brevo, desactivar el bloqueo de IP para claves API. |
| `EMAIL_SENDER` | Remitente **verificado** en Brevo. |
| `EMAIL_RECEIVER` | Destinatario(s) de las alertas, separados por coma. |
| `DB_PATH` | `/data/anm_notificaciones.db` con un **Volume** montado en `/data`. Sin esto la base se reinicia en cada deploy. |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Usuario **administrador**: ve todo, incluido el monitoreo y los logs. |
| `PANEL_USER` / `PANEL_PASSWORD` | Usuario del **panel** para el día a día: bandeja, vencimientos y títulos, sin monitoreo. |

### Opcionales

| Variable | Por defecto | Descripción |
|---|---|---|
| `TG_CLIENTE_TOKEN` / `TG_CLIENTE_CHATS` | — | Bot del cliente: notificaciones nuevas y recordatorios (chat ids separados por coma). Acepta las antiguas `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`. |
| `TG_ADMIN_TOKEN` / `TG_ADMIN_CHAT` | — | Bot del administrador: alertas de salud del sistema y barridos. |
| `GEMINI_API_KEY` | — | Resumen con IA (capa gratuita de Google AI Studio). |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Modelo de Gemini. |
| `GEMINI_MODELOS_RESPALDO` | `gemini-3.1-flash-lite,gemini-3.6-flash` | Modelos que se prueban si el principal está saturado o sin cupo. |
| `GEMINI_MAX_POR_BARRIDO` | `25` | Máximo de resúmenes por barrido (cuida el cupo gratuito). |
| `ALERTAS_EMAIL` | `EMAIL_RECEIVER` | Correo para alertas de fallas del sistema. |
| `URL_PANEL` | URL de Railway | Enlace al panel que aparece en los correos. |
| `FECHA_MINIMA_ALERTAS` | `2025-06-01` | Las notificaciones publicadas antes de esta fecha se guardan pero no se envían por correo. |
| `FUENTE_COACTIVO` | `true` | Consultar avisos de cobro coactivo. |
| `DIAS_FIJACION_AVISO` | `5` | Días hábiles que el aviso permanece publicado. |
| `DIAS_RECURSO` | `10` | Días hábiles para el recurso de reposición. |
| `DIAS_COACTIVO` | `15` | Días hábiles de referencia en cobro coactivo. |
| `UMBRALES_RECORDATORIO` | `5,3,1,0` | Días hábiles restantes en que se envía recordatorio. |
| `DIAS_SIN_BARRIDO_OK` | `3` | Días sin barrido exitoso antes de alertar. |
| `ARCHIVO_DIR` | junto a `DB_PATH` | Carpeta donde se guardan las copias de los PDF. |
| `DATABASE_URL` | — | Alternativa: usar Postgres en lugar de SQLite. |
| `RAILWAY_API_TOKEN` | — | Token de proyecto de Railway (Project Settings → Tokens) para ver los logs de Railway en el monitoreo. |
| `SESSION_SECRET` | derivado de las contraseñas | Clave para firmar las sesiones. Si cambia una contraseña, se cierran todas las sesiones. |
| `LOG_DIR` | junto a `DB_PATH` | Carpeta donde se guardan los logs de la aplicación. |

> **Las fechas límite son estimadas.** Siguen por defecto las reglas del CPACA (art. 69 y 76) y deben validarse
> contra cada acto administrativo. Se pueden ajustar con las variables de arriba.

## Ejecución local

```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Frontend en desarrollo (otra terminal):

```bash
cd frontend
npm install
npm run dev
```

Las variables locales van en `backend/.env` (no se sube al repositorio).

## Endpoints útiles

Documentación interactiva en `/docs`. Algunos endpoints de mantenimiento:

- `GET /api/correo/diagnostico`: qué está configurado.
- `POST /api/alertas/prueba`: envía un correo y un Telegram de prueba.
- `GET /api/salud/fuentes`: verifica en vivo la estructura del portal de la ANM.
- `POST /api/notificaciones/enviar-pendientes`: reintenta el envío de lo pendiente.
- `POST /api/mantenimiento/procesar-historico`: archiva y analiza las notificaciones antiguas.
