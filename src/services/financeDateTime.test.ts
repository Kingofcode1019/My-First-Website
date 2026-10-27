import assert from 'node:assert/strict';
import test from 'node:test';
import { localDateTimeInputToISOString, toLocalDateTimeInput } from '../lib/utils';

test('finance date-time input round trips using the browser local time', () => {
  const inputValue = '2026-10-11T17:52';
  const storedValue = localDateTimeInputToISOString(inputValue);

  assert.equal(toLocalDateTimeInput(storedValue), inputValue);
});

test('new finance records default to the current local date and time', () => {
  const before = new Date();
  const inputValue = toLocalDateTimeInput();
  const after = new Date();
  const parsedInput = new Date(inputValue);

  assert.ok(parsedInput.getTime() >= before.getTime() - 60_000);
  assert.ok(parsedInput.getTime() <= after.getTime());
});

test('legacy midnight UTC finance dates retain their originally entered date when edited', () => {
  assert.equal(toLocalDateTimeInput('2026-10-11T00:00:00.000Z'), '2026-10-11T00:00');
  assert.equal(toLocalDateTimeInput('2026-10-11'), '2026-10-11T00:00');
});
