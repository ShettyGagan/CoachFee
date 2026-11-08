"""Custom exceptions mapped to HTTP status codes in main.py."""
from __future__ import annotations


class AppException(Exception):
    """Base for all domain exceptions."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


class NotFound(AppException):
    """Resource not found → 404."""

    def __init__(self, code: str = "NOT_FOUND", message: str = "Resource not found.") -> None:
        super().__init__(code, message)


class Conflict(AppException):
    """State conflict → 409."""

    def __init__(self, code: str = "CONFLICT", message: str = "Conflict.") -> None:
        super().__init__(code, message)


class Invalid(AppException):
    """Invalid input → 422."""

    def __init__(self, code: str = "VALIDATION_ERROR", message: str = "Invalid input.") -> None:
        super().__init__(code, message)


class Forbidden(AppException):
    """Insufficient permissions → 403."""

    def __init__(self, code: str = "FORBIDDEN", message: str = "Forbidden.") -> None:
        super().__init__(code, message)
