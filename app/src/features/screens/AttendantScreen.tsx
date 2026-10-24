import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  AppScreen,
  AppShell,
  Avatar,
  IconButton,
  ListRow,
  radii,
  useInsets,
  type TabItem,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusChip,
  Text,
  TextField,
  space,
} from '../../design-system';
import type { Handoff, Person, Visit } from '../../infrastructure/contracts';
import { clientFor, errorCode, useApi } from '../data/api';
import {
  denialCode,
  shortNames,
  toContextData,
  toHandoffTask,
  uiError,
  type UiError,
} from '../data/mappers';
import { HandoffTaskCard, type HandoffAction } from '../handoffs/HandoffTaskCard';
import { messageFor } from '../messages';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { CATEGORY_LABEL } from '../shared/labels';
import { ErrorNotice, Notice } from '../shared/notices';
import type { HandoffContextData, HandoffTask } from '../types';

export type AttendantScreenProps = {
  /** Directory id of the attendant using the panel (`U-02`, Sofía). */
  actorId?: string;
};

const tabs: readonly TabItem[] = [
  { key: 'home', label: 'Inicio', icon: 'home-outline' },
  { key: 'visits', label: 'Visitas', icon: 'people-outline' },
  { key: 'messages', label: 'Mensajes', icon: 'chatbox-outline' },
  { key: 'profile', label: 'Perfil', icon: 'person-outline' },
];

const NO_PEOPLE: readonly Person[] = [];
const MINE: Visit['state'][] = ['VERIFIED', 'ORIENTING', 'IN_PROGRESS'];
const REVIEW_REASON: Record<string, string> = {
  FACE_UNKNOWN: 'Rostro no reconocido',
  FACE_ERROR: 'Error de cámara',
  LOW_CONFIDENCE: 'Reconocimiento poco seguro',
  NO_EVIDENCE: 'Sin pase ni registro vigente',
};

/** Codes after which the card itself offers «Actualizar lista» (see HandoffTaskCard). */
const LOST = ['HANDOFF_ALREADY_ACCEPTED', 'HANDOFF_INVALID_STATE', 'HANDOFF_NOT_FOUND'];

const isTask = (h: Handoff, actorId: string) =>
  h.state === 'REQUESTED' ||
  ((h.state === 'ACCEPTED' || h.state === 'CONTEXT_TRANSFERRED') && h.toId === actorId);

function teamStatus(p: Person, visits: readonly Visit[]): { status: string } {
  if (p.robot?.status === 'FAULT') return { status: 'Detenido' };
  if (p.id === 'R1') return { status: 'Recepción' };
  const owned = visits.find((v) => v.ownerId === p.id && v.state === 'IN_PROGRESS');
  if (!owned) return { status: 'Disponible' };
  return { status: owned.arrivedAt ? 'Atendiendo' : 'Acompañando' };
}

type Confirm = { kind: 'arrive' | 'close'; visit: Visit };

/**
 * `/edecan`: team, relief tasks and the visit in charge, live from the API. The tasks are the
 * handoffs a person can take (`REQUESTED`, or the ones this attendant already accepted); a visit
 * appears under «Visita en curso» only once the handoff is confirmed and the owner changes.
 * ponytail: «Rechazar» only hides the task in this panel (v1 has no decline endpoint) and
 * «Disponible» is a local switch.
 */
