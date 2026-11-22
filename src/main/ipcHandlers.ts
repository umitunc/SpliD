import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { basename, join } from 'path';

export interface OpenedModelFile {
  fileName: string;
  filePath: string;
  buffer: Uint8Array;
}

export interface FolderExportFile {
  fileName: string;
  data: Uint8Array;
}

export function registerIpcHandlers(): void {
  ipcMain.handle('splid:openFileDialog', async (): Promise<OpenedModelFile | null> => {
    const win = BrowserWindow.getFocusedWindow();
    const openOptions: Electron.OpenDialogOptions = {
      title: 'Select 3D Model (STL / OBJ / 3MF)',
      properties: ['openFile'],
      filters: [
        { name: '3D Models', extensions: ['stl', 'obj', '3mf'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    };
    const result = win
      ? await dialog.showOpenDialog(win, openOptions)
      : await dialog.showOpenDialog(openOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const data = await readFile(filePath);
    return {
      fileName: basename(filePath),
      filePath,
      buffer: new Uint8Array(data)
    };
  });

  ipcMain.handle(
    'splid:saveZipDialog',
    async (_event, defaultName: string, zipBytes: Uint8Array): Promise<string | null> => {
      const win = BrowserWindow.getFocusedWindow();
      const saveOptions: Electron.SaveDialogOptions = {
        title: 'Save Split Parts as ZIP',
        defaultPath: defaultName,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
      };
      const result = win
        ? await dialog.showSaveDialog(win, saveOptions)
        : await dialog.showSaveDialog(saveOptions);

      if (result.canceled || !result.filePath) {
        return null;
      }

      await writeFile(result.filePath, Buffer.from(zipBytes));
      return result.filePath;
    }
  );

  ipcMain.handle(
    'splid:saveFolderDialog',
    async (
      _event,
      folderName: string,
      files: FolderExportFile[]
    ): Promise<string | null> => {
      const win = BrowserWindow.getFocusedWindow();
      const folderOptions: Electron.OpenDialogOptions = {
        title: 'Select Output Folder for Split STL Parts',
        properties: ['openDirectory', 'createDirectory']
      };
      const result = win
        ? await dialog.showOpenDialog(win, folderOptions)
        : await dialog.showOpenDialog(folderOptions);

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const targetDir = join(result.filePaths[0], folderName);
      await mkdir(targetDir, { recursive: true });

      for (const file of files) {
        await writeFile(join(targetDir, file.fileName), Buffer.from(file.data));
      }

      return targetDir;
    }
  );

  ipcMain.handle('splid:windowMinimize', (event): void => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle('splid:windowToggleMaximize', (event): boolean => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return win.isMaximized();
  });

  ipcMain.handle('splid:windowClose', (event): void => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle('splid:windowIsMaximized', (event): boolean => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });
}
