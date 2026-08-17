"""Collect fresh Indeed jobs on a GitHub-hosted runner and ingest them into Job Lobster."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen

from jobspy import scrape_jobs


AUDIENCE = "job-lobster-platform-ingest"
COLLECTOR = "github-actions-jobspy/1.1.82"
MAX_BATCH_SIZE = 100
RESULTS_WANTED = 125
HOURS_OLD = 168
SEARCH_TERMS = (
    '"marketing manager" remote -product -intern -sales',
    '("growth marketing manager" OR "digital marketing manager") remote -product',
    '("content marketing manager" OR "communications manager") remote -product',
    '("brand marketing manager" OR "marketing lead" OR "head of content") remote -product',
)
COUNTRIES = (
    ("USA", "United States"),
    ("Canada", "Canada"),
)
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


def canonical_indeed_url(value: Any) -> tuple[str | None, str | None]:
    raw = https_url(value)
    if not raw:
        return None, None
    parsed = urlparse(raw)
    hostname = (parsed.hostname or "").lower()
    if hostname != "indeed.com" and not hostname.endswith(".indeed.com"):
        return None, None
    job_key = parse_qs(parsed.query).get("jk", [None])[0]
    if job_key:
        canonical = urlunparse(
            (parsed.scheme, parsed.netloc, "/viewjob", "", urlencode({"jk": job_key}), "")
        )
        return canonical, job_key
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


def row_to_job(record: dict[str, Any], fallback_country: str) -> dict[str, Any] | None:
    title = clean_text(record.get("title"), 300)
    if not title or not TARGET_TITLE.search(title) or EXCLUDED_TITLE.search(title):
        return None
    source_url, job_key = canonical_indeed_url(record.get("job_url"))
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


def collect_jobs() -> tuple[list[dict[str, Any]], int, int, list[str]]:
    by_url: dict[str, dict[str, Any]] = {}
    collection_time = datetime.now(timezone.utc)
    searches_performed = 0
    searches_succeeded = 0
    errors: list[str] = []
    for country_code, country_name in COUNTRIES:
        for search_term in SEARCH_TERMS:
            searches_performed += 1
            try:
                frame = scrape_jobs(
                    site_name="indeed",
                    search_term=search_term,
                    location=country_name,
                    results_wanted=RESULTS_WANTED,
                    hours_old=HOURS_OLD,
                    country_indeed=country_code,
                    description_format="markdown",
                    enforce_annual_salary=False,
                    verbose=1,
                )
                searches_succeeded += 1
                for raw_record in frame.to_dict(orient="records"):
                    job = row_to_job(raw_record, country_name)
                    if job and is_fresh_posting(job["postedAt"], collection_time):
                        by_url[job["sourceUrl"]] = job
                print(
                    json.dumps(
                        {
                            "message": "indeed_search_complete",
                            "country": country_name,
                            "rows": len(frame),
                            "qualified_for_ingestion": len(by_url),
                        }
                    )
                )
            except Exception as error:  # JobSpy raises provider-specific exceptions.
                message = country_name + ": " + type(error).__name__ + ": " + str(error)
                errors.append(clean_text(message, 500))
                print(json.dumps({"message": "indeed_search_failed", "error": message}), file=sys.stderr)
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
    endpoint = os.environ.get(
        "JOB_LOBSTER_INGEST_URL",
        "https://job-lobster.awcarr97.workers.dev/api/v1/ingest/platform-jobs",
    )
    jobs, searches_performed, searches_succeeded, errors = collect_jobs()
    if searches_succeeded == 0:
        raise RuntimeError("Every Indeed search failed; no ingestion was attempted.")
    batches = [jobs[index : index + MAX_BATCH_SIZE] for index in range(0, len(jobs), MAX_BATCH_SIZE)]
    if not batches:
        batches = [[]]
    collected_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    token = github_oidc_token()
    for batch_index, batch in enumerate(batches):
        post_batch(
            endpoint,
            token,
            {
                "provider": "indeed",
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
                "message": "indeed_collection_complete",
                "jobs": len(jobs),
                "batches": len(batches),
                "searches_succeeded": searches_succeeded,
                "searches_performed": searches_performed,
            }
        )
    )


if __name__ == "__main__":
    main()
