"""Per-decision explainability using SHAP TreeExplainer.

Turns raw SHAP contribution values into a short, plain-English reasoning
string plus a ranked list of contributing features, so a human analyst
looking at the Audit Trail can see *why* a transaction was flagged instead
of trusting an opaque probability.
"""

from __future__ import annotations

import numpy as np
import shap
from sklearn.ensemble import RandomForestClassifier

FEATURE_LABELS = {
    "velocity_1h": "transaction velocity in the last hour",
    "geo_mismatch": "billing/session country mismatch",
    "cvv_failure_rate": "historical CVV failure rate on this device",
    "amount_log": "transaction amount",
    "is_small_amount": "micro-authorization amount",
    "distinct_cards_1h": "number of different cards tried by this device in the last hour",
}

from risk_engine.feature_schema import FEATURE_COLUMNS


class Explainer:
    def __init__(self, model: RandomForestClassifier):
        self._explainer = shap.TreeExplainer(model)

    def explain(self, feature_row: dict) -> dict:
        """Return top contributing features (signed SHAP values toward the
        'suspicious' class) and a plain-English one-line summary.
        """
        import pandas as pd

        x = pd.DataFrame([feature_row], columns=FEATURE_COLUMNS)
        raw = self._explainer.shap_values(x)
        arr = np.array(raw)

        # Handle both possible SHAP output layouts across versions:
        # (n_samples, n_features, n_classes) or a list of per-class arrays.
        if arr.ndim == 3:
            contributions = arr[0, :, 1]  # class 1 = suspicious
        else:
            contributions = arr[1][0] if isinstance(raw, list) else arr[0]

        contribs = list(zip(FEATURE_COLUMNS, contributions))
        contribs.sort(key=lambda item: abs(item[1]), reverse=True)

        top = contribs[:3]
        factors = []
        for name, value in top:
            direction = "increased" if value > 0 else "decreased"
            factors.append(
                {
                    "feature": name,
                    "label": FEATURE_LABELS.get(name, name),
                    "value": round(float(feature_row.get(name, 0)), 4),
                    "shap_contribution": round(float(value), 5),
                    "direction": direction,
                }
            )

        raising = [f for f in factors if f["direction"] == "increased"]
        if raising:
            summary = "Flagged mainly due to " + ", ".join(
                f["label"] for f in raising
            ) + "."
        else:
            summary = "No strong risk-raising factors identified; scored low risk."

        return {"top_factors": factors, "summary": summary}
