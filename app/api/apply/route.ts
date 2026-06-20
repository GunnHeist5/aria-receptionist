import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, email, phone, application_text, submission_url, utm_source } = body;

  if (!name || !email) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
  }

  const pool = getPool();

  const existing = await pool.query(`SELECT id FROM candidates WHERE email = $1 LIMIT 1`, [email]);
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: 'Application already received for this email' }, { status: 409 });
  }

  await pool.query(
    `INSERT INTO candidates (name, email, phone, application_text, submission_url, utm_source, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'applied')`,
    [name, email.toLowerCase().trim(), phone ?? null, application_text ?? null,
     submission_url ?? null, utm_source ?? null]
  );

  return NextResponse.json({ ok: true });
}
