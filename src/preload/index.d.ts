export interface OpenedModelFile {
  fileName: string;
  filePath: string;
  buffer: Uint8Array;
}

export interface FolderExportFile {
  fileName: string;
  data: Uint8Array;
}

export interface SplidAPI {
  openFileDialog: () => Promise<OpenedModelFile | null>;
  saveZipDialog: (defaultName: string, zipBytes: Uint8Array) => Promise<string | null>;
  saveFolderDialog: (folderName: string, files: FolderExportFile[]) => Promise<string | null>;
  windowMinimize: () => Promise<void>;
  windowToggleMaximize: () => Promise<boolean>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  onWindowStateChange: (callback: (state: { isMaximized: boolean }) => void) => () => void;
}

declare global {
  interface Window {
    splidAPI?: SplidAPI;
  }
}
