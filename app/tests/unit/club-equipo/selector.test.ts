import { toProfiles } from '@/features/data/view';
import type { Person } from '@/infrastructure/contracts';

const person = (id: string, displayName: string): Person => ({
  id,
  displayName,
  roles: ['MEMBER'],
  defaultDestination: null,
});

it('las filas Edecán y Personal del club abren las apps reales con su cuenta', () => {
  const perfiles = toProfiles([person('V-204', 'Mario Gómez'), person('U-02', 'Sofía Ríos')]);
  expect(perfiles.map((p) => [p.roleLabel, p.href])).toEqual([
    ['Personal del club', '/entrar?cuenta=personal@nclub.demo'],
    ['Edecán', '/entrar?cuenta=edecan@nclub.demo'],
  ]);
});
