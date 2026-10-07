import { api } from './api';

/** Reduce y comprime la foto en el propio móvil antes de subirla. */
export async function compressImage(file: File, maxSize = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('No se pudo leer la imagen'));
      i.src = url;
    });
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir'))), 'image/jpeg', quality),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadImage(file: File): Promise<number> {
  const blob = await compressImage(file);
  const r = await api<{ id: number }>('/images', { method: 'POST', raw: blob });
  return r.id;
}

// Cada pastelería numera sus fotos desde 1: su número va en la dirección para que la
// caché del navegador no mezcle fotos si en el mismo dispositivo se cambia de pastelería.
let bakery = 0;
export const setImageBakery = (id: number) => {
  bakery = id;
};
export const imageUrl = (id: number) => `/api/images/${id}?b=${bakery}`;
