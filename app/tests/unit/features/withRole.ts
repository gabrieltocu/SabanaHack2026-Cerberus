import { screen } from '@testing-library/react-native';

/**
 * Landmarks, lists and live regions are not accessibility "elements" for RNTL's getByRole,
 * so find them by walking the rendered tree. Optionally filter by accessibility label.
 */
export const withRole = (role: string, label?: string) =>
  screen.container.queryAll(
    (n) => n.props?.role === role && (label === undefined || n.props?.accessibilityLabel === label),
  );
