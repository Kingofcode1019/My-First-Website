import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Product, Supplier } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { productsService } from '../../services/products.service';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  suppliers: Supplier[];
  onSaved: () => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  product,
  suppliers,
  onSaved,
}) => {
  const { effectiveUid, storageMode, user } = useAuth();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [currentStock, setCurrentStock] = useState<number>(0);
  const [minStockLevel, setMinStockLevel] = useState<number>(5);
  const [unit, setUnit] = useState('pcs');
  const [supplierId, setSupplierId] = useState('');

  useEffect(() => {
    if (product) {
      setName(product.name);
      setSku(product.sku);
      setCategory(product.category);
      setBrand(product.brand || '');
      setDescription(product.description || '');
      setImageUrl(product.imageUrl || '');
      setPurchasePrice(product.purchasePrice);
      setSellingPrice(product.sellingPrice);
      setCurrentStock(product.currentStock);
      setMinStockLevel(product.minStockLevel);
      setUnit(product.unit || 'pcs');
      setSupplierId(product.supplierId || '');
    } else {
      setName('');
      setSku(`SKU-${Date.now().toString().slice(-5)}`);
      setCategory('General');
      setBrand('');
      setDescription('');
      setImageUrl('');
      setPurchasePrice(0);
      setSellingPrice(0);
      setCurrentStock(10);
      setMinStockLevel(5);
      setUnit('pcs');
      setSupplierId('');
    }
  }, [product, suppliers, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (storageMode === 'firebase' && !user) {
      error('Sign in to the Firebase workspace before adding products.');
      return;
    }
    if (!effectiveUid) {
      error('No active workspace is selected.');
      return;
    }
    const targetUid = effectiveUid;

    if (!name.trim()) {
      error('Product name is required');
      return;
    }
    if (!sku.trim()) {
      error('SKU is required');
      return;
    }
    if (sellingPrice < 0 || purchasePrice < 0) {
      error('Prices cannot be negative');
      return;
    }

    try {
      setLoading(true);
      const supplierObj = suppliers.find((s) => s.id === supplierId);

      if (product) {
        await productsService.updateProduct(targetUid, product.id, {
          name: name.trim(),
          sku: sku.trim(),
          category: category.trim() || 'General',
          brand: brand.trim(),
          description: description.trim(),
          imageUrl: imageUrl.trim(),
          purchasePrice: Number(purchasePrice) || 0,
          sellingPrice: Number(sellingPrice) || 0,
          minStockLevel: Number(minStockLevel) || 5,
          unit: unit.trim() || 'pcs',
          supplierId: supplierId || '',
          supplierName: supplierObj?.company || '',
        });
        success('Product updated successfully');
      } else {
        await productsService.createProduct(targetUid, {
          name: name.trim(),
          sku: sku.trim(),
          category: category.trim() || 'General',
          brand: brand.trim(),
          description: description.trim(),
          imageUrl: imageUrl.trim(),
          purchasePrice: Number(purchasePrice) || 0,
          sellingPrice: Number(sellingPrice) || 0,
          currentStock: Number(currentStock) || 0,
          minStockLevel: Number(minStockLevel) || 5,
          unit: unit.trim() || 'pcs',
          supplierId: supplierId || '',
          supplierName: supplierObj?.company || '',
          status: 'active',
        });
        success('Product created successfully');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error saving product:', err);
      error(err.message || 'Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={product ? 'Edit Product' : 'Add New Product'}
      subtitle={product ? `SKU: ${product.sku}` : 'Create an inventory item with pricing & stock'}
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Product Name */}
          <div className="sm:col-span-2">
            <label className="block text-[#4a4741] font-medium mb-1">Product Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Classic Oxford Cotton Shirt"
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
            />
          </div>

          {/* SKU */}
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">SKU (Stock Keeping Unit) *</label>
            <input
              type="text"
              required
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. POLO-BLU-M"
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Category *</label>
            <input
              type="text"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Apparel, Electronics, Home"
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
            />
          </div>

          {/* Brand */}
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Brand</label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Apex, Nike, Sony"
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
            />
          </div>

          {/* Unit */}
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Unit of Measure</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="pcs, kg, pack, box"
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
            />
          </div>

          {/* Purchase Price */}
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Cost / Purchase Price *</label>
            <input
              type="number"
              step="any"
              min="0"
              required
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
            />
          </div>

          {/* Selling Price */}
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Selling Price *</label>
            <input
              type="number"
              step="any"
              min="0"
              required
              value={sellingPrice}
              onChange={(e) => setSellingPrice(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
            />
          </div>

          {/* Current Stock */}
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">
              {product ? 'Current Stock (Use Adjust Stock)' : 'Starting Stock Level *'}
            </label>
            <input
              type="number"
              min="0"
              disabled={!!product}
              value={currentStock}
              onChange={(e) => setCurrentStock(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono disabled:opacity-50 focus:outline-none focus:border-[#23424d]"
            />
          </div>

          {/* Min Stock Level */}
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Low Stock Alert Threshold *</label>
            <input
              type="number"
              min="0"
              required
              value={minStockLevel}
              onChange={(e) => setMinStockLevel(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
            />
          </div>

          {/* Supplier Dropdown */}
          <div className="sm:col-span-2">
            <label className="block text-[#4a4741] font-medium mb-1">Assigned Supplier</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
            >
              <option value="">No supplier assigned</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.company} · {s.code} ({s.name})
                </option>
              ))}
            </select>
          </div>

          {/* Image URL */}
          <div className="sm:col-span-2">
            <label className="block text-[#4a4741] font-medium mb-1">Image URL</label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
            />
          </div>

          {/* Description */}
          <div className="sm:col-span-2">
            <label className="block text-[#4a4741] font-medium mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Product details, specs, or internal notes..."
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-[#e9e4dc]">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 font-semibold text-[#4a4741] hover:text-[#1c1b18] bg-white border border-[#d8d3c9] hover:bg-[#f7f4ee] rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            {loading ? 'Saving...' : product ? 'Update Product' : 'Create Product'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
