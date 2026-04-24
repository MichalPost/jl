"""Add show_task_manager_window / show_spotlight / hide_spotlight to mock invoke"""
import pathlib

ROOT = pathlib.Path(__file__).parent.parent
path = ROOT / "src/lib/mock/invoke.ts"

old = "    case \"remember_selection\":\n    case \"show_overlay_window\":\n    case \"hide_overlay_window\":\n      return undefined as T"

new = (
    "    case \"remember_selection\":\n"
    "    case \"show_overlay_window\":\n"
    "    case \"hide_overlay_window\":\n"
    "    case \"show_task_manager_window\":\n"
    "    case \"show_spotlight\":\n"
    "    case \"hide_spotlight\":\n"
    "      return undefined as T"
)

content = path.read_text(encoding="utf-8")
if "show_spotlight" in content:
    print("already patched, skipping")
else:
    assert old in content, f"anchor not found in {path}"
    path.write_text(content.replace(old, new), encoding="utf-8")
    print("patched src/lib/mock/invoke.ts")
