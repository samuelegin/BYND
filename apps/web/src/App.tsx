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
      {!isHome && <div className="scanline" />}
      <Navbar />
      <main className={clsx(!isHome && 'pt-16')}>
        <Routes>
          <Route path="/"          element={<HomePage />} />
          <Route path="/terminal"  element={<TerminalPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/keeper"    element={<KeeperPage />} />
        </Routes>
      </main>
      {!isHome && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-acid px-6 py-2 text-void text-[10px] font-mono tracking-widest text-center uppercase font-bold">
          Deposit veMEZO → Get liquid veBYND → Stake → Earn MUSD Rewards
        </div>
      )}
      <Footer />
    </>
  );
}
