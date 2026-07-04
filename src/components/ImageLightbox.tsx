'use client';

import Image from 'next/image';
import { useEffect } from 'react';
import { Trash2, X } from 'lucide-react';
import type { ImageAttachment } from '@/types';

interface ImageLightboxProps {
  image: ImageAttachment;
  onClose: () => void;
  onDelete?: () => void;
}

export function ImageLightbox({ image, onClose, onDelete }: ImageLightboxProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/92 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-[101] flex h-11 w-11 items-center justify-center rounded-full bg-benz-surface/80 border border-benz-surface-3 text-benz-silver hover:text-white transition-colors touch-target"
        aria-label="Close image"
      >
        <X size={22} />
      </button>

      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-4 left-4 z-[101] flex h-11 items-center gap-2 rounded-full benz-danger-btn px-4 text-sm touch-target border-none"
          aria-label="Delete image"
        >
          <Trash2 size={18} />
          Delete
        </button>
      )}

      <div
        className="relative h-[85vh] w-[min(90vw,1200px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={image.url}
          alt={image.name}
          fill
          unoptimized
          className="rounded-benz-lg object-contain shadow-benz-lg"
          sizes="90vw"
        />
      </div>

      <div className="absolute bottom-5 left-1/2 max-w-[90vw] -translate-x-1/2 truncate rounded-full bg-benz-surface/80 border border-benz-surface-3 px-4 py-2 text-xs text-benz-silver">
        {image.name}
      </div>
    </div>
  );
}