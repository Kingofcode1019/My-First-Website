import React, { useState, useMemo } from 'react';
import { Product } from '../../types';
import { useBusiness } from '../../context/BusinessContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { productsService } from '../../services/products.service';
import { formatCurrency } from '../../lib/utils';
import { getSupplierDisplayName } from '../../lib/supplierUtils';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  Layers,
  Edit2,
  Eye,
  Archive,
  Trash2,
} from 'lucide-react';
import { EmptyState } from '../common/EmptyState';
import { ProductModal } from './ProductModal';
import { StockAdjustModal } from './StockAdjustModal';
import { ProductDetailModal } from './ProductDetailModal';
import { ConfirmDialog } from '../common/ConfirmDialog';

export const ProductList: React.FC = () => {
  const { effectiveUid } = useAuth();
  const { products, suppliers, movements, orders, settings, refreshAll } = useBusiness();
  const { success, error } = useToast();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStockStatus, setSelectedStockStatus] = useState<'all' | 'low' | 'instock' | 'out'>('all');
  const [selectedSupplier, setSelectedSupplier] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'archived'>('active');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'stock' | 'created'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [archivingProduct, setArchivingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (selectedStatus !== 'all' && p.status !== selectedStatus) return false;
        if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
        if (selectedSupplier !== 'all' && p.supplierId !== selectedSupplier) return false;

        if (selectedStockStatus === 'low' && p.currentStock > p.minStockLevel) return false;
        if (selectedStockStatus === 'out' && p.currentStock > 0) return false;
        if (selectedStockStatus === 'instock' && p.currentStock === 0) return false;

        if (search.trim()) {
          const q = search.toLowerCase();
          const matchName = p.name.toLowerCase().includes(q);
          const matchSku = p.sku.toLowerCase().includes(q);
          const matchCat = p.category.toLowerCase().includes(q);
          const matchBrand = p.brand?.toLowerCase().includes(q) || false;
          if (!matchName && !matchSku && !matchCat && !matchBrand) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let compare = 0;
        if (sortBy === 'name') {
          compare = a.name.localeCompare(b.name);
        } else if (sortBy === 'price') {
          compare = a.sellingPrice - b.sellingPrice;
        } else if (sortBy === 'stock') {
          compare = a.currentStock - b.currentStock;
        } else if (sortBy === 'created') {
          compare = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return sortOrder === 'asc' ? compare : -compare;
      });
  }, [
    products,
    search,
    selectedCategory,
    selectedStockStatus,
    selectedSupplier,
    selectedStatus,
    sortBy,
    sortOrder,
  ]);

  const handleToggleArchive = async () => {
    if (!effectiveUid || !archivingProduct) return;
    try {
      setActionLoading(true);
      const newStatus = archivingProduct.status === 'active' ? 'archived' : 'active';
      await productsService.updateProduct(effectiveUid, archivingProduct.id, {
        status: newStatus,
      });
      success(
        newStatus === 'archived'
          ? 'Product moved to archived catalog'
          : 'Product restored to active catalog'
      );
      setArchivingProduct(null);
      await refreshAll();
    } catch (err: any) {
      error(err.message || 'Failed to update product status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!effectiveUid || !deletingProduct) return;
    try {
      setActionLoading(true);
      await productsService.deleteProduct(effectiveUid, deletingProduct.id);
      success('Product deleted. Its initial stock entry was removed; other movement history was retained.');
      setDeletingProduct(null);
      await refreshAll();
    } catch (err: any) {
      error(err.message || 'Failed to delete product');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1c1b18] tracking-tight">Products & Catalog</h2>
          <p className="text-xs text-[#706c64] mt-0.5">
            Manage your master inventory items, SKU definitions, and pricing
          </p>
        </div>
        <button
          onClick={() => {
            setEditingProduct(null);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3.5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* Search */}
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a857b]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name, SKU, category..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-xs text-[#1c1b18] placeholder-[#8a857b] focus:outline-none focus:border-[#23424d]"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-xs text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Stock Status Filter */}
          <div>
            <select
              value={selectedStockStatus}
              onChange={(e) => setSelectedStockStatus(e.target.value as any)}
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-xs text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
            >
              <option value="all">All Stock Statuses</option>
              <option value="low">Low Stock (Threshold hit)</option>
              <option value="out">Out of Stock (0 units)</option>
              <option value="instock">In Stock ({'>'} 0)</option>
            </select>
          </div>
        </div>

        {/* Secondary Row: Supplier, Status, Sort */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#f0ede6] text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Supplier Filter */}
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="px-2.5 py-1 bg-white border border-[#d8d3c9] rounded-lg text-[#706c64] focus:outline-none"
            >
              <option value="all">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.company}
                </option>
              ))}
            </select>

            {/* Active / Archived */}
            <div className="flex items-center rounded-lg bg-[#f4efe6] border border-[#e2dcd0] p-0.5">
              <button
                onClick={() => setSelectedStatus('active')}
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                  selectedStatus === 'active'
                    ? 'bg-white text-[#1c1b18] shadow-2xs'
                    : 'text-[#706c64] hover:text-[#1c1b18]'
                }`}
              >
                Active ({products.filter((p) => p.status !== 'archived').length})
              </button>
              <button
                onClick={() => setSelectedStatus('archived')}
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                  selectedStatus === 'archived'
                    ? 'bg-white text-[#1c1b18] shadow-2xs'
                    : 'text-[#706c64] hover:text-[#1c1b18]'
                }`}
              >
                Archived ({products.filter((p) => p.status === 'archived').length})
              </button>
            </div>
          </div>

          {/* Sort By Controls */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[#8a857b] text-[11px]">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2 py-1 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] text-[11px] focus:outline-none"
            >
              <option value="name">Name</option>
              <option value="stock">Stock Level</option>
              <option value="price">Selling Price</option>
              <option value="created">Recently Added</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-2 py-1 bg-white border border-[#d8d3c9] rounded-lg text-[#706c64] hover:text-[#1c1b18] text-[11px]"
            >
              {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
          </div>
        </div>
      </div>

      {/* Product Table */}
      {filteredProducts.length === 0 ? (
        <EmptyState
          icon={Package}
          title={products.length === 0 ? 'No products in catalog' : 'No matching products found'}
          description={
            products.length === 0
              ? 'Create your first product to start building your catalog.'
              : 'Try clearing your search terms or filters.'
          }
          actionLabel={products.length === 0 ? 'Create First Product' : undefined}
          onAction={
            products.length === 0
              ? () => {
                  setEditingProduct(null);
                  setIsModalOpen(true);
                }
              : undefined
          }
        />
      ) : (
        <div className="bg-white border border-[#e9e4dc] rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8f5ee] border-b border-[#e9e4dc] text-[#706c64] font-semibold">
                <tr>
                  <th className="py-3 px-4">Product & SKU</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Selling Price</th>
                  <th className="py-3 px-4 text-right">Cost Price</th>
                  <th className="py-3 px-4 text-right">Stock Level</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0ede6]">
                {filteredProducts.map((product) => {
                  const isLow = product.currentStock <= product.minStockLevel;
                  const isOut = product.currentStock === 0;

                  return (
                    <tr
                      key={product.id}
                      className="hover:bg-[#faf7f2] transition-colors group"
                    >
                      {/* Product & SKU */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#ede8de] border border-[#ddd7cc] overflow-hidden shrink-0 flex items-center justify-center text-[#706c64]">
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="w-5 h-5 text-[#8a857b]" />
                            )}
                          </div>
                          <div>
                            <button
                              onClick={() => setViewingProduct(product)}
                              className="font-bold text-[#1c1b18] hover:text-[#23424d] text-left transition-colors cursor-pointer"
                            >
                              {product.name}
                            </button>
                            <p className="font-mono text-[11px] text-[#706c64]">{product.sku}</p>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4 text-[#4a4741]">
                        {product.category}
                        {product.brand && (
                          <span className="text-[#8a857b] text-[10px] block">
                            Brand: {product.brand}
                          </span>
                        )}
                      </td>

                      {/* Selling Price */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#1c1b18]">
                        {formatCurrency(product.sellingPrice, settings.currencySymbol)}
                      </td>

                      {/* Purchase Price */}
                      <td className="py-3 px-4 text-right font-mono text-[#706c64]">
                        {formatCurrency(product.purchasePrice, settings.currencySymbol)}
                      </td>

                      {/* Stock Level */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex flex-col items-end">
                          <span
                            className={`font-mono font-bold text-sm ${
                              isOut
                                ? 'text-[#e11d48]'
                                : isLow
                                ? 'text-[#d97706]'
                                : 'text-[#059669]'
                            }`}
                          >
                            {product.currentStock} {product.unit}
                          </span>
                          {isLow && (
                            <span className="text-[10px] font-bold text-[#d97706] flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Min: {product.minStockLevel}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Supplier */}
                      <td className="py-3 px-4 text-[#706c64]">
                        {getSupplierDisplayName(product.supplierName)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewingProduct(product)}
                            title="View details & history"
                            className="p-1.5 rounded-lg text-[#706c64] hover:text-[#1c1b18] hover:bg-[#eae5dc] transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setAdjustingProduct(product)}
                            title="Adjust inventory stock"
                            className="p-1.5 rounded-lg text-[#047857] hover:bg-[#ecfdf5] transition-colors cursor-pointer"
                          >
                            <Layers className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingProduct(product);
                              setIsModalOpen(true);
                            }}
                            title="Edit product"
                            className="p-1.5 rounded-lg text-[#23424d] hover:bg-[#edf4f6] transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setArchivingProduct(product)}
                            title={product.status === 'active' ? 'Archive product' : 'Restore product'}
                            className="p-1.5 rounded-lg text-[#b45309] hover:bg-[#fffbeb] transition-colors cursor-pointer"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingProduct(product)}
                            title="Permanently delete product"
                            className="p-1.5 rounded-lg text-[#be123c] hover:bg-[#fff1f2] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2.5 bg-[#f8f5ee] border-t border-[#e9e4dc] text-[11px] text-[#706c64] flex items-center justify-between">
            <span>
              Showing {filteredProducts.length} of {products.length} products
            </span>
            <span className="font-mono font-semibold text-[#1c1b18]">
              Total stock on page: {filteredProducts.reduce((sum, p) => sum + p.currentStock, 0)} units
            </span>
          </div>
        </div>
      )}

      {/* Product Create / Edit Modal */}
      <ProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        product={editingProduct}
        suppliers={suppliers}
        onSaved={refreshAll}
      />

      {/* Stock Adjustment Modal */}
      {adjustingProduct && (
        <StockAdjustModal
          isOpen={!!adjustingProduct}
          onClose={() => setAdjustingProduct(null)}
          product={adjustingProduct}
          onSaved={refreshAll}
        />
      )}

      {/* Product Detail Modal */}
      <ProductDetailModal
        isOpen={!!viewingProduct}
        onClose={() => setViewingProduct(null)}
        product={viewingProduct}
        orders={orders}
        movements={movements}
        currencySymbol={settings.currencySymbol}
        onEdit={(p) => {
          setViewingProduct(null);
          setEditingProduct(p);
          setIsModalOpen(true);
        }}
        onAdjustStock={(p) => {
          setViewingProduct(null);
          setAdjustingProduct(p);
        }}
      />

      {/* Archive / Restore Confirmation */}
      <ConfirmDialog
        isOpen={!!archivingProduct}
        onClose={() => setArchivingProduct(null)}
        onConfirm={handleToggleArchive}
        loading={actionLoading}
        title={archivingProduct?.status === 'active' ? 'Archive Product' : 'Restore Product'}
        message={
          archivingProduct?.status === 'active'
            ? `Are you sure you want to archive "${archivingProduct?.name}"? It will be hidden from new orders until restored.`
            : `Restore "${archivingProduct?.name}" back to the active catalog?`
        }
        confirmLabel={archivingProduct?.status === 'active' ? 'Archive' : 'Restore'}
        isDestructive={archivingProduct?.status === 'active'}
      />

      <ConfirmDialog
        isOpen={!!deletingProduct}
        onClose={() => setDeletingProduct(null)}
        onConfirm={handleDeleteProduct}
        loading={actionLoading}
        title="Permanently Delete Product"
        message={`Delete "${deletingProduct?.name}" and remove its current stock (${deletingProduct?.currentStock || 0} ${deletingProduct?.unit || 'units'}) from the catalog? This cannot be undone. Past orders, purchases, and other inventory movement history will be retained. If it has no later stock activity, its initial stock setup entry will also be removed.`}
        confirmLabel="Delete Product"
        isDestructive
      />
    </div>
  );
};
