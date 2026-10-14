"""The dataset a new session is born with: valid against the whole contract, so revision 1 always exists."""

from __future__ import annotations

from typing import Any

__all__ = ["starter_dataset"]


def starter_dataset(title: str, session_id: str, date: str) -> dict[str, Any]:
    return {
        "meta": {
            "id": session_id,
            "title": title,
            "eyebrow": "SOFTWARE ENGINEERING",
            "session": "Session 1",
            "date": date,
            "duration": 15,
            "version": "v1",
            "classification": "Internal",
            "question": "The session's question, exactly as the room hears it.",
            "objective": "What must exist when the room empties. Internal; renders only in the script.",
        },
        "activities": [
            {
                "id": "A1",
                "kind": "frame",
                "name": "The frame",
                "mins": 5,
                "question": "Context the later activities stand on. No decisions here.",
                "script": {
                    "goal": "Orient the room fast.",
                    "run": ["Point at the active panels; land one framing sentence and move."],
                    "say": ["Here is where we are, in one breath."],
                    "watch": "If the room relitigates settled context, name where it was settled and move.",
                },
                "panels": [
                    {
                        "name": "Where we are",
                        "phase": "active",
                        "line": "One line the room reads at a distance.",
                        "done": "the room nods",
                    },
                    {
                        "name": "Background",
                        "phase": "background",
                        "line": "Context, not this session's route.",
                        "done": "not this route",
                        "dim": True,
                    },
                ],
            },
            {
                "id": "A2",
                "kind": "close",
                "name": "Read-back",
                "mins": 10,
                "question": "Everything recorded, read back before the room empties.",
                "script": {
                    "goal": "The outcomes replayed from the surface itself.",
                    "run": ["Read the capture top to bottom, out loud.", "Export the capture; it lands in the plan."],
                    "say": ["This is what we decided, exactly as recorded while we worked."],
                    "watch": "Protect these minutes; the close spends the buffer, never loses it.",
                },
            },
        ],
    }
