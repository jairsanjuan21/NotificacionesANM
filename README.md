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

## Tareas programadas (hora de Colombia)

| Tarea | Cuándo |
|---|---|
| Barrido ANM | Lunes a viernes 8:30 AM y 5:30 PM; domingos 6:00 PM |
| Recordatorios de vencimiento | Todos los días 7:20 AM |
| Vigilante de salud | Todos los días 9:10 AM |

## Variables de entorno (Railway → Variables)

### Obligatorias

| Variable | Descripción |
|---|---|
| `BREVO_API_KEY` | Clave API de Brevo (Railway bloquea el SMTP de Gmail). En Brevo, desactivar el bloqueo de IP para claves API. |
| `EMAIL_SENDER` | Remitente **verificado** en Brevo. |
| `EMAIL_RECEIVER` | Destinatario(s) de las alertas, separados por coma. |
| `DB_PATH` | `/data/anm_notificaciones.db` con un **Volume** montado en `/data`. Sin esto la base se reinicia en cada deploy. |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Usuario y contraseña para entrar al panel. |

### Opcionales

| Variable | Por defecto | Descripción |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | — | Alertas por Telegram (chat ids separados por coma). |
| `GEMINI_API_KEY` | — | Resumen con IA (capa gratuita de Google AI Studio). |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` | Modelo de Gemini. |
| `GEMINI_MAX_POR_BARRIDO` | `25` | Máximo de resúmenes por barrido (cuida el cupo gratuito). |
| `ALERTAS_EMAIL` | `EMAIL_RECEIVER` | Correo para alertas de fallas del sistema. |
| `URL_PANEL` | URL de Railway | Enlace al panel que aparece en los correos. |
| `FUENTE_COACTIVO` | `true` | Consultar avisos de cobro coactivo. |
| `DIAS_FIJACION_AVISO` | `5` | Días hábiles que el aviso permanece publicado. |
| `DIAS_RECURSO` | `10` | Días hábiles para el recurso de reposición. |
| `DIAS_COACTIVO` | `15` | Días hábiles de referencia en cobro coactivo. |
| `UMBRALES_RECORDATORIO` | `5,3,1,0` | Días hábiles restantes en que se envía recordatorio. |
| `DIAS_SIN_BARRIDO_OK` | `3` | Días sin barrido exitoso antes de alertar. |
| `ARCHIVO_DIR` | junto a `DB_PATH` | Carpeta donde se guardan las copias de los PDF. |
| `DATABASE_URL` | — | Alternativa: usar Postgres en lugar de SQLite. |

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
