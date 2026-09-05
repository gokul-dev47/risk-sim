import {
  ShieldCheck,
  LayoutDashboard,
  Activity,
  BarChart3,
  ScrollText,
  Cpu,
  Radar,
  SlidersHorizontal,
  GitCompare,
  PlayCircle,
  Gavel,
  CreditCard,
  X,
} from 'lucide-react';
import type { ViewKey } from '@/types';

interface SidebarProps {
  active: ViewKey;
  onNavigate: (view: ViewKey) => void;
  mobileOpen: boolean;
  onClose: () => void;
}

const navItems: {
  key: ViewKey;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'transactions', label: 'Live Transactions', icon: Activity },
  { key: 'analytics', label: 'Risk Analytics', icon: BarChart3 },
  { key: 'adaptive', label: 'Adaptive Risk Mgmt', icon: Radar },
  { key: 'whatif', label: 'What-If Simulator', icon: SlidersHorizontal },
  { key: 'rulecompare', label: 'Rules vs AI', icon: GitCompare },
  { key: 'demo', label: 'Demo Scenario', icon: PlayCircle },
  { key: 'jury', label: 'Jury Injection', icon: Gavel },
  { key: 'audit', label: 'Audit Trail', icon: ScrollText },
  { key: 'model', label: 'Model Performance', icon: Cpu },
  { key: 'razorpay', label: 'Razorpay Test', icon: CreditCard },
];

export default function Sidebar({
  active,
  onNavigate,
  mobileOpen,
  onClose,
}: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed lg:sticky top-0 left-0 z-50 h-screen w-64 shrink-0
          bg-soc-surface/80 backdrop-blur-2xl
          flex flex-col
          border-r border-soc-border
          transition-transform duration-300 ease-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo area */}
        <div className="px-5 py-6 border-b border-soc-border relative isolate overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-soc-primary/10 blur-3xl -z-10" />

          <div className="relative z-10 flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-soc-primary/30 blur-lg rounded-xl" />

              <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-soc-primary to-soc-secondary flex items-center justify-center shadow-lg shadow-soc-primary/20">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
            </div>

            <div className="min-w-0">
              <h1 className="text-sm font-bold text-soc-text tracking-wide leading-tight font-sans whitespace-nowrap">
                <span className="block">THREAT</span>
                <span className="block">INTELLIGENCE</span>
              </h1>

              <p className="text-[10px] text-soc-secondary font-mono uppercase tracking-[0.15em] mt-0.5 whitespace-nowrap">
                AI Security Operations
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="lg:hidden absolute top-5 right-4 z-10 text-soc-muted hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-5 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;

            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group relative overflow-hidden ${
                  isActive
                    ? 'text-white'
                    : 'text-soc-muted hover:text-soc-text hover:bg-white/[0.03]'
                }`}
              >
                {isActive && (
                  <>
                    <span className="absolute inset-0 bg-gradient-to-r from-soc-primary/15 to-soc-secondary/5 border border-soc-primary/25 rounded-xl" />

                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-r-full bg-gradient-to-b from-soc-primary to-soc-secondary shadow-[0_0_10px_rgba(51,149,255,0.6)]" />
                  </>
                )}

                <Icon
                  className={`w-4 h-4 relative transition-colors ${
                    isActive
                      ? 'text-soc-primary'
                      : 'text-soc-muted group-hover:text-soc-secondary'
                  }`}
                />

                <span className="relative">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer status */}
        <div className="px-4 py-4 border-t border-soc-border">
          <div className="glass rounded-xl p-3.5 relative overflow-hidden">
            <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-soc-success/10 blur-2xl" />

            <div className="relative">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-soc-success animate-pulse-dot" />

                <span className="text-xs font-semibold text-soc-success tracking-wide">
                  SYSTEM SECURE
                </span>
              </div>

              <p className="text-[10px] text-soc-muted font-mono">
                Synthetic Environment
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}