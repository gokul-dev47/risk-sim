"""Generate synthetic payment transactions for defensive ML research.

Produces only fake data. No live payment processors or real card numbers
are used.

v2 design goal: earlier versions made "suspicious" trivially separable from
"normal" (e.g. amount alone gave ROC-AUC = 1.0), which is not a credible
threat model and does not reflect how card-testing/BIN-attack traffic
actually looks against a busy merchant. This version deliberately creates
overlapping feature distributions across three realistic attack subtypes,
plus noisy normal traffic (travelers, shared devices, fat-fingered CVVs,
legitimate micro-transactions), so a model must learn a genuine decision
boundary instead of thresholding a single field.
"""

from __future__ import annotations

import hashlib
import random
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
from faker import Faker

RANDOM_SEED = 42
N_NORMAL = 36_000
N_SUSPICIOUS = 2_700

CURRENCIES = ("INR", "USD", "EUR")
COUNTRIES = ("IN", "US", "GB", "SG", "AE", "DE", "AU")
MERCHANTS = (
    "NovaMart",
    "CloudCart",
    "PixelPay Store",
    "Harbor Goods",
    "Lumen Digital",
    "Cedar Books",
    "Orbit Travel",
    "Greenleaf Grocery",
)
NORMAL_STATUSES = ("captured", "authorized", "failed")
CVV_RESULTS = ("M", "N", "P", "U")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = PROJECT_ROOT / "data" / "raw" / "threat_dataset.csv"


def _seed_all(seed: int) -> Faker:
    random.seed(seed)
    fake = Faker()
    Faker.seed(seed)
    fake.seed_instance(seed)
    return fake


def _hash_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _random_timestamp(fake: Faker, start: datetime, end: datetime) -> datetime:
    return fake.date_time_between(start_date=start, end_date=end)


def _generate_normal_rows(fake: Faker, start: datetime, end: datetime) -> list[dict]:
    rows: list[dict] = []
    shared_devices = [_hash_value(f"shared-device-{i}") for i in range(15)]

    for i in range(N_NORMAL):
        country = random.choice(COUNTRIES)
        roll = random.random()

        if roll < 0.07:
            billing_country = random.choice([c for c in COUNTRIES if c != country])
        else:
            billing_country = country

        payment_status = random.choices(NORMAL_STATUSES, weights=(0.88, 0.07, 0.05), k=1)[0]
        cvv_result = random.choices(CVV_RESULTS, weights=(0.85, 0.06, 0.05, 0.04), k=1)[0]
        pan_token = fake.credit_card_number()

        use_shared_device = random.random() < 0.05
        device_fp = (
            random.choice(shared_devices)
            if use_shared_device
            else _hash_value(f"{fake.user_agent()}|{fake.uuid4()}")
        )

        if random.random() < 0.06:
            amount = round(random.uniform(1.0, 10.0), 2)
        else:
            amount = round(random.uniform(120.0, 18500.0), 2)

        rows.append(
            {
                "transaction_id": f"txn_n_{i:06d}",
                "timestamp": _random_timestamp(fake, start, end),
                "amount": amount,
                "currency": random.choices(CURRENCIES, weights=(0.7, 0.2, 0.1), k=1)[0],
                "merchant": random.choice(MERCHANTS),
                "card_hash": _hash_value(pan_token),
                "device_fingerprint": device_fp,
                "ip_address": fake.ipv4_public(),
                "country": country,
                "billing_country": billing_country,
                "payment_status": payment_status,
                "cvv_result": cvv_result,
                "label": 0,
                "attack_subtype": "none",
            }
        )
    return rows


