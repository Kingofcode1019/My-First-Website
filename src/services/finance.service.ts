import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, cleanObject } from '../lib/firebase';
import { inBuildStorage } from '../lib/inBuildStorage';
import { Account, FinanceAuditEntry, FinanceCategory, FinanceCategoryType, JournalEntry, LinkedShippingExpense, Product, Purchase, Transaction, TransactionType } from '../types';
import { buildOtherInflowJournalLines, makeJournalEntry } from './accounting';
import { buildBalanceAdjustmentTransaction } from '../lib/balanceAdjustment';
import { featureFlagsService } from './featureFlags.service';
import {
  assertCustomFinanceCategoryName,
  financeCategoryDocumentId,
  financeCategoryKey,
} from '../lib/financeCategories';
import {
  buildUpdatedManualTransaction,
  calculateManualTransactionBalances,
  isStandaloneManualTransaction,
  reverseManualTransactionBalances,
  buildUpdatedPurchasePayment,
  isPurchasePaymentTransaction,
  ManualTransactionUpdate,
  calculateTransferBalances,
  TransferTransactionUpdate,
} from '../lib/manualTransaction';

function assertFinanceUserScope(userId: string): void {
  if (!userId) throw new Error('Sign in or select a workspace before correcting finance records');
  if (inBuildStorage.getStorageMode() === 'in-build') {
    const activeUid = localStorage.getItem('apex_personal_storage_uid') ||
      'local_merchant';
    if (userId !== activeUid) throw new Error('You are not authorized to change this workspace');
    return;
  }
  if (!auth?.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('You are not authorized to change this workspace');
  }
}

function newFinanceAuditEntry(
  ref: string,
  userId: string,
  data: Omit<FinanceAuditEntry, 'id' | 'responsibleUserId' | 'timestamp'>
): FinanceAuditEntry {
  return {
    id: ref,
    ...data,
    responsibleUserId: userId,
    timestamp: new Date().toISOString(),
  };
}

