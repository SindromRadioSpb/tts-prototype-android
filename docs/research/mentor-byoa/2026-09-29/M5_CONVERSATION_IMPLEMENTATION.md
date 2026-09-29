# Tutor conversation and automatic local history — 3.11.700 candidate

Source: user feedback after an owner-live question on 3.11.699. The single-answer
panel and manual Save/Download actions interrupted learning. This implementation
keeps the exact source snapshot while turning successive questions into a visible
conversation. Enter sends, Shift+Enter adds a line, and the newest turn is shown
with the composer at the bottom. The personal agent receives up to four prior
turns, bounded and tied to the same user and source. Existing pilot connectors
receive the same context in their question field; the updated runner accepts a
structured history. No paid fallback, extra model call or learner-state write.

Completed turns save automatically in the signed-in user's browser history.
Reopening the source reconstructs the visible conversation; after relay expiry,
up to four bounded locally saved turns can accompany a new question. The local
history is user-supplied context, not trusted grade or corpus authority. The
account-data route retains export, restore and deletion controls; the learning
view only shows conversation history. Migration `074_tutor_conversation.sql` is
additive and links recent server turns. The local archive remains device-specific,
bounded to 200 turns per account and never writes `review_log` or mastery.

Validation: transport/source tests, full API smoke, 233 i18n checks, 321 shell
checks, connector fixtures, and four-surface browser smoke including follow-up
history, automatic save/reload, account-data export/delete, practice, 380 px RTL
and desktop. Automated evidence is distinct from owner-live acceptance. This is
an owner-pilot candidate until the production backup, deploy and served-byte
verification complete.

Visual fixture evidence: [mobile](m4-screenshots/tutor-chat-700-mobile.png),
[desktop](m4-screenshots/tutor-chat-700-desktop.png),
[Hebrew mobile](m4-screenshots/tutor-chat-700-he-mobile.png).
