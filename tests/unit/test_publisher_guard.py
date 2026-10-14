"""The publisher refuses any ref but the configured home ref before a connection opens (030)."""

from __future__ import annotations

import pytest
from pytest_intent import intent

from backend.adapters.githome.publisher import GitHubHomePublisher
from backend.core.errors import HomeRefRefused


class _NoNetwork:
    def __call__(self):
        raise AssertionError("a connection was opened before the ref guard decided")


@intent("INT-WORKSHOPS-030")
def test_a_publish_at_any_other_ref_is_refused_with_no_connection() -> None:
    publisher = GitHubHomePublisher(
        "org/repo", "home", "workshops/{session}/{revision}/", "token", transport_factory=_NoNetwork()
    )
    for ref in ("main", "deploy-rb", "delivery/2026-08-25", "home2", ""):
        with pytest.raises(HomeRefRefused):
            publisher.publish({"a.html": b"x"}, "feat(home): x", ref)


@intent("INT-WORKSHOPS-030")
def test_the_home_ref_itself_can_never_be_a_release_or_delivery_ref() -> None:
    for ref in ("main", "master", "deploy-rb", "delivery/2026-08-25", ""):
        with pytest.raises(HomeRefRefused):
            GitHubHomePublisher("org/repo", ref, "p/", "token", transport_factory=_NoNetwork())
