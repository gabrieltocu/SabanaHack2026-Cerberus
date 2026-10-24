// Comun a /captura, /identificar y /confirmar: idioma, API, camara, dibujo y voz manos libres.
// Necesita i18n.js antes. Cada pagina llama initComun({onVoz}) y usa t('clave', {datos}).
const IDIOMAS = {es: 'Español', en: 'English', zh: '中文', pt: 'Português'};
const VOCES = {es: 'es-MX', en: 'en-US', zh: 'zh-CN', pt: 'pt-BR'};
const ROL_COLOR = {VIP: '--vip', REGULAR: '--regular', INVITADO: '--invitado', PERSONAL: '--personal',
  EXTERNO: '--externo', ESCALAMIENTO: '--escalamiento', POR_CONFIRMAR: '--porconfirmar'};
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const rolColor = (rol) => css(ROL_COLOR[rol] || '--muted');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// ---------- idioma ----------
const store = {  // localStorage puede no existir (ventana privada, perfil bloqueado): nunca rompe la pagina
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento: no se recuerda */ } },
};
let LANG = (() => {
  const q = new URLSearchParams(location.search).get('lang');
  return [q, store.get('cerberus.lang')].find((l) => l in IDIOMAS) || 'es';   // espanol por defecto, no el del navegador
})();
function t(key, data = {}) {
  const s = (I18N[LANG] && I18N[LANG][key]) ?? I18N.es[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => data[k] ?? '');
}
const rolName = (rol) => t('rol.' + rol);
function applyI18n() {
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  const sel = document.getElementById('lang'); if (sel) sel.value = LANG;
}
const langListeners = [];
function setLang(l) {
  if (!(l in IDIOMAS) || l === LANG) return;
  LANG = l; store.set('cerberus.lang', l); applyI18n(); langListeners.forEach((f) => f(l));
}

// ---------- API: siempre con el idioma actual ----------
async function api(method, url, body) {
  const u = new URL(url, location.origin);
  if (u.pathname.startsWith('/api/') && !u.searchParams.has('lang')) u.searchParams.set('lang', LANG);
  const opts = {method, headers: {}};
  if (body instanceof Blob) { opts.body = body; opts.headers['Content-Type'] = body.type || 'application/octet-stream'; }
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(u, opts);
  const data = r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw Object.assign(new Error(data?.detail ? (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)) : `HTTP ${r.status}`), {status: r.status});
  return data;
}

// ---------- camara ----------
class Camara {
  constructor(video, overlay) { this.video = video; this.overlay = overlay; this.grab = document.createElement('canvas'); }
  async start() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error(t('cam.no_api'));
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({video: {width: {ideal: 1280}, height: {ideal: 720}, facingMode: 'user'}, audio: false});
    } catch (e) {
      throw new Error(e.name === 'NotAllowedError' ? t('cam.denegada') : t('cam.error', {e: e.message}));
    }
    this.video.srcObject = this.stream;
    await this.video.play();
    this.overlay.width = this.video.videoWidth; this.overlay.height = this.video.videoHeight;
  }
  stop() { this.stream?.getTracks().forEach((tr) => tr.stop()); this.stream = null; this.clear(); }
  frame() {  // JPEG del frame actual, sin espejo (el espejo es solo visual, por CSS)
    const v = this.video; this.grab.width = v.videoWidth; this.grab.height = v.videoHeight;
    this.grab.getContext('2d').drawImage(v, 0, 0);
    return new Promise((res) => this.grab.toBlob(res, 'image/jpeg', 0.85));
  }
  clear() { this.overlay.getContext('2d').clearRect(0, 0, this.overlay.width, this.overlay.height); }
  box([x, y, w, h], color, label) {
    const c = this.overlay.getContext('2d');
    c.lineWidth = 4; c.strokeStyle = color; c.strokeRect(x, y, w, h);
    if (!label) return;
    c.save(); c.scale(-1, 1);  // el canvas va en espejo: el texto se dibuja des-espejado
    c.font = '600 22px -apple-system, "PingFang SC", sans-serif';
    const tw = c.measureText(label).width + 12;
    c.fillStyle = color; c.fillRect(-(x + w), y - 30, tw, 28);
    c.fillStyle = '#fff'; c.fillText(label, -(x + w) + 6, y - 9);
    c.restore();
  }
}

