# PDFree - Free Online PDF Tools

<div align="center">

![PDFree Logo](https://img.shields.io/badge/PDF-ree-ef4444?style=for-the-badge&labelColor=1f2937)

**100% Client-Side PDF Processing**

*Your files never leave your device*

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Made with React](https://img.shields.io/badge/Made%20with-React-61DAFB?logo=react&logoColor=white)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

[**Live Demo**](https://skillfulelectro.github.io/PDFree/) • [**Features**](#features) • [**Installation**](#installation) • [**Usage**](#usage) • [**Contributing**](#contributing)

</div>

---

## 🔒 Privacy First

PDFree processes all PDF operations **entirely in your browser**. No files are ever uploaded to any server. This means:

- ✅ **Complete Privacy** - Your sensitive documents stay on your device
- ✅ **No Upload Limits** - Process files of any size (limited only by your device's memory)
- ✅ **Works Offline** - Once loaded, the app works without internet
- ✅ **No Account Required** - Just open and use
- ✅ **Free Forever** - No subscriptions, no limits, no ads

---

## ✨ Features

PDFree includes **16 powerful PDF tools**:

### 📁 Organize
| Tool | Description |
|------|-------------|
| **Merge PDF** | Combine multiple PDF files into one |
| **Split PDF** | Separate a PDF into individual pages |
| **Rotate Pages** | Rotate pages by 90°, 180°, or 270° (per-page or all at once) |
| **Remove Pages** | Delete specific pages from a PDF |
| **Rearrange Pages** | Reorder pages in any order |

### 🔄 Convert
| Tool | Description |
|------|-------------|
| **Images to PDF** | Convert JPG, PNG, GIF, WebP images to PDF |
| **PDF to Images** | Export PDF pages as PNG images |

### ✏️ Edit
| Tool | Description |
|------|-------------|
| **Add Watermark** | Add custom text watermark with opacity control |
| **Add Page Numbers** | Number pages (left, center, or right position) |
| **Edit Metadata** | Modify title, author, and subject |

### 📤 Extract
| Tool | Description |
|------|-------------|
| **Extract Pages** | Extract specific pages to a new PDF |
| **Extract Images** | Get embedded images from a PDF |

### ⚡ Optimize
| Tool | Description |
|------|-------------|
| **Compress PDF** | Reduce file size with DPI and quality control |
| **Flatten PDF** | Flatten form fields and annotations |
| **Change Page Size** | Resize pages to A4, Letter, Legal, or A3 |

### 🔐 Security
| Tool | Description |
|------|-------------|
| **Remove Metadata** | Strip all metadata from a PDF |

---

## 🛠️ Tech Stack

- **[React 19](https://react.dev/)** - UI Framework
- **[TypeScript](https://www.typescriptlang.org/)** - Type Safety
- **[Vite](https://vitejs.dev/)** - Build Tool
- **[Tailwind CSS 4](https://tailwindcss.com/)** - Styling
- **[pdf-lib](https://pdf-lib.js.org/)** - PDF Manipulation
- **[PDF.js](https://mozilla.github.io/pdf.js/)** - PDF Rendering
- **[JSZip](https://stuk.github.io/jszip/)** - ZIP File Creation

---

## 📦 Installation

### Prerequisites

- [Node.js](https://nodejs.org/) 18.x or higher
- npm or yarn

### Clone the Repository

```bash
git clone https://github.com/yourusername/pdfree.git
cd pdfree
```

### Install Dependencies

```bash
npm install
```

### Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The production build will be in the `dist` folder.

---

## 🚀 Deployment
### Manual Deployment

You can deploy the `dist` folder to any static hosting service:

- **Netlify**: Drag and drop the `dist` folder
- **Vercel**: Connect your repo and set build command to `npm run build`
- **AWS S3**: Upload `dist` folder contents to an S3 bucket with static hosting
- **Cloudflare Pages**: Connect repo with `npm run build` command

---

## 📁 Project Structure

```
pdfree/
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Pages deployment
├── src/
│   ├── components/
│   │   └── ToolModal.tsx   # Modal component for all tools
│   ├── data/
│   │   └── tools.tsx       # Tool definitions and categories
│   ├── types/
│   │   ├── pdfjs.d.ts      # PDF.js type declarations
│   │   ├── mammoth.d.ts    # Mammoth type declarations
│   │   └── html2canvas.d.ts # html2canvas type declarations
│   ├── utils/
│   │   ├── cn.ts           # Tailwind class merge utility
│   │   └── pdfUtils.ts     # All PDF processing functions
│   ├── App.tsx             # Main application component
│   ├── main.tsx            # React entry point
│   └── index.css           # Tailwind imports
├── index.html              # HTML template
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🔧 Configuration

### Vite Configuration

The project uses `vite-plugin-singlefile` to bundle everything into a single HTML file for easy deployment:

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  // ...
});
```

### PDF.js Worker

The PDF.js worker is loaded from a CDN for optimal performance:

```typescript
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;
```

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Commit**: `git commit -m 'Add amazing feature'`
5. **Push**: `git push origin feature/amazing-feature`
6. **Open a Pull Request**

### Development Guidelines

- Write TypeScript with proper types
- Use Tailwind CSS for styling
- Keep components small and focused
- Add comments for complex logic
- Test with various PDF files

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [pdf-lib](https://github.com/Hopding/pdf-lib) - Amazing PDF manipulation library
- [PDF.js](https://github.com/mozilla/pdf.js) - Mozilla's PDF rendering engine
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Vite](https://vitejs.dev/) - Next generation frontend tooling

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/pdfree/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/pdfree/discussions)

---

<div align="center">

**Made with ❤️ for privacy-conscious users**

[⬆ Back to Top](#pdfree---free-online-pdf-tools)

</div>
