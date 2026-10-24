import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import { StyleSheet } from 'react-native';
import { BottomTabBar } from '@/design-system/components/BottomTabBar';
import { Card } from '@/design-system/components/Card';
import { MobileHeader } from '@/design-system/components/MobileHeader';
import { colors } from '@/design-system/tokens';

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never);

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sources(join(dir, e.name))
      : /\.tsx?$/.test(e.name) && e.name !== 'tokens.ts'
        ? [join(dir, e.name)]
        : [],
  );

describe('N Club Luxury skin', () => {
  it('has no curved corners and no shadows in the primitives', () => {
    for (const file of sources(join(process.cwd(), 'src/design-system'))) {
      const code = readFileSync(file, 'utf8');
      expect({ file, curved: /borderRadius\s*:\s*(?!0\b|radii\.)/.test(code) }).toEqual({
        file,
        curved: false,
      });
      expect({
        file,
        shadow: /boxShadow|elevation|shadow(Color|Offset|Opacity|Radius)/.test(code),
      }).toEqual({
        file,
        shadow: false,
      });
    }
  });

  it('Card is flat with a black line; the highlight tone turns the line gold', async () => {
    await render(
      <>
        <Card testID="plain" />
        <Card testID="hi" tone="highlight" />
      </>,
    );
    expect(flat(screen.getByTestId('plain')).borderColor).toBe(colors.border);
    expect(flat(screen.getByTestId('plain')).borderRadius).toBeUndefined();
    expect(flat(screen.getByTestId('hi')).borderColor).toBe(colors.gold);
  });

  it('brand header shows the logo and a thin gold line before the greeting', async () => {
    await render(<MobileHeader brand title="Hola, Sofía" safeTop={false} />);
    expect(screen.getByRole('image', { name: 'N Club' })).toBeTruthy();
    expect(screen.getByText('N CLUB')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Hola, Sofía' })).toBeTruthy();
    const line = screen.container.queryAll((n) => {
      const st = n.props?.style ? flat(n) : undefined;
      return st?.backgroundColor === colors.gold && st?.height === 1;
    });
    expect(line.length).toBeGreaterThan(0);
  });

  it('the active tab has a gold icon and an ink label; the others are muted', async () => {
    await render(
      <BottomTabBar
        items={[
          { key: 'a', label: 'Inicio', icon: 'home-outline' },
          { key: 'b', label: 'Perfil', icon: 'person-outline' },
        ]}
        activeKey="a"
        onSelect={jest.fn()}
      />,
    );
    expect(flat(screen.getByText('Inicio')).color).toBe(colors.text);
    expect(flat(screen.getByText('Perfil')).color).toBe(colors.textMuted);
  });
});
