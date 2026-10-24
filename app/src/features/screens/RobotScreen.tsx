import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  Avatar,
  BottomTabBar,
  Button,
  Card,
  Icon,
  Skeleton,
  Text,
  TextField,
  colors,
  space,
  type TabItem,
} from '../../design-system';
import type { Classification, Visit } from '../../infrastructure/contracts';
import { clientFor, errorCode, useApi } from '../data/api';
import {
  ESCORT_ID,
  classificationView,
  denialCode,
  orientationVars,
  qrShortcuts,
  resumePhase,
  shortNames,
  timeLabel,
  firstName,
  uiError,
  type UiError,
} from '../data/mappers';
import { ORIENTATION, type CopyVars } from '../orientation/copy';
import { ClassificationResult, NOTIFIED_TEXT } from '../robot/ClassificationResult';
import { CameraFrame } from '../robot/CameraFrame';
import { DemoControls } from '../robot/DemoControls';
import { FACES, type SimulatedFace } from '../robot/faces';
import { Farewell } from '../robot/Farewell';
import { KioskFrame, KioskSplit } from '../robot/KioskFrame';
import { KioskWelcome } from '../robot/KioskWelcome';
import { OrientationView, type OrientationViewPhase } from '../robot/OrientationView';
import { PresenterDrawer } from '../robot/PresenterDrawer';
import { RecognitionPanel } from '../robot/RecognitionPanel';
import { RobotFailureBanner, type FailureStage } from '../robot/RobotFailureBanner';
import { Heading } from '../shared/Heading';
import { ErrorNotice, Notice } from '../shared/notices';
import type { ClassificationView } from '../types';
import { FeedbackForm } from '../visits/FeedbackForm';

const ROBOT_TABS: readonly TabItem[] = [
  { key: 'home', label: 'Inicio', icon: 'home-outline' },
  { key: 'visits', label: 'Visitas', icon: 'calendar-outline' },
  { key: 'map', label: 'Mapa', icon: 'location-outline' },
  { key: 'concierge', label: 'Concierge', icon: 'notifications-outline' },
  { key: 'settings', label: 'Ajustes', icon: 'settings-outline' },
];
const ROBOT = 'R1';
/** `ASSIGN_ESCORT` without an escort (staff, directions only): reception keeps the visit. */
const NO_ESCORT = 'NONE';
const DEMO_HOURS = 'T09:00:00-05:00';

type Result = {
  kind: 'result';
  result: ClassificationView;
  /** The visit the service opened or matched; null once it was rejected with «No soy yo». */
  visit: Visit | null;
  /** Created by this recognition (false: the person already had an open visit). */
  fresh: boolean;
  via: 'face' | 'qr';
  host?: string;
};

type Stage =
  | { kind: 'welcome' }
  | { kind: 'recognizing' }
  | {
      kind: 'qr';
      /** Where «Volver» goes: the welcome, or the relief screen while help is on its way. */
      back: 'welcome' | 'failure';
      /** A visit waiting for a person (unknown face): the pass is merged into it. */
      reviewId?: string;
      error?: UiError;
      vars?: CopyVars;
    }
  | Result
  | { kind: 'activities' }
  | { kind: 'orienting'; phase: OrientationViewPhase }
  | { kind: 'failure' }
  | { kind: 'farewell'; skipped: boolean };

type Failure = UiError & { retry?: () => void; fallback?: { label: string; run: () => void } };

const FLOW: OrientationViewPhase[] = [
  'greeting',
  'destination',
  'assignment',
  'route',
  'arrival',
  'exit',
  'feedback',
];
const isRobot = (who: string | null | undefined): who is string => !!who && /^R\d+$/.test(who);
const isPerson = (who: string | null | undefined): who is string => !!who && /^U-\d+$/.test(who);
// One request to the service per press: a second press while one is in flight does nothing.
const HOSTS = ['V-201', 'V-202', 'V-209'];
// Reading invitations (they carry the QR token) is for the host or an operator: the presenter's
// shortcuts act as the operator. The escort of a visit is the one who walks it, arrives and
// brings it back, so those events are sent as its owner (R2, Sara...), never as reception.
const PRESENTER = 'O-01';

