# API de Cerberus

Referencia para cualquier persona u otra IA que quiera usar el «cerebro» de Cerberus: reconocimiento facial, rol del
visitante, confirmación con cédula o pase QR, voz en 4 idiomas, invitados y registro de visitas.
La página web, el puente con la simulación MuJoCo y el robot X2 usan esta misma API.

- **Base:** `http://127.0.0.1:8000`. Se arranca con `./run.sh`; el código está en `web/app.py`.
- **Documentación interactiva** (OpenAPI/Swagger, generada del código): `http://127.0.0.1:8000/docs`. El JSON está en `/openapi.json`.
- **Sin autenticación:** el servidor solo escucha en `127.0.0.1` porque maneja datos biométricos. Para usarla desde otra
  máquina (el host del robot, la sim en AWS), usa un túnel SSH (`ssh -L 8000:127.0.0.1:8000 ...`). No la abras a la red.

## Convenciones

| Tema | Regla |
|---|---|
| Imágenes | El **cuerpo crudo** del POST es la imagen (JPEG o PNG; HEIC solo en `/api/identificacion/{id}`), con `Content-Type: image/jpeg`. No es multipart. |
| Audio | El **cuerpo crudo** del POST es el audio (wav, webm/opus, ogg, mp3, m4a…). |
| JSON | `Content-Type: application/json`. |
| Idioma | Parámetro `?lang=es\|en\|zh\|pt` en todo lo que devuelve texto para el visitante. Si falta o es otro, se usa `es`. |
| Errores | HTTP 4xx/5xx con `{"detail": "mensaje"}`: 400 cuerpo inválido, 404 no existe, 409 conflicto, 422 validación, 502 servicio externo caído. |
| Ids de persona | `[a-z0-9_]{1,40}` (ej. `ana_perez`). |
| Roles | `VIP`, `REGULAR`, `INVITADO`, `PERSONAL`, `EXTERNO`. En decisiones también aparecen `ESCALAMIENTO` (recepción) y `POR_CONFIRMAR`. |
| Similitud | `coseno` es la similitud SFace (−1 a 1). `confianza` es la misma escala pasada a 0–1, donde `cos_reject` equivale a 0.60 y `cos_sure` a 0.85. |

## Flujo típico de un cliente (robot, kiosco, panel)

```
loop cada ~100 ms:
  POST /api/identificar?camara=<id>&lang=<idioma>   (cuerpo: frame JPEG)
  └─ cada 8 frames llega "decision":
       RECONOCIDO + registrado=true  -> decir decision.accion, mostrar decision.rol
       reintento=true                -> decir decision.pistas[0] ("retira la mano…"); seguir mandando frames
       confirmacion=<cid>            -> decir decision.accion ("muéstrame tu cédula o pase") y pasar a:
           loop: POST /api/confirmar/<cid>?lang=..   (cuerpo: frame con el documento)
                 estado=ESPERANDO -> mostrar "pista" si viene, seguir
                 otro estado      -> decision final: decir "accion" (ya quedó en el log)
           sin documento en 30 s: POST /api/confirmar/<cid>/sin-pase
en paralelo, cuando la persona habla:
  POST /api/voz?lang=<idioma>   (cuerpo: audio) -> si cambio_idioma, usar "idioma" desde ahí; decir "respuesta"
```

Reglas que aplica el servidor, para que el cliente no tenga que hacerlo:
- **Ventana de 5 s:** una cara dudosa, desconocida o tapada se sigue intentando durante 5 s con la pista «retira la mano»
  antes de pedir el documento (`INTENTO_S`; se cambia con la variable de entorno `CERBERUS_INTENTO_S`).
- **Sin duplicados:** la misma persona frente a la misma cámara no se registra dos veces en 15 s.
- **Documento cruzado con la cara:** el documento debe ser compatible con la cara que se vio. Una cédula o un pase de otra
  persona termina en recepción.
- **Nunca se abre acceso por defecto:** si falta evidencia o se contradice, el resultado es `ESCALAMIENTO`.

## Endpoints

### Sistema y umbrales

**`GET /api/salud`**: estado general.
```json
{"ok": true, "modelo": "yolov11n-face + YuNet(puntos) + SFace 2021dec", "personas_en_galeria": 2,
 "calibracion": {"cos_reject": 0.438, "cos_sure": 0.6, "top1": 1.0}, "db_externa": false}
```

**`GET /api/umbrales`**: `{"cos_reject": 0.438, "cos_sure": 0.6, "confianza_por_confirmar": [0.6, 0.85], "intento_segundos": 5.0, ...}`
- coseno < `cos_reject`: DESCONOCIDO
- coseno ≥ `cos_sure`: RECONOCIDO sin preguntar
- entre ambos: POR CONFIRMAR

