import { Routes, Route, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import HomePage from '@/pages/Home';
import TerminalPage from '@/pages/Terminal';
import AnalyticsPage from '@/pages/Analytics';
import KeeperPage from '@/pages/Keeper';

export function App() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <>
      {!isHome && <div className="noise-overlay" />}
      <Navbar />
      <main className={clsx(!isHome && 'pt-28')}>
        <Routes>
          <Route path="/"          element={<HomePage />} />
          <Route path="/terminal"  element={<TerminalPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/keeper"    element={<KeeperPage />} />
        </Routes>
      </main>
      {!isHome && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-gold px-6 py-2 text-center text-gold-ink text-sm font-medium">
          Deposit veMEZO → get liquid veBYND → stake → earn MUSD rewards
        </div>
      )}
      <Footer />
    </>
  );
}
