import time

import pytest

from ..services.cooldown import CooldownTracker


@pytest.fixture
def tracker():
    return CooldownTracker(cooldown_seconds=2)


class TestCooldownBasics:
    def test_not_in_cooldown_initially(self, tracker):
        assert tracker.is_in_cooldown("c1") is False

    def test_in_cooldown_after_announcement(self, tracker):
        tracker.mark_announced("c1")
        assert tracker.is_in_cooldown("c1") is True

    def test_cooldown_expires(self, tracker):
        tracker.mark_announced("c1")
        time.sleep(2.1)
        assert tracker.is_in_cooldown("c1") is False

    def test_independent_contacts(self, tracker):
        tracker.mark_announced("c1")
        assert tracker.is_in_cooldown("c1") is True
        assert tracker.is_in_cooldown("c2") is False


class TestFilterDetections:
    def test_filters_cooldown_contacts(self, tracker):
        tracker.mark_announced("c1")
        detections = [
            {"contact_id": "c1", "name": "Alice", "confidence": 0.9},
            {"contact_id": "c2", "name": "Bob", "confidence": 0.85},
        ]
        result = tracker.filter_detections(detections)
        assert len(result) == 1
        assert result[0]["name"] == "Bob"

    def test_marks_returned_contacts_as_announced(self, tracker):
        detections = [{"contact_id": "c1", "name": "Alice", "confidence": 0.9}]
        tracker.filter_detections(detections)
        assert tracker.is_in_cooldown("c1") is True

    def test_empty_detections(self, tracker):
        assert tracker.filter_detections([]) == []

    def test_all_in_cooldown(self, tracker):
        tracker.mark_announced("c1")
        tracker.mark_announced("c2")
        detections = [
            {"contact_id": "c1", "name": "Alice", "confidence": 0.9},
            {"contact_id": "c2", "name": "Bob", "confidence": 0.85},
        ]
        assert tracker.filter_detections(detections) == []


class TestReset:
    def test_reset_single_contact(self, tracker):
        tracker.mark_announced("c1")
        tracker.mark_announced("c2")
        tracker.reset("c1")
        assert tracker.is_in_cooldown("c1") is False
        assert tracker.is_in_cooldown("c2") is True

    def test_reset_all(self, tracker):
        tracker.mark_announced("c1")
        tracker.mark_announced("c2")
        tracker.reset()
        assert tracker.is_in_cooldown("c1") is False
        assert tracker.is_in_cooldown("c2") is False
