-- In-app voice calling between a customer and provider, inside an existing
-- conversation (messages.conversation_id). This table is the durable,
-- authoritative record of every call attempt -- who called whom, whether it
-- was answered, and how long it lasted -- independent of the WebRTC signaling
-- itself (the actual audio never touches the server or this table). Each
-- call's outcome is also mirrored into `messages` as a type='system' entry
-- with metadata.kind = 'call' so it shows inline in the existing chat thread,
-- the same way a job_update or quote already does -- no separate call-log
-- screen needed.
CREATE TABLE calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  caller_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- ringing: invite sent, no answer yet. accepted: currently connecting/connected
  -- (connected_at may lag slightly behind accepted_at while ICE negotiates).
  -- declined: callee explicitly rejected. missed: callee was offline, or never
  -- answered before the caller cancelled. ended: a connected call was hung up
  -- by either side. failed: accepted but the peer connection never came up.
  status            VARCHAR(20) NOT NULL DEFAULT 'ringing'
                      CHECK (status IN ('ringing','accepted','declined','missed','ended','failed')),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  connected_at      TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  duration_seconds  INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_calls_conversation ON calls(conversation_id, created_at DESC);
CREATE INDEX idx_calls_callee ON calls(callee_user_id, created_at DESC);
CREATE INDEX idx_calls_caller ON calls(caller_user_id, created_at DESC);
