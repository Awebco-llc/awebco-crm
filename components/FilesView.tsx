import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { UploadCloud, File, Image as ImageIcon, X, FolderOpen, Folder, FolderPlus, ChevronRight, Search, Loader2, LayoutGrid, List, Trash2, ArrowRight } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { getStorageClient } from '@/lib/firebase';
import { subscribeFiles, saveFileMetadata, deleteFileMetadata, subscribeFolders, createFolder, deleteFolder, updateFileMetadata } from '@/lib/crmStore';
import { StorageFile } from '@/components/Shared';

export default function FilesView({ currentUserId }: { currentUserId?: string }) {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [sortBy, setSortBy] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('awebco_files_sort_by') || 'date_newest';
    }
    return 'date_newest';
  });

  useEffect(() => {
    localStorage.setItem('awebco_files_sort_by', sortBy);
  }, [sortBy]);

  const [activeMoveFile, setActiveMoveFile] = useState<StorageFile | null>(null);
  const [moveMenuPosition, setMoveMenuPosition] = useState({ top: 0, left: 0 });

  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('awebco_files_view_mode') as 'grid' | 'list') || 'grid';
    }
    return 'grid';
  });

  useEffect(() => {
    localStorage.setItem('awebco_files_view_mode', viewMode);
  }, [viewMode]);

  const [uploadProgress, setUploadProgress] = useState<{ [filename: string]: number }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatDate = (createdAt: any) => {
    if (!createdAt) return '—';
    let date: Date;
    if (typeof createdAt.toDate === 'function') {
      date = createdAt.toDate();
    } else if (createdAt instanceof Date) {
      date = createdAt;
    } else if (typeof createdAt === 'string' || typeof createdAt === 'number') {
      date = new Date(createdAt);
    } else if (createdAt.seconds) {
      date = new Date(createdAt.seconds * 1000);
    } else {
      return '—';
    }
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  useEffect(() => {
    const unsubFiles = subscribeFiles(setFiles, (err) => {
      console.error('Failed to subscribe to files', err);
    });
    const unsubFolders = subscribeFolders(setFolders, (err) => {
      console.error('Failed to subscribe to folders', err);
    });
    return () => {
      unsubFiles();
      unsubFolders();
    };
  }, []);

  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveMoveFile(null);
    };
    if (activeMoveFile) {
      document.addEventListener('click', handleGlobalClick);
      return () => document.removeEventListener('click', handleGlobalClick);
    }
  }, [activeMoveFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    
    Array.from(newFiles).forEach(file => {
      const storage = getStorageClient();
      const uniqueName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const userPath = currentUserId || 'anonymous';
      const storageRef = ref(storage, `uploads/${userPath}/${uniqueName}`);

      const uploadTask = uploadBytesResumable(storageRef, file);

      setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(prev => ({ ...prev, [file.name]: progress }));
        },
        (error) => {
          console.error('Upload failed:', error);
          setUploadProgress(prev => {
            const next = { ...prev };
            delete next[file.name];
            return next;
          });
        },
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          await saveFileMetadata({
            name: file.name,
            size: file.size,
            type: file.type,
            storagePath: uploadTask.snapshot.ref.fullPath,
            downloadUrl,
            uploadedBy: currentUserId || 'anonymous',
            folderId: currentFolderId || undefined,
          });
          setUploadProgress(prev => {
            const next = { ...prev };
            delete next[file.name];
            return next;
          });
        }
      );
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = async (id: string, storagePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Optimistic UI delete
    setFiles(prev => prev.filter(f => f.id !== id));
    
    try {
      const storage = getStorageClient();
      const storageRef = ref(storage, storagePath);
      await deleteObject(storageRef);
      await deleteFileMetadata(id);
    } catch (err) {
      console.error('Failed to delete file', err);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const isImage = (type: string) => type.startsWith('image/');
  const isPdf = (type: string, name: string) => {
    return type === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    try {
      await createFolder(trimmed);
      setIsCreatingFolder(false);
      setNewFolderName('');
    } catch (err) {
      console.error('Failed to create folder', err);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await deleteFolder(folderId);
      const filesInFolder = files.filter(f => f.folderId === folderId);
      for (const f of filesInFolder) {
        await updateFileMetadata(f.id, { folderId: null });
      }
    } catch (err) {
      console.error('Failed to delete folder', err);
    }
  };

  const filteredFiles = useMemo(() => {
    let list = files;
    if (searchQuery.trim() !== '') {
      list = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    } else {
      list = files.filter(f => {
        if (!currentFolderId) {
          return !f.folderId;
        }
        return f.folderId === currentFolderId;
      });
    }

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'date_newest': {
          const dateA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
          const dateB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
          return dateB - dateA;
        }
        case 'date_oldest': {
          const dateA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
          const dateB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
          return dateA - dateB;
        }
        case 'size_largest':
          return b.size - a.size;
        case 'size_smallest':
          return a.size - b.size;
        case 'type_asc':
          return (a.type || '').localeCompare(b.type || '');
        case 'type_desc':
          return (b.type || '').localeCompare(a.type || '');
        default:
          return 0;
      }
    });
  }, [files, searchQuery, currentFolderId, sortBy]);

  const moveDropdownMenu = activeMoveFile && typeof document !== 'undefined' ? createPortal(
    <div 
      className="absolute z-[9999] w-48 bg-white border border-[#E2E4E9] rounded-md shadow-lg overflow-hidden pb-1" 
      style={{ top: moveMenuPosition.top, left: moveMenuPosition.left }}
      onClick={e => e.stopPropagation()}
    >
      <div className="px-3 py-2 text-xs font-semibold text-[#8E9299] bg-[#F9FAFB] border-b border-[#E2E4E9]">
        Move to Folder
      </div>
      <div className="max-h-48 overflow-y-auto pt-1">
        {activeMoveFile.folderId && (
          <button
            className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-[#F0F2F5] transition-colors text-blue-600 font-semibold"
            onClick={async () => {
              await updateFileMetadata(activeMoveFile.id, { folderId: null });
              setActiveMoveFile(null);
            }}
          >
            <FolderOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>Root (All Files)</span>
          </button>
        )}
        {folders
          .filter(f => f.id !== activeMoveFile.folderId)
          .map(folder => (
            <button
              key={folder.id}
              className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-[#F0F2F5] transition-colors text-gray-700"
              onClick={async () => {
                await updateFileMetadata(activeMoveFile.id, { folderId: folder.id });
                setActiveMoveFile(null);
              }}
            >
              <Folder className="w-3.5 h-3.5 text-[#1061E3] shrink-0" />
              <span className="truncate">{folder.name}</span>
            </button>
          ))}
        {folders.filter(f => f.id !== activeMoveFile.folderId).length === 0 && !activeMoveFile.folderId && (
          <div className="px-3 py-2 text-xs text-[#8E9299] italic">
            No other folders available.
          </div>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="flex-grow flex flex-col overflow-hidden absolute inset-0 bg-[#F9FAFB]">
      <header className="h-16 bg-white border-b border-[#E2E4E9] flex items-center px-6 shrink-0">
        <h1 className="text-xl font-bold text-[#1C1F23]">Files & Media Library</h1>
      </header>

      <div className="flex-grow p-6 overflow-auto">
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors mb-8 ${
            isDragging 
              ? 'border-[#1061E3] bg-[#E3F2FD]' 
              : 'border-[#E2E4E9] bg-white hover:bg-gray-50'
          }`}
        >
          <UploadCloud className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-[#1061E3]' : 'text-[#8E9299]'}`} />
          <h3 className="text-lg font-semibold text-[#1C1F23] mb-2">Drag & Drop files here</h3>
          <p className="text-sm text-[#8E9299] mb-6">or click to browse from your computer</p>
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="bg-white border border-[#E2E4E9] text-[#1C1F23] px-4 py-2 rounded-md text-sm font-semibold hover:bg-gray-50 transition-colors shadow-sm"
          >
            Browse Files
          </button>
          <input 
            type="file" 
            multiple 
            ref={fileInputRef} 
            onChange={handleFileInputChange}
            className="hidden" 
          />
        </div>

        {/* Navigation Breadcrumbs / Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-[#E2E4E9] pb-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <button 
              onClick={() => setCurrentFolderId(null)}
              className="text-[#1061E3] hover:underline"
            >
              All Files
            </button>
            {currentFolderId && (
              <>
                <ChevronRight className="w-4 h-4 text-[#8E9299]" />
                <span className="text-[#1C1F23]">
                  {folders.find(f => f.id === currentFolderId)?.name || 'Folder'}
                </span>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {isCreatingFolder ? (
              <form onSubmit={handleCreateFolderSubmit} className="flex items-center gap-2">
                <input 
                  type="text"
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  className="px-2.5 py-1.5 border border-[#E2E4E9] rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#1061E3] w-40 bg-white"
                  required
                  autoFocus
                />
                <button 
                  type="submit"
                  className="bg-[#1061E3] text-white px-2.5 py-1.5 rounded-md text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  Create
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setIsCreatingFolder(false);
                    setNewFolderName('');
                  }}
                  className="bg-white border border-[#E2E4E9] text-[#1C1F23] px-2.5 py-1.5 rounded-md text-xs font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button 
                onClick={() => setIsCreatingFolder(true)}
                className="flex items-center gap-1.5 bg-white border border-[#E2E4E9] text-[#1C1F23] px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-gray-50 transition-colors shadow-sm"
              >
                <FolderPlus className="w-3.5 h-3.5 text-[#1061E3]" />
                New Folder
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#1C1F23]">
            {searchQuery.trim() !== '' 
              ? 'Search Results'
              : currentFolderId 
                ? `${folders.find(f => f.id === currentFolderId)?.name || 'Folder'} Files` 
                : 'Root Library'} ({filteredFiles.length})
          </h2>
          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-[#E2E4E9]">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white text-[#1061E3] shadow-sm'
                    : 'text-[#8E9299] hover:text-[#1C1F23]'
                }`}
                title="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white text-[#1061E3] shadow-sm'
                    : 'text-[#8E9299] hover:text-[#1C1F23]'
                }`}
                title="List view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 bg-white border border-[#E2E4E9] rounded-md px-2.5 py-1.5 text-xs font-semibold text-[#1C1F23] shadow-sm select-none">
              <span className="text-[#8E9299]">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent border-none cursor-pointer outline-none focus:ring-0 text-[#1C1F23] font-semibold"
              >
                <option value="date_newest">Newest Uploaded</option>
                <option value="date_oldest">Oldest Uploaded</option>
                <option value="name_asc">Name (A-Z)</option>
                <option value="name_desc">Name (Z-A)</option>
                <option value="size_largest">Size (Largest)</option>
                <option value="size_smallest">Size (Smallest)</option>
                <option value="type_asc">Type (A-Z)</option>
                <option value="type_desc">Type (Z-A)</option>
              </select>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8E9299]" />
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 border border-[#E2E4E9] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1061E3] w-64"
              />
            </div>
          </div>
        </div>
        
        {folders.length === 0 && filteredFiles.length === 0 ? (
          <div className="text-center py-12 text-[#8E9299] bg-white rounded-lg border border-[#E2E4E9]">
            {searchQuery ? (
              <>
                <Search className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p>No files match &quot;{searchQuery}&quot;.</p>
              </>
            ) : (
              <>
                <FolderOpen className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p>No files or folders here yet.</p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Folders Section (Only at Root and when not searching) */}
            {currentFolderId === null && searchQuery.trim() === '' && folders.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xs font-bold text-[#8E9299] uppercase tracking-wider mb-4">Folders ({folders.length})</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {folders.map(folder => (
                    <div 
                      key={folder.id} 
                      onClick={() => setCurrentFolderId(folder.id)}
                      className="group bg-white border border-[#E2E4E9] rounded-lg p-4 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer relative shadow-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Folder className="w-6 h-6 text-[#1061E3] shrink-0" />
                        <span className="text-sm font-semibold text-[#1C1F23] truncate" title={folder.name}>{folder.name}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete folder "${folder.name}"? Files inside will be moved to Root.`)) {
                            handleDeleteFolder(folder.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-[#8E9299] hover:text-[#D32F2F] hover:bg-red-50 rounded"
                        title="Delete Folder"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Files Section Title */}
            {currentFolderId === null && searchQuery.trim() === '' && folders.length > 0 && filteredFiles.length > 0 && (
              <h3 className="text-xs font-bold text-[#8E9299] uppercase tracking-wider mb-4">Files</h3>
            )}

            {filteredFiles.length === 0 ? (
              searchQuery.trim() !== '' && (
                <div className="text-center py-12 text-[#8E9299] bg-white rounded-lg border border-[#E2E4E9]">
                  <Search className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p>No files match &quot;{searchQuery}&quot;.</p>
                </div>
              )
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {filteredFiles.map(file => (
                  <div 
                    key={file.id} 
                    className="group relative bg-white border border-[#E2E4E9] rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer aspect-square flex flex-col"
                    onClick={() => window.open(file.downloadUrl, '_blank')}
                  >
                    <div className="h-2/3 bg-gray-50 border-b border-[#E2E4E9] flex items-center justify-center relative overflow-hidden">
                      {isImage(file.type) ? (
                        <div className="w-full h-full p-2 flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={file.downloadUrl} alt={file.name} className="w-full h-full object-cover rounded-sm" />
                        </div>
                      ) : isPdf(file.type, file.name) ? (
                        <div className="w-full h-full relative bg-white select-none pointer-events-none overflow-hidden">
                          <iframe 
                            src={`${file.downloadUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                            className="absolute border-none"
                            style={{
                              width: 'calc(100% + 17px)',
                              height: 'calc(100% + 17px)',
                              top: 0,
                              left: 0,
                              pointerEvents: 'none',
                            }}
                            scrolling="no"
                            loading="lazy"
                            title={file.name}
                          />
                          <div className="absolute inset-0 bg-transparent" />
                          <span className="absolute bottom-2 left-2 bg-[#D32F2F] text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                            PDF
                          </span>
                        </div>
                      ) : (
                        <div className="w-full h-full p-2 flex items-center justify-center">
                          <File className="w-12 h-12 text-[#8E9299]" />
                        </div>
                      )}
                      
                      {/* Grid Item hover actions */}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setMoveMenuPosition({
                            top: rect.bottom + window.scrollY + 4,
                            left: Math.max(10, rect.left + window.scrollX - 160),
                          });
                          setActiveMoveFile(file);
                        }}
                        className="absolute top-2 right-10 p-1.5 bg-black/50 hover:bg-black/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Move to Folder"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={(e) => removeFile(file.id, file.storagePath, e)}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete file"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="p-3 h-1/3 flex flex-col justify-center relative">
                      <div className="text-sm font-medium text-[#1C1F23] truncate mb-1" title={file.name}>
                        {file.name}
                      </div>
                      <div className="flex items-center justify-between text-xs text-[#8E9299]">
                        <span>{formatSize(file.size)}</span>
                        {/* If global search is active, show which folder the file belongs to */}
                        {searchQuery && file.folderId && (
                          <span className="bg-gray-100 px-1 py-0.5 rounded text-[10px] truncate max-w-[100px]">
                            📁 {folders.find(fd => fd.id === file.folderId)?.name || 'Folder'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-[#E2E4E9] rounded-lg overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#F9FAFB] border-b border-[#E2E4E9] select-none">
                        <th className="px-6 py-3 text-xs font-semibold text-[#8E9299] uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-xs font-semibold text-[#8E9299] uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-xs font-semibold text-[#8E9299] uppercase tracking-wider">Size</th>
                        <th className="px-6 py-3 text-xs font-semibold text-[#8E9299] uppercase tracking-wider">Date Uploaded</th>
                        {searchQuery && <th className="px-6 py-3 text-xs font-semibold text-[#8E9299] uppercase tracking-wider">Location</th>}
                        <th className="px-6 py-3 text-right text-xs font-semibold text-[#8E9299] uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E4E9]">
                      {filteredFiles.map(file => (
                        <tr
                          key={file.id}
                          onClick={() => window.open(file.downloadUrl, '_blank')}
                          className="hover:bg-gray-50 transition-colors cursor-pointer group"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              {isImage(file.type) ? (
                                <div className="w-8 h-8 rounded border border-[#E2E4E9] overflow-hidden bg-gray-50 shrink-0">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={file.downloadUrl} alt={file.name} className="w-full h-full object-cover" />
                                </div>
                              ) : isPdf(file.type, file.name) ? (
                                <div className="w-8 h-8 rounded border border-[#E2E4E9] overflow-hidden bg-white shrink-0 relative pointer-events-none select-none">
                                  <iframe 
                                    src={`${file.downloadUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                                    className="absolute border-none"
                                    style={{
                                      width: 'calc(100% + 17px)',
                                      height: 'calc(100% + 17px)',
                                      top: 0,
                                      left: 0,
                                      pointerEvents: 'none',
                                    }}
                                    scrolling="no"
                                    loading="lazy"
                                    title={file.name}
                                  />
                                </div>
                              ) : (
                                <div className="w-8 h-8 rounded border border-[#E2E4E9] flex items-center justify-center bg-gray-50 text-[#8E9299] shrink-0">
                                  <File className="w-4 h-4" />
                                </div>
                              )}
                              <span className="text-sm font-medium text-[#1C1F23] truncate max-w-xs md:max-w-md" title={file.name}>
                                {file.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-[#4A4D53]">
                            {file.type || 'Unknown'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-[#4A4D53]">
                            {formatSize(file.size)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-[#4A4D53]">
                            {formatDate(file.createdAt)}
                          </td>
                          {searchQuery && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-[#8E9299] font-medium">
                              {file.folderId ? `📁 ${folders.find(fd => fd.id === file.folderId)?.name || 'Folder'}` : '📁 Root'}
                            </td>
                          )}
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setMoveMenuPosition({
                                  top: rect.bottom + window.scrollY + 4,
                                  left: Math.max(10, rect.left + window.scrollX - 160),
                                });
                                setActiveMoveFile(file);
                              }}
                              className="text-[#1061E3] hover:text-blue-700 hover:bg-blue-50 p-1.5 rounded transition-colors opacity-0 group-hover:opacity-100 mr-2 inline-flex items-center justify-center"
                              title="Move to Folder"
                            >
                              <FolderOpen className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => removeFile(file.id, file.storagePath, e)}
                              className="text-[#D32F2F] hover:text-[#B71C1C] hover:bg-red-50 p-1.5 rounded transition-colors opacity-0 group-hover:opacity-100 inline-flex items-center justify-center font-medium"
                              title="Delete file"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {Object.entries(uploadProgress).length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            <h3 className="text-sm font-bold text-[#1C1F23]">Uploading...</h3>
            {Object.entries(uploadProgress).map(([name, progress]) => (
              <div key={name} className="bg-white border border-[#E2E4E9] rounded-lg p-3 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-[#1061E3] animate-spin shrink-0" />
                <div className="flex-grow min-w-0">
                  <div className="text-sm font-medium text-[#1C1F23] truncate mb-1">{name}</div>
                  <div className="h-1.5 w-full bg-[#E3F2FD] rounded-full overflow-hidden">
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
      {moveDropdownMenu}
    </div>
  );
}
