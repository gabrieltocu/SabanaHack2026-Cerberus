# Handoff — Juan (Cerberus) on the AgiBot X2 Ultra · 24-oct-2026

Read first: `README.md` (how to run, interaction features) and `robot/trabajo.md` (robot details).
The user writes in English or Spanish. Juan speaks Spanish by default. Work only on this Mac.

## Rules the user set (keep them)
- No Claude attribution (Co-Authored-By / "Generated with Claude Code") in commits or PRs. Do not push
  goodRobot or niceLLM anywhere: private to this Mac. SabanaHack2 is now a git repo: the user asked (24-oct) to push
  all of it, data included, to branch `juan-x2-caminar` of the private github.com/andresazcona/SABANAHACK2026.
  Only `rag/robot_llm/*.tar.zst` (Ollama binaries, >100 MB) stays out. Ask before pushing anywhere else.
- On the robot, everything we create is stored **encrypted** (gpg vault, `robot/deploy/boveda.sh`).
  - The vault passphrase is never written to a file, a log, argv or a tool command.
  - The user types it in their own Terminal: `cd robot && ./goodRun.sh --orin`.
- Never touch on the robot: `~/x2_ultra`, `~/.docker`, `/home/agi/aimdk`, `~/.ssh/backdoor.pub`, `~/.ssh/known_hosts`.
  - Don't unmask Docker or change vendor services.
  - Don't delete things on the robot without asking.
- Always the factory voice (PlayTts) and the robot's own microphones.
- **Ask the user before making the robot walk** (they asked explicitly).

## How to run / test (from `robot/`, conda env `cerberus`)
```bash
source /opt/homebrew/Caskroom/miniconda/base/etc/profile.d/conda.sh; conda activate cerberus
./goodRun.sh            # RAG (n8n+Ollama) + brain :8000 + client deployed to the robot (/dev/shm/cerberus) + panel
./goodRun.sh --parar    # stop everything
python x2/cerberus_x2.py --autotest
python web/voz.py
python web/test_api.py datos/dataset/andres/00.jpg datos/dataset/gabriel/00.jpg
```
- Robot log: `curl -s 127.0.0.1:8000/api/robot/estado` (field `lineas`).
- Live camera frame: `curl 127.0.0.1:8000/api/camaras/x2.jpg`; faces it sees: `GET /api/camaras`.
- Telemetry: `GET /api/robot/telemetria`.

## Main files
| File | Role |
|---|---|
| `robot/x2/cerberus_x2.py` | Robot client (ROS 2 on the Orin, 10.0.1.41, user `run`). Gestures (`GESTOS`, `ENTRADA`, `GESTO_VOZ`, `DIRECCION`/`TONO` word→gesture), `ApiBrain` (greeting memory `saludados`/`recordar`, `RECUERDA_S`=900 s, `CHARLANDO_S`), mic VAD (`MicVad`), LED/eyes (`vida`), telemetry (also syncs the language from the brain) |
| `robot/web/app.py` | Brain (FastAPI). `identify_frame` + `con_acompanantes` (several known faces → greets all, also when the closest face is unknown/turned away), birthday (`personas.json` `"cumple": "MM-DD"`), `PUT/GET /api/idioma`, `/api/voz` (language fixed, no auto-detect) |
| `robot/web/voz.py` | Whisper (mlx large-v3-turbo on the Mac GPU), intents, `repetir` when Whisper is unsure (`DUDOSA_LP=-0.6`) or a phrase isn't understood, prompt-echo / loop filter in `_text` |
| `robot/web/textos.py` | All spoken texts in es/en/zh/pt. Spanish now uses **usted** consistently and gender-neutral greetings |
| `robot/web/rag.py`, `rag/Modelfile`, `rag/n8n/juan_rag.json` | RAG: n8n + `juan-deepseek` (DeepSeek R1 7B). Answers are now 1 sentence |
| `robot/x2/caminar.py` | Walk on the robot: `--metros N --si` (straight, open loop, 0.3 m/s, stops if the lidar sees < 1 m), `--manual --si` (stdin lines w/s/a/d, each lasts 0.4 s; forward blocked by the lidar). Refuses unless McCommonState action is 200/201/300-302 (standing/walking). SIGINT/TERM/HUP → 0.5 s of zero velocity. No args = state only |
| `robot/deploy/caminar.sh` | Copies `caminar.py` to `/dev/shm/cerberus/x2/` and runs it over `ssh -tt` with ROS + aimdk sourced; args pass through |
| `robot/deploy/limpiar_robot.sh` | Removes everything we left on the robot (see "Robot state" below) |
| `robot/datos/personas.json` | People: gabriel VIP, andres REGULAR, thomas REGULAR (`cumple: 10-24`), vale EXTERNO |

