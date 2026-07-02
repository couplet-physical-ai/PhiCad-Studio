-- Per-provider manual override for tool calling, independent of the capability probe.
-- NULL = auto (use probe result), 1 = force on, 0 = force off.
-- Lets users force-enable tools on capable servers whose probe failed (e.g. a vLLM
-- endpoint that needed --enable-auto-tool-choice when first probed), or force-disable
-- tools on a server that misbehaves with them.
ALTER TABLE assistant_provider_config ADD COLUMN tool_calling_override INTEGER;
