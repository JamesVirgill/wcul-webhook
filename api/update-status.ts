import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://uhokqclbxoevlxrzeinf.supabase.co',
  process.env.SUPABASE_KEY || ''
);

/**
 * Normalize incoming location strings so they match the exact keys
 * used by your frontend's locationMap.
 */
function normalizeLocation(loc: string): string {
  const s = (loc || '').trim();

  if (/smitty/i.test(s)) return "Smitty's";
  if (/qhc\s*carmichael/i.test(s) || /carmichael/i.test(s)) return 'QHC Carmichael';
  if (/quality home center/i.test(s) || /prince charles/i.test(s)) return 'Quality Home Center';
  if (/rubis/i.test(s)) return 'Rubis';

  return s || 'Unknown Location';
}

/**
 * Your Mailparser subjects look like:
 * "Connect Alert - QHC Carmichael : EXCHANGE - transaction"
 *
 * We extract the part between "Connect Alert - " and " :"
 */
function extractLocationFromSubject(subject: string): string {
  const raw = subject || '';

  // Primary pattern for your current subject format
  // "Connect Alert - <LOCATION> : ..."
  const match = raw.match(/connect alert\s*-\s*(.*?)\s*:/i);
  if (match?.[1]) {
    return normalizeLocation(match[1]);
  }

  // Fallback: try splitting on " - " then " : "
  const afterDash = raw.split(' - ')[1];
  if (afterDash) {
    const beforeColon = afterDash.split(':')[0]?.trim();
    if (beforeColon) return normalizeLocation(beforeColon);
  }

  return 'Unknown Location';
}

/**
 * Decide what status gets written to Supabase.
 *
 * Frontend rule:
 *   status === "error" => red
 *   anything else      => green
 *
 * So we force:
 * - "cleared" or "transaction" => "ok" (green)
 * - otherwise keep incoming status (e.g. "error")
 */
function classifyStatus(rawSubject: string, incomingStatus: string): string {
  const subject = (rawSubject || '').toLowerCase();
  const status = (incomingStatus || '').toLowerCase();

  // If either field indicates cleared/transaction, mark as ok (green)
  if (subject.includes('cleared') || subject.includes('transaction')) return 'ok';
  if (status.includes('cleared') || status.includes('transaction')) return 'ok';

  // Otherwise, pass through what Mailparser sent (e.g. "error")
  // (If Mailparser sends something unexpected, this will still show green unless it's literally "error")
  return incomingStatus || 'ok';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed' });
  }

  try {
    const { id, status, raw_subject, processed_at_iso8601 } = req.body;

    if (!raw_subject || !id || !processed_at_iso8601) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['id', 'raw_subject', 'processed_at_iso8601']
      });
    }

    // 1) Determine final status (force ok on transaction/cleared)
    const finalStatus = classifyStatus(raw_subject, status);

    // 2) Extract location from subject (matches your frontend keys)
    const location = extractLocationFromSubject(raw_subject);

    // 3) Upsert to Supabase (one row per location)
    const { error } = await supabase
      .from('kiosks')
      .upsert(
        [
          {
            id,
            location,
            status: finalStatus,
            timestamp: processed_at_iso8601
          }
        ],
        { onConflict: 'location' }
      );

    if (error) {
      console.error('Supabase upsert error:', error);
      return res.status(500).json({ error: error.message || 'Failed to update status' });
    }

    return res.status(200).json({
      success: true,
      location,
      status: finalStatus,
      timestamp: processed_at_iso8601
    });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
