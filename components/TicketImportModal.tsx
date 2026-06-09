'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, FileText, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Company, TeamMember } from '@/components/Shared';
import { parseFile, mapTicketImportData, processTicketImport, TicketImportResult } from '@/lib/importer';

interface TicketImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamMembers: TeamMember[];
  companies: Company[];
  workspace: string;
  groups?: any[];
  existingTickets?: any[];
}

export default function TicketImportModal({ isOpen, onClose, teamMembers, companies, workspace, groups, existingTickets }: TicketImportModalProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<TicketImportResult[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setFile(null);
    setPreviewData([]);
    setImportProgress(0);
    setError(null);
    setSelectedGroupId('');
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    try {
      const rawData = await parseFile(selectedFile);
      const mapped = mapTicketImportData(rawData);
      if (mapped.length === 0) {
        setError('No valid ticket data found in file.');
      } else {
        setPreviewData(mapped);
        setStep('preview');
        setError(null);
      }
    } catch (err) {
      setError('Failed to parse file. Please check the format.');
      console.error(err);
    }
  };

  const startImport = async () => {
    setStep('importing');
    setImportProgress(0);
    try {
      await processTicketImport(
        previewData,
        workspace,
        companies,
        teamMembers,
        (count) => { setImportProgress(count); },
        groups,
        selectedGroupId,
        existingTickets
      );
      setStep('complete');
    } catch (err) {
      setError('An error occurred during import.');
      setStep('preview');
      console.error(err);
    }
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
        className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E4E9] flex items-center justify-between bg-[#F9FAFB]">
          <div>
            <h3 className="font-bold text-lg text-[#1C1F23]">Import Support Tickets</h3>
            <p className="text-xs text-[#8E9299]">Upload CSV or Excel files to bulk add tickets to {workspace}</p>
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
            >
              <div className="w-16 h-16 rounded-full bg-[#F0F2F5] flex items-center justify-center group-hover:bg-[#1061E3] group-hover:text-white transition-colors">
                <Upload className="w-8 h-8 text-[#8E9299] group-hover:text-white" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-[#1C1F23]">Click or drag file to upload</p>
                <p className="text-sm text-[#8E9299]">Supports CSV, XLS, XLSX</p>
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

              {groups && groups.length > 0 && (
                <div className="bg-[#F9FAFB] border border-[#E2E4E9] p-4 rounded-xl flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-bold text-[#4A4D53] uppercase tracking-wider">Import into group</label>
                    <p className="text-[11px] text-[#8E9299]">Choose a specific group to import these projects into, or auto-detect from the file.</p>
                  </div>
                  <select 
                    value={selectedGroupId} 
                    onChange={e => setSelectedGroupId(e.target.value)}
                    className="px-3 py-2 border border-[#E2E4E9] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] bg-white text-[#1C1F23] font-medium min-w-[240px] shadow-sm cursor-pointer"
                  >
                    <option value="">(Auto-detect from file)</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="border border-[#E2E4E9] rounded-lg overflow-hidden">
                <div className="max-h-[300px] overflow-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-[#F9FAFB] shadow-sm">
                      <tr>
                        <th className="px-3 py-2 border-b border-[#E2E4E9] font-semibold text-[#8E9299]">TICKET NAME</th>
                        <th className="px-3 py-2 border-b border-[#E2E4E9] font-semibold text-[#8E9299]">STATUS</th>
                        <th className="px-3 py-2 border-b border-[#E2E4E9] font-semibold text-[#8E9299]">PRIORITY</th>
                        <th className="px-3 py-2 border-b border-[#E2E4E9] font-semibold text-[#8E9299]">COMPANY</th>
                        <th className="px-3 py-2 border-b border-[#E2E4E9] font-semibold text-[#8E9299]">ASSIGNEE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F2F5]">
                      {previewData.slice(0, 50).map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-[#1C1F23] font-medium">{row.projectName}</td>
                          <td className="px-3 py-2 text-[#4A4D53]">{row.status}</td>
                          <td className="px-3 py-2 text-[#4A4D53]">{row.priority}</td>
                          <td className="px-3 py-2 text-[#4A4D53]">{row.companyName || '-'}</td>
                          <td className="px-3 py-2 text-[#8E9299]">{row.assigneeName || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {previewData.length > 50 && (
                <p className="text-[11px] text-[#8E9299] italic">Showing first 50 of {previewData.length} records</p>
              )}
            </div>
          )}

          {step === 'importing' && (
            <div className="py-12 flex flex-col items-center justify-center gap-6">
              <div className="relative">
                <Loader2 className="w-16 h-16 text-[#1061E3] animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center font-bold text-[#1061E3] text-sm">
                  {Math.round((importProgress / previewData.length) * 100)}%
                </div>
              </div>
              <div className="text-center">
                <h4 className="font-bold text-lg text-[#1C1F23]">Importing Tickets...</h4>
                <p className="text-sm text-[#8E9299]">Creating tickets and linking companies</p>
                <div className="mt-4 w-64 h-2 bg-[#F0F2F5] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-[#1061E3]"
                    initial={{ width: 0 }}
                    animate={{ width: `${(importProgress / previewData.length) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-[#8E9299] mt-2">{importProgress} of {previewData.length} completed</p>
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
                <p className="text-sm text-[#8E9299]">Successfully imported {previewData.length} tickets.</p>
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
              className="px-6 py-2 text-sm font-semibold bg-[#1061E3] text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              Import {previewData.length} Tickets
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
