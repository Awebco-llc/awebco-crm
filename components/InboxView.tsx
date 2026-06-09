'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { TeamMember } from './Shared';
import { Search, Send, ExternalLink, Smile, Paperclip, X, Download, Copy, Check, Loader2, FileText } from 'lucide-react';
import { createMessage, markMessageAsRead, updateMessage } from '@/lib/crmStore';
import type { ChatAttachment } from '@/lib/crmStore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getStorageClient } from '@/lib/firebase';

interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  timestamp: string;
  read: boolean;
  reacts?: { [userId: string]: string };
  attachments?: ChatAttachment[];
}

function parseTaskLink(text: string) {
  const match = text.match(/\(task:([^:]+):([^)]+)\)/);
  if (match) {
    return {
      workspace: match[1],
      taskId: match[2],
      cleanText: text.replace(/\(task:[^:]+:[^)]+\)/, '').trim()
    };
  }
  return null;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function isImage(type: string) {
  return type.startsWith('image/');
}

/** Renders a single attachment: image thumbnail or file chip */
function AttachmentBubble({ attachment, isMine }: { attachment: ChatAttachment; isMine: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopyImage = useCallback(async () => {
    try {
      const response = await fetch(attachment.url);
      const blob = await response.blob();
      // Convert to PNG if necessary so ClipboardItem accepts it
      let pngBlob = blob;
      if (blob.type !== 'image/png') {
        const imageBitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(imageBitmap, 0, 0);
        pngBlob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy image:', err);
    }
  }, [attachment.url]);

  if (isImage(attachment.type)) {
    return (
      <div className="relative group/att mt-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-w-[240px] rounded-lg border border-black/10 cursor-pointer object-cover shadow-sm"
          onClick={() => window.open(attachment.url, '_blank')}
        />
        {/* Hover overlay actions */}
        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover/att:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={handleCopyImage}
            title="Copy image to clipboard"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold shadow bg-black/60 hover:bg-black/80 text-white transition-colors"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <a
            href={attachment.url}
            download={attachment.name}
            target="_blank"
            rel="noreferrer"
            title="Download"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold shadow bg-black/60 hover:bg-black/80 text-white transition-colors"
          >
            <Download className="w-3 h-3" />
          </a>
        </div>
      </div>
    );
  }

  // Non-image file chip
  return (
    <a
      href={attachment.url}
      download={attachment.name}
      target="_blank"
      rel="noreferrer"
      className={`mt-1.5 flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors max-w-[240px] ${
        isMine
          ? 'bg-white/15 hover:bg-white/25 border-white/20 text-white'
          : 'bg-gray-50 hover:bg-gray-100 border-[#E2E4E9] text-[#1C1F23]'
      }`}
    >
      <FileText className="w-5 h-5 shrink-0 opacity-80" />
      <div className="flex-grow min-w-0">
        <div className="text-xs font-semibold truncate">{attachment.name}</div>
        <div className={`text-[10px] ${isMine ? 'text-white/70' : 'text-[#8E9299]'}`}>{formatSize(attachment.size)}</div>
      </div>
      <Download className="w-4 h-4 shrink-0 opacity-70" />
    </a>
  );
}

export default function InboxView({ 
  teamMembers, 
  currentUserId,
  messages,
  onNavigateTask
}: { 
  teamMembers: TeamMember[], 
  currentUserId: string | undefined,
  messages: ChatMessage[],
  onNavigateTask?: (workspace: string, taskId: string) => void
}) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);

  // File attachment state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [name: string]: number }>({});
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('.reaction-trigger-btn') || target.closest('.reaction-picker-container'))) {
        return;
      }
      setActiveReactionPickerId(null);
    };
    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, []);

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!currentUserId) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    const currentReacts = msg.reacts || {};
    const updatedReacts = { ...currentReacts };
    if (updatedReacts[currentUserId] === emoji) {
      delete updatedReacts[currentUserId];
    } else {
      updatedReacts[currentUserId] = emoji;
    }
    try {
      await updateMessage(messageId, { reacts: updatedReacts });
    } catch (err) {
      console.error('Failed to toggle message reaction:', err);
    }
  };

  // Auto select last selected user or fallback to first user if none selected
  useEffect(() => {
    if (!selectedUserId && teamMembers.length > 0 && currentUserId) {
      const stored = localStorage.getItem(`lastInboxChatUserId_${currentUserId}`);
      if (stored && teamMembers.some(m => m.id === stored && m.id !== currentUserId)) {
        setTimeout(() => setSelectedUserId(stored), 0);
      } else {
        const firstOtherUser = teamMembers.find(m => m.id !== currentUserId);
        if (firstOtherUser) {
          setTimeout(() => setSelectedUserId(firstOtherUser.id), 0);
        }
      }
    }
  }, [teamMembers, currentUserId, selectedUserId]);

  // Save selected chat to memory whenever it changes
  useEffect(() => {
    if (selectedUserId && currentUserId) {
      localStorage.setItem(`lastInboxChatUserId_${currentUserId}`, selectedUserId);
    }
  }, [selectedUserId, currentUserId]);

  // Mark messages from the selected user as read when the chat is active
  useEffect(() => {
    if (!currentUserId || !selectedUserId) return;
    const unreadFromSelected = messages.filter(
      (m) => m.senderId === selectedUserId && m.receiverId === currentUserId && !m.read
    );
    if (unreadFromSelected.length > 0) {
      unreadFromSelected.forEach((msg) => {
        markMessageAsRead(msg.id).catch((err) =>
          console.error('Failed to mark message as read', err)
        );
      });
    }
  }, [messages, currentUserId, selectedUserId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedUserId]);

  const otherTeamMembers = useMemo(() => {
    const filtered = teamMembers
      .filter(m => m.id !== currentUserId)
      .filter(m => 
        m.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (m.email && m.email.toLowerCase().includes(searchQuery.toLowerCase()))
      );

    // Precompute the latest message timestamp for each member
    const latestTimestampMap: { [memberId: string]: number } = {};
    messages.forEach(msg => {
      const otherId = msg.senderId === currentUserId ? msg.receiverId : (msg.receiverId === currentUserId ? msg.senderId : null);
      if (otherId) {
        const time = new Date(msg.timestamp).getTime();
        if (!latestTimestampMap[otherId] || time > latestTimestampMap[otherId]) {
          latestTimestampMap[otherId] = time;
        }
      }
    });

    return [...filtered].sort((a, b) => {
      const timeA = latestTimestampMap[a.id] || 0;
      const timeB = latestTimestampMap[b.id] || 0;

      if (timeA !== timeB) {
        return timeB - timeA; // Descending (most recent first)
      }

      const nameA = a.name || '';
      const nameB = b.name || '';
      return nameA.localeCompare(nameB);
    });
  }, [teamMembers, currentUserId, searchQuery, messages]);

  const currentChatMessages = useMemo(() => {
    if (!currentUserId || !selectedUserId) return [];
    return messages
      .filter(m => 
        (m.senderId === currentUserId && m.receiverId === selectedUserId) ||
        (m.senderId === selectedUserId && m.receiverId === currentUserId)
      )
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [messages, currentUserId, selectedUserId]);

  // --- File handling ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setPendingFiles(prev => [...prev, ...files]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (files: File[]): Promise<ChatAttachment[]> => {
    const storage = getStorageClient();
    const results: ChatAttachment[] = [];

    await Promise.all(
      files.map(
        (file) =>
          new Promise<void>((resolve, reject) => {
            const uniqueName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const storageRef = ref(storage, `chat-attachments/${currentUserId}/${uniqueName}`);
            const task = uploadBytesResumable(storageRef, file);

            setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

            task.on(
              'state_changed',
              (snap) => {
                const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
                setUploadProgress(prev => ({ ...prev, [file.name]: pct }));
              },
              (err) => {
                console.error('Upload error:', err);
                setUploadProgress(prev => { const n = { ...prev }; delete n[file.name]; return n; });
                reject(err);
              },
              async () => {
                const url = await getDownloadURL(task.snapshot.ref);
                results.push({
                  url,
                  name: file.name,
                  type: file.type || 'application/octet-stream',
                  size: file.size,
                  storagePath: task.snapshot.ref.fullPath,
                });
                setUploadProgress(prev => { const n = { ...prev }; delete n[file.name]; return n; });
                resolve();
              }
            );
          })
      )
    );

    return results;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasText = inputText.trim().length > 0;
    const hasFiles = pendingFiles.length > 0;
    if (!hasText && !hasFiles) return;
    if (!currentUserId || !selectedUserId) return;

    setIsUploading(true);
    try {
      let attachments: ChatAttachment[] = [];
      if (hasFiles) {
        attachments = await uploadFiles(pendingFiles);
        setPendingFiles([]);
      }

      await createMessage({
        senderId: currentUserId,
        receiverId: selectedUserId,
        text: inputText.trim(),
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setInputText('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsUploading(false);
    }
  };

  /** Preview text shown in sidebar for latest message */
  function getPreviewText(msg: ChatMessage, meId: string): string {
    const prefix = msg.senderId === meId ? 'You: ' : '';
    if (msg.text) return prefix + msg.text;
    if (msg.attachments && msg.attachments.length > 0) {
      return prefix + `📎 ${msg.attachments.length > 1 ? `${msg.attachments.length} attachments` : 'Attachment'}`;
    }
    return '';
  }

  const selectedUser = teamMembers.find(m => m.id === selectedUserId);
  const canSend = (inputText.trim().length > 0 || pendingFiles.length > 0) && !isUploading;

  if (!currentUserId) {
    return (
      <div className="flex-grow flex items-center justify-center bg-gray-50 absolute inset-0">
        <div className="p-8 bg-white rounded-lg border border-[#E2E4E9] text-center max-w-sm">
          <h2 className="text-xl font-bold text-[#1C1F23] mb-2">No Matching Profile</h2>
          <p className="text-sm text-[#8E9299]">
            Your email doesn&apos;t match any team member in the system. Contact an admin to add you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-grow overflow-hidden absolute inset-0 bg-[#F9FAFB]">
      <header className="h-16 bg-white border-b border-[#E2E4E9] flex items-center px-6 shrink-0">
        <h1 className="text-xl font-bold text-[#1C1F23]">Inbox</h1>
      </header>

      <div className="flex flex-grow overflow-hidden">
        {/* Sidebar */}
        <div className="w-[300px] bg-white border-r border-[#E2E4E9] flex flex-col shrink-0">
          <div className="p-4 border-b border-[#E2E4E9]">
            <div className="bg-[#F0F2F5] rounded-md px-3 py-2 flex items-center gap-2 focus-within:ring-2 focus-within:ring-[#1061E3] transition-shadow">
              <Search className="w-4 h-4 text-[#8E9299]" />
              <input 
                type="text"
                placeholder="Search team members..."
                className="bg-transparent border-none outline-none text-sm w-full text-[#1C1F23] placeholder:text-[#8E9299]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-grow overflow-y-auto">
            {otherTeamMembers.map(member => {
              const latestMessage = messages
                .filter(m => (m.senderId === currentUserId && m.receiverId === member.id) || (m.senderId === member.id && m.receiverId === currentUserId))
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

              const isSelected = selectedUserId === member.id;

              return (
                <div 
                  key={member.id}
                  onClick={() => setSelectedUserId(member.id)}
                  className={`p-4 border-b border-[#F0F2F5] cursor-pointer hover:bg-gray-50 transition-colors flex items-center gap-3 ${isSelected ? 'bg-[#F0F7FF] border-l-4 border-l-[#1061E3]' : 'border-l-4 border-l-transparent'}`}
                >
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: member.color || '#ccc' }}
                  >
                    {member.initials}
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className={`text-sm font-semibold truncate ${isSelected ? 'text-[#1061E3]' : 'text-[#1C1F23]'}`}>
                        {member.name}
                      </h4>
                      {messages.some(m => m.senderId === member.id && m.receiverId === currentUserId && !m.read) && (
                        <span className="w-2 h-2 bg-[#1061E3] rounded-full shrink-0" />
                      )}
                    </div>
                    {latestMessage && (
                      <p className="text-xs text-[#8E9299] truncate">
                        {getPreviewText(latestMessage, currentUserId)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-grow flex flex-col bg-[#F9FAFB]">
          {selectedUser ? (
            <>
              {/* Chat Header */}
              <div className="p-4 bg-white border-b border-[#E2E4E9] flex items-center gap-3 shrink-0">
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                  style={{ backgroundColor: selectedUser.color || '#ccc' }}
                >
                  {selectedUser.initials}
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#1C1F23]">{selectedUser.name}</h3>
                  <p className="text-xs text-[#8E9299]">Team Member</p>
                </div>
              </div>

              {/* Messages List */}
              <div className="flex-grow overflow-y-auto p-6 flex flex-col gap-4">
                {currentChatMessages.length === 0 ? (
                  <div className="flex-grow flex items-center justify-center text-[#8E9299] text-sm italic">
                    No messages yet. Start the conversation!
                  </div>
                ) : (
                  currentChatMessages.map((msg, index) => {
                    const isMine = msg.senderId === currentUserId;
                    const showAvatar = index === 0 || currentChatMessages[index - 1].senderId !== msg.senderId;
                    
                    const parsed = parseTaskLink(msg.text);
                    const displayText = parsed ? parsed.cleanText : msg.text;
                    
                    const currentReacts = msg.reacts || {};
                    const reactionGroupsMap: { [emoji: string]: { users: string[]; userNames: string[] } } = {};
                    Object.entries(currentReacts).forEach(([uid, emoji]) => {
                      if (!reactionGroupsMap[emoji]) {
                        reactionGroupsMap[emoji] = { users: [], userNames: [] };
                      }
                      reactionGroupsMap[emoji].users.push(uid);
                      const userName = teamMembers.find(t => t.id === uid)?.name || 'Unknown';
                      reactionGroupsMap[emoji].userNames.push(userName);
                    });
                    const reactionGroups = Object.entries(reactionGroupsMap).map(([emoji, data]) => ({
                      emoji,
                      count: data.users.length,
                      users: data.users,
                      userNames: data.userNames,
                      hasReacted: currentUserId ? data.users.includes(currentUserId) : false,
                    }));

                    return (
                      <div key={msg.id} className={`flex gap-3 max-w-[70%] ${isMine ? 'self-end flex-row-reverse' : 'self-start'}`}>
                        {showAvatar ? (
                          <div 
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm"
                            style={{ 
                              backgroundColor: isMine 
                                ? (teamMembers.find(m => m.id === currentUserId)?.color || '#1061E3') 
                                : (selectedUser.color || '#ccc') 
                            }}
                          >
                            {isMine ? (teamMembers.find(m => m.id === currentUserId)?.initials || 'ME') : selectedUser.initials}
                          </div>
                        ) : (
                          <div className="w-8 shrink-0"></div>
                        )}
                        <div className={`relative group/msg flex items-center gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className="flex flex-col">
                            {/* Message bubble — only shown if there's text or a task link */}
                            {(displayText || (parsed && onNavigateTask)) && (
                              <div className={`p-3 rounded-lg text-[13px] shadow-sm flex flex-col items-start ${
                                isMine 
                                  ? 'bg-[#1061E3] text-white rounded-tr-none' 
                                  : 'bg-white border border-[#E2E4E9] text-[#1C1F23] rounded-tl-none'
                              }`}>
                                {displayText && <span>{displayText}</span>}
                                {parsed && onNavigateTask && (
                                  <button
                                    type="button"
                                    onClick={() => onNavigateTask(parsed.workspace, parsed.taskId)}
                                    className={`mt-2 px-2.5 py-1.5 rounded text-xs font-bold flex items-center gap-1 transition-colors ${
                                      isMine
                                        ? 'bg-white/20 hover:bg-white/30 text-white'
                                        : 'bg-[#1061E3] hover:bg-blue-700 text-white shadow-sm'
                                    }`}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    View {parsed.workspace === 'Deals / Sales' ? 'Deal' : 'Task'}
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Attachments */}
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className={`flex flex-col gap-1 ${isMine ? 'items-end' : 'items-start'}`}>
                                {msg.attachments.map((att, ai) => (
                                  <AttachmentBubble key={ai} attachment={att} isMine={isMine} />
                                ))}
                              </div>
                            )}
                            
                            {/* Reactions Display */}
                            {reactionGroups.length > 0 && (
                              <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                                {reactionGroups.map(({ emoji, count, userNames, hasReacted }) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleReaction(msg.id, emoji);
                                    }}
                                    title={`Reacted by: ${userNames.join(', ')}`}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-all ${
                                      hasReacted 
                                        ? 'bg-blue-50 border-blue-200 text-blue-700' 
                                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                    }`}
                                  >
                                    <span>{emoji}</span>
                                    <span className="font-semibold text-[10px]">{count}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Hover Smile Trigger & Reaction Picker */}
                          <div className="opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center relative shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveReactionPickerId(activeReactionPickerId === msg.id ? null : msg.id);
                              }}
                              className="reaction-trigger-btn p-1 hover:bg-[#F0F2F5] rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                              title="Add reaction"
                            >
                              <Smile className="w-4 h-4" />
                            </button>

                            {activeReactionPickerId === msg.id && (
                              <div 
                                onClick={(e) => e.stopPropagation()}
                                className={`reaction-picker-container absolute z-30 bottom-full mb-1 flex items-center gap-1.5 bg-white border border-[#E2E4E9] shadow-lg rounded-full px-2 py-1 ${
                                  isMine ? 'right-0' : 'left-0'
                                }`}
                              >
                                {['👍', '✅', '❤️', '😄'].map(emoji => {
                                  const hasReacted = currentReacts[currentUserId || ''] === emoji;
                                  return (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => {
                                        handleToggleReaction(msg.id, emoji);
                                        setActiveReactionPickerId(null);
                                      }}
                                      className={`text-base p-1 hover:scale-125 transition-transform rounded-full hover:bg-gray-50 leading-none ${
                                        hasReacted ? 'bg-blue-50' : ''
                                      }`}
                                    >
                                      {emoji}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <div className="bg-white border-t border-[#E2E4E9] shrink-0">
                {/* Pending file previews */}
                {pendingFiles.length > 0 && (
                  <div className="px-4 pt-3 flex flex-wrap gap-2">
                    {pendingFiles.map((file, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 bg-[#F0F2F5] border border-[#E2E4E9] rounded-lg px-2.5 py-1.5 max-w-[200px] group/pf"
                      >
                        {isImage(file.type) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="w-6 h-6 object-cover rounded shrink-0"
                          />
                        ) : (
                          <FileText className="w-4 h-4 text-[#8E9299] shrink-0" />
                        )}
                        <span className="text-xs text-[#1C1F23] truncate flex-grow">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removePendingFile(i)}
                          className="text-[#8E9299] hover:text-[#D32F2F] transition-colors shrink-0 ml-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload progress bars */}
                {Object.entries(uploadProgress).length > 0 && (
                  <div className="px-4 pt-2 flex flex-col gap-1.5">
                    {Object.entries(uploadProgress).map(([name, pct]) => (
                      <div key={name} className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 text-[#1061E3] animate-spin shrink-0" />
                        <div className="flex-grow min-w-0">
                          <div className="text-[11px] text-[#4A4D53] truncate mb-0.5">{name}</div>
                          <div className="h-1 bg-[#E3F2FD] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#1061E3] transition-all duration-200"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="p-4 flex items-center gap-2">
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {/* Paperclip button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach files"
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[#8E9299] hover:text-[#1061E3] hover:bg-[#F0F7FF] transition-colors shrink-0"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <input 
                    type="text" 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={`Message ${selectedUser.name}...`}
                    className="flex-grow px-4 py-2.5 bg-[#F0F2F5] border-transparent focus:border-[#1061E3] focus:bg-white focus:ring-0 rounded-full text-sm transition-colors"
                  />
                  <button 
                    type="submit" 
                    disabled={!canSend}
                    className="w-10 h-10 rounded-full bg-[#1061E3] text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 ml-1" />
                    )}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center text-[#8E9299]">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-500">Select a team member to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
