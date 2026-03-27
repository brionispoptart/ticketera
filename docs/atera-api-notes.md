# Atera API v3 Notes (Snapshot)

Source: https://app.atera.com/swagger/docs/v3
Saved spec: docs/atera-swagger-v3.json

## Ticket Comments

Endpoint: POST /api/v3/tickets/{ticketId}/comments

Summary: Add comment to specified ticket

Required payload shape (per active docs):

```json
{
  "CommentText": "string",
  "CommentTimestampUTC": "2026-03-23T23:05:09.503Z",
  "TechnicianCommentDetails": {
    "TechnicianId": 0,
    "IsInternal": true,
    "TechnicianEmail": "string"
  },
  "EnduserCommentDetails": {
    "EnduserId": 0
  }
}
```

Notes:
- Comment creation requires CommentText plus either TechnicianCommentDetails or EnduserCommentDetails.
- For technician internal notes, IsInternal should be true.
- GET /api/v3/tickets/{ticketId}/comments returns comment list.

## Operational Context

- This project previously used older payload keys (Message/Comment) and received 404 Invalid input on this tenant.
- Implementation in src/lib/atera.ts was updated to use the documented schema.
