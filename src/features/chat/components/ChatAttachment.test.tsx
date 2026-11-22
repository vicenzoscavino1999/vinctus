import { fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatMediaContent } from './ChatAttachment';

afterEach(() => vi.restoreAllMocks());
it('pauses audio when backgrounded and when leaving the chat after React clears its ref', () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const { unmount } = render(
    <ChatMediaContent url="https://example.com/note.wav" type="audio/wav" name="note.wav" />,
  );
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  fireEvent(document, new Event('visibilitychange'));
  expect(pause).toHaveBeenCalledTimes(1);
  unmount();
  expect(pause).toHaveBeenCalledTimes(2);
});
