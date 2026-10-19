#!/usr/bin/env python3
"""Build a game's 3D table as one self-contained HTML file.

From cassino web3d/build.py @ 73f0cd7 (itself from piquet web3d/build.py
@ 254cb3c), generalised: what was cassino's is now a small config, a TOML
file (default web3d/game.toml).

    python3 kit/build.py                 build the page
    python3 kit/build.py --check         build in memory; fail if the committed page differs
    python3 kit/build.py --dry-run       print the plan and what is missing; build nothing
    python3 kit/build.py --output-path   print where the page goes (for bin/gate)

It compiles the engine to WebAssembly (when the game has one), bundles the
game's entry with esbuild (the kit and three.js from the game's own
node_modules included), and inlines the engine, the bundle, the stylesheet
and the extra assets into the page template. The page needs no server and no
network. It prints what every part weighs; over the guideline it warns
rather than fails (the user set 5 MB as a guideline for modesty, "it's not a
HARD limit").

The config (paths are relative to the config file):

    name = "strohmandeln"                    # required: only for messages
    entry = "src/main.js"                    # required: the page's script
    template = "src/index.html"              # required
    style = "src/style.css"                  # required
    kit_styles = ["../kit/css/hud.css"]      # the kit's stylesheets, inlined before `style`
    output = "strohmandeln3d.html"           # required: the page
    crate = "strohmandeln-wasm"              # the engine's cargo package; omit for no engine yet
    worker_entry = "src/tutorworker-entry.js"  # a second bundle, inlined as text (the tutor's worker)
    worker_placeholder = "/*TUTORWORKER*/"   # default; wasm placeholder is __WASM_BASE64__ and
    guideline_bytes = 5242880                # the others are /*STYLE*/ and /*APP*/

    [[assets]]                               # any number: a file or folder inlined at a placeholder
    placeholder = "/*ART*/"
    path = "art/cards"
    kind = "images"                          # images: a folder -> JSON {stem: data URI}
    count = 54                               #   (count: how many files to expect, optional)
    [[assets]]
    placeholder = "/*WORDS*/"
    path = "words.json"
    kind = "json"                            # json: minified; text: verbatim
    optional = true                          #   (json only: {} when the file is absent)

Needs `npm ci` in the game's web3d/ first (esbuild and three.js, pinned by its
package-lock.json). The kit's own `import "three"` is resolved from there:
kit/node_modules is a symlink to ../web3d/node_modules, and NODE_PATH points
at the same place for esbuild (kit/README.md).
"""

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import tomllib
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

KIT = Path(__file__).resolve().parent
DEFAULT_ROOT = KIT.parent
DEFAULT_CONFIG = "web3d/game.toml"
KINDS = ("images", "json", "text")
# Images, and (la_belle_lucie) sound: a folder of either is inlined as data URIs.
IMAGE_TYPES = {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".m4a": "audio/mp4"}


@dataclass
class Asset:
    placeholder: str
    path: Path
    kind: str
    count: int | None = None
    optional: bool = False


@dataclass
class Config:
    root: Path
    here: Path  # the config's folder: the game's web3d/
    name: str
    entry: Path
    template: Path
    style: Path
    output: Path
    kit_styles: list[Path] = field(default_factory=list)
    crate: str | None = None
    worker_entry: Path | None = None
    worker_placeholder: str = "/*TUTORWORKER*/"
    guideline: int = 5 * 1024 * 1024
    assets: list[Asset] = field(default_factory=list)

    @property
    def wasm(self) -> Path | None:
        if not self.crate:
            return None
        return self.root / "target" / "wasm32-unknown-unknown" / "release" / (self.crate.replace("-", "_") + ".wasm")


