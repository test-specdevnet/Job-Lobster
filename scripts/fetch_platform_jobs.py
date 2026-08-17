"""Collect fresh external job-board results and ingest them into Job Lobster."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen

from jobspy import scrape_jobs


AUDIENCE = "job-lobster-platform-ingest"
COLLECTOR = "github-actions-jobspy/1.1.82+jsearch-v2+external-web-v1"
MAX_BATCH_SIZE = 100
HOURS_OLD = 168
JSEARCH_API_URL = "https://api.openwebninja.com/jsearch/search-v2"
SUPPORTED_PROVIDERS = ("indeed", "linkedin", "glassdoor")
EXTERNAL_SEARCH_DIR = Path(__file__).resolve().parents[1] / "data" / "external-search"
RESULTS_WANTED = {
    "indeed": 125,
}
SEARCH_TERMS = {
    "indeed": (
        '"marketing manager" remote -product -intern -sales',
        '("growth marketing manager" OR "digital marketing manager") remote -product',
        '("content marketing manager" OR "communications manager") remote -product',
        '("brand marketing manager" OR "marketing lead" OR "head of content") remote -product',
    ),
}
COUNTRIES = (
    ("USA", "United States"),
    ("Canada", "Canada"),
)
JSEARCH_COUNTRY_CODES = {
    "USA": "us",
    "Canada": "ca",
}
TARGET_TITLE = re.compile(
    r"\b(marketing|brand|content|communications?|growth|seo|geo)\b",
    re.IGNORECASE,
)
EXCLUDED_TITLE = re.compile(
    r"\b(product marketing|sales|account executive|engineer|intern(?:ship)?)\b",
    re.IGNORECASE,
)


def clean_scalar(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).strip()
    if not text or text.lower() in {"nan", "nat", "none", "<na>"}:
        return None
    return value


def clean_text(value: Any, maximum: int | None = None) -> str:
    cleaned = clean_scalar(value)
    if cleaned is None:
        return ""
    text = re.sub(r"\s+", " ", str(cleaned)).strip()
    return text if maximum is None else text[:maximum]


def number(value: Any) -> float | None:
    cleaned = clean_scalar(value)
    if cleaned is None:
        return None
    try:
        parsed = float(cleaned)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) and 0 <= parsed <= 10_000_000 else None


def boolean(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return clean_text(value).lower() in {"1", "true", "yes"}


def https_url(value: Any) -> str | None:
    raw = clean_text(value, 2_048)
    if not raw:
        return None
    parsed = urlparse(raw)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return None
    return raw


def canonical_platform_url(
    value: Any, provider: str
) -> tuple[str | None, str | None]:
    raw = https_url(value)
    if not raw:
        return None, None
    parsed = urlparse(raw)
    hostname = (parsed.hostname or "").lower()
    query = parse_qs(parsed.query)
    if provider == "indeed":
        if hostname != "indeed.com" and not hostname.endswith(".indeed.com"):
            return None, None
        job_key = query.get("jk", [None])[0]
        if job_key:
            canonical = urlunparse(
                (
                    parsed.scheme,
                    parsed.netloc,
                    "/viewjob",
                    "",
                    urlencode({"jk": job_key}),
                    "",
                )
            )
            return canonical, job_key
        return urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", "", "")), None

    if provider == "linkedin":
        if hostname != "linkedin.com" and not hostname.endswith(".linkedin.com"):
            return None, None
        match = re.search(r"/jobs/view/(?:[^/?#]*-)?(\d+)", parsed.path)
        if not match:
            return None, None
        listing_id = match.group(1)
        return "https://www.linkedin.com/jobs/view/" + listing_id, listing_id

    glassdoor_host = (
        hostname == "glassdoor.com"
        or hostname.endswith(".glassdoor.com")
        or hostname == "glassdoor.ca"
        or hostname.endswith(".glassdoor.ca")
    )
    if provider != "glassdoor" or not glassdoor_host:
        return None, None
    listing_id = query.get("jl", [None])[0]
    if listing_id:
        canonical = urlunparse(
            (
                parsed.scheme,
                parsed.netloc,
                "/job-listing/j",
                "",
                urlencode({"jl": listing_id}),
                "",
            )
        )
        return canonical, listing_id
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", "", "")), None


def posted_at(value: Any) -> str | None:
    cleaned = clean_scalar(value)
    if cleaned is None:
        return None
    if isinstance(cleaned, datetime):
        parsed = cleaned
    elif isinstance(cleaned, date):
        parsed = datetime(cleaned.year, cleaned.month, cleaned.day, tzinfo=timezone.utc)
    else:
        raw = str(cleaned).replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def is_fresh_posting(value: str, now: datetime) -> bool:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return now - timedelta(days=7) <= parsed <= now + timedelta(hours=6)


def employment_type(value: Any) -> str:
    raw = re.sub(r"[^a-z]", "", clean_text(value).lower())
    return {
        "fulltime": "full_time",
        "parttime": "part_time",
        "contract": "contract",
        "contractor": "contract",
        "temporary": "temporary",
        "internship": "internship",
    }.get(raw, "unknown")


def salary(record: dict[str, Any]) -> dict[str, Any] | None:
    minimum = number(record.get("min_amount"))
    maximum = number(record.get("max_amount"))
    if minimum is None and maximum is None:
        return None
    if minimum is None:
        minimum = maximum
    if minimum is None:
        return None
    if maximum is not None and maximum < minimum:
        minimum, maximum = maximum, minimum
    interval_raw = clean_text(record.get("interval")).lower()
    interval = {
        "yearly": "year",
        "annual": "year",
        "annually": "year",
        "year": "year",
        "hourly": "hour",
        "hour": "hour",
        "monthly": "month",
        "month": "month",
    }.get(interval_raw)
    if not interval:
        return None
    currency = clean_text(record.get("currency"), 3).upper() or None
    if currency and not re.fullmatch(r"[A-Z]{3}", currency):
        currency = None
    evidence = clean_text(record.get("salary_source"), 400) or "JobSpy salary fields"
    return {
        "minimum": minimum,
        "maximum": maximum,
        "currency": currency,
        "interval": interval,
        "evidence": evidence,
    }


def row_to_job(
    record: dict[str, Any], fallback_country: str, provider: str
) -> dict[str, Any] | None:
    title = clean_text(record.get("title"), 300)
    if not title or not TARGET_TITLE.search(title) or EXCLUDED_TITLE.search(title):
        return None
    source_url, job_key = canonical_platform_url(record.get("job_url"), provider)
    date_posted = posted_at(record.get("date_posted"))
    if not source_url or not date_posted:
        return None

    description = clean_text(record.get("description"), 50_000)
    location = clean_text(record.get("location"), 400)
    city = clean_text(record.get("city"), 160)
    region = clean_text(record.get("state"), 160)
    country = clean_text(record.get("country"), 160) or fallback_country
    remote = boolean(record.get("is_remote")) or bool(re.search(r"\bremote\b", location, re.I))
    hybrid = bool(re.search(r"\bhybrid\b", location + " " + description[:2_000], re.I))
    work_type = "remote" if remote else "hybrid" if hybrid else "unknown"
    location_text = location or ", ".join(part for part in (city, region, country) if part)
    if remote and not re.search(r"\bremote\b", location_text, re.I):
        location_text = "Remote - " + (location_text or country)
    location_text = location_text or country

    direct_url = https_url(record.get("job_url_direct"))
    company_url = https_url(record.get("company_url"))
    external_id = clean_text(record.get("id"), 500) or job_key
    if not external_id:
        external_id = hashlib.sha256(source_url.encode("utf-8")).hexdigest()[:32]
    company = clean_text(record.get("company"), 300) or "Undisclosed employer"

    return {
        "externalId": external_id,
        "title": title,
        "company": company,
        "companyWebsite": company_url,
        "description": description,
        "locationText": location_text,
        "address": {
            "city": city or None,
            "region": region or None,
            "country": country or None,
        },
        "workType": work_type,
        "eligibility": location_text,
        "employmentType": employment_type(record.get("job_type")),
        "salary": salary(record),
        "postedAt": date_posted,
        "sourceUrl": source_url,
        "applicationUrl": direct_url or source_url,
        "industry": clean_text(record.get("company_industry"), 300) or "Marketing",
    }


def jsearch_platform_url(
    record: dict[str, Any], provider: str
) -> tuple[str | None, str | None]:
    options = record.get("apply_options")
    candidates: list[tuple[str, Any]] = []
    if isinstance(options, list):
        for option in options:
            if not isinstance(option, dict):
                continue
            candidates.append(
                (clean_text(option.get("publisher")).lower(), option.get("apply_link"))
            )
    candidates.append(
        (
            clean_text(record.get("job_publisher")).lower(),
            record.get("job_apply_link"),
        )
    )
    prioritized = [candidate for candidate in candidates if provider in candidate[0]]
    prioritized.extend(candidate for candidate in candidates if candidate not in prioritized)
    for _publisher, candidate_url in prioritized:
        canonical, listing_id = canonical_platform_url(candidate_url, provider)
        if canonical:
            return canonical, listing_id
    return None, None


def jsearch_record(
    record: dict[str, Any], fallback_country: str, provider: str
) -> dict[str, Any] | None:
    source_url, listing_id = jsearch_platform_url(record, provider)
    if not source_url:
        return None
    posted_value: Any = record.get("job_posted_at_datetime_utc")
    if not clean_scalar(posted_value):
        timestamp = number(record.get("job_posted_at_timestamp"))
        if timestamp is not None:
            posted_value = datetime.fromtimestamp(timestamp, timezone.utc)
    mapped = {
        "id": listing_id or record.get("job_id"),
        "title": record.get("job_title"),
        "company": record.get("employer_name"),
        "company_url": record.get("employer_website"),
        "description": record.get("job_description"),
        "location": record.get("job_location"),
        "city": record.get("job_city"),
        "state": record.get("job_state"),
        "country": record.get("job_country") or fallback_country,
        "is_remote": record.get("job_is_remote"),
        "job_type": record.get("job_employment_type"),
        "min_amount": record.get("job_min_salary"),
        "max_amount": record.get("job_max_salary"),
        "currency": record.get("job_salary_currency")
        or ("CAD" if fallback_country == "Canada" else "USD"),
        "interval": record.get("job_salary_period"),
        "salary_source": "JSearch employer-provided or indexed salary fields",
        "date_posted": posted_value,
        "job_url": source_url,
        "job_url_direct": record.get("job_apply_link"),
    }
    return row_to_job(mapped, fallback_country, provider)


def collect_jsearch_jobs(
    provider: str,
) -> tuple[list[dict[str, Any]], int, int, list[str]]:
    api_key = os.environ.get("OPENWEBNINJA_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "OPENWEBNINJA_API_KEY is required for external "
            + provider
            + " discovery."
        )
    by_url: dict[str, dict[str, Any]] = {}
    collection_time = datetime.now(timezone.utc)
    searches_performed = 0
    searches_succeeded = 0
    errors: list[str] = []
    query_titles = (
        '"marketing manager" OR "growth marketing manager" OR '
        '"content marketing manager" OR "communications manager" OR '
        '"brand marketing manager"'
    )
    for country_code, country_name in COUNTRIES:
        searches_performed += 1
        query = query_titles + " in " + country_name + " via " + provider
        request_url = JSEARCH_API_URL + "?" + urlencode(
            {
                "query": query,
                "country": JSEARCH_COUNTRY_CODES[country_code],
                "language": "en",
                "date_posted": "week",
                "work_from_home": "true",
            }
        )
        request = Request(
            request_url,
            headers={
                "Accept": "application/json",
                "User-Agent": "Job-Lobster-GitHub-Collector/1.0",
                "x-api-key": api_key,
            },
        )
        try:
            with urlopen(request, timeout=90) as response:
                payload = json.loads(response.read(5_000_000))
            if not isinstance(payload, dict) or payload.get("status") != "OK":
                raise RuntimeError("JSearch returned a non-OK response.")
            raw_rows = payload.get("data")
            if not isinstance(raw_rows, list):
                raise RuntimeError("JSearch response did not contain a job list.")
            searches_succeeded += 1
            accepted_before = len(by_url)
            for raw_record in raw_rows:
                if not isinstance(raw_record, dict):
                    continue
                job = jsearch_record(raw_record, country_name, provider)
                if job and is_fresh_posting(job["postedAt"], collection_time):
                    by_url[job["sourceUrl"]] = job
            print(
                json.dumps(
                    {
                        "message": "jsearch_platform_search_complete",
                        "provider": provider,
                        "country": country_name,
                        "rows": len(raw_rows),
                        "qualified_in_search": len(by_url) - accepted_before,
                        "qualified_for_ingestion": len(by_url),
                    }
                )
            )
        except Exception as error:
            message = (
                provider
                + "/"
                + country_name
                + ": "
                + type(error).__name__
                + ": "
                + str(error)
            )
            errors.append(clean_text(message, 500))
            print(
                json.dumps(
                    {
                        "message": "jsearch_platform_search_failed",
                        "provider": provider,
                        "error": message,
                    }
                ),
                file=sys.stderr,
            )
        time.sleep(1)
    return list(by_url.values()), searches_performed, searches_succeeded, errors[:20]


def collect_external_search_snapshot(
    provider: str,
) -> tuple[list[dict[str, Any]], int, int, list[str]]:
    snapshot_path = EXTERNAL_SEARCH_DIR / (provider + ".json")
    try:
        payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(
            "External web-search snapshot is unavailable: " + str(error)
        ) from error
    if not isinstance(payload, dict) or payload.get("provider") != provider:
        raise RuntimeError("External web-search snapshot has an invalid provider.")
    raw_jobs = payload.get("jobs")
    if not isinstance(raw_jobs, list):
        raise RuntimeError("External web-search snapshot does not contain a job list.")
    queries = payload.get("queries")
    search_count = len(queries) if isinstance(queries, list) and queries else 1
    collection_time = datetime.now(timezone.utc)
    by_url: dict[str, dict[str, Any]] = {}
    for raw_record in raw_jobs:
        if not isinstance(raw_record, dict):
            continue
        job = row_to_job(raw_record, clean_text(raw_record.get("country")), provider)
        if job and is_fresh_posting(job["postedAt"], collection_time):
            by_url[job["sourceUrl"]] = job
    print(
        json.dumps(
            {
                "message": "external_web_search_snapshot_loaded",
                "provider": provider,
                "snapshot": str(snapshot_path.relative_to(snapshot_path.parents[2])),
                "searched_at": payload.get("searchedAt"),
                "rows": len(raw_jobs),
                "qualified_for_ingestion": len(by_url),
            }
        )
    )
    return list(by_url.values()), search_count, search_count, []


def collect_jobs(provider: str) -> tuple[list[dict[str, Any]], int, int, list[str]]:
    if provider in {"linkedin", "glassdoor"}:
        if provider == "glassdoor" and not os.environ.get(
            "OPENWEBNINJA_API_KEY", ""
        ).strip():
            return collect_external_search_snapshot(provider)
        return collect_jsearch_jobs(provider)
    by_url: dict[str, dict[str, Any]] = {}
    collection_time = datetime.now(timezone.utc)
    searches_performed = 0
    searches_succeeded = 0
    errors: list[str] = []
    for country_code, country_name in COUNTRIES:
        for search_term in SEARCH_TERMS[provider]:
            searches_performed += 1
            try:
                frame = scrape_jobs(
                    site_name=provider,
                    search_term=search_term,
                    location=country_name,
                    is_remote=provider == "glassdoor",
                    results_wanted=RESULTS_WANTED[provider],
                    hours_old=HOURS_OLD,
                    country_indeed=country_code,
                    description_format="markdown",
                    enforce_annual_salary=False,
                    verbose=1,
                )
                row_count = len(frame)
                searches_succeeded += 1
                for raw_record in frame.to_dict(orient="records"):
                    job = row_to_job(raw_record, country_name, provider)
                    if job and is_fresh_posting(job["postedAt"], collection_time):
                        by_url[job["sourceUrl"]] = job
                print(
                    json.dumps(
                        {
                            "message": "platform_search_complete",
                            "provider": provider,
                            "country": country_name,
                            "rows": row_count,
                            "qualified_for_ingestion": len(by_url),
                        }
                    )
                )
            except Exception as error:  # JobSpy raises provider-specific exceptions.
                message = (
                    provider
                    + "/"
                    + country_name
                    + ": "
                    + type(error).__name__
                    + ": "
                    + str(error)
                )
                errors.append(clean_text(message, 500))
                print(
                    json.dumps(
                        {
                            "message": "platform_search_failed",
                            "provider": provider,
                            "error": message,
                        }
                    ),
                    file=sys.stderr,
                )
            time.sleep(2)
    return list(by_url.values()), searches_performed, searches_succeeded, errors[:20]


def github_oidc_token() -> str:
    request_url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL", "")
    request_token = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "")
    if not request_url or not request_token:
        raise RuntimeError("GitHub OIDC environment is unavailable.")
    separator = "&" if "?" in request_url else "?"
    request = Request(
        request_url + separator + "audience=" + quote(AUDIENCE, safe=""),
        headers={"Authorization": "Bearer " + request_token, "Accept": "application/json"},
    )
    with urlopen(request, timeout=30) as response:
        payload = json.loads(response.read(100_000))
    token = payload.get("value")
    if not isinstance(token, str) or not token:
        raise RuntimeError("GitHub OIDC provider did not return a token.")
    return token


def post_batch(endpoint: str, token: str, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, allow_nan=False, separators=(",", ":")).encode("utf-8")
    request = Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "User-Agent": "Job-Lobster-GitHub-Collector/1.0",
        },
    )
    try:
        with urlopen(request, timeout=120) as response:
            response_body = response.read(200_000).decode("utf-8", errors="replace")
            if response.status not in (200, 201):
                raise RuntimeError("Ingestion returned HTTP " + str(response.status) + ": " + response_body)
            result = json.loads(response_body)
            print(
                json.dumps(
                    {
                        "message": "platform_batch_ingested",
                        "status": response.status,
                        "run_id": result.get("data", {}).get("runId")
                        or result.get("data", {}).get("id"),
                        "accepted": result.get("data", {}).get("jobsAccepted"),
                    }
                )
            )
    except HTTPError as error:
        detail = error.read(200_000).decode("utf-8", errors="replace")
        raise RuntimeError("Ingestion returned HTTP " + str(error.code) + ": " + detail) from error
    except URLError as error:
        raise RuntimeError("Ingestion endpoint is unavailable: " + str(error.reason)) from error


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Collect one public job platform and ingest it into Job Lobster."
    )
    parser.add_argument("--provider", choices=SUPPORTED_PROVIDERS, required=True)
    args = parser.parse_args()
    provider = args.provider
    endpoint = os.environ.get(
        "JOB_LOBSTER_INGEST_URL",
        "https://job-lobster.awcarr97.workers.dev/api/v1/ingest/platform-jobs",
    )
    jobs, searches_performed, searches_succeeded, errors = collect_jobs(provider)
    if searches_succeeded == 0:
        raise RuntimeError(
            "Every " + provider + " search failed; no ingestion was attempted."
        )
    if not jobs:
        raise RuntimeError(
            provider
            + " returned no current qualifying jobs; no empty ingestion batch was sent."
        )
    batches = [
        jobs[index : index + MAX_BATCH_SIZE]
        for index in range(0, len(jobs), MAX_BATCH_SIZE)
    ]
    collected_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    token = github_oidc_token()
    for batch_index, batch in enumerate(batches):
        post_batch(
            endpoint,
            token,
            {
                "provider": provider,
                "collector": COLLECTOR,
                "collectedAt": collected_at,
                "batchIndex": batch_index,
                "totalBatches": len(batches),
                "searchesPerformed": searches_performed if batch_index == 0 else 0,
                "searchesSucceeded": searches_succeeded if batch_index == 0 else 0,
                "errors": errors if batch_index == 0 else [],
                "jobs": batch,
            },
        )
    print(
        json.dumps(
            {
                "message": "platform_collection_complete",
                "provider": provider,
                "jobs": len(jobs),
                "batches": len(batches),
                "searches_succeeded": searches_succeeded,
                "searches_performed": searches_performed,
            }
        )
    )


if __name__ == "__main__":
    main()