// ---------- hablar (TTS del navegador, en el idioma actual) ----------
let speakingUntil = 0;
// Voces naturales por idioma, en orden (macOS, Chrome/Google en Linux, Windows). La primera voz "en-US" que da Chrome
// en macOS suele ser una de juguete (Eddy, Albert, Zarvox...): suena fea y baja.
const PREFERIDAS = {
  en: ['Samantha', 'Ava', 'Allison', 'Susan', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Alex', 'Karen', 'Daniel'],
  es: ['Paulina', 'Mónica', 'Monica', 'Google español de Estados Unidos', 'Google español', 'Microsoft Sabina', 'Jorge', 'Juan'],
  pt: ['Luciana', 'Google português do Brasil', 'Microsoft Francisca', 'Felipe', 'Joana'],
  zh: ['Tingting', 'Ting-Ting', 'Google 普通话（中国大陆）', 'Microsoft Xiaoxiao', 'Meijia', 'Sinji'],
};
const JUGUETE = /\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Junior|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Ralph|Fred|Kathy|Grandma|Grandpa|Eddy|Flo|Reed|Rocko|Sandy|Shelley)\b/;
function elegirVoz(lang, voces = speechSynthesis.getVoices()) {
  const delIdioma = voces.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang) && !JUGUETE.test(v.name));
  const calidad = (v) => (/Premium|Enhanced|Mejorad|Natural|Neural/.test(v.name) ? 0 : 1);   // las mejoradas primero
  for (const nombre of PREFERIDAS[lang] || []) {
    const v = delIdioma.filter((x) => x.name.startsWith(nombre)).sort((a, b) => calidad(a) - calidad(b))[0];
    if (v) return v;
  }
  return delIdioma.find((v) => v.lang.replace('_', '-').startsWith(VOCES[lang])) || delIdioma[0] || null;
}
if ('speechSynthesis' in window) speechSynthesis.getVoices();   // Chrome carga la lista de voces de forma asincrona

function hablar(texto, lang = LANG) {
  if (!('speechSynthesis' in window) || !texto) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = VOCES[lang];
  u.voice = elegirVoz(lang);
  u.volume = 1; u.rate = 1; u.pitch = 1;
  u.onend = () => { speakingUntil = Date.now() + 500; };  // que el microfono no oiga el final del eco
  speakingUntil = Date.now() + 60000;
  speechSynthesis.speak(u);
}

