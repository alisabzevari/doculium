import { pickDestinationDirectory, pickSourceDirectory, organizeFile } from './file-operations.ts';
import { getAllDocuments, updateDocument } from '../db/document-store.ts';
import type { Document } from '../db/schema.ts';

export async function organizeAnalyzedDocuments(
  onProgress?: (current: string, done: number, total: number) => void,
): Promise<{ organized: number; failed: number }> {
  const docs = await getAllDocuments();
  const toOrganize = docs.filter(d => d.status === 'analyzed' && d.suggestedFilename && !d.storedPath);

  if (toOrganize.length === 0) return { organized: 0, failed: 0 };

  const sourceDir = await pickSourceDirectory();
  if (!sourceDir) return { organized: 0, failed: 0 };

  const destDir = await pickDestinationDirectory();
  if (!destDir) return { organized: 0, failed: 0 };

  let organized = 0;
  let failed = 0;

  for (const doc of toOrganize) {
    onProgress?.(doc.originalName, organized + failed, toOrganize.length);

    try {
      const fileHandle = await findFileInDir(sourceDir, doc.originalPath.split('/'));
      if (!fileHandle) {
        failed++;
        continue;
      }

      const file = await fileHandle.getFile();
      const storedPath = await organizeFile(
        destDir,
        file,
        doc.year,
        doc.category,
        doc.suggestedFilename!,
      );

      await updateDocument(doc.id, { storedPath });
      organized++;
    } catch {
      failed++;
    }
  }

  return { organized, failed };
}

async function findFileInDir(
  dirHandle: FileSystemDirectoryHandle,
  pathParts: string[],
): Promise<FileSystemFileHandle | null> {
  try {
    let handle: FileSystemDirectoryHandle = dirHandle;
    for (let i = 0; i < pathParts.length - 1; i++) {
      handle = await handle.getDirectoryHandle(pathParts[i]);
    }
    return handle.getFileHandle(pathParts[pathParts.length - 1]);
  } catch {
    return null;
  }
}
