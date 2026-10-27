import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
} from 'firebase/firestore';
import { db, cleanObject } from '../lib/firebase';
import { inBuildStorage } from '../lib/inBuildStorage';
import {
  Account,
  Customer,
  Order,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  Product,
  ReturnCondition,
  Transaction as FinanceTransaction,
} from '../types';
import { getInitialPaymentStatus, getPaymentStatus } from './accounting';
import { customersService } from './customers.service';
import { createInvoiceNumber, createOrderNumber } from '../lib/invoice';
import { DeliveryCollectionMethod } from '../types';
import { buildCourierFeeExpense } from './courierExpense';

interface OrderStatusOptions {
  paymentStatus?: PaymentStatus;
  paymentAccountId?: string;
  returnCondition?: ReturnCondition;
  courierFeePaid?: number;
  courierAccountId?: string;
  cancellationReason?: string;
}

export const ordersService = {
  async getOrders(userId: string): Promise<Order[]> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.getOrders();
    }

    const path = `users/${userId}/orders`;
    try {
      const q = query(collection(db, path), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
    } catch (err) {
      throw err;
    }
  },

  async getOrderById(userId: string, orderId: string): Promise<Order | null> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.getOrderById(orderId);
    }

    const path = `users/${userId}/orders/${orderId}`;
    try {
      const snap = await getDoc(doc(db, path));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as Order;
    } catch (err) {
      throw err;
    }
  },

  async deleteOrder(userId: string, orderId: string): Promise<void> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      inBuildStorage.deleteOrder(orderId);
      return;
    }

    const orderRef = doc(db, `users/${userId}/orders/${orderId}`);
    const snapshot = await getDoc(orderRef);
    if (!snapshot.exists()) throw new Error('Order not found');
    const order = snapshot.data() as Order;
    if (order.orderStatus !== 'cancelled' || order.stockDeducted) {
      throw new Error('Only cancelled orders with restored stock can be deleted');
    }
    await deleteDoc(orderRef);
  },

  async createOrder(
    userId: string,
    data: {
      customerName: string;
      customerPhone: string;
      customerAddress: string;
      customerCity?: string;
      items: OrderItem[];
      subtotal: number;
      discount: number;
      deliveryCharge: number;
      deliveryCollectionMethod?: DeliveryCollectionMethod;
      totalAmount: number;
      paymentMethod: string;
      paymentAccountId?: string;
      notes?: string;
      expectedDeliveryDate?: string;
    }
  ): Promise<Order> {
    if (!Number.isFinite(data.deliveryCharge) || data.deliveryCharge < 0) {
      throw new Error('Delivery charge must be a valid non-negative amount');
    }
    if (inBuildStorage.getStorageMode() === 'in-build') {
      // Find or create customer in in-build storage
      let customer = inBuildStorage.getCustomers().find((c) => c.phone === data.customerPhone.trim());
      if (!customer) {
        customer = inBuildStorage.createCustomer({
          name: data.customerName.trim(),
          phone: data.customerPhone.trim(),
          address: data.customerAddress.trim(),
          city: data.customerCity?.trim(),
        });
      }

      const paymentStatus = getInitialPaymentStatus(data.paymentMethod);
      const amountPaid = paymentStatus === 'paid' ? data.totalAmount : 0;
      const amountDue = paymentStatus === 'paid' ? 0 : data.totalAmount;

      return inBuildStorage.createOrder({
        customerId: customer.id,
        customerName: data.customerName.trim(),
        customerPhone: data.customerPhone.trim(),
        customerAddress: data.customerAddress.trim(),
        customerCity: data.customerCity?.trim() || '',
        items: data.items,
        subtotal: data.subtotal,
        discount: data.discount,
        deliveryCharge: data.deliveryCharge,
        deliveryCollectionMethod: data.deliveryCollectionMethod || 'undecided',
        totalAmount: data.totalAmount,
        paymentMethod: data.paymentMethod,
        paymentAccountId: data.paymentAccountId || '',
        paymentStatus,
        amountPaid,
        amountDue,
        payments: [],
        orderStatus: 'pending',
        orderDate: new Date().toISOString(),
        expectedDeliveryDate: data.expectedDeliveryDate || '',
        notes: data.notes || '',
      });
    }

    // Firebase mode
    try {
      let customer = await customersService.getCustomerByPhone(userId, data.customerPhone.trim());
      if (!customer) {
        customer = await customersService.createCustomer(userId, {
          name: data.customerName.trim(),
          phone: data.customerPhone.trim(),
          address: data.customerAddress.trim(),
          city: data.customerCity?.trim(),
        });
      }

      const orderRef = doc(collection(db, `users/${userId}/orders`));
      const now = new Date().toISOString();
      const orderNumber = createOrderNumber(orderRef.id);
      const invoiceNumber = createInvoiceNumber(orderRef.id, now);
      const paymentStatus = getInitialPaymentStatus(data.paymentMethod);
      const amountPaid = paymentStatus === 'paid' ? data.totalAmount : 0;
      const amountDue = paymentStatus === 'paid' ? 0 : data.totalAmount;

      return await runTransaction(db, async (transaction) => {
        // Validate stock
        for (const item of data.items) {
          const prodRef = doc(db, `users/${userId}/products/${item.productId}`);
          const prodSnap = await transaction.get(prodRef);
          if (!prodSnap.exists()) {
            throw new Error(`Product ${item.productName} no longer exists`);
          }
          const prodData = prodSnap.data() as Product;
          if (prodData.currentStock < item.quantity) {
            throw new Error(`Insufficient stock for ${item.productName}. Available: ${prodData.currentStock}, Requested: ${item.quantity}`);
          }

          const newStock = prodData.currentStock - item.quantity;
          transaction.update(prodRef, {
            currentStock: newStock,
            updatedAt: now,
          });

          const movRef = doc(collection(db, `users/${userId}/inventoryMovements`));
          transaction.set(movRef, {
            id: movRef.id,
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            quantity: item.quantity,
            prevStock: prodData.currentStock,
            newStock,
            type: 'sale',
            reason: `Order #${orderNumber}`,
            referenceId: orderNumber,
            date: now,
          });
        }

        const newOrder: Order = {
          id: orderRef.id,
          orderNumber,
          invoiceNumber,
          customerId: customer!.id,
          customerName: data.customerName.trim(),
          customerPhone: data.customerPhone.trim(),
          customerAddress: data.customerAddress.trim(),
          customerCity: data.customerCity?.trim() || '',
          items: data.items,
          subtotal: data.subtotal,
          discount: data.discount,
          deliveryCharge: data.deliveryCharge,
          deliveryCollectionMethod: data.deliveryCollectionMethod || 'undecided',
          totalAmount: data.totalAmount,
          paymentMethod: data.paymentMethod,
          paymentAccountId: data.paymentAccountId || '',
          paymentStatus,
          amountPaid,
          amountDue,
          payments: [],
          orderStatus: 'pending',
          stockDeducted: true,
          revenueRecorded: false,
          orderDate: now,
          expectedDeliveryDate: data.expectedDeliveryDate || '',
          notes: data.notes || '',
          createdAt: now,
          updatedAt: now,
        };

        transaction.set(orderRef, newOrder);
        return newOrder;
      });
    } catch (err) {
      throw err;
    }
  },

  async updateOrderStatus(
    userId: string,
    orderId: string,
    newStatus: OrderStatus,
    options?: OrderStatusOptions
  ): Promise<Order> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      if (newStatus === 'cancelled') {
        return inBuildStorage.cancelOrder(
          orderId,
          options?.cancellationReason || '',
          options?.courierFeePaid || 0,
          options?.courierAccountId
        );
      }
      return inBuildStorage.updateOrderStatus(orderId, newStatus, options);
    }

    const orderRef = doc(db, `users/${userId}/orders/${orderId}`);
    const now = new Date().toISOString();

    try {
      const updated = await runTransaction(db, async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) throw new Error('Order does not exist');
        const order = orderSnap.data() as Order;

        const prevStatus = order.orderStatus;
        const updates: Partial<Order> = {
          orderStatus: newStatus,
          updatedAt: now,
        };

        if (options?.paymentStatus) updates.paymentStatus = options.paymentStatus;
        if (options?.paymentAccountId) updates.paymentAccountId = options.paymentAccountId;
        if (options?.returnCondition) updates.returnCondition = options.returnCondition;
        const productsToRestore: Array<{ item: OrderItem; ref: ReturnType<typeof doc>; product: Product }> = [];
        let cancelledCustomerRef: ReturnType<typeof doc> | null = null;
        let cancelledCustomer: Customer | null = null;
        let courierExpenseAmount = 0;
        let courierExpenseAccountRef: ReturnType<typeof doc> | null = null;
        let courierExpenseAccount: Account | null = null;
        let courierExpenseRef: ReturnType<typeof doc> | null = null;
        let courierExpenseTransaction: FinanceTransaction | null = null;

        if (newStatus === 'cancelled' && prevStatus !== 'cancelled') {
          const enteredFee = Number(options?.courierFeePaid ?? 0);
          if (!Number.isFinite(enteredFee) || enteredFee < 0) {
            throw new Error('Courier fee paid by the business must be a valid non-negative amount');
          }
          courierExpenseAmount = ['shipped', 'delivered'].includes(prevStatus) ? enteredFee : 0;
          if (courierExpenseAmount > 0) {
            if (!options?.courierAccountId) throw new Error('Select the account used to pay the courier');
            const transactionId = `courier_cancel_${order.id}`;
            courierExpenseRef = doc(db, `users/${userId}/transactions/${transactionId}`);
            courierExpenseAccountRef = doc(db, `users/${userId}/accounts/${options.courierAccountId}`);
            const [existingExpense, accountSnapshot] = await Promise.all([
              transaction.get(courierExpenseRef),
              transaction.get(courierExpenseAccountRef),
            ]);
            if (existingExpense.exists()) throw new Error('The courier fee for this cancelled order has already been recorded');
            if (!accountSnapshot.exists()) throw new Error('Selected account does not exist');
            courierExpenseAccount = { id: accountSnapshot.id, ...accountSnapshot.data() } as Account;
            courierExpenseTransaction = buildCourierFeeExpense(
              order,
              courierExpenseAccount,
              courierExpenseAmount,
              'cancel',
              now
            );
          }
          if (order.stockDeducted) {
            for (const item of order.items) {
              const productRef = doc(db, `users/${userId}/products/${item.productId}`);
              const productSnap = await transaction.get(productRef);
              if (!productSnap.exists()) throw new Error(`Product ${item.productName} no longer exists`);
              productsToRestore.push({
                item,
                ref: productRef,
                product: productSnap.data() as Product,
              });
            }
          }

          if (prevStatus === 'delivered' && order.customerId) {
            cancelledCustomerRef = doc(db, `users/${userId}/customers/${order.customerId}`);
            const customerSnapshot = await transaction.get(cancelledCustomerRef);
            if (customerSnapshot.exists()) cancelledCustomer = customerSnapshot.data() as Customer;
          }
        }

        // A fulfillment status is not proof of payment; collections are recorded separately.
        if (newStatus === 'delivered' && prevStatus !== 'delivered') {
          updates.deliveredDate = now;
          if (order.customerId && order.saleRecognized !== true) {
            const custRef = doc(db, `users/${userId}/customers/${order.customerId}`);
            const custSnap = await transaction.get(custRef);
            if (custSnap.exists()) {
              const cust = custSnap.data() as Customer;
              const newTotalSpent = (cust.totalSpent || 0) + order.totalAmount;
              transaction.update(custRef, {
                totalSpent: newTotalSpent,
                ltv: newTotalSpent,
                lastOrderDate: now,
                updatedAt: now,
              });
            }
          }

          updates.saleRecognized = true;
        }

        // Cancelled
        if (newStatus === 'cancelled' && prevStatus !== 'cancelled') {
          updates.cancelledDate = now;
          if (options?.cancellationReason) {
            updates.notes = `${order.notes ? `${order.notes} | ` : ''}Cancelled: ${options.cancellationReason}`;
          }
          if (cancelledCustomerRef && cancelledCustomer) {
            const totalSpent = Math.max(0, (cancelledCustomer.totalSpent || 0) - order.totalAmount);
            transaction.update(cancelledCustomerRef, {
              totalSpent,
              ltv: totalSpent,
              updatedAt: now,
            });
          }
          if (order.stockDeducted) {
            for (const { item, ref, product } of productsToRestore) {
              const newStock = product.currentStock + item.quantity;
              transaction.update(ref, {
                currentStock: newStock,
                updatedAt: now,
              });

              const movementRef = doc(collection(db, `users/${userId}/inventoryMovements`));
              transaction.set(movementRef, {
                id: movementRef.id,
                productId: item.productId,
                productName: item.productName,
                sku: item.sku,
                quantity: item.quantity,
                prevStock: product.currentStock,
                newStock,
                type: 'adjustment',
                reason: `Restored from Cancelled Order #${order.orderNumber}`,
                referenceId: order.orderNumber,
                date: now,
              });
            }
            updates.stockDeducted = false;
          }

          if (courierExpenseAccountRef && courierExpenseAccount && courierExpenseRef && courierExpenseTransaction) {
            transaction.update(courierExpenseAccountRef, {
              currentBalance: (Number(courierExpenseAccount.currentBalance) || 0) - courierExpenseAmount,
              updatedAt: now,
            });
            transaction.set(courierExpenseRef, cleanObject(courierExpenseTransaction));
          }
        }

        transaction.update(orderRef, updates);
        return { ...order, ...updates } as Order;
      });

      return updated;
    } catch (err) {
      throw err;
    }
  },

  async cancelOrder(
    userId: string,
    orderId: string,
    reason: string,
    courierFeePaid: number = 0,
    courierAccountId?: string
  ): Promise<Order> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.cancelOrder(orderId, reason, courierFeePaid, courierAccountId);
    }
    return this.updateOrderStatus(userId, orderId, 'cancelled', {
      cancellationReason: reason,
      courierFeePaid,
      courierAccountId,
    });
  },

  async processReturn(
    userId: string,
    orderId: string,
    condition: ReturnCondition,
    restock: boolean,
    note?: string,
    businessCourierFee = 0,
    courierAccountId?: string
  ): Promise<Order> {
    if (!Number.isFinite(businessCourierFee) || businessCourierFee < 0) {
      throw new Error('Courier fee paid by the business must be a valid non-negative amount');
    }
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.processReturn(orderId, condition, restock, note, businessCourierFee, courierAccountId);
    }

    const orderRef = doc(db, `users/${userId}/orders/${orderId}`);
    const now = new Date().toISOString();
    return runTransaction(db, async (transaction) => {
      const orderSnapshot = await transaction.get(orderRef);
      if (!orderSnapshot.exists()) throw new Error('Order does not exist');
      const order = orderSnapshot.data() as Order;
      if (order.orderStatus === 'returned') throw new Error('Order has already been returned');

      const products: Array<{ item: OrderItem; ref: ReturnType<typeof doc>; product: Product }> = [];
      if (order.stockDeducted) {
        for (const item of order.items) {
          const productRef = doc(db, `users/${userId}/products/${item.productId}`);
          const productSnapshot = await transaction.get(productRef);
          if (!productSnapshot.exists()) {
            throw new Error(`Product ${item.productName} no longer exists`);
          }
          products.push({ item, ref: productRef, product: productSnapshot.data() as Product });
        }
      }

      let customerRef: ReturnType<typeof doc> | null = null;
      let customer: Customer | null = null;
      if (order.orderStatus === 'delivered' && order.customerId) {
        customerRef = doc(db, `users/${userId}/customers/${order.customerId}`);
        const customerSnapshot = await transaction.get(customerRef);
        if (customerSnapshot.exists()) customer = customerSnapshot.data() as Customer;
      }

      let courierExpenseAccountRef: ReturnType<typeof doc> | null = null;
      let courierExpenseAccount: Account | null = null;
      let courierExpenseRef: ReturnType<typeof doc> | null = null;
      let courierExpenseTransaction: FinanceTransaction | null = null;
      if (businessCourierFee > 0) {
        if (!courierAccountId) throw new Error('Select the account used to pay the courier');
        const transactionId = `courier_return_${order.id}`;
        courierExpenseRef = doc(db, `users/${userId}/transactions/${transactionId}`);
        courierExpenseAccountRef = doc(db, `users/${userId}/accounts/${courierAccountId}`);
        const [existingExpense, accountSnapshot] = await Promise.all([
          transaction.get(courierExpenseRef),
          transaction.get(courierExpenseAccountRef),
        ]);
        if (existingExpense.exists()) throw new Error('The courier fee for this returned order has already been recorded');
        if (!accountSnapshot.exists()) throw new Error('Selected account does not exist');
        courierExpenseAccount = { id: accountSnapshot.id, ...accountSnapshot.data() } as Account;
        courierExpenseTransaction = buildCourierFeeExpense(
          order,
          courierExpenseAccount,
          businessCourierFee,
          'return',
          now
        );
      }

      if (order.stockDeducted) {
        for (const { item, ref, product } of products) {
          if (restock && condition === 'sellable') {
            const newStock = product.currentStock + item.quantity;
            transaction.update(ref, { currentStock: newStock, updatedAt: now });
            const movementRef = doc(collection(db, `users/${userId}/inventoryMovements`));
            transaction.set(movementRef, {
              id: movementRef.id,
              productId: item.productId,
              productName: item.productName,
              sku: item.sku,
              quantity: item.quantity,
              prevStock: product.currentStock,
              newStock,
              type: 'return',
              reason: `Restocked from Return #${order.orderNumber}`,
              referenceId: order.orderNumber,
              date: now,
            });
          } else {
            const movementRef = doc(collection(db, `users/${userId}/inventoryMovements`));
            transaction.set(movementRef, {
              id: movementRef.id,
              productId: item.productId,
              productName: item.productName,
              sku: item.sku,
              quantity: item.quantity,
              prevStock: product.currentStock,
              newStock: product.currentStock,
              type: 'damage',
              reason: `Returned Damaged/Unsellable #${order.orderNumber}`,
              referenceId: order.orderNumber,
              date: now,
            });
          }
        }
      }

      if (customerRef && customer) {
        const totalSpent = Math.max(0, (customer.totalSpent || 0) - order.totalAmount);
        transaction.update(customerRef, {
          totalSpent,
          ltv: totalSpent,
          updatedAt: now,
        });
      }
      const updates: Partial<Order> = {
        orderStatus: 'returned',
        returnCondition: condition,
        returnedDate: now,
        stockDeducted: false,
        updatedAt: now,
      };
      if (note) updates.notes = `${order.notes ? `${order.notes} | ` : ''}Return: ${note}`;
      if (courierExpenseAccountRef && courierExpenseAccount && courierExpenseRef && courierExpenseTransaction) {
        transaction.update(courierExpenseAccountRef, {
          currentBalance: (Number(courierExpenseAccount.currentBalance) || 0) - businessCourierFee,
          updatedAt: now,
        });
        transaction.set(courierExpenseRef, cleanObject(courierExpenseTransaction));
      }
      transaction.update(orderRef, updates);
      return { ...order, ...updates } as Order;
    });
  },
};
