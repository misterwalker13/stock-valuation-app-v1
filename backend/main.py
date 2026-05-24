import os
import re
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import Client, create_client
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import yfinance as yf

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

app = FastAPI(
    title="Stock Valuation App API",
    version="0.1.0",
)

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN")

allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

if FRONTEND_ORIGIN:
    allowed_origins.append(FRONTEND_ORIGIN)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TickerSaveRequest(BaseModel):
    tickers: List[str]


TICKER_PATTERN = re.compile(r"^[A-Z][A-Z0-9]{0,24}([.-][A-Z0-9]{1,10})?$")


def clean_tickers(raw_tickers: List[str]) -> List[str]:
    cleaned = []
    seen = set()

    for raw in raw_tickers:
        ticker = raw.strip().upper()

        if not ticker:
            continue

        if not TICKER_PATTERN.match(ticker):
            continue

        if ticker in seen:
            continue

        seen.add(ticker)
        cleaned.append(ticker)

    if len(cleaned) > 100:
        raise HTTPException(
            status_code=400,
            detail="Version 1 supports a maximum of 100 valid tickers."
        )

    return cleaned

def to_yfinance_symbol(ticker: str) -> str:
    """
    Converts app ticker format to yfinance/Yahoo-compatible format.

    Example:
    BRK.B -> BRK-B

    The app still stores/displays BRK.B.
    This only affects the symbol sent to yfinance.
    """
    return ticker.replace(".", "-")

def safe_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None

        return float(value)
    except (TypeError, ValueError):
        return None

def calculate_valuation(
    stock_price: float,
    eps_ttm: float,
    profit_margin: float,
    price_sales_ttm: float,
) -> Dict[str, Any]:
    calculated_price = (eps_ttm / profit_margin) * price_sales_ttm
    potential_return = (calculated_price - stock_price) / stock_price

    if potential_return >= 0.25:
        row_color = "green"
    elif potential_return >= -0.05:
        row_color = "yellow"
    else:
        row_color = "red"

    return {
        "calculated_price_raw": calculated_price,
        "calculated_price_display": f"${calculated_price:,.2f}",
        "potential_return_raw": potential_return,
        "potential_return_display": f"{potential_return * 100:.3f}%",
        "row_color": row_color,
    }

