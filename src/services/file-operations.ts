export interface FileEntry {
  handle: FileSystemFileHandle;
  name: string;
  path: string[];
  size: number;
  type: string;
}

export async function pickSourceDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker({ mode: 'read' });
  } catch {
    return null;
  }
}

export async function pickDestinationDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch {
    return null;
  }
}

export async function* walkDirectory(
  dirHandle: FileSystemDirectoryHandle,
  path: string[] = [],
): AsyncGenerator<FileEntry> {
  for await (const [name, handle] of dirHandle.entries()) {
    const currentPath = [...path, name];
    if (handle.kind === 'directory') {
      yield* walkDirectory(handle, currentPath);
    } else {
      const file = await handle.getFile();
      if (isSupportedFileType(file.name)) {
        yield {
          handle,
          name: file.name,
          path: currentPath,
          size: file.size,
          type: file.type || inferType(file.name),
        };
      }
    }
  }
}

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.txt', '.csv', '.json', '.xml',
  '.md', '.rtf', '.html', '.htm',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp',
  '.doc', '.docx',
]);

function isSupportedFileType(name: string): boolean {
  const ext = name.toLowerCase().match(/\.[^.]+$/)?.[0];
  return ext ? SUPPORTED_EXTENSIONS.has(ext) : false;
}

function inferType(name: string): string {
  const ext = name.toLowerCase().match(/\.[^.]+$/)?.[0];
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.md': 'text/markdown',
    '.rtf': 'application/rtf',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
  };
  return map[ext ?? ''] || 'application/octet-stream';
}

export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function organizeFile(
  destDir: FileSystemDirectoryHandle,
  sourceFile: File,
  year: number,
  category: string,
  filename: string,
): Promise<string> {
  const yearDir = await destDir.getDirectoryHandle(String(year), { create: true });
  const catDir = await yearDir.getDirectoryHandle(category, { create: true });

  const finalName = filename || sourceFile.name;
  const existingNames = new Set<string>();
  for await (const [name] of catDir.entries()) {
    existingNames.add(name);
  }

  let uniqueName = finalName;
  let counter = 1;
  while (existingNames.has(uniqueName)) {
    const dot = finalName.lastIndexOf('.');
    if (dot > 0) {
      uniqueName = `${finalName.slice(0, dot)}_${counter}${finalName.slice(dot)}`;
    } else {
      uniqueName = `${finalName}_${counter}`;
    }
    counter++;
  }

  const fileHandle = await catDir.getFileHandle(uniqueName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(sourceFile);
  await writable.close();

  return `${year}/${category}/${uniqueName}`;
}
