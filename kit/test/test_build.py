"""Tests for kit/build.py, run by bin/gate (python3 -m unittest).

Config handling and filling are tested on paper; one test builds a tiny game
in a temporary directory with the real esbuild and the real kit, which is the
check that the kit's bare `three` import resolves from the game's own
node_modules (kit/README.md).
"""

import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KIT))
import build  # noqa: E402

# Vendored in a game, esbuild lives in the game's web3d/; in the toolkit itself, at its root.
REAL_WEB3D = KIT if (KIT / "node_modules").exists() else KIT.parent / "web3d"


def write(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


def run(argv):
    out = io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
        try:
            code = build.main(argv)
        except SystemExit as e:
            code = e.code if isinstance(e.code, int) else 1
            if isinstance(e.code, str):
                out.write(e.code)
    return code, out.getvalue()


def tiny_game(root: Path, **extra) -> Path:
    """A game with a page template, a script that imports the kit, a stylesheet
    and no engine. Returns its config path."""
    web = root / "web3d"
    (root / "kit").symlink_to(KIT)
    if (REAL_WEB3D / "node_modules").exists():
        (web).mkdir(parents=True, exist_ok=True)
        (web / "node_modules").symlink_to(REAL_WEB3D / "node_modules")
    write(web / "src" / "main.js", 'import { minimumJerk } from "../../kit/js/easing.js";\nimport { CARD } from "../../kit/js/units.js";\nimport { cardGeometry } from "../../kit/js/cards.js";\nwindow.out = [minimumJerk(0.5), CARD.width, cardGeometry()];\n')
    write(web / "src" / "style.css", "body{margin:0}")
    write(web / "src" / "index.html", "<style>/*STYLE*/</style><script>/*APP*/</script><script type=\"application/json\">/*WORDS*/</script>")
    write(web / "words.json", json.dumps({"a": ["b"]}, indent=2))
    lines = [
        'name = "tiny"',
        'entry = "src/main.js"',
        'template = "src/index.html"',
        'style = "src/style.css"',
        'output = "tiny.html"',
        extra.get("more", ""),
        "[[assets]]",
        'placeholder = "/*WORDS*/"',
        'path = "words.json"',
        'kind = "json"',
    ]
    return write(web / "game.toml", "\n".join(lines) + "\n")


class Config(unittest.TestCase):
    def test_paths_are_relative_to_the_config_and_the_defaults_are_filled(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = build.load_config(tiny_game(Path(tmp)), root=Path(tmp))
            self.assertEqual(cfg.name, "tiny")
            self.assertEqual(cfg.entry, Path(tmp) / "web3d" / "src" / "main.js")
            self.assertEqual(cfg.output, Path(tmp) / "web3d" / "tiny.html")
            self.assertIsNone(cfg.crate)
            self.assertIsNone(cfg.worker_entry)
            self.assertEqual(cfg.guideline, 5 * 1024 * 1024)

    def test_kit_stylesheets_are_paths_relative_to_the_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = build.load_config(tiny_game(Path(tmp), more='kit_styles = ["../kit/css/hud.css"]'), root=Path(tmp))
            self.assertEqual(cfg.kit_styles, [Path(tmp) / "web3d" / ".." / "kit" / "css" / "hud.css"])
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(build.load_config(tiny_game(Path(tmp)), root=Path(tmp)).kit_styles, [], "none by default")

    def test_the_wasm_file_is_named_from_the_crate(self):
        with tempfile.TemporaryDirectory() as tmp:
            more = 'crate = "strohmandeln-wasm"'
            cfg = build.load_config(tiny_game(Path(tmp), more=more), root=Path(tmp))
            self.assertEqual(cfg.crate, "strohmandeln-wasm")
            self.assertEqual(cfg.wasm.name, "strohmandeln_wasm.wasm")
            self.assertEqual(cfg.wasm.parent, Path(tmp) / "target" / "wasm32-unknown-unknown" / "release")

    def test_a_missing_required_key_is_said(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = write(Path(tmp) / "web3d" / "game.toml", 'name = "x"\n')
            with self.assertRaises(SystemExit) as caught:
                build.load_config(path, root=Path(tmp))
            self.assertIn("entry", str(caught.exception))

    def test_an_unknown_asset_kind_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            more = '[[assets]]\nplaceholder = "/*X*/"\npath = "x"\nkind = "wat"'
            with self.assertRaises(SystemExit) as caught:
                build.load_config(tiny_game(Path(tmp), more=more), root=Path(tmp))
            self.assertIn("wat", str(caught.exception))


class Fill(unittest.TestCase):
    def test_every_placeholder_is_replaced_in_one_pass(self):
        # What is inserted is never rescanned for placeholders.
        self.assertEqual(build.fill("a/*X*/b/*Y*/", {"/*X*/": "/*Y*/", "/*Y*/": "!"}), "a/*Y*/b!")

    def test_a_placeholder_the_template_lacks_is_said(self):
        with self.assertRaises(SystemExit) as caught:
            build.fill("nothing", {"/*X*/": "1"})
        self.assertIn("/*X*/", str(caught.exception))


class Assets(unittest.TestCase):
    def test_images_become_a_json_map_of_data_uris_keyed_by_stem(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "AS.webp").write_bytes(b"\x01\x02")
            (d / "back.webp").write_bytes(b"\x03")
            asset = build.Asset("/*ART*/", d, "images", count=2)
            self.assertEqual(json.loads(build.asset_text(asset)), {"AS": "data:image/webp;base64,AQI=", "back": "data:image/webp;base64,Aw=="})

    def test_a_wrong_image_count_is_said(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "AS.webp").write_bytes(b"x")
            with self.assertRaises(SystemExit) as caught:
                build.asset_text(build.Asset("/*ART*/", Path(tmp), "images", count=54))
            self.assertIn("54", str(caught.exception))

    def test_json_is_minified_and_text_is_verbatim(self):
        with tempfile.TemporaryDirectory() as tmp:
            j = write(Path(tmp) / "a.json", '{ "a": [1, 2] }')
            self.assertEqual(build.asset_text(build.Asset("/*J*/", j, "json")), '{"a":[1,2]}')
            self.assertEqual(build.asset_text(build.Asset("/*T*/", j, "text")), '{ "a": [1, 2] }')

    def test_an_optional_missing_json_is_an_empty_object(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(build.asset_text(build.Asset("/*J*/", Path(tmp) / "none.json", "json", optional=True)), "{}")


class Cli(unittest.TestCase):
    def test_help_works_without_any_game(self):
        code, text = run(["--help"])
        self.assertEqual(code, 0)
        self.assertIn("--check", text)

    def test_dry_run_prints_the_plan_and_builds_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = tiny_game(Path(tmp))
            code, text = run(["--config", str(cfg), "--root", tmp, "--dry-run"])
            self.assertEqual(code, 0, text)
            for word in ("tiny", "src/main.js", "tiny.html", "/*WORDS*/", "no engine"):
                self.assertIn(word, text)
            self.assertFalse((Path(tmp) / "web3d" / "tiny.html").exists())

    def test_dry_run_reports_what_is_missing_and_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = tiny_game(Path(tmp))
            (Path(tmp) / "web3d" / "src" / "main.js").unlink()
            code, text = run(["--config", str(cfg), "--root", tmp, "--dry-run"])
            self.assertEqual(code, 1)
            self.assertIn("missing", text)

    def test_output_path_prints_the_page_the_gate_looks_for(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, text = run(["--config", str(tiny_game(Path(tmp))), "--root", tmp, "--output-path"])
            self.assertEqual(code, 0)
            self.assertEqual(text.strip(), str(Path(tmp) / "web3d" / "tiny.html"))


class Safety(unittest.TestCase):
    def test_the_wasm_build_remaps_the_paths_a_panic_embeds(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = build.load_config(tiny_game(Path(tmp)), Path(tmp))
            flags = build.rust_env(cfg)["RUSTFLAGS"]
            self.assertIn(f"--remap-path-prefix={cfg.root}=/{cfg.name}", flags)
            self.assertIn("=/cargo", flags)
            self.assertIn("=/rustup", flags)

    def test_a_tool_that_fails_or_is_missing_ends_the_build_with_one_line(self):
        with self.assertRaises(SystemExit) as e:
            build.run_tool(["definitely-not-a-tool-xyz"], "bundling")
        self.assertIn("not installed", str(e.exception))
        with self.assertRaises(SystemExit) as e:
            build.run_tool([sys.executable, "-c", "raise SystemExit(3)"], "bundling x")
        self.assertIn("bundling x failed (exit 3)", str(e.exception))

    def test_json_cannot_close_its_script_and_text_that_would_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            web = Path(tmp)
            a = build.Asset("/*W*/", write(web / "w.json", json.dumps({"a": "x</script><b>é"})), "json")
            text = build.asset_text(a)
            self.assertNotIn("</", text)
            self.assertEqual(json.loads(text), {"a": "x</script><b>é"}, "still the same data")
            t = build.Asset("/*T*/", write(web / "t.md", "a </SCRIPT> b"), "text")
            self.assertIn("</SCRIPT>", build.asset_text(t), "text is verbatim")

    def test_a_style_or_text_asset_that_would_close_its_element_fails_the_build(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = tiny_game(Path(tmp))
            web = Path(tmp) / "web3d"
            write(web / "src" / "style.css", "a{}/* </style> */")
            code, text = run(["--config", str(cfg), "--root", tmp])
            self.assertEqual(code, 1)
            self.assertIn("</style", text)

    def test_non_ascii_text_survives_and_the_page_is_written_with_unix_newlines(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = tiny_game(Path(tmp))
            web = Path(tmp) / "web3d"
            write(web / "src" / "style.css", "/* Sküs ⅔ */\r\nbody{margin:0}")
            code, text = run(["--config", str(cfg), "--root", tmp])
            self.assertEqual(code, 0, text)
            raw = (web / "tiny.html").read_bytes()
            self.assertIn("Sküs ⅔".encode(), raw)
            self.assertNotIn(b"\r", raw)
            self.assertEqual(run(["--config", str(cfg), "--root", tmp, "--check"])[0], 0)


@unittest.skipUnless((REAL_WEB3D / "node_modules" / ".bin" / "esbuild").exists(), "run `npm ci` in web3d/ first")
class EndToEnd(unittest.TestCase):
    def test_a_game_importing_the_kit_builds_and_checks(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = tiny_game(Path(tmp))
            page = Path(tmp) / "web3d" / "tiny.html"
            code, text = run(["--config", str(cfg), "--root", tmp, "--check"])
            self.assertEqual(code, 1, "no page yet: out of date")
            self.assertIn("out of date", text)
            code, text = run(["--config", str(cfg), "--root", tmp])
            self.assertEqual(code, 0, text)
            html = page.read_text()
            self.assertIn("body{margin:0}", html)
            self.assertIn('{"a":["b"]}', html)
            self.assertNotIn("/*APP*/", html)
            self.assertIn("6.35", html, "the kit's units.js CARD.width was bundled")
            self.assertIn("the kit's code", text, "the weigh-in names the kit")
            three = next(int(line.split()[0].replace(",", "")) for line in text.splitlines() if line.strip().endswith("three.js"))
            self.assertGreater(three, 1000, "three.js was found from the kit's cards.js and bundled")
            code, text = run(["--config", str(cfg), "--root", tmp, "--check"])
            self.assertEqual(code, 0, text)
            page.write_text(html + " ")
            code, _ = run(["--config", str(cfg), "--root", tmp, "--check"])
            self.assertEqual(code, 1, "a stale page fails the check")

    def test_kit_stylesheets_come_before_the_games_own(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = tiny_game(Path(tmp), more='kit_styles = ["../kit/css/hud.css"]')
            code, text = run(["--config", str(cfg), "--root", tmp])
            self.assertEqual(code, 0, text)
            html = (Path(tmp) / "web3d" / "tiny.html").read_text()
            self.assertIn(".hud,.hud-card{", html.replace(" ", "").replace("\n", ""), "the kit's HUD stylesheet was inlined")
            self.assertLess(html.index(".hud"), html.index("body{margin:0}"), "the game's style can override the kit's")

    def test_a_missing_kit_stylesheet_is_said_by_the_dry_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = tiny_game(Path(tmp), more='kit_styles = ["../kit/css/nothing.css"]')
            code, text = run(["--config", str(cfg), "--root", tmp, "--dry-run"])
            self.assertEqual(code, 1)
            self.assertIn("nothing.css", text)

    def test_the_build_is_deterministic(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = tiny_game(Path(tmp))
            page = Path(tmp) / "web3d" / "tiny.html"
            run(["--config", str(cfg), "--root", tmp])
            first = page.read_bytes()
            run(["--config", str(cfg), "--root", tmp])
            self.assertEqual(first, page.read_bytes())

    def test_a_worker_entry_is_bundled_apart_and_inlined(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = tiny_game(Path(tmp), more='worker_entry = "src/worker.js"\nworker_placeholder = "/*WORKER*/"')
            web = Path(tmp) / "web3d"
            write(web / "src" / "worker.js", 'self.onmessage = () => self.postMessage("worker-says-hi");\n')
            write(web / "src" / "index.html", "<style>/*STYLE*/</style><script type=\"text/plain\">/*WORKER*/</script><script>/*APP*/</script><i>/*WORDS*/</i>")
            code, text = run(["--config", str(cfg), "--root", tmp])
            self.assertEqual(code, 0, text)
            self.assertIn("worker-says-hi", (web / "tiny.html").read_text())


if __name__ == "__main__":
    unittest.main()
