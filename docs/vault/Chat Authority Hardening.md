# Chat Authority Hardening

Live audit performed 2026-08-09.

## Current defects

- `provider_conversations` has one `FOR ALL` participant policy. A participant can update every mutable conversation field, including both unread counters and preview data.
- `provider_messages` has one `FOR ALL` participant policy. A participant can insert a message with another sender’s ID/type.
- `update_conversation_last_message` is `SECURITY DEFINER` and currently accepts any conversation ID plus a caller-supplied sender type.

This allows inbox-preview/unread-count corruption and message identity spoofing even when the caller is authenticated.

## Target boundary

| Operation | Allowed caller |
|---|---|
| Read conversation/messages | Its client or owning provider |
| Client creates conversation | The client for a public, live provider |
| Provider creates conversation | The owning provider, only for a booked client |
| Insert client message | Conversation client; `sender_id = auth.uid()`, `sender_type = user` |
| Insert provider message | Owning provider; `sender_id = auth.uid()`, `sender_type = provider` |
| Update preview/unread on send | Security-definer RPC that validates caller + sender role |
| Clear unread badge | Dedicated self-scoped client/provider RPC |
| Update/delete messages directly | Nobody |
| Update/delete conversations directly | Nobody |

## Rollout order

1. Deploy the two read-clear RPCs and the hardened preview RPC.
2. Release the app version that uses read-clear RPCs instead of direct conversation updates.
3. Apply the narrow conversation/message RLS policies.
4. Test client-to-provider and provider-to-client send/read/realtime flows, including an attempted cross-conversation and sender-spoof request.

The staged SQL is in [security_definer_execute_hardening.sql](/Users/naomicollins/Desktop/CERVICEDD/CERVICED./supabase/manual-apply/20260809_security_definer_execute_hardening.sql). It remains undeployed until the canonical migration and staging path is available.

Connections: [[Chat]] · [[Privileged RPC Execution Audit]] · [[CERVICED E2E Readiness Programme]]