export function AttendantScreen({ actorId = 'U-02' }: AttendantScreenProps) {
  const [tab, setTab] = useState('home');
  const [expandedTask, setExpandedTask] = useState<string>();
  const insets = useInsets();
  const client = useMemo(() => clientFor(actorId), [actorId]);
  // Relief tasks and visits follow other tabs every 3 s; the directory is read once and again
  // only when the handoffs change (a robot failing shows in the team).
  const feed = useApi(async () => {
    const [handoffs, visits] = await Promise.all([
      client.listHandoffs(),
      client.listVisits({ limit: 200 }),
    ]);
    return { handoffs: handoffs.items, visits: visits.items };
  }, [actorId]);
  const directory = useApi(async () => (await client.listPeople()).items, [actorId], { pollMs: 0 });
  const data = {
    data: feed.data && directory.data ? { ...feed.data, people: directory.data } : undefined,
    error: feed.error ?? (directory.data ? undefined : directory.error),
    loading: feed.loading || directory.loading,
    refresh: async () => {
      await Promise.all([feed.refresh(), directory.refresh()]);
    },
  };

  const [busy, setBusy] = useState<{ id: string; action: HandoffAction } | null>(null);
  // The visit action in flight (its button reads as busy and the visit's other buttons lock).
  const [acting, setActing] = useState<{ id: string; kind: 'start' | 'arrive' | 'close' } | null>(
    null,
  );
  const [contextFailed, setContextFailed] = useState<Record<string, UiError>>({});
  const [failed, setFailed] = useState<{ task: HandoffTask; error: UiError }>();
  const [notice, setNotice] = useState<{ id: string; text: string }>();
  const [actionError, setActionError] = useState<UiError>();
  const [contexts, setContexts] = useState<Record<string, HandoffContextData>>({});
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [available, setAvailable] = useState(true);
  const [confirm, setConfirm] = useState<Confirm>();
  const [linked, setLinked] = useState<Visit>();
  const inFlight = useRef(false);
  const fetching = useRef(new Set<string>());

  const { handoffs = [], visits = [] } = feed.data ?? {};
  const people = directory.data ?? NO_PEOPLE;
  const names = useMemo(() => shortNames(people), [people]);
  const tasks = useMemo(
    () =>
      handoffs
        .filter((h) => isTask(h, actorId) && !dismissed.includes(h.id))
        .map((h) => ({ handoff: h, task: toHandoffTask(h, names) })),
    [handoffs, actorId, dismissed, names],
  );
  const mine = visits.filter((v) => v.ownerId === actorId && MINE.includes(v.state));
  const reviews = visits.filter((v) => v.state === 'MANUAL_REVIEW');
  const team = people
    .filter((p) => p.roles.includes('ROBOT') || p.roles.includes('USHER'))
    .sort((a, b) => Number(b.roles.includes('ROBOT')) - Number(a.roles.includes('ROBOT')));

  const offline = data.error === 'NETWORK_ERROR' || data.error === 'TIMEOUT';
  const name = names[actorId] ?? actorId;
  const pending = tasks.filter((t) => t.handoff.state === 'REQUESTED').length;
  const loading = data.loading && !data.data;

  // The directory follows the handoffs: a robot that fails (or recovers) changes the team.
  const handoffsKey = handoffs.map((h) => `${h.id}:${h.state}`).join();
  const knownKey = useRef(handoffsKey);
  useEffect(() => {
    if (knownKey.current === handoffsKey) return;
    knownKey.current = handoffsKey;
    void directory.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffsKey]);

  // A relief reloaded in «contexto recibido» has lost its context: asking again is idempotent.
  // A failure is not retried on every poll: the card offers one button to ask again.
  useEffect(() => {
    for (const { handoff } of tasks) {
      if (handoff.state !== 'CONTEXT_TRANSFERRED' || contexts[handoff.id]) continue;
      if (fetching.current.has(handoff.id) || contextFailed[handoff.id]) continue;
      fetching.current.add(handoff.id);
      client
        .transferHandoffContext(handoff.id)
        .then((r) => setContexts((c) => ({ ...c, [handoff.id]: toContextData(r.context) })))
        .catch((e) =>
          setContextFailed((f) => ({ ...f, [handoff.id]: uiError(errorCode(e), 'handoff') })),
        )
        .finally(() => fetching.current.delete(handoff.id));
    }
  }, [tasks, contexts, contextFailed, client]);

  /**
   * One write at a time; whatever happens, the lists are reloaded to show the real state, and the
   * buttons stay locked until they are (otherwise the old card could be pressed again).
   */
  async function act(
    call: () => Promise<void>,
    onError: (e: UiError) => void,
    scope: 'handoff' | 'owner' = 'handoff',
    visit?: { id: string; kind: 'start' | 'arrive' | 'close' },
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setActionError(undefined);
    if (visit) setActing(visit);
    try {
      await call();
    } catch (e) {
      onError(uiError(errorCode(e), scope));
    } finally {
      await data.refresh();
      inFlight.current = false;
      setBusy(null);
      setActing(null);
    }
  }

  const step = (task: HandoffTask, action: HandoffAction) => {
    setBusy({ id: task.id, action });
    setFailed(undefined);
    return act(
      async () => {
        if (action === 'accept') {
          await client.acceptHandoff(task.id);
          setNotice({
            id: task.id,
            text: `Aceptaste el relevo. ${task.fromName} sigue siendo el responsable hasta que lo confirmes.`,
          });
        } else if (action === 'context') {
          const r = await client.transferHandoffContext(task.id);
          setContexts((c) => ({ ...c, [task.id]: toContextData(r.context) }));
          setNotice({ id: task.id, text: 'Contexto recibido.' });
        } else {
          await client.confirmHandoff(task.id);
          setNotice({
            id: task.id,
            text: `Eres la responsable de la visita de ${task.visitorName}.`,
          });
        }
      },
      (error) => {
        setNotice(undefined);
        setFailed({ task, error });
      },
    );
  };

  const runConfirm = ({ kind, visit }: Confirm) =>
    act(
      async () => {
        if (kind === 'arrive') {
          await client.advanceVisit(visit.id, { event: 'ARRIVE' });
          setNotice({
            id: visit.id,
            text: `Llegada a ${visit.destination ?? 'el destino'} registrada.`,
          });
        } else {
          await client.closeVisit(visit.id, { method: 'MANUAL' });
          setNotice({ id: visit.id, text: 'Visita cerrada.' });
        }
      },
      setActionError,
      'owner',
      { id: visit.id, kind },
    );

  /** A visit already in `ORIENTING` (an earlier try got that far) only needs the second event. */
  const startEscort = (visit: Visit) => {
    let started = false;
    return act(
      async () => {
        if (visit.state === 'VERIFIED') {
          await client.advanceVisit(visit.id, {
            event: 'START_ORIENTATION',
            ...(visit.destination ? { destination: visit.destination } : {}),
          });
          started = true;
        }
        await client.advanceVisit(visit.id, {
          event: 'ASSIGN_ESCORT',
          assigneeId: 'SELF',
          visitorAccepted: true,
        });
        setNotice({ id: visit.id, text: `Acompañas a ${visit.visitor.displayName}.` });
      },
      (e) =>
        setActionError(
          started
            ? {
                ...e,
                message: `${e.message ?? messageFor(e.code)} La orientación ya quedó iniciada; puedes volver a intentarlo.`,
              }
            : e,
        ),
      'owner',
      { id: visit.id, kind: 'start' },
    );
  };

  // The frozen card keeps the error readable after the live list stops showing the task.
  const live = tasks.some((t) => t.task.id === failed?.task.id);
  const refreshTasks = () => {
    setFailed(undefined);
    setActionError(undefined);
    void data.refresh();
  };
  const noticeShown = notice && tasks.some((t) => t.task.id === notice.id);
  const locked = offline || acting !== null;

  if (data.error && !data.data && (tab === 'home' || tab === 'visits')) {
    const e = uiError(data.error, 'handoff');
    return (
      <AppShell tabs={{ items: tabs, activeKey: tab, onSelect: setTab }}>
        <AppScreen tone="light" title={`Hola, ${name}`} subtitle="Edecán">
          <ErrorState
            title={e.message ?? messageFor(e.code)}
            description={`Código: ${e.code}`}
            onRetry={() => void data.refresh()}
          />
        </AppScreen>
      </AppShell>
    );
  }

  return (
    <AppShell tabs={{ items: tabs, activeKey: tab, onSelect: setTab }}>
      <View role="main" style={{ flex: 1, minHeight: 0 }}>
        <View
          style={{
            paddingTop: insets.top + space[5],
            paddingHorizontal: space[4],
            paddingBottom: space[5],
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
          }}
        >
          <Avatar name={name} tone="sage" />
          <View style={{ flex: 1, gap: space[1] }}>
            <Text variant="h3" level={1}>{`Hola, ${name}`}</Text>
            <Text variant="caption" tone="muted">
              Edecán · Atención de visitas
            </Text>
          </View>
          <IconButton
            icon="notifications-outline"
            label="Ver mensajes"
            onPress={() => setTab('messages')}
          />
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: space[4],
            paddingBottom: space[6],
            gap: space[4],
          }}
        >
          {data.error ? (
            <ErrorNotice {...uiError(data.error, 'handoff')} onRetry={refreshTasks} />
          ) : null}
          {actionError ? <ErrorNotice {...actionError} /> : null}

          {tab === 'home' ? (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: space[2],
                  flexWrap: 'wrap',
                }}
              >
                <Text variant="h2">Relevos y visitas</Text>
                <Text role="status" accessibilityLiveRegion="polite" variant="caption" tone="muted">
                  {pending === 1 ? '1 tarea pendiente' : `${pending} tareas pendientes`}
                </Text>
              </View>
              <View style={{ gap: space[4] }}>
                <View style={{ gap: space[3] }}>
                  <Text variant="h3" level={2}>
                    Tareas
                  </Text>
                  {loading ? (
                    <Card accessibilityLabel="Cargando tareas">
                      <Skeleton height={24} width="50%" />
                      <Skeleton height={16} />
                      <Skeleton height={16} width="70%" />
                    </Card>
                  ) : (
                    <>
                      {failed && !live ? (
                        <>
                          <HandoffTaskCard
                            task={
                              failed.error.code === 'HANDOFF_EXPIRED'
                                ? { ...failed.task, state: 'EXPIRED' }
                                : failed.task
                            }
                            errorCode={failed.error.code}
                            errorMessage={failed.error.message}
                            disabled
                            onAccept={() => {}}
                            onReceiveContext={() => {}}
                            onConfirm={() => {}}
                            onRefresh={refreshTasks}
                          />
                          {LOST.includes(failed.error.code) ? null : (
                            <Button
                              label="Actualizar lista"
                              variant="secondary"
                              onPress={refreshTasks}
                            />
                          )}
                        </>
                      ) : null}
                      {tasks.map(({ task }) => (
                        <View key={task.id} style={{ gap: space[3] }}>
                          {task.state === 'REQUESTED' &&
                          expandedTask !== task.id &&
                          failed?.task.id !== task.id ? (
                            <Card
                              role="article"
                              accessibilityLabel={`Relevo solicitado, ${task.visitorName}`}
                              style={{
                                borderRadius: radii.xl,
                                padding: space[4],
                                boxShadow: 'none',
                              }}
                            >
                              <View
                                style={{
                                  flexDirection: 'row',
                                  gap: space[3],
                                  alignItems: 'center',
                                }}
                              >
                                <Avatar name={task.visitorName} tone="sage" />
                                <View style={{ flex: 1, gap: space[1] }}>
                                  <Text variant="caption" tone="muted">
                                    Relevo solicitado
                                  </Text>
                                  <Text variant="label">{`${task.visitorName} · ${CATEGORY_LABEL[task.category]}`}</Text>
                                  <Text
                                    variant="caption"
                                    tone="muted"
                                  >{`Destino: ${task.destination}`}</Text>
                                </View>
                              </View>
                              <Text variant="caption" tone="muted">{`Motivo: ${task.reason}`}</Text>
                              <View
                                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}
                              >
                                <Button
                                  label={busy?.id === task.id ? 'Aceptando…' : 'Aceptar relevo'}
                                  size="sm"
                                  loading={busy?.id === task.id}
                                  disabled={
                                    offline ||
                                    acting !== null ||
                                    (busy !== null && busy.id !== task.id)
                                  }
                                  onPress={() => void step(task, 'accept')}
                                />
                                <Button
                                  label="Ver detalle"
                                  accessibilityLabel={`Ver detalle de ${task.visitorName}`}
                                  size="sm"
                                  variant="secondary"
                                  onPress={() => setExpandedTask(task.id)}
                                />
                              </View>
                            </Card>
                          ) : (
                            <HandoffTaskCard
                              task={task}
                              context={contexts[task.id]}
                              busy={busy?.id === task.id ? busy.action : null}
                              disabled={
                                offline || acting !== null || (busy !== null && busy.id !== task.id)
                              }
                              errorCode={
                                failed?.task.id === task.id ? failed.error.code : undefined
                              }
                              errorMessage={
                                failed?.task.id === task.id ? failed.error.message : undefined
                              }
                              notice={notice?.id === task.id ? notice.text : undefined}
                              onAccept={() => void step(task, 'accept')}
                              onReject={() => setDismissed((d) => [...d, task.id])}
                              onReceiveContext={() => void step(task, 'context')}
                              onConfirm={() => void step(task, 'confirm')}
                              onRefresh={refreshTasks}
                            />
                          )}
                          {contextFailed[task.id] ? (
                            <ErrorNotice
                              code={contextFailed[task.id]!.code}
                              message={`No pudimos traer el contexto de la visita. ${messageFor(contextFailed[task.id]!.code)}`}
                              onRetry={() => setContextFailed(({ [task.id]: _, ...rest }) => rest)}
                            />
                          ) : null}
                        </View>
                      ))}
                      {reviews.map((v) => (
                        <Card key={v.id} role="article" accessibilityLabel="Verificación">
                          <Text variant="h3" level={3}>
                            Verificación
                          </Text>
                          <Text>{v.visitor.displayName}</Text>
                          <Text tone="muted">
                            {`Motivo: ${REVIEW_REASON[v.classification?.state === 'MANUAL_REVIEW' ? v.classification.reason : ''] ?? 'Evidencias que no coinciden'}`}
                          </Text>
                          <Button
                            label="Validar su QR"
                            variant="secondary"
                            accessibilityLabel={`Validar el QR de ${v.visitor.displayName}`}
                            onPress={() => setLinked(v)}
                          />
                        </Card>
                      ))}
                      {tasks.length === 0 && reviews.length === 0 && !(failed && !live) ? (
                        <EmptyState
                          title="No hay tareas pendientes."
                          description="Cuando un robot o recepción pida ayuda, aparecerá aquí."
                        />
                      ) : null}
                    </>
                  )}
                </View>
              </View>
            </>
          ) : null}
          {tab === 'home' || tab === 'visits' ? (
            <>
              <View style={{ gap: space[3] }}>
                <Text variant="h3" level={2}>
                  Visita en curso
                </Text>
                {notice && !noticeShown ? <Notice>{notice.text}</Notice> : null}
                {mine.length === 0 ? (
                  <Text tone="muted">No tienes una visita en curso.</Text>
                ) : (
                  mine.map((v) => {
                    const relieved = handoffs.find(
                      (h) => h.visitId === v.id && h.state === 'CONFIRMED',
                    );
                    const where = v.destination ?? 'el destino';
                    return (
                      <Card key={v.id} style={{ borderRadius: radii.xl, boxShadow: 'none' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                          <Avatar name={v.visitor.displayName} tone="gold" />
                          <Text variant="h3" style={{ flex: 1 }}>
                            {v.visitor.displayName}
                          </Text>
                        </View>
                        <StatusChip
                          kind="info"
                          label={
                            v.state === 'VERIFIED'
                              ? 'Confirmada'
                              : v.arrivedAt
                                ? 'En el destino'
                                : 'En curso'
                          }
                        />
                        <Text>{`Destino: ${where}`}</Text>
                        <Text tone="muted">
                          {`Eres la responsable de esta visita.${relieved ? ` ${names[relieved.fromId] ?? relieved.fromId} queda liberado.` : ''}`}
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
                          {v.state === 'VERIFIED' || v.state === 'ORIENTING' ? (
                            <Button
                              label="Comenzar acompañamiento"
                              disabled={locked}
                              loading={acting?.id === v.id && acting.kind === 'start'}
                              onPress={() => void startEscort(v)}
                            />
                          ) : null}
                          {v.state === 'IN_PROGRESS' && !v.arrivedAt ? (
                            <Button
                              label={`Confirmar llegada a ${where}`}
                              disabled={locked}
                              loading={acting?.id === v.id && acting.kind === 'arrive'}
                              onPress={() => setConfirm({ kind: 'arrive', visit: v })}
                            />
                          ) : null}
                          <Button
                            label="Cerrar visita"
                            variant="secondary"
                            disabled={locked}
                            loading={acting?.id === v.id && acting.kind === 'close'}
                            onPress={() => setConfirm({ kind: 'close', visit: v })}
                          />
                        </View>
                      </Card>
                    );
                  })
                )}
              </View>

              <QrValidator
                verify={(token) =>
                  client.verifyAccess({ token, ...(linked ? { visitId: linked.id } : {}) })
                }
                linked={linked}
                onUnlink={() => setLinked(undefined)}
                onGranted={() => {
                  setLinked(undefined);
                  void data.refresh();
                }}
                disabled={offline}
              />
            </>
          ) : null}
          {tab === 'messages' ? (
            <>
              <Text variant="h2">Mensajes</Text>
              {notice ? (
                <Notice>{notice.text}</Notice>
              ) : (
                <EmptyState
                  title="Sin mensajes nuevos"
                  description="Los avisos de tus visitas aparecerán aquí."
                />
              )}
            </>
          ) : null}
          {tab === 'profile' ? (
            <>
              <Text variant="h2">Mi perfil</Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  paddingVertical: space[3],
                }}
              >
                <Avatar name={name} size={64} tone="sage" />
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text variant="h3">{name}</Text>
                  <Text tone="muted">Edecán</Text>
                  <Text variant="caption" tone="muted">
                    {actorId}
                  </Text>
                </View>
              </View>
              <ListRow
                icon="people-outline"
                title="Mis visitas"
                description="Acompañamiento en curso"
                onPress={() => setTab('visits')}
              />
              <ListRow
                icon="notifications-outline"
                title="Mensajes y avisos"
                onPress={() => setTab('messages')}
              />
              <Button
                label={available ? 'Disponible' : 'Con una visita'}
                accessibilityLabel={`Estado: ${available ? 'Disponible' : 'Con una visita'}. Cambiar`}
                variant="secondary"
                onPress={() => setAvailable((a) => !a)}
              />
              <View style={{ gap: space[3] }}>
                <Text variant="h3" level={2}>
                  Equipo
                </Text>
                <View role="list" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
                  {loading
                    ? [0, 1, 2, 3].map((i) => <Skeleton key={i} width={150} height={64} />)
                    : team.map((m) => {
                        const { status } = teamStatus(m, visits);
                        const label = names[m.id] ?? m.id;
                        return (
                          <Card
                            key={m.id}
                            role="listitem"
                            accessible
                            accessibilityLabel={`${label}, ${status}`}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: space[3],
                              padding: space[3],
                              flexBasis: 150,
                              flexGrow: 1,
                            }}
                          >
                            <Avatar
                              name={label}
                              tone={m.roles.includes('ROBOT') ? 'forest' : 'sage'}
                            />
                            <View style={{ flex: 1, gap: 2 }}>
                              <Text variant="label">{label}</Text>
                              <Text variant="caption" tone="muted">
                                {status}
                              </Text>
                            </View>
                          </Card>
                        );
                      })}
                </View>
              </View>
            </>
          ) : null}
          <ConfirmDialog
            visible={confirm !== undefined}
            title={
              confirm?.kind === 'close'
                ? `¿Cerrar la visita de ${confirm.visit.visitor.displayName.split(' ')[0]}?`
                : `¿Llegaron a ${confirm?.visit.destination ?? 'el destino'}?`
            }
            body={
              confirm?.kind === 'close'
                ? 'Confirmas que salió del club. No se puede reabrir.'
                : 'Se registra la llegada y quedas libre para otra tarea.'
            }
            cancelLabel="Todavía no"
            confirmLabel={confirm?.kind === 'close' ? 'Cerrar visita' : 'Sí, llegamos'}
            onCancel={() => setConfirm(undefined)}
            onConfirm={() => {
              const c = confirm;
              setConfirm(undefined);
              if (c) void runConfirm(c);
            }}
          />
        </ScrollView>
      </View>
    </AppShell>
  );
}