def _generate_classic_burst_rows(fake: Faker, burst_start: datetime, n: int) -> list[dict]:
    tester_devices = [_hash_value(f"tester-device-{i}") for i in range(4)]
    tester_ips = [fake.ipv4_public() for _ in range(6)]
    tester_merchant = "Lumen Digital"
    origin_country = "US"

    rows: list[dict] = []
    for i in range(n):
        seconds_offset_step = random.randint(2, 12) if random.random() > 0.2 else random.randint(60, 240)
        timestamp = burst_start + timedelta(seconds=i * seconds_offset_step)
        payment_status = random.choices(
            ("declined", "failed", "authorized"), weights=(0.58, 0.28, 0.14), k=1
        )[0]
        cvv_result = random.choices(("N", "U", "P", "M"), weights=(0.5, 0.2, 0.15, 0.15), k=1)[0]
        pan_token = fake.credit_card_number()
        amount = round(random.uniform(0.5, 15.0), 2)

        rows.append(
            {
                "transaction_id": f"txn_s_burst_{i:06d}",
                "timestamp": timestamp,
                "amount": amount,
                "currency": "USD",
                "merchant": tester_merchant,
                "card_hash": _hash_value(pan_token),
                "device_fingerprint": random.choice(tester_devices),
                "ip_address": random.choice(tester_ips),
                "country": origin_country,
                "billing_country": random.choice(("IN", "BR", "NG", "RU", "VN", "PH")),
                "payment_status": payment_status,
                "cvv_result": cvv_result,
                "label": 1,
                "attack_subtype": "classic_burst",
            }
        )
    return rows


def _generate_low_and_slow_rows(fake: Faker, window_start: datetime, window_end: datetime, n: int) -> list[dict]:
    ring_devices = [_hash_value(f"lns-device-{i}") for i in range(3)]
    ring_ips = [fake.ipv4_public() for _ in range(5)]

    rows: list[dict] = []
    for i in range(n):
        timestamp = _random_timestamp(fake, window_start, window_end)
        payment_status = random.choices(
            ("declined", "failed", "authorized"), weights=(0.45, 0.25, 0.30), k=1
        )[0]
        cvv_result = random.choices(("N", "U", "P", "M"), weights=(0.45, 0.2, 0.15, 0.2), k=1)[0]
        pan_token = fake.credit_card_number()
        country = "US"
        billing_country = (
            country if random.random() < 0.2 else random.choice(("IN", "BR", "NG", "RU", "VN", "PH"))
        )

        rows.append(
            {
                "transaction_id": f"txn_s_lns_{i:06d}",
                "timestamp": timestamp,
                "amount": round(random.uniform(50.0, 400.0), 2),
                "currency": random.choice(("USD", "EUR")),
                "merchant": random.choice(MERCHANTS),
                "card_hash": _hash_value(pan_token),
                "device_fingerprint": random.choice(ring_devices),
                "ip_address": random.choice(ring_ips),
                "country": country,
                "billing_country": billing_country,
                "payment_status": payment_status,
                "cvv_result": cvv_result,
                "label": 1,
                "attack_subtype": "low_and_slow",
            }
        )
    return rows


def _generate_bin_enumeration_rows(fake: Faker, burst_start: datetime, n: int) -> list[dict]:
    many_devices = [_hash_value(f"bin-device-{i}") for i in range(40)]
    many_ips = [fake.ipv4_public() for _ in range(40)]

    rows: list[dict] = []
    for i in range(n):
        seconds_offset = i * random.randint(1, 6)
        timestamp = burst_start + timedelta(seconds=seconds_offset)
        payment_status = random.choices(
            ("declined", "failed", "authorized"), weights=(0.7, 0.2, 0.10), k=1
        )[0]
        cvv_result = random.choices(("N", "U", "P", "M"), weights=(0.6, 0.15, 0.15, 0.1), k=1)[0]
        pan_token = f"411111{i:010d}"
        country = "IN"
        billing_country = country if random.random() < 0.3 else random.choice(("US", "GB", "SG", "AE"))

        rows.append(
            {
                "transaction_id": f"txn_s_bin_{i:06d}",
                "timestamp": timestamp,
                "amount": round(random.uniform(5.0, 60.0), 2),
                "currency": "INR",
                "merchant": random.choice(MERCHANTS),
                "card_hash": _hash_value(pan_token),
                "device_fingerprint": random.choice(many_devices),
                "ip_address": random.choice(many_ips),
                "country": country,
                "billing_country": billing_country,
                "payment_status": payment_status,
                "cvv_result": cvv_result,
                "label": 1,
                "attack_subtype": "bin_enumeration",
            }
        )
    return rows


