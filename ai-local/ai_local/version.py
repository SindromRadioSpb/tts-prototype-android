"""Single source of truth for the Companion build identity.

The 0.3.0-beta.10 installer shipped a binary whose window said 0.3.0-beta.9: the same
version lived as three independent string literals (this package, the installer script,
the build script) and one of them was not bumped.  A text gate caught it only after the
artifact had already been produced and installed.

Everything that names a version now derives it from here - the window footer, the
diagnostics bundle, the Inno Setup defines and the artifact filename - so the three can
no longer disagree.  The build additionally asks the *frozen* executable for its version
and refuses to package an installer whose name would claim a different one.
"""

from __future__ import annotations

import re

COMPANION_VERSION = "0.3.0-beta.11"

_SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$")


def file_version(version: str = COMPANION_VERSION) -> str:
    """Windows VersionInfo is four numbers; the pre-release counter is the fourth.

    Inno Setup's VersionInfoVersion rejects "0.3.0-beta.11", so the beta counter becomes
    the build field instead of a hand-maintained number that drifted to 0.3.0.2 while the
    build was already beta.10.
    """
    match = _SEMVER.match(version)
    if not match:
        raise ValueError("COMPANION_VERSION_NOT_PARSEABLE:" + version)
    major, minor, patch, beta = match.groups()
    return "%s.%s.%s.%s" % (major, minor, patch, beta or "0")


COMPANION_FILE_VERSION = file_version()
COMPANION_ARTIFACT_NAME = "LinguistProLocalAsrCompanion-%s-unsigned-internal.exe" % COMPANION_VERSION
