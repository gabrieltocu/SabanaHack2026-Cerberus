// Las respuestas reales de los recorridos de integración se validan contra los esquemas Zod del
// contrato (el arnés lo hace en cada llamada): cualquier deriva entre código y contrato rompe aquí.
import { flows } from '../support/api-flows';
import { setup } from '../support/api-harness';

describe('respuestas reales de la API cumplen el contrato', () => {
  test.each(Object.entries(flows))('recorrido %s', (_name, flow) => flow(setup()));
});
