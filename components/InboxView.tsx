'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { TeamMember } from './Shared';
import { Search, Send, ExternalLink } from 'lucide-react';
import { createMessage, markMessageAsRead } from '@/lib/crmStore';

interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  timestamp: string;
  read: boolean;
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

  // Auto select first user if none selected
  useEffect(() => {
    if (!selectedUserId && teamMembers.length > 0 && currentUserId) {
      const firstOtherUser = teamMembers.find(m => m.id !== currentUserId);
      if (firstOtherUser) {
        // Just setting it on initial mount when null
        setTimeout(() => setSelectedUserId(firstOtherUser.id), 0);
      }
    }
  }, [teamMembers, currentUserId, selectedUserId]);

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
    return teamMembers
      .filter(m => m.id !== currentUserId)
      .filter(m => 
        m.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (m.email && m.email.toLowerCase().includes(searchQuery.toLowerCase()))
      );
  }, [teamMembers, currentUserId, searchQuery]);

  const currentChatMessages = useMemo(() => {
    if (!currentUserId || !selectedUserId) return [];
    return messages
      .filter(m => 
        (m.senderId === currentUserId && m.receiverId === selectedUserId) ||
        (m.senderId === selectedUserId && m.receiverId === currentUserId)
      )
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [messages, currentUserId, selectedUserId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !currentUserId || !selectedUserId) return;

    try {
      await createMessage({
        senderId: currentUserId,
        receiverId: selectedUserId,
        text: inputText.trim(),
      });
      setInputText('');
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const selectedUser = teamMembers.find(m => m.id === selectedUserId);

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
                        {latestMessage.senderId === currentUserId ? 'You: ' : ''}{latestMessage.text}
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
                        <div className={`p-3 rounded-lg text-[13px] shadow-sm flex flex-col items-start ${
                          isMine 
                            ? 'bg-[#1061E3] text-white rounded-tr-none' 
                            : 'bg-white border border-[#E2E4E9] text-[#1C1F23] rounded-tl-none'
                        }`}>
                          <span>{displayText}</span>
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
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-4 bg-white border-t border-[#E2E4E9] shrink-0">
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <input 
                    type="text" 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={`Message ${selectedUser.name}...`}
                    className="flex-grow px-4 py-2.5 bg-[#F0F2F5] border-transparent focus:border-[#1061E3] focus:bg-white focus:ring-0 rounded-full text-sm transition-colors"
                  />
                  <button 
                    type="submit" 
                    disabled={!inputText.trim()}
                    className="w-10 h-10 rounded-full bg-[#1061E3] text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    <Send className="w-4 h-4 ml-1" />
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
