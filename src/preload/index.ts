import { contextBridge, ipcRenderer } from 'electron';

export interface OpenedModelFile {
  fileName: string;
  filePath: string;
  buffer: Uint8Array;
}

export interface FolderExportFile {
  fileName: string;
  data: Uint8Array;
}

const splidAPI = {
  openFileDialog: (): Promise<OpenedModelFile | null> =>
    ipcRenderer.invoke('splid:openFileDialog'),
  saveZipDialog: (defaultName: string, zipBytes: Uint8Array): Promise<string | null> =>
    ipcRenderer.invoke('splid:saveZipDialog', defaultName, zipBytes),
  saveFolderDialog: (folderName: string, files: FolderExportFile[]): Promise<string | null> =>
    ipcRenderer.invoke('splid:saveFolderDialog', folderName, files),
  windowMinimize: (): Promise<void> => ipcRenderer.invoke('splid:windowMinimize'),
  windowToggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('splid:windowToggleMaximize'),
  windowClose: (): Promise<void> => ipcRenderer.invoke('splid:windowClose'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('splid:windowIsMaximized'),
  onWindowStateChange: (callback: (state: { isMaximized: boolean }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: { isMaximized: boolean }) =>
      callback(state);
    ipcRenderer.on('splid:windowStateChanged', listener);
    return () => ipcRenderer.removeListener('splid:windowStateChanged', listener);
  }
};

contextBridge.exposeInMainWorld('splidAPI', splidAPI);