// ---------- escuchar (manos libres): detecta cuando alguien habla y manda ese pedazo a /api/voz ----------
class Escucha {
  constructor(onResult, onState) { this.onResult = onResult; this.onState = onState; this.enabled = store.get('cerberus.voz') !== 'off'; }
  async start() {
    if (this.ctx || !this.enabled) return;
    this.stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}});
    this.ctx = new AudioContext();                         // frecuencia nativa del microfono: Whisper remuestrea solo
    this.block = 2048 / this.ctx.sampleRate;                 // segundos por bloque (~43 ms a 48 kHz)
    const src = this.ctx.createMediaStreamSource(this.stream);
    const proc = this.ctx.createScriptProcessor(2048, 1, 1);
    src.connect(proc); proc.connect(this.ctx.destination);
    this.floor = 0.01; this.pre = []; this.chunks = null; this.loud = 0; this.quiet = 0; this.busy = false;
    proc.onaudioprocess = (e) => this.feed(new Float32Array(e.inputBuffer.getChannelData(0)));
    this.onState(this.ctx.state === 'running' ? 'escuchando' : 'suspendido');
  }
  async resume() { if (this.ctx?.state === 'suspended') { await this.ctx.resume(); this.onState('escuchando'); } }
  stop() { this.stream?.getTracks().forEach((tr) => tr.stop()); this.ctx?.close(); this.ctx = null; this.onState('apagado'); }
  toggle() { this.enabled = !this.enabled; store.set('cerberus.voz', this.enabled ? 'on' : 'off'); this.enabled ? this.start() : this.stop(); }
  feed(buf) {
    let sum = 0; for (const v of buf) sum += v * v;
    const rms = Math.sqrt(sum / buf.length);
    if (this.busy || Date.now() < speakingUntil || speechSynthesis.speaking || this.paused) {  // no oirse a si mismo
      this.chunks = null; this.pre = []; this.loud = 0; return;
    }
    const thr = Math.max(0.012, this.floor * 3);
    if (!this.chunks) {
      this.floor = 0.97 * this.floor + 0.03 * Math.min(rms, 0.05);   // ruido de fondo
      this.pre.push(buf); if (this.pre.length * this.block > 0.4) this.pre.shift();   // 0.4 s antes de que empiece a hablar
      this.loud = rms > thr ? this.loud + 1 : 0;
      if (this.loud * this.block >= 0.12) { this.chunks = [...this.pre]; this.quiet = 0; this.onState('oyendo'); }
      return;
    }
    this.chunks.push(buf);
    this.quiet = rms < thr * 0.7 ? this.quiet + 1 : 0;
    const secs = this.chunks.length * this.block;
    if (this.quiet * this.block >= 0.8 || secs > 8) {     // 0.8 s de silencio, o 8 s maximo
      const chunks = this.chunks; this.chunks = null; this.pre = []; this.loud = 0;
      if (secs - this.quiet * this.block >= 0.35) this.send(chunks); else this.onState('escuchando');
    }
  }
  async send(chunks) {
    this.busy = true; this.onState('procesando');
    try { this.onResult(await api('POST', '/api/voz', wav(chunks, this.ctx.sampleRate))); }
    catch (e) { console.warn('voz:', e.message); }
    finally { this.busy = false; this.onState('escuchando'); }
  }
}
function wav(chunks, rate) {  // PCM 16 bits mono
  const n = chunks.reduce((a, c) => a + c.length, 0), buf = new ArrayBuffer(44 + n * 2), d = new DataView(buf);
  const str = (o, s) => [...s].forEach((ch, i) => d.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); d.setUint32(16, 16, true);
  d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, rate, true); d.setUint32(28, rate * 2, true);
  d.setUint16(32, 2, true); d.setUint16(34, 16, true); str(36, 'data'); d.setUint32(40, n * 2, true);
  let o = 44; for (const c of chunks) for (const v of c) { d.setInt16(o, Math.max(-1, Math.min(1, v)) * 0x7fff, true); o += 2; }
  return new Blob([buf], {type: 'audio/wav'});
}

// ---------- barra comun: idioma + voz; resultado de voz -> pagina ----------
let escucha;
function initComun({onVoz} = {}) {
  const tools = document.getElementById('tools');
  tools.innerHTML = `<label class="tool"><span data-i18n="lang"></span>
      <select id="lang">${Object.entries(IDIOMAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    <button id="vozBtn" class="secondary small" aria-pressed="true"></button><span id="vozEstado" class="muted small" aria-live="polite"></span>`;
  document.getElementById('lang').onchange = (e) => setLang(e.target.value);
  const out = document.getElementById('vozOut');
  const estado = (s) => {
    const btn = document.getElementById('vozBtn');
    btn.textContent = t(escucha?.enabled ? 'voz.on' : 'voz.off'); btn.setAttribute('aria-pressed', String(!!escucha?.enabled));
    document.getElementById('vozEstado').textContent = {escuchando: t('voz.escuchando'), oyendo: '● ' + t('voz.escuchando'),
      procesando: t('voz.procesando'), suspendido: t('voz.activar')}[s] || '';
    document.getElementById('activar').hidden = s !== 'suspendido';
  };
  escucha = new Escucha(async (r) => {
    if (!r.texto) return;
    if (r.cambio_idioma) setLang(r.idioma);
    if (out) { out.hidden = false; out.textContent = t('voz.oido', {texto: r.texto}) + (r.respuesta ? '\n' + r.respuesta : ''); }
    const handled = onVoz ? await onVoz(r) : false;
    if (!handled && r.respuesta) hablar(r.respuesta, r.idioma);
  }, estado);
  langListeners.push(() => estado(escucha.ctx ? (escucha.ctx.state === 'running' ? 'escuchando' : 'suspendido') : 'apagado'));
  document.getElementById('vozBtn').onclick = () => escucha.toggle();
  // Sin un gesto del usuario el navegador no deja sonar ni oir: el primer toque en cualquier parte lo activa
  const unlock = () => { escucha.resume(); document.dispatchEvent(new Event('cerberus:activado')); };
  document.addEventListener('pointerdown', unlock, {once: true}); document.addEventListener('keydown', unlock, {once: true});
  applyI18n();
  escucha.start().catch((e) => { document.getElementById('vozEstado').textContent = t('voz.sin_mic', {e: e.message}); });
  estado('apagado');
}
