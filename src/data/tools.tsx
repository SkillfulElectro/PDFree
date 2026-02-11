export interface Tool {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  category: string;
}

const iconClass = "w-5 h-5 text-white";

export const tools: Tool[] = [
  {
    id: 'merge',
    title: 'Merge PDF',
    description: 'Combine multiple PDFs',
    category: 'Organize',
    color: 'bg-blue-500',
    icon: <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z" /></svg>
  },
  {
    id: 'split',
    title: 'Split PDF',
    description: 'Separate pages',
    category: 'Organize',
    color: 'bg-purple-500',
    icon: <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
  },
  {
    id: 'compress',
    title: 'Compress PDF',
    description: 'Reduce file size',
    category: 'Optimize',
    color: 'bg-green-500',
    icon: <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
  },
  {
    id: 'images-to-pdf',
    title: 'Images to PDF',
    description: 'Convert images',
    category: 'Convert',
    color: 'bg-teal-500',
    icon: <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
  },
  {
    id: 'pdf-to-images',
    title: 'PDF to Images',
    description: 'Export as images',
    category: 'Convert',
    color: 'bg-cyan-500',
    icon: <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
  },
  {
    id: 'extract-images',
    title: 'Extract Images',
    description: 'Get embedded images',
    category: 'Extract',
    color: 'bg-indigo-500',
    icon: <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  },
  {
    id: 'rotate',
    title: 'Rotate Pages',
    description: 'Rotate PDF pages',
    category: 'Organize',
    color: 'bg-violet-500',
    icon: <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
  },
  {
    id: 'remove-pages',
    title: 'Remove Pages',
    description: 'Delete pages',
    category: 'Organize',
    color: 'bg-rose-500',
    icon: <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
  },
  {
    id: 'extract-pages',
    title: 'Extract Pages',
    description: 'Extract specific pages',
    category: 'Extract',
    color: 'bg-sky-500',
    icon: <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
  },
  {
    id: 'rearrange',
    title: 'Rearrange Pages',
    description: 'Reorder pages',
    category: 'Organize',
    color: 'bg-fuchsia-500',
    icon: <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
  },
  {
    id: 'watermark',
    title: 'Add Watermark',
    description: 'Add text watermark',
    category: 'Edit',
    color: 'bg-blue-400',
    icon: <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
  },
  {
    id: 'page-numbers',
    title: 'Add Page Numbers',
    description: 'Number pages',
    category: 'Edit',
    color: 'bg-slate-500',
    icon: <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
  },
  {
    id: 'remove-metadata',
    title: 'Remove Metadata',
    description: 'Strip metadata',
    category: 'Security',
    color: 'bg-gray-500',
    icon: <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
  },
  {
    id: 'edit-metadata',
    title: 'Edit Metadata',
    description: 'Modify properties',
    category: 'Edit',
    color: 'bg-zinc-500',
    icon: <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  },
  {
    id: 'flatten',
    title: 'Flatten PDF',
    description: 'Flatten forms',
    category: 'Optimize',
    color: 'bg-neutral-500',
    icon: <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
  },
  {
    id: 'page-size',
    title: 'Change Page Size',
    description: 'Resize pages',
    category: 'Optimize',
    color: 'bg-purple-400',
    icon: <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
  },
];

export const categories = [
  { id: 'all', name: 'All' },
  { id: 'Organize', name: 'Organize' },
  { id: 'Convert', name: 'Convert' },
  { id: 'Edit', name: 'Edit' },
  { id: 'Security', name: 'Security' },
  { id: 'Extract', name: 'Extract' },
  { id: 'Optimize', name: 'Optimize' },
];
