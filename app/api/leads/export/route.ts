import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const FILTERS = ['new', 'callback', 'interested', 'all'];

/**
 * GET /api/leads/export?c=<contractor>&status=<filter>
 * Streams matching leads as a CSV download. Gated by the same LEADS_TOKEN as the
 * /leads page (via the leads_session cookie, or a ?token= fallback).
 */
export async function GET(req: NextRequest) {
  const token = process.env.LEADS_TOKEN;
  if (token) {
    const cookie = req.cookies.get('leads_session')?.value;
    const qp     = req.nextUrl.searchParams.get('token');
    if (cookie !== token && qp !== token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const pool         = getPool();
  const contractorId = req.nextUrl.searchParams.get('c')?.trim() || null;
  const filterParam  = req.nextUrl.searchParams.get('status')?.trim() || 'all';
  const filter       = FILTERS.includes(filterParam) ? filterParam : 'all';

  const baseWhere = `status = 'lead'
    AND COALESCE(call_status, 'new') != 'not_interested'
    AND (claimed_by IS NULL OR claimed_by = $1)`;
  const statusFilter =
      filter === 'new'        ? `AND COALESCE(call_status, 'new') = 'new'`
    : filter === 'callback'   ? `AND call_status = 'callback'`
    : filter === 'interested' ? `AND call_status = 'interested'`
    : '';

  const { rows } = await pool.query(
    `SELECT business_name, phone, city, state, website,
            COALESCE(call_status, 'new') AS call_status, last_called_at, created_at
     FROM   clients
     WHERE  ${baseWhere} ${statusFilter}
     ORDER BY created_at DESC`,
    [contractorId]
  );

  const headers = ['business_name', 'phone', 'city', 'state', 'website', 'call_status', 'last_called_at', 'created_at'];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(','),
    ...rows.map((r: any) => headers.map(h => esc(r[h])).join(',')),
  ].join('\n');

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-${filter}-${date}.csv"`,
    },
  });
}
