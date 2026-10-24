# Despliegue con Docker

La imagen `nclub-api` contiene todo lo necesario para probar la API de N Club en un servidor propio: la web exportada, la API v1, la API del club (la que usa el robot) y una base de datos SQLite que se guarda en el volumen `/data`. No incluye secretos: se entregan por variables de entorno al arrancar.

## Requisitos

- En la máquina de construcción: Docker (o Podman) y acceso al repositorio.
- En el servidor: Docker con el plugin Compose (`docker compose`) y el puerto 8080 (o 80 y 443 si usa HTTPS) abierto.
- La imagen se construye para la arquitectura de la máquina de construcción. Si el servidor tiene otra (por ejemplo, construye en ARM y el servidor es x86), use `docker buildx build --platform linux/amd64 -t nclub-api --load .`.

## 1. Construir la imagen

Desde la raíz del repositorio:

```bash
docker build -t nclub-api .      # o: podman build -t nclub-api .
```

La construcción exporta la web en modo API, empaqueta el servidor en un solo archivo y deja en la imagen final solo ese archivo, la web y `vercel.json` (cabeceras de seguridad). La imagen pesa unos 240 MB y corre como usuario sin privilegios.

## 2. Llevar la imagen al servidor

```bash
docker save nclub-api | gzip > nclub-api.tar.gz
scp nclub-api.tar.gz docker-compose.yml Caddyfile .env.example usuario@IP_DEL_SERVIDOR:~/nclub/
```

En el servidor:

```bash
cd ~/nclub
gunzip -c nclub-api.tar.gz | docker load
```

`docker-compose.yml` usa `image: nclub-api:latest`; como la imagen ya está cargada, no necesita construirla allí.

## 3. Crear el archivo `.env`

```bash
cp .env.example .env
chmod 600 .env
```

Complete las cuatro llaves con valores aleatorios distintos (por ejemplo, `openssl rand -base64 32` para cada una). Formato exacto, una variable por línea, sin comillas ni espacios alrededor del `=`:

```env
CERBERUS_JWT_SECRET=<valor aleatorio>
CERBERUS_BOT_KEY=<valor aleatorio>
CERBERUS_QR_SECRET=<valor aleatorio>
CERBERUS_PHOTO_KEY=<valor aleatorio>
DOMAIN=
```

| Variable              | Para qué sirve                                                                      | ¿La recibe el robot? |
| --------------------- | ----------------------------------------------------------------------------------- | -------------------- |
| `CERBERUS_JWT_SECRET` | Firma las sesiones de socios, conserjería y administración.                         | No                   |
| `CERBERUS_BOT_KEY`    | Llave que el robot envía en la cabecera `X-Bot-Key` en cada llamada a `/api/bot/*`. | Sí                   |
| `CERBERUS_QR_SECRET`  | Firma los códigos QR de las invitaciones y permite al robot verificarlos.           | Sí                   |
| `CERBERUS_PHOTO_KEY`  | Cifra las fotos guardadas y firma los enlaces de descarga que recibe el robot.      | No                   |
| `DOMAIN`              | Dominio para HTTPS con Caddy (sección 8). Vacío si se usa la IP.                    | No                   |

Con `NODE_ENV=production` (valor de la imagen) el servidor no arranca si falta alguna de las cuatro llaves, y el mensaje indica cuáles. El archivo `.env` real nunca se versiona.

La imagen trae `CERBERUS_RESET_ENABLED=false`: el reinicio de datos de la API v1 está desactivado.

## 4. Levantar el servicio

```bash
docker compose up -d
docker compose ps
```

Abra el puerto 8080 en el cortafuegos del servidor y en el grupo de seguridad del proveedor (por ejemplo, `sudo ufw allow 8080/tcp`).

## 5. Probar

```bash
curl http://IP_DEL_SERVIDOR:8080/api/club-health
# {"status":"ok","api":"club","ts":"..."}
```

Recorrido completo (login, invitación, foto, descarga como robot, eventos y confirmaciones). El script lee la llave del robot de `~/.config/nclub/bot-key`:

```bash
mkdir -p ~/.config/nclub && printf '%s' 'EL_VALOR_DE_CERBERUS_BOT_KEY' > ~/.config/nclub/bot-key
API=http://IP_DEL_SERVIDOR:8080/api bash scripts/smoke-club.sh
```

La web de la aplicación está en `http://IP_DEL_SERVIDOR:8080/`. Para que la app móvil (Expo Go) use este servidor en lugar del de Vercel, arranque Expo con `EXPO_PUBLIC_CLUB_API_URL=http://IP_DEL_SERVIDOR:8080/api npx expo start -c`.

## 6. Datos fijos para las consultas del robot

Al arrancar, con `SEED_FIXED=1` (valor por defecto de la imagen), el servidor crea tres invitaciones con identificadores constantes para la fecha de hoy en Bogotá, además de los socios del padrón:

