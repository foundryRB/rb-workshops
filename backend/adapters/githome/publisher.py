"""The HomePublisher port over the GitHub git-data API: files in, one commit on the home ref out.

The guard is in the code, not the credential (ADR-009): a repository-scoped
token cannot be narrowed to one ref, so the publisher refuses any ref but the
configured home ref before it opens a connection, and refuses to touch the
default branch at all. Publishing an orphan `home` branch needs no clone: a
blob, a tree, a commit with the previous head as its parent (or none for the
first), and a ref update, all over HTTPS.
"""

from __future__ import annotations

import base64
from collections.abc import Callable
from pathlib import Path

import httpx

from backend.core.errors import HomeRefRefused, PublishFailed

__all__ = ["GitHubHomePublisher"]

_NEVER_HOME = frozenset({"main", "master", "HEAD"})


class GitHubHomePublisher:
    def __init__(
        self,
        repository: str,
        ref: str,
        path_template: str,
        token: str,
        api: str = "https://api.github.com",
        transport_factory: Callable[[], httpx.Client] | None = None,
        token_file: str = "",
    ) -> None:
        if not ref or ref in _NEVER_HOME or ref.startswith("deploy-") or ref.startswith("delivery/"):
            raise HomeRefRefused(f"{ref!r} cannot be the git-backed home: it is a release or delivery ref")
        self._repository = repository
        self._ref = ref
        self.path_template = path_template
        self._token = token
        self._token_file = token_file
        self._api = api.rstrip("/")
        self._factory = transport_factory or self._default_client

    @property
    def repository(self) -> str:
        return self._repository

    @property
    def ref(self) -> str:
        return self._ref

    @property
    def configured(self) -> bool:
        return bool(self.token)

    @property
    def token(self) -> str:
        """The credential, read at use time: a Secret seeded after the pod started still counts."""
        if self._token:
            return self._token
        if self._token_file:
            try:
                return Path(self._token_file).read_text(encoding="utf-8").strip()
            except OSError:
                return ""
        return ""

    def publish(self, files: dict[str, bytes], message: str, ref: str) -> str:
        # The guard: decided before any connection is opened.
        if ref != self._ref:
            raise HomeRefRefused(f"publish aimed at {ref!r}; only the configured home ref {self._ref!r} is writable")
        token = self.token
        if not token:
            raise PublishFailed("the publisher has no credential: Secret vf-workshops-githome is not seeded")
        self._live_token = token
        with self._factory() as client:
            head = self._head(client)
            blobs = {
                path: self._post(
                    client, "git/blobs", {"content": base64.b64encode(content).decode("ascii"), "encoding": "base64"}
                )["sha"]
                for path, content in files.items()
            }
            tree_body: dict = {
                "tree": [{"path": path, "mode": "100644", "type": "blob", "sha": sha} for path, sha in blobs.items()]
            }
            if head:
                tree_body["base_tree"] = head["tree"]
            tree = self._post(client, "git/trees", tree_body)["sha"]
            commit_body: dict = {"message": message, "tree": tree, "parents": [head["sha"]] if head else []}
            commit = self._post(client, "git/commits", commit_body)["sha"]
            if head:
                self._patch(client, f"git/refs/heads/{self._ref}", {"sha": commit, "force": False})
            else:
                self._post(client, "git/refs", {"ref": f"refs/heads/{self._ref}", "sha": commit})
        return commit

    # --- transport ---------------------------------------------------------------

    def _default_client(self) -> httpx.Client:
        return httpx.Client(
            base_url=f"{self._api}/repos/{self._repository}/",
            timeout=30.0,
            headers={
                "Authorization": f"Bearer {getattr(self, '_live_token', '') or self.token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "vf-workshops-publisher",
            },
        )

    def _head(self, client: httpx.Client) -> dict | None:
        response = client.get(f"git/ref/heads/{self._ref}")
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            raise PublishFailed(f"reading the home ref answered {response.status_code}: {response.text[:200]}")
        sha = response.json()["object"]["sha"]
        commit = client.get(f"git/commits/{sha}")
        if commit.status_code >= 400:
            raise PublishFailed(f"reading the home head answered {commit.status_code}")
        return {"sha": sha, "tree": commit.json()["tree"]["sha"]}

    def _post(self, client: httpx.Client, path: str, body: dict) -> dict:
        response = client.post(path, json=body)
        if response.status_code >= 400:
            raise PublishFailed(f"POST {path} answered {response.status_code}: {response.text[:200]}")
        return response.json()

    def _patch(self, client: httpx.Client, path: str, body: dict) -> dict:
        response = client.patch(path, json=body)
        if response.status_code >= 400:
            raise PublishFailed(f"PATCH {path} answered {response.status_code}: {response.text[:200]}")
        return response.json()
