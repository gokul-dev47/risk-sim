import { useState } from 'react';
import { FileText, Download, Loader2, Search } from 'lucide-react';
import { getEvidencePack } from '@/services/api';
import type { EvidencePackResult } from '@/services/api';

export default function EvidencePackLookup() {
  const [transactionId, setTransactionId] = useState('');
  const [result, setResult] = useState<EvidencePackResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLookup() {
    if (!transactionId.trim() || isLoading) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await getEvidencePack(transactionId.trim());
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the backend.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    const blob = new Blob([result.report_markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evidence-report-${result.transaction_id}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 text-soc-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-soc-text">Risk Decision Evidence Pack</h3>
      </div>
      <p className="mb-4 text-xs text-soc-muted">
        Look up a transaction ID from the log below to generate a structured, tamper-evident report of the risk
        engine's decision reasoning — one input for a chargeback dispute response.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={transactionId}
          onChange={(e) => setTransactionId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
          placeholder="Paste a transaction ID…"
          className="flex-1 rounded-lg border border-soc-border bg-soc-card px-3 py-1.5 text-xs text-soc-text font-mono focus:border-soc-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={handleLookup}
          disabled={isLoading || !transactionId.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-soc-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-soc-primary/90 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Look up
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-soc-danger">{error}</p>}

      {result && !result.found && (
        <p className="mt-3 text-xs text-soc-muted">
          No audit events found for this transaction ID in the current session.
        </p>
      )}

      {result && result.found && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-soc-border bg-soc-card px-3 py-2">
            <div className="text-xs text-soc-muted">
              {result.event_count} event(s) found —{' '}
              <span className={result.chain_intact ? 'text-soc-success' : 'text-soc-danger'}>
                {result.chain_intact ? 'chain intact' : 'INTEGRITY FAILED'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-lg border border-soc-success/30 bg-soc-success/15 px-3 py-1.5 text-xs font-medium text-soc-success hover:bg-soc-success/25 transition-colors"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download Report (.md)
            </button>
          </div>
          <pre className="max-h-64 overflow-auto rounded-lg border border-soc-border bg-soc-card p-3 text-[11px] text-soc-muted whitespace-pre-wrap font-mono">
            {result.report_markdown}
          </pre>
        </div>
      )}
    </div>
  );
}
