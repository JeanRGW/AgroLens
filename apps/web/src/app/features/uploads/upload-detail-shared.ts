import { ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { UploadsService } from '../../core/services/uploads.service';

/**
 * Builds the timestamped filename for downloading all originals as a ZIP.
 */
export function buildUploadZipName(uploadId: string, timestamp = Date.now()): string {
  return `upload-${uploadId}-${timestamp}`;
}

/**
 * Creates the standard confirmation dialog config for deleting an upload.
 */
export function buildDeleteUploadConfirmData(uploadId: string): ConfirmDialogData {
  return {
    title: 'Excluir Upload',
    message: `Tem certeza que deseja excluir o upload ${uploadId}? Todas as imagens e anotações serão removidas permanentemente.`,
    confirmText: 'Excluir',
    cancelText: 'Cancelar',
    confirmColor: 'warn',
  };
}

/**
 * Resolves a signed URL from a display entry reference ("preview:<fileId>" or "original:<fileId>").
 */
export async function resolveEntryUrl(
  uploadsService: UploadsService,
  uploadId: string,
  entry: string,
): Promise<string> {
  const [type, fileId] = entry.split(':');
  if (type === 'preview') {
    const resp = await uploadsService.getPreviewUrl(uploadId, fileId);
    return resp.downloadUrl;
  }
  const resp = await uploadsService.getDownloadUrl(uploadId, fileId);
  return resp.downloadUrl;
}
