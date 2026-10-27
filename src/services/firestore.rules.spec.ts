import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { collection, deleteDoc, doc, getDocs, orderBy, query, runTransaction, setDoc, updateDoc, where } from 'firebase/firestore';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';

const businessCollections = [
  'products',
  'inventoryMovements',
  'customers',
  'orders',
  'suppliers',
  'purchases',
  'accounts',
  'transactions',
  'journalEntries',
  'expenses',
  'financeCategories',
  'financeAuditLogs',
];

let testEnvironment: RulesTestEnvironment;

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: 'demo-business-isolation',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await testEnvironment.cleanup();
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
});

async function seedDocument(path: string, data: Record<string, unknown>) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

test('a newly authenticated owner can query an empty customer collection', async () => {
  const database = testEnvironment.authenticatedContext('new-owner').firestore();
  const customers = query(collection(database, 'users/new-owner/customers'), orderBy('name', 'asc'));
  const snapshot = await assertSucceeds(getDocs(customers));

  assert.equal(snapshot.empty, true);
});

test('an owner can read their own customers and business collections', async () => {
  await seedDocument('users/owner-a/customers/customer-a', { name: 'Customer A' });
  for (const collectionName of businessCollections.filter((name) => name !== 'customers')) {
    await seedDocument(`users/owner-a/${collectionName}/record-a`, { name: 'Record A' });
  }

  const database = testEnvironment.authenticatedContext('owner-a').firestore();
  const customers = query(collection(database, 'users/owner-a/customers'), orderBy('name', 'asc'));
  assert.equal((await assertSucceeds(getDocs(customers))).size, 1);

  for (const collectionName of businessCollections.filter((name) => name !== 'customers')) {
    const records = await assertSucceeds(getDocs(collection(database, `users/owner-a/${collectionName}`)));
    assert.equal(records.size, 1, `${collectionName} should remain readable by its owner`);
  }
});

test('one user cannot read another owner’s customers or business collections', async () => {
  for (const collectionName of businessCollections) {
    await seedDocument(`users/owner-b/${collectionName}/record-b`, { name: 'Private record' });
  }

  const database = testEnvironment.authenticatedContext('owner-a').firestore();
  for (const collectionName of businessCollections) {
    const records = collection(database, `users/owner-b/${collectionName}`);
    const read = collectionName === 'customers'
      ? getDocs(query(records, orderBy('name', 'asc')))
      : getDocs(records);
    await assertFails(read);
  }
});

test('an owner can record an expense against their account but cannot write another owner’s finance records', async () => {
  const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore();
  await assertSucceeds(setDoc(doc(ownerDb, 'users/owner-a/accounts/cash'), {
    name: 'Cash',
    currentBalance: 1000,
  }));
  await assertSucceeds(setDoc(doc(ownerDb, 'users/owner-a/transactions/expense-1'), {
    type: 'expense',
    amount: 100,
    accountId: 'cash',
    date: '2025-02-01T12:30:00.000Z',
  }));
  await assertSucceeds(updateDoc(doc(ownerDb, 'users/owner-a/accounts/cash'), {
    currentBalance: 900,
  }));

  const otherDb = testEnvironment.authenticatedContext('owner-b').firestore();
  await assertFails(setDoc(doc(otherDb, 'users/owner-a/transactions/expense-2'), {
    type: 'expense',
    amount: 100,
    accountId: 'cash',
    date: '2025-02-01T12:30:00.000Z',
  }));
  await assertFails(updateDoc(doc(otherDb, 'users/owner-a/accounts/cash'), {
    currentBalance: 800,
  }));
});

test('an owner can safely delete a manual expense with balance reversal and audit history', async () => {
  await seedDocument('users/owner-a/accounts/bank', {
    name: 'Bank',
    currentBalance: 9000,
  });
  await seedDocument('users/owner-a/transactions/expense-1', {
    id: 'expense-1',
    type: 'expense',
    amount: 1000,
    accountId: 'bank',
    accountName: 'Bank',
    referenceId: '',
    date: '2025-02-01T12:30:00.000Z',
    createdAt: '2025-02-01T12:30:00.000Z',
  });

  const database = testEnvironment.authenticatedContext('owner-a').firestore();
  const linkedEntries = await assertSucceeds(getDocs(query(
    collection(database, 'users/owner-a/journalEntries'),
    where('sourceId', '==', 'expense-1')
  )));
  assert.equal(linkedEntries.empty, true);

  await assertSucceeds(runTransaction(database, async (transaction) => {
    const transactionRef = doc(database, 'users/owner-a/transactions/expense-1');
    const accountRef = doc(database, 'users/owner-a/accounts/bank');
    const transactionSnapshot = await transaction.get(transactionRef);
    const accountSnapshot = await transaction.get(accountRef);
    assert.equal(transactionSnapshot.exists(), true);
    assert.equal(accountSnapshot.exists(), true);

    const auditRef = doc(collection(database, 'users/owner-a/financeAuditLogs'));
    transaction.update(accountRef, { currentBalance: 10000 });
    transaction.delete(transactionRef);
    transaction.set(auditRef, {
      action: 'transaction_deleted',
      recordType: 'transaction',
      recordId: 'expense-1',
      previousValues: transactionSnapshot.data(),
      reason: 'Manual transaction deleted and account effect reversed',
      responsibleUserId: 'owner-a',
      timestamp: '2025-02-02T12:30:00.000Z',
    });
  }));

  const account = await assertSucceeds(getDocs(collection(database, 'users/owner-a/accounts')));
  const transactions = await assertSucceeds(getDocs(collection(database, 'users/owner-a/transactions')));
  const audits = await assertSucceeds(getDocs(collection(database, 'users/owner-a/financeAuditLogs')));
  assert.equal(account.docs[0].data().currentBalance, 10000);
  assert.equal(transactions.empty, true);
  assert.equal(audits.size, 1);
});