def load_config(path: Path, root: Path = DEFAULT_ROOT) -> Config:
    path = Path(path)
    if not path.exists():
        sys.exit(f"no config at {path}: write one (see the top of kit/build.py)")
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    here = path.resolve().parent
    for key in ("name", "entry", "template", "style", "output"):
        if key not in raw:
            sys.exit(f"{path}: the config needs `{key}` (see the top of kit/build.py)")
    assets = []
    for a in raw.get("assets", []):
        if a.get("kind") not in KINDS:
            sys.exit(f"{path}: asset {a.get('placeholder')}: kind {a.get('kind')!r} is not one of {', '.join(KINDS)}")
        assets.append(Asset(a["placeholder"], here / a["path"], a["kind"], a.get("count"), a.get("optional", False)))
    return Config(
        root=Path(root).resolve(),
        here=here,
        name=raw["name"],
        entry=here / raw["entry"],
        template=here / raw["template"],
        style=here / raw["style"],
        output=here / raw["output"],
        kit_styles=[here / p for p in raw.get("kit_styles", [])],
        crate=raw.get("crate"),
        worker_entry=here / raw["worker_entry"] if "worker_entry" in raw else None,
        worker_placeholder=raw.get("worker_placeholder", "/*TUTORWORKER*/"),
        guideline=raw.get("guideline_bytes", 5 * 1024 * 1024),
        assets=assets,
    )


def parts(cfg: Config) -> list[tuple[str, Callable[[str], bool]]]:
    """Where each bundled source file is reported; first match wins. Paths are
    as esbuild reports them, relative to the game's web3d/ (where it runs); a
    package is matched wherever its node_modules is, since esbuild reports a
    symlinked node_modules by its real path."""
    kit = os.path.relpath(KIT, cfg.here).replace(os.sep, "/") + "/"
    return [
        ("three.js", lambda p: "node_modules/three/" in p),
        ("other libraries", lambda p: "node_modules/" in p),
        ("the kit's code", lambda p: p.startswith(kit)),
        ("the table's own code", lambda p: True),
    ]


def run_tool(cmd: list[str], what: str, **kwargs) -> None:
    """Run a tool; a failure ends the build with one line saying which tool, not a traceback."""
    try:
        subprocess.run(cmd, check=True, **kwargs)
    except FileNotFoundError:
        sys.exit(f"{what}: {cmd[0]} is not installed or not on PATH")
    except subprocess.CalledProcessError as e:
        sys.exit(f"{what} failed (exit {e.returncode}); its messages are above")


def rust_env(cfg: Config) -> dict[str, str]:
    """The environment of the wasm build. The module embeds the source paths of
    panics (the repository, the cargo registry, the toolchain): remapped, so the
    same sources give the same bytes in any checkout, user and home directory,
    which `--check` relies on. (An explicit RUSTFLAGS in the caller's
    environment is replaced, not extended, for the same reason.)"""
    home = Path(os.environ.get("CARGO_HOME") or Path.home() / ".cargo")
    flags = [f"--remap-path-prefix={cfg.root}=/{cfg.name}", f"--remap-path-prefix={home}=/cargo"]
    rustup = os.environ.get("RUSTUP_HOME") or str(Path.home() / ".rustup")
    flags.append(f"--remap-path-prefix={rustup}=/rustup")
    return {**os.environ, "RUSTFLAGS": " ".join(flags)}


def build_wasm(cfg: Config) -> bytes:
    cargo = Path.home() / ".cargo" / "bin" / "cargo"
    run_tool(
        [str(cargo) if cargo.exists() else "cargo", "build", "--release", "-q",
         "-p", cfg.crate, "--lib", "--target", "wasm32-unknown-unknown"],
        f"building {cfg.crate}", cwd=cfg.root, env=rust_env(cfg),
    )
    if not cfg.wasm.exists():
        sys.exit(f"cargo built {cfg.crate} but {cfg.wasm} is not there: is it a cdylib crate?")
    return cfg.wasm.read_bytes()


