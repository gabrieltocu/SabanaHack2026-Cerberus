# Fotos de cédulas para identificar (Cerberus)

Una carpeta por persona, con el **mismo id** que tiene en `/captura` (por ejemplo `gabriel/`, `andres/`).
Dentro, una o más fotos de **su** cédula: JPG, PNG o HEIC (directo del iPhone).

| Cédula | Qué foto sirve | Qué se lee |
|---|---|---|
| Digital | el **frente**, completo y sin reflejos | el número (NUIP) con OCR, y la cara impresa |
| Amarilla | el **reverso** (código de barras PDF417) y, si quieres, el frente | el número del código de barras; la cara del frente |

Al arrancar (`./run.sh`) se leen todas solas. Para releer sin reiniciar: `curl -X POST localhost:8000/api/identificacion/procesar`.
También se pueden subir desde `/captura` → «Foto de la cédula».

Qué se hace con cada foto:
1. El número de cédula queda registrado en la persona (`datos/personas.json`): ya no hay que escribirlo a mano.
2. La cara impresa en la cédula queda como referencia (`datos/identificacion.npz`). Si la persona no tiene fotos en la
   galería y se identifica con su cédula, su cara en vivo se compara con la de la cédula.

Borrar una foto y volver a procesar la olvida. Las fotos de esta carpeta no se suben a git (`.gitignore`).
