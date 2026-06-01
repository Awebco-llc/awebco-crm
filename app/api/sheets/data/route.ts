import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebaseAdmin';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const projectType = url.searchParams.get('projectType');
    const groupName = url.searchParams.get('groupName');
    const secret = url.searchParams.get('secret') || req.headers.get('Authorization')?.replace('Bearer ', '');

    const expectedSecret = process.env.SHEETS_SYNC_SECRET || process.env.WEBHOOK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      console.warn('Unauthorized sheets sync API access attempt.');
      return NextResponse.json(
        [["Error", "Unauthorized access", "", ""]],
        { status: 401 }
      );
    }

    if (!projectType || !groupName) {
      return NextResponse.json(
        [["Error", "Missing projectType or groupName parameters", "", ""]],
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    // 1. Fetch groups for this workspace from Admin Firestore
    const groupsSnap = await db.collection('groups').where('workspace', '==', projectType).get();
    const groups = groupsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

    // Find the target group case-insensitively
    const targetGroup = groups.find(
      g => g.name && g.name.trim().toLowerCase() === groupName.trim().toLowerCase()
    );

    if (!targetGroup) {
      const foundNames = groups.map(g => `"${g.name}"`).join(', ');
      return NextResponse.json([
        ["Error", `Group "${groupName}" not found in workspace "${projectType}". Found groups: [${foundNames || 'none'}]`, "", ""]
      ]);
    }

    // 2. Fetch all tickets for this workspace from Admin Firestore
    const ticketsSnap = await db.collection('tickets').where('workspace', '==', projectType).get();
    const tickets = ticketsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

    // 3. Separate parents (matching target group) and sub-tasks
    const parents = tickets.filter(t => t.groupId === targetGroup.id && !t.parentId);
    parents.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const subs = tickets.filter(t => t.parentId);
    const subsByParent = new Map<string, any[]>();
    for (const s of subs) {
      const arr = subsByParent.get(s.parentId) ?? [];
      arr.push(s);
      subsByParent.set(s.parentId, arr);
    }

    // 4. Build rows in 2D array format: ["Task", "Subtask", "Status", "Due Date"]
    const rows: any[][] = [["Task", "Subtask", "Status", "Due Date"]];

    if (parents.length === 0) {
      rows.push(["No items found in this group", "", "", ""]);
    } else {
      parents.forEach(item => {
        // Parent task
        rows.push([
          item.projectName ?? '',
          "",
          item.status ?? 'Not Started',
          item.deadline ?? ''
        ]);

        // Children sub-tasks
        const children = (subsByParent.get(item.id) ?? []).sort(
          (a, b) => (a.order ?? 0) - (b.order ?? 0)
        );
        children.forEach(sub => {
          rows.push([
            "",
            sub.projectName ?? '',
            sub.status ?? 'Not Started',
            sub.deadline ?? ''
          ]);
        });
      });
    }

    // Add trailing info (exactly matching the Monday script format)
    rows.push(["", "", "", ""]);
    rows.push(["LAST UPDATED:", new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }), "", ""]);

    return NextResponse.json(rows);
  } catch (err: any) {
    console.error('[GET /api/sheets/data]', err);
    return NextResponse.json(
      [["Error", err.message || 'Unexpected backend error', "", ""]],
      { status: 500 }
    );
  }
}