**`PUT /api/umbrales`** `{"cos_reject"?: float, "cos_sure"?: float}`: ajuste manual, con límites de seguridad
(`0.363 ≤ cos_reject ≤ 0.7`, `cos_reject + 0.05 ≤ cos_sure ≤ 0.95`). `POST /api/evaluar` lo recalcula.

### Personas (el equipo / padrón simulado)

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/personas` | — | `[{id, nombre, rol, cedula (últimos 4 dígitos), enrolamiento, validacion, anfitrion, valido_hasta, vencida}]` |
| PUT | `/api/personas/{id}` | `{"nombre", "rol", "cedula"?, "anfitrion"?, "valido_hasta"?}` | Crea o edita. Se conserva lo que no se manda: una `cedula` vacía no cambia la que había, y un invitado re-guardado no pierde su anfitrión. `anfitrion` y `valido_hasta` solo aplican a `INVITADO` (`valido_hasta: ""` quita el vencimiento); al pasar a otro rol se borran. Un cambio de nombre también se aplica a la galería. 409 si la cédula ya es de otra persona; 422 si la fecha no es ISO. |
| DELETE | `/api/personas/{id}` | — | `{"borrado": id}`. Borra sus fotos, su entrada en la galería y su registro. |

### Captura del dataset

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/captura/guion` | `{"instrucciones": [8 posturas], "segundos_por_instruccion": 3, "fotos_objetivo": {"enrolamiento": 15, "validacion": 8}}` |
| POST | `/api/captura/{id}/frame?split=enrolamiento\|validacion&lang=` | Cuerpo: JPEG. Respuesta: `{"caras", "box", "util", "motivos": ["lejos"\|"oscuro"\|"contraluz"\|"movido"\|"perfil"\|"cubierto"], "pistas", "candidatos"}` |
| POST | `/api/captura/{id}/finalizar?split=` | Elige las tomas más distintas, guarda, rehace la galería y el export YOLO: `{"nuevas", "total", "objetivo", "faltan_variaciones", "yolo": {...}}` |
| POST | `/api/evaluar` | Galería = enrolamiento, prueba = validación (otra sesión). Calibra: `{"top1", "por_persona", "cos_reject", "cos_sure", "impostores_aceptados", ...}`. 422 si hay menos de 2 personas con validación. |
| POST | `/api/exportar-yolo` | Rehace `datos/yolo/{train,val}/<id>/*.jpg` (formato de clasificación de Ultralytics) |

### Identificación por cara

**`POST /api/identificar?camara=<id>&lang=<es|en|zh|pt>`**. Cuerpo: un frame JPEG. `camara` separa a varios
clientes a la vez (cada uno con su ventana de 8 frames).
```json
{"caras": [{"box": [x, y, w, h], "persona_id": "gabriel", "nombre": "Gabriel", "rol": "VIP", "confianza": 0.91, "coseno": 0.71}],
 "decision": null, "ms": 64}
```
`decision` llega cada 8 frames y tiene una de estas formas:

| Caso | `decision` |
|---|---|
| Reconocido con rol | `{"estado": "RECONOCIDO", "rol": "VIP", "persona_id", "nombre", "miembro": 1, "confianza", "coseno", "accion": "¡Bienvenido de nuevo, Gabriel! …", "registrado": true, "idioma": "es", ...}` |
| Invitado | Igual, con `rol: "INVITADO"`; `accion` incluye el anfitrión («Andrés lo espera…»). Si la invitación venció: `rol: "ESCALAMIENTO"`. |
| Intentando (≤ 5 s) | `{"estado": "PROBABLE"\|"DESCONOCIDO"\|"SIN_CALIDAD", "reintento": true, "segundos_restantes": 3.2, "pistas": ["No te veo bien. Retira la mano…"]}` |
| Pide documento | `{"estado": "PROBABLE"\|"DESCONOCIDO", "rol": "POR_CONFIRMAR", "confirmacion": "<cid>", "accion": "Muéstrame tu cédula o tu pase QR…", "registrado": false}` |
| Nadie / varias personas | `{"estado": "SIN_ROSTRO"\|"VARIAS_PERSONAS", "pistas": [...]}` (no se registra) |

`miembro` es la salida del **facial del club, que está SIMULADO** (miembro / no miembro, derivado del rol). La identidad sí es real.

