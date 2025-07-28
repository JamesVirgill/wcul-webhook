import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://uhokqclbxoevlxrzeinf.supabase.co',
  process.env.SUPABASE_KEY || ''
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed' });
  }

  try {
    const { id, status, raw_subject, processed_at_iso8601 } = req.body;

    if (!raw_subject || !id || !processed_at_iso8601) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 1. Determine the status
    let finalStatus = status;

    // If email subject contains "Cleared", override status to 'ok'
    if (raw_subject.toLowerCase().includes('cleared')) {
      finalStatus = 'ok';
    }

    // 2. Extract location
    let location = 'Unknown Location';

    if (raw_subject.toLowerCase().includes('cleared')) {
      location = raw_subject.replace(/cleared/i, '').trim();
    } else {
      const locationMatch = raw_subject.split(' - ')[1]?.split(':')[0]?.trim();
      location = locationMatch || 'Unknown Location';
    }

    // 3. Save to Supabase
    const { error } = await supabase
      .from('kiosks')
      .upsert(
        [{ id, location, status: finalStatus, timestamp: processed_at_iso8601 }],
        { onConflict: 'location' }
      );

    if (error) {
      console.error('Supabase upsert error:', error);
      return res.status(500).json({ error: error.message || 'Failed to update status' });
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
