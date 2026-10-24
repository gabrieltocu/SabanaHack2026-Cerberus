// Display labels (docs/design/screens.md §0.5–0.6).
import type { Category } from '../../domain/entities/types';
import type { HandoffState } from '../../domain/entities/visit';
import type { BadgeKind } from '../../design-system';

export const CATEGORY_LABEL: Record<Category, string> = {
  VIP: 'Socio VIP',
  REGULAR: 'Socio regular',
  GUEST: 'Invitado',
  STAFF: 'Personal del club',
  EXTERNAL: 'Trabajador externo',
};

export const HANDOFF_LABEL: Record<HandoffState, string> = {
  REQUESTED: 'Solicitado',
  ACCEPTED: 'Aceptado',
  CONTEXT_TRANSFERRED: 'Contexto recibido',
  CONFIRMED: 'Confirmado',
  EXPIRED: 'Vencido',
  CANCELLED: 'Cancelado',
};

export const HANDOFF_BADGE: Record<HandoffState, BadgeKind> = {
  REQUESTED: 'warning',
  ACCEPTED: 'info',
  CONTEXT_TRANSFERRED: 'info',
  CONFIRMED: 'success',
  EXPIRED: 'neutral',
  CANCELLED: 'neutral',
};