export type RobotScreenProps = {
  farewellSeconds?: number;
};

/**
 * `/robot`: the kiosk, walking R-01..R-13 on the service's answers. The face is simulated by the
 * presenter and tagged «Simulación»; the category, the evidence and every transition come from
 * the API (`/recognition/events`, `/access/verify`, `/visits/{id}/advance`, `/robots/{id}/failure`).
 * ponytail: no keyboard shortcuts (1–3, A, P) and no 6 s unknown-face timeout; «Necesito ayuda»
 * only warns the screen, because v1 has no endpoint to ask reception from the kiosk (an unknown
 * face does wait for a person as a `MANUAL_REVIEW` visit). The return to reception reuses the
 * open visit instead of a second face read.
 */
export function RobotScreen({ farewellSeconds = 15 }: RobotScreenProps) {
  const client = useMemo(() => clientFor(ROBOT), []);
  const boot = useApi(
    async () => {
      const [health, people] = await Promise.all([client.getHealth(), client.listPeople()]);
      return { today: health.clock.now.slice(0, 10), names: shortNames(people.items) };
    },
    [],
    { pollMs: 0 },
  );
  const names = boot.data?.names ?? {};
  const today = boot.data?.today;

  const [tab, setTab] = useState('home');
  const arrivals = useApi(
    async () => (tab === 'visits' || tab === 'map' ? (await client.listVisits()).items : null),
    [tab],
    { pollMs: 0 },
  );
  const [stage, setStage] = useState<Stage>({ kind: 'welcome' });
  const [visit, setVisit] = useState<Visit | null>(null);
  const [host, setHost] = useState<string>();
  const [helpAsked, setHelpAsked] = useState(false);
  const [greetingAnswer, setGreetingAnswer] = useState<string>();
  const [destinationNotice, setDestinationNotice] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [qrCode, setQrCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [failure, setFailure] = useState<Failure>();
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Runs one call: locks the screen meanwhile and turns a failure into a recoverable notice. */
  async function act<T>(
    call: () => Promise<T>,
    done: (value: T) => void,
    retry: () => void,
    fallback?: Failure['fallback'],
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure(undefined);
    setNotice(undefined);
    try {
      const value = await call();
      if (!alive.current) return;
      setOffline(false);
      done(value);
    } catch (e) {
      if (!alive.current) return;
      const code = errorCode(e);
      setOffline(code === 'NETWORK_ERROR');
      // A 401 does not get better by trying again: the deployment asks for the real robot's token.
      setFailure({
        ...uiError(code),
        ...(code === 'UNAUTHENTICATED' ? {} : { retry }),
        ...(fallback ? { fallback } : {}),
      });
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const reset = useCallback(() => {
    setStage({ kind: 'welcome' });
    setVisit(null);
    setHost(undefined);
    setHelpAsked(false);
    setGreetingAnswer(undefined);
    setDestinationNotice(undefined);
    setQrCode('');
    setFailure(undefined);
  }, []);
  const orient = (phase: OrientationViewPhase) => setStage({ kind: 'orienting', phase });
  const next = (phase: OrientationViewPhase) =>
    orient(FLOW[Math.min(FLOW.indexOf(phase) + 1, FLOW.length - 1)] as OrientationViewPhase);

  // ---- Reads that follow another actor: the relief (edecán) and an assisted exit.
  const failing = stage.kind === 'failure';
  // The loaders also move the screen: they run outside render, and every update checks that the
  // visit and the stage are still the ones that asked, so a reset in between wins.
  // The visit on screen now: an answer about another one (a reset in between) is ignored.
  const currentVisit = useRef<string | undefined>(undefined);
  useEffect(() => {
    currentVisit.current = visit?.id;
  }, [visit?.id]);
  const relief = useApi(async () => {
    if (!failing || !visit) return null;
    const [current, handoffs] = await Promise.all([
      client.getVisit(visit.id),
      client.listHandoffs({ visitId: visit.id }),
    ]);
    if (currentVisit.current !== current.id) return null;
    setVisit((v) => (v?.id === current.id ? current : v));
    if (current.arrivedAt) {
      setStage((st) => (st.kind === 'failure' ? { kind: 'orienting', phase: 'arrival' } : st));
    }
    return { visit: current, handoff: handoffs.items.at(-1) };
  }, [failing, visit?.id]);

  const assistedExit =
    stage.kind === 'orienting' && stage.phase === 'exit' && isPerson(visit?.ownerId);
  useApi(async () => {
    if (!assistedExit || !visit) return null;
    const current = await client.getVisit(visit.id);
    if (currentVisit.current !== current.id) return null;
    if (current.state === 'CLOSED') {
      setVisit((v) => (v?.id === current.id ? current : v));
      setStage((st) =>
        st.kind === 'orienting' && st.phase === 'exit'
          ? { kind: 'orienting', phase: 'feedback' }
          : st,
      );
    }
    return current;
  }, [assistedExit, visit?.id]);

  const showingActivities = stage.kind === 'activities';
  const activities = useApi(
    async () => (showingActivities ? (await client.listActivities()).items : null),
    [showingActivities],
    { pollMs: 0 },
  );
  const showingQr = stage.kind === 'qr';
  const shortcuts = useApi(
    async () =>
      showingQr
        ? qrShortcuts(
            (
              await Promise.all(
                HOSTS.map((h) => clientFor(PRESENTER).listInvitations({ hostId: h })),
              )
            ).flatMap((l) => l.items),
          )
        : null,
    [showingQr],
    { pollMs: 0 },
  );

  // ---- Arrival: the face (or the pass) is a hint; the service answers with records.
  async function describe(v: Visit, c: Classification, candidate?: string) {
    // The visit of an invited guest names the host (first name only), also on the face path.
    const hostName = (c.state === 'CONFIRMED' && v.hostName) || undefined;
    let permitDays: string[] | undefined;
    if (c.state === 'DENIED' && c.reason === 'EXTERNAL_PERMIT_OUTSIDE_WINDOW' && candidate) {
      permitDays = (await client.getPerson(candidate)).external?.permit.daysOfWeek;
    }
    return {
      host: hostName,
      view: classificationView(c, v, { host: hostName, today, permitDays }),
    };
  }

  const recognize = (face: SimulatedFace) =>
    act(
      async () => {
        const r = await client.createRecognitionEvent({
          source: { kind: 'SIMULATOR', id: ROBOT },
          face: face.signal,
        });
        const candidate = face.signal.status === 'MATCH' ? face.signal.candidateId : undefined;
        return { r, ...(await describe(r.visit, r.classification, candidate)) };
      },
      ({ r, view, host: h }) =>
        setStage({
          kind: 'result',
          result: view,
          visit: r.visit,
          fresh: !r.matchedOpenVisit,
          via: 'face',
          host: h,
        }),
      () => recognize(face),
    );

  const checkQr = (token: string, reviewId?: string) => {
    const code = token.trim();
    const back = stage.kind === 'qr' ? stage.back : 'welcome';
    if (code.length < 4) {
      setStage({ kind: 'qr', back, reviewId, error: { code: 'QR_INVALID' } });
      return Promise.resolve();
    }
    return act(
      () => client.verifyAccess({ token: code, ...(reviewId ? { visitId: reviewId } : {}) }),
      (r) => {
        if (r.decision === 'DENIED') {
          const { code: denied } = denialCode(r.reason);
          setStage({
            kind: 'qr',
            back,
            reviewId,
            error:
              denied === 'QR_NOT_YET_VALID'
                ? { code: denied, message: 'Este pase aún no es válido.' }
                : { code: denied },
          });
          return;
        }
        const h = names[r.invitation.hostId];
        setStage({
          kind: 'result',
          result: classificationView(r.visit.classification!, r.visit, { host: h }),
          visit: r.visit,
          fresh: true,
          via: 'qr',
          host: h,
        });
      },
      () => checkQr(token, reviewId),
    );
  };

  // ---- Identity confirmed: the visit is open, the orientation walks it forward.
  const confirmIdentity = (r: Result) => {
    if (r.result.state !== 'CONFIRMED' || !r.visit) return;
    setVisit(r.visit);
    setHost(r.host);
    setGreetingAnswer(undefined);
    if (r.visit.state === 'WAITING_HANDOFF') setStage({ kind: 'failure' });
    else orient(resumePhase(r.visit));
  };

  const rejectIdentity = (r: Result) => {
    const rejected = () =>
      setStage({
        ...r,
        visit: null,
        result: { state: 'MANUAL_REVIEW', code: 'RECOGNITION_UNKNOWN' },
      });
    // «No soy yo» opens nothing: a visit this recognition created is closed again, and the screen
    // moves on only once it is (a failure stays here with a retry).
    const created = r.visit;
    if (!created || !r.fresh) return rejected();
    void act(
      () => client.closeVisit(created.id, { method: 'MANUAL' }),
      rejected,
      () => rejectIdentity(r),
    );
  };

  const goQr = (back: 'welcome' | 'failure' = 'welcome', reviewId?: string) =>
    setStage({ kind: 'qr', back, reviewId });

  // ---- The orientation: each decision is an event of the visit.
  const chooseDestination = (destination?: string, doneNotice?: string) => {
    if (!visit) return;
    if (visit.state !== 'VERIFIED') {
      orient('assignment');
      return;
    }
    void act(
      () =>
        client.advanceVisit(visit.id, {
          event: 'START_ORIENTATION',
          ...(destination ? { destination } : {}),
        }),
      (v) => {
        setVisit(v);
        setDestinationNotice(doneNotice);
        orient('assignment');
      },
      () => chooseDestination(destination, doneNotice),
    );
  };

  const assign = (assigneeId: string) => {
    if (!visit) return;
    const personFallback = 'U-01';
    void act(
      () =>
        client.advanceVisit(visit.id, {
          event: 'ASSIGN_ESCORT',
          assigneeId,
          visitorAccepted: true,
        }),
      (v) => {
        setVisit(v);
        orient('route');
      },
      () => assign(assigneeId),
      isRobot(assigneeId)
        ? {
            label: `Ir con ${names[personFallback] ?? 'una persona del equipo'}`,
            run: () => assign(personFallback),
          }
        : undefined,
    );
  };

  const arrive = () => {
    if (!visit) return;
    if (visit.state !== 'IN_PROGRESS') {
      orient('arrival');
      return;
    }
    void act(
      () => clientFor(visit.ownerId ?? ROBOT).advanceVisit(visit.id, { event: 'ARRIVE' }),
      (v) => {
        setVisit(v);
        orient('arrival');
      },
      arrive,
    );
  };

  const failRobot = () => {
    const robot = visit?.ownerId;
    if (!isRobot(robot)) return;
    void act(
      () =>
        clientFor(robot).reportRobotFailure(robot, {
          code: 'MOTOR_FAULT',
          lastKnownPoint: 'Pasillo',
        }),
      () => setStage({ kind: 'failure' }),
      failRobot,
    );
  };

  const finishVisit = () => {
    if (!visit) return;
    void act(
      () =>
        client.closeVisit(visit.id, {
          method: visit.recognition?.face.status === 'MATCH' ? 'FACE' : 'QR',
        }),
      (v) => {
        setVisit(v);
        orient('feedback');
      },
      finishVisit,
    );
  };

  const sendFeedback = (values: { robot?: number; club?: number; comment?: string }) => {
    if (!visit) return;
    void act(
      () =>
        client.submitFeedback(visit.id, {
          ...(values.robot !== undefined ? { robotRating: values.robot } : {}),
          ...(values.club !== undefined ? { clubRating: values.club } : {}),
          ...(values.comment ? { robotComment: values.comment } : {}),
        }),
      () => setStage({ kind: 'farewell', skipped: false }),
      () => sendFeedback(values),
    );
  };

  const resetDemo = (date?: string) =>
    act(
      () => client.resetDemo(date ? { now: `${date}${DEMO_HOURS}` } : undefined),
      () => {
        reset();
        setNotice('Datos reiniciados.');
        void boot.refresh();
      },
      () => resetDemo(date),
    );

  // ---- What is on screen.
  const category = visit?.category ?? undefined;
  const vars = visit && category ? orientationVars(visit, category, host) : undefined;
  const owner = visit?.ownerId;
  const phase = stage.kind === 'orienting' ? stage.phase : undefined;
  const escorting = (stage.kind === 'failure' || phase === 'route' || phase === 'arrival') && owner;
  const robotLabel =
    escorting && owner !== ROBOT
      ? `${isRobot(owner) ? 'Robot ' : ''}${names[owner] ?? owner} · Acompañando`
      : 'Robot R1 · Recepción';
  const atRoute = phase === 'route';
  const reliefState: FailureStage = !relief.data?.handoff
    ? 'REQUESTED'
    : relief.data.handoff.state === 'CANCELLED'
      ? 'EXPIRED'
      : relief.data.handoff.state;
  const attendant = relief.data?.handoff?.toId;

  const presenterDisabled = busy;
  const demoControls = (
    <DemoControls
      today={today}
      disabled={presenterDisabled}
      onDate={(d) => void resetDemo(d)}
      onReset={() => void resetDemo()}
    />
  );

  const body = () => {
    switch (stage.kind) {
      case 'welcome':
        return (
          <>
            <KioskWelcome
              loading={boot.loading && !boot.data}
              onStart={() => setStage({ kind: 'recognizing' })}
              onQr={() => goQr()}
            />
            {visit ? (
              <Text variant="caption" tone="muted">
                {`Visita en curso · ${firstName(visit.visitor.displayName)} · ${visit.destination ?? ''}`}
              </Text>
            ) : null}
          </>
        );
      case 'recognizing':
        return (
          <RecognitionPanel
            status={busy ? 'loading' : 'ready'}
            faces={FACES}
            onSimulate={(id) => {
              const face = FACES.find((f) => f.id === id);
              if (face) void recognize(face);
            }}
            onUseQr={() => goQr()}
            extra={demoControls}
          />
        );
      case 'qr':
        return (
          <KioskSplit media={<CameraFrame />}>
            <Heading variant="h1" focusKey="qr">
              Muestra tu código QR
            </Heading>
            <Text style={{ fontSize: 20, lineHeight: 30 }}>
              Coloca el código dentro del recuadro. Lo comprobaré con el registro del club.
            </Text>
            <Card>
              <TextField
                label="O escribe el código de tu pase"
                value={qrCode}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setQrCode}
                onSubmitEditing={() => void checkQr(qrCode, stage.reviewId)}
              />
              <Button
                label={busy ? 'Comprobando…' : 'Comprobar'}
                loading={busy}
                onPress={() => void checkQr(qrCode, stage.reviewId)}
              />
            </Card>
            {stage.error ? (
              <ErrorNotice
                code={stage.error.code}
                message={stage.error.message}
                vars={stage.vars}
              />
            ) : (
              <Text tone="muted">Esperando tu código…</Text>
            )}
            <View style={{ gap: space[3] }}>
              <Button
                label="Volver"
                variant="secondary"
                size="lg"
                fullWidth

                disabled={busy}
                onPress={() => (stage.back === 'failure' ? setStage({ kind: 'failure' }) : reset())}
              />
            </View>
            <PresenterDrawer>
              {shortcuts.loading && !shortcuts.data ? <Skeleton height={32} width="60%" /> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                {(shortcuts.data ?? []).map((s) => (
                  <Button
                    key={s.label}
                    label={s.label}
                    size="sm"
                    variant="secondary"

                    disabled={busy}
                    onPress={() => {
                      setQrCode(s.token);
                      void checkQr(s.token, stage.reviewId);
                    }}
                  />
                ))}
              </View>
              {demoControls}
            </PresenterDrawer>
          </KioskSplit>
        );
      case 'result':
        return (
          <ClassificationResult
            result={stage.result}
            destination={stage.visit?.destination ?? undefined}
            simulated={stage.via === 'face'}
            busy={busy}
            notified={helpAsked}
            onConfirm={() => confirmIdentity(stage)}
            onReject={() => rejectIdentity(stage)}
            onUseQr={() =>
              goQr('welcome', stage.visit?.state === 'MANUAL_REVIEW' ? stage.visit.id : undefined)
            }
            onHelp={() => setHelpAsked(true)}
            onBack={stage.result.state === 'CONFIRMED' ? undefined : reset}
          />
        );
      case 'activities':
        return (
          <View style={{ gap: space[5] }}>
            <Heading variant="h1" focusKey="actividades">
              Hoy en el club
            </Heading>
            {activities.error ? (
              <ErrorNotice
                code={uiError(activities.error).code}

                onRetry={() => void activities.refresh()}
              />
            ) : activities.loading && !activities.data ? (
              <Skeleton height={32} />
            ) : (
              <View role="list" style={{ gap: space[4] }}>
                {(activities.data ?? [])
                  .filter((a) => !category || a.audience.includes(category))
                  .map((a) => (
                    <Card
                      key={a.id}
                      role="listitem"
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: space[4],
                      }}
                    >
                      <Text style={{ fontSize: 18, lineHeight: 26, flex: 1, minWidth: 220 }}>
                        {`${a.title} · ${a.location} · ${timeLabel(a.startsAt)}`}
                      </Text>
                      <Button
                        label="Ir ahí"
                        accessibilityLabel={`Ir a ${a.title}`}
                        size="md"

                        disabled={busy}
                        onPress={() =>
                          chooseDestination(a.location, `Destino confirmado: ${a.title}.`)
                        }
                      />
                    </Card>
                  ))}
              </View>
            )}
            <Button
              label="Volver"
              size="lg"
              variant="secondary"

              disabled={busy}
              onPress={() => orient('destination')}
            />
          </View>
        );
      case 'orienting': {
        if (!visit || !category || !vars) return null;
        const script = ORIENTATION[category];
        if (stage.phase === 'exit' && assistedExit) {
          const who = names[owner ?? ''] ?? 'Una persona del equipo';
          return (
            <View style={{ gap: space[5] }}>
              <Heading variant="display" focusKey="exit-assisted">
                {`“${vars.nombre}, ya casi terminamos. ${who} confirmará tu salida.”`}
              </Heading>
              <Notice>{`Esperando a que ${who} confirme tu salida.`}</Notice>
              <Button
                label="Todavía no"
                size="lg"
                variant="secondary"

                onPress={() => setStage({ kind: 'welcome' })}
              />
            </View>
          );
        }
        return (
          <View style={{ gap: space[5] }}>
            {destinationNotice && stage.phase === 'assignment' ? (
              <Notice>{destinationNotice}</Notice>
            ) : null}
            <OrientationView
              category={category}
              phase={stage.phase}
              vars={vars}
              greetingAnswer={greetingAnswer}
              onChoose={(option) => {
                const options = script.phases[stage.phase as keyof typeof script.phases]?.options;
                if (stage.phase === 'greeting') {
                  if (script.phases.greeting.afterChoice) setGreetingAnswer(option);
                  else next('greeting');
                } else if (stage.phase === 'destination') {
                  if (option === 'Ver actividades de hoy') setStage({ kind: 'activities' });
                  else chooseDestination();
                } else if (stage.phase === 'assignment') {
                  // The first answer takes the scripted escort; the second asks for a person
                  // (guest) or for directions only (members): no escort, the visit goes on.
                  const alternative = category === 'GUEST' ? 'U-01' : NO_ESCORT;
                  const planned = script.escort
                    ? (ESCORT_ID[script.escort] ?? NO_ESCORT)
                    : NO_ESCORT;
                  assign(options && option !== options[1] ? planned : alternative);
                } else if (stage.phase === 'arrival') {
                  setStage({ kind: 'welcome' });
                } else if (stage.phase === 'exit' && option === 'Todavía no') {
                  setStage({ kind: 'welcome' });
                } else if (stage.phase === 'exit') {
                  finishVisit();
                } else next(stage.phase);
              }}
              onContinue={() => {
                if (stage.phase === 'assignment') {
                  assign(script.escort ? (ESCORT_ID[script.escort] ?? NO_ESCORT) : NO_ESCORT);
                  return;
                }
                setGreetingAnswer(undefined);
                if (stage.phase === 'destination') chooseDestination();
                else next(stage.phase);
              }}
            />
            {stage.phase === 'feedback' ? (
              <Card>
                <FeedbackForm
                  maxComment={300}
                  submitting={busy}
                  onSubmit={sendFeedback}
                  onSkip={() => setStage({ kind: 'farewell', skipped: true })}
                />
              </Card>
            ) : null}
          </View>
        );
      }
      case 'failure':
        return (
          <RobotFailureBanner
            stage={reliefState}
            attendantName={attendant ? names[attendant] : undefined}
            onShowQr={() => goQr('failure')}
          />
        );
      case 'farewell':
        return visit && category && vars ? (
          <View style={{ gap: space[4] }}>
            {stage.skipped ? <Notice>Sin problema. Tu salida no cambia.</Notice> : null}
            <Farewell category={category} vars={vars} seconds={farewellSeconds} onDone={reset} />
          </View>
        ) : null;
    }
  };

  const atWelcomeWithVisit = stage.kind === 'welcome' && visit !== null;
  const showPresenter = stage.kind === 'welcome' || stage.kind === 'orienting' || failing;
  const canFail = atRoute && isRobot(owner) && owner !== ROBOT;

  const presenter = (
    <PresenterDrawer defaultOpen={tab === 'settings'}>
      {visit ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <Button
            label="Marcar llegada al destino"
            size="sm"
            variant="secondary"

            disabled={
              busy || !(atRoute || (failing && relief.data?.handoff?.state === 'CONFIRMED'))
            }
            onPress={arrive}
          />
          <Button
            label="Marcar regreso a recepción"
            size="sm"
            variant="secondary"

            disabled={busy || !atWelcomeWithVisit}
            onPress={() => orient('exit')}
          />
          <Button
            label="Reportar falla del robot"
            size="sm"
            variant="secondary"

            disabled={busy || !canFail}
            onPress={failRobot}
          />
          <Button
            label="Reiniciar esta visita"
            size="sm"
            variant="secondary"

            disabled={busy}
            onPress={reset}
          />
        </View>
      ) : null}
      {demoControls}
    </PresenterDrawer>
  );
  const selectedVisit = stage.kind === 'result' ? stage.visit : visit;
  const destinations = [
    ...new Set(
      [selectedVisit?.destination, ...(arrivals.data ?? []).map((v) => v.destination)].filter(
        (d): d is string => !!d,
      ),
    ),
  ];
  const section = () => {
    if (tab === 'home') return body();
    if (tab === 'settings')
      return (
        <>
          <Heading variant="h2">Ajustes</Heading>
          {presenter}
        </>
      );
    if (tab === 'concierge')
      return (
        <View style={{ gap: space[4] }}>
          <Heading variant="h2">Concierge</Heading>
          {failing ? (
            <RobotFailureBanner
              stage={reliefState}
              attendantName={attendant ? names[attendant] : undefined}
              onShowQr={() => {
                goQr('failure');
                setTab('home');
              }}
            />
          ) : (
            <>
              <Text tone="muted">
                {helpAsked ? NOTIFIED_TEXT : 'Apoyo de recepción y relevos de acompañamiento.'}
              </Text>
              <Button label="Pedir ayuda" disabled={helpAsked} onPress={() => setHelpAsked(true)} />
            </>
          )}
        </View>
      );
    return (
      <View style={{ gap: space[4] }}>
        <Heading variant="h2">
          {tab === 'map' ? 'Destino del visitante' : 'Llegadas y visitas'}
        </Heading>
        {arrivals.error ? (
          <ErrorNotice {...uiError(arrivals.error)} onRetry={() => void arrivals.refresh()} />
        ) : arrivals.loading ? (
          <Skeleton height={80} />
        ) : tab === 'visits' ? (
          (arrivals.data ?? []).length ? (
            (arrivals.data ?? []).map((v) => (
              <Card
                key={v.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  boxShadow: 'none',
                }}
              >
                <Avatar name={v.visitor.displayName} size={44} tone="sage" />
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text variant="label">{v.visitor.displayName}</Text>
                  <Text variant="caption" tone="muted">
                    {v.destination ?? 'Recepción'}
                    {v.state === 'CLOSED'
                      ? ' · Finalizada'
                      : v.state === 'EXPECTED'
                        ? ' · Esperada'
                        : ' · En curso'}
                  </Text>
                </View>
              </Card>
            ))
          ) : (
            <Text tone="muted">No hay visitas registradas.</Text>
          )
        ) : (
          <>
            <View
              style={{
                padding: space[5],
                gap: space[4],
                backgroundColor: colors.sage,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <Icon name="navigate-outline" size={22} color={colors.forest} />
                <Text variant="label">Recepción · Robot R1</Text>
              </View>
              {destinations.map((destination) => (
                <View
                  key={destination}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}
                >
                  <Icon name="location-outline" size={22} color={colors.forest} />
                  <Text style={{ flex: 1 }}>{destination}</Text>
                </View>
              ))}
            </View>
            <Text variant="caption" tone="muted">
              {selectedVisit?.destination
                ? `Tu destino: ${selectedVisit.destination}`
                : 'El destino se muestra al confirmar una visita.'}
            </Text>
          </>
        )}
      </View>
    );
  };

  return (
    <KioskFrame
      robotLabel={robotLabel}
      online={!offline && !boot.error}
      scrollKey={`${tab}-${stage.kind}-${phase ?? ''}`}
      onSettings={() => setTab('settings')}
      footer={<BottomTabBar items={ROBOT_TABS} activeKey={tab} onSelect={setTab} />}
      onHelp={() => setHelpAsked(true)}
    >
      {boot.error && !boot.data ? (
        <ErrorNotice {...uiError(boot.error)} onRetry={() => void boot.refresh()} />
      ) : null}
      {failure ? (
        <View style={{ gap: space[3] }}>
          <ErrorNotice
            code={failure.code}
            message={failure.message}

            onRetry={failure.retry}
          />
          {failure.fallback ? (
            <Button
              label={failure.fallback.label}
              size="lg"

              onPress={failure.fallback.run}
            />
          ) : null}
        </View>
      ) : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {helpAsked && stage.kind !== 'result' && tab !== 'concierge' ? (
        <Notice>{NOTIFIED_TEXT}</Notice>
      ) : null}
      {section()}
      {tab === 'home' && showPresenter ? presenter : null}
    </KioskFrame>
  );
}
