export function isRealtimeDatabaseUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim()) || /\.firebaseio\.com$/i.test(value.trim());
}

export function firestoreDatabaseIdOrDefault(
  value: string | undefined,
  configSource: string
): string | undefined {
  const databaseId = value?.trim();
  if (!databaseId || databaseId === '(default)') return undefined;
  if (isRealtimeDatabaseUrl(databaseId)) {
    console.error(
      `${configSource} is a Realtime Database URL, not a Firestore database ID. Using the default Firestore database; clear this setting or enter the Firestore ID.`
    );
    return undefined;
  }
  return databaseId;
}