## Done this session (all tests passing)
- Juan says his name in 4 languages ("¿Cómo te llamas?") and puts a hand on his chest.
- Gestures follow the words, not random. Two known people are greeted together, with a handshake for each.
- **Language:**
  - Spanish by default; only the app changes it (`PUT /api/idioma {"idioma":"en"}`).
  - The robot picks it up within 5 s via the telemetry reply.
  - Not persisted.
- Greeting memory: no re-greeting while the person is seen or talking, and for 15 min after.
- While chatting, a bad face frame doesn't trigger ID prompts.
- Asks to repeat instead of guessing. Pending phrases are queued, not dropped.
- VAD waits 1 s of silence. Fixed `' id'` matching "ido".
- **Vale fix (in code, NOT yet seen on the robot):**
  - Vale was seen and recognized (cos 0.64) but seated far away.
  - The closest face (a man with his back to the camera) got the decision → SIN_CALIDAD → "Míreme a los ojos".
  - Now any face that is sure in ≥ half of the 8-frame window gets greeted (`seguros` in `identify_frame`).
- Thomas birthday:
  - "¡Y feliz cumpleaños, Thomas! …" is added to his greeting.
  - Gestures: greet → handshake → heart (`corazon` 1007:3) → point.
  - Adoring eyes on the face screen (emoji 200).
- Spanish texts rewritten to usted.

## Session 2 (24-oct, ~09:00): Walk panel
- `/robot` has a **Caminar / Walk** panel (es/en/zh/pt): meters box (0.1–5) + **Walk automatically** (asks to confirm), **Manual** (hold ▲▼◀▶ buttons; the page resends the key every 150 ms) and **Stop**.
- API in `web/app.py`: `GET/POST /api/robot/caminar` (`{"metros": 3}` or `{"manual": true}`), `POST /api/robot/caminar/tecla` (`{"tecla": "w|s|a|d"}`), `POST /api/robot/caminar/parar`. Its own process slot (`paseo`), so reception keeps running while walking. Output goes to the panel log with the `[caminar]` prefix (DDS noise filtered). STOP EVERYTHING also stops it (`pkill -INT caminar.py` on the robot).
- Tested: endpoint validation, page/i18n served, state-only run on the robot over ssh worked:
  `modo: STAND_DEFAULT (estado 100) · FSM SAFE · accion 0 · delante: 0.70 m · lidar OK`.
- **Never actually walked** (rule: ask first). With FSM SAFE / action 0 both modes will refuse; stand it up with the remote/app first.
  - Doubt: GetMcAction says STAND_DEFAULT while McCommonState says action 0. If it's standing and still refused, the `DE_PIE` check in `caminar.py` reads the wrong field.
  - Something was 0.70 m in front of the lidar (auto mode would refuse for 3 m).

