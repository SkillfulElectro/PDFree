import { useCallback, useState, useEffect, useRef } from 'react';
import { Tool } from '@/data/tools';
import { cn } from '@/utils/cn';
import * as pdfUtils from '@/utils/pdfUtils';

interface ToolModalProps {
  tool: Tool;
  onClose: () => void;
}

interface ProcessingOptions {
  rotation?: number;
  watermarkText?: string;
  watermarkOpacity?: number;
  pageNumberPosition?: 'bottom-center' | 'bottom-right' | 'bottom-left';
  pageSize?: { width: number; height: number; label: string };
  metadata?: { title?: string; author?: string; subject?: string };
  // Compression options
  compressionQuality?: number; // 1-100 (JPEG quality %)
  compressionDpi?: number;     // 72, 96, 150, 200, 300
  compressionFullPage?: boolean; // true = full page mode, false = image-only mode
  // Per-page rotation options
  perPageRotation?: boolean; // true = set rotation per page, false = same for all
  pageRotations?: Record<number, number>; // { pageIndex: rotationAngle }
}

export function ToolModal({ tool, onClose }: ToolModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultFileName, setResultFileName] = useState('');
  const [compressionResult, setCompressionResult] = useState<{ originalSize: number; compressedSize: number; reduction: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<ProcessingOptions>({
    rotation: 90,
    watermarkText: 'CONFIDENTIAL',
    watermarkOpacity: 0.3,
    pageNumberPosition: 'bottom-center',
    pageSize: { width: 595, height: 842, label: 'A4' },
    metadata: { title: '', author: '', subject: '' },
    compressionQuality: 50,
    compressionDpi: 150,
    compressionFullPage: true,
    perPageRotation: false,
    pageRotations: {},
  });
  const [pageCount, setPageCount] = useState(0);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Cleanup progress interval on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const loadPdfInfo = async () => {
      if (files.length > 0 && files[0].type === 'application/pdf') {
        try {
          const info = await pdfUtils.getPDFInfo(files[0]);
          setPageCount(info.pageCount);
          setPageOrder(Array.from({ length: info.pageCount }, (_, i) => i));
          setOptions(prev => ({
            ...prev,
            metadata: {
              title: info.title || '',
              author: info.author || '',
              subject: info.subject || '',
            }
          }));
        } catch (err) {
          console.error('Error loading PDF info:', err);
        }
      }
    };
    loadPdfInfo();
  }, [files]);

  // All remaining tools require file upload
  const requiresFileUpload = true;

  // Get accepted file types based on tool
  const getAcceptedFileTypes = () => {
    switch (tool.id) {
      case 'images-to-pdf':
        return 'image/*';
      default:
        return '.pdf,application/pdf';
    }
  };

  // Validate dropped/selected files
  const validateFiles = (fileList: File[]): File[] => {
    const toolId = tool.id;
    
    if (toolId === 'images-to-pdf') {
      return fileList.filter(f => f.type.startsWith('image/'));
    }
    
    // Default: PDF only
    return fileList.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
  };

  // Check if tool accepts single file only
  const isSingleFileOnly = !['merge', 'images-to-pdf'].includes(tool.id);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = validateFiles(Array.from(e.dataTransfer.files));
    
    if (droppedFiles.length === 0) {
      setError(`Invalid file type. ${tool.id === 'images-to-pdf' ? 'Please use image files.' : 'Please use PDF files.'}`);
      return;
    }
    
    if (isSingleFileOnly) {
      setFiles([droppedFiles[0]]);
    } else {
      setFiles(prev => [...prev, ...droppedFiles]);
    }
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.id, isSingleFileOnly]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = validateFiles(Array.from(e.target.files));
      
      if (selectedFiles.length === 0) {
        setError(`Invalid file type. ${tool.id === 'images-to-pdf' ? 'Please use image files.' : 'Please use PDF files.'}`);
        return;
      }
      
      if (isSingleFileOnly) {
        setFiles([selectedFiles[0]]);
      } else {
        setFiles(prev => [...prev, ...selectedFiles]);
      }
      setError(null);
    }
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.id, isSingleFileOnly]);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPageCount(0);
    setSelectedPages([]);
    setPageOrder([]);
  }, []);

  const handleProcess = useCallback(async () => {
    // Clear any previous interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    // Validate: some tools don't need files
    if (requiresFileUpload && files.length === 0) {
      setError('Please upload a file first');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setError(null);

    // Start progress interval
    progressIntervalRef.current = setInterval(() => {
      setProgress(prev => Math.min(prev + 15, 90));
    }, 150);

    try {
      let result: Blob | null = null;
      let filename = 'processed.pdf';

      switch (tool.id) {
        case 'merge':
          if (files.length < 2) throw new Error('Please upload at least 2 PDF files to merge');
          result = await pdfUtils.mergePDFs(files);
          filename = 'merged.pdf';
          break;
          
        case 'split':
          result = await pdfUtils.splitPDFToSinglePages(files[0]);
          filename = 'split_pages.zip';
          break;
          
        case 'compress': {
          result = await pdfUtils.compressPDF(files[0], {
            imageQuality: options.compressionQuality || 50,
            dpi: options.compressionDpi || 150,
            fullPageMode: options.compressionFullPage !== false,
          });
          const originalSize = files[0].size;
          const compressedSize = result.size;
          const reduction = Math.round((1 - compressedSize / originalSize) * 100);
          setCompressionResult({ originalSize, compressedSize, reduction });
          filename = 'compressed.pdf';
          break;
        }
          
        case 'rotate':
          if (options.perPageRotation && options.pageRotations && Object.keys(options.pageRotations).length > 0) {
            // Per-page rotation mode
            result = await pdfUtils.rotatePDFPages(files[0], 0, undefined, options.pageRotations);
          } else {
            // Same rotation for selected pages
            result = await pdfUtils.rotatePDFPages(files[0], options.rotation || 90, selectedPages.length > 0 ? selectedPages : undefined);
          }
          filename = 'rotated.pdf';
          break;
          
        case 'remove-pages':
          if (selectedPages.length === 0) throw new Error('Please select pages to remove');
          result = await pdfUtils.removePDFPages(files[0], selectedPages);
          filename = 'pages_removed.pdf';
          break;
          
        case 'extract-pages':
          if (selectedPages.length === 0) throw new Error('Please select pages to extract');
          result = await pdfUtils.extractPDFPages(files[0], selectedPages);
          filename = 'extracted_pages.pdf';
          break;
          
        case 'rearrange':
          if (pageOrder.length === 0) throw new Error('No pages to rearrange');
          result = await pdfUtils.rearrangePDFPages(files[0], pageOrder);
          filename = 'rearranged.pdf';
          break;
          
        case 'images-to-pdf':
          const imageFiles = files.filter(f => f.type.startsWith('image/'));
          if (imageFiles.length === 0) throw new Error('Please upload image files');
          result = await pdfUtils.imagesToPDF(imageFiles);
          filename = 'images_to_pdf.pdf';
          break;
          
        case 'pdf-to-images':
          result = await pdfUtils.pdfToImages(files[0], 2);
          filename = 'pdf_images.zip';
          break;
          
        case 'extract-images':
          // Extract only embedded image elements from the PDF (not full pages)
          result = await pdfUtils.extractPDFImages(files[0]);
          filename = 'extracted_images.zip';
          break;
          
        // Removed: converter, pdf-converter - use pdf-to-images instead
          
        // Removed: convert-to-pdf - requires complex Unicode rendering
          
        case 'watermark':
          if (!options.watermarkText) throw new Error('Please enter watermark text');
          result = await pdfUtils.addWatermark(files[0], options.watermarkText, options.watermarkOpacity || 0.3);
          filename = 'watermarked.pdf';
          break;
          
        case 'page-numbers':
          result = await pdfUtils.addPageNumbers(files[0], options.pageNumberPosition || 'bottom-center');
          filename = 'numbered.pdf';
          break;
          
        // Removed: protect, unlock - pdf-lib doesn't support real encryption
          
        case 'remove-metadata':
          result = await pdfUtils.removeMetadata(files[0]);
          filename = 'metadata_removed.pdf';
          break;
          
        case 'edit-metadata':
          result = await pdfUtils.editMetadata(files[0], options.metadata || {});
          filename = 'metadata_edited.pdf';
          break;
          
        case 'flatten':
          result = await pdfUtils.flattenPDF(files[0]);
          filename = 'flattened.pdf';
          break;
          
        case 'page-size':
          result = await pdfUtils.changePageSize(files[0], options.pageSize?.width || 595, options.pageSize?.height || 842);
          filename = 'resized.pdf';
          break;
          
        default:
          throw new Error(`Tool "${tool.id}" is not yet implemented`);
      }

      // Clear interval on success
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      
      setProgress(100);

      if (result) {
        setResultBlob(result);
        setResultFileName(filename);
        setIsComplete(true);
      }
    } catch (err) {
      console.error('Processing error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      // Always clear interval in finally block
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setIsProcessing(false);
    }
  }, [files, tool.id, options, selectedPages, pageOrder, requiresFileUpload]);

  const handleDownload = useCallback(() => {
    if (resultBlob) {
      pdfUtils.downloadBlob(resultBlob, resultFileName);
    }
  }, [resultBlob, resultFileName]);

  const handleReset = useCallback(() => {
    setFiles([]);
    setIsComplete(false);
    setIsProcessing(false);
    setResultBlob(null);
    setError(null);
    setProgress(0);
    setSelectedPages([]);
    setPageOrder([]);
    setPageCount(0);
    setCompressionResult(null);
    // Reset rotation options
    setOptions(prev => ({ ...prev, pageRotations: {}, perPageRotation: false }));
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Move page in the order array
  const movePageInOrder = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= pageOrder.length) return;
    
    const newOrder = [...pageOrder];
    [newOrder[fromIndex], newOrder[toIndex]] = [newOrder[toIndex], newOrder[fromIndex]];
    setPageOrder(newOrder);
  };

  const needsMultipleFiles = tool.id === 'merge';
  // For rotate: only show page selection in "Same for All" mode, not per-page mode
  const needsPageSelection = ['remove-pages', 'extract-pages'].includes(tool.id) || 
    (tool.id === 'rotate' && !options.perPageRotation);
  const needsPageReorder = tool.id === 'rearrange';

  const renderOptions = () => {
    switch (tool.id) {
      case 'compress':
        return (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg space-y-4">
            {/* Compression Mode Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Compression Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setOptions(prev => ({ ...prev, compressionFullPage: true }))}
                  className={cn(
                    "p-3 rounded-lg border-2 text-left transition-all",
                    options.compressionFullPage !== false
                      ? "border-red-500 bg-red-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  )}
                >
                  <div className="font-medium text-sm text-gray-900">Full Page</div>
                  <div className="text-xs text-gray-500 mt-1">Max compression, converts text to images</div>
                </button>
                <button
                  onClick={() => setOptions(prev => ({ ...prev, compressionFullPage: false }))}
                  className={cn(
                    "p-3 rounded-lg border-2 text-left transition-all",
                    options.compressionFullPage === false
                      ? "border-red-500 bg-red-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  )}
                >
                  <div className="font-medium text-sm text-gray-900">Images Only</div>
                  <div className="text-xs text-gray-500 mt-1">Re-renders at your quality settings</div>
                </button>
              </div>
            </div>

            {/* Image Quality Slider - available for both modes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Image Quality: <span className="font-bold text-red-600">{options.compressionQuality}%</span>
              </label>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={options.compressionQuality || 50}
                onChange={(e) => setOptions(prev => ({ ...prev, compressionQuality: parseInt(e.target.value) }))}
                className="w-full accent-red-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>Smallest file</span>
                <span>Best quality</span>
              </div>
            </div>

            {/* DPI Input + Presets - available for both modes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Resolution (DPI)
              </label>
              <div className="flex items-center gap-3 mb-2">
                <input
                  type="number"
                  min="36"
                  max="600"
                  value={options.compressionDpi || 150}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 150;
                    setOptions(prev => ({ ...prev, compressionDpi: Math.max(36, Math.min(600, val)) }));
                  }}
                  className="w-24 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 text-center font-bold text-red-600"
                />
                <span className="text-sm text-gray-500">Enter any value (36–600)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 72, label: '72', desc: 'Screen' },
                  { value: 96, label: '96', desc: 'Web' },
                  { value: 150, label: '150', desc: 'Ebook' },
                  { value: 200, label: '200', desc: 'Print' },
                  { value: 300, label: '300', desc: 'High' },
                ].map(dpi => (
                  <button
                    key={dpi.value}
                    onClick={() => setOptions(prev => ({ ...prev, compressionDpi: dpi.value }))}
                    className={cn(
                      "px-3 py-2 rounded text-sm font-medium flex flex-col items-center min-w-[60px]",
                      (options.compressionDpi || 150) === dpi.value
                        ? "bg-red-500 text-white"
                        : "bg-white border text-gray-700 hover:border-red-300"
                    )}
                  >
                    <span>{dpi.label}</span>
                    <span className={cn(
                      "text-xs",
                      (options.compressionDpi || 150) === dpi.value ? "text-red-100" : "text-gray-400"
                    )}>{dpi.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Info Box */}
            <div className="text-xs text-gray-500 bg-white rounded p-2 border">
              <p className="font-medium text-gray-700 mb-1">
                {options.compressionFullPage !== false ? 'Full Page Mode:' : 'Images Only Mode:'}
              </p>
              <p>
                {options.compressionFullPage !== false
                  ? 'Each page is re-rendered as a JPEG image at your specified quality & DPI. Text becomes non-selectable. Best for archiving or sharing.'
                  : 'Each page is re-rendered at your specified quality & DPI. Similar to Full Page mode but optimized for image-heavy documents.'}
              </p>
            </div>
          </div>
        );
      case 'rotate':
        return (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg space-y-4">
            {/* Mode Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Rotation Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setOptions(prev => ({ ...prev, perPageRotation: false }))}
                  className={cn(
                    "p-2 rounded-lg border-2 text-left transition-all",
                    !options.perPageRotation
                      ? "border-red-500 bg-red-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  )}
                >
                  <div className="font-medium text-sm text-gray-900">Same for All</div>
                  <div className="text-xs text-gray-500">Apply same rotation to selected pages</div>
                </button>
                <button
                  onClick={() => setOptions(prev => ({ ...prev, perPageRotation: true }))}
                  className={cn(
                    "p-2 rounded-lg border-2 text-left transition-all",
                    options.perPageRotation
                      ? "border-red-500 bg-red-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  )}
                >
                  <div className="font-medium text-sm text-gray-900">Per Page</div>
                  <div className="text-xs text-gray-500">Set different rotation for each page</div>
                </button>
              </div>
            </div>

            {/* Same rotation for all pages */}
            {!options.perPageRotation && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rotation Angle</label>
                <div className="flex gap-2">
                  {[90, 180, 270].map(angle => (
                    <button
                      key={angle}
                      onClick={() => setOptions(prev => ({ ...prev, rotation: angle }))}
                      className={cn(
                        "px-4 py-2 rounded text-sm font-medium flex items-center gap-1",
                        options.rotation === angle ? "bg-red-500 text-white" : "bg-white border text-gray-700 hover:border-red-300"
                      )}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ transform: `rotate(${angle}deg)` }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {angle}°
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {selectedPages.length > 0 
                    ? `Will rotate ${selectedPages.length} selected page(s)`
                    : 'Will rotate all pages (or select specific pages above)'}
                </p>
              </div>
            )}

            {/* Per-page rotation */}
            {options.perPageRotation && pageCount > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Set Rotation for Each Page
                </label>
                <div className="max-h-48 overflow-y-auto space-y-2 p-2 bg-white rounded-lg border">
                  {Array.from({ length: pageCount }, (_, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm font-medium text-gray-700">Page {i + 1}</span>
                      <div className="flex gap-1">
                        {[0, 90, 180, 270].map(angle => (
                          <button
                            key={angle}
                            onClick={() => setOptions(prev => ({
                              ...prev,
                              pageRotations: {
                                ...prev.pageRotations,
                                [i]: angle
                              }
                            }))}
                            className={cn(
                              "px-2 py-1 rounded text-xs font-medium min-w-[40px]",
                              (options.pageRotations?.[i] || 0) === angle 
                                ? "bg-red-500 text-white" 
                                : "bg-white border text-gray-600 hover:border-red-300"
                            )}
                          >
                            {angle === 0 ? 'None' : `${angle}°`}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Pages set to "None" will not be rotated
                </p>
              </div>
            )}
          </div>
        );
      case 'watermark':
        return (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Watermark Text</label>
              <input
                type="text"
                value={options.watermarkText}
                onChange={(e) => setOptions(prev => ({ ...prev, watermarkText: e.target.value }))}
                className="w-full px-3 py-2 rounded border focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Opacity: {Math.round((options.watermarkOpacity || 0.3) * 100)}%</label>
              <input
                type="range"
                min="10"
                max="100"
                value={(options.watermarkOpacity || 0.3) * 100}
                onChange={(e) => setOptions(prev => ({ ...prev, watermarkOpacity: parseInt(e.target.value) / 100 }))}
                className="w-full"
              />
            </div>
          </div>
        );
      case 'page-numbers':
        return (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-2">Position</label>
            <div className="flex gap-2">
              {[{ value: 'bottom-left', label: 'Left' }, { value: 'bottom-center', label: 'Center' }, { value: 'bottom-right', label: 'Right' }].map(pos => (
                <button
                  key={pos.value}
                  onClick={() => setOptions(prev => ({ ...prev, pageNumberPosition: pos.value as ProcessingOptions['pageNumberPosition'] }))}
                  className={cn(
                    "px-3 py-1.5 rounded text-sm font-medium",
                    options.pageNumberPosition === pos.value ? "bg-red-500 text-white" : "bg-white border text-gray-700"
                  )}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>
        );
      // Removed: protect, unlock options
      case 'edit-metadata':
        return (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg space-y-2">
            {['title', 'author', 'subject'].map(field => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{field}</label>
                <input
                  type="text"
                  value={(options.metadata as Record<string, string>)?.[field] || ''}
                  onChange={(e) => setOptions(prev => ({ ...prev, metadata: { ...prev.metadata, [field]: e.target.value } }))}
                  className="w-full px-3 py-2 rounded border focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            ))}
          </div>
        );
      case 'page-size':
        const pageSizes = [
          { label: 'A4', width: 595, height: 842 }, 
          { label: 'Letter', width: 612, height: 792 }, 
          { label: 'Legal', width: 612, height: 1008 },
          { label: 'A3', width: 842, height: 1191 }
        ];
        return (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-2">Page Size</label>
            <div className="flex flex-wrap gap-2">
              {pageSizes.map(size => (
                <button
                  key={size.label}
                  onClick={() => setOptions(prev => ({ ...prev, pageSize: size }))}
                  className={cn(
                    "px-3 py-1.5 rounded text-sm font-medium",
                    options.pageSize?.label === size.label ? "bg-red-500 text-white" : "bg-white border text-gray-700"
                  )}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>
        );
      // Removed: sign, annotate, edit options
      default:
        return null;
    }
  };

  const canProcess = () => {
    if (files.length === 0) return false;
    if (needsMultipleFiles && files.length < 2) return false;
    return true;
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" 
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", tool.color)}>
              {tool.icon}
            </div>
            <div>
              <h2 id="modal-title" className="font-bold text-gray-900">{tool.title}</h2>
              <p className="text-xs text-gray-500">{tool.description}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
            aria-label="Close modal"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {!isComplete ? (
            <>
              {/* Drop Zone */}
              {(
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
                    isDragging ? "border-red-500 bg-red-50" : "border-gray-200 hover:border-red-300"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple={!isSingleFileOnly}
                    accept={getAcceptedFileTypes()}
                    onChange={handleFileInput}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="font-medium text-gray-700">Drop files here or click to browse</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {tool.id === 'images-to-pdf' ? 'JPG, PNG, GIF, BMP, WebP' : 'PDF files only'}
                      {needsMultipleFiles && ' • Multiple files allowed'}
                    </p>
                  </div>
                </div>
              )}

              {/* File List */}
              {files.length > 0 && (
                <div className="mt-4 space-y-2">
                  {files.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 bg-red-100 rounded flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4z"/>
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                          <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB{pageCount > 0 && index === 0 && ` • ${pageCount} pages`}</p>
                        </div>
                      </div>
                      <button onClick={() => removeFile(index)} className="w-6 h-6 rounded-full hover:bg-gray-200 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Page Selection for select operations */}
              {needsPageSelection && pageCount > 0 && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Pages ({selectedPages.length} selected)</label>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-gray-50 rounded-lg">
                    {Array.from({ length: pageCount }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedPages(prev => prev.includes(i) ? prev.filter(p => p !== i) : [...prev, i])}
                        className={cn(
                          "w-8 h-8 rounded text-sm font-medium",
                          selectedPages.includes(i) ? "bg-red-500 text-white" : "bg-white border text-gray-700"
                        )}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Page Reorder for rearrange operation */}
              {needsPageReorder && pageCount > 0 && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Drag to Reorder Pages</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto p-2 bg-gray-50 rounded-lg">
                    {pageOrder.map((pageNum, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-white rounded border">
                        <span className="w-6 h-6 bg-red-100 rounded flex items-center justify-center text-xs font-medium text-red-600">
                          {pageNum + 1}
                        </span>
                        <span className="flex-1 text-sm text-gray-600">Page {pageNum + 1}</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => movePageInOrder(index, 'up')}
                            disabled={index === 0}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30 flex items-center justify-center"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => movePageInOrder(index, 'down')}
                            disabled={index === pageOrder.length - 1}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30 flex items-center justify-center"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Options */}
              {files.length > 0 && renderOptions()}

              {/* Progress */}
              {isProcessing && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600">Processing...</span>
                    <span className="text-sm text-gray-500">{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-red-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Success */
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">Done!</h3>
              <p className="text-sm text-gray-500 mb-2">Processed entirely on your device</p>
              
              {/* Compression stats */}
              {compressionResult && (
                <div className="mb-4 mx-auto max-w-xs p-3 bg-gray-50 rounded-lg text-sm">
                  <div className="flex justify-between text-gray-600 mb-1">
                    <span>Original:</span>
                    <span className="font-medium">{(compressionResult.originalSize / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                  <div className="flex justify-between text-gray-600 mb-1">
                    <span>Compressed:</span>
                    <span className="font-medium">{(compressionResult.compressedSize / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                  <div className="flex justify-between font-bold mt-2 pt-2 border-t">
                    <span className={compressionResult.reduction > 0 ? 'text-green-600' : 'text-orange-600'}>
                      {compressionResult.reduction > 0 ? `${compressionResult.reduction}% smaller` : 'Size increased — try lower quality'}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex justify-center gap-3">
                <button onClick={handleReset} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200">
                  Process Another
                </button>
                <button onClick={handleDownload} className="px-4 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isComplete && (
          <div className="flex items-center justify-between p-4 border-t bg-gray-50">
            <div className="flex items-center gap-1 text-xs text-green-600">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Files stay on your device</span>
            </div>
            <button
              onClick={handleProcess}
              disabled={!canProcess() || isProcessing}
              className={cn(
                "px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2",
                canProcess() && !isProcessing
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              )}
            >
              {isProcessing ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing
                </>
              ) : (
                'Process'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
