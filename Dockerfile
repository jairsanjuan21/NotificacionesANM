# --- ETAPA 1: Compilar el Frontend en React ---
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- ETAPA 2: Configurar el Backend en Python + PyMuPDF ---
FROM python:3.11-slim
WORKDIR /app

# Instalar dependencias del sistema necesarias para PyMuPDF y compilación
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

# Instalar librerías de Python desde requirements.txt
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copiar todo el código del backend
COPY backend/ ./backend/

# Traer la carpeta compilada 'dist' desde la Etapa 1
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Exponer puerto y arrancar FastAPI
WORKDIR /app/backend
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]