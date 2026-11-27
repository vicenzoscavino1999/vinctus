import { getGroup } from '@/features/groups/api';
import { useSessionResource } from '@/shared/hooks/useSessionResource';

const GROUP_NAME_MAX_AGE_MS = 30 * 60_000;

/** A group's name, asked once per session and shared by everything that shows it. */
export function useGroupName(groupId: string | null | undefined): string | null {
  const resource = useSessionResource(
    groupId ? `group-name:${groupId}` : null,
    async () => (groupId ? ((await getGroup(groupId))?.name ?? null) : null),
    GROUP_NAME_MAX_AGE_MS,
  );
  return resource.data ?? null;
}
