'use client';

import React, { useState, useRef } from 'react';
import { X, Paperclip, Send, Trash2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/hooks/AuthContext';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { getStorageClient } from '@/lib/firebase';

interface EmailModalProps {
  contact: any;
  onClose: () => void;
}

interface UploadedAttachment {
  name: string;
  url: string;
  storagePath: string;
  size: number;
}

export default function EmailModal({ contact, onClose }: EmailModalProps) {
  const { profile } = useAuth();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [filename: string]: number }>({});
  const [uploadTasks, setUploadTasks] = useState<{ [filename: string]: any }>({});
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!contact) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selectedFiles = Array.from(e.target.files);

    selectedFiles.forEach(file => {
      // Avoid duplicate uploads of the same filename currently active or uploaded
      if (uploadProgress[file.name] !== undefined || attachments.some(a => a.name === file.name)) {
        return;
      }

      const storage = getStorageClient();
      const uniqueName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const storageRef = ref(storage, `email_attachments/${contact.id}/${uniqueName}`);
      
      const uploadTask = uploadBytesResumable(storageRef, file);

      setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
      setUploadTasks(prev => ({ ...prev, [file.name]: uploadTask }));

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setUploadProgress(prev => ({ ...prev, [file.name]: progress }));
        },
        (error) => {
          // If the user cancelled it manually, ignore showing error alert
          if (error.code === 'storage/canceled') {
            return;
          }
          console.error('File upload failed:', error);
          alert(`Failed to upload ${file.name}: ${error.message}`);
          setUploadProgress(prev => {
            const next = { ...prev };
            delete next[file.name];
            return next;
          });
          setUploadTasks(prev => {
            const next = { ...prev };
            delete next[file.name];
            return next;
          });
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            setAttachments(prev => [
              ...prev,
              {
                name: file.name,
                url: downloadUrl,
                storagePath: uploadTask.snapshot.ref.fullPath,
                size: file.size,
              }
            ]);
          } catch (err: any) {
            console.error('Failed to get download URL:', err);
            alert(`Error securing download link for ${file.name}`);
          } finally {
            setUploadProgress(prev => {
              const next = { ...prev };
              delete next[file.name];
              return next;
            });
            setUploadTasks(prev => {
              const next = { ...prev };
              delete next[file.name];
              return next;
            });
          }
        }
      );
    });

    // Reset input so the same file can be selected again if removed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = async (index: number) => {
    const att = attachments[index];
    // Optimistic UI delete
    setAttachments(prev => prev.filter((_, i) => i !== index));
    
    try {
      const storage = getStorageClient();
      const storageRef = ref(storage, att.storagePath);
      await deleteObject(storageRef);
    } catch (err) {
      console.error('Failed to delete file from storage:', err);
    }
  };

  const cancelUpload = (filename: string) => {
    const task = uploadTasks[filename];
    if (task) {
      task.cancel();
    }
    setUploadProgress(prev => {
      const next = { ...prev };
      delete next[filename];
      return next;
    });
    setUploadTasks(prev => {
      const next = { ...prev };
      delete next[filename];
      return next;
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(uploadProgress).length > 0) {
      alert('Please wait for all file uploads to finish before sending.');
      return;
    }
    setIsSending(true);
    
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contactId: contact.id,
          to: contact.email,
          subject,
          body,
          senderName: profile?.name || '',
          senderEmail: profile?.email || '',
          attachments: attachments.map(a => ({ name: a.name, url: a.url })),
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to send email');
      }

      setIsSending(false);
      alert(`Email sent to ${contact.email} and logged in CRM!`);
      onClose();
    } catch (err: any) {
      console.error('Failed to send email:', err);
      alert(`Error sending email: ${err.message}`);
      setIsSending(false);
    }
  };

  const isUploading = Object.keys(uploadProgress).length > 0;

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
              {(attachments.length > 0 || isUploading) && (
                <div className="flex flex-col gap-2 mt-2">
                  <span className="text-sm font-semibold text-[#4A4D53]">Attachments</span>
                  <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {/* Active Uploads */}
                    {Object.entries(uploadProgress).map(([filename, progress]) => (
                      <div key={filename} className="flex items-center justify-between bg-blue-50/60 px-3 py-2 rounded-lg text-xs border border-blue-100 animate-pulse">
                        <div className="flex items-center gap-2 min-w-0">
                          <Loader2 className="w-3.5 h-3.5 text-[#1061E3] animate-spin shrink-0" />
                          <span className="text-[#1061E3] font-medium truncate max-w-[280px]" title={filename}>{filename}</span>
                          <span className="text-[10px] text-blue-500 font-bold shrink-0">Uploading ({progress}%)</span>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => cancelUpload(filename)}
                          className="text-red-500 hover:text-red-700 text-[11px] font-bold hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    ))}

                    {/* Completed Uploads */}
                    {attachments.map((att, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-[#F9FAFB] px-3 py-2 rounded-lg text-xs border border-[#E2E4E9] hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="w-3.5 h-3.5 text-[#8E9299] shrink-0" />
                          <span className="text-[#1C1F23] font-medium truncate max-w-[320px]" title={att.name}>{att.name}</span>
                          <span className="text-[10px] text-[#8E9299] shrink-0">({(att.size / 1024 / 1024).toFixed(2)} MB)</span>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => removeAttachment(idx)}
                          className="p-1 text-[#8E9299] hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="Remove attachment"
                        >
                          <Trash2 className="w-4 h-4" />
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
                  disabled={isSending || isUploading}
                  className="px-6 py-2 rounded-md text-sm font-semibold bg-[#1061E3] text-white hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {isSending ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {isSending ? 'Sending...' : isUploading ? 'Uploading Files...' : 'Send Email'}
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
