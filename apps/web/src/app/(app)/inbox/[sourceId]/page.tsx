'use client';
import { useParams } from 'next/navigation';
import SourceReview from '@/components/review/SourceReview';

const safeDecode = (v: string) => { try { return decodeURIComponent(v); } catch { return v; } }; // AUD-26: malformed ids show Not found

export default function SourceReviewPage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const id = safeDecode(sourceId ?? '');
  return <SourceReview key={id} sourceId={id} />;
}
