import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, File, Image as ImageIcon, X, FolderOpen, Search, Loader2 } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { getStorageClient } from '@/lib/firebase';
import { subscribeFiles, saveFileMetadata, deleteFileMetadata } from '@/lib/crmStore';
import { StorageFile } from '@/components/Shared';

export default function FilesView({ currentUserId }: { currentUserId?: string }) {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [filename: string]: number }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = subscribeFiles(setFiles, (err) => {
      console.error('Failed to subscribe to files', err);
    });
    return () => unsub();
  }, []);

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

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

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

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#1C1F23]">Media Library ({filteredFiles.length})</h2>
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
        
        {files.length === 0 ? (
          <div className="text-center py-12 text-[#8E9299] bg-white rounded-lg border border-[#E2E4E9]">
            <FolderOpen className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>No files uploaded yet.</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12 text-[#8E9299] bg-white rounded-lg border border-[#E2E4E9]">
            <Search className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>No files match &quot;{searchQuery}&quot;.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {filteredFiles.map(file => (
              <div 
                key={file.id} 
                className="group relative bg-white border border-[#E2E4E9] rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer aspect-square flex flex-col"
                onClick={() => window.open(file.downloadUrl, '_blank')}
              >
                <div className="h-2/3 bg-gray-50 border-b border-[#E2E4E9] flex items-center justify-center p-2 relative overflow-hidden">
                  {isImage(file.type) ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={file.downloadUrl} alt={file.name} className="w-full h-full object-cover" />
                    </>
                  ) : (
                    <File className="w-12 h-12 text-[#8E9299]" />
                  )}
                  <button 
                    onClick={(e) => removeFile(file.id, file.storagePath, e)}
                    className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-3 h-1/3 flex flex-col justify-center">
                  <div className="text-sm font-medium text-[#1C1F23] truncate mb-1" title={file.name}>
                    {file.name}
                  </div>
                  <div className="text-xs text-[#8E9299]">
                    {formatSize(file.size)}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
    </div>
  );
}
