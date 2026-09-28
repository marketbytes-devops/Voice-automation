import React, { useState, useRef } from 'react';
import { Upload, File, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export function DocumentUploader({ onUpload, accept = ".txt,.md,.pdf,.docx" }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, uploading, success, error
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setStatus('idle');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      // Basic extension check based on accept prop
      const extension = '.' + dropped.name.split('.').pop().toLowerCase();
      if (accept.includes(extension) || accept === '*') {
        setFile(dropped);
        setStatus('idle');
      } else {
        toast.error('Invalid file type.');
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus('uploading');
    try {
      await onUpload(file);
      setStatus('success');
      setTimeout(() => {
        setFile(null);
        setStatus('idle');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }, 2000);
    } catch (error) {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const clearFile = () => {
    setFile(null);
    setStatus('idle');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div 
      className={`relative w-full border-2 border-dashed rounded-2xl p-6 transition-all duration-300 ease-in-out flex flex-col items-center justify-center text-center gap-3
        ${isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 hover:border-white/20 bg-black/20'}
        ${status === 'success' ? 'border-emerald-500/50 bg-emerald-500/10' : ''}
        ${status === 'error' ? 'border-rose-500/50 bg-rose-500/10' : ''}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input 
        type="file" 
        ref={fileInputRef}
        accept={accept} 
        onChange={handleFileSelect} 
        className="hidden" 
        id="doc-upload"
      />

      {status === 'success' ? (
        <div className="flex flex-col items-center gap-2 text-emerald-400 animate-in zoom-in duration-300">
          <CheckCircle2 size={32} />
          <span className="font-medium">Upload successful!</span>
        </div>
      ) : status === 'error' ? (
        <div className="flex flex-col items-center gap-2 text-rose-400 animate-in zoom-in duration-300">
          <AlertCircle size={32} />
          <span className="font-medium">Upload failed. Please try again.</span>
        </div>
      ) : file ? (
        <div className="w-full max-w-sm flex flex-col gap-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
            <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
              <File size={20} />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-slate-200 truncate">{file.name}</p>
              <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <button 
              onClick={clearFile}
              disabled={status === 'uploading'}
              className="p-2 text-slate-400 hover:text-rose-400 transition-colors disabled:opacity-50"
            >
              <X size={16} />
            </button>
          </div>
          
          <button 
            onClick={handleUpload} 
            disabled={status === 'uploading'}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white rounded-xl font-medium text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            {status === 'uploading' ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Extracting document...
              </>
            ) : (
              <>
                <Upload size={18} />
                Upload and extract
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          <div className="p-4 rounded-full bg-white/5 text-indigo-300 mb-1 group-hover:scale-110 transition-transform">
            <Upload size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-300">
              Drag and drop your document here, or{' '}
              <label htmlFor="doc-upload" className="text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors">
                browse files
              </label>
            </p>
            <p className="text-xs text-slate-500 mt-1">Supports TXT, MD, PDF, DOCX (Max 2 MiB)</p>
          </div>
        </>
      )}
    </div>
  );
}
