export type ChatUserSummary = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  technicianLevel: string;
  avatarUrl: string | null;
};

export type ChatConversationSummary = {
  id: string;
  title: string;
  otherUser: ChatUserSummary | null;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  isPinned: boolean;
  pinnedAt: string | null;
};

export type ChatMessageItem = {
  id: string;
  body: string;
  createdAt: string;
  senderUserId: string | null;
  senderLabel: string;
  isPinned: boolean;
  pinnedAt: string | null;
};