import { useParams, Navigate } from 'react-router-dom';
import { DocsLayout } from '@/components/docs/DocsLayout';
import { findDocPage, FIRST_DOC_SLUG } from '@/components/docs/content';

export default function DocsPage() {
  const { slug } = useParams<{ slug?: string }>();
  const page = findDocPage(slug);

  if (!page) {
    return <Navigate to={`/docs/${FIRST_DOC_SLUG}`} replace />;
  }

  return (
    <div className="min-h-screen bg-void">
      <DocsLayout page={page} />
    </div>
  );
}
