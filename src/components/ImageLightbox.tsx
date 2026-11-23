import { X } from 'lucide-react';
import { useEffect } from 'react';

interface ImageLightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  useEffect(() => {
    if (!src) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр скриншота"
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="truncate text-sm font-medium text-zinc-300">
          {alt || 'Скриншот'}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть просмотр"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-1 items-center justify-center overflow-auto p-3"
      >
        <img
          src={src}
          alt={alt || 'Скриншот интерфейса'}
          referrerPolicy="no-referrer"
          className="max-h-full max-w-full rounded-xl object-contain"
        />
      </div>
    </div>
  );
}
