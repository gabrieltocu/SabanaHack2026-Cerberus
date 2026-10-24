import { Text, type TextProps } from 'react-native';

// Test double for @expo/vector-icons/Ionicons: renders the glyph name as text, no font loading.
function Ionicons({
  name,
  size,
  color,
  ...rest
}: TextProps & { name: string; size?: number; color?: string }) {
  return (
    <Text {...rest} style={{ fontSize: size, color }}>
      {name}
    </Text>
  );
}
Ionicons.font = { ionicons: 1 };
export default Ionicons;
