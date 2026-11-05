// Badge colour for a status value.
export const statusTone = (s: string) => (s === 'approved' || s === 'paid' ? 'green' : s === 'pending' || s === 'applied' || s === 'due' ? 'amber' : s === 'rejected' ? 'red' : 'slate')
