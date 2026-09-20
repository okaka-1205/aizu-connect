# Security Rules Audit Notes

This file records the local rule-test coverage added for the Aizu Connect data
model.

The current structured audit result is recorded in
`test/security-rules-audit.json`.

Covered roles:

- Unauthenticated
- Active student
- Pending student
- Active organization
- Other active organization
- Admin

Covered Firestore paths:

- `users/{userId}`
- `studentProfiles/{userId}`
- `organizations/{organizationId}`
- `events/{eventId}`
- `eventApplications/{applicationId}`
- `chatRooms/{roomId}`
- `chatRooms/{roomId}/messages/{messageId}`
- `activities/{activityId}`
- `notifications/{notificationId}`
- `notificationPreferences/{userId}`
- `reports/{reportId}`
- `savedEvents/{savedEventId}`

Covered Storage paths:

- `profile-images/{userId}/{fileName}`
- `event-images/{organizationId}/{eventId}/{fileName}`

Attack cases covered:

- Public read attempts
- Cross-user reads
- Cross-organization reads and writes
- Role escalation during user creation/update
- Active student self-approval with a non-Aizu email
- Access attempts from an unverified Aizu student token
- Direct active registration and mixed-field approval escalation
- Non-string values injected into interests and event tags
- Invalid event and application state transitions
- Schema pollution on saved events
- Overlong organization fields
- Invalid notification preference and notification read-state types
- Client writes to server-owned collections
- Invalid Storage owner scope and MIME type
