import type { Content } from 'pdfmake';

type PdfMakeApi = {
  addVirtualFileSystem: (fileSystem: unknown) => void;
  createPdf: (definition: unknown) => { download: (fileName: string) => void };
};

let pdfMakePromise: Promise<PdfMakeApi> | null = null;

async function loadPdfMake(): Promise<PdfMakeApi> {
  if (!pdfMakePromise) {
    pdfMakePromise = Promise.all([
      import('pdfmake/build/pdfmake'),
      import('pdfmake/build/vfs_fonts'),
    ]).then(([pdfModule, fontModule]) => {
      const pdfMake = (pdfModule.default ?? pdfModule) as unknown as PdfMakeApi;
      const virtualFileSystem = fontModule.default ?? fontModule;
      if (typeof pdfMake.addVirtualFileSystem !== 'function' || typeof pdfMake.createPdf !== 'function') {
        throw new Error('Библиотека PDF загрузилась в неподдерживаемом формате');
      }
      pdfMake.addVirtualFileSystem(virtualFileSystem);
      return pdfMake;
    }).catch((error: unknown) => {
      pdfMakePromise = null;
      throw error;
    });
  }
  return pdfMakePromise;
}

export async function downloadPdfDocument(content: Content[], fileName: string, options: Record<string, unknown> = {}) {
  const pdfMake = await loadPdfMake();
  pdfMake.createPdf({ content, ...options }).download(fileName);
}
