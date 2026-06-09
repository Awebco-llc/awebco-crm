'use client';

import React, { useState } from 'react';
import { Mail, Send, MessageSquare, Trash2, Calendar, CornerUpLeft, ChevronDown, ChevronUp, Paperclip, Download } from 'lucide-react';
import { ContactActivity, TeamMember } from './Shared';
import { createActivity, deleteActivity } from '@/lib/crmStore';

interface ContactTimelinePaneProps {
  contactId: string;
  activities: ContactActivity[];
  contactName: string;
  contactEmail: string;
  currentTeamMember: TeamMember | undefined;
  onSendEmailClick?: () => void;
}

export default function ContactTimelinePane({
  contactId,
  activities,
  contactName,
  contactEmail,
  currentTeamMember,
  onSendEmailClick,
}: ContactTimelinePaneProps) {
  const [noteText, setNoteText] = useState('');
  const [replyText, setReplyText] = useState('');
  const [showSimulator, setShowSimulator] = useState(false);
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());

  const handleDownloadFileDirectly = async (e: React.MouseEvent, url: string, filename: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Failed to download file:', err);
      window.open(url, '_blank');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedActivities(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
    if (['pdf'].includes(ext)) return '📄';
    if (['doc', 'docx'].includes(ext)) return '📝';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
    if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
    if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return '🎥';
    if (['mp3', 'wav', 'ogg'].includes(ext)) return '🎵';
    return '📎';
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;

    setIsSubmittingNote(true);
    try {
      await createActivity({
        contactId,
        type: 'note',
        body: noteText.trim(),
        senderEmail: currentTeamMember?.email || 'staff@awebco.com',
        recipientEmail: '',
        authorName: currentTeamMember?.name || 'Staff Member',
        timestamp: new Date().toISOString()
      });
      setNoteText('');
    } catch (err) {
      console.error('Failed to log note:', err);
      alert('Failed to log note to Firestore.');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleSimulateReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    setIsSimulating(true);
    try {
      const response = await fetch('/api/email/inbound', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: `${contactName} <${contactEmail}>`,
          recipient: `inbound+${contactId}@awebco-crm.com`,
          subject: 'Re: Follow up',
          body: replyText.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Simulation endpoint returned error');
      }

      setReplyText('');
      setShowSimulator(false);
    } catch (err) {
      console.error('Simulation failed:', err);
      alert('Failed to simulate reply. Make sure Next.js dev server is running.');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleDelete = async (activityId: string) => {
    if (confirm('Are you sure you want to delete this activity log?')) {
      try {
        await deleteActivity(activityId);
      } catch (err) {
        console.error('Failed to delete activity:', err);
        alert('Failed to delete activity from database.');
      }
    }
  };

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch (e) {
      return isoString;
    }
  };

  return (
    <div className="w-full flex flex-col h-full bg-[#F8FAFC] border-l border-[#E2E4E9] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-[#E2E4E9] flex items-center justify-between shrink-0">
        <div>
          <h4 className="font-bold text-sm text-[#1C1F23] uppercase tracking-wider">
            Activity Timeline
          </h4>
          <p className="text-xs text-[#8E9299]">Log notes, sent emails, and replies</p>
        </div>
        <div className="flex items-center gap-2">
          {onSendEmailClick && (
            <button
              type="button"
              onClick={onSendEmailClick}
              className="text-xs font-semibold text-white bg-[#1061E3] hover:bg-blue-700 px-3 py-1.5 rounded-md border border-blue-700 transition-colors flex items-center gap-1"
            >
              <Mail className="w-3.5 h-3.5" />
              Send Email
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSimulator(prev => !prev)}
            className="text-xs font-semibold text-[#1061E3] hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md border border-blue-200 transition-colors flex items-center gap-1"
          >
            <CornerUpLeft className="w-3.5 h-3.5" />
            Simulate Reply
          </button>
        </div>
      </div>

      {/* Simulator Modal Form */}
      {showSimulator && (
        <div className="bg-[#FFF9E6] border-b border-[#FFE082] p-4 shrink-0">
          <form onSubmit={handleSimulateReply} className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#B7791F] uppercase tracking-wide flex items-center gap-1.5">
                <CornerUpLeft className="w-4 h-4" />
                Reply Simulator (Simulates Customer Inbound Webhook)
              </span>
              <button 
                type="button" 
                onClick={() => setShowSimulator(false)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-[#8E9299]">
              This simulates the customer replying to your email address. It hits `/api/email/inbound` and links the email back to the contact in real-time.
            </p>
            <div className="flex gap-2">
              <input
                required
                type="text"
                placeholder={`Type reply from ${contactName}...`}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                className="flex-grow px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="submit"
                disabled={isSimulating}
                className="px-4 py-2 bg-[#D97706] hover:bg-amber-700 text-white rounded-md text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {isSimulating ? 'Sending...' : 'Mock Send'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Note Creator Form */}
      <div className="p-4 bg-white border-b border-[#E2E4E9] shrink-0">
        <form onSubmit={handleAddNote} className="flex flex-col gap-2">
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Write an internal activity note..."
            className="w-full min-h-[70px] px-3 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] resize-y"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmittingNote || !noteText.trim()}
              className="px-4 py-1.5 bg-[#1061E3] hover:bg-blue-700 text-white rounded-md text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmittingNote ? 'Saving...' : 'Add Note'}
            </button>
          </div>
        </form>
      </div>

      {/* Activity Timeline List */}
      <div className="flex-grow overflow-y-auto p-6 space-y-6">
        {activities.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-[#8E9299] p-8">
            <Calendar className="w-8 h-8 text-gray-300 mb-2" />
            <p className="text-sm font-medium">No activity logged yet.</p>
            <p className="text-xs">Emails sent from this CRM and custom notes will appear here.</p>
          </div>
        ) : (
          <div className="relative border-l-2 border-gray-200 ml-3 pl-6 space-y-6">
            {activities.map((act) => {
              // Determine card theme based on type
              let iconElement = <MessageSquare className="w-3.5 h-3.5" />;
              let badgeColor = 'bg-gray-100 text-gray-600 border-gray-200';
              let title = 'Activity Log';

              if (act.type === 'email_sent') {
                iconElement = <Send className="w-3.5 h-3.5 text-blue-600" />;
                badgeColor = 'bg-blue-50 text-blue-700 border-blue-100';
                title = `Sent Email to ${act.recipientEmail}`;
              } else if (act.type === 'email_received') {
                iconElement = <Mail className="w-3.5 h-3.5 text-emerald-600" />;
                badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                title = `Received Email from ${act.senderEmail}`;
              } else if (act.type === 'note') {
                iconElement = <MessageSquare className="w-3.5 h-3.5 text-amber-600" />;
                badgeColor = 'bg-amber-50 text-amber-700 border-amber-100';
                title = `Internal Note by ${act.authorName || 'Staff'}`;
              }

              return (
                <div key={act.id} className="relative group">
                  {/* Timeline dot */}
                  <span className={`absolute -left-[35px] top-1.5 w-6 h-6 rounded-full border flex items-center justify-center ${badgeColor} shadow-sm z-10`}>
                    {iconElement}
                  </span>

                  {/* Card Content */}
                  <div className="bg-white border border-[#E2E4E9] rounded-lg shadow-xs p-4 hover:shadow-sm transition-all relative">
                    {/* Trash Delete action on hover */}
                    <button
                      type="button"
                      onClick={() => handleDelete(act.id)}
                      className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 text-[#8E9299] hover:text-red-500 transition-opacity p-1"
                      title="Delete activity log"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between pr-6">
                        <span className="text-xs font-bold text-[#1C1F23] truncate">
                          {title}
                        </span>
                        <span className="text-[10px] text-[#8E9299]">
                          {formatTimestamp(act.timestamp)}
                        </span>
                      </div>
                      
                      {act.subject && (
                        <div className="text-xs font-semibold text-[#4A4D53] border-b border-gray-100 pb-1 mt-0.5">
                          Subject: {act.subject}
                        </div>
                      )}

                      {/* Email / Note Body */}
                      {act.body && (() => {
                        const isExpanded = expandedActivities.has(act.id);
                        const isLong = act.body.length > 240;
                        return (
                          <div>
                            <p
                              className="text-xs text-[#4A4D53] whitespace-pre-wrap break-words leading-relaxed mt-1"
                              style={!isExpanded && isLong ? {
                                display: '-webkit-box',
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              } : {}}
                            >
                              {act.body}
                            </p>
                            {isLong && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(act.id)}
                                className="mt-1 flex items-center gap-0.5 text-[10px] font-semibold text-[#1061E3] hover:text-blue-700 transition-colors"
                              >
                                {isExpanded ? (
                                  <><ChevronUp className="w-3 h-3" /> Show less</>
                                ) : (
                                  <><ChevronDown className="w-3 h-3" /> Show more</>
                                )}
                              </button>
                            )}
                          </div>
                        );
                      })()}

                      {/* Attachments */}
                      {act.attachments && act.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5 pt-1.5 border-t border-gray-100">
                          {act.attachments.map((att, idx) => (
                            <div
                              key={idx}
                              className="inline-flex items-center bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-md text-[10px] font-medium text-[#4A4D53] transition-all max-w-[200px]"
                            >
                              <a
                                href={att.downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 hover:text-[#1061E3] hover:bg-blue-50/40 rounded-l-md truncate"
                                title={`View ${att.name}`}
                              >
                                <span className="shrink-0">{getFileIcon(att.name)}</span>
                                <span className="truncate max-w-[120px]">{att.name}</span>
                              </a>
                              <button
                                type="button"
                                onClick={(e) => handleDownloadFileDirectly(e, att.downloadUrl, att.name)}
                                className="p-1 hover:bg-blue-50 text-[#8E9299] hover:text-[#1061E3] rounded-r-md transition-colors border-l border-gray-200 shrink-0"
                                title={`Download ${att.name}`}
                              >
                                <Download className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
