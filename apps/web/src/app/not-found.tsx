import Link from 'next/link';

/* An address Capsa doesn't have (Stage 10). */
export default function NotFound() {
  return (
    <main id="main" className="empty" style={{ minHeight: '100vh', padding: '96px 24px' }}>
      <h1 className="page-title">Nothing here</h1>
      <p>Capsa doesn’t have a page at this address. Everything you keep is in your Library or Inbox.</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <Link href="/library" className="btn primary">Go to the Library</Link>
        <Link href="/inbox" className="btn">Inbox</Link>
      </div>
    </main>
  );
}
