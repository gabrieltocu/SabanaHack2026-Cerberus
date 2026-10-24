import { useCallback, useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import {
  Banner,
  Button,
  Icon,
  Text,
  Touchable,
  colors,
  fonts,
  space,
  type IconName,
} from '../../../design-system';
import { QrCode } from '../../invitations/QrCode';
import type { Invitacion } from '../../../club/types';
import type { InvitacionConQr } from '../client';
import { ASISTENCIA, BEBIDAS, resumenLista } from './catalogos';
import { diaFrase, hoyBogota } from './dates';
import { describir, type ErrorInfo } from './errors';
import { useCarga } from './hooks';
import { SIN_FOTO_AVISO, nombreCompleto } from './model';
import { formularioFoto, type FotoLista } from './photo';
import { compartir, enlaceInvitacion, mensajeInvitacion } from './share';
import { useSocio } from './SocioContext';
import { useFoto } from './useFoto';
import { useInvitationForm } from './useInvitationForm';
import { aCuerpo } from './validation';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { DocumentoInvitado } from './ui/DocumentoInvitado';
import { Avatar } from './ui/Avatar';
import { Fila, Grupo } from './ui/Fila';
import { Frame, IconoBoton } from './ui/Frame';
import { InvitationFields } from './ui/InvitationFields';
import { PhotoField } from './ui/PhotoField';
import { Cargando, Fallo } from './ui/States';

export type DetailProps = {
  id: string;
  onBack: () => void;
  /** Coming straight from "Enviar invitación". */
  creada?: boolean;
  /** The invitation exists but its photo failed to upload (reason from the API). */
  fotoError?: string;
  /** Opens the follow-up of the visit this invitation became (guest already arrived). */
  onVerVisita?: (visitaId: string) => void;
};

const FOTO_TEXTO = {
  NINGUNA: SIN_FOTO_AVISO,
  PENDIENTE: 'Procesando. El robot la prepara; te avisamos al terminar.',
  LISTA: 'Lista. El robot reconocerá a tu invitado al llegar.',
  RECHAZADA: 'No sirvió para reconocerlo.',
} as const;

/** What the pass says when it can no longer be used, as a sentence instead of a status tag. */
const FRASE_ESTADO = {
  LLEGO: 'Ya llegó',
  SALIO: 'Ya salió',
  CANCELADA: 'Invitación cancelada',
  VENCIDA: 'Invitación vencida',
} as const;

function Dato({ icono, titulo, texto }: { icono: IconName; titulo: string; texto: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
      <Icon name={icono} size={20} color={colors.gold} />
      <View style={{ flex: 1, gap: space[1] }}>
        <Text variant="caption" tone="muted">
          {titulo}
        </Text>
        <Text variant="label">{texto}</Text>
      </View>
    </View>
  );
}

/** Detalle de invitación: estado, foto, QR, compartir, editar y cancelar. */
export function InvitationDetailScreen({
  id,
  onBack,
  creada = false,
  fotoError,
  onVerVisita,
}: DetailProps) {
  const [vista, setVista] = useState<'resumen' | 'foto' | 'cedula'>('resumen');
  const [menu, setMenu] = useState(false);
  const [detalles, setDetalles] = useState(false);
  const s = useSocio();
  const { client } = s;
  const load = useCallback(() => client.invitacion(id), [client, id]);
  const { carga, recargar, setCarga } = useCarga<InvitacionConQr>(load);
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [foto, setFoto] = useState<FotoLista | null>(null);
  const [consentimiento, setConsentimiento] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [fotoV, setFotoV] = useState(0);
  const dato = carga.estado === 'lista' ? carga.datos : null;
  // The real photo of the guest, once the robot has it (or is processing it).
  const verFoto = dato?.foto_estado === 'LISTA' || dato?.foto_estado === 'PENDIENTE';
  const fotoReal = useFoto(
    client,
    verFoto ? `/invitaciones/${id}/foto` : null,
    `${dato?.foto_estado}${fotoV}`,
  );
  // Once the guest arrived there is a visit: find it to offer the follow-up.
  const { recargarVisitas } = s;
  const llego = dato?.estado === 'LLEGO' || dato?.estado === 'SALIO';
  useEffect(() => {
    if (llego) void recargarVisitas();
  }, [llego, recargarVisitas]);
  const visita = (s.visitas.datos ?? []).find((v) => v.invitacion_id === id);

  const procesando = carga.estado === 'lista' && carga.datos.foto_estado === 'PENDIENTE';
  useEffect(() => {
    if (!procesando) return;
    let viva = true;
    const timer = setInterval(() => {
      void load().then(
        (datos) => {
          if (viva) setCarga({ estado: 'lista', datos });
        },
        (e: unknown) => {
          if (viva) setError(describir(e));
        },
      );
    }, 3000);
    return () => {
      viva = false;
      clearInterval(timer);
    };
  }, [procesando, load, setCarga]);

  /** Merges the API's answer without losing the QR payload that only GET returns. */
  const fusionar = (nueva: Invitacion) =>
    setCarga((c) =>
      c.estado === 'lista' ? { estado: 'lista', datos: { ...c.datos, ...nueva } } : c,
    );

  const accion = async (fn: () => Promise<void>) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      await fn();
    } catch (e) {
      setError(describir(e));
    } finally {
      setOcupado(false);
    }
  };

  if (carga.estado === 'cargando') {
    return (
      <Frame title="Invitación" onBack={onBack}>
        <Cargando filas={2} />
      </Frame>
    );
  }
  if (carga.estado === 'error') {
    return (
      <Frame title="Invitación" onBack={onBack}>
        <Fallo error={carga.error} onRetry={() => void recargar()} />
      </Frame>
    );
  }
  const inv = carga.datos;

  if (editando) {
    return (
      <EditarInvitacion
        inv={inv}
        onCancel={() => setEditando(false)}
        onGuardada={(nueva) => {
          fusionar(nueva);
          void s.recargarInvitaciones();
          setEditando(false);
          setAviso('Cambios guardados.');
        }}
      />
    );
  }

  const abierta = inv.estado === 'PROGRAMADA' || inv.estado === 'LLEGO';
  const editable = inv.estado === 'PROGRAMADA';
  const codigo = inv.qr_payload;

  const compartirQr = () =>
    accion(async () => {
      if (!codigo) return;
      const enlace = enlaceInvitacion(codigo);
      const r = await compartir(mensajeInvitacion(inv, enlace));
      if (r === 'copiado') setAviso('Enlace copiado. Pégalo en un mensaje para tu invitado.');
      if (r === 'fallo') setError(describir(null));
    });

  const subirFoto = () =>
    accion(async () => {
      if (!foto) return;
      fusionar(await client.subirFoto(inv.id, await formularioFoto(foto)));
      setFotoV((n) => n + 1);
      void s.recargarInvitaciones();
      setSubiendo(false);
      setFoto(null);
      setConsentimiento(false);
      setAviso('Foto enviada. El robot la está procesando.');
    });

  const quitarFoto = () =>
    accion(async () => {
      fusionar(await client.quitarFoto(inv.id));
      setFotoV((n) => n + 1);
      void s.recargarInvitaciones();
      setAviso('Foto quitada. El robot le pedirá un QR.');
    });

  const cancelar = () =>
    accion(async () => {
      setConfirmando(false);
      fusionar(await client.cancelarInvitacion(inv.id));
      void s.recargarInvitaciones();
      setAviso('Invitación cancelada.');
    });

  /** The photo can change only before the guest arrives. */
  const fotoActiva = editable;
  const sinConsentir = !!foto && !consentimiento;
  const hoy = hoyBogota(s.ahora());
  const banners = (
    <>
      {creada ? (
        <Banner kind="info" title="Invitación creada">
          Compártela con tu invitado.
        </Banner>
      ) : null}
      {fotoError ? (
        <Banner kind="warning" title="La foto no se pudo subir">
          {`${fotoError} Puedes subirla desde aquí.`}
        </Banner>
      ) : null}
      {aviso ? <Banner kind="info">{aviso}</Banner> : null}
      {error ? <Banner kind="error">{error.detalle}</Banner> : null}
    </>
  );
  const abrirFoto = () => {
    setMenu(false);
    setVista('foto');
    setSubiendo(true);
  };
  const cerrarSubida = () => {
    setSubiendo(false);
    setFoto(null);
    setConsentimiento(false);
  };
  const etiquetaFoto =
    inv.foto_estado === 'RECHAZADA'
      ? 'Subir otra'
      : inv.foto_estado === 'NINGUNA'
        ? 'Agregar foto'
        : 'Cambiar foto';

  if (vista === 'foto') {
    return (
      <Frame
        title="Foto"
        onBack={() => {
          cerrarSubida();
          setVista('resumen');
        }}
      >
        {banners}
        <View style={{ alignItems: 'center', gap: space[3] }}>
          {fotoReal.uri ? (
            <Image
              source={{ uri: fotoReal.uri }}
              accessibilityLabel={`Foto de ${nombreCompleto(inv)}`}
              style={{ width: 168, height: 168, backgroundColor: colors.surfaceSoft }}
            />
          ) : null}
          {subiendo && inv.foto_estado === 'NINGUNA' ? null : (
            <Text tone="muted" align="center">
              {FOTO_TEXTO[inv.foto_estado]}
            </Text>
          )}
        </View>
        {inv.foto_estado === 'RECHAZADA' && inv.foto_motivo ? (
          <Banner kind="error">{inv.foto_motivo}</Banner>
        ) : null}
        {fotoActiva && !subiendo ? (
          <View style={{ gap: space[2] }}>
            <Button
              label={etiquetaFoto}
              variant="secondary"
              fullWidth
              disabled={ocupado}
              onPress={() => setSubiendo(true)}
            />
            {inv.foto_estado !== 'NINGUNA' ? (
              <Button
                label="Quitar foto"
                variant="ghost"
                fullWidth
                disabled={ocupado}
                onPress={() => void quitarFoto()}
              />
            ) : null}
          </View>
        ) : null}
        {fotoActiva && subiendo ? (
          <View style={{ gap: space[3] }}>
            <PhotoField
              foto={foto}
              onFoto={setFoto}
              consentimiento={consentimiento}
              onConsentimiento={setConsentimiento}
              disabled={ocupado}
            />
            <Button
              label="Subir foto"
              size="lg"
              fullWidth
              loading={ocupado}
              disabled={!foto || sinConsentir}
              onPress={() => void subirFoto()}
            />
            <Button
              label="Ahora no"
              variant="ghost"
              fullWidth
              disabled={ocupado}
              onPress={cerrarSubida}
            />
          </View>
        ) : null}
      </Frame>
    );
  }

  if (vista === 'cedula') {
    return (
      <Frame title="Cédula" onBack={() => setVista('resumen')}>
        {banners}
        <DocumentoInvitado
          client={client}
          inv={inv}
          editable={fotoActiva}
          onInvitacion={fusionar}
        />
      </Frame>
    );
  }

  const linea = `${diaFrase(inv.fecha, hoy)} · ${inv.hora_desde} a ${inv.hora_hasta} · ${inv.lugar}`;
  const hayDetalles = !!(
    inv.nota ||
    inv.punto_encuentro ||
    inv.preferencias_bebida?.length ||
    inv.asistencia?.length
  );
  return (
    <Frame
      onBack={onBack}
      right={
        <IconoBoton
          icon="ellipsis-horizontal"
          label="Más acciones"
          onPress={() => setMenu((m) => !m)}
        />
      }
    >
      {banners}
      {menu ? (
        <Grupo>
          {editable ? (
            <Fila
              primero
              icono="create-outline"
              titulo="Editar"
              onPress={() => {
                setMenu(false);
                setEditando(true);
              }}
            />
          ) : null}
          {fotoActiva ? (
            <Fila
              primero={!editable}
              icono="camera-outline"
              titulo={etiquetaFoto}
              onPress={abrirFoto}
            />
          ) : null}
          <Fila
            primero={!editable && !fotoActiva}
            icono="card-outline"
            titulo="Cédula"
            onPress={() => {
              setMenu(false);
              setVista('cedula');
            }}
          />
          {editable ? (
            <Fila
              icono="close-circle-outline"
              titulo="Cancelar invitación"
              onPress={() => {
                setMenu(false);
                setConfirmando(true);
              }}
            />
          ) : null}
        </Grupo>
      ) : null}

      <View style={{ alignItems: 'center', gap: space[3] }}>
        <Avatar nombre={inv.nombre} apellido={inv.apellido} size={112} uri={fotoReal.uri} anillo />
        <Text variant="h1" level={1} align="center">
          {nombreCompleto(inv)}
        </Text>
        <Text tone="muted" align="center">
          {linea}
        </Text>
        {inv.estado !== 'PROGRAMADA' ? (
          <Text
            align="center"
            style={{ fontFamily: fonts.bodyMedium }}
            accessibilityLabel={`Estado: ${FRASE_ESTADO[inv.estado]}`}
          >
            {FRASE_ESTADO[inv.estado]}
          </Text>
        ) : null}
        {inv.foto_estado !== 'NINGUNA' ? (
          <Text variant="caption" tone="muted" align="center">
            {FOTO_TEXTO[inv.foto_estado]}
          </Text>
        ) : null}
      </View>
      {inv.foto_estado === 'RECHAZADA' && inv.foto_motivo ? (
        <Banner kind="error">{inv.foto_motivo}</Banner>
      ) : null}

      {abierta ? (
        <View style={{ alignItems: 'center' }}>
          {codigo ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.gold,
                backgroundColor: colors.white,
                padding: space[3],
              }}
            >
              <QrCode
                value={codigo}
                size={200}
                showCode={false}
                accessibilityLabel={`Código QR de la invitación de ${nombreCompleto(inv)}`}
              />
            </View>
          ) : (
            <Text tone="muted">El QR no está disponible por ahora.</Text>
          )}
        </View>
      ) : null}

      <View style={{ gap: space[1] }}>
        {codigo && abierta ? (
          <Button
            label="Compartir pase"
            size="lg"
            fullWidth
            disabled={ocupado}
            onPress={() => void compartirQr()}
          />
        ) : null}
        {visita && onVerVisita ? (
          <Button
            label={visita.estado === 'CERRADA' ? 'Evaluar la visita' : 'Ver acompañamiento'}
            variant="secondary"
            fullWidth
            onPress={() => onVerVisita(visita.id)}
          />
        ) : null}
        {fotoActiva && inv.foto_estado !== 'NINGUNA' ? (
          <Button
            label="Quitar foto"
            variant="ghost"
            fullWidth
            disabled={ocupado}
            onPress={() => void quitarFoto()}
          />
        ) : null}
        {fotoActiva && inv.foto_estado === 'NINGUNA' ? (
          <Button
            label="Agregar foto"
            variant="ghost"
            fullWidth
            disabled={ocupado}
            onPress={abrirFoto}
          />
        ) : null}
      </View>

      {hayDetalles ? (
        <View style={{ gap: space[4] }}>
          <Touchable
            label="Ver detalles"
            accessibilityState={{ expanded: detalles }}
            onPress={() => setDetalles((d) => !d)}
            style={({ pressed }) => ({
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTopWidth: 1,
              borderColor: colors.border,
              backgroundColor: pressed ? colors.surfaceSoft : 'transparent',
            })}
          >
            <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15 }}>Detalles</Text>
            <Icon
              name={detalles ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={18}
              color={colors.text}
            />
          </Touchable>
          {detalles ? (
            <View style={{ gap: space[4] }}>
              {inv.punto_encuentro ? (
                <Dato
                  icono="flag-outline"
                  titulo="Punto de encuentro"
                  texto={inv.punto_encuentro}
                />
              ) : null}
              {inv.preferencias_bebida?.length ? (
                <Dato
                  icono="cafe-outline"
                  titulo="Bebidas"
                  texto={resumenLista(BEBIDAS, inv.preferencias_bebida)}
                />
              ) : null}
              {inv.asistencia?.length ? (
                <Dato
                  icono="accessibility-outline"
                  titulo="Asistencia"
                  texto={resumenLista(ASISTENCIA, inv.asistencia)}
                />
              ) : null}
              {inv.nota ? (
                <Dato icono="chatbubble-ellipses-outline" titulo="Nota" texto={inv.nota} />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <ConfirmDialog
        visible={confirmando}
        danger
        title="¿Cancelar esta invitación?"
        body={`${inv.nombre} ya no podrá entrar con este QR.`}
        confirmLabel="Sí, cancelar"
        cancelLabel="No, mantener"
        onConfirm={() => void cancelar()}
        onCancel={() => setConfirmando(false)}
      />
    </Frame>
  );
}

function EditarInvitacion({
  inv,
  onCancel,
  onGuardada,
}: {
  inv: Invitacion;
  onCancel: () => void;
  onGuardada: (nueva: Invitacion) => void;
}) {
  const { client, ahora } = useSocio();
  const hoy = hoyBogota(ahora());
  const form = useInvitationForm(hoy, ahora(), {
    nombre: inv.nombre,
    apellido: inv.apellido,
    trato: inv.trato,
    fecha: inv.fecha,
    hora_desde: inv.hora_desde,
    hora_hasta: inv.hora_hasta,
    lugar: inv.lugar,
    nota: inv.nota ?? '',
    preferencias_bebida: inv.preferencias_bebida ?? [],
    asistencia: inv.asistencia ?? [],
    punto_encuentro: inv.punto_encuentro ?? '',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [arriba, setArriba] = useState(0);

  const guardar = async () => {
    if (!form.intentar()) {
      setArriba((n) => n + 1);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      onGuardada(await client.editarInvitacion(inv.id, aCuerpo(form.values, false)));
    } catch (e) {
      setError(describir(e));
      setArriba((n) => n + 1);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Frame
      title="Editar invitación"
      onBack={onCancel}
      scrollTopKey={arriba}
      footer={
        <Button
          label="Guardar cambios"
          size="lg"
          fullWidth
          loading={guardando}
          onPress={() => void guardar()}
        />
      }
    >
      {error ? <Banner kind="error">{error.detalle}</Banner> : null}
      <InvitationFields form={form} hoy={hoy} conFoto={false} disabled={guardando} />
    </Frame>
  );
}
