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
- `legalConsents/{consentId}`
- `studentProfiles/{userId}`
- `organizations/{organizationId}`
- `accountDeletionRequests/{userId}`
- `events/{eventId}`
- `eventApplications/{applicationId}`
- `chatRooms/{roomId}`
- `chatRooms/{roomId}/members/{memberId}`
- `chatRooms/{roomId}/messages/{messageId}`
- `chatRooms/{roomId}/reads/{userId}`
- `activities/{activityId}`
- `notifications/{notificationId}`
- `notificationPreferences/{userId}`
- `reports/{reportId}`
- `savedEvents/{savedEventId}`
- `savedSearches/{savedSearchId}`
- `chatPreferences/{preferenceId}`
- `publicOrganizerProfiles/{userId}`
- `savedOrganizers/{savedOrganizerId}`
- `userBlocks/{blockId}`
- `eventSurveys/{eventId}/responses/{userId}`
- `eventReports/{eventId}`
- `adminAssignments/{assignmentId}`
- `thirdPartyProvisionLogs/{logId}`
- `auditLogs/{auditId}`
- `eventCheckIns/{eventId}`

Covered Storage paths:

- `profile-images/{userId}/{fileName}`
- `event-images/{organizationId}/{eventId}/{fileName}`
- `chat-attachments/{roomId}/{userId}/{fileName}`

Attack cases covered:

- Public read attempts
- Cross-user reads
- Cross-organization reads and writes
- Role escalation during user creation/update
- Verified non-Aizu student activation from pending
- Rejection of unverified pending-to-active transitions
- Active Aizu registration with protected-data denial before email verification
- Rejection of direct active registration for non-Aizu students
- Mixed-field activation and role escalation attempts
- Student profile field removal and unknown-field injection
- Separation of self-edit, first activation, legal reconsent, and admin review
- Organization approval and rejection for future-event applications
- Organization denial for past-event application changes
- Attendance changes denied until the three-hour pre-event boundary
- Attendance changes allowed at and after the three-hour boundary
- Unverified administrator access to audit logs
- Chat sender-name impersonation
- Client reads and writes against check-in attempt records
- Non-string values injected into interests and event tags
- Invalid event and application state transitions
- Schema pollution on saved events
- Overlong organization fields
- Invalid notification preference and notification read-state types
- Client writes to server-owned collections
- Invalid Storage owner scope and MIME type
- Pending and unverified account reads of profile and event images
