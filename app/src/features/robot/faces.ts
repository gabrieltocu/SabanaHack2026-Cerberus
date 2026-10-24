// «Rostro simulado» options of the presenter. Each one is the facial signal the recognition
// service would send for a directory person (docs/api/CONTRACT.md §3); the API decides the rest.
import type { FaceSignal } from '../../infrastructure/contracts';

export type SimulatedFace = { id: string; label: string; signal: FaceSignal };

const match = (
  candidateId: string,
  classHint: 'MEMBER' | 'NON_MEMBER',
): Extract<FaceSignal, { status: 'MATCH' }> => ({
  status: 'MATCH',
  classHint,
  candidateId,
  confidence: 0.97,
});

export const FACES: readonly SimulatedFace[] = [
  { id: 'andres', label: 'Andrés · miembro', signal: match('V-201', 'MEMBER') },
  { id: 'camila', label: 'Camila · miembro', signal: match('V-202', 'MEMBER') },
  { id: 'valentina', label: 'Valentina · no miembro', signal: match('V-203', 'NON_MEMBER') },
  { id: 'mario', label: 'Mario · no miembro', signal: match('V-204', 'NON_MEMBER') },
  { id: 'laura', label: 'Laura · no miembro', signal: match('V-205', 'NON_MEMBER') },
  { id: 'daniela', label: 'Daniela · socia y personal', signal: match('V-206', 'MEMBER') },
  { id: 'esteban', label: 'Esteban · membresía suspendida', signal: match('V-207', 'MEMBER') },
  { id: 'ivan', label: 'Iván · membresía vencida', signal: match('V-208', 'MEMBER') },
  { id: 'male', label: 'Male · miembro', signal: match('V-209', 'MEMBER') },
  { id: 'paula', label: 'Paula · sin turno hoy', signal: match('V-210', 'NON_MEMBER') },
  { id: 'unknown', label: 'Rostro desconocido', signal: { status: 'UNKNOWN' } },
  {
    id: 'error',
    label: 'Error de cámara',
    signal: { status: 'ERROR', code: 'CAMERA_UNAVAILABLE' },
  },
];
