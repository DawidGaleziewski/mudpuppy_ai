"""Cases for no-script-edits.py (spec 030 F-14, spec 031 T001).

Run: `python3 -m unittest discover -s .claude/hooks` from the repo root.
"""

import importlib.util
import os
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
spec = importlib.util.spec_from_file_location("no_script_edits", HERE / "no-script-edits.py")
assert spec and spec.loader
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)

ROADMAP = str(ROOT / "roadmap.md")
GUIDE = str(ROOT / "docs" / "code-guidelines.md")


def hits(command: str, cwd: Path = ROOT) -> list[str]:
    old = os.getcwd()
    os.chdir(ROOT)
    try:
        return [t for t in hook.targets(command, str(cwd)) if hook.tracked(t)]
    finally:
        os.chdir(old)


class Blocks(unittest.TestCase):
    def test_append_with_heredoc_holding_an_apostrophe(self) -> None:
        # The owner's words in the body broke shlex, so the hook allowed it (F-14).
        cmd = "cat >> roadmap.md <<'EOF'\n- the owner's note\nEOF"
        self.assertEqual(hits(cmd), [ROADMAP])

    def test_append_after_cd(self) -> None:
        self.assertEqual(hits("cd docs && echo x >> code-guidelines.md"), [GUIDE])

    def test_relative_to_session_cwd(self) -> None:
        self.assertEqual(hits("echo x > code-guidelines.md", cwd=ROOT / "docs"), [GUIDE])

    def test_sed_in_place(self) -> None:
        self.assertEqual(hits("sed -i 's/a/b/' roadmap.md"), [ROADMAP])

    def test_python_heredoc_writing_a_tracked_file(self) -> None:
        cmd = (
            "python3 - <<'EOF'\n"
            "from pathlib import Path\n"
            "p = Path('roadmap.md')\n"
            "p.write_text(p.read_text().replace('a', 'b'))\n"
            "EOF"
        )
        self.assertEqual(hits(cmd), [ROADMAP])

    def test_python_c_open_for_writing(self) -> None:
        cmd = "python3 -c \"open('roadmap.md', 'a').write('x')\""
        self.assertEqual(hits(cmd), [ROADMAP])

    def test_tee(self) -> None:
        self.assertEqual(hits("echo x | tee -a roadmap.md"), [ROADMAP])


class Allows(unittest.TestCase):
    def test_reads(self) -> None:
        self.assertEqual(hits("cat roadmap.md | grep R-6 > /tmp/x.txt"), [])

    def test_python_that_only_reads(self) -> None:
        self.assertEqual(hits("python3 -c \"print(open('roadmap.md').read()[:10])\""), [])

    def test_untracked_new_file(self) -> None:
        self.assertEqual(hits("cat > specs/new-untracked-file.md <<'EOF'\nit's new\nEOF"), [])

    def test_stderr_redirect(self) -> None:
        self.assertEqual(hits("ls 2>/dev/null; ls 2>&1"), [])


if __name__ == "__main__":
    unittest.main()