def fetch_yfinance_data(ticker: str) -> Dict[str, Any]:
    """
    Fetches the V1 fields from yfinance.

    Required V1 fields:
    - stock_price
    - eps_ttm
    - profit_margin
    - price_sales_ttm
    """

    try:
        yf_symbol = to_yfinance_symbol(ticker)
        yf_ticker = yf.Ticker(yf_symbol)

        info = yf_ticker.info or {}

        stock_price = safe_float(
            info.get("currentPrice")
            or info.get("regularMarketPrice")
            or info.get("previousClose")
        )

        eps_ttm = safe_float(
            info.get("trailingEps")
            or info.get("epsTrailingTwelveMonths")
        )

        profit_margin = safe_float(info.get("profitMargins"))

        price_sales_ttm = safe_float(
            info.get("priceToSalesTrailing12Months")
        )

        if stock_price is None:
            history = yf_ticker.history(period="5d")

            if history is not None and not history.empty:
                stock_price = safe_float(history["Close"].dropna().iloc[-1])

        sanitized_payload = {
            "ticker": ticker,
            "yfinance_symbol": yf_symbol,
            "stock_price": stock_price,
            "eps_ttm": eps_ttm,
            "profit_margin": profit_margin,
            "price_sales_ttm": price_sales_ttm,
            "source_label": "yfinance",
            "source_timestamp": datetime.now(timezone.utc).isoformat(),
            "retrieval_status": "success",
        }

        if not info:
            return {
                "stock_price": None,
                "eps_ttm": None,
                "profit_margin": None,
                "price_sales_ttm": None,
                "data_status": "missing_company_info",
                "row_color": "orange",
                "calculated_price_display": "n/a",
                "potential_return_display": "n/a",
                "source_payload": {
                    **sanitized_payload,
                    "retrieval_status": "missing_company_info",
                },
            }

        if profit_margin == 0:
            return {
                "stock_price": stock_price,
                "eps_ttm": eps_ttm,
                "profit_margin": profit_margin,
                "price_sales_ttm": price_sales_ttm,
                "data_status": "zero_profit_margin",
                "row_color": "orange",
                "calculated_price_display": "n/a",
                "potential_return_display": "n/a",
                "source_payload": {
                    **sanitized_payload,
                    "retrieval_status": "zero_profit_margin",
                },
            }

        missing_required_data = any(
            value is None
            for value in [
                stock_price,
                eps_ttm,
                profit_margin,
                price_sales_ttm,
            ]
        )

        if missing_required_data:
            return {
                "stock_price": stock_price,
                "eps_ttm": eps_ttm,
                "profit_margin": profit_margin,
                "price_sales_ttm": price_sales_ttm,
                "data_status": "missing_required_data",
                "row_color": "orange",
                "calculated_price_display": "n/a",
                "potential_return_display": "n/a",
                "source_payload": {
                    **sanitized_payload,
                    "retrieval_status": "missing_required_data",
                },
            }

        valuation = calculate_valuation(
            stock_price=stock_price,
            eps_ttm=eps_ttm,
            profit_margin=profit_margin,
            price_sales_ttm=price_sales_ttm,
        )

        return {
            "stock_price": stock_price,
            "eps_ttm": eps_ttm,
            "profit_margin": profit_margin,
            "price_sales_ttm": price_sales_ttm,
            "data_status": "success",
            "row_color": valuation["row_color"],
            "calculated_price_raw": valuation["calculated_price_raw"],
            "calculated_price_display": valuation["calculated_price_display"],
            "potential_return_raw": valuation["potential_return_raw"],
            "potential_return_display": valuation["potential_return_display"],
            "source_payload": sanitized_payload,
        }

    except Exception as exc:
        return {
            "stock_price": None,
            "eps_ttm": None,
            "profit_margin": None,
            "price_sales_ttm": None,
            "data_status": "yfinance_error",
            "row_color": "orange",
            "calculated_price_display": "n/a",
            "potential_return_display": "n/a",
            "source_payload": {
                "ticker": ticker,
                "source_label": "yfinance",
                "source_timestamp": datetime.now(timezone.utc).isoformat(),
                "retrieval_status": "yfinance_error",
                "error_message": str(exc)[:250],
            },
        }


def get_supabase_client() -> Client:
    """
    General client using anon key.
    Later, this can be used for user-authenticated requests.
    """
    if not SUPABASE_URL:
        raise RuntimeError("Missing SUPABASE_URL in .env")

    if not SUPABASE_ANON_KEY:
        raise RuntimeError("Missing SUPABASE_ANON_KEY in .env")

    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def get_supabase_admin_client() -> Client:
    """
    Backend-only admin client.
    Never expose SUPABASE_SERVICE_ROLE_KEY to the frontend.
    """
    if not SUPABASE_URL:
        raise RuntimeError("Missing SUPABASE_URL in .env")

    if not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Missing SUPABASE_SERVICE_ROLE_KEY in .env")

    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "stock-valuation-app-api",
    }


@app.get("/supabase-test")
def supabase_test():
    supabase = get_supabase_admin_client()

    response = (
        supabase.table("profiles")
        .select("email, role")
        .limit(5)
        .execute()
    )

    return {
        "status": "ok",
        "profiles": response.data,
    }

@app.get("/tickers")
def get_tickers():
    supabase = get_supabase_admin_client()

    list_response = (
        supabase.table("ticker_lists")
        .select("id, name, is_default")
        .eq("is_default", True)
        .limit(1)
        .execute()
    )

    if not list_response.data:
        return {
            "status": "ok",
            "ticker_list": None,
            "tickers": [],
        }

    ticker_list = list_response.data[0]

    items_response = (
        supabase.table("ticker_list_items")
        .select("ticker, sort_order")
        .eq("ticker_list_id", ticker_list["id"])
        .order("sort_order")
        .execute()
    )

    return {
        "status": "ok",
        "ticker_list": ticker_list,
        "tickers": items_response.data,
    }

