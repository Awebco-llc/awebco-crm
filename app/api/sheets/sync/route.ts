/**
 * POST /api/sheets/sync
 *
 * Receives the current SEO board state from the client and writes it to
 * Google Sheets — one tab per CRM group (Active, Running, Completed, etc.).
 *
 * Body: { tickets: Ticket[], groups: Group[], teamMembers: TeamMember[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncGroupsToSheet, GroupSection, SheetRow } from '@/lib/googleSheets';

function formatDate(raw?: string): string {
  if (!raw) return '—';
  const d = new Date(`${raw}T00:00:00`);
  if (isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(d);
}

function formatTs(raw?: string): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(d);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const expectedSecret = process.env.NEXT_PUBLIC_API_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      console.warn('Unauthorized sheets sync access attempt.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tickets = [], groups = [], teamMembers = [] } = await req.json();

    // ── Lookup maps ──────────────────────────────────────────────────────────
    const memberMap = new Map<string, string>(
      teamMembers.map((m: any) => [m.id, m.name])
    );
    const groupMap = new Map<string, string>(
      groups.map((g: any) => [g.id, g.name])
    );

    // ── Separate parents from sub-tasks ──────────────────────────────────────
    const parents = tickets.filter((t: any) => !t.parentId);
    const subs = tickets.filter((t: any) => t.parentId);

    const subsByParent = new Map<string, any[]>();
    for (const s of subs) {
      const arr = subsByParent.get(s.parentId) ?? [];
      arr.push(s);
      subsByParent.set(s.parentId, arr);
    }

    // ── Group parents by their CRM group ─────────────────────────────────────
    const byGroup = new Map<string, any[]>();
    for (const t of parents) {
      const gid = t.groupId ?? 'ungrouped';
      const arr = byGroup.get(gid) ?? [];
      arr.push(t);
      byGroup.set(gid, arr);
    }

    // ── Build GroupSection[] ─────────────────────────────────────────────────
    const resolveAssignee = (t: any): string => {
      const ids: string[] = t.assignees?.length ? t.assignees : t.assignee ? [t.assignee] : [];
      return ids.map((id) => memberMap.get(id) ?? id).filter(Boolean).join(', ') || 'Unassigned';
    };

    const sections: GroupSection[] = [];

    // Maintain group order from the CRM if possible
    const orderedGroupIds = [
      ...groups.map((g: any) => g.id),
      ...[...byGroup.keys()].filter((k) => !groups.some((g: any) => g.id === k)),
    ];

    for (const groupId of orderedGroupIds) {
      const groupTickets = byGroup.get(groupId);
      if (!groupTickets?.length) continue;

      const groupName = groupMap.get(groupId) ?? groupId;
      const rows: SheetRow[] = [];

      // Sort tickets by order field
      groupTickets.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

      for (const ticket of groupTickets) {
        rows.push({
          taskName: ticket.projectName ?? '',
          type: 'Task',
          status: ticket.status ?? 'Not Started',
          assignee: resolveAssignee(ticket),
          deadline: formatDate(ticket.deadline),
          lastUpdated: formatTs(ticket.updatedAt),
          url: ticket.url ?? '',
        });

        // Sub-tasks
        const children = (subsByParent.get(ticket.id) ?? []).sort(
          (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)
        );
        for (const sub of children) {
          rows.push({
            taskName: sub.projectName ?? '',
            type: 'Sub-task',
            status: sub.status ?? 'Not Started',
            assignee: resolveAssignee(sub),
            deadline: formatDate(sub.deadline),
            lastUpdated: formatTs(sub.updatedAt),
            url: sub.url ?? '',
          });
        }
      }

      sections.push({ groupName, rows });
    }

    if (sections.length === 0) {
      return NextResponse.json({ ok: true, rowsWritten: 0, groupsWritten: 0, note: 'No data to sync' });
    }

    const rowsWritten = await syncGroupsToSheet(sections);

    return NextResponse.json({
      ok: true,
      rowsWritten,
      groupsWritten: sections.length,
    });
  } catch (err: any) {
    console.error('[POST /api/sheets/sync]', err);
    return NextResponse.json(
      { error: err.message ?? 'Unexpected error during sheet sync' },
      { status: 500 }
    );
  }
}