### Confirmación con cédula o pase QR (detección automática)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/confirmar/{cid}` | `{"modo": "por_confirmar"\|"desconocido", "candidato", "nombre", "segundos_restantes"}`. El `cid` vive 60 s y no se reutiliza. |
| POST | `/api/confirmar/{cid}?lang=` | Cuerpo: frame con el documento. Detecta solo si es un **pase QR de N Club**, una **cédula amarilla** (PDF417 del reverso) o una **cédula digital** (OCR del número del frente: Tesseract en Linux, Vision en macOS). Sin documento legible: `{"estado": "ESPERANDO", "pista"?}`. Con documento: decisión final (abajo). |
| POST | `/api/confirmar/{cid}/sin-pase?lang=` | La persona no tiene documento, o se acabó el tiempo: recepción |

Decisión final:
```json
{"estado": "CONFIRMADO_CEDULA" | "CONFIRMADO_QR" | "ESCALAMIENTO", "rol": "VIP", "persona_id": "gabriel", "nombre": "Gabriel",
 "documento": "cédula", "tipo_documento": "cedula_digital", "motivo": "documento valido y cara compatible con el titular (coseno 0.71)",
 "accion": "¡Listo, Gabriel! Ya te identifiqué con tu cédula. ¡Bienvenido de nuevo, …", "registrado": true, "qr": [[x,y],…] | null}
```
Se acepta solo si:
1. el pase es válido (firma HMAC y vigencia) y su tipo corresponde al rol (socio para VIP y REGULAR, invitado, personal, externo), **o** el número de la cédula está registrado; **y**
2. la cara es compatible con el titular:
   - si la cara era dudosa, coseno ≥ `cos_reject`;
   - si no se reconoció, coseno ≥ 0.30 contra sus fotos o contra la foto de su cédula;
   - si el titular no tiene ninguna foto, decide el documento.

### Fotos de cédulas

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/identificacion/{id}` | Cuerpo: foto de la cédula de esa persona (JPEG/PNG/HEIC). Se guarda en `identificacion/<id>/`, se lee el número (queda registrado) y la cara impresa (queda como referencia): `{"guardada", "documento", "cedula": "******5678", "cara": true}` |
| POST | `/api/identificacion/procesar` | Relee toda la carpeta `identificacion/`. También se hace sola al arrancar. |

### Invitados con una sola foto

**`POST /api/invitados`**: un socio o el sistema del club registra a un invitado. Re-enviar el mismo id reemplaza la
foto; si nada cambió, responde `{"sin_cambios": true}`.
```json
{"nombre": "Laura Díaz", "anfitrion": "andres", "foto_base64": "<JPEG en base64 o data URL>", "valido_hasta": "2026-10-25",
 "id": "laura_diaz", "cedula": "52000111"}
```
- `anfitrion` es el id o el nombre de un socio (VIP o REGULAR). Si no es un socio registrado, se acepta igual, con `anfitrion_registrado: false`.
- En vez de `foto_base64` se puede mandar `foto_url` (http/https, 5 MB máximo, 10 s de timeout).
- Respuesta: `{"id", "nombre", "anfitrion", "anfitrion_registrado", "valido_hasta", "calidad_foto": ["ok"] | [motivos]}`.

**`GET /api/invitados`**: `[{id, nombre, anfitrion, valido_hasta, vencida}]`.

**`POST /api/invitados/sincronizar`**: hace `GET` a `invitados_url` (ver `/api/config`, con `Authorization: Bearer
<invitados_token>` si está configurado). Espera una lista JSON, o `{"invitados": [...]}`, con los mismos campos de
`POST /api/invitados`. Responde `{"leidas", "enroladas", "detalle": [...]}`. Una invitación mala no frena las demás.

### Voz

**`POST /api/voz?lang=<idioma actual>`**. Cuerpo: audio. Usa Whisper local (`small`, CPU).
```json
{"texto": "Hello, where is the restroom?", "idioma": "en", "confianza": 0.99, "cambio_idioma": true,
 "intencion": "bano", "respuesta": "The restrooms are to the right of the lobby, next to reception."}
```
- **Idioma:** detecta entre es, en, zh y pt, y solo cambia si la detección es segura (≥ 0.7). Una palabra suelta no cambia el idioma.
- **Intenciones:**
  - comandos (sin `respuesta`; los ejecuta el cliente): `iniciar`, `detener`, `volver`, `enrolamiento`, `validacion`, `evaluar`;
  - preguntas y frases (con `respuesta`): `bano`, `restaurante`, `recepcion`, `ayuda`, `gracias`, `saludo`, `invitado`, `trabajo`, `servicio`, `sin_documento`, `no_entiendo` (si viene en otro idioma, pasa a ese idioma y explica);
  - otras: `vip`, `socio`, `nombre` (con `"nombre": "Ana Perez"`), `no_entendi`.
- Si no se oyó nada útil: `texto: ""` e `intencion: null`.

**`GET /api/textos?lang=`**: todas las frases que Cerberus le dice al visitante en ese idioma (flujos por rol, petición
de documento, pistas, respuestas de voz). Sirve para que otra interfaz o el robot hablen igual.

### Pases QR

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/pases/{id}.png?variante=valido\|vencido\|alterado&horas=48` | Pase firmado como imagen, listo para el celular |
| POST | `/api/pases/generar?horas=48` | Rehace `pases/`: un PNG por persona, dos de prueba (vencido y alterado) y un PDF con todos |

