import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box, Cluster, Stack, Text } from '../index.js';

const meta = {
  title: 'Layout/Box',
  component: Box,
  args: { mt: 4, p: 3, surface: 'well', border: 'weld', children: 'A box spaced and toned with token utilities' },
  parameters: {
    docs: {
      description: {
        component:
          'A box spaced, toned and arranged with the token utility classes only (spec 076, skill frontend-architecture § 4): spacing `m` `mt` … `p` `pt` … `gap` on the 0–9 token scale (`--sy-space-*`), `tone` (a role token), `surface`, `border`, `display`, `align`, `justify`, `grow`, `full`. Every value is a token, so a rebrand changes `tokens.css` and every Box follows. The way a page adjusts space without a class name or a style; `Stack`, `Cluster`, `Split` and `Grid` take `gap`, `mt` and `mb` too. Use the layout components first.',
      },
    },
  },
} satisfies Meta<typeof Box>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Tones: Story = {
  render: () => (
    <Stack gap={2}>
      {(['default', 'muted', 'intent', 'ok', 'active', 'tobe', 'fail'] as const).map((tone) => (
        <Box key={tone} tone={tone}>
          <Text>{`tone="${tone}"`}</Text>
        </Box>
      ))}
    </Stack>
  ),
};

export const Spacing: Story = {
  render: () => (
    <Cluster gap={1}>
      {([1, 2, 3, 4, 6, 9] as const).map((p) => (
        <Box key={p} p={p} surface="raised" border="weld">
          <Text small mono>{`p={${String(p)}}`}</Text>
        </Box>
      ))}
    </Cluster>
  ),
};
