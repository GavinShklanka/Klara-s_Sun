"""
KLARA OS — Lightweight in-memory telemetry collector.

For demo visibility only; not production persistence.
Tracks sessions, requests, routing decisions, service usage, and AI scribe adoption.
"""

from collections import defaultdict


class Telemetry:
    def __init__(self):
        self.sessions = 0
        self.requests = 0
        self.routing_counts: dict[str, int] = defaultdict(int)
        self.service_usage: dict[str, int] = defaultdict(int)
        self.scribe_enrollments = 0

    def log_session(self) -> None:
        self.sessions += 1

    def log_request(self) -> None:
        self.requests += 1

    def log_route(self, service_name: str) -> None:
        self.routing_counts[service_name] = self.routing_counts[service_name] + 1

    def log_service_usage(self, service_name: str) -> None:
        self.service_usage[service_name] = self.service_usage[service_name] + 1

    def log_scribe_enrollment(self) -> None:
        self.scribe_enrollments += 1


telemetry = Telemetry()


def log_session() -> None:
    telemetry.log_session()


def log_request() -> None:
    telemetry.log_request()


def log_route(service_name: str) -> None:
    telemetry.log_route(service_name)


def log_service_usage(service_name: str) -> None:
    telemetry.log_service_usage(service_name)


def log_scribe_enrollment() -> None:
    telemetry.log_scribe_enrollment()
