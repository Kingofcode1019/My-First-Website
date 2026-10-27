import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Supplier } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { suppliersService } from '../../services/suppliers.service';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier?: Supplier | null;
  onSaved: () => void;
}

export const SupplierModal: React.FC<SupplierModalProps> = ({
  isOpen,
  onClose,
  supplier,
  onSaved,
}) => {
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (supplier) {
      setName(supplier.name);
      setCompany(supplier.company);
      setPhone(supplier.phone);
      setEmail(supplier.email || '');
      setAddress(supplier.address || '');
      setNotes(supplier.notes || '');
    } else {
      setName('');
      setCompany('');
      setPhone('');
      setEmail('');
      setAddress('');
      setNotes('');
    }
  }, [supplier, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUid) return;

    if (!name.trim() || !company.trim() || !phone.trim()) {
      error('Contact Name, Company Name, and Phone are required');
      return;
    }

    try {
      setLoading(true);
      if (supplier) {
        await suppliersService.updateSupplier(effectiveUid, supplier.id, {
          name: name.trim(),
          company: company.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          notes: notes.trim(),
        });
        success('Supplier updated successfully');
      } else {
        await suppliersService.createSupplier(effectiveUid, {
          name: name.trim(),
          company: company.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          notes: notes.trim(),
        });
        success('Supplier added successfully');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      error(err.message || 'Failed to save supplier');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={supplier ? 'Edit Supplier' : 'Add New Supplier'}
      subtitle="Vendor details for stock replenishments and payables"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Company / Vendor Name *</label>
          <input
            type="text"
            required
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Acme Fabric Mills Ltd."
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
          />
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Primary Contact Person *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Manager / Representative name"
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Phone Number *</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+880 1819-..."
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
            />
          </div>

          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vendor@company.com"
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
            />
          </div>
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Factory / Office Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Plot, Area, City"
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
          />
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Payment terms, lead time..."
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-[#e9e4dc]">
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
            {loading ? 'Saving...' : supplier ? 'Update Supplier' : 'Add Supplier'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