@app.post("/tickers")
def save_tickers(request: TickerSaveRequest):
    supabase = get_supabase_admin_client()

    cleaned_tickers = clean_tickers(request.tickers)

    list_response = (
        supabase.table("ticker_lists")
        .select("id, user_id, name, is_default")
        .eq("is_default", True)
        .limit(1)
        .execute()
    )

    if not list_response.data:
        raise HTTPException(
            status_code=404,
            detail="Default ticker list not found."
        )

    ticker_list = list_response.data[0]
    ticker_list_id = ticker_list["id"]

    # Replace existing saved tickers with the cleaned list.
    supabase.table("ticker_list_items").delete().eq(
        "ticker_list_id", ticker_list_id
    ).execute()

    rows_to_insert = [
        {
            "ticker_list_id": ticker_list_id,
            "ticker": ticker,
            "sort_order": index + 1,
        }
        for index, ticker in enumerate(cleaned_tickers)
    ]

    if rows_to_insert:
        supabase.table("ticker_list_items").insert(rows_to_insert).execute()

    # Remove old valuation rows for tickers no longer in the saved input list.
    if cleaned_tickers:
        existing_results = (
            supabase.table("valuation_results")
            .select("id, ticker")
            .eq("ticker_list_id", ticker_list_id)
            .execute()
        )

        stale_result_ids = [
            row["id"]
            for row in existing_results.data
            if row["ticker"] not in cleaned_tickers
        ]

        if stale_result_ids:
            supabase.table("valuation_results").delete().in_(
                "id", stale_result_ids
            ).execute()
    else:
        supabase.table("valuation_results").delete().eq(
            "ticker_list_id", ticker_list_id
        ).execute()

    return {
        "status": "ok",
        "ticker_list": ticker_list,
        "saved_count": len(cleaned_tickers),
        "tickers": [
            {
                "ticker": ticker,
                "sort_order": index + 1,
            }
            for index, ticker in enumerate(cleaned_tickers)
        ],
    }

@app.delete("/tickers/{ticker}")
def delete_ticker(ticker: str):
    supabase = get_supabase_admin_client()

    cleaned_ticker = ticker.strip().upper()

    if not TICKER_PATTERN.match(cleaned_ticker):
        raise HTTPException(
            status_code=400,
            detail="Invalid ticker format."
        )

    list_response = (
        supabase.table("ticker_lists")
        .select("id, user_id, name, is_default")
        .eq("is_default", True)
        .limit(1)
        .execute()
    )

    if not list_response.data:
        raise HTTPException(
            status_code=404,
            detail="Default ticker list not found."
        )

    ticker_list = list_response.data[0]
    ticker_list_id = ticker_list["id"]

    delete_response = (
        supabase.table("ticker_list_items")
        .delete()
        .eq("ticker_list_id", ticker_list_id)
        .eq("ticker", cleaned_ticker)
        .execute()
    )

    remaining_response = (
        supabase.table("ticker_list_items")
        .select("id, ticker, sort_order")
        .eq("ticker_list_id", ticker_list_id)
        .order("sort_order")
        .execute()
    )

    # Re-number remaining tickers so sort_order stays clean: 1, 2, 3, etc.
    for index, row in enumerate(remaining_response.data):
        supabase.table("ticker_list_items").update(
            {"sort_order": index + 1}
        ).eq("id", row["id"]).execute()

    final_response = (
        supabase.table("ticker_list_items")
        .select("ticker, sort_order")
        .eq("ticker_list_id", ticker_list_id)
        .order("sort_order")
        .execute()
    )

    return {
        "status": "ok",
        "deleted_ticker": cleaned_ticker,
        "ticker_list": ticker_list,
        "tickers": final_response.data,
    }

@app.get("/valuation-results")
def get_valuation_results():
    supabase = get_supabase_admin_client()

    list_response = (
        supabase.table("ticker_lists")
        .select("id, user_id, name, is_default")
        .eq("is_default", True)
        .limit(1)
        .execute()
    )

    if not list_response.data:
        return {
            "status": "ok",
            "ticker_list": None,
            "results": [],
        }

    ticker_list = list_response.data[0]
    ticker_list_id = ticker_list["id"]

    items_response = (
        supabase.table("ticker_list_items")
        .select("ticker")
        .eq("ticker_list_id", ticker_list_id)
        .execute()
    )

    current_tickers = [item["ticker"] for item in items_response.data]

    if not current_tickers:
        return {
            "status": "ok",
            "ticker_list": ticker_list,
            "results": [],
        }

    response = (
        supabase.table("valuation_results")
        .select(
            "ticker, stock_price, calculated_price_display, "
            "potential_return_display, potential_return_raw, "
            "double_negative, row_color, data_status, last_refreshed_at"
        )
        .eq("ticker_list_id", ticker_list_id)
        .in_("ticker", current_tickers)
        .order("potential_return_raw", desc=True, nullsfirst=False)
        .order("ticker")
        .execute()
    )

    return {
        "status": "ok",
        "ticker_list": ticker_list,
        "results": response.data,
    }

