import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ErrorBoundary from '@/components/ErrorBoundary';
import DashboardView from '@/views/DashboardView';
import TransactionsView from '@/views/TransactionsView';
import AnalyticsView from '@/views/AnalyticsView';
import AuditView from '@/views/AuditView';
import ModelView from '@/views/ModelView';
import AdaptiveView from '@/views/AdaptiveView';
import WhatIfView from '@/views/WhatIfView';
import RuleComparisonView from '@/views/RuleComparisonView';
import DemoScenarioView from '@/views/DemoScenarioView';
import JuryInjectionView from '@/views/JuryInjectionView';
import RazorpayTestPayment from '@/RazorpayTestPayment';
import type { ViewKey } from '@/types';

const viewMeta: Record<ViewKey, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Razorpay Threat Intelligence',
    subtitle: 'AI-Powered Payment Threat Detection & Risk Analysis',
  },
  transactions: {
    title: 'Live Transactions',
    subtitle: 'Real-time synthetic payment monitoring',
  },
  analytics: {
    title: 'Risk Analytics',
    subtitle: 'Feature importance and threat signal analysis',
  },
  audit: {
    title: 'Audit Trail',
    subtitle: 'Chronological security incident log',
  },
  model: {
    title: 'Model Performance',
    subtitle: 'Random Forest classifier evaluation metrics',
  },
  adaptive: {
    title: 'Adaptive Risk Management',
    subtitle: 'Drift-triggered threshold recalibration, cost-optimal thresholding, fusion impact',
  },
  whatif: {
    title: 'What-If Simulator',
    subtitle: 'Interactively probe the model with synthetic transactions',
  },
  rulecompare: {
    title: 'AI vs Traditional Rule Engine',
    subtitle:
      'Where a simple rule holds up — and where multi-feature ML fusion is doing real work.',
  },
  demo: {
    title: 'Demo Scenario',
    subtitle: 'A fixed, four-step walkthrough for live presentations',
  },
  jury: {
    title: 'Jury Transaction Injection',
    subtitle: 'Paste raw transaction JSON — scored live by the real RF + IsolationForest + fusion pipeline',
  },
  razorpay: {
    title: 'Razorpay Test Checkout',
    subtitle:
      'Real Razorpay Test Mode order creation and server-side payment verification',
  },
};

export default function App() {
  const [view, setView] = useState<ViewKey>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);

  const meta = viewMeta[view];

  const handleNavigate = (v: ViewKey) => {
    setView(v);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen flex">
      <Sidebar
        active={view}
        onNavigate={handleNavigate}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={meta.title}
          subtitle={meta.subtitle}
          onMenuClick={() => setMobileOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-5 lg:p-8">
          <ErrorBoundary sectionName={meta.title} key={view}>
            {view === 'dashboard' && <DashboardView />}
            {view === 'transactions' && <TransactionsView />}
            {view === 'analytics' && <AnalyticsView />}
            {view === 'audit' && <AuditView />}
            {view === 'model' && <ModelView />}
            {view === 'adaptive' && <AdaptiveView />}
            {view === 'whatif' && <WhatIfView />}
            {view === 'rulecompare' && <RuleComparisonView />}
            {view === 'demo' && <DemoScenarioView />}
            {view === 'jury' && <JuryInjectionView />}
            {view === 'razorpay' && <RazorpayTestPayment />}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}