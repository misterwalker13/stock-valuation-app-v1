import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import Client, create_client

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
    ticker_list_id: Optional[str] = None


class WatchlistCreateRequest(BaseModel):
    name: str


class RefreshValuationsRequest(BaseModel):
    ticker_list_id: Optional[str] = None


class SignupRequest(BaseModel):
    email: str
    password: str
    invite_code: str
    newsletter_opted_in: bool = True


class SingleTickerRequest(BaseModel):
    ticker: str


APP_ROLES = {"admin", "additional_admin", "member", "subscriber", "viewer"}
ADMIN_ROLES = {"admin", "additional_admin"}
WATCHLIST_REFRESH_COOLDOWN_SECONDS = 60
SINGLE_TICKER_REFRESH_COOLDOWN_SECONDS = 30


TICKER_PATTERN = re.compile(r"^[A-Z][A-Z0-9]{0,24}([.-][A-Z0-9]{1,10})?$")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


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

    if len(cleaned) > 500:
        raise HTTPException(
            status_code=400,
            detail="Version 2 supports a maximum of 500 valid tickers per watchlist."
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


def safe_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None

        return int(value)
    except (TypeError, ValueError):
        return None


def safe_ratio(numerator: Optional[float], denominator: Optional[float]) -> Optional[float]:
    if numerator is None or denominator in (None, 0):
        return None

    return numerator / denominator


def format_decimal_ratio(value: Optional[float]) -> str:
    if value is None:
        return "n/a"

    return f"{value:.2f}"


def format_percent_ratio(value: Optional[float]) -> str:
    if value is None:
        return "n/a"

    return f"{value * 100:.1f}%"

def calculate_valuation(
    stock_price: float,
    eps_ttm: float,
    profit_margin: float,
    price_sales_ttm: float,
) -> Dict[str, Any]:
    calculated_price = (eps_ttm / profit_margin) * price_sales_ttm
    calculated_price_difference = (calculated_price - stock_price) / stock_price

    if calculated_price_difference >= 0.25:
        row_color = "green"
    elif calculated_price_difference >= -0.05:
        row_color = "yellow"
    else:
        row_color = "red"

    return {
        "calculated_price_raw": calculated_price,
        "calculated_price_display": f"${calculated_price:,.2f}",
        "calculated_price_difference_raw": calculated_price_difference,
        "calculated_price_difference_display": (
            f"{calculated_price_difference * 100:.3f}%"
        ),
        "row_color": row_color,
    }


def clean_single_ticker(ticker: str) -> str:
    cleaned_ticker = ticker.strip().upper()

    if not TICKER_PATTERN.match(cleaned_ticker):
        raise HTTPException(status_code=400, detail="Invalid ticker format.")

    return cleaned_ticker


def sanitize_news_item(item: Dict[str, Any]) -> Dict[str, Any]:
    content = item.get("content") if isinstance(item.get("content"), dict) else {}
    provider = item.get("provider") if isinstance(item.get("provider"), dict) else {}
    click_through = (
        item.get("clickThroughUrl")
        if isinstance(item.get("clickThroughUrl"), dict)
        else {}
    )

    title = item.get("title") or content.get("title")
    link = (
        item.get("link")
        or content.get("canonicalUrl", {}).get("url")
        or click_through.get("url")
    )
    publisher = (
        item.get("publisher")
        or provider.get("displayName")
        or content.get("provider", {}).get("displayName")
    )
    published_at = (
        item.get("providerPublishTime")
        or content.get("pubDate")
        or content.get("displayTime")
    )
    summary = item.get("summary") or content.get("summary")

    if isinstance(published_at, (int, float)):
        published_at = datetime.fromtimestamp(
            published_at,
            tz=timezone.utc,
        ).isoformat()

    return {
        "title": title,
        "link": link,
        "publisher": publisher,
        "published_at": published_at,
        "summary": summary,
    }


def build_company_profile(info: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "company_name": info.get("longName") or info.get("shortName"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "market_cap": safe_int(info.get("marketCap")),
        "exchange": info.get("exchange") or info.get("fullExchangeName"),
        "website": info.get("website"),
        "summary": info.get("longBusinessSummary"),
        "currency": info.get("currency"),
    }


def get_statement_value(statement: Any, row_names: List[str]) -> Optional[float]:
    if statement is None or getattr(statement, "empty", True):
        return None

    for row_name in row_names:
        if row_name not in statement.index:
            continue

        row = statement.loc[row_name].dropna()

        if row.empty:
            continue

        return safe_float(row.iloc[0])

    return None


def first_available_statement(yf_ticker: Any, attribute_names: List[str]) -> Any:
    for attribute_name in attribute_names:
        try:
            statement = getattr(yf_ticker, attribute_name)
        except Exception:
            continue

        if statement is not None and not getattr(statement, "empty", True):
            return statement

    return None


def build_financial_ratios(yf_ticker: Any) -> Dict[str, Any]:
    try:
        balance_sheet = first_available_statement(
            yf_ticker,
            ["quarterly_balance_sheet", "balance_sheet"],
        )
        income_statement = first_available_statement(
            yf_ticker,
            ["quarterly_financials", "financials"],
        )

        current_assets = get_statement_value(balance_sheet, ["Current Assets"])
        current_liabilities = get_statement_value(
            balance_sheet,
            ["Current Liabilities"],
        )
        total_assets = get_statement_value(balance_sheet, ["Total Assets"])
        total_equity = get_statement_value(
            balance_sheet,
            [
                "Stockholders Equity",
                "Total Equity Gross Minority Interest",
                "Common Stock Equity",
            ],
        )
        net_income = get_statement_value(
            income_statement,
            ["Net Income", "Net Income Common Stockholders"],
        )

        current_ratio = safe_ratio(current_assets, current_liabilities)
        total_debt_ratio = safe_ratio(
            total_assets - total_equity
            if total_assets is not None and total_equity is not None
            else None,
            total_assets,
        )
        return_on_assets = safe_ratio(net_income, total_assets)
        return_on_equity = safe_ratio(net_income, total_equity)

        return {
            "current_ratio_raw": current_ratio,
            "current_ratio_display": format_decimal_ratio(current_ratio),
            "total_debt_ratio_raw": total_debt_ratio,
            "total_debt_ratio_display": format_percent_ratio(total_debt_ratio),
            "return_on_assets_raw": return_on_assets,
            "return_on_assets_display": format_percent_ratio(return_on_assets),
            "return_on_equity_raw": return_on_equity,
            "return_on_equity_display": format_percent_ratio(return_on_equity),
        }
    except Exception:
        return empty_financial_ratios()


def empty_financial_ratios() -> Dict[str, Any]:
    return {
        "current_ratio_raw": None,
        "current_ratio_display": "n/a",
        "total_debt_ratio_raw": None,
        "total_debt_ratio_display": "n/a",
        "return_on_assets_raw": None,
        "return_on_assets_display": "n/a",
        "return_on_equity_raw": None,
        "return_on_equity_display": "n/a",
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
        company_profile = build_company_profile(info)
        financial_ratios = build_financial_ratios(yf_ticker)

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
            "company_profile": company_profile,
            "financial_ratios": financial_ratios,
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
                "calculated_price_difference_display": "n/a",
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
                "calculated_price_difference_display": "n/a",
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
                "calculated_price_difference_display": "n/a",
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
            "calculated_price_difference_raw": valuation[
                "calculated_price_difference_raw"
            ],
            "calculated_price_difference_display": valuation[
                "calculated_price_difference_display"
            ],
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
            "calculated_price_difference_display": "n/a",
            "source_payload": {
                "ticker": ticker,
                "source_label": "yfinance",
                "source_timestamp": datetime.now(timezone.utc).isoformat(),
                "company_profile": {},
                "financial_ratios": empty_financial_ratios(),
                "retrieval_status": "yfinance_error",
                "error_message": str(exc)[:250],
            },
        }


def fetch_single_ticker_research(ticker: str) -> Dict[str, Any]:
    data = fetch_yfinance_data(ticker)

    try:
        yf_ticker = yf.Ticker(to_yfinance_symbol(ticker))
        news = [
            sanitize_news_item(item)
            for item in (yf_ticker.news or [])[:8]
        ]
    except Exception:
        news = []

    company_profile = data.get("source_payload", {}).get("company_profile") or {}
    financial_ratios = (
        data.get("source_payload", {}).get("financial_ratios")
        or empty_financial_ratios()
    )

    return {
        "ticker": ticker,
        "company_profile": company_profile,
        "financial_ratios": financial_ratios,
        "news": news,
        "valuation": {
            "ticker": ticker,
            "stock_price": data["stock_price"],
            "calculated_price_display": data["calculated_price_display"],
            "calculated_price_difference_display": data[
                "calculated_price_difference_display"
            ],
            "calculated_price_difference_raw": data.get(
                "calculated_price_difference_raw"
            ),
            "row_color": data["row_color"],
            "data_status": data["data_status"],
            "last_refreshed_at": data["source_payload"]["source_timestamp"],
        },
        "source_payload": {
            **data["source_payload"],
            "news": news,
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


def get_bearer_token(authorization: Optional[str] = Header(default=None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization token.")

    scheme, _, token = authorization.partition(" ")

    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid authorization header.")

    return token


def require_app_user(token: str = Depends(get_bearer_token)) -> Dict[str, Any]:
    supabase = get_supabase_admin_client()

    try:
        user_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    user = user_response.user

    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    profile_response = (
        supabase.table("profiles")
        .select("user_id, email, role, newsletter_opted_in, display_name")
        .eq("user_id", user.id)
        .limit(1)
        .execute()
    )

    if not profile_response.data:
        raise HTTPException(status_code=403, detail="Profile not authorized.")

    profile = profile_response.data[0]

    if profile["role"] not in APP_ROLES:
        raise HTTPException(status_code=403, detail="Profile not authorized.")

    return profile


def require_admin_user(profile: Dict[str, Any] = Depends(require_app_user)) -> Dict[str, Any]:
    if profile["role"] not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required.")

    return profile


def get_owned_watchlist(
    supabase: Client,
    profile: Dict[str, Any],
    ticker_list_id: Optional[str] = None,
) -> Dict[str, Any]:
    query = (
        supabase.table("ticker_lists")
        .select("id, user_id, name, is_default, created_at, updated_at")
        .eq("user_id", profile["user_id"])
    )

    if ticker_list_id:
        query = query.eq("id", ticker_list_id)
    else:
        query = query.eq("is_default", True)

    response = query.order("created_at").limit(1).execute()

    if response.data:
        return response.data[0]

    if ticker_list_id:
        raise HTTPException(status_code=404, detail="Watchlist not found.")

    created_response = (
        supabase.table("ticker_lists")
        .insert({
            "user_id": profile["user_id"],
            "name": "Default",
            "is_default": True,
        })
        .execute()
    )

    return created_response.data[0]


def parse_supabase_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def enforce_watchlist_refresh_limit(
    supabase: Client,
    profile: Dict[str, Any],
    ticker_list_id: str,
) -> None:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=WATCHLIST_REFRESH_COOLDOWN_SECONDS)

    response = (
        supabase.table("refresh_events")
        .select("created_at")
        .eq("user_id", profile["user_id"])
        .eq("ticker_list_id", ticker_list_id)
        .eq("refresh_type", "watchlist")
        .gte("created_at", cutoff.isoformat())
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not response.data:
        return

    last_refresh_at = parse_supabase_timestamp(response.data[0]["created_at"])
    elapsed_seconds = (now - last_refresh_at).total_seconds()
    retry_after_seconds = max(
        1,
        int(WATCHLIST_REFRESH_COOLDOWN_SECONDS - elapsed_seconds),
    )

    raise HTTPException(
        status_code=429,
        detail={
            "message": (
                "Watchlist refresh is available once every 60 seconds during "
                "the Version 2 beta."
            ),
            "retry_after_seconds": retry_after_seconds,
        },
    )


def enforce_single_ticker_refresh_limit(
    supabase: Client,
    profile: Dict[str, Any],
    ticker: str,
) -> None:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=SINGLE_TICKER_REFRESH_COOLDOWN_SECONDS)

    response = (
        supabase.table("refresh_events")
        .select("created_at")
        .eq("user_id", profile["user_id"])
        .eq("ticker", ticker)
        .eq("refresh_type", "single_ticker")
        .gte("created_at", cutoff.isoformat())
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not response.data:
        return

    last_refresh_at = parse_supabase_timestamp(response.data[0]["created_at"])
    elapsed_seconds = (now - last_refresh_at).total_seconds()
    retry_after_seconds = max(
        1,
        int(SINGLE_TICKER_REFRESH_COOLDOWN_SECONDS - elapsed_seconds),
    )

    raise HTTPException(
        status_code=429,
        detail={
            "message": (
                "Single-ticker refresh is available once every 30 seconds "
                "during the Version 2 beta."
            ),
            "retry_after_seconds": retry_after_seconds,
        },
    )


def record_watchlist_refresh_event(
    supabase: Client,
    profile: Dict[str, Any],
    ticker_list_id: str,
) -> None:
    supabase.table("refresh_events").insert({
        "user_id": profile["user_id"],
        "ticker_list_id": ticker_list_id,
        "refresh_type": "watchlist",
    }).execute()


def record_single_ticker_refresh_event(
    supabase: Client,
    profile: Dict[str, Any],
    ticker: str,
) -> None:
    supabase.table("refresh_events").insert({
        "user_id": profile["user_id"],
        "ticker": ticker,
        "refresh_type": "single_ticker",
    }).execute()


def normalize_invite_code(invite_code: str) -> str:
    return invite_code.strip().upper()


def validate_signup_request(request: SignupRequest) -> Dict[str, str]:
    email = request.email.strip().lower()
    invite_code = normalize_invite_code(request.invite_code)

    if not EMAIL_PATTERN.match(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")

    if len(request.password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters.",
        )

    if len(invite_code) < 6:
        raise HTTPException(status_code=400, detail="Enter a valid invite code.")

    return {
        "email": email,
        "invite_code": invite_code,
    }


def get_available_invite_code(supabase: Client, invite_code: str) -> Dict[str, Any]:
    response = (
        supabase.table("invite_codes")
        .select("id, code, max_uses, used_count, is_active, expires_at")
        .eq("code", invite_code)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=400, detail="Invite code is not valid.")

    invite = response.data[0]

    if not invite["is_active"]:
        raise HTTPException(status_code=400, detail="Invite code is no longer active.")

    if invite["expires_at"]:
        expires_at = parse_supabase_timestamp(invite["expires_at"])
        if expires_at <= datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Invite code has expired.")

    if invite["used_count"] >= invite["max_uses"]:
        raise HTTPException(status_code=400, detail="Invite code has already been used.")

    return invite


def redeem_invite_code(supabase: Client, invite: Dict[str, Any]) -> None:
    supabase.table("invite_codes").update({
        "used_count": invite["used_count"] + 1,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", invite["id"]).execute()


def build_watchlist_summary_maps(
    ticker_lists: List[Dict[str, Any]],
    ticker_items: List[Dict[str, Any]],
    valuation_results: List[Dict[str, Any]],
    refresh_jobs: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    summaries: Dict[str, Dict[str, Any]] = {}

    for ticker_list in ticker_lists:
        summaries[ticker_list["id"]] = {
            **ticker_list,
            "ticker_count": 0,
            "valuation_result_count": 0,
            "last_refreshed_at": None,
            "last_refresh_job": None,
        }

    for item in ticker_items:
        ticker_list_id = item["ticker_list_id"]
        if ticker_list_id in summaries:
            summaries[ticker_list_id]["ticker_count"] += 1

    for result in valuation_results:
        ticker_list_id = result["ticker_list_id"]
        if ticker_list_id in summaries:
            summaries[ticker_list_id]["valuation_result_count"] += 1
            current_last_refreshed = summaries[ticker_list_id]["last_refreshed_at"]
            result_last_refreshed = result.get("last_refreshed_at")

            if result_last_refreshed and (
                current_last_refreshed is None
                or result_last_refreshed > current_last_refreshed
            ):
                summaries[ticker_list_id]["last_refreshed_at"] = result_last_refreshed

    for job in refresh_jobs:
        ticker_list_id = job["ticker_list_id"]
        if ticker_list_id in summaries:
            summaries[ticker_list_id]["last_refresh_job"] = job

    return summaries


def valuation_row_to_single_ticker_payload(
    row: Dict[str, Any],
    is_in_current_watchlist: bool,
) -> Dict[str, Any]:
    source_payload = row.get("source_payload") or {}

    return {
        "ticker": row["ticker"],
        "is_cached": True,
        "is_in_current_watchlist": is_in_current_watchlist,
        "company_profile": source_payload.get("company_profile") or {},
        "financial_ratios": (
            source_payload.get("financial_ratios") or empty_financial_ratios()
        ),
        "news": source_payload.get("news") or [],
        "valuation": {
            "ticker": row["ticker"],
            "stock_price": row["stock_price"],
            "calculated_price_display": (
                "n/a"
                if row.get("data_status") == "zero_profit_margin"
                else row["calculated_price_display"]
            ),
            "calculated_price_difference_display": (
                "n/a"
                if row.get("data_status") == "zero_profit_margin"
                else row["potential_return_display"]
            ),
            "calculated_price_difference_raw": row.get("potential_return_raw"),
            "row_color": (
                "orange"
                if row.get("data_status") == "zero_profit_margin"
                else row["row_color"]
            ),
            "data_status": row["data_status"],
            "last_refreshed_at": row["last_refreshed_at"],
        },
    }


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "stock-valuation-app-api",
    }


@app.post("/signup", status_code=201)
def signup(request: SignupRequest):
    supabase = get_supabase_admin_client()
    normalized = validate_signup_request(request)
    invite = get_available_invite_code(supabase, normalized["invite_code"])

    try:
        created_user = supabase.auth.admin.create_user({
            "email": normalized["email"],
            "password": request.password,
            "email_confirm": True,
        }).user
    except Exception as exc:
        error_message = str(exc).lower()
        if "already" in error_message or "registered" in error_message:
            raise HTTPException(
                status_code=400,
                detail="An account already exists for this email.",
            )

        raise HTTPException(status_code=400, detail="Unable to create account.")

    newsletter_opted_in_at = (
        datetime.now(timezone.utc).isoformat()
        if request.newsletter_opted_in
        else None
    )

    supabase.table("profiles").update({
        "email": normalized["email"],
        "role": "member",
        "newsletter_opted_in": request.newsletter_opted_in,
        "newsletter_opted_in_at": newsletter_opted_in_at,
        "invite_code_id": invite["id"],
    }).eq("user_id", created_user.id).execute()

    redeem_invite_code(supabase, invite)

    return {
        "status": "ok",
        "message": "Account created.",
        "email": normalized["email"],
    }


@app.get("/supabase-test")
def supabase_test(_profile: Dict[str, Any] = Depends(require_admin_user)):
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


@app.get("/admin/users")
def admin_get_users(_profile: Dict[str, Any] = Depends(require_admin_user)):
    supabase = get_supabase_admin_client()

    profiles = (
        supabase.table("profiles")
        .select(
            "user_id, email, role, newsletter_opted_in, display_name, "
            "created_at, updated_at"
        )
        .order("created_at", desc=True)
        .execute()
        .data
    )

    ticker_lists = (
        supabase.table("ticker_lists")
        .select("id, user_id, name, is_default, created_at, updated_at")
        .order("created_at")
        .execute()
        .data
    )

    ticker_items = (
        supabase.table("ticker_list_items")
        .select("ticker_list_id")
        .execute()
        .data
    )

    valuation_results = (
        supabase.table("valuation_results")
        .select("ticker_list_id, last_refreshed_at")
        .execute()
        .data
    )

    refresh_jobs = (
        supabase.table("refresh_jobs")
        .select("id, ticker_list_id, status, created_at, finished_at")
        .order("created_at", desc=True)
        .execute()
        .data
    )

    watchlist_summaries = build_watchlist_summary_maps(
        ticker_lists=ticker_lists,
        ticker_items=ticker_items,
        valuation_results=valuation_results,
        refresh_jobs=refresh_jobs,
    )

    users = []
    for profile in profiles:
        user_watchlists = [
            summary
            for summary in watchlist_summaries.values()
            if summary["user_id"] == profile["user_id"]
        ]

        users.append({
            **profile,
            "watchlist_count": len(user_watchlists),
            "ticker_count": sum(
                watchlist["ticker_count"] for watchlist in user_watchlists
            ),
            "watchlists": user_watchlists,
        })

    return {
        "status": "ok",
        "users": users,
    }


@app.get("/admin/users/{user_id}")
def admin_get_user_detail(
    user_id: str,
    _profile: Dict[str, Any] = Depends(require_admin_user),
):
    supabase = get_supabase_admin_client()

    profile_response = (
        supabase.table("profiles")
        .select(
            "user_id, email, role, newsletter_opted_in, newsletter_opted_in_at, "
            "display_name, created_at, updated_at"
        )
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    if not profile_response.data:
        raise HTTPException(status_code=404, detail="User not found.")

    ticker_lists = (
        supabase.table("ticker_lists")
        .select("id, user_id, name, is_default, created_at, updated_at")
        .eq("user_id", user_id)
        .order("created_at")
        .execute()
        .data
    )

    ticker_list_ids = [ticker_list["id"] for ticker_list in ticker_lists]

    if ticker_list_ids:
        ticker_items = (
            supabase.table("ticker_list_items")
            .select("ticker_list_id, ticker, sort_order")
            .in_("ticker_list_id", ticker_list_ids)
            .order("sort_order")
            .execute()
            .data
        )

        valuation_results = (
            supabase.table("valuation_results")
            .select("ticker_list_id, ticker, row_color, last_refreshed_at")
            .in_("ticker_list_id", ticker_list_ids)
            .execute()
            .data
        )

        refresh_jobs = (
            supabase.table("refresh_jobs")
            .select(
                "id, ticker_list_id, status, total_tickers, completed_tickers, "
                "failed_tickers, started_at, finished_at, created_at"
            )
            .in_("ticker_list_id", ticker_list_ids)
            .order("created_at", desc=True)
            .execute()
            .data
        )
    else:
        ticker_items = []
        valuation_results = []
        refresh_jobs = []

    watchlist_summaries = build_watchlist_summary_maps(
        ticker_lists=ticker_lists,
        ticker_items=ticker_items,
        valuation_results=valuation_results,
        refresh_jobs=refresh_jobs,
    )

    for summary in watchlist_summaries.values():
        summary["tickers"] = [
            {
                "ticker": item["ticker"],
                "sort_order": item["sort_order"],
            }
            for item in ticker_items
            if item["ticker_list_id"] == summary["id"]
        ]
        summary["valuation_results"] = [
            {
                "ticker": result["ticker"],
                "row_color": result["row_color"],
                "last_refreshed_at": result["last_refreshed_at"],
            }
            for result in valuation_results
            if result["ticker_list_id"] == summary["id"]
        ]

    return {
        "status": "ok",
        "user": {
            **profile_response.data[0],
            "watchlists": list(watchlist_summaries.values()),
        },
    }


@app.get("/me")
def get_me(profile: Dict[str, Any] = Depends(require_app_user)):
    return {
        "status": "ok",
        "profile": profile,
        "is_admin": profile["role"] in ADMIN_ROLES,
        "refresh_limits": {
            "watchlist_seconds": WATCHLIST_REFRESH_COOLDOWN_SECONDS,
            "single_ticker_seconds": SINGLE_TICKER_REFRESH_COOLDOWN_SECONDS,
        },
    }


@app.get("/watchlists")
def get_watchlists(profile: Dict[str, Any] = Depends(require_app_user)):
    supabase = get_supabase_admin_client()

    get_owned_watchlist(supabase, profile)

    response = (
        supabase.table("ticker_lists")
        .select("id, name, is_default, created_at, updated_at")
        .eq("user_id", profile["user_id"])
        .order("is_default", desc=True)
        .order("created_at")
        .execute()
    )

    return {
        "status": "ok",
        "watchlists": response.data,
        "limits": {
            "max_watchlists": 2,
            "max_tickers_per_watchlist": 500,
            "watchlist_refresh_seconds": WATCHLIST_REFRESH_COOLDOWN_SECONDS,
        },
    }


@app.post("/watchlists")
def create_watchlist(
    request: WatchlistCreateRequest,
    profile: Dict[str, Any] = Depends(require_app_user),
):
    supabase = get_supabase_admin_client()

    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Watchlist name is required.")

    existing_response = (
        supabase.table("ticker_lists")
        .select("id")
        .eq("user_id", profile["user_id"])
        .execute()
    )

    if len(existing_response.data) >= 2:
        raise HTTPException(
            status_code=400,
            detail="Version 2 supports a maximum of 2 watchlists per user.",
        )

    create_response = (
        supabase.table("ticker_lists")
        .insert({
            "user_id": profile["user_id"],
            "name": name,
            "is_default": len(existing_response.data) == 0,
        })
        .execute()
    )

    return {
        "status": "ok",
        "watchlist": create_response.data[0],
    }


@app.get("/tickers")
def get_tickers(
    ticker_list_id: Optional[str] = None,
    profile: Dict[str, Any] = Depends(require_app_user),
):
    supabase = get_supabase_admin_client()
    ticker_list = get_owned_watchlist(supabase, profile, ticker_list_id)

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
def save_tickers(
    request: TickerSaveRequest,
    profile: Dict[str, Any] = Depends(require_app_user),
):
    supabase = get_supabase_admin_client()

    cleaned_tickers = clean_tickers(request.tickers)
    ticker_list = get_owned_watchlist(supabase, profile, request.ticker_list_id)
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
def delete_ticker(
    ticker: str,
    ticker_list_id: Optional[str] = None,
    profile: Dict[str, Any] = Depends(require_app_user),
):
    supabase = get_supabase_admin_client()

    cleaned_ticker = ticker.strip().upper()

    if not TICKER_PATTERN.match(cleaned_ticker):
        raise HTTPException(
            status_code=400,
            detail="Invalid ticker format."
        )

    ticker_list = get_owned_watchlist(supabase, profile, ticker_list_id)
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
def get_valuation_results(
    ticker_list_id: Optional[str] = None,
    profile: Dict[str, Any] = Depends(require_app_user),
):
    supabase = get_supabase_admin_client()
    ticker_list = get_owned_watchlist(supabase, profile, ticker_list_id)
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

    results = response.data

    for row in results:
        if row.get("data_status") == "zero_profit_margin":
            row["calculated_price_display"] = "n/a"
            row["potential_return_display"] = "n/a"
            row["row_color"] = "orange"

        row["calculated_price_difference_display"] = row[
            "potential_return_display"
        ]
        row["calculated_price_difference_raw"] = row["potential_return_raw"]
        row.pop("potential_return_display", None)
        row.pop("potential_return_raw", None)

    return {
        "status": "ok",
        "ticker_list": ticker_list,
        "results": results,
    }


@app.get("/single-ticker")
def get_single_ticker(
    ticker: str,
    ticker_list_id: Optional[str] = None,
    profile: Dict[str, Any] = Depends(require_app_user),
):
    supabase = get_supabase_admin_client()
    cleaned_ticker = clean_single_ticker(ticker)
    ticker_list = get_owned_watchlist(supabase, profile, ticker_list_id)

    item_response = (
        supabase.table("ticker_list_items")
        .select("ticker")
        .eq("ticker_list_id", ticker_list["id"])
        .eq("ticker", cleaned_ticker)
        .limit(1)
        .execute()
    )
    is_in_current_watchlist = bool(item_response.data)

    cached_response = (
        supabase.table("valuation_results")
        .select(
            "ticker, stock_price, calculated_price_display, "
            "potential_return_display, potential_return_raw, "
            "row_color, data_status, last_refreshed_at, source_payload"
        )
        .eq("user_id", profile["user_id"])
        .eq("ticker", cleaned_ticker)
        .order("last_refreshed_at", desc=True)
        .limit(1)
        .execute()
    )

    if cached_response.data:
        cached_payload = valuation_row_to_single_ticker_payload(
            cached_response.data[0],
            is_in_current_watchlist=is_in_current_watchlist,
        )

        if cached_payload["company_profile"]:
            return {
                "status": "ok",
                "ticker_list": ticker_list,
                "result": cached_payload,
            }

    live_payload = fetch_single_ticker_research(cleaned_ticker)

    return {
        "status": "ok",
        "ticker_list": ticker_list,
        "result": {
            **live_payload,
            "is_cached": False,
            "is_in_current_watchlist": is_in_current_watchlist,
        },
    }


@app.post("/single-ticker/refresh")
def refresh_single_ticker(
    request: SingleTickerRequest,
    profile: Dict[str, Any] = Depends(require_app_user),
):
    supabase = get_supabase_admin_client()
    cleaned_ticker = clean_single_ticker(request.ticker)

    enforce_single_ticker_refresh_limit(supabase, profile, cleaned_ticker)
    record_single_ticker_refresh_event(supabase, profile, cleaned_ticker)

    live_payload = fetch_single_ticker_research(cleaned_ticker)

    return {
        "status": "ok",
        "message": (
            "Single-ticker refresh complete. This temporary lookup is not "
            "saved to a watchlist unless you add it."
        ),
        "result": {
            **live_payload,
            "is_cached": False,
            "is_in_current_watchlist": False,
        },
    }


@app.post("/refresh-valuations")
def refresh_valuations(
    request: Optional[RefreshValuationsRequest] = None,
    profile: Dict[str, Any] = Depends(require_app_user),
):
    supabase = get_supabase_admin_client()
    ticker_list_id = request.ticker_list_id if request else None
    ticker_list = get_owned_watchlist(supabase, profile, ticker_list_id)
    ticker_list_id = ticker_list["id"]
    user_id = ticker_list["user_id"]

    enforce_watchlist_refresh_limit(supabase, profile, ticker_list_id)

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

    record_watchlist_refresh_event(supabase, profile, ticker_list_id)

    tickers_response = (
        supabase.table("ticker_list_items")
        .select("ticker, sort_order")
        .eq("ticker_list_id", ticker_list_id)
        .order("sort_order")
        .execute()
    )

    tickers = tickers_response.data
    total_tickers = len(tickers)
    batch_size = 20
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
                "calculated_price_raw": data.get("calculated_price_raw"),
                "potential_return_display": data[
                    "calculated_price_difference_display"
                ],
                "potential_return_raw": data.get(
                    "calculated_price_difference_raw"
                ),
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
        "message": (
            "Refresh complete. During the Version 2 beta, each watchlist can "
            "be refreshed once every 60 seconds."
        ),
        "job_id": refresh_job["id"],
        "ticker_list": ticker_list,
        "total_tickers": total_tickers,
        "completed_tickers": completed_tickers,
        "total_batches": total_batches,
    }

@app.get("/refresh-jobs/{job_id}")
def get_refresh_job(
    job_id: str,
    profile: Dict[str, Any] = Depends(require_app_user),
):
    supabase = get_supabase_admin_client()

    response = (
        supabase.table("refresh_jobs")
        .select(
            "id, status, total_tickers, completed_tickers, failed_tickers, "
            "batch_size, current_batch_number, total_batches, "
            "error_message, started_at, finished_at, created_at, updated_at, "
            "user_id, ticker_list_id"
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

    if job["user_id"] != profile["user_id"] and profile["role"] not in ADMIN_ROLES:
        raise HTTPException(status_code=404, detail="Refresh job not found.")

    return {
        "status": "ok",
        "refresh_job": job,
    }
