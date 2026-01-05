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
 * "Connect Alert - Smitty's : EXCHANGE - transaction"
 * We extract <LOCATION> between "Connect Alert - " and " :"
 */
function extractLocationFromSubject(subject: string): string {
  const raw = subject || '';

  const match = raw.match(/connect alert\s*-\s*(.*?)\s*:/i);
  if (match?.[1]) return normalizeLocation(match[1]);

  const afterDash = raw.split(' - ')[1];
  if (afterDash) {
    const beforeColon = afterDash.split(':')[0]?.trim();
    if (beforeColon) return normalizeLocation(beforeColon);
  }

  return 'Unknown Location';
}

/**
 * Force:
 * - "cleared" or "transaction" => "ok"
 * - otherwise keep incoming status (e.g. "error")
 */
function classifyStatus(rawSubject: string, incomingStatus: string): string {
  const subject = (rawSubject || '').toLowerCase();
  const status = (incomingStatus || '').toLowerCase();

  if (subject.includes('cleared') || subject.includes('transaction')) return 'ok';
  if (status.includes('cleared') || status.includes('transaction')) return 'ok';

  return incomingStatus || 'ok';
}

/**
 * Convert timestamps from Mailparser.
 * - If it's already ISO, Date() will parse it.
 * - If it's "01/05/2026 - 10:41 am", Date parsing may vary by runtime;
 *   if parsing fails, we fall back to "now" so the upsert still happens.
 */
function toIsoTimestamp(value: any): string {
  if (!value) return new Date().toISOString();

  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toISOString();

  return new Date().toISOString();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed' });
  }

  try {
    // Accept common Mailparser field names
    const raw_subject =
      req.body?.raw_subject ??
      req.body?.rawSubject ??
      req.body?.subject ??
      '';

    const incomingStatus =
      req.body?.status ??
      req.body?.full_status ??
      req.body?.fullStatus ??
      '';

    const id =
      req.body?.id ??
      req.body?.message_id ??
      req.body?.messageId ??
      req.body?.['Message ID'] ??
      '';

    const processedRaw =
      req.body?.processed_at_iso8601 ??
      req.body?.processed_at ??
      req.body?.processedAt ??
      req.body?.['Processed at'] ??
      '';

    if (!raw_subject) {
      return res.status(400).json({
        error: 'Missing required field: raw_subject (or subject)'
      });
    }

    // If Mailparser doesn’t provide id, still proceed
    const safeId = String(id || `${raw_subject}-${Date.now()}`);

    const timestamp = toIsoTimestamp(processedRaw);

    // 1) Determine final status
    const finalStatus = classifyStatus(raw_subject, incomingStatus);

    // 2) Extract location
    const location = extractLocationFromSubject(raw_subject);

    // 3) Save to Supabase
    const { error } = await supabase
      .from('kiosks')
      .upsert(
        [
          {
            id: safeId,
            location,
            status: finalStatus,     // <-- transaction becomes "ok" here
            timestamp
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
      timestamp
    });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