| `persona_id`   | Invitado    | Anfitrión | Horario     | Lugar      |
| -------------- | ----------- | --------- | ----------- | ---------- |
| `inv-00000001` | Laura Diaz  | andres    | 00:00–23:59 | INVITADO   |
| `inv-00000002` | Pedro Gomez | sofia     | 00:00–23:59 | Lounge VIP |
| `inv-00000003` | Ana Vélez   | camila    | 00:00–23:59 | Terraza    |

Todas quedan en estado `PROGRAMADA`. El identificador de la invitación (`id`) es igual al `persona_id`. Los socios son `sofia`, `andres` y `camila`. Cuentas iniciales, todas con la clave `nclub-demo-2026`: `sofia@nclub.demo` (socia VIP), `andres@nclub.demo` y `camila@nclub.demo` (socios regulares), `concierge@nclub.demo` (concierge), `admin@nclub.demo` (administración), `edecan@nclub.demo` (edecán) y `personal@nclub.demo` (personal del club).

Consultas con valores constantes:

```bash
API=http://IP_DEL_SERVIDOR:8080/api
KEY=EL_VALOR_DE_CERBERUS_BOT_KEY

# Lo que carga el robot: socios, agenda de hoy, turnos y órdenes.
curl -s "$API/bot/registros" -H "X-Bot-Key: $KEY"

# Agenda de una fecha concreta (AAAA-MM-DD).
curl -s "$API/bot/registros?fecha=2026-10-24" -H "X-Bot-Key: $KEY"

# Invitaciones del día vistas por conserjería.
TOKEN=$(curl -s $API/auth/login --json '{"email":"concierge@nclub.demo","clave":"nclub-demo-2026"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s "$API/invitaciones?fecha=$(TZ=America/Bogota date +%F)" -H "Authorization: Bearer $TOKEN"
```

En `agenda` de `/bot/registros` aparecen `inv-00000001`, `inv-00000002` e `inv-00000003` con su nombre, apellido, trato, anfitrión (`andres`, `sofia`, `camila`), lugar y hora de inicio. Tenga en cuenta dos reglas del club:

- Las tres invitaciones fijas cubren todo el día (00:00–23:59, hora de Bogotá) y se renuevan con la fecha de hoy al arrancar y cada hora, de modo que la agenda del robot las incluye a cualquier hora.
- Los datos fijos se vuelven a crear solo si faltan o si son de otro día. Al cambiar de día, las tres invitaciones vuelven a sus valores originales con la fecha de ese día; dentro del mismo día no se tocan, y los cambios de las pruebas (por ejemplo, una llegada) se conservan.

Para desactivar estos datos, defina `SEED_FIXED=0` en `.env`.

## 7. Operación

**Registros.** El servidor escribe una línea por petición (método, ruta, estado y duración en milisegundos); nunca registra cabeceras, llaves ni cuerpos.

```bash
docker compose logs -f api
```

**Respaldo de la base.** La base es el archivo `/data/nclub.db` del volumen `nclub-data`. Se detiene el servicio unos segundos para que SQLite cierre el archivo de forma consistente:

```bash
docker compose stop api
docker compose cp api:/data/nclub.db ./nclub-$(date +%F).db
docker compose start api
```

Para restaurar un respaldo:

```bash
docker compose stop api
docker compose cp ./nclub-AAAA-MM-DD.db api:/data/nclub.db
docker compose run --rm --user root --entrypoint chown api node:node /data/nclub.db
docker compose start api
```

**Empezar de cero.** Borra todos los datos del volumen:

```bash
docker compose down
docker volume rm nclub-data
docker compose up -d
```

**Actualizar a una versión nueva.** Construya y envíe la imagen nueva como en las secciones 1 y 2; en el servidor:

```bash
gunzip -c nclub-api.tar.gz | docker load
docker compose up -d
```

Compose recrea el contenedor con la imagen nueva; el volumen `nclub-data` conserva los datos. La parada ordenada (SIGTERM) cierra la base antes de salir.

## 8. HTTPS con dominio y Caddy

Requisitos: un dominio con registro DNS tipo A apuntando a la IP del servidor, y los puertos 80 y 443 abiertos. En `.env`:

```env
DOMAIN=api.ejemplo.org
```

```bash
docker compose --profile https up -d
```

Caddy obtiene y renueva el certificado automáticamente y reenvía todo a la API (`https://api.ejemplo.org/api/club-health`). Con HTTPS activo se puede cerrar el puerto 8080 al exterior. Los certificados se guardan en el volumen `caddy-data`.

## Referencia de variables del servidor

| Variable      | Valor en la imagen | Descripción                                                                                       |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| `PORT`        | `8080`             | Puerto de escucha.                                                                                |
| `HOST`        | `0.0.0.0`          | Interfaz de escucha.                                                                              |
| `SQLITE_PATH` | `/data/nclub.db`   | Archivo de la base; la API v1 y la del club comparten el archivo con prefijos de clave distintos. |
| `SEED_FIXED`  | `1`                | Carga los datos fijos de la sección 6.                                                            |
| `TZ`          | `America/Bogota`   | Zona horaria del club.                                                                            |
| `DIST`        | `dist-api`         | Carpeta de la web exportada.                                                                      |