def bundle(cfg: Config, entry: Path) -> tuple[str, dict[str, int]]:
    """A script of the page (the table's, or the tutor's worker), minified, and
    how many of its bytes each part owns."""
    esbuild = cfg.here / "node_modules" / ".bin" / "esbuild"
    if not esbuild.exists():
        sys.exit(f"esbuild is missing: run `npm ci` in {cfg.here}/ first")
    # The kit's `import "three"` is found by walking up from kit/js, which never
    # passes through the game's node_modules; kit/node_modules (a symlink there)
    # and NODE_PATH are the two ways in, so a broken link does not break the build.
    env = {**os.environ, "NODE_PATH": str(cfg.here / "node_modules")}
    with tempfile.TemporaryDirectory() as tmp:
        out, meta = Path(tmp) / "app.js", Path(tmp) / "meta.json"
        run_tool(
            [str(esbuild), str(entry), "--bundle", "--minify", "--format=iife",
             "--target=es2022", "--platform=browser", "--legal-comments=eof",
             # A tutorial's pages are Markdown, inlined as text.
             "--loader:.md=text",
             f"--outfile={out}", f"--metafile={meta}", "--log-level=warning"],
            f"bundling {shown(cfg, entry)}", cwd=cfg.here, env=env,
        )
        code = out.read_text(encoding="utf-8")
        outputs = json.loads(meta.read_text())["outputs"]
    table = parts(cfg)
    owned = {name: 0 for name, _ in table}
    for output in outputs.values():
        for path, info in output.get("inputs", {}).items():
            name = next(n for n, matches in table if matches(path))
            owned[name] += info["bytesInOutput"]
    # Whatever the inputs do not account for is esbuild's glue and the legal
    # comments gathered at the end of the file; report it with the libraries.
    owned["licence notices and glue"] = len(code.encode()) - sum(owned.values())
    return code, owned


def asset_text(asset: Asset) -> str:
    """What goes at the asset's placeholder."""
    if asset.kind == "images":
        images = sorted(p for p in asset.path.iterdir() if p.suffix in IMAGE_TYPES) if asset.path.is_dir() else []
        if asset.count is not None and len(images) != asset.count:
            sys.exit(f"expected {asset.count} images in {asset.path}, found {len(images)}")
        return json.dumps({
            p.stem: f"data:{IMAGE_TYPES[p.suffix]};base64," + base64.b64encode(p.read_bytes()).decode("ascii")
            for p in images
        }, separators=(",", ":"))
    if not asset.path.exists():
        if asset.optional and asset.kind == "json":
            return "{}"
        sys.exit(f"{asset.path} is missing (asset {asset.placeholder})")
    if asset.kind == "json":
        # "</" is written "<\/" (the same JSON string), so no value can close its script.
        text = json.dumps(json.loads(asset.path.read_text(encoding="utf-8")), separators=(",", ":"), ensure_ascii=False)
        return text.replace("</", "<\\/")
    return asset.path.read_text(encoding="utf-8")


def fill(template: str, values: dict[str, str]) -> str:
    """Replace every placeholder in one pass, so nothing inserted is rescanned."""
    missing = [k for k in values if k not in template]
    if missing:
        sys.exit(f"the template has no {', '.join(missing)}")
    pattern = re.compile("|".join(re.escape(k) for k in values))
    return pattern.sub(lambda m: values[m.group(0)], template)


def shown(cfg: Config, path: Path) -> str:
    try:
        return str(path.relative_to(cfg.here)).replace(os.sep, "/")
    except ValueError:
        return str(path)


def dry_run(cfg: Config) -> int:
    """The plan: what would be built from what, and what is missing."""
    needed = [("entry", cfg.entry), ("template", cfg.template), ("stylesheet", cfg.style)]
    needed += [("kit stylesheet", p) for p in cfg.kit_styles]
    if cfg.worker_entry:
        needed.append(("worker entry", cfg.worker_entry))
    needed += [(f"asset {a.placeholder}", a.path) for a in cfg.assets if not a.optional]
    missing = [(what, p) for what, p in needed if not p.exists()]
    print(f"{cfg.name}: {shown(cfg, cfg.entry)} -> {shown(cfg, cfg.output)}")
    print(f"  engine: {cfg.crate + ' -> ' + str(cfg.wasm.relative_to(cfg.root)) if cfg.crate else 'no engine (no crate in the config)'}")
    print(f"  template {shown(cfg, cfg.template)}: /*APP*/, /*STYLE*/" + (", __WASM_BASE64__" if cfg.crate else "")
          + (f", {cfg.worker_placeholder}" if cfg.worker_entry else ""))
    for a in cfg.assets:
        print(f"  asset {a.placeholder}: {a.kind} {shown(cfg, a.path)}" + (" (optional)" if a.optional else ""))
    esbuild = cfg.here / "node_modules" / ".bin" / "esbuild"
    if not esbuild.exists():
        missing.append(("esbuild", esbuild))
    for what, p in missing:
        print(f"  missing: {what}: {p}")
    if not missing:
        print("  nothing missing")
    return 1 if missing else 0


