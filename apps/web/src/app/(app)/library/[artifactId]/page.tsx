'use client';
import { useParams } from 'next/navigation';
import ArtifactDetail from '@/components/library/ArtifactDetail';

export default function ArtifactPage() {
  const { artifactId } = useParams<{ artifactId: string }>();
  return <ArtifactDetail id={decodeURIComponent(artifactId)} />;
}
