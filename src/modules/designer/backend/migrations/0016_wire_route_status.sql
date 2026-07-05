-- Auto-router diagnostic (audit §4.4): when every routing escalation fails and
-- the guaranteed HV fallback is committed knowingly colliding, the wire is
-- flagged so the UI can surface it. NULL = routed clean or user-drawn.
alter table designer_schematic_wires add column route_status text;
