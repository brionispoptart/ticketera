# Mobile Chat Wireframe

## Goal

Rebuild the mobile chat experience around WhatsApp-style structure and behavior first, then layer Ticketera styling on top.

## Support Baseline

- Minimum supported mobile viewport: iPhone SE at 375x667 CSS pixels.
- All mobile layout and interaction decisions must work at 375px width before optimizing for larger phones.
- Devices larger than that can enhance spacing, but no mobile feature may require more than the iPhone SE baseline to function correctly.

## Core Principles

- One surface per task: conversation list or active thread, never both fighting for space.
- One scroll owner per screen: list scrolls in list view, message rail scrolls in thread view.
- Header and composer stay anchored.
- Back behavior mirrors a native messenger: thread back returns to the list, browser back does the same.
- Composer growth is bounded. Once the draft reaches a limit, the textarea scrolls internally.

## Mobile Views

### Conversation List

```
+------------------------------------------------+
| Chats                                          |
| Search                                         |
+------------------------------------------------+
| [avatar] Name                  time     badge |
|         last message preview                  |
|                                                |
| [avatar] Name                  time           |
|         last message preview                  |
|                                                |
| ... scrolls ...                               |
+------------------------------------------------+
```

Behavior:

- Initial mobile entry lands on the conversation list.
- Search filters people first, then conversations.
- Selecting a person starts or opens a thread and transitions to thread view.
- Selecting a conversation opens thread view.
- Pulling the browser back button from a thread returns to this list.

### Active Thread

```
+------------------------------------------------+
| < Back   Avatar   Name                         |
|          status / meta                         |
+------------------------------------------------+
| pinned rail (optional, horizontal)            |
+------------------------------------------------+
|                                                |
|          day divider                           |
|   incoming bubble                              |
|                       outgoing bubble          |
|                                                |
|   incoming bubble                              |
|                                                |
| ... only this region scrolls ...              |
+------------------------------------------------+
| +  message composer                    send    |
|    second line if draft grows                  |
+------------------------------------------------+
```

Behavior:

- Header remains fixed at the top of the thread surface.
- Composer remains fixed at the bottom of the thread surface.
- Messages scroll independently between them.
- Opening a thread scrolls to bottom.
- New messages auto-stick only if the user is already near the bottom.
- If the user scrolls up, polling does not snap them back down.
- Keyboard opening shrinks the visible message rail, not the whole page.
- Composer does not forcibly re-focus on blur.

## Element Behavior Map

### List Header

- Shows title and search.
- Search stays visible at the top of the list.
- No sticky browser-level overlay.

### Conversation Row

- Tap opens thread.
- Shows avatar, title, preview, time, unread badge.
- Long-press actions can be added later, but are not required for the reset.

### Thread Header

- Back button closes thread to list view.
- Title is truncated.
- Secondary metadata is one line only.
- Optional actions live on the right.

### Pinned Rail

- Horizontal strip below header.
- Optional.
- Tap jumps to message.
- Must not become a second vertical scroll container.

### Message Rail

- Sole vertical scroll owner in thread view.
- Supports day dividers.
- Incoming and outgoing bubbles align left/right.
- Message actions should not interfere with natural vertical scrolling.

### Composer

- Plus/menu action on left.
- Draft input in the middle.
- Send action on right.
- Auto-grow capped to preserve message visibility.
- Code/command modes may exist, but should still use the same anchored composer slot.

## Implementation Plan

1. Create a dedicated mobile wireframe shell component.
2. Feed current list/thread content into that shell as slots.
3. Keep desktop layout separate and untouched during the mobile rebuild.
4. Verify scroll ownership and back-stack behavior.
5. Apply Ticketera visual styling after the layout and interaction contract feels correct.