@app.post("/refresh-valuations")
def refresh_valuations():
    supabase = get_supabase_admin_client()

    list_response = (
        supabase.table("ticker_lists")
        .select("id, user_id, name, is_default")
        .eq("is_default", True)
        .limit(1)
        .execute()
    )

    if not list_response.data:
        raise HTTPException(
            status_code=404,
            detail="Default ticker list not found."
        )

    ticker_list = list_response.data[0]
    ticker_list_id = ticker_list["id"]
    user_id = ticker_list["user_id"]

    # Block refresh if one is already queued or running.
    active_job_response = (
        supabase.table("refresh_jobs")
        .select("id, status")
        .eq("ticker_list_id", ticker_list_id)
        .in_("status", ["queued", "running"])
        .limit(1)
        .execute()
    )

    if active_job_response.data:
        raise HTTPException(
            status_code=409,
            detail="A refresh job is already running for this ticker list."
        )

    tickers_response = (
        supabase.table("ticker_list_items")
        .select("ticker, sort_order")
        .eq("ticker_list_id", ticker_list_id)
        .order("sort_order")
        .execute()
    )

    tickers = tickers_response.data
    total_tickers = len(tickers)
    batch_size = 10
    total_batches = (total_tickers + batch_size - 1) // batch_size if total_tickers else 0

    job_insert_response = (
        supabase.table("refresh_jobs")
        .insert({
            "user_id": user_id,
            "ticker_list_id": ticker_list_id,
            "status": "running",
            "total_tickers": total_tickers,
            "completed_tickers": 0,
            "failed_tickers": 0,
            "batch_size": batch_size,
            "current_batch_number": 0,
            "total_batches": total_batches,
            "started_at": "now()",
        })
        .execute()
    )

    refresh_job = job_insert_response.data[0]
    completed_tickers = 0

    for index, item in enumerate(tickers):
        ticker = item["ticker"]

        current_batch_number = (index // batch_size) + 1

        # Placeholder valuation row.
        # Real yfinance data will be added in the next step.
        data = fetch_yfinance_data(ticker)

        supabase.table("valuation_results").upsert(
            {
                "user_id": user_id,
                "ticker_list_id": ticker_list_id,
                "ticker": ticker,
                "stock_price": data["stock_price"],
                "calculated_price_display": data["calculated_price_display"],
                "potential_return_display": data["potential_return_display"],
                "calculated_price_raw": data.get("calculated_price_raw"),
                "potential_return_raw": data.get("potential_return_raw"),
                "eps_ttm": data["eps_ttm"],
                "profit_margin": data["profit_margin"],
                "price_sales_ttm": data["price_sales_ttm"],
                "data_status": data["data_status"],
                "row_color": data["row_color"],
                "source_label": "yfinance",
                "source_payload": data["source_payload"],
                "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="ticker_list_id,ticker"
        ).execute()

        completed_tickers += 1

        supabase.table("refresh_jobs").update(
            {
                "completed_tickers": completed_tickers,
                "current_batch_number": current_batch_number,
            }
        ).eq("id", refresh_job["id"]).execute()

    supabase.table("refresh_jobs").update(
        {
            "status": "completed",
            "completed_tickers": completed_tickers,
            "current_batch_number": total_batches,
            "finished_at": "now()",
        }
    ).eq("id", refresh_job["id"]).execute()

    return {
        "status": "ok",
        "message": "Refresh completed using placeholder valuation rows.",
        "job_id": refresh_job["id"],
        "total_tickers": total_tickers,
        "completed_tickers": completed_tickers,
        "total_batches": total_batches,
    }

@app.get("/refresh-jobs/{job_id}")
def get_refresh_job(job_id: str):
    supabase = get_supabase_admin_client()

    response = (
        supabase.table("refresh_jobs")
        .select(
            "id, status, total_tickers, completed_tickers, failed_tickers, "
            "batch_size, current_batch_number, total_batches, "
            "error_message, started_at, finished_at, created_at, updated_at"
        )
        .eq("id", job_id)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="Refresh job not found."
        )

    job = response.data[0]

    return {
        "status": "ok",
        "refresh_job": job,
    }