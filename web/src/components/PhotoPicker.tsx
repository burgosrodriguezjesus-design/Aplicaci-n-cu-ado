import { useRef, useState } from 'react';
import { Camera, LoaderCircle, X } from 'lucide-react';
import { imageUrl, uploadImage } from '../lib/image';
import { useToast } from './Toast';
import { cx } from './ui';

/** Selector de fotos: cámara o galería. Las fotos se comprimen en el móvil antes de subirlas. */
export function PhotoPicker({
  value,
  onChange,
  multiple = true,
  label = 'Añadir foto',
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  multiple?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  const toast = useToast();

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = multiple ? [...files] : [files[0]];
    setBusy(list.length);
    const ids: number[] = [];
    for (const f of list) {
      try {
        ids.push(await uploadImage(f));
      } catch (e) {
        toast.show((e as Error).message || 'No se pudo subir la foto', 'error');
      }
      setBusy((b) => b - 1);
    }
    onChange(multiple ? [...value, ...ids] : ids.slice(0, 1));
    if (input.current) input.current.value = '';
  };

  return (
    <div className="flex flex-wrap gap-2.5">
      {value.map((id) => (
        <div key={id} className="relative">
          <button type="button" onClick={() => setPreview(id)} className="block">
            <img src={imageUrl(id)} alt="" className="h-24 w-24 rounded-xl object-cover border border-cream-300" />
          </button>
          <button
            type="button"
            aria-label="Quitar foto"
            onClick={() => onChange(value.filter((x) => x !== id))}
            className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-choco-800 text-white flex items-center justify-center shadow"
          >
            <X size={16} />
          </button>
        </div>
      ))}
      {(multiple || value.length === 0) && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy > 0}
          className={cx(
            'h-24 w-24 rounded-xl border-2 border-dashed border-cream-300 bg-white flex flex-col items-center justify-center gap-1 text-choco-500 text-xs font-bold hover:border-berry-200 hover:text-berry-600 transition',
          )}
        >
          {busy > 0 ? <LoaderCircle className="animate-spin" /> : <Camera size={26} />}
          {busy > 0 ? 'Subiendo…' : label}
        </button>
      )}
      <input ref={input} type="file" accept="image/*" multiple={multiple} hidden onChange={(e) => onFiles(e.target.files)} />
      {preview && <PhotoViewer id={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

export function PhotoViewer({ id, onClose }: { id: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4 anim-fade" onClick={onClose} role="dialog" aria-modal="true">
      <img src={imageUrl(id)} alt="" className="max-h-full max-w-full rounded-xl" />
      <button type="button" aria-label="Cerrar" className="absolute top-4 right-4 h-11 w-11 rounded-full bg-white/20 text-white flex items-center justify-center" onClick={onClose}>
        <X size={24} />
      </button>
    </div>
  );
}