def make_page(cfg: Config) -> tuple[str, list[tuple[str, int]], int]:
    """The page, and what its parts weigh."""
    code, owned = bundle(cfg, cfg.entry)
    # The kit's stylesheets first, so the game's own can override them.
    style = "".join(p.read_text(encoding="utf-8") for p in [*cfg.kit_styles, cfg.style])
    values = {"/*APP*/": code, "/*STYLE*/": style}
    rows: list[tuple[str, int]] = []
    if cfg.crate:
        engine = base64.b64encode(build_wasm(cfg)).decode("ascii")
        values["__WASM_BASE64__"] = engine
        rows.append(("the engine (wasm, base64)", len(engine)))
    if cfg.worker_entry:
        # The worker: its own small bundle, carried in a text script and run from
        # a Blob URL, since the page is one file.
        worker, _ = bundle(cfg, cfg.worker_entry)
        values[cfg.worker_placeholder] = worker
        rows.append(("the worker's bundle", len(worker.encode())))
    for a in cfg.assets:
        text = asset_text(a)
        values[a.placeholder] = text
        rows.append((f"asset {a.placeholder} ({a.kind})", len(text.encode())))
    for placeholder, text in values.items():
        if placeholder == "__WASM_BASE64__":
            continue
        low = text.lower()
        for closer in ("</script", "</style"):
            if closer in low:
                sys.exit(f"the text for {placeholder} contains '{closer}', which would end its inline element early")
    page = fill(cfg.template.read_text(encoding="utf-8"), values)
    rows += list(owned.items())
    rows.append(("stylesheet", len(values["/*STYLE*/"].encode())))
    return page, rows, len(page.encode())


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Build a game's 3D table as one self-contained HTML file (kit/build.py).")
    parser.add_argument("--config", default=None, help=f"the game's config (default {DEFAULT_CONFIG} under the repository root)")
    parser.add_argument("--root", default=str(DEFAULT_ROOT), help="the repository root (where target/ and Cargo.toml are); default: the kit's parent")
    parser.add_argument("--check", action="store_true",
                        help="build in memory and fail if the committed page differs (bin/gate): "
                             "the build is deterministic, so a difference means a stale page")
    parser.add_argument("--dry-run", action="store_true", help="print the plan and what is missing; build nothing")
    parser.add_argument("--output-path", action="store_true", help="print the page's path and stop")
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    cfg = load_config(Path(args.config) if args.config else root / DEFAULT_CONFIG, root)
    if args.output_path:
        print(cfg.output)
        return 0
    if args.dry_run:
        return dry_run(cfg)
    page, rows, size = make_page(cfg)
    rel = shown(cfg, cfg.output)
    if args.check:
        if not cfg.output.exists() or cfg.output.read_bytes() != page.encode("utf-8"):
            print(f"{rel} is out of date: run python3 kit/build.py and commit it")
            return 1
        return 0
    cfg.output.write_bytes(page.encode("utf-8"))  # bytes: no CRLF on Windows
    rows.append(("page skeleton", size - sum(n for _, n in rows)))
    print(f"{rel}: {size:,} bytes")
    for name, n in rows:
        print(f"  {n:>10,}  {name}")
    if size > cfg.guideline:
        print(f"note: over the {cfg.guideline:,}-byte guideline -- weigh what the extra buys")
    return 0


if __name__ == "__main__":
    sys.exit(main())
