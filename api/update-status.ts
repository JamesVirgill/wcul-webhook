import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed' });
  }

  try {
    const { id, status, raw_subject, processed_at_iso8601 } = req.body;

    if (!raw_subject || !id || !processed_at_iso8601) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let finalStatus = status || 'error';

    if (raw_subject.toLowerCase().includes('cleared')) {
      finalStatus = 'ok';
    }

    let location = 'Unknown Location';

    if (raw_subject.toLowerCase().includes('cleared')) {
      location = raw_subject.replace(/cleared/i, '').trim();
    } else {
      const locationMatch = raw_subject.split(' - ')[1]?.split(':')[0]?.trim();
      location = locationMatch || 'Unknown Location';
    }

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
      return res.status(500).json({
        error: error.message || 'Failed to update status'
      });
    }

    return res.status(200).json({
      success: true,
      location,
      status: finalStatus
    });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return res.status(500).json({
      error: err.message || 'Server error'
    });
  }
}
