const timestamp = (value) => {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const conversationActivityTime = (row = {}) => Math.max(
  timestamp(row?.latest_message?.created_at),
  timestamp(row?.last_inbound_at),
  timestamp(row?.last_outbound_at),
);

export const compareConversationActivity = (left, right) => (
  conversationActivityTime(right) - conversationActivityTime(left)
  || String(left?.phone || '').localeCompare(String(right?.phone || ''))
);

export const compareConversationAttention = (left, right) => {
  const priority = (row) => (
    row?.failed_message ? 0
      : row?.handoff ? 1
        : row?.budget_draft ? 2
          : Number(row?.unread_count || 0) > 0 ? 3 : 4
  );
  return (
    priority(left) - priority(right)
    || timestamp(left?.attention_updated_at) - timestamp(right?.attention_updated_at)
    || compareConversationActivity(left, right)
  );
};