type QrOutcome = { kind: 'ok'; text: string } | { kind: 'error'; error: UiError };

/** «Validar QR»: the attendant checks a pass; a valid one opens a confirmed visit in her name. */
function QrValidator({
  verify,
  linked,
  onUnlink,
  onGranted,
  disabled,
}: {
  verify: (token: string) => ReturnType<ReturnType<typeof clientFor>['verifyAccess']>;
  linked?: Visit;
  onUnlink: () => void;
  onGranted: () => void;
  disabled: boolean;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<QrOutcome>();
  // Enter twice before the first answer must not spend the pass twice (state updates lag).
  const checking = useRef(false);

  const check = async () => {
    if (checking.current) return;
    const token = code.trim();
    if (token.length < 4) return setOutcome({ kind: 'error', error: { code: 'QR_INVALID' } });
    checking.current = true;
    setBusy(true);
    setOutcome(undefined);
    try {
      const r = await verify(token);
      if (r.decision === 'GRANTED') {
        setOutcome({ kind: 'ok', text: `Pase válido: ${r.visit.visitor.displayName} · Invitado.` });
        setCode('');
        onGranted();
      } else {
        const { code: denied } = denialCode(r.reason);
        setOutcome({
          kind: 'error',
          error:
            denied === 'QR_NOT_YET_VALID'
              ? { code: denied, message: 'Este pase aún no es válido.' }
              : { code: denied },
        });
      }
    } catch (e) {
      setOutcome({ kind: 'error', error: uiError(errorCode(e)) });
    } finally {
      checking.current = false;
      setBusy(false);
    }
  };

  return (
    <Card role="region" accessibilityLabel="Validar QR">
      <Text variant="h3" level={2}>
        Validar QR
      </Text>
      {linked ? (
        <View style={{ gap: space[2] }}>
          <Text>{`El pase se vinculará con la visita de ${linked.visitor.displayName}.`}</Text>
          <Button label="Quitar vínculo" size="sm" variant="secondary" onPress={onUnlink} />
        </View>
      ) : null}
      <TextField
        label="Código del pase"
        value={code}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setCode}
        onSubmitEditing={() => void check()}
      />
      <Button
        label={busy ? 'Validando…' : 'Validar QR'}
        loading={busy}
        disabled={disabled}
        onPress={() => void check()}
      />
      {outcome?.kind === 'ok' ? <Notice>{outcome.text}</Notice> : null}
      {outcome?.kind === 'error' ? (
        <ErrorNotice code={outcome.error.code} message={outcome.error.message} />
      ) : null}
    </Card>
  );
}
