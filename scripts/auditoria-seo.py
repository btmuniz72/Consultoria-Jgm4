#!/usr/bin/env python3
"""Auditoria técnica de SEO da JGM4 a partir do sitemap.

O modo local valida os arquivos antes da publicação. O modo remoto consulta a
produção, registra o status HTTP e identifica redirecionamentos reais.
"""

from __future__ import annotations

import argparse
import html
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable


CANONICAL_ORIGIN = "https://www.jgm4consultoria.com.br"
DEFAULT_SITEMAP = "sitemap.xml"
DEFAULT_REPORT = "RELATORIO-AUDITORIA-SEO-AUTOMATICA.md"
USER_AGENT = "JGM4-SEO-Audit/1.0 (+https://www.jgm4consultoria.com.br/)"
SKIP_SCHEMES = ("mailto:", "tel:", "javascript:", "data:", "blob:")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.h1_parts: list[list[str]] = []
        self._in_title = False
        self._h1_depth = 0
        self.meta: list[dict[str, str]] = []
        self.links: list[dict[str, str]] = []
        self.anchors: list[dict[str, str]] = []
        self.html_lang = ""
        self.ids: Counter[str] = Counter()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = {key.lower(): value or "" for key, value in attrs}
        tag = tag.lower()
        if tag == "html":
            self.html_lang = data.get("lang", "")
        elif tag == "title":
            self._in_title = True
        elif tag == "h1":
            self._h1_depth += 1
            self.h1_parts.append([])
        elif tag == "meta":
            self.meta.append(data)
        elif tag == "link":
            self.links.append(data)
        elif tag == "a":
            self.anchors.append(data)
        if data.get("id"):
            self.ids[data["id"]] += 1

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title":
            self._in_title = False
        elif tag == "h1" and self._h1_depth:
            self._h1_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title_parts.append(data)
        if self._h1_depth and self.h1_parts:
            self.h1_parts[-1].append(data)

    @staticmethod
    def clean(parts: Iterable[str]) -> str:
        return re.sub(r"\s+", " ", " ".join(parts)).strip()

    @property
    def title(self) -> str:
        return self.clean(self.title_parts)

    @property
    def h1s(self) -> list[str]:
        return [self.clean(parts) for parts in self.h1_parts]

    def meta_content(self, key: str, value: str) -> str:
        value = value.lower()
        for item in self.meta:
            if item.get(key, "").lower() == value:
                return html.unescape(item.get("content", "").strip())
        return ""

    def link_values(self, rel: str) -> list[str]:
        result = []
        for item in self.links:
            rels = item.get("rel", "").lower().split()
            if rel in rels and item.get("href"):
                result.append(html.unescape(item["href"].strip()))
        return result

    def hreflangs(self) -> dict[str, str]:
        return {
            item.get("hreflang", ""): html.unescape(item.get("href", "").strip())
            for item in self.links
            if "alternate" in item.get("rel", "").lower().split()
            and item.get("hreflang")
            and item.get("href")
        }


@dataclass
class FetchResult:
    requested_url: str
    status: int
    final_url: str
    content: str = ""
    location: str = ""
    error: str = ""

    @property
    def redirected(self) -> bool:
        return bool(self.location or self.final_url != self.requested_url)


@dataclass
class PageResult:
    url: str
    file: str
    status: int
    final_url: str
    redirect: str
    title: str
    description: str
    h1: str
    h1_count: int
    canonical: str
    canonical_count: int
    robots: str
    domain: str
    lang: str
    indexable: bool
    hreflangs: dict[str, str] = field(default_factory=dict)
    internal_links: set[str] = field(default_factory=set)
    broken_links: list[str] = field(default_factory=list)
    duplicate_ids: list[str] = field(default_factory=list)
    error: str = ""


def normalize_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    path = parsed.path or "/"
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, ""))


