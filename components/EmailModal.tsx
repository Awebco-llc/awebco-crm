'use client';

import React, { useState, useRef } from 'react';
import { X, Paperclip, Send, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface EmailModalProps {
  contact: any;
  onClose: () => void;
}

export default function EmailModal({ contact, onClose }: EmailModalProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!contact) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
    // Reset input so the same file can be selected again if removed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    
    // Simulate network request
    setTimeout(() => {
      setIsSending(false);
      alert(`Email sent to ${contact.email}!`);
      onClose();
    }, 1000);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-[#E2E4E9] flex items-center justify-between bg-[#F9FAFB]">
            <h3 className="font-bold text-lg text-[#1C1F23]">
              Compose Email
            </h3>
            <button onClick={onClose} className="text-[#8E9299] hover:text-[#1C1F23] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSend} className="flex flex-col flex-grow">
            <div className="p-6 flex flex-col gap-4">
              {/* To Field */}
              <div>
                <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">To</label>
                <div className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm bg-gray-50 text-gray-700 flex items-center gap-2">
                  <span className="font-medium">{contact.firstName} {contact.lastName}</span>
                  <span className="text-gray-400">&lt;{contact.email}&gt;</span>
                </div>
              </div>

              {/* Subject Field */}
              <div>
                <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Subject</label>
                <input 
                  required
                  type="text" 
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3]"
                  placeholder="Email subject..."
                />
              </div>

              {/* Body Field */}
              <div className="flex-grow flex flex-col">
                <label className="block text-sm font-semibold text-[#4A4D53] mb-1.5">Message</label>
                <textarea 
                  required
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  className="w-full flex-grow min-h-[200px] px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] resize-y"
                  placeholder="Type your message here..."
                />
              </div>

              {/* Attachments List */}
              {files.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  <span className="text-sm font-semibold text-[#4A4D53]">Attachments ({files.length})</span>
                  <div className="flex flex-wrap gap-2">
                    {files.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-[#F0F2F5] px-3 py-1.5 rounded-md text-sm border border-[#E2E4E9]">
                        <Paperclip className="w-3.5 h-3.5 text-[#8E9299]" />
                        <span className="text-[#1C1F23] max-w-[200px] truncate">{file.name}</span>
                        <span className="text-[#8E9299] text-xs">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                        <button 
                          type="button" 
                          onClick={() => removeFile(idx)}
                          className="ml-1 text-[#8E9299] hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t border-[#E2E4E9] bg-[#F9FAFB] flex items-center justify-between">
              <div>
                <input 
                  type="file" 
                  multiple 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-md text-sm font-semibold text-[#4A4D53] border border-[#E2E4E9] bg-white hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <Paperclip className="w-4 h-4" />
                  Attach Files
                </button>
              </div>
              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-md text-sm font-semibold text-[#4A4D53] hover:bg-[#F0F2F5] transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSending}
                  className="px-6 py-2 rounded-md text-sm font-semibold bg-[#1061E3] text-white hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSending ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {isSending ? 'Sending...' : 'Send Email'}
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