def _generate_shared_device_multicard_rows(fake: Faker, window_start: datetime, window_end: datetime, n_clusters: int) -> list[dict]:
    """Genuinely legitimate normal traffic (label=0) that deliberately
    creates realistic overlap with the distinct_cards_1h signal.

    Without this, distinct_cards_1h is structurally almost perfectly
    discriminative: normal transactions get a fresh, unique device per
    row (so distinct_cards_1h stays ~0-1), while EVERY attack subtype by
    construction funnels many different card_hashes through a small
    device pool. That gap isn't a real fraud signal, it's an artifact of
    how the generator assigns devices -- exactly the "model learns the
    generator's own rigging" failure mode this project's earlier
    dataset-realism work exists to avoid (see generate_threat_data.py's
    module docstring). Real family/shared/retail devices legitimately
    process several different people's cards within a short window (a
    shared home computer, a small retail terminal), so this generates
    clusters of genuinely clean transactions with elevated
    distinct_cards_1h to remove that artifact.
    """
    rows: list[dict] = []
    span = window_end - window_start
    row_index = 0

    for cluster_i in range(n_clusters):
        device_fp = _hash_value(f"family-shared-device-{cluster_i}")
        cluster_start = window_start + timedelta(seconds=random.uniform(0, span.total_seconds()))
        n_in_cluster = random.randint(2, 5)
        country = random.choice(COUNTRIES)

        for j in range(n_in_cluster):
            timestamp = cluster_start + timedelta(minutes=random.uniform(0, 50))
            pan_token = fake.credit_card_number()
            rows.append(
                {
                    "transaction_id": f"txn_n_shared_{cluster_i:04d}_{j:02d}",
                    "timestamp": timestamp,
                    "amount": round(random.uniform(120.0, 18500.0), 2),
                    "currency": random.choices(CURRENCIES, weights=(0.7, 0.2, 0.1), k=1)[0],
                    "merchant": random.choice(MERCHANTS),
                    "card_hash": _hash_value(pan_token),
                    "device_fingerprint": device_fp,
                    "ip_address": fake.ipv4_public(),
                    "country": country,
                    "billing_country": country,
                    "payment_status": random.choices(NORMAL_STATUSES, weights=(0.9, 0.06, 0.04), k=1)[0],
                    "cvv_result": random.choices(CVV_RESULTS, weights=(0.9, 0.04, 0.03, 0.03), k=1)[0],
                    "label": 0,
                    "attack_subtype": "none",
                }
            )
            row_index += 1
    return rows


def generate_dataset() -> pd.DataFrame:
    fake = _seed_all(RANDOM_SEED)
    window_end = datetime(2026, 8, 30, 18, 0, 0)
    window_start = window_end - timedelta(days=14)
    burst_start = window_end - timedelta(hours=3)
    lns_start = window_end - timedelta(days=5)

    n_classic = int(N_SUSPICIOUS * 0.55)
    n_lns = int(N_SUSPICIOUS * 0.27)
    n_bin = N_SUSPICIOUS - n_classic - n_lns

    # ~350 clusters of 2-5 rows each -> roughly 3% of N_NORMAL, enough to
    # give distinct_cards_1h genuine overlap without diluting the overall
    # normal/attack ratio in any way that matters.
    n_shared_device_clusters = max(1, N_NORMAL // 100)

    rows = _generate_normal_rows(fake, window_start, window_end)
    rows.extend(_generate_shared_device_multicard_rows(fake, window_start, window_end, n_shared_device_clusters))
    rows.extend(_generate_classic_burst_rows(fake, burst_start, n_classic))
    rows.extend(_generate_low_and_slow_rows(fake, lns_start, window_end, n_lns))
    rows.extend(_generate_bin_enumeration_rows(fake, burst_start - timedelta(hours=6), n_bin))

    frame = pd.DataFrame(rows)
    frame = frame.sort_values("timestamp").reset_index(drop=True)
    return frame


def main() -> None:
    frame = generate_dataset()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(OUTPUT_PATH, index=False)
    print(f"Dataset generated: {len(frame)} total records.")
    print(frame["attack_subtype"].value_counts())


if __name__ == "__main__":
    main()
