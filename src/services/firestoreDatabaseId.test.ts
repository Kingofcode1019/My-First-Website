import assert from 'node:assert/strict';
import test from 'node:test';
import { firestoreDatabaseIdOrDefault, isRealtimeDatabaseUrl } from '../lib/firebase/databaseId';

test('default Firestore database configuration uses the default database', () => {
  assert.equal(firestoreDatabaseIdOrDefault(undefined, 'test'), undefined);
  assert.equal(firestoreDatabaseIdOrDefault('', 'test'), undefined);
  assert.equal(firestoreDatabaseIdOrDefault('(default)', 'test'), undefined);
});

test('Realtime Database URLs are identified and never used as Firestore IDs', () => {
  const realtimeUrl = 'https://invento2026-f43aa-default-rtdb.firebaseio.com';

  assert.equal(isRealtimeDatabaseUrl(realtimeUrl), true);
  assert.equal(firestoreDatabaseIdOrDefault(realtimeUrl, 'test'), undefined);
});

test('named Firestore database IDs are retained', () => {
  assert.equal(firestoreDatabaseIdOrDefault('store-main', 'test'), 'store-main');
});