def local_path(site_root: Path, url: str) -> Path:
    path = urllib.parse.unquote(urllib.parse.urlsplit(url).path)
    if path == "/":
        return site_root / "index.html"
    relative = path.lstrip("/")
    if path.endswith("/"):
        relative += "index.html"
    return site_root / Path(relative)


def read_sitemap(path: Path) -> list[str]:
    root = ET.parse(path).getroot()
    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = [node.text.strip() for node in root.findall("sm:url/sm:loc", namespace) if node.text]
    if not urls:
        raise ValueError(f"Nenhuma URL encontrada em {path}")
    return urls


def fetch_local(site_root: Path, url: str) -> FetchResult:
    path = local_path(site_root, url)
    if not path.is_file():
        return FetchResult(url, 404, url, error=f"Arquivo ausente: {path}")
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        return FetchResult(url, 500, url, error=f"UTF-8 inválido: {exc}")
    return FetchResult(url, 200, url, content=content)


def fetch_remote(url: str, timeout: float) -> FetchResult:
    opener = urllib.request.build_opener(NoRedirect)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*;q=0.8"})
    try:
        with opener.open(request, timeout=timeout) as response:
            body = response.read()
            charset = response.headers.get_content_charset() or "utf-8"
            return FetchResult(url, response.status, response.geturl(), body.decode(charset, errors="replace"))
    except urllib.error.HTTPError as exc:
        location = exc.headers.get("Location", "")
        if location:
            location = urllib.parse.urljoin(url, location)
        body = exc.read()
        charset = exc.headers.get_content_charset() or "utf-8"
        return FetchResult(url, exc.code, url, body.decode(charset, errors="replace"), location, str(exc))
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return FetchResult(url, 0, url, error=str(exc))


def parse_page(site_root: Path, page_url: str, fetched: FetchResult) -> PageResult:
    parser = PageParser()
    if fetched.content:
        try:
            parser.feed(fetched.content)
        except Exception as exc:
            fetched.error = f"{fetched.error}; HTML: {exc}".strip("; ")

    canonical_values = parser.link_values("canonical")
    canonical = urllib.parse.urljoin(page_url, canonical_values[0]) if canonical_values else ""
    robots = parser.meta_content("name", "robots")
    description = parser.meta_content("name", "description")
    internal: set[str] = set()
    for anchor in parser.anchors:
        href = html.unescape(anchor.get("href", "").strip())
        if not href or href.startswith(SKIP_SCHEMES) or href.startswith("#"):
            continue
        target = normalize_url(urllib.parse.urljoin(page_url, href))
        if urllib.parse.urlsplit(target).netloc == urllib.parse.urlsplit(CANONICAL_ORIGIN).netloc:
            internal.add(target)

    path = local_path(site_root, page_url)
    try:
        file_name = path.relative_to(site_root).as_posix()
    except ValueError:
        file_name = str(path)
    noindex = "noindex" in robots.lower()
    indexable = (
        fetched.status == 200
        and not fetched.redirected
        and not noindex
        and canonical == page_url
        and urllib.parse.urlsplit(page_url).scheme == "https"
        and urllib.parse.urlsplit(page_url).netloc == "www.jgm4consultoria.com.br"
    )
    return PageResult(
        url=page_url,
        file=file_name,
        status=fetched.status,
        final_url=fetched.final_url,
        redirect=fetched.location,
        title=parser.title,
        description=description,
        h1=parser.h1s[0] if parser.h1s else "",
        h1_count=len(parser.h1s),
        canonical=canonical,
        canonical_count=len(canonical_values),
        robots=robots,
        domain=urllib.parse.urlsplit(page_url).netloc,
        lang=parser.html_lang,
        indexable=indexable,
        hreflangs=parser.hreflangs(),
        internal_links=internal,
        duplicate_ids=sorted(key for key, count in parser.ids.items() if count > 1),
        error=fetched.error,
    )


