'use client';

import React, { useState, useMemo, useRef } from 'react';
import { Search, Plus, X, GripVertical, Trash2, Upload, Loader2, CheckCircle2, AlertCircle, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
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

function EditableCell({ value, onSave, renderValue }: { value: string, onSave: (val: string) => void, renderValue?: (val: string) => React.ReactNode }) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setTempValue(value);
  }, [value]);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setIsEditing(false);
      if (tempValue !== value) {
        onSave(tempValue);
      }
    } else if (e.key === 'Escape') {
      setTempValue(value);
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (tempValue !== value) {
      onSave(tempValue);
    }
  };

  if (isEditing) {
    return (
      <div 
        className="w-full h-full flex items-center" 
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={tempValue || ''}
          onChange={(e) => setTempValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="w-full px-1.5 py-0.5 text-[13px] border border-[#1061E3] rounded outline-none bg-white text-[#1C1F23] focus:ring-1 focus:ring-[#1061E3] font-medium"
        />
      </div>
    );
  }

  return (
    <div 
      className="min-h-[20px] truncate hover:bg-gray-100/80 rounded px-1 -mx-1 transition-colors cursor-text" 
      title={value ? `${value} (Click to edit)` : 'Click to edit'}
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      {renderValue ? renderValue(value) : (value || '-')}
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
    <tr 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners} 
      onClick={onClick} 
      className="hover:bg-gray-50 transition-colors cursor-pointer bg-white"
    >
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] w-10">
        <div className="cursor-grab active:cursor-grabbing text-[#8E9299] hover:text-[#1C1F23]">
          <GripVertical className="w-4 h-4" />
        </div>
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableCell value={item.name} onSave={v => onUpdate(item.id, 'name', v)} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableCell value={formatCatalogPrice(item.price)} onSave={v => onUpdate(item.id, 'price', v)} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        <EditableCell value={item.description} onSave={v => onUpdate(item.id, 'description', v)} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        {item.url ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[#1061E3] hover:underline truncate block max-w-[180px]">{item.url}</a>
        ) : <span className="text-[#C8CDD5]">—</span>}
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5] text-[#8E9299]">
        <EditableCell value={item.sku || ''} onSave={v => onUpdate(item.id, 'sku', v)} />
      </td>
      <td className="px-4 py-3 text-[13px] border-b border-[#F0F2F5]">
        {item.type ? (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#F0F2F5] text-[#4A4D53]">{item.type}</span>
        ) : <span className="text-[#C8CDD5]">—</span>}
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

export default function ProductsServicesView({ 
  products, 
  setProducts,
  proposals = []
}: { 
  products: ProductService[], 
  setProducts: React.Dispatch<React.SetStateAction<ProductService[]>>,
  proposals?: any[]
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null);

  const handleSort = (column: string) => {
    setSortConfig(prev => {
      if (prev?.column !== column) return { column, direction: 'asc' };
      if (prev.direction === 'asc') return { column, direction: 'desc' };
      return null;
    });
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig?.column === column) {
      return sortConfig.direction === 'asc'
        ? <ChevronUp className="w-3.5 h-3.5 text-[#1061E3] shrink-0" />
        : <ChevronDown className="w-3.5 h-3.5 text-[#1061E3] shrink-0" />;
    }
    return <ChevronsUpDown className="w-3.5 h-3.5 text-[#C8CDD5] shrink-0 opacity-0 group-hover/th:opacity-100 transition-opacity" />;
  };

  // Form State
  const [formData, setFormData] = useState<Partial<ProductService>>({});

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importSource, setImportSource] = useState<'options' | 'crm' | 'csv' | 'importing' | 'complete'>('options');
  const [importedItems, setImportedItems] = useState<Array<{ name: string; description: string; price: string; url: string; sku: string; type: string }>>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadFromCRM = () => {
    setImportError(null);
    const existingNames = new Set(products.map(p => p.name.toLowerCase().trim()));
    const uniqueItems = new Map<string, { name: string; description: string; price: string; url: string; sku: string; type: string }>();

    proposals.forEach(p => {
      p.items?.forEach((item: any) => {
        const name = (item.name || '').trim();
        if (name && !existingNames.has(name.toLowerCase()) && !uniqueItems.has(name.toLowerCase())) {
          uniqueItems.set(name.toLowerCase(), {
            name: name,
            description: (item.description || '').trim(),
            price: String(item.price || 0),
            url: '',
            sku: '',
            type: '',
          });
        }
      });
    });

    const itemsToImport = Array.from(uniqueItems.values());
    if (itemsToImport.length === 0) {
      setImportError('No new unique services/products were found in the existing CRM proposals.');
      setImportedItems([]);
    } else {
      setImportedItems(itemsToImport);
      setImportSource('crm');
    }
  };

  // Detect the header row index in a 2D array by looking for known column keywords
  const findHeaderRowIndex = (rows2d: string[][]): number => {
    const keywords = new Set(['name', 'item', 'price', 'description', 'sku', 'type', 'url']);
    for (let i = 0; i < rows2d.length; i++) {
      const cells = rows2d[i].map(c => (c || '').toLowerCase().trim());
      const matches = cells.filter(c => keywords.has(c)).length;
      if (matches >= 2) return i; // at least 2 known column names found
    }
    return 0;
  };

  // Convert 2D array (header row + data rows) into keyed objects
  const rows2dToObjects = (rows2d: string[][], headerIdx: number): any[] => {
    const headers = rows2d[headerIdx];
    return rows2d.slice(headerIdx + 1).map(cells => {
      const obj: any = {};
      headers.forEach((h, i) => { obj[h.trim()] = cells[i] ?? ''; });
      return obj;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setImportError(null);
    const existingNames = new Set(products.map(p => p.name.toLowerCase().trim()));

    if (selectedFile.name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        // First pass: parse without header to get raw 2D array
        const rawResult = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
        const rows2d = rawResult.data as string[][];
        const headerIdx = findHeaderRowIndex(rows2d);
        const rows = rows2dToObjects(rows2d, headerIdx);
        parseMappedRows(rows, existingNames);
      };
      reader.readAsText(selectedFile);
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = evt.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          // Get raw 2D array (no header inference) and find the real header row
          const rows2d = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 }) as string[][];
          const headerIdx = findHeaderRowIndex(rows2d);
          const rows = rows2dToObjects(rows2d, headerIdx);
          parseMappedRows(rows, existingNames);
        } catch (err: any) {
          setImportError(`Failed to parse Excel file: ${err.message}`);
        }
      };
      reader.readAsBinaryString(selectedFile);
    }
  };


  const parseMappedRows = (rows: any[], existingNames: Set<string>) => {
    const itemsToImport: typeof importedItems = [];
    rows.forEach(row => {
      // Accept "Item" (the actual column name) plus legacy aliases
      const name = (
        row['Item'] || row['item'] ||
        row['Name'] || row['name'] ||
        row['Product Name'] || row['Service Name'] || ''
      ).trim();
      const description = (row['Description'] || row['description'] || '').trim();
      const rawPrice = String(row['Price'] || row['price'] || '').trim().replace(/[$,\s]/g, '');
      const url = (row['URL'] || row['url'] || row['Url'] || row['Link'] || '').trim();
      const sku = (row['SKU'] || row['sku'] || row['Sku'] || row['Code'] || '').trim();
      const type = (row['Type'] || row['type'] || row['Category'] || row['category'] || '').trim();

      if (name && !existingNames.has(name.toLowerCase())) {
        itemsToImport.push({ name, description, price: rawPrice, url, sku, type });
      }
    });

    if (itemsToImport.length === 0) {
      setImportError('No new unique items were found. Ensure your spreadsheet has an "Item" column (plus optional Price, Description, URL, SKU, Type).');
      setImportedItems([]);
    } else {
      setImportedItems(itemsToImport);
      setImportSource('csv');
    }
  };

  const startImport = async () => {
    setImportSource('importing');
    setImportProgress(0);

    let count = 0;
    for (const item of importedItems) {
      try {
        await createProduct({
          name: item.name,
          description: item.description,
          price: item.price,
          url: item.url,
          sku: item.sku,
          type: item.type,
          order: products.length + count
        });
        count++;
        setImportProgress(count);
      } catch (err) {
        console.error('Failed to import catalog item:', err);
      }
    }
    setImportSource('complete');
  };

  const filteredItems = useMemo(() => {
    const list = products.filter(i => 
      i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!sortConfig) return list;

    return [...list].sort((a, b) => {
      let aVal = '';
      let bVal = '';

      if (sortConfig.column === 'name') {
        aVal = a.name;
        bVal = b.name;
      } else if (sortConfig.column === 'price') {
        const numA = Number(a.price.replace(/[$,\s]/g, '')) || 0;
        const numB = Number(b.price.replace(/[$,\s]/g, '')) || 0;
        return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
      } else if (sortConfig.column === 'description') {
        aVal = a.description || '';
        bVal = b.description || '';
      } else if (sortConfig.column === 'url') {
        aVal = a.url || '';
        bVal = b.url || '';
      } else if (sortConfig.column === 'sku') {
        aVal = a.sku || '';
        bVal = b.sku || '';
      } else if (sortConfig.column === 'type') {
        aVal = a.type || '';
        bVal = b.type || '';
      }

      const cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
      return sortConfig.direction === 'asc' ? cmp : -cmp;
    });
  }, [products, searchQuery, sortConfig]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
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
          url: cleanedFormData.url || '',
          sku: cleanedFormData.sku || '',
          type: cleanedFormData.type || '',
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
      <header className="min-h-16 bg-white border-b border-[#E2E4E9] flex flex-col md:flex-row md:items-center justify-between p-4 md:px-6 gap-3 shrink-0">
        <div className="bg-[#F0F2F5] rounded-md px-3 py-2 flex items-center gap-2 w-full md:w-[300px] focus-within:ring-2 focus-within:ring-[#1061E3] transition-shadow">
          <Search className="w-4 h-4 text-[#8E9299]" />
          <input 
            type="text"
            placeholder="Search Price Catalog..."
            className="bg-transparent border-none outline-none text-sm w-full text-[#1C1F23] placeholder:text-[#8E9299]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <button 
            onClick={() => {
              setImportSource('options');
              setImportedItems([]);
              setImportProgress(0);
              setImportError(null);
              setIsImportModalOpen(true);
            }}
            className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer border border-[#E2E4E9] bg-white text-[#4A4D53] hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
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
          <div className="overflow-x-auto w-full bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[#E2E4E9] mb-8">
            <table className="w-full border-collapse text-left min-w-[1000px]" style={{ minWidth: '1000px' }}>
            <thead className="sticky top-0 z-10 shadow-sm select-none">
              <tr>
                <th className="w-10 sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 border-b border-[#E2E4E9]"></th>
                <th 
                  onClick={() => handleSort('name')}
                  className="w-[220px] sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] cursor-pointer hover:bg-[#F0F2F5] transition-colors group/th"
                >
                  <div className="flex items-center gap-1">
                    <span>ITEM</span>
                    <SortIcon column="name" />
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('price')}
                  className="w-[120px] sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] cursor-pointer hover:bg-[#F0F2F5] transition-colors group/th"
                >
                  <div className="flex items-center gap-1">
                    <span>PRICE</span>
                    <SortIcon column="price" />
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('description')}
                  className="sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] cursor-pointer hover:bg-[#F0F2F5] transition-colors group/th"
                >
                  <div className="flex items-center gap-1">
                    <span>DESCRIPTION</span>
                    <SortIcon column="description" />
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('url')}
                  className="w-[200px] sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] cursor-pointer hover:bg-[#F0F2F5] transition-colors group/th"
                >
                  <div className="flex items-center gap-1">
                    <span>URL</span>
                    <SortIcon column="url" />
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('sku')}
                  className="w-[100px] sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] cursor-pointer hover:bg-[#F0F2F5] transition-colors group/th"
                >
                  <div className="flex items-center gap-1">
                    <span>SKU</span>
                    <SortIcon column="sku" />
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('type')}
                  className="w-[120px] sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 text-xs font-semibold text-[#8E9299] border-b border-[#E2E4E9] cursor-pointer hover:bg-[#F0F2F5] transition-colors group/th"
                >
                  <div className="flex items-center gap-1">
                    <span>TYPE</span>
                    <SortIcon column="type" />
                  </div>
                </th>
                <th className="w-12 sticky top-0 bg-[#F9FAFB] z-10 px-4 py-3 border-b border-[#E2E4E9]"></th>
              </tr>
            </thead>
            <tbody className="min-h-[50px]">
              <SortableContext 
                items={filteredItems.map(i => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[#8E9299] text-sm">No items found.</td>
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
          </div>
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
                    <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Item Name</label>
                    <input required type="text" value={formData.name || ''} onChange={e => updateForm('name', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Price</label>
                      <input type="text" value={formData.price || ''} onChange={e => updateForm('price', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" placeholder="e.g. $5,000 or $150/hr" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">SKU</label>
                      <input type="text" value={formData.sku || ''} onChange={e => updateForm('sku', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" placeholder="e.g. WEB-001" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Type / Category</label>
                    <input type="text" value={formData.type || ''} onChange={e => updateForm('type', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" placeholder="e.g. Service, Product, Add-on" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">URL</label>
                    <input type="url" value={formData.url || ''} onChange={e => updateForm('url', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]" placeholder="https://..." />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Description</label>
                    <textarea value={formData.description || ''} onChange={e => updateForm('description', e.target.value)} className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] min-h-[100px]" />
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

      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsImportModalOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] z-10"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-[#E2E4E9] flex items-center justify-between bg-[#F9FAFB] shrink-0">
                <div>
                  <h3 className="font-bold text-lg text-[#1C1F23]">Import to Price Catalog</h3>
                  <p className="text-xs text-[#8E9299]">Populate your price catalog from active CRM proposals or via CSV upload</p>
                </div>
                <button onClick={() => setIsImportModalOpen(false)} className="text-[#8E9299] hover:text-[#1C1F23] transition-colors p-1 hover:bg-gray-100 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-grow overflow-auto p-6">
                {importError && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg flex items-start gap-3 text-red-700">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm">{importError}</p>
                  </div>
                )}

                {importSource === 'options' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-6">
                    <button
                      onClick={handleLoadFromCRM}
                      className="border border-[#E2E4E9] rounded-xl p-6 text-center hover:border-[#1061E3] hover:bg-blue-50/20 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer group"
                    >
                      <div className="w-12 h-12 rounded-full bg-blue-50 text-[#1061E3] flex items-center justify-center group-hover:bg-[#1061E3] group-hover:text-white transition-colors">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-[#1C1F23]">Import from CRM Proposals</h4>
                        <p className="text-xs text-[#8E9299] mt-1 max-w-[200px] mx-auto">Extract unique product items and pricing from existing proposal documents.</p>
                      </div>
                    </button>

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="border border-[#E2E4E9] rounded-xl p-6 text-center hover:border-[#1061E3] hover:bg-blue-50/20 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer group"
                    >
                      <div className="w-12 h-12 rounded-full bg-gray-50 text-[#8E9299] flex items-center justify-center group-hover:bg-[#1061E3] group-hover:text-white transition-colors">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-[#1C1F23]">Upload CSV / Excel File</h4>
                        <p className="text-xs text-[#8E9299] mt-1 max-w-[200px] mx-auto">Upload a spreadsheet matching Name, Description, and Price fields.</p>
                      </div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".csv,.xls,.xlsx"
                        onChange={handleFileChange}
                      />
                    </button>
                  </div>
                )}

                {(importSource === 'crm' || importSource === 'csv') && (
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center bg-[#F0F2F5] p-3 rounded-lg text-sm font-semibold text-[#1C1F23]">
                      <span>Ready to import {importedItems.length} unique item{importedItems.length === 1 ? '' : 's'}</span>
                      <button onClick={() => setImportSource('options')} className="text-xs text-[#1061E3] hover:underline">Change Source</button>
                    </div>

                    <div className="border border-[#E2E4E9] rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="sticky top-0 bg-[#F9FAFB] shadow-sm z-10">
                          <tr>
                            <th className="px-3 py-2 border-b border-[#E2E4E9] font-bold text-[#8E9299]">NAME</th>
                            <th className="px-3 py-2 border-b border-[#E2E4E9] font-bold text-[#8E9299]">DESCRIPTION</th>
                            <th className="px-3 py-2 border-b border-[#E2E4E9] font-bold text-[#8E9299]">PRICE</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0F2F5]">
                          {importedItems.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-[#1C1F23] font-semibold">{item.name}</td>
                              <td className="px-3 py-2 text-[#8E9299] truncate max-w-[250px]">{item.description || '-'}</td>
                              <td className="px-3 py-2 text-[#4A4D53] font-semibold">{formatCatalogPrice(item.price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {importSource === 'importing' && (
                  <div className="py-12 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-12 h-12 text-[#1061E3] animate-spin" />
                    <div className="text-center">
                      <h4 className="font-bold text-sm text-[#1C1F23]">Importing Items...</h4>
                      <p className="text-xs text-[#8E9299] mt-1">{importProgress} of {importedItems.length} imported</p>
                    </div>
                  </div>
                )}

                {importSource === 'complete' && (
                  <div className="py-12 flex flex-col items-center justify-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="text-center">
                      <h4 className="font-bold text-base text-[#1C1F23]">Import Complete!</h4>
                      <p className="text-xs text-[#8E9299] mt-1">Successfully added {importedItems.length} new items to the price catalog.</p>
                    </div>
                    <button 
                      onClick={() => setIsImportModalOpen(false)}
                      className="mt-2 px-6 py-2 bg-[#1061E3] text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>

              {/* Footer */}
              {(importSource === 'crm' || importSource === 'csv') && (
                <div className="px-6 py-4 border-t border-[#E2E4E9] bg-[#F9FAFB] flex justify-end gap-3 shrink-0">
                  <button 
                    onClick={() => setIsImportModalOpen(false)}
                    className="px-4 py-2 text-sm font-semibold text-[#4A4D53] hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={startImport}
                    className="px-6 py-2 text-sm font-semibold bg-[#1061E3] text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    Import {importedItems.length} Item{importedItems.length === 1 ? '' : 's'}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
