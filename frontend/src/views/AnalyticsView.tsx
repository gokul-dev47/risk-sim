import { useState } from 'react';
import { BarChart3, Calendar } from 'lucide-react';
import AnalyticsSummaryCards from '@/components/AnalyticsSummaryCards';
import ThreatDistributionChart from '@/components/ThreatDistributionChart';
import ThreatTimelineChart from '@/components/ThreatTimelineChart';
import RiskAnalyticsChart from '@/components/RiskAnalyticsChart';
import ThreatSignalMatrix from '@/components/ThreatSignalMatrix';
import ModelInsightPanel from '@/components/ModelInsightPanel';
import ThreatAlertPanel from '@/components/ThreatAlertPanel';

type DateRange = '24h' | '7d' | '14d';

const dateRangeLabels: Record<DateRange, string> = {
  '24h': 'Last 24 Hours',
  '7d': 'Last 7 Days',
  '14d': 'Last 14 Days',
};

export default function AnalyticsView() {
  const [dateRange, setDateRange] = useState<DateRange>('24h');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-soc-primary" />
          <h3 className="text-base font-semibold text-soc-text font-sans">RISK ANALYTICS</h3>
        </div>

        {/* Date range selector */}
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-soc-muted" />
          <div className="flex items-center gap-1 p-1 rounded-lg glass">
            {(Object.keys(dateRangeLabels) as DateRange[]).map(r => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-semibold tracking-wide transition-all ${
                  dateRange === r
                    ? 'bg-soc-primary/15 text-soc-text border border-soc-primary/25'
                    : 'text-soc-muted hover:text-soc-text border border-transparent'
                }`}
              >
                {dateRangeLabels[r]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-sm text-soc-muted -mt-2">Threat patterns and machine-learning risk insights from synthetic payment activity.</p>

      <div className="flex items-center gap-2 rounded-lg border border-soc-warning/30 bg-soc-warning/10 px-3 py-2 text-xs text-soc-warning">
        <BarChart3 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span>
          <strong>Mixed data sources on this page.</strong> The threat distribution, timeline, and signal-matrix
          charts below use fixed, static example figures for visual demonstration — not live backend data or
          persisted transaction history, and the date-range selector does not filter them. The feature-importance
          chart is real, live model output (fetched from the backend). For other real, backend-verified figures,
          see the Model tab (trained model metrics) and the Adaptive tab (adaptive-effectiveness experiment, cost
          curve, evasion analysis, load test — all fetched live).
        </span>
      </div>

      {/* Summary cards */}
      <AnalyticsSummaryCards />

      {/* Threat distribution + high-risk alert */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ThreatDistributionChart />
        </div>
        <div className="lg:col-span-1">
          <ThreatAlertPanel />
        </div>
      </div>

      {/* Timeline */}
      <ThreatTimelineChart />

      {/* Feature importance + signal matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RiskAnalyticsChart />
        <ThreatSignalMatrix />
      </div>

      {/* Model insight */}
      <ModelInsightPanel />
    </div>
  );
}
