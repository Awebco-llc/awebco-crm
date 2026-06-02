'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, FileText, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { TeamMember, Company, Contact, Deal } from '@/components/Shared';
import { parseDealCSV, mapDealImportData, processDealImport, DealImportResult } from '@/lib/importer';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface DealImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamMembers: TeamMember[];
  companies: Company[];
  contacts: Contact[];
  deals: Deal[];
}

export default function DealImportModal({ isOpen, onClose, teamMembers, companies, contacts, deals }: DealImportModalProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<DealImportResult[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [importStats, setImportStats] = useState<{ created: number; skipped: number }>({ created: 0, skipped: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setFile(null);
    setPreviewData([]);
    setImportProgress(0);
    setError(null);
    setImportStats({ created: 0, skipped: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        reset();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const parseDealFile = async (selectedFile: File): Promise<DealImportResult[]> => {
    return new Promise((resolve, reject) => {
      if (selectedFile.name.endsWith('.csv')) {
        Papa.parse(selectedFile, {
          header: false,
          skipEmptyLines: false,
          complete: (results) => {
            const rows = results.data as string[][];
            const parsed = parseDealCSV(rows);
            resolve(mapDealImportData(parsed));
          },
          error: (err) => reject(err)
        });
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
          const parsed = parseDealCSV(rows);
          resolve(mapDealImportData(parsed));
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsBinaryString(selectedFile);
      }
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    try {
      const mapped = await parseDealFile(selectedFile);
      if (mapped.length === 0) {
        setError('No valid deal data found in file. Make sure the file has deal columns like "Name", "Status", "Current Step", etc.');
      } else {
        // Calculate how many would be skipped (duplicates)
        const existingNames = new Set(deals.map(d => d.name.toLowerCase()));
        const skipped = mapped.filter(d => existingNames.has(d.name.toLowerCase())).length;
        setImportStats({ created: mapped.length - skipped, skipped });
        setPreviewData(mapped);
        setStep('preview');
        setError(null);
      }
    } catch (err) {
      setError('Failed to parse file. Please check the format and try again.');
      console.error(err);
    }
  };

  const startImport = async () => {
    setStep('importing');
    setImportProgress(0);
    try {
      await processDealImport(
        previewData,
        companies,
        contacts.map(c => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, companyId: c.companyId })),
        teamMembers,
        deals,
        (count) => {
          setImportProgress(count);
        }
      );
      setStep('complete');
    } catch (err) {
      setError('An error occurred during import. Some deals may have been partially imported.');
      setStep('preview');
      console.error(err);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;
    
    const ext = droppedFile.name.toLowerCase();
    if (!ext.endsWith('.csv') && !ext.endsWith('.xls') && !ext.endsWith('.xlsx')) {
      setError('Please upload a CSV or Excel file.');
      return;
    }

    setFile(droppedFile);
    try {
      const mapped = await parseDealFile(droppedFile);
      if (mapped.length === 0) {
        setError('No valid deal data found in file.');
      } else {
        const existingNames = new Set(deals.map(d => d.name.toLowerCase()));
        const skipped = mapped.filter(d => existingNames.has(d.name.toLowerCase())).length;
        setImportStats({ created: mapped.length - skipped, skipped });
        setPreviewData(mapped);
        setStep('preview');
        setError(null);
      }
    } catch (err) {
      setError('Failed to parse file. Please check the format.');
      console.error(err);
    }
  };

  const getSectionBadge = (section: string) => {
    const s = section.toLowerCase();
    if (s.includes('won')) return 'bg-[#ECFDF3] text-[#10B981]';
    if (s === 'lost') return 'bg-[#FFEBEB] text-[#D32F2F]';
    if (s.includes('active')) return 'bg-[#E3F2FD] text-[#1976D2]';
    return 'bg-[#F0F2F5] text-[#4A4D53]';
  };

  const getStatusBadge = (status: string) => {
    if (!status) return 'bg-gray-100 text-gray-600';
    const s = status.toLowerCase();
    if (s === 'won') return 'bg-[#ECFDF3] text-[#10B981]';
    if (s === 'lost') return 'bg-[#FFEBEB] text-[#D32F2F]';
    if (s.includes('follow up') || s.includes('call')) return 'bg-[#FFF4E5] text-[#ED6C02]';
    if (s.includes('awaiting') || s.includes('hold')) return 'bg-[#FEF9C3] text-[#CA8A04]';
    return 'bg-[#F0F2F5] text-[#4A4D53]';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-5xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E4E9] flex items-center justify-between bg-[#F9FAFB]">
          <div>
            <h3 className="font-bold text-lg text-[#1C1F23]">Import Deals</h3>
            <p className="text-xs text-[#8E9299]">Upload a CSV or Excel file exported from monday.com or similar CRM</p>
          </div>
          <button onClick={onClose} className="text-[#8E9299] hover:text-[#1C1F23] transition-colors p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-auto p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg flex items-start gap-3 text-red-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {step === 'upload' && (
            <div
              className="border-2 border-dashed border-[#E2E4E9] rounded-xl p-12 flex flex-col items-center justify-center gap-4 hover:border-[#1061E3] hover:bg-blue-50/50 transition-all cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <div className="w-16 h-16 rounded-full bg-[#F0F2F5] flex items-center justify-center group-hover:bg-[#1061E3] group-hover:text-white transition-colors">
                <Upload className="w-8 h-8 text-[#8E9299] group-hover:text-white" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-[#1C1F23]">Click or drag file to upload</p>
                <p className="text-sm text-[#8E9299]">Supports CSV, XLS, XLSX</p>
              </div>
              <div className="mt-2 text-xs text-[#8E9299] text-center max-w-md">
                <p>Expected columns: Name, Current Step, Status, Owner, Deal Value, Contacts, Company, Notes</p>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv,.xls,.xlsx"
                onChange={handleFileChange}
              />
            </div>
          )}

          {step === 'preview' && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between bg-[#F0F2F5] p-3 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-[#1061E3]" />
                  <span className="text-sm font-semibold text-[#1C1F23]">{file?.name}</span>
                </div>
                <button onClick={reset} className="text-xs font-semibold text-[#1061E3] hover:underline">Change File</button>
              </div>

              {/* Import stats */}
              <div className="flex gap-4">
                <div className="flex-1 bg-blue-50 border border-blue-100 rounded-lg p-4">
                  <div className="text-2xl font-bold text-[#1061E3]">{previewData.length}</div>
                  <div className="text-xs text-[#4A4D53] font-medium">Total deals found</div>
                </div>
                <div className="flex-1 bg-green-50 border border-green-100 rounded-lg p-4">
                  <div className="text-2xl font-bold text-[#10B981]">{importStats.created}</div>
                  <div className="text-xs text-[#4A4D53] font-medium">New deals to import</div>
                </div>
                {importStats.skipped > 0 && (
                  <div className="flex-1 bg-amber-50 border border-amber-100 rounded-lg p-4">
                    <div className="text-2xl font-bold text-[#CA8A04]">{importStats.skipped}</div>
                    <div className="text-xs text-[#4A4D53] font-medium">Duplicates (will skip)</div>
                  </div>
                )}
              </div>

              {/* Preview table */}
              <div className="border border-[#E2E4E9] rounded-lg overflow-hidden">
                <div className="max-h-[350px] overflow-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-[#F9FAFB] shadow-sm z-10">
                      <tr>
                        <th className="px-3 py-2.5 border-b border-[#E2E4E9] font-semibold text-[#8E9299]">SECTION</th>
                        <th className="px-3 py-2.5 border-b border-[#E2E4E9] font-semibold text-[#8E9299]">DEAL NAME</th>
                        <th className="px-3 py-2.5 border-b border-[#E2E4E9] font-semibold text-[#8E9299]">STEP</th>
                        <th className="px-3 py-2.5 border-b border-[#E2E4E9] font-semibold text-[#8E9299]">STATUS</th>
                        <th className="px-3 py-2.5 border-b border-[#E2E4E9] font-semibold text-[#8E9299]">OWNER</th>
                        <th className="px-3 py-2.5 border-b border-[#E2E4E9] font-semibold text-[#8E9299]">VALUE</th>
                        <th className="px-3 py-2.5 border-b border-[#E2E4E9] font-semibold text-[#8E9299]">COMPANY</th>
                        <th className="px-3 py-2.5 border-b border-[#E2E4E9] font-semibold text-[#8E9299]">CONTACT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F2F5]">
                      {previewData.slice(0, 100).map((row, i) => {
                        const isDuplicate = deals.some(d => d.name.toLowerCase() === row.name.toLowerCase());
                        return (
                          <tr key={i} className={`hover:bg-gray-50 ${isDuplicate ? 'opacity-40' : ''}`}>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase whitespace-nowrap ${getSectionBadge(row.section)}`}>
                                {row.section}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-[#1C1F23] font-medium max-w-[200px] truncate">
                              {row.name}
                              {isDuplicate && <span className="ml-1.5 text-[10px] text-amber-600 font-normal">(exists)</span>}
                            </td>
                            <td className="px-3 py-2 text-[#4A4D53] max-w-[140px] truncate">{row.currentStep || '-'}</td>
                            <td className="px-3 py-2">
                              {row.status ? (
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase whitespace-nowrap ${getStatusBadge(row.status)}`}>
                                  {row.status}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="px-3 py-2 text-[#4A4D53] whitespace-nowrap">{row.ownerName || '-'}</td>
                            <td className="px-3 py-2 text-[#4A4D53] font-medium">
                              {row.dealValue ? `$${Number(row.dealValue).toLocaleString()}` : '-'}
                            </td>
                            <td className="px-3 py-2 text-[#4A4D53] max-w-[140px] truncate">{row.companyName || '-'}</td>
                            <td className="px-3 py-2 text-[#4A4D53] max-w-[120px] truncate">{row.contactName || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {previewData.length > 100 && (
                <p className="text-[11px] text-[#8E9299] italic">Showing first 100 of {previewData.length} records</p>
              )}
            </div>
          )}

          {step === 'importing' && (
            <div className="py-12 flex flex-col items-center justify-center gap-6">
              <div className="relative">
                <Loader2 className="w-16 h-16 text-[#1061E3] animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center font-bold text-[#1061E3] text-sm">
                  {previewData.length > 0 ? Math.round((importProgress / previewData.length) * 100) : 0}%
                </div>
              </div>
              <div className="text-center">
                <h4 className="font-bold text-lg text-[#1C1F23]">Importing Deals...</h4>
                <p className="text-sm text-[#8E9299]">Creating deals, matching companies and contacts</p>
                <div className="mt-4 w-64 h-2 bg-[#F0F2F5] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-[#1061E3]"
                    initial={{ width: 0 }}
                    animate={{ width: previewData.length > 0 ? `${(importProgress / previewData.length) * 100}%` : '0%' }}
                  />
                </div>
                <p className="text-xs text-[#8E9299] mt-2">{importProgress} of {previewData.length} processed</p>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="py-12 flex flex-col items-center justify-center gap-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <div className="text-center">
                <h4 className="font-bold text-xl text-[#1C1F23]">Import Complete!</h4>
                <p className="text-sm text-[#8E9299]">
                  Successfully processed {previewData.length} deals.
                  {importStats.skipped > 0 && ` (${importStats.skipped} duplicates were skipped)`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-4 px-8 py-2 bg-[#1061E3] text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'preview' && (
          <div className="px-6 py-4 border-t border-[#E2E4E9] bg-[#F9FAFB] flex justify-end gap-3">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-semibold text-[#4A4D53] hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={startImport}
              disabled={importStats.created === 0}
              className="px-6 py-2 text-sm font-semibold bg-[#1061E3] text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import {importStats.created} Deal{importStats.created !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
