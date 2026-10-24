import { useWindowDimensions } from 'react-native';
import { breakpoints, layout } from '../tokens';

export type BreakpointName = 'mobile' | 'tablet' | 'desktop';

export function useBreakpoint() {
  const { width } = useWindowDimensions();
  const name: BreakpointName =
    width >= breakpoints.desktop ? 'desktop' : width >= breakpoints.tablet ? 'tablet' : 'mobile';
  return {
    width,
    name,
    isTablet: name !== 'mobile',
    isDesktop: name === 'desktop',
    /** Index into a [mobile, tablet, desktop] tuple. */
    index: name === 'desktop' ? 2 : name === 'tablet' ? 1 : 0,
    gutter: layout.gutter[name],
  };
}