## Robot state at the end of session 2
- Everything stopped (`./goodRun.sh --parar`): brain, n8n/RAG, robot client, tunnels.
- **Robot cleanup NOT done yet** (the agent's auto mode blocked the remote delete). The user must run it:
  `cd robot && ./deploy/limpiar_robot.sh` (asks nothing; last step removes this Mac's ssh key).
  It removes only our things, all created today from 02:05: `/dev/shm/cerberus`, `/dev/shm/juan`, `~/.cerberus` (1.6 GB of the
  public LLM weights, partial; no vault was saved), `~/aimdk`, `~/aimdk.anterior` (our earlier SDK copy), `~/.aima`, `~/log`, `~/.ros`, and the
  `gabriel@MacbookBradPitt` line in `~/.ssh/authorized_keys`. Not touched: the never-touch list, `.bash_history`/`.viminfo` (from September, not ours),
  the fastrtps files in `/dev/shm` (shared with vendor DDS; gone on reboot).
- After cleanup, `./goodRun.sh` re-uploads the SDK by itself and asks the robot password once for the ssh key; `--orin` re-uploads the ~6 GB weights.
- Mac side kept on purpose (this folder, conda env, Docker n8n volume, Ollama models).
- Also stopped on the Mac: the Ollama brew service (`brew services start ollama` before `./goodRun.sh`) and old brains on
  :8001 (`SabanaHack/work_with_aws/cerberusAWS`) and :8003.

## Pending / next steps
1. **Verify on the robot** the last changes (Vale, birthday, Spanish texts); they were deployed at the end of the session:
   `./goodRun.sh`, then watch the log.
2. **The LLM's Spanish is bad.** DeepSeek R1 7B produces things like "Siento lo sorry" and "juárgalo".
   - `qwen2.5:7b` was being pulled in the background to compare.
   - Recommendation: test it (`ollama run qwen2.5:7b`), and if it's clearly better, ask the user before switching
     `FROM` in `rag/Modelfile`. The model name `juan-deepseek` is used in `rag.sh`, `rag.py`, `juan_rag.json` and
     `boveda.sh`.
   - Also check the n8n few-shot examples in "Armar pedido" for tú→usted.
3. **Walk 3 m forward: implemented (panel + `x2/caminar.py`, see Session 2), NOT executed; ask the user first.** Notes from the research:
   - Official topic `/aima/mc/locomotion/velocity` (`McLocomotionVelocity`: `source`, `forward_velocity` m/s,
     `lateral_velocity`, `angular_velocity`). Publish at 50 Hz; it zeroes after 200 ms without a message and goes back
     to Stable Stand after 2 s.
   - You must register an input source first, as in the SDK example `py_examples/mc_locomotion_velocity.py`:
     `SetMcInputSource` ADD/ENABLE, priority 40, timeout 1000. The client already registers `node.cerberus` for gestures.
   - The robot must be in Stable Stand / locomotion: `SetMcAction` `STAND_DEFAULT` / `LOCOMOTION_DEFAULT`
     (see `py_examples/set_mc_action.py`).
   - **The last telemetry said FSM=4 (SAFE), action 0, alerts X2505002 and X2802003.** In that state walking will
     likely be refused; the user may need the remote or app to stand it up.
   - It is open loop (no endpoint accuracy). For 3 m: about 0.3 m/s for about 10 s.
   - Stop early if the front lidar sees < 0.8 m (`cerca_del_lidar` already exists in the client).
   - For an exact distance the SDK recommends the navigation interface (needs a map).
   - SDK docs: `SabanaHack/deploy/goodRobot/robot_sdk/aimdk-sdk-v1_1_0.zip` →
     `docs/cn/_build/html/en/dev/Interface/control_mod/locomotion.html`.
4. **Orin LLM vault.** The user must run `./goodRun.sh --orin` themselves (passphrase). The public weights upload was
   interrupted at about 1.6/6 GB; it resumes on its own.
5. **Thresholds to tune with real use:**
   - `DUDOSA_LP` (if he asks to repeat too often or too rarely);
   - `RECUERDA_S`;
   - the face-size filter `min_cara`.
6. A second unknown face next to a known one isn't greeted; the LLM only gets the first person's context.
