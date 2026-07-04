import { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import {
  Ticker,
  Hero,
  StatsBar,
  HowItWorks,
  RevenueStreams,
  WhyBynd,
  Cta,
} from "@/components/home";

export default function HomePage() {
  const { isConnected, isConnecting, connect } = useWallet();
  const [heroVisible, setHeroVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen">
      <Ticker />
      <Hero
        visible={heroVisible}
        isConnected={isConnected}
        isConnecting={isConnecting}
        connect={connect}
      />
      <StatsBar />
      <HowItWorks />
      <RevenueStreams />
      <WhyBynd />
      <Cta isConnected={isConnected} connect={connect} />
    </div>
  );
}
