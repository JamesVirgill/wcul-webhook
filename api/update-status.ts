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
 * Extract <LOCATION> between "Connect Alert - " and ":"
 * Works for both:
 * "Connect Alert - Smitty's : EXCHANGE - transaction"
 * "[SOLVED] Connect Alert - QHC Carmichael: jxfs.extendedcode..."
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
 * Status priority:
 * 1. Any solved language always wins => ok
 * 2. Otherwise, any error language => error
 * 3. Fallback => error
 */
function classifyStatus(rawSubject: string, incomingStatus: string, bodyText: string = ''): string {
  const subject = (rawSubject || '').toLowerCase();
  const status = (incomingStatus || '').toLowerCase();
  const body = (bodyText || '').toLowerCase();

  // SOLVED always overrides ERROR
  if (
    subject.includes('[solved]') ||
    subject.includes('cleared') ||
    body.includes('is solved') ||
    body.includes(' solved ') ||
    status.includes('solved') ||
    status.includes('cleared')
  ) {
    return 'ok';
  }

  // Otherwise, error signals mean red
  if (
    subject.includes('error') ||
    body.includes('error') ||
    status.includes('error')
  ) {
    return 'error';
  }

  // Keep your older "transaction" behavior if still needed
  if (
    subject.includes('transaction') ||
    status.includes('transaction')
  ) {
    return 'ok';
  }

  return 'error';
}

/**
 * Convert timestamps from Mailparser.
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

    const bodyText =
      req.body?.body ??
      req.body?.text_plain ??
      req.body?.text ??
      req.body?.plain_text ??
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

    const safeId = String(id || `${raw_subject}-${Date.now()}`);
    const timestamp = toIsoTimestamp(processedRaw);

    const finalStatus = classifyStatus(raw_subject, incomingStatus, bodyText);
    const location = extractLocationFromSubject(raw_subject);

    const { error } = await supabase
      .from('kiosks')
      .upsert(
        [
          {
            id: safeId,
            location,
            status: finalStatus,
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
