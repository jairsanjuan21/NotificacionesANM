# Despliegue en el VPS (Hostinger KVM 2)

> **Requisito:** estos archivos tienen que estar en `main`, porque `deploy.sh` siempre despliega `main`.
> Mergea el PR de la migración antes de empezar. Hasta configurar los secrets del paso 8, el workflow
> de GitHub Actions va a fallar en cada push. Es normal y no afecta nada.

Arquitectura:

```
Internet ──443──▶ Caddy (contenedor "caddy", /opt/proxy)  ── HTTPS automático (Let's Encrypt)
                      │  red interna "proxy"
                      ├──▶ notificaciones-anm:8000   (este repo, /opt/apps/NotificacionesANM)
                      ├──▶ fersautos…                 (futuro)
                      └──▶ sgsst…                     (futuro)
```

- Solo Caddy publica puertos (80/443). La app no se expone directamente a internet.
- Datos persistentes en el volumen Docker `anm_data` (montado en `/data`): base SQLite, PDFs archivados y logs.
- Dominio sin tocar DNS con **sslip.io**: `anm.<IP-con-guiones>.sslip.io` resuelve a la IP del VPS.
  Ejemplo: IP `203.0.113.10` → `anm.203-0-113-10.sslip.io`.
- Correo por **SMTP de Gmail** con contraseña de aplicación (Hostinger no bloquea el SMTP).

En esta guía, `203.0.113.10` representa la IP real del VPS: reemplázala en cada comando.

---

## 1. Preparar el VPS (una sola vez)

Entra como root desde tu PC (PowerShell sirve):

```bash
ssh root@203.0.113.10
```

Actualiza el sistema e instala Docker:

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
apt install -y git ufw fail2ban unattended-upgrades
```

Crea un usuario de despliegue, para no trabajar como root:

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh /opt/apps /opt/proxy /opt/respaldos/anm
cp ~/.ssh/authorized_keys /home/deploy/.ssh/ 2>/dev/null || true
chown -R deploy:deploy /home/deploy/.ssh /opt/apps /opt/proxy /opt/respaldos
chmod 700 /home/deploy/.ssh
```

> Si entras a root con contraseña y no con llave, primero crea una llave en tu PC con
> `ssh-keygen -t ed25519` y cópiala con `type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@203.0.113.10 "cat >> ~/.ssh/authorized_keys"`.
> Repite el `cp` de arriba después.

