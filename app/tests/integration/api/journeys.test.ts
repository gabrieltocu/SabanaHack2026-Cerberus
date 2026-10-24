// Recorridos completos contra `createApp` con almacén en memoria y reloj fijo.
import { flows } from '../../support/api-flows';
import { setup } from '../../support/api-harness';

describe('recorridos de la API (almacén en memoria, reloj fijo)', () => {
  test('(a) VIP por rostro -> VERIFIED VIP', () => flows.vipByFace(setup()));
  test('(b) invitación -> QR -> GRANTED -> reutilizar da QR_ALREADY_USED', () =>
    flows.inviteAndUseQr(setup()));
  test('(c) externa el sábado GRANTED; reiniciada en martes DENIED', () =>
    flows.externalSaturdayVersusTuesday(setup()));
  test('(d) rostro desconocido -> MANUAL_REVIEW -> QR con visitId -> MERGED', () =>
    flows.unknownFaceThenQr(setup()));
  test('(e) falla de R2 -> relevo -> accept concurrente -> contexto -> confirmar -> cerrar', () =>
    flows.robotFailureHandoff(setup()));
  test('(f) idempotencia', () => flows.idempotency(setup()));
  test('(g) límite de tasa', () => flows.rateLimit(setup()));
  test('(h) 415 sin JSON', () => flows.unsupportedMediaType(setup()));
  test('(i) respuesta perdida: confirm repetido no duplica', () => flows.lostResponse(setup()));
});
