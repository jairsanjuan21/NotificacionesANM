"""Alertas por Telegram (opcional). Requiere TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID."""
import os
import requests


def telegram_configurado() -> bool:
    return bool(os.getenv("TELEGRAM_BOT_TOKEN") and os.getenv("TELEGRAM_CHAT_ID"))


def enviar_telegram(texto_html: str) -> bool:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chats = [c.strip() for c in (os.getenv("TELEGRAM_CHAT_ID") or "").split(",") if c.strip()]
    if not token or not chats:
        return False
    ok = True
    for chat in chats:
        for i in range(0, len(texto_html), 3900):  # límite de 4096 caracteres por mensaje
            try:
                r = requests.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={"chat_id": chat, "text": texto_html[i:i + 3900], "parse_mode": "HTML",
                          "disable_web_page_preview": True},
                    timeout=15,
                )
                if r.status_code != 200:
                    ok = False
                    print(f"[TELEGRAM] Error {r.status_code}: {r.text[:200]}")
            except Exception as e:
                ok = False
                print(f"[TELEGRAM] No se pudo enviar: {e}")
    return ok