Firewall: abre solo SSH, HTTP y HTTPS.

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
```

Revisa también el **firewall del panel de Hostinger** (VPS → Seguridad → Firewall): si está activo,
debe permitir 22, 80 y 443.

Cuando confirmes que entras con `ssh deploy@203.0.113.10` usando la llave, desactiva el acceso con
contraseña: en `/etc/ssh/sshd_config` pon `PasswordAuthentication no` y luego ejecuta `systemctl restart ssh`.

## 2. Clonar el repo y levantar el proxy

Desde aquí, todo como `deploy`:

```bash
ssh deploy@203.0.113.10
cd /opt/apps
git clone https://github.com/jairsanjuan21/NotificacionesANM.git
cp -r NotificacionesANM/deploy/proxy/* /opt/proxy/
cp NotificacionesANM/deploy/proxy/.env.example /opt/proxy/.env
nano /opt/proxy/.env          # ACME_EMAIL y ANM_DOMINIO=anm.203-0-113-10.sslip.io
cd /opt/proxy && docker compose up -d
```

El proxy vive en `/opt/proxy` y no dentro del repo porque lo comparten todos los proyectos. Para agregar
otro proyecto después basta con crear `/opt/proxy/sitios/<proyecto>.caddy` y ejecutar
`docker compose restart caddy`.

## 3. Contraseña de aplicación de Gmail

1. En la cuenta de Gmail que enviará los correos, activa la **verificación en 2 pasos**.
2. Entra a https://myaccount.google.com/apppasswords, crea una contraseña llamada "ANM VPS" y copia
   las 16 letras.
3. Esa clave va en `EMAIL_PASSWORD`. `EMAIL_SENDER` debe ser **esa misma** cuenta.

## 4. Variables de entorno

```bash
cd /opt/apps/NotificacionesANM
cp .env.example .env
chmod 600 .env
nano .env
```

Copia los valores desde Railway → servicio → **Variables → Raw Editor** (usuarios, Telegram,
healthchecks, Gemini, `SESSION_SECRET`…), con estos cambios:

| Variable | Qué hacer |
|---|---|
| `PUBLIC_DOMAIN` | **Nueva**: `anm.203-0-113-10.sslip.io` (igual a `ANM_DOMINIO` del proxy). |
| `EMAIL_PASSWORD` | **Nueva**: la contraseña de aplicación del paso 3. |
| `BREVO_API_KEY` | **No la copies.** |
| `DB_PATH` | No hace falta: la fija `docker-compose.yml`. |
| `URL_PANEL` | Bórrala si apuntaba a Railway: se arma sola desde `PUBLIC_DOMAIN`. |
| `RAILWAY_*` | No las copies. |

## 5. Migrar los datos desde Railway

Para no perder historial, estados, notas ni PDFs archivados:

1. Con esta versión ya desplegada en Railway, entra al panel como **administrador** →
   Monitoreo → **Configuración** → **Descargar respaldo**. Baja un `respaldo_anm_AAAAMMDD_HHMM.tar.gz`.
2. **Apaga Railway antes de arrancar el VPS**: Deployments → ⋮ → *Remove*. No borres el Volume
   todavía. Si quedan los dos encendidos, los barridos se duplican y Telegram se queda con el webhook
   del último que arrancó.
3. Sube el respaldo al VPS desde tu PC:

```bash
scp respaldo_anm_*.tar.gz deploy@203.0.113.10:/opt/respaldos/anm/
```

## 6. Primer arranque

Primero se cargan los datos y después se arranca la app. Así nunca corre con la base semilla del repo,
que podría reenviar al tío notificaciones viejas.

```bash
cd /opt/apps/NotificacionesANM
./deploy/restaurar.sh /opt/respaldos/anm/respaldo_anm_XXXX.tar.gz   # carga los datos de Railway en el volumen
./deploy/deploy.sh                                                  # construye y arranca
```

## 7. Verificar

- [ ] `https://anm.203-0-113-10.sslip.io` abre con candado y deja iniciar sesión.
- [ ] Monitoreo → Configuración: "Envío de correos" en verde con **SMTP de Gmail**.
- [ ] Bandeja y títulos con los datos de siempre.
- [ ] Correo de prueba: en `/docs`, `POST /api/alertas/prueba` → `"correo": "enviado"`, y llega a la bandeja de entrada.
- [ ] El bot admin avisa **Servidor iniciado** con la versión y "webhook registrado".
- [ ] `/estado` en el bot admin responde; el bot del cliente responde a una consulta por placa.
- [ ] healthchecks.io recibe el **latido** (cada 10 min).
- [ ] Logs sin errores: `docker compose logs -f app`.

Cuando lleve un par de días bien, borra el servicio y el Volume en Railway.

## 8. Deploy automático desde GitHub

En tu PC, crea una llave **solo para GitHub Actions**:

```bash
ssh-keygen -t ed25519 -C "github-actions-anm" -f gh_deploy_anm -N ""
```

- Agrega el contenido de `gh_deploy_anm.pub` al final de `/home/deploy/.ssh/authorized_keys` en el VPS.
- En GitHub → repo → Settings → Secrets and variables → Actions, crea:
  - `VPS_HOST` = `203.0.113.10`
  - `VPS_USER` = `deploy`
  - `VPS_SSH_KEY` = el contenido completo de `gh_deploy_anm` (la privada)
- Borra `gh_deploy_anm` de tu PC cuando la hayas pegado en GitHub.

Desde ese momento, cada merge a `main` despliega solo (pestaña **Actions**). También se puede lanzar a
mano con **Run workflow**.

## 9. Respaldos automáticos

```bash
crontab -e
# Agregar:
15 3 * * * /opt/apps/NotificacionesANM/deploy/respaldo.sh >> /opt/respaldos/anm/respaldo.log 2>&1
```

Se guardan 14 días en `/opt/respaldos/anm`. Cada cierto tiempo baja uno a tu PC
(`scp deploy@203.0.113.10:/opt/respaldos/anm/anm_*.tar.gz .`): un respaldo que solo vive en el
mismo servidor no protege si el servidor se pierde.

## Comandos del día a día

| Qué | Comando (en `/opt/apps/NotificacionesANM`) |
|---|---|
| Ver logs en vivo | `docker compose logs -f app` |
| Reiniciar la app | `docker compose restart app` |
| Desplegar a mano | `./deploy/deploy.sh` |
| Estado de contenedores | `docker ps` |
| Cambiar una variable | `nano .env` y luego `docker compose up -d app` |
| Respaldo ya | `./deploy/respaldo.sh` |
| Restaurar | `./deploy/restaurar.sh archivo.tar.gz` |
| Logs del proxy/HTTPS | `cd /opt/proxy && docker compose logs -f caddy` |

## Notas

- **sslip.io** es un servicio gratuito de terceros. Si algún día falla, el panel no carga aunque el
  servidor esté bien. Cuando compres un dominio solo cambias `ANM_DOMINIO` y `PUBLIC_DOMAIN`,
  y reinicias el proxy y la app.
- Si cambia la IP del VPS, también cambia el dominio: actualiza las dos variables.
- La pestaña **Railway** del monitoreo queda sin datos. Los logs ahora se leen con `docker compose logs`
  y en la pestaña de logs de la aplicación, que sigue funcionando.
