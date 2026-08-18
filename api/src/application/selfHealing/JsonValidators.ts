function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

export function validateStateChanges(value: unknown): boolean {
  if (!isRecord(value)) return false;

  if (value.inventoryChanges !== undefined && !Array.isArray(value.inventoryChanges)) return false;

  if (value.locationChanges !== undefined) {
    if (!isRecord(value.locationChanges)) return false;
    const locationChanges = value.locationChanges;
    if (locationChanges.discovered !== undefined && !Array.isArray(locationChanges.discovered)) return false;
    if (locationChanges.newConnections !== undefined && !Array.isArray(locationChanges.newConnections)) return false;
  }

  if (value.conceptChanges !== undefined) {
    if (!isRecord(value.conceptChanges)) return false;
    const conceptChanges = value.conceptChanges;
    if (conceptChanges.discovered !== undefined && !Array.isArray(conceptChanges.discovered)) return false;
  }

  if (value.characterLifecycle !== undefined && !Array.isArray(value.characterLifecycle)) return false;

  return true;
}

export function normalizeStateChanges(value: unknown): {
  inventoryChanges: unknown[];
  locationChanges: { discovered: unknown[]; newConnections: unknown[] };
  conceptChanges: { discovered: unknown[] };
  characterLifecycle: unknown[];
} {
  const record = (validateStateChanges(value) ? value : {}) as Record<string, any>;
  return {
    inventoryChanges: Array.isArray(record.inventoryChanges) ? record.inventoryChanges : [],
    locationChanges: {
      discovered: Array.isArray(record.locationChanges?.discovered) ? record.locationChanges.discovered : [],
      newConnections: Array.isArray(record.locationChanges?.newConnections) ? record.locationChanges.newConnections : [],
    },
    conceptChanges: {
      discovered: Array.isArray(record.conceptChanges?.discovered) ? record.conceptChanges.discovered : [],
    },
    characterLifecycle: Array.isArray(record.characterLifecycle) ? record.characterLifecycle : [],
  };
}

export function validateCharacterSheet(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.name) && typeof value.description === 'string' && typeof value.personality === 'string' && typeof value.currentLocation === 'string';
}

export function validateLocationMap(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  if (entries.length === 0) return false;
  return entries.every(([, location]) => isNonEmptyString(location));
}
