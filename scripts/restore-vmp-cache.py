"""Restore an already-issued public VMP signature, entirely offline.

Mirrors the EVS client's verified-cache reuse path, without constructing Auth
or invoking any sign, upload, or account method. No DRM license data is read.
"""
import base64
import json
import os
from pathlib import Path
import sys

from castlabs_evs.vmp import hash_bin, verify_dgt


def restore(app, backup):
    app = Path(app).resolve(strict=True)
    framework = app / "Contents/Frameworks/Electron Framework.framework/Versions/A"
    binary = framework / "Electron Framework"
    signature = framework / "Resources/Electron Framework.sig"
    digest, _, _ = hash_bin(str(binary))
    cache_file = Path.home() / ".config/evs/cache.json"
    cache = json.loads(cache_file.read_text())
    for encoded in cache.values():
        try:
            candidate = base64.b64decode(encoded, validate=True)
            # Production, final, streaming, >=1 day validity, trusted SKIs.
            kind, intermediate, days = verify_dgt(digest, candidate, "streaming", False, 1, False)
        except Exception:
            continue
        backup = Path(backup)
        backup.parent.mkdir(parents=True, exist_ok=True)
        if signature.exists() and not backup.exists():
            backup.write_bytes(signature.read_bytes())
        temporary = signature.with_suffix(".sig.tmp")
        temporary.write_bytes(candidate)
        os.replace(temporary, signature)
        print(json.dumps({"restored": True, "source": "pre-existing public EVS signature cache",
                          "kind": kind, "intermediate": intermediate, "daysLeft": days,
                          "networkRequests": 0, "credentialsRead": False,
                          "accountActionTaken": False, "newSigningRequest": False}))
        return
    raise RuntimeError("No matching production signature exists in the public cache; authenticate before requesting signing.")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("Provide the app path and a public-signature backup path.")
        restore(sys.argv[1], sys.argv[2])
    except Exception as error:
        print(type(error).__name__ + ": " + str(error), file=sys.stderr)
        sys.exit(1)
