"""Add show/hide spotlight + show_task_manager commands to src/lib/tauri.ts"""
import pathlib

ROOT = pathlib.Path(__file__).parent.parent
path = ROOT / "src/lib/tauri.ts"

old = "  showOverlayWindow: () => invoke<void>(\"show_overlay_window\"),\n  hideOverlayWindow: () => invoke<void>(\"hide_overlay_window\"),\n}"

new = (
    "  showOverlayWindow: () => invoke<void>(\"show_overlay_window\"),\n"
    "  hideOverlayWindow: () => invoke<void>(\"hide_overlay_window\"),\n"
    "  showTaskManagerWindow: () => invoke<void>(\"show_task_manager_window\"),\n"
    "  showSpotlight: () => invoke<void>(\"show_spotlight\"),\n"
    "  hideSpotlight: () => invoke<void>(\"hide_spotlight\"),\n"
    "}"
)

content = path.read_text(encoding="utf-8")
if "showSpotlight" in content:
    print("already patched, skipping")
else:
    assert old in content, "anchor not found"
    path.write_text(content.replace(old, new), encoding="utf-8")
    print("patched src/lib/tauri.ts")
