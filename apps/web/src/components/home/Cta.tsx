import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";

interface CtaProps {
  isConnected: boolean;
  connect: () => void;
}

export function Cta({ isConnected, connect }: CtaProps) {
  return (
    <section className="max-w-7xl mx-auto px-6 lg:px-8 py-24">
      <div className="relative border border-acid/20 bg-acid/3 clip-corner p-12 md:p-16 text-center overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-acid/60 to-transparent" />

        <div className="relative">
          <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-acid font-bold mb-4">
            Ready to optimise your boost?
          </p>
          <h2 className="text-5xl md:text-6xl font-black text-silver mb-6 leading-none">
            Mint veBYND.
            <br />
            Earn Rewards.
          </h2>
          <p className="text-silver-dim max-w-lg mx-auto mb-10 leading-relaxed">
            BynD aggregates veMEZO into a dominant permanent boost block,
            capturing bribe rewards in any token for every veBYND staker.
            Deposit veMEZO, receive veBYND, stake for real yield.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {isConnected ? (
              <Link to="/terminal">
                <Button variant="primary" size="lg">
                  Open Terminal <ArrowRight size={14} />
                </Button>
              </Link>
            ) : (
              <Button variant="primary" size="lg" onClick={() => connect()}>
                Initialize System <ArrowRight size={14} />
              </Button>
            )}
            <a
              href="https://docs.mezo.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="ghost" size="lg">
                Read the Docs
              </Button>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