def check_links(
    pages: list[PageResult], site_root: Path, mode: str, timeout: float
) -> dict[str, int]:
    status_cache = {page.url: page.status for page in pages}
    incoming: Counter[str] = Counter()
    sitemap_urls = {page.url for page in pages}
    for page in pages:
        for target in page.internal_links:
            clean_target = target.split("#", 1)[0]
            if clean_target in sitemap_urls:
                incoming[clean_target] += 1
            if clean_target not in status_cache:
                if mode == "local":
                    status_cache[clean_target] = 200 if local_path(site_root, clean_target).is_file() else 404
                else:
                    status_cache[clean_target] = fetch_remote(clean_target, timeout).status
            status = status_cache[clean_target]
            if status == 0 or status >= 400 or 300 <= status < 400:
                page.broken_links.append(f"{clean_target} ({status or 'erro'})")
    return dict(incoming)


def page_issues(page: PageResult) -> list[str]:
    issues: list[str] = []
    if page.status != 200:
        issues.append(f"HTTP {page.status or 'indisponível'}")
    if page.redirect or page.final_url != page.url:
        issues.append(f"redireciona para {page.redirect or page.final_url}")
    if not page.title:
        issues.append("title ausente")
    if not page.description:
        issues.append("description ausente")
    if page.h1_count != 1:
        issues.append(f"{page.h1_count} H1")
    if page.canonical_count != 1:
        issues.append(f"{page.canonical_count} canonicals")
    elif page.canonical != page.url:
        issues.append(f"canonical divergente: {page.canonical or 'ausente'}")
    if "noindex" in page.robots.lower():
        issues.append("noindex no sitemap")
    if page.domain != "www.jgm4consultoria.com.br":
        issues.append("domínio sem www")
    if urllib.parse.urlsplit(page.url).scheme != "https":
        issues.append("URL sem HTTPS")
    if page.duplicate_ids:
        issues.append("IDs duplicados: " + ", ".join(page.duplicate_ids))
    if page.broken_links:
        issues.append(f"{len(page.broken_links)} links quebrados/redirects")
    if page.error and page.status == 0:
        issues.append(page.error)
    return issues


def duplicate_groups(pages: list[PageResult], attr: str) -> dict[str, list[str]]:
    groups: defaultdict[str, list[str]] = defaultdict(list)
    for page in pages:
        value = getattr(page, attr).strip()
        if value:
            groups[value].append(page.url)
    return {value: urls for value, urls in groups.items() if len(urls) > 1}


def hreflang_issues(pages: list[PageResult]) -> list[str]:
    by_url = {page.url: page for page in pages}
    issues: list[str] = []
    for page in pages:
        for lang, target in page.hreflangs.items():
            target = normalize_url(urllib.parse.urljoin(page.url, target))
            if target not in by_url:
                issues.append(f"{page.url}: hreflang {lang} aponta fora do sitemap ({target})")
                continue
            reciprocal = {
                normalize_url(urllib.parse.urljoin(target, value))
                for value in by_url[target].hreflangs.values()
            }
            if page.url not in reciprocal:
                issues.append(f"{page.url}: hreflang {lang} sem reciprocidade em {target}")
    return sorted(set(issues))


def md(value: object) -> str:
    return str(value or "—").replace("|", "\\|").replace("\n", " ")


