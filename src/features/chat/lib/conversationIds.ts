/** Firebase/custom-auth UIDs can themselves contain underscores. */
export function directParticipants(id: string, currentUid: string): string[] | null {
  if (!id.startsWith('dm_') || !currentUid) return null;
  const body = id.slice(3);
  const candidates = [
    body.startsWith(`${currentUid}_`) ? body.slice(currentUid.length + 1) : '',
    body.endsWith(`_${currentUid}`) ? body.slice(0, -currentUid.length - 1) : '',
  ];
  const other = candidates.find(
    (candidate) =>
      candidate && candidate !== currentUid && [currentUid, candidate].sort().join('_') === body,
  );
  return other ? [currentUid, other].sort() : null;
}
