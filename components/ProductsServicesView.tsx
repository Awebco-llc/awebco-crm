'use client';

import React, { useState, useMemo } from 'react';
import { Search, Plus, X, GripVertical, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { ProductService } from './Shared';
import { createProduct, updateProduct, deleteProduct } from '@/lib/crmStore';

function formatCatalogPrice(value: string) {
  const trimmedValue = value.trim();
  const numericValue = Number(trimmedValue.replace(/[$,\s]/g, ''));

  if (!trimmedValue) return '-';
  if (!Number.isFinite(numericValue)) return value;

  return numericValue.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function EditableCell({ value, onSave }: { value: string, onSave: (val: string) => void }) {
  return (
    <div className="min-h-[20px] truncate" title={value || ''}>
      {value || '-'}
    </div>
  );
}

function SortableRow({ item, onClick, onUpdate, onDelete }: { item: ProductService; onClick: () => void; onUpdate: (id: string, field: keyof ProductService, value: any) => void; onDelete: (id: string) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} onClick={onClick} className="hover:bg-gray-50 transition-colors cursor-pointer bg-white">
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] w-10">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-[#8E9299] hover:text-[#1C1F23]">
          <GripVertical className="w-4 h-4" />
        </div>
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableCell value={item.name} onSave={v => onUpdate(item.id, 'name', v)} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableCell value={item.description} onSave={v => onUpdate(item.id, 'description', v)} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableCell value={formatCatalogPrice(item.price)} onSave={v => onUpdate(item.id, 'price', v)} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-right w-12">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
          className="p-1.5 text-[#8E9299] hover:text-[#D32F2F] hover:bg-[#FEE2E2] rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          title="Delete Product"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

export default function ProductsServicesView({ products, setProducts }: { products: ProductService[], setProducts: React.Dispatch<React.SetStateAction<ProductService[]>> }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<ProductService>>({});

  const filteredItems = useMemo(() => {
    return products.filter(i => 
      i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [products, searchQuery]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setProducts((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const openAddModal = () => {
    setEditingItemId(null);
    setFormData({});
    setIsAddModalOpen(true);
  };

  const openEditModal = (item: ProductService) => {
    setEditingItemId(item.id);
    setFormData(item);
    setIsAddModalOpen(true);
  };

  const handleUpdateItem = async (id: string, field: keyof ProductService, value: any) => {
    setProducts(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    try {
      await updateProduct(id, { [field]: value });
    } catch (e) {
      console.error('Failed to update product in Firebase', e);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (confirm('Are you sure you want to delete this item?')) {
      try {
        await deleteProduct(id);
      } catch (err) {
        console.error('Failed to delete product', err);
        alert('Failed to delete product. Check console.');
      }
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedFormData = {
      ...formData,
      price: (formData.price || '').replace(/[$,\s]/g, ''),
    };
    
    if (editingItemId) {
      try {
        await updateProduct(editingItemId, cleanedFormData);
      } catch (e) {
        console.error('Failed to update product in Firebase', e);
      }
    } else {
      try {
        await createProduct({
          name: cleanedFormData.name || '',
          description: cleanedFormData.description || '',
          price: cleanedFormData.price || '',
          order: products.length,
        });
      } catch (e) {
        console.error('Failed to create product in Firebase', e);
      }
    }
    
    setIsAddModalOpen(false);
  };

  const updateForm = (field: keyof ProductService, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="flex-grow flex flex-col overflow-hidden absolute inset-0">
      {/* Top Bar */}
      <header className="h-16 bg-white border-b border-[#E2E4E9] flex items-center justify-between px-6 shrink-0">
        <div className="bg-[#F0F2F5] rounded-md px-3 py-2 flex items-center gap-2 w-[300px] focus-within:ring-2 focus-within:ring-[#1061E3] transition-shadow">
          <Search className="w-4 h-4 text-[#8E9299]" />
          <input 
            type="text"
            placeholder="Search Price Catalog..."
            className="bg-transparent border-none outline-none text-sm w-full text-[#1C1F23] placeholder:text-[#8E9299]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <button 
            onClick={openAddModal}
            className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer border border-[#1061E3] bg-[#1061E3] text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Item
          </button>
        </div>
      </header>

      {/* View Header */}
      <div className="p-6 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="m-0 text-2xl font-bold text-[#1C1F23]">Price Catalog</h1>
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-grow px-6 pb-6 overflow-auto">
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="w-full border-collapse bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden text-left mb-8">
            <thead>
              <tr>
                <th className="w-10 bg-[#F9FAFB] px-4 py-3 border-b border-[#E2E4E9]"></th>
                <th className="w-[250px] bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">NAME</th>
                <th className="bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">DESCRIPTION</th>
                <th className="w-[150px] bg-[#F9FAFB] px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9]">PRICE</th>
                <th className="w-12 bg-[#F9FAFB] px-4 py-3 border-b border-[#E2E4E9]"></th>
              </tr>
            </thead>
            <tbody className="min-h-[50px]">
              <SortableContext 
                items={filteredItems.map(i => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[#8E9299] text-sm">No items found.</td>
                  </tr>
                ) : filteredItems.map(item => (
                  <SortableRow 
                    key={item.id} 
                    item={item} 
                    onClick={() => openEditModal(item)} 
                    onUpdate={handleUpdateItem} 
                    onDelete={handleDeleteItem}
                  />
                ))}
              </SortableContext>
            </tbody>
          </table>
        </DndContext>
      </div>

      {/* Add/Edit Item Panel */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => setIsAddModalOpen(false)}
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full border-l border-[#E2E4E9]"
            >
              <div className="px-6 py-4 border-b border-[#E2E4E9] flex items-center justify-between bg-[#F9FAFB] shrink-0">
                <h3 className="font-bold text-lg text-[#1C1F23]">
                  {editingItemId ? 'Edit Item' : 'Add New Item'}
                </h3>
                <button onClick={() => setIsAddModalOpen(false)} className="text-[#8E9299] hover:text-[#1C1F23] transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveItem} className="flex flex-col flex-grow overflow-hidden">
                <div className="flex-grow overflow-y-auto p-6 flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Name</label>
                    <input required type="text" value={formData.name || ''} onChange={e => updateForm('name', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Description</label>
                    <textarea value={formData.description || ''} onChange={e => updateForm('description', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] min-h-[100px]" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Price</label>
                    <input type="text" value={formData.price || ''} onChange={e => updateForm('price', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" placeholder="e.g. $5,000 or $150/hr" />
                  </div>
                </div>
                <div className="p-4 border-t border-[#E2E4E9] bg-[#F9FAFB] flex justify-end gap-3 shrink-0">
                  {editingItemId && (
                    <button 
                      type="button"
                      onClick={() => {
                        handleDeleteItem(editingItemId);
                        setIsAddModalOpen(false);
                      }}
                      className="px-4 py-2 rounded-md text-sm font-semibold text-[#D32F2F] hover:bg-[#FEE2E2] transition-colors flex items-center gap-2 mr-auto"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Item
                    </button>
                  )}
                  <button 
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 rounded-md text-sm font-semibold text-[#4A4D53] hover:bg-[#F0F2F5] transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-6 py-2 rounded-md text-sm font-semibold bg-[#1061E3] text-white hover:bg-blue-700 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
