import { useEffect, useRef, useState } from 'react';
import { Wifi, Bell, Menu } from 'lucide-react';
import { getSystemStatus, getAuditChain } from '@/services/api';
import type { AuditChainEntry } from '@/types';

interface HeaderProps {
  title: string;
  subtitle: string;
  onMenuClick: () => void;
}

const POLL_MS = 4000;
const NOTIFY_POLL_MS = 5000;

// Event types worth surfacing as a notification. Routine 'predict' events on
// ALLOW are noisy and are filtered out below.
const NOTIFIABLE_EVENTS = new Set([
  'adaptive_threshold_change',
  'rate_limit_triggered',
  'otp_issued',
  'otp_failed',
  'circuit_breaker_open',
  'circuit_breaker_closed',
]);

function isNotifiable(entry: AuditChainEntry): boolean {
  if (NOTIFIABLE_EVENTS.has(entry.event_type)) return true;
  if (entry.event_type === 'predict') {
    const decision = entry.content?.decision;
    return decision === 'BLOCK' || decision === 'REVIEW';
  }
  return false;
}

function describeEntry(entry: AuditChainEntry): string {
  switch (entry.event_type) {
    case 'predict': {
      const decision = String(entry.content?.decision ?? 'unknown');
      return `Transaction ${decision === 'BLOCK' ? 'blocked' : 'flagged for review'}`;
    }
    case 'adaptive_threshold_change':
      return 'Drift-adaptive thresholds recalibrated';
    case 'rate_limit_triggered':
      return 'Rate limit triggered';
    case 'otp_issued':
      return 'Step-up OTP issued';
    case 'otp_failed':
      return 'OTP verification failed';
    case 'circuit_breaker_open':
      return 'Circuit breaker opened — fallback engine active';
    case 'circuit_breaker_closed':
      return 'Circuit breaker closed — ML engine restored';
    default:
      return entry.event_type;
  }
}

export default function Header({ title, subtitle, onMenuClick }: HeaderProps) {
  const [breakerOpen, setBreakerOpen] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(true);
  const [notifications, setNotifications] = useState<AuditChainEntry[]>([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const lastSeenSequence = useRef<number>(-1);
  const panelRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getAuditChain(50).then((result) => {
        if (cancelled || result.source !== 'backend') return;
        const relevant = result.data.entries.filter(isNotifiable).sort((a, b) => b.sequence - a.sequence);
        setNotifications(relevant.slice(0, 20));
        if (lastSeenSequence.current === -1) {
          // First load: don't retroactively badge existing history.
          lastSeenSequence.current = relevant[0]?.sequence ?? 0;
        } else {
          const newOnes = relevant.filter((e) => e.sequence > lastSeenSequence.current);
          if (newOnes.length > 0) setUnseenCount((c) => c + newOnes.length);
        }
      });
    };
    poll();
    const id = setInterval(poll, NOTIFY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPanel(false);
      }
    }
    if (showPanel) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPanel]);

  const togglePanel = () => {
    setShowPanel((v) => !v);
    if (!showPanel) {
      setUnseenCount(0);
      if (notifications[0]) lastSeenSequence.current = notifications[0].sequence;
    }
  };

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
          <div className="relative" ref={panelRef}>
            <button
              onClick={togglePanel}
              aria-label="Notifications"
              aria-expanded={showPanel}
              className="relative p-2.5 rounded-lg glass glass-cyan-hover"
            >
              <Bell className="w-4 h-4 text-soc-muted" />
              {unseenCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-soc-danger ring-2 ring-soc-surface" />
              )}
            </button>

            {showPanel && (
              <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg glass border border-soc-border shadow-xl z-40">
                <div className="px-4 py-3 border-b border-soc-border">
                  <h3 className="text-sm font-semibold text-soc-text">Notifications</h3>
                  <p className="text-[11px] text-soc-muted">From the live audit chain</p>
                </div>
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-soc-muted text-center">No audit events yet.</p>
                ) : (
                  <ul className="divide-y divide-soc-border">
                    {notifications.map((entry) => (
                      <li key={entry.sequence} className="px-4 py-3 hover:bg-white/5">
                        <p className="text-xs font-medium text-soc-text">{describeEntry(entry)}</p>
                        <p className="text-[10px] text-soc-muted mt-0.5">
                          {new Date(entry.timestamp * 1000).toLocaleTimeString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

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
