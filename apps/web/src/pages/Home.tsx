import { useWallet } from "@/hooks/useWallet";
import {
  Hero,
  StatsBar,
  Glance,
  HowItWorks,
  RevenueStreams,
  WhyBynd,
} from "@/components/home";

export default function HomePage() {
  const { isConnected, isConnecting, connect } = useWallet();

  return (
    <div className="min-h-screen">
      <Hero isConnected={isConnected} isConnecting={isConnecting} connect={connect} />
      <StatsBar />
      <Glance />
      <HowItWorks />
      <RevenueStreams />
      <WhyBynd />
    </div>
  );
}
