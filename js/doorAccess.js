export const isAccessItem = item => item?.kind === 'material' && ['key','keycard'].includes(item.key);
export function doorAccessError(door, actor) {
  if (!door.lockType || door.unlocked) return '';
  const item=actor?.itemSlots?.[actor?._doorCredentialIndex];
  if (door.lockType==='key' && item?.key==='key' && isAccessItem(item)) return '';
  if (door.lockType==='keycard' && item?.key==='keycard' && isAccessItem(item) && (item.tier??1)>=(door.lockTier??1)) return '';
  return door.lockType==='key' ? 'Use a key, then click the locked door.' : 'Use a tier '+(door.lockTier??1)+' or higher keycard, then click the door.';
}
