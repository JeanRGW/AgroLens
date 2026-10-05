import { HttpErrorResponse } from '@angular/common/http';
export function uploadErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (body && typeof body === 'object' && 'message' in body) {
      const message: unknown = body.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && message.every((item) => typeof item === 'string'))
        return message.join('. ');
    }
    if (error.status === 0) return 'Conexão indisponível. Reconecte-se e tente novamente.';
  }
  if (error instanceof Error && error.name === 'TimeoutError') {
    return 'A conexão demorou demais. Tente novamente sem fechar esta página.';
  }
  return error instanceof Error ? error.message : 'Não foi possível enviar o upload.';
}

export const UPLOAD_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function validateUploadImages(
  files: { name?: string; type: string; size: number }[],
): string[] {
  if (!files.length) throw new Error('Selecione ao menos uma imagem.');
  if (files.some((file) => file.size === 0))
    throw new Error('Uma das imagens está vazia. Selecione-a novamente.');
  return files.map((file) => {
    const extension = file.name?.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
    // Camera intents can omit File.type. An explicit MIME type always takes precedence.
    const type = file.type || imageTypeFromExtension(extension);
    if (UPLOAD_IMAGE_TYPES.includes(type)) return type;
    if (/^image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name ?? '')) {
      throw new Error('Converta fotos HEIC/HEIF para JPEG, PNG ou WebP antes de adicioná-las.');
    }
    if (!file.type) {
      throw new Error(
        'O dispositivo não informou o formato da imagem. Use um arquivo com extensão .jpg, .jpeg, .png ou .webp.',
      );
    }
    throw new Error('Use imagens JPEG, PNG ou WebP. O formato informado não é compatível.');
  });
}

function imageTypeFromExtension(extension?: string): string {
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return '';
}
