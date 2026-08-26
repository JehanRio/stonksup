from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.services.journal_analysis import _build_evidence, _extract_symbols


def test_extract_symbols_maps_company_alias_and_trade_symbols() -> None:
    row = SimpleNamespace(
        targets="买 moderna、ibit，各 50% 仓位",
        trades=[SimpleNamespace(symbol="mrna"), SimpleNamespace(symbol="")],
    )

    assert _extract_symbols(row) == ["MRNA", "IBIT"]


def test_market_evidence_uses_latest_bar_and_calculates_levels() -> None:
    rows = []
    for index in range(25):
        close = Decimal(100 + index)
        rows.append(SimpleNamespace(
            trading_date=date(2026, 7, index + 1),
            open=close - 1,
            high=close + 2,
            low=close - 2,
            close=close,
            volume=1_000 + index * 10,
        ))

    evidence = _build_evidence("MRNA", rows)

    assert evidence.symbol == "MRNA"
    assert evidence.as_of == date(2026, 7, 25)
    assert evidence.close == 124
    assert evidence.day_change_pct == 0.81
    assert evidence.ema20 is not None
    assert evidence.atr14 == 4
    assert evidence.high_20d == 126
    assert evidence.low_20d == 103
