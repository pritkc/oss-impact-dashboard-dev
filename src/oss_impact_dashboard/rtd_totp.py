from __future__ import annotations

import base64
import hashlib
import hmac
import os
import struct
import sys
import time


class RTDTOTPError(ValueError):
    """Raised when a TOTP secret is missing or invalid."""


def normalize_totp_secret(secret: str) -> bytes:
    cleaned = secret.strip().replace(" ", "").upper()
    if not cleaned:
        raise RTDTOTPError("TOTP secret is empty")
    try:
        return base64.b32decode(cleaned, casefold=True)
    except Exception as exc:  # noqa: BLE001 - surface a stable error for callers.
        raise RTDTOTPError("TOTP secret is not valid base32") from exc


def generate_totp(
    secret: str,
    *,
    when: int | None = None,
    period: int = 30,
    digits: int = 6,
) -> str:
    key = normalize_totp_secret(secret)
    counter = int((when if when is not None else time.time()) // period)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(code % (10**digits)).zfill(digits)


def totp_from_env(env_name: str) -> str:
    secret = os.environ.get(env_name)
    if not secret:
        raise RTDTOTPError(f"{env_name} is not set")
    return generate_totp(secret)


def main(argv: list[str] | None = None) -> int:
    env_name = (argv or sys.argv[1:2] or ["RTD_TOTP_SECRET"])[0]
    try:
        print(totp_from_env(env_name))
    except RTDTOTPError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
