#!/usr/bin/env python3
"""Fail closed when the Woodshed's declared repository profile drifts."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []


def read(relative: str) -> str:
    path = ROOT / relative
    if not path.is_file():
        ERRORS.append(f"missing required file: {relative}")
        return ""
    return path.read_text(encoding="utf-8")


def expect_equal(actual: object, expected: object, label: str) -> None:
    if actual != expected:
        ERRORS.append(f"{label}: expected {expected!r}, found {actual!r}")


def expect_contains(text: str, needles: tuple[str, ...], label: str) -> None:
    for needle in needles:
        if needle not in text:
            ERRORS.append(f"{label}: missing contract text {needle!r}")


try:
    declaration = json.loads(read("tinyland.repo.json"))
except json.JSONDecodeError as error:
    ERRORS.append(f"tinyland.repo.json: invalid JSON: {error}")
    declaration = {}

if "scaffold_tag" in declaration:
    ERRORS.append("tinyland.repo.json: scaffold_tag implies wholesale scaffold release adoption")

expect_equal(declaration.get("schema_version"), 1, "schema_version")
expect_equal(
    declaration.get("repo", {}).get("name"),
    "dsa-woodshed.space",
    "repo.name",
)
expect_equal(
    declaration.get("repo", {}).get("domain"),
    "dsa-woodshed.space",
    "repo.domain",
)
expect_equal(
    declaration.get("profile"),
    {
        "kind": "custom-public-standalone",
        "derived_from": "tinyland-inc/site.scaffold",
        "adoption": "selective",
        "selective_audit_status": "pending-release",
        "selective_audit_after": "v0.4.0",
        "selective_audit_outcomes": ["adopt", "adapt", "reject"],
    },
    "profile",
)
expect_equal(
    declaration.get("tooling"),
    {
        "front_door": "just",
        "canonical_build": "pnpm-vite",
        "bazel_role": "module-graph-and-package-pin-proof-only",
    },
    "tooling",
)
expect_equal(
    declaration.get("agent_handoff"),
    {
        "owner_repo": "Jesssullivan/dsa-woodshed.space",
        "machine_map_authority_repo": "Jesssullivan/dsa-study-packet",
        "public_surfaces": ["/agent", "/llms.txt", "/agent-map.md"],
        "inherits_scaffold_marketplace": False,
    },
    "agent_handoff",
)
expect_equal(
    declaration.get("execution_evidence"),
    {
        "github_actions_capability": "ubuntu-latest",
        "runner_pickup": "github-hosted-ownership-migration-bridge",
        "gf_consumer_enrollment": "unproved",
        "gf_shared_cache": "unproved",
        "gf_reapi_rbe": "unproved",
    },
    "execution_evidence",
)

boundaries = declaration.get("boundaries", {})
for name in ("owns_runtime_backend", "owns_auth", "owns_payments", "owns_gitops_apply"):
    expect_equal(boundaries.get(name), False, f"boundaries.{name}")
expect_equal(
    declaration.get("content", {}).get("authority_repo"),
    "Jesssullivan/dsa-study-packet",
    "content authority",
)

readme = read("README.md")
agents = read("AGENTS.md")
for label, text in (("README.md", readme), ("AGENTS.md", agents)):
    expect_contains(
        text,
        (
            "custom public-standalone",
            "tinyland-inc/site.scaffold",
            "pnpm/Vite",
            "`just`",
            "/agent",
            "static/llms.txt",
            "static/agent-map.md",
            ".agents/skills",
            ".claude-plugin",
            "plugins/scaffold-core",
            "GitHub-hosted runner pickup",
            "does not prove",
            "shared-cache",
            "REAPI",
            "RBE",
            "unproved and unclaimed",
        ),
        label,
    )
    for prohibited_claim in (
        "GF-backed",
        "GloriousFlywheel-backed",
        "shared-cache-backed",
        "REAPI-backed",
        "RBE-backed",
        "GF consumer enrollment is proved",
        "shared-cache attachment is proved",
        "REAPI is proved",
        "RBE is proved",
    ):
        if prohibited_claim in text:
            ERRORS.append(
                f"{label}: contradicts the unproved GF boundary with {prohibited_claim!r}"
            )

expect_contains(
    readme,
    (
        "Status: pending the site.scaffold v0.4.0 release.",
        "| Public CI, security, and accessibility checks | Adopt |",
        "| Public static-Svelte presentation primitives | Adapt |",
        "| `.agents/skills`, `.claude-plugin`, and `plugins/scaffold-core` | Reject |",
    ),
    "selective scaffold audit ledger",
)

for relative in (
    "src/routes/agent/+page.svelte",
    "src/routes/agent/+page.ts",
    "static/llms.txt",
    "static/agent-map.md",
):
    read(relative)

expect_contains(
    read("src/lib/navigation.ts"),
    ("export const AGENT_ROUTE = '/agent';",),
    "agent navigation",
)
expect_contains(
    read("src/routes/+layout.ts"),
    ("export const prerender = true;",),
    "root prerender contract",
)
expect_contains(read("src/routes/sitemap.xml/+server.ts"), ("AGENT_ROUTE",), "sitemap")
expect_contains(
    read("e2e/overflow.spec.ts"),
    ("'/agent'", "'/agent-map.md'", "'/llms.txt'"),
    "agent browser coverage",
)
expect_contains(
    read("scripts/sync-content.mjs"),
    (
        "const AGENT_MAP_INPUT = 'agent-map.md';",
        "const AGENT_MAP_PATH = join(REPO_ROOT, 'static', 'agent-map.md');",
        "const sourceRepo = lock.sourceRepo;",
    ),
    "packet agent-map sync",
)

for forbidden in (".agents/skills", ".claude-plugin", "plugins/scaffold-core"):
    if (ROOT / forbidden).exists():
        ERRORS.append(f"scaffold marketplace surface must remain absent: {forbidden}")
if (ROOT / "flake.nix").exists():
    ERRORS.append("private scaffold Nix flake must remain absent")

for relative in (".github/ISSUE_TEMPLATE/bug.md", ".github/ISSUE_TEMPLATE/feature.md"):
    template = read(relative)
    expect_contains(template, ("The DSA Woodshed",), relative)
    if "site.scaffold" in template:
        ERRORS.append(f"{relative}: stale site.scaffold product identity")
if (ROOT / ".github/ISSUE_TEMPLATE/provider-request.md").exists():
    ERRORS.append("unrelated oauth-mux provider issue template must remain absent")

package = json.loads(read("package.json"))
expect_equal(package.get("packageManager"), "pnpm@10.13.1", "packageManager")
expect_equal(package.get("scripts", {}).get("build"), "vite build", "canonical build script")
expect_contains(
    package.get("scripts", {}).get("lint", ""),
    ("pnpm run verify:repo-profile",),
    "CI lint gate",
)

justfile = read("Justfile")
expect_contains(
    justfile,
    (
        "repo-profile:",
        "pnpm run verify:repo-profile",
        "bazel-graph:",
        "pnpm run build",
    ),
    "Justfile",
)

workflow_paths = sorted((ROOT / ".github/workflows").glob("*.yml"))
workflow_paths += sorted((ROOT / ".github/workflows").glob("*.yaml"))
if not workflow_paths:
    ERRORS.append("workflows: no workflow files found")
workflows = "\n".join(path.read_text(encoding="utf-8") for path in workflow_paths)
if "runs-on:" not in workflows:
    ERRORS.append("workflows: no runner declarations found")
for line in workflows.splitlines():
    if "runs-on:" in line and line.strip() != "runs-on: ubuntu-latest":
        ERRORS.append(f"workflows: unexpected runner declaration {line.strip()!r}")
for stale_claim in ("GF-backed", "GloriousFlywheel-backed"):
    if stale_claim in workflows:
        ERRORS.append(f"workflows: stale GF execution claim present: {stale_claim!r}")

execution_surfaces = {
    "workflows": workflows,
    "Justfile": justfile,
    "package.json": json.dumps(package, sort_keys=True),
}
for bazelrc in sorted(ROOT.glob(".bazelrc*")):
    if bazelrc.is_file():
        execution_surfaces[bazelrc.name] = bazelrc.read_text(encoding="utf-8")
for label, text in execution_surfaces.items():
    for forbidden in (
        "--remote_cache",
        "--remote_executor",
        "remote_cache=",
        "remote_executor=",
        "reapi://",
        "grpcs://",
        "GF_BAZEL_",
        "FLYWHEEL_PROFILE",
    ):
        if forbidden in text:
            ERRORS.append(
                f"{label}: unproved GF cache/RBE signal present: {forbidden!r}"
            )

if ERRORS:
    print("repository profile check failed:")
    for error in ERRORS:
        print(f"- {error}")
    raise SystemExit(1)

print("repository profile: custom public-standalone contract verified")
