'use client';

import React, { useState, useMemo, useRef } from 'react';
import { Search, Plus, FileText, Download, Mail, X, Trash2, ArrowLeft, ChevronUp, ChevronDown, ChevronsUpDown, Paperclip, Loader2, File, AlertCircle } from 'lucide-react';
import { Company, Contact, TeamMember, ProductService, Proposal, ProposalItem, Deal } from './Shared';
import { createProposal, updateProposal, deleteProposal } from '@/lib/crmStore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { getStorageClient } from '@/lib/firebase';

function formatCatalogPrice(value: string) {
  const trimmedValue = value.trim();
  const numericValue = Number(trimmedValue.replace(/[$,\s]/g, ''));

  if (!trimmedValue) return '$0.00';
  if (!Number.isFinite(numericValue)) return value;

  return numericValue.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function calculateSubtotal(items: ProposalItem[]) {
  return items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
}

export default function ProposalsView({
  teamMembers,
  companies,
  contacts,
  deals,
  products = [],
  proposals,
  setProposals,
  currentUserId
}: {
  teamMembers: TeamMember[],
  companies: Company[],
  contacts: Contact[],
  deals: Deal[],
  products?: ProductService[],
  proposals: Proposal[],
  setProposals: React.Dispatch<React.SetStateAction<Proposal[]>>,
  currentUserId?: string
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<'list' | 'edit'>('list');
  const [currentDoc, setCurrentDoc] = useState<Proposal | null>(null);

  const [uploadProgress, setUploadProgress] = useState<{ [filename: string]: number }>({});
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAttachFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !currentDoc) return;

    const storage = getStorageClient();
    setIsUploading(true);

    Array.from(files).forEach((file) => {
      const uniqueName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const storageRef = ref(storage, `proposals/${currentDoc.id}/${uniqueName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(prev => ({ ...prev, [file.name]: progress }));
        },
        (error) => {
          console.error('File upload failed:', error);
          setUploadProgress(prev => {
            const next = { ...prev };
            delete next[file.name];
            return next;
          });
          setIsUploading(false);
        },
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          
          setCurrentDoc(prevDoc => {
            if (!prevDoc) return null;
            const currentAttachments = prevDoc.attachments || [];
            return {
              ...prevDoc,
              attachments: [...currentAttachments, { name: file.name, url: downloadUrl }]
            };
          });

          setUploadProgress(prev => {
            const next = { ...prev };
            delete next[file.name];
            return next;
          });
          setIsUploading(false);
        }
      );
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = async (indexToRemove: number) => {
    if (!currentDoc) return;
    const attachment = currentDoc.attachments?.[indexToRemove];
    if (!attachment) return;

    try {
      const storage = getStorageClient();
      const decodedUrl = decodeURIComponent(attachment.url);
      const storagePathMatch = decodedUrl.match(/\/o\/(.+)\?alt=media/);
      if (storagePathMatch && storagePathMatch[1]) {
        const storagePath = storagePathMatch[1];
        const storageRef = ref(storage, storagePath);
        await deleteObject(storageRef);
      }
    } catch (err) {
      console.warn('Failed to delete attachment from Firebase Storage:', err);
    }

    setCurrentDoc({
      ...currentDoc,
      attachments: (currentDoc.attachments || []).filter((_, idx) => idx !== indexToRemove)
    });
  };

  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('awebco_proposals_sort_config');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error(e);
        }
      }
    }
    return null;
  });

  React.useEffect(() => {
    if (sortConfig) {
      localStorage.setItem('awebco_proposals_sort_config', JSON.stringify(sortConfig));
    } else {
      localStorage.removeItem('awebco_proposals_sort_config');
    }
  }, [sortConfig]);

  const handleSort = (column: string) => {
    setSortConfig(prev => {
      if (prev?.column !== column) return { column, direction: 'asc' };
      if (prev.direction === 'asc') return { column, direction: 'desc' };
      return null;
    });
  };

  const renderSortIcon = (column: string) => {
    if (sortConfig?.column === column) {
      return sortConfig.direction === 'asc'
        ? <ChevronUp className="w-3.5 h-3.5 text-[#1061E3] shrink-0" />
        : <ChevronDown className="w-3.5 h-3.5 text-[#1061E3] shrink-0" />;
    }
    return <ChevronsUpDown className="w-3.5 h-3.5 text-[#C8CDD5] shrink-0 opacity-0 group-hover/th:opacity-100 transition-opacity" />;
  };

  const filteredProposals = useMemo(() => {
    const list = proposals.filter(p => 
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      companies.find(c => c.id === p.companyId)?.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!sortConfig) return list;

    return [...list].sort((a, b) => {
      let aVal = '';
      let bVal = '';

      if (sortConfig.column === 'title') {
        aVal = a.title;
        bVal = b.title;
      } else if (sortConfig.column === 'company') {
        aVal = companies.find(c => c.id === a.companyId)?.name || '';
        bVal = companies.find(c => c.id === b.companyId)?.name || '';
      } else if (sortConfig.column === 'date') {
        const valA = a.date;
        const valB = b.date;
        if (!valA && !valB) return 0;
        if (!valA) return 1;
        if (!valB) return -1;
        const timeA = new Date(valA).getTime();
        const timeB = new Date(valB).getTime();
        if (isNaN(timeA) && isNaN(timeB)) return 0;
        if (isNaN(timeA)) return 1;
        if (isNaN(timeB)) return -1;
        return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA;
      } else if (sortConfig.column === 'total') {
        const totalA = calculateSubtotal(a.items);
        const totalB = calculateSubtotal(b.items);
        return sortConfig.direction === 'asc' ? totalA - totalB : totalB - totalA;
      } else if (sortConfig.column === 'status') {
        aVal = a.status;
        bVal = b.status;
      }

      const cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
      return sortConfig.direction === 'asc' ? cmp : -cmp;
    });
  }, [proposals, searchQuery, companies, sortConfig]);

  const handleCreateNew = () => {
    setCurrentDoc({
      id: Date.now().toString(),
      title: 'New Proposal',
      companyId: companies[0]?.id || '',
      contactId: contacts[0]?.id || '',
      dealId: deals.find(deal => deal.companyId === (companies[0]?.id || ''))?.id,
      date: new Date().toISOString().split('T')[0],
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      items: [{ id: Date.now().toString(), name: '', description: '', quantity: 1, price: 0 }],
      status: 'Draft',
      notes: '',
      clientPrintedName: '',
      signatureName: '',
      signatureDate: new Date().toISOString().split('T')[0],
      cardholderName: '',
      cardNumber: '',
      cardExpiry: '',
      cardCvv: '',
      billingZip: '',
      attachments: [],
    });
    setActiveView('edit');
  };

  const handleSave = async () => {
    if (currentDoc) {
      if (isUploading) {
        alert('Please wait for files to finish uploading before saving.');
        return;
      }
      setProposals(prev => {
        const index = prev.findIndex(p => p.id === currentDoc.id);
        if (index > -1) {
          const newArr = [...prev];
          newArr[index] = currentDoc;
          return newArr;
        } else {
          return [...prev, currentDoc];
        }
      });
      
      try {
        const isExisting = proposals.some(p => p.id === currentDoc.id);
        if (isExisting) {
          await updateProposal(currentDoc.id, currentDoc);
        } else {
          const { id, ...docWithoutId } = currentDoc;
          await createProposal(docWithoutId);
        }
      } catch (e) {
        console.error('Failed to save proposal to Firebase', e);
      }
      
      setActiveView('list');
    }
  };

  const handlePrint = () => {
    window.print();
  };



  if (activeView === 'edit' && currentDoc) {
    const subtotal = calculateSubtotal(currentDoc.items);
    const availableDeals = deals.filter(deal => deal.companyId === currentDoc.companyId);
    const todayString = new Date().toISOString().split('T')[0];
    
    return (
      <div className="proposal-print-root flex-grow flex flex-col overflow-hidden absolute inset-0 bg-gray-50 z-10 print:bg-white print:static print:h-auto print:overflow-visible">
        {/* Editor Top Bar - Hidden when printing */}
        <div className="min-h-16 md:h-16 bg-white border-b border-[#E2E4E9] flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-4 md:px-6 gap-3 shrink-0 print:hidden">
          <button 
            onClick={() => setActiveView('list')}
            className="flex items-center gap-2 text-[#4A4D53] hover:text-[#1061E3] font-semibold transition-colors justify-center sm:justify-start"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Proposals
          </button>
          <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
            <button 
              onClick={() => alert('Simulating email sending...')}
              className="px-3 py-2 md:px-4 md:py-2 rounded-md text-sm font-semibold border border-[#E2E4E9] bg-white text-[#1C1F23] hover:bg-gray-50 transition-colors flex items-center gap-2 justify-center"
            >
              <Mail className="w-4 h-4" />
              Email
            </button>
            <button 
              onClick={handlePrint}
              className="px-3 py-2 md:px-4 md:py-2 rounded-md text-sm font-semibold border border-[#E2E4E9] bg-white text-[#1C1F23] hover:bg-gray-50 transition-colors flex items-center gap-2 justify-center"
            >
              <Download className="w-4 h-4" />
              Print
            </button>
            <button 
              onClick={handleSave}
              className="px-3 py-2 md:px-4 md:py-2 rounded-md text-sm font-semibold bg-[#1061E3] text-white hover:bg-blue-700 transition-colors flex items-center gap-2 justify-center"
            >
              Save
            </button>
          </div>
        </div>

        {/* Invoice Form Area */}
        <div className="flex-grow overflow-y-auto p-4 md:p-8 flex justify-center items-start print:p-0 print:overflow-visible">
          <div className="w-full max-w-4xl bg-white rounded-lg shadow-sm border border-[#E2E4E9] p-4 md:p-8 print:shadow-none print:border-none print:p-0">
            {/* Header section */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-start gap-6 mb-8 border-b border-[#E2E4E9] pb-8 print:border-b-2 print:border-gray-300 print:flex-row print:gap-0">
              <div className="w-full md:w-1/2 md:pr-4 print:w-1/2">
                <input 
                  type="text" 
                  value={currentDoc.title}
                  onChange={(e) => setCurrentDoc({...currentDoc, title: e.target.value})}
                  className="text-3xl font-bold text-[#1C1F23] border-none outline-none focus:ring-2 focus:ring-[#1061E3] rounded px-2 -mx-2 w-full mb-4 bg-transparent"
                  placeholder="Proposal Title"
                />
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#8E9299] mb-1 uppercase tracking-wider">Date</label>
                    <input 
                      type="date"
                      value={currentDoc.date}
                      onChange={(e) => setCurrentDoc({...currentDoc, date: e.target.value})}
                      className="text-sm text-[#4A4D53] border border-[#E2E4E9] rounded px-2 py-1 outline-none w-full max-w-[150px] bg-white print:border-none print:p-0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#8E9299] mb-1 uppercase tracking-wider">Valid Until</label>
                    <input 
                      type="date"
                      value={currentDoc.validUntil}
                      onChange={(e) => setCurrentDoc({...currentDoc, validUntil: e.target.value})}
                      className="text-sm text-[#4A4D53] border border-[#E2E4E9] rounded px-2 py-1 outline-none w-full max-w-[150px] bg-white print:border-none print:p-0"
                    />
                  </div>
                </div>

                <div className="mt-6 text-sm text-[#4A4D53] leading-relaxed">
                  <label className="block text-xs font-semibold text-[#8E9299] mb-1 uppercase tracking-wider">From</label>
                  <p className="font-bold text-[#1C1F23]">Awebco</p>
                  <p>217-903-5999</p>
                  <p>806 Sheridan St. Danville, IL 61832</p>
                  <p>www.awebco.com</p>
                </div>
              </div>
              
              <div className="w-full md:w-1/3 bg-[#F9FAFB] p-4 rounded-md border border-[#E2E4E9] print:bg-transparent print:border-none print:p-0 print:w-1/3">
                <label className="block text-xs font-semibold text-[#8E9299] mb-1 uppercase tracking-wider">Bill To</label>
                <select 
                  value={currentDoc.companyId}
                  onChange={(e) => {
                    const companyId = e.target.value;
                    const matchingDealId = deals.find(deal => deal.companyId === companyId)?.id;
                    setCurrentDoc({
                      ...currentDoc,
                      companyId,
                      contactId: contacts.find(contact => contact.companyId === companyId)?.id || '',
                      dealId: matchingDealId
                    });
                  }}
                  className="w-full text-base font-semibold text-[#1C1F23] bg-transparent border-none outline-none focus:ring-2 focus:ring-[#1061E3] rounded -ml-1 py-1 mb-2 appearance-none cursor-pointer print:appearance-none print:pointer-events-none"
                >
                  <option value="" disabled>Select Company</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                
                <label className="block text-xs font-semibold text-[#8E9299] mt-2 mb-1 uppercase tracking-wider">Contact</label>
                <select 
                  value={currentDoc.contactId}
                  onChange={(e) => setCurrentDoc({...currentDoc, contactId: e.target.value})}
                  className="w-full text-sm text-[#4A4D53] bg-transparent border-none outline-none focus:ring-2 focus:ring-[#1061E3] rounded -ml-1 py-1 appearance-none cursor-pointer print:appearance-none print:pointer-events-none"
                >
                  <option value="">No specific contact</option>
                  {contacts.filter(c => c.companyId === currentDoc.companyId).map(c => (
                    <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                  ))}
                </select>

                <label className="block text-xs font-semibold text-[#8E9299] mt-2 mb-1 uppercase tracking-wider">Deal</label>
                <select
                  value={currentDoc.dealId || ''}
                  onChange={(e) => setCurrentDoc({...currentDoc, dealId: e.target.value || undefined})}
                  className="w-full text-sm text-[#4A4D53] bg-transparent border-none outline-none focus:ring-2 focus:ring-[#1061E3] rounded -ml-1 py-1 appearance-none cursor-pointer print:appearance-none print:pointer-events-none"
                >
                  <option value="">No linked deal</option>
                  {availableDeals.map(deal => (
                    <option key={deal.id} value={deal.id}>{deal.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Line Items */}
            <div className="mb-8 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px] md:min-w-0">
                <thead>
                  <tr className="border-b-2 border-[#1C1F23]">
                    <th className="py-3 px-2 text-xs font-bold text-[#1C1F23] uppercase tracking-wide">Item & Description</th>
                    <th className="py-3 px-2 text-xs font-bold text-[#1C1F23] uppercase tracking-wide w-24 text-right">Qty</th>
                    <th className="py-3 px-2 text-xs font-bold text-[#1C1F23] uppercase tracking-wide w-32 text-right">Price</th>
                    <th className="py-3 px-2 text-xs font-bold text-[#1C1F23] uppercase tracking-wide w-32 text-right">Total</th>
                    <th className="py-3 px-2 w-10 print:hidden"></th>
                  </tr>
                </thead>
                <tbody>
                  {currentDoc.items.map((item, index) => (
                    <tr key={item.id} className="border-b border-[#E2E4E9] group/row">
                      <td className="py-3 px-2 align-top">
                        <input 
                          type="text"
                          value={item.name}
                          onChange={(e) => {
                            const newItems = [...currentDoc.items];
                            newItems[index].name = e.target.value;
                            setCurrentDoc({...currentDoc, items: newItems});
                          }}
                          placeholder="Item name"
                          className="w-full text-sm font-semibold text-[#1C1F23] bg-transparent border-none outline-none focus:ring-1 focus:ring-[#1061E3] rounded px-1 -ml-1 mb-1"
                        />
                        <textarea 
                          value={item.description}
                          onChange={(e) => {
                            const newItems = [...currentDoc.items];
                            newItems[index].description = e.target.value;
                            setCurrentDoc({...currentDoc, items: newItems});
                          }}
                          placeholder="Description (optional)"
                          className="w-full text-xs text-[#8E9299] bg-transparent border-none outline-none focus:ring-1 focus:ring-[#1061E3] rounded px-1 -ml-1 resize-y"
                          rows={2}
                        />
                      </td>
                      <td className="py-3 px-2 align-top col-span-1">
                        <input 
                          type="number"
                          value={item.quantity}
                          min="1"
                          onChange={(e) => {
                            const newItems = [...currentDoc.items];
                            newItems[index].quantity = parseFloat(e.target.value) || 0;
                            setCurrentDoc({...currentDoc, items: newItems});
                          }}
                          className="w-full text-sm text-[#4A4D53] bg-transparent border-none outline-none focus:ring-1 focus:ring-[#1061E3] rounded text-right px-1"
                        />
                      </td>
                      <td className="py-3 px-2 align-top">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-sm text-[#8E9299]">$</span>
                          <input 
                            type="number"
                            value={item.price}
                            min="0"
                            onChange={(e) => {
                              const newItems = [...currentDoc.items];
                              newItems[index].price = parseFloat(e.target.value) || 0;
                              setCurrentDoc({...currentDoc, items: newItems});
                            }}
                            className="w-20 text-sm text-[#4A4D53] bg-transparent border-none outline-none focus:ring-1 focus:ring-[#1061E3] rounded text-right px-1"
                          />
                        </div>
                      </td>
                      <td className="py-3 px-2 align-top text-right text-sm font-semibold text-[#1C1F23] pt-4">
                        ${(item.quantity * item.price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </td>
                      <td className="py-3 px-2 align-top text-right print:hidden">
                        <button 
                          onClick={() => {
                            const newItems = currentDoc.items.filter((_, i) => i !== index);
                            setCurrentDoc({...currentDoc, items: newItems});
                          }}
                          className="p-1 text-[#8E9299] hover:text-[#D32F2F] hover:bg-[#FEE2E2] rounded transition-colors opacity-0 group-hover/row:opacity-100 mt-0.5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="print:hidden">
                    <td colSpan={5} className="py-4">
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => {
                            setCurrentDoc({
                              ...currentDoc,
                              items: [...currentDoc.items, { id: Date.now().toString(), name: '', description: '', quantity: 1, price: 0 }]
                            });
                          }}
                          className="text-sm font-semibold text-[#1061E3] hover:text-blue-700 flex items-center gap-1"
                        >
                          <Plus className="w-4 h-4" /> Add Blank Item
                        </button>
                        
                        <div className="relative">
                          <select 
                            onChange={(e) => {
                              const prod = products.find(p => p.id === e.target.value);
                              if (prod) {
                                setCurrentDoc({
                                  ...currentDoc,
                                  items: [...currentDoc.items, {
                                    id: Date.now().toString(),
                                    name: prod.name,
                                    description: prod.description,
                                    quantity: 1,
                                    price: parseFloat(prod.price) || 0
                                  }]
                                });
                              }
                              e.target.value = ''; // Reset select
                            }}
                            className="text-sm font-semibold text-[#1061E3] hover:text-blue-700 bg-transparent outline-none cursor-pointer appearance-none pr-4"
                            defaultValue=""
                          >
                            <option value="" disabled>+ Add from Catalog...</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name} ({formatCatalogPrice(p.price)})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Totals & Notes */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-start gap-6 print:flex-row print:gap-0">
              <div className="w-full md:w-1/2 print:w-1/2">
                <label className="block text-xs font-semibold text-[#8E9299] mb-1 uppercase tracking-wider">Notes / Terms</label>
                <textarea 
                  value={currentDoc.notes}
                  onChange={(e) => setCurrentDoc({...currentDoc, notes: e.target.value})}
                  placeholder="Thank you for your business..."
                  className="w-full text-sm text-[#4A4D53] bg-[#F9FAFB] border border-[#E2E4E9] outline-none focus:ring-2 focus:ring-[#1061E3] rounded p-3 min-h-[100px] resize-y print:border-none print:bg-transparent print:p-0"
                />
              </div>
              
              <div className="w-full md:w-1/3 print:w-1/3">
                <div className="flex justify-between py-2 border-b border-[#E2E4E9] print:border-gray-200">
                  <span className="text-sm font-semibold text-[#8E9299]">Subtotal</span>
                  <span className="text-sm font-semibold text-[#1C1F23]">
                    ${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>
                <div className="flex justify-between py-4 print:border-b-2 print:border-gray-300">
                  <span className="text-base font-bold text-[#1C1F23] uppercase tracking-wide">Total</span>
                  <span className="text-lg font-bold text-[#1061E3] print:text-black">
                    ${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>
              </div>
            </div>

            {/* Attachments Section */}
            <div className="mt-8 border-t border-[#E2E4E9] pt-8 print:pt-6">
              <h4 className="text-sm font-bold text-[#1C1F23] mb-4 uppercase tracking-wider flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-[#8E9299]" />
                Attachments
              </h4>
              
              {/* File List */}
              {currentDoc.attachments && currentDoc.attachments.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {currentDoc.attachments.map((attachment, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between p-3 bg-[#F9FAFB] border border-[#E2E4E9] rounded-lg group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <File className="w-4 h-4 text-[#8E9299] shrink-0" />
                        <a 
                          href={attachment.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-[#1061E3] hover:underline truncate"
                        >
                          {attachment.name}
                        </a>
                      </div>
                      <div className="flex items-center gap-1">
                        <a
                          href={attachment.url}
                          download={attachment.name}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-[#8E9299] hover:text-[#1061E3] hover:bg-blue-50 rounded transition-colors flex items-center justify-center shrink-0"
                          title="Download attachment"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(idx)}
                          className="p-1 text-[#8E9299] hover:text-[#D32F2F] hover:bg-[#FEE2E2] rounded transition-colors opacity-0 group-hover:opacity-100 print:hidden"
                          title="Remove Attachment"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#8E9299] italic mb-4 print:hidden">No attachments added yet.</p>
              )}

              {/* Upload Controls - Hidden when printing */}
              <div className="print:hidden">
                <input 
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleAttachFile}
                  className="hidden"
                />
                
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex items-center gap-1.5 bg-white border border-[#E2E4E9] text-[#1C1F23] px-3 py-2 rounded-md text-xs font-semibold hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isUploading ? (
                      <Loader2 className="w-3.5 h-3.5 text-[#1061E3] animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 text-[#1061E3]" />
                    )}
                    Attach Files
                  </button>
                  {isUploading && (
                    <span className="text-xs text-[#8E9299]">Uploading...</span>
                  )}
                </div>

                {/* Individual progress bars if uploading */}
                {Object.entries(uploadProgress).length > 0 && (
                  <div className="mt-3 space-y-2">
                    {Object.entries(uploadProgress).map(([name, progress]) => (
                      <div key={name} className="bg-white border border-[#E2E4E9] rounded-lg p-2.5 flex items-center gap-3 max-w-md">
                        <Loader2 className="w-4 h-4 text-[#1061E3] animate-spin shrink-0" />
                        <div className="flex-grow min-w-0">
                          <div className="text-xs font-medium text-[#1C1F23] truncate mb-1">{name}</div>
                          <div className="h-1 w-full bg-[#E3F2FD] rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[#1061E3] transition-all duration-300 ease-out"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-10 print:mt-8">
              <div className="border-t border-[#E2E4E9] pt-8 print:pt-6">
                <h4 className="text-sm font-bold text-[#1C1F23] mb-4 uppercase tracking-wider">Credit Card Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="col-span-1 sm:col-span-2 md:col-span-3">
                    <label className="block text-xs font-semibold text-[#8E9299] mb-1 uppercase tracking-wider">Cardholder Name</label>
                    <input
                      type="text"
                      value={currentDoc.cardholderName || ''}
                      onChange={(e) => setCurrentDoc({ ...currentDoc, cardholderName: e.target.value })}
                      className="w-full text-sm text-[#4A4D53] border border-[#E2E4E9] rounded px-3 py-2 outline-none focus:ring-2 focus:ring-[#1061E3] bg-white print:border-none print:bg-transparent print:px-0 print:py-0"
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2 md:col-span-3">
                    <label className="block text-xs font-semibold text-[#8E9299] mb-1 uppercase tracking-wider">Card Number</label>
                    <input
                      type="text"
                      value={currentDoc.cardNumber || ''}
                      onChange={(e) => setCurrentDoc({ ...currentDoc, cardNumber: e.target.value })}
                      className="w-full text-sm text-[#4A4D53] border border-[#E2E4E9] rounded px-3 py-2 outline-none focus:ring-2 focus:ring-[#1061E3] bg-white print:border-none print:bg-transparent print:px-0 print:py-0"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs font-semibold text-[#8E9299] mb-1 uppercase tracking-wider">Expiry</label>
                    <input
                      type="text"
                      value={currentDoc.cardExpiry || ''}
                      onChange={(e) => setCurrentDoc({ ...currentDoc, cardExpiry: e.target.value })}
                      placeholder="MM/YY"
                      className="w-full text-sm text-[#4A4D53] border border-[#E2E4E9] rounded px-3 py-2 outline-none focus:ring-2 focus:ring-[#1061E3] bg-white print:border-none print:bg-transparent print:px-0 print:py-0"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs font-semibold text-[#8E9299] mb-1 uppercase tracking-wider">CVV</label>
                    <input
                      type="text"
                      value={currentDoc.cardCvv || ''}
                      onChange={(e) => setCurrentDoc({ ...currentDoc, cardCvv: e.target.value })}
                      className="w-full text-sm text-[#4A4D53] border border-[#E2E4E9] rounded px-3 py-2 outline-none focus:ring-2 focus:ring-[#1061E3] bg-white print:border-none print:bg-transparent print:px-0 print:py-0"
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2 md:col-span-1">
                    <label className="block text-xs font-semibold text-[#8E9299] mb-1 uppercase tracking-wider">Billing Zip</label>
                    <input
                      type="text"
                      value={currentDoc.billingZip || ''}
                      onChange={(e) => setCurrentDoc({ ...currentDoc, billingZip: e.target.value })}
                      className="w-full text-sm text-[#4A4D53] border border-[#E2E4E9] rounded px-3 py-2 outline-none focus:ring-2 focus:ring-[#1061E3] bg-white print:border-none print:bg-transparent print:px-0 print:py-0"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 print:grid-cols-3 print:gap-8">
                <div>
                  <label className="block text-xs font-semibold text-[#8E9299] mb-1 uppercase tracking-wider">Today&apos;s Date</label>
                  <input
                    type="date"
                    value={currentDoc.signatureDate || todayString}
                    onChange={(e) => setCurrentDoc({ ...currentDoc, signatureDate: e.target.value })}
                    className="w-full max-w-[180px] text-sm text-[#4A4D53] border border-[#E2E4E9] rounded px-2 py-1 outline-none bg-white print:border-none print:bg-transparent print:p-0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#8E9299] mb-1 uppercase tracking-wider">Client Printed Name</label>
                  <input
                    type="text"
                    value={currentDoc.clientPrintedName || ''}
                    onChange={(e) => setCurrentDoc({ ...currentDoc, clientPrintedName: e.target.value })}
                    placeholder="Printed name"
                    className="w-full text-sm text-[#4A4D53] border border-[#E2E4E9] rounded px-3 py-2 outline-none focus:ring-2 focus:ring-[#1061E3] bg-white print:border-none print:bg-transparent print:px-0 print:py-0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#8E9299] mb-1 uppercase tracking-wider">Signature</label>
                  <input
                    type="text"
                    value={currentDoc.signatureName || ''}
                    onChange={(e) => setCurrentDoc({ ...currentDoc, signatureName: e.target.value })}
                    placeholder="Signature"
                    className="w-full text-sm text-[#4A4D53] border border-[#E2E4E9] rounded px-3 py-2 outline-none focus:ring-2 focus:ring-[#1061E3] bg-white print:border-none print:bg-transparent print:px-0 print:py-0"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- List View ---
  return (
    <div className="flex-grow flex flex-col overflow-hidden absolute inset-0">
      <header className="min-h-16 md:h-16 bg-white border-b border-[#E2E4E9] flex flex-col md:flex-row items-stretch md:items-center justify-between p-4 md:px-6 gap-3 shrink-0">
        <div className="bg-[#F0F2F5] rounded-md px-3 py-2 flex items-center gap-2 w-full md:w-[300px] focus-within:ring-2 focus-within:ring-[#1061E3] transition-shadow">
          <Search className="w-4 h-4 text-[#8E9299]" />
          <input 
            type="text"
            placeholder={`Search Proposals...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full text-[#1C1F23] placeholder:text-[#8E9299]"
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button 
            onClick={handleCreateNew}
            className="px-4 py-2 rounded-md text-sm font-semibold cursor-pointer border border-[#1061E3] bg-[#1061E3] text-white hover:bg-blue-700 transition-colors flex items-center gap-2 justify-center w-full md:w-auto"
          >
            <Plus className="w-4 h-4" />
            New Proposal
          </button>
        </div>
      </header>
      
      <div className="flex-grow overflow-auto p-6 bg-gray-50">
        <div className="max-w-6xl mx-auto space-y-4">
          <h2 className="text-xl font-bold text-[#1C1F23] mb-6">Recent Proposals</h2>
          
          <div className="bg-white border text-left border-[#E2E4E9] rounded-lg shadow-sm overflow-x-auto">
            <table className="w-full border-collapse min-w-[900px]">
              <thead className="sticky top-0 z-10 shadow-sm select-none">
                <tr className="bg-[#F9FAFB] border-b border-[#E2E4E9]">
                  <th 
                    onClick={() => handleSort('title')}
                    className="py-3 px-4 sticky top-0 bg-[#F9FAFB] z-10 text-xs font-semibold text-[#8E9299] uppercase tracking-wide cursor-pointer hover:bg-[#F0F2F5] transition-colors group/th"
                  >
                    <div className="flex items-center gap-1">
                      <span>Title</span>
                      {renderSortIcon('title')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('company')}
                    className="py-3 px-4 sticky top-0 bg-[#F9FAFB] z-10 text-xs font-semibold text-[#8E9299] uppercase tracking-wide cursor-pointer hover:bg-[#F0F2F5] transition-colors group/th"
                  >
                    <div className="flex items-center gap-1">
                      <span>Company</span>
                      {renderSortIcon('company')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('date')}
                    className="py-3 px-4 sticky top-0 bg-[#F9FAFB] z-10 text-xs font-semibold text-[#8E9299] uppercase tracking-wide cursor-pointer hover:bg-[#F0F2F5] transition-colors group/th"
                  >
                    <div className="flex items-center gap-1">
                      <span>Date</span>
                      {renderSortIcon('date')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('total')}
                    className="py-3 px-4 sticky top-0 bg-[#F9FAFB] z-10 text-xs font-semibold text-[#8E9299] uppercase tracking-wide cursor-pointer hover:bg-[#F0F2F5] transition-colors group/th"
                  >
                    <div className="flex items-center gap-1">
                      <span>Total Amount</span>
                      {renderSortIcon('total')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('status')}
                    className="py-3 px-4 sticky top-0 bg-[#F9FAFB] z-10 text-xs font-semibold text-[#8E9299] uppercase tracking-wide cursor-pointer hover:bg-[#F0F2F5] transition-colors group/th"
                  >
                    <div className="flex items-center gap-1">
                      <span>Status</span>
                      {renderSortIcon('status')}
                    </div>
                  </th>
                  <th className="py-3 px-4 w-12 sticky top-0 bg-[#F9FAFB] z-10 border-b border-[#E2E4E9]"></th>
                </tr>
              </thead>
              <tbody>
                {filteredProposals.map(proposal => {
                  const comp = companies.find(c => c.id === proposal.companyId);
                  const total = calculateSubtotal(proposal.items);
                  return (
                    <tr 
                      key={proposal.id} 
                      className="border-b border-[#F0F2F5] hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => {
                        setCurrentDoc(proposal);
                        setActiveView('edit');
                      }}
                    >
                      <td className="py-3 px-4 text-sm font-semibold text-[#1C1F23] flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#8E9299]" />
                        {proposal.title}
                      </td>
                      <td className="py-3 px-4 text-sm text-[#4A4D53]">{comp?.name || '-'}</td>
                      <td className="py-3 px-4 text-sm text-[#4A4D53]">
                        {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(proposal.date))}
                      </td>
                      <td className="py-3 px-4 text-sm font-semibold text-[#4A4D53]">
                        ${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase ${
                          proposal.status === 'Draft' ? 'bg-gray-100 text-gray-700' :
                          proposal.status === 'Sent' ? 'bg-blue-100 text-blue-700' :
                          proposal.status === 'Accepted' ? 'bg-green-100 text-green-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {proposal.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            if(confirm('Are you sure you want to delete this proposal?')) {
                              setProposals(prev => prev.filter(p => p.id !== proposal.id));
                              try {
                                await deleteProposal(proposal.id);
                              } catch (err) {
                                console.error('Failed to delete proposal', err);
                              }
                            }
                          }}
                          className="p-1.5 text-[#8E9299] hover:text-[#D32F2F] hover:bg-[#FEE2E2] rounded transition-colors"
                          title="Delete Proposal"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {filteredProposals.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 px-4 text-center text-[#8E9299] text-sm">
                      No proposals found. Click &quot;New Proposal&quot; to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
