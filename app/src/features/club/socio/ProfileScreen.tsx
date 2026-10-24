import { useState } from 'react';
import { View } from 'react-native';

import { Button, Text, space } from '../../../design-system';
import { nombreCompleto } from './model';
import { useWhileFocused } from './hooks';
import type { Seccion } from './nav';
import { useSocio } from './SocioContext';
import { useFoto } from './useFoto';
import { Avatar } from './ui/Avatar';
import { Fila, Grupo } from './ui/Fila';
import { Frame } from './ui/Frame';

/**
 * Perfil: who is signed in and a short list. Each data row opens its own screen (`onAbrir`);
 * "Cerrar sesión" is a quiet text button at the end.
 */
export function ProfileScreen({
  onAbrir,
  onSalir,
  onQr,
}: {
  onAbrir: (seccion: Seccion) => void;
  onSalir: () => void;
  onQr: () => void;
}) {
  const s = useSocio();
  const { client, usuario, perfil } = s;
  useWhileFocused(s.recargarPerfil);
  const [saliendo, setSaliendo] = useState(false);
  const p = perfil.datos;
  const conFoto = p?.foto_estado === 'LISTA' || p?.foto_estado === 'PENDIENTE';
  const foto = useFoto(client, conFoto ? '/me/foto' : null, p?.foto_estado);

  const salir = async () => {
    setSaliendo(true);
    await client.logout();
    onSalir();
  };

  return (
    <Frame title="Perfil">
      <View style={{ alignItems: 'center', gap: space[4], paddingTop: space[3] }}>
        <Avatar nombre={usuario.nombre} apellido={usuario.apellido} size={88} uri={foto.uri} />
        <Text variant="h2" level={2} align="center">
          {nombreCompleto(usuario)}
        </Text>
      </View>
      <Grupo>
        <Fila primero icono="qr-code-outline" titulo="Mi pase" onPress={onQr} />
        <Fila icono="camera-outline" titulo="Mi foto" onPress={() => onAbrir('foto')} />
        <Fila icono="cafe-outline" titulo="Preferencias" onPress={() => onAbrir('bebidas')} />
        <Fila
          icono="accessibility-outline"
          titulo="Asistencia"
          onPress={() => onAbrir('asistencia')}
        />
        <Fila icono="ribbon-outline" titulo="Membresía" onPress={() => onAbrir('membresia')} />
      </Grupo>
      <Button
        label="Cerrar sesión"
        variant="ghost"
        fullWidth
        loading={saliendo}
        onPress={() => void salir()}
      />
    </Frame>
  );
}
