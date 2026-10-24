# ToySafe: engine + cockpit in one image.
# Scanning the home network from a container needs host networking:
#   docker run --network host -e TOYSAFE_API_TOKEN=... toysafe
FROM node:22-bookworm-slim AS cockpit
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY content/ ../content/
RUN npm run build

FROM python:3.12-slim-bookworm
# Established, defensive tools the plugins orchestrate (others are optional, see README).
RUN apt-get update \
 && apt-get install -y --no-install-recommends nmap lynis git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 10001 toysafe
WORKDIR /app
COPY backend/requirements.txt backend/
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY content/ content/
COPY --from=cockpit /src/frontend/dist frontend/dist
RUN mkdir -p backend/data && chown -R toysafe:toysafe backend/data
USER toysafe
WORKDIR /app/backend
ENV TOYSAFE_AUTO_UPDATE_HOURS=24
EXPOSE 8000
CMD ["uvicorn", "toysafe.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
