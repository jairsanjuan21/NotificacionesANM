"""
Consulta de deployments y logs a través de la API pública de Railway (GraphQL).

Requiere RAILWAY_API_TOKEN: un token de proyecto (Project Settings → Tokens),
que se envía en el encabezado Project-Access-Token. También acepta un token de
cuenta o de workspace (Authorization: Bearer). Los identificadores del proyecto,
servicio, entorno y deployment los inyecta Railway automáticamente en tiempo de
ejecución (RAILWAY_PROJECT_ID, RAILWAY_SERVICE_ID, ...).
"""
import os
import requests

URL_API = "https://backboard.railway.com/graphql/v2"
_modo_encabezado = ["proyecto"]  # 'proyecto' | 'bearer'


class ErrorRailway(Exception):
    pass


def configuracion() -> dict:
    return {
        "token_configurado": bool(os.getenv("RAILWAY_API_TOKEN")),
        "project_id": os.getenv("RAILWAY_PROJECT_ID"),
        "environment_id": os.getenv("RAILWAY_ENVIRONMENT_ID"),
        "service_id": os.getenv("RAILWAY_SERVICE_ID"),
        "deployment_id_actual": os.getenv("RAILWAY_DEPLOYMENT_ID"),
        "entorno": os.getenv("RAILWAY_ENVIRONMENT_NAME"),
        "servicio": os.getenv("RAILWAY_SERVICE_NAME"),
        "en_railway": bool(os.getenv("RAILWAY_PROJECT_ID")),
    }


def _encabezados(modo: str) -> dict:
    token = os.getenv("RAILWAY_API_TOKEN", "").strip()
    h = {"content-type": "application/json"}
    if modo == "proyecto":
        h["Project-Access-Token"] = token
    else:
        h["Authorization"] = f"Bearer {token}"
    return h


def consultar(query: str, variables: dict = None) -> dict:
    if not os.getenv("RAILWAY_API_TOKEN"):
        raise ErrorRailway("Falta la variable RAILWAY_API_TOKEN (cree un token en Railway → Project Settings → Tokens).")

    def llamar(modo):
        r = requests.post(URL_API, json={"query": query, "variables": variables or {}},
                          headers=_encabezados(modo), timeout=20)
        if r.status_code == 429:
            raise ErrorRailway("Railway limitó las consultas (demasiadas solicitudes). Espere unos minutos.")
        try:
            return r.json()
        except Exception:
            raise ErrorRailway(f"Respuesta inesperada de Railway (HTTP {r.status_code}).")

    datos = llamar(_modo_encabezado[0])
    errores = datos.get("errors") or []
    if errores and any("not authorized" in (e.get("message", "").lower()) for e in errores):
        # Probar el otro tipo de token (cuenta/workspace usan Bearer)
        otro = "bearer" if _modo_encabezado[0] == "proyecto" else "proyecto"
        datos2 = llamar(otro)
        if not datos2.get("errors"):
            _modo_encabezado[0] = otro
            return datos2.get("data") or {}
    if errores:
        raise ErrorRailway("Railway respondió: " + "; ".join(e.get("message", "error") for e in errores)[:400])
    return datos.get("data") or {}


def listar_deployments(cantidad: int = 10) -> list:
    cfg = configuracion()
    if not cfg["token_configurado"]:
        raise ErrorRailway("Falta la variable RAILWAY_API_TOKEN (cree un token en Railway → Project Settings → Tokens).")
    if not (cfg["project_id"] and cfg["service_id"] and cfg["environment_id"]):
        raise ErrorRailway("No se encontraron los identificadores de Railway: esta función solo está disponible "
                           "cuando la aplicación corre en Railway.")
    q = """query deployments($input: DeploymentListInput!, $first: Int) {
      deployments(input: $input, first: $first) { edges { node { id status createdAt staticUrl } } } }"""
    datos = consultar(q, {"input": {"projectId": cfg["project_id"], "serviceId": cfg["service_id"],
                                    "environmentId": cfg["environment_id"]}, "first": cantidad})
    nodos = [e["node"] for e in (datos.get("deployments") or {}).get("edges", [])]
    for n in nodos:
        n["actual"] = n["id"] == cfg["deployment_id_actual"]
    return nodos


def obtener_logs(deployment_id: str = None, tipo: str = "deploy", limite: int = 500, filtro: str = None) -> list:
    if not os.getenv("RAILWAY_API_TOKEN"):
        raise ErrorRailway("Falta la variable RAILWAY_API_TOKEN (cree un token en Railway → Project Settings → Tokens).")
    deployment_id = deployment_id or os.getenv("RAILWAY_DEPLOYMENT_ID")
    if not deployment_id:
        raise ErrorRailway("No hay deployment para consultar (la aplicación no está corriendo en Railway).")
    campo = "buildLogs" if tipo == "build" else "deploymentLogs"
    args_def = "$deploymentId: String!, $limit: Int" + (", $filter: String" if filtro else "")
    args_uso = "deploymentId: $deploymentId, limit: $limit" + (", filter: $filter" if filtro else "")
    q = f"query logs({args_def}) {{ {campo}({args_uso}) {{ timestamp message severity }} }}"
    variables = {"deploymentId": deployment_id, "limit": max(1, min(limite, 1000))}
    if filtro:
        variables["filter"] = filtro
    return consultar(q, variables).get(campo) or []
