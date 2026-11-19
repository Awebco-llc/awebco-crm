export const EMAIL_MARKETING_STATUSES = ['Setup', 'Running', 'Cancelled'];

// Group documents share a collection across workspaces, so these IDs must be unique.
export const EMAIL_MARKETING_GROUPS = [
  { id: 'group-email-marketing-setup', name: 'Setup' },
  { id: 'group-email-marketing-running', name: 'Running' },
  { id: 'group-email-marketing-cancelled', name: 'Cancelled' },
];

export function emailMarketingGroupForStatus(status: string): string {
  return (EMAIL_MARKETING_GROUPS.find(group => group.name === status) || EMAIL_MARKETING_GROUPS[0]).id;
}
