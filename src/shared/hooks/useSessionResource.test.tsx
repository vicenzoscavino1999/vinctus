import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { clearSessionResources, useSessionResource } from './useSessionResource';

afterEach(() => clearSessionResources());

function Probe({ id, load, maxAge }: { id: string; load: () => Promise<string>; maxAge?: number }) {
  const resource = useSessionResource(`test:${id}`, load, maxAge);
  return (
    <div>
      <p data-testid={`value-${id}`}>{resource.data ?? (resource.error ? 'error' : 'empty')}</p>
      <button type="button" onClick={resource.reload}>
        reload {id}
      </button>
    </div>
  );
}

it('shares one request between components and shows cached data on the next mount', async () => {
  const load = vi.fn().mockResolvedValue('ready');
  const { unmount } = render(
    <>
      <Probe id="a" load={load} />
      <Probe id="a" load={load} />
    </>,
  );
  await waitFor(() => expect(screen.getAllByText('ready')).toHaveLength(2));
  expect(load).toHaveBeenCalledTimes(1);
  unmount();

  render(<Probe id="a" load={load} />);
  expect(screen.getByTestId('value-a')).toHaveTextContent('ready');
  expect(load).toHaveBeenCalledTimes(1);
});

it('refreshes stale data in the background while still showing it', async () => {
  const load = vi.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new');
  const { unmount } = render(<Probe id="b" load={load} maxAge={0} />);
  await waitFor(() => expect(screen.getByTestId('value-b')).toHaveTextContent('old'));
  unmount();
  await new Promise((resolve) => setTimeout(resolve, 2));

  render(<Probe id="b" load={load} maxAge={0} />);
  expect(screen.getByTestId('value-b')).toHaveTextContent('old');
  await waitFor(() => expect(screen.getByTestId('value-b')).toHaveTextContent('new'));
});

it('keeps the error until a reload succeeds', async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('back');
  render(<Probe id="c" load={load} />);
  await waitFor(() => expect(screen.getByTestId('value-c')).toHaveTextContent('error'));
  await act(async () => screen.getByText('reload c').click());
  await waitFor(() => expect(screen.getByTestId('value-c')).toHaveTextContent('back'));
});