test('an owner can adjust an account balance and create the adjustment record and audit atomically', async () => {
  await seedDocument('users/owner-a/accounts/bank', {
    name: 'Bank',
    currentBalance: 9000,
  });

  const database = testEnvironment.authenticatedContext('owner-a').firestore();
  await assertSucceeds(runTransaction(database, async (transaction) => {
    const accountRef = doc(database, 'users/owner-a/accounts/bank');
    const adjustmentRef = doc(database, 'users/owner-a/transactions/adjust_request-123');
    const accountSnapshot = await transaction.get(accountRef);
    const adjustmentSnapshot = await transaction.get(adjustmentRef);
    assert.equal(accountSnapshot.exists(), true);
    assert.equal(adjustmentSnapshot.exists(), false);

    const previousBalance = accountSnapshot.data()!.currentBalance;
    const adjustedBalance = 10000;
    const auditRef = doc(collection(database, 'users/owner-a/financeAuditLogs'));
    transaction.update(accountRef, { currentBalance: adjustedBalance });
    transaction.set(adjustmentRef, {
      id: adjustmentRef.id,
      type: 'balance_adjustment',
      amount: adjustedBalance - previousBalance,
      accountId: 'bank',
      previousBalance,
      adjustedBalance,
      adjustmentDifference: adjustedBalance - previousBalance,
      adjustmentReason: 'Reconciled bank statement',
      adjustedBy: 'owner-a',
      idempotencyKey: 'request-123',
      date: '2026-10-11T18:00:00.000Z',
      createdAt: '2026-10-11T18:00:00.000Z',
    });
    transaction.set(auditRef, {
      action: 'balance_adjusted',
      recordType: 'account',
      recordId: 'bank',
      previousValues: { balance: previousBalance },
      newValues: { balance: adjustedBalance, difference: adjustedBalance - previousBalance },
      reason: 'Reconciled bank statement',
      responsibleUserId: 'owner-a',
      timestamp: '2026-10-11T18:00:00.000Z',
    });
  }));

  const account = await assertSucceeds(getDocs(collection(database, 'users/owner-a/accounts')));
  const transactions = await assertSucceeds(getDocs(collection(database, 'users/owner-a/transactions')));
  const audits = await assertSucceeds(getDocs(collection(database, 'users/owner-a/financeAuditLogs')));
  assert.equal(account.docs[0].data().currentBalance, 10000);
  assert.equal(transactions.size, 1);
  assert.equal(transactions.docs[0].data().type, 'balance_adjustment');
  assert.equal(audits.size, 1);
});

test('finance audit history is owner-readable, append-only, and immutable', async () => {
  const auditPath = 'users/owner-a/financeAuditLogs/audit-1';
  const auditEntry = {
    action: 'balance_adjusted',
    recordType: 'account',
    recordId: 'cash',
    reason: 'Cash count',
    responsibleUserId: 'owner-a',
    timestamp: '2025-02-01T00:00:00.000Z',
  };
  const ownerDb = testEnvironment.authenticatedContext('owner-a').firestore();
  await assertSucceeds(setDoc(doc(ownerDb, auditPath), auditEntry));
  await assertFails(updateDoc(doc(ownerDb, auditPath), { reason: 'changed' }));
  await assertFails(deleteDoc(doc(ownerDb, auditPath)));

  const otherDb = testEnvironment.authenticatedContext('owner-b').firestore();
  await assertFails(getDocs(collection(otherDb, 'users/owner-a/financeAuditLogs')));
  await assertFails(setDoc(doc(otherDb, 'users/owner-a/financeAuditLogs/audit-2'), auditEntry));
});

test('the previous customer ID read check rejects an unconstrained list query', async () => {
  const legacyEnvironment = await initializeTestEnvironment({
    projectId: 'demo-business-isolation-legacy',
    firestore: {
      rules: `rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            function isValidId(id) {
              return id is string && id.size() > 0 && id.size() <= 128;
            }
            match /users/{userId}/customers/{customerId} {
              allow read: if request.auth != null
                && request.auth.uid == userId
                && isValidId(customerId);
            }
          }
        }`,
    },
  });

  try {
    await legacyEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/owner-a/customers/customer-a'), { name: 'Customer A' });
    });

    const database = legacyEnvironment.authenticatedContext('owner-a').firestore();
    const customers = query(collection(database, 'users/owner-a/customers'), orderBy('name', 'asc'));
    await assertFails(getDocs(customers));
  } finally {
    await legacyEnvironment.cleanup();
  }
});