Formato del QR: `NCLUB1|<tipo>|<id>|<nombre>|<vence unix>|<firma HMAC-SHA256[:20]>`. El secreto viene de `CERBERUS_QR_SECRET`; ver `robotA/vision/qr_pass.py`.

### Registro (log) y base de datos externa

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/registros?limit=50` | Últimos registros, del más nuevo al más viejo (máximo 1000) |
| GET | `/api/registros/descargar?formato=csv\|json` | Todo el log como archivo |
| POST | `/api/registros/reenviar` | Reintenta enviar a la base externa los que no se enviaron: `{"intentados", "pendientes"}` |
| GET | `/api/config` | `{"url", "token_configurado", "invitados_url", "invitados_token_configurado"}` |
| PUT | `/api/config` | `{"url"?, "token"?, "invitados_url"?, "invitados_token"?}`: solo cambia lo que se manda. También con las variables `CERBERUS_DB_URL`, `CERBERUS_DB_TOKEN`, `CERBERUS_INVITADOS_URL` y `CERBERUS_INVITADOS_TOKEN`. |

Cada registro nuevo se envía a `url` como **`POST` JSON** (timeout de 5 s, con `Authorization: Bearer <token>` si hay
token). Cualquier respuesta 2xx lo marca como enviado; si no, queda pendiente con el error.
```json
{"id": "9f2c…", "fecha": "2026-10-24T01:12:03+00:00", "camara": "web", "estado": "RECONOCIDO", "persona_id": "gabriel",
 "nombre": "Gabriel", "rol": "VIP", "miembro": 1, "confianza": 0.91, "coseno": 0.71, "idioma": "es",
 "accion": "¡Bienvenido de nuevo, Gabriel! …", "modelo": "yolov11n-face + YuNet(puntos) + SFace 2021dec"}
```
`estado` puede ser `RECONOCIDO`, `CONFIRMADO_CEDULA`, `CONFIRMADO_QR` o `ESCALAMIENTO`. El log nunca guarda imágenes ni
el número completo de la cédula.

## Ejemplos

```bash
curl -s localhost:8000/api/salud
curl -s -X POST --data-binary @foto.jpg -H 'Content-Type: image/jpeg' 'localhost:8000/api/identificar?camara=robot&lang=en'
curl -s -X POST --data-binary @frase.wav 'localhost:8000/api/voz?lang=es'
curl -s -X POST -H 'Content-Type: application/json' localhost:8000/api/invitados \
  -d "{\"nombre\":\"Laura Diaz\",\"anfitrion\":\"andres\",\"foto_base64\":\"$(base64 -i laura.jpg)\",\"valido_hasta\":\"2026-10-25\"}"
curl -s -X PUT -H 'Content-Type: application/json' localhost:8000/api/config -d '{"url":"https://mi-db.ejemplo.com/visitas","token":"..."}'
```

```python
import requests                          # cliente minimo (p. ej. el host del robot, con un tunel a la maquina de la API)
API = 'http://127.0.0.1:8000'
r = requests.post(f'{API}/api/identificar', params={'camara': 'x2', 'lang': 'es'}, data=jpeg_bytes,
                  headers={'Content-Type': 'image/jpeg'}).json()
if r['decision'] and r['decision'].get('registrado'):
    decir(r['decision']['accion'])       # en el X2: PlayTts o audio PCM (ver plan.md)
```

## Dónde está cada cosa

| Archivo | Contenido |
|---|---|
| `web/app.py` | La API (FastAPI) |
| `web/textos.py` | Frases para el visitante en 4 idiomas |
| `web/voz.py` | Whisper e intenciones |
| `documentos.py` | Pase QR, cédula amarilla y cédula digital |
| `qr_lector.py` | Lector de QR |
| `yolo_face.py` | YOLO-face + SFace |
| `captura/capturar.py` | Selección anti-duplicados, evaluación, export YOLO |
| `robotA/vision/` | Calidad, veredicto, pases firmados |
| `web/test_api.py` | Prueba de toda la API sin cámara: `python web/test_api.py CARA1.jpg CARA2.jpg` |
