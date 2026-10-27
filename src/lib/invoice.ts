export function createInvoiceNumber(orderId: string, date: string | Date): string {
  const invoiceDate = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(invoiceDate.getTime())) throw new Error('Cannot create an invoice with an invalid date');
  const datePart = invoiceDate.toISOString().slice(0, 10).replace(/-/g, '');
  const uniquePart = orderId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!uniquePart) throw new Error('Cannot create an invoice without an order ID');
  return `INV-${datePart}-${uniquePart}`;
}

export function createOrderNumber(orderId: string): string {
  const uniquePart = orderId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!uniquePart) throw new Error('Cannot create an order number without an order ID');
  return `ORD-${uniquePart}`;
}

export function getInvoiceNumber(order: { id: string; orderNumber: string; invoiceNumber?: string }): string {
  return order.invoiceNumber || order.orderNumber || createInvoiceNumber(order.id, new Date());
}
