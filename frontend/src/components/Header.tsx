import { useEffect, useState } from 'react';
import { Wifi, Bell, Menu } from 'lucide-react';
import { getSystemStatus } from '@/services/api';

interface HeaderProps {
  title: string;
  subtitle: string;
  onMenuClick: () => void;
}

const POLL_MS = 4000;

export default function Header({ title, subtitle, onMenuClick }: HeaderProps) {
  const [breakerOpen, setBreakerOpen] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getSystemStatus().then((result) => {
        if (!cancelled && result.source === 'backend') {
          setBreakerOpen(result.data.breaker_open);
          setModelLoaded(result.data.model_loaded);
        }
      });
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const isDegraded = breakerOpen || !modelLoaded;

  return (
    <header className="border-b border-soc-border bg-soc-surface/50 backdrop-blur-2xl px-5 lg:px-8 py-4 sticky top-0 z-30">
      <div className="flex items-center justify-between gap-4">
        {/* Left */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 -ml-1 text-soc-muted hover:text-white rounded-lg hover:bg-white/5"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-lg lg:text-xl font-bold text-soc-text tracking-tight font-sans truncate">
              {title}
            </h2>
            <p className="text-xs lg:text-sm text-soc-muted mt-0.5 truncate">{subtitle}</p>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Live feed */}
          <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg glass">
            <Wifi className="w-3.5 h-3.5 text-soc-secondary" />
            <span className="text-xs font-mono text-soc-muted tracking-wide">LIVE FEED</span>
            <span className="w-1.5 h-1.5 rounded-full bg-soc-secondary animate-pulse-cyan" />
          </div>

          {/* Notification */}
          <button className="relative p-2.5 rounded-lg glass glass-cyan-hover">
            <Bell className="w-4 h-4 text-soc-muted" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-soc-danger ring-2 ring-soc-surface" />
          </button>

          {/* AI engine status — reflects the real circuit breaker, not a hardcoded badge */}
          <div
            className={`flex items-center gap-2.5 px-3 lg:px-4 py-2 rounded-lg glass ${
              isDegraded ? 'border-soc-danger/30' : 'border-soc-success/20'
            }`}
            title={isDegraded ? 'Circuit breaker open — deterministic rule engine is scoring transactions' : 'ML fusion engine scoring transactions normally'}
          >
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${
                  isDegraded ? 'bg-soc-danger animate-ping' : 'bg-soc-success animate-ping'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isDegraded ? 'bg-soc-danger' : 'bg-soc-success'
                }`}
              />
            </span>
            <span
              className={`text-xs lg:text-sm font-semibold tracking-wide ${
                isDegraded ? 'text-soc-danger' : 'text-soc-success'
              }`}
            >
              {isDegraded ? 'Fallback Mode — Rule Engine' : 'AI Engine Online'}
            </span>
          </div>

          {/* Avatar */}
          <div className="hidden sm:flex w-9 h-9 rounded-full bg-gradient-to-br from-soc-primary to-soc-secondary items-center justify-center text-xs font-bold text-white shadow-lg shadow-soc-primary/20">
            SOC
          </div>
        </div>
      </div>
    </header>
  );
}