def write_report(
    output: Path,
    pages: list[PageResult],
    mode: str,
    incoming: dict[str, int],
) -> None:
    title_duplicates = duplicate_groups(pages, "title")
    description_duplicates = duplicate_groups(pages, "description")
    href_issues = hreflang_issues(pages)
    sitemap_duplicates = [url for url, count in Counter(page.url for page in pages).items() if count > 1]
    orphans = [page.url for page in pages if page.url != CANONICAL_ORIGIN + "/" and incoming.get(page.url, 0) == 0]
    problem_pages = [(page, page_issues(page)) for page in pages if page_issues(page)]
    broken_total = sum(len(page.broken_links) for page in pages)

    lines = [
        "# Relatório de Auditoria SEO Automática — JGM4",
        "",
        f"- Gerado em: {datetime.now().astimezone().isoformat(timespec='seconds')}",
        f"- Modo: **{mode}**",
        f"- URLs no sitemap: **{len(pages)}**",
        f"- Páginas com problema: **{len(problem_pages)}**",
        f"- Links internos quebrados ou para redirect: **{broken_total}**",
        f"- Titles duplicados: **{len(title_duplicates)}**",
        f"- Descriptions duplicadas: **{len(description_duplicates)}**",
        f"- Páginas órfãs no sitemap: **{len(orphans)}**",
        "",
        "## Problemas detectados",
        "",
    ]
    if not problem_pages and not sitemap_duplicates and not title_duplicates and not description_duplicates and not href_issues and not orphans:
        lines.append("Nenhum problema técnico foi detectado no escopo desta execução.")
    for page, issues in problem_pages:
        lines.append(f"- `{page.url}` — {'; '.join(issues)}")
        for broken in page.broken_links:
            lines.append(f"  - link: `{broken}`")
    for url in sitemap_duplicates:
        lines.append(f"- URL duplicada no sitemap: `{url}`")
    for value, urls in title_duplicates.items():
        lines.append(f"- Title duplicado: **{md(value)}** — " + ", ".join(f"`{url}`" for url in urls))
    for value, urls in description_duplicates.items():
        lines.append(f"- Description duplicada: **{md(value)}** — " + ", ".join(f"`{url}`" for url in urls))
    for issue in href_issues:
        lines.append(f"- {issue}")
    for url in orphans:
        lines.append(f"- Página órfã: `{url}`")

    lines += [
        "",
        "## Inventário completo",
        "",
        "| URL | HTTP | Redirect | Title | Description | H1 | H1s | Canonical | Robots | Domínio | Indexável | Links quebrados |",
        "|---|---:|---|---|---|---|---:|---|---|---|---|---:|",
    ]
    for page in pages:
        lines.append(
            "| " + " | ".join(
                md(value)
                for value in (
                    page.url,
                    page.status or "erro",
                    page.redirect or (page.final_url if page.final_url != page.url else ""),
                    page.title,
                    page.description,
                    page.h1,
                    page.h1_count,
                    page.canonical,
                    page.robots,
                    page.domain,
                    "sim" if page.indexable else "não",
                    len(page.broken_links),
                )
            ) + " |"
        )

    lines += ["", "## Hreflang", ""]
    multilingual = [page for page in pages if page.hreflangs]
    if not multilingual:
        lines.append("Nenhum hreflang declarado.")
    for page in multilingual:
        pairs = "; ".join(f"{lang}: {url}" for lang, url in page.hreflangs.items())
        lines.append(f"- `{page.url}` — {pairs}")

    output.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audita o sitemap e gera relatório Markdown de SEO.")
    parser.add_argument("--sitemap", default=DEFAULT_SITEMAP, help="Caminho do sitemap.xml")
    parser.add_argument("--output", default=DEFAULT_REPORT, help="Caminho do relatório Markdown")
    parser.add_argument("--mode", choices=("local", "remote"), default="local", help="Origem a validar")
    parser.add_argument("--timeout", type=float, default=15.0, help="Timeout HTTP por URL")
    args = parser.parse_args()

    sitemap = Path(args.sitemap).resolve()
    site_root = sitemap.parent
    output = Path(args.output).resolve()
    urls = read_sitemap(sitemap)
    pages: list[PageResult] = []
    for index, url in enumerate(urls, start=1):
        print(f"[{index:02d}/{len(urls):02d}] {url}", file=sys.stderr)
        fetched = fetch_local(site_root, url) if args.mode == "local" else fetch_remote(url, args.timeout)
        pages.append(parse_page(site_root, url, fetched))

    incoming = check_links(pages, site_root, args.mode, args.timeout)
    write_report(output, pages, args.mode, incoming)
    problems = sum(bool(page_issues(page)) for page in pages)
    print(f"Relatório: {output}")
    print(f"URLs: {len(pages)} | páginas com problema: {problems}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
