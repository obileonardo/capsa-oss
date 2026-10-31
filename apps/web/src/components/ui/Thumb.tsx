'use client';
import { ImageOff } from '@/components/ui/icons';
import { useBlobUrl } from '@/lib/boards/images';
import s from './thumb.module.css';

/** A stored image (thumbnail by default). Decorative unless `alt` is given. */
export function Thumb({ k, alt = '', className, fit = 'cover' }: { k?: string; alt?: string; className?: string; fit?: 'cover' | 'contain' }) {
  const { url, missing } = useBlobUrl(k);
  if (missing) return <span className={`${s.thumbMissing} ${className ?? ''}`} role={alt ? 'img' : undefined} aria-label={alt ? `${alt} (image file missing)` : undefined}><ImageOff aria-hidden /></span>;
  if (!url) return <span className={`${s.thumbLoading} ${className ?? ''}`} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} style={{ objectFit: fit }} draggable={false} decoding="async" />;
}