export const financeService = {
  async getAccounts(userId: string): Promise<Account[]> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      inBuildStorage.ensureInitialized();
      return inBuildStorage.getAccounts();
    }

    const path = `users/${userId}/accounts`;
    try {
      const q = query(collection(db, path), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      const accounts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Account));
      if (accounts.length > 0) return accounts;

      const defaults: Array<Omit<Account, 'id' | 'createdAt' | 'updatedAt'>> = [
        { name: 'Cash', type: 'cash', startingBalance: 0, currentBalance: 0, isActive: true },
        { name: 'bKash', type: 'bkash', startingBalance: 0, currentBalance: 0, isActive: true },
      ];

      for (const account of defaults) {
        await this.createAccount(userId, account);
      }
      return await this.getAccounts(userId);
    } catch (err) {
      throw err;
    }
  },

  async createAccount(userId: string, data: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Promise<Account> {
    const sanitized = cleanObject(data);
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.createAccount(sanitized);
    }

    const path = `users/${userId}/accounts`;
    try {
      const accRef = doc(collection(db, path));
      const now = new Date().toISOString();
      const newAcc: Account = {
        id: accRef.id,
        ...sanitized,
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(accRef, newAcc);
      return newAcc;
    } catch (err) {
      throw err;
    }
  },

  async updateAccount(userId: string, accountId: string, updates: Partial<Account>): Promise<void> {
    const sanitized = cleanObject(updates);
    if (inBuildStorage.getStorageMode() === 'in-build') {
      inBuildStorage.updateAccount(accountId, sanitized);
      return;
    }

    const path = `users/${userId}/accounts/${accountId}`;
    try {
      await updateDoc(doc(db, path), {
        ...sanitized,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      throw err;
    }
  },

  async getTransactions(userId: string): Promise<Transaction[]> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.getTransactions();
    }

    const path = `users/${userId}/transactions`;
    try {
      const q = query(collection(db, path), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction));
    } catch (err) {
      throw err;
    }
  },

  async getJournalLinkedTransactionIds(userId: string): Promise<string[]> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.getJournalEntries().map((entry) => entry.sourceId);
    }
    const snapshot = await getDocs(collection(db, `users/${userId}/journalEntries`));
    return snapshot.docs
      .map((entry) => entry.data().sourceId)
      .filter((sourceId): sourceId is string => typeof sourceId === 'string' && sourceId.length > 0);
  },

  async getFinanceCategories(userId: string, type: FinanceCategoryType): Promise<FinanceCategory[]> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.getFinanceCategories(type);
    }
    const snapshot = await getDocs(collection(db, `users/${userId}/financeCategories`));
    return snapshot.docs
      .map((categoryDoc) => ({ id: categoryDoc.id, ...categoryDoc.data() } as FinanceCategory))
      .filter((category) => category.type === type && !category.isArchived)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async saveFinanceCategory(
    userId: string,
    type: FinanceCategoryType,
    name: string
  ): Promise<FinanceCategory> {
    assertFinanceUserScope(userId);
    const normalizedName = assertCustomFinanceCategoryName(type, name);
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.saveFinanceCategory(type, normalizedName);
    }
    const normalizedNameKey = financeCategoryKey(normalizedName);
    const categoryRef = doc(
      db,
      `users/${userId}/financeCategories/${financeCategoryDocumentId(type, normalizedNameKey)}`
    );
    const now = new Date().toISOString();
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(categoryRef);
      if (
        snapshot.exists() &&
        (snapshot.data().type !== type || snapshot.data().normalizedName !== normalizedNameKey)
      ) {
        throw new Error('Category name conflicts with an existing category');
      }
      const category: FinanceCategory = snapshot.exists()
        ? {
            id: categoryRef.id,
            ...(snapshot.data() as Omit<FinanceCategory, 'id'>),
            isArchived: false,
            updatedAt: now,
          }
        : {
            id: categoryRef.id,
            type,
            name: normalizedName,
            normalizedName: normalizedNameKey,
            isArchived: false,
            createdAt: now,
            updatedAt: now,
          };
      transaction.set(categoryRef, category);
      return category;
    });
  },

  async archiveFinanceCategory(userId: string, categoryId: string): Promise<void> {
    assertFinanceUserScope(userId);
    if (inBuildStorage.getStorageMode() === 'in-build') {
      inBuildStorage.archiveFinanceCategory(categoryId);
      return;
    }
    const categoryRef = doc(db, `users/${userId}/financeCategories/${categoryId}`);
    const snapshot = await getDoc(categoryRef);
    if (!snapshot.exists()) throw new Error('Category not found');
    await updateDoc(categoryRef, { isArchived: true, updatedAt: new Date().toISOString() });
  },

  async recordOtherInflow(
    userId: string,
    data: {
      amount: number;
      accountId: string;
      classification: 'other_income' | 'owner_investment' | 'loan_received' | 'refund_received';
      date: string;
      note?: string;
      reference?: string;
      category?: string;
    }
  ): Promise<Transaction> {
    if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error('Amount must be greater than zero');
    if (!data.accountId) throw new Error('Select a deposit account');
    const transactionType: Record<typeof data.classification, 'other_inflow' | 'owner_investment' | 'loan_received' | 'refund_received'> = {
      other_income: 'other_inflow',
      owner_investment: 'owner_investment',
      loan_received: 'loan_received',
      refund_received: 'refund_received',
    };
    const categoryLabel: Record<typeof data.classification, string> = {
      other_income: 'Other Income',
      owner_investment: 'Owner Investment',
      loan_received: 'Loan Received',
      refund_received: 'Refund Received',
    };
    const eventType: JournalEntry['eventType'] = data.classification === 'owner_investment'
      ? 'owner_investment'
      : data.classification === 'loan_received' ? 'loan_received' : 'other_inflow';

    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.recordOtherInflow({ ...data, transactionType: transactionType[data.classification] });
    }

    const accountRef = doc(db, `users/${userId}/accounts/${data.accountId}`);
    const transactionRef = doc(collection(db, `users/${userId}/transactions`));
    const journalRef = doc(db, `users/${userId}/journalEntries/${transactionRef.id}`);
    const now = new Date().toISOString();

    return runTransaction(db, async (firestoreTransaction) => {
      const accountSnapshot = await firestoreTransaction.get(accountRef);
      if (!accountSnapshot.exists()) throw new Error('Selected account does not exist');
      const account = accountSnapshot.data() as Account;
      const category = data.category === ''
        ? undefined
        : data.category?.trim() || categoryLabel[data.classification];
      const transaction: Transaction = {
        id: transactionRef.id,
        type: transactionType[data.classification],
        amount: data.amount,
        accountId: account.id,
        accountName: account.name,
        ...(category ? { category } : {}),
        referenceId: data.reference || transactionRef.id,
        eventType,
        date: data.date || now,
        note: data.note || '',
        createdAt: now,
      };
      const journalEntry: JournalEntry = makeJournalEntry({
        id: journalRef.id,
        eventType,
        sourceId: transactionRef.id,
        reference: transaction.referenceId || transactionRef.id,
        date: transaction.date,
        note: transaction.note,
        lines: buildOtherInflowJournalLines(data.amount, account.id, data.classification),
      });

      firestoreTransaction.update(accountRef, { currentBalance: (account.currentBalance || 0) + data.amount, updatedAt: now });
      firestoreTransaction.set(transactionRef, transaction);
      firestoreTransaction.set(journalRef, journalEntry);
      return transaction;
    });
  },

  async deleteTransaction(userId: string, transactionId: string): Promise<void> {
    assertFinanceUserScope(userId);
    if (inBuildStorage.getStorageMode() === 'in-build') {
      inBuildStorage.deleteTransaction(transactionId);
      return;
    }

    const transactionRef = doc(db, `users/${userId}/transactions/${transactionId}`);
    const auditRef = doc(collection(db, `users/${userId}/financeAuditLogs`));
    const linkedEntries = await getDocs(query(
      collection(db, `users/${userId}/journalEntries`),
      where('sourceId', '==', transactionId)
    ));
    if (!linkedEntries.empty) {
      throw new Error('This transaction is linked to another record and must be corrected from its original module');
    }
    await runTransaction(db, async (firestoreTransaction) => {
      const transactionSnapshot = await firestoreTransaction.get(transactionRef);
      if (!transactionSnapshot.exists()) throw new Error('Transaction not found');
      const entry = transactionSnapshot.data() as Transaction;
      if (!isStandaloneManualTransaction(entry)) {
        throw new Error('This transaction is linked to another record and must be corrected from its original module');
      }

      const sourceRef = doc(db, `users/${userId}/accounts/${entry.accountId}`);
      const sourceSnapshot = await firestoreTransaction.get(sourceRef);
      if (!sourceSnapshot.exists()) throw new Error('Transaction account not found');
      const source = sourceSnapshot.data() as Account;
      const now = new Date().toISOString();
      const reversedAccounts = reverseManualTransactionBalances([source], entry);
      const audit = newFinanceAuditEntry(auditRef.id, userId, {
        action: 'transaction_deleted',
        recordType: 'transaction',
        recordId: transactionId,
        previousValues: { ...entry },
        reason: 'Manual transaction deleted and account effect reversed',
      });
      firestoreTransaction.update(sourceRef, {
        currentBalance: reversedAccounts[0].currentBalance,
        updatedAt: now,
      });
      firestoreTransaction.delete(transactionRef);
      firestoreTransaction.set(auditRef, cleanObject(audit));
    });
  },

  async updateManualTransaction(
    userId: string,
    transactionId: string,
    update: ManualTransactionUpdate
  ): Promise<Transaction> {
    assertFinanceUserScope(userId);
    if (!Number.isFinite(update.amount) || update.amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }
    if (!update.accountId) throw new Error('Select an account');
    if (!Number.isFinite(new Date(update.date).getTime())) throw new Error('Enter a valid transaction date');
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.updateManualTransaction(transactionId, update);
    }

    const transactionRef = doc(db, `users/${userId}/transactions/${transactionId}`);
    const auditRef = doc(collection(db, `users/${userId}/financeAuditLogs`));
    const linkedEntries = await getDocs(query(
      collection(db, `users/${userId}/journalEntries`),
      where('sourceId', '==', transactionId)
    ));
    if (!linkedEntries.empty) {
      throw new Error('This transaction is linked to another record and must be corrected from its original module');
    }
    const now = new Date().toISOString();
    return runTransaction(db, async (firestoreTransaction) => {
      const transactionSnapshot = await firestoreTransaction.get(transactionRef);
      if (!transactionSnapshot.exists()) throw new Error('Transaction not found');
      const original = transactionSnapshot.data() as Transaction;
      const linkedPurchaseRef = original.referenceId
        ? doc(db, `users/${userId}/purchases/${original.referenceId}`)
        : null;
      const linkedPurchaseSnapshot = linkedPurchaseRef
        ? await firestoreTransaction.get(linkedPurchaseRef)
        : null;
      const linkedPurchase = linkedPurchaseSnapshot?.exists()
        ? { id: linkedPurchaseSnapshot.id, ...linkedPurchaseSnapshot.data() } as Purchase
        : null;
      const isPurchasePayment = linkedPurchase
        ? isPurchasePaymentTransaction(original, [linkedPurchase])
        : false;
      if (!isStandaloneManualTransaction(original) && !isPurchasePayment) {
        throw new Error('This transaction is linked to another record and must be corrected from its original module');
      }

      const sourceRef = doc(db, `users/${userId}/accounts/${original.accountId}`);
      const targetRef = doc(db, `users/${userId}/accounts/${update.accountId}`);
      const sourceSnapshot = await firestoreTransaction.get(sourceRef);
      if (!sourceSnapshot.exists()) throw new Error('Transaction account not found');
      const source = sourceSnapshot.data() as Account;
      const targetSnapshot = sourceRef.path === targetRef.path
        ? sourceSnapshot
        : await firestoreTransaction.get(targetRef);
      if (!targetSnapshot.exists()) throw new Error('Selected account does not exist');
      const target = targetSnapshot.data() as Account;
      const accounts = sourceRef.path === targetRef.path ? [source] : [source, target];
      const balances = calculateManualTransactionBalances(accounts, original, update);
      const updatedSource = balances.find((account) => account.id === source.id);
      const updatedTarget = balances.find((account) => account.id === target.id);
      if (!updatedSource || !updatedTarget) throw new Error('Could not calculate updated account balances');
      let updated = buildUpdatedManualTransaction(original, update, updatedTarget);
      let updatedPurchase: Purchase | null = null;
      if (isPurchasePayment && linkedPurchase) {
        const paymentUpdate = buildUpdatedPurchasePayment(
          linkedPurchase,
          original,
          update,
          updatedTarget
        );
        updatedPurchase = paymentUpdate.purchase;
        updated = { ...updated, category: original.category };
      }

      firestoreTransaction.update(sourceRef, { currentBalance: updatedSource.currentBalance, updatedAt: now });
      if (sourceRef.path !== targetRef.path) {
        firestoreTransaction.update(targetRef, { currentBalance: updatedTarget.currentBalance, updatedAt: now });
      }
      if (linkedPurchaseRef && updatedPurchase) {
        firestoreTransaction.update(linkedPurchaseRef, {
          amountPaid: updatedPurchase.amountPaid,
          paymentStatus: updatedPurchase.paymentStatus,
          payments: updatedPurchase.payments,
          updatedAt: now,
        });
      }
      const audit = newFinanceAuditEntry(auditRef.id, userId, {
        action: 'transaction_edited',
        recordType: 'transaction',
        recordId: transactionId,
        previousValues: linkedPurchase && updatedPurchase
          ? { transaction: original, purchase: linkedPurchase }
          : { ...original },
        newValues: linkedPurchase && updatedPurchase
          ? { transaction: updated, purchase: updatedPurchase }
          : { ...updated },
        reason: update.reason?.trim() ||
          (isPurchasePayment ? 'Purchase payment corrected' : 'Manual transaction corrected'),
      });
      firestoreTransaction.set(transactionRef, updated);
      firestoreTransaction.set(auditRef, cleanObject(audit));
      return updated;
    });
  },

  async updateTransfer(
    userId: string,
    transactionId: string,
    update: TransferTransactionUpdate
  ): Promise<Transaction> {
    assertFinanceUserScope(userId);
    if (!Number.isFinite(update.amount) || update.amount <= 0) {
      throw new Error('Transfer amount must be greater than zero');
    }
    if (!update.accountId || !update.targetAccountId || update.accountId === update.targetAccountId) {
      throw new Error('Select two different transfer accounts');
    }
    if (!Number.isFinite(new Date(update.date).getTime())) throw new Error('Enter a valid transfer date');
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.updateTransfer(transactionId, update);
    }

    const transactionRef = doc(db, `users/${userId}/transactions/${transactionId}`);
    const auditRef = doc(collection(db, `users/${userId}/financeAuditLogs`));
    const linkedEntries = await getDocs(query(
      collection(db, `users/${userId}/journalEntries`),
      where('sourceId', '==', transactionId)
    ));
    if (!linkedEntries.empty) {
      throw new Error('This transfer is linked to accounting records and cannot be edited here');
    }
    const now = new Date().toISOString();
    return runTransaction(db, async (firestoreTransaction) => {
      const transactionSnapshot = await firestoreTransaction.get(transactionRef);
      if (!transactionSnapshot.exists()) throw new Error('Transfer not found');
      const original = transactionSnapshot.data() as Transaction;
      if (original.type !== 'transfer' || !original.targetAccountId) {
        throw new Error('This transaction is not an editable account transfer');
      }
      const accountIds = Array.from(new Set([
        original.accountId,
        original.targetAccountId,
        update.accountId,
        update.targetAccountId,
      ]));
      const accountRefs = new Map(accountIds.map((id) => [
        id,
        doc(db, `users/${userId}/accounts/${id}`),
      ]));
      const accountSnapshots = new Map<string, Awaited<ReturnType<typeof firestoreTransaction.get>>>();
      for (const [id, ref] of accountRefs) {
        accountSnapshots.set(id, await firestoreTransaction.get(ref));
      }
      const accounts: Account[] = [];
      for (const id of accountIds) {
        const snapshot = accountSnapshots.get(id)!;
        if (!snapshot.exists()) throw new Error('One or more transfer accounts do not exist');
        accounts.push({ ...(snapshot.data() as Account), id: snapshot.id });
      }
      const adjustedAccounts = calculateTransferBalances(accounts, original, update);
      const sourceAccount = adjustedAccounts.find((account) => account.id === update.accountId)!;
      const destinationAccount = adjustedAccounts.find((account) => account.id === update.targetAccountId)!;
      const updated: Transaction = {
        ...original,
        amount: update.amount,
        accountId: sourceAccount.id,
        accountName: sourceAccount.name,
        targetAccountId: destinationAccount.id,
        targetAccountName: destinationAccount.name,
        category: 'Account Transfer',
        date: update.date,
        note: update.note?.trim() || `Transfer from ${sourceAccount.name} to ${destinationAccount.name}`,
      };
      const audit = newFinanceAuditEntry(auditRef.id, userId, {
        action: 'transaction_edited',
        recordType: 'transaction',
        recordId: transactionId,
        previousValues: { ...original },
        newValues: { ...updated },
        reason: update.reason?.trim() || 'Account transfer corrected',
      });
      for (const account of adjustedAccounts) {
        if (account.currentBalance !== accounts.find((item) => item.id === account.id)?.currentBalance) {
          firestoreTransaction.update(accountRefs.get(account.id)!, {
            currentBalance: account.currentBalance,
            updatedAt: now,
          });
        }
      }
      firestoreTransaction.set(transactionRef, cleanObject(updated));
      firestoreTransaction.set(auditRef, cleanObject(audit));
      return updated;
    });
  },

  async recordBalanceAdjustment(
    userId: string,
    data: {
      accountId: string;
      actualBalance: number;
      reason: string;
      date: string;
      idempotencyKey: string;
    }
  ): Promise<Transaction> {
    assertFinanceUserScope(userId);
    if (!(await featureFlagsService.isEnabled('balanceAdjustment'))) {
      throw new Error('Account balance adjustment is currently disabled');
    }
    if (!Number.isFinite(data.actualBalance)) throw new Error('Enter a valid actual balance');
    if (!data.reason.trim()) throw new Error('Enter a reason for the balance adjustment');
    if (!data.accountId) throw new Error('Select an account');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(data.idempotencyKey)) {
      throw new Error('Adjustment request is missing a valid unique key');
    }
    if (!Number.isFinite(new Date(data.date).getTime())) throw new Error('Enter a valid adjustment date');

    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.recordBalanceAdjustment({
        ...data,
        responsibleUserId: userId,
      });
    }

    const accountRef = doc(db, `users/${userId}/accounts/${data.accountId}`);
    const transactionRef = doc(db, `users/${userId}/transactions/adjust_${data.idempotencyKey}`);
    const auditRef = doc(collection(db, `users/${userId}/financeAuditLogs`));
    const now = new Date().toISOString();
    return runTransaction(db, async (firestoreTransaction) => {
      const accountSnapshot = await firestoreTransaction.get(accountRef);
      const existingTransactionSnapshot = await firestoreTransaction.get(transactionRef);
      if (!accountSnapshot.exists()) throw new Error('Selected account does not exist');
      if (existingTransactionSnapshot.exists()) {
        throw new Error('This balance adjustment has already been recorded');
      }
      const account = accountSnapshot.data() as Account;
      const previousBalance = Number(account.currentBalance) || 0;
      const difference = data.actualBalance - previousBalance;
      const transaction = buildBalanceAdjustmentTransaction(
        account,
        { ...data, responsibleUserId: userId },
        transactionRef.id,
        now
      );
      const audit = newFinanceAuditEntry(auditRef.id, userId, {
        action: 'balance_adjusted',
        recordType: 'account',
        recordId: account.id,
        previousValues: { balance: previousBalance },
        newValues: { balance: data.actualBalance, difference, transactionId: transactionRef.id },
        reason: data.reason.trim(),
      });
      firestoreTransaction.update(accountRef, {
        currentBalance: data.actualBalance,
        updatedAt: now,
      });
      firestoreTransaction.set(transactionRef, cleanObject(transaction));
      firestoreTransaction.set(auditRef, cleanObject(audit));
      return transaction;
    });
  },

  async getFinanceAuditEntries(userId: string): Promise<FinanceAuditEntry[]> {
    assertFinanceUserScope(userId);
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.getFinanceAuditEntries();
    }
    const snapshot = await getDocs(query(
      collection(db, `users/${userId}/financeAuditLogs`),
      orderBy('timestamp', 'desc')
    ));
    return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as FinanceAuditEntry));
  },

  async recordIncome(
    userId: string,
    data: {
      amount: number;
      accountId: string;
      category?: string;
      date: string;
      note?: string;
      referenceId?: string;
    }
  ): Promise<Transaction> {
    if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error('Amount must be greater than zero');
    if (!data.accountId) throw new Error('Select a deposit account');
    const sanitized = cleanObject(data);
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.recordIncome(sanitized);
    }

    const accRef = doc(db, `users/${userId}/accounts/${data.accountId}`);
    const txRef = doc(collection(db, `users/${userId}/transactions`));
    const now = new Date().toISOString();

    try {
      const res = await runTransaction(db, async (transaction) => {
        const accSnap = await transaction.get(accRef);
        if (!accSnap.exists()) {
          throw new Error('Selected account does not exist');
        }
        const acc = accSnap.data() as Account;
        const newBalance = (acc.currentBalance || 0) + data.amount;

        transaction.update(accRef, {
          currentBalance: newBalance,
          updatedAt: now,
        });

        const newTx: Transaction = {
          id: txRef.id,
          type: 'income',
          amount: data.amount,
          accountId: acc.id,
          accountName: acc.name,
          ...(data.category?.trim() ? { category: data.category.trim() } : {}),
          referenceId: data.referenceId || '',
          date: data.date || now,
          note: data.note || '',
          createdAt: now,
        };

        transaction.set(txRef, newTx);
        return newTx;
      });

      return res;
    } catch (err) {
      throw err;
    }
  },

  async recordExpense(
    userId: string,
    data: {
      amount: number;
      accountId: string;
      category?: string;
      date: string;
      note?: string;
      referenceId?: string;
    }
  ): Promise<Transaction> {
    assertFinanceUserScope(userId);
    if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error('Amount must be greater than zero');
    if (!data.accountId) throw new Error('Select a payment account');
    const sanitized = cleanObject(data);
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.recordExpense(sanitized);
    }

    const accRef = doc(db, `users/${userId}/accounts/${data.accountId}`);
    const txRef = doc(collection(db, `users/${userId}/transactions`));
    const now = new Date().toISOString();

    try {
      const res = await runTransaction(db, async (transaction) => {
        const accSnap = await transaction.get(accRef);
        if (!accSnap.exists()) {
          throw new Error('Selected account does not exist');
        }
        const acc = accSnap.data() as Account;
        const newBalance = (acc.currentBalance || 0) - data.amount;

        transaction.update(accRef, {
          currentBalance: newBalance,
          updatedAt: now,
        });

        const newTx: Transaction = {
          id: txRef.id,
          type: 'expense',
          amount: data.amount,
          accountId: acc.id,
          accountName: acc.name,
          ...(data.category?.trim() ? { category: data.category.trim() } : {}),
          referenceId: data.referenceId || '',
          date: data.date || now,
          note: data.note || '',
          createdAt: now,
        };

        transaction.set(txRef, newTx);
        return newTx;
      });

      return res;
    } catch (err) {
      throw err;
    }
  },

  async recordAssetPurchase(
    userId: string,
    data: {
      amount: number;
      accountId: string;
      category?: string;
      date: string;
      note?: string;
    }
  ): Promise<Transaction> {
    assertFinanceUserScope(userId);
    if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error('Amount must be greater than zero');
    if (!data.accountId) throw new Error('Select a payment account');
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.recordAssetPurchase(data);
    }

    const accountRef = doc(db, `users/${userId}/accounts/${data.accountId}`);
    const transactionRef = doc(collection(db, `users/${userId}/transactions`));
    const now = new Date().toISOString();

    return runTransaction(db, async (firestoreTransaction) => {
      const accountSnapshot = await firestoreTransaction.get(accountRef);
      if (!accountSnapshot.exists()) throw new Error('Selected account does not exist');
      const account = accountSnapshot.data() as Account;
      const assetTransaction: Transaction = {
        id: transactionRef.id,
        type: 'asset',
        amount: data.amount,
        accountId: account.id,
        accountName: account.name,
        ...(data.category?.trim() ? { category: data.category.trim() } : {}),
        date: data.date || now,
        note: data.note || '',
        createdAt: now,
      };

      firestoreTransaction.update(accountRef, {
        currentBalance: (account.currentBalance || 0) - data.amount,
        updatedAt: now,
      });
      firestoreTransaction.set(transactionRef, assetTransaction);
      return assetTransaction;
    });
  },

  async addLinkedShippingExpense(
    userId: string,
    purchaseId: string,
    shippingAmount: number,
    supplierId: string,
    date?: string,
    note?: string,
    billedBy: 'supplier' | 'courier' = 'supplier'
  ): Promise<LinkedShippingExpense> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.addLinkedShippingExpense({
        purchaseId,
        supplierId,
        shippingAmount,
        date,
        note,
        billedBy,
      });
    }
    if (shippingAmount <= 0) throw new Error('Shipping amount must be greater than zero');

    const purchaseRef = doc(db, `users/${userId}/purchases/${purchaseId}`);
    const supplierRef = doc(db, `users/${userId}/suppliers/${supplierId}`);
    const expenseRef = doc(collection(db, `users/${userId}/expenses`));
    const productRefs = new Map<string, ReturnType<typeof doc>>();
    const now = new Date().toISOString();

    return runTransaction(db, async (transaction) => {
      const purchaseSnapshot = await transaction.get(purchaseRef);
      const supplierSnapshot = await transaction.get(supplierRef);
      if (!purchaseSnapshot.exists()) throw new Error('Purchase not found');
      if (!supplierSnapshot.exists()) throw new Error('Supplier not found');
      const purchase = purchaseSnapshot.data() as Purchase;
      const supplier = supplierSnapshot.data();
      if (purchase.supplierId !== supplierId) throw new Error('Purchase does not belong to this supplier');

      const totalUnits = purchase.items.reduce((sum, item) => sum + item.quantity, 0);
      if (totalUnits <= 0) throw new Error('Purchase has no units to allocate shipping against');
      for (const item of purchase.items) {
        if (!productRefs.has(item.productId)) {
          productRefs.set(item.productId, doc(db, `users/${userId}/products/${item.productId}`));
        }
      }

      const productSnapshots = new Map<string, Product>();
      for (const [productId, productRef] of productRefs) {
        const productSnapshot = await transaction.get(productRef);
        if (productSnapshot.exists()) productSnapshots.set(productId, productSnapshot.data() as Product);
      }

      const shippingPerUnit = shippingAmount / totalUnits;
      let capitalizedAmount = 0;
      const inventoryUpdates: Array<{ ref: ReturnType<typeof doc>; product: Product; addedValue: number }> = [];
      for (const item of purchase.items) {
        const product = productSnapshots.get(item.productId);
        if (!product || product.currentStock <= 0) continue;
        const remainingUnits = Math.min(item.quantity, product.currentStock);
        const addedValue = shippingPerUnit * remainingUnits;
        capitalizedAmount += addedValue;
        inventoryUpdates.push({ ref: productRefs.get(item.productId)!, product, addedValue });
      }
      const expenseAmount = Math.max(0, shippingAmount - capitalizedAmount);
      const expenseDate = date || now;
      const updatedItems = purchase.items.map((item) => {
        const effectiveUnitCost = (item.effectiveUnitCost || item.purchasePrice) + shippingPerUnit;
        return { ...item, effectiveUnitCost, totalCost: effectiveUnitCost * item.quantity };
      });
      const updatedPurchaseAmount = (purchase.totalAmount || purchase.totalCost) + shippingAmount;

      const expense: LinkedShippingExpense = {
        id: expenseRef.id,
        purchaseId,
        supplierId,
        supplierName: supplier.company,
        category: 'Freight & Shipping',
        amount: shippingAmount,
        capitalizedAmount,
        expenseAmount,
        billedBy,
        date: expenseDate,
        createdAt: now,
        note: note || `Late shipping cost for purchase ${purchaseId}`,
      };

      for (const { ref, product, addedValue } of inventoryUpdates) {
        transaction.update(ref, {
          purchasePrice: (product.currentStock * (product.purchasePrice || 0) + addedValue) / product.currentStock,
          updatedAt: now,
        });
      }
      transaction.update(purchaseRef, {
        items: updatedItems,
        shippingCost: (purchase.shippingCost || 0) + shippingAmount,
        totalAmount: updatedPurchaseAmount,
        totalCost: updatedPurchaseAmount,
      });
      if (billedBy === 'supplier') {
        transaction.update(supplierRef, {
          totalPurchases: (supplier.totalPurchases || 0) + shippingAmount,
          updatedAt: now,
        });
      }
      transaction.set(expenseRef, expense);
      return expense;
    });
  },

  async recordTransfer(
    userId: string,
    data: {
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      date: string;
      note?: string;
    }
  ): Promise<Transaction> {
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error('Transfer amount must be greater than zero');
    }
    if (!data.fromAccountId || !data.toAccountId) {
      throw new Error('Select both source and destination accounts');
    }
    const sanitized = cleanObject(data);
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.recordTransfer(sanitized);
    }

    if (data.fromAccountId === data.toAccountId) {
      throw new Error('Source and destination accounts must be different');
    }
    const fromRef = doc(db, `users/${userId}/accounts/${data.fromAccountId}`);
    const toRef = doc(db, `users/${userId}/accounts/${data.toAccountId}`);
    const txRef = doc(collection(db, `users/${userId}/transactions`));
    const now = new Date().toISOString();

    try {
      const res = await runTransaction(db, async (transaction) => {
        const fromSnap = await transaction.get(fromRef);
        const toSnap = await transaction.get(toRef);
        if (!fromSnap.exists() || !toSnap.exists()) {
          throw new Error('One or both accounts do not exist');
        }
        const fromAcc = fromSnap.data() as Account;
        const toAcc = toSnap.data() as Account;

        const fromNewBalance = (fromAcc.currentBalance || 0) - data.amount;
        const toNewBalance = (toAcc.currentBalance || 0) + data.amount;

        transaction.update(fromRef, {
          currentBalance: fromNewBalance,
          updatedAt: now,
        });

        transaction.update(toRef, {
          currentBalance: toNewBalance,
          updatedAt: now,
        });

        const newTx: Transaction = {
          id: txRef.id,
          type: 'transfer',
          amount: data.amount,
          accountId: fromAcc.id,
          accountName: fromAcc.name,
          targetAccountId: toAcc.id,
          targetAccountName: toAcc.name,
          category: 'Account Transfer',
          date: data.date || now,
          note: data.note || `Transfer from ${fromAcc.name} to ${toAcc.name}`,
          createdAt: now,
        };

        transaction.set(txRef, newTx);
        return newTx;
      });

      return res;
    } catch (err) {
      throw err;
    }
  },
};
