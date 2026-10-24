/* eslint-disable @typescript-eslint/no-redeclare -- patrón Zod: el esquema y su tipo comparten nombre */
import { z } from 'zod';

import { Category, IsoDate, IsoDateTime, LocalTime, PersonRole, listOf } from './common';

export const Membership = z.object({
  tier: z.enum(['VIP', 'REGULAR']),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  validTo: IsoDate,
});

export const StaffInfo = z.object({
  department: z.string(),
  shifts: z.array(z.object({ date: IsoDate, from: LocalTime, to: LocalTime })),
});

export const DaysOfWeek = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);

export const ExternalInfo = z.object({
  company: z.string(),
  orderCode: z.string(),
  responsibleId: z.string(),
  permit: z.object({
    daysOfWeek: z.array(DaysOfWeek),
    from: LocalTime,
    to: LocalTime,
    validFrom: IsoDate,
    validTo: IsoDate,
  }),
});

export const RobotInfo = z.object({
  role: z.enum(['RECEPTION', 'ESCORT']),
  canEscort: z.boolean(),
  status: z.enum(['OK', 'FAULT']),
});

export const Person = z.object({
  id: z.string(),
  displayName: z.string(),
  roles: z.array(PersonRole),
  membership: Membership.optional(),
  staff: StaffInfo.optional(),
  external: ExternalInfo.optional(),
  robot: RobotInfo.optional(),
  defaultDestination: z.string().nullable(),
  /** Solo en el detalle (`GET /people/{id}`). */
  preferences: z.array(z.string()).optional(),
});
export type Person = z.infer<typeof Person>;

export const PersonList = listOf(Person);
export type PersonList = z.infer<typeof PersonList>;

export const PeopleQuery = z.object({ role: PersonRole.optional() });
export type PeopleQuery = z.infer<typeof PeopleQuery>;

export const Activity = z.object({
  id: z.string(),
  title: z.string(),
  location: z.string(),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  audience: z.array(Category),
});
export type Activity = z.infer<typeof Activity>;

export const ActivityList = listOf(Activity);
export type ActivityList = z.infer<typeof ActivityList>;

export const ActivitiesQuery = z.object({ date: IsoDate.optional() });
export type ActivitiesQuery = z.infer<typeof ActivitiesQuery>;
