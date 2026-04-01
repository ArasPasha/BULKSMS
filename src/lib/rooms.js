export const ROOMS = [
  'Living Room',
  'Bedroom',
  'Kitchen',
  'Bathroom',
  'Garage',
  'Office',
  'Basement',
  'Attic',
  'Other',
];

const ROOM_MAP = {
  'Living Room': { cls: 'badge-living',   emoji: '🛋️' },
  'Bedroom':     { cls: 'badge-bedroom',  emoji: '🛏️' },
  'Kitchen':     { cls: 'badge-kitchen',  emoji: '🍳' },
  'Bathroom':    { cls: 'badge-bathroom', emoji: '🚿' },
  'Garage':      { cls: 'badge-garage',   emoji: '🚗' },
  'Office':      { cls: 'badge-office',   emoji: '💼' },
  'Basement':    { cls: 'badge-other',    emoji: '🪜' },
  'Attic':       { cls: 'badge-other',    emoji: '📦' },
  'Other':       { cls: 'badge-other',    emoji: '🏠' },
};

export function roomBadgeClass(room) {
  return ROOM_MAP[room]?.cls ?? 'badge-other';
}

export function roomEmoji(room) {
  return ROOM_MAP[room]?.emoji ?? '📦';
}
