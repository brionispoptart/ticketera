export type Ticket = {
  TicketID: number;
  TicketTitle: string;
  TicketNumber?: string;
  TicketDescription?: string;
  TicketPriority?: string;
  TicketImpact?: string;
  TicketStatus?: string;
  EndUserEmail?: string;
  EndUserFirstName?: string;
  EndUserLastName?: string;
  TechnicianContactID?: number;
  TechnicianFullName?: string;
  TicketCreatedDate?: string;
  CustomerName?: string;
};

export type TicketComment = {
  Date?: string;
  Comment?: string;
  CommentHtml?: string;
  TechnicianFullName?: string;
};

export type EditableTicket = {
  TicketTitle?: string;
  TicketStatus?: string;
  TicketType?: string;
  TicketPriority?: string;
  TicketImpact?: string;
  TechnicianContactID?: number;
  TechnicianEmail?: string;
};

export type TicketsResponse = {
  items?: Ticket[];
};

export type AteraComment = {
  Date?: string;
  Comment?: string;
  CommentHtml?: string;
  FirstName?: string;
  LastName?: string;
  TechnicianContactID?: number;
  IsInternal?: boolean;
};

export type AteraCommentsResponse = {
  items?: AteraComment[];
};
