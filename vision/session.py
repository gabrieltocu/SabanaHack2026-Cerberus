"""Sesion de verificacion de UNA persona frente al robot: rostro -> reintento guiado -> pase QR -> tercero ->
recepcion. Separada de la camara para poder probarla con imagenes (test_session.py).

feed(frame, now) devuelve lo que hay que mostrar/decir; cuando la verificacion termina deja `result`
(lo que consume el cerebro).
"""
from verify import MIN_FRAMES, Obs, decide, next_step
import qr_pass
from club_facial import club_says
from quality import assess

QR_TIMEOUT = 20.0      # s esperando el pase
GONE_AFTER = 2.5       # s sin rostro => la persona se fue, se reinicia


class Session:
    def __init__(self, engine, gallery, socios, cal):
        self.engine, self.gallery, self.socios, self.cal = engine, gallery, socios, cal
        self.reset()

    def reset(self):
        self.stage = 'rostro'           # rostro | qr | tercero | fin
        self.obs, self.retries = [], 0
        self.verdict, self.result = None, None
        self.qr_since, self.last_face = None, None
        self.message = 'Bienvenido. Mire a la camara, por favor.'

    def _finish(self, metodo, step, qr=None):
        v = self.verdict
        ident = dict(person_id=v.person_id, name=v.name, conf=0.0)
        if qr and qr.get('ok'):
            ident = dict(person_id=qr['persona_id'], name=qr['nombre'], conf=1.0)
        self.result = dict(
            resultado='verificado' if step == 'continuar' else 'escalado_recepcion', metodo=metodo,
            persona_id=ident['person_id'], nombre=ident['name'], veredicto_rostro=v.state, cos=round(v.cos, 3),
            reintentos=self.retries, pase=(qr or {}).get('tipo'), motivo_pase=(qr or {}).get('motivo'),
            club=club_says(dict(ident, conf=max(ident['conf'], 0.0)), self.socios))
        self.stage = 'fin'
        self.message = (f'Verificado: {ident["name"]} ({metodo})' if step == 'continuar'
                        else 'Un momento por favor, ya lo atiende recepcion')

    def third_party(self, answer):
        """Respuesta del anfitrion/supervisor (en la demo: tecla). answer: True/False."""
        if self.stage == 'tercero':
            self._finish('tercero', next_step(self.verdict, self.retries, qr='sin_qr', third_party=answer, cal=self.cal))

    def no_qr(self):
        """La persona dice que no tiene pase."""
        if self.stage == 'qr':
            self.stage = 'tercero'
            self.message = 'Consultando con su anfitrion o supervisor...'

    def feed(self, frame, now):
        faces = self.engine.faces(frame)
        if faces:
            self.last_face = now
        elif self.last_face is not None and now - self.last_face > GONE_AFTER:
            self.reset()
            return self.message
        if self.stage == 'rostro':
            if faces:
                f = faces[0]
                q = assess(frame, f)
                ident = self.gallery.identify(f['emb'], self.cal)
                self.obs.append(Obs(len([g for g in faces if g['box'][2] > 0.6 * f['box'][2]]), q, ident))
            else:
                self.obs.append(Obs(0))
            if len(self.obs) >= MIN_FRAMES:
                self.verdict = decide(self.obs, self.cal)
                step = next_step(self.verdict, self.retries, cal=self.cal)
                self.obs = []
                if step == 'continuar':
                    self._finish('rostro', step)
                elif step == 'reintento_guiado':
                    self.retries += 1
                    self.message = ' / '.join(self.verdict.hints) or 'Mire a la camara, por favor'
                elif step == 'pedir_qr':
                    self.stage, self.qr_since = 'qr', now
                    self.message = 'No logro confirmarlo. Por favor muestreme su pase QR (app, invitacion, carne u orden de trabajo).'
        elif self.stage == 'qr':
            text = qr_pass.read(frame)
            if text:
                qr = qr_pass.validate(text)
                self._finish('qr', next_step(self.verdict, self.retries, qr=qr, cal=self.cal), qr)
            elif now - self.qr_since > QR_TIMEOUT:
                self.no_qr()
        return self.message
